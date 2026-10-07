// The Golden Paddle's sound: two songs for the kit sequencer, the river bed
// outside, and every signature effect synthesised on the spot (each one has
// a visual twin in the world).

import { music, type Song, type Track } from '../kit';
import { audioGraph, noise, tone } from '../../audio/sfx';
import type { ZoneId } from './layout';

// ---------------------------------------------------------------------------
// Songs

const stride = (bars: [string, string, string][]): string =>
  bars.map(([bass, chord, bass2]) => `${bass} ${chord} ${bass2} ${chord}`).join(' ');

const strum = (chords: string[]): string => chords.map((c) => `. ${c} . ${c} . ${c} . ${c}`).join(' ');

const F = '[A3 C4 F4]';
const D7 = '[F#3 C4 D4]';
const G7 = '[F3 B3 D4]';
const C7 = '[E3 Bb3 C4]';
const Bb = '[F3 Bb3 D4]';
const Fc = '[A3 C4 F4]';

const A_LEFT = stride([
  ['F2', F, 'C3'],
  ['F2', F, 'A2'],
  ['D2', D7, 'A2'],
  ['D2', D7, 'F#2'],
  ['G2', G7, 'D3'],
  ['C3', C7, 'G2'],
  ['F2', F, 'C3'],
  ['C3', C7, 'G2'],
]);
const B_LEFT = stride([
  ['Bb2', Bb, 'F2'],
  ['Bb2', Bb, 'D3'],
  ['F2', Fc, 'C3'],
  ['F2', Fc, 'A2'],
  ['G2', G7, 'D3'],
  ['C3', C7, 'G2'],
  ['F2', F, 'C3'],
  ['F2', F, 'C3'],
]);

const A_TUNE = [
  'C5 - A4 C5 D5 C5 A4 F4',
  'G4 - A4 - F4 - - .',
  'F#4 - A4 C5 D5 - C5 A4',
  'D5 - - . C5 - A4 .',
  'B4 - D5 F5 G5 - F5 D5',
  'E5 - C5 - Bb4 - G4 .',
  'A4 C5 F5 - E5 D5 C5 A4',
  'G4 - - . E4 F4 G4 .',
].join(' ');
const A2_TUNE = [
  'C5 - A4 C5 D5 C5 A4 F4',
  'G4 - A4 - F4 - - .',
  'F#4 A4 C5 D5 F#5 - D5 C5',
  'A4 - - . F#4 G4 A4 .',
  'B4 - D5 F5 G5 - F5 D5',
  'E5 - G5 - Bb5 - G5 E5',
  'F5 - C5 - A4 - C5 -',
  'F5 - - - . . . .',
].join(' ');
const B_TUNE = [
  'D5 - F5 - D5 C5 Bb4 -',
  'F4 - Bb4 - D5 - - .',
  'C5 - A4 - F4 - A4 C5',
  'F5 - - . E5 - C5 .',
  'B4 - G4 - B4 D5 F5 -',
  'E5 - D5 - C5 - Bb4 .',
  'A4 - C5 - F5 - E5 D5',
  'C5 - - . - . . .',
].join(' ');

function ragSection(name: string, left: string, tune: string, banjo: string[], tubaRoots: string[]): { name: string; bars: number; tracks: Track[] } {
  return {
    name,
    bars: 8,
    tracks: [
      { voice: 'piano', pattern: left, every: 4, gain: 0.5, pan: -0.15 },
      { voice: 'pluck', pattern: strum(banjo), every: 2, gain: 0.22, pan: 0.35, layer: 'banjo' },
      { voice: 'tuba', pattern: tubaRoots.map((r) => `${r} . ${r} .`).join(' '), every: 4, gain: 0.42, layer: 'tuba' },
      { voice: 'square', pattern: tune, every: 2, gain: 0.16, pan: 0.1, layer: 'lead', wet: 0.3 },
      { voice: 'snare', pattern: '....o.......o...', gain: 0.18, layer: 'drums' },
      { voice: 'shaker', pattern: 'x.ox.oxox.ox.oxo', gain: 0.12, layer: 'drums' },
      { voice: 'kick', pattern: 'o.......o.......', gain: 0.25, layer: 'drums' },
    ],
  };
}

