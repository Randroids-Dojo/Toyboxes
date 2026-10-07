// The living village: townsfolk rigs driven by their brains, Biscuit the pug,
// the band, pigeons and ducks. Turns brain moods into poses and faces, and
// brain events into speech bubbles and voices.

import * as THREE from 'three';
import { music } from '../../audio/music';
import { BAND, BAND_POS, VILLAGERS, picnickers } from './cast';
import type { Figures } from './figures';
import { BANDSTAND, FOUNTAIN, POND, villageBoxes, villageCircles } from './layout';
import { Bird, CAST, extra, Person, Pug, type PersonSpec } from './people';
import { Ducks, Flock } from './sim/flock';
import { Town, type BrainEvent, type Brain, type Heard, type Senses } from './sim/people';
import { rng } from './sim/rng';
import { fx, voices } from './toots';
import type { Words } from './words';

interface Blocker {
  kind: 'box' | 'circle';
  x: number;
  z: number;
  hw: number;
  hd: number;
  r: number;
  rot: number;
}

/** Tall things that block sight lines (buildings, the tower, kiosks). */
function blockers(): Blocker[] {
  const out: Blocker[] = [];
  for (const b of villageBoxes()) if (b.h > 1.9 && b.h < 30 && !b.id.includes('-wall-')) out.push({ kind: 'box', x: b.x, z: b.z, hw: b.hw, hd: b.hd, r: 0, rot: b.rot ?? 0 });
  for (const c of villageCircles()) if (c.h > 1.9 && c.r > 0.4) out.push({ kind: 'circle', x: c.x, z: c.z, hw: 0, hd: 0, r: c.r, rot: 0 });
  return out;
}

/** Does the segment from a to b pass through a blocker? */
export function segmentBlocked(list: Blocker[], ax: number, az: number, bx: number, bz: number): boolean {
  for (const o of list) {
    if (o.kind === 'circle') {
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.z - az) * dz) / l2));
      if (Math.hypot(ax + dx * t - o.x, az + dz * t - o.z) < o.r * 0.9) return true;
      continue;
    }
    // Slab test against an axis-aligned box (rotated boxes are rare and small).
    let t0 = 0;
    let t1 = 1;
    const d = [bx - ax, bz - az];
    const p = [ax - o.x, az - o.z];
    const h = [o.hw * 0.95, o.hd * 0.95];
    let hit = true;
    for (let k = 0; k < 2; k++) {
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
    if (hit) return true;
  }
  return false;
}

interface Actor {
  brain: Brain;
  rig: Person | Pug;
  spec: PersonSpec | null;
  y: number;
  walk: number;
  idle: number;
  startleT: number;
  /** Where the head is, for bubbles. */
  head: () => THREE.Vector3;
}

export class Village3 {
  readonly town: Town;
  readonly actors = new Map<string, Actor>();
  readonly flock: Flock;
  readonly flock2: Flock;
  readonly ducks: Ducks;
  readonly fountainDucks: Ducks;
  private birds: Bird[] = [];
  private birds2: Bird[] = [];
  private duckRigs: Bird[] = [];
  private fDuckRigs: Bird[] = [];
  private blocks = blockers();
  private statue: Person;
  readonly senses: Senses;
  onEvent: (e: BrainEvent) => void = () => {};
  /** Picnickers shown in free play (Picnic Panic adds its own). */
  picnicCount = 4;
  private t = 0;

