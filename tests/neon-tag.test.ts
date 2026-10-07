import { describe, expect, it } from 'vitest';
import { ARENA, bankLine, BASES, BASE_R, clearLine, corners, firstHit, inArena, LAYOUTS, mirrorLine, reflectDir, segPiece, type LayoutId, type Piece } from '../src/shared/neon/arena';
import { pickLock, scoreTag, tagBoardScore, tagCeiling, tagStars, type TagLog } from '../src/shared/neon/tag';
import { TagSim, type TagConfig } from '../src/experiences/neon/tag-sim';

const IDS = Object.keys(LAYOUTS) as LayoutId[];

describe('arena geometry', () => {
  it('finds where a segment meets a box and a pillar', () => {
    const box: Piece = { kind: 'box', x: 0, z: 0, hw: 1, hd: 1, rot: 0, h: 1.5 };
    expect(segPiece(-5, 0, 5, 0, box)).toBeCloseTo(0.4, 6);
    expect(segPiece(-5, 3, 5, 3, box)).toBeNull();
    const turned: Piece = { ...box, rot: Math.PI / 4 };
    expect(segPiece(-5, 0, 5, 0, turned)).toBeCloseTo((5 - Math.SQRT2) / 10, 6);
    const pillar: Piece = { kind: 'pillar', x: 0, z: 0, hw: 1, hd: 1, rot: 0, h: 4 };
    expect(segPiece(0, -5, 0, 5, pillar)).toBeCloseTo(0.4, 6);
    expect(segPiece(2, -5, 2, 5, pillar)).toBeNull();
  });

  it('box corners follow the physics rotation', () => {
    const p: Piece = { kind: 'box', x: 1, z: 2, hw: 2, hd: 0.5, rot: Math.PI / 2, h: 1 };
    const xs = corners(p).map((c) => c[0]);
    const zs = corners(p).map((c) => c[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1, 6);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(4, 6);
  });

  it('reflects a bolt off a mirror like light', () => {
    const m: Piece = { kind: 'mirror', x: 0, z: 0, hw: 1.3, hd: 0.15, rot: 0, h: 2.2 };
    const l = mirrorLine(m);
    expect(Math.abs(l.nz)).toBeCloseTo(1, 6);
    const [vx, vz] = reflectDir(3, 4, m);
    expect(vx).toBeCloseTo(3, 6);
    expect(vz).toBeCloseTo(-4, 6);
  });

  for (const id of IDS) {
    describe(id, () => {
      const pieces = LAYOUTS[id];

      it('is point symmetric about the Core, so both teams see the same map', () => {
        for (const p of pieces) {
          const twin = pieces.find((q) => q.kind === p.kind && Math.abs(q.x + p.x) < 1e-6 && Math.abs(q.z - (2 * ARENA.cz - p.z)) < 1e-6 && Math.abs(q.rot - p.rot) < 1e-6);
          expect(twin, `${p.kind} at ${p.x},${p.z}`).toBeTruthy();
        }
      });

      it('keeps every piece inside the arena and clear of both bases', () => {
        for (const p of pieces) {
          for (const [x, z] of p.kind === 'pillar' ? [[p.x, p.z]] : corners(p)) expect(inArena(x, z, 0.5)).toBe(true);
          for (const b of Object.values(BASES)) expect(Math.hypot(p.x - b.x, p.z - b.z)).toBeGreaterThan(BASE_R + 0.5);
        }
      });

      it('has no straight line from base pad to base pad', () => {
        for (const dx of [-2.4, -1.2, 0, 1.2, 2.4])
          for (const dx2 of [-2.4, 0, 2.4]) expect(clearLine(BASES.cyan.x + dx, BASES.cyan.z, BASES.magenta.x + dx2, BASES.magenta.z, pieces)).toBe(false);
      });

      it('reaches every open cell from both bases', () => {
        const sim = new TagSim({ layout: id, size: 3, diff: 'normal', captain: false, seed: 1, duration: 60, echo: false, bpm: 124 });
        const W = ARENA.x1 - ARENA.x0;
        const H = ARENA.z1 - ARENA.z0;
        const seen = new Set<number>();
        const [si, sj] = sim.cellOf(BASES.cyan.x, BASES.cyan.z);
        const q: [number, number][] = [[si, sj]];
        seen.add(sj * W + si);
        while (q.length) {
          const [i, j] = q.pop()!;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ni = i + di;
            const nj = j + dj;
            if (!sim.open(ni, nj) || seen.has(nj * W + ni)) continue;
            seen.add(nj * W + ni);
            q.push([ni, nj]);
          }
        }
        let open = 0;
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (sim.open(i, j)) open++;
        expect(seen.size).toBe(open);
        const [mi, mj] = sim.cellOf(BASES.magenta.x, BASES.magenta.z);
        expect(seen.has(mj * W + mi)).toBe(true);
      });

      it('every mirror offers a bank line somewhere', () => {
        for (const m of pieces.filter((p) => p.kind === 'mirror')) {
          let found = false;
          for (let ax = -13; ax <= 13 && !found; ax += 2)
            for (let az = -48; az <= -22 && !found; az += 2)
              for (let bx = -13; bx <= 13 && !found; bx += 3)
                for (let bz = -48; bz <= -22 && !found; bz += 3) {
                  const b = bankLine(ax, az, bx, bz, pieces);
                  if (b && b.mirror === m) found = true;
                }
          expect(found).toBe(true);
        }
      });
    });
  }

  it('a bank line hits the mirror and both legs are clear', () => {
    const pieces = LAYOUTS.prism;
    const m = pieces.find((p) => p.kind === 'mirror')!;
    let line = null;
    outer: for (let ax = -13; ax <= 13; ax += 1)
      for (let az = -34; az <= -22; az += 1) {
        const b = bankLine(ax, az, -8, -40, pieces);
        if (b && b.mirror === m) {
          line = { ax, az, b };
          break outer;
        }
      }
    expect(line).toBeTruthy();
    const { ax, az, b } = line!;
    const others = pieces.filter((p) => p !== m);
    expect(firstHit(ax, az, b.px, b.pz, others, 1.0)).toBeNull();
    expect(firstHit(b.px, b.pz, -8, -40, others, 1.0)).toBeNull();
  });
});

