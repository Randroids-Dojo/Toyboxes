// Who lives in Little Puffington and what they do all day: where they stand,
// the loops they walk, who sleeps, who laughs with you and who holds tea.

import { BANDSTAND, BLANKETS } from './layout';
import type { BrainSpec } from './sim/people';

const ring = (r: number, n: number, wait: number, start = 0): { x: number; z: number; wait: number }[] =>
  Array.from({ length: n }, (_, i) => {
    const a = start + (i / n) * Math.PI * 2;
    return { x: Math.round(Math.cos(a) * r * 100) / 100, z: Math.round(Math.sin(a) * r * 100) / 100, wait };
  });

const seat = (tx: number, tz: number, a: number) => ({ x: tx + Math.cos(a) * 1.0, z: tz + Math.sin(a) * 1.0, wait: 999, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) });

/** The village cast (Pip and Biscuit follow someone; the band plays). */
export const VILLAGERS: BrainSpec[] = [
  { id: 'gran', route: [{ x: 4.65, z: 18.5, wait: 999, yaw: -Math.PI / 2 }], speed: 1, fan: true, voice: 300 },
  { id: 'lady', route: [{ x: 1.55, z: 16.2, wait: 22, yaw: Math.PI / 2 + 0.3 }, { x: 0.8, z: 15.2, wait: 5, yaw: Math.PI }, { x: 1.55, z: 16.2, wait: 14, yaw: Math.PI / 2 + 0.3 }], speed: 0.9, cup: true, voice: 330 },
  { id: 'primrose', route: [seat(-5, 16, 0.3)], speed: 1, seated: true, cup: true, voice: 280 },
  { id: 'wimble', route: [seat(-8, 14.6, 2.4)], speed: 0.8, seated: true, sleeper: true, voice: 120 },
  { id: 'fizz', route: [{ x: 14, z: 1.95, wait: 999, yaw: 0 }], speed: 1.2, voice: 420 },
  { id: 'sprout', route: [{ x: -18.75, z: 9, wait: 999, yaw: Math.PI / 2 }], speed: 1, voice: 130 },
  {
    id: 'bobbins',
    route: [
      { x: 11, z: -6.5, wait: 7, yaw: 0 },
      { x: 5.5, z: -9.5, wait: 3 },
      { x: 6.5, z: -13.5, wait: 4 },
      { x: 16, z: -12.2, wait: 5, yaw: Math.PI },
      { x: 14.5, z: -7, wait: 2 },
    ],
    speed: 1.3,
    voice: 150,
  },
  { id: 'mayor', route: ring(14.2, 10, 3, 0.4).map((w, i) => ({ ...w, wait: i % 3 === 0 ? 5 : 1.5 })), speed: 1.1, suspect: true, voice: 110 },
  { id: 'biscuit', route: [{ x: 13, z: 5, wait: 999 }], speed: 1.6, suspect: true, follow: { id: 'mayor', gap: 1.4, leash: 60 }, voice: 520 },
  { id: 'pip', route: [{ x: -2.5, z: 6.5, wait: 999, yaw: Math.PI }], speed: 2.4, fan: true, follow: { id: 'player', gap: 2.6, leash: 22 }, voice: 520 },
];

const B = BANDSTAND;
const bandAt = (a: number, r = 2.2) => ({ x: B.x + Math.cos(a) * r, z: B.z + Math.sin(a) * r });

export const BAND_POS = {
  maestro: { ...bandAt(0, 2.5), yaw: -Math.PI / 2 },
  tuba: bandAt(Math.PI),
  trumpet: bandAt(Math.PI * 0.72),
  clarinet: bandAt(Math.PI * 1.28),
  drummer: bandAt(Math.PI * 0.42, 2.4),
};

export const BAND: BrainSpec[] = (['tuba', 'trumpet', 'clarinet', 'drummer'] as const).map((id) => {
  const p = BAND_POS[id];
  return { id, route: [{ x: p.x, z: p.z, wait: 999, yaw: Math.atan2(BAND_POS.maestro.x - p.x, BAND_POS.maestro.z - p.z) }], speed: 1, deaf: true, voice: 150 };
});
BAND.unshift({ id: 'maestro', route: [{ x: BAND_POS.maestro.x, z: BAND_POS.maestro.z, wait: 999, yaw: BAND_POS.maestro.yaw }], speed: 1, deaf: true, voice: 140 });

/** Picnickers on the blankets: four in free play, twelve in Picnic Panic. */
export function picnickers(n: number): BrainSpec[] {
  const out: BrainSpec[] = [];
  for (let i = 0; i < n; i++) {
    const b = BLANKETS[i % BLANKETS.length];
    const side = i >= BLANKETS.length ? -1 : 1;
    const x = b.x + Math.cos(b.rot) * 0.55 * side;
    const z = b.z - Math.sin(b.rot) * 0.55 * side;
    out.push({ id: `picnic-${i}`, route: [{ x, z, wait: 999, yaw: b.rot + (side > 0 ? -Math.PI / 2 : Math.PI / 2) }], speed: 1.4, seated: true, voice: 200 + ((i * 37) % 160) });
  }
  return out;
}
