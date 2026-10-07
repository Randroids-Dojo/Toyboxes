import { describe, expect, it } from 'vitest';
import { apex, boostVy, CHARGE_FULL, GAS, GRAVITY, HOLD_START, JUMP_SPEED, rocketCost, rocketVy, Tank, TootButton, type ButtonIn, type Move } from '../src/experiences/fart/sim/gas';
import { Clouds } from '../src/experiences/fart/sim/clouds';

const H = 1 / 60;
const base: ButtonIn = { dt: H, pressed: false, held: false, grounded: true, moving: false, tapMode: false, empty: false, gas: 'beans' };

function run(btn: TootButton, steps: Partial<ButtonIn>[]): Move[] {
  const out: Move[] = [];
  for (const s of steps) out.push(...btn.step({ ...base, ...s }));
  return out;
}

/** Integrates a launch at 60 Hz with the engine's gravity; returns the apex height. */
function flight(vy: number): number {
  let y = 0;
  let v = vy;
  let top = 0;
  for (let i = 0; i < 600 && (v > 0 || y > 0); i++) {
    v -= GRAVITY * H;
    y += v * H;
    top = Math.max(top, y);
    if (y < 0) break;
  }
  return top;
}

describe('toot moves', () => {
  it('hop heights match the design per gas', () => {
    expect(apex(GAS.beans.hopVy)).toBeCloseTo(0.75, 2);
    // The engine steps at 60 Hz, which lands a little under the exact apex.
    expect(flight(GAS.beans.hopVy)).toBeCloseTo(0.72, 1);
    expect(apex(GAS.fizzy.hopVy)).toBeCloseTo(0.52, 2);
    expect(apex(GAS.cabbage.hopVy)).toBeCloseTo(0.42, 2);
  });

  it('a bean boost at the top of a jump adds about 2.1 m; two reach over 5 m', () => {
    const jump = apex(JUMP_SPEED);
    expect(apex(boostVy('beans', 0))).toBeCloseTo(2.08, 1);
    expect(jump + 2 * apex(boostVy('beans', 0))).toBeGreaterThan(5.3);
    // Rising speed only carries over in part, so mashing early is no better.
    expect(boostVy('beans', 7.6)).toBeLessThan(12.5);
    expect(boostVy('fizzy', 3)).toBe(5);
    expect(apex(boostVy('cabbage', 0))).toBeCloseTo(1.0, 1);
  });

  it('a full bean rocket reaches about 8.3 m and costs more the longer you hold', () => {
    expect(apex(rocketVy('beans', 1))).toBeCloseTo(8.33, 1);
    expect(apex(rocketVy('beans', 0))).toBeCloseTo(3.52, 1);
    expect(rocketCost(1)).toBe(40);
    expect(rocketCost(0)).toBe(25);
  });

  it('a tap on the ground hops on release; walking scoots at once', () => {
    const b = new TootButton();
    const moves = run(b, [{ pressed: true, held: true }, { held: true }, { held: false }]);
    expect(moves.map((m) => m.kind)).toEqual(['hop']);
    expect(run(new TootButton(), [{ pressed: true, held: true, moving: true }]).map((m) => m.kind)).toEqual(['scoot']);
  });

  it('holding still charges a big one that fires on release with the charge', () => {
    const b = new TootButton();
    const steps: Partial<ButtonIn>[] = [{ pressed: true, held: true }];
    for (let i = 0; i < Math.ceil(CHARGE_FULL / H) + 5; i++) steps.push({ held: true });
    steps.push({ held: false });
    const moves = run(b, steps);
    expect(moves.map((m) => m.kind)).toEqual(['charge', 'rocket']);
    expect((moves[1] as { charge: number }).charge).toBeCloseTo(1, 2);
    // Half a charge.
    const b2 = new TootButton();
    const s2: Partial<ButtonIn>[] = [{ pressed: true, held: true }];
    for (let i = 0; i < Math.round((HOLD_START + (CHARGE_FULL - HOLD_START) / 2) / H); i++) s2.push({ held: true });
    s2.push({ held: false });
    const m2 = run(b2, s2);
    expect((m2[1] as { charge: number }).charge).toBeGreaterThan(0.4);
    expect((m2[1] as { charge: number }).charge).toBeLessThan(0.6);
  });

  it('in the air: beans boost twice, cabbage once, fizzy flutters; holding hovers', () => {
    const beans = new TootButton();
    const air = { grounded: false };
    expect(run(beans, [{ ...air, pressed: true }, { ...air }, { ...air, pressed: true }, { ...air }, { ...air, pressed: true }]).map((m) => m.kind)).toEqual(['boost', 'boost', 'hover']);
    const cab = new TootButton();
    expect(run(cab, [{ ...air, gas: 'cabbage', pressed: true }, { ...air, gas: 'cabbage' }, { ...air, gas: 'cabbage', pressed: true }]).map((m) => m.kind)).toEqual(['boost', 'hover']);
    const fizzy = new TootButton();
    const taps = Array.from({ length: 6 }, (_, i) => ({ ...air, gas: 'fizzy' as const, pressed: i % 2 === 0 }));
    expect(run(fizzy, taps).filter((m) => m.kind === 'boost').length).toBe(3);
    // Hold after a boost: hover, and letting go ends it; landing ends it too.
    const h = new TootButton();
    const steps: Partial<ButtonIn>[] = [{ ...air, pressed: true, held: true }];
    for (let i = 0; i < 20; i++) steps.push({ ...air, held: true });
    steps.push({ ...air, held: false });
    expect(run(h, steps).map((m) => m.kind + ('on' in m ? (m.on ? '+' : '-') : ''))).toEqual(['boost', 'hover+', 'hover-']);
    const land = new TootButton();
    const s3: Partial<ButtonIn>[] = [{ ...air, pressed: true, held: true }];
    for (let i = 0; i < 20; i++) s3.push({ ...air, held: true });
    s3.push({ grounded: true, held: true });
    expect(run(land, s3).pop()).toEqual({ kind: 'hover', on: false });
  });

  it('tap mode: a double tap fires a full big one; taps toggle the hover', () => {
    const b = new TootButton();
    expect(run(b, [{ tapMode: true, pressed: true }, { tapMode: true }, { tapMode: true, pressed: true }]).map((m) => m.kind)).toEqual(['rocket']);
    const single = new TootButton();
    const steps: Partial<ButtonIn>[] = [{ tapMode: true, pressed: true }];
    for (let i = 0; i < 25; i++) steps.push({ tapMode: true });
    expect(run(single, steps).map((m) => m.kind)).toEqual(['hop']);
    const hov = new TootButton();
    const air = { grounded: false, tapMode: true };
    const out = run(hov, [{ ...air, pressed: true }, { ...air }, { ...air, pressed: true }, { ...air }, { ...air, pressed: true }, { ...air }, { ...air, pressed: true }]);
    expect(out.map((m) => m.kind + ('on' in m ? (m.on ? '+' : '-') : ''))).toEqual(['boost', 'boost', 'hover+', 'hover-']);
  });

  it('an empty tummy says eep instead', () => {
    expect(run(new TootButton(), [{ pressed: true, empty: true }]).map((m) => m.kind)).toEqual(['empty']);
    expect(run(new TootButton(), [{ pressed: true, gas: null }]).map((m) => m.kind)).toEqual(['empty']);
  });

  it('the tank: eating sets the gas and fills it; crumbs top up a little', () => {
    const t = new Tank();
    expect(t.empty).toBe(true);
    t.crumb();
    expect(t.gas).toBe('beans');
    expect(t.amount).toBe(15);
    t.eat('fizzy');
    expect(t.gas).toBe('fizzy');
    expect(t.amount).toBe(100);
    t.spend(150);
    expect(t.amount).toBe(0);
    expect(t.empty).toBe(true);
  });
});

describe('clouds', () => {
  it('grow, drift with the wind, carry stink and fade away', () => {
    const c = new Clouds();
    c.wind = { x: 1, z: 0 };
    const cloud = c.add('cabbage', 0, 1, 0);
    expect(c.stinkAt(0, 1, 0)).toBeGreaterThan(0);
    for (let i = 0; i < 60 * 3; i++) c.step(1 / 60);
    expect(cloud.r).toBeGreaterThan(1.8);
    expect(cloud.x).toBeGreaterThan(2);
    expect(c.stinkAt(cloud.x, 1, cloud.z)).toBeGreaterThan(c.stinkAt(cloud.x - 6, 1, cloud.z));
    for (let i = 0; i < 60 * 20; i++) c.step(1 / 60);
    expect(c.list.length).toBe(0);
  });

  it('fizzy clouds barely smell and the strongest cloud is found for blame', () => {
    const c = new Clouds();
    const a = c.add('fizzy', 0, 1, 0);
    const b = c.add('cabbage', 0.5, 1, 0);
    expect(a.stink).toBeLessThan(b.stink);
    expect(c.strongestAt(0.3, 1, 0)).toBe(b);
  });
});
