// The Golden Paddle's logbook: games, ranks, stamps and bet limits. Stamps
// are worked out on the server from plays it decided, so the stamps board
// can be trusted. Shared with the client, which shows the logbook. No DOM or
// Node imports.

import type { CasinoStats } from '../slots';

export type GameId = 'slot' | 'roulette' | 'blackjack' | 'wheel' | 'falls' | 'poker' | 'captain';

export interface GameInfo {
  id: GameId;
  name: string;
  /** Rank needed to play (0 Deckhand, 1 Bosun, 2 First Mate). */
  rank: number;
  /** The room it lives in. */
  room: string;
}

export const GAMES: GameInfo[] = [
  { id: 'slot', name: 'Old Lucky', rank: 0, room: 'Grand Saloon' },
  { id: 'roulette', name: 'The Spinning Lily', rank: 0, room: 'Grand Saloon' },
  { id: 'blackjack', name: "Rivet's Twenty-One", rank: 0, room: 'Grand Saloon' },
  { id: 'wheel', name: 'The River Wheel', rank: 0, room: 'Stern Deck' },
  { id: 'falls', name: 'Lucky Falls', rank: 1, room: 'Moonlight Lounge' },
  { id: 'poker', name: 'Five Card Cabin', rank: 1, room: 'Moonlight Lounge' },
  { id: 'captain', name: "The Captain's Table", rank: 2, room: 'Wheelhouse' },
];

export const GAME_INFO: Record<GameId, GameInfo> = Object.fromEntries(GAMES.map((g) => [g.id, g])) as Record<GameId, GameInfo>;

// ---------------------------------------------------------------------------
// Ranks

export interface RankInfo {
  name: string;
  stamps: number;
  /** What the rank opens, in a few words. */
  opens: string;
}

export const RANKS: RankInfo[] = [
  { name: 'Deckhand', stamps: 0, opens: 'The Grand Saloon and the Stern Deck' },
  { name: 'Bosun', stamps: 5, opens: 'The Moonlight Lounge' },
  { name: 'First Mate', stamps: 14, opens: 'The Wheelhouse and high limit chips' },
  { name: 'Captain', stamps: 26, opens: 'Your name on the Captains board' },
];

export function rankFor(stampCount: number): number {
  let r = 0;
  RANKS.forEach((k, i) => {
    if (stampCount >= k.stamps) r = i;
  });
  return r;
}

export function rankOf(s: Pick<CasinoStats, 'stamps'>): number {
  return rankFor(s.stamps?.length ?? 0);
}

/** Whether a rank may play a game. */
export function canPlay(rank: number, game: GameId): boolean {
  return rank >= GAME_INFO[game].rank;
}

export function gamesOpen(rank: number): GameId[] {
  return GAMES.filter((g) => g.rank <= rank).map((g) => g.id);
}

// ---------------------------------------------------------------------------
// Bets

/** Chips on every table. 250 and 500 open at First Mate. */
export const CHIPS = [10, 25, 50, 100, 250, 500] as const;
export const HIGH_LIMIT_RANK = 2;

/** The chip values this rank may use on a game. */
export function chipsFor(rank: number, game: GameId): number[] {
  if (game === 'captain') return [100, 250, 500];
  return CHIPS.filter((c) => c <= 100 || rank >= HIGH_LIMIT_RANK);
}

/** Largest total stake on one spin of a board game (roulette, the River Wheel). */
export function tableMax(rank: number): number {
  return rank >= HIGH_LIMIT_RANK ? 2500 : 500;
}

/** Whether a single-bet game (slot, falls, poker, blackjack) accepts this bet. */
export function betAllowed(rank: number, game: GameId, bet: number): boolean {
  return chipsFor(rank, game).includes(bet);
}

/** A chip stack on a board: whole credits, at least the smallest chip, in steps of 5. */
export function stackAllowed(amount: number): boolean {
  return Number.isInteger(amount) && amount >= 10 && amount % 5 === 0;
}

// ---------------------------------------------------------------------------
// Stamps

/**
 * One settled play, as the server saw it. `tags` carry game facts the stamps
 * look for, e.g. 'mixed_fruit', 'bonus', 'jackpot:MINI', 'double_win'.
 */
export interface PlayEvent {
  game: GameId;
  /** Total staked on this play (a blackjack round includes doubles and splits). */
  staked: number;
  /** Total paid back, stake included. */
  paid: number;
  tags: string[];
}

