// The height of the road along the lap, h(s). The road never crosses itself,
// so every point near it maps to one distance along the lap and a height
// profile is well defined. Karts get a simulated height from it; collisions
// stay 2D.

import { TRACK_CURB, TRACK_WIDTH } from '../track.js';
import type { Raise, Seg, Tunnel } from './circuits.js';

export const EDGE = TRACK_WIDTH / 2 + TRACK_CURB;
/** The ground everywhere off the road, just under it (layer table). */
export const GROUND_Y = -0.04;
/** How far a verge runs out per metre of height (a 1 in 3 slope). */
export const VERGE_RUN = 3;

function ease(seg: Seg, s: number): number {
  const t = Math.min(1, Math.max(0, (s - seg.s0) / (seg.s1 - seg.s0)));
  const f = seg.ease === 'flat' ? 0 : seg.ease === 'smooth' ? t * t * (3 - 2 * t) : Math.pow(t, 2.2);
  return seg.h0 + (seg.h1 - seg.h0) * f;
}

export class Profile {
  readonly raises: Raise[];
  readonly tunnels: Tunnel[];

  constructor(
    readonly length: number,
    raises: Raise[] = [],
    tunnels: Tunnel[] = [],
  ) {
    this.raises = raises;
    this.tunnels = tunnels;
  }

  private wrap(s: number): number {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  /** The raise covering s (including its gap), if any. */
  raiseAt(s: number): Raise | null {
    const d = this.wrap(s);
    for (const r of this.raises) {
      const s0 = r.segs[0].s0;
      const s1 = r.segs[r.segs.length - 1].s1;
      if (d >= s0 && d <= s1) return r;
    }
    return null;
  }

  /** The gap at s, if the road is missing there. */
  gapAt(s: number): { s0: number; s1: number; floor: number } | null {
    const d = this.wrap(s);
    for (const r of this.raises) if (r.gap && d > r.gap.s0 && d < r.gap.s1) return r.gap;
    return null;
  }

  /** Road height at s (0 on flat road). Inside a gap this is the floor. */
  h(s: number): number {
    const d = this.wrap(s);
    for (const r of this.raises) {
      if (r.gap && d > r.gap.s0 && d < r.gap.s1) return r.gap.floor;
      for (const seg of r.segs) if (d >= seg.s0 && d <= seg.s1) return ease(seg, d);
    }
    return 0;
  }

  /** Rise per metre along the road at s. */
  slope(s: number): number {
    if (this.gapAt(s) || this.gapAt(s + 0.25) || this.gapAt(s - 0.25)) return 0;
    return (this.h(s + 0.25) - this.h(s - 0.25)) / 0.5;
  }

  /**
   * Height of whatever you would stand on at distance s and sideways offset
   * `off`: the road, a verge sloping down from a crest, or the floor.
   */
  ground(s: number, off: number): number {
    const a = Math.abs(off);
    const h = this.h(s);
    if (a <= EDGE) return h;
    const r = this.raiseAt(s);
    if (!r || r.sides === 'wall' || h <= 0) return 0;
    const run = Math.max(1, h * VERGE_RUN);
    const t = (a - EDGE) / run;
    return t >= 1 ? 0 : h * (1 - t);
  }

  /** Whether s is inside a raise with sheer sides (rails on both edges). */
  walled(s: number): boolean {
    const r = this.raiseAt(s);
    return !!r && r.sides === 'wall';
  }

  tunnelAt(s: number): Tunnel | null {
    const d = this.wrap(s);
    return this.tunnels.find((t) => d >= t.s0 && d <= t.s1) ?? null;
  }

  /** The highest point of the profile, for tests and camera framing. */
  get maxHeight(): number {
    let m = 0;
    for (const r of this.raises) for (const seg of r.segs) m = Math.max(m, seg.h0, seg.h1);
    return m;
  }
}