describe('lock-on', () => {
  const c = (id: number, x: number, z: number, visible = true, bank = false) => ({ id, x, z, visible, bank });

  it('picks near, central targets inside the cones', () => {
    // Facing -z (yaw pi).
    const cands = [c(1, 0, -10), c(2, 0.5, -5), c(3, 0, 10)];
    expect(pickLock(0, 0, Math.PI, Math.PI, cands, null)?.id).toBe(2);
    expect(pickLock(0, 0, Math.PI, Math.PI, [c(3, 0, 10)], null)).toBeNull();
    expect(pickLock(0, 0, Math.PI, Math.PI, [c(4, 0, -30)], null)).toBeNull();
  });

  it('uses the camera cone too, and prefers direct sight over banks', () => {
    // 60 degrees off the facing but straight up the camera.
    const off = c(1, Math.sin(Math.PI + 1.05) * 8, Math.cos(Math.PI + 1.05) * 8);
    expect(pickLock(0, 0, Math.PI, Math.PI + 1.05, [off], null)?.id).toBe(1);
    expect(pickLock(0, 0, Math.PI, Math.PI, [c(1, 0, -8, false, true), c(2, 1, -9)], null)?.id).toBe(2);
    expect(pickLock(0, 0, Math.PI, Math.PI, [c(1, 0, -8, false, true)], null)).toMatchObject({ id: 1, bank: true });
    expect(pickLock(0, 0, Math.PI, Math.PI, [c(1, 0, -8, false, false)], null)).toBeNull();
  });

  it('is sticky until the target leaves 75 degrees', () => {
    const t = (deg: number) => c(1, Math.sin(Math.PI + (deg * Math.PI) / 180) * 8, Math.cos(Math.PI + (deg * Math.PI) / 180) * 8);
    expect(pickLock(0, 0, Math.PI, Math.PI, [t(60), c(2, 0, -12)], 1)?.id).toBe(1);
    expect(pickLock(0, 0, Math.PI, Math.PI, [t(80), c(2, 0, -12)], 1)?.id).toBe(2);
  });
});

