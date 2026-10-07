// Laser tag rules shared by the game and the server: difficulty knobs, the
// lock-on pick, points, and checking a match log before it reaches a board.

export type TagDiff = 'easy' | 'normal' | 'hard';
export type Team = 'cyan' | 'magenta';

export const TAG_DIFF_NAMES: Record<TagDiff, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

export interface Knobs {
  /** Seconds before a bot fires at someone it has just seen. */
  react: number;
  /** Aim error, standard deviation in degrees. */
  err: number;
  /** Share of the target's movement it leads. */
  lead: number;
  /** Seconds of visor flash before each shot. */
  tele: number;
  cool: number;
  boltSpeed: number;
  /** Bots that may shoot at the player at once. */
  tokens: number;
  flank: number;
  /** 0 nobody, 1 Glint, 2 Glint and Volt. */
  mirrors: number;
}

export const KNOBS: Record<TagDiff, Knobs> = {
  easy: { react: 0.9, err: 10, lead: 0, tele: 0.55, cool: 1.6, boltSpeed: 13, tokens: 1, flank: 0.1, mirrors: 0 },
  normal: { react: 0.6, err: 6, lead: 0.5, tele: 0.42, cool: 1.2, boltSpeed: 16, tokens: 2, flank: 0.3, mirrors: 1 },
  hard: { react: 0.38, err: 3.5, lead: 0.85, tele: 0.32, cool: 0.95, boltSpeed: 19, tokens: 2, flank: 0.5, mirrors: 2 },
};

export const PLAYER_BOLT_SPEED = 34;
export const FIRE_GAP = 0.3;
export const BEAT_WINDOW = 0.09;
export const HEAT_PER_SHOT = 1 / 6;
export const OVERHEAT = 1.4;
export const PIPS = 3;
export const OUT_SECONDS = 3;
export const SHIMMER = 1.5;
export const DEFLECT_WINDOW = 0.22;
export const LOCK_RANGE = 24;

export const TAG_POINTS = { tag: 100, bank: 100, reflect: 150, beat: 50, assist: 25, pickup: 25, win: 1000, most: 300 };

/** Par scores for gold stars. */
export const TAG_PAR: Record<TagDiff, number> = { easy: 1500, normal: 2200, hard: 3000 };

/** Board multiplier per difficulty (Easy stays on this device). */
export const TAG_BOARD_MULT: Record<TagDiff, number> = { easy: 0, normal: 1, hard: 1.25 };

export interface LockCandidate {
  id: number;
  x: number;
  z: number;
  /** Direct sight from the player. */
  visible: boolean;
  /** A one-bounce bank line exists. */
  bank: boolean;
}

