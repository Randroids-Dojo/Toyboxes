// Procedural music: a small step sequencer with synthesised instruments.
// Songs are data (see `Song`), so every world can carry its own soundtrack
// without sample files. The clock runs on the audio context, so rhythm games
// can ask exactly which beat is playing (`beat()`), corrected for output
// latency.
//
//   music.play(MY_SONG);          // fades in, loops the section order
//   music.layer('lead', true);    // bring a named layer in or out
//   music.queue('final');         // jump to a section at the next bar
//   music.beat();                 // current beat, as heard
//   music.stop();                 // fade out (call from dispose)

import { audioGraph } from './sfx';

export type DrumVoice = 'kick' | 'snare' | 'clap' | 'hat' | 'openhat' | 'shaker' | 'tom' | 'rim' | 'crash' | 'snap';
export type ToneVoice = 'bass' | 'sub' | 'acid' | 'pluck' | 'pad' | 'strings' | 'lead' | 'square' | 'bell' | 'organ' | 'brass' | 'tuba' | 'piano' | 'marimba' | 'choir' | 'glass';
export type Voice = DrumVoice | ToneVoice;

export interface Track {
  voice: Voice;
  /**
   * One token per step (a sixteenth note by default), separated by spaces:
   * a note (C3, Eb4, F#2), a chord in brackets ([C3 E3 G3]), a chord name
   * (Cm7, Fmaj7, G7, Dsus4, Bdim; voiced around `octave`), `.` for a rest
   * and `-` to hold the previous note. Drum tracks may use a compact string
   * with no spaces instead: `x` hit, `X` accent, `o` ghost, `.` rest.
   * The pattern repeats to fill its section.
   */
  pattern: string;
  /** Steps per token, e.g. 16 for one chord per bar. Default 1. */
  every?: number;
  gain?: number;
  /** Octave for chord names. Default 3. */
  octave?: number;
  /** Semitones added to every note. */
  transpose?: number;
  /** Named layer for `music.layer(name, on)`. Tracks without one always play. */
  layer?: string;
  /** -1 left to 1 right. */
  pan?: number;
  /** Share sent to the reverb, 0 to 1. Default depends on the voice. */
  wet?: number;
}

export interface Section {
  name: string;
  bars: number;
  tracks: Track[];
}

export interface Song {
  name: string;
  bpm: number;
  /** Delays every second sixteenth by this share of a step (0 to 0.5). */
  swing?: number;
  /** Section names in play order; loops. Defaults to every section once. */
  order?: string[];
  sections: Section[];
  /** Reverb size, 0 (dry) to 1 (hall). Default 0.35. */
  space?: number;
  /** Overall level. Default 1. */
  gain?: number;
  /** Layers that start switched off. */
  off?: string[];
}

const STEPS_PER_BEAT = 4;
const BEATS_PER_BAR = 4;
const STEPS_PER_BAR = STEPS_PER_BEAT * BEATS_PER_BAR;
const LOOKAHEAD = 0.14;
const TICK_MS = 25;

