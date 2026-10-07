// Club Nova's save on this device: sync settings, stars and crowns, personal
// bests, nights finished, cosmetics, tutorials seen and a party night in
// progress. Old or broken records are repaired field by field.

import { Progress } from '../kit/progress';
import { totalStars, UNLOCKS } from '../../shared/neon/progress';

export interface NightSave {
  n: number;
  /** 0 tag, 1 duel, 2 dance. */
  stage: number;
  scores: number[];
  logs: unknown[];
  at: number;
  ticket: string | null;
}

export interface NovaSave {
  sync: { offset: number; video: number; easyHolds: boolean; checked: boolean; wide: boolean; hitSound: boolean; beatBar: boolean; lockCam: boolean };
  stars: Record<string, number>;
  crowns: Record<string, boolean>;
  best: Record<string, number>;
  nights: number;
  equipped: { suit: string; blade: string; pose: string; helmet: boolean };
  seen: Record<string, boolean>;
  night: NightSave | null;
  tagLosses: number;
  duelsBeaten: Record<string, boolean>;
  visits: number;
}

export const DEFAULTS: NovaSave = {
  sync: { offset: 0, video: 0, easyHolds: false, checked: false, wide: false, hitSound: true, beatBar: true, lockCam: true },
  stars: {},
  crowns: {},
  best: {},
  nights: 0,
  equipped: { suit: 'starter', blade: 'cyan', pose: 'wave', helmet: false },
  seen: {},
  night: null,
  tagLosses: 0,
  duelsBeaten: {},
  visits: 0,
};

const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const rec = <T>(v: unknown, ok: (x: unknown) => x is T): Record<string, T> => {
  const out: Record<string, T> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) if (ok(x)) out[k] = x;
  return out;
};
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isBool = (x: unknown): x is boolean => typeof x === 'boolean';

/** Repairs a loaded record so every field has the right shape. Pure, for the tests. */
export function repair(d: Partial<NovaSave> & Record<string, unknown>): NovaSave {
  const s = (d.sync ?? {}) as Partial<NovaSave['sync']>;
  const e = (d.equipped ?? {}) as Partial<NovaSave['equipped']>;
  const stars = rec(d.stars, isNum);
  for (const k of Object.keys(stars)) stars[k] = Math.max(0, Math.min(3, Math.floor(stars[k])));
  const have = totalStars(stars);
  const owned = (kind: string, id: unknown) => typeof id === 'string' && UNLOCKS.some((u) => u.kind === kind && u.id === id && u.stars <= have);
  let night: NightSave | null = null;
  const n = d.night as Partial<NightSave> | null | undefined;
  if (n && isNum(n.n) && isNum(n.stage) && Array.isArray(n.scores) && isNum(n.at)) {
    night = { n: num(n.n, 1, 1, 5), stage: num(n.stage, 0, 0, 2), scores: n.scores.filter(isNum).slice(0, 3), logs: Array.isArray(n.logs) ? n.logs.slice(0, 3) : [], at: n.at, ticket: typeof n.ticket === 'string' ? n.ticket : null };
  }
  return {
    sync: {
      offset: num(s.offset, 0, -60, 300),
      video: num(s.video, 0, -100, 200),
      easyHolds: bool(s.easyHolds, false),
      checked: bool(s.checked, false),
      wide: bool(s.wide, false),
      hitSound: bool(s.hitSound, true),
      beatBar: bool(s.beatBar, true),
      lockCam: bool(s.lockCam, true),
    },
    stars,
    crowns: rec(d.crowns, isBool),
    best: rec(d.best, isNum),
    nights: num(d.nights, 0, 0, 5),
    equipped: {
      suit: owned('suit', e.suit) ? (e.suit as string) : 'starter',
      blade: owned('blade', e.blade) ? (e.blade as string) : 'cyan',
      pose: owned('pose', e.pose) ? (e.pose as string) : 'wave',
      helmet: bool(e.helmet, false) && have >= 70,
    },
    seen: rec(d.seen, isBool),
    night,
    tagLosses: num(d.tagLosses, 0, 0, 99),
    duelsBeaten: rec(d.duelsBeaten, isBool),
    visits: num(d.visits, 0, 0, 1e6),
  };
}

export class NovaProgress {
  private p: Progress<NovaSave>;
  readonly data: NovaSave;

  constructor(roomId: string, areaId: string) {
    this.p = new Progress<NovaSave>('neon', roomId, areaId, DEFAULTS, 1);
    const fixed = repair(this.p.data as NovaSave & Record<string, unknown>);
    for (const k of Object.keys(this.p.data)) delete (this.p.data as unknown as Record<string, unknown>)[k];
    Object.assign(this.p.data, fixed);
    this.data = this.p.data;
    this.data.visits++;
    this.save();
  }

  save(): void {
    this.p.save();
  }

  get stars(): number {
    return totalStars(this.data.stars);
  }

  /** Records stars for a challenge if better. Returns the stars gained. */
  award(id: string, stars: number): number {
    const before = this.data.stars[id] ?? 0;
    const s = Math.max(0, Math.min(3, Math.floor(stars)));
    if (s <= before) return 0;
    this.data.stars[id] = s;
    this.save();
    return s - before;
  }

  /** Records a score if it beats the local best. Returns whether it did. */
  best(id: string, score: number): boolean {
    const b = this.data.best[id];
    if (b !== undefined && score <= b) return false;
    this.data.best[id] = score;
    this.save();
    return true;
  }

  seen(key: string): boolean {
    return !!this.data.seen[key];
  }

  markSeen(key: string): void {
    if (this.data.seen[key]) return;
    this.data.seen[key] = true;
    this.save();
  }

  reset(): void {
    this.p.reset(DEFAULTS);
  }
}
