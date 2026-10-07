// The Golden Paddle: every casino outcome is decided here; the browser only
// animates it. One record per player and casino holds the balance, the
// logbook tallies and stamps, and the open blackjack and poker hands, so
// every play is one compare-and-set write.
//
// Keys (under keyPrefix()):
//   casino:<roomId>:<areaId>:<bk>     the player's record (CasinoStats v2 plus private hands)
//   casinoboard:<roomId>:<areaId>     sorted set, browser key -> balance
//   casinowin:<roomId>:<areaId>       sorted set, browser key -> biggest single payout
//   casinostamps:<roomId>:<areaId>    sorted set, browser key -> stamps
//   casinocapt:<roomId>:<areaId>      sorted set, browser key -> stamps, Captains only
//   casinospins:<roomId>:<areaId>     Old Lucky spins by anyone (grows the GRAND)
//   casinojp:<roomId>:<areaId>        { rev, grandAt }: the spin count when the GRAND last went
//   casinofame:<roomId>:<areaId>      list of MAJOR and GRAND wins, newest first (20)
//   bj:<roomId>:<areaId>:<bk>         the first casino's blackjack hand (read once, then moved into the record)
//   scorename:<bk>                    the name boards show for that browser

import { randomInt } from 'node:crypto';
import { EMPTY_CONTENT, cleanName, publishedContent, type RoomContent } from '../src/shared/model.js';
import { BETS, BONUS_RING, LEGACY_STRIP, REEL_STRIP, START_CREDITS, grandMultiplier, legacyPayout, lineRule, payout, ringMultiplier, type CasinoStats, type RingSegment, type SlotSymbol } from '../src/shared/slots.js';
import { ROULETTE_MAX_BETS, newShoe, rouletteBoardReturn, rouletteKey, type BjView, type Card, type RouletteBet, type RouletteChip, type RouletteType } from '../src/shared/casino-games.js';
import { BJ_DECKS, applyMove, followsBook, legalMoves, roundTotals, roundView, startRound, type BjMove, type BjRound, type BjRoundView, type BjTable } from '../src/shared/casino/blackjack.js';
import { POKER_PAYTABLE, evaluate, newDeck, payMultiple, type PokerHandRank } from '../src/shared/casino/poker.js';
import { WHEEL_INFO, WHEEL_MAX_BETS, WHEEL_SEGMENTS, wheelReturn, type WheelSymbol } from '../src/shared/casino/wheel.js';
import { FALLS_BINS, FALLS_ROWS, fallsBin, fallsWin, type FallsRisk } from '../src/shared/casino/plinko.js';
import { awardStamps, betAllowed, canPlay, rankOf, stackAllowed, tableMax, type GameId, type PlayEvent } from '../src/shared/casino/progress.js';
import { VOYAGE_ID, acceptDay, applyMovement, applyRefill, settleStreak, upgradeStats, type PlayContext } from '../src/shared/casino/stats.js';
import { browserKey } from './crypto.js';
import { ApiError, limit } from './http.js';
import { loadRoom } from './rooms.js';
import { getStore } from './store.js';

export const BOARD_SIZE = 10;
export const FAME_SIZE = 20;
/** Plays a minute per browser, across every game. */
export const PLAYS_PER_MINUTE = 120;

export interface BoardRow {
  name: string;
  value: number;
  you: boolean;
}

export interface FameEntry {
  name: string;
  jackpot: 'MAJOR' | 'GRAND';
  mult: number;
  credits: number;
  at: number;
}

interface BjState {
  shoe: Card[];
  round: BjRound | null;
}

interface PokerState {
  deck: Card[];
  hand: Card[];
  bet: number;
  phase: 'deal' | 'done';
  holds: boolean[];
  rank: PokerHandRank | null;
  win: number;
}

/** What the store holds: the public record plus the hands, which never leave the server as is. */
type Stored = CasinoStats & { tables?: { bj?: BjState; captain?: BjState; poker?: PokerState } };

export interface PokerView {
  phase: 'idle' | 'deal' | 'done';
  hand: Card[];
  bet: number;
  holds: boolean[];
  rank: PokerHandRank | null;
  win: number;
}