// ---------------------------------------------------------------------------
// Parsing (pure, unit tested)

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** MIDI note number for names like C4, Eb3 or F#2; null when it is not a note. */
export function noteNumber(name: string): number | null {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + PITCH[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

const CHORDS: [string, number[]][] = [
  ['maj7', [0, 4, 7, 11]],
  ['m7b5', [0, 3, 6, 10]],
  ['madd9', [0, 3, 7, 14]],
  ['add9', [0, 4, 7, 14]],
  ['sus2', [0, 2, 7]],
  ['sus4', [0, 5, 7]],
  ['dim7', [0, 3, 6, 9]],
  ['dim', [0, 3, 6]],
  ['aug', [0, 4, 8]],
  ['m9', [0, 3, 7, 10, 14]],
  ['m7', [0, 3, 7, 10]],
  ['m6', [0, 3, 7, 9]],
  ['9', [0, 4, 7, 10, 14]],
  ['7', [0, 4, 7, 10]],
  ['6', [0, 4, 7, 9]],
  ['m', [0, 3, 7]],
  ['5', [0, 7]],
  ['', [0, 4, 7]],
];

/** MIDI notes of a chord name like Cm7 or F#maj7 with its root in `octave`. */
export function chordNotes(name: string, octave = 3): number[] | null {
  const m = /^([A-G])(#|b)?(.*)$/.exec(name);
  if (!m) return null;
  const quality = CHORDS.find(([q]) => q === m[3]);
  if (!quality) return null;
  const root = 12 * (octave + 1) + PITCH[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return quality[1].map((i) => root + i);
}

export type Step = { notes: number[]; hold: number; accent: number } | null;

const DRUMS = new Set<Voice>(['kick', 'snare', 'clap', 'hat', 'openhat', 'shaker', 'tom', 'rim', 'crash', 'snap']);

/**
 * Turns a track pattern into steps: each entry is the notes that start on
 * that step (with how many steps they last) or null.
 */
export function parsePattern(track: Pick<Track, 'voice' | 'pattern' | 'every' | 'octave' | 'transpose'>): Step[] {
  const every = Math.max(1, Math.round(track.every ?? 1));
  const raw = track.pattern.trim();
  const drum = DRUMS.has(track.voice);
  const tokens = drum && !/\s/.test(raw) ? raw.split('') : raw.split(/\s+(?![^[]*\])/).filter(Boolean);
  const out: Step[] = [];
  const tr = track.transpose ?? 0;
  for (const tok of tokens) {
    let step: Step = null;
    if (tok === '-') {
      // Extend the last sounding step.
      for (let i = out.length - 1; i >= 0; i--) {
        const s = out[i];
        if (s) {
          s.hold += every;
          break;
        }
      }
      for (let k = 0; k < every; k++) out.push(null);
      continue;
    }
    if (tok !== '.' && tok !== '_') {
      if (drum) {
        if (tok === 'x' || tok === 'X' || tok === 'o') step = { notes: [0], hold: every, accent: tok === 'X' ? 1.25 : tok === 'o' ? 0.45 : 1 };
        else throw new Error(`Bad drum step "${tok}" in ${track.voice}`);
      } else if (tok.startsWith('[')) {
        const notes = tok
          .slice(1, -1)
          .split(/\s+/)
          .map((n) => noteNumber(n));
        if (notes.some((n) => n === null)) throw new Error(`Bad chord "${tok}"`);
        step = { notes: (notes as number[]).map((n) => n + tr), hold: every, accent: 1 };
      } else {
        const n = noteNumber(tok);
        const c = n === null ? chordNotes(tok, track.octave ?? 3) : null;
        if (n === null && !c) throw new Error(`Bad note "${tok}" in ${track.voice}`);
        step = { notes: (n !== null ? [n] : c!).map((x) => x + tr), hold: every, accent: 1 };
      }
    }
    out.push(step);
    for (let k = 1; k < every; k++) out.push(null);
  }
  if (!out.length) throw new Error(`Empty pattern in ${track.voice}`);
  return out;
}

/** Checks a song without playing it. Returns the first problem or null. */
export function songProblem(song: Song): string | null {
  if (!(song.bpm >= 40 && song.bpm <= 240)) return 'Tempo out of range';
  if (!song.sections.length) return 'No sections';
  const names = new Set(song.sections.map((s) => s.name));
  if (names.size !== song.sections.length) return 'Duplicate section names';
  for (const name of song.order ?? []) if (!names.has(name)) return `Unknown section ${name}`;
  for (const s of song.sections) {
    if (!(s.bars >= 1 && s.bars <= 64)) return `Section ${s.name} has a bad length`;
    for (const t of s.tracks) {
      try {
        parsePattern(t);
      } catch (e) {
        return `${s.name}: ${(e as Error).message}`;
      }
    }
  }
  return null;
}

function freq(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

// ---------------------------------------------------------------------------
// Instruments

interface Graph {
  ctx: AudioContext;
  noise: AudioBuffer;
}

type Play = (g: Graph, out: AudioNode, t: number, notes: number[], dur: number, vel: number) => void;

function env(c: AudioContext, t: number, peak: number, attack: number, hold: number, release: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  if (hold > 0) g.gain.setValueAtTime(Math.max(0.0002, peak), t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  return g;
}

function osc(c: AudioContext, type: OscillatorType, f: number, t: number, stop: number, detune = 0): OscillatorNode {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.detune.value = detune;
  o.start(t);
  o.stop(stop);
  return o;
}

function noiseSrc(g: Graph, t: number, stop: number): AudioBufferSourceNode {
  const s = g.ctx.createBufferSource();
  s.buffer = g.noise;
  s.start(t, Math.random() * 0.4);
  s.stop(stop);
  return s;
}

function filt(c: AudioContext, type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
  const b = c.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

const INSTRUMENTS: Record<Voice, Play> = {
  kick: (g, out, t, _n, _d, v) => {
    const c = g.ctx;
    const o = osc(c, 'sine', 150, t, t + 0.45);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    o.connect(env(c, t, 0.9 * v, 0.003, 0.02, 0.32)).connect(out);
    const n = noiseSrc(g, t, t + 0.03);
    n.connect(filt(c, 'highpass', 3000)).connect(env(c, t, 0.12 * v, 0.001, 0, 0.02)).connect(out);
  },
  snare: (g, out, t, _n, _d, v) => {
    const c = g.ctx;
    noiseSrc(g, t, t + 0.25).connect(filt(c, 'bandpass', 1900, 0.8)).connect(env(c, t, 0.42 * v, 0.002, 0, 0.18)).connect(out);
    osc(c, 'triangle', 190, t, t + 0.15).connect(env(c, t, 0.3 * v, 0.002, 0, 0.1)).connect(out);
  },
  clap: (g, out, t, _n, _d, v) => {
    const c = g.ctx;
    const f = filt(c, 'bandpass', 1300, 1.2);
    f.connect(out);
    for (let i = 0; i < 3; i++) noiseSrc(g, t + i * 0.012, t + i * 0.012 + 0.03).connect(env(c, t + i * 0.012, 0.35 * v, 0.001, 0, 0.025)).connect(f);
    noiseSrc(g, t + 0.036, t + 0.3).connect(env(c, t + 0.036, 0.3 * v, 0.002, 0, 0.2)).connect(f);
  },
  snap: (g, out, t, _n, _d, v) => {
    const c = g.ctx;
    noiseSrc(g, t, t + 0.06).connect(filt(c, 'bandpass', 2600, 3)).connect(env(c, t, 0.4 * v, 0.001, 0, 0.05)).connect(out);
  },
  hat: (g, out, t, _n, _d, v) => {
    const c = g.ctx;
    noiseSrc(g, t, t + 0.07).connect(filt(c, 'highpass', 7500)).connect(env(c, t, 0.16 * v, 0.001, 0, 0.045)).connect(out);
  },
  openhat: (g, out, t, _n, _d, v) => {
    const c = g.ctx;
    noiseSrc(g, t, t + 0.4).connect(filt(c, 'highpass', 6800)).connect(env(c, t, 0.14 * v, 0.002, 0.02, 0.28)).connect(out);
  },
  shaker: (g, out, t, _n, _d, v) => {
    const c = g.ctx;
    noiseSrc(g, t, t + 0.1).connect(filt(c, 'bandpass', 5200, 1.5)).connect(env(c, t, 0.12 * v, 0.012, 0, 0.06)).connect(out);
  },
  tom: (g, out, t, n, _d, v) => {
    const c = g.ctx;
    const f0 = n[0] ? freq(n[0]) : 130;
    const o = osc(c, 'sine', f0, t, t + 0.4);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + 0.25);
    o.connect(env(c, t, 0.6 * v, 0.003, 0, 0.3)).connect(out);
  },
  rim: (g, out, t, _n, _d, v) => {
    const c = g.ctx;
    osc(c, 'triangle', 1750, t, t + 0.05).connect(env(c, t, 0.22 * v, 0.001, 0, 0.03)).connect(out);
    noiseSrc(g, t, t + 0.03).connect(filt(c, 'highpass', 4000)).connect(env(c, t, 0.12 * v, 0.001, 0, 0.02)).connect(out);
  },
  crash: (g, out, t, _n, _d, v) => {
    const c = g.ctx;
    noiseSrc(g, t, t + 1.8).connect(filt(c, 'highpass', 4200)).connect(env(c, t, 0.16 * v, 0.003, 0.05, 1.5)).connect(out);
  },
  bass: (g, out, t, n, d, v) => {
    const c = g.ctx;
    for (const note of n) {
      const f = freq(note);
      const lp = filt(c, 'lowpass', 900, 2);
      lp.frequency.setValueAtTime(1300, t);
      lp.frequency.exponentialRampToValueAtTime(320, t + Math.min(0.25, d));
      const e = env(c, t, 0.34 * v, 0.006, Math.max(0, d - 0.08), 0.08);
      osc(c, 'sawtooth', f, t, t + d + 0.12).connect(lp);
      osc(c, 'square', f / 2, t, t + d + 0.12).connect(lp);
      lp.connect(e).connect(out);
    }
  },
  sub: (g, out, t, n, d, v) => {
    const c = g.ctx;
    for (const note of n) osc(c, 'sine', freq(note), t, t + d + 0.1).connect(env(c, t, 0.5 * v, 0.01, Math.max(0, d - 0.06), 0.06)).connect(out);
  },
  acid: (g, out, t, n, d, v) => {
    const c = g.ctx;
    for (const note of n) {
      const lp = filt(c, 'lowpass', 400, 11);
      lp.frequency.setValueAtTime(2400 * v, t);
      lp.frequency.exponentialRampToValueAtTime(260, t + Math.min(0.2, d));
      osc(c, 'sawtooth', freq(note), t, t + d + 0.1).connect(lp);
      lp.connect(env(c, t, 0.2 * v, 0.004, Math.max(0, d - 0.06), 0.06)).connect(out);
    }
  },
  pluck: (g, out, t, n, _d, v) => {
    const c = g.ctx;
    for (const note of n) {
      const lp = filt(c, 'lowpass', 3200, 1);
      lp.frequency.setValueAtTime(4200, t);
      lp.frequency.exponentialRampToValueAtTime(700, t + 0.25);
      osc(c, 'sawtooth', freq(note), t, t + 0.5).connect(lp);
      osc(c, 'triangle', freq(note) * 2, t, t + 0.5).connect(lp);
      lp.connect(env(c, t, 0.12 * v, 0.003, 0, 0.38)).connect(out);
    }
  },
  pad: (g, out, t, n, d, v) => {
    const c = g.ctx;
    const lp = filt(c, 'lowpass', 1400, 0.6);
    const e = env(c, t, 0.06 * v, Math.min(0.5, d * 0.4), Math.max(0, d - 0.5), 0.7);
    lp.connect(e).connect(out);
    for (const note of n) for (const det of [-9, 0, 8]) osc(c, 'sawtooth', freq(note), t, t + d + 0.8, det).connect(lp);
  },
  strings: (g, out, t, n, d, v) => {
    const c = g.ctx;
    const lp = filt(c, 'lowpass', 2200, 0.5);
    const e = env(c, t, 0.05 * v, Math.min(0.3, d * 0.3), Math.max(0, d - 0.3), 0.5);
    const lfo = osc(c, 'sine', 5.2, t, t + d + 0.6);
    const depth = c.createGain();
    depth.gain.value = 6;
    lfo.connect(depth);
    lp.connect(e).connect(out);
    for (const note of n)
      for (const det of [-6, 5]) {
        const o = osc(c, 'sawtooth', freq(note), t, t + d + 0.6, det);
        depth.connect(o.detune);
        o.connect(lp);
      }
  },
  lead: (g, out, t, n, d, v) => {
    const c = g.ctx;
    for (const note of n) {
      const o = osc(c, 'square', freq(note), t, t + d + 0.15);
      const lfo = osc(c, 'sine', 5.5, t, t + d + 0.15);
      const depth = c.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(14, t + 0.25);
      lfo.connect(depth).connect(o.detune);
      o.connect(filt(c, 'lowpass', 2600, 1)).connect(env(c, t, 0.075 * v, 0.01, Math.max(0, d - 0.06), 0.12)).connect(out);
    }
  },
  square: (g, out, t, n, d, v) => {
    const c = g.ctx;
    for (const note of n) osc(c, 'square', freq(note), t, t + d + 0.08).connect(env(c, t, 0.06 * v, 0.004, Math.max(0, d - 0.04), 0.06)).connect(out);
  },
  bell: (g, out, t, n, _d, v) => {
    const c = g.ctx;
    for (const note of n) {
      const f = freq(note);
      osc(c, 'sine', f, t, t + 1.6).connect(env(c, t, 0.1 * v, 0.002, 0, 1.4)).connect(out);
      osc(c, 'sine', f * 2.76, t, t + 0.6).connect(env(c, t, 0.04 * v, 0.002, 0, 0.5)).connect(out);
      osc(c, 'sine', f * 5.4, t, t + 0.3).connect(env(c, t, 0.02 * v, 0.001, 0, 0.2)).connect(out);
    }
  },
  glass: (g, out, t, n, _d, v) => {
    const c = g.ctx;
    for (const note of n) {
      const f = freq(note);
      osc(c, 'sine', f, t, t + 2.2).connect(env(c, t, 0.07 * v, 0.02, 0, 2)).connect(out);
      osc(c, 'triangle', f * 2, t, t + 1.2, 4).connect(env(c, t, 0.025 * v, 0.02, 0, 1)).connect(out);
    }
  },
  organ: (g, out, t, n, d, v) => {
    const c = g.ctx;
    const e = env(c, t, 0.045 * v, 0.01, Math.max(0, d - 0.05), 0.08);
    e.connect(out);
    for (const note of n) for (const [m, a] of [[1, 1], [2, 0.5], [3, 0.3], [4, 0.2]] as const) {
      const gg = c.createGain();
      gg.gain.value = a;
      osc(c, 'sine', freq(note) * m, t, t + d + 0.12).connect(gg).connect(e);
    }
  },
  brass: (g, out, t, n, d, v) => {
    const c = g.ctx;
    for (const note of n) {
      const lp = filt(c, 'lowpass', 600, 1.5);
      lp.frequency.setValueAtTime(500, t);
      lp.frequency.exponentialRampToValueAtTime(2600, t + 0.06);
      lp.frequency.exponentialRampToValueAtTime(1300, t + 0.3);
      osc(c, 'sawtooth', freq(note), t, t + d + 0.12).connect(lp);
      osc(c, 'sawtooth', freq(note), t, t + d + 0.12, 7).connect(lp);
      lp.connect(env(c, t, 0.07 * v, 0.03, Math.max(0, d - 0.08), 0.1)).connect(out);
    }
  },
  tuba: (g, out, t, n, d, v) => {
    const c = g.ctx;
    for (const note of n) {
      const f = freq(note);
      const o = osc(c, 'sawtooth', f * 0.94, t, t + d + 0.15);
      // A little scoop up into the note, like a lip slur.
      o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      const lp = filt(c, 'lowpass', 520, 3);
      o.connect(lp);
      osc(c, 'square', f / 2, t, t + d + 0.15).connect(lp);
      lp.connect(env(c, t, 0.22 * v, 0.035, Math.max(0, d - 0.1), 0.12)).connect(out);
    }
  },
  piano: (g, out, t, n, d, v) => {
    const c = g.ctx;
    for (const note of n) {
      const f = freq(note);
      const rel = Math.min(1.6, 0.4 + d);
      osc(c, 'triangle', f, t, t + rel + 0.1).connect(env(c, t, 0.12 * v, 0.003, 0, rel)).connect(out);
      osc(c, 'sine', f * 2, t, t + rel * 0.5).connect(env(c, t, 0.05 * v, 0.003, 0, rel * 0.4)).connect(out);
      osc(c, 'sine', f * 3.01, t, t + 0.2).connect(env(c, t, 0.025 * v, 0.002, 0, 0.15)).connect(out);
    }
  },
  marimba: (g, out, t, n, _d, v) => {
    const c = g.ctx;
    for (const note of n) {
      const f = freq(note);
      osc(c, 'sine', f, t, t + 0.6).connect(env(c, t, 0.2 * v, 0.002, 0, 0.45)).connect(out);
      osc(c, 'sine', f * 4, t, t + 0.12).connect(env(c, t, 0.05 * v, 0.001, 0, 0.08)).connect(out);
    }
  },
  choir: (g, out, t, n, d, v) => {
    const c = g.ctx;
    const e = env(c, t, 0.05 * v, Math.min(0.4, d * 0.4), Math.max(0, d - 0.4), 0.6);
    const f1 = filt(c, 'bandpass', 730, 6);
    const f2 = filt(c, 'bandpass', 1090, 7);
    f1.connect(e);
    f2.connect(e);
    e.connect(out);
    for (const note of n)
      for (const det of [-7, 6]) {
        const o = osc(c, 'sawtooth', freq(note), t, t + d + 0.7, det);
        o.connect(f1);
        o.connect(f2);
      }
  },
};

const DEFAULT_WET: Partial<Record<Voice, number>> = { pad: 0.5, strings: 0.45, choir: 0.6, bell: 0.45, glass: 0.6, lead: 0.25, pluck: 0.3, piano: 0.3, clap: 0.2, snare: 0.15, marimba: 0.25, brass: 0.2 };

function impulse(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * seconds));
  const b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  return b;
}

// ---------------------------------------------------------------------------
// The player

interface LiveTrack {
  track: Track;
  steps: Step[];
  out: AudioNode;
}

interface LiveSection {
  section: Section;
  tracks: LiveTrack[];
}

class Music {
  private song: Song | null = null;
  private sections = new Map<string, LiveSection>();
  private order: string[] = [];
  private orderIdx = 0;
  private sectionStep = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private bus: GainNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private layers = new Map<string, { dry: GainNode; wet: GainNode }>();
  private layerOn = new Map<string, boolean>();
  private queued: string | null = null;
  private bpm = 120;
  /** Audio time and beat number at the last tempo change, for the beat clock. */
  private anchor = { time: 0, beat: 0 };
  private totalSteps = 0;
  private listeners = new Set<(beat: number, time: number) => void>();
  private playingName: string | null = null;
  private paused: number | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private only_: string | null = null;

  /** Starts a song (or keeps it going if it is already playing). */
  play(song: Song, opts: { fadeIn?: number; section?: string } = {}): void {
    if (this.playingName === song.name && this.timer) return;
    this.stop(0.25);
    const g = audioGraph();
    if (!g) return;
    const problem = songProblem(song);
    if (problem) {
      console.warn(`Song ${song.name}: ${problem}`);
      return;
    }
    const c = g.ctx;
    this.song = song;
    this.playingName = song.name;
    this.bpm = song.bpm;
    this.bus = c.createGain();
    this.bus.gain.setValueAtTime(0.0001, c.currentTime);
    this.bus.gain.exponentialRampToValueAtTime(song.gain ?? 1, c.currentTime + Math.max(0.05, opts.fadeIn ?? 1.2));
    this.lowpass = c.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 20000;
    this.lowpass.Q.value = 0.5;
    this.bus.connect(this.lowpass).connect(g.music);
    this.paused = null;
    this.only_ = null;
    this.dry = c.createGain();
    this.dry.connect(this.bus);
    const space = song.space ?? 0.35;
    if (space > 0) {
      this.reverb = c.createConvolver();
      this.reverb.buffer = impulse(c, 0.8 + space * 2.6);
      this.wet = c.createGain();
      this.wet.gain.value = 0.25 + space * 0.5;
      this.reverb.connect(this.wet).connect(this.bus);
    }
    this.layers.clear();
    this.layerOn.clear();
    for (const off of song.off ?? []) this.layerOn.set(off, false);
    this.sections.clear();
    for (const s of song.sections) {
      this.sections.set(s.name, {
        section: s,
        tracks: s.tracks.map((t) => ({ track: t, steps: parsePattern(t), out: this.trackOut(c, t) })),
      });
    }
    this.order = song.order?.length ? song.order : song.sections.map((s) => s.name);
    this.orderIdx = opts.section ? Math.max(0, this.order.indexOf(opts.section)) : 0;
    this.sectionStep = 0;
    this.totalSteps = 0;
    this.nextTime = c.currentTime + 0.12;
    this.anchor = { time: this.nextTime, beat: 0 };
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  /** Each layer has a dry and a reverb-send level, switched together. */
  private layerGain(c: AudioContext, name: string): { dry: GainNode; wet: GainNode } {
    let l = this.layers.get(name);
    if (!l) {
      const level = this.layerOn.get(name) === false ? 0.0001 : 1;
      const dry = c.createGain();
      dry.gain.value = level;
      dry.connect(this.dry!);
      const wet = c.createGain();
      wet.gain.value = level;
      if (this.reverb) wet.connect(this.reverb);
      l = { dry, wet };
      this.layers.set(name, l);
    }
    return l;
  }

  private trackOut(c: AudioContext, t: Track): AudioNode {
    const layer = this.layerGain(c, t.layer ?? '');
    const gain = c.createGain();
    gain.gain.value = t.gain ?? 1;
    let node: AudioNode = gain;
    if (t.pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, t.pan));
      gain.connect(p);
      node = p;
    }
    node.connect(layer.dry);
    const wet = t.wet ?? DEFAULT_WET[t.voice] ?? 0.1;
    if (this.reverb && wet > 0) {
      const send = c.createGain();
      send.gain.value = wet;
      node.connect(send).connect(layer.wet);
    }
    return gain;
  }

  private stepDur(): number {
    return 60 / this.bpm / STEPS_PER_BEAT;
  }

  private tick(): void {
    const g = audioGraph();
    if (!g || !this.song) return;
    const c = g.ctx;
    // After a suspend, skip ahead rather than play a burst of missed notes.
    if (this.nextTime < c.currentTime - 0.2) {
      const missed = Math.ceil((c.currentTime - this.nextTime) / this.stepDur());
      for (let i = 0; i < missed; i++) this.advance();
      this.nextTime += missed * this.stepDur();
    }
    while (this.nextTime < c.currentTime + LOOKAHEAD) {
      this.schedule(g, this.nextTime);
      this.advance();
      this.nextTime += this.stepDur();
    }
  }

  private current(): LiveSection | undefined {
    return this.sections.get(this.order[this.orderIdx % this.order.length]);
  }

  private advance(): void {
    const cur = this.current();
    this.sectionStep++;
    this.totalSteps++;
    const atBar = this.sectionStep % STEPS_PER_BAR === 0;
    if (atBar && this.queued) {
      const idx = this.order.indexOf(this.queued);
      if (idx >= 0) this.orderIdx = idx;
      else if (this.sections.has(this.queued)) {
        // Not in the order: play it next, then carry on from the start.
        this.order = [...this.order, this.queued];
        this.orderIdx = this.order.length - 1;
      }
      this.queued = null;
      this.sectionStep = 0;
      return;
    }
    if (cur && this.sectionStep >= cur.section.bars * STEPS_PER_BAR) {
      this.sectionStep = 0;
      if (!this.only_) this.orderIdx = (this.orderIdx + 1) % this.order.length;
    }
  }

  private schedule(g: Graph, time: number): void {
    const cur = this.current();
    if (!cur) return;
    const swing = (this.song?.swing ?? 0) * this.stepDur();
    const t = this.sectionStep % 2 === 1 ? time + swing : time;
    for (const lt of cur.tracks) {
      const s = lt.steps[this.sectionStep % lt.steps.length];
      if (!s) continue;
      try {
        INSTRUMENTS[lt.track.voice](g, lt.out, t, s.notes, s.hold * this.stepDur(), s.accent);
      } catch {
        // A node limit or a closed context: drop the note.
      }
    }
    if (this.sectionStep % STEPS_PER_BEAT === 0 && this.listeners.size) {
      const beat = this.totalSteps / STEPS_PER_BEAT;
      for (const f of this.listeners) f(beat, t);
    }
  }

  /** Switches a named layer in or out over `fade` seconds. */
  layer(name: string, on: boolean, fade = 0.6): void {
    this.layerOn.set(name, on);
    const l = this.layers.get(name);
    const graph = audioGraph();
    if (!l || !graph) return;
    const now = graph.ctx.currentTime;
    for (const node of [l.dry, l.wet]) {
      node.gain.cancelScheduledValues(now);
      node.gain.setTargetAtTime(on ? 1 : 0.0001, now, fade / 3);
    }
  }

  /** Whether a layer is on. */
  layerIsOn(name: string): boolean {
    return this.layerOn.get(name) !== false;
  }

  /**
   * Holds the music where it is (a rhythm round under the pause menu). The
   * beat clock stops at the heard beat and carries on from it on resume.
   */
  pause(): void {
    const g = audioGraph();
    if (!g || !this.song || this.paused !== null) return;
    const heard = Math.max(0, this.beat());
    this.paused = heard;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    // Rewind the sequencer to the heard step so nothing is skipped.
    const heardStep = Math.floor(heard * STEPS_PER_BEAT);
    const back = this.totalSteps - heardStep;
    if (back > 0 && back <= this.sectionStep) {
      this.sectionStep -= back;
      this.totalSteps -= back;
    }
    const now = g.ctx.currentTime;
    this.bus?.gain.cancelScheduledValues(now);
    this.bus?.gain.setTargetAtTime(0.0001, now, 0.02);
  }

  resume(): void {
    const g = audioGraph();
    if (!g || !this.song || this.paused === null) return;
    const c = g.ctx;
    this.nextTime = c.currentTime + 0.08;
    this.anchor = { time: this.nextTime, beat: this.totalSteps / STEPS_PER_BEAT };
    this.paused = null;
    this.bus?.gain.cancelScheduledValues(c.currentTime);
    this.bus?.gain.setTargetAtTime(this.song.gain ?? 1, c.currentTime, 0.03);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  get isPaused(): boolean {
    return this.paused !== null;
  }

  /** Muffles the music (e.g. heard from outside a room). 20000 is open. */
  filter(hz: number, seconds = 0.4): void {
    const g = audioGraph();
    if (!g || !this.lowpass) return;
    this.lowpass.frequency.setTargetAtTime(Math.max(80, Math.min(20000, hz)), g.ctx.currentTime, seconds / 3);
  }

  /** Loops one section (a preview, a practice loop) until called with null. */
  only(section: string | null): void {
    if (section && this.sections.has(section)) {
      this.queue(section);
      this.only_ = section;
    } else this.only_ = null;
  }

  /** Jumps to a section at the start of the next bar. */
  queue(section: string): void {
    if (this.sections.has(section)) this.queued = section;
  }

  /** Changes tempo from the next step; the beat clock stays continuous. */
  tempo(bpm: number): void {
    const g = audioGraph();
    if (!g || !this.song) return;
    this.anchor = { time: this.nextTime, beat: this.totalSteps / STEPS_PER_BEAT };
    this.bpm = Math.max(40, Math.min(240, bpm));
  }

  /** Dips the music, e.g. under a fanfare. */
  duck(amount = 0.4, seconds = 1.2): void {
    const g = audioGraph();
    if (!g || !this.bus || !this.song) return;
    const now = g.ctx.currentTime;
    const full = this.song.gain ?? 1;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setTargetAtTime(full * amount, now, 0.05);
    this.bus.gain.setTargetAtTime(full, now + seconds, 0.3);
  }

  stop(fade = 0.8): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const g = audioGraph();
    const bus = this.bus;
    if (g && bus) {
      const now = g.ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(0.0001, now, Math.max(0.01, fade / 4));
      setTimeout(() => bus.disconnect(), fade * 1000 + 400);
    }
    this.bus = this.dry = this.wet = this.reverb = this.lowpass = null;
    this.paused = null;
    this.only_ = null;
    this.song = null;
    this.playingName = null;
    this.queued = null;
    this.listeners.clear();
  }

  get playing(): string | null {
    return this.playingName;
  }

  get tempoBpm(): number {
    return this.bpm;
  }

  /** The section playing now. */
  get section(): string | null {
    return this.song ? this.order[this.orderIdx % this.order.length] : null;
  }

  /** Seconds of output delay between scheduling a sound and hearing it. */
  latency(): number {
    const g = audioGraph();
    if (!g) return 0;
    const c = g.ctx as AudioContext & { outputLatency?: number };
    return (c.baseLatency ?? 0) + (c.outputLatency ?? 0);
  }

  /** The beat being heard right now (fractional), or -1 when stopped. */
  beat(): number {
    const g = audioGraph();
    if (!g || !this.song) return -1;
    if (this.paused !== null) return this.paused;
    const heard = g.ctx.currentTime - this.latency();
    return this.anchor.beat + (heard - this.anchor.time) / (60 / this.bpm);
  }

  /** Audio-context time at which a beat will be heard. */
  beatTime(beat: number): number {
    return this.anchor.time + (beat - this.anchor.beat) * (60 / this.bpm) + this.latency();
  }

  /** Called on every beat as it is scheduled (slightly ahead of hearing it). */
  onBeat(f: (beat: number, time: number) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
}

export const music = new Music();
