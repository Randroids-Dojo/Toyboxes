// The Golden Paddle's deck plan as plain data: zones, walls, colliders,
// spots and gates. No THREE and no DOM, so the layout tests can check it.
//
// Units are metres. x runs along the boat (bow at negative x, stern at
// positive x), z across (starboard negative, port positive), y up. Yaw 0
// faces +z.

export type ZoneId = 'saloon' | 'stern' | 'lounge' | 'wheelhouse' | 'bay';

export interface Pt {
  x: number;
  z: number;
}

export interface SpotDef extends Pt {
  range: number;
  /** Which way you face to play here. */
  yaw: number;
}

/** A gap in a wall: from and to are distances along the wall from `a`. */
export interface Opening {
  from: number;
  to: number;
  /** Height of the opening's top (the arch's springing line when `arch`). */
  top: number;
  /** Bottom of the opening (0 for doors). */
  sill: number;
  arch?: boolean;
  /** A glazed window (glass fills it) rather than a walk-through opening. */
  glass?: boolean;
}

export interface WallDef {
  id: string;
  a: Pt;
  b: Pt;
  height: number;
  zone: ZoneId;
  /**
   * Exterior walls drop to their skirting whenever the camera is outside
   * them; interior ones only when they come between the camera and the player.
   */
  exterior: boolean;
  openings: Opening[];
  /** Inner wall face colour scheme. */
  scheme: 'saloon' | 'lounge' | 'wheelhouse' | 'bay';
  /** Interior partitions are finished on their far side too. */
  back?: 'saloon' | 'lounge' | 'wheelhouse' | 'bay';
}

const PI = Math.PI;

// ---------------------------------------------------------------------------
// Zones

export const SALOON = { x0: -12, x1: 12, z0: -9, z1: 9, height: 6 };
export const CLERESTORY = { x0: -10, x1: 10, z0: -4, z1: 4, height: 8.6 };
export const BAY = { x0: -5, x1: 5, z0: -12.5, height: 9.5 };
export const STERN = { x0: 12.3, x1: 21, z0: -8, z1: 8 };
export const LOUNGE = { x0: -21, x1: -12.3, halfAtSaloon: 9, halfAtBow: 6.5, height: 5.2 };
export const WHEELHOUSE = { x0: -28.5, x1: -21.3, halfAtLounge: 6.5, halfAtBow: 2.5, height: 4.6 };
export const WATER_Y = -1.6;
export const T = 0.3;

/** Half the boat's inner width at a point along a tapering section. */
export function loungeHalf(x: number): number {
  const k = (LOUNGE.x1 - x) / (LOUNGE.x1 - LOUNGE.x0);
  return LOUNGE.halfAtSaloon + (LOUNGE.halfAtBow - LOUNGE.halfAtSaloon) * Math.min(1, Math.max(0, k));
}

export function wheelhouseHalf(x: number): number {
  const k = (WHEELHOUSE.x1 - x) / (WHEELHOUSE.x1 - WHEELHOUSE.x0);
  return WHEELHOUSE.halfAtLounge + (WHEELHOUSE.halfAtBow - WHEELHOUSE.halfAtLounge) * Math.min(1, Math.max(0, k));
}

/** Which zone a point is in, or null outside the boat. */
export function zoneAt(x: number, z: number): ZoneId | null {
  if (x >= BAY.x0 && x <= BAY.x1 && z < SALOON.z0 && z >= BAY.z0) return 'bay';
  if (x >= SALOON.x0 - 0.2 && x <= SALOON.x1 + 0.2 && Math.abs(z) <= SALOON.z1) return 'saloon';
  if (x > SALOON.x1 + 0.2 && x <= STERN.x1 + 0.2 && Math.abs(z) <= STERN.z1 + 0.2) return 'stern';
  if (x < SALOON.x0 - 0.2 && x >= LOUNGE.x0 - 0.2 && Math.abs(z) <= loungeHalf(x)) return 'lounge';
  if (x < LOUNGE.x0 - 0.2 && x >= WHEELHOUSE.x0 && Math.abs(z) <= wheelhouseHalf(x)) return 'wheelhouse';
  return null;
}

