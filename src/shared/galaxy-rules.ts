// Rules for the black hole galaxy ("Black hole bloom"), shared by the browser
// and the server: the layout of the islands, how the black hole grows, star
// thresholds, the fixed round schedules and the ring run's split check.
// Pure and deterministic, no three.js, so the API can run it too.

// ---------------------------------------------------------------------------
// Layout (metres; x east, z south, y up)

export const HUB_R = 13;
export const BH = { x: 24, y: 6, z: -62 } as const;
/** Stars fed before the Horizon stair opens. */
export const STAR_GOAL = 12;

export interface Spot2 {
  x: number;
  z: number;
}
export interface Spot3 {
  x: number;
  y: number;
  z: number;
}

/** Where things stand on the hub. */
export const HUB = {
  arrival: { x: 0, z: 6, yaw: Math.PI + 0.12 },
  exit: { x: -8.5, z: 8.5 },
  shrine: { x: -7.5, z: -1.5 },
  chart: { x: 7.5, z: 3 },
  slings: {
    ring: { x: -8.5, z: -9 },
    storm: { x: 11.5, z: -3 },
    comet: { x: 8, z: 9.5 },
  },
  horizon: { x: -3, z: -12 },
} as const;

export const RING = { cx: -38, cz: -50, top: 6, inner: 22, outer: 28, mid: 25, planetR: 16, planetY: 6 } as const;
/** Angle of the ring point nearest the hub (where the run starts). */
export const RING_THETA0 = Math.atan2(-RING.cz, -RING.cx);
export const CINDER = { x: 54, z: -6, top: 3, r: 11 } as const;
export const DOCK = { x: 36, z: 36, top: 8, r: 7 } as const;

/** The Horizon stair: ten stones from just outside the hub's north rail up to the lip. */
export const STAIR: { x: number; y: number; z: number; r: number }[] = [
  { x: -4, y: 1.2, z: -16.5, r: 2.2 },
  { x: -8, y: 2.4, z: -21, r: 2 },
  { x: -9, y: 3.6, z: -26, r: 2 },
  { x: -8, y: 4.8, z: -32, r: 2 },
  { x: -6, y: 6, z: -38, r: 2 },
  { x: -3, y: 7.2, z: -43, r: 1.9 },
  { x: 1, y: 8.4, z: -47, r: 1.9 },
  { x: 4, y: 9.6, z: -51, r: 1.9 },
  { x: 7, y: 10.8, z: -55, r: 2 },
  { x: 10, y: 12, z: -59, r: 2.3 },
];

/** A point on the ring walkway: `s` is degrees along the run from the start line, `r` the radius. */
export function ringPoint(s: number, r: number): Spot2 {
  const th = RING_THETA0 - (s * Math.PI) / 180;
  return { x: RING.cx + Math.cos(th) * r, z: RING.cz + Math.sin(th) * r };
}

/** Where a point is along the ring: degrees from the start line in [0, 360), and its radius. */
export function ringCoords(x: number, z: number): { s: number; r: number } {
  const dx = x - RING.cx;
  const dz = z - RING.cz;
  let s = ((RING_THETA0 - Math.atan2(dz, dx)) * 180) / Math.PI;
  s = ((s % 360) + 360) % 360;
  return { s, r: Math.hypot(dx, dz) };
}

/** Which of the 48 walkway boxes are left out (two per gap). */
export const RING_BOXES = 48;
export const RING_GAPS: [number, number][] = [
  [75, 90],
  [165, 180],
  [255, 270],
  [322.5, 337.5],
];
/** Bounce blossom strips just before each gap. */
export const RING_BLOSSOMS: [number, number][] = [
  [70, 75],
  [160, 165],
  [250, 255],
  [317.5, 322.5],
];
/** Comet lanes: walk on and they whisk you along. */
export const RING_LANES: [number, number][] = [
  [32, 64],
  [216, 245],
];
export const LANE_SPEED = 14;
/** Horizontal speed of a blossom hop, a little over walking pace so a jump never beats it. */
export const BLOSSOM_SPEED = 6.5;
/** Landing point past a gap, in degrees after its far edge. */
export const GAP_LAND = 3.5;
export const RING_GATE_S = [6, 16, 26, 100, 110, 120, 130, 140, 150, 190, 200, 210, 280, 290, 300, 310];
export const RING_LAPS = 2;
export const RING_START_S = -6;
export const RING_RETURN_S = -15;
export const GATE_W = 3;
export const GATE_H = 3.2;
export const MISS_PENALTY_MS = 2000;

