// Kart tracks drawn in a sketchbook: turn a hand-drawn loop into a smooth
// closed centre line, check it is raceable, and answer "where along the
// lap is this point". Shared by the browser and the API (lap validation).

import type { Stroke } from './model.js';

export const TRACK_WIDTH = 9;
/** Rumble strip on each side of the road. */
export const TRACK_CURB = 0.9;
/** Tightest corner allowed: the inner curb must never fold over itself. */
export const TRACK_MIN_RADIUS = TRACK_WIDTH / 2 + TRACK_CURB + 2;
export const TRACK_TARGET_LENGTH = 420;
export const TRACK_POINTS = 160;
/** Kart top speed in m/s before boosts. */
export const KART_TOP_SPEED = 14;
/** Boost pads, drift boosts and slipstream raise the top speed by this much. */
export const KART_BOOST = 1.35;

type P = [number, number];

function arcLengths(pts: P[], closed: boolean): number[] {
  const out = [0];
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    out.push(out[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return out;
}

/** Evenly spaced points around a closed loop. */
function resampleClosed(pts: P[], count: number): P[] {
  const s = arcLengths(pts, true);
  const total = s[s.length - 1];
  const out: P[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total;
    while (j < pts.length - 1 && s[j + 1] < target) j++;
    const a = pts[j];
    const b = pts[(j + 1) % pts.length];
    const seg = s[j + 1] - s[j] || 1;
    const t = (target - s[j]) / seg;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

function smoothClosed(pts: P[], passes: number): P[] {
  let cur = pts;
  for (let p = 0; p < passes; p++) {
    const n = cur.length;
    cur = cur.map((q, i) => {
      const a = cur[(i - 1 + n) % n];
      const b = cur[(i + 1) % n];
      return [a[0] * 0.25 + q[0] * 0.5 + b[0] * 0.25, a[1] * 0.25 + q[1] * 0.5 + b[1] * 0.25] as P;
    });
  }
  return cur;
}

/**
 * Hand-drawn loops usually overshoot: the pen passes its starting point.
 * Cut the stroke where its head and tail come closest so the overlap goes.
 */
function closeLoop(pts: P[]): P[] {
  const n = pts.length;
  const s = arcLengths(pts, false);
  const total = s[n - 1];
  let bi = 0;
  let bj = n - 1;
  let bd = Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]);
  for (let i = 0; i < n && s[i] < total * 0.2; i++) {
    for (let j = n - 1; j > i && s[j] > total * 0.8; j--) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d < bd) {
        bd = d;
        bi = i;
        bj = j;
      }
    }
  }
  return pts.slice(bi, bj + 1);
}

/**
 * Builds a track centre line (flat x,z pairs in metres, centred on the
 * origin) from the longest stroke of a sketch. Page y becomes world z.
 */
export function trackFromSketch(sketch: Stroke[]): number[] | null {
  let best: P[] | null = null;
  let bestLen = 0;
  for (const st of sketch) {
    const pts: P[] = [];
    for (let i = 0; i + 1 < st.p.length; i += 2) {
      const q: P = [st.p[i], st.p[i + 1]];
      const last = pts[pts.length - 1];
      if (!last || last[0] !== q[0] || last[1] !== q[1]) pts.push(q);
    }
    if (pts.length < 12) continue;
    const len = arcLengths(pts, false).pop()!;
    if (len > bestLen) {
      bestLen = len;
      best = pts;
    }
  }
  if (!best || bestLen < 500) return null;
  best = closeLoop(best);
  // Close the loop (a gap between the pen's start and end becomes a straight) and tidy the hand wobble.
  const dense = resampleClosed(best, TRACK_POINTS * 2);
  // Smooth harder until the tightest corner is wide enough at full size.
  let pts: P[] = [];
  let f = 1;
  for (let passes = 10; passes <= 160; passes += 10) {
    pts = resampleClosed(smoothClosed(dense, passes), TRACK_POINTS);
    f = TRACK_TARGET_LENGTH / arcLengths(pts, true).pop()!;
    if (minRadius(pts) * f >= TRACK_MIN_RADIUS) break;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const out: number[] = [];
  for (const [x, y] of pts) out.push(Math.round((x - cx) * f * 10) / 10, Math.round((y - cy) * f * 10) / 10);
  return out;
}

function segmentsCross(a: P, b: P, c: P, d: P): boolean {
  const o = (p: P, q: P, r: P) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(a, b, c);
  const d2 = o(a, b, d);
  const d3 = o(c, d, a);
  const d4 = o(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * Radius of the tightest corner, measured over about five metres either
 * side of each point so drawing wobble and rounding do not count.
 */
export function minRadius(pts: P[]): number {
  const n = pts.length;
  const total = arcLengths(pts, true).pop()!;
  const k = Math.max(1, Math.round(5 / (total / n)));
  let min = Infinity;
  for (let i = 0; i < n; i++) {
    const a = pts[(i - k + n) % n];
    const b = pts[i];
    const c = pts[(i + k) % n];
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    if (area2 > 1e-9) min = Math.min(min, (ab * bc * ca) / (2 * area2));
  }
  return min;
}

/** How many road-edge segments at this sideways offset run backwards (fold over). */
export function edgeFolds(flat: number[], offset: number): number {
  const pts: P[] = [];
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
  const n = pts.length;
  const edge = pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [p[0] + ((b[1] - a[1]) / l) * offset, p[1] - ((b[0] - a[0]) / l) * offset];
  });
  let folds = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const along = (pts[j][0] - pts[i][0]) * (edge[j][0] - edge[i][0]) + (pts[j][1] - pts[i][1]) * (edge[j][1] - edge[i][1]);
    if (along <= 0) folds++;
  }
  return folds;
}

