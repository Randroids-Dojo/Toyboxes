// Shh! The Library: the rules. Pressure builds; loud noises (the clock, the
// radiator, a sneeze, a snore, a stamp, the squeaky cart) let you toot
// unheard; readers hear unmasked toots through the shelves and catch you if
// they can see you. Pure and seeded, so tests can play it through.

import type { Rng } from './rng';

export const LIB = { x0: 187, x1: 213, z0: -9, z1: 9, cx: 200 };
export const TIME_LIMIT = 150;
export const PRESSURE = { start: 30, rise: 1.2, rumble: 10, toot: 20, masked: 30, squeeze: 20 };
export const SCORE = { book: 200, masked: 50, perfect: 25, frame: 100, perSecond: 3, strike: 150, maxMasked: 10, maxFrames: 3, maxTimeBonus: 450 };
export const NOISE_RADIUS = 10;
export const SHELF_DAMP = 0.65;
export const SIGHT = { range: 9, cone: (70 * Math.PI) / 180 };

export interface Box {
  x: number;
  z: number;
  hw: number;
  hd: number;
}

/** Shelves: four rows running north to south, split by a cross aisle. */
export function shelves(): Box[] {
  const out: Box[] = [];
  for (const x of [190, 193.5, 197, 200.5]) {
    out.push({ x, z: -4.25, hw: 0.4, hd: 3.25 });
    out.push({ x, z: 2.6, hw: 0.4, hd: 1.6 });
  }
  return out;
}

export interface Slot {
  x: number;
  y: number;
  z: number;
  /** Where you stand to shelve it. */
  sx: number;
  sz: number;
  aisle: string;
  done: boolean;
}

export function slots(): Slot[] {
  return [
    { x: 190.42, y: 1.3, z: -5.6, sx: 191.6, sz: -5.6, aisle: 'A', done: false },
    { x: 193.08, y: 0.7, z: 2.2, sx: 191.9, sz: 2.2, aisle: 'B', done: false },
    { x: 193.92, y: 1.8, z: -2.3, sx: 195.2, sz: -2.3, aisle: 'C', done: false },
    { x: 197.42, y: 1.0, z: 3.4, sx: 198.75, sz: 3.4, aisle: 'D', done: false },
    { x: 200.92, y: 1.6, z: -6.6, sx: 202.2, sz: -6.6, aisle: 'E', done: false },
  ];
}

export type MaskKind = 'bong' | 'clank' | 'sneeze' | 'snore' | 'stamp';

export interface MaskEvent {
  kind: MaskKind;
  /** When it is loud (seconds into the trial). */
  at: number;
  /** When its warning starts. */
  warn: number;
  x: number;
  z: number;
  /** Toots this close are covered by it. */
  radius: number;
  /** How long it covers, either side of `at`. */
  window: number;
}

const MASKS: Record<MaskKind, { radius: number; window: number; lead: number; x: number; z: number }> = {
  bong: { radius: 40, window: 0.45, lead: 2.2, x: 200, z: -8.4 },
  clank: { radius: 11, window: 0.4, lead: 1.4, x: 212.5, z: -3 },
  sneeze: { radius: 9, window: 0.4, lead: 1.5, x: 209, z: 3 },
  snore: { radius: 6, window: 0.7, lead: 0.9, x: 210.5, z: 6.5 },
  stamp: { radius: 7, window: 0.3, lead: 0.7, x: 200, z: 5.5 },
};

