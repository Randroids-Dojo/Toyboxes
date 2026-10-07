// Data shapes and rules shared by the browser and the server.
//
// Everything here is plain TypeScript with no DOM or Node imports, because the
// Vercel functions import it too. Relative imports keep their `.js` extension.

import { trackProblem } from './track.js';

/** Claimable house entrances around the town square. */
export const SLOT_COUNT = 12;

/** Interior of every room and inner area, in metres. The door is on the +z wall. */
export const ROOM = {
  halfW: 7,
  halfD: 6,
  wallH: 3.6,
  /** Keep this strip clear from the door into the room. */
  corridor: { halfW: 1.5, fromZ: 2.6 },
  lectern: { x: -5.6, z: 1.2, r: 1.3 },
  chest: { x: 5.6, z: 1.2, r: 1.3 },
  /** Doors to inner areas on the back wall. */
  areaDoors: [-4, 0, 4] as const,
  areaDoorClear: { halfW: 1.1, depth: 1.6 },
} as const;

export const MAX_AREAS = ROOM.areaDoors.length;

/** Inner areas fill the side doors first, so a goal in the middle of the room stays clear. */
export function areaDoorX(index: number): number | undefined {
  return [ROOM.areaDoors[0], ROOM.areaDoors[2], ROOM.areaDoors[1]][index];
}
export const MAX_PROPS = 24;
export const MAX_PAGES = 60;
export const MAX_PAGE_TEXT = 2000;
export const MAX_SKETCH_POINTS = 6000;
export const MAX_STROKES = 200;
export const PIN_PATTERN = /^\d{4}$/;

export type PropKind = 'ball' | 'goal' | 'cone' | 'pins' | 'crate' | 'target';

export interface PropSpec {
  kind: PropKind;
  name: string;
  /** Rough size, used for picking and the selection ring. */
  radius: number;
  /** Footprint rectangle in the toy's own frame: half width, half depth, centre offset along its facing. */
  hw: number;
  hd: number;
  cz: number;
  max: number;
}

export const PROP_SPECS: Record<PropKind, PropSpec> = {
  ball: { kind: 'ball', name: 'Soccer ball', radius: 0.4, hw: 0.3, hd: 0.3, cz: 0, max: 3 },
  // The goal line is at the toy's origin and the net runs one metre behind it.
  goal: { kind: 'goal', name: 'Goal', radius: 1.6, hw: 1.6, hd: 0.6, cz: -0.5, max: 2 },
  cone: { kind: 'cone', name: 'Cone', radius: 0.3, hw: 0.25, hd: 0.25, cz: 0, max: 12 },
  pins: { kind: 'pins', name: 'Bowling pins', radius: 0.75, hw: 0.55, hd: 0.55, cz: 0, max: 2 },
  crate: { kind: 'crate', name: 'Block', radius: 0.55, hw: 0.5, hd: 0.5, cz: 0, max: 10 },
  target: { kind: 'target', name: 'Target', radius: 0.7, hw: 0.7, hd: 0.3, cz: 0, max: 3 },
};

export const PROP_KINDS = Object.keys(PROP_SPECS) as PropKind[];

export interface PropPlacement {
  id: string;
  kind: PropKind;
  x: number;
  z: number;
  /** Radians around the vertical axis. */
  rot: number;
}

export interface RoomTheme {
  wall: number;
  floor: number;
  trim: number;
}

export const WALL_COLORS = ['#f6e7c8', '#cfe8f5', '#f9d3d0', '#d8ecd0', '#e3d7f2', '#ffe9a8', '#c9d3e6', '#f3c9a6'];
export const FLOOR_COLORS = ['#c79a67', '#9a6b47', '#d9c3a0', '#7f8fa6', '#b5c99a', '#e4b9a0'];
export const TRIM_COLORS = ['#e8574a', '#f4b740', '#4aa3df', '#3fb68b', '#8a6bd1', '#f58a6b', '#2f3a56', '#ffffff'];

export const DEFAULT_THEME: RoomTheme = { wall: 0, floor: 0, trim: 0 };

export type PageStatus = 'requested' | 'building' | 'available';

