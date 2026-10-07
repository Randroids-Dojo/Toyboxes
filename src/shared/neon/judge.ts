// Rhythm judging for the dance off: timing windows, matching presses to
// notes, holds, spotlight bars, combo, Glow time, points and the judges'
// cards. Pure and deterministic: the browser judges live with `LiveJudge`, and
// the server replays the judgement log with `scoreDance` to get the same score.

import type { Chart, Note } from './charts.js';

export type Grade = 'P' | 'G' | 'O' | 'M';

/** Half widths of the timing windows, in seconds: Perfect, Great, Good. */
export const WINDOW = { P: 0.045, G: 0.09, O: 0.135 };
/** Spotlight presses within this of an eighth-note slot are on the grid. */
export const SLOT_WINDOW = 0.06;
/** Letting go of a hold this long before its tail drops it. */
export const HOLD_GRACE = 0.12;
/** Easy charts widen every window by this much. */
export const EASY_WIDEN = 1.2;
/** The Wide timing assist (local bests only). */
export const ASSIST_WIDEN = 1.5;

export const GRADE_POINTS: Record<Grade, number> = { P: 300, G: 200, O: 100, M: 0 };
export const GRADE_NAMES: Record<Grade, string> = { P: 'Perfect', G: 'Great', O: 'Good', M: 'Miss' };
export const HOLD_POINTS_PER_BEAT = 50;
export const SPOT_POINTS = 150;
/** Perfects needed to fill the Glow meter. */
export const GLOW_PERFECTS = 16;
/** Glow time lasts one phrase (4 bars). */
export const PHRASE_BEATS = 16;

export function gradeFor(err: number, widen = 1): Grade {
  const a = Math.abs(err);
  if (a <= WINDOW.P * widen) return 'P';
  if (a <= WINDOW.G * widen) return 'G';
  if (a <= WINDOW.O * widen) return 'O';
  return 'M';
}

/** Combo multiplier: 2x at 10, 3x at 30, 4x at 60. */
export function comboMult(combo: number): number {
  return combo >= 60 ? 4 : combo >= 30 ? 3 : combo >= 10 ? 2 : 1;
}

export interface Counts {
  P: number;
  G: number;
  O: number;
  M: number;
}

/**
 * Running score for one dance. Feed it judgements in chart order (the live
 * judge guarantees this); the server feeds it the log.
 */
export class DanceScore {
  score = 0;
  combo = 0;
  maxCombo = 0;
  counts: Counts = { P: 0, G: 0, O: 0, M: 0 };
  holds = { kept: 0, dropped: 0 };
  spot = { F: 0, S: 0 };
  /** Glow meter, 0 to 1. */
  meter = 0;
  /** Beats where Glow time starts and ends, or null. */
  glow: { start: number; end: number } | null = null;
  glows = 0;

  constructor(readonly chart: Chart) {}

  glowAt(beat: number): boolean {
    return !!this.glow && beat >= this.glow.start && beat < this.glow.end;
  }

  private settleGlow(beat: number): void {
    if (this.glow && beat >= this.glow.end) this.glow = null;
  }

  /** A note's head was judged. Returns the points it earned. */
  note(n: Note, g: Grade): number {
    this.settleGlow(n.beat);
    this.counts[g]++;
    if (g === 'M') {
      this.combo = 0;
      return 0;
    }
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const glowing = this.glowAt(n.beat);
    const pts = GRADE_POINTS[g] * (n.kind === 'pose' ? 2 : 1) * comboMult(this.combo) * (glowing ? 2 : 1);
    this.score += pts;
    if (g === 'P' && !this.glow) {
      this.meter = Math.min(1, this.meter + 1 / GLOW_PERFECTS);
      if (this.meter >= 1 - 1e-9) {
        const start = Math.ceil((n.beat + 0.5) / PHRASE_BEATS) * PHRASE_BEATS;
        this.glow = { start, end: start + PHRASE_BEATS };
        this.glows++;
        this.meter = 0;
      }
    }
    return pts;
  }

  /** A hold's tail: kept to the end or dropped. */
  tail(n: Note, kept: boolean): number {
    if (!kept) {
      this.holds.dropped++;
      this.combo = 0;
      return 0;
    }
    this.holds.kept++;
    const pts = Math.round(HOLD_POINTS_PER_BEAT * (n.endBeat - n.beat)) * comboMult(this.combo) * (this.glowAt(n.beat) ? 2 : 1);
    this.score += pts;
    return pts;
  }

  /** A spotlight slot: F on the grid, S sloppy, `.` nothing pressed. */
  slot(beat: number, c: SlotMark): number {
    if (c === 'F') {
      this.spot.F++;
      const pts = SPOT_POINTS * (this.glowAt(beat) ? 2 : 1);
      this.score += pts;
      return pts;
    }
    if (c === 'S') this.spot.S++;
    return 0;
  }
}

export type SlotMark = 'F' | 'S' | '.';