/** The masking noises for a whole trial, seeded, in time order. */
export function maskSchedule(rng: Rng, length = TIME_LIMIT + 10): MaskEvent[] {
  const ev: MaskEvent[] = [];
  const add = (kind: MaskKind, at: number, x?: number, z?: number) => {
    const m = MASKS[kind];
    ev.push({ kind, at, warn: at - m.lead, x: x ?? m.x, z: z ?? m.z, radius: m.radius, window: m.window });
  };
  for (let t = 12; t < length; t += 15) add('bong', t);
  let t = 6 + rng() * 3;
  while (t < length) {
    add('clank', t, 212.5, rng() < 0.5 ? -3 : 4);
    t += 9 + rng() * 3;
  }
  t = 18 + rng() * 6;
  while (t < length) {
    add('sneeze', t);
    t += 20 + rng() * 10;
  }
  t = 4 + rng() * 3;
  while (t < length) {
    add('snore', t);
    t += 6.5 + rng() * 2;
  }
  return ev.sort((a, b) => a.at - b.at);
}

export interface Reader {
  id: string;
  x: number;
  z: number;
  yaw: number;
  hx: number;
  hz: number;
  hyaw: number;
  state: 'read' | 'turn' | 'investigate' | 'return' | 'sniff' | 'shush' | 'sleep';
  t: number;
  tx: number;
  tz: number;
  stink: number;
  /** Ms. Hush walks a patrol. */
  patrol?: { x: number; z: number; wait: number }[];
  wp: number;
  frameable?: boolean;
}

export type LibEvent =
  | { kind: 'heard'; by: string; x: number; z: number }
  | { kind: 'caught'; by: string; first: boolean }
  | { kind: 'masked'; perfect: boolean; mask: MaskKind }
  | { kind: 'smell'; by: string }
  | { kind: 'framed'; by: string; target: string }
  | { kind: 'blamed'; by: string }
  | { kind: 'rumble' }
  | { kind: 'overflow' }
  | { kind: 'shelved'; slot: number }
  | { kind: 'warn'; mask: MaskEvent }
  | { kind: 'loud'; mask: MaskEvent }
  | { kind: 'end'; why: 'done' | 'time' | 'strikes' | 'overflow' };

/** Does the segment from a to b cross any of the boxes? */
export function crosses(boxes: Box[], ax: number, az: number, bx: number, bz: number): number {
  let n = 0;
  for (const o of boxes) {
    let t0 = 0;
    let t1 = 1;
    const d = [bx - ax, bz - az];
    const p = [ax - o.x, az - o.z];
    const h = [o.hw, o.hd];
    let hit = true;
    for (let k = 0; k < 2 && hit; k++) {
      if (Math.abs(d[k]) < 1e-9) {
        if (Math.abs(p[k]) > h[k]) hit = false;
      } else {
        let ta = (-h[k] - p[k]) / d[k];
        let tb = (h[k] - p[k]) / d[k];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) hit = false;
      }
    }
    if (hit) n++;
  }
  return n;
}

export function readers(): Reader[] {
  const seat = (id: string, x: number, z: number, yaw: number): Reader => ({ id, x, z, yaw, hx: x, hz: z, hyaw: yaw, state: 'read', t: 0, tx: x, tz: z, stink: 0, wp: 0 });
  const list = [seat('reader-0', 205, -5.05, 0), seat('reader-1', 205, -2.95, Math.PI), seat('reader-2', 209, -5.05, 0), seat('reader-3', 205, 2.95, Math.PI), seat('reader-4', 209, 1.05, 0), seat('sneezer', 209, 2.95, Math.PI)];
  const dozer = seat('dozer', 210.5, 6.4, -Math.PI * 0.75);
  dozer.state = 'sleep';
  dozer.frameable = true;
  const hush = seat('hush', 200, 4.6, Math.PI);
  hush.patrol = [
    { x: 200, z: 4.6, wait: 6 },
    { x: 203.2, z: 4.2, wait: 0 },
    { x: 207, z: -1, wait: 2 },
    { x: 211, z: -1, wait: 1 },
    { x: 207, z: -7.6, wait: 0 },
    { x: 202.3, z: -7.8, wait: 1.5 },
    { x: 202.3, z: 0, wait: 2 },
    { x: 198.8, z: 0, wait: 2 },
    { x: 195.2, z: 0, wait: 1 },
    { x: 198.8, z: 4.8, wait: 0 },
  ];
  return [...list, dozer, hush];
}

