// Five Card Cabin: Jacks or Better video poker on the 6/5 paytable. Each hand
// uses one fresh 52-card deck: deal five, hold any, and the replacements come
// from the same deck. Pure rules, no DOM or Node imports.
//
// Exports:
//   PokerHandRank, POKER_PAYTABLE, payMultiple(rank)  what each hand pays, times the bet
//   evaluate(hand)                                    the paying class of five cards
//   newDeck(rand)                                     a shuffled 52-card deck
//   holdAdvice(hand), holdReason(hand)                what simple strategy keeps, and why
//   holdValue(hand, holds)                            exact expected multiple of a hold

import { RANKS, SUITS, cardRank, cardSuit, newShoe, type Card } from '../casino-games';

export type PokerHandRank =
  | 'royal_flush'
  | 'straight_flush'
  | 'four_kind'
  | 'full_house'
  | 'flush'
  | 'straight'
  | 'three_kind'
  | 'two_pair'
  | 'jacks_better'
  | 'nothing';

/** Best first. Pays are times the bet; the 800 royal pays at every bet size. */
export const POKER_PAYTABLE: { rank: PokerHandRank; label: string; pays: number }[] = [
  { rank: 'royal_flush', label: 'Royal flush', pays: 800 },
  { rank: 'straight_flush', label: 'Straight flush', pays: 50 },
  { rank: 'four_kind', label: 'Four of a kind', pays: 25 },
  { rank: 'full_house', label: 'Full house', pays: 6 },
  { rank: 'flush', label: 'Flush', pays: 5 },
  { rank: 'straight', label: 'Straight', pays: 4 },
  { rank: 'three_kind', label: 'Three of a kind', pays: 3 },
  { rank: 'two_pair', label: 'Two pair', pays: 2 },
  { rank: 'jacks_better', label: 'Jacks or better', pays: 1 },
];

export function payMultiple(rank: PokerHandRank): number {
  return POKER_PAYTABLE.find((p) => p.rank === rank)?.pays ?? 0;
}

export function newDeck(rand: (n: number) => number): Card[] {
  return newShoe(1, rand);
}

// ---------------------------------------------------------------------------
// Fast evaluator. A card code is rank * 4 + suit, ranks 0..12 for 2..A.

const RANK_ORDER: string[] = [...RANKS.slice(1), 'A'];
const SUIT_ORDER: readonly string[] = SUITS;

/** Hand classes by index, matching the paytable order with 'nothing' last. */
const CLASSES: PokerHandRank[] = [...POKER_PAYTABLE.map((p) => p.rank), 'nothing'];
const PAYS: number[] = [...POKER_PAYTABLE.map((p) => p.pays), 0];

const TEN = 8;
const JACK = 9;
const ROYAL_BITS = 0x1f << TEN;
const HIGH_BITS = 0xf << JACK;
const WHEEL_BITS = (1 << 12) | 0xf;

/** Every five-rank window a straight can fill, the ace-low one included. */
const WINDOWS: number[] = [WHEEL_BITS];
for (let lo = 0; lo <= 8; lo++) WINDOWS.push(0x1f << lo);

const BITS = new Uint8Array(1 << 13);
const STRAIGHT = new Uint8Array(1 << 13);
for (let m = 1; m < 1 << 13; m++) BITS[m] = BITS[m >> 1] + (m & 1);
for (const w of WINDOWS) STRAIGHT[w] = 1;

function code(c: Card): number {
  const r = RANK_ORDER.indexOf(cardRank(c));
  const s = SUIT_ORDER.indexOf(cardSuit(c));
  if (r < 0 || s < 0) throw new Error(`Not a card: ${c}`);
  return r * 4 + s;
}

function codes(hand: Card[]): number[] {
  if (hand.length !== 5) throw new Error('A poker hand is exactly five cards');
  const out = hand.map(code);
  if (new Set(out).size !== 5) throw new Error('A poker hand cannot repeat a card');
  return out;
}

/** Index into CLASSES for five card codes. No allocation. */
function classify(a: number, b: number, c: number, d: number, e: number): number {
  const ba = 1 << (a >> 2);
  const bb = 1 << (b >> 2);
  const bc = 1 << (c >> 2);
  const bd = 1 << (d >> 2);
  const be = 1 << (e >> 2);
  // Ranks seen once, twice, three and four times.
  let seen = ba;
  let dup = seen & bb;
  seen |= bb;
  let trip = dup & bc;
  dup |= seen & bc;
  seen |= bc;
  let quad = trip & bd;
  trip |= dup & bd;
  dup |= seen & bd;
  seen |= bd;
  quad |= trip & be;
  trip |= dup & be;
  dup |= seen & be;
  seen |= be;
  switch (BITS[seen]) {
    case 5: {
      const flush = (((a ^ b) | (a ^ c) | (a ^ d) | (a ^ e)) & 3) === 0;
      const straight = STRAIGHT[seen] === 1;
      if (flush) return straight ? (seen === ROYAL_BITS ? 0 : 1) : 4;
      return straight ? 5 : 9;
    }
    case 4:
      return dup >= 1 << JACK ? 8 : 9;
    case 3:
      return trip ? 6 : 7;
    default:
      return quad ? 2 : 3;
  }
}

