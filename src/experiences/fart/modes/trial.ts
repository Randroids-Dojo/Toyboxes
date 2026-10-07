// What a trial (Rocket Rings, the library, the band, Picnic Panic) plugs into
// the world: it gets the shared pieces through `TrialWorld` and answers the
// SpaceView hooks while it runs.

import type * as THREE from 'three';
import type { Collider } from '../../../world/physics';
import type { CameraShot, CaptureLabels, PlayerState, SpaceAction } from '../../../world/space';
import type { ExperienceCtx } from '../../common';
import type { Hud, Particles, Shockwaves } from '../../kit';
import type { CloudFx } from '../clouds-fx';
import type { Figures } from '../figures';
import type { Mover, TootEvent } from '../moves';
import type { PuffHud } from '../pfhud';
import type { Props } from '../props';
import type { Clouds } from '../sim/clouds';
import type { PuffSave, TrialId } from '../sim/progress';
import type { Village3 } from '../town';
import type { Village } from '../village';
import type { Words } from '../words';

export interface TrialWorld {
  ctx: ExperienceCtx;
  scene: THREE.Scene;
  hud: Hud;
  ph: PuffHud;
  words: Words;
  figures: Figures;
  clouds: Clouds;
  cloudFx: CloudFx;
  vil: Village3;
  village: Village;
  props: Props;
  mover: Mover;
  sparks: Particles;
  confetti: Particles;
  dust: Particles;
  rings: Shockwaves;
  save: PuffSave;
  saveNow(): void;
  /** Golden beans earned in a trial (keeps the best). */
  trialBeans(id: TrialId, beans: number, best: number | null, better: 'lower' | 'higher'): { newBeans: number; newBest: boolean };
  /** Back to free play (and optionally straight into another trial). */
  endTrial(next?: TrialId | 'again'): void;
  /** Shows the village or hides it (the library interior). */
  showVillage(on: boolean): void;
  player(): PlayerState | null;
  tier(): 'low' | 'medium' | 'high';
}

export interface Trial {
  readonly id: TrialId;
  /** A countdown or a run is in progress (the menu pauses it). */
  holdsTime(): boolean;
  step(h: number, p: PlayerState): void;
  update(dt: number, t: number): void;
  actions?(p: PlayerState): SpaceAction[];
  captureInput?(): CaptureLabels | null;
  cameraShot?(dt: number): CameraShot | null;
  gravity?(): number;
  onToot?(e: TootEvent, kind: string): void;
  extraColliders?(): Collider[];
  /** Whether free-play toots work during the trial. */
  readonly tooting: boolean;
  /** Back from the menu or a results card: leave cleanly. */
  dispose(): void;
  debug(): Record<string, unknown>;
}
