// What every game on the boat gets from the casino: the shared state,
// effects, HUD, camera and a few common flows (credits checks, errors).

import type * as THREE from 'three';
import type { GameId } from '../../shared/casino/progress';
import type { Tier } from '../../world/space';
import type { Hud, Progress } from '../kit';
import type { PostFX } from '../kit';
import type { ExperienceCtx } from '../common';
import type { Ceremonies } from './celebrate';
import type { Director } from './director';
import type { Economy } from './economy';
import type { Fx } from './fx';
import type { CasinoHud } from './hud';
import type { Lights } from './lighting';
import type { Mats } from './materials';

export interface SaveData {
  bet: number;
  /** Games tried at least once on this device (their glow stops). */
  tried: Record<string, boolean>;
  /** One-time coach lines already shown, per panel. */
  coached: Record<string, boolean>;
  scenery: 'town' | 'sunset' | 'moon';
  /** The telegraph bubble has been shown. */
  telegraphTip: boolean;
}

export const SAVE_DEFAULTS: SaveData = { bet: 10, tried: {}, coached: {}, scenery: 'town', telegraphTip: false };

export interface Host {
  ctx: ExperienceCtx;
  scene: THREE.Scene;
  mats: Mats;
  eco: Economy;
  hud: CasinoHud;
  kit: Hud;
  fx: Fx;
  post: PostFX;
  lights: Lights;
  director: Director;
  cer: Ceremonies;
  save: Progress<SaveData>;
  tier(): Tier;
  /** Seconds since the boat was built, scaled by the debug time scale. */
  clock(): number;
  /** Animation speed for playtests (1 normally). */
  timeScale(): number;
  /** The bet for single-bet games, clamped to what your rank allows there. */
  bet(game: GameId): number;
  setBet(n: number): void;
  /** True when you can cover `amount`; otherwise explains (and offers Penny's refill) and returns false. */
  canAfford(amount: number, game: GameId): boolean;
  /** Shows a failed play honestly: nothing was charged. */
  failed(error: string, code: string): void;
  /** Marks a game as tried (stops its glow, counts for the carpet path). */
  tried(game: GameId): void;
  /** A short speech bubble over one of the staff. */
  say(who: string, text: string): void;
}