  constructor(
    f: Figures,
    private words: Words,
    private stink: (x: number, z: number) => number,
    private cloudAt: (x: number, z: number) => { x: number; z: number } | null,
    tier: string,
  ) {
    const r = rng(42);
    const specs = [...VILLAGERS, ...BAND, ...picnickers(tier === 'low' ? 2 : 4)];
    this.town = new Town(specs, rng(7));
    for (const b of this.town.people) {
      const id = b.spec.id;
      let ps: PersonSpec | null = CAST[id] ?? null;
      if (id === 'biscuit') {
        const pug = new Pug(f, b.x, b.z, b.yaw);
        this.actors.set(id, { brain: b, rig: pug, spec: null, y: 0, walk: 0, idle: r() * 6, startleT: 0, head: () => new THREE.Vector3(pug.p.x, pug.top, pug.p.z) });
        continue;
      }
      if (!ps) ps = extra(id, r);
      const person = new Person(f, ps, b.x, b.z, b.yaw);
      const onStand = Math.hypot(b.x - BANDSTAND.x, b.z - BANDSTAND.z) < BANDSTAND.r;
      this.actors.set(id, { brain: b, rig: person, spec: ps, y: onStand ? BANDSTAND.floor : 0, walk: 0, idle: r() * 6, startleT: 0, head: () => new THREE.Vector3(person.p.x, person.top + 0.1, person.p.z) });
    }
    // Sir Reginald in stone on his plinth.
    const stone = 0xd9cdb6;
    this.statue = new Person(f, { ...CAST.mayor, id: 'statue', height: 2.1, coat: stone, legs: stone, shoes: stone, skin: stone, extras: ['walrus'], extraColor: { walrus: stone }, hat: 'tophat', held: null }, FOUNTAIN.x, FOUNTAIN.z, 0);
    this.statue.p.y = 2.4;
    this.statue.p.armR = { x: 1.2, z: 0.3 };
    this.statue.p.face = 'neutral';
    this.statue.update();
    // Birds: a flock at the fountain, a few on the green.
    this.flock = new Flock({ x: 3.5, z: -10.5 }, 12, 2.6, rng(3));
    this.flock2 = new Flock({ x: 3, z: 2.5 }, 5, 2, rng(4));
    for (const b of this.flock.birds) this.birds.push(new Bird(f, 'pigeon', b.x, b.z, b.yaw));
    for (const b of this.flock2.birds) this.birds2.push(new Bird(f, 'pigeon', b.x, b.z, b.yaw));
    this.ducks = new Ducks(POND.x, POND.z, POND.r, 4, rng(5));
    this.fountainDucks = new Ducks(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.r - 0.6, 2, rng(6));
    for (const _d of this.ducks.ducks) this.duckRigs.push(new Bird(f, 'duck', 0, 0, 0));
    for (const _d of this.fountainDucks.ducks) this.fDuckRigs.push(new Bird(f, 'duck', 0, 0, 0));
    const blocks = this.blocks;
    const player = { x: 0, y: 0, z: 0 };
    this.senses = {
      sees: (ax, az, bx, bz) => !segmentBlocked(blocks, ax, az, bx, bz),
      stinkAt: (x, z) => this.stink(x, z),
      cloudAt: (x, z) => this.cloudAt(x, z),
      player,
    };
    // Picnickers beyond the free-play count stay away.
    for (const b of this.town.people) if (b.spec.id.startsWith('picnic-') && Number(b.spec.id.slice(7)) >= this.picnicCount) b.mood = 'away';
  }

  setPlayer(x: number, y: number, z: number): void {
    this.senses.player.x = x;
    this.senses.player.y = y;
    this.senses.player.z = z;
  }

  hear(h: Heard): void {
    this.town.hear(h, this.senses);
  }

  /** Who is nearest a point (for mischief checks). */
  near(id: string, x: number, z: number, r: number): boolean {
    const a = this.actors.get(id);
    return !!a && a.brain.mood !== 'away' && Math.hypot(a.brain.x - x, a.brain.z - z) < r;
  }

  step(dt: number): void {
    this.t += dt;
    this.town.step(dt, this.senses);
    for (const e of this.town.takeEvents()) this.handle(e);
    this.flock.step(dt);
    this.flock2.step(dt);
    this.ducks.step(dt, this.t);
    this.fountainDucks.step(dt, this.t);
  }

  private handle(e: BrainEvent): void {
    if (e.kind === 'say') {
      const a = this.actors.get(e.say.id);
      if (a) {
        this.words.bubble(e.say.text, a.head, { tone: e.say.tone, life: e.say.text.length > 14 ? 2.4 : 1.8 });
        const pitch = a.brain.spec.voice;
        switch (e.say.sound) {
          case 'gasp':
            voices.gasp(pitch);
            break;
          case 'peeyew':
            voices.peeyew(pitch);
            break;
          case 'giggle':
            voices.giggle(pitch);
            break;
          case 'sniff':
            voices.sniff();
            break;
          case 'snore':
            voices.snore();
            break;
          case 'whistle':
            fx.whistle();
            voices.shout(pitch, e.say.text);
            break;
          default:
            if (e.say.tone === 'shout') voices.shout(pitch, e.say.text);
        }
      }
    }
    if (e.kind === 'startle') {
      const a = this.actors.get(e.id);
      if (a) a.startleT = 0;
    }
    this.onEvent(e);
  }