export interface Gate {
  /** Degrees along the whole run (lap 2 adds 360). */
  s: number;
  lap: number;
  side: 'in' | 'out';
  r0: number;
  r1: number;
}

export function ringGates(): Gate[] {
  const out: Gate[] = [];
  for (let lap = 0; lap < RING_LAPS; lap++) {
    RING_GATE_S.forEach((s, i) => {
      const side = (i + lap) % 2 === 0 ? 'in' : 'out';
      const c = side === 'in' ? RING.inner + 0.2 + GATE_W / 2 : RING.outer - 0.2 - GATE_W / 2;
      out.push({ s: s + lap * 360, lap, side, r0: c - GATE_W / 2, r1: c + GATE_W / 2 });
    });
  }
  return out;
}

/** The finish line, in degrees along the run. */
export const RING_FINISH_S = 360 * RING_LAPS;

/** Whether a lap angle sits over a gap. */
export function inRingGap(s: number): boolean {
  const a = ((s % 360) + 360) % 360;
  return RING_GAPS.some(([a0, a1]) => a > a0 && a < a1);
}

/** The walkway's boxes as plain data (x, z, half width, half depth, rotation), top at RING.top. */
export function ringBoxes(): { x: number; z: number; hw: number; hd: number; rot: number; k: number }[] {
  const out: { x: number; z: number; hw: number; hd: number; rot: number; k: number }[] = [];
  const step = 360 / RING_BOXES;
  const hw = RING.outer * Math.tan(((step / 2) * Math.PI) / 180);
  for (let k = 0; k < RING_BOXES; k++) {
    const s = (k + 0.5) * step;
    if (inRingGap(s)) continue;
    const p = ringPoint(s, RING.mid);
    const th = RING_THETA0 - (s * Math.PI) / 180;
    // The box's depth runs along the radius: local z is radial.
    out.push({ x: p.x, z: p.z, hw, hd: (RING.outer - RING.inner) / 2, rot: Math.PI / 2 - th, k });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Growth and progress

export function horizonRadius(fed: number): number {
  return Math.min(12, 4.5 + 0.625 * Math.max(0, fed));
}

export function diskOuter(fed: number): number {
  return 18 + 10 * Math.min(1, Math.max(0, fed) / STAR_GOAL);
}

export type Challenge = 'wake' | 'frenzy' | 'ring' | 'storm' | 'comet';
export type Island = 'ring' | 'storm' | 'comet';

/** Stars fed needed to open each island's sling. */
export const UNLOCK: Record<Island, number> = { ring: 1, storm: 3, comet: 6 };
export const TEASER_AT = 9;

/** Star thresholds per challenge (three stars), and the nova medal after the bloom. */
export const THRESHOLDS: Record<Exclude<Challenge, 'wake'>, { better: 'higher' | 'lower'; stars: [number, number, number]; nova: number }> = {
  frenzy: { better: 'higher', stars: [20, 40, 65], nova: 90 },
  ring: { better: 'lower', stars: [10 * 60_000, 62_000, 54_000], nova: 49_000 },
  storm: { better: 'higher', stars: [10, 20, 30], nova: 40 },
  comet: { better: 'higher', stars: [120, 210, 270], nova: 300 },
};

export function starsFor(mode: Exclude<Challenge, 'wake'>, value: number): number {
  const t = THRESHOLDS[mode];
  return t.stars.filter((x) => (t.better === 'higher' ? value >= x : value <= x)).length;
}

export function novaFor(mode: Exclude<Challenge, 'wake'>, value: number): boolean {
  const t = THRESHOLDS[mode];
  return t.better === 'higher' ? value >= t.nova : value <= t.nova;
}

// ---------------------------------------------------------------------------
// Randomness that is the same everywhere

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Feeding frenzy

export const FRENZY_SECONDS = 60;
export type OrbKind = 'plain' | 'gold' | 'moon';
export const ORB_POINTS: Record<OrbKind, number> = { plain: 1, gold: 3, moon: 5 };

export interface FrenzyOrb {
  t: number;
  x: number;
  z: number;
  kind: OrbKind;
}

/** Spots on the hub where orbs may appear: inside the rim, clear of pads and the shrine. */
export function orbSpotOk(x: number, z: number): boolean {
  const r = Math.hypot(x, z);
  if (r < 2 || r > HUB_R - 2.2) return false;
  const keep = [HUB.shrine, HUB.chart, HUB.exit, HUB.slings.ring, HUB.slings.storm, HUB.slings.comet, HUB.horizon];
  return keep.every((k) => Math.hypot(x - k.x, z - k.z) > 2.4);
}

/** The frenzy's fixed schedule: the same orbs at the same moments for everyone. */
export function frenzySchedule(seed = 12): FrenzyOrb[] {
  const rnd = rng(seed);
  const out: FrenzyOrb[] = [];
  // A handful waiting at the start, then a steady stream that quickens.
  let t = 0;
  let n = 0;
  while (t < FRENZY_SECONDS - 2) {
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 40; tries++) {
      // Mostly the northern half, toward the black hole.
      const a = (rnd() - 0.5) * Math.PI * 1.5;
      const r = 2.5 + rnd() * 8.5;
      x = Math.sin(a) * r;
      z = -Math.cos(a) * r;
      if (orbSpotOk(x, z)) break;
    }
    const kind: OrbKind = n % 11 === 7 ? 'moon' : n % 5 === 3 ? 'gold' : 'plain';
    out.push({ t: Math.round(t * 100) / 100, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, kind });
    n++;
    t += n < 5 ? 0 : 1.25 - Math.min(0.45, t / 120);
  }
  return out;
}

export function frenzyTotal(schedule: FrenzyOrb[] = frenzySchedule()): number {
  return schedule.reduce((s, o) => s + ORB_POINTS[o.kind], 0);
}

// ---------------------------------------------------------------------------
// Rock rain (Cinder)

export const STORM_SECONDS = 60;
export const STORM_BPM = 116;
export const STORM_SHIELDS = 3;
export const METEOR_WARN = 1.5;

export interface Meteor {
  /** Impact time, seconds into the round. */
  t: number;
  /** Offset from Cinder's centre; ignored for aimed meteors, which fall where you stood when the warning started. */
  dx: number;
  dz: number;
  r: number;
  aim: boolean;
}

export interface Shard {
  t: number;
  dx: number;
  dz: number;
  big: boolean;
}

/** The hex tiles of Cinder, as offsets from its centre. */
export function cinderTiles(): Spot2[] {
  const size = 1.2;
  const out: Spot2[] = [];
  for (let q = -10; q <= 10; q++) {
    for (let r = -10; r <= 10; r++) {
      const x = size * 1.5 * q;
      const z = size * Math.sqrt(3) * (r + q / 2);
      if (Math.hypot(x, z) <= CINDER.r - 0.4) out.push({ x, z });
    }
  }
  return out;
}

/** The fixed rock rain: meteors on the beat, shards in sequence. */
export function stormSchedule(seed = 7): { meteors: Meteor[]; shards: Shard[] } {
  const rnd = rng(seed);
  const beat = 60 / STORM_BPM;
  const meteors: Meteor[] = [];
  const spot = (minR: number, maxR: number): Spot2 => {
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2;
      const r = minR + Math.sqrt(rnd()) * (maxR - minR);
      const p = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      // Never right on the spire.
      if (Math.hypot(p.x, p.z) > 2.2) return p;
    }
    return { x: 5, z: 0 };
  };
  let b = 4;
  let k = 0;
  while (b * beat < STORM_SECONDS - 0.5) {
    const t = b * beat;
    if (t > STORM_SECONDS - 20 && k % 4 === 0) {
      // A line of five across the island.
      const a = rnd() * Math.PI;
      const ox = (rnd() - 0.5) * 4;
      const oz = (rnd() - 0.5) * 4;
      for (let i = -2; i <= 2; i++) meteors.push({ t: t + (i + 2) * beat * 0.25, dx: ox + Math.cos(a) * i * 3.2, dz: oz + Math.sin(a) * i * 3.2, r: 1.5, aim: false });
      b += 4;
    } else {
      const p = spot(2.4, CINDER.r - 1.5);
      meteors.push({ t, dx: p.x, dz: p.z, r: t < 15 ? 1.5 : 1.75, aim: k % 4 === 1 });
      // Eases off for the first 15 s, then climbs to two a second.
      b += t < 15 ? 3 : t < 30 ? 2 : t < 40 ? 1.5 : 1;
    }
    k++;
  }
  const shards: Shard[] = [];
  let t = 1.5;
  let i = 0;
  while (t < STORM_SECONDS - 1) {
    const big = i > 0 && Math.floor(t / 15) !== Math.floor((t - 1.4) / 15);
    const p = spot(2.2, CINDER.r - 2);
    shards.push({ t: Math.round(t * 100) / 100, dx: Math.round(p.x * 100) / 100, dz: Math.round(p.z * 100) / 100, big });
    t += 1.4;
    i++;
  }
  return { meteors, shards };
}