/** Who is playing, and where. */
export interface Seat {
  roomId: string;
  areaId: string;
  browserId: string;
  name: string;
  /** The visit this play belongs to (made by the browser on entry). */
  voyage?: string;
  /** The player's local date, YYYY-MM-DD. */
  day?: string;
}

const K = {
  stats: (r: string, a: string, k: string) => `casino:${r}:${a}:${k}`,
  board: (r: string, a: string) => `casinoboard:${r}:${a}`,
  wins: (r: string, a: string) => `casinowin:${r}:${a}`,
  stamps: (r: string, a: string) => `casinostamps:${r}:${a}`,
  capt: (r: string, a: string) => `casinocapt:${r}:${a}`,
  spins: (r: string, a: string) => `casinospins:${r}:${a}`,
  jp: (r: string, a: string) => `casinojp:${r}:${a}`,
  fame: (r: string, a: string) => `casinofame:${r}:${a}`,
  oldBj: (r: string, a: string, k: string) => `bj:${r}:${a}:${k}`,
};

async function casinoArea(roomId: string, areaId: string): Promise<void> {
  await loadRoom(roomId);
  const content = (await getStore().get<RoomContent>(`content:${roomId}`)) ?? EMPTY_CONTENT;
  const area = publishedContent(content).areas.find((a) => a.id === areaId);
  if (!area || area.experience?.kind !== 'casino') throw new ApiError(404, 'no_area', 'That place is closed');
}

async function rememberName(key: string, raw: string): Promise<void> {
  await getStore().set(`scorename:${key}`, cleanName(raw) ?? 'Player');
}

async function rows(zkey: string, ids: string[], me: string): Promise<BoardRow[]> {
  const store = getStore();
  if (!ids.length) return [];
  const names = await store.mget<string>(ids.map((id) => `scorename:${id}`));
  const values = await Promise.all(ids.map((id) => store.zscore(zkey, id)));
  return ids.map((id, i) => ({ name: names[i] ?? 'Player', value: values[i] ?? 0, you: id === me }));
}

/** The record without the private hands. */
export function publicStats(s: Stored): CasinoStats {
  const { tables: _t, ...rest } = s;
  return rest;
}

function pokerView(p: PokerState | undefined): PokerView {
  if (!p) return { phase: 'idle', hand: [], bet: 0, holds: [false, false, false, false, false], rank: null, win: 0 };
  return { phase: p.phase, hand: p.hand, bet: p.bet, holds: p.holds, rank: p.rank, win: p.win };
}

/** The first casino kept the blackjack hand in its own key; this turns it into a round. */
function oldHand(old: { shoe?: Card[]; player?: Card[]; dealer?: Card[]; bet?: number; doubled?: boolean; phase?: string; result?: string | null; payout?: number } | null): BjState | null {
  if (!old) return null;
  const playing = old.phase === 'player';
  if (!playing && old.phase !== 'done') return { shoe: old.shoe ?? [], round: null };
  const round: BjRound = {
    table: 'saloon',
    phase: playing ? 'player' : 'done',
    hands: [{ cards: old.player ?? [], bet: old.bet ?? 0, doubled: !!old.doubled, done: !playing, split: false, result: (old.result as BjRound['hands'][number]['result']) ?? null, payout: old.payout ?? 0 }],
    active: 0,
    dealer: old.dealer ?? [],
  };
  return { shoe: old.shoe ?? [], round };
}

/** Loads a record as version 2, moving in an old blackjack hand if there is one. */
async function loadStored(roomId: string, areaId: string, key: string, now: number): Promise<{ raw: Stored | null; s: Stored; movedBj: boolean }> {
  const store = getStore();
  const raw = await store.get<Stored>(K.stats(roomId, areaId, key));
  const s = upgradeStats(raw, now) as Stored;
  let movedBj = false;
  if (!s.tables?.bj) {
    const migrated = oldHand(await store.get(K.oldBj(roomId, areaId, key)));
    s.tables = { ...(s.tables ?? {}), bj: migrated ?? { shoe: [], round: null } };
    movedBj = !!migrated;
  }
  return { raw, s, movedBj };
}

