// Prism blade duels: the Prism Five's scripts, judging and scoring. A bout is
// two-bar phrases after a two-bar count-in. Guard phrases: the duelist
// strikes and you parry (strikes, eighth-note flurries, crushes you hold
// through a bind, and feints you must not touch). Strike phrases: openings
// you hit. Call and response: the duelist taps a rhythm, you play it back.
// Shared with the server, which replays the judgement log.

import { comboMult, gradeFor, WINDOW, type Grade } from './judge.js';
import { beatToSec, SONGS, type SongId } from './songs.js';

export type DuelistId = 'sprocket' | 'twinkle' | 'brick' | 'mirage' | 'knight';
export type DuelDir = 'high' | 'low' | 'left' | 'right' | 'thrust';
export type DuelKind = 'strike' | 'crush' | 'feint' | 'open' | 'call';

export interface Duelist {
  id: DuelistId;
  name: string;
  song: SongId;
  swing?: boolean;
  /** Tags to win. */
  need: number;
  /** The new idea, for the select screen. */
  idea: string;
  /** Phrases: `G:` guard, `S:` strike, `C:` call and response (8 slots, played back in the second bar). `T` before G or S reads the phrase on triplet eighths (24 slots). */
  script: string[];
}

export const DUELISTS: Duelist[] = [
  {
    id: 'sprocket',
    name: 'Sprocket',
    song: 'lights',
    need: 10,
    idea: 'Parry on the beat',
    script: [
      'G:..s.......s.....',
      'S:..o.......o.....',
      'G:..s...s...s.....',
      'S:..o...o.........',
      'G:..s...s...s...s.',
      'S:..o...o...o.....',
      'G:..s.s.......s...',
      'S:..o.......o.o...',
      'G:..s...s.s...s...',
      'S:..o...o...o.....',
      'G:..s...s...s...s.',
      'S:..o.o.......o...',
      'G:..s.s...s.s.....',
      'S:..o...o...o...o.',
    ],
  },
  {
    id: 'twinkle',
    name: 'Twinkle',
    song: 'glitter',
    need: 14,
    idea: 'Flurries on the eighths',
    script: [
      'G:..s...s...ss....',
      'S:..o...o...o.....',
      'G:..ss......s.s...',
      'S:..o.o.....o.....',
      'G:..s...ss..s...s.',
      'S:..o...oo....o...',
      'G:..ss...ss...s...',
      'S:..o.o...o...o...',
      'G:..s.ss..s.ss....',
      'S:..oo....o...oo..',
      'G:..ss..ss..ss....',
      'S:..o...o...o.o...',
      'G:..s.s.ss..s.s...',
      'S:..oo..oo..o.....',
      'G:..sss.....ss....',
      'S:..o.o.o...o.o...',
    ],
  },
  {
    id: 'brick',
    name: 'Brick',
    song: 'heart',
    need: 16,
    idea: 'Hold through the crush, then push',
    script: [
      'G:..s.......s.....',
      'S:..o...o...o.....',
      'G:..c=====......s.',
      'S:..o...o...o...o.',
      'G:..s...s...c====.',
      'S:..o.....o...o...',
      'G:..c====.....s...',
      'S:..o...o...o.o...',
      'G:..s.s...c=====..',
      'S:..o...o.....o...',
      'G:..c=====...s.s..',
      'S:..o.o...o...o...',
      'G:..s...c=======..',
      'S:..o...o...o...o.',
      'G:..c====...c====.',
      'S:..o.o.o.....o...',
    ],
  },
  {
    id: 'mirage',
    name: 'Mirage',
    song: 'heart',
    swing: true,
    need: 20,
    idea: "Don't touch the shimmer",
    script: [
      'G:..s...f...s.....',
      'S:..o...o...o...o.',
      'G:..f...s...s...f.',
      'C:o.o.o...',
      'G:..s.ss..f...s...',
      'TS:...o.o...o.o...o.o......',
      'G:..f.s...c====...',
      'C:o.oo..o.',
      'TG:...s.s...s.s......f.....',
      'S:..o.o...oo..o...',
      'G:..s...f.ss..f...',
      'C:oo..o.o.',
      'G:..c=====..f.s...',
      'S:..o...o.o...o.o.',
      'G:..f.s.s...f.ss..',
      'C:o.o.oo..',
      'G:..s.f...s.s.f...',
      'S:..oo..o.oo..o...',
    ],
  },
  {
    id: 'knight',
    name: 'Nova Knight',
    song: 'supernova',
    need: 24,
    idea: 'Everything, and faster',
    script: [
      'G:..s...s...ss....',
      'S:..o...o...o...o.',
      'G:..c====...f.s...',
      'C:o.o.o.o.',
      'G:..ss..f...ss....',
      'S:..o.o...oo..o...',
      'TG:...s.s...s.s...f........',
      'C:oo.o.o..',
      'G:..c=====..s.f...',
      'S:..oo..o.o...o.o.',
      'G:..s.ss..f.ss....',
      'C:o.oo..oo',
      'G:..f...c=====....',
      'S:..o.o.o.o...o...',
      'G:..ss.ss...f.s...',
      'C:o..oo.o.',
      'TS:...o.o...o.o...o.o...o..',
      'G:..c====..f..ss..',
      'S:..oo..oo..o.o...',
      'G:..s.f.ss..s.f...',
      'C:oo.oo.o.',
      'G:..ss..c=====....',
    ],
  },
];

