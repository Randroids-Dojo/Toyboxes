// Checks on the Golden Paddle's deck plan as plain data: spots, reachability,
// gates, aisles, spot ranges, wall normals and openings.

import { describe, expect, it } from 'vitest';
import {
  ARRIVAL,
  COLLIDERS,
  EXIT,
  EXIT_RANGE,
  GATE_COLLIDERS,
  SPOTS,
  WALLS,
  colliderGap,
  wallLength,
  wallNormal,
  zoneAt,
  type ColliderDef,
  type SpotId,
} from '../src/experiences/casino/layout';

// Same as PLAYER_R in src/game/game.ts.
const PLAYER_R = 0.36;

const spotIds = Object.keys(SPOTS) as SpotId[];

const LOUNGE_SPOTS: SpotId[] = ['falls', 'poker0', 'poker1', 'poker2', 'wheelhouseGate'];
const WHEELHOUSE_SPOTS: SpotId[] = ['captain', 'helm'];
const OPEN_SPOTS: SpotId[] = ['lever', 'telegraph', 'paytable', 'fame', 'roulette', 'blackjack', 'penny', 'logbook', 'loungeGate', 'wheel'];

function clearOf(cols: ColliderDef[], x: number, z: number, r: number): boolean {
  for (const c of cols) if (colliderGap(c, x, z, r) <= 0) return false;
  return true;
}

// Flood fill on a 0.25 m grid from ARRIVAL; returns the spots reached.
const STEP = 0.25;
const X0 = -31;
const X1 = 25;
const Z0 = -14;
const Z1 = 14;
const NX = Math.round((X1 - X0) / STEP) + 1;
const NZ = Math.round((Z1 - Z0) / STEP) + 1;

function reachedSpots(cols: ColliderDef[]): Set<SpotId> {
  const walk = new Uint8Array(NX * NZ);
  for (let i = 0; i < NX; i++) for (let k = 0; k < NZ; k++) walk[i * NZ + k] = clearOf(cols, X0 + i * STEP, Z0 + k * STEP, PLAYER_R) ? 1 : 0;
  const seen = new Uint8Array(NX * NZ);
  const si = Math.round((ARRIVAL.x - X0) / STEP);
  const sk = Math.round((ARRIVAL.z - Z0) / STEP);
  const queue: number[] = [];
  if (walk[si * NZ + sk]) {
    seen[si * NZ + sk] = 1;
    queue.push(si * NZ + sk);
  }
  for (let q = 0; q < queue.length; q++) {
    const i = Math.floor(queue[q] / NZ);
    const k = queue[q] % NZ;
    for (let di = -1; di <= 1; di++) {
      for (let dk = -1; dk <= 1; dk++) {
        if (!di && !dk) continue;
        const ni = i + di;
        const nk = k + dk;
        if (ni < 0 || nk < 0 || ni >= NX || nk >= NZ) continue;
        const id = ni * NZ + nk;
        if (seen[id] || !walk[id]) continue;
        seen[id] = 1;
        queue.push(id);
      }
    }
  }
  const out = new Set<SpotId>();
  for (const id of spotIds) {
    const s = SPOTS[id];
    const ci = Math.round((s.x - X0) / STEP);
    const ck = Math.round((s.z - Z0) / STEP);
    search: for (let i = ci - 1; i <= ci + 1; i++) {
      for (let k = ck - 1; k <= ck + 1; k++) {
        if (i < 0 || k < 0 || i >= NX || k >= NZ || !seen[i * NZ + k]) continue;
        if (Math.hypot(X0 + i * STEP - s.x, Z0 + k * STEP - s.z) <= 0.2) {
          out.add(id);
          break search;
        }
      }
    }
  }
  return out;
}