  /** Poses every rig from its brain. */
  update(dt: number, beat: number): void {
    for (const a of this.actors.values()) this.pose(a, dt, beat);
    this.flock.birds.forEach((b, i) => this.bird(this.birds[i], b));
    this.flock2.birds.forEach((b, i) => this.bird(this.birds2[i], b));
    this.ducks.ducks.forEach((d, i) => this.duck(this.duckRigs[i], d, 0.02));
    this.fountainDucks.ducks.forEach((d, i) => this.duck(this.fDuckRigs[i], d, 0.3));
  }

  private bird(rig: Bird, b: { x: number; y: number; z: number; yaw: number; phase: number; mode: string; peck: number }): void {
    const p = rig.p;
    p.x = b.x;
    p.y = b.y;
    p.z = b.z;
    p.yaw = b.yaw;
    p.walk = b.phase;
    p.stride = b.mode === 'walk' ? 1 : 0;
    p.flap = b.mode === 'fly' || (b.mode === 'land' && b.y > 0.1) ? b.phase : 0;
    p.peck = b.peck;
    rig.update();
  }

  private duck(rig: Bird, d: { x: number; z: number; yaw: number; peck: number }, y: number): void {
    rig.p.x = d.x;
    rig.p.z = d.z;
    rig.p.y = y;
    rig.p.yaw = d.yaw;
    rig.p.walk = this.t * 4;
    rig.p.peck = d.peck;
    rig.update();
  }

