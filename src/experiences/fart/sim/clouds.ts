// Clouds as volumes: they grow, drift on the wind (and the library's fans),
// fade, and carry stink. People sample them to decide when to say "Pee-yew!".

import type { Gas } from './gas';
import { GAS } from './gas';

export type CloudGas = Gas | 'squeeze' | 'golden';

export interface Cloud {
  id: number;
  gas: CloudGas;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  /** Radius it grows to. */
  r1: number;
  age: number;
  life: number;
  /** Stink strength at the centre, 0 to 1. */
  stink: number;
  seed: number;
}

export type Field = (x: number, y: number, z: number) => { x: number; y: number; z: number };

const STINK: Record<CloudGas, { stink: number; life: number; r1: number }> = {
  beans: { stink: GAS.beans.stink, life: GAS.beans.stinkLife, r1: 1.3 },
  fizzy: { stink: GAS.fizzy.stink, life: GAS.fizzy.stinkLife, r1: 0.8 },
  cabbage: { stink: GAS.cabbage.stink, life: GAS.cabbage.stinkLife, r1: 2.2 },
  squeeze: { stink: 0.7, life: 10, r1: 1.6 },
  golden: { stink: 0, life: 3, r1: 1.6 },
};

export const MAX_CLOUDS = 48;

export class Clouds {
  list: Cloud[] = [];
  /** The wind, m/s. */
  wind = { x: 0, z: 0 };
  /** Extra air movement (fans, an open window). */
  fields: Field[] = [];
  private next = 1;

  /** A toot cloud. `big` grows it (rockets, cabbage). */
  add(gas: CloudGas, x: number, y: number, z: number, opts: { big?: number; vx?: number; vy?: number; vz?: number; stink?: number; life?: number } = {}): Cloud {
    const s = STINK[gas];
    const big = opts.big ?? 1;
    const c: Cloud = {
      id: this.next++,
      gas,
      x,
      y,
      z,
      vx: opts.vx ?? 0,
      vy: opts.vy ?? 0.25,
      vz: opts.vz ?? 0,
      r: 0.25,
      r1: s.r1 * big,
      age: 0,
      life: (opts.life ?? s.life) * Math.sqrt(big),
      stink: opts.stink ?? s.stink,
      seed: (this.next * 7919) % 1000,
    };
    this.list.push(c);
    if (this.list.length > MAX_CLOUDS) this.list.shift();
    return c;
  }

  step(dt: number): void {
    for (const c of this.list) {
      c.age += dt;
      const t = c.age / c.life;
      c.r += (c.r1 - c.r) * (1 - Math.exp(-3 * dt));
      // Drift: wind plus fields, with the cloud's own push dying away.
      let ax = this.wind.x;
      let ay = 0;
      let az = this.wind.z;
      for (const f of this.fields) {
        const v = f(c.x, c.y, c.z);
        ax += v.x;
        ay += v.y;
        az += v.z;
      }
      const k = 1 - Math.exp(-1.6 * dt);
      c.vx += (ax - c.vx) * k;
      c.vz += (az - c.vz) * k;
      c.vy += (ay + 0.08 - c.vy) * k;
      c.x += c.vx * dt;
      c.y = Math.max(c.r * 0.5, c.y + c.vy * dt);
      c.z += c.vz * dt;
      // Clouds slowly sink toward head height, then hold.
      if (c.y > 1.6 && t > 0.2 && c.gas !== 'golden') c.y -= dt * 0.15;
      if (t > 1) c.age = c.life;
    }
    this.list = this.list.filter((c) => c.age < c.life);
  }

  /** How strong the stink is at a point, 0 to about 1. */
  stinkAt(x: number, y: number, z: number): number {
    let s = 0;
    for (const c of this.list) {
      if (c.stink <= 0) continue;
      const d = Math.hypot(c.x - x, (c.y - y) * 0.6, c.z - z);
      const reach = c.r * 1.25;
      if (d > reach) continue;
      const fade = 1 - Math.pow(c.age / c.life, 2);
      s += c.stink * (1 - d / reach) * fade;
    }
    return s;
  }

  /** The cloud whose stink reaches a point most, for blame. */
  strongestAt(x: number, y: number, z: number): Cloud | null {
    let best: Cloud | null = null;
    let bs = 0;
    for (const c of this.list) {
      const d = Math.hypot(c.x - x, (c.y - y) * 0.6, c.z - z);
      const reach = c.r * 1.25;
      if (d > reach || c.stink <= 0) continue;
      const s = c.stink * (1 - d / reach);
      if (s > bs) {
        bs = s;
        best = c;
      }
    }
    return best;
  }

  clear(): void {
    this.list = [];
  }
}
