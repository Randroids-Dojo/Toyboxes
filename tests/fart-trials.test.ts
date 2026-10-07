import { describe, expect, it } from 'vitest';
import { crossesHoop, hoops, ringsBeans, ringsMinMs, courseLength } from '../src/shared/fart/course';
import { bandBeans, bandFromLog, chartMax, CHARTS, comboMultiplier, judge, PERFECT_MS, scoreBand, shortChart } from '../src/shared/fart/charts';
import { FART_MODES, LIBRARY_MAX } from '../src/shared/fart/boards';
import { Library, maskSchedule, crosses, shelves, SCORE, TIME_LIMIT } from '../src/experiences/fart/sim/library';
import { Picnic, WIND_EVERY } from '../src/experiences/fart/sim/picnic';
import type { Cloud } from '../src/experiences/fart/sim/clouds';
import { rng } from '../src/experiences/fart/sim/rng';
import { beanCount, freshSave, migrate, newUnlocks, trialOpen, TOTAL_BEANS, unlocked } from '../src/experiences/fart/sim/progress';
import { songProblem } from '../src/audio/music';
import { bandSong, CALIBRATE_SONG, LIBRARY_TIPTOE, PICNIC_WALTZ, PUFFINGTON_MARCH, RINGS_GALOP } from '../src/experiences/fart/songs';

describe('Rocket Rings', () => {
  const h = hoops()[0];
  it('counts a swept crossing through the hoop, even a fast one, and only the right way', () => {
    const before = { x: h.x - h.nx * 3, y: h.y - h.ny * 3, z: h.z - h.nz * 3 };
    const after = { x: h.x + h.nx * 3, y: h.y + h.ny * 3, z: h.z + h.nz * 3 };
    expect(crossesHoop(h, before, after)).toBe(true);
    expect(crossesHoop(h, after, before)).toBe(false);
    const wide = { x: before.x + 3, y: before.y, z: before.z };
    const wideAfter = { x: after.x + 3, y: after.y, z: after.z };
    expect(crossesHoop(h, wide, wideAfter)).toBe(false);
    expect(crossesHoop(h, before, { x: h.x - h.nx, y: h.y, z: h.z - h.nz })).toBe(false);
  });

  it('has twelve hoops, a sensible floor on times and golden beans at 70 and 48 seconds', () => {
    expect(hoops().length).toBe(12);
    expect(courseLength()).toBeGreaterThan(80);
    expect(ringsMinMs()).toBeGreaterThan(9000);
    expect(ringsMinMs()).toBeLessThan(30000);
    expect(ringsBeans(null)).toBe(0);
    expect(ringsBeans(90_000)).toBe(1);
    expect(ringsBeans(60_000)).toBe(2);
    expect(ringsBeans(40_000)).toBe(3);
  });
});

