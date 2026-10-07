import { beforeEach, describe, expect, it } from 'vitest';
import adminApi from '../api/admin.js';
import roomApi from '../api/room.js';
import scoresApi from '../api/scores.js';
import { MemoryStore, setStore } from '../server/store.js';
import { grandPrixTrack } from '../src/shared/circuits';
import { circuitLine, type CircuitId } from '../src/shared/kart/circuits';
import { GhostRecorder, type Ghost } from '../src/shared/kart/ghost';
import { TrackPath } from '../src/shared/track';

async function call(handler: any, c: { method?: string; query?: Record<string, string>; body?: unknown; headers?: Record<string, string> } = {}) {
  const out: any = { status: 200, body: undefined, headers: {} };
  const res: any = {
    status: (code: number) => ((out.status = code), res),
    json: (b: unknown) => ((out.body = b), res),
    setHeader: (k: string, v: string) => (out.headers[k.toLowerCase()] = v),
    end: () => res,
  };
  await handler({ method: c.method ?? 'GET', query: c.query ?? {}, body: c.body, headers: { 'x-forwarded-for': '10.1.1.9', ...(c.headers ?? {}) } }, res);
  return out;
}

/** A clean lap of the centre line at a steady speed, recorded like the browser does. */
function lap(id: CircuitId | 'sketch', flat: number[], speed: number): Ghost {
  const path = new TrackPath(flat);
  const rec = new GhostRecorder(id, 'zippy');
  const dt = 1 / 60;
  let s = 0.5;
  let t = 0;
  const p0 = path.at(s);
  rec.start(p0.x, p0.z);
  while (s < path.length + 0.5) {
    s += speed * dt;
    t += dt;
    const q = path.at(s);
    rec.step(dt, q.x, q.z);
  }
  const q = path.at(s);
  return rec.finish(q.x, q.z, Math.round(t * 1000))!;
}

const alice = 'browser-alice-0000000000';
const bob = 'browser-bob-000000000000';
let roomId = '';

async function publish(track: number[]) {
  const claim = await call(roomApi, { method: 'POST', body: { action: 'claim', slot: 0, name: 'Randroid', pin: '1234', pinConfirm: '1234', browserId: 'owner-browser-00000000' } });
  roomId = claim.body.room.id;
  const H = { 'x-toyboxes-admin': '1' };
  const login = await call(adminApi, { method: 'POST', body: { action: 'login', password: 'toyboxes-dev' }, headers: H });
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const content = { rev: 0, areas: [{ id: 'kart-track', name: 'Kart track', theme: { wall: 0, floor: 0, trim: 0 }, props: [], published: true, experience: { kind: 'kart', track, laps: 3 }, pages: [] }], exhibits: [] };
  const saved = await call(adminApi, { method: 'POST', body: { action: 'saveContent', roomId, content }, headers: { ...H, cookie } });
  expect(saved.status).toBe(200);
}

const post = (body: Record<string, unknown>) => call(scoresApi, { method: 'POST', body: { roomId, areaId: 'kart-track', name: 'Ace', ...body } });