/** Exactly five cards. Aces play high or low in straights, no wraparound. */
export function evaluate(hand: Card[]): PokerHandRank {
  const [a, b, c, d, e] = codes(hand);
  return CLASSES[classify(a, b, c, d, e)];
}

// ---------------------------------------------------------------------------
// Hold values

function split(hand: Card[], holds: boolean[]): { held: number[]; rest: number[] } {
  const dealt = codes(hand);
  const held = dealt.filter((_, i) => holds[i]);
  const rest: number[] = [];
  for (let c = 0; c < 52; c++) if (!dealt.includes(c)) rest.push(c);
  return { held, rest };
}

/** Sum of pays over every way to fill slots pos..4 of `c` from rest[start..]. */
function sumDraws(c: Int32Array, pos: number, rest: Int32Array, start: number): number {
  const n = rest.length;
  let total = 0;
  if (pos === 4) {
    const a = c[0], b = c[1], cc = c[2], d = c[3];
    for (let i = start; i < n; i++) total += PAYS[classify(a, b, cc, d, rest[i])];
    return total;
  }
  for (let i = start; i <= n - (5 - pos); i++) {
    c[pos] = rest[i];
    total += sumDraws(c, pos + 1, rest, i + 1);
  }
  return total;
}

function choose(n: number, k: number): number {
  let out = 1;
  for (let i = 0; i < k; i++) out = (out * (n - i)) / (i + 1);
  return Math.round(out);
}

/**
 * Exact expected multiple of the bet for holding `holds` and drawing from
 * the 47 unseen cards (exhaustive). Drawing five checks 1,533,939 hands.
 */
export function holdValue(hand: Card[], holds: boolean[]): number {
  const { held, rest } = split(hand, holds);
  const c = Int32Array.from({ length: 5 }, (_, i) => held[i] ?? 0);
  if (held.length === 5) return PAYS[classify(c[0], c[1], c[2], c[3], c[4])];
  return sumDraws(c, held.length, Int32Array.from(rest), 0) / choose(rest.length, 5 - held.length);
}

// ---------------------------------------------------------------------------
// Hold advice: a simple Jacks or Better strategy, checked top to bottom.
// Masks use bit i for card i; a rule returns -1 when it does not apply.

interface HandInfo {
  r: number[];
  s: number[];
  /** How many of each rank the hand has. */
  count: number[];
  made: PokerHandRank;
}

interface Rule {
  reason: string | ((h: HandInfo) => string);
  hold: (h: HandInfo) => number;
}

const ALL = 0x1f;

const SUBSETS: number[][] = [[], [], [], [], [], []];
for (let m = 0; m <= ALL; m++) SUBSETS[BITS[m]].push(m);

const OUTSIDE = new Set<number>();
for (let lo = 0; lo <= 8; lo++) OUTSIDE.add(0xf << lo); // 2345 up to 10JQK

const SUITED_TEN_FACE = new Set([(1 << TEN) | (1 << JACK), (1 << TEN) | (1 << 10), (1 << TEN) | (1 << 11)]);

const MADE_REASON: Partial<Record<PokerHandRank, string>> = {
  royal_flush: 'Keep the royal flush.',
  straight_flush: 'Keep the straight flush.',
  four_kind: 'Keep the four of a kind.',
  full_house: 'Keep the full house.',
  flush: 'Keep the flush.',
  straight: 'Keep the straight.',
  three_kind: 'Keep the three of a kind.',
};
const made = (h: HandInfo) => MADE_REASON[h.made] ?? '';

function suited(h: HandInfo, m: number): boolean {
  let suit = -1;
  for (let i = 0; i < 5; i++) {
    if (!(m & (1 << i))) continue;
    if (suit < 0) suit = h.s[i];
    else if (h.s[i] !== suit) return false;
  }
  return true;
}

function rankBits(h: HandInfo, m: number): number {
  let bits = 0;
  for (let i = 0; i < 5; i++) if (m & (1 << i)) bits |= 1 << h.r[i];
  return bits;
}

const within = (bits: number, set: number) => (bits & ~set) === 0;
const fitsStraight = (bits: number) => WINDOWS.some((w) => within(bits, w));

