// Blackjack round engine, shared by the server (which deals from a crypto
// shuffled shoe) and the client (which draws the table). No DOM or Node imports.
//
// Tables:
//   'saloon'  Rivet's Twenty-One. Six decks, dealer stands on all 17s.
//   'captain' The Captain's Table. Same, but the dealer hits soft 17 and a
//             hand that reaches six cards without busting wins at once
//             (six-card Charlie, pays 1 to 1).
// Both: blackjack pays 3 to 2, double on any first two cards, split once
// (no resplitting), double after split, split aces get one card each.
//
// API:
//   startRound(table, bet, draw)  deals a new round.
//   legalMoves(round)             moves allowed for the active hand.
//   applyMove(round, move, draw)  returns { round, cost }; never mutates the input.
//   roundTotals(round)            { staked, paid } for the whole round.
//   roundView(round)              what the player may see (hole card hidden).
//   bjAdvice(...)                 the basic strategy move (6 decks, DAS, no surrender).
//   bjAdviceReason(...)           a short plain reason for a move.
//   followsBook(round, move)      true when the move matches bjAdvice.
//
// Draw order, so a scripted shoe gives the same round every time:
//   1. The deal: player, dealer, player, dealer.
//   2. Each hit or double takes one card for the active hand.
//   3. After a split the first hand gets its second card at once; the second
//      hand gets its second card when the first hand is finished.
//   4. The dealer draws last, and only if some hand still needs the dealer.

import { cardRank, handValue, isBlackjack, type BjResult, type Card } from '../casino-games';

export type BjTable = 'saloon' | 'captain';

export interface BjRules {
  /** Dealer hits soft 17. */
  hitSoft17: boolean;
  /** Six-card Charlie wins at once. */
  charlie: boolean;
}

export const BJ_RULES: Record<BjTable, BjRules> = {
  saloon: { hitSoft17: false, charlie: false },
  captain: { hitSoft17: true, charlie: true },
};

export const BJ_DECKS = 6;

export type BjMove = 'hit' | 'stand' | 'double' | 'split';
export type BjOutcome = BjResult | 'charlie';

export interface BjHand {
  cards: Card[];
  /** The bet placed on this hand. A doubled hand stakes twice this. */
  bet: number;
  doubled: boolean;
  done: boolean;
  /** This hand came from a split. */
  split: boolean;
  result: BjOutcome | null;
  /** Credits returned for this hand, stake included. */
  payout: number;
}

export interface BjRound {
  table: BjTable;
  phase: 'player' | 'done';
  hands: BjHand[];
  /** Index of the hand being played. */
  active: number;
  /** The dealer's cards; the second is the hole card. */
  dealer: Card[];
}

export interface BjRoundView {
  table: BjTable;
  phase: 'idle' | 'player' | 'done';
  hands: BjHand[];
  active: number;
  /** The hole card shows as "??" while the player is still playing. */
  dealer: Card[];
}

// ---------------------------------------------------------------------------
// Engine

function newHand(cards: Card[], bet: number, split: boolean): BjHand {
  return { cards, bet, doubled: false, done: false, split, result: null, payout: 0 };
}

function cloneRound(r: BjRound): BjRound {
  return { ...r, hands: r.hands.map((h) => ({ ...h, cards: [...h.cards] })), dealer: [...r.dealer] };
}

function stakeOf(h: BjHand): number {
  return h.doubled ? h.bet * 2 : h.bet;
}

/** Blackjack value of one card: aces 11, faces 10. */
function cardValue(c: Card): number {
  const r = cardRank(c);
  if (r === 'A') return 11;
  if (r === 'J' || r === 'Q' || r === 'K') return 10;
  return Number(r);
}

function isPair(cards: Card[]): boolean {
  return cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]);
}

function isSplitAces(h: BjHand): boolean {
  return h.split && cardRank(h.cards[0]) === 'A';
}

/** Marks a hand finished if it busted, made a Charlie or reached 21. */
function checkHand(h: BjHand, rules: BjRules): void {
  const total = handValue(h.cards).total;
  if (total > 21) {
    h.done = true;
    h.result = 'bust';
    h.payout = 0;
  } else if (rules.charlie && h.cards.length >= 6) {
    h.done = true;
    h.result = 'charlie';
    h.payout = stakeOf(h) * 2;
  } else if (total === 21) {
    h.done = true;
  }
}

