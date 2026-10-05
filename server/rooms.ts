// Room claims, PINs, layouts, renames and sketchbook pages.
//
// Keys (all under keyPrefix()):
//   slot:<n>              room id holding entrance n (SET NX is the claim commit)
//   room:<id>             RoomRecord (CAS on rev)
//   pin:<id>              PinRecord, never returned by any endpoint
//   owner:<browserKey>    room id claimed by that browser (one active claim each)
//   content:<id>          RoomContent built by the creator (CAS on rev)
//   pages:<id>            sorted set of page ids by page number
//   pageseq:<id>          page number counter
//   page:<id>:<pageId>    Page (CAS on rev), owner-editable fields only
//   pagemeta:<id>:<pageId> creator-side status and review marker
//   pagehist:<id>:<pageId> earlier versions of a page, newest first
//   log:<id>              room history, newest first
//   rooms                 sorted set of active room ids by claim time
//   released              sorted set of released room ids by release time
//   feed                  sorted set of "<roomId>/<pageId>" by last edit
//   rl:*                  rate-limit counters

import {
  DEFAULT_THEME,
  EMPTY_CONTENT,
  MAX_PAGES,
  SLOT_COUNT,
  cleanName,
  exhibitsIn,
  layoutProblem,
  publishedContent,
  type Page,
  type PageStatus,
  type PropPlacement,
  type RoomContent,
  type RoomPublic,
  type RoomTheme,
  type SlotSummary,
  type Stroke,
} from '../src/shared/model.js';
import { browserKey, hashPin, newId, signToken, verifyPin, verifyToken, type PinRecord } from './crypto.js';
import { ApiError, clearFailures, countFailure, limit } from './http.js';
import { getStore } from './store.js';

export interface RoomRecord {
  id: string;
  slot: number;
  ownerName: string;
  ownerKey: string;
  claimedAt: number;
  updatedAt: number;
  rev: number;
  theme: RoomTheme;
  layout: PropPlacement[];
  status: 'active' | 'released';
  releasedAt?: number;
}

export interface PageMeta {
  status: PageStatus;
  /** The page rev the creator last looked at. */
  seenRev: number;
  /** Creator-only note, e.g. what an automatic build did or why it skipped. */
  note?: string;
}

export interface LogEntry {
  at: number;
  by: 'owner' | 'admin' | 'system';
  what: string;
}

export const EDIT_TOKEN_TTL_MS = 30 * 60 * 1000;
export const CLAIM_COOLDOWN_SEC = 10 * 60;
export const CLAIMS_PER_IP_PER_DAY = 6;
export const PIN_FAILS_PER_ROOM = 5;
export const PIN_FAIL_WINDOW_SEC = 15 * 60;
export const PIN_FAILS_PER_IP = 25;

interface EditClaims {
  r: string;
  e: number;
  x: number;
}

export function publicRoom(rec: RoomRecord, content: RoomContent | null): RoomPublic {
  return {
    id: rec.id,
    slot: rec.slot,
    ownerName: rec.ownerName,
    claimedAt: rec.claimedAt,
    theme: rec.theme,
    layout: rec.layout,
    rev: rec.rev,
    content: publishedContent(content ?? EMPTY_CONTENT),
  };
}

export async function log(roomId: string, by: LogEntry['by'], what: string): Promise<void> {
  await getStore().lpush(`log:${roomId}`, { at: Date.now(), by, what } satisfies LogEntry, 300);
}

export async function loadRoom(id: string): Promise<RoomRecord> {
  const rec = await getStore().get<RoomRecord>(`room:${id}`);
  if (!rec || rec.status !== 'active') throw new ApiError(404, 'no_room', 'That room is not claimed any more');
  return rec;
}

/** Applies `fn` to the latest room record with compare-and-set retries. */
export async function updateRoom(id: string, fn: (rec: RoomRecord) => RoomRecord | null): Promise<RoomRecord> {
  const store = getStore();
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await store.get<RoomRecord>(`room:${id}`);
    if (!cur) throw new ApiError(404, 'no_room', 'That room does not exist');
    const next = fn(structuredClone(cur));
    if (!next) return cur;
    next.rev = cur.rev + 1;
    next.updatedAt = Date.now();
    const r = await store.cas(`room:${id}`, cur.rev, next);
    if (r.ok) return next;
  }
  throw new ApiError(409, 'busy', 'The room changed while saving. Try again.');
}

// ---------------------------------------------------------------------------
// World

