import { describe, expect, it } from 'vitest';
import { newShoe, type Card } from '../src/shared/casino-games';
import {
  applyMove,
  BJ_DECKS,
  BJ_RULES,
  bjAdvice,
  bjAdviceReason,
  followsBook,
  legalMoves,
  roundTotals,
  roundView,
  startRound,
  type BjMove,
  type BjRound,
  type BjTable,
} from '../src/shared/casino/blackjack';

/** Deals the listed cards in order, then fails loudly if asked for more. */
function script(cards: Card[]): () => Card {
  const left = [...cards];
  return () => {
    const c = left.shift();
    if (!c) throw new Error('Script ran out of cards');
    return c;
  };
}

function play(r: BjRound, moves: BjMove[], draw: () => Card): { round: BjRound; cost: number } {
  let cost = 0;
  for (const m of moves) {
    const out = applyMove(r, m, draw);
    r = out.round;
    cost += out.cost;
  }
  return { round: r, cost };
}

describe('blackjack deal', () => {
  it('pays a natural 3 to 2 at once', () => {
    const r = startRound('saloon', 10, script(['AS', '9C', 'KH', '7D']));
    expect(r.phase).toBe('done');
    expect(r.hands[0].result).toBe('blackjack');
    expect(roundTotals(r)).toEqual({ staked: 10, paid: 25 });
  });

  it('ends the round when the dealer has blackjack', () => {
    const r = startRound('saloon', 10, script(['10S', 'AS', '9H', 'KD']));
    expect(r.phase).toBe('done');
    expect(r.hands[0].result).toBe('lose');
    expect(legalMoves(r)).toEqual([]);
    expect(roundTotals(r).paid).toBe(0);
  });

  it('pushes when both have blackjack', () => {
    const r = startRound('captain', 10, script(['AS', 'AH', 'KD', 'QC']));
    expect(r.hands[0].result).toBe('push');
    expect(r.hands[0].payout).toBe(10);
  });
});

