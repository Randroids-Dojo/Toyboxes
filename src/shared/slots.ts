// The casino's slot machine: reel strips, paytable and the payout rule.
// Shared by the server (which decides every spin) and the client (which
// draws the reels and the paytable). No DOM or Node imports.

export type SlotSymbol = 'seven' | 'bar' | 'bell' | 'star' | 'cherry' | 'lemon';

/** One strip, used by all three reels. The payline is the middle row. */
export const REEL_STRIP: SlotSymbol[] = ['seven', 'lemon', 'bell', 'cherry', 'lemon', 'star', 'bar', 'lemon', 'bell', 'star', 'lemon', 'cherry', 'bell', 'lemon', 'star', 'bar'];

export const BETS = [10, 25, 50, 100] as const;
export const START_CREDITS = 1000;
export const HISTORY_MAX = 240;

export interface PayRule {
  label: string;
  multiplier: number;
}

/** Multipliers of the bet. Tuned for about 95% returned over many spins and a win on roughly 38% of spins. */
export const PAYTABLE: Record<string, PayRule> = {
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

/** Which rule a line of three symbols hits, if any. */
export function lineRule(line: SlotSymbol[]): string | null {
  const [a, b, c] = line;
  if (a === b && b === c) return `three_${a}`;
  const count = (s: SlotSymbol) => line.filter((x) => x === s).length;
  if (count('seven') === 2) return 'two_seven';
  if (count('cherry') === 2) return 'two_cherry';
  if (count('cherry') === 1) return 'one_cherry';
  return null;
}

export function payout(line: SlotSymbol[], bet: number): { rule: string | null; win: number } {
  const rule = lineRule(line);
  return { rule, win: rule ? PAYTABLE[rule].multiplier * bet : 0 };
}

/** Exact return over every reel combination, for tests and the paytable card. */
export function expectedReturn(): { rtp: number; hitRate: number } {
  let total = 0;
  let hits = 0;
  let n = 0;
  for (const a of REEL_STRIP)
    for (const b of REEL_STRIP)
      for (const c of REEL_STRIP) {
        const { win } = payout([a, b, c], 1);
        total += win;
        if (win > 0) hits++;
        n++;
      }
  return { rtp: total / n, hitRate: hits / n };
}

export interface CasinoStats {
  rev: number;
  balance: number;
  /** Total paid out to this player. */
  earned: number;
  /** Total bet by this player. */
  spent: number;
  spins: number;
  biggestWin: number;
  refills: number;
  /** [time ms, balance] after each spin or refill, oldest first. */
  history: [number, number][];
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