export async function world(): Promise<SlotSummary[]> {
  const store = getStore();
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => i);
  const ids = await store.mget<string>(slots.map((s) => `slot:${s}`));
  const live = ids.filter((id): id is string => !!id);
  const recs = await store.mget<RoomRecord>(live.map((id) => `room:${id}`));
  const contents = await store.mget<RoomContent>(live.map((id) => `content:${id}`));
  const byId = new Map<string, { rec: RoomRecord; content: RoomContent | null }>();
  live.forEach((id, i) => {
    const rec = recs[i];
    if (rec && rec.status === 'active') byId.set(id, { rec, content: contents[i] });
  });
  return slots.map((slot, i) => {
    const id = ids[i];
    const found = id ? byId.get(id) : undefined;
    if (!found) return { slot, roomId: id ?? null, ownerName: null, theme: null, hasContent: false };
    const pub = publishedContent(found.content ?? EMPTY_CONTENT);
    return { slot, roomId: id!, ownerName: found.rec.ownerName, theme: found.rec.theme, hasContent: pub.exhibits.length + pub.areas.length > 0 };
  });
}

export async function room(id: string): Promise<RoomPublic> {
  const rec = await loadRoom(id);
  const content = await getStore().get<RoomContent>(`content:${id}`);
  return publicRoom(rec, content);
}

// ---------------------------------------------------------------------------
// Claim

export interface ClaimInput {
  slot: number;
  name: string;
  pin: string;
  pinConfirm: string;
  browserId: string;
}

export async function claim(input: ClaimInput, ip: string): Promise<{ room: RoomPublic; token: string; expiresAt: number }> {
  const store = getStore();
  const name = cleanName(input.name);
  if (!name) throw new ApiError(400, 'bad_name', 'Pick a different name');
  if (input.pin !== input.pinConfirm) throw new ApiError(400, 'pin_mismatch', 'The two PINs do not match');
  const key = browserKey(input.browserId);

  const existing = await store.get<string>(`owner:${key}`);
  if (existing) {
    const rec = await store.get<RoomRecord>(`room:${existing}`);
    if (rec && rec.status === 'active') throw new ApiError(409, 'has_room', `You already have room ${rec.slot + 1}`, { roomId: rec.id, slot: rec.slot });
    await store.del(`owner:${key}`);
  }
  const cooldown = await store.ttl(`claimcd:${key}`);
  if (cooldown > 0) throw new ApiError(429, 'cooldown', 'You claimed a room a moment ago. Try again a little later.', { retryAfter: cooldown });
  const taken = await store.get<string>(`slot:${input.slot}`);
  if (taken) throw new ApiError(409, 'taken', 'Someone already claimed this room');
  await limit(`claim-ip:${ip}`, CLAIMS_PER_IP_PER_DAY, 24 * 3600, 'Too many rooms claimed from this network today');

  // One active claim per browser. Hold the owner key first so a browser racing
  // itself across two doors cannot win both.
  const id = newId();
  if (!(await store.set(`owner:${key}`, id, { nx: true }))) throw new ApiError(409, 'has_room', 'You already have a room');

  const now = Date.now();
  const rec: RoomRecord = {
    id,
    slot: input.slot,
    ownerName: name,
    ownerKey: key,
    claimedAt: now,
    updatedAt: now,
    rev: 1,
    theme: { ...DEFAULT_THEME, trim: input.slot % 8 },
    layout: starterLayout(),
    status: 'active',
  };
  const pinRec = await hashPin(input.pin, 1, 'owner');
  await store.set(`pin:${id}`, pinRec);
  await store.set(`room:${id}`, rec);

  // The commit point: exactly one claimant wins the entrance.
  if (!(await store.set(`slot:${input.slot}`, id, { nx: true }))) {
    await store.del(`owner:${key}`, `pin:${id}`, `room:${id}`);
    throw new ApiError(409, 'taken', 'Someone claimed this room a moment before you');
  }
  await store.zadd('rooms', now, id);
  await store.set(`claimcd:${key}`, 1, { ex: CLAIM_COOLDOWN_SEC });
  await log(id, 'owner', `Claimed entrance ${input.slot + 1} as ${name}`);
  const expiresAt = now + EDIT_TOKEN_TTL_MS;
  return { room: publicRoom(rec, null), token: editToken(id, pinRec.epoch, expiresAt), expiresAt };
}

function starterLayout(): PropPlacement[] {
  return [
    { id: 'ball1', kind: 'ball', x: 0, z: -1, rot: 0 },
    { id: 'goal1', kind: 'goal', x: 0, z: -3.0, rot: 0 },
  ];
}

// ---------------------------------------------------------------------------
// PIN checks and edit sessions

function editToken(roomId: string, epoch: number, expiresAt: number): string {
  return signToken({ r: roomId, e: epoch, x: expiresAt } satisfies EditClaims, 'edit');
}