describe('laser tag logs', () => {
  const log = (over: Partial<TagLog> = {}): TagLog => ({
    diff: 'normal',
    dur: 120,
    ev: [
      [10, 'tag'],
      [10, 'beat'],
      [20, 'tag'],
      [20, 'bank'],
      [30.5, 'pickup'],
      [31, 'assist'],
    ],
    us: 5,
    them: 3,
    most: true,
    ...over,
  });

  it('scores tags, bonuses, the win and most tags', () => {
    const s = scoreTag(log())!;
    expect(s).toMatchObject({ tags: 2, banks: 1, beats: 1, pickups: 1, assists: 1, win: true });
    expect(s.total).toBe(2 * 100 + 100 + 50 + 25 + 25 + 1000 + 300);
    expect(tagBoardScore(log({ diff: 'hard' }))).toBe(Math.round(s.total * 1.25));
    expect(tagBoardScore(log({ diff: 'easy' }))).toBeNull();
    expect(s.total).toBeLessThan(tagCeiling(120));
  });

  it('rejects impossible logs', () => {
    expect(scoreTag(log({ ev: [[10, 'tag'], [10.2, 'tag']] }))).toBeNull();
    expect(scoreTag(log({ ev: [[10, 'bank']] }))).toBeNull();
    expect(scoreTag(log({ ev: [[200, 'tag']] }))).toBeNull();
    expect(scoreTag(log({ ev: [[20, 'tag'], [10, 'tag']] }))).toBeNull();
    expect(scoreTag(log({ us: 1, ev: [[10, 'tag'], [20, 'tag']] }))).toBeNull();
    expect(scoreTag(log({ ev: [], most: true }))).toBeNull();
    expect(scoreTag(log({ diff: 'silly' as never }))).toBeNull();
    expect(scoreTag(log({ dur: 5 }))).toBeNull();
    expect(scoreTag(null)).toBeNull();
  });

  it('gives stars for a win, par and par x 1.3', () => {
    const s = (total: number, win = true) => ({ total, tags: 0, banks: 0, reflects: 0, beats: 0, assists: 0, pickups: 0, win });
    expect(tagStars('normal', s(5000, false))).toBe(0);
    expect(tagStars('normal', s(1500))).toBe(1);
    expect(tagStars('normal', s(2200))).toBe(2);
    expect(tagStars('normal', s(2860))).toBe(3);
  });
});