// ---------------------------------------------------------------------------
// Spots

export const ARRIVAL = { x: 0, z: 6.4, yaw: PI };
export const EXIT: Pt = { x: 0, z: 8.4 };
export const EXIT_RANGE = 1.7;

export const SPOTS = {
  lever: { x: 0, z: -8.6, range: 2.4, yaw: PI },
  telegraph: { x: -3.6, z: -7.7, range: 1.1, yaw: PI },
  paytable: { x: 6.2, z: -7.6, range: 1.2, yaw: PI },
  fame: { x: -8, z: -7.6, range: 1.4, yaw: PI },
  roulette: { x: -6.0, z: -0.9, range: 1.9, yaw: PI },
  blackjack: { x: -7.5, z: 5.0, range: 1.9, yaw: PI },
  penny: { x: -5, z: 6.3, range: 1.6, yaw: 0 },
  logbook: { x: 7.5, z: 5.0, range: 1.6, yaw: 0 },
  loungeGate: { x: -10.6, z: 0, range: 1.6, yaw: -PI / 2 },
  wheel: { x: 15.9, z: 0, range: 1.8, yaw: PI / 2 },
  falls: { x: -14.4, z: -4.9, range: 1.8, yaw: -2.4 },
  poker0: { x: -14.5, z: 5.3, range: 1.1, yaw: 0 },
  poker1: { x: -16.5, z: 5.3, range: 1.1, yaw: 0 },
  poker2: { x: -18.5, z: 5.3, range: 1.1, yaw: 0 },
  wheelhouseGate: { x: -20.0, z: 0, range: 1.6, yaw: -PI / 2 },
  captain: { x: -23.6, z: 0.6, range: 1.8, yaw: PI },
  helm: { x: -26.6, z: 0, range: 1.4, yaw: -PI / 2 },
} satisfies Record<string, SpotDef>;

export type SpotId = keyof typeof SPOTS;

// ---------------------------------------------------------------------------
// Furniture positions (the builders and colliders share them)

export const OLD_LUCKY = { x: 0, z: -11.0, w: 5.0, d: 2.2, h: 7.2, face: -9.9 };
export const TELEGRAPH = { x: -3.6, z: -8.4 };
export const ROULETTE = { x: -6.5, z: -2.6, w: 3.8, d: 2.0 };
export const BLACKJACK = { x: -7.5, z: 2.6, r: 1.8 };
export const PENNY = { x0: -7, x1: -3, z0: 7.2, z1: 9 };
export const LOGBOOK = { table: { x: 7.5, z: 6.3, w: 2.4, d: 1.4 }, chairs: [{ x: 5.2, z: 5.6 }, { x: 9.8, z: 5.6 }], shelves: { x0: 4.5, x1: 10.5, z: 8.55 } };
export const STAGE = { x: -12, z: -9, r: 2.6, h: 0.25 };
export const COLUMNS: Pt[] = [-10, -3.5, 3.5, 10].flatMap((x) => [{ x, z: -4.2 }, { x, z: 4.2 }]);
export const SODA = { x0: 8, x1: 11.5, z: -8.45 };
export const RIVER_WHEEL = { x: 19.6, y: 3.9, z: 0, r: 3.1 };
export const WHEEL_RAIL = { x: 16.6, z: 0 };
export const STERNWHEEL = { x: 24.5, y: 0.9, r: 3.4, width: 14 };
export const FALLS = { x: -16.5, z: -6.6, w: 3.6, h: 4.1 };
export const POKER_CABINETS: Pt[] = [{ x: -14.5, z: 6.3 }, { x: -16.5, z: 6.3 }, { x: -18.5, z: 6.3 }];
export const LOUNGE_TABLES: Pt[] = [{ x: -14.2, z: -1.8 }, { x: -18.4, z: -2.6 }, { x: -14.6, z: 2.4 }, { x: -18.6, z: 2.2 }];
export const CAPTAIN_TABLE = { x: -23.6, z: -1.8, r: 1.8 };
export const HELM = { x: -27.6, z: 0 };
export const LOUNGE_GATE = { x: -12.15, from: -2, to: 2, rope: -11.6 };
export const WHEELHOUSE_GATE = { x: -21.15, from: -1.2, to: 1.2, rope: -20.85 };
export const STERN_DOORS = { x: 12.15, from: -2.5, to: 2.5 };