interface Outcome<T> {
  result: T;
  stats: CasinoStats;
  newStamps: string[];
  rank: number;
  rankUp: boolean;
  stored: Stored;
}

/**
 * Runs `fn` on the player's record inside a compare-and-set loop, then
 * updates the boards. `fn` may run more than once on a conflict, so it must
 * only change the record it is given.
 */
async function withRecord<T>(seat: Seat, fn: (s: Stored, rank: number, c: PlayContext) => { result: T; event: PlayEvent | null }): Promise<Outcome<T>> {
  const store = getStore();
  const key = browserKey(seat.browserId);
  const k = K.stats(seat.roomId, seat.areaId, key);
  for (let attempt = 0; attempt < 5; attempt++) {
    const now = Date.now();
    const { raw, s, movedBj } = await loadStored(seat.roomId, seat.areaId, key, now);
    const before = structuredClone(s);
    const rank = rankOf(s);
    const c: PlayContext = { now, day: acceptDay(seat.day, now), voyage: seat.voyage && VOYAGE_ID.test(seat.voyage) ? seat.voyage : null };
    let out: { result: T; event: PlayEvent | null };
    try {
      out = fn(s, rank, c);
    } catch (e) {
      if (e instanceof Error && e.message === 'broke') throw new ApiError(400, 'broke', s.balance < BETS[0] ? 'Out of credits. Penny will top you up.' : 'Not enough credits for that bet');
      throw e;
    }
    const newStamps = out.event ? awardStamps(s, out.event) : awardStamps(s, null);
    s.rev = (raw?.rev ?? 0) + 1;
    if (!(await store.cas(k, raw?.rev ?? 0, s)).ok) continue;
    if (movedBj) await store.del(K.oldBj(seat.roomId, seat.areaId, key));
    const after = rankOf(s);
    await store.zadd(K.board(seat.roomId, seat.areaId), s.balance, key);
    if (s.biggestWin > before.biggestWin || (s.biggestWin > 0 && raw?.v !== 2)) await store.zadd(K.wins(seat.roomId, seat.areaId), s.biggestWin, key);
    if ((s.stamps?.length ?? 0) !== (before.stamps?.length ?? 0) || raw?.v !== 2) {
      await store.zadd(K.stamps(seat.roomId, seat.areaId), s.stamps?.length ?? 0, key);
      if (after >= 3) await store.zadd(K.capt(seat.roomId, seat.areaId), s.stamps?.length ?? 0, key);
    }
    await rememberName(key, seat.name);
    return { result: out.result, stats: publicStats(s), newStamps, rank: after, rankUp: after > rank, stored: s };
  }
  throw new ApiError(409, 'busy', 'Too many plays at once. Try again.');
}

async function gate(seat: Seat): Promise<void> {
  await casinoArea(seat.roomId, seat.areaId);
  await limit(`casino:${browserKey(seat.browserId)}`, PLAYS_PER_MINUTE, 60, 'The boat needs a moment');
}

function needs(rank: number, game: GameId): void {
  if (!canPlay(rank, game)) throw new ApiError(403, 'locked', 'Collect more stamps to play here');
}

function needBet(rank: number, game: GameId, bet: number): void {
  if (!betAllowed(rank, game, bet)) throw new ApiError(400, 'bad_bet', 'Pick one of the chips on the table');
}

function closedUpTags(closedUp: boolean): string[] {
  return closedUp ? ['shore_leave'] : [];
}

// ---------------------------------------------------------------------------
// Old Lucky

async function jackpotState(roomId: string, areaId: string): Promise<{ spins: number; grandAt: number; rev: number; grand: number }> {
  const store = getStore();
  const spins = (await store.get<number>(K.spins(roomId, areaId))) ?? 0;
  const jp = (await store.get<{ rev: number; grandAt: number }>(K.jp(roomId, areaId))) ?? { rev: 0, grandAt: 0 };
  return { spins, grandAt: jp.grandAt, rev: jp.rev, grand: grandMultiplier(spins - jp.grandAt) };
}

