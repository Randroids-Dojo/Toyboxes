// Little Puffington's shared boards: one per trial (and per band song). The
// server checks every result against these rules.

import type { ScoreMode } from '../score-modes.js';
import { bandFromLog, chartMax, chartSeconds, CHARTS } from './charts.js';
import { ringsMinMs } from './course.js';

/** Library score cap: 5 books, 10 masked toots, 3 framings and a fast finish. */
export const LIBRARY_MAX = 2500;
/** Picnic Panic runs for 90 seconds at most. */
export const PICNIC_MAX_MS = 90_000;
export const PICNIC_MIN_MS = 15_000;

export const FART_MODES: ScoreMode[] = [
  { id: 'rings', label: 'Fastest rally', better: 'lower', unit: 'ms', min: ringsMinMs(), max: 600_000, ticket: { minMs: Math.max(0, ringsMinMs() - 1500) } },
  { id: 'library', label: 'Quietest librarian', better: 'higher', unit: 'points', min: 0, max: LIBRARY_MAX, ticket: { minMs: 15_000 } },
  { id: 'band-march', label: 'Top tooter: Puffington March', better: 'higher', unit: 'points', min: 0, max: chartMax(CHARTS.march), ticket: { minMs: Math.floor(chartSeconds(CHARTS.march) * 1000 - 1500) }, fromLog: (log) => bandFromLog('march', log) },
  { id: 'band-polka', label: 'Top tooter: Polka Dots', better: 'higher', unit: 'points', min: 0, max: chartMax(CHARTS.polka), ticket: { minMs: Math.floor(chartSeconds(CHARTS.polka) * 1000 - 1500) }, fromLog: (log) => bandFromLog('polka', log) },
  { id: 'picnic', label: 'Fastest picnic', better: 'lower', unit: 'ms', min: PICNIC_MIN_MS, max: PICNIC_MAX_MS, ticket: { minMs: PICNIC_MIN_MS - 1500 } },
];