function angleTo(px: number, pz: number, yaw: number, x: number, z: number): number {
  const a = Math.atan2(x - px, z - pz);
  let d = a - yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

const DEG = Math.PI / 180;

/**
 * Picks the lock-on target: the best enemy within 24 m inside 40 degrees of
 * the player's facing or 25 degrees of the camera's centre, preferring near
 * and central ones and direct sight over banks. The lock is sticky until the
 * target leaves 75 degrees or can no longer be reached.
 */
export function pickLock(px: number, pz: number, yaw: number, camYaw: number, cands: LockCandidate[], current: number | null): { id: number; bank: boolean } | null {
  if (current !== null) {
    const c = cands.find((x) => x.id === current);
    if (c && (c.visible || c.bank) && Math.hypot(c.x - px, c.z - pz) <= LOCK_RANGE + 2 && angleTo(px, pz, yaw, c.x, c.z) <= 75 * DEG) return { id: c.id, bank: !c.visible };
  }
  let best: { id: number; bank: boolean } | null = null;
  let bestScore = Infinity;
  for (const c of cands) {
    if (!c.visible && !c.bank) continue;
    const d = Math.hypot(c.x - px, c.z - pz);
    if (d > LOCK_RANGE) continue;
    const af = angleTo(px, pz, yaw, c.x, c.z);
    const ac = angleTo(px, pz, camYaw, c.x, c.z);
    const inFace = af <= 40 * DEG;
    const inCam = ac <= 25 * DEG;
    if (!inFace && !inCam) continue;
    const ang = Math.min(af / (40 * DEG), ac / (25 * DEG));
    const score = d / LOCK_RANGE + ang * 0.9 + (c.visible ? 0 : 0.6);
    if (score < bestScore) {
      bestScore = score;
      best = { id: c.id, bank: !c.visible };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Match logs

export type TagEventKind = 'tag' | 'bank' | 'reflect' | 'beat' | 'assist' | 'pickup';

export interface TagLog {
  diff: TagDiff;
  /** Match length in seconds (plus any sudden glow). */
  dur: number;
  /** [seconds, kind] for every scoring event, in order. */
  ev: [number, TagEventKind][];
  /** Final team points, yours first. */
  us: number;
  them: number;
  /** You made the most tags of anyone. */
  most: boolean;
}

export interface TagScore {
  total: number;
  tags: number;
  banks: number;
  reflects: number;
  beats: number;
  assists: number;
  pickups: number;
  win: boolean;
}

/** Points for a match log, or null for a log no real match could make. */
export function scoreTag(log: unknown): TagScore | null {
  if (!log || typeof log !== 'object') return null;
  const l = log as Partial<TagLog>;
  if (l.diff !== 'easy' && l.diff !== 'normal' && l.diff !== 'hard') return null;
  if (typeof l.dur !== 'number' || !(l.dur >= 20 && l.dur <= 240)) return null;
  if (!Number.isInteger(l.us) || !Number.isInteger(l.them) || l.us! < 0 || l.them! < 0 || l.us! > 200 || l.them! > 200) return null;
  if (typeof l.most !== 'boolean' || !Array.isArray(l.ev) || l.ev.length > 600) return null;
  const n = { tag: 0, bank: 0, reflect: 0, beat: 0, assist: 0, pickup: 0 };
  let lastTag = -Infinity;
  let lastT = -Infinity;
  const tagTimes = new Set<number>();
  for (const e of l.ev) {
    if (!Array.isArray(e) || e.length !== 2) return null;
    const [t, k] = e as [unknown, unknown];
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > l.dur + 0.5 || t < lastT) return null;
    if (typeof k !== 'string' || !(k in n)) return null;
    lastT = t;
    const kind = k as TagEventKind;
    if (kind === 'tag') {
      if (t - lastTag < 0.6) return null;
      lastTag = t;
      tagTimes.add(Math.round(t * 100));
    } else if (kind === 'bank' || kind === 'reflect' || kind === 'beat') {
      // A bonus belongs to the tag it rides on.
      if (!tagTimes.has(Math.round(t * 100))) return null;
    }
    n[kind]++;
  }
  if (n.tag > l.dur / 2 || n.bank + n.reflect > n.tag || n.beat > n.tag || n.tag > l.us! || n.assist > l.us! || n.pickup > Math.floor(l.dur / 30) * 2 + 2) return null;
  if (l.most && n.tag < 1) return null;
  const win = l.us! > l.them!;
  const P = TAG_POINTS;
  const total = n.tag * P.tag + n.bank * P.bank + n.reflect * P.reflect + n.beat * P.beat + n.assist * P.assist + n.pickup * P.pickup + (win ? P.win : 0) + (l.most ? P.most : 0);
  return { total, tags: n.tag, banks: n.bank, reflects: n.reflect, beats: n.beat, assists: n.assist, pickups: n.pickup, win };
}

/** Board points for a free play match (Easy stays local). */
export function tagBoardScore(log: unknown): number | null {
  const s = scoreTag(log);
  if (!s) return null;
  const mult = TAG_BOARD_MULT[(log as TagLog).diff];
  if (!mult) return null;
  return Math.round(s.total * mult);
}

/** The most points a match of this length could make (for the board's range). */
export function tagCeiling(dur: number): number {
  const tags = Math.floor(dur / 2);
  const P = TAG_POINTS;
  return Math.round((tags * (P.tag + P.reflect + P.beat + P.assist) + (Math.floor(dur / 30) * 2 + 2) * P.pickup + P.win + P.most) * 1.25);
}

/** Free play stars: win, par, par x 1.3; a crown at par x 1.6. */
export function tagStars(diff: TagDiff, s: TagScore): number {
  if (!s.win) return 0;
  const par = TAG_PAR[diff];
  return s.total >= par * 1.3 ? 3 : s.total >= par ? 2 : 1;
}
