// Road building. Every horizontal surface belongs to one layer of the layer
// table, so no two surfaces ever share a plane:
//
//   ground   -0.04          the floor, lawn or sand (polygon offset pushes it back)
//   prints   -0.02          rugs, water, puddles; kept off the road corridor
//   road      h(s)          road ribbons, decks, book tops
//   paint     h + 0.004     start line, grid, boost pads (decal offset)
//   curbs     h + 0.07      raised strips whose outer lip dips to h - 0.04
//   glow      h + 0.06      light pools, additive, no depth write
//
// Ribbon segments meet edge to edge; gaps end in capped faces; raised decks
// get side faces down below the ground and rails as colliders.

import * as THREE from 'three';
import { TRACK_CURB } from '../../../shared/track';
import { box, type Collider } from '../../../world/physics';
import { EDGE, HW, type Circuit } from '../circuit';
import type { Batch } from './shape';

export const LAYER = { ground: -0.04, prints: -0.02, paint: 0.004, skid: 0.006, glow: 0.06 };

/** Pulls a material forward in depth so it never flickers against what it is painted on. */
export function decal<T extends THREE.Material>(mat: T, layer = 1): T {
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -layer;
  mat.polygonOffsetUnits = -layer * 2;
  return mat;
}

/** Distances along the lap to build a strip at: every centre-line point, plus extra on slopes. */
function samples(c: Circuit, s0: number, s1: number, maxStep = 1.6): number[] {
  const p = c.path;
  const L = c.length;
  const out: number[] = [s0];
  const base = Math.floor(s0 / L) * L;
  for (let lap = 0; lap < 3; lap++)
    for (let i = 0; i < p.n; i++) {
      const s = base + lap * L + p.s[i];
      if (s > s0 + 0.05 && s < s1 - 0.05) out.push(s);
    }
  out.push(s1);
  out.sort((a, b) => a - b);
  const fine: number[] = [];
  for (let i = 0; i < out.length; i++) {
    if (i > 0) {
      const a = out[i - 1];
      const b = out[i];
      const sloped = c.profile.raiseAt(a) || c.profile.raiseAt(b);
      const step = sloped ? 0.6 : maxStep;
      const n = Math.ceil((b - a) / step);
      for (let k = 1; k < n; k++) fine.push(a + ((b - a) * k) / n);
    }
    fine.push(out[i]);
  }
  return fine;
}

/**
 * A strip along the road between s0 and s1. `cols(s)` gives the cross-section
 * as [offset, height] pairs, left to right. Faces point up (or outwards for
 * vertical walls when `outward` is set).
 */
export function strip(c: Circuit, s0: number, s1: number, cols: (s: number) => [number, number][], vScale: number, opts: { flatUp?: boolean; uv?: 'across' | 'height' } = {}): THREE.BufferGeometry {
  const ss = samples(c, s0, s1);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let ncols = 0;
  ss.forEach((s, k) => {
    const f = c.frame(s);
    const cs = cols(s);
    ncols = cs.length;
    let acc = 0;
    cs.forEach(([o, y], ci) => {
      pos.push(f.x + f.nx * o, y, f.z + f.nz * o);
      if (opts.uv === 'height') {
        if (ci > 0) acc += Math.hypot(o - cs[ci - 1][0], y - cs[ci - 1][1]);
        uv.push(acc, s / vScale);
      } else uv.push(ci / (cs.length - 1), s / vScale);
    });
    if (k < ss.length - 1) {
      for (let ci = 0; ci < ncols - 1; ci++) {
        const a = k * ncols + ci;
        idx.push(a, a + ncols, a + 1, a + 1, a + ncols, a + ncols + 1);
      }
    }
  });
  // Flip the winding if the strip came out facing down.
  let up = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, d] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
    up += (pos[b + 2] - pos[a + 2]) * (pos[d] - pos[a]) - (pos[b] - pos[a]) * (pos[d + 2] - pos[a + 2]);
  }
  if (up < 0) for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (opts.flatUp) {
    const n = g.getAttribute('normal');
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  }
  return g;
}