export interface Stroke {
  /** Index into SKETCH_COLORS. */
  c: number;
  /** Pen width index into SKETCH_WIDTHS. */
  w: number;
  /** Flat x,y pairs in 0..1000 page space. */
  p: number[];
}

export const SKETCH_COLORS = ['#2b2340', '#e8574a', '#4aa3df', '#3fb68b', '#f4b740', '#8a6bd1'];
export const SKETCH_WIDTHS = [3, 7, 14];

export interface Page {
  id: string;
  /** Page number in the book, assigned once and never reused. */
  n: number;
  text: string;
  sketch: Stroke[];
  createdAt: number;
  updatedAt: number;
  rev: number;
  status: PageStatus;
}

export interface Exhibit {
  id: string;
  title: string;
  blurb: string;
  url: string;
  /** 'main' or an inner area id. */
  area: string;
  x: number;
  z: number;
  rot: number;
  color: number;
  /** Sketchbook page ids this was built from. */
  pages: string[];
  published: boolean;
}

/** A built game an inner area can hold instead of a plain toy room. */
export type Experience = { kind: 'kart'; track: number[]; laps: number } | { kind: 'casino' } | { kind: 'galaxy' } | { kind: 'neon' };

export const EXPERIENCE_KINDS = ['kart', 'casino', 'galaxy', 'neon'] as const;

/** The most orbs anyone could feed the black hole in one frenzy. */
export const GALAXY_MAX_SCORE = 150;

export interface Area {
  id: string;
  name: string;
  theme: RoomTheme;
  props: PropPlacement[];
  published: boolean;
  /** A kart track or casino; absent for a plain room with toys. */
  experience?: Experience | null;
  /** Sketchbook page ids this area was built from. */
  pages?: string[];
}

export interface RoomContent {
  rev: number;
  areas: Area[];
  exhibits: Exhibit[];
}

export const EMPTY_CONTENT: RoomContent = { rev: 0, areas: [], exhibits: [] };

/** What any visitor may see about a room. Never includes PIN data or owner keys. */
export interface RoomPublic {
  id: string;
  slot: number;
  ownerName: string;
  claimedAt: number;
  theme: RoomTheme;
  layout: PropPlacement[];
  rev: number;
  /** Published areas and exhibits only. */
  content: RoomContent;
}

export interface SlotSummary {
  slot: number;
  roomId: string | null;
  ownerName: string | null;
  theme: RoomTheme | null;
  /** True when the room has published games or areas. */
  hasContent: boolean;
}

// ---------------------------------------------------------------------------
// Names

const BLOCKED = ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'rape', 'nazi', 'hitler', 'bitch', 'whore', 'slut', 'dick', 'cock', 'pussy', 'penis', 'vagina'];

export const NAME_MIN = 2;
export const NAME_MAX = 16;

/** Normalises a player name, or returns null when it is unusable. */
export function cleanName(raw: string): string | null {
  const name = raw
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} _.'!-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
  if ([...name].length < NAME_MIN) return null;
  const flat = name.toLowerCase().replace(/[^a-z]/g, '');
  if (BLOCKED.some((w) => flat.includes(w))) return null;
  return name;
}

// ---------------------------------------------------------------------------
// Layout rules

export interface LayoutContext {
  /** Main rooms have the sketchbook lectern, toy chest and inner area doors. */
  kind: 'main' | 'area';
  /** Exhibits standing in this space. */
  exhibits: { x: number; z: number }[];
}

export const EXHIBIT_RADIUS = 0.9;

export interface Footprint {
  x: number;
  z: number;
  hw: number;
  hd: number;
  rot: number;
}

/** The rectangle a toy covers on the floor. */
export function footprint(p: Pick<PropPlacement, 'kind' | 'x' | 'z'> & { rot?: number }, grow = 0): Footprint {
  const s = PROP_SPECS[p.kind];
  const rot = p.rot ?? 0;
  // Local +z maps to world (sin rot, cos rot), matching three.js rotation.y.
  return { x: p.x + Math.sin(rot) * s.cz, z: p.z + Math.cos(rot) * s.cz, hw: s.hw + grow, hd: s.hd + grow, rot };
}

