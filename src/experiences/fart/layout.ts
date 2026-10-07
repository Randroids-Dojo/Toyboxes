// Little Puffington as data: every collider, bouncy canopy, perch and spot in
// the village. Pure, so the tests can check it (no coplanar overlaps, a clear
// arrival camera, reachable spots) without three.js.
//
// Coordinates are metres. x is east, z is south, yaw 0 faces +z (so north is
// yaw pi). Ground is y = 0 everywhere.

export interface LBox {
  id: string;
  x: number;
  z: number;
  hw: number;
  hd: number;
  h: number;
  rot?: number;
  /** Blocks the follow camera (default true for big buildings). */
  cam?: boolean;
}

export interface LCircle {
  id: string;
  x: number;
  z: number;
  r: number;
  h: number;
  cam?: boolean;
}

/** A trampoline: falling onto it bounces you. No collider. */
export interface Canopy {
  id: string;
  x: number;
  z: number;
  r: number;
  /** Height of the canvas. */
  y: number;
  /** Bounce speed, m/s (at least). */
  bounce: number;
  /** The canvas rises this much to its centre (a cone or a ridge). */
  peak: number;
}

/** Height of a canopy's surface at a distance from its centre. */
export function canopyTop(c: Canopy, d: number): number {
  return c.y + c.peak * Math.max(0, 1 - d / c.r);
}

export interface Pt {
  x: number;
  z: number;
}

export const VILLAGE = { half: 32, south: 33.5 };

export const ARRIVAL = { x: 0, z: 26, yaw: Math.PI };
/** The way back to the room: a garden gate in the west lane hedge. */
export const EXIT = { x: -2.6, z: 23.5 };

/** The balloon envelope: a sphere you bounce on and slide off. */
export const BALLOON = { x: 0, z: -1, cy: 11, r: 4.2, basketR: 1.3, basketH: 1.2 };

export const FOUNTAIN = { x: 0, z: -15, r: 3.6, rim: 0.6, water: 0.35 };
export const BANDSTAND = { x: -13, z: -6, r: 4.2, floor: 0.6, canopy: 4.6 };
export const BELL_TOWER = { x: -21, z: -21, base: 9, belfry: 13, spire: 17, bellY: 11.8 };
export const LIBRARY = { x: 19, z: -19, hw: 6, hd: 4.5, h: 7, door: { x: 19, z: -14.5 } };
/** The maypole's ribbons fan out to stakes, so its column is wide; the crown is a perch. */
export const MAYPOLE = { x: -5, z: 3, h: 7, r: 0.9 };
export const POND = { x: -25, z: 15, r: 4 };
export const WINDMILL = { x: -27, z: 3, h: 6 };
export const WASHING = { x: 25, y: 7, z0: 9.2, z1: 13.8 };

/** Places you can use something. Ranges are 1.4 to 1.8 m. */
export const SPOTS = {
  beans: { x: 1.9, z: 18.5, range: 1.6 },
  fizzy: { x: 14, z: 4.6, range: 1.6 },
  cabbage: { x: -15.6, z: 9, range: 1.6 },
  programme: { x: -1.9, z: 17.5, range: 1.5 },
  tootomatic: { x: 6.5, z: 10.1, range: 1.6 },
  rings: { x: 6, z: 5, range: 1.6 },
  band: { x: -8.3, z: -3.6, range: 1.6 },
  library: { x: 19, z: -13.4, range: 1.6 },
  picnic: { x: -15.4, z: 12.2, range: 1.6 },
} as const;

export type SpotId = keyof typeof SPOTS;

/** Roof gardens and the tower balcony have low walls round the edge. */
export const PARAPET = { t: 0.24, h: 0.5 };

export const ROOFED: { id: string; x: number; z: number; hw: number; hd: number; h: number }[] = [
  { id: 'tearoom', x: -11, z: 22, hw: 3, hd: 2.5, h: 4.5 },
  { id: 'house-a', x: 25, z: 6, hw: 3, hd: 3, h: 6.5 },
  { id: 'house-b', x: 25, z: 17, hw: 3, hd: 3, h: 7.5 },
  { id: 'cottage-c', x: -6, z: -27, hw: 3.5, hd: 2.5, h: 6 },
  { id: 'cottage-d', x: 7, z: -27, hw: 3.5, hd: 2.5, h: 5.5 },
  { id: 'library', x: LIBRARY.x, z: LIBRARY.z, hw: LIBRARY.hw, hd: LIBRARY.hd, h: LIBRARY.h },
  { id: 'tower-base', x: BELL_TOWER.x, z: BELL_TOWER.z, hw: 2, hd: 2, h: BELL_TOWER.base },
];

