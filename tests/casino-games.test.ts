import { beforeEach, describe, expect, it } from 'vitest';
import adminApi from '../api/admin.js';
import roomApi from '../api/room.js';
import scoresApi from '../api/scores.js';
import { MemoryStore, setStore } from '../server/store.js';
import { handValue, isBlackjack, newShoe, rouletteReturn, settle, WHEEL_ORDER } from '../src/shared/casino-games';
import { START_CREDITS } from '../src/shared/slots';

async function call(handler: any, c: { method?: string; query?: Record<string, string>; body?: unknown; headers?: Record<string, string> } = {}) {
  const out: any = { status: 200, body: undefined, headers: {} };
  const res: any = { status: (code: number) => ((out.status = code), res), json: (b: unknown) => ((out.body = b), res), setHeader: (k: string, v: string) => (out.headers[k.toLowerCase()] = v), end: () => res };
  await handler({ method: c.method ?? 'GET', query: c.query ?? {}, body: c.body, headers: { 'x-forwarded-for': '10.2.2.2', ...(c.headers ?? {}) } }, res);
  return out;
}

describe('rules', () => {
  it('roulette pays even money, 2 to 1 on dozens and 35 to 1 on a number; zero takes outside bets', () => {
    expect(rouletteReturn({ type: 'red' }, 1)).toBe(2);
    expect(rouletteReturn({ type: 'black' }, 1)).toBe(0);
    expect(rouletteReturn({ type: 'even' }, 0)).toBe(0);
    expect(rouletteReturn({ type: 'dozen3' }, 36)).toBe(3);
    expect(rouletteReturn({ type: 'number', number: 0 }, 0)).toBe(36);
    expect(rouletteReturn({ type: 'number', number: 7 }, 8)).toBe(0);
    expect(new Set(WHEEL_ORDER).size).toBe(37);
    // Every bet type returns 36/37 on average.
    for (const type of ['red', 'odd', 'low', 'dozen2'] as const) {
      let total = 0;
      for (let p = 0; p <= 36; p++) total += rouletteReturn({ type }, p);
      expect(total / 37).toBeCloseTo(36 / 37, 5);
    }
  });

  it('counts blackjack hands, soft aces and settles them', () => {
    expect(handValue(['AS', 'KH'])).toEqual({ total: 21, soft: true });
    expect(handValue(['AS', 'AH', '9C'])).toEqual({ total: 21, soft: true });
    expect(handValue(['10S', '9H', '5C']).total).toBe(24);
    expect(isBlackjack(['AS', 'QD'])).toBe(true);
    expect(isBlackjack(['AS', '5D', '5C'])).toBe(false);
    expect(settle(['AS', 'QD'], ['10S', '9H'], 10)).toEqual({ result: 'blackjack', payout: 25 });
    expect(settle(['10S', '9H'], ['10C', '8H'], 10)).toEqual({ result: 'win', payout: 20 });
    expect(settle(['10S', '8H'], ['10C', '8D'], 10)).toEqual({ result: 'push', payout: 10 });
    expect(settle(['10S', '8H', '5C'], ['10C', '6D'], 10)).toEqual({ result: 'bust', payout: 0 });
    expect(settle(['10S', '8H'], ['10C', '6D', 'KD'], 10)).toEqual({ result: 'win', payout: 20 });
    const shoe = newShoe(6, (n) => Math.floor(Math.random() * n));
    expect(shoe).toHaveLength(312);
    expect(new Set(shoe).size).toBe(52);
  });
});

describe('table games on the server', () => {
  let roomId = '';
  const who = 'table-player-0000000001';
  beforeEach(async () => {
    setStore(new MemoryStore());
    const claim = await call(roomApi, { method: 'POST', body: { action: 'claim', slot: 0, name: 'Owner', pin: '1234', pinConfirm: '1234', browserId: 'table-owner-000000000001' } });
    roomId = claim.body.room.id;
    const H = { 'x-toyboxes-admin': '1' };
    const login = await call(adminApi, { method: 'POST', body: { action: 'login', password: 'toyboxes-dev' }, headers: H });
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    const content = { rev: 0, areas: [{ id: 'casino', name: 'Casino', theme: { wall: 0, floor: 0, trim: 0 }, props: [], published: true, experience: { kind: 'casino' } }], exhibits: [] };
    expect((await call(adminApi, { method: 'POST', body: { action: 'saveContent', roomId, content }, headers: { ...H, cookie } })).status).toBe(200);
  });
  const post = (body: Record<string, unknown>) => call(scoresApi, { method: 'POST', body: { roomId, areaId: 'casino', browserId: who, name: 'Ace', ...body } });

  it('roulette spins keep the credits straight', async () => {
    let last: any;
    for (let i = 0; i < 20; i++) {
      last = await post({ action: 'roulette', bet: 10, pick: { type: i % 2 ? 'red' : 'number', number: 17 } });
      expect(last.status).toBe(200);
      expect(last.body.pocket).toBeGreaterThanOrEqual(0);
      expect(last.body.pocket).toBeLessThanOrEqual(36);
    }
    const s = last.body.stats;
    expect(s.spent).toBe(200);
    expect(s.balance).toBe(START_CREDITS - s.spent + s.earned);
    expect((await post({ action: 'roulette', bet: 10, pick: { type: 'number', number: 40 } })).status).toBe(400);
  });

  it('blackjack hides the hole card, settles and pays into the same credits', async () => {
    let hands = 0;
    for (let i = 0; i < 12; i++) {
      const deal = await post({ action: 'blackjack', move: 'deal', bet: 10 });
      expect(deal.status).toBe(200);
      let hand = deal.body.hand;
      if (hand.phase === 'player') {
        expect(hand.dealer[1]).toBe('??');
        // A second deal mid-hand is refused.
        expect((await post({ action: 'blackjack', move: 'deal', bet: 10 })).status).toBe(409);
        const r = await post({ action: 'blackjack', move: i % 3 === 0 ? 'double' : i % 3 === 1 ? 'hit' : 'stand' });
        expect(r.status).toBe(200);
        hand = r.body.hand;
        if (hand.phase === 'player') hand = (await post({ action: 'blackjack', move: 'stand' })).body.hand;
      }
      expect(hand.phase).toBe('done');
      expect(hand.dealer).not.toContain('??');
      expect(hand.result).toBeTruthy();
      hands++;
    }
    const b = await call(scoresApi, { query: { roomId, areaId: 'casino' }, headers: { 'x-browser-id': who } });
    const s = b.body.stats;
    expect(hands).toBe(12);
    expect(s.balance).toBe(START_CREDITS - s.spent + s.earned);
    expect(b.body.blackjack.phase).toBe('done');
  });

  it('only doubles on the first two cards and refuses moves without a hand', async () => {
    expect((await post({ action: 'blackjack', move: 'hit' })).status).toBe(409);
    for (let i = 0; i < 20; i++) {
      const deal = await post({ action: 'blackjack', move: 'deal', bet: 10 });
      if (deal.body.hand.phase !== 'player') continue;
      const hit = await post({ action: 'blackjack', move: 'hit' });
      if (hit.body.hand.phase !== 'player') continue;
      expect((await post({ action: 'blackjack', move: 'double' })).status).toBe(400);
      await post({ action: 'blackjack', move: 'stand' });
      return;
    }
  });
});
