import { describe, expect, it } from 'vitest';
import { newUnlocks, nextUnlock, totalStars, unlocked, UNLOCKS } from '../src/shared/neon/progress';
import { DANCE_SONGS, diffsFor } from '../src/shared/neon/charts';
import { DUELISTS } from '../src/shared/neon/duel';
import { NIGHTS } from '../src/shared/neon/night';
import { DEFAULTS, repair } from '../src/experiences/neon/save';
import { corners, LAYOUTS } from '../src/shared/neon/arena';
import { OVERLAY } from '../src/experiences/neon/station';

describe('stars and unlocks', () => {
  it('counts each challenge at most three stars', () => {
    expect(totalStars({ a: 3, b: 2, c: 7, d: -1, e: Number.NaN })).toBe(8);
  });

  it('has the launch star total the design promises', () => {
    const nights = NIGHTS.length * 9;
    const dance = DANCE_SONGS.reduce((n, s) => n + diffsFor(s).length * 3, 0);
    const duels = DUELISTS.length * 2 * 3;
    const tag = 3 * 3;
    expect(nights + dance + duels + tag).toBe(123);
  });

  it('unlocks in star order, with the starter kit free', () => {
    expect(unlocked(0).map((u) => u.id).sort()).toEqual(['cyan', 'starter', 'wave']);
    for (let i = 1; i < UNLOCKS.length; i++) expect(UNLOCKS[i].stars).toBeGreaterThanOrEqual(UNLOCKS[i - 1].stars);
    expect(newUnlocks(2, 7).map((u) => u.id)).toEqual(['pink', 'retro']);
    expect(nextUnlock(12)?.id).toBe('circuit');
    expect(nextUnlock(100)).toBeNull();
    expect(UNLOCKS.at(-1)!.stars).toBeLessThanOrEqual(123);
  });
});

describe('the save on this device', () => {
  it('fills a missing record with defaults', () => {
    expect(repair({})).toEqual(DEFAULTS);
  });

  it('repairs broken fields one by one', () => {
    const r = repair({
      sync: { offset: 9999, video: 'x', easyHolds: 'yes', checked: true } as never,
      stars: { a: 3, b: 'lots', c: 9 } as never,
      equipped: { suit: 'supernova', blade: 'pink', pose: 'nope', helmet: true } as never,
      nights: 99,
      night: { n: 2, stage: 1, scores: [100, 'x'], logs: [{}], at: 5, ticket: 7 } as never,
    });
    expect(r.sync.offset).toBe(300);
    expect(r.sync.video).toBe(0);
    expect(r.sync.easyHolds).toBe(false);
    expect(r.sync.checked).toBe(true);
    expect(r.stars).toEqual({ a: 3, c: 3 });
    // Six stars: the pink blade is owned, the Supernova suit and helmet are not.
    expect(r.equipped).toEqual({ suit: 'starter', blade: 'pink', pose: 'wave', helmet: false });
    expect(r.nights).toBe(5);
    expect(r.night).toEqual({ n: 2, stage: 1, scores: [100], logs: [{}], at: 5, ticket: null });
  });

  it('drops a malformed party night', () => {
    expect(repair({ night: { n: 'one' } as never }).night).toBeNull();
    expect(repair({ night: 'later' as never }).night).toBeNull();
  });
});

describe('z-fighting rules', () => {
  it('keeps flat overlays at least 8 mm apart where they overlap', () => {
    // The trim boxes are 2 cm tall and centred at their height.
    expect(OVERLAY.trim - 0.01 - OVERLAY.floor).toBeGreaterThan(0);
    expect(OVERLAY.trim + 0.01 - OVERLAY.floor).toBeGreaterThanOrEqual(0.008 + 0.01);
    expect(OVERLAY.starPad - OVERLAY.starPadBase).toBeGreaterThanOrEqual(0.008);
  });

  it('cover pieces never touch or share a face, and leave walking room', () => {
    const outline = (p: (typeof LAYOUTS)['prism'][number]): [number, number][] => (p.kind === 'pillar' ? Array.from({ length: 24 }, (_, i) => [p.x + Math.cos((i / 24) * Math.PI * 2) * p.hw, p.z + Math.sin((i / 24) * Math.PI * 2) * p.hw] as [number, number]) : corners(p));
    const segDist = (px: number, pz: number, a: [number, number], b: [number, number]) => {
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
    };
    const dist = (A: [number, number][], B: [number, number][]) => {
      let d = Infinity;
      for (const [x, z] of A) for (let i = 0; i < B.length; i++) d = Math.min(d, segDist(x, z, B[i], B[(i + 1) % B.length]));
      for (const [x, z] of B) for (let i = 0; i < A.length; i++) d = Math.min(d, segDist(x, z, A[i], A[(i + 1) % A.length]));
      return d;
    };
    for (const [id, pieces] of Object.entries(LAYOUTS)) {
      for (let i = 0; i < pieces.length; i++)
        for (let j = i + 1; j < pieces.length; j++) {
          const a = pieces[i];
          const b = pieces[j];
          // At least a player's width between any two pieces (no wedging, no shared faces).
          expect(dist(outline(a), outline(b)), `${id}: ${a.kind}@${a.x},${a.z} and ${b.kind}@${b.x},${b.z}`).toBeGreaterThan(0.8);
        }
    }
  });
});
