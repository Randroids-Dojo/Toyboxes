// Best laps on kart tracks and play credits in casinos.
//
// Keys (under keyPrefix()):
//   lap:<roomId>:<areaId>          sorted set, browser key -> best lap ms
//   casino:<roomId>:<areaId>:<bk>  CasinoStats (CAS on rev)
//   casinoboard:<roomId>:<areaId>  sorted set, browser key -> balance
//   scorename:<bk>                 the name boards show for that browser
//
// Players are anonymous browsers, so scores follow the browser's current
// name. The casino decides every spin here; the browser only animates it.

import { randomInt } from 'node:crypto';
import { EMPTY_CONTENT, cleanName, publishedContent, type Area, type RoomContent } from '../src/shared/model.js';
import { BETS, REEL_STRIP, START_CREDITS, freshStats, payout, pushHistory, type CasinoStats, type SlotSymbol } from '../src/shared/slots.js';
import { minLapMs } from '../src/shared/track.js';
import { browserKey } from './crypto.js';
import { ApiError, limit } from './http.js';
import { loadRoom } from './rooms.js';
import { getStore } from './store.js';

export const BOARD_SIZE = 10;

export interface BoardRow {
  name: string;
  value: number;
  you: boolean;
}

async function experienceArea(roomId: string, areaId: string, kind: 'kart' | 'casino'): Promise<Area> {
  await loadRoom(roomId);
  const content = (await getStore().get<RoomContent>(`content:${roomId}`)) ?? EMPTY_CONTENT;
  const area = publishedContent(content).areas.find((a) => a.id === areaId);
  if (!area || area.experience?.kind !== kind) throw new ApiError(404, 'no_area', kind === 'kart' ? 'That track is closed' : 'That casino is closed');
  return area;
}

async function rememberName(key: string, raw: string): Promise<void> {
  const name = cleanName(raw) ?? 'Player';
  await getStore().set(`scorename:${key}`, name);
}

async function rows(zkey: string, ids: string[], me: string): Promise<BoardRow[]> {
  const store = getStore();
  const names = await store.mget<string>(ids.map((id) => `scorename:${id}`));
  const values = await Promise.all(ids.map((id) => store.zscore(zkey, id)));
  return ids.map((id, i) => ({ name: names[i] ?? 'Player', value: values[i] ?? 0, you: id === me }));
}

export async function board(roomId: string, areaId: string, browserId: string | undefined) {
  const store = getStore();
  const me = browserId ? browserKey(browserId) : '';
  const content = (await store.get<RoomContent>(`content:${roomId}`)) ?? EMPTY_CONTENT;
  const area = publishedContent(content).areas.find((a) => a.id === areaId);
  if (!area?.experience) throw new ApiError(404, 'no_area', 'Nothing to score here');
  if (area.experience.kind === 'kart') {
    const z = `lap:${roomId}:${areaId}`;
    const top = await rows(z, await store.zrange(z, 0, BOARD_SIZE - 1), me);
    const best = me ? await store.zscore(z, me) : null;
    return { kind: 'kart' as const, board: top, best };
  }
  const z = `casinoboard:${roomId}:${areaId}`;
  const top = await rows(z, await store.zrevrange(z, 0, BOARD_SIZE - 1), me);
  const stats = me ? await store.get<CasinoStats>(`casino:${roomId}:${areaId}:${me}`) : null;
  return { kind: 'casino' as const, board: top, stats: stats ?? freshStats(Date.now()) };
}

