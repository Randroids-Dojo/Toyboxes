import { Redis } from '@upstash/redis';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import adminApi from '../api/admin.js';
import pagesApi from '../api/pages.js';
import roomApi from '../api/room.js';
import worldApi from '../api/world.js';
import { MemoryStore, UpstashStore, setStore } from '../server/store.js';

// KV_CHECK=1 runs the same suite against the real Upstash store (credentials
// from the environment), each test under its own throwaway key prefix.
const live = process.env.KV_CHECK === '1';
const runId = `toyboxes:test-${Date.now().toString(36)}`;
const redis = live ? new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN!, automaticDeserialization: false }) : null;
let testIndex = 0;

type Handler = (req: any, res: any) => Promise<void>;

interface Call {
  method?: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  ip?: string;
}

interface Result {
  status: number;
  body: any;
  headers: Record<string, string | string[]>;
}

async function call(handler: Handler, c: Call = {}): Promise<Result> {
  const out: Result = { status: 200, body: undefined, headers: {} };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(b: unknown) {
      out.body = b;
      return res;
    },
    setHeader(k: string, v: string | string[]) {
      out.headers[k.toLowerCase()] = v;
    },
    end() {
      return res;
    },
  };
  await handler(
    {
      method: c.method ?? 'GET',
      query: c.query ?? {},
      body: c.body,
      headers: { 'x-forwarded-for': c.ip ?? '10.0.0.1', ...(c.headers ?? {}) },
    },
    res,
  );
  return out;
}

const browserA = 'browser-aaaaaaaaaaaaaaaa';
const browserB = 'browser-bbbbbbbbbbbbbbbb';
const browserC = 'browser-cccccccccccccccc';

function claimBody(slot: number, browserId: string, pin = '0042', name = 'Cris') {
  return { action: 'claim', slot, name, pin, pinConfirm: pin, browserId };
}

async function claimRoom(slot = 3, browserId = browserA, pin = '0042', name = 'Cris') {
  const r = await call(roomApi, { method: 'POST', body: claimBody(slot, browserId, pin, name) });
  expect(r.status).toBe(200);
  return r.body as { room: { id: string; rev: number; layout: unknown[]; theme: unknown }; token: string };
}

beforeEach(() => {
  setStore(redis ? new UpstashStore(redis, `${runId}-${testIndex++}:`) : new MemoryStore());
});

afterAll(async () => {
  if (!redis) return;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, { match: `${runId}-*`, count: 500 });
    if (keys.length) await redis.del(...keys);
    cursor = String(next);
  } while (cursor !== '0');
});

