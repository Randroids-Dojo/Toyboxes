import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import adminApi from '../api/admin.js';
import roomApi from '../api/room.js';
import scoresApi from '../api/scores.js';
import { MemoryStore, setStore } from '../server/store.js';
import { CHARTS, scoreBand } from '../src/shared/fart/charts';
import { ringsMinMs } from '../src/shared/fart/course';

async function call(handler: any, c: { method?: string; query?: Record<string, string>; body?: unknown; headers?: Record<string, string> } = {}) {
  const out: any = { status: 200, body: undefined, headers: {} };
  const res: any = {
    status: (code: number) => ((out.status = code), res),
    json: (b: unknown) => ((out.body = b), res),
    setHeader: (k: string, v: string) => (out.headers[k.toLowerCase()] = v),
    end: () => res,
  };
  await handler({ method: c.method ?? 'GET', query: c.query ?? {}, body: c.body, headers: { 'x-forwarded-for': '10.2.2.3', ...(c.headers ?? {}) } }, res);
  return out;
}

const alice = 'browser-alice-fart-00000';
let roomId = '';

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(async () => {
  setStore(new MemoryStore());
  const claim = await call(roomApi, { method: 'POST', body: { action: 'claim', slot: 1, name: 'Jessica', pin: '1234', pinConfirm: '1234', browserId: 'owner-browser-fart-0000' } });
  roomId = claim.body.room.id;
  const H = { 'x-toyboxes-admin': '1' };
  const login = await call(adminApi, { method: 'POST', body: { action: 'login', password: 'toyboxes-dev' }, headers: H });
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const content = { rev: 0, areas: [{ id: 'puff-challenge', name: 'Fart simulator', theme: { wall: 0, floor: 0, trim: 0 }, props: [], published: true, experience: { kind: 'fart' }, pages: [] }], exhibits: [] };
  expect((await call(adminApi, { method: 'POST', body: { action: 'saveContent', roomId, content }, headers: { ...H, cookie } })).status).toBe(200);
});

const run = (mode: string) => call(scoresApi, { method: 'POST', body: { action: 'run', roomId, areaId: 'puff-challenge', browserId: alice, mode } });
const send = (mode: string, value: number, ticket?: string, log?: unknown) => call(scoresApi, { method: 'POST', body: { action: 'score', roomId, areaId: 'puff-challenge', browserId: alice, name: 'Alice', mode, value, ticket, log } });

describe('Little Puffington boards', () => {
  it('take a rally time with a ticket after a real run, and refuse impossible ones', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
    const t1 = (await run('rings')).body.ticket;
    vi.setSystemTime(new Date('2026-10-07T12:00:02Z'));
    expect((await send('rings', 45_000, t1)).body.code).toBe('bad_score');
    const t2 = (await run('rings')).body.ticket;
    vi.setSystemTime(new Date('2026-10-07T12:01:00Z'));
    expect((await send('rings', 45_000, t2)).body).toMatchObject({ best: 45_000, improved: true, rank: 1 });
    const t3 = (await run('rings')).body.ticket;
    vi.setSystemTime(new Date('2026-10-07T12:02:00Z'));
    expect((await send('rings', ringsMinMs() - 1, t3)).status).toBe(400);
    expect((await send('rings', 40_000)).body.code).toBe('bad_ticket');
  });

  it('work out band scores from the run log, whatever the browser claims', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
    const c = CHARTS.march;
    const hits = c.notes.map((n, i) => (n.kind === 'rest' ? null : i % 4 === 0 ? null : 30));
    const held = c.notes.map((n) => (n.kind === 'hold' ? n.len / 2 : 0));
    const t = (await run('band-march')).body.ticket;
    vi.setSystemTime(new Date('2026-10-07T12:01:00Z'));
    const r = await send('band-march', 999_999, t, { song: 'march', hits, held });
    expect(r.status).toBe(200);
    expect(r.body.best).toBe(scoreBand(c, { hits, held }).score);
    const t2 = (await run('band-march')).body.ticket;
    vi.setSystemTime(new Date('2026-10-07T12:02:00Z'));
    expect((await send('band-march', 100, t2, { song: 'march', hits: [1, 2], held: [0, 0] })).status).toBe(400);
  });

  it('keep the library under its cap and picnic times in range', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
    const t = (await run('library')).body.ticket;
    vi.setSystemTime(new Date('2026-10-07T12:01:00Z'));
    expect((await send('library', 2501, t)).status).toBe(400);
    const t2 = (await run('picnic')).body.ticket;
    vi.setSystemTime(new Date('2026-10-07T12:02:00Z'));
    expect((await send('picnic', 14_000, t2)).status).toBe(400);
    const t3 = (await run('picnic')).body.ticket;
    vi.setSystemTime(new Date('2026-10-07T12:03:00Z'));
    expect((await send('picnic', 52_000, t3)).body).toMatchObject({ best: 52_000 });
    const boards = await call(scoresApi, { query: { roomId, areaId: 'puff-challenge', modes: 'rings,library,band-march,band-polka,picnic' }, headers: { 'x-browser-id': alice } });
    expect(Object.keys(boards.body.boards)).toEqual(['rings', 'library', 'band-march', 'band-polka', 'picnic']);
    expect(boards.body.boards.picnic.best).toBe(52_000);
  });
});
