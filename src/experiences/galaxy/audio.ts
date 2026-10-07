// The galaxy's music (songs as data for the kit sequencer) and its own sound
// effects. Everything sits in D (Lydian for the calm songs, major pentatonic
// for the riffs) so songs crossfade cleanly.

import { audioGraph, noise, tone } from '../../audio/sfx';
import { music, type Song } from '../kit';

const ARP = [
  'D5 . A4 . F#5 . A4 . C#6 . A4 . F#5 . E5 .',
  'E5 . B4 . G#5 . B4 . F#5 . B4 . G#5 . B4 .',
  'B4 . F#4 . D5 . F#4 . A5 . F#5 . D5 . A4 .',
  'A4 . E5 . B4 . E5 . A5 . E5 . B4 . E5 .',
].join(' ');

/** The hub: a lullaby for a hungry star. Each island you finish adds a layer. */
export const HUB_SONG: Song = {
  name: 'galaxy-hub',
  bpm: 72,
  space: 0.85,
  gain: 0.75,
  off: ['ring', 'storm', 'comet', 'bloom'],
  sections: [
    {
      name: 'a',
      bars: 4,
      tracks: [
        { voice: 'pad', pattern: 'Dmaj7 Eadd9 Bm7 Asus2', every: 16, octave: 3, gain: 0.42 },
        { voice: 'glass', pattern: ARP, gain: 0.26, pan: 0.2 },
        { voice: 'sub', pattern: 'D1 . . D1 . . . . . . . . . . . .', gain: 0.5 },
        { voice: 'bass', layer: 'ring', pattern: 'D2 - - - - - . . D2 . A1 - - - . . E2 - - - - - . . E2 . B1 - - - . . B1 - - - - - . . B1 . F#1 - - - . . A1 - - - - - . . A1 . E2 - - - . .', gain: 0.5 },
        { voice: 'bell', layer: 'storm', pattern: '. . . . F#5 - - - E5 - D5 - - - . . . . . . G#5 - - - F#5 - E5 - - - . . . . . . D5 - - - C#5 - B4 - - - . . . . . . E5 - - - - - - - . . . .', gain: 0.32, pan: -0.3 },
        { voice: 'lead', layer: 'comet', pattern: 'A5 - - - - - - - - - - - G#5 - F#5 - E5 - - - - - - - - - - - . . . . F#5 - - - - - - - A5 - - - D6 - - - C#6 - - - - - - - B5 - - - - - - -', gain: 0.18, pan: 0.25 },
        { voice: 'choir', layer: 'bloom', pattern: 'Dmaj7 Eadd9 Bm7 Asus2', every: 16, octave: 4, gain: 0.3 },
      ],
    },
  ],
};

/** The frenzy: four on the floor; swallows play the riff on top. */
export const FRENZY_SONG: Song = {
  name: 'galaxy-frenzy',
  bpm: 128,
  space: 0.35,
  gain: 0.8,
  sections: [
    {
      name: 'a',
      bars: 4,
      tracks: [
        { voice: 'kick', pattern: 'x...x...x...x...', gain: 0.85 },
        { voice: 'hat', pattern: '..x...x...x...x.', gain: 0.4 },
        { voice: 'clap', pattern: '....x.......x...', gain: 0.5 },
        { voice: 'shaker', pattern: 'x.xxx.xxx.xxx.xx', gain: 0.18 },
        { voice: 'bass', pattern: 'D2 . D3 . D2 . D3 D2 B1 . B2 . B1 . B2 B1 G1 . G2 . G1 . G2 G1 A1 . A2 . A1 . E2 A1', every: 2, gain: 0.55 },
        { voice: 'strings', pattern: 'D Bm G A', every: 16, octave: 4, gain: 0.25 },
      ],
    },
  ],
};