  private pose(a: Actor, dt: number, beat: number): void {
    const b = a.brain;
    a.idle += dt;
    a.startleT += dt;
    if (a.rig instanceof Pug) {
      const p = a.rig.p;
      p.visible = b.mood !== 'away';
      p.x = b.x;
      p.z = b.z;
      p.yaw = b.yaw;
      p.stride = Math.min(1, b.speed / 1.5);
      p.walk += dt * (6 + b.speed * 8);
      p.peck = b.mood === 'sleep' ? 1 : 0;
      p.sad = b.mood === 'blame' || (b.said === 'Biscuit!' && a.idle < 3) ? 1 : 0;
      a.rig.update();
      return;
    }
    const rig = a.rig as Person;
    const p = rig.p;
    p.visible = b.mood !== 'away';
    p.x = b.x;
    p.z = b.z;
    p.y = a.y;
    p.yaw = b.yaw;
    p.holding = true;
    p.headYaw = 0;
    p.headPitch = 0;
    p.headRoll = 0;
    p.lean = 0;
    p.bob = 0;
    p.squash = 0;
    p.armL = { x: 0, z: 0.12 };
    p.armR = { x: 0, z: 0.12 };
    p.sit = b.spec.seated && (b.mood === 'idle' || b.mood === 'sleep' || b.mood === 'look' || b.mood === 'sniff' || b.mood === 'laugh') ? 1 : 0;
    p.floorSit = b.spec.id.startsWith('picnic-');
    p.face = 'neutral';
    const breathe = Math.sin(a.idle * 1.7) * 0.012;
    p.bob = breathe;
    if (b.spec.cup) {
      p.holding = b.hasCup;
      if (b.hasCup) p.armR = { x: 1.1, z: 0.25 };
    }
    // Walking.
    const moving = b.speed > 0.1;
    if (moving) {
      a.walk += dt * (3 + b.speed * 2.6);
      p.walk = a.walk;
      p.stride = Math.min(1.2, b.speed / 1.4);
      p.bob = Math.abs(Math.cos(a.walk)) * 0.05 * p.stride;
      p.lean = Math.min(0.25, b.speed * 0.03);
    } else p.stride = 0;
    // Idle glances.
    p.headYaw = Math.sin(a.idle * 0.37 + b.x) * 0.25;
    switch (b.mood) {
      case 'look':
        p.face = 'suspicious';
        p.headYaw = 0;
        p.headRoll = 0.15;
        break;
      case 'startled': {
        const t = a.startleT;
        if (t < 0.3) {
          p.face = 'neutral';
        } else {
          const k = Math.min(1, (t - 0.3) / 0.15);
          p.face = 'gasp';
          p.armL = { x: 0.4, z: 1.2 * k };
          p.armR = { x: 0.4, z: 1.2 * k };
          p.bob = Math.max(0, Math.sin(Math.min(1, (t - 0.3) / 0.35) * Math.PI)) * 0.28;
          p.squash = t < 0.4 ? 0 : -0.12 * Math.max(0, 1 - (t - 0.4) * 3);
          p.headPitch = -0.15;
          if (t > 1.0) p.face = b.spec.sleeper ? 'sleepy' : 'angry';
          p.sit = 0;
        }
        break;
      }
      case 'blame':
        p.face = 'angry';
        p.armR = { x: 1.55, z: 0.1 };
        p.lean = -0.08;
        break;
      case 'laugh':
        p.face = 'laugh';
        p.bob = Math.abs(Math.sin(a.idle * 14)) * 0.05;
        p.armL = { x: 0.7, z: 0.4 };
        p.armR = { x: 0.7, z: 0.4 };
        p.headPitch = -0.2;
        break;
      case 'sniff':
        p.face = 'suspicious';
        p.headPitch = -0.25 + Math.sin(a.idle * 18) * 0.05;
        break;
      case 'peeyew':
      case 'flee':
        p.face = 'peeyew';
        p.armR = { x: 1.9, z: 0.2 + Math.sin(a.idle * 16) * 0.35 };
        p.armL = { x: 0.3, z: 0.9 };
        p.headRoll = Math.sin(a.idle * 9) * 0.1;
        if (b.mood === 'flee') p.lean = 0.2;
        break;
      case 'sleep':
        p.face = 'sleepy';
        p.headRoll = 0.35;
        p.headPitch = 0.3;
        p.headYaw = 0;
        p.bob = Math.sin(a.idle * 1.2) * 0.02;
        break;
      case 'chase':
        p.face = 'angry';
        p.lean = 0.3;
        p.stride = 1.3;
        p.armR = { x: 2.6, z: 0.1 };
        break;
      case 'scold':
        p.face = 'angry';
        p.armR = { x: 2.7, z: 0.1 + Math.sin(a.idle * 12) * 0.25 };
        break;
      default:
        if (b.spec.id === 'gran') {
          p.face = 'happy';
          // A wave now and then.
          const w = a.idle % 7;
          if (w < 1.4) p.armR = { x: 0.3, z: 2.6 + Math.sin(w * 12) * 0.3 };
        }
        if (b.spec.id === 'pip') p.face = 'happy';
        if (b.spec.id === 'mayor' && !moving) {
          p.armL = { x: -0.2, z: 0.35 };
          p.armR = { x: -0.2, z: 0.35 };
          p.headPitch = -0.12;
        }
    }
    // The band plays on the beat.
    if (b.spec.deaf && b.mood !== 'away') {
      const bt = beat >= 0 ? beat : a.idle * 1.6;
      const ph = (bt % 1) * Math.PI * 2;
      if (b.spec.id === 'maestro') {
        p.armR = { x: 1.3 + Math.sin(ph) * 0.5, z: 0.6 + Math.cos(ph) * 0.3 };
        p.armL = { x: 0.9, z: 0.6 + Math.sin(ph * 0.5) * 0.2 };
        p.face = 'happy';
        p.headYaw = Math.sin(ph * 0.5) * 0.2;
      } else {
        p.bob = Math.abs(Math.sin(ph)) * 0.03;
        p.armR = { x: 1.0, z: 0.4 };
        p.armL = { x: 1.0, z: 0.4 };
        p.face = 'happy';
        p.headPitch = b.spec.id === 'trumpet' || b.spec.id === 'clarinet' ? -0.15 : 0;
        p.lean = Math.sin(ph * 0.5) * 0.04;
      }
    }
    rig.update();
  }

  /** Where someone's head is now (bubbles, cameras). */
  head(id: string): THREE.Vector3 | null {
    const a = this.actors.get(id);
    return a ? a.head() : null;
  }

  person(id: string): Person | null {
    const a = this.actors.get(id);
    return a && a.rig instanceof Person ? a.rig : null;
  }

  /** The band's tuba player position, for the band trial. */
  get bandCentre(): { x: number; z: number } {
    return { x: BAND_POS.maestro.x, z: BAND_POS.maestro.z };
  }

  /** Is the band playing music now? (They mime to the music clock.) */
  get beat(): number {
    return music.beat();
  }
}