/** Why a centre line cannot be raced, or null. */
export function trackProblem(flat: number[]): string | null {
  if (!Array.isArray(flat) || flat.length < 40 || flat.length > 2000 || flat.length % 2) return 'The track needs a longer loop';
  if (!flat.every((v) => Number.isFinite(v) && Math.abs(v) < 400)) return 'The track is too big';
  const pts: P[] = [];
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
  const n = pts.length;
  const s = arcLengths(pts, true);
  const total = s[n];
  if (total < 150 || total > 1200) return 'The track should be between 150 and 1200 metres long';
  if (minRadius(pts) < TRACK_MIN_RADIUS) return 'A corner is too tight';
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return 'The track crosses itself';
      // Parts of the loop far apart along the road must not sit on top of each other.
      const along = Math.min(Math.abs(s[j] - s[i]), total - Math.abs(s[j] - s[i]));
      if (along > TRACK_WIDTH * 4 && Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) < TRACK_WIDTH * 1.6) return 'Two parts of the track are too close together';
    }
  }
  return null;
}

export function trackLength(flat: number[]): number {
  const pts: P[] = [];
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
  return arcLengths(pts, true).pop()!;
}

/** The quickest lap the server will accept. */
export function minLapMs(flat: number[]): number {
  return Math.floor((trackLength(flat) / (KART_TOP_SPEED * 1.2)) * 1000);
}

/** A short fingerprint of a track, so personal bests reset when the course changes. */
export function trackId(flat: number[]): string {
  let h = 2166136261;
  for (const v of flat) {
    h ^= Math.round(v * 10);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

/** Runtime queries along a closed centre line. */
export class TrackPath {
  readonly x: number[] = [];
  readonly z: number[] = [];
  /** Distance along the lap at each point. */
  readonly s: number[];
  readonly length: number;
  readonly n: number;
  /** Unit tangent and left normal at each point. */
  readonly tx: number[] = [];
  readonly tz: number[] = [];

  constructor(flat: number[]) {
    for (let i = 0; i < flat.length; i += 2) {
      this.x.push(flat[i]);
      this.z.push(flat[i + 1]);
    }
    this.n = this.x.length;
    const pts: P[] = this.x.map((x, i) => [x, this.z[i]]);
    const s = arcLengths(pts, true);
    this.length = s.pop()!;
    this.s = s;
    for (let i = 0; i < this.n; i++) {
      const a = (i - 1 + this.n) % this.n;
      const b = (i + 1) % this.n;
      const dx = this.x[b] - this.x[a];
      const dz = this.z[b] - this.z[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx.push(dx / l);
      this.tz.push(dz / l);
    }
  }

  /** Nearest point on the centre line: distance along the lap, signed offset (left positive) and segment index. */
  nearest(px: number, pz: number, hint = -1, window = 0): { s: number; offset: number; dist: number; index: number } {
    let best = { s: 0, offset: 0, dist: Infinity, index: 0 };
    const scan = (i: number) => {
      const j = (i + 1) % this.n;
      const ax = this.x[i];
      const az = this.z[i];
      const dx = this.x[j] - ax;
      const dz = this.z[j] - az;
      const len2 = dx * dx + dz * dz || 1;
      let t = ((px - ax) * dx + (pz - az) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + dx * t;
      const cz = az + dz * t;
      const d = Math.hypot(px - cx, pz - cz);
      if (d < best.dist) {
        const len = Math.sqrt(len2);
        // Left of travel is positive: cross product of the segment with the offset.
        const side = dx * (pz - cz) - dz * (px - cx) < 0 ? 1 : -1;
        best = { s: this.s[i] + t * len, offset: side * d, dist: d, index: i };
      }
    };
    if (hint >= 0 && window > 0) {
      for (let k = -window; k <= window; k++) scan((hint + k + this.n) % this.n);
    } else {
      for (let i = 0; i < this.n; i++) scan(i);
    }
    return best;
  }

  /** Position and direction at a distance along the lap, with a sideways offset (left positive). */
  at(s: number, offset = 0): { x: number; z: number; tx: number; tz: number; heading: number } {
    const L = this.length;
    let d = ((s % L) + L) % L;
    let i = 0;
    let lo = 0;
    let hi = this.n - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.s[mid] <= d) {
        i = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    const j = (i + 1) % this.n;
    const segLen = (j === 0 ? L : this.s[j]) - this.s[i] || 1;
    const t = (d - this.s[i]) / segLen;
    d = t;
    const dx = this.x[j] - this.x[i];
    const dz = this.z[j] - this.z[i];
    const l = Math.hypot(dx, dz) || 1;
    const tx = dx / l;
    const tz = dz / l;
    // Left normal of travel along +tangent, matching `nearest`.
    const nx = tz;
    const nz = -tx;
    return { x: this.x[i] + dx * d + nx * offset, z: this.z[i] + dz * d + nz * offset, tx, tz, heading: Math.atan2(tx, tz) };
  }

  /** How much the road turns over the next `ahead` metres, in radians (signed, left positive). */
  turnAhead(s: number, ahead: number): number {
    const a = this.at(s);
    const b = this.at(s + ahead);
    let d = b.heading - a.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /** Forward distance from s0 to s1 around the lap, in (-L/2, L/2]. */
  delta(s0: number, s1: number): number {
    let d = s1 - s0;
    const L = this.length;
    while (d > L / 2) d -= L;
    while (d <= -L / 2) d += L;
    return d;
  }
}