function corners(f: Footprint): [number, number][] {
  const c = Math.cos(f.rot);
  const s = Math.sin(f.rot);
  const out: [number, number][] = [];
  for (const [lx, lz] of [
    [-f.hw, -f.hd],
    [f.hw, -f.hd],
    [f.hw, f.hd],
    [-f.hw, f.hd],
  ]) {
    out.push([f.x + lx * c + lz * s, f.z - lx * s + lz * c]);
  }
  return out;
}

function axes(f: Footprint): [number, number][] {
  const c = Math.cos(f.rot);
  const s = Math.sin(f.rot);
  return [
    [c, -s],
    [s, c],
  ];
}

/** Separating-axis test for two rectangles. */
export function footprintsOverlap(a: Footprint, b: Footprint): boolean {
  const ca = corners(a);
  const cb = corners(b);
  for (const [ax, az] of [...axes(a), ...axes(b)]) {
    let amin = Infinity;
    let amax = -Infinity;
    let bmin = Infinity;
    let bmax = -Infinity;
    for (const [x, z] of ca) {
      const d = x * ax + z * az;
      amin = Math.min(amin, d);
      amax = Math.max(amax, d);
    }
    for (const [x, z] of cb) {
      const d = x * ax + z * az;
      bmin = Math.min(bmin, d);
      bmax = Math.max(bmax, d);
    }
    if (amax <= bmin || bmax <= amin) return false;
  }
  return true;
}

function footprintHitsCircle(f: Footprint, cx: number, cz: number, r: number): boolean {
  const dx = cx - f.x;
  const dz = cz - f.z;
  const c = Math.cos(f.rot);
  const s = Math.sin(f.rot);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const px = Math.max(-f.hw, Math.min(f.hw, lx));
  const pz = Math.max(-f.hd, Math.min(f.hd, lz));
  return (lx - px) ** 2 + (lz - pz) ** 2 < r * r;
}

function zone(x0: number, x1: number, z0: number, z1: number): Footprint {
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, rot: 0 };
}

/** Why a prop cannot stand at a spot, or null when it can. */
export function placementProblem(p: Pick<PropPlacement, 'kind' | 'x' | 'z'> & { rot?: number }, ctx: LayoutContext, others: PropPlacement[] = []): string | null {
  const spec = PROP_SPECS[p.kind];
  if (!spec) return 'Unknown toy';
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(p.rot ?? 0)) return 'Bad position';
  const f = footprint(p);
  for (const [x, z] of corners(f)) {
    if (Math.abs(x) > ROOM.halfW - 0.05 || Math.abs(z) > ROOM.halfD - 0.05) return 'Too close to the wall';
  }
  const c = ROOM.corridor;
  if (footprintsOverlap(f, zone(-c.halfW, c.halfW, c.fromZ, ROOM.halfD + 1))) return 'Keep the doorway clear';
  if (ctx.kind === 'main') {
    if (footprintHitsCircle(f, ROOM.lectern.x, ROOM.lectern.z, ROOM.lectern.r)) return 'Too close to the sketchbook';
    if (footprintHitsCircle(f, ROOM.chest.x, ROOM.chest.z, ROOM.chest.r)) return 'Too close to the toy chest';
    const d = ROOM.areaDoorClear;
    for (const dx of ROOM.areaDoors) {
      if (footprintsOverlap(f, zone(dx - d.halfW, dx + d.halfW, -ROOM.halfD - 1, -ROOM.halfD + d.depth))) return 'Keep the back doors clear';
    }
  }
  for (const e of ctx.exhibits) {
    if (footprintHitsCircle(f, e.x, e.z, EXHIBIT_RADIUS)) return 'Too close to a game';
  }
  const mine = footprint(p, -0.04);
  for (const o of others) {
    if (!PROP_SPECS[o.kind]) continue;
    if (footprintsOverlap(mine, footprint(o, -0.04))) return 'Too close to another toy';
  }
  return null;
}