// ---------------------------------------------------------------------------
// Walls

function windowsAlong(len: number, every: number, skip: (d: number) => boolean, opts: Partial<Opening> = {}, width = 2): Opening[] {
  const out: Opening[] = [];
  for (let d = every / 2; d < len - 0.5; d += every) {
    if (skip(d)) continue;
    out.push({ from: d - width / 2, to: d + width / 2, sill: 1.5, top: 4.0, arch: true, glass: true, ...opts });
  }
  return out;
}

const loungeLen = Math.hypot(LOUNGE.x1 - LOUNGE.x0, LOUNGE.halfAtSaloon - LOUNGE.halfAtBow);
const wheelLen = Math.hypot(WHEELHOUSE.x1 - WHEELHOUSE.x0, WHEELHOUSE.halfAtLounge - WHEELHOUSE.halfAtBow);

export const WALLS: WallDef[] = [
  // Grand Saloon. Port wall (gangway), run from bow to stern.
  {
    id: 'port',
    a: { x: SALOON.x0, z: SALOON.z1 + T / 2 },
    b: { x: SALOON.x1, z: SALOON.z1 + T / 2 },
    height: SALOON.height,
    zone: 'saloon',
    exterior: true,
    scheme: 'saloon',
    openings: [
      ...windowsAlong(24, 4, (d) => Math.abs(d - 12) < 2.5 || (d > 4 && d < 10) || d > 15),
      { from: 12 - 1.1, to: 12 + 1.1, sill: 0, top: 2.6, arch: true },
    ],
  },
  // Starboard wall, broken by Old Lucky's bay.
  { id: 'starA', a: { x: BAY.x0, z: SALOON.z0 - T / 2 }, b: { x: SALOON.x0, z: SALOON.z0 - T / 2 }, height: SALOON.height, zone: 'saloon', exterior: true, scheme: 'saloon', openings: windowsAlong(7, 3.5, (d) => d < 4.5) },
  { id: 'starB', a: { x: SALOON.x1, z: SALOON.z0 - T / 2 }, b: { x: BAY.x1, z: SALOON.z0 - T / 2 }, height: SALOON.height, zone: 'saloon', exterior: true, scheme: 'saloon', openings: windowsAlong(7, 3.5, (d) => d > 4.5) },
  // Old Lucky's bay: a lit proscenium box out over the water.
  { id: 'bayW', a: { x: BAY.x0 - T / 2, z: BAY.z0 }, b: { x: BAY.x0 - T / 2, z: SALOON.z0 - T }, height: BAY.height, zone: 'bay', exterior: false, scheme: 'bay', openings: [] },
  { id: 'bayE', a: { x: BAY.x1 + T / 2, z: SALOON.z0 - T }, b: { x: BAY.x1 + T / 2, z: BAY.z0 }, height: BAY.height, zone: 'bay', exterior: false, scheme: 'bay', openings: [] },
  { id: 'bayBack', a: { x: BAY.x1 + T, z: BAY.z0 - T / 2 }, b: { x: BAY.x0 - T, z: BAY.z0 - T / 2 }, height: BAY.height, zone: 'bay', exterior: true, scheme: 'bay', openings: [] },
  // Stern wall with the glass doors onto the deck.
  { id: 'sternWall', a: { x: SALOON.x1 + T / 2, z: SALOON.z1 + T }, b: { x: SALOON.x1 + T / 2, z: SALOON.z0 - T }, height: SALOON.height, zone: 'saloon', exterior: true, scheme: 'saloon', openings: [{ from: 9.3 - 2.5, to: 9.3 + 2.5, sill: 0, top: 3.0 }, ...windowsAlong(18.6, 4.4, (d) => Math.abs(d - 9.3) < 3.5)] },
  // Bow partition into the Moonlight Lounge: an arch, glazed above.
  { id: 'loungePart', a: { x: SALOON.x0 - T / 2, z: SALOON.z0 - T }, b: { x: SALOON.x0 - T / 2, z: SALOON.z1 + T }, height: SALOON.height, zone: 'saloon', exterior: false, scheme: 'saloon', back: 'lounge', openings: [{ from: 9.3 - 2, to: 9.3 + 2, sill: 0, top: 3.2, arch: true }] },
  // Moonlight Lounge hull (tapers towards the bow).
  { id: 'loungePort', a: { x: LOUNGE.x0, z: LOUNGE.halfAtBow + T / 2 }, b: { x: SALOON.x0 - T, z: LOUNGE.halfAtSaloon + T / 2 }, height: LOUNGE.height, zone: 'lounge', exterior: true, scheme: 'lounge', openings: windowsAlong(loungeLen, 2.6, (d) => d < 1.8, { sill: 2.2, top: 3.6 }, 1.5) },
  { id: 'loungeStar', a: { x: SALOON.x0 - T, z: -LOUNGE.halfAtSaloon - T / 2 }, b: { x: LOUNGE.x0, z: -LOUNGE.halfAtBow - T / 2 }, height: LOUNGE.height, zone: 'lounge', exterior: true, scheme: 'lounge', openings: windowsAlong(loungeLen, 2.6, (d) => d < 1.8, { sill: 2.2, top: 3.6 }, 1.5) },
  // Wheelhouse partition, then the wheelhouse's wraparound windows.
  { id: 'wheelPart', a: { x: LOUNGE.x0 - T / 2, z: -LOUNGE.halfAtBow - T }, b: { x: LOUNGE.x0 - T / 2, z: LOUNGE.halfAtBow + T }, height: LOUNGE.height, zone: 'lounge', exterior: false, scheme: 'lounge', back: 'wheelhouse', openings: [{ from: LOUNGE.halfAtBow + T - 1.2, to: LOUNGE.halfAtBow + T + 1.2, sill: 0, top: 2.6, arch: true }] },
  { id: 'wheelPort', a: { x: WHEELHOUSE.x0, z: WHEELHOUSE.halfAtBow + T / 2 }, b: { x: LOUNGE.x0 - T, z: WHEELHOUSE.halfAtLounge + T / 2 }, height: WHEELHOUSE.height, zone: 'wheelhouse', exterior: true, scheme: 'wheelhouse', openings: [{ from: 0.8, to: wheelLen - 0.8, sill: 1.1, top: 3.4, glass: true }] },
  { id: 'wheelStar', a: { x: LOUNGE.x0 - T, z: -WHEELHOUSE.halfAtLounge - T / 2 }, b: { x: WHEELHOUSE.x0, z: -WHEELHOUSE.halfAtBow - T / 2 }, height: WHEELHOUSE.height, zone: 'wheelhouse', exterior: true, scheme: 'wheelhouse', openings: [{ from: 0.8, to: wheelLen - 0.8, sill: 1.1, top: 3.4, glass: true }] },
  { id: 'wheelBow', a: { x: WHEELHOUSE.x0 - T / 2, z: -WHEELHOUSE.halfAtBow - T }, b: { x: WHEELHOUSE.x0 - T / 2, z: WHEELHOUSE.halfAtBow + T }, height: WHEELHOUSE.height, zone: 'wheelhouse', exterior: true, scheme: 'wheelhouse', openings: [{ from: 0.6, to: 5.0, sill: 1.1, top: 3.4, glass: true }] },
];