describe('Brass Band Bash', () => {
  it('judges within 60 ms as Perfect and 120 ms as Good', () => {
    expect(judge(0)).toBe('perfect');
    expect(judge(-PERFECT_MS)).toBe('perfect');
    expect(judge(90)).toBe('good');
    expect(judge(-121)).toBe('miss');
    expect(judge(null)).toBe('miss');
    expect(comboMultiplier(9)).toBe(1);
    expect(comboMultiplier(10)).toBe(1.5);
    expect(comboMultiplier(25)).toBe(2);
  });

  it('scores a perfect run at the chart maximum, with holds and rests', () => {
    for (const c of Object.values(CHARTS)) {
      expect(c.notes.some((n) => n.kind === 'hold')).toBe(true);
      expect(c.notes.some((n) => n.kind === 'rest')).toBe(true);
      expect(c.notes.some((n) => n.call)).toBe(true);
      const hits: (number | null)[] = c.notes.map((n) => (n.kind === 'rest' ? null : 0));
      const held = c.notes.map((n) => (n.kind === 'hold' ? n.len : 0));
      const r = scoreBand(c, { hits, held });
      expect(r.score).toBe(chartMax(c));
      expect(r.accuracy).toBe(1);
      expect(r.miss).toBe(0);
      // Tooting in a rest breaks the combo and costs points.
      const restI = c.notes.findIndex((n) => n.kind === 'rest');
      const broken: (number | null)[] = [...hits];
      broken[restI] = 10;
      expect(scoreBand(c, { hits: broken, held }).score).toBeLessThan(r.score);
      // Letting go of holds early costs points.
      expect(scoreBand(c, { hits, held: held.map(() => 0) }).score).toBeLessThan(r.score);
    }
    expect(chartMax(CHARTS.march)).toBeGreaterThan(1000);
  });

  it('gives golden beans at 60, 80 and 95 percent', () => {
    expect(bandBeans(0.59)).toBe(0);
    expect(bandBeans(0.6)).toBe(1);
    expect(bandBeans(0.8)).toBe(2);
    expect(bandBeans(0.95)).toBe(3);
  });

  it('the server works the score out from the log and refuses impossible logs', () => {
    const c = CHARTS.march;
    const hits = c.notes.map((n) => (n.kind === 'rest' ? null : 20));
    const held = c.notes.map((n) => (n.kind === 'hold' ? n.len : 0));
    expect(bandFromLog('march', { song: 'march', hits, held })).toBe(scoreBand(c, { hits, held }).score);
    expect(bandFromLog('march', { song: 'polka', hits, held })).toBeNull();
    expect(bandFromLog('march', { song: 'march', hits: hits.slice(1), held })).toBeNull();
    expect(bandFromLog('march', { song: 'march', hits, held: held.map((x) => x + 5) })).toBeNull();
    expect(bandFromLog('march', { song: 'march', hits: hits.map(() => 'x'), held })).toBeNull();
    expect(bandFromLog('march', null)).toBeNull();
  });

  it('has a short chart for playtests', () => {
    expect(shortChart('march').notes.length).toBe(8);
  });
});

