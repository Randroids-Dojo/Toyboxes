// Best laps on kart tracks and play credits in casinos.
//
// Keys (under keyPrefix()):
//   lap:<roomId>:<areaId>          sorted set, browser key -> best lap ms
//   galaxy:<roomId>:<areaId>       sorted set, browser key -> best frenzy score
//   modeboard:<roomId>:<areaId>:<mode>  sorted set, browser key -> best on that world board
//   scorename:<bk>                 the name boards show for that browser
//
// Players are anonymous browsers, so scores follow the browser's current
// name. The casino lives in server/casino.ts; its first actions (spin,
// refill, roulette, blackjack) are re-exported here for older browser tabs.

import { randomBytes } from 'node:crypto';
import { EMPTY_CONTENT, GALAXY_MAX_SCORE, cleanName, publishedContent, type Area, type RoomContent } from '../src/shared/model.js';
import type { RouletteBet } from '../src/shared/casino-games.js';
import { minLapMs } from '../src/shared/track.js';
import { MAX_LOG, SCORE_MODES, beats, scoreMode, scoreProblem } from '../src/shared/score-modes.js';
import { clearCasino, legacyBlackjack, legacyBoard, legacyRoulette, legacySpin, refill as casinoRefill } from './casino.js';
import { browserKey } from './crypto.js';
import { kartKeys } from './kart.js';
import { ApiError, limit } from './http.js';
import { loadRoom } from './rooms.js';
import { getStore } from './store.js';

export const BOARD_SIZE = 10;

export interface BoardRow {
  name: string;
  value: number;
  you: boolean;
}

