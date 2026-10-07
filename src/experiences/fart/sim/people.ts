// Townsfolk brains: routines, hearing, smell, double takes, blame and the
// constable's chase. Pure (no three.js): the world gives them toots, stink
// and sight lines; they answer with what they say and do.

import type { Rng } from './rng';

export type Mood = 'idle' | 'walk' | 'look' | 'startled' | 'sniff' | 'peeyew' | 'flee' | 'blame' | 'laugh' | 'sleep' | 'chase' | 'scold' | 'perform' | 'away';

export interface Waypoint {
  x: number;
  z: number;
  /** Seconds to wait here. */
  wait: number;
  /** Facing while waiting (radians); default keeps the walking heading. */
  yaw?: number;
}

export interface BrainSpec {
  id: string;
  /** Where they stand or the loop they walk. */
  route: Waypoint[];
  speed: number;
  /** Sits at the first waypoint (tea tables, picnics). */
  seated?: boolean;
  /** Asleep until something wakes them. */
  sleeper?: boolean;
  /** Laughs with you instead of being shocked (Gran, Pip). */
  fan?: boolean;
  /** Holds a teacup that flies on a startle. */
  cup?: boolean;
  /** Can be blamed (Biscuit, the Mayor) as well as everyone else. */
  suspect?: boolean;
  /** Takes no notice (the band while playing, statues). */
  deaf?: boolean;
  /** Stink needed to react (Grandpa with a peg on his nose needs more). */
  nose?: number;
  /** Follows someone ('player' or an id), keeping this far away. */
  follow?: { id: string; gap: number; leash: number };
  voice: number;
}

export interface Brain {
  spec: BrainSpec;
  x: number;
  z: number;
  yaw: number;
  mood: Mood;
  t: number;
  /** Route progress. */
  wp: number;
  waitT: number;
  /** Where they are looking or heading for a reaction. */
  tx: number;
  tz: number;
  cool: number;
  stinkT: number;
  hasCup: boolean;
  cupT: number;
  speed: number;
  /** For a home-coming after fleeing. */
  awayT: number;
  /** The last thing said, for tests. */
  said: string;
}

export interface Say {
  id: string;
  text: string;
  tone: 'say' | 'shout' | 'think';
  sound?: 'gasp' | 'peeyew' | 'giggle' | 'sniff' | 'shout' | 'snore' | 'whistle';
}

export type BrainEvent =
  | { kind: 'say'; say: Say }
  | { kind: 'cup'; id: string; x: number; z: number; yaw: number }
  | { kind: 'startle'; id: string; strong: boolean; x: number; z: number }
  | { kind: 'smell'; id: string; x: number; z: number }
  | { kind: 'fled'; id: string }
  | { kind: 'blame'; by: string; target: string }
  | { kind: 'wake'; id: string }
  | { kind: 'caught' }
  | { kind: 'chase'; on: boolean; escaped: boolean };

export interface Senses {
  /** Can `a` see the point (nothing tall in between)? */
  sees(ax: number, az: number, bx: number, bz: number): boolean;
  stinkAt(x: number, z: number): number;
  /** Centre of the cloud reaching this point most, or null. */
  cloudAt(x: number, z: number): { x: number; z: number } | null;
  player: { x: number; y: number; z: number };
}

const STARTLE_COOL = 2.6;

export function brain(spec: BrainSpec): Brain {
  const w = spec.route[0];
  return { spec, x: w.x, z: w.z, yaw: w.yaw ?? 0, mood: spec.sleeper ? 'sleep' : 'idle', t: 0, wp: 0, waitT: w.wait, tx: w.x, tz: w.z, cool: 0, stinkT: 0, hasCup: !!spec.cup, cupT: 0, speed: 0, awayT: 0, said: '' };
}

/** A toot as the townsfolk hear it. */
export interface Heard {
  x: number;
  z: number;
  noise: number;
  gas: string;
  big: boolean;
}

/**
 * Who gets the blame: the nearest person to the source that the noticer can
 * see (the player included). Returns an id ('player' for you).
 */
export function pickCulprit(noticer: Brain, source: { x: number; z: number }, people: Brain[], player: { x: number; z: number }, senses: Senses, playerVisible: boolean): string | null {
  let best: string | null = null;
  let bd = Infinity;
  const consider = (id: string, x: number, z: number) => {
    const d = Math.hypot(x - source.x, z - source.z);
    if (d > 9) return;
    if (Math.hypot(x - noticer.x, z - noticer.z) > 18) return;
    if (!senses.sees(noticer.x, noticer.z, x, z)) return;
    if (d < bd) {
      bd = d;
      best = id;
    }
  };
  if (playerVisible) consider('player', player.x, player.z);
  for (const p of people) {
    if (p === noticer || p.mood === 'away' || p.spec.deaf) continue;
    consider(p.spec.id, p.x, p.z);
  }
  return best;
}

