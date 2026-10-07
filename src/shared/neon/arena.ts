// Comet Yard, the laser tag arena: its shell and the three cover layouts.
// Pure data and 2D geometry, shared by the world, the bot simulation and the
// tests. x is east, z is south; the arena spans x -15..15 and z -50..-20.

export const ARENA = { x0: -15, x1: 15, z0: -50, z1: -20, cx: 0, cz: -35 };
export const WALL_H = 2.8;
/** Bolts fly at this height. */
export const BOLT_Y = 1.1;
export const BASES = { cyan: { x: 0, z: -22.5 }, magenta: { x: 0, z: -47.5 } };
export const BASE_R = 2.5;
export const AIRLOCK_HALF = 3.5;

export type PieceKind = 'pillar' | 'screen' | 'box' | 'lane' | 'mirror';

export interface Piece {
  kind: PieceKind;
  x: number;
  z: number;
  /** Half width and half depth (boxes) or radius in hw (pillar). */
  hw: number;
  hd: number;
  /** Turn about y, radians (the same sense as physics boxes and mesh.rotation.y). */
  rot: number;
  h: number;
}

export type LayoutId = 'prism' | 'maze' | 'ring';

export const LAYOUT_NAMES: Record<LayoutId, string> = { prism: 'Prism Yard', maze: 'Mirror maze', ring: 'Core ring' };

const deg = (d: number) => (d * Math.PI) / 180;

function boxP(kind: PieceKind, x: number, z: number, w: number, d: number, h: number, rot = 0): Piece {
  return { kind, x, z, hw: w / 2, hd: d / 2, rot, h };
}

/** Adds the point twin (-x, -70 - z) of every piece that is not its own twin. */
function symmetric(half: Piece[]): Piece[] {
  const out: Piece[] = [];
  for (const p of half) {
    out.push(p);
    const tx = -p.x;
    const tz = 2 * ARENA.cz - p.z;
    if (Math.abs(tx - p.x) < 1e-6 && Math.abs(tz - p.z) < 1e-6) continue;
    out.push({ ...p, x: tx, z: tz });
  }
  return out;
}

const PILLAR: Piece = { kind: 'pillar', x: 0, z: -35, hw: 1.3, hd: 1.3, rot: 0, h: 4 };

export const LAYOUTS: Record<LayoutId, Piece[]> = {
  prism: symmetric([
    PILLAR,
    boxP('screen', 0, -26, 4, 0.4, 1.6),
    boxP('box', -9.5, -25, 1.2, 1.2, 1.5),
    boxP('box', 9.5, -25, 1.2, 1.2, 1.5),
    boxP('box', -4.5, -30, 1.2, 1.2, 1.5),
    boxP('box', 4.5, -30, 1.2, 1.2, 1.5),
    boxP('box', -10.5, -35, 1.2, 1.2, 1.5),
    boxP('lane', -12.5, -29, 0.4, 3, 1.6),
    boxP('lane', 12.5, -29, 0.4, 3, 1.6),
    boxP('mirror', -6.5, -33, 2.6, 0.3, 2.2, deg(40)),
    boxP('mirror', 6.5, -33, 2.6, 0.3, 2.2, deg(-40)),
  ]),
  maze: symmetric([
    PILLAR,
    boxP('screen', 0, -26, 4, 0.4, 1.6),
    boxP('box', -9.5, -26, 1.2, 1.2, 1.5),
    boxP('box', 9.5, -26, 1.2, 1.2, 1.5),
    boxP('mirror', -5, -29.5, 2.6, 0.3, 2.2, deg(30)),
    boxP('mirror', 5, -29.5, 2.6, 0.3, 2.2, deg(-30)),
    boxP('mirror', -10.5, -33, 2.6, 0.3, 2.2, deg(-55)),
    boxP('mirror', 10.5, -33, 2.6, 0.3, 2.2, deg(55)),
    boxP('lane', -6, -35, 0.4, 2.4, 1.6),
  ]),
  ring: symmetric([
    PILLAR,
    boxP('screen', 0, -26, 4, 0.4, 1.6),
    boxP('box', -5.2, -32, 1.4, 1.4, 1.5, deg(30)),
    boxP('box', 5.2, -32, 1.4, 1.4, 1.5, deg(-30)),
    boxP('box', 0, -29, 1.4, 1.4, 1.5, deg(45)),
    boxP('box', -11, -27, 1.2, 1.2, 1.5),
    boxP('box', 11, -27, 1.2, 1.2, 1.5),
    boxP('mirror', -10.5, -35, 2.6, 0.3, 2.2, deg(90)),
  ]),
};

/** Power-up pads (the second is the twin of the first). */
export const POWER_PADS = [
  { x: 12.5, z: -31.5 },
  { x: -12.5, z: -38.5 },
];

/** Spawn points on each base pad. */
export function spawnPoints(team: 'cyan' | 'magenta'): { x: number; z: number; yaw: number }[] {
  const b = BASES[team];
  const yaw = team === 'cyan' ? Math.PI : 0;
  return [-1.6, -0.55, 0.55, 1.6].map((dx) => ({ x: b.x + dx, z: b.z, yaw }));
}

// ---------------------------------------------------------------------------
// 2D geometry

/** Corners of a box piece in world x,z. */
export function corners(p: Piece): [number, number][] {
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  // Local (lx, lz) to world: x = lx c + lz s, z = -lx s + lz c.
  return [
    [-p.hw, -p.hd],
    [p.hw, -p.hd],
    [p.hw, p.hd],
    [-p.hw, p.hd],
  ].map(([lx, lz]) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c]);
}