describe('kart boards', () => {
  beforeEach(async () => {
    setStore(new MemoryStore());
    await publish(grandPrixTrack());
  });

  it('puts a checked Block Town lap on the same board as old laps', async () => {
    // A lap from an older client, before ghosts.
    const old = await post({ action: 'lap', browserId: bob, ms: 52000 });
    expect(old.status).toBe(200);
    const g = lap('blocktown', circuitLine('blocktown'), 15);
    const r = await post({ action: 'kartlap', browserId: alice, circuit: 'blocktown', body: 'zippy', ms: g.ms, ghost: g });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ improved: true, rank: 1 });
    const legacy = await call(scoresApi, { query: { roomId, areaId: 'kart-track' } });
    expect(legacy.body.board.map((row: any) => row.value)).toEqual([g.ms, 52000]);
    const boards = await call(scoresApi, { query: { roomId, areaId: 'kart-track', kart: '1' }, headers: { 'x-browser-id': alice } });
    expect(boards.body.circuits).toEqual(['blocktown', 'picnic', 'cove', 'bedroom']);
    const bt = boards.body.boards.blocktown;
    expect(bt.best).toBe(g.ms);
    expect(bt.board[0]).toMatchObject({ name: 'Ace', you: true, body: 'zippy', ghost: true });
    expect(bt.board[1]).toMatchObject({ ghost: false });
    expect(boards.body.boards.picnic.board).toEqual([]);
  });

  it('keeps each circuit on its own board and serves ghosts by rank', async () => {
    const g = lap('picnic', circuitLine('picnic'), 14);
    const r = await post({ action: 'kartlap', browserId: alice, circuit: 'picnic', body: 'zippy', ms: g.ms, ghost: g });
    expect(r.status).toBe(200);
    const boards = await call(scoresApi, { query: { roomId, areaId: 'kart-track', kart: '1' } });
    expect(boards.body.boards.picnic.board).toHaveLength(1);
    expect(boards.body.boards.blocktown.board).toHaveLength(0);
    const ghost = await call(scoresApi, { query: { roomId, areaId: 'kart-track', circuit: 'picnic', ghost: '1' } });
    expect(ghost.status).toBe(200);
    expect(ghost.body.name).toBe('Ace');
    expect(ghost.body.ghost.ms).toBe(g.ms);
    expect(JSON.stringify(ghost.body)).not.toContain(alice);
    const none = await call(scoresApi, { query: { roomId, areaId: 'kart-track', circuit: 'picnic', ghost: '2' } });
    expect(none.status).toBe(404);
  });

  it('only keeps a better lap', async () => {
    const fast = lap('cove', circuitLine('cove'), 15);
    const slow = lap('cove', circuitLine('cove'), 12);
    expect((await post({ action: 'kartlap', browserId: alice, circuit: 'cove', body: 'classic', ms: fast.ms, ghost: fast })).body.improved).toBe(true);
    const r = await post({ action: 'kartlap', browserId: alice, circuit: 'cove', body: 'classic', ms: slow.ms, ghost: slow });
    expect(r.body).toMatchObject({ improved: false, best: fast.ms });
  });

  it('refuses laps that do not check out', async () => {
    const g = lap('blocktown', circuitLine('blocktown'), 15);
    const quicker = await post({ action: 'kartlap', browserId: alice, circuit: 'blocktown', body: 'classic', ms: g.ms - 3000, ghost: { ...g, ms: g.ms - 3000 } });
    expect(quicker.status).toBe(400);
    const other = await post({ action: 'kartlap', browserId: alice, circuit: 'picnic', body: 'classic', ms: g.ms, ghost: g });
    expect(other.status).toBe(400);
    const relabelled = await post({ action: 'kartlap', browserId: alice, circuit: 'picnic', body: 'classic', ms: g.ms, ghost: { ...g, c: 'picnic' } });
    expect(relabelled.status).toBe(400);
    const body = await post({ action: 'kartlap', browserId: alice, circuit: 'blocktown', body: 'rocketship', ms: g.ms, ghost: g });
    expect(body.status).toBe(400);
    const nowhere = await post({ action: 'kartlap', browserId: alice, circuit: 'moon', body: 'classic', ms: g.ms, ghost: g });
    expect(nowhere.status).toBe(400);
    const boards = await call(scoresApi, { query: { roomId, areaId: 'kart-track', kart: '1' } });
    expect(boards.body.boards.blocktown.board).toEqual([]);
  });
});

describe('kart boards on a sketched track', () => {
  it('uses the area track as its own circuit', async () => {
    setStore(new MemoryStore());
    const oval: number[] = [];
    for (let i = 0; i < 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      oval.push(Math.round(Math.cos(a) * 80 * 10) / 10, Math.round(Math.sin(a) * 50 * 10) / 10);
    }
    await publish(oval);
    const g = lap('sketch', oval, 14);
    const r = await post({ action: 'kartlap', browserId: alice, circuit: 'sketch', body: 'classic', ms: g.ms, ghost: g });
    expect(r.status).toBe(200);
    const legacy = await call(scoresApi, { query: { roomId, areaId: 'kart-track' } });
    expect(legacy.body.board[0].value).toBe(g.ms);
    const boards = await call(scoresApi, { query: { roomId, areaId: 'kart-track', kart: '1' } });
    expect(boards.body.circuits[0]).toBe('sketch');
    const bt = await post({ action: 'kartlap', browserId: alice, circuit: 'blocktown', body: 'classic', ms: g.ms, ghost: { ...g, c: 'blocktown' } });
    expect(bt.status).toBe(400);
  });
});
