import { describe, expect, it } from 'vitest';
import { ARRIVAL, BALLOON, CRUMBS, EXIT, GNOMES, LAMPS, SPOTS, balloonSlice, balloonTop, canopies, perches, villageBoxes, villageCircles, type LBox } from '../src/experiences/fart/layout';
import { Bodies, tinPyramid } from '../src/experiences/fart/sim/props';
import { rng } from '../src/experiences/fart/sim/rng';
import { MISCHIEF, Mischief } from '../src/experiences/fart/sim/mischief';
import { Town, canSeePlayer, pickCulprit, type BrainSpec, type Senses } from '../src/experiences/fart/sim/people';
import { blockers, segmentBlocked } from '../src/experiences/fart/sim/sight';
import { Flock } from '../src/experiences/fart/sim/flock';
import { VILLAGERS } from '../src/experiences/fart/cast';
import { apex, JUMP_SPEED, rocketVy, boostVy } from '../src/experiences/fart/sim/gas';

/** World-space corners of a (possibly rotated) box. */
function faces(b: LBox): { axis: 'x' | 'z' | 'y'; at: number; lo: [number, number]; hi: [number, number]; dir: number }[] {
  if (b.rot) return [];
  return [
    { axis: 'x', at: b.x - b.hw, lo: [b.z - b.hd, 0], hi: [b.z + b.hd, b.h], dir: -1 },
    { axis: 'x', at: b.x + b.hw, lo: [b.z - b.hd, 0], hi: [b.z + b.hd, b.h], dir: 1 },
    { axis: 'z', at: b.z - b.hd, lo: [b.x - b.hw, 0], hi: [b.x + b.hw, b.h], dir: -1 },
    { axis: 'z', at: b.z + b.hd, lo: [b.x - b.hw, 0], hi: [b.x + b.hw, b.h], dir: 1 },
    { axis: 'y', at: b.h, lo: [b.x - b.hw, b.z - b.hd], hi: [b.x + b.hw, b.z + b.hd], dir: 1 },
  ];
}

function overlap(a: { lo: [number, number]; hi: [number, number] }, b: { lo: [number, number]; hi: [number, number] }): boolean {
  return Math.min(a.hi[0], b.hi[0]) - Math.max(a.lo[0], b.lo[0]) > 1e-3 && Math.min(a.hi[1], b.hi[1]) - Math.max(a.lo[1], b.lo[1]) > 1e-3;
}

function inside(x: number, z: number, y = 0.5): boolean {
  for (const b of villageBoxes()) {
    if (y >= b.h) continue;
    const c = Math.cos(-(b.rot ?? 0));
    const s = Math.sin(-(b.rot ?? 0));
    const dx = x - b.x;
    const dz = z - b.z;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) < b.hw + 0.3 && Math.abs(lz) < b.hd + 0.3) return true;
  }
  for (const c of villageCircles()) if (y < c.h && Math.hypot(x - c.x, z - c.z) < c.r + 0.3) return true;
  return false;
}

