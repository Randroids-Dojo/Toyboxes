// Lap ghosts: the path of one lap, sampled ten times a second. The browser
// records them to race against; the server re-checks a board lap from its
// ghost (speed, staying near the road, no shortcuts, a full lap) before it
// goes on a shared board.

import { TrackPath } from '../track.js';
import { EDGE } from './profile.js';
import { BOARD_TOP, GRASS_TOP, boardMinLapMs, type BodyId } from './rules.js';

export const GHOST_HZ = 10;
/** Positions are stored in steps of 5 cm. */
const Q = 20;
/** The biggest ghost the server reads, in samples (ten minutes). */
export const GHOST_MAX = 6000;

export interface Ghost {
  v: 1;
  /** Circuit id. */
  c: string;
  body: BodyId;
  ms: number;
  /** First sample, in 5 cm steps. */
  x0: number;
  z0: number;
  /** Then each sample as the change from the one before: dx, dz pairs. */
  d: number[];
}

/** Samples a lap as it is driven. */
export class GhostRecorder {
  private pts: number[] = [];
  private acc = 0;

  constructor(
    readonly circuit: string,
    readonly body: BodyId,
  ) {}

  /** Starts over at the line. */
  start(x: number, z: number): void {
    this.pts = [Math.round(x * Q), Math.round(z * Q)];
    this.acc = 0;
  }

  get started(): boolean {
    return this.pts.length > 0;
  }

  /** Call every fixed step while the lap runs. */
  step(dt: number, x: number, z: number): void {
    if (!this.pts.length) return;
    this.acc += dt;
    while (this.acc >= 1 / GHOST_HZ - 1e-6) {
      this.acc -= 1 / GHOST_HZ;
      this.pts.push(Math.round(x * Q), Math.round(z * Q));
      if (this.pts.length > GHOST_MAX * 2) this.pts.length = 0;
    }
  }

  /** Ends the lap at the line: the last sample is where it crossed. */
  finish(x: number, z: number, ms: number): Ghost | null {
    if (this.pts.length < 4) return null;
    this.pts.push(Math.round(x * Q), Math.round(z * Q));
    return encodeGhost(this.circuit, this.body, ms, this.pts);
  }
}

export function encodeGhost(circuit: string, body: BodyId, ms: number, pts: number[]): Ghost {
  const d: number[] = [];
  for (let i = 2; i < pts.length; i += 2) d.push(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return { v: 1, c: circuit, body, ms, x0: pts[0], z0: pts[1], d };
}

/** World positions in metres: x, z pairs. */
export function decodeGhost(g: Ghost): number[] {
  const out = [g.x0 / Q, g.z0 / Q];
  let x = g.x0;
  let z = g.z0;
  for (let i = 0; i + 1 < g.d.length; i += 2) {
    x += g.d[i];
    z += g.d[i + 1];
    out.push(x / Q, z / Q);
  }
  return out;
}

/** Position at a time into the lap, interpolated. */
export function ghostAt(pts: number[], t: number): { x: number; z: number; yaw: number } {
  const n = pts.length / 2;
  const f = Math.max(0, t * GHOST_HZ);
  const i = Math.min(n - 2, Math.floor(f));
  const k = Math.min(1, f - i);
  const ax = pts[i * 2];
  const az = pts[i * 2 + 1];
  const bx = pts[i * 2 + 2];
  const bz = pts[i * 2 + 3];
  const x = ax + (bx - ax) * k;
  const z = az + (bz - az) * k;
  // Face along the path a little ahead so it never snaps.
  const j = Math.min(n - 1, i + 3);
  const h = Math.max(0, i - 1);
  const yaw = Math.atan2(pts[j * 2] - pts[h * 2], pts[j * 2 + 1] - pts[h * 2 + 1]);
  return { x, z, yaw };
}

export function isGhost(v: unknown): v is Ghost {
  if (!v || typeof v !== 'object') return false;
  const g = v as Ghost;
  return (
    g.v === 1 &&
    typeof g.c === 'string' &&
    typeof g.body === 'string' &&
    Number.isInteger(g.ms) &&
    Number.isInteger(g.x0) &&
    Number.isInteger(g.z0) &&
    Array.isArray(g.d) &&
    g.d.length % 2 === 0 &&
    g.d.length <= GHOST_MAX * 2 &&
    g.d.every((n) => Number.isInteger(n) && Math.abs(n) < 2000)
  );
}

/**
 * Null when the ghost is a real lap of this circuit taking `ms`; otherwise
 * why not. The same rules as the browser's lap timer (a jump of more than
 * 25 m along the lap is a shortcut), plus speed and distance checks.
 */
export function lapProblem(flat: number[], ghost: Ghost, ms: number): string | null {
  if (!isGhost(ghost)) return 'That lap has no path';
  if (ghost.ms !== ms) return 'The lap time and its path disagree';
  const path = new TrackPath(flat);
  const L = path.length;
  if (ms < boardMinLapMs(L)) return 'That lap is too quick';
  if (ms > 10 * 60 * 1000) return 'That lap is too slow';
  const pts = decodeGhost(ghost);
  const n = pts.length / 2;
  const whole = Math.floor(ms / (1000 / GHOST_HZ));
  if (n < whole + 1 || n > whole + 2) return 'The lap time and its path disagree';
  // Fastest legal step between samples, with a little slack for rounding.
  const maxStep = (BOARD_TOP * 1.15) / GHOST_HZ + 0.1;
  let hint = -1;
  let prevS = 0;
  let progress = 0;
  // Off the road a kart slows to grass speed within a second.
  const grassStep = (GRASS_TOP * 1.15) / GHOST_HZ + 0.1;
  let offFor = 0;
  let gate = 0;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2];
    const z = pts[i * 2 + 1];
    const step = i > 0 ? Math.hypot(x - pts[i * 2 - 2], z - pts[i * 2 - 1]) : 0;
    if (step > maxStep) return 'That lap was too fast';
    let near = hint >= 0 ? path.nearest(x, z, hint, 10) : path.nearest(x, z);
    if (near.dist > EDGE + 3) near = path.nearest(x, z);
    hint = near.index;
    if (near.dist > EDGE + 26) return 'That lap left the circuit';
    offFor = near.dist > EDGE + 1 ? offFor + 1 / GHOST_HZ : 0;
    if (offFor > 1.05 && step > grassStep) return 'That lap was too fast on the grass';
    if (i === 0) {
      if (!(near.s < 4 || near.s > L - 3)) return 'That lap did not start at the line';
      prevS = near.s;
      continue;
    }
    const ds = path.delta(prevS, near.s);
    if (Math.abs(ds) > 25) return 'That lap took a shortcut';
    progress += ds;
    prevS = near.s;
    if (gate === 0 && progress > L / 3) gate = 1;
    if (gate === 1 && progress > (L * 2) / 3) gate = 2;
  }
  if (gate < 2) return 'That lap did not go all the way round';
  if (Math.abs(progress - L) > 10) return 'That lap did not go all the way round';
  if (!(prevS < 6 || prevS > L - 3)) return 'That lap did not end at the line';
  return null;
}