export function stormTotal(s = stormSchedule()): number {
  return s.shards.reduce((n, x) => n + (x.big ? 3 : 1), 0);
}

// ---------------------------------------------------------------------------
// Comet surf

export const COMET_MOTES = 300;
export const COMET_SECONDS = 38;

/** The comet's loop through the galaxy, from the dock and back: control points of a closed curve. */
export const COMET_PATH: [number, number, number][] = [
  [44, 9.4, 36],
  [70, 14, 30],
  [92, 22, 8],
  [80, 28, -24],
  [52, 22, -40],
  [44, 26, -78],
  [26, 34, -110],
  [-8, 36, -112],
  [-34, 28, -92],
  [-16, 8, -84],
  [-12, -8, -66],
  [-17, -6, -54],
  [-19, 6, -50],
  [-16, 19, -42],
  [-6, 21, -20],
  [2, 18, -2],
  [18, 16, 24],
];

export interface CometCurve {
  length: number;
  /** Point at a share of the way round (0 to 1, arc length). */
  at(u: number): Spot3;
  /** Unit direction of travel at u. */
  dir(u: number): Spot3;
  /** How far you may steer from the path at u, metres. */
  tube(u: number): number;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t2 * t);
}

let curveCache: CometCurve | null = null;

export function cometCurve(): CometCurve {
  if (curveCache) return curveCache;
  const P = COMET_PATH;
  const n = P.length;
  const raw = (v: number): Spot3 => {
    const f = (((v % 1) + 1) % 1) * n;
    const i = Math.floor(f);
    const t = f - i;
    const a = P[(i - 1 + n) % n];
    const b = P[i];
    const c = P[(i + 1) % n];
    const d = P[(i + 2) % n];
    return { x: catmull(a[0], b[0], c[0], d[0], t), y: catmull(a[1], b[1], c[1], d[1], t), z: catmull(a[2], b[2], c[2], d[2], t) };
  };
  const N = 4000;
  const cum = new Float64Array(N + 1);
  let prev = raw(0);
  for (let i = 1; i <= N; i++) {
    const p = raw(i / N);
    cum[i] = cum[i - 1] + Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
    prev = p;
  }
  const length = cum[N];
  const toRaw = (u: number): number => {
    const target = (((u % 1) + 1) % 1) * length;
    let lo = 0;
    let hi = N;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid;
      else hi = mid;
    }
    const f = cum[hi] > cum[lo] ? (target - cum[lo]) / (cum[hi] - cum[lo]) : 0;
    return (lo + f) / N;
  };
  const at = (u: number) => raw(toRaw(u));
  const dir = (u: number): Spot3 => {
    const a = at(u - 0.0005);
    const b = at(u + 0.0005);
    const l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l, z: (b.z - a.z) / l };
  };
  const tube = (u: number): number => {
    const p = at(u);
    const rr = Math.hypot(p.x - RING.cx, p.z - RING.cz);
    // Through the gap between the planet and its ring the tube narrows.
    const nearPlane = 1 - Math.min(1, Math.max(0, (Math.abs(p.y - RING.top) - 4) / 5));
    const inGap = rr < RING.inner + 2 ? 1 : 0;
    // Room to steer opens up as you leave the dock and closes as you come home.
    const w = (((u % 1) + 1) % 1);
    const ramp = Math.min(1, w / 0.05, (1 - w) / 0.06);
    return (4.5 - 3.5 * nearPlane * inGap) * Math.max(0, ramp);
  };
  curveCache = { length, at, dir, tube };
  return curveCache;
}