/** Where a segment from a to b first meets a piece: the fraction along it, or null. */
export function segPiece(ax: number, az: number, bx: number, bz: number, p: Piece, pad = 0): number | null {
  if (p.kind === 'pillar') {
    const dx = bx - ax;
    const dz = bz - az;
    const fx = ax - p.x;
    const fz = az - p.z;
    const r = p.hw + pad;
    const a = dx * dx + dz * dz;
    const b = 2 * (fx * dx + fz * dz);
    const c = fx * fx + fz * fz - r * r;
    if (c < 0) return 0;
    const disc = b * b - 4 * a * c;
    if (disc < 0 || a < 1e-12) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : null;
  }
  // Into box space (slab test).
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const lx0 = (ax - p.x) * c - (az - p.z) * s;
  const lz0 = (ax - p.x) * s + (az - p.z) * c;
  const lx1 = (bx - p.x) * c - (bz - p.z) * s;
  const lz1 = (bx - p.x) * s + (bz - p.z) * c;
  const hw = p.hw + pad;
  const hd = p.hd + pad;
  let t0 = 0;
  let t1 = 1;
  const dx = lx1 - lx0;
  const dz = lz1 - lz0;
  for (const [o, d, h] of [
    [lx0, dx, hw],
    [lz0, dz, hd],
  ]) {
    if (Math.abs(d) < 1e-12) {
      if (o < -h || o > h) return null;
    } else {
      let ta = (-h - o) / d;
      let tb = (h - o) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
  }
  return t0;
}

/** The first piece (of those taller than `minH`) a segment hits, with the fraction. */
export function firstHit(ax: number, az: number, bx: number, bz: number, pieces: Piece[], minH = BOLT_Y, skip: Piece | null = null): { t: number; piece: Piece } | null {
  let best: { t: number; piece: Piece } | null = null;
  for (const p of pieces) {
    if (p === skip || p.h < minH) continue;
    const t = segPiece(ax, az, bx, bz, p);
    if (t !== null && (!best || t < best.t)) best = { t, piece: p };
  }
  return best;
}

/** Clear sight (mirrors and cover block it). */
export function clearLine(ax: number, az: number, bx: number, bz: number, pieces: Piece[], minH = 1.2): boolean {
  return !firstHit(ax, az, bx, bz, pieces, minH);
}

/** The mirror's face as a line: centre, unit direction along it and its half length. */
export function mirrorLine(m: Piece): { x: number; z: number; dx: number; dz: number; half: number; nx: number; nz: number } {
  const c = Math.cos(m.rot);
  const s = Math.sin(m.rot);
  // Local x axis in world: (c, -s); normal is local z: (s, c).
  return { x: m.x, z: m.z, dx: c, dz: -s, half: m.hw, nx: s, nz: c };
}

/** Reflects a direction off a mirror. */
export function reflectDir(vx: number, vz: number, m: Piece): [number, number] {
  const l = mirrorLine(m);
  const d = vx * l.nx + vz * l.nz;
  return [vx - 2 * d * l.nx, vz - 2 * d * l.nz];
}

/**
 * A one-bounce bank line from a to b off a mirror, or null. The bounce point
 * sits on the mirror face (inset from the ends) and both legs are clear.
 */
export function bankLine(ax: number, az: number, bx: number, bz: number, pieces: Piece[]): { mirror: Piece; px: number; pz: number; length: number } | null {
  let best: { mirror: Piece; px: number; pz: number; length: number } | null = null;
  for (const m of pieces) {
    if (m.kind !== 'mirror') continue;
    const l = mirrorLine(m);
    // Both points on the same side of the mirror.
    const sa = (ax - l.x) * l.nx + (az - l.z) * l.nz;
    const sb = (bx - l.x) * l.nx + (bz - l.z) * l.nz;
    if (sa * sb <= 0 || Math.abs(sa) < 0.4 || Math.abs(sb) < 0.4) continue;
    // Reflect b across the mirror line and aim at it.
    const rx = bx - 2 * sb * l.nx;
    const rz = bz - 2 * sb * l.nz;
    const t = sa / (sa + sb);
    const px = ax + (rx - ax) * t;
    const pz = az + (rz - az) * t;
    const along = (px - l.x) * l.dx + (pz - l.z) * l.dz;
    if (Math.abs(along) > l.half - 0.25) continue;
    // The bounce point sits just off the face, on the shooters' side.
    const off = sa > 0 ? 0.2 + m.hd : -(0.2 + m.hd);
    const qx = px + l.nx * off;
    const qz = pz + l.nz * off;
    const others = pieces.filter((p) => p !== m);
    if (!clearLine(ax, az, qx, qz, others, 1.0) || !clearLine(qx, qz, bx, bz, others, 1.0)) continue;
    const length = Math.hypot(qx - ax, qz - az) + Math.hypot(bx - qx, bz - qz);
    if (!best || length < best.length) best = { mirror: m, px: qx, pz: qz, length };
  }
  return best;
}

/** Inside the arena floor (with a margin for a radius). */
export function inArena(x: number, z: number, r = 0): boolean {
  return x > ARENA.x0 + r && x < ARENA.x1 - r && z > ARENA.z0 + r && z < ARENA.z1 - r;
}

/** Whether a circle overlaps any piece. */
export function circleHitsPiece(x: number, z: number, r: number, pieces: Piece[]): boolean {
  for (const p of pieces) {
    if (p.kind === 'pillar') {
      if (Math.hypot(x - p.x, z - p.z) < p.hw + r) return true;
      continue;
    }
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    const lx = (x - p.x) * c - (z - p.z) * s;
    const lz = (x - p.x) * s + (z - p.z) * c;
    const cx = Math.max(-p.hw, Math.min(p.hw, lx));
    const cz = Math.max(-p.hd, Math.min(p.hd, lz));
    if ((lx - cx) ** 2 + (lz - cz) ** 2 < r * r) return true;
  }
  return false;
}