export function duelist(id: DuelistId): Duelist {
  return DUELISTS.find((d) => d.id === id)!;
}

export interface DuelEvent {
  i: number;
  kind: DuelKind;
  beat: number;
  t: number;
  endBeat: number;
  endT: number;
  dir: DuelDir;
  phrase: number;
  /** Strike openings in a response bar (hidden on Echo). */
  response: boolean;
}

export interface DuelPhrase {
  kind: 'guard' | 'strike' | 'call';
  startBeat: number;
  startT: number;
}

export interface DuelScript {
  duelist: Duelist;
  events: DuelEvent[];
  /** Judged events (no calls), in order. */
  judged: DuelEvent[];
  phrases: DuelPhrase[];
  /** Song seconds when the bout ends if nobody is beaten. */
  endT: number;
  endBeat: number;
}

const COUNT_IN_BARS = 2;
const DIRS: DuelDir[] = ['high', 'left', 'low', 'right', 'thrust', 'left', 'high', 'right'];

export function buildScript(d: Duelist): DuelScript {
  const song = SONGS[d.song];
  const events: DuelEvent[] = [];
  const phrases: DuelPhrase[] = [];
  let bar = COUNT_IN_BARS;
  let dirN = 0;
  const push = (kind: DuelKind, beat: number, endBeat: number, phrase: number, response = false, dir?: DuelDir) => {
    const prev = events[events.length - 1];
    let dd = dir ?? DIRS[dirN++ % DIRS.length];
    // Flurries swap sides.
    if (!dir && prev && prev.kind === 'strike' && kind === 'strike' && beat - prev.beat <= 0.5 + 1e-6) dd = prev.dir === 'left' ? 'right' : 'left';
    events.push({ i: events.length, kind, beat, t: beatToSec(song, beat), endBeat, endT: beatToSec(song, endBeat), dir: dd, phrase, response });
  };
  d.script.forEach((raw, p) => {
    const m = /^(T?)([GSC]):(.*)$/.exec(raw);
    if (!m) throw new Error(`Bad phrase ${raw}`);
    const trip = m[1] === 'T';
    const type = m[2];
    const body = m[3];
    const start = bar * 4;
    phrases.push({ kind: type === 'G' ? 'guard' : type === 'S' ? 'strike' : 'call', startBeat: start, startT: beatToSec(song, start) });
    if (type === 'C') {
      if (body.length !== 8) throw new Error(`Call phrase needs 8 slots: ${raw}`);
      for (let k = 0; k < 8; k++) if (body[k] === 'o') push('call', start + k * 0.5, start + k * 0.5, p, false, 'thrust');
      for (let k = 0; k < 8; k++) if (body[k] === 'o') push('open', start + 4 + k * 0.5, start + 4 + k * 0.5, p, true);
    } else {
      const slots = trip ? 24 : 16;
      if (body.length !== slots) throw new Error(`Phrase needs ${slots} slots: ${raw}`);
      const per = 8 / slots;
      for (let k = 0; k < slots; k++) {
        const ch = body[k];
        const beat = start + k * per;
        if (ch === '.' || ch === '=') continue;
        if (ch === 's' && type === 'G') push('strike', beat, beat, p);
        else if (ch === 'f' && type === 'G') push('feint', beat, beat, p);
        else if (ch === 'c' && type === 'G') {
          let j = k + 1;
          while (j < slots && body[j] === '=') j++;
          if (j - k < 3) throw new Error(`Crush too short: ${raw}`);
          push('crush', beat, start + j * per, p, false, 'high');
        } else if (ch === 'o' && type === 'S') push('open', beat, beat, p);
        else throw new Error(`Bad step ${ch} in ${raw}`);
      }
    }
    bar += 2;
  });
  const endBeat = bar * 4 + 4;
  return { duelist: d, events, judged: events.filter((e) => e.kind !== 'call'), phrases, endT: beatToSec(song, endBeat), endBeat };
}

