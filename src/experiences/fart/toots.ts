// Every sound in Little Puffington, synthesised live: the toot synth (pitch
// glide, lip buzz, brass body, air, sub, the little "pt" at the end and the
// rare afterthought squeak), the toot voices, the townsfolk's gibberish and
// the village's own noises. Nothing here is essential: every sound has a
// visual twin (comic words, rings, bubbles).

import { audioGraph } from '../../audio/sfx';
import type { Gas } from './sim/gas';

export type Voice = 'classic' | 'duck' | 'kazoo' | 'trombone' | 'horn' | 'opera' | 'golden';
export type TootSize = 'tap' | 'scoot' | 'boost' | 'rocket' | 'blip' | 'squeeze' | 'note';

interface G {
  ctx: AudioContext;
  out: GainNode;
  noise: AudioBuffer;
}

let active = 0;
const MAX_VOICES = 7;
const lastAt = new Map<string, number>();

function graph(): G | null {
  const g = audioGraph();
  if (!g || g.ctx.state === 'closed') return null;
  return g;
}

function gate(name: string, ms: number): boolean {
  const now = performance.now();
  if (now - (lastAt.get(name) ?? -1e9) < ms) return false;
  lastAt.set(name, now);
  return true;
}

function track(node: AudioScheduledSourceNode): void {
  active++;
  node.onended = () => {
    active = Math.max(0, active - 1);
  };
}