export interface SlotResult {
  stops: number[];
  line: SlotSymbol[];
  rule: string | null;
  win: number;
  bonus: { segment: number; value: RingSegment; mult: number; jackpot: 'MINI' | 'MAJOR' | 'GRAND' | null } | null;
}

export async function slotSpin(seat: Seat, bet: number) {
  await gate(seat);
  const jp = await jackpotState(seat.roomId, seat.areaId);
  const out = await withRecord<SlotResult>(seat, (s, rank, c) => {
    needs(rank, 'slot');
    needBet(rank, 'slot', bet);
    const stops = [randomInt(REEL_STRIP.length), randomInt(REEL_STRIP.length), randomInt(REEL_STRIP.length)];
    const line = stops.map((i) => REEL_STRIP[i]);
    const rule = lineRule(line);
    let win = payout(line, bet).win;
    let bonus: SlotResult['bonus'] = null;
    const tags: string[] = rule ? [rule] : [];
    if (rule === 'bonus') {
      const segment = randomInt(BONUS_RING.length);
      const value = BONUS_RING[segment];
      const mult = ringMultiplier(value, jp.grand);
      win = Math.floor(mult * bet);
      const jackpot = typeof value === 'string' ? value : null;
      bonus = { segment, value, mult, jackpot };
      if (jackpot) tags.push(`jackpot:${jackpot}`);
      if (mult >= 30) tags.push('ring30');
    }
    const { closedUp } = applyMovement(s, { game: 'slot', stake: bet, paid: win, play: true }, c);
    settleStreak(s, 'slot', bet, win);
    return { result: { stops, line, rule, win, bonus }, event: { game: 'slot', staked: bet, paid: win, tags: [...tags, ...closedUpTags(closedUp)] } };
  });
  const store = getStore();
  const spins = await store.incr(K.spins(seat.roomId, seat.areaId));
  const jackpot = out.result.bonus?.jackpot;
  if (jackpot === 'GRAND') {
    // The GRAND starts again from its seed for everyone.
    for (let i = 0; i < 5; i++) {
      const cur = (await store.get<{ rev: number; grandAt: number }>(K.jp(seat.roomId, seat.areaId))) ?? { rev: 0, grandAt: 0 };
      if ((await store.cas(K.jp(seat.roomId, seat.areaId), cur.rev, { rev: cur.rev + 1, grandAt: spins })).ok) break;
    }
  }
  if (jackpot === 'MAJOR' || jackpot === 'GRAND') {
    const entry: FameEntry = { name: cleanName(seat.name) ?? 'Player', jackpot, mult: out.result.bonus!.mult, credits: out.result.win, at: Date.now() };
    await store.lpush(K.fame(seat.roomId, seat.areaId), entry, FAME_SIZE);
  }
  return { ...out.result, stats: out.stats, newStamps: out.newStamps, rank: out.rank, rankUp: out.rankUp, jackpots: await jackpotState(seat.roomId, seat.areaId).then(jackpotView) };
}

function jackpotView(j: { spins: number; grand: number }) {
  return { grand: j.grand, spins: j.spins };
}

/** The first machine's spin, for browser tabs opened before Old Lucky. */
export async function legacySpin(seat: Seat, bet: number) {
  await gate(seat);
  if (!(BETS as readonly number[]).includes(bet)) throw new ApiError(400, 'bad_bet', 'Pick one of the bets on the machine');
  const out = await withRecord(seat, (s, _rank, c) => {
    const stops = [randomInt(LEGACY_STRIP.length), randomInt(LEGACY_STRIP.length), randomInt(LEGACY_STRIP.length)];
    const line = stops.map((i) => LEGACY_STRIP[i]);
    const { rule, win } = legacyPayout(line, bet);
    const { closedUp } = applyMovement(s, { game: 'slot', stake: bet, paid: win, play: true }, c);
    settleStreak(s, 'slot', bet, win);
    return { result: { stops, line, rule, win }, event: { game: 'slot', staked: bet, paid: win, tags: closedUpTags(closedUp) } };
  });
  return { ...out.result, stats: out.stats };
}

// ---------------------------------------------------------------------------
// Refill

