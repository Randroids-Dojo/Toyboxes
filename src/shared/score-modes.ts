// Shared boards for the worlds, one per area and mode (a level, a challenge,
// a song). Each world lists its modes here; the server checks every posted
// score against them, so a board only holds results a real run could get.
//
// Keep `min` and `max` honest: `max` is the best score a perfect run can
// reach (or for times, `min` is the fastest a perfect run can be).

import { COMET_MOTES, ringFromLog, ringMinMs, stormTotal } from './galaxy-rules.js';
import type { Experience } from './model';

export interface ScoreMode {
  /** Lowercase letters, digits and hyphens, up to 24 characters. */
  id: string;
  label: string;
  /** Points boards keep the highest; time boards (milliseconds) the lowest. */
  better: 'higher' | 'lower';
  unit: 'points' | 'ms';
  min: number;
  max: number;
  /**
   * Require a run ticket (api.runStart when the run begins). The result is
   * refused if it arrives sooner than `minMs` after the ticket, and each
   * ticket counts once.
   */
  ticket?: { minMs: number };
  /**
   * Work the score out on the server from the run's log (inputs, hits,
   * timings) instead of trusting the posted value. Return null for a log no
   * real run could produce. Runs in both the browser and the API, so keep it
   * pure and deterministic.
   */
  fromLog?: (log: unknown) => number | null;
}

export const MODE_ID = /^[a-z0-9-]{1,24}$/;

/** Largest run log the server reads, in characters of JSON. */
export const MAX_LOG = 24_000;

/** Every world's boards, by experience kind. */
export const SCORE_MODES: Record<Experience['kind'], ScoreMode[]> = {
  kart: [],
  casino: [],
  galaxy: [
    { id: 'ring', label: 'Ring run', better: 'lower', unit: 'ms', min: ringMinMs(), max: 10 * 60_000, ticket: { minMs: Math.floor(ringMinMs() * 0.8) }, fromLog: ringFromLog },
    { id: 'storm', label: 'Rock rain', better: 'higher', unit: 'points', min: 0, max: stormTotal() },
    { id: 'comet', label: 'Comet surf', better: 'higher', unit: 'points', min: 0, max: COMET_MOTES },
  ],
  neon: [],
  fart: [],
};

export function scoreMode(kind: Experience['kind'], id: string): ScoreMode | null {
  return SCORE_MODES[kind]?.find((m) => m.id === id) ?? null;
}

/** Null when the value could come from a real run of this mode. */
export function scoreProblem(mode: ScoreMode, value: number): string | null {
  if (!Number.isInteger(value)) return 'Scores are whole numbers';
  if (value < mode.min || value > mode.max) return 'That score does not look right';
  return null;
}

/** Whether `next` beats `best` on this board. */
export function beats(mode: ScoreMode, next: number, best: number | null): boolean {
  if (best === null) return true;
  return mode.better === 'higher' ? next > best : next < best;
}