function env(g: GainNode, t0: number, peak: number, attack: number, dur: number, release = 0.05): void {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function osc(c: AudioContext, type: OscillatorType, f: number, t0: number): OscillatorNode {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  return o;
}

function bp(c: AudioContext, f: number, q: number, type: BiquadFilterType = 'bandpass'): BiquadFilterNode {
  const b = c.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

function noiseSrc(g: G, t0: number, dur: number): AudioBufferSourceNode {
  const s = g.ctx.createBufferSource();
  s.buffer = g.noise;
  s.loop = true;
  s.start(t0, Math.random() * 0.5);
  s.stop(t0 + dur + 0.05);
  return s;
}

/** A one-off tone, routed to the effects level. */
export function beep(freq: number, dur: number, o: { type?: OscillatorType; gain?: number; at?: number; slide?: number; attack?: number } = {}): void {
  const g = graph();
  if (!g) return;
  const c = g.ctx;
  const t0 = c.currentTime + (o.at ?? 0);
  const v = osc(c, o.type ?? 'sine', freq, t0);
  if (o.slide) v.frequency.exponentialRampToValueAtTime(Math.max(20, freq * o.slide), t0 + dur);
  const gn = c.createGain();
  env(gn, t0, o.gain ?? 0.15, o.attack ?? 0.006, dur, dur * 0.6);
  v.connect(gn).connect(g.out);
  v.start(t0);
  v.stop(t0 + dur + 0.02);
}

/** Filtered noise. */
export function hiss(dur: number, o: { gain?: number; at?: number; freq?: number; q?: number; type?: BiquadFilterType; sweep?: number; attack?: number } = {}): void {
  const g = graph();
  if (!g) return;
  const c = g.ctx;
  const t0 = c.currentTime + (o.at ?? 0);
  const s = noiseSrc(g, t0, dur);
  const f = bp(c, o.freq ?? 1200, o.q ?? 1, o.type ?? 'bandpass');
  if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t0 + dur);
  const gn = c.createGain();
  env(gn, t0, o.gain ?? 0.12, o.attack ?? 0.01, dur, dur * 0.7);
  s.connect(f).connect(gn).connect(g.out);
}

// ---------------------------------------------------------------------------
// The toot synth

interface Recipe {
  f0: number;
  f1: number;
  dur: number;
  buzz0: number;
  buzz1: number;
  body: number;
  gain: number;
  sub: boolean;
  air: number;
  wobble: number;
}

function recipe(gas: Gas, size: TootSize): Recipe {
  const r = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
  if (gas === 'fizzy') {
    const big = size === 'rocket';
    return { f0: r(520, 600) * (big ? 0.7 : 1), f1: r(680, 760) * (big ? 0.8 : 1), dur: big ? 0.6 : size === 'tap' || size === 'scoot' ? 0.16 : 0.08, buzz0: 40, buzz1: 30, body: 1300, gain: 0.16, sub: false, air: 0.25, wobble: 30 };
  }
  if (gas === 'cabbage') {
    const big = size === 'rocket';
    return { f0: r(68, 74), f1: r(52, 56), dur: big ? 1.4 : size === 'boost' ? 0.7 : 0.9, buzz0: 9, buzz1: 6, body: 360, gain: 0.28, sub: big, air: 0.45, wobble: 60 };
  }
  // Beans.
  if (size === 'rocket') return { f0: r(115, 125), f1: r(56, 62), dur: 1.1, buzz0: 28, buzz1: 12, body: 440, gain: 0.32, sub: true, air: 0.3, wobble: 35 };
  if (size === 'boost') return { f0: r(105, 115), f1: r(72, 80), dur: 0.45, buzz0: 25, buzz1: 16, body: 430, gain: 0.26, sub: false, air: 0.22, wobble: 25 };
  if (size === 'scoot') return { f0: r(110, 120), f1: r(85, 92), dur: 0.24, buzz0: 26, buzz1: 20, body: 470, gain: 0.22, sub: false, air: 0.2, wobble: 20 };
  return { f0: r(92, 98), f1: r(68, 72), dur: 0.35, buzz0: 22, buzz1: 16, body: 420, gain: 0.24, sub: false, air: 0.2, wobble: 25 };
}

const VOICE_PITCH: Record<Voice, number> = { classic: 1, duck: 4, kazoo: 2.2, trombone: 1.5, horn: 2.6, opera: 5, golden: 1.6 };

export interface TootOpts {
  gas: Gas;
  size: TootSize;
  voice?: Voice;
  /** Exact pitch in Hz (the band plays in tune). */
  pitch?: number;
  dur?: number;
  /** Seconds from now. */
  at?: number;
  gain?: number;
  /** Afterthought squeaks allowed (default true). */
  extras?: boolean;
}

/** Plays a toot. Returns its length in seconds. */
export function toot(o: TootOpts): number {
  const g = graph();
  if (!g) return 0;
  if (active >= MAX_VOICES && o.size !== 'note') return 0;
  const c = g.ctx;
  const voice = o.voice ?? 'classic';
  const R = recipe(o.gas, o.size);
  if (o.dur) R.dur = o.dur;
  let f0 = R.f0;
  let f1 = R.f1;
  if (o.pitch) {
    f0 = o.pitch * 1.02;
    f1 = o.pitch * (o.gas === 'fizzy' ? 1 : 0.97);
  } else if (voice !== 'classic') {
    const k = VOICE_PITCH[voice] * (o.gas === 'fizzy' ? 0.45 : 1);
    f0 *= k;
    f1 *= k;
  }
  const t0 = c.currentTime + (o.at ?? 0) + 0.005;
  const dur = R.dur;
  const end = t0 + dur;
  const out = c.createGain();
  out.gain.value = (o.gain ?? 1) * R.gain;
  out.connect(g.out);

  // Source with a "bwap" overshoot, then a slide down.
  const type: OscillatorType = voice === 'horn' || voice === 'kazoo' ? 'square' : voice === 'duck' || voice === 'opera' ? 'triangle' : o.gas === 'fizzy' ? 'square' : 'sawtooth';
  const src = osc(c, type, f0 * (voice === 'trombone' ? 0.85 : 1.25), t0);
  src.frequency.exponentialRampToValueAtTime(f0, t0 + (voice === 'trombone' ? 0.12 : 0.035));
  src.frequency.exponentialRampToValueAtTime(Math.max(30, f1), end);
  const srcs: OscillatorNode[] = [src];
  if (voice === 'horn') {
    const third = osc(c, 'square', f0 * 1.26, t0);
    third.frequency.exponentialRampToValueAtTime(Math.max(30, f1 * 1.26), end);
    srcs.push(third);
  }
  if (voice === 'golden') {
    for (const k of [1.25, 1.5]) {
      const v = osc(c, 'sawtooth', f0 * k, t0);
      v.frequency.exponentialRampToValueAtTime(Math.max(30, f1 * k), end);
      srcs.push(v);
    }
  }
  // Wobble (vibrato) on detune.
  const vib = osc(c, 'sine', voice === 'trombone' ? 5.5 : voice === 'opera' ? 6 : 3 + Math.random() * 4, t0);
  const vibAmt = c.createGain();
  vibAmt.gain.value = voice === 'trombone' || voice === 'opera' ? 45 : R.wobble;
  vib.connect(vibAmt);
  for (const s of srcs) vibAmt.connect(s.detune);

  // Lip buzz: amplitude modulation by a pulse, slowing at the end.
  const am = c.createGain();
  am.gain.value = 0.55;
  const buzz = osc(c, 'square', R.buzz0, t0);
  buzz.frequency.linearRampToValueAtTime(R.buzz1, end);
  const buzzAmt = c.createGain();
  buzzAmt.gain.value = voice === 'duck' || voice === 'opera' || voice === 'golden' ? 0.12 : 0.45;
  buzz.connect(buzzAmt).connect(am.gain);
  for (const s of srcs) s.connect(am);

  // Body: two band-passes and a low-pass, by voice.
  const sum = c.createGain();
  let f1b = R.body;
  let f2b = R.body * 2.7;
  if (voice === 'duck') {
    f1b = 1100;
    f2b = 2700;
  } else if (voice === 'kazoo') {
    f1b = 1200;
    f2b = 2400;
  } else if (voice === 'opera') {
    f1b = 800;
    f2b = 1150;
  } else if (o.pitch) {
    f1b = Math.max(R.body, o.pitch * 3);
    f2b = f1b * 2.6;
  }
  const b1 = bp(c, f1b, voice === 'kazoo' ? 6 : 2.2);
  const b2 = bp(c, f2b, 3);
  const lp = bp(c, voice === 'trombone' ? 500 : Math.max(900, f2b * 1.1), 0.7, 'lowpass');
  if (voice === 'trombone') {
    lp.frequency.setValueAtTime(400, t0);
    lp.frequency.exponentialRampToValueAtTime(2000, t0 + dur * 0.4);
    lp.frequency.exponentialRampToValueAtTime(600, end);
  }
  if (voice === 'opera') {
    b1.frequency.setValueAtTime(800, t0);
    b1.frequency.linearRampToValueAtTime(500, end);
    b2.frequency.setValueAtTime(1150, t0);
    b2.frequency.linearRampToValueAtTime(880, end);
  }
  if (voice === 'golden') {
    lp.frequency.setValueAtTime(500, t0);
    lp.frequency.exponentialRampToValueAtTime(3200, t0 + dur * 0.6);
  }
  const g1 = c.createGain();
  g1.gain.value = 1.4;
  const g2 = c.createGain();
  g2.gain.value = 0.7;
  const direct = c.createGain();
  direct.gain.value = voice === 'kazoo' ? 0.25 : 0.5;
  am.connect(b1).connect(g1).connect(sum);
  am.connect(b2).connect(g2).connect(sum);
  am.connect(direct).connect(sum);
  let last: AudioNode = sum;
  if (voice === 'kazoo') {
    const ws = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 3);
    }
    ws.curve = curve;
    sum.connect(ws);
    last = ws;
  }
  const envG = c.createGain();
  const attack = voice === 'horn' ? 0.004 : voice === 'trombone' ? 0.05 : 0.012;
  envG.gain.setValueAtTime(0.0001, t0);
  envG.gain.exponentialRampToValueAtTime(1, t0 + attack);
  envG.gain.setValueAtTime(1, t0 + dur * 0.55);
  envG.gain.exponentialRampToValueAtTime(0.35, end - 0.02);
  envG.gain.exponentialRampToValueAtTime(0.0001, end);
  last.connect(lp).connect(envG).connect(out);
  if (voice === 'opera') {
    const d = c.createDelay(0.5);
    d.delayTime.value = 0.18;
    const fb = c.createGain();
    fb.gain.value = 0.3;
    envG.connect(d).connect(fb).connect(d);
    fb.connect(out);
  }

  // Air.
  if (R.air > 0 && o.size !== 'note') {
    const n = noiseSrc(g, t0, dur);
    const nf = bp(c, o.gas === 'fizzy' ? 2400 : 900, 0.8);
    const ng = c.createGain();
    env(ng, t0, R.air * 0.5, 0.02, dur, dur * 0.5);
    n.connect(nf).connect(ng).connect(out);
  }
  // Sub for the big ones.
  if (R.sub) {
    const s = osc(c, 'sine', f0 / 2, t0);
    s.frequency.exponentialRampToValueAtTime(Math.max(25, f1 / 2), end);
    const sg = c.createGain();
    env(sg, t0, 0.8, 0.02, dur, dur * 0.4);
    s.connect(sg).connect(out);
    s.start(t0);
    s.stop(end + 0.05);
  }
  for (const s of [...srcs, vib, buzz]) {
    s.start(t0);
    s.stop(end + 0.05);
  }
  track(src);

  // The ending: a gap and a tiny "pt".
  if (o.size !== 'note' && o.size !== 'blip') {
    const pt = noiseSrc(g, end + 0.04, 0.03);
    const pf = bp(c, 1800, 1.5);
    const pg = c.createGain();
    env(pg, end + 0.04, 0.35, 0.002, 0.03, 0.02);
    pt.connect(pf).connect(pg).connect(out);
  }
  // The golden toot: a timpani thump and a cymbal.
  if (voice === 'golden') {
    beep(82, 0.7, { gain: 0.3, slide: 0.7, at: o.at ?? 0 });
    hiss(1.2, { gain: 0.06, freq: 7000, type: 'highpass', at: (o.at ?? 0) + 0.02 });
  }
  // The rare afterthought.
  if ((o.extras ?? true) && dur >= 0.8 && Math.random() < 0.3) afterthought(0.5 + Math.random() * 0.4 + (o.at ?? 0) + dur);
  return dur;
}

