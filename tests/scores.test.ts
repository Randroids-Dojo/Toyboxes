import { beforeEach, describe, expect, it } from 'vitest';
import adminApi from '../api/admin.js';
import roomApi from '../api/room.js';
import scoresApi from '../api/scores.js';
import { browserKey } from '../server/crypto.js';
import { MemoryStore, setStore } from '../server/store.js';
import { START_CREDITS, expectedReturn, freshStats } from '../src/shared/slots';
import { minLapMs, trackFromSketch, trackProblem } from '../src/shared/track';

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

/** A hand-drawn-ish oval, as the sketchbook would store it. */
function ovalSketch() {
  const p: number[] = [];
  for (let i = 0; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2.05;
    p.push(Math.round(500 + Math.cos(a) * 320), Math.round(500 + Math.sin(a) * 220));
  }
  return [{ c: 0, w: 1, p }];
}

const track = trackFromSketch(ovalSketch())!;
let roomId = '';
let store: MemoryStore;
const alice = 'browser-alice-0000000000';
const bob = 'browser-bob-000000000000';

beforeEach(async () => {
  store = new MemoryStore();
  setStore(store);
  const claim = await call(roomApi, { method: 'POST', body: { action: 'claim', slot: 0, name: 'Randroid', pin: '1234', pinConfirm: '1234', browserId: 'owner-browser-00000000' } });
  roomId = claim.body.room.id;
  const H = { 'x-toyboxes-admin': '1' };
  const login = await call(adminApi, { method: 'POST', body: { action: 'login', password: 'toyboxes-dev' }, headers: H });
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const content = {
    rev: 0,
    areas: [
      { id: 'kart', name: 'Kart track', theme: { wall: 0, floor: 0, trim: 0 }, props: [], published: true, experience: { kind: 'kart', track, laps: 3 }, pages: [] },
      { id: 'casino', name: 'Casino', theme: { wall: 0, floor: 0, trim: 0 }, props: [], published: true, experience: { kind: 'casino' } },
      { id: 'closed', name: 'Closed', theme: { wall: 0, floor: 0, trim: 0 }, props: [], published: false, experience: { kind: 'casino' } },
    ],
    exhibits: [],
  };
  const saved = await call(adminApi, { method: 'POST', body: { action: 'saveContent', roomId, content }, headers: { ...H, cookie } });
  expect(saved.status).toBe(200);
});

describe('tracks and slots', () => {
  it('a drawn loop becomes a raceable track', () => {
    expect(track.length / 2).toBeGreaterThan(50);
    expect(trackProblem(track)).toBeNull();
  });

  it('a figure eight is refused', () => {
    const p: number[] = [];
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      p.push(Math.round(500 + Math.sin(a) * 350), Math.round(500 + Math.sin(a * 2) * 200));
    }
    const t = trackFromSketch([{ c: 0, w: 1, p }]);
    expect(t && trackProblem(t)).toBeTruthy();
  });

  it('the machine returns a little under what it takes, and pays often', () => {
    const { rtp, hitRate } = expectedReturn();
    expect(rtp).toBeGreaterThan(0.9);
    expect(rtp).toBeLessThan(0.99);
    expect(hitRate).toBeGreaterThan(0.3);
  });
});

describe('laps', () => {
  it('keeps each player best lap and shows a board by name', async () => {
    const fast = minLapMs(track) + 4000;
    const lap = (browserId: string, name: string, ms: number) => call(scoresApi, { method: 'POST', body: { action: 'lap', roomId, areaId: 'kart', browserId, name, ms } });
    expect((await lap(alice, 'Alice', fast + 2000)).body).toMatchObject({ improved: true });
    expect((await lap(alice, 'Alice', fast + 5000)).body).toMatchObject({ improved: false, best: fast + 2000 });
    expect((await lap(bob, 'Bob', fast)).body).toMatchObject({ improved: true });
    const b = await call(scoresApi, { query: { roomId, areaId: 'kart' }, headers: { 'x-browser-id': alice } });
    expect(b.body.board.map((r: any) => [r.name, r.value, r.you])).toEqual([
      ['Bob', fast, false],
      ['Alice', fast + 2000, true],
    ]);
    expect(b.body.best).toBe(fast + 2000);
  });

  it('refuses impossible laps and closed tracks', async () => {
    const tooFast = await call(scoresApi, { method: 'POST', body: { action: 'lap', roomId, areaId: 'kart', browserId: alice, name: 'Alice', ms: minLapMs(track) - 1 } });
    expect(tooFast.status).toBe(400);
    const wrongKind = await call(scoresApi, { method: 'POST', body: { action: 'lap', roomId, areaId: 'casino', browserId: alice, name: 'Alice', ms: 60000 } });
    expect(wrongKind.status).toBe(404);
  });

  it('renaming moves the name on every board', async () => {
    await call(scoresApi, { method: 'POST', body: { action: 'lap', roomId, areaId: 'kart', browserId: alice, name: 'Alice', ms: 60000 } });
    await call(scoresApi, { method: 'POST', body: { action: 'name', browserId: alice, name: 'Ally' } });
    const b = await call(scoresApi, { query: { roomId, areaId: 'kart' } });
    expect(b.body.board[0].name).toBe('Ally');
  });
});

describe('casino', () => {
  const spinOnce = (bet: number, who = alice) => call(scoresApi, { method: 'POST', body: { action: 'spin', roomId, areaId: 'casino', browserId: who, name: 'Alice', bet } });

  it('every spin charges the bet, pays by the table and keeps totals straight', async () => {
    let last: any;
    for (let i = 0; i < 25; i++) {
      last = await spinOnce(10);
      expect(last.status).toBe(200);
      expect(last.body.stops).toHaveLength(3);
    }
    const s = last.body.stats;
    expect(s.spins).toBe(25);
    expect(s.spent).toBe(250);
    expect(s.balance).toBe(START_CREDITS - s.spent + s.earned);
    expect(s.history.length).toBe(26);
    expect(s.history[s.history.length - 1][1]).toBe(s.balance);
  });

  it('refuses odd bets, bets over the balance and early refills', async () => {
    expect((await spinOnce(7)).status).toBe(400);
    const refillNow = () => call(scoresApi, { method: 'POST', body: { action: 'refill', roomId, areaId: 'casino', browserId: alice, name: 'Alice' } });
    expect((await refillNow()).body.code).toBe('not_broke');
    // Put Alice nearly out of credits.
    const key = `casino:${roomId}:casino:${browserKey(alice)}`;
    await store.set(key, { ...freshStats(Date.now()), rev: 1, balance: 30 });
    const tooBig = await spinOnce(50);
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.code).toBe('broke');
    expect((await spinOnce(25)).status).toBe(200);
    await store.set(key, { ...freshStats(Date.now()), rev: 9, balance: 5 });
    expect((await spinOnce(10)).body.code).toBe('broke');
    const ok = await refillNow();
    expect(ok.status).toBe(200);
    expect(ok.body.stats.balance).toBe(START_CREDITS);
    expect(ok.body.stats.refills).toBe(1);
  });

  it('ranks players by balance and hides closed casinos', async () => {
    await spinOnce(10, alice);
    await spinOnce(10, bob);
    const b = await call(scoresApi, { query: { roomId, areaId: 'casino' } });
    expect(b.body.board).toHaveLength(2);
    expect(b.body.board[0].value).toBeGreaterThanOrEqual(b.body.board[1].value);
    const closed = await call(scoresApi, { method: 'POST', body: { action: 'spin', roomId, areaId: 'closed', browserId: alice, name: 'Alice', bet: 10 } });
    expect(closed.status).toBe(404);
  });
});
