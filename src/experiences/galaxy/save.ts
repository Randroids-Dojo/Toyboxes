// The player's own journey through this galaxy, kept on this device: stars
// per challenge, bests, lost moons and whether the black hole has bloomed.

import { Progress } from '../kit';
import { STAR_GOAL, UNLOCK, type Challenge, type Island } from '../../shared/galaxy-rules';

export interface GalaxySave {
  stars: Record<Challenge, number>;
  best: { frenzy: number | null; ring: number | null; storm: number | null; comet: number | null };
  /** Bitmask of the eight lost moons. */
  moons: number;
  bloomed: number;
  /** The black hole bloomed and a small new one hangs in its place. */
  reborn: boolean;
  /** Seen the arrival flyover. */
  flyover: boolean;
  goldFed: number;
  /** Gate times of your best ring run, for the split read-out. */
  ringSplits: number[] | null;
}

export const FRESH: GalaxySave = {
  stars: { wake: 0, frenzy: 0, ring: 0, storm: 0, comet: 0 },
  best: { frenzy: null, ring: null, storm: null, comet: null },
  moons: 0,
  bloomed: 0,
  reborn: false,
  flyover: false,
  goldFed: 0,
  ringSplits: null,
};

export function moonCount(mask: number): number {
  let n = 0;
  for (let i = 0; i < 8; i++) if (mask & (1 << i)) n++;
  return n;
}

/** Stars the lost moons give: one at four found, another at eight. */
export function moonStars(mask: number): number {
  const n = moonCount(mask);
  return (n >= 4 ? 1 : 0) + (n >= 8 ? 1 : 0);
}

export function totalStars(d: GalaxySave): number {
  return Object.values(d.stars).reduce((a, b) => a + b, 0) + moonStars(d.moons);
}

export function islandOpen(d: GalaxySave, island: Island): boolean {
  return totalStars(d) >= UNLOCK[island];
}

export function horizonOpen(d: GalaxySave): boolean {
  return totalStars(d) >= STAR_GOAL;
}

export class Save {
  private p: Progress<GalaxySave>;

  constructor(roomId: string, areaId: string) {
    this.p = new Progress<GalaxySave>('galaxy', roomId, areaId, FRESH, 2);
    // Older or damaged saves: fill in anything missing, drop anything odd.
    const d = this.p.data;
    d.stars = { ...FRESH.stars, ...(typeof d.stars === 'object' && d.stars ? d.stars : {}) };
    for (const k of Object.keys(d.stars) as Challenge[]) d.stars[k] = Math.max(0, Math.min(k === 'wake' ? 1 : 3, Math.round(Number(d.stars[k]) || 0)));
    d.best = { ...FRESH.best, ...(typeof d.best === 'object' && d.best ? d.best : {}) };
    d.moons = (Number(d.moons) || 0) & 255;
    d.bloomed = Number(d.bloomed) || 0;
    d.goldFed = Number(d.goldFed) || 0;
    d.flyover = !!d.flyover;
    d.reborn = !!d.reborn;
    if (!Array.isArray(d.ringSplits) || !d.ringSplits.every((x) => typeof x === 'number')) d.ringSplits = null;
  }

  get data(): GalaxySave {
    return this.p.data;
  }

  get total(): number {
    return totalStars(this.p.data);
  }

  update(f: (d: GalaxySave) => void): void {
    this.p.update(f);
  }

  /** Start the journey again after a bloom: stars go, bests and moons stay. */
  restart(): void {
    this.p.update((d) => {
      d.stars = { ...FRESH.stars };
      d.moons = 0;
      d.goldFed = 0;
      d.reborn = false;
    });
  }
}