/** One small high squeak, some time after a long toot. */
export function afterthought(at: number): void {
  const g = graph();
  if (!g) return;
  const c = g.ctx;
  const t0 = c.currentTime + at;
  const v = osc(c, 'square', 420, t0);
  v.frequency.linearRampToValueAtTime(560, t0 + 0.12);
  const f = bp(c, 1400, 3);
  const gn = c.createGain();
  env(gn, t0, 0.07, 0.005, 0.13, 0.05);
  v.connect(f).connect(gn).connect(g.out);
  v.start(t0);
  v.stop(t0 + 0.15);
}

/** A held toot that sustains while you hover, sinking as the gas runs down. */
export class HoverToot {
  private nodes: AudioScheduledSourceNode[] = [];
  private src: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private buzz: OscillatorNode | null = null;
  private base = 90;

  start(gas: Gas, voice: Voice): void {
    const g = graph();
    if (!g || this.src) return;
    const c = g.ctx;
    const t0 = c.currentTime;
    const R = recipe(gas, 'boost');
    this.base = gas === 'fizzy' ? 600 : R.f0 * (voice === 'classic' ? 1 : VOICE_PITCH[voice] * 0.7);
    const src = osc(c, gas === 'fizzy' ? 'square' : 'sawtooth', this.base, t0);
    const vib = osc(c, 'sine', 6, t0);
    const vibAmt = c.createGain();
    vibAmt.gain.value = 40;
    vib.connect(vibAmt).connect(src.detune);
    const am = c.createGain();
    am.gain.value = 0.55;
    const buzz = osc(c, 'square', gas === 'cabbage' ? 8 : gas === 'fizzy' ? 34 : 24, t0);
    const ba = c.createGain();
    ba.gain.value = 0.4;
    buzz.connect(ba).connect(am.gain);
    const b1 = bp(c, gas === 'fizzy' ? 1300 : 450, 2);
    const lp = bp(c, gas === 'fizzy' ? 3000 : 1400, 0.7, 'lowpass');
    const gn = c.createGain();
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(gas === 'fizzy' ? 0.06 : 0.12, t0 + 0.08);
    src.connect(am);
    am.connect(b1).connect(lp);
    am.connect(lp);
    lp.connect(gn).connect(g.out);
    for (const n of [src, vib, buzz]) n.start(t0);
    this.nodes = [src, vib, buzz];
    this.src = src;
    this.gain = gn;
    this.buzz = buzz;
  }

