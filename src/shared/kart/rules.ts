// Race rules for the Toybox Grand Prix: speed classes, kart bodies, cup
// points, item odds and what a hit costs. Pure data and small functions so
// the unit tests, the browser and the server agree.

import { KART_BOOST, KART_TOP_SPEED } from '../track.js';

export type ClassId = 'windup' | 'battery' | 'rocket';
export type BodyId = 'classic' | 'zippy' | 'chunky';
export type ItemId = 'spring' | 'triple' | 'ball' | 'marbles' | 'bubble' | 'plane';

export interface SpeedClass {
  id: ClassId;
  name: string;
  blurb: string;
  top: number;
  accel: number;
  /** Computer drivers: share of their skill and nerve. */
  skill: number;
  nerve: number;
  /** Seconds a computer driver waits before using an item, and how often it bothers. */
  itemDelay: number;
  itemChance: number;
  /** A computer driver this far ahead of you (metres) eases off to `ease` of its pace. 0 turns it off. */
  catchup: number;
  ease: number;
}

export const CLASSES: Record<ClassId, SpeedClass> = {
  windup: { id: 'windup', name: 'Windup', blurb: 'Gentle. Great for a first cup.', top: 12, accel: 8, skill: 0.92, nerve: 0.94, itemDelay: 1.5, itemChance: 0.5, catchup: 35, ease: 0.9 },
  battery: { id: 'battery', name: 'Battery', blurb: 'The real race.', top: 14, accel: 9, skill: 1, nerve: 1, itemDelay: 0.8, itemChance: 0.85, catchup: 70, ease: 0.9 },
  rocket: { id: 'rocket', name: 'Rocket', blurb: 'Fast. Drift or be left behind.', top: 16, accel: 10.5, skill: 1, nerve: 1.03, itemDelay: 0.4, itemChance: 1, catchup: 0, ease: 1 },
};

export const CLASS_ORDER: ClassId[] = ['windup', 'battery', 'rocket'];

export interface Body {
  id: BodyId;
  name: string;
  blurb: string;
  /** Multipliers on the class numbers. */
  top: number;
  accel: number;
  turn: number;
  /** Drift charge rate. */
  charge: number;
  /** Spin-out length. */
  spin: number;
  weight: number;
}

export const BODIES: Record<BodyId, Body> = {
  classic: { id: 'classic', name: 'Classic', blurb: 'Good at everything.', top: 1, accel: 1, turn: 1, charge: 1, spin: 1, weight: 1 },
  zippy: { id: 'zippy', name: 'Zippy', blurb: 'Quick off the line, sharp in corners.', top: 0.97, accel: 1.18, turn: 1.08, charge: 1.15, spin: 1, weight: 0.8 },
  chunky: { id: 'chunky', name: 'Chunky', blurb: 'Fastest flat out, shrugs off hits.', top: 1.03, accel: 0.86, turn: 0.94, charge: 0.92, spin: 0.75, weight: 1.3 },
};

export const BODY_ORDER: BodyId[] = ['classic', 'zippy', 'chunky'];

/** Grand Prix points by finishing place. */
export const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

export function pointsFor(place: number): number {
  return POINTS[place - 1] ?? 0;
}

export interface Standing {
  id: string;
  points: number;
  /** Finishing place in the last race, for ties. */
  last: number;
}

/** Cup order: most points first; ties go to the better finish in the last race. */
export function cupOrder<T extends Standing>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.points - a.points || a.last - b.last);
}

export const ITEMS: ItemId[] = ['spring', 'triple', 'ball', 'marbles', 'bubble', 'plane'];

/** Item odds by place (rows sum to 100): 1st, 2nd and 3rd, 4th and 5th, 6th to 8th. */
export const ODDS: Record<'first' | 'front' | 'middle' | 'back', Record<ItemId, number>> = {
  first: { spring: 0, triple: 0, ball: 20, marbles: 45, bubble: 35, plane: 0 },
  front: { spring: 20, triple: 0, ball: 35, marbles: 25, bubble: 20, plane: 0 },
  middle: { spring: 30, triple: 0, ball: 25, marbles: 10, bubble: 15, plane: 20 },
  back: { spring: 30, triple: 25, ball: 20, marbles: 0, bubble: 0, plane: 25 },
};

export function oddsRow(place: number, karts: number): Record<ItemId, number> {
  // On a smaller grid the bands keep their share of the field.
  const p = Math.round(((place - 1) / Math.max(1, karts - 1)) * 7) + 1;
  return p <= 1 ? ODDS.first : p <= 3 ? ODDS.front : p <= 5 ? ODDS.middle : ODDS.back;
}

/** Picks an item for a place from a random number in [0, 1). */
export function rollItem(place: number, karts: number, r: number): ItemId {
  const row = oddsRow(place, karts);
  let acc = 0;
  const x = r * 100;
  for (const id of ITEMS) {
    acc += row[id];
    if (x < acc) return id;
  }
  return 'spring';
}

/** What a hit does: speed kept, seconds without control, then immunity. */
export const HITS = {
  spin: { keep: 0.4, stun: 0.9 },
  marbles: { keep: 0.65, stun: 0.6 },
  tail: { keep: 0.6, stun: 0.7 },
  immune: 1.5,
};

/** Seconds of boost. */
export const BOOSTS = { pad: 1.1, rocket: 1.2, draft: 0.8, spring: 1.0, trick: 0.6, mini1: 0.5, mini2: 1.0 };

/** The fastest any kart can go on a board lap (Battery class, best body, boosting), m/s. */
export const BOARD_TOP = KART_TOP_SPEED * BODIES.chunky.top * KART_BOOST;

/** The fastest a kart can go off the road (half grip, boosting), m/s. */
export const GRASS_TOP = BOARD_TOP * 0.5;

/**
 * The quickest Battery lap the boards accept on a circuit of this length: a
 * whole lap averaging 1.3 times top speed. A loose sanity floor (the computer
 * brain averages about 1.05); the ghost's speed checks do the real work.
 */
export function boardMinLapMs(length: number): number {
  return Math.floor((length / (KART_TOP_SPEED * 1.3)) * 1000);
}

/** Medal earned by a lap time: 0 none, 1 bronze, 2 silver, 3 gold, 4 champion. */
export function medalFor(ms: number, medals: [number, number, number, number]): number {
  let m = 0;
  for (let i = 0; i < 4; i++) if (ms <= medals[i]) m = i + 1;
  return m;
}

export const MEDAL_NAMES = ['', 'Bronze', 'Silver', 'Gold', 'Champion'];

/** Seeded random numbers (mulberry32), so a seed replays the same race. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
