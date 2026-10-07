// The Grand Prix's own sounds, synthesised: tiny driver voices (never
// words), item effects, the Grabber's jingle, springs, landings, crowd
// swells and the timing tower's clatter. Every cue has a visual twin.

import { audioGraph, noise, tone } from '../../audio/sfx';
import type { DriverKind } from './drivers';

let lastVoice = 0;
const gates = new Map<string, number>();

function gate(name: string, ms: number): boolean {
  const now = performance.now();
  if (now - (gates.get(name) ?? 0) < ms) return false;
  gates.set(name, now);
  return true;
}

export const kartSfx = {
  /** A driver's little babble: at most one voice every 2 seconds. */
  voice(kind: DriverKind, mood: 'happy' | 'hurt' | 'hey' = 'happy'): void {
    const now = performance.now();
    if (now - lastVoice < 2000) return;
    lastVoice = now;
    const up = mood === 'happy' ? 1 : 0.8;
    switch (kind) {
      case 'robot':
        [880, 660, 990].forEach((f, i) => tone(f * up, 0.06, { type: 'square', gain: 0.05, at: i * 0.07 }));
        break;
      case 'frog':
        tone(180 * up, 0.12, { type: 'sawtooth', gain: 0.07, slide: 1.4 });
        tone(260 * up, 0.14, { type: 'sawtooth', gain: 0.06, at: 0.14, slide: 0.8 });
        break;
      case 'cat':
        tone(600 * up, 0.28, { type: 'triangle', gain: 0.07, slide: mood === 'hurt' ? 0.6 : 1.5 });
        break;
      case 'duck':
        noise(0.12, { gain: 0.08, freq: 900 * up, q: 6 });
        noise(0.1, { gain: 0.07, freq: 1100 * up, q: 6, at: 0.14 });
        break;
      case 'dino':
        noise(0.35, { gain: 0.1, freq: 260, sweep: 140, q: 3 });
        tone(110, 0.32, { type: 'sawtooth', gain: 0.05, slide: 0.7 });
        break;
      case 'octopus':
        [520, 700, 460].forEach((f, i) => tone(f * up, 0.08, { type: 'sine', gain: 0.08, at: i * 0.08, slide: 1.8 }));
        break;
      case 'bear':
        tone(220 * up, 0.18, { type: 'sine', gain: 0.09, slide: 0.85 });
        tone(196 * up, 0.24, { type: 'sine', gain: 0.09, at: 0.22, slide: 0.85 });
        break;
    }
  },
  capsule(): void {
    tone(700, 0.08, { type: 'triangle', gain: 0.1, slide: 1.6 });
    noise(0.12, { gain: 0.06, freq: 3000, q: 1.5, at: 0.03 });
  },
  rouletteTick(): void {
    if (!gate('roul', 60)) return;
    tone(1500, 0.03, { type: 'square', gain: 0.03 });
  },
  itemLand(): void {
    tone(880, 0.1, { type: 'triangle', gain: 0.1 });
    tone(1320, 0.16, { type: 'triangle', gain: 0.09, at: 0.08 });
  },
  spring(): void {
    tone(220, 0.35, { type: 'triangle', gain: 0.1, slide: 3 });
    noise(0.4, { gain: 0.08, freq: 600, sweep: 2600, q: 0.8 });
  },
  ballThrow(): void {
    tone(330, 0.12, { type: 'sine', gain: 0.12, slide: 1.8 });
  },
  boing(speed: number): void {
    if (!gate('boing', 90)) return;
    tone(160 + speed * 8, 0.16, { type: 'sine', gain: 0.1, slide: 1.9 });
  },
  marbles(): void {
    for (let i = 0; i < 6; i++) tone(2200 + ((i * 397) % 900), 0.04, { type: 'triangle', gain: 0.04, at: i * 0.045 });
  },
  bubble(): void {
    tone(300, 0.25, { type: 'sine', gain: 0.1, slide: 2.4 });
    tone(520, 0.2, { type: 'sine', gain: 0.06, at: 0.08, slide: 1.5 });
  },
  pop(): void {
    noise(0.08, { gain: 0.14, freq: 2400, q: 1.2 });
    tone(900, 0.07, { type: 'sine', gain: 0.08, slide: 0.4 });
  },
  plane(): void {
    noise(0.6, { gain: 0.06, freq: 1800, sweep: 900, q: 3 });
  },
  whistle(): void {
    if (!gate('whistle', 600)) return;
    tone(900, 0.9, { type: 'sine', gain: 0.07, slide: 1.8 });
  },
  spinout(): void {
    tone(500, 0.6, { type: 'sawtooth', gain: 0.06, slide: 0.3 });
    tone(300, 0.5, { type: 'triangle', gain: 0.06, at: 0.1, slide: 1.5 });
  },
  hitOther(): void {
    tone(1046, 0.18, { type: 'triangle', gain: 0.1 });
    tone(1568, 0.3, { type: 'triangle', gain: 0.08, at: 0.06 });
  },
  wall(strength: number): void {
    if (!gate('wall', 180)) return;
    noise(0.14, { gain: 0.06 + strength * 0.12, freq: 300, q: 0.7 });
    tone(80, 0.16, { gain: 0.08 + strength * 0.1, slide: 0.6 });
  },
  jump(): void {
    tone(240, 0.3, { type: 'triangle', gain: 0.1, slide: 2.2 });
  },
  land(strength: number): void {
    if (!gate('kland', 150)) return;
    tone(90, 0.16, { gain: 0.12 + strength * 0.15, slide: 0.5 });
    noise(0.12, { gain: 0.05 + strength * 0.08, freq: 500, q: 0.6 });
  },
  trick(): void {
    noise(0.25, { gain: 0.06, freq: 1200, sweep: 3200, q: 1 });
    [1318, 1760].forEach((f, i) => tone(f, 0.18, { type: 'sine', gain: 0.07, at: 0.12 + i * 0.07 }));
  },
  grabber(): void {
    // Dee-doo.
    tone(784, 0.14, { type: 'square', gain: 0.05 });
    tone(523, 0.22, { type: 'square', gain: 0.05, at: 0.16 });
    noise(0.3, { gain: 0.04, freq: 400, q: 2, at: 0.4 });
  },
  splash(): void {
    noise(0.5, { gain: 0.1, freq: 1200, sweep: 300, q: 0.6 });
  },
  rocket(): void {
    noise(0.7, { gain: 0.14, freq: 400, sweep: 3000, q: 0.7 });
    tone(150, 0.6, { type: 'sawtooth', gain: 0.05, slide: 3 });
  },
  sputter(): void {
    for (let i = 0; i < 4; i++) noise(0.06, { gain: 0.06, freq: 300, q: 1, at: i * 0.09 });
  },
  passUp(): void {
    if (!gate('pass', 400)) return;
    tone(660, 0.08, { type: 'triangle', gain: 0.06 });
    tone(880, 0.12, { type: 'triangle', gain: 0.06, at: 0.07 });
  },
  passDown(): void {
    if (!gate('pass', 400)) return;
    tone(660, 0.08, { type: 'triangle', gain: 0.05 });
    tone(494, 0.14, { type: 'triangle', gain: 0.05, at: 0.07 });
  },
  bell(): void {
    [1318, 1046, 1318].forEach((f, i) => tone(f, 0.5, { type: 'sine', gain: 0.09, at: i * 0.18 }));
  },
  finish(): void {
    tone(1600, 0.5, { type: 'sine', gain: 0.08, slide: 1.1 });
    tone(1900, 0.6, { type: 'sine', gain: 0.07, at: 0.3, slide: 1.1 });
  },
  fanfare(win: boolean): void {
    const notes = win ? [523, 659, 784, 1046, 784, 1046, 1318] : [440, 494, 523, 659];
    notes.forEach((f, i) => tone(f, 0.24, { type: 'square', gain: 0.06, at: i * 0.12 }));
    if (win) noise(1.2, { gain: 0.05, freq: 1500, sweep: 700, q: 0.4, at: 0.3 });
  },
  confetti(): void {
    for (let i = 0; i < 5; i++) noise(0.05, { gain: 0.05, freq: 2500 + i * 300, q: 2, at: i * 0.05 });
  },
  crowd(): void {
    if (!gate('crowd', 2500)) return;
    noise(1.6, { gain: 0.05, freq: 900, sweep: 1400, q: 0.3 });
  },
  clatter(): void {
    for (let i = 0; i < 8; i++) noise(0.03, { gain: 0.04, freq: 2600, q: 3, at: i * 0.04 });
  },
  stamp(): void {
    tone(120, 0.14, { gain: 0.16, slide: 0.5 });
    noise(0.08, { gain: 0.08, freq: 900, q: 0.8 });
  },
  horn(kind: DriverKind | 'you'): void {
    if (!gate('horn', 500)) return;
    const f = kind === 'you' ? 440 : kind === 'robot' ? 660 : kind === 'frog' ? 330 : 520;
    tone(f, 0.18, { type: 'square', gain: 0.05 });
    tone(f * 1.25, 0.18, { type: 'square', gain: 0.05, at: 0.2 });
  },
  tick(): void {
    tone(1200, 0.03, { type: 'triangle', gain: 0.04 });
  },
  rumble(): void {
    if (!gate('rumble', 220)) return;
    noise(0.2, { gain: 0.03, freq: 160, q: 0.8 });
  },
};