const cache = new Map<DuelistId, DuelScript>();

export function scriptFor(id: DuelistId): DuelScript {
  let s = cache.get(id);
  if (!s) {
    s = buildScript(duelist(id));
    cache.set(id, s);
  }
  return s;
}

/** Problems with a script (tests): events in order, gaps, wind-up room, spare openings. */
export function scriptProblems(s: DuelScript): string[] {
  const out: string[] = [];
  const ev = s.judged;
  for (let i = 1; i < ev.length; i++) {
    const a = ev[i - 1];
    const b = ev[i];
    if (b.beat <= a.beat) out.push(`Events out of order at ${b.beat}`);
    if (b.t - Math.max(a.t, a.endT) < 0.18 && !(a.kind === 'strike' && b.kind === 'strike')) out.push(`Too close at beat ${b.beat}`);
    if (b.t - a.t < 0.2) out.push(`Under 200 ms at beat ${b.beat}`);
  }
  const opens = ev.filter((e) => e.kind === 'open').length;
  if (opens < Math.ceil(s.duelist.need * 1.25)) out.push(`Only ${opens} openings for ${s.duelist.need} tags`);
  for (let i = 1; i < s.phrases.length; i++) if (s.phrases[i].kind === s.phrases[i - 1].kind && s.phrases[i].kind === 'guard') out.push(`Two guard phrases in a row at ${i}`);
  return out;
}

// ---------------------------------------------------------------------------
// Scoring

export const DUEL_PIPS = 5;
export const DUEL_WIDEN = 1.1;
export const DUEL_POINTS = { read: 150, crush: 500, ko: 2000, flawless: 3000 };

export type DuelOutcome = 'ko' | 'win' | 'loss' | 'out';

export interface DuelResult {
  score: number;
  tags: number;
  pipsLost: number;
  whiffs: number;
  counts: { P: number; G: number; O: number; M: number };
  reads: number;
  crushes: number;
  maxCombo: number;
  /** 0 to 1. */
  accuracy: number;
  outcome: DuelOutcome;
  /** Events judged before the bout ended. */
  judged: number;
}

/** Running duel score; feed judgements in script order. */
export class DuelScore {
  score = 0;
  combo = 0;
  maxCombo = 0;
  tags = 0;
  pips = DUEL_PIPS;
  whiffs = 0;
  reads = 0;
  crushes = 0;
  drops = 0;
  counts = { P: 0, G: 0, O: 0, M: 0 };
  judged = 0;
  private accSum = 0;
  outcome: DuelOutcome | null = null;

  constructor(readonly script: DuelScript) {}

  get need(): number {
    return this.script.duelist.need;
  }

  private hit(g: Grade): number {
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const pts = (g === 'P' ? 300 : g === 'G' ? 200 : 100) * comboMult(this.combo);
    this.score += pts;
    return pts;
  }

  private settle(): void {
    if (this.outcome) return;
    if (this.tags >= this.need) {
      this.outcome = 'ko';
      this.score += DUEL_POINTS.ko + (this.pips === DUEL_PIPS ? DUEL_POINTS.flawless : 0);
    } else if (this.pips <= 0) this.outcome = 'out';
  }