function parapets(r: (typeof ROOFED)[number]): LBox[] {
  const { t, h } = PARAPET;
  const top = r.h + h;
  const i = 0.01;
  return [
    { id: `${r.id}-wall-n`, x: r.x, z: r.z - r.hd + t / 2 + i, hw: r.hw - i, hd: t / 2, h: top, cam: false },
    { id: `${r.id}-wall-s`, x: r.x, z: r.z + r.hd - t / 2 - i, hw: r.hw - i, hd: t / 2, h: top, cam: false },
    { id: `${r.id}-wall-w`, x: r.x - r.hw + t / 2 + i, z: r.z, hw: t / 2, hd: r.hd - t - i * 2, h: top, cam: false },
    { id: `${r.id}-wall-e`, x: r.x + r.hw - t / 2 - i, z: r.z, hw: t / 2, hd: r.hd - t - i * 2, h: top, cam: false },
  ];
}

export function villageBoxes(): LBox[] {
  const b: LBox[] = [];
  for (const r of ROOFED) b.push(...parapets(r));
  const hedge = (id: string, x: number, z: number, hw: number, hd: number, h = 1.6) => b.push({ id, x, z, hw, hd, h, cam: false });
  // South lane hedges (the lane is x -3 to 3 from z 22 to the end).
  // The west lane hedge has a gap for the garden gate (the way out) at z 22.55 to 24.45.
  hedge('lane-w', -3.45, 28.925, 0.45, 4.475);
  hedge('lane-w2', -3.45, 21.975, 0.45, 0.575);
  b.push({ id: 'gate', x: -3.5, z: EXIT.z, hw: 0.08, hd: 0.94, h: 1.2, cam: false });
  hedge('lane-e', 3.45, 27.7, 0.45, 5.7);
  // Training hedge with the gap at x -3 to 3.
  hedge('hedge-w', -8.5, 12.5, 5.5, 0.4);
  hedge('hedge-e', 8.5, 12.5, 5.5, 0.4);
  // Gran's bean stall: counter facing the lane, tin table, Gran behind.
  b.push({ id: 'gran-counter', x: 3.4, z: 18.5, hw: 0.7, hd: 1.8, h: 1.1, cam: false });
  b.push({ id: 'tin-table', x: 4.6, z: 21.2, hw: 0.6, hd: 0.6, h: 0.8, cam: false });
  // Tea room.
  b.push({ id: 'tearoom', x: -11, z: 22, hw: 3, hd: 2.5, h: 4.5 });
  // Toot-o-Matic kiosk.
  b.push({ id: 'tootomatic', x: 6.5, z: 8.5, hw: 0.6, hd: 0.6, h: 2.4, cam: false });
  // Bandstand steps on the east side (each under the engine's 0.12 m step).
  for (let i = 0; i < 5; i++) b.push({ id: `band-step-${i}`, x: -8.35 + (4 - i) * 0.3 + 0.3, z: -6, hw: 0.15, hd: 1.2, h: (i + 1) * 0.1, cam: false });
  // Bell tower: base to the balcony, then the belfry.
  b.push({ id: 'tower-base', x: BELL_TOWER.x, z: BELL_TOWER.z, hw: 2, hd: 2, h: BELL_TOWER.base });
  b.push({ id: 'tower-belfry', x: BELL_TOWER.x, z: BELL_TOWER.z, hw: 1.1, hd: 1.1, h: BELL_TOWER.belfry });
  // Library.
  b.push({ id: 'library', x: LIBRARY.x, z: LIBRARY.z, hw: LIBRARY.hw, hd: LIBRARY.hd, h: LIBRARY.h });
  // Sentry hut.
  b.push({ id: 'sentry', x: 11, z: -8, hw: 0.8, hd: 0.8, h: 2.8, cam: false });
  // Pop cart and its crates.
  b.push({ id: 'popcart', x: 14, z: 3, hw: 1.2, hd: 0.6, h: 1.2, cam: false });
  b.push({ id: 'crates', x: 16.4, z: 1.4, hw: 0.5, hd: 0.5, h: 2.0, cam: false });
  // East townhouses with rooftop gardens.
  b.push({ id: 'house-a', x: 25, z: 6, hw: 3, hd: 3, h: 6.5 });
  b.push({ id: 'house-b', x: 25, z: 17, hw: 3, hd: 3, h: 7.5 });
  // North cottages.
  b.push({ id: 'cottage-c', x: -6, z: -27, hw: 3.5, hd: 2.5, h: 6 });
  b.push({ id: 'cottage-d', x: 7, z: -27, hw: 3.5, hd: 2.5, h: 5.5 });
  // Mr. Sprout's veg stall, facing east.
  b.push({ id: 'sprout-counter', x: -17.6, z: 9, hw: 0.7, hd: 1.8, h: 1.1, cam: false });
  // Fountain rim: 16 short boxes round the basin.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = FOUNTAIN.r - 0.2;
    b.push({ id: `rim-${i}`, x: FOUNTAIN.x + Math.cos(a) * rr, z: FOUNTAIN.z + Math.sin(a) * rr, hw: 0.2, hd: 0.72, h: FOUNTAIN.rim, rot: -a, cam: false });
  }
  // The edge of the village: tall, but the camera ignores it.
  const H = VILLAGE.half;
  b.push({ id: 'edge-n', x: 0, z: -H - 0.5, hw: H + 1, hd: 0.5, h: 40, cam: false });
  b.push({ id: 'edge-s', x: 0, z: VILLAGE.south + 0.5, hw: H + 1, hd: 0.5, h: 40, cam: false });
  b.push({ id: 'edge-w', x: -H - 0.5, z: 0, hw: 0.5, hd: H + 2, h: 40, cam: false });
  b.push({ id: 'edge-e', x: H + 0.5, z: 0, hw: 0.5, hd: H + 2, h: 40, cam: false });
  // The south strip outside the lane is garden wall.
  b.push({ id: 'south-w', x: -18, z: 32.9, hw: 14.1, hd: 0.6, h: 2.2, cam: false });
  b.push({ id: 'south-e', x: 18, z: 32.9, hw: 14.1, hd: 0.6, h: 2.2, cam: false });
  return b;
}

