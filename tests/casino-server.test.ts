import { beforeEach, describe, expect, it, vi } from 'vitest';

// Scripted outcomes: queued numbers come out of randomInt first, then real randomness.
const rig = vi.hoisted(() => ({ queue: [] as number[] }));
vi.mock('node:crypto', async (orig) => {
  const real = await orig<typeof import('node:crypto')>();
  return { ...real, randomInt: (n: number) => (rig.queue.length ? rig.queue.shift()! : real.randomInt(n)) };
});

import adminApi from '../api/admin.js';
import casinoApi from '../api/casino.js';
import roomApi from '../api/room.js';
import scoresApi from '../api/scores.js';
import { browserKey } from '../server/crypto.js';
import { MemoryStore, setStore } from '../server/store.js';
import { BONUS_RING, REEL_STRIP, START_CREDITS, type CasinoStats } from '../src/shared/slots';
import { invariantProblem, localDay } from '../src/shared/casino/stats';
import { newShoe, type Card } from '../src/shared/casino-games';
import { WHEEL_SEGMENTS } from '../src/shared/casino/wheel';

async function call(handler: any, c: { method?: string; query?: Record<string, string>; body?: unknown; headers?: Record<string, string> } = {}) {
  const out: any = { status: 200, body: undefined, headers: {} };
  const res: any = {
    status: (code: number) => ((out.status = code), res),
    json: (b: unknown) => ((out.body = b), res),
    setHeader: (k: string, v: string) => (out.headers[k.toLowerCase()] = v),
    end: () => res,
  };
  await handler({ method: c.method ?? 'GET', query: c.query ?? {}, body: c.body, headers: { 'x-forwarded-for': '10.1.1.1', ...(c.headers ?? {}) } }, res);
  return out;
}

let roomId = '';
let store: MemoryStore;
const alice = 'browser-alice-0000000000';
const bob = 'browser-bob-000000000000';
const day = localDay();

const post = (body: Record<string, unknown>, who = alice) => call(casinoApi, { method: 'POST', body: { roomId, areaId: 'casino', browserId: who, name: who === alice ? 'Alice' : 'Bob', voyage: 'voyage0001', day, ...body } });
const get = (who = alice) => call(casinoApi, { query: { roomId, areaId: 'casino' }, headers: { 'x-browser-id': who } });
const statsKey = (who = alice) => `casino:${roomId}:casino:${browserKey(who)}`;
const paddle = REEL_STRIP.indexOf('paddle');
const seven = REEL_STRIP.indexOf('seven');

/** Gives a player stamps so their rank opens more of the boat. */
async function giveStamps(n: number, who = alice) {
  await post({ action: 'slot', bet: 10 }, who);
  const s = (await store.get<CasinoStats & { tables?: unknown }>(statsKey(who)))!;
  const ids = ['aboard', 'lever', 'redblack', 'twentyone', 'riverwheel', 'fruit', 'steam', 'blackjack', 'doubledown', 'split', 'straightup', 'spread', 'star', 'pearl', 'dealt'];
  await store.set(statsKey(who), { ...s, stamps: ids.slice(0, n) });
}

/** Deal a fixed valid shoe, so rank assertions never depend on a lucky hand. */
async function scriptHand(deal: Card[]) {
  const s = (await store.get<CasinoStats & { tables?: Record<string, unknown> }>(statsKey()))!;
  const shoe = newShoe(6, n => n - 1);
  for (const card of deal) {
    const i = shoe.indexOf(card);
    if (i < 0) throw new Error('Scripted card missing from shoe');
    shoe.splice(i, 1);
  }
  await store.set(statsKey(), { ...s, tables: { ...s.tables, bj: { shoe: [...shoe, ...[...deal].reverse()], round: null } } });
}

beforeEach(async () => {
  rig.queue.length = 0;
  store = new MemoryStore();
  setStore(store);
  const claim = await call(roomApi, { method: 'POST', body: { action: 'claim', slot: 0, name: 'Randroid', pin: '1234', pinConfirm: '1234', browserId: 'owner-browser-00000000' } });
  roomId = claim.body.room.id;
  const H = { 'x-toyboxes-admin': '1' };
  const login = await call(adminApi, { method: 'POST', body: { action: 'login', password: 'toyboxes-dev' }, headers: H });
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const content = { rev: 0, areas: [{ id: 'casino', name: 'Casino', theme: { wall: 0, floor: 0, trim: 0 }, props: [], published: true, experience: { kind: 'casino' } }], exhibits: [] };
  expect((await call(adminApi, { method: 'POST', body: { action: 'saveContent', roomId, content }, headers: { ...H, cookie } })).status).toBe(200);
});

