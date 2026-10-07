// What every challenge in the galaxy provides to the world while it runs.

import type { Carry, CameraShot, MoveInput, PlayerState, SpaceAction } from '../../../world/space';

export type RoundId = 'wake' | 'frenzy' | 'ring' | 'storm' | 'comet' | 'finale';

export interface Round {
  readonly id: RoundId;
  /** A timed round with a shared board: no run bonus, and Jump only twirls. */
  readonly boarded: boolean;
  /** The menu pauses it. */
  holdsTime(): boolean;
  step(h: number, p: PlayerState): void;
  /** Visuals, every frame. */
  update(dt: number, time: number): void;
  carry?(h: number, p: PlayerState, move: MoveInput): Carry | null;
  shot?(dt: number): CameraShot | null;
  actions?(p: PlayerState): SpaceAction[];
  /** Kick and Jump while the round runs (null leaves them to the world). */
  kick?(p: PlayerState): { label: string; run: () => void } | null;
  jump?(p: PlayerState): { label: string; run: () => void } | null;
  /** Where the star net brings you back to. */
  checkpoint?(): { x: number; y: number; z: number; yaw: number } | null;
  /** Called by the star net when you fall in this round. */
  fell?(): void;
  /** Tidy away meshes and HUD. */
  dispose(): void;
  debug(): unknown;
}
