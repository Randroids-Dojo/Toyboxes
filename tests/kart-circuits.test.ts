import { describe, expect, it } from 'vitest';
import { grandPrixTrack } from '../src/shared/circuits';
import { CIRCUITS, CUP, areaCircuits, circuitLine, homeCircuit, pieceSpans, type CircuitId } from '../src/shared/kart/circuits';
import { EDGE, Profile, VERGE_RUN } from '../src/shared/kart/profile';
import { TrackPath, edgeFolds, minRadius, trackProblem } from '../src/shared/track';

const GRID_BACK = 38;

function setup(id: CircuitId) {
  const flat = circuitLine(id);
  const path = new TrackPath(flat);
  const def = CIRCUITS[id];
  const profile = new Profile(path.length, def.raises, def.tunnels);
  return { flat, path, def, profile };
}

/** Whether the road runs straight over [s0, s1] (no piece with a turn overlaps it). */
function straightOver(id: CircuitId, s0: number, s1: number): boolean {
  return pieceSpans(id).every((p) => {
    if (!p.turn) return true;
    const a0 = p.s0;
    const a1 = p.s1 < p.s0 ? p.s1 + 10000 : p.s1;
    return s1 <= a0 + 0.5 || s0 >= a1 - 0.5;
  });
}

describe('Toybox Cup circuits', () => {
  it('Block Town keeps the original Grand Prix line exactly', () => {
    expect(circuitLine('blocktown')).toEqual(grandPrixTrack());
    expect(homeCircuit(grandPrixTrack())).toBe('blocktown');
    expect(areaCircuits(grandPrixTrack())).toEqual(CUP);
  });

  it('a sketch track stays a sketch circuit', () => {
    const oval: number[] = [];
    for (let i = 0; i < 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      oval.push(Math.round(Math.cos(a) * 80 * 10) / 10, Math.round(Math.sin(a) * 50 * 10) / 10);
    }
    expect(trackProblem(oval)).toBeNull();
    expect(homeCircuit(oval)).toBe('sketch');
    expect(areaCircuits(oval)[0]).toBe('sketch');
  });

  for (const id of CUP) {
    describe(CIRCUITS[id].name, () => {
      const { flat, path, def, profile } = setup(id);
      const L = path.length;

      it('is raceable, with no tight corners or folding curbs', () => {
        expect(trackProblem(flat)).toBeNull();
        const pts: [number, number][] = [];
        for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
        expect(minRadius(pts)).toBeGreaterThanOrEqual(12.5);
        expect(edgeFolds(flat, EDGE)).toBe(0);
        expect(edgeFolds(flat, -EDGE)).toBe(0);
      });

      it('keeps at least 8 m of ground between separate parts of the road', () => {
        let min = Infinity;
        for (let i = 0; i < path.n; i++)
          for (let j = i + 1; j < path.n; j++) {
            if (Math.abs(path.delta(path.s[i], path.s[j])) < EDGE * 6) continue;
            min = Math.min(min, Math.hypot(path.x[i] - path.x[j], path.z[i] - path.z[j]));
          }
        expect(min - EDGE * 2).toBeGreaterThanOrEqual(8);
      });

      it('fits the grid on the start straight, well before the first corner', () => {
        expect(straightOver(id, L - GRID_BACK, L)).toBe(true);
        const first = pieceSpans(id).filter((p) => p.turn && p.s0 < L / 2).sort((a, b) => a.s0 - b.s0)[0];
        expect(first.s0).toBeGreaterThanOrEqual(33);
      });

      it('puts ramps, gaps and tunnels on straights', () => {
        for (const r of def.raises) {
          if (r.sides !== 'wall') continue;
          expect(straightOver(id, r.segs[0].s0 - 1, r.segs[r.segs.length - 1].s1 + 1)).toBe(true);
        }
        for (const t of def.tunnels) expect(straightOver(id, t.s0 - 4, t.s1 + 4)).toBe(true);
      });

      it('keeps slopes gentle and kickers at a jumpable angle', () => {
        for (let s = 0; s < L; s += 0.5) {
          if (profile.gapAt(s) || profile.gapAt(s + 1) || profile.gapAt(s - 1)) continue;
          expect(Math.abs(profile.slope(s))).toBeLessThanOrEqual(0.3);
        }
        for (const r of def.raises) {
          for (const seg of r.segs) {
            if (seg.ease === 'kick') {
              const lip = profile.slope(seg.s1 - 0.3);
              expect(lip).toBeGreaterThan(0.14);
              expect(lip).toBeLessThan(0.36);
            }
            if (r.sides === 'verge') expect(Math.abs(seg.h1 - seg.h0) / (seg.s1 - seg.s0)).toBeLessThanOrEqual(0.16 / 1.5);
          }
        }
      });

      it('leaves 18 m of straight after every landing', () => {
        for (const r of def.raises) if (r.gap) expect(straightOver(id, r.gap.s1, r.gap.s1 + 18)).toBe(true);
      });

      it('keeps capsules and pads clear of the grid, ramps and gaps', () => {
        const spots = [...def.capsules.map((s) => ({ s, ramp: true })), ...def.pads.map((p) => ({ s: p.s, ramp: false }))];
        for (const { s, ramp } of spots) {
          expect(s).toBeGreaterThan(4);
          expect(s).toBeLessThan(L - GRID_BACK - 4);
          if (ramp) for (const r of def.raises) {
            const a = r.segs[0].s0 - 6;
            const b = (r.gap?.s1 ?? r.segs[r.segs.length - 1].s1) + 6;
            expect(s < a || s > b).toBe(true);
          }
        }
      });

      it('fits every verge in its half of the ground beside the road', () => {
        for (const r of def.raises) {
          if (r.sides !== 'verge') continue;
          for (let s = r.segs[0].s0; s <= r.segs[r.segs.length - 1].s1; s += 2) {
            const run = Math.max(1, profile.h(s) * VERGE_RUN);
            for (const side of [-1, 1]) {
              const q = path.at(s, side * (EDGE + run));
              const near = path.nearest(q.x, q.z);
              expect(Math.abs(path.delta(near.s, s))).toBeLessThan(EDGE * 3);
            }
          }
        }
      });
    });
  }
});