describe('blackjack play', () => {
  it('busts on a hit and the dealer does not draw', () => {
    const draw = script(['10S', '9C', '6H', '7D', 'KD']);
    const { round } = play(startRound('saloon', 10, draw), ['hit'], draw);
    expect(round.phase).toBe('done');
    expect(round.hands[0].result).toBe('bust');
    expect(round.dealer).toHaveLength(2);
  });

  it('stands and the dealer draws to 17', () => {
    const draw = script(['10S', '6C', '8H', '5D', '2H', '4C']);
    const { round } = play(startRound('saloon', 10, draw), ['stand'], draw);
    expect(round.dealer).toEqual(['6C', '5D', '2H', '4C']);
    expect(round.hands[0].result).toBe('win');
    expect(round.hands[0].payout).toBe(20);
  });

  it('stands on soft 17 at the saloon and hits it at the captain table', () => {
    const cards = ['10S', 'AS', '8H', '6D', '4C'];
    let draw = script(cards);
    const saloon = play(startRound('saloon', 10, draw), ['stand'], draw).round;
    expect(saloon.dealer).toEqual(['AS', '6D']);
    expect(saloon.hands[0].result).toBe('win');
    draw = script(cards);
    const captain = play(startRound('captain', 10, draw), ['stand'], draw).round;
    expect(captain.dealer).toEqual(['AS', '6D', '4C']);
    expect(captain.hands[0].result).toBe('lose');
  });

  it('doubles for one card, one more bet, and pays 2x the stake', () => {
    const draw = script(['6S', '9C', '5H', '7D', 'KD', '2C']);
    const { round, cost } = play(startRound('saloon', 10, draw), ['double'], draw);
    expect(cost).toBe(10);
    expect(round.hands[0].cards).toHaveLength(3);
    expect(round.hands[0].doubled).toBe(true);
    expect(round.hands[0].result).toBe('win');
    expect(roundTotals(round)).toEqual({ staked: 20, paid: 40 });
  });

  it('splits into two hands played in order, with double after split', () => {
    const draw = script(['8S', '10C', '8H', '7D', '3C', 'KD', '2S', '9H']);
    let r = startRound('saloon', 10, draw);
    expect(legalMoves(r)).toContain('split');
    const split = applyMove(r, 'split', draw);
    expect(split.cost).toBe(10);
    r = split.round;
    expect(r.hands).toHaveLength(2);
    expect(r.active).toBe(0);
    expect(r.hands[0].cards).toEqual(['8S', '3C']);
    expect(r.hands[1].cards).toEqual(['8H']);
    expect(legalMoves(r)).toEqual(['hit', 'stand', 'double']);
    r = applyMove(r, 'double', draw).round;
    expect(r.active).toBe(1);
    expect(r.hands[1].cards).toEqual(['8H', '2S']);
    r = play(r, ['hit', 'stand'], draw).round;
    expect(r.phase).toBe('done');
    expect(r.hands.map((h) => h.result)).toEqual(['win', 'win']);
    expect(roundTotals(r)).toEqual({ staked: 30, paid: 60 });
  });

  it('gives split aces one card each and pays a two-card 21 at 1 to 1', () => {
    const draw = script(['AS', '9C', 'AH', '7D', 'KD', '5H', '4C']);
    const { round, cost } = play(startRound('saloon', 10, draw), ['split'], draw);
    expect(cost).toBe(10);
    expect(round.phase).toBe('done');
    expect(round.hands.map((h) => h.cards.length)).toEqual([2, 2]);
    expect(round.hands[0].result).toBe('win');
    expect(round.hands[0].payout).toBe(20);
    expect(round.hands[1].result).toBe('lose');
    expect(round.dealer).toEqual(['9C', '7D', '4C']);
  });

  it('splits a king and a ten but never resplits', () => {
    const draw = script(['KS', '9C', '10H', '7D', 'AS', '10C', '2C']);
    let r = startRound('captain', 10, draw);
    expect(legalMoves(r)).toContain('split');
    r = applyMove(r, 'split', draw).round;
    // The first hand made 21 with two cards and finished on its own.
    expect(r.hands[0].done).toBe(true);
    expect(r.active).toBe(1);
    expect(r.hands[1].cards).toEqual(['10H', '10C']);
    expect(legalMoves(r)).not.toContain('split');
    expect(() => applyMove(r, 'split', draw)).toThrow();
    r = applyMove(r, 'stand', draw).round;
    expect(r.hands[0].result).toBe('win');
    expect(r.hands[0].payout).toBe(20);
    expect(r.hands[1].result).toBe('win');
  });

  it('wins at once on a six-card Charlie at the captain table only', () => {
    const cards = ['2S', '10C', '3H', '7D', '2C', '3D', '2D', '4S'];
    let draw = script(cards);
    const captain = play(startRound('captain', 10, draw), ['hit', 'hit', 'hit', 'hit'], draw).round;
    expect(captain.phase).toBe('done');
    expect(captain.hands[0].result).toBe('charlie');
    expect(captain.hands[0].payout).toBe(20);
    expect(captain.dealer).toHaveLength(2);
    draw = script(cards);
    let saloon = play(startRound('saloon', 10, draw), ['hit', 'hit', 'hit', 'hit'], draw).round;
    expect(saloon.phase).toBe('player');
    saloon = applyMove(saloon, 'stand', draw).round;
    expect(saloon.hands[0].result).toBe('lose');
  });

  it('skips the dealer draw when every hand busts', () => {
    const draw = script(['8S', '10C', '8H', '6D', '5C', 'KD', '4S', 'QH']);
    const { round } = play(startRound('saloon', 10, draw), ['split', 'hit', 'hit'], draw);
    expect(round.phase).toBe('done');
    expect(round.hands.map((h) => h.result)).toEqual(['bust', 'bust']);
    expect(round.dealer).toHaveLength(2);
    expect(roundTotals(round)).toEqual({ staked: 20, paid: 0 });
  });

  it('hides the hole card until the round is done and never mutates the input', () => {
    expect(roundView(null).phase).toBe('idle');
    const draw = script(['10S', '6C', '8H', '5D', '2H', '4C']);
    const r = startRound('saloon', 10, draw);
    expect(roundView(r).dealer).toEqual(['6C', '??']);
    const done = applyMove(r, 'stand', draw).round;
    expect(r.phase).toBe('player');
    expect(r.dealer).toHaveLength(2);
    expect(roundView(done).dealer).toEqual(['6C', '5D', '2H', '4C']);
    expect(roundView(done).phase).toBe('done');
  });

  it('throws on illegal moves', () => {
    let draw = script(['2S', '10C', '3H', '7D', '4C']);
    const r = applyMove(startRound('saloon', 10, draw), 'hit', draw).round;
    expect(() => applyMove(r, 'double', draw)).toThrow();
    expect(() => applyMove(r, 'split', draw)).toThrow();
    draw = script(['AS', '9C', 'KH', '7D']);
    const done = startRound('saloon', 10, draw);
    expect(() => applyMove(done, 'stand', draw)).toThrow(/over/);
  });

  it('checks a move against the book', () => {
    const r = startRound('saloon', 10, script(['10S', '6C', '6H', '5D']));
    expect(followsBook(r, 'stand')).toBe(true);
    expect(followsBook(r, 'hit')).toBe(false);
  });
});