describe('claims', () => {
  it('a race for the same entrance produces exactly one owner', async () => {
    const results = await Promise.all([
      call(roomApi, { method: 'POST', body: claimBody(5, browserA), ip: '1.1.1.1' }),
      call(roomApi, { method: 'POST', body: claimBody(5, browserB), ip: '2.2.2.2' }),
      call(roomApi, { method: 'POST', body: claimBody(5, browserC), ip: '3.3.3.3' }),
    ]);
    const winners = results.filter((r) => r.status === 200);
    expect(winners).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    const w = await call(worldApi);
    expect(w.body.slots[5].roomId).toBe(winners[0].body.room.id);
  });

  it('needs matching four-digit PINs and keeps leading zeroes', async () => {
    const bad = await call(roomApi, { method: 'POST', body: { ...claimBody(1, browserA), pinConfirm: '0043' } });
    expect(bad.status).toBe(400);
    const short = await call(roomApi, { method: 'POST', body: { ...claimBody(1, browserA), pin: '42', pinConfirm: '42' } });
    expect(short.status).toBe(400);
    const { room } = await claimRoom(1, browserA, '0007');
    const wrong = await call(roomApi, { method: 'POST', body: { action: 'unlock', roomId: room.id, pin: '7000' } });
    expect(wrong.status).toBe(403);
    const right = await call(roomApi, { method: 'POST', body: { action: 'unlock', roomId: room.id, pin: '0007' } });
    expect(right.status).toBe(200);
  });

  it('allows one active claim per browser', async () => {
    await claimRoom(1, browserA);
    const second = await call(roomApi, { method: 'POST', body: claimBody(2, browserA) });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('has_room');
  });

  it('limits claims from one network', async () => {
    for (let i = 0; i < 6; i++) {
      const r = await call(roomApi, { method: 'POST', body: claimBody(i, `browser-${String(i).repeat(16)}`), ip: '9.9.9.9' });
      expect(r.status).toBe(200);
    }
    const r = await call(roomApi, { method: 'POST', body: claimBody(7, 'browser-zzzzzzzzzzzzzzzz'), ip: '9.9.9.9' });
    expect(r.status).toBe(429);
  });

  it('never exposes PIN data or owner keys publicly', async () => {
    const { room } = await claimRoom();
    const pub = await call(roomApi, { query: { id: room.id } });
    const world = await call(worldApi);
    const text = JSON.stringify([pub.body, world.body]);
    expect(text).not.toMatch(/hash|salt|ownerKey|0042/);
  });

  it('entering a room never needs a PIN', async () => {
    const { room } = await claimRoom();
    const r = await call(roomApi, { query: { id: room.id } });
    expect(r.status).toBe(200);
    expect(r.body.room.ownerName).toBe('Cris');
  });
});

