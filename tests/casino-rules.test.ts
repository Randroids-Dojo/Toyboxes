import { describe, expect, it } from 'vitest';
import { BONUS_RING, GRAND_CAP, REEL_STRIP, expectedReturn, grandMultiplier, lineRule, payout } from '../src/shared/slots';
import { WHEEL_SEGMENTS, WHEEL_SYMBOLS, wheelExpected, wheelReturn } from '../src/shared/casino/wheel';
import { FALLS_BINS, FALLS_RISKS, fallsBin, fallsChances, fallsExpected, fallsWin } from '../src/shared/casino/plinko';
import { RANKS, STAMPS, awardStamps, betAllowed, chipsFor, nextStamp, rankFor, tableMax } from '../src/shared/casino/progress';
import { rouletteBoardReturn, rouletteReturn } from '../src/shared/casino-games';
import { applyMovement, applyRefill, invariantProblem, settleStreak, upgradeStats } from '../src/shared/casino/stats';

describe('Old Lucky', () => {
  it('has the 20 stop strip as designed', () => {
    const count = (s: string) => REEL_STRIP.filter((x) => x === s).length;
    expect(REEL_STRIP).toHaveLength(20);
    expect([count('seven'), count('bar'), count('star'), count('bell'), count('cherry'), count('lemon'), count('paddle')]).toEqual([1, 2, 3, 3, 2, 6, 3]);
  });

  it('pays a little under what it takes, often, with the bonus about 1 in 296', () => {
    const at250 = expectedReturn(250);
    expect(at250.rtp).toBeGreaterThan(0.93);
    expect(at250.rtp).toBeLessThan(0.955);
    expect(expectedReturn(GRAND_CAP).rtp).toBeLessThanOrEqual(0.98);
    expect(at250.hitRate).toBeGreaterThanOrEqual(0.33);
    expect(at250.netWinRate).toBeGreaterThanOrEqual(0.18);
    expect(1 / at250.bonusRate).toBeGreaterThan(250);
    expect(1 / at250.bonusRate).toBeLessThan(350);
    expect(at250.base).toBeCloseTo(0.87, 3);
  });

  it('reads lines by the paytable', () => {
    expect(lineRule(['paddle', 'paddle', 'paddle'])).toBe('bonus');
    expect(lineRule(['seven', 'seven', 'lemon'])).toBe('two_seven');
    expect(lineRule(['cherry', 'lemon', 'bell'])).toBe('mixed_fruit');
    expect(lineRule(['cherry', 'star', 'bar'])).toBe('one_cherry');
    expect(lineRule(['star', 'bar', 'lemon'])).toBeNull();
    expect(payout(['paddle', 'paddle', 'paddle'], 10).win).toBe(0);
    expect(payout(['bar', 'bar', 'bar'], 25).win).toBe(1000);
  });

  it('has the bonus ring as designed and a GRAND that grows to its cap', () => {
    const count = (v: unknown) => BONUS_RING.filter((x) => x === v).length;
    expect(BONUS_RING).toHaveLength(48);
    expect([count('MINI'), count('MAJOR'), count('GRAND'), count(5), count(40)]).toEqual([8, 2, 1, 8, 1]);
    expect(grandMultiplier(0)).toBe(250);
    expect(grandMultiplier(1000)).toBe(260);
    expect(grandMultiplier(1e9)).toBe(600);
  });
});

describe('the River Wheel', () => {
  it('has 51 segments and every symbol returns 48/51', () => {
    expect(WHEEL_SEGMENTS).toHaveLength(51);
    for (const s of WHEEL_SYMBOLS) expect(WHEEL_SEGMENTS.filter((x) => x === s.id)).toHaveLength(s.count);
    for (const r of Object.values(wheelExpected())) expect(r).toBeCloseTo(48 / 51, 10);
    expect(WHEEL_SEGMENTS[0]).toBe('star');
    expect(wheelReturn('star', 10, 0)).toBe(480);
    expect(wheelReturn('anchor', 10, 0)).toBe(0);
  });
});

