// Rocket Rings: the twelve hoops of the sky rally round Little Puffington.
// Shared with the server, which uses the course length for the fastest
// possible time.

export interface Hoop {
  x: number;
  y: number;
  z: number;
  /** Which way you fly through it (normalised in `hoops()`). */
  nx: number;
  ny: number;
  nz: number;
}

/** Start pad on the green, then twelve hoops. */
export const RINGS_START = { x: 6, z: 5 };

const RAW: [number, number, number, ([number, number, number] | null)?][] = [
  // The first ring is low enough to run through, so everyone gets off to a start.
  [6, 1.9, -2],
  [8, 3.5, -9],
  [3, 4, -15],
  [-6, 6, -20],
  [-16, 8.5, -21],
  [-21, 14, -16.5],
  [-14, 10, -10],
  [-13, 7.6, -6, [0, 1, 0]],
  [-8, 7, 2],
  [-6.5, 11, -1],
  [0, 17, -1, [0, 1, 0]],
  [4, 3, 4],
];

export const HOOP_RADIUS = 1.6;

export function hoops(): Hoop[] {
  let px = RINGS_START.x;
  let py = 1;
  let pz = RINGS_START.z;
  return RAW.map(([x, y, z, n]) => {
    let [nx, ny, nz] = n ?? [x - px, (y - py) * 0.5, z - pz];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    px = x;
    py = y;
    pz = z;
    return { x, y, z, nx, ny, nz };
  });
}

/** Total flight from the start through every hoop, metres. */
export function courseLength(): number {
  let px = RINGS_START.x;
  let py = 1;
  let pz = RINGS_START.z;
  let len = 0;
  for (const [x, y, z] of RAW) {
    len += Math.hypot(x - px, y - py, z - pz);
    px = x;
    py = y;
    pz = z;
  }
  return len;
}

/** Faster than any real run (the whole course at 8 m/s with no stops), ms. */
export function ringsMinMs(): number {
  return Math.floor((courseLength() / 8) * 1000);
}

/** Golden beans for a rally time: finish, under 70 s, under 48 s. */
export function ringsBeans(ms: number | null): number {
  if (ms === null) return 0;
  return ms < 48_000 ? 3 : ms < 70_000 ? 2 : 1;
}

/** Does the segment a to b pass through the hoop's disc? */
export function crossesHoop(h: Hoop, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, radius = HOOP_RADIUS): boolean {
  const da = (a.x - h.x) * h.nx + (a.y - h.y) * h.ny + (a.z - h.z) * h.nz;
  const db = (b.x - h.x) * h.nx + (b.y - h.y) * h.ny + (b.z - h.z) * h.nz;
  if (da > 0 || db < 0) return false;
  const t = da === db ? 0 : da / (da - db);
  const px = a.x + (b.x - a.x) * t - h.x;
  const py = a.y + (b.y - a.y) * t - h.y;
  const pz = a.z + (b.z - a.z) * t - h.z;
  return Math.hypot(px, py, pz) <= radius;
}
