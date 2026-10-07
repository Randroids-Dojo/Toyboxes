import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import adminApi from '../api/admin.js';
import roomApi from '../api/room.js';
import scoresApi from '../api/scores.js';
import { MemoryStore, setStore } from '../server/store.js';
import { SCORE_MODES, beats, scoreProblem, type ScoreMode } from '../src/shared/score-modes';

async function call(handler: any, c: { method?: string; query?: Record<string, string>; body?: unknown; headers?: Record<string, string> } = {}) {
  const out: any = { status: 200, body: undefined, headers: {} };
  const res: any = {
    status: (code: number) => ((out.status = code), res),
    json: (b: unknown) => ((out.body = b), res),
    setHeader: (k: string, v: string) => (out.headers[k.toLowerCase()] = v),
    end: () => res,
  };
  await handler({ method: c.method ?? 'GET', query: c.query ?? {}, body: c.body, headers: { 'x-forwarded-for': '10.1.1.2', ...(c.headers ?? {}) } }, res);
  return out;
}

const POINTS: ScoreMode = { id: 'test-points', label: 'Test points', better: 'higher', unit: 'points', min: 0, max: 5000 };
const TIME: ScoreMode = { id: 'test-time', label: 'Test time', better: 'lower', unit: 'ms', min: 20_000, max: 600_000 };
const TIMED: ScoreMode = { id: 'test-timed', label: 'Timed', better: 'higher', unit: 'points', min: 0, max: 100, ticket: { minMs: 10_000 } };
const LOGGED: ScoreMode = {
  id: 'test-logged',
  label: 'Logged',
  better: 'higher',
  unit: 'points',
  min: 0,
  max: 100,
  // Ten points per hit, from a list of hit times that must rise.
  fromLog: (log) => {
    const hits = (log as { hits?: unknown })?.hits;
    if (!Array.isArray(hits) || hits.some((t, i) => typeof t !== 'number' || (i > 0 && t <= hits[i - 1]))) return null;
    return hits.length * 10;
  },
};
const alice = 'browser-alice-0000000000';
const bob = 'browser-bob-000000000000';
let roomId = '';

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(async () => {
  SCORE_MODES.neon = [POINTS, TIME, TIMED, LOGGED];
  setStore(new MemoryStore());
  const claim = await call(roomApi, { method: 'POST', body: { action: 'claim', slot: 0, name: 'Owner', pin: '1234', pinConfirm: '1234', browserId: 'owner-browser-00000000' } });
  roomId = claim.body.room.id;
  const H = { 'x-toyboxes-admin': '1' };
  const login = await call(adminApi, { method: 'POST', body: { action: 'login', password: 'toyboxes-dev' }, headers: H });
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const content = {
    rev: 0,
    areas: [
      { id: 'party', name: 'Party', theme: { wall: 0, floor: 0, trim: 0 }, props: [], published: true, experience: { kind: 'neon' }, pages: [] },
      { id: 'shut', name: 'Shut', theme: { wall: 0, floor: 0, trim: 0 }, props: [], published: false, experience: { kind: 'neon' }, pages: [] },
    ],
    exhibits: [],
  };
  expect((await call(adminApi, { method: 'POST', body: { action: 'saveContent', roomId, content }, headers: { ...H, cookie } })).status).toBe(200);
});

const post = (browserId: string, name: string, mode: string, value: number, areaId = 'party') =>
  call(scoresApi, { method: 'POST', body: { action: 'score', roomId, areaId, browserId, name, mode, value } });