describe('the village layout', () => {
  it('has no two boxes with coplanar overlapping faces pointing the same way (no z-fighting)', () => {
    const boxes = villageBoxes().filter((b) => b.h < 30);
    const bad: string[] = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        for (const fa of faces(boxes[i]))
          for (const fb of faces(boxes[j])) {
            if (fa.axis !== fb.axis || fa.dir !== fb.dir || Math.abs(fa.at - fb.at) > 1e-3) continue;
            if (overlap(fa, fb)) bad.push(`${boxes[i].id}/${boxes[j].id} ${fa.axis}`);
          }
      }
    expect(bad).toEqual([]);
  });

  it('keeps the arrival camera ray clear of anything that blocks the camera', () => {
    // The follow camera sits about 6 m behind and 2 to 4 m up, looking north.
    const cams = [{ x: 0, y: 3, z: ARRIVAL.z + 6.2 }, { x: 1.5, y: 2.5, z: ARRIVAL.z + 5.8 }, { x: -1.5, y: 4, z: ARRIVAL.z + 5.5 }];
    for (const cam of cams) {
      for (let k = 0; k <= 20; k++) {
        const t = k / 20;
        const x = ARRIVAL.x + (cam.x - ARRIVAL.x) * t;
        const z = ARRIVAL.z + (cam.z - ARRIVAL.z) * t;
        const y = 1.25 + (cam.y - 1.25) * t;
        for (const b of villageBoxes()) if (b.cam !== false && y < b.h && Math.abs(x - b.x) < b.hw && Math.abs(z - b.z) < b.hd) throw new Error(`${b.id} blocks the arrival camera`);
        for (const c of villageCircles()) if (c.cam !== false && y < c.h && Math.hypot(x - c.x, z - c.z) < c.r) throw new Error(`${c.id} blocks the arrival camera`);
      }
    }
    // Nothing taller than 1.6 m within 4 m of the camera ray at the arrival.
    for (const b of villageBoxes()) if (b.h > 1.7 && b.h < 30 && Math.abs(b.x) < 3 + b.hw && b.z > ARRIVAL.z - 1 && b.z < ARRIVAL.z + 6) throw new Error(`${b.id} crowds the arrival`);
  });

  it('puts every spot you can use somewhere you can stand, clear of the exit', () => {
    for (const [id, s] of Object.entries(SPOTS)) {
      expect(inside(s.x, s.z), `${id} is inside something`).toBe(false);
      expect(Math.hypot(s.x - EXIT.x, s.z - EXIT.z), `${id} is too close to the exit`).toBeGreaterThan(s.range + 1.7);
    }
    expect(inside(ARRIVAL.x, ARRIVAL.z)).toBe(false);
    expect(Math.hypot(ARRIVAL.x - EXIT.x, ARRIVAL.z - EXIT.z)).toBeGreaterThan(1.8);
    for (const l of LAMPS) expect(inside(l.x + 0.6, l.z) && inside(l.x - 0.6, l.z) && inside(l.x, l.z + 0.6) && inside(l.x, l.z - 0.6)).toBe(false);
  });

  it('every perch is reachable with the moves (a rocket plus two boosts from the ground or a lower perch)', () => {
    const reach = apex(rocketVy('beans', 1)) + 2 * apex(boostVy('beans', 0));
    const tops = perches().filter((p) => p.h > 1.2 && !p.id.includes('-wall-'));
    const levels = [0, ...tops.map((t) => t.h)].sort((a, b) => a - b);
    for (const p of tops) {
      // A lower perch (or the ground) within reach below it.
      const below = levels.filter((l) => l < p.h);
      expect(p.h - below[below.length - 1] <= reach || p.h <= reach, `${p.id} at ${p.h} m`).toBe(true);
    }
    expect(apex(JUMP_SPEED) + apex(boostVy('beans', 0))).toBeGreaterThan(1.6);
  });

  it('crumbs float in the open and gnomes stand on the ground or a roof', () => {
    for (const [x, y, z] of CRUMBS) expect(inside(x, z, y), `crumb at ${x},${y},${z}`).toBe(false);
    for (const g of GNOMES) expect(g.y === 0 || g.y === 4.5 || g.y === 7.5).toBe(true);
  });

  it('the balloon is bouncy on top and solid at the sides', () => {
    expect(balloonTop(BALLOON.x, BALLOON.z)).toBeCloseTo(BALLOON.cy + BALLOON.r);
    expect(balloonTop(BALLOON.x + BALLOON.r + 0.1, BALLOON.z)).toBeNull();
    expect(balloonSlice(BALLOON.cy)).toBeCloseTo(BALLOON.r);
    expect(balloonSlice(BALLOON.cy + BALLOON.r + 1)).toBe(0);
    for (const c of canopies()) expect(c.bounce).toBeGreaterThanOrEqual(9);
  });
});

