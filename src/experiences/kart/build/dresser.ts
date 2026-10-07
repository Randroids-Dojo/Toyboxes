// Placement help for dressing a circuit: keeps every prop clear of the road
// (4 m of run-off beyond the curb), of the paddock and of other props, and
// finds the outside of corners and open patches of infield.

import * as THREE from 'three';
import { box, circle, type Collider } from '../../../world/physics';
import { EDGE, type Circuit } from '../circuit';
import type { PaddockBuild } from './paddock';
import { Batch, type Finish, type Shape, xform } from './shape';

export interface Spot {
  x: number;
  z: number;
  r: number;
}

export class Dresser {
  readonly taken: Spot[] = [];

  constructor(
    readonly c: Circuit,
    readonly batch: Batch,
    readonly group: THREE.Group,
    readonly colliders: Collider[],
    readonly paddock: PaddockBuild,
  ) {
    // The paddock and its approach are off limits.
    for (let u = -36; u <= 36; u += 8) for (let v = 12; v <= 44; v += 8) {
      const q = c.pad(u, v);
      this.taken.push({ x: q.x, z: q.z, r: 6 });
    }
  }

  /** Clear of the road by `road` metres beyond the curb, and of everything placed. */
  free(x: number, z: number, r: number, road = 4): boolean {
    if (this.c.roadClearance(x, z) < r + road) return false;
    const b = this.c.bounds;
    const m = (this.c.def?.bounds ?? 30) - 3;
    if (x < b.minX - m + r || x > b.maxX + m - r || z < b.minZ - m + r || z > b.maxZ + m - r) return false;
    return this.taken.every((o) => Math.hypot(o.x - x, o.z - z) >= o.r + r);
  }

  claim(x: number, z: number, r: number): void {
    this.taken.push({ x, z, r });
  }

  /** A point beyond the edge at s: side 1 left, -1 right, `gap` metres past the curb. */
  beside(s: number, side: number, gap: number): { x: number; z: number; yaw: number } {
    const q = this.c.at(s, side * (EDGE + gap));
    // Face the road.
    const f = this.c.frame(s);
    return { x: q.x, z: q.z, yaw: Math.atan2(-f.nx * side, -f.nz * side) };
  }

  /** The outside of the road at s: away from the way it turns. */
  outsideSide(s: number): number {
    const turn = this.c.path.turnAhead(s - 6, 12);
    if (Math.abs(turn) > 0.05) return turn > 0 ? -1 : 1;
    return this.c.paddock.side === 1 ? -1 : 1;
  }

  /** Places a shape with a collider of radius r (or none), if it fits. */
  place(shape: Shape, x: number, z: number, yaw: number, r: number, opts: { road?: number; collide?: number; finish?: Finish; cast?: boolean; scale?: number; force?: boolean } = {}): boolean {
    if (!opts.force && !this.free(x, z, r, opts.road ?? 4)) return false;
    this.claim(x, z, r);
    const sc = opts.scale ?? 1;
    this.batch.shape(shape, xform(x, 0, z, 0, yaw, 0, sc, sc, sc), opts.finish ?? 'plastic', { cast: opts.cast ?? true });
    if (opts.collide !== 0) this.colliders.push(circle(x, z, opts.collide ?? r * 0.8, 3, 0.4, (opts.collide ?? r) > 1.5));
    return true;
  }

  /** A box collider in world space. */
  wallBox(x: number, z: number, hw: number, hd: number, yaw: number, h: number, camera = true): void {
    this.colliders.push(box(x, z, hw, hd, yaw, h, 0.3, camera));
  }

  /** Open spots in the infield (or anywhere) with at least `clear` metres to the road. */
  openSpots(clear: number, step = 6, inside: boolean | null = true): { x: number; z: number; clear: number }[] {
    const b = this.c.bounds;
    const out: { x: number; z: number; clear: number }[] = [];
    for (let x = b.minX; x <= b.maxX; x += step)
      for (let z = b.minZ; z <= b.maxZ; z += step) {
        if (inside !== null && this.c.inside(x, z) !== inside) continue;
        const d = this.c.roadClearance(x, z);
        if (d >= clear && this.taken.every((o) => Math.hypot(o.x - x, o.z - z) >= o.r + clear * 0.5)) out.push({ x, z, clear: d });
      }
    return out.sort((a, b2) => b2.clear - a.clear);
  }
}