describe('PIN-protected edits', () => {
  it('rejects layout changes without a valid token and accepts them with one', async () => {
    const { room, token } = await claimRoom();
    const layout = [{ id: 'b', kind: 'ball', x: 1, z: 0, rot: 0 }];
    const body = { action: 'layout', roomId: room.id, layout, theme: room.theme, rev: room.rev };
    const none = await call(roomApi, { method: 'POST', body });
    expect(none.status).toBe(401);
    // Change a character inside the signature (the last one may only carry padding bits).
    const i = token.indexOf('.') + 6;
    const tampered = token.slice(0, i) + (token[i] === 'A' ? 'B' : 'A') + token.slice(i + 1);
    const forged = await call(roomApi, { method: 'POST', body, headers: { 'x-room-token': tampered } });
    expect(forged.status).toBe(401);
    const ok = await call(roomApi, { method: 'POST', body, headers: { 'x-room-token': token } });
    expect(ok.status).toBe(200);
    expect(ok.body.room.layout).toHaveLength(1);
    const stale = await call(roomApi, { method: 'POST', body, headers: { 'x-room-token': token } });
    expect(stale.status).toBe(409);
    expect(stale.body.room.rev).toBe(room.rev + 1);
  });

  it('a token for one room cannot edit another', async () => {
    const a = await claimRoom(1, browserA);
    const b = await claimRoom(2, browserB, '1111', 'Sam');
    const r = await call(pagesApi, { method: 'POST', body: { roomId: b.room.id, text: 'hi', sketch: [] }, headers: { 'x-room-token': a.token } });
    expect(r.status).toBe(401);
  });

  it('refuses layouts that block the doorway', async () => {
    const { room, token } = await claimRoom();
    const layout = [{ id: 'g', kind: 'goal', x: 0, z: 3.5, rot: 0 }];
    const r = await call(roomApi, { method: 'POST', body: { action: 'layout', roomId: room.id, layout, theme: room.theme, rev: room.rev }, headers: { 'x-room-token': token } });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/doorway/);
  });

  it('throttles wrong PINs per room', async () => {
    const { room } = await claimRoom();
    for (let i = 0; i < 5; i++) {
      const r = await call(roomApi, { method: 'POST', body: { action: 'unlock', roomId: room.id, pin: '9999' }, ip: `5.5.5.${i}` });
      expect(r.status).toBe(403);
    }
    const locked = await call(roomApi, { method: 'POST', body: { action: 'unlock', roomId: room.id, pin: '0042' }, ip: '6.6.6.6' });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('the correct PIN works from another browser', async () => {
    const { room } = await claimRoom(1, browserA);
    const r = await call(roomApi, { method: 'POST', body: { action: 'unlock', roomId: room.id, pin: '0042' }, ip: '8.8.8.8' });
    expect(r.status).toBe(200);
    const page = await call(pagesApi, { method: 'POST', body: { roomId: room.id, text: 'From my phone', sketch: [] }, headers: { 'x-room-token': r.body.token } });
    expect(page.status).toBe(200);
  });
});

describe('sketchbook', () => {
  it('new pages are separate requests and edits keep page identity', async () => {
    const { room, token } = await claimRoom();
    const h = { 'x-room-token': token };
    const p1 = await call(pagesApi, { method: 'POST', body: { roomId: room.id, text: 'A soccer game', sketch: [] }, headers: h });
    const p2 = await call(pagesApi, { method: 'POST', body: { roomId: room.id, text: 'A kart course', sketch: [{ c: 1, w: 1, p: [10, 10, 500, 500] }] }, headers: h });
    expect(p1.body.page.n).toBe(1);
    expect(p2.body.page.n).toBe(2);
    const edit = await call(pagesApi, {
      method: 'PUT',
      body: { roomId: room.id, pageId: p1.body.page.id, text: 'A soccer game with two goals', sketch: [], rev: 1 },
      headers: h,
    });
    expect(edit.status).toBe(200);
    expect(edit.body.page.id).toBe(p1.body.page.id);
    expect(edit.body.page.n).toBe(1);
    const list = await call(pagesApi, { query: { roomId: room.id }, headers: h });
    expect(list.body.pages.map((p: any) => p.text)).toEqual(['A soccer game with two goals', 'A kart course']);
  });

  it('a stale edit gets a conflict instead of overwriting newer work', async () => {
    const { room, token } = await claimRoom();
    const h = { 'x-room-token': token };
    const p = await call(pagesApi, { method: 'POST', body: { roomId: room.id, text: 'v1', sketch: [] }, headers: h });
    const id = p.body.page.id;
    const a = await call(pagesApi, { method: 'PUT', body: { roomId: room.id, pageId: id, text: 'v2 from phone', sketch: [], rev: 1 }, headers: h });
    expect(a.status).toBe(200);
    const b = await call(pagesApi, { method: 'PUT', body: { roomId: room.id, pageId: id, text: 'v2 from tv', sketch: [], rev: 1 }, headers: h });
    expect(b.status).toBe(409);
    expect(b.body.page.text).toBe('v2 from phone');
  });

  it('requires typed text', async () => {
    const { room, token } = await claimRoom();
    const r = await call(pagesApi, { method: 'POST', body: { roomId: room.id, text: '   ', sketch: [] }, headers: { 'x-room-token': token } });
    expect(r.status).toBe(400);
  });

  it('anyone can read the pages; only the PIN holder can write', async () => {
    const { room, token } = await claimRoom();
    await call(pagesApi, { method: 'POST', body: { roomId: room.id, text: 'A soccer game', sketch: [{ c: 0, w: 1, p: [1, 2, 3, 4] }] }, headers: { 'x-room-token': token } });
    const read = await call(pagesApi, { query: { roomId: room.id }, ip: '4.4.4.4' });
    expect(read.status).toBe(200);
    expect(read.body.pages.map((p: any) => p.text)).toEqual(['A soccer game']);
    expect(read.body.pages[0].sketch).toHaveLength(1);
    const write = await call(pagesApi, { method: 'POST', body: { roomId: room.id, text: 'Sneaky page', sketch: [] }, ip: '4.4.4.4' });
    expect(write.status).toBe(401);
    const edit = await call(pagesApi, { method: 'PUT', body: { roomId: room.id, pageId: read.body.pages[0].id, text: 'Changed', sketch: [], rev: 1 }, ip: '4.4.4.4' });
    expect(edit.status).toBe(401);
  });

  it('pages the creator removed stay hidden from visitors', async () => {
    const { room, token } = await claimRoom();
    const p = await call(pagesApi, { method: 'POST', body: { roomId: room.id, text: 'Something rude', sketch: [] }, headers: { 'x-room-token': token } });
    const h = { 'x-toyboxes-admin': '1' };
    const login = await call(adminApi, { method: 'POST', body: { action: 'login', password: 'toyboxes-dev' }, headers: h });
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    await call(adminApi, { method: 'POST', body: { action: 'removePage', roomId: room.id, pageId: p.body.page.id, removed: true }, headers: { ...h, cookie } });
    const read = await call(pagesApi, { query: { roomId: room.id } });
    expect(read.body.pages).toEqual([]);
  });
});

describe('rename', () => {
  it('needs the PIN and only renames the verified room', async () => {
    const a = await claimRoom(1, browserA, '1234', 'Alex');
    const b = await claimRoom(2, browserB, '5678', 'Alex');
    const wrong = await call(roomApi, { method: 'POST', body: { action: 'rename', roomId: a.room.id, pin: '5678', name: 'Alexis' } });
    expect(wrong.status).toBe(403);
    const unchanged = await call(roomApi, { query: { id: a.room.id } });
    expect(unchanged.body.room.ownerName).toBe('Alex');
    const ok = await call(roomApi, { method: 'POST', body: { action: 'rename', roomId: a.room.id, pin: '1234', name: 'Alexis' } });
    expect(ok.status).toBe(200);
    expect(ok.body.changed).toEqual(['Room 2 owner label']);
    const other = await call(roomApi, { query: { id: b.room.id } });
    expect(other.body.room.ownerName).toBe('Alex');
  });
});

describe('admin', () => {
  const H = { 'x-toyboxes-admin': '1' };

  async function signIn(): Promise<Record<string, string>> {
    const r = await call(adminApi, { method: 'POST', body: { action: 'login', password: 'toyboxes-dev' }, headers: H });
    expect(r.status).toBe(200);
    const cookie = String(r.headers['set-cookie']).split(';')[0];
    return { ...H, cookie };
  }

  it('requires a real sign-in', async () => {
    const anon = await call(adminApi, { query: { view: 'rooms' }, headers: H });
    expect(anon.status).toBe(401);
    const bad = await call(adminApi, { method: 'POST', body: { action: 'login', password: 'nope' }, headers: H });
    expect(bad.status).toBe(403);
    const noHeader = await call(adminApi, { method: 'POST', body: { action: 'login', password: 'toyboxes-dev' } });
    expect(noHeader.status).toBe(403);
    const h = await signIn();
    const ok = await call(adminApi, { query: { view: 'rooms' }, headers: h });
    expect(ok.status).toBe(200);
  });

  it('a PIN reset works and revokes old edit tokens', async () => {
    const { room, token } = await claimRoom();
    const h = await signIn();
    const reset = await call(adminApi, { method: 'POST', body: { action: 'setPin', roomId: room.id, pin: '9090' }, headers: h });
    expect(reset.status).toBe(200);
    const old = await call(pagesApi, { method: 'POST', body: { roomId: room.id, text: 'x', sketch: [] }, headers: { 'x-room-token': token } });
    expect(old.status).toBe(401);
    const unlocked = await call(roomApi, { method: 'POST', body: { action: 'unlock', roomId: room.id, pin: '9090' } });
    expect(unlocked.status).toBe(200);
  });

  it('releasing an abusive claim frees the entrance and the browser', async () => {
    const { room } = await claimRoom(4, browserA);
    const h = await signIn();
    const r = await call(adminApi, { method: 'POST', body: { action: 'release', roomId: room.id }, headers: h });
    expect(r.status).toBe(200);
    const w = await call(worldApi);
    expect(w.body.slots[4].roomId).toBeNull();
    const gone = await call(roomApi, { query: { id: room.id } });
    expect(gone.status).toBe(404);
    const again = await call(roomApi, { method: 'POST', body: claimBody(4, browserB), ip: '7.7.7.7' });
    expect(again.status).toBe(200);
  });

  it('publishes content into the main room and inner areas', async () => {
    const { room, token } = await claimRoom();
    const h = await signIn();
    const p = await call(pagesApi, { method: 'POST', body: { roomId: room.id, text: 'Soccer!', sketch: [] }, headers: { 'x-room-token': token } });
    const content = {
      rev: 0,
      areas: [
        { id: 'pitch', name: 'Soccer pitch', theme: { wall: 3, floor: 4, trim: 2 }, props: [{ id: 'g', kind: 'goal', x: 0, z: -3, rot: 0 }], published: true },
        { id: 'secret', name: 'Not yet', theme: { wall: 0, floor: 0, trim: 0 }, props: [], published: false },
      ],
      exhibits: [
        { id: 'e1', title: 'Penalty Kicks', blurb: '', url: 'https://example.com/pk', area: 'main', x: 4, z: -2, rot: 0, color: 1, pages: [p.body.page.id], published: true },
        { id: 'e2', title: 'Kart Cup', blurb: '', url: '/games/kart/', area: 'pitch', x: -3, z: -2, rot: 0, color: 2, pages: [], published: true },
        { id: 'e3', title: 'Draft', blurb: '', url: '/x', area: 'secret', x: 0, z: 0, rot: 0, color: 2, pages: [], published: true },
      ],
    };
    const saved = await call(adminApi, { method: 'POST', body: { action: 'saveContent', roomId: room.id, content }, headers: h });
    expect(saved.status).toBe(200);
    const pub = await call(roomApi, { query: { id: room.id } });
    expect(pub.body.room.content.areas.map((a: any) => a.id)).toEqual(['pitch']);
    expect(pub.body.room.content.exhibits.map((e: any) => e.id).sort()).toEqual(['e1', 'e2']);
    const w = await call(worldApi);
    expect(w.body.slots[3].hasContent).toBe(true);
    // A second save with the stale rev must not overwrite.
    const stale = await call(adminApi, { method: 'POST', body: { action: 'saveContent', roomId: room.id, content }, headers: h });
    expect(stale.status).toBe(409);
  });

  it('marks pages and keeps them in the review feed', async () => {
    const { room, token } = await claimRoom();
    const h = await signIn();
    const p = await call(pagesApi, { method: 'POST', body: { roomId: room.id, text: 'Kart idea', sketch: [] }, headers: { 'x-room-token': token } });
    const feed1 = await call(adminApi, { query: { view: 'feed' }, headers: h });
    expect(feed1.body.feed[0]).toMatchObject({ pageId: p.body.page.id, seen: false, status: 'requested' });
    await call(adminApi, { method: 'POST', body: { action: 'markSeen', roomId: room.id, pageId: p.body.page.id }, headers: h });
    await call(adminApi, { method: 'POST', body: { action: 'pageStatus', roomId: room.id, pageId: p.body.page.id, status: 'building' }, headers: h });
    const feed2 = await call(adminApi, { query: { view: 'feed' }, headers: h });
    expect(feed2.body.feed[0]).toMatchObject({ seen: true, status: 'building' });
    const list = await call(pagesApi, { query: { roomId: room.id }, headers: { 'x-room-token': token } });
    expect(list.body.pages[0].status).toBe('building');
    // An owner edit after review shows up as changed again.
    await call(pagesApi, { method: 'PUT', body: { roomId: room.id, pageId: p.body.page.id, text: 'Kart idea v2', sketch: [], rev: 1 }, headers: { 'x-room-token': token } });
    const feed3 = await call(adminApi, { query: { view: 'feed' }, headers: h });
    expect(feed3.body.feed[0].seen).toBe(false);
  });
});