/** Biscuit, asleep on a cushion: a perfect suspect. */
export const BISCUIT_SPOT = { x: 188.6, z: 6.4 };

export interface LibraryOpts {
  short?: boolean;
  seed?: number;
}

export class Library {
  time = 0;
  pressure = PRESSURE.start;
  strikes = 0;
  books: Slot[];
  masks: MaskEvent[];
  readers: Reader[];
  maskedCount = 0;
  perfectCount = 0;
  frames = 0;
  ended: LibEvent & { kind: 'end' } | null = null;
  events: LibEvent[] = [];
  private nextRumble: number;
  private rumbleWarn = -1;
  private caughtOnce = false;
  private warned = new Set<MaskEvent>();
  private louded = new Set<MaskEvent>();
  readonly shelves = shelves();
  limit: number;
  private squeezeT = 0;

  constructor(
    private rng: Rng,
    opts: LibraryOpts = {},
  ) {
    this.books = slots();
    if (opts.short) this.books = this.books.slice(0, 2);
    this.masks = maskSchedule(rng);
    this.readers = readers();
    this.nextRumble = 14 + rng() * 4;
    this.limit = TIME_LIMIT;
  }

  /** Squeaky cart: Ms. Hush masks toots right next to her while she walks. */
  private cartMask(px: number, pz: number): boolean {
    const h = this.readers.find((r) => r.id === 'hush');
    return !!h && h.state !== 'turn' && h.state !== 'shush' && Math.hypot(h.x - px, h.z - pz) < 2.6 && this.hushMoving;
  }
  hushMoving = false;

  /** The masking noise covering a toot at this moment and place, if any. */
  activeMask(px: number, pz: number): { mask: MaskEvent | null; cart: boolean; off: number } {
    for (const m of this.masks) {
      const off = this.time - m.at;
      if (Math.abs(off) <= m.window && Math.hypot(px - m.x, pz - m.z) <= m.radius) return { mask: m, cart: false, off };
    }
    if (this.cartMask(px, pz)) return { mask: null, cart: true, off: 0 };
    return { mask: null, cart: false, off: 99 };
  }

  /** The next masking noise from now (for hints and debugInfo). */
  nextMask(): MaskEvent | null {
    return this.masks.find((m) => m.at > this.time - m.window) ?? null;
  }

  /** A toot (tap). Returns 'masked', 'heard' or 'caught'. */
  toot(px: number, pz: number): 'masked' | 'heard' | 'caught' | 'quiet' {
    if (this.ended) return 'quiet';
    const cover = this.activeMask(px, pz);
    if (cover.mask || cover.cart) {
      this.pressure = Math.max(0, this.pressure - PRESSURE.masked);
      const perfect = !!cover.mask && Math.abs(cover.off) <= 0.12;
      this.maskedCount++;
      if (perfect) this.perfectCount++;
      this.events.push({ kind: 'masked', perfect, mask: cover.mask?.kind ?? 'stamp' });
      return 'masked';
    }
    this.pressure = Math.max(0, this.pressure - PRESSURE.toot);
    let result: 'heard' | 'caught' | 'quiet' = 'quiet';
    for (const r of this.readers) {
      if (r.state === 'sleep') continue;
      const d = Math.hypot(r.x - px, r.z - pz);
      const shelvesBetween = crosses(this.shelves, r.x, r.z, px, pz);
      const reach = NOISE_RADIUS * Math.pow(SHELF_DAMP, shelvesBetween);
      if (d > reach) continue;
      if (result === 'quiet') result = 'heard';
      // They look straight at the sound: caught if there is a clear view.
      if (d <= SIGHT.range && shelvesBetween === 0) {
        r.state = 'shush';
        r.t = 0;
        r.yaw = Math.atan2(px - r.x, pz - r.z);
        result = 'caught';
        this.strike(r.id);
        break;
      }
      r.state = 'investigate';
      r.t = 0;
      r.tx = px + (this.rng() - 0.5) * 1.5;
      r.tz = pz + (this.rng() - 0.5) * 1.5;
      this.events.push({ kind: 'heard', by: r.id, x: px, z: pz });
    }
    return result;
  }