  /** A strike, crush head or opening. */
  grade(e: DuelEvent, g: Grade): number {
    if (this.outcome) return 0;
    this.judged++;
    this.counts[g]++;
    this.accSum += g === 'P' ? 1 : g === 'G' ? 0.67 : g === 'O' ? 0.33 : 0;
    let pts = 0;
    if (g === 'M') {
      this.combo = 0;
      if (e.kind !== 'open') this.pips--;
    } else {
      pts = this.hit(g);
      if (e.kind === 'open') this.tags++;
    }
    this.settle();
    return pts;
  }

  /** A feint: read (no press) or whiffed. */
  feint(read: boolean): number {
    if (this.outcome) return 0;
    this.judged++;
    if (read) {
      this.reads++;
      this.accSum += 1;
      this.score += DUEL_POINTS.read;
      return DUEL_POINTS.read;
    }
    this.whiffs++;
    this.combo = 0;
    this.settle();
    return 0;
  }

  /** A crush bind: kept to the push or dropped. */
  bind(kept: boolean): number {
    if (this.outcome) return 0;
    this.judged++;
    if (kept) {
      this.crushes++;
      this.accSum += 1;
      this.score += DUEL_POINTS.crush;
      this.settle();
      return DUEL_POINTS.crush;
    }
    this.drops++;
    this.combo = 0;
    this.pips--;
    this.settle();
    return 0;
  }

  /** The bout ran to the end of the song: the bigger glow share wins. */
  finishOnPoints(): void {
    if (this.outcome) return;
    const mine = this.pips / DUEL_PIPS;
    const theirs = 1 - this.tags / this.need;
    this.outcome = mine >= theirs ? 'win' : 'loss';
  }

  get accuracy(): number {
    return this.judged ? this.accSum / this.judged : 0;
  }

  result(): DuelResult {
    return { score: this.score, tags: this.tags, pipsLost: DUEL_PIPS - this.pips, whiffs: this.whiffs, counts: this.counts, reads: this.reads, crushes: this.crushes, maxCombo: this.maxCombo, accuracy: this.accuracy, outcome: this.outcome ?? 'loss', judged: this.judged };
  }
}

/** Log characters for one judged event: strikes and openings P G O M; feints R or W; a crush its head grade then H or D. */
export function scoreDuel(script: DuelScript, log: string): DuelResult | null {
  if (typeof log !== 'string' || log.length > 400) return null;
  const s = new DuelScore(script);
  let k = 0;
  for (const e of script.judged) {
    if (s.outcome) break;
    if (k >= log.length) return null;
    const c = log[k++];
    if (e.kind === 'feint') {
      if (c !== 'R' && c !== 'W') return null;
      s.feint(c === 'R');
    } else {
      if (c !== 'P' && c !== 'G' && c !== 'O' && c !== 'M') return null;
      s.grade(e, c);
      if (e.kind === 'crush' && !s.outcome) {
        const t = log[k++];
        if (t !== 'H' && t !== 'D') return null;
        if (c === 'M' && t === 'H') return null;
        s.bind(t === 'H');
      }
    }
  }
  if (k !== log.length) return null;
  s.finishOnPoints();
  return s.result();
}

/** A score no bout against this duelist can beat. */
export function duelCeiling(script: DuelScript): number {
  let n = 0;
  for (const e of script.judged) n += e.kind === 'feint' ? DUEL_POINTS.read : e.kind === 'crush' ? 1200 + DUEL_POINTS.crush : 1200;
  return n + DUEL_POINTS.ko + DUEL_POINTS.flawless;
}

/** Free play stars: win, 80% accuracy, 90% accuracy (a crown when flawless). */
export function duelStars(r: DuelResult): number {
  const won = r.outcome === 'ko' || r.outcome === 'win';
  if (!won) return 0;
  return r.accuracy >= 0.9 ? 3 : r.accuracy >= 0.8 ? 2 : 1;
}

