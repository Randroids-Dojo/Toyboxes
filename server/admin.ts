// Creator tools: sign-in, review, PIN resets, claim cleanup and publishing.
//
// The admin signs in with ADMIN_PASSWORD and receives an HttpOnly, SameSite
// Strict session cookie signed with TOYBOXES_SECRET. Every admin request also
// needs the `x-toyboxes-admin` header, which a cross-site form cannot send.

import { EMPTY_CONTENT, MAX_PAGE_TEXT, SLOT_COUNT, cleanName, contentProblem, type Page, type PageStatus, type RoomContent } from '../src/shared/model.js';
import { hashPin, safeEqual, signToken, verifyToken, type PinRecord } from './crypto.js';
import { ApiError, clearFailures, countFailure, header, limit, type Req, type Res } from './http.js';
import { loadPages, log, publicRoom, updateRoom, type LogEntry, type PageMeta, type RoomRecord } from './rooms.js';
import { getStore } from './store.js';

const COOKIE = 'tb_admin';
const SESSION_MS = 12 * 3600 * 1000;

function adminPassword(): string | null {
  const p = process.env.ADMIN_PASSWORD;
  if (p && p.length >= 8) return p;
  if (process.env.VERCEL) return null;
  return 'toyboxes-dev';
}

function readCookie(req: Req, name: string): string | undefined {
  const raw = header(req, 'cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function cookie(value: string, maxAgeSec: number): string {
  const secure = process.env.VERCEL ? '; Secure' : '';
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`;
}

export function isAdmin(req: Req): boolean {
  const claims = verifyToken<{ x: number }>(readCookie(req, COOKIE), 'admin');
  return !!claims && claims.x > Date.now();
}

export function requireAdmin(req: Req): void {
  if (header(req, 'x-toyboxes-admin') !== '1') throw new ApiError(403, 'csrf', 'Missing admin header');
  if (!isAdmin(req)) throw new ApiError(401, 'signed_out', 'Sign in to continue');
}

export async function login(req: Req, res: Res, password: string, ip: string): Promise<{ ok: true }> {
  if (header(req, 'x-toyboxes-admin') !== '1') throw new ApiError(403, 'csrf', 'Missing admin header');
  const want = adminPassword();
  if (!want) throw new ApiError(503, 'not_configured', 'Admin sign-in is not configured');
  await limit(`adminfail:${ip}`, 8, 15 * 60, 'Too many attempts. Wait 15 minutes.', true);
  if (!safeEqual(password, want)) {
    await countFailure(`adminfail:${ip}`, 15 * 60);
    throw new ApiError(403, 'wrong_password', 'That password is not right');
  }
  await clearFailures(`adminfail:${ip}`);
  res.setHeader('Set-Cookie', cookie(signToken({ x: Date.now() + SESSION_MS }, 'admin'), SESSION_MS / 1000));
  return { ok: true };
}

export function logout(res: Res): { ok: true } {
  res.setHeader('Set-Cookie', cookie('', 0));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reads

export async function listRooms(which: 'rooms' | 'released') {
  const store = getStore();
  const ids = await store.zrevrange(which, 0, 199);
  const recs = await store.mget<RoomRecord>(ids.map((id) => `room:${id}`));
  const counts = await store.mget<number>(ids.map((id) => `pageseq:${id}`));
  return recs
    .map((r, i) =>
      r
        ? {
            id: r.id,
            slot: r.slot,
            ownerName: r.ownerName,
            claimedAt: r.claimedAt,
            updatedAt: r.updatedAt,
            releasedAt: r.releasedAt ?? null,
            status: r.status,
            pages: counts[i] ?? 0,
            props: r.layout.length,
          }
        : null,
    )
    .filter((r) => r !== null);
}

export async function feed() {
  const store = getStore();
  const members = await store.zrevrange('feed', 0, 149);
  const pairs = members.map((m) => m.split('/') as [string, string]);
  const pages = await store.mget<Page & { removed?: boolean }>(pairs.map(([r, p]) => `page:${r}:${p}`));
  const metas = await store.mget<PageMeta>(pairs.map(([r, p]) => `pagemeta:${r}:${p}`));
  const roomIds = [...new Set(pairs.map(([r]) => r))];
  const recs = await store.mget<RoomRecord>(roomIds.map((id) => `room:${id}`));
  const roomMap = new Map(roomIds.map((id, i) => [id, recs[i]]));
  return pairs
    .map(([roomId, pageId], i) => {
      const p = pages[i];
      const r = roomMap.get(roomId);
      if (!p || !r) return null;
      const meta = metas[i] ?? { status: 'requested' as const, seenRev: 0 };
      return {
        roomId,
        pageId,
        slot: r.slot,
        ownerName: r.ownerName,
        roomStatus: r.status,
        n: p.n,
        excerpt: p.text.slice(0, 220),
        strokes: p.sketch.length,
        updatedAt: p.updatedAt,
        rev: p.rev,
        status: meta.status,
        seen: meta.seenRev >= p.rev,
        removed: !!p.removed,
        note: meta.note ?? '',
      };
    })
    .filter((x) => x !== null);
}

export async function roomDetail(id: string) {
  const store = getStore();
  const rec = await store.get<RoomRecord>(`room:${id}`);
  if (!rec) throw new ApiError(404, 'no_room', 'No such room');
  const [pin, content, logEntries, pages, fails] = await Promise.all([
    store.get<PinRecord>(`pin:${id}`),
    store.get<RoomContent>(`content:${id}`),
    store.lrange<LogEntry>(`log:${id}`, 0, 99),
    loadPages(id),
    store.get<number>(`rl:pinfail:${id}`),
  ]);
  const metas = await store.mget<PageMeta>(pages.map((p) => `pagemeta:${id}:${p.id}`));
  const history = await Promise.all(pages.map((p) => store.lrange<Page & { savedAt: number; by: string }>(`pagehist:${id}:${p.id}`, 0, 24)));
  const { ownerKey: _ownerKey, ...safe } = rec;
  return {
    room: safe,
    pin: pin ? { epoch: pin.epoch, setAt: pin.setAt, setBy: pin.setBy, recentFailures: fails ?? 0 } : null,
    content: content ?? EMPTY_CONTENT,
    pages: pages.map((p, i) => ({ ...p, seen: (metas[i]?.seenRev ?? 0) >= p.rev, note: metas[i]?.note ?? '', history: history[i] })),
    log: logEntries,
  };
}

// ---------------------------------------------------------------------------
// Writes

export async function setPin(id: string, pin: string) {
  const store = getStore();
  const cur = await store.get<PinRecord>(`pin:${id}`);
  if (!cur) throw new ApiError(404, 'no_room', 'No such room');
  await store.set(`pin:${id}`, await hashPin(pin, cur.epoch + 1, 'admin'));
  await clearFailures(`pinfail:${id}`);
  await log(id, 'admin', 'Changed the PIN');
  return { ok: true };
}

export async function release(id: string) {
  const store = getStore();
  const rec = await updateRoom(id, (r) => {
    if (r.status === 'released') return null;
    r.status = 'released';
    r.releasedAt = Date.now();
    return r;
  });
  if ((await store.get<string>(`slot:${rec.slot}`)) === id) await store.del(`slot:${rec.slot}`);
  if ((await store.get<string>(`owner:${rec.ownerKey}`)) === id) await store.del(`owner:${rec.ownerKey}`);
  await store.zrem('rooms', id);
  await store.zadd('released', Date.now(), id);
  await log(id, 'admin', `Released entrance ${rec.slot + 1}`);
  return { ok: true };
}

/** Puts a released room back on a free entrance. */
export async function restore(id: string, slot: number) {
  const store = getStore();
  const rec = await store.get<RoomRecord>(`room:${id}`);
  if (!rec) throw new ApiError(404, 'no_room', 'No such room');
  if (rec.status === 'active') throw new ApiError(400, 'active', 'That room is already active');
  if (!(await store.set(`slot:${slot}`, id, { nx: true }))) throw new ApiError(409, 'taken', `Entrance ${slot + 1} is taken`);
  await updateRoom(id, (r) => {
    r.status = 'active';
    r.slot = slot;
    delete r.releasedAt;
    return r;
  });
  await store.zrem('released', id);
  await store.zadd('rooms', rec.claimedAt, id);
  await log(id, 'admin', `Restored on entrance ${slot + 1}`);
  return { ok: true };
}

export async function moveSlot(id: string, slot: number) {
  const store = getStore();
  const rec = await store.get<RoomRecord>(`room:${id}`);
  if (!rec || rec.status !== 'active') throw new ApiError(404, 'no_room', 'No active room');
  if (rec.slot === slot) return { ok: true };
  if (slot < 0 || slot >= SLOT_COUNT) throw new ApiError(400, 'bad_slot', 'No such entrance');
  if (!(await store.set(`slot:${slot}`, id, { nx: true }))) throw new ApiError(409, 'taken', `Entrance ${slot + 1} is taken`);
  const from = rec.slot;
  await updateRoom(id, (r) => {
    r.slot = slot;
    return r;
  });
  if ((await store.get<string>(`slot:${from}`)) === id) await store.del(`slot:${from}`);
  await log(id, 'admin', `Moved from entrance ${from + 1} to ${slot + 1}`);
  return { ok: true };
}

export async function setOwnerName(id: string, raw: string) {
  const name = cleanName(raw);
  if (!name) throw new ApiError(400, 'bad_name', 'Pick a different name');
  let before = '';
  await updateRoom(id, (r) => {
    before = r.ownerName;
    r.ownerName = name;
    return r;
  });
  await log(id, 'admin', `Changed owner label from ${before} to ${name}`);
  return { ok: true };
}

/** Lets the owning browser claim another room. */
export async function clearOwnerBinding(id: string) {
  const store = getStore();
  const rec = await store.get<RoomRecord>(`room:${id}`);
  if (!rec) throw new ApiError(404, 'no_room', 'No such room');
  if ((await store.get<string>(`owner:${rec.ownerKey}`)) === id) await store.del(`owner:${rec.ownerKey}`);
  await store.del(`claimcd:${rec.ownerKey}`);
  await log(id, 'admin', 'Allowed the owner browser to claim another room');
  return { ok: true };
}

export async function resetLayout(id: string) {
  await updateRoom(id, (r) => {
    r.layout = [];
    return r;
  });
  await log(id, 'admin', 'Cleared the toy layout');
  return { ok: true };
}

async function pageMeta(roomId: string, pageId: string): Promise<PageMeta> {
  return (await getStore().get<PageMeta>(`pagemeta:${roomId}:${pageId}`)) ?? { status: 'requested', seenRev: 0 };
}

export async function setPageStatus(roomId: string, pageId: string, status: PageStatus) {
  const store = getStore();
  const meta = await pageMeta(roomId, pageId);
  await store.set(`pagemeta:${roomId}:${pageId}`, { ...meta, status });
  const page = await store.get<Page>(`page:${roomId}:${pageId}`);
  await log(roomId, 'admin', `Marked page ${page?.n ?? '?'} ${status}`);
  return { ok: true };
}

export async function setPageNote(roomId: string, pageId: string, note: string) {
  const store = getStore();
  const meta = await pageMeta(roomId, pageId);
  await store.set(`pagemeta:${roomId}:${pageId}`, { ...meta, note: note.slice(0, 600) });
  return { ok: true };
}

export async function markSeen(roomId: string, pageId: string) {
  const store = getStore();
  const page = await store.get<Page>(`page:${roomId}:${pageId}`);
  if (!page) throw new ApiError(404, 'no_page', 'No such page');
  const meta = await pageMeta(roomId, pageId);
  await store.set(`pagemeta:${roomId}:${pageId}`, { ...meta, seenRev: page.rev });
  return { ok: true };
}

export async function setPageRemoved(roomId: string, pageId: string, removed: boolean) {
  const store = getStore();
  const key = `page:${roomId}:${pageId}`;
  const page = await store.get<Page & { removed?: boolean }>(key);
  if (!page) throw new ApiError(404, 'no_page', 'No such page');
  await store.set(key, { ...page, removed });
  await log(roomId, 'admin', `${removed ? 'Removed' : 'Restored'} page ${page.n}`);
  return { ok: true };
}

/** Makes an earlier version the current one. The replaced text goes to history. */
export async function revertPage(roomId: string, pageId: string, index: number) {
  const store = getStore();
  const key = `page:${roomId}:${pageId}`;
  const cur = await store.get<Page & { removed?: boolean }>(key);
  if (!cur) throw new ApiError(404, 'no_page', 'No such page');
  const hist = await store.lrange<Page>(`pagehist:${roomId}:${pageId}`, index, index);
  const old = hist[0];
  if (!old) throw new ApiError(404, 'no_version', 'No such version');
  const now = Date.now();
  const next = { ...cur, text: old.text.slice(0, MAX_PAGE_TEXT), sketch: old.sketch, updatedAt: now, rev: cur.rev + 1 };
  const r = await store.cas(key, cur.rev, next);
  if (!r.ok) throw new ApiError(409, 'conflict', 'The page changed. Reload and try again.');
  await store.lpush(`pagehist:${roomId}:${pageId}`, { ...cur, savedAt: now, by: 'admin' }, 25);
  await log(roomId, 'admin', `Reverted page ${cur.n} to an earlier version`);
  return { ok: true };
}

export async function saveContent(id: string, content: RoomContent) {
  const store = getStore();
  const rec = await store.get<RoomRecord>(`room:${id}`);
  if (!rec) throw new ApiError(404, 'no_room', 'No such room');
  const problem = contentProblem(content);
  if (problem) throw new ApiError(400, 'bad_content', problem);
  const next = { ...content, rev: content.rev + 1 };
  const r = await store.cas(`content:${id}`, content.rev, next);
  if (!r.ok) throw new ApiError(409, 'conflict', 'Someone else saved this room first. Reload to see it.', { content: r.current });
  const live = next.exhibits.filter((e) => e.published).length;
  const areas = next.areas.filter((a) => a.published).length;
  await log(id, 'admin', `Saved content: ${live} published games, ${areas} published areas`);
  return { content: next, room: publicRoom(rec, next) };
}

