// Flat-ground collision: circles against upright boxes and cylinders.
// Everything that moves in Toyboxes rolls or walks on the floor, so a 2D
// solve with a height test is enough and stays cheap on phones and TVs.

export interface BoxCollider {
  kind: 'box';
  x: number;
  z: number;
  hw: number;
  hd: number;
  rot: number;
  cos: number;
  sin: number;
  /** Top of the box; things above it pass over. */
  h: number;
  /** Bounciness for balls, 0..1. */
  bounce: number;
  /** The camera ignores low or see-through things. */
  blocksCamera: boolean;
}

export interface CircleCollider {
  kind: 'circle';
  x: number;
  z: number;
  r: number;
  h: number;
  bounce: number;
  blocksCamera: boolean;
}

export type Collider = BoxCollider | CircleCollider;

export function box(x: number, z: number, hw: number, hd: number, rot = 0, h = 10, bounce = 0.5, blocksCamera = true): BoxCollider {
  return { kind: 'box', x, z, hw, hd, rot, cos: Math.cos(rot), sin: Math.sin(rot), h, bounce, blocksCamera };
}

export function circle(x: number, z: number, r: number, h = 10, bounce = 0.5, blocksCamera = true): CircleCollider {
  return { kind: 'circle', x, z, r, h, bounce, blocksCamera };
}

export interface Hit {
  nx: number;
  nz: number;
  depth: number;
  collider: Collider;
}

/**
 * Pushes a circle at (p.x, p.z) out of every collider it overlaps whose top is
 * above `y`. Mutates p and returns the deepest contact.
 */
export function resolveCircle(p: { x: number; z: number }, r: number, colliders: Collider[], y = 0): Hit | null {
  let best: Hit | null = null;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      if (y >= c.h) continue;
      const hit = c.kind === 'box' ? circleBox(p.x, p.z, r, c) : circleCircle(p.x, p.z, r, c);
      if (!hit) continue;
      p.x += hit.nx * hit.depth;
      p.z += hit.nz * hit.depth;
      if (!best || hit.depth > best.depth) best = hit;
    }
  }
  return best;
}

/**
 * Height of the highest top under a circle of radius r at (x, z) that is no
 * higher than `y` plus a small step, or 0 for the floor. Tall things (walls)
 * are never stood on because their tops are out of reach.
 */
export function groundHeight(x: number, z: number, r: number, colliders: Collider[], y: number): number {
  let top = 0;
  for (const c of colliders) {
    if (c.h <= top || c.h > y + 0.12) continue;
    const hit = c.kind === 'box' ? circleBox(x, z, r, c) : circleCircle(x, z, r, c);
    if (hit) top = c.h;
  }
  return top;
}

function circleCircle(x: number, z: number, r: number, c: CircleCollider): Hit | null {
  const dx = x - c.x;
  const dz = z - c.z;
  const d2 = dx * dx + dz * dz;
  const rr = r + c.r;
  if (d2 >= rr * rr) return null;
  const d = Math.sqrt(d2) || 1e-6;
  return { nx: dx / d, nz: dz / d, depth: rr - d, collider: c };
}

function circleBox(x: number, z: number, r: number, b: BoxCollider): Hit | null {
  // Into box space.
  const dx = x - b.x;
  const dz = z - b.z;
  const lx = dx * b.cos - dz * b.sin;
  const lz = dx * b.sin + dz * b.cos;
  const cx = Math.max(-b.hw, Math.min(b.hw, lx));
  const cz = Math.max(-b.hd, Math.min(b.hd, lz));
  let ox = lx - cx;
  let oz = lz - cz;
  const d2 = ox * ox + oz * oz;
  let nlx: number;
  let nlz: number;
  let depth: number;
  if (d2 > 1e-10) {
    if (d2 >= r * r) return null;
    const d = Math.sqrt(d2);
    nlx = ox / d;
    nlz = oz / d;
    depth = r - d;
  } else {
    // Centre inside the box: leave by the nearest face.
    const px = b.hw - Math.abs(lx);
    const pz = b.hd - Math.abs(lz);
    if (px < pz) {
      nlx = lx < 0 ? -1 : 1;
      nlz = 0;
      depth = px + r;
    } else {
      nlx = 0;
      nlz = lz < 0 ? -1 : 1;
      depth = pz + r;
    }
    ox = oz = 0;
  }
  // Back to world space (inverse rotation).
  const nx = nlx * b.cos + nlz * b.sin;
  const nz = -nlx * b.sin + nlz * b.cos;
  return { nx, nz, depth, collider: b };
}

/**
 * Distance along the ray from (ox, oy, oz) towards (tx, ty, tz) to the first
 * camera-blocking collider, as a fraction 0..1, or 1 when the way is clear.
 */
export function rayFraction(ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, colliders: Collider[]): number {
  let best = 1;
  const dx = tx - ox;
  const dy = ty - oy;
  const dz = tz - oz;
  for (const c of colliders) {
    if (!c.blocksCamera) continue;
    let t: number | null;
    if (c.kind === 'box') {
      const rx = ox - c.x;
      const rz = oz - c.z;
      const lx = rx * c.cos - rz * c.sin;
      const lz = rx * c.sin + rz * c.cos;
      const ldx = dx * c.cos - dz * c.sin;
      const ldz = dx * c.sin + dz * c.cos;
      t = slab(lx, lz, ldx, ldz, c.hw, c.hd);
    } else {
      t = rayCircle(ox - c.x, oz - c.z, dx, dz, c.r);
    }
    if (t === null || t >= best) continue;
    // Only count it if the ray is below the collider's top at that point.
    if (oy + dy * t < c.h) best = t;
  }
  return best;
}

function slab(ox: number, oz: number, dx: number, dz: number, hw: number, hd: number): number | null {
  let tmin = 0;
  let tmax = 1;
  for (const [o, d, h] of [
    [ox, dx, hw],
    [oz, dz, hd],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (o < -h || o > h) return null;
    } else {
      let t1 = (-h - o) / d;
      let t2 = (h - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

function rayCircle(ox: number, oz: number, dx: number, dz: number, r: number): number | null {
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return null;
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - r * r;
  if (c < 0) return 0;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

/** Time-based smoothing factor: alpha = 1 - exp(-lambda * dt). */
export function damp(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt);
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
