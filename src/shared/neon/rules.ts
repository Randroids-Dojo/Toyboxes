// Club Nova's shared boards: which modes there are and how the server works
// a score out of each run's log with the same rules the game uses. Pure and
// deterministic, so the browser and the API agree to the point.

import type { ScoreMode } from '../score-modes.js';
import { chartFor } from './charts.js';
import { danceCeiling, scoreDance } from './judge.js';
import type { SongId } from './songs.js';

/** Board ids for the dance songs (normal charts only). */
export const DANCE_BOARD: Partial<Record<SongId, string>> = {
  lights: 'dance-nova-lights',
  glitter: 'dance-glitter-gravity',
  heart: 'dance-neon-heart',
  supernova: 'dance-supernova',
};

const NAMES: Partial<Record<SongId, string>> = { lights: 'Nova Lights', glitter: 'Glitter Gravity', heart: 'Neon Heart', supernova: 'Supernova' };

function isLog(x: unknown): x is { n: string; s: string } {
  return !!x && typeof x === 'object' && typeof (x as { n: unknown }).n === 'string' && typeof (x as { s: unknown }).s === 'string';
}

/** The dance score for a log on a song's normal chart, or null. */
export function danceFromLog(song: SongId, log: unknown): number | null {
  const chart = chartFor(song, 'normal');
  if (!chart || !isLog(log)) return null;
  return scoreDance(chart, log.n, log.s)?.score ?? null;
}

function danceMode(song: SongId): ScoreMode | null {
  const chart = chartFor(song, 'normal');
  const id = DANCE_BOARD[song];
  if (!chart || !id) return null;
  const last = chart.notes[chart.notes.length - 1];
  return {
    id,
    label: NAMES[song] ?? song,
    better: 'higher',
    unit: 'points',
    min: 0,
    max: danceCeiling(chart),
    ticket: { minMs: Math.floor((last ? last.endT : chart.seconds) * 970) },
    fromLog: (log) => danceFromLog(song, log),
  };
}

export function neonModes(): ScoreMode[] {
  const out: ScoreMode[] = [];
  for (const song of Object.keys(DANCE_BOARD) as SongId[]) {
    const m = danceMode(song);
    if (m) out.push(m);
  }
  return out;
}
