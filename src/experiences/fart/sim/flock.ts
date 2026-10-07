// Pigeons and ducks. Pigeons peck about on the ground, burst up when a toot
// is close, circle the village and land again. Ducks paddle and scoot away.

import type { Rng } from './rng';

export interface BirdState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  vx: number;
  vy: number;
  vz: number;
  mode: 'peck' | 'walk' | 'fly' | 'land';
  t: number;
  /** Home spot to land back near. */
  hx: number;
  hz: number;
  phase: number;
  peck: number;
}

export class Flock {
  readonly birds: BirdState[] = [];

  constructor(
    centre: { x: number; z: number },
    count: number,
    private spread: number,
    private rng: Rng,
  ) {
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * spread;
      const x = centre.x + Math.cos(a) * r;
      const z = centre.z + Math.sin(a) * r;
      this.birds.push({ x, y: 0, z, yaw: rng() * 6.28, vx: 0, vy: 0, vz: 0, mode: 'peck', t: rng() * 2, hx: x, hz: z, phase: rng() * 6, peck: 0 });
    }
  }

  /** Startles every bird within `radius`. Returns how many took off. */
  scatter(x: number, z: number, radius: number): number {
    let n = 0;
    for (const b of this.birds) {
      if (b.mode === 'fly') continue;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d > radius) continue;
      n++;
      b.mode = 'fly';
      b.t = 0;
      const a = Math.atan2(b.z - z, b.x - x) + (this.rng() - 0.5) * 0.8;
      b.vx = Math.cos(a) * (3 + this.rng() * 2);
      b.vz = Math.sin(a) * (3 + this.rng() * 2);
      b.vy = 5 + this.rng() * 2;
    }
    return n;
  }

  get flying(): number {
    return this.birds.filter((b) => b.mode === 'fly' || b.mode === 'land').length;
  }

  step(dt: number): void {
    for (const b of this.birds) {
      b.t += dt;
      b.phase += dt * (b.mode === 'fly' ? 18 : 8);
      if (b.mode === 'fly') {
        // Climb, then circle the home spot widely.
        const cx = b.hx;
        const cz = b.hz;
        const dx = b.x - cx;
        const dz = b.z - cz;
        const r = Math.hypot(dx, dz) || 1;
        const tx = -dz / r;
        const tz = dx / r;
        const want = 6;
        const k = 1 - Math.exp(-1.5 * dt);
        b.vx += (tx * want + (-dx / r) * (r - 7) * 0.3 - b.vx) * k;
        b.vz += (tz * want + (-dz / r) * (r - 7) * 0.3 - b.vz) * k;
        b.vy += ((b.y < 6 ? 2.5 : 0) - b.vy) * k;
        if (b.t > 6) b.mode = 'land';
      } else if (b.mode === 'land') {
        const dx = b.hx - b.x;
        const dz = b.hz - b.z;
        const d = Math.hypot(dx, dz);
        const k = 1 - Math.exp(-2 * dt);
        b.vx += ((dx / Math.max(d, 0.5)) * Math.min(5, d * 1.5) - b.vx) * k;
        b.vz += ((dz / Math.max(d, 0.5)) * Math.min(5, d * 1.5) - b.vz) * k;
        b.vy += ((-b.y * 1.2) - b.vy) * k;
        if (b.y < 0.05 && d < 0.6) {
          b.mode = 'peck';
          b.y = 0;
          b.vx = b.vy = b.vz = 0;
          b.t = 0;
        }
      } else {
        // Peck about.
        if (b.mode === 'walk') {
          b.x += Math.sin(b.yaw) * 0.35 * dt;
          b.z += Math.cos(b.yaw) * 0.35 * dt;
          if (b.t > 1.2) {
            b.mode = 'peck';
            b.t = 0;
          }
        } else if (b.t > 1.5 + this.rng() * 2) {
          b.mode = 'walk';
          b.t = 0;
          const back = Math.hypot(b.x - b.hx, b.z - b.hz) > this.spread * 0.4;
          b.yaw = back ? Math.atan2(b.hx - b.x, b.hz - b.z) : this.rng() * 6.28;
        }
        b.peck = b.mode === 'peck' ? Math.max(0, Math.sin(b.t * 9)) : 0;
        continue;
      }
      b.x += b.vx * dt;
      b.y = Math.max(0, b.y + b.vy * dt);
      b.z += b.vz * dt;
      if (Math.hypot(b.vx, b.vz) > 0.3) b.yaw = Math.atan2(b.vx, b.vz);
      b.peck = 0;
    }
  }
}

export interface Duck {
  x: number;
  z: number;
  yaw: number;
  a: number;
  r: number;
  cx: number;
  cz: number;
  panic: number;
  peck: number;
}

/** Ducks paddle round a pond; a toot sends them scooting and quacking. */
export class Ducks {
  readonly ducks: Duck[] = [];
  constructor(cx: number, cz: number, radius: number, n: number, rng: Rng) {
    for (let i = 0; i < n; i++) this.ducks.push({ x: cx, z: cz, yaw: 0, a: rng() * 6.28, r: radius * (0.4 + rng() * 0.45), cx, cz, panic: 0, peck: 0 });
  }

  startle(x: number, z: number, radius: number): number {
    let n = 0;
    for (const d of this.ducks) if (Math.hypot(d.x - x, d.z - z) < radius) {
      d.panic = 2;
      n++;
    }
    return n;
  }

  step(dt: number, t: number): void {
    for (const d of this.ducks) {
      d.panic = Math.max(0, d.panic - dt);
      d.a += dt * (0.25 + d.panic * 1.2);
      const nx = d.cx + Math.cos(d.a) * d.r;
      const nz = d.cz + Math.sin(d.a) * d.r;
      d.yaw = Math.atan2(nx - d.x, nz - d.z);
      d.x = nx;
      d.z = nz;
      d.peck = Math.max(0, Math.sin(t * 0.7 + d.r * 5) * 2 - 1.6);
    }
  }
}
