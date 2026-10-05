// What the game needs from any space you can stand in besides the town: a
// room, an inner area, or a built experience like a kart track or casino.

import type * as THREE from 'three';
import type { Area, Exhibit } from '../shared/model';
import type { Collider } from './physics';
import type { Vehicle } from './vehicles';

export interface Spot {
  x: number;
  z: number;
}

export interface SpaceAction {
  x: number;
  z: number;
  range: number;
  label: string;
  /** Short label for the touch button. */
  short: string;
  run: () => void;
}

export interface PlayerState {
  x: number;
  z: number;
  riding: Vehicle | null;
}

export interface SpaceView {
  readonly scene: THREE.Scene;
  readonly colliders: Collider[];
  /** Where the way out is. */
  readonly door: Spot;
  readonly lectern: Spot | null;
  readonly chest: Spot | null;
  readonly areaDoors: { area: Area; x: number; z: number }[];
  readonly exhibitSpots: { exhibit: Exhibit; x: number; z: number }[];
  readonly sun: THREE.DirectionalLight;
  /** Indoor spaces use the dollhouse camera. */
  readonly indoor: boolean;
  /** Where you appear on the way in. */
  readonly arrival: { x: number; z: number; yaw: number };
  cutaway(cam: THREE.Vector3): void;
  update(night: number, t: number, phase: number, focus: THREE.Vector3): void;
  dispose(): void;

  /** Vehicles you can ride here. */
  rideables?(): Vehicle[];
  /** Moving things the player bumps into, rebuilt every step. */
  extraColliders?(): Collider[];
  actions?(player: PlayerState): SpaceAction[];
  /** One physics step, after the player moved. */
  step?(h: number, player: PlayerState): void;
  /** Interact while riding. Return true when the space handled it. */
  rideAction?(player: PlayerState): { label: string; short: string; run: () => void } | null;
  /** The kick button on foot. Return a label when the space uses it here. */
  kickAction?(player: PlayerState): { label: string; run: () => void } | null;
  /** Something that pauses with the menu, like a race. */
  holdsTime?(): boolean;
}