export interface Cards {
  tempo: number;
  groove: number;
  sparkle: number;
  total: number;
}

const half = (v: number) => Math.round(Math.max(0, Math.min(10, v)) * 2) / 2;

/** The three judges' cards, each out of 10 in half points. */
export function judgeCards(chart: Chart, s: DanceScore): Cards {
  const n = Math.max(1, chart.notes.length);
  const c = s.counts;
  const acc = (c.P + 0.67 * c.G + 0.33 * c.O) / n;
  const tempo = half(10 * acc * acc);
  const groove = half(10 * Math.pow(s.maxCombo / n, 0.7));
  const holdsTotal = chart.notes.filter((x) => x.kind === 'hold').length;
  const holdShare = holdsTotal ? s.holds.kept / holdsTotal : c.P / n;
  const slots = chart.slots.length;
  const spotShare = slots ? Math.max(0, Math.min(1, (s.spot.F - s.spot.S) / (slots / 2))) : c.P / n;
  const sparkle = half(10 * (0.5 * (c.P / n) + 0.3 * spotShare + 0.2 * holdShare));
  return { tempo, groove, sparkle, total: tempo + groove + sparkle };
}

export interface DanceResult {
  score: number;
  cards: Cards;
  counts: Counts;
  maxCombo: number;
  holds: { kept: number; dropped: number };
  spot: { F: number; S: number };
  glows: number;
  notes: number;
}

/** Number of log characters for the notes (holds take two: head and tail). */
export function noteLogLength(chart: Chart): number {
  return chart.notes.reduce((k, n) => k + (n.kind === 'hold' ? 2 : 1), 0);
}

/**
 * Scores a dance from its log: one character per note in chart order
 * (P, G, O or M; a hold adds H kept or D dropped), and one per spotlight slot
 * (F, S or `.`). Null for a log no real dance could make.
 */
export function scoreDance(chart: Chart, notes: string, slots: string): DanceResult | null {
  if (typeof notes !== 'string' || typeof slots !== 'string') return null;
  if (notes.length !== noteLogLength(chart) || slots.length !== chart.slots.length) return null;
  const s = new DanceScore(chart);
  let k = 0;
  // Slots and notes interleave by beat, so Glow time sees them in order.
  let si = 0;
  const flushSlots = (beat: number) => {
    while (si < chart.slots.length && chart.slots[si].beat < beat) {
      const m = slots[si] as SlotMark;
      if (m !== 'F' && m !== 'S' && m !== '.') return false;
      s.slot(chart.slots[si].beat, m);
      si++;
    }
    return true;
  };
  for (const n of chart.notes) {
    if (!flushSlots(n.beat)) return null;
    const g = notes[k++] as Grade;
    if (g !== 'P' && g !== 'G' && g !== 'O' && g !== 'M') return null;
    s.note(n, g);
    if (n.kind === 'hold') {
      const t = notes[k++];
      if (t !== 'H' && t !== 'D') return null;
      if (g === 'M' && t === 'H') return null;
      s.tail(n, t === 'H');
    }
  }
  if (!flushSlots(Infinity)) return null;
  return { score: s.score, cards: judgeCards(chart, s), counts: s.counts, maxCombo: s.maxCombo, holds: s.holds, spot: s.spot, glows: s.glows, notes: chart.notes.length };
}

/** The best log for a chart (every note Perfect, every hold kept, every slot on the grid). */
export function perfectLog(chart: Chart): { n: string; s: string } {
  return { n: chart.notes.map((x) => (x.kind === 'hold' ? 'PH' : 'P')).join(''), s: 'F'.repeat(chart.slots.length) };
}

/** A score no dance on this chart can beat (every note at 4x in Glow time). */
export function danceCeiling(chart: Chart): number {
  let total = 0;
  for (const n of chart.notes) {
    total += GRADE_POINTS.P * (n.kind === 'pose' ? 2 : 1) * 8;
    if (n.kind === 'hold') total += Math.round(HOLD_POINTS_PER_BEAT * (n.endBeat - n.beat)) * 8;
  }
  return total + chart.slots.length * SPOT_POINTS * 2;
}