/** Verifies a PIN with per-room and per-network throttling. */
export async function checkPin(roomId: string, pin: string, ip: string): Promise<PinRecord> {
  const store = getStore();
  await limit(`pinfail:${roomId}`, PIN_FAILS_PER_ROOM, PIN_FAIL_WINDOW_SEC, 'Too many wrong PINs for this room. Wait a few minutes.', true);
  await limit(`pinfail-ip:${ip}`, PIN_FAILS_PER_IP, 3600, 'Too many wrong PINs from this network. Wait a while.', true);
  const rec = await store.get<PinRecord>(`pin:${roomId}`);
  if (!rec) throw new ApiError(404, 'no_room', 'That room is not claimed');
  if (!(await verifyPin(pin, rec))) {
    const n = await countFailure(`pinfail:${roomId}`, PIN_FAIL_WINDOW_SEC);
    await countFailure(`pinfail-ip:${ip}`, 3600);
    const left = Math.max(0, PIN_FAILS_PER_ROOM - n);
    throw new ApiError(403, 'wrong_pin', left > 0 ? 'That PIN is not right' : 'Too many wrong PINs for this room. Wait a few minutes.', { attemptsLeft: left });
  }
  await clearFailures(`pinfail:${roomId}`);
  return rec;
}

export async function unlock(roomIdValue: string, pin: string, ip: string): Promise<{ token: string; expiresAt: number }> {
  await loadRoom(roomIdValue);
  const rec = await checkPin(roomIdValue, pin, ip);
  const expiresAt = Date.now() + EDIT_TOKEN_TTL_MS;
  return { token: editToken(roomIdValue, rec.epoch, expiresAt), expiresAt };
}

/** Every protected write calls this, not just the editor opening. */
export async function requireEdit(token: string | undefined, roomIdValue: string): Promise<void> {
  const claims = verifyToken<EditClaims>(token, 'edit');
  if (!claims || claims.r !== roomIdValue) throw new ApiError(401, 'locked', 'Enter the room PIN to make changes');
  if (claims.x < Date.now()) throw new ApiError(401, 'locked', 'Editing timed out. Enter the PIN again.');
  const pinRec = await getStore().get<PinRecord>(`pin:${roomIdValue}`);
  if (!pinRec || pinRec.epoch !== claims.e) throw new ApiError(401, 'locked', 'The PIN changed. Enter the new PIN.');
}

// ---------------------------------------------------------------------------
// Layout and theme

export async function saveLayout(roomIdValue: string, token: string | undefined, layout: PropPlacement[], theme: RoomTheme, expectedRev: number): Promise<RoomPublic> {
  await requireEdit(token, roomIdValue);
  const store = getStore();
  const content = (await store.get<RoomContent>(`content:${roomIdValue}`)) ?? EMPTY_CONTENT;
  const problem = layoutProblem(layout, { kind: 'main', exhibits: exhibitsIn(publishedContent(content), 'main') });
  if (problem) throw new ApiError(400, 'bad_layout', problem);
  const cur = await loadRoom(roomIdValue);
  if (cur.rev !== expectedRev) throw new ApiError(409, 'conflict', 'This room was rearranged somewhere else', { room: publicRoom(cur, content) });
  const next: RoomRecord = { ...cur, layout, theme, rev: cur.rev + 1, updatedAt: Date.now() };
  const r = await store.cas(`room:${roomIdValue}`, cur.rev, next);
  if (!r.ok) {
    const latest = r.current && r.current.status === 'active' ? publicRoom(r.current, content) : undefined;
    throw new ApiError(409, 'conflict', 'This room was rearranged somewhere else', { room: latest });
  }
  await log(roomIdValue, 'owner', `Arranged ${layout.length} toys`);
  return publicRoom(next, content);
}

// ---------------------------------------------------------------------------
// Rename

/**
 * Applies a new owner label to the room linked to a verified PIN. Only that
 * room's records change; other rooms with the same name are never searched.
 */
export async function renameOwner(roomIdValue: string, pin: string, rawName: string, ip: string): Promise<{ room: RoomPublic; changed: string[] }> {
  const name = cleanName(rawName);
  if (!name) throw new ApiError(400, 'bad_name', 'Pick a different name');
  await loadRoom(roomIdValue);
  await checkPin(roomIdValue, pin, ip);
  let before = '';
  const rec = await updateRoom(roomIdValue, (r) => {
    before = r.ownerName;
    if (r.ownerName === name) return null;
    r.ownerName = name;
    return r;
  });
  const changed: string[] = [];
  if (before !== name) {
    changed.push(`Room ${rec.slot + 1} owner label`);
    await log(roomIdValue, 'owner', `Renamed from ${before} to ${name}`);
  }
  const content = await getStore().get<RoomContent>(`content:${roomIdValue}`);
  return { room: publicRoom(rec, content), changed };
}