export async function refill(seat: Seat) {
  await casinoArea(seat.roomId, seat.areaId);
  await limit(`refill:${browserKey(seat.browserId)}`, 10, 60, 'Slow down a little');
  const out = await withRecord(seat, (s, _rank, c) => {
    if (s.balance >= BETS[0]) throw new ApiError(400, 'not_broke', 'Refills are for when you run out');
    applyRefill(s, c.now);
    return { result: null, event: null };
  });
  return { stats: out.stats, newStamps: out.newStamps, rank: out.rank };
}

// ---------------------------------------------------------------------------
// The Spinning Lily (roulette)

const ROULETTE_TYPES = new Set<RouletteType>(['red', 'black', 'odd', 'even', 'low', 'high', 'dozen1', 'dozen2', 'dozen3', 'col1', 'col2', 'col3', 'number']);

/** Merges stacks on the same cell and checks the board against the table limits. */
export function cleanRouletteBets(bets: RouletteChip[], rank: number): RouletteChip[] {
  const merged = new Map<string, RouletteChip>();
  for (const b of bets) {
    if (!ROULETTE_TYPES.has(b.type)) throw new ApiError(400, 'bad_pick', 'That is not a bet on this table');
    if (b.type === 'number' && (!Number.isInteger(b.number) || b.number! < 0 || b.number! > 36)) throw new ApiError(400, 'bad_pick', 'Pick a number from 0 to 36');
    if (!stackAllowed(b.amount)) throw new ApiError(400, 'bad_bet', 'Use the chips on the table');
    const cell: RouletteBet = b.type === 'number' ? { type: 'number', number: b.number } : { type: b.type };
    const k = rouletteKey(cell);
    const cur = merged.get(k);
    merged.set(k, { ...cell, amount: (cur?.amount ?? 0) + b.amount });
  }
  const list = [...merged.values()];
  if (!list.length) throw new ApiError(400, 'no_bets', 'Place a chip first');
  if (list.length > ROULETTE_MAX_BETS) throw new ApiError(400, 'too_many', `Up to ${ROULETTE_MAX_BETS} bets a spin`);
  if (list.reduce((a, b) => a + b.amount, 0) > tableMax(rank)) throw new ApiError(400, 'over_max', `The table limit is ${tableMax(rank)}`);
  return list;
}

export async function roulette(seat: Seat, bets: RouletteChip[]) {
  await gate(seat);
  const out = await withRecord(seat, (s, rank, c) => {
    needs(rank, 'roulette');
    const list = cleanRouletteBets(bets, rank);
    const staked = list.reduce((a, b) => a + b.amount, 0);
    const pocket = randomInt(37);
    const { total, perBet } = rouletteBoardReturn(list, pocket);
    const { closedUp } = applyMovement(s, { game: 'roulette', stake: staked, paid: total, play: true }, c);
    settleStreak(s, 'roulette', staked, total);
    const tags = closedUpTags(closedUp);
    if (list.some((b, i) => b.type === 'number' && perBet[i] > 0)) tags.push('number_win');
    if (list.length >= 4 && total > staked) tags.push('spread_win');
    return { result: { pocket, win: total, perBet, bets: list }, event: { game: 'roulette', staked, paid: total, tags } };
  });
  return { ...out.result, stats: out.stats, newStamps: out.newStamps, rank: out.rank, rankUp: out.rankUp };
}

/** The first casino's single bet, for browser tabs opened before the update. */
export async function legacyRoulette(seat: Seat, bet: number, pick: RouletteBet) {
  if (!(BETS as readonly number[]).includes(bet)) throw new ApiError(400, 'bad_bet', 'Pick one of the bets on the table');
  const r = await roulette(seat, [{ ...pick, amount: bet }]);
  return { pocket: r.pocket, win: r.win, stats: r.stats };
}

// ---------------------------------------------------------------------------
// The River Wheel