describe('Shh! The Library', () => {
  it('masks toots in the window of a loud noise and rewards perfect timing', () => {
    const lib = new Library(rng(1));
    const bong = lib.masks.find((m) => m.kind === 'bong')!;
    lib.time = bong.at - 0.05;
    expect(lib.toot(195, 0)).toBe('masked');
    expect(lib.perfectCount).toBe(1);
    lib.time = bong.at + 2;
    const before = lib.strikes;
    // Far from everyone behind shelves: heard maybe, but not caught.
    expect(['heard', 'quiet']).toContain(lib.toot(188.2, -8));
    expect(lib.strikes).toBe(before);
  });

  it('shelves damp the noise and block the view; in plain sight you are caught', () => {
    const lib = new Library(rng(2));
    lib.time = 2;
    expect(crosses(shelves(), 192, 0, 205, -5)).toBeGreaterThan(0);
    expect(lib.toot(203.5, -5)).toBe('caught');
    expect(lib.strikes).toBe(1);
  });

  it('a whole trial lays out masking noises, and the clock strikes every 15 seconds', () => {
    const m = maskSchedule(rng(3));
    const bongs = m.filter((x) => x.kind === 'bong');
    expect(bongs.length).toBeGreaterThanOrEqual(Math.floor(TIME_LIMIT / 15));
    expect(bongs[1].at - bongs[0].at).toBe(15);
    expect(m.some((x) => x.kind === 'clank')).toBe(true);
    expect(m.some((x) => x.kind === 'sneeze')).toBe(true);
    for (const x of m) expect(x.warn).toBeLessThan(x.at);
  });

  it('pressure overflows if you never let any out', () => {
    const lib = new Library(rng(4));
    for (let i = 0; i < 60 * 80 && !lib.ended; i++) lib.step(1 / 60, { x: 188, z: 8 }, () => null);
    expect(lib.ended?.why).toBe('overflow');
  });

  it('three strikes and you are shown the door', () => {
    const lib = new Library(rng(5));
    lib.time = 2;
    for (let i = 0; i < 3; i++) {
      lib.toot(203.5, -5);
      for (const r of lib.readers) r.state = 'read';
      lib.time += 3;
    }
    expect(lib.ended?.why).toBe('strikes');
  });

  it('the score adds up and never passes the cap; beans need all five books', () => {
    const lib = new Library(rng(6));
    for (let i = 0; i < 5; i++) lib.shelve(i);
    lib.maskedCount = 20;
    lib.perfectCount = 20;
    lib.frames = 9;
    lib.time = 0;
    expect(lib.ended?.why).toBe('done');
    expect(lib.score()).toBe(LIBRARY_MAX);
    expect(5 * SCORE.book + 10 * (SCORE.masked + SCORE.perfect) + 3 * SCORE.frame + SCORE.maxTimeBonus).toBe(LIBRARY_MAX);
    expect(lib.beans()).toBe(3);
    const half = new Library(rng(7));
    half.shelve(0);
    expect(half.beans()).toBe(0);
  });

  it('a squeezed cloud reaching a reader blames the nearest person to it', () => {
    const lib = new Library(rng(8));
    lib.time = 1;
    const reader = lib.readers.find((r) => r.id === 'reader-3')!;
    lib.step(1, { x: 188, z: -8 }, (x, z) => (Math.hypot(x - reader.x, z - reader.z) < 0.5 ? { stink: 1, cx: reader.x + 1.5, cz: reader.z + 1 } : null));
    lib.step(0.5, { x: 188, z: -8 }, (x, z) => (Math.hypot(x - reader.x, z - reader.z) < 0.5 ? { stink: 1, cx: 210.5, cz: 6.3 } : null));
    const e = lib.takeEvents();
    expect(e.some((x) => x.kind === 'smell')).toBe(true);
  });
});

describe('Picnic Panic', () => {
  const cloud = (x: number, y: number, z: number, stink = 1): Cloud => ({ id: 1, gas: 'cabbage', x, y, z, vx: 0, vy: 0, vz: 0, r: 2, r1: 2, age: 0, life: 12, stink, seed: 1 });

  it('fills whiff meters with stink; full ones pack up and leave', () => {
    const p = new Picnic(rng(1));
    const a = p.people[0];
    for (let i = 0; i < 60 * 3; i++) p.step(1 / 60, [cloud(a.x, 1, a.z)]);
    expect(a.state).not.toBe('sit');
    expect(p.left).toBeLessThanOrEqual(11);
    expect(p.left).toBeGreaterThanOrEqual(10);
  });

  it('Grandad with a peg on his nose needs twice the stink', () => {
    const p = new Picnic(rng(1));
    const g = p.people.find((x) => x.peg)!;
    const n = p.people[0];
    expect(g.need).toBe(2 * n.need);
  });

  it('the parasol blocks clouds from its side but not from above', () => {
    const p = new Picnic(rng(1));
    const fam = p.people.find((x) => x.shade)!;
    const side = cloud(fam.x + fam.shade!.x * 1.2, 1, fam.z + fam.shade!.z * 1.2);
    const above = cloud(fam.x + fam.shade!.x * 1.2, 2.4, fam.z);
    const other = cloud(fam.x - fam.shade!.x * 1.2, 1, fam.z - fam.shade!.z * 1.2);
    expect(p.stinkFor(fam, [side])).toBe(0);
    expect(p.stinkFor(fam, [above])).toBeGreaterThan(0);
    expect(p.stinkFor(fam, [other])).toBeGreaterThan(0);
  });

  it('the wind wobbles and then turns every 20 seconds', () => {
    const p = new Picnic(rng(2));
    const w0 = { ...p.wind };
    for (let i = 0; i < 60 * (WIND_EVERY - 2.5); i++) p.step(1 / 60, []);
    expect(p.wobbling).toBe(true);
    for (let i = 0; i < 60 * 3; i++) p.step(1 / 60, []);
    expect(Math.hypot(p.wind.x - w0.x, p.wind.z - w0.z)).toBeGreaterThan(0.5);
    expect(Math.hypot(p.wind.x, p.wind.z)).toBeCloseTo(1.2);
  });

  it('beans for clearing them all, under 60 s and under 40 s', () => {
    const p = new Picnic(rng(3));
    for (const x of p.people) x.state = 'gone';
    p.step(1 / 60, []);
    expect(p.clearedAt).not.toBeNull();
    expect(p.beans()).toBe(3);
  });
});

