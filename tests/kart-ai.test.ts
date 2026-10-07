// The computer drivers, headless: on every circuit and class they keep
// lapping on the road (with the deck and ramp rails as walls), and the same
// seed replays the same race.

import { describe, expect, it } from 'vitest';

// The karts paint a blob-shadow texture on a canvas; give them a do-nothing one.
const ctx2d = new Proxy(
  {},
  {
    get: (_t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 10 }) : () => {}),
    set: () => true,
  },
);
(globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d }) };

const { CUP } = await import('../src/shared/kart/circuits');
const { CLASSES, rng } = await import('../src/shared/kart/rules');
const { Circuit, EDGE } = await import('../src/experiences/kart/circuit');
const { DRIVERS } = await import('../src/experiences/kart/drivers');
const { RaceKart } = await import('../src/experiences/kart/racekart');
const { newRacer, progress } = await import('../src/experiences/kart/racer');
const { driveCpu } = await import('../src/experiences/kart/ai');
const { buildRoad } = await import('../src/experiences/kart/build/road');
const { Batch } = await import('../src/experiences/kart/build/shape');
const THREE = await import('three');

type Racer = ReturnType<typeof newRacer>;

/** A grid of seven drivers racing `seconds` from the line, as the world steps them. */
function race(id: (typeof CUP)[number], cls: keyof typeof CLASSES, seed: number, seconds: number) {
  const c = new Circuit(id, [], 3);
  const colliders: Parameters<typeof buildRoad>[3] = [];
  const m = new THREE.MeshBasicMaterial();
  buildRoad(c, new Batch(), { surface: () => 'road', materials: { road: m }, curb: m, side: {}, rail: m }, colliders);
  const rnd = rng(seed);
  const racers: Racer[] = DRIVERS.map((def, i) => {
    const g = c.grid(i);
    const k = new RaceKart(def.id, g.x, g.z, g.yaw, def.kart, def.body, CLASSES[cls]);
    const r = newRacer(def.id, def.name, def.kart, k, def, null);
    r.ai.phase = rnd() * 10;
    r.s = g.s;
    r.hint = c.idx(g.s);
    r.toLine = c.length - g.s;
    return r;
  });
  const you = racers[racers.length - 1];
  const world = {
    c,
    cls: CLASSES[cls],
    racers,
    you,
    rnd,
    racing: true,
    items: false,
    threat: () => null,
    useItem: () => {},
    danger: () => null,
  };
  const dt = 1 / 60;
  const off = new Map<string, number>();
  const offMax = new Map<string, number>();
  for (let step = 0; step < seconds * 60; step++) {
    for (const r of racers) {
      driveCpu(r, world, dt, colliders);
      const k = r.kart;
      let n = c.path.nearest(k.pos.x, k.pos.z, r.hint, 8);
      if (n.dist > EDGE + 6) n = c.path.nearest(k.pos.x, k.pos.z);
      const ds = c.path.delta(r.s, n.s);
      if (Math.abs(ds) < 30) r.raced += ds;
      r.s = n.s;
      r.hint = n.index;
      r.off = n.offset;
      k.onRoad = n.dist < EDGE + 0.3 && !c.profile.gapAt(n.s);
      k.grip = k.onRoad || k.air ? 1 : 0.5;
      k.stepHeight(dt, c.profile.ground(n.s, n.offset), !!c.profile.gapAt(n.s) && n.dist < EDGE + 0.4);
      const o = k.onRoad || k.air ? 0 : (off.get(r.id) ?? 0) + dt;
      off.set(r.id, o);
      offMax.set(r.id, Math.max(offMax.get(r.id) ?? 0, o));
    }
  }
  return racers.map((r) => ({ id: r.id, laps: progress(r) / c.length, offMax: offMax.get(r.id) ?? 0 }));
}

describe('computer drivers', () => {
  for (const id of CUP) {
    for (const cls of ['windup', 'rocket'] as const) {
      it(`keep lapping ${id} on ${cls}`, () => {
        const out = race(id, cls, 7, 90);
        for (const r of out) {
          expect(r.laps, `${r.id} laps`).toBeGreaterThan(1.5);
          expect(r.offMax, `${r.id} off the road`).toBeLessThan(1.6);
        }
      });
    }
  }

  it('replay the same race from the same seed', () => {
    const a = race('picnic', 'battery', 99, 30);
    const b = race('picnic', 'battery', 99, 30);
    expect(b.map((r) => r.laps.toFixed(4))).toEqual(a.map((r) => r.laps.toFixed(4)));
  });
});