export async function wheelSpin(seat: Seat, bets: Partial<Record<WheelSymbol, number>>) {
  await gate(seat);
  const out = await withRecord(seat, (s, rank, c) => {
    needs(rank, 'wheel');
    const list = Object.entries(bets).filter(([, v]) => v) as [WheelSymbol, number][];
    if (!list.length) throw new ApiError(400, 'no_bets', 'Place a chip first');
    if (list.length > WHEEL_MAX_BETS) throw new ApiError(400, 'too_many', `Up to ${WHEEL_MAX_BETS} symbols a spin`);
    for (const [sym, amount] of list) {
      if (!WHEEL_INFO[sym]) throw new ApiError(400, 'bad_pick', 'That symbol is not on the wheel');
      if (!stackAllowed(amount)) throw new ApiError(400, 'bad_bet', 'Use the chips on the rail');
    }
    const staked = list.reduce((a, [, v]) => a + v, 0);
    if (staked > tableMax(rank)) throw new ApiError(400, 'over_max', `The rail limit is ${tableMax(rank)}`);
    const segment = randomInt(WHEEL_SEGMENTS.length);
    const symbol = WHEEL_SEGMENTS[segment];
    const win = list.reduce((a, [sym, v]) => a + wheelReturn(sym, v, segment), 0);
    const { closedUp } = applyMovement(s, { game: 'wheel', stake: staked, paid: win, play: true }, c);
    settleStreak(s, 'wheel', staked, win);
    const tags = closedUpTags(closedUp);
    if (symbol === 'star' && bets.star) tags.push('star_win');
    s.anchorRun = bets.anchor ? (symbol === 'anchor' ? (s.anchorRun ?? 0) + 1 : 0) : 0;
    return { result: { segment, symbol, win }, event: { game: 'wheel', staked, paid: win, tags } };
  });
  return { ...out.result, stats: out.stats, newStamps: out.newStamps, rank: out.rank, rankUp: out.rankUp };
}

// ---------------------------------------------------------------------------
// Lucky Falls

export async function fallsDrop(seat: Seat, bet: number, risk: FallsRisk) {
  await gate(seat);
  if (!FALLS_BINS[risk]) throw new ApiError(400, 'bad_risk', 'Pick calm, lively or wild');
  const out = await withRecord(seat, (s, rank, c) => {
    needs(rank, 'falls');
    needBet(rank, 'falls', bet);
    const bits = Array.from({ length: FALLS_ROWS }, () => randomInt(2));
    const bin = fallsBin(bits);
    const mult = FALLS_BINS[risk][bin];
    const win = fallsWin(risk, bin, bet);
    const { closedUp } = applyMovement(s, { game: 'falls', stake: bet, paid: win, play: true }, c);
    settleStreak(s, 'falls', bet, win);
    const tags = closedUpTags(closedUp);
    if (bin === 0 || bin === FALLS_ROWS) tags.push('edge');
    if (risk === 'wild' && mult >= 25) tags.push('wild25');
    if (risk === 'calm') s.calmDrops = (s.calmDrops ?? 0) + 1;
    s.bests ??= {};
    s.bests.falls = Math.max(s.bests.falls ?? 0, mult);
    return { result: { bits, bin, mult, win, risk }, event: { game: 'falls', staked: bet, paid: win, tags } };
  });
  return { ...out.result, stats: out.stats, newStamps: out.newStamps, rank: out.rank, rankUp: out.rankUp };
}

// ---------------------------------------------------------------------------
// Blackjack: Rivet's Twenty-One and the Captain's Table

function bjEvent(game: GameId, r: BjRound, closedUp: boolean): PlayEvent {
  const { staked, paid } = roundTotals(r);
  const tags = closedUpTags(closedUp);
  if (r.hands.some((h) => h.result === 'blackjack')) tags.push('blackjack');
  if (r.hands.some((h) => h.doubled && (h.result === 'win' || h.result === 'charlie'))) tags.push('double_win');
  if (r.hands.length === 2 && r.hands.every((h) => h.result === 'win' || h.result === 'charlie')) tags.push('split_both');
  return { game, staked, paid, tags };
}

