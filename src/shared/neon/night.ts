// Party nights: laser tag, a blade duel and a dance off back to back, with a
// rising multiplier. The night board's score is worked out on the server
// from the three event logs with the same rules as each game.

import type { LayoutId } from './arena.js';
import { chartFor, type Diff } from './charts.js';
import { duelCeiling, scoreDuel, scriptFor, type DuelistId, type DuelResult } from './duel.js';
import { danceCeiling, scoreDance, type DanceResult } from './judge.js';
import type { SongId } from './songs.js';
import { scoreTag, tagCeiling, type TagDiff, type TagLog, type TagScore } from './tag.js';

export interface NightDef {
  n: number;
  name: string;
  tag: { diff: TagDiff; size: 2 | 3 | 4; dur: number; layout: LayoutId; captain: boolean; echo: boolean };
  duel: DuelistId;
  dance: { song: SongId; diff: Diff; rival: string };
  mult: number;
}

export const NIGHTS: NightDef[] = [
  { n: 1, name: 'Rookie night', tag: { diff: 'easy', size: 2, dur: 90, layout: 'prism', captain: false, echo: false }, duel: 'sprocket', dance: { song: 'lights', diff: 'easy', rival: 'twirl' }, mult: 1 },
  { n: 2, name: 'Rising star night', tag: { diff: 'easy', size: 3, dur: 120, layout: 'prism', captain: false, echo: false }, duel: 'twinkle', dance: { song: 'glitter', diff: 'normal', rival: 'shimmer' }, mult: 1.25 },
  { n: 3, name: 'Headliner night', tag: { diff: 'normal', size: 3, dur: 120, layout: 'maze', captain: false, echo: true }, duel: 'brick', dance: { song: 'heart', diff: 'normal', rival: 'boogie' }, mult: 1.5 },
  { n: 4, name: 'Superstar night', tag: { diff: 'hard', size: 3, dur: 120, layout: 'ring', captain: false, echo: true }, duel: 'mirage', dance: { song: 'supernova', diff: 'normal', rival: 'strobe' }, mult: 1.75 },
  { n: 5, name: 'Supernova night', tag: { diff: 'hard', size: 4, dur: 120, layout: 'prism', captain: true, echo: true }, duel: 'knight', dance: { song: 'supernova', diff: 'nova', rival: 'orbit' }, mult: 2 },
];

export function nightDef(n: number): NightDef | null {
  return NIGHTS.find((x) => x.n === n) ?? null;
}

export interface NightLog {
  n: number;
  tag: TagLog;
  duel: string;
  dance: { n: string; s: string };
}

export interface NightScore {
  total: number;
  tag: TagScore;
  duel: DuelResult;
  dance: DanceResult;
  raw: number;
}

/** Stars for each event of a night (9 a night in all). */
export function nightTagStars(s: TagScore, diff: TagDiff): number {
  const par = { easy: 1500, normal: 2200, hard: 3000 }[diff];
  return s.win ? (s.total >= par ? 3 : 2) : 1;
}

export function nightDuelStars(r: DuelResult): number {
  const won = r.outcome === 'ko' || r.outcome === 'win';
  return won ? (r.accuracy >= 0.9 ? 3 : 2) : 1;
}

export function nightDanceStars(r: DanceResult): number {
  return r.cards.total >= 26 ? 3 : r.cards.total >= 21 ? 2 : 1;
}

/** The night's score from its three logs, or null for a night no real play could make. */
export function scoreNight(log: unknown): NightScore | null {
  if (!log || typeof log !== 'object') return null;
  const l = log as Partial<NightLog>;
  const def = typeof l.n === 'number' ? nightDef(l.n) : null;
  if (!def || !l.tag || typeof l.duel !== 'string' || !l.dance) return null;
  const tagLog = l.tag as TagLog;
  if (tagLog.diff !== def.tag.diff || typeof tagLog.dur !== 'number' || tagLog.dur < def.tag.dur - 1) return null;
  const tag = scoreTag(tagLog);
  const duel = scoreDuel(scriptFor(def.duel), l.duel);
  const chart = chartFor(def.dance.song, def.dance.diff);
  const d = l.dance as { n: unknown; s: unknown };
  const dance = chart && typeof d.n === 'string' && typeof d.s === 'string' ? scoreDance(chart, d.n, d.s) : null;
  if (!tag || !duel || !dance) return null;
  const raw = tag.total + duel.score + dance.score;
  return { total: Math.round(raw * def.mult), tag, duel, dance, raw };
}

/** The shortest a real night could be, in milliseconds (for the run ticket). */
export function nightMinMs(): number {
  let min = Infinity;
  for (const def of NIGHTS) {
    const chart = chartFor(def.dance.song, def.dance.diff)!;
    const last = chart.notes[chart.notes.length - 1];
    const s = scriptFor(def.duel);
    let tags = 0;
    let ko = s.endT;
    for (const e of s.judged)
      if (e.kind === 'open' && ++tags >= s.duelist.need) {
        ko = e.t;
        break;
      }
    min = Math.min(min, def.tag.dur + ko + (last ? last.endT : chart.seconds));
  }
  return Math.floor(min * 900);
}

/** A night score no real night can beat. */
export function nightCeiling(): number {
  let max = 0;
  for (const def of NIGHTS) max = Math.max(max, (tagCeiling(def.tag.dur + 60) + duelCeiling(scriptFor(def.duel)) + danceCeiling(chartFor(def.dance.song, def.dance.diff)!)) * def.mult);
  return Math.ceil(max);
}
