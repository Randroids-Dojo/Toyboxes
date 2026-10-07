// Dance charts: what to press and when, as compact bar strings per song
// section. Shared with the server, which scores a dance from its judgement
// log against the same chart.
//
// One bar is 16 characters on a sixteenth-note grid (or 12 for triplet
// eighths): `.` rest, `x` tap, `p` pose (a big star, worth double), `h` a hold
// that carries on through each `=` after it. A whole bar of `spot` is a
// spotlight (freestyle) bar and `-` an empty bar. A section's bars are listed
// with spaces and repeat to fill the section.

import { SONGS, beatToSec, songSeconds, totalBars, type SongId, type SongMeta } from './songs.js';

export type Diff = 'easy' | 'normal' | 'hard' | 'nova';

export const DIFFS: Diff[] = ['easy', 'normal', 'hard', 'nova'];

export const DIFF_NAMES: Record<Diff, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard', nova: 'Supernova' };

export type NoteKind = 'tap' | 'hold' | 'pose';

export interface Note {
  i: number;
  kind: NoteKind;
  beat: number;
  /** Seconds from the song's first beat. */
  t: number;
  /** Hold tail (equal to beat and t for taps). */
  endBeat: number;
  endT: number;
  /** Where it falls in the beat, for the gem colour: 4 on the beat, 8 on the and, 16 between, 3 triplet. */
  sub: 4 | 8 | 16 | 3;
  /** Pressed a sixteenth after the note before it (drawn linked as a double). */
  link: boolean;
}

export interface Slot {
  beat: number;
  t: number;
}

export interface Chart {
  song: SongMeta;
  diff: Diff;
  notes: Note[];
  /** Spotlight eighth-note slots. */
  slots: Slot[];
  /** Bars that are spotlight bars. */
  spotBars: number[];
  bars: number;
  seconds: number;
}

export type ChartSpec = Record<string, string>;

/** Songs you can dance to, in unlock order. */
export const DANCE_SONGS: SongId[] = ['lights', 'glitter', 'heart', 'supernova'];

// ---------------------------------------------------------------------------
// Chart data

const SPOT4 = 'spot spot spot spot';

export const CHARTS: Partial<Record<SongId, Partial<Record<Diff, ChartSpec>>>> = {
  lights: {
    easy: {
      intro: '- - x...x...x...x... x...x...x...p...',
      verse: 'x...x...x...x... x.......x...x... x...x...x...x... h=====..x...p...',
      build: 'x...x...x...x... x...x...x...x... x...x...x...x... x...x...p.......',
      drop: 'x...x...x...x... h=====..x...x... x...x...x...x... x...x...p.......',
      break: SPOT4,
      drop2: 'x...x...x...x... x...x...h=====.. x...x...x...x... x...x...p.......',
      outro: 'x...x...x...x... x.......x....... h=======........ p...............',
    },
    normal: {
      intro: '- - x...x...x...x... x...x.x.x...p...',
      verse: 'x...x.x.x...x... x.x...x.x...x... x...x.x.x...x.x. h=====..x.x.p...',
      build: 'x...x...x...x... x.x.x.x.x...x... x...x...x...x... x.x.x.x.p.......',
      drop: 'x..x..x.x...x... x...x.x...x.x... x..x..x.x...x.x. x.x.x...h=====..',
      break: SPOT4,
      drop2: 'x..x..x.x..x..x. x...x.x.x...p... x..x..x.x...x.x. h=====..x.x.p...',
      outro: 'x...x.x.x...x... x...x...x.x.x... h=======........ p...............',
    },
    hard: {
      intro: '- - x...x...x.x.x... x.x.x.x.xx..p...',
      verse: 'x.xx..x.x.xx..x. x..x..xxx...x.x. x.xx..x.x.xx..x. h=====..x.xxp...',
      build: 'x.x.x.x.x.x.x.x. x.x.x.x.xx..x.x. x.xx.xx.x.xx.x.. xx.xx.x.p.......',
      drop: 'x..x..x.xx.x..x. x.xx..x.x..x.xx. x..x..x.xx.x..x. x.xx.x..h=====..',
      break: SPOT4,
      drop2: 'xx.x..x.xx.x..x. x.xx..x.x.xxp... x..x..x.xx.x..x. h=====..xx.xp...',
      outro: 'x..x..x.x.xx..x. x...x.x.xx.xx... h=======........ p...............',
    },
  },
};

// ---------------------------------------------------------------------------
// Parsing