/** Length of a wall. */
export function wallLength(w: WallDef): number {
  return Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
}

/**
 * The wall's inward normal: walls run so the inside is on their left when
 * walking from a to b, seen from above with x right and z down.
 */
export function wallNormal(w: WallDef): Pt {
  const len = wallLength(w);
  const dx = (w.b.x - w.a.x) / len;
  const dz = (w.b.z - w.a.z) / len;
  return { x: dz, z: -dx };
}

// ---------------------------------------------------------------------------
// Colliders, as plain shapes (casino/index.ts turns them into physics colliders)

export type ColliderDef =
  | { kind: 'box'; x: number; z: number; hx: number; hz: number; rot: number; h: number }
  | { kind: 'circle'; x: number; z: number; r: number; h: number };

export function wallBoxes(w: WallDef): ColliderDef[] {
  const len = wallLength(w);
  const dx = (w.b.x - w.a.x) / len;
  const dz = (w.b.z - w.a.z) / len;
  const rot = Math.atan2(dz, dx);
  const solid: [number, number][] = [];
  let at = 0;
  for (const o of [...w.openings].filter((o) => o.sill < 0.5 && !o.glass).sort((p, q) => p.from - q.from)) {
    if (o.from > at) solid.push([at, o.from]);
    at = o.to;
  }
  if (at < len) solid.push([at, len]);
  return solid.map(([s, e]) => {
    const mid = (s + e) / 2;
    // Physics boxes take a rotation about y; three's yaw runs the other way to atan2(dz, dx).
    return { kind: 'box' as const, x: w.a.x + dx * mid, z: w.a.z + dz * mid, hx: (e - s) / 2 + 0.05, hz: T / 2 + 0.05, rot: -rot, h: 10 };
  });
}