  /** Gas left, 0 to 1: the pitch sinks as it runs out. */
  set(level: number): void {
    const g = graph();
    if (!g || !this.src) return;
    const t = g.ctx.currentTime;
    this.src.frequency.setTargetAtTime(this.base * (0.7 + 0.3 * level), t, 0.1);
    this.buzz?.frequency.setTargetAtTime(10 + 18 * level, t, 0.2);
  }

  /** Ends with "pt pt pfft". */
  stop(): void {
    const g = graph();
    if (!g || !this.src || !this.gain) return;
    const c = g.ctx;
    const t = c.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(0.0001, t, 0.04);
    for (const n of this.nodes) n.stop(t + 0.3);
    this.nodes = [];
    this.src = null;
    this.gain = null;
    this.buzz = null;
    hiss(0.03, { gain: 0.12, freq: 1600, q: 1.5, at: 0.08 });
    hiss(0.03, { gain: 0.1, freq: 1700, q: 1.5, at: 0.2 });
    hiss(0.22, { gain: 0.08, freq: 900, sweep: 300, q: 0.6, at: 0.32 });
  }

  get on(): boolean {
    return !!this.src;
  }
}

/** The library squeeze: a quiet pfffff and a faint high squeal. */
export class SqueezeHiss {
  private src: AudioBufferSourceNode | null = null;
  private squeal: OscillatorNode | null = null;
  private gain: GainNode | null = null;