/** Ring run: a driving arpeggio. Gate chimes climb a scale on top. */
export const RING_SONG: Song = {
  name: 'galaxy-ring',
  bpm: 140,
  space: 0.3,
  gain: 0.8,
  sections: [
    {
      name: 'a',
      bars: 4,
      tracks: [
        { voice: 'kick', pattern: 'x...x...x...x..x', gain: 0.8 },
        { voice: 'clap', pattern: '....x.......x...', gain: 0.45 },
        { voice: 'hat', pattern: 'x.x.x.x.x.x.x.x.', gain: 0.25 },
        { voice: 'pluck', pattern: 'D4 F#4 A4 D5 F#4 A4 D5 F#5 E4 G#4 B4 E5 G#4 B4 E5 G#5 B3 D4 F#4 B4 D4 F#4 B4 D5 A3 C#4 E4 A4 C#4 E4 A4 C#5', gain: 0.28, pan: 0.15 },
        { voice: 'acid', pattern: 'D2 . D2 D3 . D2 . C3 D2 . D2 D3 . A2 . C3', gain: 0.32 },
        { voice: 'lead', pattern: 'A5 - - - - - - - F#5 - - - E5 - - - G#5 - - - - - - - E5 - - - B4 - - - F#5 - - - - - - - D5 - - - A4 - - - E5 - - - - - - - C#5 - - - - - - -', gain: 0.14, pan: -0.2 },
      ],
    },
  ],
};

/** Rock rain: toms and brass stabs; meteors land on its beats. */
export const STORM_SONG: Song = {
  name: 'galaxy-storm',
  bpm: 116,
  space: 0.4,
  gain: 0.8,
  sections: [
    {
      name: 'a',
      bars: 4,
      tracks: [
        { voice: 'kick', pattern: 'x.......x..x....', gain: 0.8 },
        { voice: 'tom', pattern: 'X.....x...x.....X.....x...x.x.x.', gain: 0.5 },
        { voice: 'rim', pattern: 'x.x.x.x.x.x.x.x.', gain: 0.18 },
        { voice: 'snare', pattern: '....x.......x...', gain: 0.4 },
        { voice: 'brass', pattern: '[D3 A3 D4] . . . . . . . [C3 G3 C4] . . . [D3 A3 D4] . . . [D3 A3 D4] . . . . . . . [F3 C4 F4] . . . [G3 D4 G4] . . .', gain: 0.32 },
        { voice: 'bass', pattern: 'D2 - . . D2 - . . C2 - . . A1 - . .', gain: 0.5 },
      ],
    },
  ],
};

/** Comet surf: a soaring lead over wide pads. */
export const COMET_SONG: Song = {
  name: 'galaxy-comet',
  bpm: 150,
  space: 0.7,
  gain: 0.8,
  sections: [
    {
      name: 'a',
      bars: 4,
      tracks: [
        { voice: 'kick', pattern: 'x.......x.......', gain: 0.6 },
        { voice: 'hat', pattern: '..x...x...x...x.', gain: 0.25 },
        { voice: 'shaker', pattern: 'xxxxxxxxxxxxxxxx', gain: 0.12 },
        { voice: 'pad', pattern: 'Dmaj7 Bm7 Eadd9 Asus2', every: 16, octave: 3, gain: 0.35 },
        { voice: 'bass', pattern: 'D2 - - - . . D2 . B1 - - - . . B1 . E2 - - - . . E2 . A1 - - - . . A1 .', every: 2, gain: 0.45 },
        { voice: 'lead', pattern: 'A5 - - - - - - - D6 - - - C#6 - B5 - A5 - - - - - - - F#5 - - - E5 - - - G#5 - - - - - - - B5 - - - E6 - - - C#6 - - - - - - - A5 - - - - - - -', gain: 0.2 },
      ],
    },
  ],
};

/** The Horizon: a choir and a slow swell. */
export const HORIZON_SONG: Song = {
  name: 'galaxy-horizon',
  bpm: 60,
  space: 0.95,
  gain: 0.85,
  sections: [
    {
      name: 'a',
      bars: 4,
      tracks: [
        { voice: 'choir', pattern: 'Dmaj7 Eadd9 Bm7 Asus2', every: 16, octave: 3, gain: 0.4 },
        { voice: 'strings', pattern: 'D Eadd9 Bm Asus2', every: 16, octave: 4, gain: 0.22 },
        { voice: 'tom', pattern: 'X...........x.o.', gain: 0.35 },
        { voice: 'glass', pattern: 'A5 . . . . . . . E6 . . . . . . . F#5 . . . . . . . C#6 . . . . . . .', gain: 0.18 },
      ],
    },
  ],
};

const PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86];
const RIFF = [74, 76, 78, 81, 83, 81, 78, 76, 86, 83, 81, 78];