/** First subset of `size` cards that passes `test`, or -1. */
function first(size: number, test: (m: number) => boolean): number {
  for (const m of SUBSETS[size]) if (test(m)) return m;
  return -1;
}

/** Cards that pass `test`, or -1 when none do. */
function where(test: (i: number) => boolean): number {
  let m = 0;
  for (let i = 0; i < 5; i++) if (test(i)) m |= 1 << i;
  return m || -1;
}

/** The lowest `n` high cards (J, Q, K, A), or -1 if there are fewer. */
function lowestHigh(h: HandInfo, n: number): number {
  const high = [0, 1, 2, 3, 4].filter((i) => h.r[i] >= JACK).sort((x, y) => h.r[x] - h.r[y]);
  if (high.length < n) return -1;
  return high.slice(0, n).reduce((m, i) => m | (1 << i), 0);
}

const RULES: Rule[] = [
  // 1. Royal flush, straight flush, four of a kind.
  { reason: made, hold: (h) => (['royal_flush', 'straight_flush', 'four_kind'].includes(h.made) ? ALL : -1) },
  // 2. Four to a royal.
  { reason: 'Four to a royal.', hold: (h) => first(4, (m) => suited(h, m) && within(rankBits(h, m), ROYAL_BITS)) },
  // 3. Three of a kind, straight, flush, full house.
  {
    reason: made,
    hold: (h) => {
      if (h.made === 'three_kind') return where((i) => h.count[h.r[i]] === 3);
      return ['straight', 'flush', 'full_house'].includes(h.made) ? ALL : -1;
    },
  },
  // 4. Four to a straight flush.
  { reason: 'Four to a straight flush.', hold: (h) => first(4, (m) => suited(h, m) && fitsStraight(rankBits(h, m))) },
  // 5. Two pair.
  { reason: 'Keep two pair.', hold: (h) => (h.made === 'two_pair' ? where((i) => h.count[h.r[i]] === 2) : -1) },
  // 6. High pair.
  { reason: 'Keep the high pair.', hold: (h) => (h.made === 'jacks_better' ? where((i) => h.count[h.r[i]] === 2) : -1) },
  // 7. Three to a royal.
  { reason: 'Three to a royal.', hold: (h) => first(3, (m) => suited(h, m) && within(rankBits(h, m), ROYAL_BITS)) },
  // 8. Four to a flush.
  { reason: 'Four to a flush.', hold: (h) => first(4, (m) => suited(h, m)) },
  // 9. Low pair.
  { reason: 'Keep the low pair.', hold: (h) => where((i) => h.count[h.r[i]] === 2) },
  // 10. Four to an outside straight.
  { reason: 'Four to an outside straight.', hold: (h) => first(4, (m) => OUTSIDE.has(rankBits(h, m))) },
  // 11. Two suited high cards.
  { reason: 'Two suited high cards.', hold: (h) => first(2, (m) => suited(h, m) && within(rankBits(h, m), HIGH_BITS)) },
  // 12. Three to a straight flush.
  { reason: 'Three to a straight flush.', hold: (h) => first(3, (m) => suited(h, m) && fitsStraight(rankBits(h, m))) },
  // 13. Two unsuited high cards, the lowest two if there are more.
  { reason: 'Two high cards.', hold: (h) => lowestHigh(h, 2) },
  // 14. Suited 10/J, 10/Q or 10/K.
  { reason: 'Suited ten and face card.', hold: (h) => first(2, (m) => suited(h, m) && SUITED_TEN_FACE.has(rankBits(h, m))) },
  // 15. One high card.
  { reason: 'One high card.', hold: (h) => lowestHigh(h, 1) },
  // 16. Discard everything.
  { reason: 'Draw five new cards.', hold: () => 0 },
];

function advise(hand: Card[]): { mask: number; reason: string } {
  const cs = codes(hand);
  const r = cs.map((c) => c >> 2);
  const count = new Array<number>(13).fill(0);
  for (const x of r) count[x]++;
  const h: HandInfo = { r, s: cs.map((c) => c & 3), count, made: CLASSES[classify(cs[0], cs[1], cs[2], cs[3], cs[4])] };
  for (const rule of RULES) {
    const mask = rule.hold(h);
    if (mask >= 0) return { mask, reason: typeof rule.reason === 'string' ? rule.reason : rule.reason(h) };
  }
  return { mask: 0, reason: 'Draw five new cards.' };
}

/** Which cards a strong simple strategy holds, from the ordered rule list above. */
export function holdAdvice(hand: Card[]): boolean[] {
  const { mask } = advise(hand);
  return [0, 1, 2, 3, 4].map((i) => (mask & (1 << i)) !== 0);
}

/** A short plain reason for the advice, like "Keep the high pair." or "Four to a flush." */
export function holdReason(hand: Card[]): string {
  return advise(hand).reason;
}