export function villageCircles(): LCircle[] {
  const c: LCircle[] = [];
  c.push({ id: 'bean-sign', x: 6.6, z: 18.5, r: 0.35, h: 4.8, cam: false });
  for (const [i, [x, z]] of [[-5, 16], [-8, 14.6], [-7, 19]].entries()) c.push({ id: `tea-table-${i}`, x, z, r: 0.6, h: 0.8, cam: false });
  c.push({ id: 'maypole', x: MAYPOLE.x, z: MAYPOLE.z, r: MAYPOLE.r, h: MAYPOLE.h, cam: false });
  c.push({ id: 'basket', x: BALLOON.x, z: BALLOON.z, r: BALLOON.basketR, h: BALLOON.basketH, cam: false });
  c.push({ id: 'balloon-pole', x: BALLOON.x, z: BALLOON.z, r: 0.5, h: BALLOON.cy - BALLOON.r, cam: false });
  c.push({ id: 'plinth', x: FOUNTAIN.x, z: FOUNTAIN.z, r: 1.0, h: 2.4, cam: false });
  c.push({ id: 'statue', x: FOUNTAIN.x, z: FOUNTAIN.z, r: 0.5, h: 4.6, cam: false });
  c.push({ id: 'band-floor', x: BANDSTAND.x, z: BANDSTAND.z, r: BANDSTAND.r, h: BANDSTAND.floor, cam: false });
  c.push({ id: 'band-pillar', x: BANDSTAND.x, z: BANDSTAND.z, r: 0.45, h: 4.4, cam: false });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    c.push({ id: `band-post-${i}`, x: BANDSTAND.x + Math.cos(a) * 3.9, z: BANDSTAND.z + Math.sin(a) * 3.9, r: 0.15, h: 4.4, cam: false });
  }
  c.push({ id: 'spire', x: BELL_TOWER.x, z: BELL_TOWER.z, r: 0.3, h: BELL_TOWER.spire, cam: false });
  c.push({ id: 'windmill', x: WINDMILL.x, z: WINDMILL.z, r: 1.2, h: WINDMILL.h, cam: false });
  c.push({ id: 'chimney-a', x: 26.6, z: 4.4, r: 0.4, h: 8, cam: false });
  c.push({ id: 'chimney-b', x: 23.4, z: 18.6, r: 0.4, h: 9, cam: false });
  c.push({ id: 'arch-w', x: -3.2, z: 24.5, r: 0.25, h: 3.2, cam: false });
  c.push({ id: 'arch-e', x: 3.2, z: 24.5, r: 0.25, h: 3.2, cam: false });
  LAMPS.forEach((l, i) => c.push({ id: `lamp-${i}`, x: l.x, z: l.z, r: 0.13, h: 3.4, cam: false }));
  c.push({ id: 'prog-post-0', x: -3.0, z: 16.7, r: 0.12, h: 2.4, cam: false });
  c.push({ id: 'prog-post-1', x: -3.0, z: 18.3, r: 0.12, h: 2.4, cam: false });
  return c;
}