/** Can a townsperson see the player? Facing matters a little: not straight behind them. */
export function canSeePlayer(b: Brain, player: { x: number; y: number; z: number }, senses: Senses): boolean {
  const dx = player.x - b.x;
  const dz = player.z - b.z;
  const d = Math.hypot(dx, dz);
  if (d > 18) return false;
  if (player.y > 2.4 && d > 4) return false;
  if (d > 1.5) {
    const facing = (dx * Math.sin(b.yaw) + dz * Math.cos(b.yaw)) / d;
    if (facing < -0.55) return false;
  }
  return senses.sees(b.x, b.z, player.x, player.z);
}

export class Town {
  readonly people: Brain[];
  events: BrainEvent[] = [];
  /** Constable's chase state. */
  chase = { on: false, incidents: [] as number[], hidden: 0, t: 0, total: 0, escaped: false };
  time = 0;

  constructor(
    specs: BrainSpec[],
    private rng: Rng,
  ) {
    this.people = specs.map(brain);
  }

  get(id: string): Brain | undefined {
    return this.people.find((p) => p.spec.id === id);
  }

  private say(b: Brain, text: string, tone: Say['tone'] = 'say', sound?: Say['sound']): void {
    b.said = text;
    this.events.push({ kind: 'say', say: { id: b.spec.id, text, tone, sound } });
  }

  /** A toot happened. Distance sets the reaction: a double take close in, a turn and look further out. */
  hear(h: Heard, senses: Senses): void {
    const player = senses.player;
    for (const b of this.people) {
      if (b.spec.deaf || b.mood === 'away' || b.mood === 'chase' || b.mood === 'scold' || b.mood === 'flee') continue;
      const d = Math.hypot(b.x - h.x, b.z - h.z);
      if (d > h.noise) continue;
      if (b.cool > 0) continue;
      b.cool = STARTLE_COOL;
      if (b.spec.fan) {
        b.mood = 'laugh';
        b.t = 0;
        b.tx = h.x;
        b.tz = h.z;
        const lines = b.spec.id === 'gran' ? (h.gas === 'beans' ? ["That's my beans!", 'Ooh, lovely!', 'Better out than in!'] : ['Hee hee!', 'Bless you, dearie!']) : ['Hee hee!', 'Again!', 'Ha ha!'];
        this.say(b, lines[Math.floor(this.rng() * lines.length)], 'say', 'giggle');
        continue;
      }
      if (b.mood === 'sleep') {
        if (d < h.noise * 0.6) {
          b.mood = 'startled';
          b.t = 0;
          b.tx = h.x;
          b.tz = h.z;
          this.events.push({ kind: 'wake', id: b.spec.id });
          this.events.push({ kind: 'startle', id: b.spec.id, strong: true, x: b.x, z: b.z });
          this.say(b, 'Bless you!', 'shout', 'gasp');
        } else this.say(b, 'Zzz...', 'think', 'snore');
        continue;
      }
      const strong = d < h.noise * 0.5 || h.big;
      b.tx = h.x;
      b.tz = h.z;
      b.t = 0;
      if (strong) {
        b.mood = 'startled';
        this.events.push({ kind: 'startle', id: b.spec.id, strong: true, x: b.x, z: b.z });
        if (b.hasCup) {
          b.hasCup = false;
          b.cupT = 8;
          this.events.push({ kind: 'cup', id: b.spec.id, x: b.x, z: b.z, yaw: b.yaw });
        }
        // Who did it?
        const seen = canSeePlayer(b, player, senses);
        const culprit = pickCulprit(b, { x: h.x, z: h.z }, this.people, player, senses, seen);
        this.blame(b, culprit);
        this.incident(b);
      } else {
        b.mood = 'look';
        this.say(b, '?', 'think');
      }
    }
  }

  private blame(b: Brain, culprit: string | null): void {
    if (culprit === 'player') {
      const lines = ['Excuse you!', 'I say!', 'How rude!', 'Good heavens!', 'Pardon you!'];
      this.say(b, lines[Math.floor(this.rng() * lines.length)], 'shout', 'gasp');
      this.events.push({ kind: 'blame', by: b.spec.id, target: 'player' });
    } else if (culprit) {
      const name = culprit === 'biscuit' ? 'Biscuit!' : culprit === 'mayor' ? 'Mr. Mayor!' : 'Was that you?';
      this.say(b, name, 'shout', 'gasp');
      b.mood = 'blame';
      const t = this.get(culprit);
      if (t) {
        b.tx = t.x;
        b.tz = t.z;
      }
      this.events.push({ kind: 'blame', by: b.spec.id, target: culprit });
    } else {
      this.say(b, 'Oh!', 'shout', 'gasp');
    }
  }