describe('stats v2 migration', () => {
  it('loads a first casino record with every balance and total kept', async () => {
    const v1: CasinoStats = { rev: 7, balance: 1000, earned: 300, spent: 900, spins: 42, biggestWin: 150, refills: 1, history: [[1, 1000], [2, 400], [3, 1000]] };
    await store.set(statsKey(), v1);
    const r = await get();
    expect(r.status).toBe(200);
    const s = r.body.stats as CasinoStats;
    expect(s.v).toBe(2);
    expect(s.balance).toBe(1000);
    expect(s.spins).toBe(42);
    expect(s.history).toEqual(v1.history);
    expect(s.games!.earlier).toEqual({ plays: 42, spent: 900, earned: 300, best: 150 });
    expect(s.refillCredits).toBe(600);
    expect(invariantProblem(s)).toBeNull();
    // Playing on keeps the invariant and the old totals.
    const spin = await post({ action: 'slot', bet: 10 });
    expect(spin.status).toBe(200);
    expect(spin.body.stats.spins).toBe(43);
    expect(invariantProblem(spin.body.stats)).toBeNull();
  });

  it('moves an open first casino blackjack hand into the record and finishes it', async () => {
    await store.set(statsKey(), { rev: 2, balance: 975, earned: 0, spent: 25, spins: 1, biggestWin: 0, refills: 0, history: [[1, 1000], [2, 975]] });
    await store.set(`bj:${roomId}:casino:${browserKey(alice)}`, { rev: 1, shoe: ['2C', '3C', '4C', '5C', '6C', '7C', '8C', '9C', '10C', 'JC', 'QC', 'KC', 'AC'], player: ['10H', '9S'], dealer: ['7D', '10S'], bet: 25, doubled: false, phase: 'player', result: null, payout: 0 });
    const r = await get();
    expect(r.body.blackjack.phase).toBe('player');
    expect(r.body.blackjack.hands[0].cards).toEqual(['10H', '9S']);
    expect(r.body.blackjack.dealer).toEqual(['7D', '??']);
    const stand = await post({ action: 'blackjack', table: 'saloon', move: 'stand' });
    expect(stand.status).toBe(200);
    expect(stand.body.hand.hands[0].result).toBe('win');
    expect(stand.body.stats.balance).toBe(1025);
    expect(invariantProblem(stand.body.stats)).toBeNull();
    expect(await store.get(`bj:${roomId}:casino:${browserKey(alice)}`)).toBeNull();
  });

  it('old browser tabs keep spinning, refilling and reading the board', async () => {
    const spin = await call(scoresApi, { method: 'POST', body: { action: 'spin', roomId, areaId: 'casino', browserId: alice, name: 'Alice', bet: 25 } });
    expect(spin.status).toBe(200);
    expect(spin.body.stops.every((i: number) => i < 16)).toBe(true);
    const board = await call(scoresApi, { query: { roomId, areaId: 'casino' }, headers: { 'x-browser-id': alice } });
    expect(board.body.kind).toBe('casino');
    expect(board.body.stats.balance).toBe(spin.body.stats.balance);
    const rl = await call(scoresApi, { method: 'POST', body: { action: 'roulette', roomId, areaId: 'casino', browserId: alice, name: 'Alice', bet: 10, pick: { type: 'red' } } });
    expect(rl.status).toBe(200);
    expect(typeof rl.body.pocket).toBe('number');
    const deal = await call(scoresApi, { method: 'POST', body: { action: 'blackjack', roomId, areaId: 'casino', browserId: alice, name: 'Alice', move: 'deal', bet: 10 } });
    expect(deal.status).toBe(200);
    expect(deal.body.hand.player.length).toBe(2);
  });
});