/** A vertical wall along one edge (side +1 left, -1 right), facing out, from y0(s) to y1(s). */
export function wall(c: Circuit, s0: number, s1: number, off: number, y0: (s: number) => number, y1: (s: number) => number, vScale: number): THREE.BufferGeometry {
  const ss = samples(c, s0, s1);
  const pos: number[] = [];
  const uv: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const out = Math.sign(off) || 1;
  ss.forEach((s, k) => {
    const f = c.frame(s);
    const x = f.x + f.nx * off;
    const z = f.z + f.nz * off;
    const a = y0(s);
    const b = y1(s);
    pos.push(x, a, z, x, b, z);
    uv.push(s / vScale, 0, s / vScale, (b - a) / vScale);
    nrm.push(f.nx * out, 0, f.nz * out, f.nx * out, 0, f.nz * out);
    if (k < ss.length - 1) {
      const i = k * 2;
      // Winding chosen so the face points away from the road.
      if (out > 0) idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
      else idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

/** A flat quad across the road at s, from y0 to y1, facing along the travel direction (dir 1) or back (-1). */
export function cap(c: Circuit, s: number, y0: number, y1: number, dir: number, half = EDGE): THREE.BufferGeometry {
  const f = c.frame(s);
  const l = { x: f.x + f.nx * half, z: f.z + f.nz * half };
  const r = { x: f.x - f.nx * half, z: f.z - f.nz * half };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([l.x, y0, l.z, r.x, y0, r.z, l.x, y1, l.z, r.x, y1, r.z], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  const nx = f.tx * dir;
  const nz = f.tz * dir;
  g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
  // Check the winding against the wanted normal.
  const ax = r.x - l.x;
  const az = r.z - l.z;
  // (r - l) x (up) gives a horizontal normal.
  const cx = -az;
  const cz = ax;
  g.setIndex(cx * nx + cz * nz > 0 ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3]);
  return g;
}

/** A painted quad on the road surface following its height. */
export function paint(c: Circuit, s0: number, s1: number, o0: number, o1: number, lift = LAYER.paint): THREE.BufferGeometry {
  return strip(c, s0, s1, (s) => [
    [Math.min(o0, o1), c.profile.h(s) + lift],
    [Math.max(o0, o1), c.profile.h(s) + lift],
  ], s1 - s0, { flatUp: true });
}

export interface RoadLook {
  /** Surface material for a stretch of road. */
  surface(s: number): string;
  materials: Record<string, THREE.Material>;
  curb: THREE.Material;
  /** Sides of raised decks and ramps by style. */
  side: Record<string, THREE.Material>;
  /** Rails along decks; null for none (the side wall stands proud instead). */
  rail: THREE.Material;
}

/** Road stretches between gaps, as [s0, s1] with s1 possibly past the lap length. */
function runs(c: Circuit): [number, number][] {
  const gaps = (c.def?.raises ?? []).filter((r) => r.gap).map((r) => r.gap!).sort((a, b) => a.s0 - b.s0);
  if (!gaps.length) return [[0, c.length]];
  const out: [number, number][] = [];
  for (let i = 0; i < gaps.length; i++) {
    const next = gaps[(i + 1) % gaps.length];
    const end = i + 1 < gaps.length ? next.s0 : next.s0 + c.length;
    out.push([gaps[i].s1, end]);
  }
  return out;
}

/** Splits a run where the road surface changes. */
function bySurface(c: Circuit, look: RoadLook, s0: number, s1: number): { s0: number; s1: number; kind: string }[] {
  const out: { s0: number; s1: number; kind: string }[] = [];
  let cur = look.surface(c.wrap(s0));
  let start = s0;
  for (let s = s0 + 0.5; s < s1; s += 0.5) {
    const k = look.surface(c.wrap(s));
    if (k !== cur) {
      out.push({ s0: start, s1: s, kind: cur });
      start = s;
      cur = k;
    }
  }
  out.push({ s0: start, s1, kind: cur });
  return out;
}

export function buildRoad(c: Circuit, batch: Batch, look: RoadLook, colliders: Collider[]): void {
  const prof = c.profile;
  const h = (s: number) => prof.h(s);
  for (const [r0, r1] of runs(c)) {
    for (const part of bySurface(c, look, r0, r1)) {
      batch.raw(strip(c, part.s0, part.s1, (s) => [[-HW, h(s)], [HW, h(s)]], 9, { flatUp: true }), look.materials[part.kind] ?? look.materials.road, { receive: true });
    }
    for (const sd of [1, -1]) {
      const prof4 = (s: number): [number, number][] => {
        const y = h(s);
        const p: [number, number][] = [
          [sd * HW, y],
          [sd * (HW + 0.18), y + 0.07],
          [sd * (HW + TRACK_CURB - 0.18), y + 0.07],
          [sd * EDGE, y - 0.04],
        ];
        return sd > 0 ? p : p.reverse();
      };
      batch.raw(strip(c, r0, r1, prof4, 3), look.curb, { receive: true });
    }
  }

  // Raised road: verges or walls with rails.
  for (const r of c.def?.raises ?? []) {
    const a = r.segs[0].s0;
    const b = r.segs[r.segs.length - 1].s1;
    if (r.sides === 'verge') {
      for (const sd of [1, -1]) {
        const cols = (s: number): [number, number][] => {
          const y = h(s);
          const run = Math.max(1, y * 3);
          const p: [number, number][] = [
            [sd * EDGE, y - 0.04],
            [sd * (EDGE + run * 0.5), y * 0.5 - 0.1],
            [sd * (EDGE + run), -0.3],
          ];
          return sd > 0 ? p : p.reverse();
        };
        batch.raw(strip(c, a, b, cols, 4), look.side[r.style] ?? look.side.earth, { receive: true });
      }
      continue;
    }
    const gap = r.gap;
    const spans: [number, number][] = gap ? [[a, gap.s0], [gap.s1, b]].filter(([x, y]) => y > x + 0.1) as [number, number][] : [[a, b]];
    const sideMat = look.side[r.style] ?? look.side.earth;
    for (const [x0, x1] of spans) {
      for (const sd of [1, -1]) {
        // Side face from the curb lip down below the ground.
        batch.raw(wall(c, x0, x1, sd * EDGE, () => -0.14, (s) => Math.max(-0.1, h(s) - 0.04), 2), sideMat, { receive: true, cast: true });
        // A low rail standing proud of the deck.
        const ro = sd * (EDGE + 0.12);
        batch.raw(wall(c, x0, x1, ro, (s) => h(s) - 0.04, (s) => h(s) + 0.42, 2), look.rail, { cast: true });
        batch.raw(wall(c, x0, x1, ro + sd * 0.22, () => -0.14, (s) => h(s) + 0.42, 2), look.rail, { cast: true });
        batch.raw(
          strip(c, x0, x1, (s) => {
            const p: [number, number][] = [
              [ro, h(s) + 0.42],
              [ro + sd * 0.22, h(s) + 0.42],
            ];
            return sd > 0 ? p : p.reverse();
          }, 2, { flatUp: true }),
          look.rail,
        );
      }
      // Ends of each stretch, where it meets a gap.
      if (gap && Math.abs(x1 - gap.s0) < 0.01) batch.raw(cap(c, x1, gap.floor - 0.1, h(x1 - 0.01) - 0.01, 1, EDGE + 0.34), sideMat, { cast: true });
      if (gap && Math.abs(x0 - gap.s1) < 0.01 && h(x0 + 0.01) > 0.05) batch.raw(cap(c, x0, gap.floor - 0.1, h(x0 + 0.01) - 0.01, -1, EDGE + 0.34), sideMat, { cast: true });
    }
    // Rail colliders, also across the gap so nobody slides off the side in the air.
    const top = Math.max(...r.segs.map((sg) => Math.max(sg.h0, sg.h1)));
    for (let s = a; s < b; s += 2) {
      const ms = s + 1;
      const f = c.frame(ms);
      const yaw = Math.atan2(f.tx, f.tz);
      const hh = gap && ms > gap.s0 && ms < gap.s1 ? top + 1.2 : Math.max(0.5, h(ms) + 0.9);
      for (const sd of [1, -1]) colliders.push(box(f.x + f.nx * sd * (EDGE + 0.23), f.z + f.nz * sd * (EDGE + 0.23), 0.15, 1.05, yaw, hh, 0.3, false));
    }
  }
}
