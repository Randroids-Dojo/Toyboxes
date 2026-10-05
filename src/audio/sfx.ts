// Synthesised sound: short, restrained cues tied to real events. Nothing here
// is essential; every cue has a visual twin, so muted play loses nothing.

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let volume = 0.7;
let lastAt = new Map<string, number>();

function ac(): Ctx | null {
  if (ctx) return ctx;
  const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  try {
    ctx = new C();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Call from a user gesture; browsers start audio suspended. */
export function unlockAudio(): void {
  const c = ac();
  if (c && c.state === 'suspended') void c.resume();
}

export function setVolume(v: number): void {
  volume = v;
  if (master && ctx) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
}

export function suspendAudio(on: boolean): void {
  if (!ctx) return;
  if (on) void ctx.suspend();
  else void ctx.resume();
}

/** Drops repeats of the same cue that land too close together. */
function gate(name: string, ms: number): boolean {
  const now = performance.now();
  if (now - (lastAt.get(name) ?? 0) < ms) return false;
  lastAt.set(name, now);
  return true;
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; at?: number; slide?: number; attack?: number } = {}): void {
  const c = ac();
  if (!c || !master || volume <= 0) return;
  const t0 = c.currentTime + (opts.at ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t0);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t0 + dur);
  const peak = opts.gain ?? 0.2;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, opts: { gain?: number; at?: number; freq?: number; q?: number; type?: BiquadFilterType; sweep?: number } = {}): void {
  const c = ac();
  if (!c || !master || !noiseBuf || volume <= 0) return;
  const t0 = c.currentTime + (opts.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.setValueAtTime(opts.freq ?? 1200, t0);
  if (opts.sweep) f.frequency.exponentialRampToValueAtTime(opts.sweep, t0 + dur);
  f.Q.value = opts.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.2, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.02);
}

export const sfx = {
  step(): void {
    if (!gate('step', 150)) return;
    noise(0.05, { gain: 0.035, freq: 900 + Math.random() * 400, q: 0.8 });
  },
  kick(hit: boolean): void {
    if (hit) {
      tone(140, 0.14, { type: 'sine', gain: 0.45, slide: 0.45 });
      noise(0.06, { gain: 0.18, freq: 2200, q: 0.7 });
    } else {
      noise(0.12, { gain: 0.06, freq: 700, sweep: 1600, q: 0.6 });
    }
  },
  bounce(strength: number): void {
    if (!gate('bounce', 70)) return;
    tone(110 + strength * 60, 0.09, { gain: 0.08 + strength * 0.22, slide: 0.6 });
  },
  knock(): void {
    if (!gate('knock', 60)) return;
    tone(520 + Math.random() * 240, 0.07, { type: 'triangle', gain: 0.12, slide: 0.7 });
    noise(0.05, { gain: 0.06, freq: 3000, q: 2 });
  },
  goal(): void {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.28, { type: 'triangle', gain: 0.16, at: i * 0.08 }));
    noise(1.1, { gain: 0.07, freq: 900, sweep: 500, q: 0.4, at: 0.05 });
  },
  strike(): void {
    [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.24, { type: 'square', gain: 0.07, at: i * 0.07 }));
  },
  ding(big: boolean): void {
    tone(big ? 1320 : 990, big ? 0.6 : 0.35, { type: 'sine', gain: 0.18 });
    if (big) tone(1760, 0.5, { type: 'sine', gain: 0.1, at: 0.08 });
  },
  page(): void {
    noise(0.22, { gain: 0.09, freq: 2400, sweep: 900, q: 0.5, type: 'highpass' });
  },
  confirm(): void {
    tone(660, 0.12, { type: 'triangle', gain: 0.14 });
    tone(990, 0.18, { type: 'triangle', gain: 0.14, at: 0.08 });
  },
  error(): void {
    tone(220, 0.16, { type: 'square', gain: 0.06 });
    tone(180, 0.2, { type: 'square', gain: 0.06, at: 0.09 });
  },
  click(): void {
    if (!gate('click', 40)) return;
    tone(1400, 0.035, { type: 'triangle', gain: 0.05 });
  },
  door(): void {
    noise(0.3, { gain: 0.08, freq: 500, sweep: 250, q: 0.8 });
    tone(330, 0.12, { type: 'triangle', gain: 0.08, at: 0.12 });
  },
  mount(): void {
    tone(440, 0.08, { type: 'triangle', gain: 0.1 });
    tone(660, 0.1, { type: 'triangle', gain: 0.1, at: 0.06 });
  },
  bump(strength: number): void {
    if (!gate('bump', 200)) return;
    tone(90, 0.18, { gain: 0.15 + strength * 0.2, slide: 0.5 });
    noise(0.1, { gain: 0.08 + strength * 0.1, freq: 400, q: 0.6 });
  },
  place(): void {
    tone(300, 0.08, { type: 'sine', gain: 0.18, slide: 0.7 });
  },
  beep(go: boolean): void {
    tone(go ? 1046 : 523, go ? 0.45 : 0.18, { type: 'square', gain: 0.08 });
  },
  lap(best: boolean): void {
    tone(880, 0.12, { type: 'triangle', gain: 0.14 });
    tone(best ? 1318 : 1046, best ? 0.4 : 0.2, { type: 'triangle', gain: 0.14, at: 0.1 });
  },
  boost(): void {
    if (!gate('boost', 250)) return;
    noise(0.55, { gain: 0.13, freq: 500, sweep: 2600, q: 0.7 });
    tone(196, 0.45, { type: 'sawtooth', gain: 0.045, slide: 2.4 });
  },
  driftSpark(stage: number): void {
    tone(stage === 2 ? 1320 : 990, 0.09, { type: 'square', gain: 0.045 });
  },
  lever(): void {
    noise(0.18, { gain: 0.1, freq: 600, sweep: 200, q: 1.2 });
    tone(140, 0.2, { type: 'triangle', gain: 0.12, slide: 0.6, at: 0.05 });
  },
  reelTick(): void {
    if (!gate('reel', 55)) return;
    noise(0.025, { gain: 0.035, freq: 3200, q: 4 });
  },
  reelStop(): void {
    tone(200, 0.08, { type: 'square', gain: 0.07, slide: 0.7 });
  },
  coins(amount: number): void {
    const n = Math.min(12, 2 + Math.floor(Math.log2(Math.max(1, amount))));
    for (let i = 0; i < n; i++) tone(1400 + ((i * 337) % 600), 0.07, { type: 'triangle', gain: 0.06, at: i * 0.06 });
  },
  jackpot(): void {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, { type: 'square', gain: 0.08, at: i * 0.11 }));
    noise(1.6, { gain: 0.06, freq: 1200, sweep: 600, q: 0.4, at: 0.1 });
  },
};

