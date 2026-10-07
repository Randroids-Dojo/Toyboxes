// The casino's slot machines: Old Lucky's reel strip, paytable, the Paddle
// Wheel bonus ring and the jackpots, plus the first machine's rules (kept for
// browser tabs opened before Old Lucky arrived). Shared by the server (which
// decides every spin) and the client (which draws the reels and the
// paytable). No DOM or Node imports.

export type SlotSymbol = 'seven' | 'bar' | 'bell' | 'star' | 'cherry' | 'lemon' | 'paddle';

/** Old Lucky's strip, used by all three reels. The payline is the middle row. */
export const REEL_STRIP: SlotSymbol[] = ['seven', 'lemon', 'bell', 'cherry', 'paddle', 'lemon', 'star', 'bar', 'lemon', 'bell', 'paddle', 'star', 'lemon', 'cherry', 'bell', 'lemon', 'paddle', 'star', 'bar', 'lemon'];

/** Every bet on the boat. 250 and 500 open with First Mate rank. */
export const BETS = [10, 25, 50, 100] as const;
export const HIGH_BETS = [10, 25, 50, 100, 250, 500] as const;
export const START_CREDITS = 1000;
export const HISTORY_MAX = 240;

export interface PayRule {
  label: string;
  multiplier: number;
}

/** Multipliers of the bet, checked in this order. */
export const PAYTABLE: Record<string, PayRule> = {
  three_seven: { label: 'Three sevens', multiplier: 200 },
  three_bar: { label: 'Three bars', multiplier: 40 },
  three_cherry: { label: 'Three cherries', multiplier: 25 },
  three_bell: { label: 'Three bells', multiplier: 12 },
  three_star: { label: 'Three stars', multiplier: 12 },
  two_seven: { label: 'Two sevens', multiplier: 12 },
  two_cherry: { label: 'Two cherries', multiplier: 4 },
  three_lemon: { label: 'Three lemons', multiplier: 3 },
  mixed_fruit: { label: 'Mixed fruit', multiplier: 2 },
  one_cherry: { label: 'One cherry', multiplier: 1 },
};

const FRUIT = new Set<SlotSymbol>(['cherry', 'lemon', 'bell']);

/** Which rule a payline of three symbols hits: a paytable key, 'bonus' for three paddles, or null. */
export function lineRule(line: SlotSymbol[]): string | null {
  const [a, b, c] = line;
  if (a === 'paddle' && b === 'paddle' && c === 'paddle') return 'bonus';
  if (a === b && b === c && PAYTABLE[`three_${a}`]) return `three_${a}`;
  const count = (s: SlotSymbol) => line.filter((x) => x === s).length;
  if (count('seven') === 2) return 'two_seven';
  if (count('cherry') === 2) return 'two_cherry';
  if (line.every((s) => FRUIT.has(s))) return 'mixed_fruit';
  if (count('cherry') === 1) return 'one_cherry';
  return null;
}

/** The base game's pay for a line (the bonus is paid by the ring). */
export function payout(line: SlotSymbol[], bet: number): { rule: string | null; win: number } {
  const rule = lineRule(line);
  return { rule, win: rule && rule !== 'bonus' ? PAYTABLE[rule].multiplier * bet : 0 };
}

// ---------------------------------------------------------------------------
// The Paddle Wheel bonus: three paddles spin the inner ring of the River Wheel.

export type RingSegment = number | 'MINI' | 'MAJOR' | 'GRAND';

export const MINI_X = 20;
export const MAJOR_X = 100;
export const GRAND_SEED = 250;
export const GRAND_CAP = 600;
/** GRAND grows by this much of a bet with every Old Lucky spin anyone makes in this casino. */
export const GRAND_GROWTH = 0.01;

/** Takes values round-robin from groups of [value, count] until all are used. */
function roundRobin(groups: [number, number][]): number[] {
  const left = groups.map(([v, k]) => [v, k] as [number, number]);
  const out: number[] = [];
  while (left.some((g) => g[1] > 0))
    for (const g of left)
      if (g[1] > 0) {
        out.push(g[0]);
        g[1]--;
      }
  return out;
}

/**
 * 48 segments, clockwise from the pointer at rest: GRAND at the top, MINI
 * every sixth segment, MAJOR at a quarter and three quarters round, and the
 * multipliers zipped low and high in between so the ring reads evenly.
 */
export const BONUS_RING: RingSegment[] = (() => {
  const ring: (RingSegment | null)[] = new Array(48).fill(null);
  ring[0] = 'GRAND';
  for (let i = 3; i < 48; i += 6) ring[i] = 'MINI';
  ring[12] = ring[36] = 'MAJOR';
  ring[24] = 40;
  const lows = roundRobin([
    [5, 8],
    [8, 7],
    [10, 6],
  ]);
  const highs = roundRobin([
    [12, 5],
    [15, 4],
    [20, 3],
    [25, 2],
    [30, 1],
  ]);
  const free = ring.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
  const nHigh = highs.length;
  free.forEach((at, i) => {
    const high = Math.floor(((i + 1) * nHigh) / free.length) > Math.floor((i * nHigh) / free.length);
    ring[at] = high ? highs.shift()! : lows.shift()!;
  });
  return ring as RingSegment[];
})();

/** The GRAND multiplier after `spinsSince` Old Lucky spins without a GRAND. */
export function grandMultiplier(spinsSince: number): number {
  return Math.min(GRAND_CAP, Math.round((GRAND_SEED + GRAND_GROWTH * Math.max(0, spinsSince)) * 100) / 100);
}