  private strike(by: string): void {
    this.strikes++;
    this.events.push({ kind: 'caught', by, first: !this.caughtOnce });
    this.caughtOnce = true;
    if (this.strikes >= 3) this.end('strikes');
  }

  /** Holding to squeeze: silent, releases pressure, leaves a cloud (the caller adds it). */
  squeeze(dt: number): boolean {
    if (this.ended || this.pressure <= 0) return false;
    this.pressure = Math.max(0, this.pressure - PRESSURE.squeeze * dt);
    this.squeezeT += dt;
    if (this.squeezeT >= 0.45) {
      this.squeezeT = 0;
      return true;
    }
    return false;
  }

  shelve(i: number): boolean {
    const b = this.books[i];
    if (!b || b.done || this.ended) return false;
    b.done = true;
    this.events.push({ kind: 'shelved', slot: i });
    if (this.books.every((x) => x.done)) this.end('done');
    return true;
  }

  get shelved(): number {
    return this.books.filter((b) => b.done).length;
  }

  private end(why: 'done' | 'time' | 'strikes' | 'overflow'): void {
    if (this.ended) return;
    this.ended = { kind: 'end', why };
    this.events.push(this.ended);
  }

  /** The score so far (and final). */
  score(): number {
    const masked = Math.min(SCORE.maxMasked, this.maskedCount);
    const perfect = Math.min(masked, this.perfectCount);
    const frames = Math.min(SCORE.maxFrames, this.frames);
    const timeBonus = this.ended?.why === 'done' ? Math.min(SCORE.maxTimeBonus, Math.floor(Math.max(0, this.limit - this.time)) * SCORE.perSecond) : 0;
    const s = this.shelved * SCORE.book + masked * SCORE.masked + perfect * SCORE.perfect + frames * SCORE.frame + timeBonus - this.strikes * SCORE.strike;
    return Math.max(0, Math.min(2500, s));
  }

  /**
   * One step. `smell(x, z)` gives the stink at a point and the nearest cloud;
   * `player` is where you are.
   */
  step(dt: number, player: { x: number; z: number }, smell: (x: number, z: number) => { stink: number; cx: number; cz: number } | null): void {
    if (this.ended) return;
    this.time += dt;
    // Pressure and tummy rumbles (warned a moment before).
    this.pressure += PRESSURE.rise * dt;
    if (this.rumbleWarn < 0 && this.time > this.nextRumble - 1.5) {
      this.rumbleWarn = this.nextRumble;
      this.events.push({ kind: 'rumble' });
    }
    if (this.time >= this.nextRumble) {
      this.pressure += PRESSURE.rumble;
      this.nextRumble = this.time + 14 + this.rng() * 5;
      this.rumbleWarn = -1;
    }
    if (this.pressure >= 100) {
      this.pressure = 100;
      this.events.push({ kind: 'overflow' });
      this.end('overflow');
      return;
    }
    for (const m of this.masks) {
      if (!this.warned.has(m) && this.time >= m.warn) {
        this.warned.add(m);
        this.events.push({ kind: 'warn', mask: m });
      }
      if (!this.louded.has(m) && this.time >= m.at) {
        this.louded.add(m);
        this.events.push({ kind: 'loud', mask: m });
      }
    }
    // Readers.
    this.hushMoving = false;
    for (const r of this.readers) {
      r.t += dt;
      // Smell: a cloud reaching a reader.
      const s = r.state !== 'sleep' ? smell(r.x, r.z) : null;
      if (s && s.stink > 0.3 && r.state !== 'sniff' && r.state !== 'shush') {
        r.stink += dt;
        if (r.stink > 0.6) {
          r.state = 'sniff';
          r.t = 0;
          r.stink = 0;
          this.events.push({ kind: 'smell', by: r.id });
          this.blame(r, s.cx, s.cz, player);
        }
      } else r.stink = Math.max(0, r.stink - dt);
      switch (r.state) {
        case 'investigate': {
          const d = Math.hypot(r.tx - r.x, r.tz - r.z);
          if (d > 0.4 && r.t < 6) this.walk(r, r.tx, r.tz, 1.3, dt);
          else if (r.t > 2.5) {
            r.state = 'return';
            r.t = 0;
          }
          // Spotting you while snooping round counts too.
          if (Math.hypot(player.x - r.x, player.z - r.z) < 2.2 && crosses(this.shelves, r.x, r.z, player.x, player.z) === 0 && r.t > 0.5) {
            r.state = 'shush';
            r.t = 0;
            this.strike(r.id);
          }
          break;
        }
        case 'return': {
          const d = Math.hypot(r.hx - r.x, r.hz - r.z);
          if (d > 0.1) this.walk(r, r.hx, r.hz, 1.3, dt);
          else {
            r.state = r.patrol ? 'read' : 'read';
            r.yaw = r.hyaw;
          }
          break;
        }
        case 'shush':
        case 'sniff':
          if (r.t > 2) r.state = r.patrol ? 'read' : Math.hypot(r.hx - r.x, r.hz - r.z) > 0.2 ? 'return' : 'read';
          break;
        case 'read':
          if (r.patrol) this.patrol(r, dt);
          break;
        default:
          break;
      }
    }
    if (this.time >= this.limit) this.end('time');
  }