export interface Mote {
  u: number;
  /** Offset across the path (right) and up, metres. */
  ox: number;
  oy: number;
  ribbon: number;
}

/** Where the 300 stardust motes hang: 24 ribbons of 12 or 13, each a different shape to steer through. */
export function cometMotes(): Mote[] {
  const out: Mote[] = [];
  const rnd = rng(31);
  const ribbons = 24;
  for (let i = 0; i < ribbons; i++) {
    const count = 12 + (i % 2);
    const u0 = 0.035 + (i / ribbons) * 0.93;
    const shape = i % 4;
    const ax = (rnd() - 0.5) * 4;
    const ay = (rnd() - 0.5) * 3;
    for (let j = 0; j < count; j++) {
      const k = j / (count - 1);
      let ox = ax;
      let oy = ay;
      if (shape === 1) {
        // A wave across the path.
        ox = Math.sin(k * Math.PI * 2) * 1.8;
        oy = ay * 0.5;
      } else if (shape === 2) {
        // A ring to fly straight through the middle of.
        ox = ax * 0.5 + Math.cos(k * Math.PI * 2) * 1.2;
        oy = ay * 0.5 + Math.sin(k * Math.PI * 2) * 1.2;
      } else if (shape === 3) {
        // A diagonal sweep.
        ox = -2 + k * 4;
        oy = ay * (1 - 2 * k);
      }
      out.push({ u: u0 + j * 0.0025, ox, oy, ribbon: i });
    }
  }
  // Keep every mote inside the tube where it hangs.
  const c = cometCurve();
  for (const m of out) {
    const t = c.tube(m.u) * 0.85;
    const l = Math.hypot(m.ox, m.oy);
    if (l > t) {
      m.ox *= t / l;
      m.oy *= t / l;
    }
  }
  return out;
}

