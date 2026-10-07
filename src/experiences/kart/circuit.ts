// A circuit at run time: the centre line, the height profile, the racing
// line the computer drivers follow, where the paddock and grid go, and fast
// "where am I along the lap" queries.

import { CIRCUITS, circuitLine, type CircuitDef, type HomeId, type Pad, type Theme } from '../../shared/kart/circuits';
import { EDGE, Profile } from '../../shared/kart/profile';
import { TRACK_WIDTH, TrackPath } from '../../shared/track';
import { clamp, wrapAngle } from '../../world/physics';

export const HW = TRACK_WIDTH / 2;
export { EDGE };
/** Sideways grip the computer drivers plan corners with, a little under the karts' limit. */
const AI_GRIP = 10;
/** How hard the computer drivers brake before a corner, m/s squared. */
const AI_BRAKE = 8;
/** Grid: first slot behind the line, then this far apart, two columns. */
export const GRID_FIRST = 6;
export const GRID_STEP = 4.3;
export const GRID_LANE = 2.2;

export interface Frame {
  x: number;
  z: number;
  /** Unit tangent. */
  tx: number;
  tz: number;
  /** Unit left normal. */
  nx: number;
  nz: number;
}

/** The paddock's local axes: u along the start straight, v away from the road. */
export interface Paddock {
  ox: number;
  oz: number;
  ux: number;
  uz: number;
  vx: number;
  vz: number;
  /** Which side of the road it is on (left positive). */
  side: number;
}

function smoothLoop(src: Float32Array, half: number): Float32Array {
  const n = src.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -half; k <= half; k++) sum += src[(i + k + n) % n];
    out[i] = sum / (half * 2 + 1);
  }
  return out;
}

export class Circuit {
  readonly path: TrackPath;
  readonly profile: Profile;
  readonly def: CircuitDef | null;
  readonly theme: Theme;
  readonly name: string;
  readonly laps: number;
  readonly length: number;
  readonly pads: Pad[];
  readonly capsules: number[];
  /** Per centre-line point: racing-line offset and the speed the computer drivers plan for. */
  readonly line: Float32Array;
  readonly plan: Float32Array;
  readonly paddock: Paddock;
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  private nx: number[] = [];
  private nz: number[] = [];

  constructor(
    readonly id: HomeId,
    track: number[],
    sketchLaps = 3,
  ) {
    this.def = id === 'sketch' ? null : CIRCUITS[id];
    this.path = new TrackPath(id === 'sketch' ? track : circuitLine(id));
    const p = this.path;
    this.length = p.length;
    this.profile = new Profile(p.length, this.def?.raises ?? [], this.def?.tunnels ?? []);
    this.theme = this.def?.theme ?? 'playroom';
    this.name = this.def?.name ?? 'Home circuit';
    this.laps = this.def?.laps ?? sketchLaps;
    for (let i = 0; i < p.n; i++) {
      this.nx.push(p.tz[i]);
      this.nz.push(-p.tx[i]);
    }
    this.pads = this.def?.pads ?? this.autoPads();
    this.capsules = this.def?.capsules ?? this.autoCapsules();

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < p.n; i++) {
      minX = Math.min(minX, p.x[i]);
      maxX = Math.max(maxX, p.x[i]);
      minZ = Math.min(minZ, p.z[i]);
      maxZ = Math.max(maxZ, p.z[i]);
    }
    this.paddock = this.placePaddock();
    // The paddock's back corners widen the grounds.
    for (const [u, v] of [
      [-40, 44],
      [40, 44],
    ]) {
      const q = this.pad(u, v);
      minX = Math.min(minX, q.x);
      maxX = Math.max(maxX, q.x);
      minZ = Math.min(minZ, q.z);
      maxZ = Math.max(maxZ, q.z);
    }
    this.bounds = { minX, maxX, minZ, maxZ };

