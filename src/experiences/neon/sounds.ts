// Club Nova's sound effects, all synthesised. Every one has a visual twin, so
// muted play loses nothing. Pitched sounds pick notes from the current chord
// so firing and parrying on the beat makes music.

import { audioGraph, noise, tone } from '../../audio/sfx';

/** A pentatonic set that sits over every song's key well enough. */
const SCALE = [0, 2, 4, 7, 9];

function note(base: number, step: number): number {
  const oct = Math.floor(step / SCALE.length);
  const deg = SCALE[((step % SCALE.length) + SCALE.length) % SCALE.length];
  return base * Math.pow(2, oct + deg / 12);
}

let pewStep = 0;

export const nova = {
  /** A dance or duel hit: a soft clap or shaker so the grid is easy to feel. */
  hit(grade: 'P' | 'G' | 'O'): void {
    noise(0.07, { freq: grade === 'P' ? 2400 : 1800, q: 1.4, gain: grade === 'P' ? 0.16 : 0.11 });
    if (grade === 'P') tone(1760, 0.08, { type: 'sine', gain: 0.05 });
  },
  miss(): void {
    tone(140, 0.16, { type: 'sine', gain: 0.12, slide: 0.6 });
  },
  hold(): void {
    tone(880, 0.35, { type: 'triangle', gain: 0.05, slide: 1.5, attack: 0.04 });
  },
  pose(): void {
    tone(1318, 0.18, { type: 'triangle', gain: 0.08 });
    tone(1976, 0.3, { type: 'sine', gain: 0.06, at: 0.05 });
    noise(0.3, { freq: 5200, q: 0.7, gain: 0.08 });
  },
  /** The blaster: a short pew on the next scale step. */
  pew(beat: boolean): void {
    pewStep = (pewStep + (beat ? 2 : 1)) % 10;
    const f = note(523, pewStep);
    tone(f * 2, 0.12, { type: 'square', gain: 0.05, slide: 0.45 });
    if (beat) tone(f * 4, 0.16, { type: 'sine', gain: 0.05, slide: 0.7 });
  },
  enemyPew(pan = 0): void {
    void pan;
    tone(392, 0.14, { type: 'sawtooth', gain: 0.035, slide: 0.5 });
  },
  charge(): void {
    tone(330, 0.3, { type: 'triangle', gain: 0.03, slide: 1.9, attack: 0.05 });
  },
  tag(): void {
    tone(988, 0.09, { type: 'triangle', gain: 0.09 });
    tone(1480, 0.14, { type: 'triangle', gain: 0.08, at: 0.08 });
  },
  bank(): void {
    tone(2200, 0.25, { type: 'sine', gain: 0.06, slide: 1.4 });
    tone(2960, 0.3, { type: 'sine', gain: 0.04, at: 0.06 });
  },
  reflect(): void {
    noise(0.18, { freq: 3800, q: 2, gain: 0.12, sweep: 900 });
    tone(1568, 0.22, { type: 'triangle', gain: 0.08 });
  },
  bounce(): void {
    tone(2637, 0.12, { type: 'sine', gain: 0.04 });
  },
  hurt(): void {
    tone(260, 0.2, { type: 'sine', gain: 0.12, slide: 0.55 });
    noise(0.1, { freq: 500, gain: 0.08 });
  },
  out(): void {
    tone(523, 0.6, { type: 'triangle', gain: 0.08, slide: 0.3 });
    tone(440, 0.6, { type: 'sine', gain: 0.05, slide: 0.35, at: 0.05 });
  },
  warp(): void {
    noise(0.6, { freq: 300, q: 0.8, gain: 0.12, sweep: 4200 });
    tone(220, 0.6, { type: 'sine', gain: 0.07, slide: 4 });
  },
  overheat(): void {
    noise(0.5, { freq: 6000, q: 0.5, gain: 0.07, sweep: 2000 });
  },
  pickup(): void {
    [0, 0.06, 0.12].forEach((at, i) => tone(784 * Math.pow(1.26, i), 0.14, { type: 'triangle', gain: 0.07, at }));
  },
  deflectReady(): void {
    tone(660, 0.12, { type: 'sine', gain: 0.05, slide: 1.6 });
  },
  /** Blade parry, brighter for Perfect. */
  shing(perfect: boolean): void {
    noise(0.16, { freq: 6400, q: 3, gain: 0.12, sweep: 3000 });
    tone(perfect ? 1760 : 1320, 0.25, { type: 'triangle', gain: 0.08 });
    if (perfect) tone(2637, 0.45, { type: 'sine', gain: 0.06, at: 0.02 });
  },
  whiff(): void {
    noise(0.2, { freq: 900, q: 0.6, gain: 0.1, sweep: 300 });
  },
  read(): void {
    noise(0.25, { freq: 400, q: 0.7, gain: 0.08, sweep: 3000 });
    tone(2093, 0.2, { type: 'sine', gain: 0.05, at: 0.15 });
  },
  bind(): void {
    tone(110, 0.5, { type: 'sawtooth', gain: 0.035, slide: 2.2, attack: 0.05 });
  },
  push(): void {
    noise(0.3, { freq: 1200, q: 0.8, gain: 0.14, sweep: 200 });
    tone(196, 0.3, { type: 'square', gain: 0.06, slide: 0.5 });
  },
  strike(): void {
    tone(1175, 0.12, { type: 'triangle', gain: 0.08 });
    tone(2349, 0.2, { type: 'sine', gain: 0.05, at: 0.04 });
  },
  bonk(): void {
    tone(180, 0.18, { type: 'square', gain: 0.07, slide: 0.6 });
  },
  cheer(): void {
    noise(1.2, { freq: 1400, q: 0.4, gain: 0.08, sweep: 2400 });
    [0, 0.1, 0.2, 0.3, 0.4].forEach((at, i) => tone(1046 * Math.pow(1.12, i % 3), 0.08, { type: 'square', gain: 0.025, at }));
  },
  aww(): void {
    tone(660, 0.5, { type: 'triangle', gain: 0.05, slide: 0.7 });
    tone(523, 0.6, { type: 'triangle', gain: 0.04, slide: 0.7, at: 0.12 });
  },
  thwip(): void {
    noise(0.08, { freq: 2600, q: 1.2, gain: 0.1, sweep: 5200 });
  },
  bell(i: number): void {
    tone(1046 * Math.pow(2, (i % 8) / 12), 0.25, { type: 'sine', gain: 0.05 });
  },
  fanfare(): void {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, { type: 'triangle', gain: 0.07, at: i * 0.11 }));
    tone(1568, 0.6, { type: 'sine', gain: 0.05, at: 0.45 });
  },
  scratch(): void {
    noise(0.22, { freq: 900, q: 2.5, gain: 0.15, sweep: 2600 });
    noise(0.18, { freq: 2600, q: 2.5, gain: 0.12, sweep: 700, at: 0.2 });
  },
  pulse(): void {
    tone(55, 0.5, { type: 'sine', gain: 0.18, slide: 0.7 });
  },
  /** A footstep note on the Nova floor, played `wait` seconds from now (on the next eighth). */
  stepAt(i: number, wait: number): void {
    const seq = [0, 2, 4, 3, 1, 4, 2, 5];
    tone(note(392, seq[i % 8]), 0.14, { type: 'sine', gain: 0.03, at: Math.max(0, Math.min(0.6, wait)) });
  },
  blip(): void {
    tone(1318, 0.06, { type: 'square', gain: 0.03 });
  },
  rise(): void {
    noise(1.5, { freq: 300, q: 1, gain: 0.07, sweep: 6000 });
  },
  /** Sound check click (a clap from Orbit), scheduled at an audio time. */
  clapAt(at: number): void {
    noise(0.09, { freq: 1500, q: 1.1, gain: 0.22, at });
    tone(196, 0.08, { type: 'sine', gain: 0.14, at });
  },
  /** Seconds from now to an audio context time (for scheduling). */
  audioNow(): number {
    return audioGraph()?.ctx.currentTime ?? 0;
  },
};
