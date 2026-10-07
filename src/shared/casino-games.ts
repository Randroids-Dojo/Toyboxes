// Rules for the casino's table games, shared by the server (which deals
// and spins) and the client (which draws them). No DOM or Node imports.

// ---------------------------------------------------------------------------
// Roulette (European, single zero)

export const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

/** Pocket order around a European wheel, clockwise from zero. */
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

export type RouletteType = 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' | 'dozen1' | 'dozen2' | 'dozen3' | 'col1' | 'col2' | 'col3' | 'number';

export interface RouletteBet {
  type: RouletteType;
  /** Only for 'number'. */
  number?: number;
}

export const ROULETTE_LABELS: Record<RouletteType, string> = {
  red: 'Red',
  black: 'Black',
  odd: 'Odd',
  even: 'Even',
  low: '1 to 18',
  high: '19 to 36',
  dozen1: '1st 12',
  dozen2: '2nd 12',
  dozen3: '3rd 12',
  col1: 'Column 1',
  col2: 'Column 2',
  col3: 'Column 3',
  number: 'Lucky number',
};

export function pocketColor(n: number): 'green' | 'red' | 'black' {
  return n === 0 ? 'green' : ROULETTE_RED.has(n) ? 'red' : 'black';
}

/** What comes back for each credit bet, stake included (0 = lost). */
export function rouletteReturn(bet: RouletteBet, pocket: number): number {
  if (bet.type === 'number') return bet.number === pocket ? 36 : 0;
  if (pocket === 0) return 0;
  switch (bet.type) {
    case 'red':
      return ROULETTE_RED.has(pocket) ? 2 : 0;
    case 'black':
      return ROULETTE_RED.has(pocket) ? 0 : 2;
    case 'odd':
      return pocket % 2 === 1 ? 2 : 0;
    case 'even':
      return pocket % 2 === 0 ? 2 : 0;
    case 'low':
      return pocket <= 18 ? 2 : 0;
    case 'high':
      return pocket >= 19 ? 2 : 0;
    case 'dozen1':
      return pocket <= 12 ? 3 : 0;
    case 'dozen2':
      return pocket >= 13 && pocket <= 24 ? 3 : 0;
    case 'dozen3':
      return pocket >= 25 ? 3 : 0;
    case 'col1':
    case 'col2':
    case 'col3':
      // Column 1 holds 1, 4, 7 ... 34; column 3 holds 3, 6 ... 36.
      return (pocket - 1) % 3 === Number(bet.type[3]) - 1 ? 3 : 0;
  }
  return 0;
}

/** A chip stack on the betting board: where it is and how many credits. */
export interface RouletteChip extends RouletteBet {
  amount: number;
}

/** Most separate bets in one spin. */
export const ROULETTE_MAX_BETS = 8;

/** Credits back for every bet on the board when `pocket` comes up (stakes included). */
export function rouletteBoardReturn(bets: RouletteChip[], pocket: number): { total: number; perBet: number[] } {
  const perBet = bets.map((b) => rouletteReturn(b, pocket) * b.amount);
  return { total: perBet.reduce((a, b) => a + b, 0), perBet };
}

/** A stable key for a board cell, e.g. "red" or "number:17". */
export function rouletteKey(b: RouletteBet): string {
  return b.type === 'number' ? `number:${b.number}` : b.type;
}

// ---------------------------------------------------------------------------
// Blackjack (six decks, dealer stands on all 17s, blackjack pays 3:2)

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export const SUITS = ['S', 'H', 'D', 'C'] as const;

/** A card is rank then suit, like "10H" or "AS". "??" is a face-down card. */
export type Card = string;

export function newShoe(decks: number, rand: (n: number) => number): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) for (const s of SUITS) for (const r of RANKS) cards.push(r + s);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function cardRank(c: Card): string {
  return c.slice(0, -1);
}

export function cardSuit(c: Card): string {
  return c.slice(-1);
}

export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = cardRank(c);
    if (r === 'A') {
      aces++;
      total += 11;
    } else if (r === 'J' || r === 'Q' || r === 'K') total += 10;
    else total += Number(r);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export type BjResult = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

/** Settles a finished hand: the result and what comes back, stake included. */
export function settle(player: Card[], dealer: Card[], stake: number): { result: BjResult; payout: number } {
  const p = handValue(player).total;
  const d = handValue(dealer).total;
  if (p > 21) return { result: 'bust', payout: 0 };
  const pbj = isBlackjack(player);
  const dbj = isBlackjack(dealer);
  if (pbj && !dbj) return { result: 'blackjack', payout: stake + Math.floor(stake * 1.5) };
  if (dbj && !pbj) return { result: 'lose', payout: 0 };
  if (d > 21 || p > d) return { result: 'win', payout: stake * 2 };
  if (p === d) return { result: 'push', payout: stake };
  return { result: 'lose', payout: 0 };
}

export interface BjView {
  phase: 'idle' | 'player' | 'done';
  player: Card[];
  /** The hole card shows as "??" until the hand is over. */
  dealer: Card[];
  bet: number;
  doubled: boolean;
  result: BjResult | null;
  payout: number;
}