/** Validates a whole layout. Returns the first problem found. */
export function layoutProblem(layout: PropPlacement[], ctx: LayoutContext): string | null {
  if (layout.length > MAX_PROPS) return `At most ${MAX_PROPS} toys`;
  const counts: Partial<Record<PropKind, number>> = {};
  const ids = new Set<string>();
  for (let i = 0; i < layout.length; i++) {
    const p = layout[i];
    if (ids.has(p.id)) return 'Duplicate toy id';
    ids.add(p.id);
    const spec = PROP_SPECS[p.kind];
    if (!spec) return 'Unknown toy';
    counts[p.kind] = (counts[p.kind] ?? 0) + 1;
    if (counts[p.kind]! > spec.max) return `At most ${spec.max} of ${spec.name.toLowerCase()}`;
    const problem = placementProblem(p, ctx, layout.slice(0, i));
    if (problem) return `${spec.name}: ${problem.toLowerCase()}`;
  }
  return null;
}

/** Exhibits that stand in a given space ('main' or an area id). */
export function exhibitsIn(content: RoomContent, area: string): Exhibit[] {
  return content.exhibits.filter((e) => e.area === area);
}

/** Only the parts of a room's content that visitors may see. */
export function publishedContent(content: RoomContent): RoomContent {
  const areas = content.areas.filter((a) => a.published);
  const areaIds = new Set(areas.map((a) => a.id));
  return {
    rev: content.rev,
    areas,
    exhibits: content.exhibits.filter((e) => e.published && (e.area === 'main' || areaIds.has(e.area))),
  };
}

/** Checks creator content before it is published. */
export function contentProblem(content: RoomContent): string | null {
  const areaIds = new Set<string>();
  for (const a of content.areas) {
    if (areaIds.has(a.id) || a.id === 'main') return `Duplicate area id ${a.id}`;
    areaIds.add(a.id);
    if (a.experience) {
      if (!EXPERIENCE_KINDS.includes(a.experience.kind)) return `${a.name}: unknown experience`;
      if (a.props.length) return `${a.name}: this kind of area has no toys`;
      if (exhibitsIn(content, a.id).length) return `${a.name}: move its game cabinets to another space`;
      if (a.experience.kind === 'kart') {
        const t = trackProblem(a.experience.track);
        if (t) return `${a.name}: ${t}`;
        if (!Number.isInteger(a.experience.laps) || a.experience.laps < 1 || a.experience.laps > 9) return `${a.name}: races need 1 to 9 laps`;
      }
      continue;
    }
    const problem = layoutProblem(a.props, { kind: 'area', exhibits: exhibitsIn(content, a.id) });
    if (problem) return `${a.name}: ${problem}`;
  }
  const ids = new Set<string>();
  for (const e of content.exhibits) {
    if (ids.has(e.id)) return `Duplicate game id ${e.id}`;
    ids.add(e.id);
    if (e.area !== 'main' && !areaIds.has(e.area)) return `${e.title}: unknown area`;
    if (!isSafeUrl(e.url)) return `${e.title}: the link must start with https:// or /`;
    const problem = exhibitProblem(e, e.area === 'main' ? 'main' : 'area');
    if (problem) return `${e.title}: ${problem}`;
  }
  return null;
}

/** Where a game cabinet may stand. */
export function exhibitProblem(e: { x: number; z: number }, kind: 'main' | 'area'): string | null {
  const r = EXHIBIT_RADIUS;
  if (Math.abs(e.x) > ROOM.halfW - r || Math.abs(e.z) > ROOM.halfD - r) return 'too close to a wall';
  if (Math.abs(e.x) < ROOM.corridor.halfW + r && e.z > ROOM.corridor.fromZ - r) return 'blocks the doorway';
  if (kind === 'main') {
    for (const f of [ROOM.lectern, ROOM.chest]) if (Math.hypot(e.x - f.x, e.z - f.z) < f.r + r) return 'too close to the sketchbook or toy chest';
    const d = ROOM.areaDoorClear;
    for (const dx of ROOM.areaDoors) if (Math.abs(e.x - dx) < d.halfW + r && e.z < -ROOM.halfD + d.depth + r) return 'blocks a back door';
  }
  return null;
}

export function isSafeUrl(url: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

export const ARCADES = [
  { id: 'spacechakra', name: 'SpaceChakra Arcade', url: 'https://www.spacechakra.com/#/arcade', host: 'spacechakra.com' },
  { id: 'vibecoded', name: 'VibeCoded Games', url: 'https://www.vibecoded.games/', host: 'vibecoded.games' },
] as const;

export type ArcadeId = (typeof ARCADES)[number]['id'];