export function canopies(): Canopy[] {
  return [
    { id: 'gran-awning', x: 3.6, z: 18.5, r: 1.9, y: 2.6, bounce: 9, peak: 0.45 },
    { id: 'bandstand', x: BANDSTAND.x, z: BANDSTAND.z, r: 4.6, y: BANDSTAND.canopy, bounce: 9.5, peak: 1.6 },
    { id: 'umbrella', x: 14, z: 3, r: 1.6, y: 2.7, bounce: 9, peak: 0.6 },
    { id: 'sprout-awning', x: -17.8, z: 9, r: 1.9, y: 2.6, bounce: 9, peak: 0.45 },
  ];
}

/** Lamp posts with lanterns (bunting hangs between them). */
export const LAMPS: Pt[] = [
  ...[20, 65, 115, 160, 232, 290, 335].map((d) => ({ x: Math.round(Math.cos((d * Math.PI) / 180) * 15.8 * 100) / 100, z: Math.round(Math.sin((d * Math.PI) / 180) * 15.8 * 100) / 100 })),
  { x: -2.65, z: 31 },
  { x: 2.65, z: 31 },
  { x: 2.65, z: 22.6 },
  { x: 14.6, z: -13.2 },
  { x: 23.4, z: -13.2 },
  { x: -16.6, z: -16.6 },
  { x: -16.4, z: 1.5 },
  { x: -16.8, z: 16.5 },
];

/** Gnome spots: x, z and the height they stand at. */
export const GNOMES: { x: number; z: number; y: number }[] = [
  { x: 21, z: 2, y: 0 },
  { x: 28.5, z: 11.5, y: 0 },
  { x: 21.5, z: 21.5, y: 0 },
  { x: -4, z: -22, y: 0 },
  { x: 10, z: -23, y: 0 },
  { x: -26, z: -14, y: 0 },
  { x: -11.8, z: 22.6, y: 4.5 },
  { x: 25.8, z: 17.6, y: 7.5 },
];

/** Picnic blankets in the park (centre, half size). */
export const BLANKETS: { x: number; z: number; rot: number }[] = [
  { x: -21, z: -0.5, rot: 0.2 },
  { x: -27.5, z: -1, rot: -0.3 },
  { x: -22, z: 5.5, rot: 0.6 },
  { x: -29, z: 8, rot: 0.1 },
  { x: -21.5, z: 11.5, rot: -0.4 },
  { x: -29, z: 19.5, rot: 0.3 },
  { x: -19.5, z: 18.5, rot: 0.8 },
  { x: -24.5, z: 22, rot: -0.2 },
];

/** Puff crumbs: floating refills laid along good routes (x, y, z). */
export const CRUMBS: [number, number, number][] = [
  // Over the training hedge, the arc of a jump and a boost.
  [8, 1.0, 14.2], [8, 2.3, 12.5], [8, 1.6, 10.8],
  // Up the maypole.
  [-5, 2.5, 4.7], [-5, 4.5, 4.7], [-5, 6.5, 4.5], [-5, 8.2, 3.4],
  // Bell tower climb.
  [-18.4, 4, -18.4], [-18.6, 7.5, -18.6], [-19.2, 10.2, -19.2],
  // The glide line from the tower to the balloon.
  [-15, 13, -14], [-10, 13.5, -9.5], [-5, 15, -5], [-1.4, 16.4, -2.2],
  // A loop round the green.
  [9, 0.9, 1], [10, 0.9, -3], [7, 0.9, -6], [-7, 0.9, -1], [-9, 0.9, 7],
];

/** Every static collider top you can stand on, with its id. */
export function perches(): { id: string; x: number; z: number; h: number }[] {
  return [...villageBoxes(), ...villageCircles()].filter((c) => c.h > 0.5 && c.h < 40).map((c) => ({ id: c.id, x: c.x, z: c.z, h: c.h }));
}

/** Height of the balloon envelope's top surface above (x, z), or null off it. */
export function balloonTop(x: number, z: number): number | null {
  const d = Math.hypot(x - BALLOON.x, z - BALLOON.z);
  if (d > BALLOON.r) return null;
  return BALLOON.cy + Math.sqrt(BALLOON.r * BALLOON.r - d * d);
}

/** Radius of the envelope's horizontal slice at height y, or 0 outside it. */
export function balloonSlice(y: number): number {
  const dy = y - BALLOON.cy;
  if (Math.abs(dy) >= BALLOON.r) return 0;
  return Math.sqrt(BALLOON.r * BALLOON.r - dy * dy);
}