describe('blackjack basic strategy', () => {
  const S = BJ_RULES.saloon;
  const H = BJ_RULES.captain;
  const adv = (cards: Card[], up: Card, rules = S, canDouble = true, canSplit = true) => bjAdvice(cards, up, rules, canDouble, canSplit);

  it('matches the S17 chart for hard totals', () => {
    expect(adv(['5S', '3H'], '6C')).toBe('hit');
    expect(adv(['5S', '4H'], '2C')).toBe('hit');
    expect(adv(['5S', '4H'], '3C')).toBe('double');
    expect(adv(['5S', '4H'], '7C')).toBe('hit');
    expect(adv(['6S', '4H'], '9C')).toBe('double');
    expect(adv(['6S', '4H'], 'KC')).toBe('hit');
    expect(adv(['6S', '5H'], '10C')).toBe('double');
    expect(adv(['6S', '5H'], 'AC')).toBe('hit');
    expect(adv(['10S', '2H'], '3C')).toBe('hit');
    expect(adv(['10S', '2H'], '4C')).toBe('stand');
    expect(adv(['10S', '3H'], '2C')).toBe('stand');
    expect(adv(['10S', '6H'], '6C')).toBe('stand');
    expect(adv(['10S', '6H'], '10C')).toBe('hit');
    expect(adv(['10S', '6H'], '7C')).toBe('hit');
    expect(adv(['9S', '8H'], 'AC')).toBe('stand');
  });

  it('matches the S17 chart for soft totals', () => {
    expect(adv(['AS', '2H'], '5C')).toBe('double');
    expect(adv(['AS', '2H'], '4C')).toBe('hit');
    expect(adv(['AS', '4H'], '4C')).toBe('double');
    expect(adv(['AS', '6H'], '3C')).toBe('double');
    expect(adv(['AS', '6H'], '2C')).toBe('hit');
    expect(adv(['AS', '7H'], '2C')).toBe('stand');
    expect(adv(['AS', '7H'], '6C')).toBe('double');
    expect(adv(['AS', '7H'], '7C')).toBe('stand');
    expect(adv(['AS', '7H'], '9C')).toBe('hit');
    expect(adv(['AS', '7H'], 'AC')).toBe('hit');
    expect(adv(['AS', '8H'], '6C')).toBe('stand');
    expect(adv(['AS', '9H'], '6C')).toBe('stand');
  });

  it('matches the chart for pairs', () => {
    expect(adv(['AS', 'AH'], 'AC')).toBe('split');
    expect(adv(['8S', '8H'], '10C')).toBe('split');
    expect(adv(['KS', '10H'], '6C')).toBe('stand');
    expect(adv(['9S', '9H'], '7C')).toBe('stand');
    expect(adv(['9S', '9H'], '8C')).toBe('split');
    expect(adv(['9S', '9H'], 'AC')).toBe('stand');
    expect(adv(['5S', '5H'], '9C')).toBe('double');
    expect(adv(['4S', '4H'], '5C')).toBe('split');
    expect(adv(['4S', '4H'], '4C')).toBe('hit');
    expect(adv(['6S', '6H'], '2C')).toBe('split');
    expect(adv(['6S', '6H'], '7C')).toBe('hit');
    expect(adv(['7S', '7H'], '7C')).toBe('split');
    expect(adv(['7S', '7H'], '8C')).toBe('hit');
    expect(adv(['2S', '2H'], '7C')).toBe('split');
    expect(adv(['3S', '3H'], '8C')).toBe('hit');
  });

  it('uses the H17 chart at the captain table', () => {
    expect(adv(['6S', '5H'], 'AC', H)).toBe('double');
    expect(adv(['AS', '7H'], '2C', H)).toBe('double');
    expect(adv(['AS', '8H'], '6C', H)).toBe('double');
    expect(adv(['10S', '6H'], '10C', H)).toBe('hit');
    expect(adv(['AS', '8H'], '5C', H)).toBe('stand');
  });

  it('falls back when a double or split is not legal', () => {
    expect(adv(['6S', '5H'], '6C', S, false)).toBe('hit');
    expect(adv(['AS', '7H'], '6C', S, false)).toBe('stand');
    expect(adv(['AS', '8H'], '6C', H, false)).toBe('stand');
    expect(adv(['AS', '3H', '3D'], '4C', S, false)).toBe('hit');
    expect(adv(['AS', '2H'], '5C', S, false)).toBe('hit');
    expect(adv(['8S', '8H'], '10C', S, true, false)).toBe('hit');
    expect(adv(['8S', '8H'], '6C', S, true, false)).toBe('stand');
    expect(adv(['AS', 'AH'], '6C', S, true, false)).toBe('hit');
  });

  it('gives a short plain reason', () => {
    expect(bjAdviceReason(['10S', '6H'], '6C', 'stand')).toBe('The book says stand on 16 against 6.');
    expect(bjAdviceReason(['8S', '8H'], 'KC', 'split')).toBe('The book says split 8s against a ten.');
    expect(bjAdviceReason(['AS', '7H'], 'AC', 'hit')).toBe('The book says hit on soft 18 against an ace.');
    expect(bjAdviceReason(['AS', '7H'], 'AC', 'hit')).not.toMatch(/[\u2013\u2014]/);
  });
});