  /** Something naughty near the constable. */
  private incident(b: Brain): void {
    const c = this.get('bobbins');
    if (!c || this.chase.on) return;
    if (Math.hypot(c.x - b.x, c.z - b.z) > 16 && b !== c) return;
    this.chase.incidents = this.chase.incidents.filter((t) => this.time - t < 60);
    this.chase.incidents.push(this.time);
    if (this.chase.incidents.length >= 3) this.startChase(c);
    else if (b !== c) this.say(c, this.chase.incidents.length === 1 ? 'Hmm?' : 'Hmmmm...', 'think');
  }

  startChase(c = this.get('bobbins')): void {
    if (!c) return;
    this.chase.on = true;
    this.chase.incidents = [];
    this.chase.hidden = 0;
    this.chase.t = 0;
    this.chase.escaped = false;
    c.mood = 'chase';
    c.t = 0;
    this.say(c, 'Oi! Stop right there!', 'shout', 'whistle');
    this.events.push({ kind: 'chase', on: true, escaped: false });
  }

  step(dt: number, senses: Senses): void {
    this.time += dt;
    const player = senses.player;
    for (const b of this.people) {
      b.t += dt;
      b.cool = Math.max(0, b.cool - dt);
      if (b.cupT > 0) {
        b.cupT -= dt;
        if (b.cupT <= 0 && b.spec.cup) b.hasCup = true;
      }
      // Smell.
      if (!b.spec.deaf && b.mood !== 'away' && b.mood !== 'flee' && b.mood !== 'chase') {
        const s = senses.stinkAt(b.x, b.z);
        const need = b.spec.nose ?? 0.3;
        if (s > need) b.stinkT += dt;
        else b.stinkT = Math.max(0, b.stinkT - dt * 2);
        if (b.stinkT > 0.5 && b.mood !== 'sniff' && b.mood !== 'peeyew' && (b.mood !== 'sleep' || s > need * 2)) {
          b.mood = 'sniff';
          b.t = 0;
          this.say(b, 'Sniff sniff?', 'think', 'sniff');
        }
      }
      this.think(b, dt, senses);
    }
    // The chase.
    if (this.chase.on) {
      const c = this.get('bobbins');
      if (c) {
        this.chase.t += dt;
        const seen = canSeePlayer({ ...c, yaw: Math.atan2(player.x - c.x, player.z - c.z) }, player, senses);
        const onRoof = player.y > 2.4;
        if (!seen || onRoof) this.chase.hidden += dt;
        else this.chase.hidden = Math.max(0, this.chase.hidden - dt * 0.5);
        if (onRoof && this.chase.hidden > 0.2 && this.chase.hidden < 0.2 + dt) this.say(c, 'Come down from there!', 'shout', 'whistle');
        if (this.chase.hidden > 8) {
          this.chase.on = false;
          this.chase.escaped = true;
          c.mood = 'walk';
          this.say(c, 'Hmph. Slippery little tooter.', 'say');
          this.events.push({ kind: 'chase', on: false, escaped: true });
        } else if (Math.hypot(player.x - c.x, player.z - c.z) < 1.3 && !onRoof) {
          this.chase.on = false;
          c.mood = 'scold';
          c.t = 0;
          this.say(c, 'Gotcha! Behave yourself.', 'shout', 'whistle');
          this.events.push({ kind: 'caught' }, { kind: 'chase', on: false, escaped: false });
        } else if (this.chase.t > 40) {
          this.chase.on = false;
          this.chase.escaped = true;
          c.mood = 'walk';
          this.say(c, 'Puff... puff... I give up.', 'say');
          this.events.push({ kind: 'chase', on: false, escaped: true });
        }
      }
    }
  }

