import { describe, expect, it } from 'vitest';
import { songProblem } from '../src/audio/music';
import { songData } from '../src/experiences/neon/music';
import { CHARTS, chartFor, chartProblems, DANCE_SONGS, diffsFor, parseChart } from '../src/shared/neon/charts';
import { buildScript, DUELISTS, scriptFor, scriptProblems } from '../src/shared/neon/duel';
import { danceCeiling, perfectLog, scoreDance } from '../src/shared/neon/judge';
import { beatToSec, secToBeat, SONGS, songSeconds, totalBars, type SongId } from '../src/shared/neon/songs';

describe('songs', () => {
  it('every song is valid sequencer data with sections that match the shared timing', () => {
    for (const id of Object.keys(SONGS) as SongId[]) {
      for (const loop of [true, false]) {
        const data = songData(id, { loop });
        expect(songProblem(data), `${id} ${loop}`).toBeNull();
        const bars = data.sections.filter((s) => SONGS[id].order.some((o) => o.name === s.name)).reduce((n, s) => n + s.bars, 0);
        expect(bars).toBe(totalBars(SONGS[id]));
      }
      expect(songProblem(songData(id, { variant: 'swing', loop: true }))).toBeNull();
    }
  });

  it('converts beats and seconds across the Supernova tempo change', () => {
    const s = SONGS.supernova;
    const edge = s.change!.bar * 4;
    expect(beatToSec(s, edge)).toBeCloseTo((edge * 60) / 132, 9);
    expect(beatToSec(s, edge + 7)).toBeCloseTo((edge * 60) / 132 + (7 * 60) / 140, 9);
    for (const b of [0, 3.5, edge - 0.25, edge, edge + 0.25, 190]) expect(secToBeat(s, beatToSec(s, b))).toBeCloseTo(b, 9);
    expect(songSeconds(s)).toBeGreaterThan(85);
    expect(songSeconds(s)).toBeLessThan(100);
  });
});

describe('dance charts', () => {
  it('has three charts per song plus the Supernova chart (13 in all)', () => {
    let n = 0;
    for (const song of DANCE_SONGS) {
      const diffs = diffsFor(song);
      expect(diffs).toEqual(expect.arrayContaining(['easy', 'normal', 'hard']));
      n += diffs.length;
    }
    expect(n).toBe(13);
    expect(diffsFor('supernova')).toContain('nova');
  });

  it('every chart parses, keeps its gaps and density caps, fits the song and has a spotlight', () => {
    for (const song of DANCE_SONGS)
      for (const d of diffsFor(song)) {
        const c = chartFor(song, d)!;
        expect(chartProblems(c), `${song} ${d}`).toEqual([]);
        expect(c.notes.length).toBeGreaterThan(60);
        expect(c.slots.length).toBeGreaterThanOrEqual(8);
      }
  });

  it('note counts rise with difficulty', () => {
    for (const song of DANCE_SONGS) {
      const n = (d: 'easy' | 'normal' | 'hard') => chartFor(song, d)!.notes.length;
      expect(n('easy')).toBeLessThan(n('normal'));
      expect(n('normal')).toBeLessThan(n('hard'));
    }
  });

  it('a perfect run scores full marks under the ceiling, with at least one Glow time', () => {
    for (const song of DANCE_SONGS)
      for (const d of diffsFor(song)) {
        const c = chartFor(song, d)!;
        const l = perfectLog(c);
        const r = scoreDance(c, l.n, l.s)!;
        expect(r.cards.total).toBe(30);
        expect(r.glows).toBeGreaterThan(0);
        expect(r.score).toBeLessThanOrEqual(danceCeiling(c));
      }
  });

  it('rejects broken bars', () => {
    const song = SONGS.lights;
    const spec = { ...CHARTS.lights!.easy! };
    expect(() => parseChart(song, 'easy', { ...spec, verse: 'x...x' })).toThrow();
    expect(() => parseChart(song, 'easy', { ...spec, verse: '=...x...x...x...' })).toThrow();
    expect(() => parseChart(song, 'easy', { ...spec, verse: 'h...x...x...x...' })).toThrow();
    expect(() => parseChart(song, 'easy', { ...spec, verse: 'q...x...x...x...' })).toThrow();
    const missing: Record<string, string> = { ...spec };
    delete missing.drop;
    expect(() => parseChart(song, 'easy', missing)).toThrow();
  });

  it('links doubles a sixteenth apart and colours notes by where they fall', () => {
    const c = chartFor('lights', 'hard')!;
    const doubles = c.notes.filter((n) => n.link);
    expect(doubles.length).toBeGreaterThan(5);
    for (const n of doubles) expect(n.beat - c.notes[n.i - 1].beat).toBeCloseTo(0.25, 9);
    for (const n of c.notes) {
      const f = n.beat - Math.floor(n.beat);
      expect(n.sub).toBe(f === 0 ? 4 : f === 0.5 ? 8 : 16);
    }
  });
});

describe('duel scripts', () => {
  it('every duelist has a valid script with spare openings', () => {
    expect(DUELISTS.map((d) => d.id)).toEqual(['sprocket', 'twinkle', 'brick', 'mirage', 'knight']);
    for (const d of DUELISTS) {
      const s = scriptFor(d.id);
      expect(scriptProblems(s), d.id).toEqual([]);
      expect(s.endT).toBeGreaterThan(55);
      expect(s.endT).toBeLessThan(105);
    }
  });

  it('adds one idea per duelist', () => {
    const kinds = (id: string) => new Set(scriptFor(id as never).events.map((e) => e.kind));
    expect([...kinds('sprocket')].sort()).toEqual(['open', 'strike']);
    expect(scriptFor('twinkle').judged.some((e, i, a) => i > 0 && e.kind === 'strike' && a[i - 1].kind === 'strike' && e.beat - a[i - 1].beat === 0.5)).toBe(true);
    expect(kinds('brick').has('crush')).toBe(true);
    expect(kinds('mirage').has('feint')).toBe(true);
    expect(kinds('mirage').has('call')).toBe(true);
    expect(kinds('knight').has('call') && kinds('knight').has('crush') && kinds('knight').has('feint')).toBe(true);
  });

  it('call and response plays the call back a bar later', () => {
    const s = scriptFor('mirage');
    const calls = s.events.filter((e) => e.kind === 'call');
    for (const c of calls) expect(s.events.some((e) => e.kind === 'open' && e.response && Math.abs(e.beat - c.beat - 4) < 1e-9)).toBe(true);
  });

  it('rejects bad phrases', () => {
    const d = DUELISTS[0];
    expect(() => buildScript({ ...d, script: ['G:..s'] })).toThrow();
    expect(() => buildScript({ ...d, script: ['S:..s.............'] })).toThrow();
    expect(() => buildScript({ ...d, script: ['G:..c=..........'] })).toThrow();
    expect(() => buildScript({ ...d, script: ['X:................'] })).toThrow();
  });
});