describe('the bot simulation', () => {
  const cfg = (over: Partial<TagConfig> = {}): TagConfig => ({ layout: 'prism', size: 3, diff: 'normal', captain: false, seed: 42, duration: 120, echo: false, bpm: 124, ...over });

  /** Runs a match with a scripted player who strafes near base and fires at locks on the beat. */
  function run(c: TagConfig, seconds = 120) {
    const sim = new TagSim(c);
    let maxStill = 0;
    let maxTokens = 0;
    const still = new Map<number, { x: number; z: number; t: number }>();
    let lock: number | null = null;
    for (let i = 0; i < seconds * 60 && !sim.over; i++) {
      sim.beat = (sim.time * c.bpm) / 60;
      const p = sim.player;
      if (p.outT <= 0) {
        sim.setPlayer(Math.sin(sim.time * 0.4) * 5, -24.5, 0, Math.PI, 0, 0);
        const cands = sim.agents.filter((a) => a.team !== p.team && a.outT <= 0).map((a) => ({ id: a.id, x: a.x, z: a.z, visible: clearLine(p.x, p.z, a.x, a.z, sim.pieces), bank: false }));
        lock = pickLock(p.x, p.z, Math.PI, Math.PI, cands, lock)?.id ?? null;
        if (lock !== null && i % 29 === 0) sim.playerFire(i % 2 === 0, lock, null);
      }
      sim.step();
      sim.take();
      maxTokens = Math.max(maxTokens, sim.agents.filter((a) => a.token).length);
      for (const a of sim.agents) {
        expect(inArena(a.x, a.z, -0.01), `${a.name} left the arena`).toBe(true);
        if (a.player || a.outT > 0 || a.role === 'dummy') {
          still.delete(a.id);
          continue;
        }
        const s = still.get(a.id);
        if (!s || Math.hypot(a.x - s.x, a.z - s.z) > 0.3) still.set(a.id, { x: a.x, z: a.z, t: sim.time });
        else maxStill = Math.max(maxStill, sim.time - s.t);
      }
    }
    return { sim, maxStill, maxTokens };
  }

  it('the same seed gives the same match', () => {
    const a = run(cfg(), 40).sim;
    const b = run(cfg(), 40).sim;
    expect(a.score).toEqual(b.score);
    expect(a.agents.map((x) => [x.x, x.z, x.pips])).toEqual(b.agents.map((x) => [x.x, x.z, x.pips]));
    expect(run(cfg({ seed: 43 }), 40).sim.agents.map((x) => x.x)).not.toEqual(a.agents.map((x) => x.x));
  });

  for (const layout of IDS)
    for (const diff of ['easy', 'normal', 'hard'] as const) {
      it(`${layout} ${diff}: bots move, stay in bounds and respect the attack tokens`, () => {
        const { sim, maxTokens } = run(cfg({ layout, diff, captain: diff === 'hard' }), 90);
        const tokens = { easy: 1, normal: 2, hard: 2 }[diff] + (diff === 'hard' ? 1 : 0);
        expect(maxTokens).toBeLessThanOrEqual(tokens);
        expect(sim.score.cyan + sim.score.magenta).toBeGreaterThan(0);
      });
    }

  it('no bot stands stuck for more than a few seconds', () => {
    for (const layout of IDS) {
      const { maxStill } = run(cfg({ layout }), 120);
      expect(maxStill, layout).toBeLessThan(8);
    }
  });

  it('a well matched Normal game stays in a sane score spread', () => {
    const { sim } = run(cfg({ seed: 7 }), 120);
    expect(sim.score.cyan).toBeLessThan(60);
    expect(sim.score.magenta).toBeLessThan(40);
  });

  it('logs only the player\'s scoring events, and the server agrees', () => {
    const { sim } = run(cfg({ seed: 9 }), 120);
    const l: TagLog = { diff: 'normal', dur: sim.time, ev: sim.log, us: sim.score.cyan, them: sim.score.magenta, most: sim.mostTags().player && sim.player.tags > 0 };
    const s = scoreTag(l);
    expect(s).not.toBeNull();
    expect(s!.tags).toBe(sim.player.tags);
  });

  it('a deflect sends the bolt back at its shooter', () => {
    const sim = new TagSim(cfg({ seed: 3 }));
    const p = sim.player;
    sim.setPlayer(0, -24, 0, Math.PI, 0, 0);
    const shooter = sim.agents.find((a) => a.team === 'magenta')!;
    shooter.x = 0;
    shooter.z = -30;
    // A bolt just about to arrive.
    sim.bolts.push({ id: 999, x: 0, z: -24.8, px: 0, pz: -25, vx: 0, vz: 16, team: 'magenta', owner: shooter.id, life: 2, bounces: 0, maxBounces: 1, beat: false, home: null, kind: 'shot', dead: false });
    expect(sim.deflectable()?.id).toBe(999);
    const b = sim.playerSwing(true)!;
    expect(b.team).toBe(p.team);
    expect(b.kind).toBe('reflect');
    expect(b.vz).toBeLessThan(0);
  });

  it('hops clear a bolt at the right height', () => {
    const sim = new TagSim(cfg({ seed: 5 }));
    const p = sim.player;
    sim.setPlayer(0, -24, 0.9, Math.PI, 0, 0);
    sim.bolts.push({ id: 7, x: 0, z: -25.5, px: 0, pz: -26, vx: 0, vz: 16, team: 'magenta', owner: 4, life: 2, bounces: 0, maxBounces: 1, beat: false, home: null, kind: 'shot', dead: false });
    for (let i = 0; i < 10; i++) {
      sim.setPlayer(0, -24, 0.9, Math.PI, 0, 0);
      sim.step();
    }
    expect(p.pips).toBe(3);
  });
});