export async function blackjack(seat: Seat, table: BjTable, move: 'deal' | BjMove, bet?: number) {
  await gate(seat);
  const game: GameId = table === 'captain' ? 'captain' : 'blackjack';
  const slot = table === 'captain' ? 'captain' : 'bj';
  const out = await withRecord(seat, (s, rank, c) => {
    needs(rank, game);
    s.tables ??= {};
    const st: BjState = s.tables[slot] ?? { shoe: [], round: null };
    s.tables[slot] = st;
    const draw = (): Card => {
      if (st.shoe.length < 52) st.shoe = newShoe(BJ_DECKS, randomInt);
      return st.shoe.pop()!;
    };
    let event: PlayEvent | null = null;
    if (move === 'deal') {
      if (st.round?.phase === 'player') throw new ApiError(409, 'in_hand', 'Finish this hand first');
      if (bet === undefined) throw new ApiError(400, 'bad_bet', 'Pick a bet first');
      needBet(rank, game, bet);
      if (s.balance < bet) throw new Error('broke');
      st.round = startRound(table, bet, draw);
      let { closedUp } = applyMovement(s, { game, stake: bet, paid: 0, play: true }, c);
      if (st.round.phase === 'done') {
        const { paid } = roundTotals(st.round);
        if (paid) applyMovement(s, { game, stake: 0, paid, play: false }, c);
        settleStreak(s, game, bet, paid);
        event = bjEvent(game, st.round, closedUp);
        closedUp = false;
      }
    } else {
      const r = st.round;
      if (!r || r.phase !== 'player') throw new ApiError(409, 'no_hand', 'Deal a new hand first');
      if (!legalMoves(r).includes(move)) throw new ApiError(400, 'bad_move', `You cannot ${move} now`);
      if (followsBook(r, move)) s.bookMoves = (s.bookMoves ?? 0) + 1;
      const extra = move === 'double' || move === 'split' ? r.hands[r.active].bet : 0;
      if (extra > s.balance) throw new Error('broke');
      const next = applyMove(r, move, draw);
      st.round = next.round;
      if (next.cost) applyMovement(s, { game, stake: next.cost, paid: 0, play: false }, c);
      if (next.round.phase === 'done') {
        const { staked, paid } = roundTotals(next.round);
        const { closedUp } = paid ? applyMovement(s, { game, stake: 0, paid, play: false }, c) : { closedUp: false };
        settleStreak(s, game, staked, paid);
        event = bjEvent(game, next.round, closedUp);
      }
    }
    return { result: roundView(st.round), event };
  });
  return { hand: out.result, stats: out.stats, newStamps: out.newStamps, rank: out.rank, rankUp: out.rankUp };
}

/** The first casino's blackjack hand shape, for tabs opened before the update. */
export function legacyBjView(v: BjRoundView | null): BjView | null {
  if (!v || v.phase === 'idle' || !v.hands.length) return null;
  const h = v.hands[Math.min(v.active, v.hands.length - 1)];
  const result = h.result === 'charlie' ? 'win' : h.result;
  return { phase: v.phase, player: h.cards, dealer: v.dealer, bet: h.bet, doubled: h.doubled, result, payout: v.hands.reduce((a, x) => a + x.payout, 0) };
}

export async function legacyBlackjack(seat: Seat, move: 'deal' | 'hit' | 'stand' | 'double', bet?: number) {
  if (move === 'deal' && !(BETS as readonly number[]).includes(bet ?? 0)) throw new ApiError(400, 'bad_bet', 'Pick one of the bets on the table');
  const r = await blackjack(seat, 'saloon', move, bet);
  return { hand: legacyBjView(r.hand), stats: r.stats };
}

// ---------------------------------------------------------------------------
// Five Card Cabin (video poker)

const RANK_ORDER = POKER_PAYTABLE.map((p) => p.rank);