  start(): void {
    const g = graph();
    if (!g || this.src) return;
    const c = g.ctx;
    const t0 = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = g.noise;
    s.loop = true;
    const f = bp(c, 2200, 1.2);
    const q = osc(c, 'sine', 2900, t0);
    const qg = c.createGain();
    qg.gain.value = 0.012;
    const gn = c.createGain();
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(0.05, t0 + 0.15);
    s.connect(f).connect(gn).connect(g.out);
    q.connect(qg).connect(gn);
    s.start(t0);
    q.start(t0);
    this.src = s;
    this.squeal = q;
    this.gain = gn;
  }

  stop(): void {
    const g = graph();
    if (!g || !this.src || !this.gain) return;
    const t = g.ctx.currentTime;
    this.gain.gain.setTargetAtTime(0.0001, t, 0.05);
    this.src.stop(t + 0.3);
    this.squeal?.stop(t + 0.3);
    this.src = null;
    this.squeal = null;
    this.gain = null;
  }
}

// ---------------------------------------------------------------------------
// Feel

export const fx = {
  eep(): void {
    beep(880, 0.12, { type: 'triangle', gain: 0.1, slide: 0.7 });
    hiss(0.05, { gain: 0.05, freq: 2000, at: 0.1 });
  },
  rumble(): void {
    if (!gate('rumble', 600)) return;
    const g = graph();
    if (!g) return;
    const c = g.ctx;
    const t0 = c.currentTime;
    const v = osc(c, 'sine', 60, t0);
    v.frequency.linearRampToValueAtTime(48, t0 + 0.7);
    const w = osc(c, 'sine', 7, t0);
    const wa = c.createGain();
    wa.gain.value = 10;
    w.connect(wa).connect(v.frequency);
    const gn = c.createGain();
    env(gn, t0, 0.25, 0.05, 0.7, 0.3);
    v.connect(gn).connect(g.out);
    v.start(t0);
    w.start(t0);
    v.stop(t0 + 0.75);
    w.stop(t0 + 0.75);
    hiss(0.6, { gain: 0.05, freq: 200, sweep: 500, q: 2 });
  },
  nom(): void {
    for (let i = 0; i < 3; i++) {
      beep(300 + i * 30, 0.07, { type: 'square', gain: 0.05, at: i * 0.13, slide: 0.8 });
      hiss(0.04, { gain: 0.05, freq: 1500, at: i * 0.13 + 0.03 });
    }
  },
  gulp(): void {
    beep(500, 0.12, { type: 'sine', gain: 0.12, slide: 0.5 });
    for (let i = 0; i < 4; i++) beep(900 + Math.random() * 900, 0.04, { type: 'sine', gain: 0.05, at: 0.12 + i * 0.05, slide: 1.4 });
  },
  /** The charging whistle: follow the charge with `level`. */
  chargeStart(): ChargeWhistle {
    return new ChargeWhistle();
  },
  slideUp(): void {
    beep(500, 0.55, { type: 'sine', gain: 0.07, slide: 4 });
    hiss(0.6, { gain: 0.09, freq: 500, sweep: 2600, q: 0.7 });
  },
  boing(height: number): void {
    if (!gate('boing', 90)) return;
    const f = 160 + Math.min(1, height / 10) * 160;
    const g = graph();
    if (!g) return;
    const c = g.ctx;
    const t0 = c.currentTime;
    const v = osc(c, 'triangle', f, t0);
    v.frequency.exponentialRampToValueAtTime(f * 2.2, t0 + 0.18);
    const w = osc(c, 'sine', 22, t0);
    const wa = c.createGain();
    wa.gain.value = f * 0.12;
    w.connect(wa).connect(v.frequency);
    const gn = c.createGain();
    env(gn, t0, 0.18, 0.004, 0.35, 0.25);
    v.connect(gn).connect(g.out);
    v.start(t0);
    w.start(t0);
    v.stop(t0 + 0.4);
    w.stop(t0 + 0.4);
  },
  oof(): void {
    beep(140, 0.2, { gain: 0.22, slide: 0.5 });
    hiss(0.12, { gain: 0.1, freq: 500, q: 0.6 });
    beep(260, 0.1, { type: 'triangle', gain: 0.06, at: 0.05, slide: 0.7 });
  },
  crumb(n: number): void {
    const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
    const f = 660 * Math.pow(2, scale[Math.min(scale.length - 1, n)] / 12);
    beep(f, 0.16, { type: 'triangle', gain: 0.09 });
    beep(f * 2, 0.1, { type: 'sine', gain: 0.04, at: 0.03 });
  },
  chime(i: number): void {
    const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21];
    const f = 523 * Math.pow(2, scale[Math.min(scale.length - 1, i)] / 12);
    beep(f, 0.4, { type: 'triangle', gain: 0.13 });
    beep(f * 1.5, 0.3, { type: 'sine', gain: 0.06, at: 0.05 });
  },
  ding(): void {
    beep(1320, 0.4, { gain: 0.12 });
    beep(1980, 0.3, { gain: 0.05, at: 0.04 });
  },
  scribble(): void {
    for (let i = 0; i < 5; i++) hiss(0.05, { gain: 0.05, freq: 3000 + Math.random() * 2000, q: 3, at: i * 0.05 });
  },
  bean(): void {
    beep(988, 0.12, { type: 'triangle', gain: 0.12 });
    beep(1318, 0.18, { type: 'triangle', gain: 0.12, at: 0.09 });
    beep(1976, 0.3, { type: 'sine', gain: 0.08, at: 0.18 });
  },
  ooh(): void {
    const g = graph();
    if (!g) return;
    for (let k = 0; k < 4; k++) say('ooh', 160 + k * 37, { at: k * 0.02, gain: 0.04, vowel: 'oo', len: 0.6 });
  },
  cheer(): void {
    hiss(1.4, { gain: 0.08, freq: 1400, q: 0.5, attack: 0.15 });
    for (let k = 0; k < 6; k++) say('yay', 220 + Math.random() * 200, { at: Math.random() * 0.5, gain: 0.035, vowel: 'ay', len: 0.3 });
  },
  fanfare(): void {
    const notes = [523, 659, 784, 1046, 784, 1046];
    const times = [0, 0.12, 0.24, 0.36, 0.6, 0.72];
    notes.forEach((f, i) => {
      beep(f, i === 5 ? 0.8 : 0.2, { type: 'sawtooth', gain: 0.06, at: times[i] });
      beep(f / 2, i === 5 ? 0.8 : 0.2, { type: 'square', gain: 0.03, at: times[i] });
    });
  },
  sadTrombone(): void {
    [311, 294, 277, 262].forEach((f, i) => toot({ gas: 'beans', size: 'note', voice: 'trombone', pitch: f, dur: i === 3 ? 1.1 : 0.42, at: i * 0.45, gain: 0.7, extras: false }));
  },
  dunDun(): void {
    beep(196, 0.25, { type: 'sawtooth', gain: 0.08 });
    beep(185, 0.25, { type: 'sawtooth', gain: 0.08, at: 0.3 });
    beep(147, 1.1, { type: 'sawtooth', gain: 0.09, at: 0.6 });
    beep(73, 1.1, { type: 'sine', gain: 0.16, at: 0.6 });
  },
  whistle(): void {
    if (!gate('whistle', 400)) return;
    const g = graph();
    if (!g) return;
    const c = g.ctx;
    const t0 = c.currentTime;
    const v = osc(c, 'sine', 2800, t0);
    const tr = osc(c, 'square', 28, t0);
    const ta = c.createGain();
    ta.gain.value = 120;
    tr.connect(ta).connect(v.frequency);
    const gn = c.createGain();
    env(gn, t0, 0.08, 0.01, 0.6, 0.1);
    v.connect(gn).connect(g.out);
    v.start(t0);
    tr.start(t0);
    v.stop(t0 + 0.62);
    tr.stop(t0 + 0.62);
  },
  /** FM church bell with inharmonic partials. */
  bell(big = true): void {
    if (!gate('bell', 300)) return;
    const g = graph();
    if (!g) return;
    const c = g.ctx;
    const t0 = c.currentTime;
    const base = big ? 220 : 330;
    for (const [k, a, d] of [[0.5, 0.3, 4], [1, 0.35, 3.5], [1.19, 0.18, 2.5], [1.56, 0.14, 2], [2, 0.12, 1.6], [2.74, 0.08, 1.1], [3.76, 0.05, 0.8]] as const) {
      const v = osc(c, 'sine', base * k, t0);
      const gn = c.createGain();
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(a * (big ? 0.5 : 0.3), t0 + 0.004);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      v.connect(gn).connect(g.out);
      v.start(t0);
      v.stop(t0 + d + 0.05);
    }
  },
  /** The grandfather clock's BONG. */
  bong(): void {
    const g = graph();
    if (!g) return;
    const c = g.ctx;
    const t0 = c.currentTime;
    for (const [k, a, d] of [[1, 0.4, 2.6], [2.02, 0.18, 1.8], [2.92, 0.1, 1.2], [4.1, 0.05, 0.8]] as const) {
      const v = osc(c, 'sine', 146 * k, t0);
      const gn = c.createGain();
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(a * 0.6, t0 + 0.006);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      v.connect(gn).connect(g.out);
      v.start(t0);
      v.stop(t0 + d + 0.05);
    }
  },
  tick(): void {
    hiss(0.02, { gain: 0.05, freq: 4200, q: 6 });
  },
  clank(): void {
    beep(180, 0.35, { type: 'square', gain: 0.05, slide: 0.9 });
    beep(410, 0.25, { type: 'triangle', gain: 0.07, slide: 0.95 });
    hiss(0.15, { gain: 0.1, freq: 2600, q: 4 });
  },
  shudder(): void {
    for (let i = 0; i < 6; i++) hiss(0.04, { gain: 0.03, freq: 900, q: 3, at: i * 0.07 });
  },
  thunk(): void {
    beep(110, 0.15, { gain: 0.25, slide: 0.5 });
    hiss(0.06, { gain: 0.1, freq: 600, q: 1 });
  },
  squeak(): void {
    if (!gate('squeak', 260)) return;
    beep(1700 + Math.random() * 300, 0.09, { type: 'triangle', gain: 0.025, slide: 1.2 });
  },
  tink(): void {
    beep(2600 + Math.random() * 400, 0.25, { type: 'sine', gain: 0.08 });
    beep(3900, 0.15, { type: 'sine', gain: 0.03, at: 0.01 });
  },
  tin(): void {
    if (!gate('tin', 35)) return;
    beep(900 + Math.random() * 500, 0.18, { type: 'triangle', gain: 0.06, slide: 0.95 });
    hiss(0.06, { gain: 0.05, freq: 4000, q: 3 });
  },
  clonk(): void {
    beep(320 + Math.random() * 80, 0.12, { type: 'triangle', gain: 0.12, slide: 0.7 });
    hiss(0.04, { gain: 0.06, freq: 1800, q: 2 });
  },
  thock(): void {
    beep(240, 0.08, { type: 'triangle', gain: 0.1, slide: 0.6 });
  },
  flap(): void {
    if (!gate('flap', 120)) return;
    for (let i = 0; i < 8; i++) hiss(0.05, { gain: 0.05, freq: 700 + Math.random() * 400, q: 0.8, at: i * 0.06 + Math.random() * 0.03 });
  },
  coo(): void {
    if (!gate('coo', 1800)) return;
    beep(420, 0.2, { type: 'sine', gain: 0.05, slide: 0.85 });
    beep(380, 0.3, { type: 'sine', gain: 0.05, at: 0.24, slide: 0.8 });
  },
  quack(): void {
    if (!gate('quack', 250)) return;
    say('quack', 520, { vowel: 'a', gain: 0.06, len: 0.14 });
  },
  splash(): void {
    if (!gate('splash', 200)) return;
    hiss(0.4, { gain: 0.12, freq: 1800, sweep: 600, q: 0.6 });
    hiss(0.15, { gain: 0.08, freq: 400, q: 0.8 });
  },
  bubbles(n = 5): void {
    for (let i = 0; i < n; i++) beep(500 + Math.random() * 700, 0.06, { type: 'sine', gain: 0.05, at: i * 0.08 + Math.random() * 0.05, slide: 1.8 });
  },
  pop(): void {
    beep(1400, 0.05, { type: 'sine', gain: 0.07, slide: 0.4 });
  },
  whoosh(): void {
    hiss(0.7, { gain: 0.08, freq: 400, sweep: 1600, q: 0.5 });
  },
  shh(): void {
    hiss(0.9, { gain: 0.16, freq: 3800, q: 0.8, attack: 0.06 });
  },
  strike(): void {
    beep(120, 0.3, { type: 'square', gain: 0.07, slide: 0.8 });
  },
  bonk(): void {
    beep(150, 0.18, { type: 'square', gain: 0.07, slide: 0.6 });
  },
  click(): void {
    beep(1400, 0.035, { type: 'triangle', gain: 0.05 });
  },
};