/** Free play stars from the judges' total out of 30: 18, 23, 27; a crown at 30. */
export function danceStars(total: number): number {
  return total >= 27 ? 3 : total >= 23 ? 2 : total >= 18 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Live judging

export type JudgeEvent =
  | { kind: 'note'; note: Note; grade: Grade; err: number; points: number }
  | { kind: 'tail'; note: Note; kept: boolean; points: number }
  | { kind: 'slot'; index: number; mark: SlotMark; err: number; points: number }
  | { kind: 'hold'; note: Note };

export class LiveJudge {
  readonly score: DanceScore;
  private marks: string[];
  private slotMarks: SlotMark[];
  /** Next note not yet judged. */
  next = 0;
  /** Next spotlight slot not yet scored. */
  private nextSlot = 0;
  holding: Note | null = null;
  private widen: number;
  private easyHolds: boolean;
  /** Presses by grade direction, for early or late ticks and sync tuning. */
  readonly errors: number[] = [];

  constructor(
    readonly chart: Chart,
    opts: { widen?: number; easyHolds?: boolean } = {},
  ) {
    this.score = new DanceScore(chart);
    this.marks = new Array(chart.notes.length).fill('');
    this.slotMarks = new Array(chart.slots.length).fill('.');
    this.widen = opts.widen ?? 1;
    this.easyHolds = !!opts.easyHolds;
  }

  get done(): boolean {
    return this.next >= this.chart.notes.length && !this.holding;
  }

  /** Marks notes whose windows have passed as misses and finishes holds. `t` is song seconds. */
  sweep(t: number): JudgeEvent[] {
    const out: JudgeEvent[] = [];
    const notes = this.chart.notes;
    if (this.holding && t >= this.holding.endT) {
      const h = this.holding;
      this.holding = null;
      out.push(this.finishHold(h, true));
    }
    this.flushSlots((s) => s.t + 0.2 < t && (this.next >= notes.length || s.beat < notes[this.next].beat));
    while (this.next < notes.length && notes[this.next].t + WINDOW.O * this.widen < t && !(this.holding && this.holding.i === this.next)) {
      this.flushSlots((s) => s.beat < notes[this.next].beat);
      const n = notes[this.next++];
      this.marks[n.i] = n.kind === 'hold' ? 'MD' : 'M';
      out.push({ kind: 'note', note: n, grade: 'M', err: 0, points: this.score.note(n, 'M') });
      if (n.kind === 'hold') out.push({ kind: 'tail', note: n, kept: false, points: this.score.tail(n, false) });
    }
    return out;
  }

  /** Scores spotlight slots in order while `ready` says they are settled. */
  private flushSlots(ready: (s: { beat: number; t: number }) => boolean): void {
    const slots = this.chart.slots;
    while (this.nextSlot < slots.length && ready(slots[this.nextSlot])) {
      this.score.slot(slots[this.nextSlot].beat, this.slotMarks[this.nextSlot]);
      this.nextSlot++;
    }
  }

  private finishHold(h: Note, kept: boolean): JudgeEvent {
    this.marks[h.i] = this.marks[h.i][0] + (kept ? 'H' : 'D');
    return { kind: 'tail', note: h, kept, points: this.score.tail(h, kept) };
  }

  press(t: number): JudgeEvent[] {
    const out = this.sweep(t);
    const notes = this.chart.notes;
    const n = notes[this.next];
    if (n && !(this.holding && this.holding.i === n.i) && Math.abs(t - n.t) <= WINDOW.O * this.widen) {
      // Spotlight slots that came before this note count first.
      this.flushSlots((s) => s.beat < n.beat);
      const err = t - n.t;
      const g = gradeFor(err, this.widen);
      this.next++;
      this.errors.push(err);
      this.marks[n.i] = g;
      out.push({ kind: 'note', note: n, grade: g, err, points: this.score.note(n, g) });
      if (n.kind === 'hold') {
        if (this.easyHolds) out.push(this.finishHold(n, true));
        else {
          this.holding = n;
          out.push({ kind: 'hold', note: n });
        }
      }
      return out;
    }
    const slots = this.chart.slots;
    if (slots.length) {
      // Nearest spotlight slot, if the press is inside a spotlight bar.
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < slots.length; i++) {
        const d = Math.abs(t - slots[i].t);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      const s = slots[best];
      const step = best + 1 < slots.length ? slots[best + 1].t - s.t : best > 0 ? s.t - slots[best - 1].t : 0.25;
      if (bestD <= step * 0.75 && best >= this.nextSlot) {
        const onGrid = bestD <= SLOT_WINDOW * this.widen;
        const prev = this.slotMarks[best];
        const mark: SlotMark = onGrid && prev === '.' ? 'F' : 'S';
        this.slotMarks[best] = mark;
        out.push({ kind: 'slot', index: best, mark, err: t - s.t, points: 0 });
      }
    }
    return out;
  }

  release(t: number): JudgeEvent[] {
    const h = this.holding;
    if (!h) return [];
    this.holding = null;
    return [this.finishHold(h, t >= h.endT - HOLD_GRACE)];
  }

  /** Finishes everything (end of song) and returns the log. */
  finish(): { n: string; s: string } {
    this.sweep(Infinity);
    if (this.holding) this.finishHold(this.holding, true);
    this.holding = null;
    this.flushSlots(() => true);
    return this.log();
  }

  log(): { n: string; s: string } {
    return { n: this.marks.join(''), s: this.slotMarks.join('') };
  }

  /** The final result, scored from the log exactly as the server does it. */
  result(): DanceResult | null {
    const l = this.finish();
    return scoreDance(this.chart, l.n, l.s);
  }

  slotMark(i: number): SlotMark {
    return this.slotMarks[i];
  }

  markOf(i: number): string {
    return this.marks[i];
  }
}