describe('boards', () => {
  it('lists five boards with honest bounds', () => {
    expect(FART_MODES.map((m) => m.id)).toEqual(['rings', 'library', 'band-march', 'band-polka', 'picnic']);
    for (const m of FART_MODES) {
      expect(m.min).toBeLessThan(m.max);
      expect(m.ticket).toBeDefined();
    }
    expect(FART_MODES.find((m) => m.id === 'band-march')!.max).toBe(chartMax(CHARTS.march));
    expect(FART_MODES.find((m) => m.id === 'library')!.max).toBe(LIBRARY_MAX);
  });
});

describe('the save', () => {
  it('migrates an old save and cleans up a broken one', () => {
    const old = migrate({ version: 1, mischief: ['tea', 'tins', 3], ringsBest: 51234, ringsBeans: 7, voice: 'duck' });
    expect(old.version).toBe(2);
    expect(old.mischief).toEqual(['tea', 'tins']);
    expect(old.trials.rings).toMatchObject({ best: 51234, beans: 3 });
    expect(old.voice).toBe('duck');
    const broken = migrate({ version: 2, trials: { band: { beans: 9, best: 'x' } }, offset: 4, tapMode: 'yes' });
    expect(broken.trials.band.beans).toBe(3);
    expect(broken.trials.band.best).toBeNull();
    expect(broken.offset).toBe(0);
    expect(broken.tapMode).toBeNull();
    expect(migrate(null)).toEqual(freshSave());
  });

  it('counts 27 golden beans and unlocks at the right counts', () => {
    const s = freshSave();
    expect(beanCount(s)).toBe(0);
    s.mischief = Array.from({ length: 15 }, (_, i) => `m${i}`);
    for (const t of ['rings', 'library', 'band', 'picnic'] as const) s.trials[t].beans = 3;
    s.polka.beans = 3;
    expect(beanCount(s)).toBe(TOTAL_BEANS);
    expect(unlocked(0).map((u) => u.id)).toEqual(['classic', 'classic']);
    expect(newUnlocks(1, 2).map((u) => u.id)).toEqual(['duck']);
    expect(newUnlocks(26, 27).map((u) => u.id)).toEqual(['golden']);
    expect(trialOpen('library', 2)).toBe(false);
    expect(trialOpen('library', 3)).toBe(true);
    expect(trialOpen('picnic', 6)).toBe(true);
    expect(trialOpen('rings', 0) && trialOpen('band', 0)).toBe(true);
  });
});

describe('music', () => {
  it('every song parses', () => {
    for (const s of [PUFFINGTON_MARCH, RINGS_GALOP, LIBRARY_TIPTOE, PICNIC_WALTZ, CALIBRATE_SONG, bandSong('march'), bandSong('polka')]) expect(songProblem(s), s.name).toBeNull();
  });

  it('the band songs last exactly as long as their charts', () => {
    for (const id of ['march', 'polka'] as const) {
      const s = bandSong(id);
      const bars = s.sections.reduce((n, x) => n + x.bars, 0);
      expect(bars * 4).toBe(CHARTS[id].beats);
      expect(s.bpm).toBe(CHARTS[id].bpm);
    }
  });
});
