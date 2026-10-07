// What Club Nova's game modes (dance, duel, laser tag, sound check) can use
// from the world, and what the world asks of a mode.

import type * as THREE from 'three';
import type { Collider } from '../../world/physics';
import type { CameraShot, CaptureLabels, PlayerState, SpaceAction, Tier } from '../../world/space';
import type { ExperienceCtx } from '../common';
import type { Hud, Particles, PostFX, Shockwaves } from '../kit';
import type { SongId } from '../../shared/neon/songs';
import type { Boards } from './boards';
import type { BeatClock } from './clock';
import type { NovaCore } from './core';
import type { Crowd } from './crowd';
import type { NovaFloor } from './floor';
import type { RhythmInput } from './rhythm-input';
import type { Robot } from './robots';
import type { NovaProgress } from './save';
import type { Dancer, Fencer, Outfit } from './style';

export interface Fx {
  sparks: Particles;
  glow: Particles;
  confetti: Particles;
  rings: Shockwaves;
}

export interface Nova {
  ctx: ExperienceCtx;
  scene: THREE.Scene;
  hud: Hud;
  post: PostFX;
  fx: Fx;
  clock: BeatClock;
  rin: RhythmInput;
  core: NovaCore;
  floor: NovaFloor;
  crowd: Crowd;
  save: NovaProgress;
  boards: Boards;
  dancer: Dancer;
  fencer: Fencer;
  outfit: Outfit;
  orbit: Robot;
  judges: Robot[];
  /** The HUD layer for a mode's own elements. */
  layer: HTMLElement;
  tier(): Tier;
  /** Starts one of the songs with the beat clock following it. */
  playSong(id: SongId, opts?: { variant?: 'swing'; loop?: boolean; fadeIn?: number }): void;
  /** Back to roaming: the lounge song, the player free. */
  endMode(): void;
  /** A short hint bubble shown once per device. */
  hint(key: string, text: string): void;
  /** Glow time and spectacle level for the room (0 calm, 1 normal, 2 party). */
  setEnergy(energy: number, glow: number): void;
  /** Where the player is. */
  player(): PlayerState;
  /** The equipped prism blade colour. */
  bladeColor(): number;
  /** Shuts the Comet Yard airlock (during a match). */
  doorsShut: boolean;
}

export interface Mode {
  readonly kind: string;
  /** Fixed physics step (not while paused). */
  step(h: number, p: PlayerState): void;
  /** Every frame, even under the pause menu. */
  frame(dt: number, now: number, paused: boolean): void;
  capture(): CaptureLabels | null;
  shot(dt: number): CameraShot | null;
  actions?(p: PlayerState): SpaceAction[];
  kick?(p: PlayerState): { label: string; run: () => void } | null;
  holds(): boolean;
  colliders?(): Collider[];
  info(): Record<string, unknown>;
  dispose(): void;
}