describe('world boards', () => {
  it('keep the best result per player, highest or lowest by mode', async () => {
    expect((await post(alice, 'Alice', 'test-points', 1200)).body).toMatchObject({ best: 1200, improved: true, rank: 1 });
    expect((await post(alice, 'Alice', 'test-points', 900)).body).toMatchObject({ best: 1200, improved: false });
    expect((await post(bob, 'Bob', 'test-points', 2000)).body).toMatchObject({ best: 2000, improved: true, rank: 1 });
    expect((await post(alice, 'Alice', 'test-time', 45_000)).body.improved).toBe(true);
    expect((await post(alice, 'Alice', 'test-time', 50_000)).body.improved).toBe(false);
    expect((await post(alice, 'Alice', 'test-time', 41_000)).body).toMatchObject({ best: 41_000, improved: true });
    const r = await call(scoresApi, { query: { roomId, areaId: 'party', modes: 'test-points,test-time,nope' }, headers: { 'x-browser-id': alice } });
    expect(r.status).toBe(200);
    expect(r.body.kind).toBe('modes');
    expect(r.body.boards['test-points'].board.map((x: any) => [x.name, x.value, x.you])).toEqual([
      ['Bob', 2000, false],
      ['Alice', 1200, true],
    ]);
    expect(r.body.boards['test-points'].best).toBe(1200);
    expect(r.body.boards['test-time'].best).toBe(41_000);
    expect(r.body.boards.nope).toBeUndefined();
  });

  it('refuse impossible scores, unknown boards and closed areas', async () => {
    expect((await post(alice, 'Alice', 'test-points', 5001)).status).toBe(400);
    expect((await post(alice, 'Alice', 'test-points', -1)).status).toBe(400);
    expect((await post(alice, 'Alice', 'test-time', 1000)).status).toBe(400);
    expect((await post(alice, 'Alice', 'test-points', 10.5)).status).toBe(400);
    expect((await post(alice, 'Alice', 'other', 10)).status).toBe(400);
    expect((await post(alice, 'Alice', 'test-points', 10, 'shut')).status).toBe(404);
  });

  it('need a fresh ticket from this player, used once, after the shortest real run', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
    const run = (browserId: string) => call(scoresApi, { method: 'POST', body: { action: 'run', roomId, areaId: 'party', browserId, mode: 'test-timed' } });
    const send = (browserId: string, ticket: string | undefined, value: number) => call(scoresApi, { method: 'POST', body: { action: 'score', roomId, areaId: 'party', browserId, name: 'A', mode: 'test-timed', value, ticket } });
    expect((await send(alice, undefined, 50)).status).toBe(400);
    const t = (await run(alice)).body.ticket as string;
    expect(t).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    vi.setSystemTime(new Date('2026-10-07T12:00:05Z'));
    expect((await send(alice, t, 50)).body.code).toBe('bad_score');
    const t2 = (await run(alice)).body.ticket as string;
    vi.setSystemTime(new Date('2026-10-07T12:00:20Z'));
    expect((await send(bob, t2, 50)).body.code).toBe('bad_ticket');
    const t3 = (await run(alice)).body.ticket as string;
    vi.setSystemTime(new Date('2026-10-07T12:00:40Z'));
    expect((await send(alice, t3, 50)).body).toMatchObject({ best: 50, improved: true });
    expect((await send(alice, t3, 60)).body.code).toBe('bad_ticket');
    expect((await call(scoresApi, { method: 'POST', body: { action: 'run', roomId, areaId: 'party', browserId: alice, mode: 'test-points' } })).status).toBe(400);
  });

  it('work scores out from the run log on the server', async () => {
    const send = (log: unknown, value = 999) => call(scoresApi, { method: 'POST', body: { action: 'score', roomId, areaId: 'party', browserId: alice, name: 'A', mode: 'test-logged', value, log } });
    expect((await send({ hits: [1, 2, 3] })).body).toMatchObject({ best: 30, improved: true });
    expect((await send({ hits: [3, 2] })).status).toBe(400);
    expect((await send(undefined)).status).toBe(400);
    expect((await send({ hits: Array.from({ length: 11 }, (_, i) => i) })).status).toBe(400);
    expect((await send({ hits: Array.from({ length: 8000 }, (_, i) => i) })).body.code).toBe('bad_log');
  });

  it('compares results the right way round', () => {
    expect(beats(POINTS, 10, null)).toBe(true);
    expect(beats(POINTS, 10, 11)).toBe(false);
    expect(beats(TIME, 10, 11)).toBe(true);
    expect(scoreProblem(POINTS, 5000)).toBeNull();
    expect(scoreProblem(POINTS, 5000.5)).not.toBeNull();
  });
});