function hz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Seconds from now until the next eighth note of the playing song (0 when nothing plays). */
function toNextEighth(): number {
  const g = audioGraph();
  if (!g || !music.playing) return 0;
  const b = music.beat();
  const next = Math.ceil(b * 2 + 0.05) / 2;
  return Math.max(0, Math.min(0.4, music.beatTime(next) - g.ctx.currentTime));
}

export const gsfx = {
  /** Orb swallowed: a gulp, plus the next riff note on the beat in a frenzy. */
  gulp(riffStep: number | null): void {
    tone(320, 0.7, { type: 'sine', gain: 0.14, slide: 0.15 });
    noise(0.6, { gain: 0.06, freq: 900, sweep: 90, q: 1.4, at: 0.1 });
    tone(55, 0.9, { type: 'sine', gain: 0.2, at: 0.3, attack: 0.05 });
    if (riffStep !== null) {
      const at = toNextEighth();
      const n = RIFF[riffStep % RIFF.length] + (riffStep >= RIFF.length ? 12 : 0);
      tone(hz(n), 0.35, { type: 'triangle', gain: 0.16, at });
      tone(hz(n + 12), 0.25, { type: 'sine', gain: 0.06, at });
    }
  },
  kick(): void {
    tone(160, 0.12, { type: 'sine', gain: 0.35, slide: 0.5 });
    noise(0.05, { gain: 0.12, freq: 2600, q: 0.7 });
    tone(880, 0.3, { type: 'sine', gain: 0.05, slide: 1.8, at: 0.02 });
  },
  shove(): void {
    tone(120, 0.18, { type: 'sine', gain: 0.3, slide: 0.6 });
    noise(0.12, { gain: 0.08, freq: 500, q: 0.6 });
  },
  burp(): void {
    noise(0.7, { gain: 0.12, freq: 200, sweep: 3200, q: 0.8 });
    tone(70, 0.5, { type: 'sawtooth', gain: 0.08, slide: 1.4 });
    for (let i = 0; i < 6; i++) tone(hz(PENTA[4 + i]), 0.25, { type: 'sine', gain: 0.07, at: 0.45 + i * 0.06 });
  },
  rumble(): void {
    tone(42, 1.6, { type: 'sine', gain: 0.3, slide: 0.7, attack: 0.2 });
    noise(1.4, { gain: 0.08, freq: 120, sweep: 60, q: 0.7 });
  },
  slingSpin(): void {
    for (let i = 0; i < 6; i++) tone(hz(PENTA[i] + 12), 0.14, { type: 'triangle', gain: 0.08, at: i * 0.09 });
  },
  whoosh(): void {
    noise(0.9, { gain: 0.14, freq: 400, sweep: 2400, q: 0.6 });
  },
  plink(): void {
    tone(1320, 0.18, { type: 'sine', gain: 0.1 });
    tone(1980, 0.22, { type: 'sine', gain: 0.05, at: 0.05 });
    noise(0.12, { gain: 0.05, freq: 700, q: 0.8 });
  },
  boing(): void {
    tone(150, 0.7, { type: 'sine', gain: 0.22, slide: 2.6 });
    tone(300, 0.5, { type: 'triangle', gain: 0.06, slide: 2.2, at: 0.03 });
  },
  dust(chain: number): void {
    const n = PENTA[Math.min(PENTA.length - 1, chain % PENTA.length)] + 12;
    tone(hz(n), 0.16, { type: 'sine', gain: 0.07 });
  },
  phrase(start: number): void {
    for (let i = 0; i < 4; i++) tone(hz(PENTA[(start + i * 2) % PENTA.length] + 12), 0.18, { type: 'triangle', gain: 0.08, at: i * 0.08 });
  },
  fanfare(): void {
    [74, 78, 81, 86, 90].forEach((n, i) => {
      tone(hz(n), i === 4 ? 0.9 : 0.2, { type: 'triangle', gain: 0.13, at: i * 0.09 });
      tone(hz(n - 12), i === 4 ? 0.9 : 0.2, { type: 'sine', gain: 0.07, at: i * 0.09 });
    });
  },
  harp(): void {
    [62, 66, 69, 73, 76, 81].forEach((n, i) => tone(hz(n + 12), 1.4, { type: 'sine', gain: 0.06, at: i * 0.05 }));
  },
  meteor(warn: number): void {
    tone(2200, warn, { type: 'sine', gain: 0.04, slide: 0.25 });
  },
  crunch(near: number): void {
    noise(0.5, { gain: 0.18 * near + 0.04, freq: 300, sweep: 80, q: 0.6 });
    tone(70, 0.4, { type: 'sine', gain: 0.25 * near + 0.05, slide: 0.5 });
    for (let i = 0; i < 4; i++) noise(0.05, { gain: 0.05 * near + 0.004, freq: 2000 + i * 600, q: 2, at: 0.08 + i * 0.05 });
  },
  tileDrop(): void {
    noise(0.6, { gain: 0.06, freq: 500, sweep: 120, q: 1 });
  },
  hit(): void {
    tone(90, 0.3, { type: 'square', gain: 0.12, slide: 0.5 });
    noise(0.3, { gain: 0.1, freq: 3500, sweep: 1500, q: 3 });
  },
  shard(big: boolean): void {
    const base = big ? 81 : 86;
    [0, 4, 7].forEach((d, i) => tone(hz(base + d), 0.25, { type: 'sine', gain: 0.08, at: i * 0.04 }));
  },
  bloop(): void {
    tone(260, 0.25, { type: 'sine', gain: 0.18, slide: 1.8 });
    tone(520, 1.2, { type: 'sine', gain: 0.05, slide: 2, at: 0.3 });
  },
  pop(): void {
    noise(0.08, { gain: 0.12, freq: 1800, q: 1.2 });
    tone(900, 0.08, { type: 'sine', gain: 0.1, slide: 0.5 });
  },
  gate(i: number): void {
    const n = PENTA[i % PENTA.length] + 12;
    tone(hz(n), 0.35, { type: 'triangle', gain: 0.12 });
    tone(hz(n + 7), 0.3, { type: 'sine', gain: 0.05, at: 0.04 });
  },
  buzz(): void {
    tone(110, 0.3, { type: 'sawtooth', gain: 0.07 });
    tone(104, 0.3, { type: 'sawtooth', gain: 0.07 });
  },
  lap(): void {
    [74, 78, 81, 86].forEach((n, i) => tone(hz(n), 0.25, { type: 'square', gain: 0.05, at: i * 0.1 }));
  },
  spin(): void {
    tone(300, 0.5, { type: 'sawtooth', gain: 0.05, slide: 3 });
    noise(0.4, { gain: 0.06, freq: 1500, sweep: 4000, q: 2 });
  },
  cloud(): void {
    tone(80, 0.4, { type: 'sine', gain: 0.25, slide: 0.6 });
    noise(0.3, { gain: 0.08, freq: 300, q: 0.5 });
  },
  ride(): void {
    noise(1.6, { gain: 0.12, freq: 300, sweep: 1800, q: 0.5 });
    tone(110, 1.2, { type: 'sawtooth', gain: 0.05, slide: 2 });
  },
  stone(i: number): void {
    tone(hz(62 + i * 2), 0.6, { type: 'sine', gain: 0.09 });
    tone(hz(74 + i * 2), 0.4, { type: 'triangle', gain: 0.04, at: 0.02 });
  },
  warp(): void {
    noise(4, { gain: 0.16, freq: 120, sweep: 4000, q: 0.5 });
    for (let i = 0; i < 4; i++) tone(110 * Math.pow(2, i), 4, { type: 'sawtooth', gain: 0.025, slide: 2, attack: 0.5 });
  },
  bloom(): void {
    [38, 50, 57, 62, 66, 69, 74, 78, 81].forEach((n, i) => {
      tone(hz(n), 4.5, { type: i < 2 ? 'sine' : 'triangle', gain: i < 2 ? 0.18 : 0.06, attack: 0.03 });
    });
    noise(2.5, { gain: 0.08, freq: 6000, sweep: 1200, q: 0.4 });
  },
  moon(): void {
    [74, 81, 86, 93].forEach((n, i) => tone(hz(n), 1.2, { type: 'sine', gain: 0.07, at: i * 0.07 }));
  },
  locked(): void {
    tone(220, 0.15, { type: 'triangle', gain: 0.08 });
    tone(196, 0.2, { type: 'triangle', gain: 0.08, at: 0.12 });
  },
};