describe('props', () => {
  it('one blast at the base of the tin tower brings the tins down, the same way every time', () => {
    const go = (seed: number) => {
      const b = new Bodies();
      const tins = tinPyramid(4.6, 0.8, 21.2).map((p) => b.add('tin', p.x, p.y, p.z, 0.12));
      const floor = (x: number, z: number, y: number) => (Math.abs(x - 4.6) < 0.65 && Math.abs(z - 21.2) < 0.65 && y >= 0.75 ? 0.8 : 0);
      b.blast(3.6, 0.9, 21.2, 2.9, 5, rng(seed));
      for (let i = 0; i < 300; i++) b.step(1 / 60, floor);
      return tins.map((t) => [+t.x.toFixed(3), +t.y.toFixed(3), +t.z.toFixed(3)]);
    };
    const a = go(3);
    expect(go(3)).toEqual(a);
    const down = a.filter(([x, y, z]) => y < 0.75 || Math.hypot(x - 4.6, z - 21.2) > 0.8).length;
    expect(down).toBeGreaterThanOrEqual(12);
  });
});

describe('mischief', () => {
  it('each of the fifteen items fires from its events, exactly once', () => {
    const m = new Mischief();
    const fire = (e: Parameters<Mischief['on']>[0]) => m.on(e);
    expect(fire({ kind: 'cup' })).toBe('tea');
    expect(fire({ kind: 'cup' })).toBeNull();
    expect(fire({ kind: 'tins', down: 11 })).toBeNull();
    expect(fire({ kind: 'tins', down: 12 })).toBe('tins');
    expect(fire({ kind: 'hat' })).toBe('hat');
    expect(fire({ kind: 'pigeons', n: 9 })).toBeNull();
    expect(fire({ kind: 'pigeons', n: 10 })).toBe('pigeons');
    expect(fire({ kind: 'fountain' })).toBe('fountain');
    expect(fire({ kind: 'pip', gas: 'beans' })).toBeNull();
    expect(fire({ kind: 'pip', gas: 'fizzy' })).toBeNull();
    expect(fire({ kind: 'pip', gas: 'cabbage' })).toBe('pip');
    expect(fire({ kind: 'laundry' })).toBe('laundry');
    expect(fire({ kind: 'bell' })).toBe('bell');
    expect(fire({ kind: 'balloon' })).toBe('balloon');
    expect(fire({ kind: 'blame', target: 'player' })).toBeNull();
    expect(fire({ kind: 'blame', target: 'biscuit' })).toBe('biscuit');
    expect(fire({ kind: 'blame', target: 'mayor' })).toBe('mayor');
    expect(fire({ kind: 'fled', id: 'primrose', t: 10 })).toBeNull();
    expect(fire({ kind: 'fled', id: 'wimble', t: 50 })).toBeNull();
    expect(fire({ kind: 'fled', id: 'primrose', t: 60 })).toBe('teagarden');
    for (const t of [1, 1.6, 2.2]) expect(fire({ kind: 'beat', offset: 0.05, t })).toBeNull();
    expect(fire({ kind: 'beat', offset: 0.3, t: 2.8 })).toBeNull();
    for (const t of [3.4, 4, 4.6]) expect(fire({ kind: 'beat', offset: -0.05, t })).toBeNull();
    expect(fire({ kind: 'beat', offset: 0.1, t: 5.2 })).toBe('band');
    expect(fire({ kind: 'gnomes', down: 8 })).toBe('gnomes');
    expect(fire({ kind: 'escaped' })).toBe('escape');
    expect(m.done.size).toBe(MISCHIEF.length);
    expect(m.next()).toBeNull();
  });
});