/** Dark clouds on the comet's loop: fly through one and five motes shake loose. */
export function cometClouds(): Mote[] {
  return [0.11, 0.2, 0.33, 0.45, 0.58, 0.7, 0.83, 0.93].map((u, i) => ({ u, ox: [1.5, -2, 0, 2.2, -1.2, 1.8, -2.4, 0.6][i], oy: [0.5, -1, 1.5, 0, -1.5, 1, 0, -0.8][i], ribbon: -1 }));
}

// ---------------------------------------------------------------------------
// Ring run: the split check the server runs

export interface RingLog {
  v: 1;
  /** Milliseconds from Go to each gate line, in order (32 entries). */
  splits: number[];
  /** 1 where the gate was passed through, 0 where it was missed. */
  hits: number[];
  /** Milliseconds from Go to the finish line. */
  finish: number;
}

/** Shortest a stretch of the run can take, in ms: the inner edge at the fastest way to move there. */
export function ringSegmentMin(s0: number, s1: number): number {
  let ms = 0;
  const step = 0.5;
  for (let s = s0; s < s1; s += step) {
    const a = (((s + step / 2) % 360) + 360) % 360;
    const len = (RING.inner - 1) * ((Math.min(step, s1 - s) * Math.PI) / 180);
    const lane = RING_LANES.some(([a0, a1]) => a >= a0 && a < a1);
    ms += (len / (lane ? LANE_SPEED : BLOSSOM_SPEED)) * 1000;
  }
  return ms * 0.85;
}

/** The fastest time any real run could post, ms. */
export function ringMinMs(): number {
  return Math.floor(ringSegmentMin(0, RING_FINISH_S));
}

