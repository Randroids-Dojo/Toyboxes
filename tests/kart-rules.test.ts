import { describe, expect, it } from 'vitest';
import { CIRCUITS, CUP, circuitLine } from '../src/shared/kart/circuits';
import { GhostRecorder, decodeGhost, ghostAt, lapProblem, type Ghost } from '../src/shared/kart/ghost';
import { BODIES, CLASSES, HITS, ITEMS, ODDS, boardMinLapMs, cupOrder, medalFor, pointsFor, rng, rollItem } from '../src/shared/kart/rules';
import { TrackPath } from '../src/shared/track';

describe('kart rules', () => {
  it('scores a cup 10, 8, 6, 5, 4, 3, 2, 1', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(pointsFor)).toEqual([10, 8, 6, 5, 4, 3, 2, 1]);
    expect(pointsFor(9)).toBe(0);
  });

  it('breaks cup ties on the last race', () => {
    const order = cupOrder([
      { id: 'a', points: 20, last: 3 },
      { id: 'b', points: 20, last: 1 },
      { id: 'c', points: 24, last: 5 },
    ]);
    expect(order.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('has item odds rows that sum to 100 and never give the leader a plane', () => {
    for (const row of Object.values(ODDS)) expect(ITEMS.reduce((a, id) => a + row[id], 0)).toBe(100);
    for (let r = 0; r < 1; r += 0.01) expect(rollItem(1, 8, r)).not.toBe('plane');
    expect(rollItem(8, 8, 0.99)).toBe('plane');
  });

  it('keeps hits short and classes in order', () => {
    expect(HITS.spin.stun).toBeLessThan(1);
    expect(HITS.immune).toBeGreaterThan(HITS.spin.stun);
    expect(CLASSES.windup.top).toBeLessThan(CLASSES.battery.top);
    expect(CLASSES.battery.top).toBeLessThan(CLASSES.rocket.top);
    for (const b of Object.values(BODIES)) expect(Math.abs(b.top - 1)).toBeLessThanOrEqual(0.0301);
  });

  it('awards medals by time', () => {
    const m = CIRCUITS.blocktown.medals;
    expect(medalFor(m[0] + 1, m)).toBe(0);
    expect(medalFor(m[0], m)).toBe(1);
    expect(medalFor(m[2] - 1, m)).toBe(3);
    expect(medalFor(m[3] - 500, m)).toBe(4);
  });

  it('replays the same numbers from the same seed', () => {
    const a = rng(42);
    const b = rng(42);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

/** Drives the centre line at a steady speed and records the lap as the browser does. */
function centreLap(flat: number[], speed: number, opts: { offset?: number; skip?: [number, number]; swing?: boolean } = {}): Ghost {
  const path = new TrackPath(flat);
  const L = path.length;
  const rec = new GhostRecorder('blocktown', 'classic');
  const dt = 1 / 60;
  let s = 0.5;
  let t = 0;
  const p0 = path.at(s, opts.offset ?? 0);
  rec.start(p0.x, p0.z);
  while (s < L + 0.5) {
    s += speed * dt;
    t += dt;
    if (opts.skip && s > opts.skip[0]) {
      // Cut straight across the infield at the same speed.
      const a = path.at(opts.skip[0]);
      const b = path.at(opts.skip[1]);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let d = 0; d < len; d += speed * dt) {
        t += dt;
        rec.step(dt, a.x + ((b.x - a.x) * d) / len, a.z + ((b.z - a.z) * d) / len);
      }
      s = opts.skip[1];
      opts = { ...opts, skip: undefined };
    }
    // A swing out onto the grass along the main straight and back.
    const off = opts.swing && s > 2 && s < 72 ? 9 * Math.sin((Math.PI * (s - 2)) / 70) : (opts.offset ?? 0);
    const q = path.at(s, off);
    rec.step(dt, q.x, q.z);
  }
  const q = path.at(s, opts.offset ?? 0);
  const ms = Math.round(t * 1000);
  return rec.finish(q.x, q.z, ms)!;
}

describe('kart lap ghosts', () => {
  const flat = circuitLine('blocktown');
  const L = new TrackPath(flat).length;

  it('round-trips a lap', () => {
    const g = centreLap(flat, 15);
    const pts = decodeGhost(g);
    const start = new TrackPath(flat).at(0.5);
    expect(Math.abs(pts[0] - start.x)).toBeLessThan(0.03);
    const mid = ghostAt(pts, 1.25);
    expect(Number.isFinite(mid.x) && Number.isFinite(mid.yaw)).toBe(true);
    expect(JSON.stringify(g).length).toBeLessThan(12000);
  });

  it('accepts an honest lap', () => {
    const g = centreLap(flat, 15);
    expect(lapProblem(flat, g, g.ms)).toBeNull();
  });

  it('rejects a lap that is too fast, takes a shortcut, or does not match its time', () => {
    const fast = centreLap(flat, 24);
    expect(lapProblem(flat, fast, fast.ms)).not.toBeNull();
    const cut = centreLap(flat, 15, { skip: [262, 318] });
    expect(lapProblem(flat, cut, cut.ms)).toMatch(/shortcut/);
    const g = centreLap(flat, 15);
    expect(lapProblem(flat, g, g.ms - 400)).not.toBeNull();
    expect(lapProblem(flat, { ...g, ms: g.ms - 400 }, g.ms - 400)).toMatch(/disagree/);
  });

  it('rejects a teleport, a lap off the circuit, a backwards lap and another circuit', () => {
    const g = centreLap(flat, 15);
    const tele = { ...g, d: g.d.slice() };
    tele.d[40] += 400;
    tele.d[42] -= 400;
    expect(lapProblem(flat, tele, tele.ms)).not.toBeNull();
    const wide = centreLap(flat, 15, { offset: 40 });
    expect(lapProblem(flat, wide, wide.ms)).not.toBeNull();
    const grass = centreLap(flat, 15, { swing: true });
    expect(lapProblem(flat, grass, grass.ms)).toMatch(/grass/);
    const slowGrass = centreLap(flat, 8, { swing: true });
    expect(lapProblem(flat, slowGrass, slowGrass.ms)).toBeNull();
    const rev = { ...g, d: g.d.map((v) => -v) };
    expect(lapProblem(flat, rev, rev.ms)).not.toBeNull();
    expect(lapProblem(circuitLine('picnic'), g, g.ms)).not.toBeNull();
  });

  it('sets a board floor below the champion time on every circuit', () => {
    for (const id of CUP) {
      const len = new TrackPath(circuitLine(id)).length;
      expect(boardMinLapMs(len)).toBeLessThan(CIRCUITS[id].medals[3] * 0.82);
    }
    expect(boardMinLapMs(L)).toBeGreaterThan(30000);
  });
});