/** Small seeded PRNG so the simulation gives the same numbers every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulate(table: BjTable, rounds: number, seed: number): number {
  const rng = mulberry32(seed);
  const rand = (n: number) => Math.floor(rng() * n);
  const rules = BJ_RULES[table];
  let shoe = newShoe(BJ_DECKS, rand);
  const draw = () => shoe.pop()!;
  let staked = 0;
  let paid = 0;
  for (let i = 0; i < rounds; i++) {
    if (shoe.length < 52) shoe = newShoe(BJ_DECKS, rand);
    let r = startRound(table, 10, draw);
    while (r.phase === 'player') {
      const moves = legalMoves(r);
      const h = r.hands[r.active];
      const move = bjAdvice(h.cards, r.dealer[0], rules, moves.includes('double'), moves.includes('split'));
      r = applyMove(r, move, draw).round;
    }
    const t = roundTotals(r);
    staked += t.staked;
    paid += t.paid;
  }
  return paid / staked;
}

describe('blackjack return', () => {
  it('returns about 99.5% under basic strategy at both tables', () => {
    const rounds = 1_000_000;
    for (const [table, seed] of [['saloon', 12345], ['captain', 67890]] as const) {
      const rtp = simulate(table, rounds, seed);
      console.log(`blackjack ${table}: ${rounds} rounds, return ${(rtp * 100).toFixed(3)}%`);
      expect(rtp).toBeGreaterThan(0.985);
      expect(rtp).toBeLessThan(1.005);
    }
  }, 60_000);
});