describe('Lucky Falls', () => {
  it('has symmetric rows and returns between 94 and 96 percent', () => {
    for (const r of FALLS_RISKS) {
      expect(FALLS_BINS[r]).toHaveLength(13);
      expect(FALLS_BINS[r]).toEqual([...FALLS_BINS[r]].reverse());
      expect(fallsExpected(r)).toBeGreaterThan(0.94);
      expect(fallsExpected(r)).toBeLessThan(0.96);
    }
    expect(fallsChances().reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(fallsChances()[0]).toBeCloseTo(1 / 4096, 12);
  });

  it('maps bounces to bins and rounds payouts down', () => {
    expect(fallsBin([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(0);
    expect(fallsBin([1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0])).toBe(6);
    expect(fallsWin('calm', 4, 25)).toBe(27);
    expect(fallsWin('wild', 0, 10)).toBe(1100);
  });
});

describe('roulette boards', () => {
  it('pays each bet and the total', () => {
    const r = rouletteBoardReturn([{ type: 'red', amount: 10 }, { type: 'col1', amount: 20 }, { type: 'number', number: 1, amount: 5 }], 1);
    expect(r.perBet).toEqual([20, 60, 180]);
    expect(r.total).toBe(260);
    expect(rouletteReturn({ type: 'col3' }, 36)).toBe(3);
    expect(rouletteReturn({ type: 'col2' }, 0)).toBe(0);
  });
});

describe('logbook progress', () => {
  it('has 35 stamps and the ranks open at 5, 14 and 26', () => {
    expect(STAMPS).toHaveLength(35);
    expect(new Set(STAMPS.map((s) => s.id)).size).toBe(35);
    expect(RANKS.map((r) => r.stamps)).toEqual([0, 5, 14, 26]);
    expect([rankFor(4), rankFor(5), rankFor(13), rankFor(14), rankFor(26)]).toEqual([0, 1, 1, 2, 3]);
  });

  it('opens high limits at First Mate', () => {
    expect(chipsFor(0, 'slot')).toEqual([10, 25, 50, 100]);
    expect(chipsFor(2, 'slot')).toEqual([10, 25, 50, 100, 250, 500]);
    expect(betAllowed(1, 'slot', 250)).toBe(false);
    expect(betAllowed(2, 'captain', 50)).toBe(false);
    expect([tableMax(0), tableMax(2)]).toEqual([500, 2500]);
  });

  it('awards each stamp once, and suggests the next', () => {
    const s = upgradeStats(null, 0);
    expect(nextStamp(s)!.id).toBe('aboard');
    expect(awardStamps(s, { game: 'slot', staked: 10, paid: 20, tags: ['mixed_fruit'] })).toEqual(['aboard', 'lever', 'fruit']);
    expect(awardStamps(s, { game: 'slot', staked: 10, paid: 20, tags: ['mixed_fruit'] })).toEqual([]);
    expect(nextStamp(s)!.id).toBe('redblack');
  });

  it('keeps the balance invariant through plays, streaks and refills', () => {
    const s = upgradeStats(null, 0);
    const c = { now: 1, day: '2026-10-07', voyage: 'abcdef' };
    applyMovement(s, { game: 'slot', stake: 10, paid: 30, play: true }, c);
    settleStreak(s, 'slot', 10, 30);
    applyMovement(s, { game: 'slot', stake: 10, paid: 30, play: true }, c);
    settleStreak(s, 'slot', 10, 30);
    expect(s.streak).toEqual({ game: 'slot', n: 2 });
    settleStreak(s, 'wheel', 10, 0);
    expect(s.streak).toEqual({ game: 'wheel', n: 0 });
    expect(() => applyMovement(s, { game: 'slot', stake: 5000, paid: 0, play: true }, c)).toThrow('broke');
    applyMovement(s, { game: 'slot', stake: s.balance - 3, paid: 0, play: true }, c);
    applyRefill(s, 2);
    expect(s.balance).toBe(1000);
    expect(invariantProblem(s)).toBeNull();
    expect(s.days).toHaveLength(1);
    expect(s.voyages![0].plays).toBe(3);
    expect(s.playDays).toBe(1);
  });
});
