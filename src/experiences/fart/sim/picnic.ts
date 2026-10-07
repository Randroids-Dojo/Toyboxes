// Picnic Panic: the rules. Twelve picnickers on Mr. Sprout's prize lawn;
// cabbage clouds drift on a wind that changes every 20 seconds. Each
// picnicker's whiff meter fills with stink; full means they pack up and run.
// Grandad has a peg on his nose; the family under the parasol can only be
// reached from the side or from above.

import type { Cloud } from './clouds';
import type { Rng } from './rng';
import { BLANKETS } from '../layout';

export const PICNIC_TIME = 90;
export const WIND_SPEED = 1.2;
export const WIND_EVERY = 20;
export const WOBBLE = 3;
/** Whiff gained per second per unit of stink. */
export const WHIFF_RATE = 0.85;

export interface Picnicker {
  id: string;
  x: number;
  z: number;
  yaw: number;
  blanket: number;
  /** Whiff needed to leave (Grandad needs twice as much). */
  need: number;
  whiff: number;
  state: 'sit' | 'pack' | 'flee' | 'gone';
  t: number;
  /** Under the parasol: clouds from this direction (unit vector) are blocked below 2 m. */
  shade: { x: number; z: number } | null;
  peg: boolean;
}

export type PicnicEvent = { kind: 'cleared'; id: string; left: number } | { kind: 'windWarn' } | { kind: 'wind'; x: number; z: number } | { kind: 'whiff'; id: string } | { kind: 'end'; done: boolean };

/** Where the twelve sit: two on most blankets, one where the hamper is. */
export function picnicSpots(): { x: number; z: number; yaw: number; blanket: number }[] {
  const out: { x: number; z: number; yaw: number; blanket: number }[] = [];
  BLANKETS.forEach((b, i) => {
    const sides = i === 2 || i === 5 || i === 6 || i === 7 ? [1] : [1, -1];
    for (const side of sides) {
      out.push({ x: b.x + Math.cos(b.rot) * 0.6 * side, z: b.z - Math.sin(b.rot) * 0.6 * side, yaw: b.rot + (side > 0 ? -Math.PI / 2 : Math.PI / 2), blanket: i });
    }
  });
  return out.slice(0, 12);
}

export class Picnic {
  time = 0;
  readonly people: Picnicker[];
  wind = { x: 0, z: 0 };
  private angle: number;
  private nextChange = WIND_EVERY;
  wobbling = false;
  ended: { done: boolean } | null = null;
  clearedAt: number | null = null;
  events: PicnicEvent[] = [];
  limit = PICNIC_TIME;

  constructor(
    private rng: Rng,
    opts: { short?: boolean } = {},
  ) {
    let spots = picnicSpots();
    if (opts.short) spots = spots.slice(0, 3);
    this.people = spots.map((s, i) => ({
      id: `p${i}`,
      x: s.x,
      z: s.z,
      yaw: s.yaw,
      blanket: s.blanket,
      need: i === 4 ? 2 : 1,
      whiff: 0,
      state: 'sit',
      t: 0,
      // The family on blanket 3 sits under a parasol leaning to the east.
      shade: s.blanket === 3 ? { x: 1, z: 0 } : null,
      peg: i === 4,
    }));
    this.angle = rng() * Math.PI * 2;
    this.setWind();
  }

  private setWind(): void {
    this.wind = { x: Math.cos(this.angle) * WIND_SPEED, z: Math.sin(this.angle) * WIND_SPEED };
  }

  /** Stink reaching a picnicker from the clouds, minus any blocked by a parasol. */
  stinkFor(p: Picnicker, clouds: readonly Cloud[]): number {
    let s = 0;
    for (const c of clouds) {
      if (c.stink <= 0) continue;
      const d = Math.hypot(c.x - p.x, (c.y - 1.0) * 0.6, c.z - p.z);
      const reach = c.r * 1.25;
      if (d > reach) continue;
      if (p.shade && c.y < 2) {
        // Coming from the parasol side (in front of it) is blocked.
        const dx = c.x - p.x;
        const dz = c.z - p.z;
        const along = (dx * p.shade.x + dz * p.shade.z) / (Math.hypot(dx, dz) || 1);
        if (along > 0.35) continue;
      }
      const fade = 1 - Math.pow(c.age / c.life, 2);
      s += c.stink * (1 - d / reach) * fade;
    }
    return s;
  }

  step(dt: number, clouds: readonly Cloud[]): void {
    if (this.ended) return;
    this.time += dt;
    // Wind: wobble for a few seconds, then swing round.
    if (!this.wobbling && this.time >= this.nextChange - WOBBLE) {
      this.wobbling = true;
      this.events.push({ kind: 'windWarn' });
    }
    if (this.time >= this.nextChange) {
      this.wobbling = false;
      this.angle += (Math.PI / 2) * (1 + Math.floor(this.rng() * 2)) * (this.rng() < 0.5 ? -1 : 1);
      this.setWind();
      this.nextChange += WIND_EVERY;
      this.events.push({ kind: 'wind', x: this.wind.x, z: this.wind.z });
    }
    for (const p of this.people) {
      p.t += dt;
      if (p.state === 'sit') {
        const s = this.stinkFor(p, clouds);
        if (s > 0.05) {
          const before = p.whiff;
          p.whiff = Math.min(p.need, p.whiff + s * WHIFF_RATE * dt);
          if (before === 0) this.events.push({ kind: 'whiff', id: p.id });
        } else p.whiff = Math.max(0, p.whiff - dt * 0.04);
        if (p.whiff >= p.need) {
          p.state = 'pack';
          p.t = 0;
          this.events.push({ kind: 'cleared', id: p.id, left: this.left - 0 });
        }
      } else if (p.state === 'pack') {
        if (p.t > 0.9) {
          p.state = 'flee';
          p.t = 0;
        }
      } else if (p.state === 'flee') {
        // Run off to the west gate of the park.
        const tx = -31.5;
        const tz = p.z + (p.z > 10 ? 4 : -4);
        const dx = tx - p.x;
        const dz = tz - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.5 || p.t > 6) p.state = 'gone';
        else {
          p.x += (dx / d) * 4.2 * dt;
          p.z += (dz / d) * 4.2 * dt;
          p.yaw = Math.atan2(dx, dz);
        }
      }
    }
    if (this.left === 0 && this.clearedAt === null) {
      this.clearedAt = this.time;
      this.ended = { done: true };
      this.events.push({ kind: 'end', done: true });
    } else if (this.time >= this.limit) {
      this.ended = { done: false };
      this.events.push({ kind: 'end', done: false });
    }
  }

  get left(): number {
    return this.people.filter((p) => p.state === 'sit').length;
  }

  /** Seconds before the wind turns. */
  get windIn(): number {
    return this.nextChange - this.time;
  }

  takeEvents(): PicnicEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Golden beans: clear them all; under 60 s; under 40 s. */
  beans(): number {
    if (this.clearedAt === null || this.people.length < 12) return 0;
    return this.clearedAt < 40 ? 3 : this.clearedAt < 60 ? 2 : 1;
  }
}
