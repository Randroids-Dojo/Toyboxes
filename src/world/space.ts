// What the game needs from any space you can stand in besides the town: a
// room, an inner area, or a built experience like a kart track or casino.

import type * as THREE from 'three';
import type { Area, Exhibit } from '../shared/model';
import type { Collider } from './physics';
import type { Pose } from './avatar';
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
  /** Height of the feet above the floor (0 on the ground floor). */
  y: number;
  /** Vertical speed, m/s (up is positive). */
  vy: number;
  grounded: boolean;
  /** Facing, radians (0 faces +z). */
  yaw: number;
  vx: number;
  vz: number;
  riding: Vehicle | null;
}

/** Where the world puts the player this step while it carries them (slings, rides, flights). */
export interface Carry {
  x: number;
  y: number;
  z: number;
  /** Facing, radians (0 faces +z). */
  yaw: number;
  /** Body pose while carried. Defaults to 'fly'. */
  pose?: Pose;
  /** Speed for the follow camera, m/s. */
  speed?: number;
}

/** The move input this step: the raw stick (x right, y forward) and the same as a world direction relative to the camera. */
export interface MoveInput {
  x: number;
  y: number;
  wx: number;
  wz: number;
}

/** A camera the experience directs: intro flyovers, podiums, replays. */
export interface CameraShot {
  position: THREE.Vector3;
  target: THREE.Vector3;
  /** Vertical field of view in degrees. Defaults to the normal view. */
  fov?: number;
  /** 0 keeps the follow camera, 1 is fully this shot. Ease it for smooth cuts. */
  blend?: number;
  /** Freezes the player (no moving, looking, jumping or actions) while it plays. */
  lockPlayer?: boolean;
  /** Interact skips a locked shot. */
  skip?: () => void;
  skipLabel?: string;
}

/** Touch button labels while an experience reads input itself; null hides a button. */
export interface CaptureLabels {
  action: string | null;
  kick: string | null;
  jump: string | null;
  /** The desktop prompt, e.g. "Hit the arrows on the beat". */
  prompt?: string | null;
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
  /** Back while riding. Return true when the space handled it (e.g. no getting out mid-race); otherwise you get off. */
  rideBack?(player: PlayerState): boolean;
  /** The kick button on foot. Return a label when the space uses it here. */
  kickAction?(player: PlayerState): { label: string; run: () => void } | null;
  /** Something that pauses with the menu, like a race. */
  holdsTime?(): boolean;
  /** Extra pause menu items under Resume, e.g. "Restart the song" or "Quit the round". */
  pauseItems?(): { label: string; run: () => void }[];
  /** Gravity for jumps here, as a share of normal (low in space). */
  gravity?(): number;
  /**
   * A directed camera for this frame, or null for the follow camera. Called
   * once per frame, before input, even while a menu is open.
   */
  cameraShot?(dt: number): CameraShot | null;
  /**
   * While this returns labels, the game stops moving the player and stops
   * handling interact, kick and jump; the experience reads `ctx.input`
   * itself (rhythm games, aiming, menus in the world). Pause and Back still work.
   */
  captureInput?(): CaptureLabels | null;
  /**
   * Called every step before walking. Return a position to carry the player
   * there instead of walking, jumping and gravity (slings, scripted rides,
   * your own flight model). Return null to hand control back; normal physics
   * resumes from that spot.
   */
  carry?(h: number, player: PlayerState, move: MoveInput): Carry | null;
  /** Speed multiplier for Run here (default 1.3). Return 1 to make running no faster, e.g. in a timed round. */
  runScale?(): number;
  /** The jump button on foot. Return a label to use it for something else here. */
  jumpAction?(player: PlayerState): { label: string; run: () => void } | null;
  /** Extra pause menu items, shown after Resume (e.g. "Leave the race"). The menu closes before `run`. */
  pauseItems?(): { label: string; run: () => void }[];
  /** Graphics tier from the settings and measured frame times. */
  setQuality?(tier: Tier): void;
  /** Draw the frame itself (post-processing). Return true when it did. */
  render?(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): boolean;
  resize?(width: number, height: number): void;
}

export type Tier = 'low' | 'medium' | 'high';