export const sfxSpace = {
  portal(): void {
    noise(1.4, { gain: 0.12, freq: 2400, sweep: 120, q: 0.7 });
    tone(880, 1.2, { type: 'sine', gain: 0.1, slide: 0.12 });
  },
  swallow(): void {
    tone(320, 0.7, { type: 'sine', gain: 0.16, slide: 0.15 });
    noise(0.6, { gain: 0.07, freq: 900, sweep: 90, q: 1.4, at: 0.1 });
    tone(55, 0.9, { type: 'sine', gain: 0.22, at: 0.35, attack: 0.05 });
  },
  spawn(): void {
    tone(1200, 0.25, { type: 'sine', gain: 0.05, slide: 1.6 });
  },
};

/** A slow, low hum for otherworldly places. */
export class Drone {
  private nodes: AudioNode[] = [];
  private gain: GainNode | null = null;

  start(): void {
    const c = ac();
    if (!c || !master || this.gain) return;
    this.gain = c.createGain();
    this.gain.gain.value = 0.0001;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 4;
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(filter.frequency);
    for (const f of [55, 82.4, 110.6]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 14;
      o.connect(filter);
      o.start();
      this.nodes.push(o);
    }
    lfo.start();
    this.nodes.push(lfo);
    filter.connect(this.gain).connect(master);
    this.gain.gain.setTargetAtTime(0.045, c.currentTime, 1.2);
  }

  stop(): void {
    const c = ctx;
    if (!c || !this.gain) return;
    this.gain.gain.setTargetAtTime(0.0001, c.currentTime, 0.3);
    const nodes = this.nodes;
    setTimeout(() => nodes.forEach((n) => (n as OscillatorNode).stop?.()), 1200);
    this.nodes = [];
    this.gain = null;
  }
}

/** A soft motor that follows vehicle speed. */
export class Engine {
  private osc: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;

  start(kind: 'kart' | 'scooter'): void {
    const c = ac();
    if (!c || !master || this.osc) return;
    this.osc = c.createOscillator();
    this.osc2 = c.createOscillator();
    this.osc.type = kind === 'kart' ? 'sawtooth' : 'triangle';
    this.osc2.type = 'square';
    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = kind === 'kart' ? 500 : 900;
    this.gain = c.createGain();
    this.gain.gain.value = 0.0001;
    this.osc.connect(this.filter);
    this.osc2.connect(this.filter);
    this.filter.connect(this.gain).connect(master);
    this.osc.start();
    this.osc2.start();
  }

  set(speed01: number, kind: 'kart' | 'scooter'): void {
    const c = ctx;
    if (!c || !this.osc || !this.osc2 || !this.gain) return;
    const t = c.currentTime;
    const base = kind === 'kart' ? 55 : 180;
    this.osc.frequency.setTargetAtTime(base + speed01 * (kind === 'kart' ? 95 : 160), t, 0.05);
    this.osc2.frequency.setTargetAtTime((base + speed01 * 90) * 0.5, t, 0.05);
    const g = kind === 'kart' ? 0.05 + speed01 * 0.06 : speed01 * 0.035;
    this.gain.gain.setTargetAtTime(Math.max(0.0001, g), t, 0.08);
  }

  stop(): void {
    const c = ctx;
    if (!c || !this.osc || !this.osc2 || !this.gain) return;
    this.gain.gain.setTargetAtTime(0.0001, c.currentTime, 0.05);
    const o = this.osc;
    const o2 = this.osc2;
    o.stop(c.currentTime + 0.3);
    o2.stop(c.currentTime + 0.3);
    this.osc = this.osc2 = null;
    this.gain = null;
  }
}

export function resetAudioGates(): void {
  lastAt = new Map();
}