/** The rising slide whistle and rattle while charging a big one. */
export class ChargeWhistle {
  private v: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private rattle: AudioBufferSourceNode | null = null;
  private dinged = false;

  constructor() {
    const g = graph();
    if (!g) return;
    const c = g.ctx;
    const t0 = c.currentTime;
    this.v = osc(c, 'sine', 380, t0);
    this.gain = c.createGain();
    this.gain.gain.setValueAtTime(0.0001, t0);
    this.gain.gain.exponentialRampToValueAtTime(0.05, t0 + 0.08);
    this.v.connect(this.gain).connect(g.out);
    this.v.start(t0);
    const r = c.createBufferSource();
    r.buffer = g.noise;
    r.loop = true;
    const rf = bp(c, 1200, 2);
    const am = c.createGain();
    am.gain.value = 0;
    const lfo = osc(c, 'square', 18, t0);
    const la = c.createGain();
    la.gain.value = 0.03;
    lfo.connect(la).connect(am.gain);
    r.connect(rf).connect(am).connect(g.out);
    r.start(t0);
    lfo.start(t0);
    this.rattle = r;
    (r as unknown as { lfo: OscillatorNode }).lfo = lfo;
  }

  level(x: number): void {
    const g = graph();
    if (!g || !this.v) return;
    this.v.frequency.setTargetAtTime(380 + x * 1100, g.ctx.currentTime, 0.04);
    if (x >= 1 && !this.dinged) {
      this.dinged = true;
      fx.ding();
    }
  }

