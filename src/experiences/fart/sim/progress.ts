// What this device remembers about Little Puffington: golden beans, bests,
// the rally ghost, equipped toot voice and cloud style, and settings.
// Versioned, with a migration from older saves.

import type { CloudStyle } from '../clouds-fx';
import type { Voice } from '../toots';

export type TrialId = 'rings' | 'library' | 'band' | 'picnic';

export interface TrialSave {
  /** Golden beans earned (0 to 3). */
  beans: number;
  /** Personal best: ms for timed trials, points for scored ones. */
  best: number | null;
  plays: number;
}

export interface PuffSave {
  version: 2;
  mischief: string[];
  trials: Record<TrialId, TrialSave>;
  /** Polka Dots: a bonus song with its own board. */
  polka: TrialSave;
  voice: Voice;
  cloud: CloudStyle;
  tapMode: boolean | null;
  /** Rhythm offset for the band, seconds (positive: you hear it late). */
  offset: number;
  calibrated: boolean;
  seenIntro: boolean;
  /** Seen the trial intro cards. */
  seen: string[];
  /** Best Rocket Rings run as positions at 10 Hz: [x, y, z] rounded to cm. */
  ghost: number[][] | null;
  medal: boolean;
  ateCabbage: boolean;
}

export const TOTAL_BEANS = 27;

export function freshSave(): PuffSave {
  const t = (): TrialSave => ({ beans: 0, best: null, plays: 0 });
  return { version: 2, mischief: [], trials: { rings: t(), library: t(), band: t(), picnic: t() }, polka: t(), voice: 'classic', cloud: 'classic', tapMode: null, offset: 0, calibrated: false, seenIntro: false, seen: [], ghost: null, medal: false, ateCabbage: false };
}

/** Brings any older or partial save up to date. */
export function migrate(raw: unknown): PuffSave {
  const s = freshSave();
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  // Version 1 kept beans as a count of mischief done and a single rings best.
  if (r.version === 1 || r.version === undefined) {
    if (Array.isArray(r.mischief)) s.mischief = r.mischief.filter((x): x is string => typeof x === 'string');
    if (typeof r.ringsBest === 'number') s.trials.rings.best = r.ringsBest;
    if (typeof r.ringsBeans === 'number') s.trials.rings.beans = Math.max(0, Math.min(3, r.ringsBeans));
    if (typeof r.voice === 'string') s.voice = r.voice as Voice;
    return s;
  }
  const v = r as Partial<PuffSave>;
  if (Array.isArray(v.mischief)) s.mischief = v.mischief.filter((x) => typeof x === 'string');
  for (const k of ['rings', 'library', 'band', 'picnic'] as TrialId[]) {
    const t = v.trials?.[k];
    if (t) s.trials[k] = { beans: clampBeans(t.beans), best: typeof t.best === 'number' ? t.best : null, plays: typeof t.plays === 'number' ? t.plays : 0 };
  }
  if (v.polka) s.polka = { beans: clampBeans(v.polka.beans), best: typeof v.polka.best === 'number' ? v.polka.best : null, plays: v.polka.plays ?? 0 };
  if (typeof v.voice === 'string') s.voice = v.voice;
  if (typeof v.cloud === 'string') s.cloud = v.cloud;
  if (typeof v.tapMode === 'boolean') s.tapMode = v.tapMode;
  if (typeof v.offset === 'number' && Math.abs(v.offset) < 0.5) s.offset = v.offset;
  s.calibrated = !!v.calibrated;
  s.seenIntro = !!v.seenIntro;
  if (Array.isArray(v.seen)) s.seen = v.seen.filter((x) => typeof x === 'string');
  if (Array.isArray(v.ghost)) s.ghost = v.ghost;
  s.medal = !!v.medal;
  s.ateCabbage = !!v.ateCabbage;
  return s;
}

function clampBeans(n: unknown): number {
  return typeof n === 'number' ? Math.max(0, Math.min(3, Math.round(n))) : 0;
}

/** Golden beans in the jar (Polka Dots is a bonus and does not count). */
export function beanCount(s: PuffSave): number {
  return s.mischief.length + s.trials.rings.beans + s.trials.library.beans + s.trials.band.beans + s.trials.picnic.beans;
}

export interface Unlock {
  beans: number;
  kind: 'voice' | 'cloud' | 'golden';
  id: string;
  name: string;
}

export const UNLOCKS: Unlock[] = [
  { beans: 0, kind: 'voice', id: 'classic', name: 'Classic toot' },
  { beans: 0, kind: 'cloud', id: 'classic', name: 'Classic clouds' },
  { beans: 2, kind: 'voice', id: 'duck', name: 'Squeaky duck' },
  { beans: 4, kind: 'cloud', id: 'rainbow', name: 'Rainbow clouds' },
  { beans: 7, kind: 'voice', id: 'kazoo', name: 'Kazoo' },
  { beans: 10, kind: 'cloud', id: 'bubbles', name: 'Bubble clouds' },
  { beans: 13, kind: 'voice', id: 'trombone', name: 'Trombone' },
  { beans: 16, kind: 'cloud', id: 'glitter', name: 'Glitter clouds' },
  { beans: 19, kind: 'voice', id: 'horn', name: 'Bike horn' },
  { beans: 22, kind: 'cloud', id: 'hearts', name: 'Heart clouds' },
  { beans: 25, kind: 'voice', id: 'opera', name: 'Opera' },
  { beans: 27, kind: 'golden', id: 'golden', name: 'The golden toot' },
];

export function unlocked(beans: number): Unlock[] {
  return UNLOCKS.filter((u) => u.beans <= beans);
}

/** Unlocks reached by going from `before` to `after` beans. */
export function newUnlocks(before: number, after: number): Unlock[] {
  return UNLOCKS.filter((u) => u.beans > before && u.beans <= after);
}

/** Trials open by golden beans (decided by the engine lead: library at 3, picnic at 6). */
export const TRIAL_GATES: Record<TrialId, number> = { rings: 0, band: 0, library: 3, picnic: 6 };

export function trialOpen(t: TrialId, beans: number): boolean {
  return beans >= TRIAL_GATES[t];
}
