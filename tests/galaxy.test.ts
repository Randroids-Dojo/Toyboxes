import { describe, expect, it } from 'vitest';
import { box, circle, groundHeight, type Collider } from '../src/world/physics';
import {
  BH,
  CINDER,
  COMET_MOTES,
  DOCK,
  GAP_LAND,
  HUB,
  HUB_R,
  MISS_PENALTY_MS,
  RING,
  RING_BLOSSOMS,
  RING_FINISH_S,
  RING_GAPS,
  STAIR,
  arcAt,
  cinderTiles,
  crossesGate,
  frenzySchedule,
  frenzyTotal,
  hopArc,
  horizonRadius,
  netTriggered,
  orbSpotOk,
  ringBoxes,
  ringCoords,
  ringFromLog,
  ringGates,
  ringMinMs,
  ringPoint,
  ringSegmentMin,
  slingArc,
  starsFor,
  stormSchedule,
  stormTotal,
  type RingLog,
} from '../src/shared/galaxy-rules';
import { GALAXY_MAX_SCORE } from '../src/shared/model';
import { SCORE_MODES } from '../src/shared/score-modes';

const ringCols = (): Collider[] => ringBoxes().map((b) => box(b.x, b.z, b.hw, b.hd, b.rot, RING.top));

/** A believable run: walk the middle line at 6 m/s, lanes at their speed, every gate hit. */
function fakeRun(scale = 1): RingLog {
  const gates = ringGates();
  let t = 0;
  let s = 0;
  const splits: number[] = [];
  for (const g of [...gates.map((x) => x.s), RING_FINISH_S]) {
    t += ringSegmentMin(s, g) / 0.85 * 1.35 * scale + 40;
    s = g;
    splits.push(Math.round(t));
  }
  const finish = splits.pop()!;
  return { v: 1, splits, hits: gates.map(() => 1), finish };
}

