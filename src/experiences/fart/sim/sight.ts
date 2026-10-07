// Sight lines in the village: tall things (buildings, the tower, kiosks)
// block who can see whom. Pure, for the townsfolk brains and the tests.

import { villageBoxes, villageCircles } from '../layout';

export interface Blocker {
  kind: 'box' | 'circle';
  x: number;
  z: number;
  hw: number;
  hd: number;
  r: number;
  rot: number;
}

/** Tall things that block sight lines (buildings, the tower, kiosks). */
export function blockers(): Blocker[] {
  const out: Blocker[] = [];
  for (const b of villageBoxes()) if (b.h > 1.9 && b.h < 30 && !b.id.includes('-wall-')) out.push({ kind: 'box', x: b.x, z: b.z, hw: b.hw, hd: b.hd, r: 0, rot: b.rot ?? 0 });
  for (const c of villageCircles()) if (c.h > 1.9 && c.r > 0.4) out.push({ kind: 'circle', x: c.x, z: c.z, hw: 0, hd: 0, r: c.r, rot: 0 });
  return out;
}

/** Does the segment from a to b pass through a blocker? */
export function segmentBlocked(list: Blocker[], ax: number, az: number, bx: number, bz: number): boolean {
  for (const o of list) {
    if (o.kind === 'circle') {
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.z - az) * dz) / l2));
      if (Math.hypot(ax + dx * t - o.x, az + dz * t - o.z) < o.r * 0.9) return true;
      continue;
    }
    // Slab test against an axis-aligned box (rotated boxes are rare and small).
    let t0 = 0;
    let t1 = 1;
    const d = [bx - ax, bz - az];
    const p = [ax - o.x, az - o.z];
    const h = [o.hw * 0.95, o.hd * 0.95];
    let hit = true;
    for (let k = 0; k < 2; k++) {
      if (Math.abs(d[k]) < 1e-9) {
        if (Math.abs(p[k]) > h[k]) hit = false;
      } else {
        let ta = (-h[k] - p[k]) / d[k];
        let tb = (h[k] - p[k]) / d[k];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) hit = false;
      }
    }
    if (hit) return true;
  }
  return false;
}