export const COLLIDERS: ColliderDef[] = [
  ...WALLS.flatMap(wallBoxes),
  // Stern deck rails.
  { kind: 'box', x: (STERN.x0 + STERN.x1) / 2, z: STERN.z1 + 0.1, hx: (STERN.x1 - STERN.x0) / 2, hz: 0.12, rot: 0, h: 1.2 },
  { kind: 'box', x: (STERN.x0 + STERN.x1) / 2, z: STERN.z0 - 0.1, hx: (STERN.x1 - STERN.x0) / 2, hz: 0.12, rot: 0, h: 1.2 },
  { kind: 'box', x: STERN.x1 + 0.1, z: 0, hx: 0.12, hz: STERN.z1 + 0.2, rot: 0, h: 1.2 },
  // Old Lucky and its telegraph.
  { kind: 'box', x: OLD_LUCKY.x, z: OLD_LUCKY.z, hx: 2.6, hz: 1.2, rot: 0, h: 8 },
  { kind: 'circle', x: TELEGRAPH.x, z: TELEGRAPH.z, r: 0.3, h: 1.3 },
  // Tables.
  { kind: 'box', x: ROULETTE.x, z: ROULETTE.z, hx: ROULETTE.w / 2, hz: ROULETTE.d / 2, rot: 0, h: 1.0 },
  { kind: 'circle', x: -6.5, z: -4.0, r: 0.42, h: 2.2 },
  { kind: 'circle', x: BLACKJACK.x, z: BLACKJACK.z, r: BLACKJACK.r, h: 1.0 },
  // Penny's cage counter.
  { kind: 'box', x: (PENNY.x0 + PENNY.x1) / 2, z: (PENNY.z0 + PENNY.z1) / 2 + 0.05, hx: (PENNY.x1 - PENNY.x0) / 2, hz: (PENNY.z1 - PENNY.z0) / 2, rot: 0, h: 2.6 },
  // Logbook nook.
  { kind: 'box', x: LOGBOOK.table.x, z: LOGBOOK.table.z, hx: LOGBOOK.table.w / 2, hz: LOGBOOK.table.d / 2, rot: 0, h: 1.0 },
  ...LOGBOOK.chairs.map((c) => ({ kind: 'circle' as const, x: c.x, z: c.z, r: 0.5, h: 1.0 })),
  { kind: 'box', x: (LOGBOOK.shelves.x0 + LOGBOOK.shelves.x1) / 2, z: LOGBOOK.shelves.z, hx: (LOGBOOK.shelves.x1 - LOGBOOK.shelves.x0) / 2, hz: 0.3, rot: 0, h: 2.4 },
  // Columns, soda bar.
  ...COLUMNS.map((c) => ({ kind: 'circle' as const, x: c.x, z: c.z, r: 0.32, h: 10 })),
  { kind: 'box', x: (SODA.x0 + SODA.x1) / 2, z: SODA.z, hx: (SODA.x1 - SODA.x0) / 2, hz: 0.4, rot: 0, h: 1.1 },
  // Stern deck: the River Wheel's frame and its betting rail.
  { kind: 'box', x: RIVER_WHEEL.x + 0.2, z: 0, hx: 0.6, hz: 1.8, rot: 0, h: 8 },
  { kind: 'box', x: WHEEL_RAIL.x, z: WHEEL_RAIL.z, hx: 0.15, hz: 1.4, rot: 0, h: 1.0 },
  // Moonlight Lounge.
  { kind: 'box', x: FALLS.x, z: FALLS.z, hx: 1.9, hz: 0.45, rot: 0, h: 6 },
  ...POKER_CABINETS.map((c) => ({ kind: 'box' as const, x: c.x, z: c.z, hx: 0.45, hz: 0.4, rot: 0, h: 1.9 })),
  ...LOUNGE_TABLES.map((c) => ({ kind: 'circle' as const, x: c.x, z: c.z, r: 0.45, h: 0.8 })),
  // Wheelhouse.
  { kind: 'circle', x: CAPTAIN_TABLE.x, z: CAPTAIN_TABLE.z, r: CAPTAIN_TABLE.r, h: 1.0 },
  { kind: 'circle', x: HELM.x, z: HELM.z, r: 0.45, h: 1.6 },
];

