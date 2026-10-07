import { describe, expect, it } from 'vitest';
import type { Card } from '../src/shared/casino-games';
import { evaluate, holdAdvice, holdReason, holdValue, newDeck, payMultiple, POKER_PAYTABLE } from '../src/shared/casino/poker';

// Seeded PRNG so the sampled hands are the same on every run.
function mulberry32(seed: number): (n: number) => number {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

const deal = (s: string): Card[] => s.split(' ');
/** The cards the advice keeps, as a string in hand order. */
const kept = (s: string) => {
  const hand = deal(s);
  const holds = holdAdvice(hand);
  return hand.filter((_, i) => holds[i]).join(' ');
};
const holdsFromMask = (m: number) => [0, 1, 2, 3, 4].map((i) => (m & (1 << i)) !== 0);
const maskOf = (holds: boolean[]) => holds.reduce((m, h, i) => (h ? m | (1 << i) : m), 0);

describe('five card cabin rules', () => {
  it('evaluates every hand class', () => {
    expect(evaluate(deal('AS KS QS JS 10S'))).toBe('royal_flush');
    expect(evaluate(deal('9H KH QH JH 10H'))).toBe('straight_flush');
    expect(evaluate(deal('AD 2D 3D 4D 5D'))).toBe('straight_flush');
    expect(evaluate(deal('7C 7D 7H 7S 2C'))).toBe('four_kind');
    expect(evaluate(deal('7C 7D 7H 2S 2C'))).toBe('full_house');
    expect(evaluate(deal('7C 7D 7H 2S 3C'))).toBe('three_kind');
    expect(evaluate(deal('2H 9H JH 4H KH'))).toBe('flush');
    expect(evaluate(deal('AS 2D 3H 4C 5S'))).toBe('straight');
    expect(evaluate(deal('10S JD QH KC AS'))).toBe('straight');
    expect(evaluate(deal('6S 7D 8H 9C 10S'))).toBe('straight');
    expect(evaluate(deal('QS KD AH 2C 3S'))).toBe('nothing'); // no wraparound
    expect(evaluate(deal('9S 9D 4H 4C KS'))).toBe('two_pair');
    expect(evaluate(deal('JS JD 4H 6C 2S'))).toBe('jacks_better');
    expect(evaluate(deal('AS 3D AH 6C 2S'))).toBe('jacks_better');
    expect(evaluate(deal('10S 10D 4H 6C 2S'))).toBe('nothing');
    expect(evaluate(deal('2S 5D 9H JC KS'))).toBe('nothing');
    expect(() => evaluate(deal('2S 5D 9H JC'))).toThrow();
    expect(() => evaluate(deal('2S 2S 9H JC KS'))).toThrow();
  });

  it('pays the 6/5 table, best first', () => {
    expect(POKER_PAYTABLE.map((p) => [p.rank, p.pays])).toEqual([
      ['royal_flush', 800],
      ['straight_flush', 50],
      ['four_kind', 25],
      ['full_house', 6],
      ['flush', 5],
      ['straight', 4],
      ['three_kind', 3],
      ['two_pair', 2],
      ['jacks_better', 1],
    ]);
    expect(payMultiple('full_house')).toBe(6);
    expect(payMultiple('nothing')).toBe(0);
    for (const p of POKER_PAYTABLE) expect(p.label).not.toMatch(/[\u2013\u2014]/);
  });

  it('deals 52 unique cards', () => {
    const deck = newDeck(mulberry32(7));
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
  });

  it('advises the well known holds', () => {
    const cases: [hand: string, keep: string, reason: string][] = [
      ['AS KS QS JS 10S', 'AS KS QS JS 10S', 'Keep the royal flush.'],
      ['7C 7D 7H 7S 2C', '7C 7D 7H 7S 2C', 'Keep the four of a kind.'],
      ['AS KS QS JS 3S', 'AS KS QS JS', 'Four to a royal.'], // over a made flush
      ['AS KS QS JS 10H', 'AS KS QS JS', 'Four to a royal.'], // over a made straight
      ['KS QS JS 10S KH', 'KS QS JS 10S', 'Four to a royal.'], // over a high pair
      ['9S KS QS JS 10S', '9S KS QS JS 10S', 'Keep the straight flush.'],
      ['7C 7D 7H 2S 3C', '7C 7D 7H', 'Keep the three of a kind.'],
      ['7C 7D 2H 2S 7S', '7C 7D 2H 2S 7S', 'Keep the full house.'],
      ['2H 9H JH 4H KH', '2H 9H JH 4H KH', 'Keep the flush.'],
      ['8S 9S 10S JS JH', '8S 9S 10S JS', 'Four to a straight flush.'], // over a high pair
      ['5H 6H 8H 9H KS', '5H 6H 8H 9H', 'Four to a straight flush.'], // inside
      ['9S 9D 4H 4C KS', '9S 9D 4H 4C', 'Keep two pair.'],
      ['JH JS 2H 5H 8H', 'JH JS', 'Keep the high pair.'], // over four to a flush
      ['AS KS QS AH 3D', 'AS AH', 'Keep the high pair.'], // over three to a royal
      ['AS KS QS 5S 8D', 'AS KS QS', 'Three to a royal.'], // over four to a flush
      ['4H 4S 7H 9H KH', '4H 7H 9H KH', 'Four to a flush.'], // over a low pair
      ['5H 5D 6C 7S 8H', '5H 5D', 'Keep the low pair.'], // over four to an outside straight
      ['5S 6D 7H 8C KS', '5S 6D 7H 8C', 'Four to an outside straight.'], // over one high card
      ['9S JS QS 3H 4D', 'JS QS', 'Two suited high cards.'], // over three to a straight flush
      ['5H 6H 8H 2C KD', '5H 6H 8H', 'Three to a straight flush.'], // over one high card
      ['AS KD JH 2C 5S', 'KD JH', 'Two high cards.'], // lowest two of three
      ['AS KD QH JC 3S', 'QH JC', 'Two high cards.'], // JQKA is not an outside straight
      ['10H JH 2S 4D 7C', '10H JH', 'Suited ten and face card.'], // over one high card
      ['AS 2D 3H 4C 9S', 'AS', 'One high card.'], // A234 is not an outside straight
      ['KH 2S 4D 7C 9S', 'KH', 'One high card.'],
      ['2S 4D 7C 9H 3C', '', 'Draw five new cards.'],
    ];
    for (const [hand, keep, reason] of cases) {
      expect(kept(hand), hand).toBe(keep);
      expect(holdReason(deal(hand)), hand).toBe(reason);
    }
  });

  it('values holds exactly', () => {
    expect(holdValue(deal('AS KS QS JS 10S'), [true, true, true, true, true])).toBe(800);
    // Nine hearts make the flush and three queens pair the queen: 48/47.
    expect(holdValue(deal('2H 5H 8H QH KS'), [true, true, true, true, false])).toBeCloseTo(48 / 47, 12);
    const drawFive = holdValue(deal('2S 7D 9H QC 4S'), [false, false, false, false, false]);
    expect(drawFive).toBeGreaterThan(0);
    expect(drawFive).toBeLessThan(1);
  });

  // Strategy quality. The evaluator checks every hold exactly: the 32 hold
  // patterns of one hand cover about 2.6 million draws (1,533,939 of them for
  // drawing five), which takes around 15 ms, so no sampling is needed. The
  // gap is the mean exact value of the best hold minus the advised hold.
  it('keeps the advised hold within 1 percent of the best hold', () => {
    const rand = mulberry32(2024);
    const hands = 400;
    let best = 0;
    let advised = 0;
    let misses = 0;
    for (let n = 0; n < hands; n++) {
      const hand = newDeck(rand).slice(0, 5);
      let top = -1;
      for (let m = 0; m < 32; m++) top = Math.max(top, holdValue(hand, holdsFromMask(m)));
      const mine = holdValue(hand, holdAdvice(hand));
      if (mine < top - 1e-9) misses++;
      best += top;
      advised += mine;
      expect(maskOf(holdAdvice(hand))).toBeLessThan(32);
    }
    best /= hands;
    advised /= hands;
    console.log(`strategy: best ${best.toFixed(5)}, advised ${advised.toFixed(5)}, gap ${(best - advised).toFixed(5)}, not best in ${misses} of ${hands} hands`);
    expect(best - advised).toBeGreaterThanOrEqual(0);
    expect(best - advised).toBeLessThan(0.01);
  });

  // Overall return: the mean exact value of the advised hold over many dealt
  // hands. Perfect 6/5 play returns about 0.950. Enumerating all 2,598,960
  // deals (one-off, too slow for a test) puts this strategy at 0.94895.
  it('returns about 95 percent with the advised holds', () => {
    const rand = mulberry32(95);
    const hands = 60000;
    let total = 0;
    for (let n = 0; n < hands; n++) {
      const hand = newDeck(rand).slice(0, 5);
      total += holdValue(hand, holdAdvice(hand));
    }
    const ret = total / hands;
    console.log(`return over ${hands} hands: ${ret.toFixed(5)}`);
    expect(ret).toBeGreaterThan(0.935);
    expect(ret).toBeLessThan(0.965);
  });
});