/** The official time for a run log (finish plus missed-gate penalties), or null if no real run could produce it. */
export function ringFromLog(log: unknown): number | null {
  if (!log || typeof log !== 'object') return null;
  const l = log as Partial<RingLog>;
  const gates = ringGates();
  if (l.v !== 1 || !Array.isArray(l.splits) || !Array.isArray(l.hits) || typeof l.finish !== 'number') return null;
  if (l.splits.length !== gates.length || l.hits.length !== gates.length) return null;
  let prevT = 0;
  let prevS = RING_START_S;
  const marks = [...l.splits, l.finish];
  const at = [...gates.map((g) => g.s), RING_FINISH_S];
  for (let i = 0; i < marks.length; i++) {
    const t = marks[i];
    if (typeof t !== 'number' || !Number.isFinite(t) || t <= prevT) return null;
    // From the start the clock starts behind the line, so the first stretch begins at the line.
    const from = i === 0 ? 0 : prevS;
    if (t - prevT < ringSegmentMin(from, at[i])) return null;
    prevT = t;
    prevS = at[i];
  }
  if (!l.hits.every((h) => h === 0 || h === 1)) return null;
  const misses = l.hits.filter((h) => h === 0).length;
  const total = Math.round(l.finish + misses * MISS_PENALTY_MS);
  if (total > 10 * 60_000) return null;
  return total;
}

// ---------------------------------------------------------------------------
// Flights: star slings, bounce blossoms and the star net

export interface Arc {
  from: Spot3;
  to: Spot3;
  /** Height of the top of the arc above the higher end. */
  apex: number;
  duration: number;
}

/** A star sling's flight between two pads. */
export function slingArc(from: Spot3, to: Spot3, gentle = false): Arc {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  return { from, to, apex: (0.25 * d + 6) * (gentle ? 0.6 : 1), duration: (1.2 + d / 30) * (gentle ? 1.25 : 1) };
}

/** A bounce blossom's hop: a set horizontal speed, so it is never slower than walking or jumping the gap. */
export function hopArc(from: Spot3, to: Spot3, apex = 2.4): Arc {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  return { from, to, apex, duration: Math.max(0.6, d / BLOSSOM_SPEED) };
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

/** Where an arc is at time t (seconds), and whether it has landed. Ends exactly on `to`. */
export function arcAt(a: Arc, t: number, eased = true): Spot3 & { done: boolean } {
  const u = Math.min(1, Math.max(0, t / a.duration));
  const e = eased ? ease(u) : u;
  const base = Math.max(a.from.y, a.to.y);
  // A parabola through both ends that peaks `apex` above the higher one.
  const y0 = a.from.y;
  const y1 = a.to.y;
  const h = base + a.apex;
  // y(e) = (1-e)^2 y0 + 2e(1-e) c + e^2 y1, with c chosen so the peak reaches h.
  const c = 2 * h - (y0 + y1) / 2;
  const y = (1 - e) * (1 - e) * y0 + 2 * e * (1 - e) * c + e * e * y1;
  if (u >= 1) return { x: a.to.x, y: a.to.y, z: a.to.z, done: true };
  return { x: a.from.x + (a.to.x - a.from.x) * e, y, z: a.from.z + (a.to.z - a.from.z) * e, done: false };
}

/** The star net catches a fall this far below the top you left. */
export const NET_DROP = 2.5;

export function netTriggered(y: number, grounded: boolean, lastTop: number, onHub: boolean): boolean {
  if (!grounded && y < lastTop - NET_DROP) return true;
  return grounded && y < 0.05 && !onHub && lastTop > 0.5;
}

/** Whether the segment from a to b crosses the gate's line within its span. */
export function crossesGate(a: Spot2, b: Spot2, g: Gate): 'hit' | 'miss' | null {
  const ca = ringCoords(a.x, a.z);
  const cb = ringCoords(b.x, b.z);
  const gs = ((g.s % 360) + 360) % 360;
  // Signed angle distance to the gate line from each end.
  const d = (s: number) => ((s - gs + 540) % 360) - 180;
  const da = d(ca.s);
  const db = d(cb.s);
  if (!(da < 0 && db >= 0)) return null;
  const f = da / (da - db);
  const r = ca.r + (cb.r - ca.r) * f;
  return r >= g.r0 && r <= g.r1 ? 'hit' : 'miss';
}