export async function poker(seat: Seat, move: 'deal' | 'draw', bet?: number, holds?: boolean[]) {
  await gate(seat);
  const out = await withRecord(seat, (s, rank, c) => {
    needs(rank, 'poker');
    s.tables ??= {};
    const cur = s.tables.poker;
    let event: PlayEvent | null = null;
    if (move === 'deal') {
      if (cur?.phase === 'deal') throw new ApiError(409, 'in_hand', 'Finish this hand first');
      if (bet === undefined) throw new ApiError(400, 'bad_bet', 'Pick a bet first');
      needBet(rank, 'poker', bet);
      const deck = newDeck(randomInt);
      const hand = deck.splice(0, 5);
      applyMovement(s, { game: 'poker', stake: bet, paid: 0, play: true }, c);
      s.tables.poker = { deck, hand, bet, phase: 'deal', holds: [false, false, false, false, false], rank: null, win: 0 };
    } else {
      if (!cur || cur.phase !== 'deal') throw new ApiError(409, 'no_hand', 'Deal a new hand first');
      const keep = Array.from({ length: 5 }, (_, i) => !!holds?.[i]);
      const hand = cur.hand.map((card, i) => (keep[i] ? card : cur.deck.shift()!));
      const handRank = evaluate(hand);
      const win = payMultiple(handRank) * cur.bet;
      const { closedUp } = win ? applyMovement(s, { game: 'poker', stake: 0, paid: win, play: false }, c) : { closedUp: false };
      settleStreak(s, 'poker', cur.bet, win);
      s.tables.poker = { ...cur, hand, holds: keep, phase: 'done', rank: handRank, win, deck: [] };
      s.bests ??= {};
      const best = s.bests.poker as PokerHandRank | undefined;
      if (handRank !== 'nothing' && (!best || RANK_ORDER.indexOf(handRank) < RANK_ORDER.indexOf(best))) s.bests.poker = handRank;
      event = { game: 'poker', staked: cur.bet, paid: win, tags: [...closedUpTags(closedUp), `poker:${handRank}`] };
    }
    return { result: pokerView(s.tables.poker), event };
  });
  return { hand: out.result, stats: out.stats, newStamps: out.newStamps, rank: out.rank, rankUp: out.rankUp };
}

// ---------------------------------------------------------------------------
// Reading

/** Everything the boat shows: your record, the boards, the Hall of Fame and the GRAND. */
export async function summary(roomId: string, areaId: string, browserId: string | undefined) {
  await casinoArea(roomId, areaId);
  const store = getStore();
  const me = browserId ? browserKey(browserId) : '';
  const now = Date.now();
  const loaded = me ? await loadStored(roomId, areaId, me, now) : null;
  const s = loaded?.s ?? (upgradeStats(null, now) as Stored);
  const top = async (z: string) => rows(z, await store.zrevrange(z, 0, BOARD_SIZE - 1), me);
  const [balance, wins, stamps, captains, fame, jp] = await Promise.all([
    top(K.board(roomId, areaId)),
    top(K.wins(roomId, areaId)),
    top(K.stamps(roomId, areaId)),
    top(K.capt(roomId, areaId)),
    store.lrange<FameEntry>(K.fame(roomId, areaId), 0, FAME_SIZE - 1),
    jackpotState(roomId, areaId),
  ]);
  return {
    stats: publicStats(s),
    rank: rankOf(s),
    boards: { balance, wins, stamps, captains },
    fame,
    jackpots: jackpotView(jp),
    blackjack: roundView(s.tables?.bj?.round ?? null),
    captain: roundView(s.tables?.captain?.round ?? null),
    poker: pokerView(s.tables?.poker),
  };
}

/** The first casino's board read, for tabs opened before the update. */
export async function legacyBoard(roomId: string, areaId: string, browserId: string | undefined) {
  const r = await summary(roomId, areaId, browserId);
  return { kind: 'casino' as const, board: r.boards.balance, stats: r.stats, blackjack: legacyBjView(r.blackjack) };
}

/** Creator tool: wipe a casino's credits, boards and jackpots. */
export async function clearCasino(roomId: string, areaId: string) {
  const store = getStore();
  const ids = await store.zrange(K.board(roomId, areaId), 0, -1);
  await store.del(
    K.board(roomId, areaId),
    K.wins(roomId, areaId),
    K.stamps(roomId, areaId),
    K.capt(roomId, areaId),
    K.spins(roomId, areaId),
    K.jp(roomId, areaId),
    K.fame(roomId, areaId),
    ...ids.map((id) => K.stats(roomId, areaId, id)),
    ...ids.map((id) => K.oldBj(roomId, areaId, id)),
  );
}

export { START_CREDITS };
