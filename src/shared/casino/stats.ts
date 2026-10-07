// The player's casino record, version 2: per game tallies, play days,
// voyages (visits), stamps and personal bests on top of the first casino's
// balance and history. Version 1 records load through `upgradeStats`, so
// every balance and history from before the boat survives. Pure functions,
// shared by the server (which writes records) and the client (which reads
// them). No DOM or Node imports.

import { START_CREDITS, freshStats, pushHistory, type CasinoStats, type DayTally, type GameTally, type Voyage } from '../slots';
import type { GameId } from './progress';

export const DAYS_MAX = 90;
export const VOYAGES_MAX = 20;
/** Plays from before the boat, kept as one row in the logbook. */
export const EARLIER = 'earlier';

export const VOYAGE_ID = /^[a-z0-9]{6,20}$/;
export const DAY_ID = /^\d{4}-\d{2}-\d{2}$/;

/** Fills in the version 2 fields of an older record, keeping every number it had. */
export function upgradeStats(raw: CasinoStats | null, now: number): CasinoStats {
  const s: CasinoStats = raw ? structuredClone(raw) : freshStats(now);
  if (s.v === 2) return s;
  s.v = 2;
  s.games ??= {};
  if (raw && raw.spins > 0 && !s.games[EARLIER]) s.games[EARLIER] = { plays: raw.spins, spent: raw.spent, earned: raw.earned, best: raw.biggestWin };
  s.days ??= [];
  s.voyages ??= [];
  s.stamps ??= [];
  // The first casino refilled to 1,000 without counting the credits it added,
  // so work them out from the balance; the invariant then holds from here on.
  s.refillCredits ??= s.balance - START_CREDITS - s.earned + s.spent;
  s.lowSinceRefill ??= s.balance;
  s.bookMoves ??= 0;
  s.anchorRun ??= 0;
  s.calmDrops ??= 0;
  s.playDays ??= 0;
  s.bests ??= {};
  s.bests.balance = Math.max(s.bests.balance ?? 0, s.balance, ...s.history.map((h) => h[1]));
  return s;
}

/** balance = START_CREDITS + refillCredits + earned - spent. Null when it holds. */
export function invariantProblem(s: CasinoStats): string | null {
  const want = START_CREDITS + (s.refillCredits ?? 0) + s.earned - s.spent;
  return s.balance === want ? null : `balance ${s.balance} should be ${want}`;
}

/** The player's local date if it is within 14 hours of the server's clock, else the UTC date. */
export function acceptDay(day: string | undefined, now: number): string {
  const utc = (t: number) => new Date(t).toISOString().slice(0, 10);
  const ok = new Set([utc(now - 14 * 3600_000), utc(now), utc(now + 14 * 3600_000)]);
  return day && DAY_ID.test(day) && ok.has(day) ? day : utc(now);
}

/** The local date in the browser, YYYY-MM-DD. */
export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface PlayContext {
  now: number;
  day: string;
  voyage: string | null;
}

function tally(s: CasinoStats, game: string): GameTally {
  s.games ??= {};
  return (s.games[game] ??= { plays: 0, spent: 0, earned: 0, best: 0 });
}

function today(s: CasinoStats, c: PlayContext, balanceBefore: number): DayTally {
  s.days ??= [];
  let d = s.days[s.days.length - 1];
  if (!d || d.d !== c.day) {
    d = { d: c.day, spent: 0, earned: 0, plays: 0, open: balanceBefore, close: balanceBefore, high: balanceBefore, low: balanceBefore };
    s.days.push(d);
    if (s.days.length > DAYS_MAX) s.days.splice(0, s.days.length - DAYS_MAX);
    s.playDays = (s.playDays ?? 0) + 1;
  }
  return d;
}

/**
 * The voyage this play belongs to. A new voyage id closes the previous one;
 * returns whether that earlier voyage ended up on the day (for Shore leave).
 */
