import { describe, expect, it } from 'vitest';
import { chartFor, parseChart, type Chart } from '../src/shared/neon/charts';
import { DUEL_PIPS, LiveDuel, scoreDuel, scriptFor, duelStars, duelFlawless } from '../src/shared/neon/duel';
import { comboMult, danceStars, EASY_WIDEN, gradeFor, LiveJudge, noteLogLength, scoreDance, WINDOW } from '../src/shared/neon/judge';
import { SONGS } from '../src/shared/neon/songs';
import { medianOffset } from '../src/experiences/neon/sync';

/** A tiny chart on Nova Lights: taps, a double, a hold and a pose, then a spotlight bar. */
function tiny(): Chart {
  const song = SONGS.lights;
  const empty = '-';
  return parseChart(song, 'hard', {
    intro: 'x...x...xx..h=== - - -',
    verse: '....p........... spot',
    build: empty,
    drop: empty,
    break: empty,
    drop2: empty,
    outro: empty,
  });
}

describe('timing windows', () => {
  it('grades by distance, with the Easy widening', () => {
    expect(gradeFor(0)).toBe('P');
    expect(gradeFor(WINDOW.P)).toBe('P');
    expect(gradeFor(WINDOW.P + 0.001)).toBe('G');
    expect(gradeFor(-WINDOW.G)).toBe('G');
    expect(gradeFor(WINDOW.O)).toBe('O');
    expect(gradeFor(WINDOW.O + 0.001)).toBe('M');
    expect(gradeFor(WINDOW.P * 1.1, EASY_WIDEN)).toBe('P');
  });

  it('steps the combo multiplier at 10, 30 and 60', () => {
    expect([0, 9, 10, 29, 30, 59, 60, 200].map(comboMult)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe('live dance judging', () => {
  it('matches presses to the nearest unjudged note, early and late', () => {
    const c = tiny();
    const j = new LiveJudge(c);
    const [a, b] = c.notes;
    const e1 = j.press(a.t - 0.03);
    expect(e1.find((x) => x.kind === 'note')).toMatchObject({ grade: 'P' });
    const e2 = j.press(b.t + 0.07);
    expect(e2.find((x) => x.kind === 'note')).toMatchObject({ grade: 'G' });
    expect(j.errors[0]).toBeLessThan(0);
    expect(j.errors[1]).toBeGreaterThan(0);
  });

  it('ignores stray presses with no note nearby (no penalty for nerves)', () => {
    const c = tiny();
    const j = new LiveJudge(c);
    expect(j.press(c.notes[0].t - 0.5)).toEqual([]);
    expect(j.score.combo).toBe(0);
    expect(j.score.counts.M).toBe(0);
  });

  it('sweeps notes whose window has passed as misses, and never judges a note twice', () => {
    const c = tiny();
    const j = new LiveJudge(c);
    const first = c.notes[0];
    j.sweep(first.t + WINDOW.O + 0.01);
    expect(j.markOf(0)).toBe('M');
    // A late press now goes to the next note instead.
    const out = j.press(c.notes[1].t);
    expect(out.find((x) => x.kind === 'note')).toMatchObject({ grade: 'P' });
    expect(j.markOf(1)).toBe('P');
    expect(j.markOf(0)).toBe('M');
  });

  it('judges a double as two presses', () => {
    const c = tiny();
    const dbl = c.notes.filter((n) => n.link);
    expect(dbl.length).toBe(1);
    const j = new LiveJudge(c);
    for (const n of c.notes.slice(0, dbl[0].i + 1)) j.press(n.t);
    expect(j.score.counts.P).toBe(dbl[0].i + 1);
  });

  it('keeps a hold held to its tail and drops one let go early', () => {
    const c = tiny();
    const hold = c.notes.find((n) => n.kind === 'hold')!;
    const play = (releaseAt: number) => {
      const j = new LiveJudge(c);
      for (const n of c.notes) if (n.i < hold.i) j.press(n.t);
      j.press(hold.t);
      expect(j.holding?.i).toBe(hold.i);
      const out = j.release(releaseAt);
      return { j, out };
    };
    expect(play(hold.endT - 0.05).out[0]).toMatchObject({ kind: 'tail', kept: true });
    const dropped = play(hold.endT - 0.3);
    expect(dropped.out[0]).toMatchObject({ kind: 'tail', kept: false });
    expect(dropped.j.score.combo).toBe(0);
    // Held right through: the sweep keeps it at the tail.
    const j = new LiveJudge(c);
    for (const n of c.notes) if (n.i < hold.i) j.press(n.t);
    j.press(hold.t);
    expect(j.sweep(hold.endT + 0.01).find((x) => x.kind === 'tail')).toMatchObject({ kept: true });
  });

  it('Easy holds count a hold once its head is hit', () => {
    const c = tiny();
    const hold = c.notes.find((n) => n.kind === 'hold')!;
    const j = new LiveJudge(c, { easyHolds: true });
    const out = j.press(hold.t);
    expect(out.find((x) => x.kind === 'tail')).toMatchObject({ kept: true });
    expect(j.holding).toBeNull();
  });

  it('marks spotlight presses on the eighth grid, and off-grid mashing as sloppy', () => {
    const c = tiny();
    const s = c.slots;
    const j = new LiveJudge(c);
    j.press(s[0].t + 0.02);
    j.press(s[2].t - 0.03);
    // Mashing between two slots is sloppy and spoils that slot.
    j.press(s[4].t + 0.12);
    j.press(s[4].t);
    expect(j.slotMark(0)).toBe('F');
    expect(j.slotMark(2)).toBe('F');
    expect(j.slotMark(4)).toBe('S');
    expect(j.slotMark(1)).toBe('.');
  });

  it('pauses without re-judging: a judged note stays judged', () => {
    const c = tiny();
    const j = new LiveJudge(c);
    j.press(c.notes[0].t);
    const before = j.log().n;
    j.press(c.notes[0].t + 0.01);
    expect(j.markOf(0)).toBe('P');
    expect(j.log().n.startsWith(before.slice(0, 1))).toBe(true);
  });

  it('the live score equals the server score from the log', () => {
    const c = chartFor('glitter', 'normal')!;
    const j = new LiveJudge(c);
    let k = 0;
    for (const n of c.notes) {
      k++;
      if (k % 7 === 0) continue;
      j.press(n.t + (k % 3 === 0 ? 0.06 : k % 5 === 0 ? -0.11 : 0.01));
      if (n.kind === 'hold') j.release(k % 4 === 0 ? n.endT - 0.4 : n.endT);
    }
    for (let i = 0; i < c.slots.length; i += 2) j.press(c.slots[i].t);
    const r = j.result()!;
    const l = j.log();
    expect(l.n.length).toBe(noteLogLength(c));
    expect(scoreDance(c, l.n, l.s)!.score).toBe(r.score);
    expect(j.score.score).toBe(r.score);
  });
});

describe('dance logs', () => {
  it('rejects wrong lengths, bad characters and impossible tails', () => {
    const c = tiny();
    const ok = c.notes.map((n) => (n.kind === 'hold' ? 'PH' : 'P')).join('');
    const slots = 'F'.repeat(c.slots.length);
    expect(scoreDance(c, ok, slots)).not.toBeNull();
    expect(scoreDance(c, ok.slice(1), slots)).toBeNull();
    expect(scoreDance(c, ok, slots + 'F')).toBeNull();
    expect(scoreDance(c, ok.replace('P', 'Z'), slots)).toBeNull();
    expect(scoreDance(c, ok.replace('PH', 'MH'), slots)).toBeNull();
    expect(scoreDance(c, ok, slots.replace('F', 'Q'))).toBeNull();
  });

  it('the judges score timing, consistency and flair', () => {
    const c = chartFor('lights', 'easy')!;
    const all = c.notes.map((n) => (n.kind === 'hold' ? 'PH' : 'P')).join('');
    const best = scoreDance(c, all, 'F'.repeat(c.slots.length))!;
    expect(best.cards).toEqual({ tempo: 10, groove: 10, sparkle: 10, total: 30 });
    const noFlair = scoreDance(c, all, '.'.repeat(c.slots.length))!;
    expect(noFlair.cards.sparkle).toBeLessThan(10);
    const goods = c.notes.map((n) => (n.kind === 'hold' ? 'OH' : 'O')).join('');
    expect(scoreDance(c, goods, 'F'.repeat(c.slots.length))!.cards.tempo).toBeLessThan(2);
    const broken = all.split('');
    broken[Math.floor(broken.length / 2)] = 'M';
    expect(scoreDance(c, broken.join(''), 'F'.repeat(c.slots.length))!.cards.groove).toBeLessThan(10);
    expect([danceStars(17.5), danceStars(18), danceStars(23), danceStars(27), danceStars(30)]).toEqual([0, 1, 2, 3, 3]);
  });
});

describe('duels', () => {
  it('a perfect bout knocks the duelist out and is flawless', () => {
    for (const id of ['sprocket', 'brick', 'mirage'] as const) {
      const s = scriptFor(id);
      const j = new LiveDuel(s);
      for (const e of s.judged) {
        if (j.ended) break;
        if (e.kind === 'feint') {
          j.sweep(e.t + 0.3);
          continue;
        }
        j.press(e.t);
        if (e.kind === 'crush') j.release(e.endT);
      }
      const r = j.score.result();
      expect(r.outcome).toBe('ko');
      expect(duelFlawless(r)).toBe(true);
      expect(duelStars(r)).toBe(3);
      expect(scoreDuel(s, j.log())!.score).toBe(r.score);
    }
  });

  it('pressing a feint whiffs, letting it pass reads it', () => {
    const s = scriptFor('mirage');
    const feint = s.judged.find((e) => e.kind === 'feint')!;
    const play = (press: boolean) => {
      const j = new LiveDuel(s);
      for (const e of s.judged) {
        if (e === feint) break;
        if (e.kind === 'feint') j.sweep(e.t + 0.3);
        else {
          j.press(e.t);
          if (e.kind === 'crush') j.release(e.endT);
        }
      }
      if (press) j.press(feint.t);
      return j.sweep(feint.t + 0.3).find((x) => x.kind === 'feint');
    };
    expect(play(false)).toMatchObject({ read: true });
    expect(play(true)).toMatchObject({ read: false });
  });

  it('a missed strike costs a pip, and five of them end the bout with a bow', () => {
    const s = scriptFor('sprocket');
    const j = new LiveDuel(s);
    const events = j.sweep(s.endT + 5);
    expect(events.at(-1)).toMatchObject({ kind: 'end', outcome: 'out' });
    expect(j.score.pips).toBe(0);
    const log = j.log();
    const strikes = s.judged.slice(0, log.length).filter((e) => e.kind !== 'open').length;
    expect(strikes).toBe(DUEL_PIPS);
    expect(scoreDuel(s, log)!.outcome).toBe('out');
  });

  it('a crush let go before the push is dropped and costs a pip', () => {
    const s = scriptFor('brick');
    const crush = s.judged.find((e) => e.kind === 'crush')!;
    const j = new LiveDuel(s);
    for (const e of s.judged) {
      if (e === crush) break;
      j.press(e.t);
    }
    j.press(crush.t);
    expect(j.binding).toBe(crush);
    const out = j.release(crush.t + 0.2);
    expect(out[0]).toMatchObject({ kind: 'push', kept: false });
    expect(j.score.pips).toBe(DUEL_PIPS - 1);
  });

  it('rejects logs that are too short, too long or malformed', () => {
    const s = scriptFor('sprocket');
    const j = new LiveDuel(s);
    for (const e of s.judged) {
      if (j.ended) break;
      j.press(e.t);
    }
    const log = j.log();
    expect(scoreDuel(s, log)).not.toBeNull();
    expect(scoreDuel(s, log + 'P')).toBeNull();
    expect(scoreDuel(s, log.slice(0, 3))).toBeNull();
    expect(scoreDuel(s, log.replace('P', 'R'))).toBeNull();
  });
});

describe('sound check', () => {
  it('takes the middle of the claps and clamps it', () => {
    expect(medianOffset([40, 42, 38, 41, 200, 39, 40, 43])).toBe(41);
    expect(medianOffset([10, 20])).toBeNull();
    expect(medianOffset([500, 500, 500, 500, 500])).toBe(300);
    expect(medianOffset([-100, -100, -100, -100, -100])).toBe(-60);
  });
});