/** What a ring segment pays, as a multiple of the bet. */
export function ringMultiplier(seg: RingSegment, grand: number): number {
  return seg === 'MINI' ? MINI_X : seg === 'MAJOR' ? MAJOR_X : seg === 'GRAND' ? grand : seg;
}

/** Exact return over every reel combination with GRAND at `grand`, for tests and the paytable card. */
export function expectedReturn(grand = GRAND_SEED): { rtp: number; base: number; hitRate: number; netWinRate: number; bonusRate: number } {
  let base = 0;
  let hits = 0;
  let net = 0;
  let bonus = 0;
  let n = 0;
  for (const a of REEL_STRIP)
    for (const b of REEL_STRIP)
      for (const c of REEL_STRIP) {
        const rule = lineRule([a, b, c]);
        n++;
        if (rule === 'bonus') {
          bonus++;
          hits++;
          net++;
        } else if (rule) {
          base += PAYTABLE[rule].multiplier;
          hits++;
          if (PAYTABLE[rule].multiplier > 1) net++;
        }
      }
  const ring = BONUS_RING.reduce<number>((s, seg) => s + ringMultiplier(seg, grand), 0) / BONUS_RING.length;
  return { rtp: (base + bonus * ring) / n, base: base / n, hitRate: hits / n, netWinRate: net / n, bonusRate: bonus / n };
}

// ---------------------------------------------------------------------------
// The first machine (before Old Lucky). Browser tabs opened before the update
// still spin with these rules through the old `spin` action, so the reels they
// draw match what they win.

export const LEGACY_STRIP: SlotSymbol[] = ['seven', 'lemon', 'bell', 'cherry', 'lemon', 'star', 'bar', 'lemon', 'bell', 'star', 'lemon', 'cherry', 'bell', 'lemon', 'star', 'bar'];

export const LEGACY_PAYTABLE: Record<string, PayRule> = {
  three_seven: { label: 'Three sevens', multiplier: 150 },
  three_bar: { label: 'Three bars', multiplier: 25 },
  three_cherry: { label: 'Three cherries', multiplier: 20 },
  three_bell: { label: 'Three bells', multiplier: 10 },
  three_star: { label: 'Three stars', multiplier: 10 },
  three_lemon: { label: 'Three lemons', multiplier: 5 },
  two_seven: { label: 'Two sevens', multiplier: 8 },
  two_cherry: { label: 'Two cherries', multiplier: 4 },
  one_cherry: { label: 'One cherry', multiplier: 1 },
};

export function legacyPayout(line: SlotSymbol[], bet: number): { rule: string | null; win: number } {
  const [a, b, c] = line;
  let rule: string | null = null;
  const count = (s: SlotSymbol) => line.filter((x) => x === s).length;
  if (a === b && b === c) rule = `three_${a}`;
  else if (count('seven') === 2) rule = 'two_seven';
  else if (count('cherry') === 2) rule = 'two_cherry';
  else if (count('cherry') === 1) rule = 'one_cherry';
  return { rule, win: rule && LEGACY_PAYTABLE[rule] ? LEGACY_PAYTABLE[rule].multiplier * bet : 0 };
}

// ---------------------------------------------------------------------------
// The player's record. Version 1 records (from the first casino) load as is;
// `upgradeStats` in src/shared/casino/stats.ts fills in the newer fields.

export interface GameTally {
  plays: number;
  spent: number;
  earned: number;
  /** Biggest single payout on this game. */
  best: number;
}

export interface DayTally {
  /** The player's local date, YYYY-MM-DD. */
  d: string;
  spent: number;
  earned: number;
  plays: number;
  open: number;
  close: number;
  high: number;
  low: number;
}

/** One visit to the boat. */
export interface Voyage {
  id: string;
  at: number;
  until: number;
  open: number;
  close: number;
  high: number;
  low: number;
  plays: number;
  spent: number;
  earned: number;
  /** Biggest single payout this visit. */
  best: number;
}

export interface CasinoStats {
  rev: number;
  balance: number;
  /** Total paid out to this player. */
  earned: number;
  /** Total bet by this player. */
  spent: number;
  /** Plays on every game (the name is from when there was one machine). */
  spins: number;
  biggestWin: number;
  refills: number;
  /** [time ms, balance] after each play or refill, oldest first. */
  history: [number, number][];
  // Version 2.
  v?: 2;
  games?: Record<string, GameTally>;
  days?: DayTally[];
  voyages?: Voyage[];
  stamps?: string[];
  /** Credits added by free refills, so balance = START + refillCredits + earned - spent. */
  refillCredits?: number;
  /** Net wins in a row on one game. */
  streak?: { game: string; n: number };
  /** Lowest balance since the last refill, for the Comeback stamp. */
  lowSinceRefill?: number;
  /** Blackjack moves that matched the strategy card. */
  bookMoves?: number;
  /** River Wheel Anchor wins in a row. */
  anchorRun?: number;
  calmDrops?: number;
  /** Different local days with at least one play. */
  playDays?: number;
  bests?: { falls?: number; poker?: string; streak?: number; voyage?: number; balance?: number };
}

export function freshStats(now: number): CasinoStats {
  return { rev: 0, balance: START_CREDITS, earned: 0, spent: 0, spins: 0, biggestWin: 0, refills: 0, history: [[now, START_CREDITS]] };
}

/** Keeps the history bounded by thinning the oldest half when it grows too long. */
export function pushHistory(h: [number, number][], at: number, balance: number): [number, number][] {
  const next = [...h, [at, balance] as [number, number]];
  if (next.length <= HISTORY_MAX) return next;
  const half = Math.floor(next.length / 2);
  return [...next.slice(0, half).filter((_, i) => i % 2 === 0), ...next.slice(half)];
}