describe('casino layout: spots', () => {
  it('every spot leaves room for the player clear of every collider', () => {
    const bad: string[] = [];
    for (const id of spotIds) {
      const s = SPOTS[id];
      COLLIDERS.forEach((c, i) => {
        const gap = colliderGap(c, s.x, s.z, PLAYER_R);
        if (gap <= 0) bad.push(`${id} overlaps collider ${i} (${c.kind} at ${c.x}, ${c.z}) by ${(-gap).toFixed(3)} m`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('every spot is reachable on foot from the arrival point with the gates open', () => {
    const reached = reachedSpots(COLLIDERS);
    const missing = spotIds.filter((id) => !reached.has(id));
    expect(missing, `unreachable spots: ${missing.join(', ')}`).toEqual([]);
  });

  it('closed gates keep the lounge and wheelhouse shut while the saloon and stern stay open', () => {
    const closed = reachedSpots([...COLLIDERS, GATE_COLLIDERS.lounge, GATE_COLLIDERS.wheelhouse]);
    const leaked = [...LOUNGE_SPOTS, ...WHEELHOUSE_SPOTS].filter((id) => closed.has(id));
    expect(leaked, `reachable through closed gates: ${leaked.join(', ')}`).toEqual([]);
    const blocked = OPEN_SPOTS.filter((id) => !closed.has(id));
    expect(blocked, `saloon or stern spots cut off by the gates: ${blocked.join(', ')}`).toEqual([]);

    const loungeOpen = reachedSpots([...COLLIDERS, GATE_COLLIDERS.wheelhouse]);
    const loungeMissing = LOUNGE_SPOTS.filter((id) => !loungeOpen.has(id));
    expect(loungeMissing, `lounge spots unreachable with the lounge rope open: ${loungeMissing.join(', ')}`).toEqual([]);
    const wheelLeaked = WHEELHOUSE_SPOTS.filter((id) => loungeOpen.has(id));
    expect(wheelLeaked, `wheelhouse reachable past its closed rope: ${wheelLeaked.join(', ')}`).toEqual([]);
  });

  it('the central aisle from the arrival point to the lever is 1.2 m wide and clear', () => {
    const lever = SPOTS.lever;
    expect(Math.abs(ARRIVAL.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(lever.x)).toBeLessThanOrEqual(2);
    expect(ARRIVAL.z).toBeCloseTo(6.4);
    const len = Math.hypot(lever.x - ARRIVAL.x, lever.z - ARRIVAL.z);
    const n = Math.ceil(len / 0.1);
    const bad: string[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ARRIVAL.x + (lever.x - ARRIVAL.x) * t;
      const z = ARRIVAL.z + (lever.z - ARRIVAL.z) * t;
      COLLIDERS.forEach((c, k) => {
        const gap = colliderGap(c, x, z, 0.6);
        if (gap <= 0) bad.push(`(${x.toFixed(2)}, ${z.toFixed(2)}) hits collider ${k} by ${(-gap).toFixed(3)} m`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('the arrival point is walkable and outside the exit range', () => {
    expect(Math.hypot(ARRIVAL.x - EXIT.x, ARRIVAL.z - EXIT.z)).toBeGreaterThan(EXIT_RANGE);
    expect(clearOf(COLLIDERS, ARRIVAL.x, ARRIVAL.z, PLAYER_R)).toBe(true);
  });

  it('spot ranges only overlap where intended', () => {
    // Each allowed pair, sorted by name.
    const ALLOWED: [SpotId, SpotId][] = [
      // The poker cabinets all open the same game, so overlap is harmless.
      ['poker0', 'poker1'],
      ['poker1', 'poker2'],
      // 2.82 m apart: standing at either spot the other is out of its range.
      ['blackjack', 'penny'],
      // 3.06 m apart: standing at either spot the other is out of its range.
      ['captain', 'helm'],
    ];
    const pairs: string[] = [];
    for (let i = 0; i < spotIds.length; i++) {
      for (let j = i + 1; j < spotIds.length; j++) {
        const a = SPOTS[spotIds[i]];
        const b = SPOTS[spotIds[j]];
        if (Math.hypot(a.x - b.x, a.z - b.z) < a.range + b.range) pairs.push([spotIds[i], spotIds[j]].sort().join('+'));
      }
    }
    expect(pairs.sort()).toEqual(ALLOWED.map((p) => [...p].sort().join('+')).sort());

    // Non-poker pairs: the spot you stand on is the only one in range there.
    for (const [p, q] of ALLOWED) {
      if (p.startsWith('poker') && q.startsWith('poker')) continue;
      const a = SPOTS[p];
      const b = SPOTS[q];
      expect(Math.hypot(a.x - b.x, a.z - b.z), `${p} and ${q}`).toBeGreaterThan(Math.max(a.range, b.range));
    }

    const { lever, telegraph } = SPOTS;
    expect(Math.hypot(lever.x - telegraph.x, lever.z - telegraph.z)).toBeGreaterThan(Math.max(lever.range, telegraph.range) + 0.5);
  });
});

describe('casino layout: walls', () => {
  // The stern deck is open air, so the stern wall's outside lands on it.
  const outdoors = (z: string | null) => z === null || z === 'stern';

  it('every wall normal points into the boat', () => {
    const bad: string[] = [];
    for (const w of WALLS) {
      const n = wallNormal(w);
      const mx = (w.a.x + w.b.x) / 2;
      const mz = (w.a.z + w.b.z) / 2;
      const inZone = zoneAt(mx + n.x * 0.5, mz + n.z * 0.5);
      const outZone = zoneAt(mx - n.x * 0.6, mz - n.z * 0.6);
      if (inZone === null) bad.push(`${w.id}: point 0.5 m inward is outside the boat`);
      if (w.exterior) {
        // A real direction check: the far side is outdoors.
        if (!outdoors(outZone)) bad.push(`${w.id}: exterior wall but its outside is in ${outZone}`);
        if (inZone !== null && outdoors(inZone)) bad.push(`${w.id}: inward side is outdoors (${inZone})`);
      } else if (w.back) {
        // A partition: both sides are inside the boat.
        if (outZone === null) bad.push(`${w.id}: partition but its far side is outside the boat`);
      } else if (outZone !== null && outZone === inZone) {
        // bayW and bayE are hull walls flagged interior so the cutaway keeps them; their far side is water.
        bad.push(`${w.id}: both sides are the same zone (${inZone})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('every opening fits its wall and arches clear the wall top', () => {
    const bad: string[] = [];
    for (const w of WALLS) {
      const len = wallLength(w);
      for (const o of w.openings) {
        const tag = `${w.id} opening ${o.from.toFixed(2)}..${o.to.toFixed(2)}`;
        if (!(o.from >= 0 && o.from < o.to && o.to <= len + 1e-9)) bad.push(`${tag} does not fit in length ${len.toFixed(2)}`);
        if (o.arch && !(o.top + (o.to - o.from) / 2 < w.height - 0.1)) bad.push(`${tag} arch reaches ${(o.top + (o.to - o.from) / 2).toFixed(2)} of height ${w.height}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
