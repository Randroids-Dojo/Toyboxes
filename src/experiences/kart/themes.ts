// Dressing for each theme. Block Town is the playroom; the other three
// circuits have their own builders.

import type { Theme } from '../../shared/kart/circuits';
import { dressBlockTown } from './build/blocktown';
import type { Dresser } from './build/dresser';
import type { CircuitScene, ThemeParts } from './build/scene';
import type { TexCache } from './build/textures';

export const DRESSERS: Record<Theme, (d: Dresser, s: CircuitScene, tex: TexCache) => ThemeParts> = {
  playroom: dressBlockTown,
  garden: dressBlockTown,
  beach: dressBlockTown,
  bedroom: dressBlockTown,
};
