// Stars and what they unlock in Club Nova. Cosmetics only, earned by stars,
// never bought, and they stay in this world.

export type UnlockKind = 'blade' | 'suit' | 'pose' | 'helmet';

export interface Unlock {
  stars: number;
  kind: UnlockKind;
  id: string;
  name: string;
}

export const UNLOCKS: Unlock[] = [
  { stars: 0, kind: 'suit', id: 'starter', name: 'Starter suit' },
  { stars: 0, kind: 'blade', id: 'cyan', name: 'Cyan blade' },
  { stars: 0, kind: 'pose', id: 'wave', name: 'Wave' },
  { stars: 3, kind: 'blade', id: 'pink', name: 'Pink blade' },
  { stars: 6, kind: 'suit', id: 'retro', name: 'Retro wave suit' },
  { stars: 9, kind: 'pose', id: 'point', name: 'Disco point' },
  { stars: 12, kind: 'blade', id: 'lime', name: 'Lime blade' },
  { stars: 16, kind: 'suit', id: 'circuit', name: 'Circuit suit' },
  { stars: 20, kind: 'blade', id: 'gold', name: 'Gold blade' },
  { stars: 25, kind: 'suit', id: 'mirror', name: 'Mirror ball suit' },
  { stars: 30, kind: 'pose', id: 'glide', name: 'Space glide' },
  { stars: 36, kind: 'blade', id: 'violet', name: 'Violet blade' },
  { stars: 42, kind: 'suit', id: 'nebula', name: 'Nebula suit' },
  { stars: 50, kind: 'suit', id: 'comet', name: 'Comet suit' },
  { stars: 60, kind: 'blade', id: 'white', name: 'White-hot blade' },
  { stars: 70, kind: 'helmet', id: 'helmet', name: 'Robot pal helmet' },
  { stars: 85, kind: 'blade', id: 'prism', name: 'Prism blade' },
  { stars: 100, kind: 'suit', id: 'supernova', name: 'Supernova suit' },
];

export const BLADE_COLORS: Record<string, number> = {
  cyan: 0x2de8ff,
  pink: 0xff3dae,
  lime: 0xa8ff3e,
  gold: 0xffc93c,
  violet: 0x8668cf,
  white: 0xfff4fe,
  prism: 0xffffff,
};

export function totalStars(stars: Record<string, number>): number {
  let n = 0;
  for (const v of Object.values(stars)) if (Number.isFinite(v)) n += Math.max(0, Math.min(3, Math.floor(v)));
  return n;
}

export function unlocked(stars: number): Unlock[] {
  return UNLOCKS.filter((u) => u.stars <= stars);
}

/** What crossing from `before` to `after` stars unlocks. */
export function newUnlocks(before: number, after: number): Unlock[] {
  return UNLOCKS.filter((u) => u.stars > before && u.stars <= after);
}

/** The next thing to aim for. */
export function nextUnlock(stars: number): Unlock | null {
  return UNLOCKS.find((u) => u.stars > stars) ?? null;
}