/** The Grand Saloon: a stride rag the band automatons play. */
export const PADDLE_RAG: Song = {
  name: 'paddle-rag',
  bpm: 104,
  swing: 0.3,
  space: 0.3,
  gain: 0.8,
  order: ['a', 'a2', 'b', 'a2'],
  sections: [
    ragSection('a', A_LEFT, A_TUNE, [F, F, D7, D7, G7, C7, F, C7], ['F2', 'F2', 'D2', 'D2', 'G2', 'C2', 'F2', 'C2']),
    ragSection('a2', A_LEFT, A2_TUNE, [F, F, D7, D7, G7, C7, F, F], ['F2', 'F2', 'D2', 'D2', 'G2', 'C2', 'F2', 'F2']),
    ragSection('b', B_LEFT, B_TUNE, [Bb, Bb, Fc, Fc, G7, C7, F, F], ['Bb1', 'Bb1', 'F2', 'F2', 'G2', 'C2', 'F2', 'F2']),
  ],
};

/** The Moonlight Lounge: slow vibraphone and upright bass in D dorian. */
export const MOON_ON_THE_WATER: Song = {
  name: 'moon-on-the-water',
  bpm: 72,
  swing: 0.22,
  space: 0.6,
  gain: 0.75,
  order: ['a', 'b'],
  sections: [
    {
      name: 'a',
      bars: 8,
      tracks: [
        { voice: 'pad', pattern: 'Dm7 G7 Dm7 G7 Em7 A7 Dm7 G7', every: 16, gain: 0.16, octave: 3 },
        { voice: 'bass', pattern: 'D2 . A2 . G2 . B2 . D2 . F2 . G2 . F2 . E2 . B2 . A2 . C#3 . D2 . A2 . G2 . F2 .', every: 4, gain: 0.32 },
        { voice: 'glass', pattern: 'A4 - - C5 E5 - D5 - . . . . F4 - G4 - A4 - - - C5 - B4 - . . . . . . . . E5 - D5 - C5 - B4 - G4 - - - E4 - - - D5 - C5 - A4 - - - . . . . F4 - A4 - B4 - - - . . . .', every: 2, gain: 0.2, layer: 'vibes', wet: 0.5 },
        { voice: 'shaker', pattern: 'o..xo..x', gain: 0.07 },
        { voice: 'rim', pattern: '........x.......', gain: 0.06 },
      ],
    },
    {
      name: 'b',
      bars: 8,
      tracks: [
        { voice: 'pad', pattern: 'Gm7 C7 Fmaj7 Bbmaj7 Em7 A7 Dm7 Dm7', every: 16, gain: 0.16, octave: 3 },
        { voice: 'bass', pattern: 'G2 . D3 . C2 . G2 . F2 . C3 . Bb1 . F2 . E2 . B2 . A2 . E2 . D2 . A2 . D2 . C3 .', every: 4, gain: 0.32 },
        { voice: 'glass', pattern: 'D5 - - - Bb4 - A4 - G4 - - - . . . . A4 - C5 - E5 - - - D5 - C5 - A4 - . . E5 - - - D5 - C#5 - B4 - - - . . . . F5 - E5 - D5 - - - A4 - - - - - . .', every: 2, gain: 0.2, layer: 'vibes', wet: 0.5 },
        { voice: 'shaker', pattern: 'o..xo..x', gain: 0.07 },
        { voice: 'rim', pattern: '........x.......', gain: 0.06 },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Effects

const once = new Map<string, number>();
function gate(name: string, ms: number): boolean {
  const now = performance.now();
  if (now - (once.get(name) ?? 0) < ms) return false;
  once.set(name, now);
  return true;
}

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

export const sound = {
  /** The lever's heavy clunk and a ratchet as it springs back. */
  lever(): void {
    noise(0.12, { gain: 0.14, freq: 500, sweep: 160, q: 1.4 });
    tone(110, 0.22, { type: 'triangle', gain: 0.16, slide: 0.55, at: 0.03 });
    for (let i = 0; i < 6; i++) noise(0.025, { gain: 0.05, freq: 2600 - i * 120, q: 6, at: 0.25 + i * 0.05 });
  },
  reelTick(): void {
    if (!gate('reel', 45)) return;
    noise(0.02, { gain: 0.03, freq: 3400, q: 5 });
  },
  /** One per reel, rising, at a fixed tempo whatever is showing. */
  reelStop(i: number): void {
    tone(150 + i * 45, 0.11, { type: 'square', gain: 0.07, slide: 0.75 });
    noise(0.05, { gain: 0.06, freq: 900, q: 1 });
  },
  steam(big = false): void {
    noise(big ? 1.1 : 0.45, { gain: big ? 0.12 : 0.07, freq: 2400, sweep: 700, q: 0.4 });
  },
  /** Old Lucky's steam whistle: two detuned tones with breath. */
  whistle(long = false): void {
    const d = long ? 1.4 : 0.55;
    tone(587, d, { type: 'sawtooth', gain: 0.05, attack: 0.06 });
    tone(740, d, { type: 'sawtooth', gain: 0.045, attack: 0.06, detune: 8 });
    noise(d, { gain: 0.05, freq: 1800, q: 0.8 });
  },
  /** Coins whose cascade grows with the win. */
  coins(amount: number): void {
    const n = Math.min(26, 3 + Math.floor(Math.log2(Math.max(1, amount)) * 1.6));
    for (let i = 0; i < n; i++) tone(1300 + ((i * 337) % 700), 0.06, { type: 'triangle', gain: 0.05, at: i * 0.045 + Math.random() * 0.02 });
  },
  /** A bet coming back: a soft single ding, never the win sound. */
  betBack(): void {
    tone(880, 0.25, { type: 'sine', gain: 0.07 });
  },
  /** The engine-order telegraph: ding ding, lower for smaller bets. */
  telegraph(level: number): void {
    const f = 1050 + level * 90;
    tone(f, 0.35, { type: 'sine', gain: 0.08 });
    tone(f * 2.76, 0.2, { type: 'sine', gain: 0.02 });
    tone(f, 0.35, { type: 'sine', gain: 0.08, at: 0.18 });
    tone(f * 2.76, 0.2, { type: 'sine', gain: 0.02, at: 0.18 });
  },
  /** The ship's bell, rung `times` times (rank up). */
  bell(times = 1): void {
    for (let i = 0; i < times; i++) {
      tone(660, 1.4, { type: 'sine', gain: 0.1, at: i * 0.55 });
      tone(660 * 2.4, 0.8, { type: 'sine', gain: 0.035, at: i * 0.55 });
      tone(660 * 3.9, 0.4, { type: 'sine', gain: 0.02, at: i * 0.55 });
    }
  },
  /** A short brass fanfare, sized by the moment. */
  fanfare(size: 'small' | 'big' | 'grand'): void {
    const notes = size === 'small' ? [523, 659, 784, 1046] : size === 'big' ? [392, 523, 659, 784, 659, 784, 1046] : [392, 523, 659, 784, 1046, 784, 1046, 1318, 1568];
    notes.forEach((f, i) => {
      tone(f, 0.24, { type: 'sawtooth', gain: 0.045, at: i * 0.12 });
      tone(f / 2, 0.24, { type: 'square', gain: 0.03, at: i * 0.12 });
    });
    music.duck(0.5, notes.length * 0.12 + 0.6);
  },
  chip(): void {
    noise(0.03, { gain: 0.08, freq: 3800, q: 3 });
    tone(2200, 0.04, { type: 'triangle', gain: 0.03 });
  },
  card(): void {
    noise(0.05, { gain: 0.07, freq: 2400, sweep: 1200, q: 1.5 });
  },
  /** The roulette ball's rattle over the frets. */
  rattle(): void {
    if (!gate('rattle', 70)) return;
    noise(0.03, { gain: 0.05, freq: 3000 + Math.random() * 1500, q: 4 });
  },
  /** The River Wheel's leather flapper. */
  flapper(): void {
    if (!gate('flap', 40)) return;
    noise(0.035, { gain: 0.07, freq: 1400, q: 2 });
    tone(320, 0.03, { type: 'square', gain: 0.025 });
  },
  thunk(): void {
    tone(90, 0.2, { type: 'sine', gain: 0.18, slide: 0.6 });
    noise(0.08, { gain: 0.06, freq: 400, q: 1 });
  },
  /** Lucky Falls pegs play a pentatonic tune as the pearl falls. */
  peg(row: number, lane: number): void {
    tone(PENTA[(row + lane) % PENTA.length], 0.18, { type: 'sine', gain: 0.045 });
    tone(PENTA[(row + lane) % PENTA.length] * 2, 0.08, { type: 'sine', gain: 0.012 });
  },
  bin(mult: number): void {
    const f = mult >= 5 ? 1318 : mult > 1 ? 1046 : mult === 1 ? 880 : 523;
    tone(f, 0.3, { type: 'triangle', gain: 0.07 });
    if (mult >= 5) tone(f * 1.5, 0.4, { type: 'triangle', gain: 0.05, at: 0.1 });
  },
  arpeggio(): void {
    [523, 659, 784, 1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.2, { type: 'triangle', gain: 0.05, at: i * 0.07 }));
  },
  /** The logbook stamp's ka-chunk. */
  stamp(): void {
    noise(0.06, { gain: 0.12, freq: 700, q: 1 });
    tone(140, 0.12, { type: 'square', gain: 0.08, slide: 0.6, at: 0.06 });
  },
  flap(): void {
    if (!gate('flapboard', 60)) return;
    for (let i = 0; i < 5; i++) noise(0.02, { gain: 0.04, freq: 2000 + i * 200, q: 3, at: i * 0.03 });
  },
  click(): void {
    tone(1500, 0.03, { type: 'square', gain: 0.03 });
  },
  error(): void {
    tone(330, 0.14, { type: 'square', gain: 0.05 });
    tone(247, 0.2, { type: 'square', gain: 0.05, at: 0.12 });
  },
  lose(): void {
    tone(392, 0.18, { type: 'triangle', gain: 0.05 });
    tone(330, 0.26, { type: 'triangle', gain: 0.05, at: 0.16 });
  },
  chime(): void {
    tone(1318, 0.4, { type: 'sine', gain: 0.05 });
    tone(1760, 0.5, { type: 'sine', gain: 0.03, at: 0.08 });
  },
  door(): void {
    noise(0.5, { gain: 0.05, freq: 600, sweep: 300, q: 0.7 });
  },
};

// ---------------------------------------------------------------------------
// The river bed and zone mixing

export class Ambience {
  private bed: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private zone: ZoneId | null = null;
  private nextSplash = 0;
  private nextCricket = 0;
  private nextWhistle = 60;
  private t = 0;

  start(): void {
    const g = audioGraph();
    if (!g || this.bed) return;
    const src = g.ctx.createBufferSource();
    src.buffer = g.noise;
    src.loop = true;
    const filter = g.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    const gain = g.ctx.createGain();
    gain.gain.value = 0.0001;
    src.connect(filter).connect(gain).connect(g.out);
    src.start();
    this.bed = { src, filter, gain };
  }

  /** Which song plays where, and how muffled it is. */
  setZone(z: ZoneId | null): void {
    if (z === this.zone) return;
    this.zone = z;
    if (z === 'lounge') music.play(MOON_ON_THE_WATER, { fadeIn: 1.2 });
    else music.play(PADDLE_RAG, { fadeIn: 1.2 });
    music.filter(z === 'stern' ? 900 : z === 'wheelhouse' ? 650 : 20000, 1.2);
    const g = audioGraph();
    if (this.bed && g) this.bed.gain.gain.setTargetAtTime(z === 'stern' ? 0.16 : z === 'wheelhouse' ? 0.05 : 0.025, g.ctx.currentTime, 0.4);
  }

  /** Paddle splashes, crickets at night and a distant whistle now and then. */
  update(dt: number, night: number): void {
    this.t += dt;
    const outside = this.zone === 'stern';
    if (outside && this.t > this.nextSplash) {
      this.nextSplash = this.t + 0.65 + Math.random() * 0.2;
      noise(0.35, { gain: 0.05, freq: 900, sweep: 300, q: 0.6 });
    }
    if (outside && night > 0.5 && this.t > this.nextCricket) {
      this.nextCricket = this.t + 0.4 + Math.random() * 1.6;
      for (let i = 0; i < 3; i++) tone(4200 + Math.random() * 300, 0.03, { type: 'sine', gain: 0.012, at: i * 0.06 });
    }
    if (this.t > this.nextWhistle) {
      this.nextWhistle = this.t + 150 + Math.random() * 90;
      tone(392, 1.6, { type: 'sawtooth', gain: outside ? 0.02 : 0.008, attack: 0.2 });
      tone(494, 1.6, { type: 'sawtooth', gain: outside ? 0.016 : 0.006, attack: 0.2 });
    }
  }

  stop(): void {
    if (!this.bed) return;
    const g = audioGraph();
    const b = this.bed;
    if (g) b.gain.gain.setTargetAtTime(0.0001, g.ctx.currentTime, 0.2);
    setTimeout(() => {
      try {
        b.src.stop();
      } catch {
        // Already stopped.
      }
      b.src.disconnect();
    }, 800);
    this.bed = null;
  }
}