describe('townsfolk', () => {
  const open: Senses = { sees: () => true, stinkAt: () => 0, cloudAt: () => null, player: { x: 0, y: 0, z: 0 } };
  const spec = (id: string, x: number, z: number, extra: Partial<BrainSpec> = {}): BrainSpec => ({ id, route: [{ x, z, wait: 999, yaw: Math.PI }], speed: 1, voice: 200, ...extra });

  it('do a double take close to a toot and just look further away, with a cooldown', () => {
    const t = new Town([spec('near', 0, 2), spec('far', 0, 9)], rng(1));
    t.hear({ x: 0, z: 0, noise: 12, gas: 'beans', big: false }, open);
    expect(t.get('near')!.mood).toBe('startled');
    expect(t.get('far')!.mood).toBe('look');
    const e = t.takeEvents();
    expect(e.some((x) => x.kind === 'blame' && x.target === 'player')).toBe(true);
    t.hear({ x: 0, z: 0, noise: 12, gas: 'beans', big: false }, open);
    expect(t.takeEvents().filter((x) => x.kind === 'startle').length).toBe(0);
  });

  it('blame the nearest visible person, so a hidden toot can frame the dog', () => {
    const t = new Town([spec('lady', 0, 4), spec('biscuit', 1, 1, { suspect: true })], rng(1));
    const lady = t.get('lady')!;
    const hidden: Senses = { ...open, sees: (_ax, _az, bx) => bx !== -1 };
    expect(pickCulprit(lady, { x: 0, z: 0 }, t.people, { x: -1, z: 0 }, hidden, false)).toBe('biscuit');
    expect(pickCulprit(lady, { x: 0, z: 0 }, t.people, { x: -0.2, z: 0 }, open, true)).toBe('player');
    // Behind someone, you are out of sight.
    lady.yaw = 0;
    expect(canSeePlayer(lady, { x: 0, y: 0, z: -2 }, open)).toBe(false);
    expect(canSeePlayer(lady, { x: 0, y: 0, z: 8 }, open)).toBe(true);
  });

  it('smell a cloud, say pee-yew, and walk out of it', () => {
    const t = new Town([spec('primrose', 0, 0)], rng(2));
    const smelly: Senses = { ...open, player: { x: 20, y: 0, z: 20 }, stinkAt: () => 1, cloudAt: () => ({ x: 0.5, z: 0 }) };
    for (let i = 0; i < 60 * 3; i++) t.step(1 / 60, smelly);
    const b = t.get('primrose')!;
    expect(['flee', 'peeyew']).toContain(b.mood);
    expect(t.takeEvents().some((e) => e.kind === 'say' && e.say.text === 'Pee-yew!')).toBe(true);
    expect(b.x).toBeLessThan(0);
  });

  it('the constable chases after three fusses and gives up when you hide', () => {
    const t = new Town([spec('bobbins', 0, 0), spec('lady', 2, 0)], rng(3));
    const senses: Senses = { ...open, player: { x: 5, y: 0, z: 0 } };
    for (let k = 0; k < 3; k++) {
      t.hear({ x: 2, z: 1, noise: 12, gas: 'beans', big: false }, senses);
      for (let i = 0; i < 60 * 3; i++) t.step(1 / 60, { ...senses, player: { x: 30, y: 0, z: 30 } });
    }
    expect(t.chase.on).toBe(true);
    const hidden: Senses = { ...senses, sees: () => false, player: { x: 30, y: 0, z: 30 } };
    for (let i = 0; i < 60 * 9; i++) t.step(1 / 60, hidden);
    expect(t.chase.on).toBe(false);
    expect(t.chase.escaped).toBe(true);
  });

  it('buildings block sight lines; the open green does not', () => {
    const b = blockers();
    expect(segmentBlocked(b, 19, -10, 19, -28)).toBe(true);
    expect(segmentBlocked(b, -6, 6, 6, 6)).toBe(false);
  });

  it('the cast starts somewhere you can walk', () => {
    for (const v of VILLAGERS) expect(inside(v.route[0].x, v.route[0].z, 0.5) && !v.seated, v.id).toBe(false);
  });

  it('pigeons scatter from a close toot and land again', () => {
    const f = new Flock({ x: 0, z: 0 }, 12, 2, rng(4));
    expect(f.scatter(0, 0, 5)).toBe(12);
    for (let i = 0; i < 60 * 15; i++) f.step(1 / 60);
    expect(f.flying).toBe(0);
  });
});