describe('galaxy layout', () => {
  it('ring walkway covers the annulus except the gaps', () => {
    const cols = ringCols();
    for (let s = 0; s < 360; s += 2.5) {
      for (const r of [22.4, 25, 27.6]) {
        const p = ringPoint(s, r);
        const top = groundHeight(p.x, p.z, 0.25, cols, 7);
        const gap = RING_GAPS.some(([a, b]) => s > a + 1.5 && s < b - 1.5);
        expect(top, `s ${s} r ${r}`).toBe(gap ? 0 : RING.top);
      }
    }
    // The void between the planet and the walkway, and outside it.
    for (const r of [19, 30]) {
      const p = ringPoint(40, r);
      expect(groundHeight(p.x, p.z, 0.25, cols, 7)).toBe(0);
    }
  });

  it('ring coordinates round trip', () => {
    for (const s of [0, 45, 181, 359]) {
      const p = ringPoint(s, 24);
      const c = ringCoords(p.x, p.z);
      expect(c.s).toBeCloseTo(s, 5);
      expect(c.r).toBeCloseTo(24, 5);
    }
    // The start is the point nearest the hub.
    const start = ringPoint(0, RING.mid);
    expect(Math.hypot(start.x, start.z)).toBeCloseTo(Math.hypot(RING.cx, RING.cz) - RING.mid, 3);
  });

  it('no walkable top sits over another', () => {
    const tops: { x: number; z: number; r: number; name: string }[] = [
      { x: 0, z: 0, r: HUB_R + 0.6, name: 'hub' },
      { x: RING.cx, z: RING.cz, r: RING.outer, name: 'ring' },
      { x: CINDER.x, z: CINDER.z, r: CINDER.r, name: 'cinder' },
      { x: DOCK.x, z: DOCK.z, r: DOCK.r + 3, name: 'dock' },
      ...STAIR.map((s, i) => ({ ...s, name: `stone ${i}` })),
    ];
    for (let i = 0; i < tops.length; i++) {
      for (let j = i + 1; j < tops.length; j++) {
        const a = tops[i];
        const b = tops[j];
        expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.name} and ${b.name}`).toBeGreaterThan(a.r + b.r + 0.5);
      }
    }
    // The stair clears Ringworld by 4 m and ends near the black hole.
    for (const s of STAIR) expect(Math.hypot(s.x - RING.cx, s.z - RING.cz) - RING.outer - s.r).toBeGreaterThan(4);
    const lip = STAIR[STAIR.length - 1];
    expect(Math.hypot(lip.x - BH.x, lip.z - BH.z)).toBeLessThan(horizonRadius(12) + 4);
    // Stair gaps are easy hops: edge gaps under 2.5 m and steps of 1.2 m.
    for (let i = 1; i < STAIR.length; i++) {
      const a = STAIR[i - 1];
      const b = STAIR[i];
      expect(Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r).toBeLessThan(2.6);
      expect(b.y - a.y).toBeCloseTo(1.2, 5);
    }
  });

  it('cinder tiles leave no gaps a foot can fall through', () => {
    const tiles = cinderTiles();
    expect(tiles.length).toBeGreaterThan(80);
    const cols = tiles.map((t) => circle(CINDER.x + t.x, CINDER.z + t.z, 1.1, CINDER.top));
    for (let x = -7; x <= 7; x += 0.37) {
      for (let z = -7; z <= 7; z += 0.41) expect(groundHeight(CINDER.x + x, CINDER.z + z, 0.25, cols, 4)).toBe(CINDER.top);
    }
  });

  it('orbs never appear on pads or the shrine', () => {
    expect(orbSpotOk(HUB.shrine.x, HUB.shrine.z)).toBe(false);
    expect(orbSpotOk(HUB.slings.ring.x, HUB.slings.ring.z)).toBe(false);
    expect(orbSpotOk(0, -6)).toBe(true);
  });
});

describe('galaxy rounds', () => {
  it('frenzy schedule is fixed and fits the old board cap', () => {
    const a = frenzySchedule();
    expect(frenzySchedule()).toEqual(a);
    expect(a.length).toBeGreaterThan(40);
    expect(frenzyTotal(a)).toBeLessThanOrEqual(GALAXY_MAX_SCORE);
    expect(a.every((o) => orbSpotOk(o.x, o.z))).toBe(true);
    expect(a.some((o) => o.kind === 'gold') && a.some((o) => o.kind === 'moon')).toBe(true);
    expect(starsFor('frenzy', frenzyTotal(a))).toBe(3);
  });

  it('rock rain schedule is fixed, on the island and under the board cap', () => {
    const s = stormSchedule();
    expect(stormSchedule()).toEqual(s);
    expect(stormTotal(s)).toBeGreaterThan(40);
    const mode = SCORE_MODES.galaxy.find((m) => m.id === 'storm')!;
    expect(stormTotal(s)).toBe(mode.max);
    for (const m of s.meteors) expect(Math.hypot(m.dx, m.dz)).toBeLessThan(CINDER.r);
    for (const sh of s.shards) expect(Math.hypot(sh.dx, sh.dz)).toBeLessThan(CINDER.r - 1.5);
    expect(s.shards.filter((x) => x.big).length).toBe(3);
    // Easy start: no meteor in the first 2 s, gentle spacing for 15 s.
    expect(s.meteors[0].t).toBeGreaterThan(2);
    const early = s.meteors.filter((m) => m.t < 15).length;
    expect(early).toBeLessThan(11);
  });

  it('comet board is capped at every mote', () => {
    expect(SCORE_MODES.galaxy.find((m) => m.id === 'comet')!.max).toBe(COMET_MOTES);
  });
});

describe('ring run splits', () => {
  it('accepts a believable run and adds missed gates', () => {
    const run = fakeRun();
    expect(ringFromLog(run)).toBe(run.finish);
    const missed = { ...run, hits: run.hits.map((h, i) => (i === 3 || i === 20 ? 0 : h)) };
    expect(ringFromLog(missed)).toBe(run.finish + 2 * MISS_PENALTY_MS);
  });

  it('rejects impossible runs', () => {
    const run = fakeRun();
    expect(ringFromLog({ ...run, finish: run.splits[run.splits.length - 1] - 5 })).toBeNull();
    const fast = fakeRun(0.4);
    expect(ringFromLog(fast)).toBeNull();
    const swapped = { ...run, splits: run.splits.map((t, i) => (i === 5 ? run.splits[6] : i === 6 ? run.splits[5] : t)) };
    expect(ringFromLog(swapped)).toBeNull();
    expect(ringFromLog({ ...run, splits: run.splits.slice(1) })).toBeNull();
    expect(ringFromLog({ ...run, hits: run.hits.map(() => 2) })).toBeNull();
    expect(ringFromLog('nope')).toBeNull();
    expect(ringFromLog({ ...run, finish: 11 * 60_000 })).toBeNull();
  });

  it('the board minimum is below any real run and the stars are reachable', () => {
    const mode = SCORE_MODES.galaxy.find((m) => m.id === 'ring')!;
    expect(mode.min).toBe(ringMinMs());
    expect(ringMinMs()).toBeLessThan(40_000);
    expect(mode.ticket!.minMs).toBeLessThan(ringMinMs());
    expect(starsFor('ring', 53_000)).toBe(3);
    expect(starsFor('ring', 70_000)).toBe(1);
  });

  it('gates count hits, misses and only forward crossings', () => {
    const g = ringGates()[0];
    const mid = (g.r0 + g.r1) / 2;
    const a = ringPoint(g.s - 1, mid);
    const b = ringPoint(g.s + 1, mid);
    expect(crossesGate(a, b, g)).toBe('hit');
    expect(crossesGate(b, a, g)).toBeNull();
    const off = g.side === 'in' ? RING.outer - 0.5 : RING.inner + 0.5;
    expect(crossesGate(ringPoint(g.s - 1, off), ringPoint(g.s + 1, off), g)).toBe('miss');
    expect(ringGates()).toHaveLength(32);
    // Lap two swaps sides.
    expect(ringGates()[16].side).not.toBe(ringGates()[0].side);
  });

  it('blossom strips sit right before each gap', () => {
    RING_BLOSSOMS.forEach(([, b1], i) => expect(b1).toBe(RING_GAPS[i][0]));
    expect(GAP_LAND).toBeGreaterThan(2);
  });
});

describe('flights', () => {
  it('sling arcs end exactly on the pad and fly high over the void', () => {
    const from = { x: HUB.slings.ring.x, y: 0, z: HUB.slings.ring.z };
    const land = ringPoint(-6, RING.mid);
    const to = { x: land.x, y: RING.top, z: land.z };
    const arc = slingArc(from, to);
    const end = arcAt(arc, arc.duration + 0.1);
    expect(end).toMatchObject({ x: to.x, y: to.y, z: to.z, done: true });
    let peak = 0;
    for (let t = 0; t < arc.duration; t += 0.02) peak = Math.max(peak, arcAt(arc, t).y);
    expect(peak).toBeGreaterThan(RING.top + 5);
    // Never dips under the start or end height in the middle of the flight.
    for (let t = 0.2; t < arc.duration - 0.2; t += 0.05) expect(arcAt(arc, t).y).toBeGreaterThan(-0.01);
  });

  it('hops are never slower than walking the same way', () => {
    const a = hopArc({ x: 0, y: 6, z: 0 }, { x: 9, y: 6, z: 0 });
    expect(a.duration).toBeLessThan(9 / 6);
  });

  it('the star net catches falls, not jumps', () => {
    expect(netTriggered(3.4, false, 6, false)).toBe(true);
    expect(netTriggered(5, false, 6, false)).toBe(false);
    expect(netTriggered(0, true, 0, true)).toBe(false);
    expect(netTriggered(0, true, 3, false)).toBe(true);
  });

  it('the black hole grows to its cap', () => {
    expect(horizonRadius(0)).toBe(4.5);
    expect(horizonRadius(12)).toBe(12);
    expect(horizonRadius(15)).toBe(12);
  });
});

describe('comet surf', () => {
  it('the loop is long enough for a minute and stays clear of every solid', async () => {
    const { cometCurve, cometMotes, cometClouds, COMET_SECONDS } = await import('../src/shared/galaxy-rules');
    const c = cometCurve();
    expect(c.length / COMET_SECONDS).toBeGreaterThan(10);
    expect(c.length / COMET_SECONDS).toBeLessThan(18);
    for (let u = 0; u < 1; u += 0.001) {
      const p = c.at(u);
      const t = c.tube(u) + 1;
      const rr = Math.hypot(p.x - RING.cx, p.z - RING.cz);
      // The planet and its ring walkway.
      expect(Math.hypot(rr, p.y - RING.planetY), `planet at ${u}`).toBeGreaterThan(RING.planetR + t);
      if (rr > RING.inner - t && rr < RING.outer + t) expect(Math.abs(p.y - (RING.top - 0.5)), `ring at ${u}`).toBeGreaterThan(0.5 + t);
      // Island tops and the stair.
      for (const isl of [{ x: CINDER.x, z: CINDER.z, r: CINDER.r, y: CINDER.top }, { x: DOCK.x, z: DOCK.z, r: DOCK.r, y: DOCK.top }, ...STAIR]) {
        // Over the top, or well under its hanging roots.
        if (Math.hypot(p.x - isl.x, p.z - isl.z) < isl.r + t) expect(p.y - isl.y > t || isl.y - p.y > 14 + t, `island at ${u}`).toBe(true);
      }
      // The black hole.
      expect(Math.hypot(p.x - BH.x, p.y - BH.y, p.z - BH.z)).toBeGreaterThan(horizonRadius(12) + t + 2);
      // The hub's rail.
      if (Math.hypot(p.x, p.z) < HUB_R + 2) expect(p.y).toBeGreaterThan(t + 2);
    }
    const motes = cometMotes();
    expect(motes).toHaveLength(COMET_MOTES);
    expect(new Set(motes.map((m) => m.ribbon)).size).toBe(24);
    for (const m of motes) expect(Math.hypot(m.ox, m.oy)).toBeLessThanOrEqual(c.tube(m.u) + 1e-6);
    expect(cometClouds()).toHaveLength(8);
    // It starts and ends at the dock.
    const start = c.at(0);
    expect(Math.hypot(start.x - DOCK.x, start.z - DOCK.z)).toBeLessThan(DOCK.r + 3);
  });
});
