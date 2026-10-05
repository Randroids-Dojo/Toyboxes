import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GRAND_PRIX, buildCircuit, grandPrixTrack } from '../src/shared/circuits';
import { TRACK_CURB, TRACK_MIN_RADIUS, TRACK_WIDTH, TrackPath, edgeFolds, minRadius, trackFromSketch, trackId, trackLength, trackProblem } from '../src/shared/track';

const EDGE = TRACK_WIDTH / 2 + TRACK_CURB;
const pages = JSON.parse(readFileSync(new URL('./fixtures/randroid-pages.json', import.meta.url), 'utf8')).pages as { sketch: { c: number; w: number; p: number[] }[] }[];

function points(flat: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

/** Closest approach between parts of the loop that are far apart along the road. */
function closestPass(flat: number[]): number {
  const p = new TrackPath(flat);
  let min = Infinity;
  for (let i = 0; i < p.n; i++)
    for (let j = i + 1; j < p.n; j++) {
      const along = Math.abs(p.delta(p.s[i], p.s[j]));
      if (along < EDGE * 6) continue;
      min = Math.min(min, Math.hypot(p.x[i] - p.x[j], p.z[i] - p.z[j]));
    }
  return min;
}

describe('the Grand Prix circuit', () => {
  const track = grandPrixTrack();

  it('is a valid track of about 560 metres', () => {
    expect(trackProblem(track)).toBeNull();
    expect(trackLength(track)).toBeGreaterThan(520);
    expect(trackLength(track)).toBeLessThan(600);
  });

  it('keeps every corner wide enough for the curbs', () => {
    expect(minRadius(points(track))).toBeGreaterThan(12.5);
    expect(edgeFolds(track, EDGE)).toBe(0);
    expect(edgeFolds(track, -EDGE)).toBe(0);
  });

  it('never brings two parts of the road close enough to overlap', () => {
    // Both curbs plus at least eight metres of grass between separate parts of the loop.
    expect(closestPass(track)).toBeGreaterThan(EDGE * 2 + 8);
  });

  it('starts on a straight with room for the grid behind the line', () => {
    const p = new TrackPath(track);
    expect(Math.abs(p.turnAhead(p.length - 40, 45))).toBeLessThan(0.05);
  });

  it('only closes when the closing straights have positive length', () => {
    expect(() => buildCircuit([{ close: 'a' }, { radius: 20, turn: 90 }, { close: 'b' }, { radius: 20, turn: 90 }], 0)).toThrow();
    expect(buildCircuit(GRAND_PRIX, 0).length).toBe(track.length);
  });
});

describe('tracks from drawings', () => {
  it('smooths a drawing with a sharp corner until the curbs no longer fold', () => {
    const t = trackFromSketch(pages[0].sketch)!;
    expect(t).not.toBeNull();
    expect(trackProblem(t)).toBeNull();
    expect(minRadius(points(t))).toBeGreaterThanOrEqual(TRACK_MIN_RADIUS);
    expect(edgeFolds(t, EDGE)).toBe(0);
    expect(edgeFolds(t, -EDGE)).toBe(0);
  });

  it('rejects a published track whose corner is tighter than the road', () => {
    // A rounded rectangle with 4 metre corners: the inner curb would fold over itself.
    const flat: number[] = [];
    const corner = (cx: number, cz: number, a0: number) => {
      for (let k = 0; k <= 8; k++) {
        const a = a0 + (k / 8) * (Math.PI / 2);
        flat.push(cx + Math.cos(a) * 4, cz + Math.sin(a) * 4);
      }
    };
    corner(60, 30, 0);
    corner(-60, 30, Math.PI / 2);
    corner(-60, -30, Math.PI);
    corner(60, -30, Math.PI * 1.5);
    expect(edgeFolds(flat, EDGE) + edgeFolds(flat, -EDGE)).toBeGreaterThan(0);
    expect(trackProblem(flat)).toBe('A corner is too tight');
  });

  it('gives each course its own fingerprint for personal bests', () => {
    const a = grandPrixTrack();
    const b = trackFromSketch(pages[0].sketch)!;
    expect(trackId(a)).toBe(trackId([...a]));
    expect(trackId(a)).not.toBe(trackId(b));
  });
});