export async function recordLap(roomId: string, areaId: string, browserId: string, name: string, ms: number) {
  const area = await experienceArea(roomId, areaId, 'kart');
  if (area.experience?.kind !== 'kart') throw new ApiError(404, 'no_area', 'That track is closed');
  const key = browserKey(browserId);
  await limit(`lap:${key}`, 40, 60, 'Too many laps at once');
  if (!Number.isInteger(ms) || ms < minLapMs(area.experience.track) || ms > 10 * 60 * 1000) throw new ApiError(400, 'bad_lap', 'That lap time does not look right');
  const store = getStore();
  const z = `lap:${roomId}:${areaId}`;
  const before = await store.zscore(z, key);
  const improved = before === null || ms < before;
  if (improved) await store.zadd(z, ms, key);
  await rememberName(key, name);
  return { best: improved ? ms : before!, improved };
}

async function updateStats(roomId: string, areaId: string, key: string, fn: (s: CasinoStats) => CasinoStats): Promise<CasinoStats> {
  const store = getStore();
  const k = `casino:${roomId}:${areaId}:${key}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = (await store.get<CasinoStats>(k)) ?? freshStats(Date.now());
    const next = fn(structuredClone(cur));
    next.rev = cur.rev + 1;
    if ((await store.cas(k, cur.rev, next)).ok) {
      await store.zadd(`casinoboard:${roomId}:${areaId}`, next.balance, key);
      return next;
    }
  }
  throw new ApiError(409, 'busy', 'Too many spins at once. Try again.');
}

export async function spin(roomId: string, areaId: string, browserId: string, name: string, bet: number) {
  await experienceArea(roomId, areaId, 'casino');
  if (!(BETS as readonly number[]).includes(bet)) throw new ApiError(400, 'bad_bet', 'Pick one of the bets on the machine');
  const key = browserKey(browserId);
  await limit(`spin:${key}`, 90, 60, 'The machine needs a moment');
  let result: { stops: number[]; line: SlotSymbol[]; rule: string | null; win: number } | null = null;
  const stats = await updateStats(roomId, areaId, key, (s) => {
    if (s.balance < bet) throw new ApiError(400, 'broke', s.balance < BETS[0] ? 'Out of credits. Take a free refill.' : 'Not enough credits for that bet');
    const stops = [randomInt(REEL_STRIP.length), randomInt(REEL_STRIP.length), randomInt(REEL_STRIP.length)];
    const line = stops.map((i) => REEL_STRIP[i]);
    const { rule, win } = payout(line, bet);
    result = { stops, line, rule, win };
    const now = Date.now();
    s.balance += win - bet;
    s.spent += bet;
    s.earned += win;
    s.spins += 1;
    s.biggestWin = Math.max(s.biggestWin, win);
    s.history = pushHistory(s.history, now, s.balance);
    return s;
  });
  await rememberName(key, name);
  return { ...result!, stats };
}

export async function refill(roomId: string, areaId: string, browserId: string, name: string) {
  await experienceArea(roomId, areaId, 'casino');
  const key = browserKey(browserId);
  await limit(`refill:${key}`, 10, 60, 'Slow down a little');
  const stats = await updateStats(roomId, areaId, key, (s) => {
    if (s.balance >= BETS[0]) throw new ApiError(400, 'not_broke', 'Refills are for when you run out');
    s.balance = START_CREDITS;
    s.refills += 1;
    s.history = pushHistory(s.history, Date.now(), s.balance);
    return s;
  });
  await rememberName(key, name);
  return { stats };
}

/** Boards show this browser under its new name. */
export async function renameScores(browserId: string, name: string) {
  const clean = cleanName(name);
  if (!clean) throw new ApiError(400, 'bad_name', 'Pick a different name');
  await getStore().set(`scorename:${browserKey(browserId)}`, clean);
  return { ok: true };
}

/** Creator tool: wipe a track's laps or a casino's credits. */
export async function clearScores(roomId: string, areaId: string) {
  const store = getStore();
  const ids = await store.zrange(`casinoboard:${roomId}:${areaId}`, 0, -1);
  await store.del(`lap:${roomId}:${areaId}`, `casinoboard:${roomId}:${areaId}`, ...ids.map((id) => `casino:${roomId}:${areaId}:${id}`));
  return { ok: true };
}