  stop(): void {
    const g = graph();
    if (!g) return;
    const t = g.ctx.currentTime;
    this.gain?.gain.setTargetAtTime(0.0001, t, 0.02);
    this.v?.stop(t + 0.1);
    if (this.rattle) {
      this.rattle.stop(t + 0.05);
      (this.rattle as unknown as { lfo: OscillatorNode }).lfo.stop(t + 0.05);
    }
    this.v = null;
    this.rattle = null;
  }
}

// ---------------------------------------------------------------------------
// Gibberish voices

const VOWELS: Record<string, [number, number]> = { a: [800, 1200], e: [500, 1900], i: [320, 2300], o: [500, 900], u: [350, 800], oo: [320, 800], ay: [650, 1700] };

/** Animal-Crossing style babble: `text` sets the syllable count. */
export function say(text: string, pitch: number, o: { at?: number; gain?: number; vowel?: keyof typeof VOWELS; len?: number; fall?: number } = {}): void {
  const g = graph();
  if (!g) return;
  if (!gate(`say-${pitch | 0}`, 150) && !o.at) return;
  const c = g.ctx;
  const syllables = Math.max(1, Math.min(7, Math.round(text.replace(/[^a-z]/gi, '').length / 3)));
  const keys = Object.keys(VOWELS);
  let t = c.currentTime + (o.at ?? 0);
  let p = pitch;
  for (let i = 0; i < syllables; i++) {
    const len = o.len ?? 0.075 + Math.random() * 0.04;
    const v = VOWELS[o.vowel ?? keys[Math.floor(Math.random() * keys.length)]];
    const src = osc(c, 'sawtooth', p, t);
    if (o.fall) src.frequency.exponentialRampToValueAtTime(p * o.fall, t + len);
    const f1 = bp(c, v[0], 5);
    const f2 = bp(c, v[1], 6);
    const gn = c.createGain();
    env(gn, t, o.gain ?? 0.07, 0.01, len, len * 0.4);
    src.connect(f1).connect(gn);
    src.connect(f2).connect(gn);
    gn.connect(g.out);
    src.start(t);
    src.stop(t + len + 0.02);
    t += len + 0.025;
    p *= 0.92 + Math.random() * 0.18;
  }
}

