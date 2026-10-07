// A small seeded random source so every simulation in the village can be
// replayed exactly in tests and fast-forwards.

export type Rng = () => number;

/** mulberry32: fast, decent, deterministic. */
export function rng(seed: number): Rng {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function between(r: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * r();
}

export function pickOne<T>(r: Rng, list: readonly T[]): T {
  return list[Math.floor(r() * list.length) % list.length];
}

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/** Smoothing factor for a time step, as in the engine. */
export function ease(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt);
}