// ---------------------------------------------------------------------------
// Sketchbook

export async function loadPages(roomIdValue: string): Promise<(Page & { removed?: boolean })[]> {
  const store = getStore();
  const ids = await store.zrange(`pages:${roomIdValue}`, 0, -1);
  const pages = await store.mget<Page & { removed?: boolean }>(ids.map((p) => `page:${roomIdValue}:${p}`));
  const metas = await store.mget<PageMeta>(ids.map((p) => `pagemeta:${roomIdValue}:${p}`));
  const out: (Page & { removed?: boolean })[] = [];
  pages.forEach((p, i) => {
    if (p) out.push({ ...p, status: metas[i]?.status ?? 'requested' });
  });
  return out.sort((a, b) => a.n - b.n);
}

/** Anyone visiting a room may read its sketchbook. Pages the creator removed stay hidden. */
export async function listPages(roomIdValue: string): Promise<Page[]> {
  await loadRoom(roomIdValue);
  return (await loadPages(roomIdValue)).filter((p) => !p.removed).map(stripRemoved);
}

function stripRemoved(p: Page & { removed?: boolean }): Page {
  const { removed: _removed, ...rest } = p;
  return rest;
}

export async function createPage(roomIdValue: string, token: string | undefined, text: string, sketch: Stroke[], ip: string): Promise<Page> {
  await requireEdit(token, roomIdValue);
  await loadRoom(roomIdValue);
  const store = getStore();
  if ((await store.zcard(`pages:${roomIdValue}`)) >= MAX_PAGES) throw new ApiError(400, 'full', 'This sketchbook is full. Edit an older page instead.');
  await limit(`newpage:${roomIdValue}`, 40, 24 * 3600, 'That is a lot of new pages for one day. Try again tomorrow.');
  await limit(`write-ip:${ip}`, 120, 60, 'Slow down a little');
  const n = await store.incr(`pageseq:${roomIdValue}`);
  const now = Date.now();
  const page: Page = { id: newId(), n, text, sketch, createdAt: now, updatedAt: now, rev: 1, status: 'requested' };
  const { status: _status, ...stored } = page;
  await store.set(`page:${roomIdValue}:${page.id}`, stored);
  await store.set(`pagemeta:${roomIdValue}:${page.id}`, { status: 'requested', seenRev: 0 } satisfies PageMeta);
  await store.zadd(`pages:${roomIdValue}`, n, page.id);
  await store.zadd('feed', now, `${roomIdValue}/${page.id}`);
  await log(roomIdValue, 'owner', `Wrote page ${n}`);
  return page;
}

export async function updatePage(
  roomIdValue: string,
  token: string | undefined,
  pageIdValue: string,
  text: string,
  sketch: Stroke[],
  expectedRev: number,
  ip: string,
): Promise<Page> {
  await requireEdit(token, roomIdValue);
  await loadRoom(roomIdValue);
  await limit(`write-ip:${ip}`, 120, 60, 'Slow down a little');
  const store = getStore();
  const key = `page:${roomIdValue}:${pageIdValue}`;
  const cur = await store.get<Page & { removed?: boolean }>(key);
  if (!cur || cur.removed) throw new ApiError(404, 'no_page', 'That page is gone');
  const meta = (await store.get<PageMeta>(`pagemeta:${roomIdValue}:${pageIdValue}`)) ?? { status: 'requested' as const, seenRev: 0 };
  if (cur.rev !== expectedRev) throw new ApiError(409, 'conflict', 'This page was changed somewhere else', { page: { ...cur, status: meta.status } });
  const now = Date.now();
  const next = { id: cur.id, n: cur.n, text, sketch, createdAt: cur.createdAt, updatedAt: now, rev: cur.rev + 1 };
  const r = await store.cas(key, cur.rev, next);
  if (!r.ok) throw new ApiError(409, 'conflict', 'This page was changed somewhere else', { page: r.current ? { ...r.current, status: meta.status } : undefined });
  await store.lpush(`pagehist:${roomIdValue}:${pageIdValue}`, { ...cur, savedAt: now, by: 'owner' }, 25);
  await store.zadd('feed', now, `${roomIdValue}/${pageIdValue}`);
  await log(roomIdValue, 'owner', `Revised page ${cur.n}`);
  return { ...next, status: meta.status };
}