  private think(b: Brain, dt: number, senses: Senses): void {
    const home = b.spec.route[b.wp];
    switch (b.mood) {
      case 'startled':
        if (b.t > 1.4) b.mood = b.spec.sleeper ? 'idle' : 'idle';
        if (b.spec.sleeper && b.t > 7) b.mood = 'sleep';
        b.speed = 0;
        return this.face(b, b.tx, b.tz, dt, 10);
      case 'look':
        b.speed = 0;
        if (b.t > 1.6) b.mood = 'idle';
        return this.face(b, b.tx, b.tz, dt, 5);
      case 'laugh':
        b.speed = 0;
        if (b.t > 1.6) b.mood = 'idle';
        return this.face(b, b.tx, b.tz, dt, 5);
      case 'blame':
        b.speed = 0;
        if (b.t > 2.2) b.mood = 'idle';
        return this.face(b, b.tx, b.tz, dt, 8);
      case 'sniff':
        b.speed = 0;
        if (b.t > 0.9) {
          b.mood = 'peeyew';
          b.t = 0;
          this.say(b, 'Pee-yew!', 'shout', 'peeyew');
          const cloud = senses.cloudAt(b.x, b.z);
          this.events.push({ kind: 'smell', id: b.spec.id, x: b.x, z: b.z });
          if (cloud) {
            const player = senses.player;
            const seen = canSeePlayer(b, player, senses);
            const culprit = pickCulprit(b, cloud, this.people, player, senses, seen);
            if (culprit && culprit !== 'player' && culprit !== b.spec.id) this.blame(b, culprit);
            // Walk out of it, away from the cloud.
            const dx = b.x - cloud.x;
            const dz = b.z - cloud.z;
            const d = Math.hypot(dx, dz) || 1;
            b.tx = b.x + (dx / d) * 4;
            b.tz = b.z + (dz / d) * 4;
          } else {
            b.tx = b.x + Math.sin(b.yaw + Math.PI) * 3;
            b.tz = b.z + Math.cos(b.yaw + Math.PI) * 3;
          }
        }
        return;
      case 'peeyew':
        if (b.t > 0.8) {
          b.mood = 'flee';
          b.t = 0;
          b.awayT = b.spec.seated ? 20 : 6;
        }
        b.speed = 0;
        return;
      case 'flee': {
        // Out of the cloud, then home when it has cleared.
        const d = Math.hypot(b.tx - b.x, b.tz - b.z);
        if (d > 0.3) this.move(b, b.tx, b.tz, Math.max(2.2, b.spec.speed * 1.8), dt);
        else b.speed = 0;
        b.awayT -= dt;
        if (b.t > 0.2 && b.t < 0.2 + dt) this.events.push({ kind: 'fled', id: b.spec.id });
        if (b.awayT <= 0 && senses.stinkAt(home.x, home.z) < 0.1) {
          b.mood = 'walk';
          b.stinkT = 0;
        }
        return;
      }
      case 'sleep':
        b.speed = 0;
        if (b.t > 3) {
          b.t = 0;
          this.say(b, 'Zzz...', 'think', 'snore');
        }
        return;
      case 'chase':
        return this.move(b, senses.player.x, senses.player.z, 4.6, dt);
      case 'scold':
        b.speed = 0;
        this.face(b, senses.player.x, senses.player.z, dt, 6);
        if (b.t > 3) b.mood = 'walk';
        return;
      case 'away':
      case 'perform':
        b.speed = 0;
        return;
      default:
        break;
    }
    // Followers trot after their person and wander home when left behind.
    const f = b.spec.follow;
    if (f) {
      const lead = f.id === 'player' ? senses.player : this.get(f.id);
      const home0 = b.spec.route[0];
      if (lead && Math.hypot(lead.x - home0.x, lead.z - home0.z) < f.leash && (f.id !== 'player' || senses.player.y < 2)) {
        const d = Math.hypot(lead.x - b.x, lead.z - b.z);
        if (d > f.gap + 0.6) {
          b.mood = 'walk';
          this.move(b, lead.x, lead.z, Math.min(5.5, Math.max(b.spec.speed, d * 0.9)), dt);
          return;
        }
        b.mood = 'idle';
        b.speed = 0;
        this.face(b, lead.x, lead.z, dt, 4);
        return;
      }
    }
    // Routine: walk the route, wait at each point.
    const w = b.spec.route[b.wp];
    const d = Math.hypot(w.x - b.x, w.z - b.z);
    if (d > 0.15) {
      b.mood = 'walk';
      this.move(b, w.x, w.z, b.spec.speed, dt);
      return;
    }
    b.mood = b.spec.sleeper ? 'sleep' : 'idle';
    b.speed = 0;
    if (w.yaw !== undefined) this.turn(b, w.yaw, dt, 4);
    b.waitT -= dt;
    if (b.waitT <= 0 && b.spec.route.length > 1) {
      b.wp = (b.wp + 1) % b.spec.route.length;
      b.waitT = b.spec.route[b.wp].wait * (0.8 + this.rng() * 0.4);
    } else if (b.waitT <= 0) b.waitT = w.wait;
  }

  private move(b: Brain, x: number, z: number, speed: number, dt: number): void {
    const dx = x - b.x;
    const dz = z - b.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) {
      b.speed = 0;
      return;
    }
    const step = Math.min(d, speed * dt);
    b.x += (dx / d) * step;
    b.z += (dz / d) * step;
    b.speed = speed;
    this.turn(b, Math.atan2(dx, dz), dt, 8);
  }

  private face(b: Brain, x: number, z: number, dt: number, rate: number): void {
    if (Math.hypot(x - b.x, z - b.z) < 0.05) return;
    this.turn(b, Math.atan2(x - b.x, z - b.z), dt, rate);
  }

  private turn(b: Brain, yaw: number, dt: number, rate: number): void {
    let d = yaw - b.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    b.yaw += d * (1 - Math.exp(-rate * dt));
  }

  takeEvents(): BrainEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
