// Things a toot can knock about: the tower of bean tins, teacups, the
// Mayor's hat, garden gnomes and the washing. Simple tumbling bodies that
// bounce and settle; deterministic for a given seed.

import type { Rng } from './rng';

export interface Body {
  id: number;
  kind: 'tin' | 'cup' | 'hat' | 'gnome' | 'laundry';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Rotation (Euler) and spin. */
  rx: number;
  ry: number;
  rz: number;
  wx: number;
  wy: number;
  wz: number;
  r: number;
  /** Resting on something. */
  rest: boolean;
  /** Seconds since it last moved (for clean-up and resets). */
  still: number;
  /** Falls slowly and sways (washing, hats). */
  floaty: boolean;
  /** Variant index for colours and shapes. */
  v: number;
  /** Hidden (picked up, reset). */
  gone: boolean;
}

export type FloorFn = (x: number, z: number, y: number) => number;

export const GRAV = 18;

export class Bodies {
  list: Body[] = [];
  private next = 1;

  add(kind: Body['kind'], x: number, y: number, z: number, r: number, v = 0, floaty = false): Body {
    const b: Body = { id: this.next++, kind, x, y, z, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, r, rest: true, still: 0, floaty, v, gone: false };
    this.list.push(b);
    return b;
  }

  /** Pushes everything within `radius` of a point outward and up. Returns how many moved. */
  blast(x: number, y: number, z: number, radius: number, strength: number, rng: Rng, kinds?: Body['kind'][]): number {
    let n = 0;
    for (const b of this.list) {
      if (b.gone || (kinds && !kinds.includes(b.kind))) continue;
      const dx = b.x - x;
      const dy = b.y - y;
      const dz = b.z - z;
      const d = Math.hypot(dx, dy * 0.6, dz);
      if (d > radius) continue;
      const k = strength * (1 - d / radius) + strength * 0.25;
      const h = Math.hypot(dx, dz) || 1;
      b.vx += (dx / h) * k + (rng() - 0.5) * 1.2;
      b.vz += (dz / h) * k + (rng() - 0.5) * 1.2;
      b.vy += 2.5 + k * 0.6 + rng() * 1.5;
      b.wx += (rng() - 0.5) * 14;
      b.wy += (rng() - 0.5) * 10;
      b.wz += (rng() - 0.5) * 14;
      b.rest = false;
      b.still = 0;
      n++;
    }
    return n;
  }

  step(dt: number, floor: FloorFn): { landed: Body[] } {
    const landed: Body[] = [];
    for (const b of this.list) {
      if (b.gone) continue;
      if (b.rest) {
        b.still += dt;
        // Something underneath went away (a tin below was knocked out).
        const f = floor(b.x, b.z, b.y + 0.05);
        if (b.y - b.r > f + 0.02) b.rest = false;
        else continue;
      }
      const g = b.floaty ? GRAV * 0.18 : GRAV;
      b.vy -= g * dt;
      if (b.floaty) {
        const drag = Math.exp(-1.6 * dt);
        b.vx *= drag;
        b.vz *= drag;
        b.vy = Math.max(b.vy, -1.8);
        b.rz = Math.sin(b.still * 3 + b.id) * 0.5;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.rx += b.wx * dt;
      b.ry += b.wy * dt;
      b.rz += b.wz * dt;
      b.still += dt;
      const f = floor(b.x, b.z, b.y + 0.3);
      if (b.y - b.r <= f) {
        b.y = f + b.r;
        if (b.vy < -2.2 && !b.floaty) {
          b.vy = -b.vy * 0.35;
          b.vx *= 0.6;
          b.vz *= 0.6;
          b.wx *= 0.6;
          b.wz *= 0.6;
          landed.push(b);
        } else {
          if (!b.rest) landed.push(b);
          b.vy = 0;
          b.vx *= 0.7;
          b.vz *= 0.7;
          if (Math.hypot(b.vx, b.vz) < 0.3) {
            b.rest = true;
            b.vx = b.vz = 0;
            b.wx = b.wy = b.wz = 0;
            // Lie on a side.
            b.rx = Math.round(b.rx / (Math.PI / 2)) * (Math.PI / 2);
            b.rz = Math.round(b.rz / (Math.PI / 2)) * (Math.PI / 2);
            b.still = 0;
          }
        }
      }
    }
    return { landed };
  }

  remove(b: Body): void {
    b.gone = true;
  }
}

/** The pyramid of bean tins on Gran's side table: 5, 4, 3, 2, 1. */
export function tinPyramid(cx: number, top: number, cz: number, r = 0.11, h = 0.24): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (let row = 0; row < 5; row++) {
    const n = 5 - row;
    for (let i = 0; i < n; i++) out.push({ x: cx, y: top + h / 2 + row * h, z: cz + (i - (n - 1) / 2) * r * 2.05 });
  }
  return out;
}