export interface StampInfo {
  id: string;
  name: string;
  /** How to earn it, in a few words. */
  hint: string;
  group: 'Boarding' | 'Old Lucky' | 'Cards and wheels' | 'Lounge' | 'Big moments' | 'Healthy voyages';
}

type Check = (s: CasinoStats, e: PlayEvent | null) => boolean;

const tag = (t: string): Check => (_s, e) => !!e?.tags.includes(t);
const played = (g: GameId): Check => (_s, e) => e?.game === g;

const STAMP_LIST: (StampInfo & { check: Check })[] = [
  { id: 'aboard', name: 'All aboard', hint: 'Play any game', group: 'Boarding', check: (_s, e) => !!e },
  { id: 'lever', name: 'Lever puller', hint: 'Spin Old Lucky', group: 'Boarding', check: played('slot') },
  { id: 'redblack', name: 'Red or black', hint: 'Spin the roulette wheel', group: 'Boarding', check: played('roulette') },
  { id: 'twentyone', name: 'Twenty-one club', hint: 'Play a hand of blackjack', group: 'Boarding', check: (_s, e) => e?.game === 'blackjack' || e?.game === 'captain' },
  { id: 'riverwheel', name: 'River wheel', hint: 'Spin the River Wheel', group: 'Boarding', check: played('wheel') },

  { id: 'fruit', name: 'Fruit salad', hint: 'Land mixed fruit on Old Lucky', group: 'Old Lucky', check: tag('mixed_fruit') },
  { id: 'steam', name: 'Full steam', hint: 'Land three golden paddles', group: 'Old Lucky', check: tag('bonus') },
  { id: 'sevens', name: 'Seven seas', hint: 'Land three sevens', group: 'Old Lucky', check: tag('three_seven') },
  { id: 'paddle30', name: 'Lucky paddle', hint: 'Win 30x or more in a bonus', group: 'Old Lucky', check: tag('ring30') },

  { id: 'blackjack', name: 'Blackjack', hint: 'Get dealt a blackjack', group: 'Cards and wheels', check: tag('blackjack') },
  { id: 'doubledown', name: 'Double down', hint: 'Win a doubled hand', group: 'Cards and wheels', check: tag('double_win') },
  { id: 'split', name: 'Split decision', hint: 'Win both halves of a split', group: 'Cards and wheels', check: tag('split_both') },
  { id: 'book', name: 'By the book', hint: 'Make 20 moves the strategy card agrees with', group: 'Cards and wheels', check: (s) => (s.bookMoves ?? 0) >= 20 },
  { id: 'straightup', name: 'Straight up', hint: 'Win a bet on a single number', group: 'Cards and wheels', check: tag('number_win') },
  { id: 'spread', name: 'Spread the chips', hint: 'Win a roulette spin with 4 or more bets', group: 'Cards and wheels', check: tag('spread_win') },
  { id: 'star', name: 'Star of the river', hint: 'Win a Star bet on the River Wheel', group: 'Cards and wheels', check: tag('star_win') },
  { id: 'anchor3', name: 'Even keel', hint: 'Win on Anchor three spins in a row', group: 'Cards and wheels', check: (s) => (s.anchorRun ?? 0) >= 3 },

  { id: 'pearl', name: 'Pearl drop', hint: 'Drop a pearl down Lucky Falls', group: 'Lounge', check: played('falls') },
  { id: 'calm10', name: 'Calm waters', hint: 'Drop 10 calm pearls', group: 'Lounge', check: (s) => (s.calmDrops ?? 0) >= 10 },
  { id: 'edge', name: 'Over the falls', hint: 'Land a pearl in an edge bin', group: 'Lounge', check: tag('edge') },
  { id: 'wild25', name: 'Wild ride', hint: 'Win 25x or more on wild', group: 'Lounge', check: tag('wild25') },
  { id: 'dealt', name: 'Dealt in', hint: 'Play a hand of Five Card Cabin', group: 'Lounge', check: played('poker') },
  { id: 'fullhouse', name: 'Full house', hint: 'Make a full house', group: 'Lounge', check: tag('poker:full_house') },
  { id: 'quads', name: 'Four of a kind', hint: 'Make four of a kind', group: 'Lounge', check: tag('poker:four_kind') },
  { id: 'royal', name: 'Royal flush', hint: 'Make a royal flush', group: 'Lounge', check: tag('poker:royal_flush') },

  { id: 'mini', name: 'Mini jackpot', hint: 'Win the MINI on the bonus wheel', group: 'Big moments', check: tag('jackpot:MINI') },
  { id: 'major', name: 'Major jackpot', hint: 'Win the MAJOR on the bonus wheel', group: 'Big moments', check: tag('jackpot:MAJOR') },
  { id: 'grand', name: 'Grand jackpot', hint: 'Win the GRAND on the bonus wheel', group: 'Big moments', check: tag('jackpot:GRAND') },
  { id: 'highroller', name: 'High roller', hint: 'Win 1,000 or more in one play', group: 'Big moments', check: (_s, e) => !!e && e.paid >= 1000 && e.paid > e.staked },
  { id: 'streak3', name: 'Lucky streak', hint: 'Win three in a row on one game', group: 'Big moments', check: (s) => (s.streak?.n ?? 0) >= 3 },

  { id: 'shore', name: 'Shore leave', hint: 'End a visit up on the day', group: 'Healthy voyages', check: tag('shore_leave') },
  { id: 'comeback', name: 'Comeback', hint: 'Climb from under 100 back to 1,000', group: 'Healthy voyages', check: (s) => (s.lowSinceRefill ?? Infinity) < 100 && s.balance >= 1000 },
  { id: 'explorer', name: 'Explorer', hint: 'Play every game open to you', group: 'Healthy voyages', check: (s) => gamesOpen(rankOf(s)).every((g) => (s.games?.[g]?.plays ?? 0) > 0) },
  { id: 'regular', name: 'Regular', hint: 'Play on 5 different days', group: 'Healthy voyages', check: (s) => (s.playDays ?? 0) >= 5 },
  { id: 'oldsalt', name: 'Old salt', hint: 'Play on 20 different days', group: 'Healthy voyages', check: (s) => (s.playDays ?? 0) >= 20 },
];