async function experienceArea(roomId: string, areaId: string, kind: 'kart' | 'casino' | 'galaxy'): Promise<Area> {
  await loadRoom(roomId);
  const content = (await getStore().get<RoomContent>(`content:${roomId}`)) ?? EMPTY_CONTENT;
  const area = publishedContent(content).areas.find((a) => a.id === areaId);
  if (!area || area.experience?.kind !== kind) throw new ApiError(404, 'no_area', 'That place is closed');
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
  if (area.experience.kind === 'galaxy') {
    const z = `galaxy:${roomId}:${areaId}`;
    const top = await rows(z, await store.zrevrange(z, 0, BOARD_SIZE - 1), me);
    const best = me ? await store.zscore(z, me) : null;
    return { kind: 'galaxy' as const, board: top, best };
  }
  if (area.experience.kind === 'kart') {
    const z = `lap:${roomId}:${areaId}`;
    const top = await rows(z, await store.zrange(z, 0, BOARD_SIZE - 1), me);
    const best = me ? await store.zscore(z, me) : null;
    return { kind: 'kart' as const, board: top, best };
  }
  return legacyBoard(roomId, areaId, browserId);
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

/** A feeding frenzy result: keeps each player's best. */
export async function recordFrenzy(roomId: string, areaId: string, browserId: string, name: string, score: number) {
  await experienceArea(roomId, areaId, 'galaxy');
  const key = browserKey(browserId);
  await limit(`frenzy:${key}`, 10, 60, 'Too many rounds at once');
  if (!Number.isInteger(score) || score < 0 || score > GALAXY_MAX_SCORE) throw new ApiError(400, 'bad_score', 'That score does not look right');
  const store = getStore();
  const z = `galaxy:${roomId}:${areaId}`;
  const before = await store.zscore(z, key);
  const improved = before === null || score > before;
  if (improved) await store.zadd(z, score, key);
  await rememberName(key, name);
  return { best: improved ? score : before!, improved };
}

async function publishedArea(roomId: string, areaId: string): Promise<Area & { experience: NonNullable<Area['experience']> }> {
  await loadRoom(roomId);
  const content = (await getStore().get<RoomContent>(`content:${roomId}`)) ?? EMPTY_CONTENT;
  const area = publishedContent(content).areas.find((a) => a.id === areaId);
  if (!area?.experience) throw new ApiError(404, 'no_area', 'That place is closed');
  return area as Area & { experience: NonNullable<Area['experience']> };
}

interface RunTicket {
  roomId: string;
  areaId: string;
  mode: string;
  key: string;
  at: number;
}

/** Starts a timed run on a board that needs tickets. */
export async function startRun(roomId: string, areaId: string, browserId: string, modeId: string) {
  const area = await publishedArea(roomId, areaId);
  const mode = scoreMode(area.experience.kind, modeId);
  if (!mode?.ticket) throw new ApiError(400, 'bad_mode', 'There is no timed board for that here');
  const key = browserKey(browserId);
  await limit(`runstart:${key}`, 30, 60, 'Too many runs at once');
  const ticket = randomBytes(16).toString('base64url');
  const run: RunTicket = { roomId, areaId, mode: mode.id, key, at: Date.now() };
  await getStore().set(`run:${ticket}`, run, { ex: 3 * 60 * 60 });
  return { ticket };
}

/** A result on one of a world's boards (src/shared/score-modes.ts): keeps each player's best. */
export async function recordScore(roomId: string, areaId: string, browserId: string, name: string, modeId: string, posted: number, opts: { ticket?: string; log?: unknown } = {}) {
  const area = await publishedArea(roomId, areaId);
  const mode = scoreMode(area.experience.kind, modeId);
  if (!mode) throw new ApiError(400, 'bad_mode', 'There is no board for that here');
  const key = browserKey(browserId);
  await limit(`score:${key}`, 30, 60, 'Too many results at once');
  if (mode.ticket) {
    const run = opts.ticket ? await getStore().get<RunTicket>(`run:${opts.ticket}`) : null;
    if (!run || run.roomId !== roomId || run.areaId !== areaId || run.mode !== mode.id || run.key !== key) throw new ApiError(400, 'bad_ticket', 'That run was not started here');
    await getStore().del(`run:${opts.ticket}`);
    if (Date.now() - run.at < mode.ticket.minMs) throw new ApiError(400, 'bad_score', 'That run was too quick');
  }
  let value = posted;
  if (mode.fromLog) {
    if (opts.log === undefined || JSON.stringify(opts.log).length > MAX_LOG) throw new ApiError(400, 'bad_log', 'That run log is missing or too long');
    let computed: number | null = null;
    try {
      computed = mode.fromLog(opts.log);
    } catch {
      computed = null;
    }
    if (computed === null) throw new ApiError(400, 'bad_score', 'That run does not add up');
    value = computed;
  }
  const problem = scoreProblem(mode, value);
  if (problem) throw new ApiError(400, 'bad_score', problem);
  const store = getStore();
  const z = `modeboard:${roomId}:${areaId}:${mode.id}`;
  const before = await store.zscore(z, key);
  const improved = beats(mode, value, before);
  if (improved) await store.zadd(z, value, key);
  await rememberName(key, name);
  const best = improved ? value : before!;
  const top = mode.better === 'higher' ? await store.zrevrange(z, 0, BOARD_SIZE - 1) : await store.zrange(z, 0, BOARD_SIZE - 1);
  const rank = top.indexOf(key);
  return { best, improved, rank: rank >= 0 ? rank + 1 : null };
}

/** Several of a world's boards at once, with this browser's bests. */
export async function modeBoards(roomId: string, areaId: string, modeIds: string[], browserId: string | undefined) {
  const area = await publishedArea(roomId, areaId);
  const store = getStore();
  const me = browserId ? browserKey(browserId) : '';
  const boards: Record<string, { board: BoardRow[]; best: number | null }> = {};
  for (const id of modeIds.slice(0, 12)) {
    const mode = scoreMode(area.experience.kind, id);
    if (!mode) continue;
    const z = `modeboard:${roomId}:${areaId}:${mode.id}`;
    const ids = mode.better === 'higher' ? await store.zrevrange(z, 0, BOARD_SIZE - 1) : await store.zrange(z, 0, BOARD_SIZE - 1);
    boards[mode.id] = { board: await rows(z, ids, me), best: me ? await store.zscore(z, me) : null };
  }
  return { kind: 'modes' as const, boards };
}

// The first casino's actions, kept for browser tabs opened before the boat.
export const spin = (roomId: string, areaId: string, browserId: string, name: string, bet: number) => legacySpin({ roomId, areaId, browserId, name }, bet);
export const refill = (roomId: string, areaId: string, browserId: string, name: string) => casinoRefill({ roomId, areaId, browserId, name }).then((r) => ({ stats: r.stats }));
export const roulette = (roomId: string, areaId: string, browserId: string, name: string, bet: number, pick: RouletteBet) => legacyRoulette({ roomId, areaId, browserId, name }, bet, pick);
export const blackjack = (roomId: string, areaId: string, browserId: string, name: string, move: 'deal' | 'hit' | 'stand' | 'double', bet?: number) => legacyBlackjack({ roomId, areaId, browserId, name }, move, bet);

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
  await clearCasino(roomId, areaId);
  const modes = [...new Set(Object.values(SCORE_MODES).flatMap((list) => list.map((m) => m.id)))];
  await store.del(
    `lap:${roomId}:${areaId}`,
    `galaxy:${roomId}:${areaId}`,
    ...modes.map((m) => `modeboard:${roomId}:${areaId}:${m}`),
    ...(await kartKeys(roomId, areaId)),
  );
  return { ok: true };
}