/** Ropes across the gates while they are closed. */
export const GATE_COLLIDERS: Record<'lounge' | 'wheelhouse', ColliderDef> = {
  lounge: { kind: 'box', x: LOUNGE_GATE.rope, z: 0, hx: 0.15, hz: 2.0, rot: 0, h: 1.0 },
  wheelhouse: { kind: 'box', x: WHEELHOUSE_GATE.rope, z: 0, hx: 0.15, hz: 1.2, rot: 0, h: 1.0 },
};

/** The glass doors to the stern deck, while closed. */
export const DOOR_COLLIDER: ColliderDef = { kind: 'box', x: STERN_DOORS.x, z: 0, hx: 0.12, hz: 2.5, rot: 0, h: 3 };

/** Distance from a point to a collider's edge (negative inside). */
export function colliderGap(c: ColliderDef, x: number, z: number, r = 0): number {
  if (c.kind === 'circle') return Math.hypot(x - c.x, z - c.z) - c.r - r;
  const cos = Math.cos(c.rot);
  const sin = Math.sin(c.rot);
  const lx = (x - c.x) * cos - (z - c.z) * sin;
  const lz = (x - c.x) * sin + (z - c.z) * cos;
  const ox = Math.abs(lx) - c.hx;
  const oz = Math.abs(lz) - c.hz;
  const outside = Math.hypot(Math.max(0, ox), Math.max(0, oz));
  return (outside > 0 ? outside : Math.max(ox, oz)) - r;
}
