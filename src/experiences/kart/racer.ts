// A kart in the race: yours or a computer driver's. Where it is along the
// lap, how far it has raced, its item, its timers and its driver.

import type * as THREE from 'three';
import type { ItemId } from '../../shared/kart/rules';
import type { Driver, DriverDef, Mood } from './drivers';
import type { RaceKart } from './racekart';

export interface AiState {
  /** Sideways position it steers for, smoothed. */
  off: number;
  passOff: number;
  passFor: number;
  /** Boost pad it is going for, by index, or -1. */
  padAim: number;
  /** Holding a drift through this corner. */
  drifting: boolean;
  /** Seconds it has held its item. */
  holdFor: number;
  /** Its own wander, so lines differ lap to lap. */
  phase: number;
  /** Item it keeps in reserve (Ink juggles). */
  reserve: ItemId | null;
}

export interface Grab {
  t: number;
  /** Where it was lifted from and where it is set down. */
  from: { x: number; y: number; z: number; yaw: number };
  to: { x: number; y: number; z: number; yaw: number; s: number };
}

export interface Racer {
  id: string;
  name: string;
  color: string;
  you: boolean;
  kart: RaceKart;
  def: DriverDef | null;
  driver: Driver | null;
  tag: THREE.Sprite | null;
  /** Along the lap, sideways offset (left positive), distance from the centre line. */
  s: number;
  off: number;
  dist: number;
  hint: number;
  /** Forward distance raced since the green light. */
  raced: number;
  /** From the grid slot to the line. */
  toLine: number;
  /** Race time when it finished, seconds. */
  finishedAt: number | null;
  place: number;
  item: ItemId | null;
  /** Springs left from a triple. */
  itemCount: number;
  /** Seconds left on the item roulette. */
  roulette: number;
  offFor: number;
  stuckFor: number;
  offMax: number;
  grabs: number;
  draft: number;
  mood: Mood;
  moodUntil: number;
  ai: AiState;
  grab: Grab | null;
  /** Laps for free-drive bookkeeping (fractional). */
  laps: number;
  /** Hits landed and taken this race. */
  hitsDealt: number;
  hitsTaken: number;
}

export function newRacer(id: string, name: string, color: string, kart: RaceKart, def: DriverDef | null, driver: Driver | null): Racer {
  return {
    id,
    name,
    color,
    you: !def,
    kart,
    def,
    driver,
    tag: null,
    s: 0,
    off: 0,
    dist: 0,
    hint: 0,
    raced: 0,
    toLine: 0,
    finishedAt: null,
    place: 1,
    item: null,
    itemCount: 0,
    roulette: 0,
    offFor: 0,
    stuckFor: 0,
    offMax: 0,
    grabs: 0,
    draft: 0,
    mood: 'drive',
    moodUntil: 0,
    ai: { off: def?.lane ?? 0, passOff: 0, passFor: 0, padAim: -1, drifting: false, holdFor: 0, phase: Math.random() * 10, reserve: null },
    grab: null,
    laps: 0,
    hitsDealt: 0,
    hitsTaken: 0,
  };
}

/** Race progress: distance past the start of the race. */
export function progress(r: Racer): number {
  return r.raced - r.toLine;
}