function voyageFor(s: CasinoStats, c: PlayContext, balanceBefore: number): { v: Voyage | null; closedUp: boolean } {
  if (!c.voyage) return { v: null, closedUp: false };
  s.voyages ??= [];
  let v = s.voyages[s.voyages.length - 1];
  let closedUp = false;
  if (!v || v.id !== c.voyage) {
    if (v && v.earned > v.spent) closedUp = true;
    v = { id: c.voyage, at: c.now, until: c.now, open: balanceBefore, close: balanceBefore, high: balanceBefore, low: balanceBefore, plays: 0, spent: 0, earned: 0, best: 0 };
    s.voyages.push(v);
    if (s.voyages.length > VOYAGES_MAX) s.voyages.splice(0, s.voyages.length - VOYAGES_MAX);
  }
  return { v, closedUp };
}

export interface Movement {
  game: GameId;
  /** Credits taken from the balance now. */
  stake: number;
  /** Credits paid to the balance now (stake included). */
  paid: number;
  /** Counts as a new play (a deal or a spin, not a double or the payout of a hand). */
  play: boolean;
}

/**
 * Moves credits for one step of a game and updates every tally that follows
 * the balance. Returns whether a previous voyage closed up on the day.
 * Throws a plain Error('broke') when the balance cannot cover the stake.
 */
export function applyMovement(s: CasinoStats, m: Movement, c: PlayContext): { closedUp: boolean } {
  if (m.stake > s.balance) throw new Error('broke');
  const before = s.balance;
  const day = today(s, c, before);
  const { v, closedUp } = voyageFor(s, c, before);
  const g = tally(s, m.game);
  s.balance += m.paid - m.stake;
  s.spent += m.stake;
  s.earned += m.paid;
  g.spent += m.stake;
  g.earned += m.paid;
  g.best = Math.max(g.best, m.paid);
  s.biggestWin = Math.max(s.biggestWin, m.paid);
  day.spent += m.stake;
  day.earned += m.paid;
  day.close = s.balance;
  day.high = Math.max(day.high, s.balance);
  day.low = Math.min(day.low, s.balance);
  if (v) {
    v.spent += m.stake;
    v.earned += m.paid;
    v.close = s.balance;
    v.until = c.now;
    v.high = Math.max(v.high, s.balance);
    v.low = Math.min(v.low, s.balance);
    v.best = Math.max(v.best, m.paid);
    if (m.play) v.plays += 1;
    s.bests ??= {};
    s.bests.voyage = Math.max(s.bests.voyage ?? 0, v.earned - v.spent);
  }
  if (m.play) {
    s.spins += 1;
    g.plays += 1;
    day.plays += 1;
  }
  s.lowSinceRefill = Math.min(s.lowSinceRefill ?? s.balance, s.balance);
  s.bests ??= {};
  s.bests.balance = Math.max(s.bests.balance ?? 0, s.balance);
  s.history = pushHistory(s.history, c.now, s.balance);
  return { closedUp };
}

/**
 * Records how a settled play went, for streaks: a net win (paid more than
 * staked) extends the streak on that game; anything else ends it.
 */
export function settleStreak(s: CasinoStats, game: GameId, staked: number, paid: number): void {
  const won = paid > staked;
  const cur = s.streak;
  if (won) s.streak = { game, n: cur && cur.game === game ? cur.n + 1 : 1 };
  else s.streak = { game, n: 0 };
  s.bests ??= {};
  s.bests.streak = Math.max(s.bests.streak ?? 0, s.streak.n);
}

/** The free refill: back up to 1,000 when you are out. */
export function applyRefill(s: CasinoStats, now: number): void {
  s.refillCredits = (s.refillCredits ?? 0) + (START_CREDITS - s.balance);
  s.balance = START_CREDITS;
  s.refills += 1;
  s.lowSinceRefill = START_CREDITS;
  s.history = pushHistory(s.history, now, s.balance);
}