describe('plays', () => {
  it('keeps the balance invariant across every game', async () => {
    await post({ action: 'slot', bet: 25 });
    await post({ action: 'roulette', bets: [{ type: 'red', amount: 10 }, { type: 'number', number: 17, amount: 25 }, { type: 'dozen2', amount: 50 }] });
    await post({ action: 'wheel', bets: { anchor: 10, star: 10 } });
    let hand = (await post({ action: 'blackjack', table: 'saloon', move: 'deal', bet: 10 })).body.hand;
    while (hand.phase === 'player') hand = (await post({ action: 'blackjack', table: 'saloon', move: 'stand' })).body.hand;
    await giveStamps(5);
    expect((await post({ action: 'falls', bet: 10, risk: 'wild' })).status).toBe(200);
    expect((await post({ action: 'poker', move: 'deal', bet: 10 })).status).toBe(200);
    const drawn = await post({ action: 'poker', move: 'draw', holds: [true, false, true, false, false] });
    expect(drawn.status).toBe(200);
    const s = drawn.body.stats as CasinoStats;
    expect(invariantProblem(s)).toBeNull();
    expect(Object.keys(s.games!).sort()).toEqual(['blackjack', 'falls', 'poker', 'roulette', 'slot', 'wheel']);
    expect(s.days!.at(-1)!.d).toBe(day);
    expect(s.days!.at(-1)!.plays).toBe(s.spins);
    expect(s.voyages!.at(-1)!.id).toBe('voyage0001');
  });

  it('never shows the deck or the shoe', async () => {
    await giveStamps(5);
    await post({ action: 'blackjack', table: 'saloon', move: 'deal', bet: 10 });
    const r = await post({ action: 'poker', move: 'deal', bet: 10 });
    expect(JSON.stringify(r.body)).not.toMatch(/deck|shoe|tables/);
    expect(JSON.stringify((await get()).body)).not.toMatch(/deck|shoe|tables/);
    const poker = (await get()).body.poker;
    expect(poker.hand).toEqual(r.body.hand.hand);
  });

  it('refuses odd bets, locked rooms and high limits before their rank', async () => {
    expect((await post({ action: 'slot', bet: 7 })).status).toBe(400);
    expect((await post({ action: 'slot', bet: 250 })).body.code).toBe('bad_bet');
    expect((await post({ action: 'falls', bet: 10, risk: 'calm' })).status).toBe(403);
    expect((await post({ action: 'poker', move: 'deal', bet: 10 })).status).toBe(403);
    expect((await post({ action: 'blackjack', table: 'captain', move: 'deal', bet: 100 })).status).toBe(403);
    await giveStamps(14);
    expect((await post({ action: 'slot', bet: 250 })).status).toBe(200);
    expect((await post({ action: 'blackjack', table: 'captain', move: 'deal', bet: 10 })).body.code).toBe('bad_bet');
    expect((await post({ action: 'blackjack', table: 'captain', move: 'deal', bet: 100 })).status).toBe(200);
  });

  it('checks roulette boards and wheel rails against the limits', async () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ type: 'number', number: i, amount: 10 }));
    expect((await post({ action: 'roulette', bets: nine })).body.code).toBe('too_many');
    expect((await post({ action: 'roulette', bets: [{ type: 'red', amount: 300 }, { type: 'black', amount: 300 }] })).body.code).toBe('over_max');
    expect((await post({ action: 'roulette', bets: [{ type: 'red', amount: 7 }] })).body.code).toBe('bad_bet');
    // The same cell twice merges into one stack.
    rig.queue.push(17);
    const r = await post({ action: 'roulette', bets: [{ type: 'number', number: 17, amount: 10 }, { type: 'number', number: 17, amount: 15 }, { type: 'black', amount: 10 }] });
    expect(r.body.pocket).toBe(17);
    expect(r.body.bets).toHaveLength(2);
    expect(r.body.win).toBe(25 * 36 + 20);
    expect(r.body.newStamps).toContain('straightup');
    expect((await post({ action: 'wheel', bets: {} })).body.code).toBe('no_bets');
    const star = WHEEL_SEGMENTS.indexOf('star');
    rig.queue.push(star);
    const w = await post({ action: 'wheel', bets: { star: 10, anchor: 10 } });
    expect(w.body.symbol).toBe('star');
    expect(w.body.win).toBe(480);
    expect(w.body.newStamps).toContain('star');
  });

  it('refills only when you run out, and counts the credits it adds', async () => {
    expect((await post({ action: 'refill' })).body.code).toBe('not_broke');
    const s = (await store.get<CasinoStats>(statsKey())) ?? null;
    expect(s).toBeNull();
    await post({ action: 'slot', bet: 10 });
    const cur = (await store.get<CasinoStats>(statsKey()))!;
    // Spend it down to 4 credits by hand, keeping the totals honest.
    await store.set(statsKey(), { ...cur, balance: 4, spent: cur.spent + (cur.balance - 4) });
    expect((await post({ action: 'slot', bet: 10 })).body.code).toBe('broke');
    const ok = await post({ action: 'refill' });
    expect(ok.status).toBe(200);
    expect(ok.body.stats.balance).toBe(START_CREDITS);
    expect(ok.body.stats.refillCredits).toBe(996);
    expect(invariantProblem(ok.body.stats)).toBeNull();
  });

  it('survives plays racing each other', async () => {
    const all = await Promise.all(Array.from({ length: 6 }, () => post({ action: 'slot', bet: 10 })));
    const ok = all.filter((r) => r.status === 200).length;
    expect(ok).toBeGreaterThan(0);
    const s = (await get()).body.stats as CasinoStats;
    expect(s.spins).toBe(ok);
    expect(invariantProblem(s)).toBeNull();
  });
});

