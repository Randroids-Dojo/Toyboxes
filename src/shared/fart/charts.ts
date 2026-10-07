// Brass Band Bash: the tuba parts you toot, and how a run is scored. Shared
// with the server, which works the score out from the run's log.

export type SongId = 'march' | 'polka';

export interface Note {
  /** Beat from the start of the song. */
  beat: number;
  kind: 'tap' | 'hold' | 'rest';
  /** Pitch (MIDI) for taps and holds. */
  midi: number;
  /** Length in beats (holds and rests). */
  len: number;
  /** An echo of the trumpet's call. */
  call: boolean;
}

export interface Chart {
  id: SongId;
  name: string;
  bpm: number;
  /** Song length in beats. */
  beats: number;
  notes: Note[];
  /** Per bar: the chord root (MIDI) the tuba plays from, and the chord name. */
  bars: { root: number; fifth: number; chord: string; pattern: string }[];
}

// Bar patterns are eight eighth-note steps: R root, F fifth, O root an
// octave up, H hold (continued by -), x rest (the Maestro's palm is up),
// c an echo of the trumpet's call (on the root), . nothing.
const MARCH: [string, string][] = [
  ['Bb', '........'],
  ['Bb', '........'],
  ['Bb', 'R...F...'],
  ['Eb', 'R...F...'],
  ['F7', 'R...F...'],
  ['Bb', 'H-------'],
  ['Bb', 'R...F...'],
  ['Eb', 'R...R.F.'],
  ['F7', 'R...F...'],
  ['Bb', 'R...xxxx'],
  ['Eb', 'R...F...'],
  ['Ab', 'R...F...'],
  ['Bb7', '....c.cc'],
  ['Eb', 'H---R...'],
  ['Eb', 'R...F...'],
  ['Ab', 'R.R.F...'],
  ['Bb7', '....c.c.'],
  ['Eb', 'H-------'],
  ['Bb', 'R...F...'],
  ['Bb', 'O.......'],
];

const POLKA: [string, string][] = [
  ['F', '........'],
  ['F', '........'],
  ['F', 'R.F.R.F.'],
  ['C7', 'R.F.R.F.'],
  ['F', 'R.F.R.F.'],
  ['C7', 'R.F.RRF.'],
  ['F', 'R.F.R.F.'],
  ['Bb', 'R.F.R.F.'],
  ['C7', 'R.F.O.F.'],
  ['F', 'H---xxxx'],
  ['Bb', 'R.F.R.F.'],
  ['F', 'R.F.R.F.'],
  ['C7', '....c.cc'],
  ['F', 'R.F.R.F.'],
  ['Bb', 'R.F.RRF.'],
  ['F', 'R.F.R.F.'],
  ['C7', '....c.c.'],
  ['F', 'H---R.F.'],
  ['F', 'xxxxR.F.'],
  ['C7', 'R.F.R.F.'],
  ['F', 'R.F.RRF.'],
  ['Bb', 'R.F.O.F.'],
  ['C7', '....cccc'],
  ['F', 'R.F.R.F.'],
  ['C7', 'R.F.R.R.'],
  ['F', 'H-------'],
  ['F', 'O.......'],
];

const ROOTS: Record<string, number> = { Bb: 34, Eb: 39, F: 41, F7: 41, Ab: 44, Bb7: 34, C7: 36 };

function build(id: SongId, name: string, bpm: number, def: [string, string][]): Chart {
  const notes: Note[] = [];
  const bars = def.map(([chord, pattern]) => {
    const root = ROOTS[chord];
    return { root, fifth: root + 7, chord, pattern };
  });
  bars.forEach((bar, b) => {
    const p = bar.pattern;
    for (let i = 0; i < 8; i++) {
      const c = p[i];
      const beat = b * 4 + i / 2;
      if (c === 'R' || c === 'c') notes.push({ beat, kind: 'tap', midi: bar.root, len: 0, call: c === 'c' });
      else if (c === 'F') notes.push({ beat, kind: 'tap', midi: bar.fifth, len: 0, call: false });
      else if (c === 'O') notes.push({ beat, kind: 'tap', midi: bar.root + 12, len: 0, call: false });
      else if (c === 'H') {
        let n = 1;
        while (i + n < 8 && p[i + n] === '-') n++;
        notes.push({ beat, kind: 'hold', midi: bar.root, len: n / 2, call: false });
      } else if (c === 'x' && (i === 0 || p[i - 1] !== 'x')) {
        let n = 1;
        while (i + n < 8 && p[i + n] === 'x') n++;
        notes.push({ beat, kind: 'rest', midi: 0, len: n / 2, call: false });
      }
    }
  });
  return { id, name, bpm, beats: def.length * 4, notes, bars };
}

