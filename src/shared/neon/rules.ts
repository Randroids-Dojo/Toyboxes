// Club Nova's shared boards: which modes there are and how the server works
// a score out of each run's log with the same rules the game uses. Pure and
// deterministic, so the browser and the API agree to the point.

import type { ScoreMode } from '../score-modes.js';
import { chartFor } from './charts.js';
import { danceCeiling, scoreDance } from './judge.js';
import type { SongId } from './songs.js';
import { tagBoardScore, tagCeiling } from './tag.js';
import { DUELISTS, duelCeiling, scoreDuel, scriptFor, type DuelistId } from './duel.js';

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

/** The board for a duelist (Normal and Echo bouts both count). */
export function duelBoard(id: DuelistId): string {
  return `duel-${id}`;
}

export function duelFromLog(id: DuelistId, log: unknown): number | null {
  if (typeof log !== 'string') return null;
  return scoreDuel(scriptFor(id), log)?.score ?? null;
}

/** The earliest a perfect bout could knock the duelist out, in seconds. */
export function earliestKo(id: DuelistId): number {
  const s = scriptFor(id);
  let tags = 0;
  for (const e of s.judged) if (e.kind === 'open' && ++tags >= s.duelist.need) return e.t;
  return s.endT;
}

function duelMode(id: DuelistId): ScoreMode {
  const s = scriptFor(id);
  return { id: duelBoard(id), label: s.duelist.name, better: 'higher', unit: 'points', min: 0, max: duelCeiling(s), ticket: { minMs: Math.floor(earliestKo(id) * 950) }, fromLog: (log) => duelFromLog(id, log) };
}

/** Free play laser tag (Normal and Hard; Hard counts for a quarter more). */
export const TAG_SECONDS = 120;

export function tagFromLog(log: unknown): number | null {
  if (!log || typeof log !== 'object' || typeof (log as { dur?: unknown }).dur !== 'number' || (log as { dur: number }).dur < TAG_SECONDS - 1) return null;
  return tagBoardScore(log);
}

export function neonModes(): ScoreMode[] {
  const out: ScoreMode[] = [
    { id: 'tag', label: 'Laser tag', better: 'higher', unit: 'points', min: 0, max: tagCeiling(TAG_SECONDS + 60), ticket: { minMs: (TAG_SECONDS - 5) * 1000 }, fromLog: tagFromLog },
  ];
  for (const song of Object.keys(DANCE_BOARD) as SongId[]) {
    const m = danceMode(song);
    if (m) out.push(m);
  }
  for (const d of DUELISTS) out.push(duelMode(d.id));
  return out;
}
