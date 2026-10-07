// Best laps on kart tracks and play credits in casinos.
//
// Keys (under keyPrefix()):
//   lap:<roomId>:<areaId>          sorted set, browser key -> best lap ms
//   casino:<roomId>:<areaId>:<bk>  CasinoStats (CAS on rev)
//   casinoboard:<roomId>:<areaId>  sorted set, browser key -> balance
//   galaxy:<roomId>:<areaId>       sorted set, browser key -> best frenzy score
//   bj:<roomId>:<areaId>:<bk>      the player's blackjack hand and shoe
//   modeboard:<roomId>:<areaId>:<mode>  sorted set, browser key -> best on that world board
//   scorename:<bk>                 the name boards show for that browser
//
// Players are anonymous browsers, so scores follow the browser's current
// name. The casino decides every spin here; the browser only animates it.

import { randomBytes, randomInt } from 'node:crypto';
import { EMPTY_CONTENT, GALAXY_MAX_SCORE, cleanName, publishedContent, type Area, type RoomContent } from '../src/shared/model.js';
import { BETS, REEL_STRIP, START_CREDITS, freshStats, payout, pushHistory, type CasinoStats, type SlotSymbol } from '../src/shared/slots.js';
import { handValue, isBlackjack, newShoe, rouletteReturn, settle, type BjResult, type BjView, type Card, type RouletteBet } from '../src/shared/casino-games.js';
import { minLapMs } from '../src/shared/track.js';
import { MAX_LOG, SCORE_MODES, beats, scoreMode, scoreProblem } from '../src/shared/score-modes.js';
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
  const z = `casinoboard:${roomId}:${areaId}`;
  const top = await rows(z, await store.zrevrange(z, 0, BOARD_SIZE - 1), me);
  const stats = me ? await store.get<CasinoStats>(`casino:${roomId}:${areaId}:${me}`) : null;
  const bj = me ? await store.get<BjState>(`bj:${roomId}:${areaId}:${me}`) : null;
  return { kind: 'casino' as const, board: top, stats: stats ?? freshStats(Date.now()), blackjack: bj ? bjView(bj) : null };
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
  const modes = [...new Set(Object.values(SCORE_MODES).flatMap((list) => list.map((m) => m.id)))];
  await store.del(
    `lap:${roomId}:${areaId}`,
    `galaxy:${roomId}:${areaId}`,
    `casinoboard:${roomId}:${areaId}`,
    ...ids.map((id) => `casino:${roomId}:${areaId}:${id}`),
    ...modes.map((m) => `modeboard:${roomId}:${areaId}:${m}`),
    ...(await kartKeys(roomId, areaId)),
  );
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Roulette

export async function roulette(roomId: string, areaId: string, browserId: string, name: string, bet: number, pick: RouletteBet) {
  await experienceArea(roomId, areaId, 'casino');
  if (!(BETS as readonly number[]).includes(bet)) throw new ApiError(400, 'bad_bet', 'Pick one of the bets on the table');
  if (pick.type === 'number' && (!Number.isInteger(pick.number) || pick.number! < 0 || pick.number! > 36)) throw new ApiError(400, 'bad_pick', 'Pick a number from 0 to 36');
  const key = browserKey(browserId);
  await limit(`spin:${key}`, 90, 60, 'The wheel needs a moment');
  let pocket = 0;
  let win = 0;
  const stats = await updateStats(roomId, areaId, key, (s) => {
    if (s.balance < bet) throw new ApiError(400, 'broke', s.balance < BETS[0] ? 'Out of credits. Take a free refill.' : 'Not enough credits for that bet');
    pocket = randomInt(37);
    win = rouletteReturn(pick, pocket) * bet;
    s.balance += win - bet;
    s.spent += bet;
    s.earned += win;
    s.spins += 1;
    s.biggestWin = Math.max(s.biggestWin, win);
    s.history = pushHistory(s.history, Date.now(), s.balance);
    return s;
  });
  await rememberName(key, name);
  return { pocket, win, stats };
}

// ---------------------------------------------------------------------------
// Blackjack

interface BjState {
  rev: number;
  shoe: Card[];
  player: Card[];
  dealer: Card[];
  bet: number;
  doubled: boolean;
  phase: 'idle' | 'player' | 'done';
  result: BjResult | null;
  payout: number;
}

function bjView(b: BjState): BjView {
  return {
    phase: b.phase,
    player: b.player,
    dealer: b.phase === 'player' ? [b.dealer[0], '??'] : b.dealer,
    bet: b.bet,
    doubled: b.doubled,
    result: b.result,
    payout: b.payout,
  };
}