/** Gives a split hand its second card when it becomes active. */
function activate(h: BjHand, rules: BjRules, draw: () => Card): void {
  if (h.cards.length === 1) h.cards.push(draw());
  if (isSplitAces(h)) h.done = true;
  checkHand(h, rules);
}

function dealerPlays(dealer: Card[], rules: BjRules, draw: () => Card): void {
  for (;;) {
    const { total, soft } = handValue(dealer);
    if (total < 17 || (rules.hitSoft17 && total === 17 && soft)) dealer.push(draw());
    else return;
  }
}

/** Moves to the next unfinished hand, or plays the dealer and settles. */
function advance(r: BjRound, draw: () => Card): void {
  const rules = BJ_RULES[r.table];
  while (r.hands[r.active].done) {
    if (r.active < r.hands.length - 1) {
      r.active++;
      activate(r.hands[r.active], rules, draw);
      continue;
    }
    r.phase = 'done';
    const open = r.hands.filter((h) => h.result === null);
    if (open.length === 0) return;
    dealerPlays(r.dealer, rules, draw);
    const d = handValue(r.dealer).total;
    for (const h of open) {
      const p = handValue(h.cards).total;
      const stake = stakeOf(h);
      if (d > 21 || p > d) {
        h.result = 'win';
        h.payout = stake * 2;
      } else if (p === d) {
        h.result = 'push';
        h.payout = stake;
      } else {
        h.result = 'lose';
        h.payout = 0;
      }
    }
    return;
  }
}

/** Deals a new round. draw() returns the next card from the shoe. */
export function startRound(table: BjTable, bet: number, draw: () => Card): BjRound {
  const p1 = draw();
  const d1 = draw();
  const p2 = draw();
  const d2 = draw();
  const hand = newHand([p1, p2], bet, false);
  const r: BjRound = { table, phase: 'player', hands: [hand], active: 0, dealer: [d1, d2] };
  const pbj = isBlackjack(hand.cards);
  const dbj = isBlackjack(r.dealer);
  // The dealer peeks, so a dealer blackjack ends the round at once.
  if (pbj || dbj) {
    r.phase = 'done';
    hand.done = true;
    if (pbj && dbj) {
      hand.result = 'push';
      hand.payout = bet;
    } else if (pbj) {
      hand.result = 'blackjack';
      hand.payout = bet + Math.floor(bet * 1.5);
    } else {
      hand.result = 'lose';
      hand.payout = 0;
    }
  }
  return r;
}

export function legalMoves(r: BjRound): BjMove[] {
  if (r.phase !== 'player') return [];
  const h = r.hands[r.active];
  if (!h || h.done) return [];
  const moves: BjMove[] = ['hit', 'stand'];
  if (h.cards.length === 2 && !isSplitAces(h)) moves.push('double');
  if (r.hands.length === 1 && !h.split && isPair(h.cards)) moves.push('split');
  return moves;
}

/**
 * Applies a move and returns the new round plus the extra credits it costs
 * (one more bet for double and split, else 0). Throws on an illegal move.
 */
export function applyMove(r: BjRound, move: BjMove, draw: () => Card): { round: BjRound; cost: number } {
  if (r.phase !== 'player') throw new Error('The round is over.');
  if (!legalMoves(r).includes(move)) throw new Error(`You cannot ${move} now.`);
  const next = cloneRound(r);
  const rules = BJ_RULES[next.table];
  const h = next.hands[next.active];
  let cost = 0;
  switch (move) {
    case 'hit':
      h.cards.push(draw());
      checkHand(h, rules);
      break;
    case 'stand':
      h.done = true;
      break;
    case 'double':
      cost = h.bet;
      h.doubled = true;
      h.cards.push(draw());
      h.done = true;
      checkHand(h, rules);
      break;
    case 'split': {
      cost = h.bet;
      next.hands = [newHand([h.cards[0]], h.bet, true), newHand([h.cards[1]], h.bet, true)];
      next.active = 0;
      activate(next.hands[0], rules, draw);
      break;
    }
  }
  advance(next, draw);
  return { round: next, cost };
}

/** Total staked on the round and total paid back (sum of hand payouts). */
export function roundTotals(r: BjRound): { staked: number; paid: number } {
  let staked = 0;
  let paid = 0;
  for (const h of r.hands) {
    staked += stakeOf(h);
    paid += h.payout;
  }
  return { staked, paid };
}