  /** Smelled a cloud: blame the nearest visible person to it. */
  private blame(r: Reader, cx: number, cz: number, player: { x: number; z: number }): void {
    const cands: { id: string; x: number; z: number }[] = [{ id: 'player', x: player.x, z: player.z }, { id: 'biscuit', x: BISCUIT_SPOT.x, z: BISCUIT_SPOT.z }];
    for (const o of this.readers) if (o !== r && o.frameable) cands.push({ id: o.id, x: o.x, z: o.z });
    let best: { id: string; d: number } | null = null;
    for (const c of cands) {
      const d = Math.hypot(c.x - cx, c.z - cz);
      if (d > 7) continue;
      if (Math.hypot(c.x - r.x, c.z - r.z) > 12) continue;
      if (crosses(this.shelves, r.x, r.z, c.x, c.z) > 0) continue;
      if (!best || d < best.d) best = { id: c.id, d };
    }
    if (!best) return;
    if (best.id === 'player') {
      this.events.push({ kind: 'blamed', by: r.id });
      this.strike(r.id);
    } else {
      this.frames++;
      this.events.push({ kind: 'framed', by: r.id, target: best.id });
    }
  }

  private patrol(r: Reader, dt: number): void {
    const w = r.patrol![r.wp];
    const d = Math.hypot(w.x - r.x, w.z - r.z);
    if (d > 0.1) {
      this.walk(r, w.x, w.z, 1.1, dt);
      this.hushMoving = true;
      r.t = 0;
    } else if (r.t > w.wait) {
      r.wp = (r.wp + 1) % r.patrol!.length;
      r.t = 0;
    }
  }

  private walk(r: Reader, x: number, z: number, speed: number, dt: number): void {
    const dx = x - r.x;
    const dz = z - r.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    const s = Math.min(d, speed * dt);
    r.x += (dx / d) * s;
    r.z += (dz / d) * s;
    r.yaw = Math.atan2(dx, dz);
  }

  takeEvents(): LibEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Golden beans: all five shelved; 1300 points; 1800 with no strikes. */
  beans(): number {
    const all = this.books.length === 5 && this.shelved === 5;
    if (!all) return 0;
    const s = this.score();
    return s >= 1800 && this.strikes === 0 ? 3 : s >= 1300 ? 2 : 1;
  }
}