export const voices = {
  gasp(pitch: number): void {
    hiss(0.18, { gain: 0.06, freq: 1800, sweep: 3200, q: 0.8 });
    say('oh', pitch * 1.3, { at: 0.2, vowel: 'o', gain: 0.08, len: 0.18, fall: 0.8 });
  },
  peeyew(pitch: number): void {
    say('pee', pitch * 1.6, { vowel: 'i', gain: 0.07, len: 0.16 });
    say('yew', pitch * 1.5, { vowel: 'u', gain: 0.07, len: 0.34, fall: 0.6, at: 0.2 });
  },
  giggle(pitch: number): void {
    for (let i = 0; i < 4; i++) say('hee', pitch * (1.2 + i * 0.08), { vowel: 'i', gain: 0.05, len: 0.07, at: i * 0.11 });
  },
  shout(pitch: number, text: string): void {
    say(text, pitch, { gain: 0.08 });
  },
  sniff(): void {
    hiss(0.08, { gain: 0.05, freq: 2400, q: 1, at: 0 });
    hiss(0.08, { gain: 0.05, freq: 2600, q: 1, at: 0.14 });
  },
  snore(): void {
    if (!gate('snore', 2500)) return;
    hiss(0.9, { gain: 0.05, freq: 180, sweep: 260, q: 3, attack: 0.3 });
  },
  sneeze(): void {
    say('ahh', 260, { vowel: 'a', gain: 0.06, len: 0.3, at: 0 });
    say('ahh', 300, { vowel: 'a', gain: 0.07, len: 0.3, at: 0.5 });
    hiss(0.25, { gain: 0.3, freq: 3000, q: 0.6, at: 1.4 });
    say('choo', 380, { vowel: 'oo', gain: 0.1, len: 0.2, at: 1.42 });
  },
};