/** What the player may see. While playing, the hole card is "??". */
export function roundView(r: BjRound | null): BjRoundView {
  if (!r) return { table: 'saloon', phase: 'idle', hands: [], active: 0, dealer: [] };
  const c = cloneRound(r);
  const dealer = c.phase === 'player' ? [c.dealer[0], '??'] : c.dealer;
  return { table: c.table, phase: c.phase, hands: c.hands, active: c.active, dealer };
}

// ---------------------------------------------------------------------------
// Basic strategy (six decks, double after split, no surrender).
// S17 chart for the saloon, H17 chart for the captain table. Charlie is ignored.

type Cell = 'H' | 'S' | 'D' | 'Ds';

function hardCell(total: number, up: number, h17: boolean): Cell {
  if (total <= 8) return 'H';
  if (total === 9) return up >= 3 && up <= 6 ? 'D' : 'H';
  if (total === 10) return up <= 9 ? 'D' : 'H';
  if (total === 11) return up <= 10 || h17 ? 'D' : 'H';
  if (total === 12) return up >= 4 && up <= 6 ? 'S' : 'H';
  if (total <= 16) return up <= 6 ? 'S' : 'H';
  return 'S';
}

function softCell(total: number, up: number, h17: boolean): Cell {
  if (total <= 12) return 'H';
  if (total <= 14) return up === 5 || up === 6 ? 'D' : 'H';
  if (total <= 16) return up >= 4 && up <= 6 ? 'D' : 'H';
  if (total === 17) return up >= 3 && up <= 6 ? 'D' : 'H';
  if (total === 18) {
    if (up >= 3 && up <= 6) return 'Ds';
    if (up === 2) return h17 ? 'Ds' : 'S';
    return up <= 8 ? 'S' : 'H';
  }
  if (total === 19) return h17 && up === 6 ? 'Ds' : 'S';
  return 'S';
}

/** Pair splitting chart, by the pair's card value (aces 11). */
function splitPair(value: number, up: number): boolean {
  switch (value) {
    case 11:
    case 8:
      return true;
    case 10:
    case 5:
      return false;
    case 9:
      return up <= 9 && up !== 7;
    case 7:
    case 3:
    case 2:
      return up <= 7;
    case 6:
      return up <= 6;
    case 4:
      return up === 5 || up === 6;
  }
  return false;
}

/**
 * The basic strategy move. canDouble and canSplit say what is legal now.
 * A double you cannot make falls back to hit (or stand on soft 18 and 19);
 * a split you cannot make plays the hand as its total.
 */
export function bjAdvice(cards: Card[], dealerUp: Card, rules: BjRules, canDouble: boolean, canSplit: boolean): BjMove {
  const up = cardValue(dealerUp);
  if (canSplit && isPair(cards) && splitPair(cardValue(cards[0]), up)) return 'split';
  const { total, soft } = handValue(cards);
  const cell = soft ? softCell(total, up, rules.hitSoft17) : hardCell(total, up, rules.hitSoft17);
  if (cell === 'D') return canDouble ? 'double' : 'hit';
  if (cell === 'Ds') return canDouble ? 'double' : 'stand';
  return cell === 'H' ? 'hit' : 'stand';
}

function upLabel(c: Card): string {
  const v = cardValue(c);
  if (v === 11) return 'an ace';
  if (v === 10) return 'a ten';
  return String(v);
}

function pairLabel(c: Card): string {
  const v = cardValue(c);
  if (v === 11) return 'aces';
  if (v === 10) return 'tens';
  return `${v}s`;
}

/** A short plain reason for a move, like "The book says stand on 16 against 6." */
export function bjAdviceReason(cards: Card[], dealerUp: Card, move: BjMove): string {
  const up = upLabel(dealerUp);
  if (move === 'split') return `The book says split ${pairLabel(cards[0])} against ${up}.`;
  const { total, soft } = handValue(cards);
  const hand = soft ? `soft ${total}` : String(total);
  return `The book says ${move} on ${hand} against ${up}.`;
}

/** True when the move matches the basic strategy move for the active hand. */
export function followsBook(r: BjRound, move: BjMove): boolean {
  const moves = legalMoves(r);
  if (moves.length === 0) return false;
  const h = r.hands[r.active];
  return bjAdvice(h.cards, r.dealer[0], BJ_RULES[r.table], moves.includes('double'), moves.includes('split')) === move;
}