export const CHARTS: Record<SongId, Chart> = {
  march: build('march', 'Puffington March', 96, MARCH),
  polka: build('polka', 'Polka Dots', 120, POLKA),
};

/** The test chart: eight notes, for quick playtests. */
export function shortChart(id: SongId): Chart {
  const c = CHARTS[id];
  const notes = c.notes.filter((n) => n.kind !== 'rest').slice(0, 8);
  const last = notes[notes.length - 1];
  return { ...c, notes, beats: Math.ceil((last.beat + 4) / 4) * 4 };
}

// ---------------------------------------------------------------------------
// Judging and scoring

export const PERFECT_MS = 60;
export const GOOD_MS = 120;
export const POINTS = { perfect: 100, good: 50, holdBeat: 10 };

export function judge(offsetMs: number | null): 'perfect' | 'good' | 'miss' {
  if (offsetMs === null || !Number.isFinite(offsetMs)) return 'miss';
  const a = Math.abs(offsetMs);
  return a <= PERFECT_MS ? 'perfect' : a <= GOOD_MS ? 'good' : 'miss';
}

export function comboMultiplier(combo: number): number {
  return combo >= 25 ? 2 : combo >= 10 ? 1.5 : 1;
}

/** A run as the browser logs it, one entry per note in the chart. */
export interface BandLog {
  song: SongId;
  /** Tap and hold notes: the press offset in ms (null missed). Rests: null kept quiet, or a number if you tooted. */
  hits: (number | null)[];
  /** Hold notes: beats held (0 to the note's length); others 0. */
  held: number[];
}

export interface BandResult {
  score: number;
  perfect: number;
  good: number;
  miss: number;
  maxCombo: number;
  /** 0 to 1: Perfect counts full, Good half, a held note by how long you held it. */
  accuracy: number;
}

export function scoreBand(chart: Chart, log: Pick<BandLog, 'hits' | 'held'>): BandResult {
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let perfect = 0;
  let good = 0;
  let miss = 0;
  let earned = 0;
  let possible = 0;
  chart.notes.forEach((n, i) => {
    const off = log.hits[i] ?? null;
    if (n.kind === 'rest') {
      if (off !== null) combo = 0;
      return;
    }
    possible += 1;
    const j = judge(off);
    if (j === 'miss') {
      miss++;
      combo = 0;
      return;
    }
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    const mult = comboMultiplier(combo);
    if (j === 'perfect') perfect++;
    else good++;
    let pts = j === 'perfect' ? POINTS.perfect : POINTS.good;
    let frac = j === 'perfect' ? 1 : 0.5;
    if (n.kind === 'hold') {
      const held = Math.max(0, Math.min(n.len, log.held[i] ?? 0));
      pts += Math.floor(held * 2) * (POINTS.holdBeat / 2);
      frac *= 0.5 + 0.5 * (held / n.len);
    }
    earned += frac;
    score += Math.round(pts * mult);
  });
  return { score, perfect, good, miss, maxCombo, accuracy: possible ? earned / possible : 0 };
}

/** The best score a chart allows (everything Perfect and held). */
export function chartMax(chart: Chart): number {
  const hits = chart.notes.map((n) => (n.kind === 'rest' ? null : 0));
  const held = chart.notes.map((n) => (n.kind === 'hold' ? n.len : 0));
  return scoreBand(chart, { hits, held }).score;
}

/** Golden beans by accuracy: 60%, 80%, 95%. */
export function bandBeans(accuracy: number): number {
  return accuracy >= 0.95 ? 3 : accuracy >= 0.8 ? 2 : accuracy >= 0.6 ? 1 : 0;
}

/** The server's check: a log no real run could make returns null. */
export function bandFromLog(song: SongId, raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null;
  const log = raw as Partial<BandLog>;
  const chart = CHARTS[song];
  if (log.song !== song || !Array.isArray(log.hits) || !Array.isArray(log.held)) return null;
  if (log.hits.length !== chart.notes.length || log.held.length !== chart.notes.length) return null;
  for (let i = 0; i < chart.notes.length; i++) {
    const h = log.hits[i];
    const n = chart.notes[i];
    if (h !== null && (typeof h !== 'number' || !Number.isFinite(h) || Math.abs(h) > 1000)) return null;
    const held = log.held[i];
    if (typeof held !== 'number' || held < 0 || held > (n.kind === 'hold' ? n.len : 0) + 1e-6) return null;
  }
  return scoreBand(chart, { hits: log.hits as (number | null)[], held: log.held as number[] }).score;
}

/** Seconds of song for a chart. */
export function chartSeconds(chart: Chart): number {
  return (chart.beats * 60) / chart.bpm;
}