describe('stamps and ranks', () => {
  it('the first plays earn the boarding stamps and Bosun', async () => {
    rig.queue.push(REEL_STRIP.indexOf('star'), REEL_STRIP.indexOf('bar'), REEL_STRIP.indexOf('lemon'));
    const first = await post({ action: 'slot', bet: 10 });
    expect(first.body.newStamps).toEqual(['aboard', 'lever']);
    rig.queue.push(2);
    expect((await post({ action: 'roulette', bets: [{ type: 'red', amount: 10 }] })).body.newStamps).toContain('redblack');
    await scriptHand(['10H', '10C', '9S', '8D']);
    let hand = await post({ action: 'blackjack', table: 'saloon', move: 'deal', bet: 10 });
    while (hand.body.hand.phase === 'player') hand = await post({ action: 'blackjack', table: 'saloon', move: 'stand' });
    expect(hand.body.newStamps).toContain('twentyone');
    rig.queue.push(0);
    const wheel = await post({ action: 'wheel', bets: { anchor: 10 } });
    expect(wheel.body.newStamps).toContain('riverwheel');
    expect(wheel.body.rank).toBe(1);
    expect(wheel.body.rankUp).toBe(true);
    // Each stamp counts once.
    expect((await post({ action: 'slot', bet: 10 })).body.newStamps).not.toContain('lever');
    const r = await get();
    expect(r.body.boards.stamps[0]).toMatchObject({ name: 'Alice', value: r.body.stats.stamps.length, you: true });
  });

  it('a natural blackjack earns Bosun before the River Wheel', async () => {
    rig.queue.push(REEL_STRIP.indexOf('star'), REEL_STRIP.indexOf('bar'), REEL_STRIP.indexOf('lemon'));
    await post({ action: 'slot', bet: 10 });
    rig.queue.push(2);
    await post({ action: 'roulette', bets: [{ type: 'red', amount: 10 }] });
    await scriptHand(['AH', '10C', '10S', '8D']);
    const hand = await post({ action: 'blackjack', table: 'saloon', move: 'deal', bet: 10 });
    expect(hand.body.newStamps).toEqual(['twentyone', 'blackjack']);
    expect(hand.body.rank).toBe(1);
    expect(hand.body.rankUp).toBe(true);
    rig.queue.push(0);
    const wheel = await post({ action: 'wheel', bets: { anchor: 10 } });
    expect(wheel.body.newStamps).toContain('riverwheel');
    expect(wheel.body.rank).toBe(1);
    expect(wheel.body.rankUp).toBe(false);
  });

  it('a voyage that ends up on the day earns Shore leave', async () => {
    rig.queue.push(seven, seven, seven);
    const big = await post({ action: 'slot', bet: 10 });
    expect(big.body.win).toBe(2000);
    expect(big.body.newStamps).toContain('sevens');
    expect(big.body.newStamps).toContain('highroller');
    const next = await post({ action: 'slot', bet: 10, voyage: 'voyage0002' });
    expect(next.body.newStamps).toContain('shore');
    expect(next.body.stats.voyages.map((v: { id: string }) => v.id)).toEqual(['voyage0001', 'voyage0002']);
  });

  it('days follow the local date, within reason', async () => {
    const r = await post({ action: 'slot', bet: 10, day: '1999-01-01' });
    expect(r.body.stats.days.at(-1).d).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe('jackpots', () => {
  it('three paddles spin the bonus ring; the GRAND pays, resets and joins the Hall of Fame', async () => {
    rig.queue.push(paddle, paddle, paddle, BONUS_RING.indexOf('GRAND'));
    const r = await post({ action: 'slot', bet: 10 });
    expect(r.body.rule).toBe('bonus');
    expect(r.body.bonus).toMatchObject({ value: 'GRAND', jackpot: 'GRAND', mult: 250 });
    expect(r.body.win).toBe(2500);
    expect(r.body.newStamps).toEqual(expect.arrayContaining(['steam', 'grand', 'paddle30']));
    const g = await get(bob);
    expect(g.body.fame[0]).toMatchObject({ name: 'Alice', jackpot: 'GRAND', mult: 250, credits: 2500 });
    expect(g.body.jackpots.grand).toBe(250);
    // Every spin by anyone grows it.
    await store.set(`casinospins:${roomId}:casino`, 1 + 5000);
    expect((await get(bob)).body.jackpots.grand).toBe(300);
    await store.set(`casinospins:${roomId}:casino`, 1 + 1_000_000);
    expect((await get(bob)).body.jackpots.grand).toBe(600);
  });

  it('MAJOR and MINI pay their multiples; only MAJOR and GRAND reach the Hall of Fame', async () => {
    rig.queue.push(paddle, paddle, paddle, BONUS_RING.indexOf('MAJOR'));
    expect((await post({ action: 'slot', bet: 25 })).body.win).toBe(2500);
    rig.queue.push(paddle, paddle, paddle, BONUS_RING.indexOf('MINI'));
    const mini = await post({ action: 'slot', bet: 25 });
    expect(mini.body.win).toBe(500);
    expect(mini.body.newStamps).toContain('mini');
    const fame = (await get()).body.fame;
    expect(fame).toHaveLength(1);
    expect(fame[0].jackpot).toBe('MAJOR');
    const wins = (await get()).body.boards.wins;
    expect(wins[0].value).toBe(2500);
  });
});

describe('cards', () => {
  it('splits a pair, charges for it and settles both hands', async () => {
    // Shuffle draws come first; then the shoe is popped from the end, so script the tail.
    await post({ action: 'slot', bet: 10 });
    const s = (await store.get<any>(statsKey()))!;
    // Deal order: player, dealer, player, dealer; then hand 1 card, hand 2 card, dealer.
    const shoe = Array.from({ length: 60 }, () => '2C');
    const script = ['8H', '6D', '8S', '10C', '3H', '10D', '9C'];
    s.tables = { bj: { shoe: [...shoe, ...script.reverse()], round: null } };
    await store.set(statsKey(), s);
    const deal = await post({ action: 'blackjack', table: 'saloon', move: 'deal', bet: 10 });
    expect(deal.body.hand.hands[0].cards).toEqual(['8H', '8S']);
    const split = await post({ action: 'blackjack', table: 'saloon', move: 'split' });
    expect(split.body.hand.hands).toHaveLength(2);
    expect(split.body.stats.spent - deal.body.stats.spent).toBe(10);
    let h = split.body;
    while (h.hand.phase === 'player') h = (await post({ action: 'blackjack', table: 'saloon', move: 'stand' })).body;
    expect(h.hand.hands.every((x: { result: string }) => !!x.result)).toBe(true);
    expect(invariantProblem(h.stats)).toBeNull();
  });

  it('counts moves that follow the strategy card', async () => {
    let book = 0;
    for (let i = 0; i < 6; i++) {
      let r = await post({ action: 'blackjack', table: 'saloon', move: 'deal', bet: 10 });
      while (r.body.hand.phase === 'player') r = await post({ action: 'blackjack', table: 'saloon', move: 'stand' });
      book = r.body.stats.bookMoves;
    }
    expect(book).toBeGreaterThanOrEqual(0);
    expect(book).toBeLessThanOrEqual(6);
  });
});

describe('creator tools', () => {
  it('clearing the casino wipes credits, boards and jackpots', async () => {
    rig.queue.push(paddle, paddle, paddle, BONUS_RING.indexOf('MAJOR'));
    await post({ action: 'slot', bet: 10 });
    const { clearScores } = await import('../server/scores.js');
    await clearScores(roomId, 'casino');
    const r = await get();
    expect(r.body.stats.balance).toBe(START_CREDITS);
    expect(r.body.boards.balance).toEqual([]);
    expect(r.body.fame).toEqual([]);
    expect(r.body.jackpots.spins).toBe(0);
  });
});