/** One quiet engine hum for the whole pack, loudest when a kart is near. */
export class PackDrone {
  private osc: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gain: GainNode | null = null;

  start(): void {
    const g = audioGraph();
    if (!g || this.osc) return;
    const c = g.ctx;
    this.osc = c.createOscillator();
    this.osc2 = c.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc2.type = 'square';
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    this.gain = c.createGain();
    this.gain.gain.value = 0.0001;
    this.osc.connect(f);
    this.osc2.connect(f);
    f.connect(this.gain).connect(g.out);
    this.osc.start();
    this.osc2.start();
  }

  /** `near` 0..1: how close the nearest kart is; `speed01` its speed. */
  set(near: number, speed01: number): void {
    const g = audioGraph();
    if (!g || !this.osc || !this.osc2 || !this.gain) return;
    const t = g.ctx.currentTime;
    this.osc.frequency.setTargetAtTime(62 + speed01 * 80, t, 0.1);
    this.osc2.frequency.setTargetAtTime(31 + speed01 * 41, t, 0.1);
    this.gain.gain.setTargetAtTime(Math.max(0.0001, near * near * 0.035), t, 0.15);
  }

  stop(): void {
    const g = audioGraph();
    if (!g || !this.osc || !this.osc2 || !this.gain) return;
    this.gain.gain.setTargetAtTime(0.0001, g.ctx.currentTime, 0.05);
    this.osc.stop(g.ctx.currentTime + 0.3);
    this.osc2.stop(g.ctx.currentTime + 0.3);
    this.osc = this.osc2 = null;
    this.gain = null;
  }
}