export const STAMPS: StampInfo[] = STAMP_LIST.map(({ check: _c, ...info }) => info);
export const STAMP_INFO: Record<string, StampInfo> = Object.fromEntries(STAMPS.map((s) => [s.id, s]));

/**
 * Adds every stamp this play (or state) has earned to `s.stamps` and returns
 * the new ones in list order. Explorer and Comeback can be earned without a
 * play event too (for example after a rank up).
 */
export function awardStamps(s: CasinoStats, e: PlayEvent | null): string[] {
  const have = new Set(s.stamps ?? []);
  const fresh: string[] = [];
  for (const st of STAMP_LIST) {
    if (have.has(st.id)) continue;
    if (st.check(s, e)) {
      have.add(st.id);
      fresh.push(st.id);
    }
  }
  if (fresh.length) s.stamps = [...(s.stamps ?? []), ...fresh];
  // A new rank can open games, which can make Explorer reachable later; never revoke.
  return fresh;
}

/**
 * The stamp to suggest next: the first Boarding stamp still missing, then
 * the easiest unearned ones the player can reach at their rank.
 */
export function nextStamp(s: CasinoStats): StampInfo | null {
  const have = new Set(s.stamps ?? []);
  const rank = rankOf(s);
  const easy = ['aboard', 'lever', 'redblack', 'twentyone', 'riverwheel', 'pearl', 'dealt', 'explorer', 'fruit', 'shore', 'blackjack', 'doubledown', 'spread', 'calm10', 'book', 'anchor3', 'straightup', 'streak3', 'regular'];
  for (const id of easy) {
    if (have.has(id)) continue;
    if ((id === 'pearl' || id === 'dealt' || id === 'calm10') && rank < 1) continue;
    return STAMP_INFO[id];
  }
  return STAMPS.find((x) => !have.has(x.id)) ?? null;
}

/** Which game a suggested stamp points at, for the carpet path. */
export function stampGame(id: string): GameId | null {
  const map: Record<string, GameId> = {
    aboard: 'slot',
    lever: 'slot',
    redblack: 'roulette',
    twentyone: 'blackjack',
    riverwheel: 'wheel',
    pearl: 'falls',
    dealt: 'poker',
    fruit: 'slot',
    blackjack: 'blackjack',
    doubledown: 'blackjack',
    spread: 'roulette',
    calm10: 'falls',
    book: 'blackjack',
    anchor3: 'wheel',
    straightup: 'roulette',
  };
  return map[id] ?? null;
}