function draw(b: BjState): Card {
  if (b.shoe.length < 20) b.shoe = newShoe(6, randomInt);
  return b.shoe.pop()!;
}

async function loadBj(roomId: string, areaId: string, key: string): Promise<BjState> {
  return (await getStore().get<BjState>(`bj:${roomId}:${areaId}:${key}`)) ?? { rev: 0, shoe: [], player: [], dealer: [], bet: 0, doubled: false, phase: 'idle', result: null, payout: 0 };
}

async function saveBj(roomId: string, areaId: string, key: string, b: BjState, expectedRev: number): Promise<void> {
  const next = { ...b, rev: expectedRev + 1 };
  const r = await getStore().cas(`bj:${roomId}:${areaId}:${key}`, expectedRev, next);
  if (!r.ok) throw new ApiError(409, 'busy', 'That hand changed. Try again.');
  b.rev = next.rev;
}

/** Plays out the dealer and pays the hand. */
async function finish(roomId: string, areaId: string, key: string, b: BjState): Promise<CasinoStats> {
  if (handValue(b.player).total <= 21 && !isBlackjack(b.player)) {
    while (handValue(b.dealer).total < 17) b.dealer.push(draw(b));
  }
  const stake = b.bet * (b.doubled ? 2 : 1);
  const { result, payout } = settle(b.player, b.dealer, stake);
  b.phase = 'done';
  b.result = result;
  b.payout = payout;
  return updateStats(roomId, areaId, key, (s) => {
    s.balance += payout;
    s.earned += payout;
    s.biggestWin = Math.max(s.biggestWin, payout);
    s.history = pushHistory(s.history, Date.now(), s.balance);
    return s;
  });
}

export async function blackjack(roomId: string, areaId: string, browserId: string, name: string, move: 'deal' | 'hit' | 'stand' | 'double', bet?: number) {
  await experienceArea(roomId, areaId, 'casino');
  const key = browserKey(browserId);
  await limit(`spin:${key}`, 90, 60, 'The dealer needs a moment');
  const b = await loadBj(roomId, areaId, key);
  const rev = b.rev;
  let stats: CasinoStats | null = null;
  if (move === 'deal') {
    if (b.phase === 'player') throw new ApiError(409, 'in_hand', 'Finish this hand first');
    if (!bet || !(BETS as readonly number[]).includes(bet)) throw new ApiError(400, 'bad_bet', 'Pick one of the bets on the table');
    stats = await updateStats(roomId, areaId, key, (s) => {
      if (s.balance < bet) throw new ApiError(400, 'broke', s.balance < BETS[0] ? 'Out of credits. Take a free refill.' : 'Not enough credits for that bet');
      s.balance -= bet;
      s.spent += bet;
      s.spins += 1;
      s.history = pushHistory(s.history, Date.now(), s.balance);
      return s;
    });
    Object.assign(b, { player: [], dealer: [], bet, doubled: false, phase: 'player', result: null, payout: 0 });
    b.player.push(draw(b));
    b.dealer.push(draw(b));
    b.player.push(draw(b));
    b.dealer.push(draw(b));
    if (isBlackjack(b.player) || isBlackjack(b.dealer)) stats = await finish(roomId, areaId, key, b);
  } else {
    if (b.phase !== 'player') throw new ApiError(409, 'no_hand', 'Deal a new hand first');
    if (move === 'hit') {
      b.player.push(draw(b));
      if (handValue(b.player).total >= 21) stats = await finish(roomId, areaId, key, b);
    } else if (move === 'stand') {
      stats = await finish(roomId, areaId, key, b);
    } else {
      if (b.player.length !== 2) throw new ApiError(400, 'no_double', 'You can only double on your first two cards');
      stats = await updateStats(roomId, areaId, key, (s) => {
        if (s.balance < b.bet) throw new ApiError(400, 'broke', 'Not enough credits to double');
        s.balance -= b.bet;
        s.spent += b.bet;
        s.history = pushHistory(s.history, Date.now(), s.balance);
        return s;
      });
      b.doubled = true;
      b.player.push(draw(b));
      stats = await finish(roomId, areaId, key, b);
    }
  }
  await saveBj(roomId, areaId, key, b, rev);
  await rememberName(key, name);
  stats ??= (await getStore().get<CasinoStats>(`casino:${roomId}:${areaId}:${key}`)) ?? freshStats(Date.now());
  return { hand: bjView(b), stats };
}