function barNotes(bar: string, barIndex: number): { step: number; of: number; ch: string; len: number }[] {
  if (bar === '-' || bar === 'spot') return [];
  if (bar.length !== 16 && bar.length !== 12) throw new Error(`Bar ${barIndex + 1} has ${bar.length} steps`);
  const out: { step: number; of: number; ch: string; len: number }[] = [];
  for (let i = 0; i < bar.length; i++) {
    const ch = bar[i];
    if (ch === '.' || ch === '=') {
      if (ch === '=' && (i === 0 || (bar[i - 1] !== 'h' && bar[i - 1] !== '='))) throw new Error(`Loose hold in bar ${barIndex + 1}`);
      continue;
    }
    if (ch !== 'x' && ch !== 'p' && ch !== 'h') throw new Error(`Bad step "${ch}" in bar ${barIndex + 1}`);
    let len = 0;
    if (ch === 'h') {
      let j = i + 1;
      while (j < bar.length && bar[j] === '=') j++;
      len = j - i;
      if (len < 2) throw new Error(`Hold too short in bar ${barIndex + 1}`);
    }
    out.push({ step: i, of: bar.length, ch, len });
  }
  return out;
}

/** The bar strings for every bar of a song, from a chart spec. */
export function expandBars(song: SongMeta, spec: ChartSpec): string[] {
  const bars: string[] = [];
  for (const sec of song.order) {
    const src = spec[sec.name];
    if (src === undefined) throw new Error(`No chart for section ${sec.name}`);
    const list = src.trim().split(/\s+/);
    for (let b = 0; b < sec.bars; b++) bars.push(list[b % list.length]);
  }
  return bars;
}

export function parseChart(song: SongMeta, diff: Diff, spec: ChartSpec): Chart {
  const bars = expandBars(song, spec);
  const notes: Note[] = [];
  const slots: Slot[] = [];
  const spotBars: number[] = [];
  bars.forEach((bar, b) => {
    if (bar === 'spot') {
      spotBars.push(b);
      for (let k = 0; k < 8; k++) {
        const beat = b * 4 + k * 0.5;
        slots.push({ beat, t: beatToSec(song, beat) });
      }
      return;
    }
    for (const n of barNotes(bar, b)) {
      const per = 4 / n.of;
      const beat = b * 4 + n.step * per;
      const endBeat = n.ch === 'h' ? beat + n.len * per : beat;
      const sub: Note['sub'] = n.of === 12 ? (n.step % 3 === 0 ? 4 : 3) : n.step % 4 === 0 ? 4 : n.step % 2 === 0 ? 8 : 16;
      const prev = notes[notes.length - 1];
      notes.push({
        i: notes.length,
        kind: n.ch === 'h' ? 'hold' : n.ch === 'p' ? 'pose' : 'tap',
        beat,
        t: beatToSec(song, beat),
        endBeat,
        endT: beatToSec(song, endBeat),
        sub,
        link: !!prev && prev.kind !== 'hold' && Math.abs(beat - prev.beat - 0.25) < 1e-6,
      });
    }
  });
  return { song, diff, notes, slots, spotBars, bars: totalBars(song), seconds: songSeconds(song) };
}

const cache = new Map<string, Chart>();

/** A parsed chart, or null when the song has none at that difficulty. */
export function chartFor(song: SongId, diff: Diff): Chart | null {
  const key = `${song}:${diff}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const spec = CHARTS[song]?.[diff];
  if (!spec) return null;
  const chart = parseChart(SONGS[song], diff, spec);
  cache.set(key, chart);
  return chart;
}

/** The difficulties a song has charts for. */
export function diffsFor(song: SongId): Diff[] {
  return DIFFS.filter((d) => !!CHARTS[song]?.[d]);
}

// ---------------------------------------------------------------------------
// Checks (used by the unit tests)

/** Peak notes per second over any 2 second window. */
export const DENSITY_CAP: Record<Diff, number> = { easy: 2.0, normal: 3.5, hard: 5.0, nova: 6.5 };
/** Smallest gap between note starts, in beats. */
export const MIN_GAP: Record<Diff, number> = { easy: 1, normal: 0.5, hard: 0.25, nova: 0.25 };

export function chartProblems(c: Chart): string[] {
  const out: string[] = [];
  const n = c.notes;
  for (let i = 1; i < n.length; i++) {
    const a = n[i - 1];
    const b = n[i];
    if (b.beat <= a.beat) out.push(`Notes out of order at ${b.beat}`);
    if (b.beat - a.beat < MIN_GAP[c.diff] - 1e-6) out.push(`Gap too small at beat ${b.beat}`);
    if (b.t - a.t < 0.105 - 1e-6) out.push(`Gap under 105 ms at beat ${b.beat}`);
    if (a.kind === 'hold' && b.beat - a.endBeat < 0.5 - 1e-6) out.push(`Hold runs into the next note at beat ${a.beat}`);
  }
  const cap = DENSITY_CAP[c.diff] * 2;
  let j = 0;
  for (let i = 0; i < n.length; i++) {
    while (n[i].t - n[j].t >= 2) j++;
    if (i - j + 1 > cap + 1e-6) {
      out.push(`Too dense near beat ${n[i].beat} (${i - j + 1} in 2 s)`);
      break;
    }
  }
  const last = n[n.length - 1];
  if (last && last.endT > c.seconds) out.push('Notes run past the end of the song');
  if (!c.slots.length) out.push('No spotlight bars');
  return out;
}