export function duelFlawless(r: DuelResult): boolean {
  return (r.outcome === 'ko' || r.outcome === 'win') && r.pipsLost === 0 && r.whiffs === 0;
}

// ---------------------------------------------------------------------------
// Live judging

export type DuelJudgeEvent =
  | { kind: 'grade'; e: DuelEvent; grade: Grade; err: number; points: number }
  | { kind: 'feint'; e: DuelEvent; read: boolean; points: number }
  | { kind: 'bind'; e: DuelEvent }
  | { kind: 'push'; e: DuelEvent; kept: boolean; points: number }
  | { kind: 'end'; outcome: DuelOutcome };

export class LiveDuel {
  readonly score: DuelScore;
  next = 0;
  binding: DuelEvent | null = null;
  private marks: string[] = [];
  private widen: number;
  private easyHolds: boolean;
  /** Presses inside a feint's window turn it into a whiff. */
  private feintPressed = new Set<number>();
  ended = false;

  constructor(
    readonly script: DuelScript,
    opts: { widen?: number; easyHolds?: boolean } = {},
  ) {
    this.score = new DuelScore(script);
    this.widen = (opts.widen ?? 1) * DUEL_WIDEN;
    this.easyHolds = !!opts.easyHolds;
  }

  private win(): number {
    return WINDOW.O * this.widen;
  }

  sweep(t: number): DuelJudgeEvent[] {
    const out: DuelJudgeEvent[] = [];
    const ev = this.script.judged;
    if (this.binding && t >= this.binding.endT + 0.25) {
      const e = this.binding;
      this.binding = null;
      out.push(this.push(e, true));
    }
    while (!this.ended && this.next < ev.length && ev[this.next].t + this.win() < t && !this.binding) {
      const e = ev[this.next++];
      if (e.kind === 'feint') {
        const read = !this.feintPressed.has(e.i);
        this.marks.push(read ? 'R' : 'W');
        out.push({ kind: 'feint', e, read, points: this.score.feint(read) });
      } else {
        this.marks.push('M');
        out.push({ kind: 'grade', e, grade: 'M', err: 0, points: this.score.grade(e, 'M') });
        if (e.kind === 'crush' && !this.score.outcome) {
          this.marks.push('D');
          this.score.bind(false);
          out.push({ kind: 'push', e, kept: false, points: 0 });
        }
      }
      this.checkEnd(out);
    }
    if (!this.ended && this.next >= ev.length && !this.binding && t > this.script.endT) {
      this.score.finishOnPoints();
      this.checkEnd(out, true);
    }
    return out;
  }

  private checkEnd(out: DuelJudgeEvent[], force = false): void {
    if (this.ended) return;
    if (this.score.outcome || force) {
      this.ended = true;
      out.push({ kind: 'end', outcome: this.score.outcome ?? 'loss' });
    }
  }

  press(t: number): DuelJudgeEvent[] {
    const out = this.sweep(t);
    if (this.ended) return out;
    const ev = this.script.judged;
    const e = ev[this.next];
    if (!e || this.binding) return out;
    if (Math.abs(t - e.t) > this.win()) return out;
    if (e.kind === 'feint') {
      this.feintPressed.add(e.i);
      return out;
    }
    const err = t - e.t;
    const g = gradeFor(err, this.widen);
    this.next++;
    this.marks.push(g);
    out.push({ kind: 'grade', e, grade: g, err, points: this.score.grade(e, g) });
    if (e.kind === 'crush' && !this.score.outcome) {
      if (this.easyHolds) {
        out.push(this.push(e, true));
      } else {
        this.binding = e;
        out.push({ kind: 'bind', e });
      }
    }
    this.checkEnd(out);
    return out;
  }

  release(t: number): DuelJudgeEvent[] {
    const e = this.binding;
    if (!e) return [];
    this.binding = null;
    const out = [this.push(e, t >= e.endT - 0.12)];
    this.checkEnd(out);
    return out;
  }

  private push(e: DuelEvent, kept: boolean): DuelJudgeEvent {
    this.marks.push(kept ? 'H' : 'D');
    return { kind: 'push', e, kept, points: this.score.bind(kept) };
  }

  log(): string {
    return this.marks.join('');
  }
}