    // ---- The computer drivers' racing line and speed plan.
    const n = p.n;
    const L = p.length;
    const spacing = L / n;
    const heading = (i: number) => Math.atan2(p.tx[((i % n) + n) % n], p.tz[((i % n) + n) % n]);
    const k3 = Math.max(1, Math.round(3 / spacing));
    const curv = new Float32Array(n);
    for (let i = 0; i < n; i++) curv[i] = wrapAngle(heading(i + k3) - heading(i - k3)) / (2 * k3 * spacing);
    const wide = smoothLoop(curv, Math.max(1, Math.round(8 / spacing)));
    const rawLine = new Float32Array(n);
    for (let i = 0; i < n; i++) rawLine[i] = clamp(wide[i] * 45, -1, 1) * (HW - 1.7);
    // Raised decks and ramps: keep to the middle.
    for (let i = 0; i < n; i++) if (this.profile.walled(p.s[i]) || this.profile.tunnelAt(p.s[i])) rawLine[i] *= 0.15;
    this.line = smoothLoop(smoothLoop(rawLine, Math.max(1, Math.round(6 / spacing))), Math.max(1, Math.round(6 / spacing)));
    const tight = smoothLoop(curv, k3);
    this.plan = new Float32Array(n);
    for (let i = 0; i < n; i++) this.plan[i] = Math.sqrt(AI_GRIP * 1.1 * (1 / Math.max(Math.abs(tight[i]), 1 / 300)));
    for (let pass = 0; pass < 2; pass++)
      for (let i = n - 1; i >= 0; i--) {
        const j = (i + 1) % n;
        const ds = (j === 0 ? L : p.s[j]) - p.s[i];
        this.plan[i] = Math.min(this.plan[i], Math.sqrt(this.plan[j] ** 2 + 2 * AI_BRAKE * ds));
      }
  }

  /** Index of the centre-line point at or before a distance along the lap. */
  idx(s: number): number {
    const p = this.path;
    const d = ((s % p.length) + p.length) % p.length;
    let lo = 0;
    let hi = p.n - 1;
    let i = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (p.s[mid] <= d) {
        i = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return i;
  }

  wrap(s: number): number {
    return ((s % this.length) + this.length) % this.length;
  }

  /** Position and smooth axes at s, interpolating the normals between points (no kinks at offsets). */
  frame(s: number): Frame {
    const p = this.path;
    const d = this.wrap(s);
    const i = this.idx(d);
    const j = (i + 1) % p.n;
    const seg = (j === 0 ? p.length : p.s[j]) - p.s[i] || 1;
    const t = (d - p.s[i]) / seg;
    let nx = this.nx[i] + (this.nx[j] - this.nx[i]) * t;
    let nz = this.nz[i] + (this.nz[j] - this.nz[i]) * t;
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    return { x: p.x[i] + (p.x[j] - p.x[i]) * t, z: p.z[i] + (p.z[j] - p.z[i]) * t, tx: -nz, tz: nx, nx, nz };
  }

  /** A point at s and sideways offset (left positive) with the road heading and height there. */
  at(s: number, off = 0): { x: number; z: number; y: number; heading: number } {
    const f = this.frame(s);
    return { x: f.x + f.nx * off, z: f.z + f.nz * off, y: this.profile.ground(s, off), heading: Math.atan2(f.tx, f.tz) };
  }

  /** Paddock local coordinates to world. */
  pad(u: number, v: number): { x: number; z: number } {
    const k = this.paddock;
    return { x: k.ox + k.ux * u + k.vx * v, z: k.oz + k.uz * u + k.vz * v };
  }

  /** World yaw of a direction in the paddock frame (0 faces +u). */
  padYaw(du: number, dv: number): number {
    const k = this.paddock;
    return Math.atan2(k.ux * du + k.vx * dv, k.uz * du + k.vz * dv);
  }

  /** Grid slot k (0 is pole), two columns behind the line. */
  grid(k: number): { x: number; z: number; yaw: number; s: number } {
    const s = this.length - (GRID_FIRST + k * GRID_STEP);
    const lane = k % 2 ? -GRID_LANE : GRID_LANE;
    const q = this.at(s, lane);
    return { x: q.x, z: q.z, yaw: q.heading, s };
  }

  /** Distance from a point to the nearest road edge (negative on the road). */
  roadClearance(x: number, z: number): number {
    return this.path.nearest(x, z).dist - EDGE;
  }

  /** Whether a point is inside the loop (the infield). */
  inside(x: number, z: number): boolean {
    const p = this.path;
    let c = false;
    for (let i = 0, j = p.n - 1; i < p.n; j = i++) {
      if (p.z[i] > z !== p.z[j] > z && x < ((p.x[j] - p.x[i]) * (z - p.z[i])) / (p.z[j] - p.z[i]) + p.x[i]) c = !c;
    }
    return c;
  }

  /** The paddock sits outside the start straight, or wherever a sketch leaves room. */
  private placePaddock(): Paddock {
    const tries = [0, this.length * 0.25, this.length * 0.5, this.length * 0.75];
    for (const s0 of tries) {
      const f = this.frame(s0);
      for (const side of [1, -1]) {
        const probe = { x: f.x + f.nx * side * 25, z: f.z + f.nz * side * 25 };
        if (this.inside(probe.x, probe.z)) continue;
        const k: Paddock = { ox: f.x, oz: f.z, ux: f.tx, uz: f.tz, vx: f.nx * side, vz: f.nz * side, side };
        let ok = true;
        for (let u = -36; u <= 36 && ok; u += 4)
          for (let v = 12; v <= 42 && ok; v += 4) {
            const q = { x: k.ox + k.ux * u + k.vx * v, z: k.oz + k.uz * u + k.vz * v };
            if (this.roadClearance(q.x, q.z) < 5) ok = false;
          }
        if (ok) return k;
      }
    }
    // Last resort: outside the start, even if crowded.
    const f = this.frame(0);
    const side = this.inside(f.x + f.nx * 25, f.z + f.nz * 25) ? -1 : 1;
    return { ox: f.x, oz: f.z, ux: f.tx, uz: f.tz, vx: f.nx * side, vz: f.nz * side, side };
  }

  /** Boost pads for a sketch: the longest straights, away from the grid. */
  private autoPads(): Pad[] {
    const p = this.path;
    const L = p.length;
    const runs: { from: number; to: number }[] = [];
    let start = -1;
    for (let s = 0; s <= L + 2; s += 2) {
      const straight = Math.abs(p.turnAhead(s, 12)) < 0.1;
      if (straight && start < 0) start = s;
      if ((!straight || s > L) && start >= 0) {
        runs.push({ from: start, to: s });
        start = -1;
      }
    }
    runs.sort((a, b) => b.to - b.from - (a.to - a.from));
    const out: Pad[] = [];
    let lane = 1;
    for (const r of runs) {
      if (r.to - r.from < 25 || out.length >= 3) continue;
      const s = (r.from + r.to) / 2;
      if (s > L - 50 || s < 15) continue;
      out.push({ s: this.wrap(s), off: lane * 2.2 });
      lane = -lane;
    }
    return out;
  }

  private autoCapsules(): number[] {
    const L = this.length;
    return [L * 0.22, L * 0.6].map((s) => {
      // Slide onto a straighter bit if it lands in a corner.
      for (let d = 0; d < 40; d += 4) for (const sg of [1, -1]) if (Math.abs(this.path.turnAhead(s + sg * d - 6, 12)) < 0.2) return this.wrap(s + sg * d);
      return s;
    });
  }
}
