// Black hole bloom: room 12's black hole galaxy. A hungry black hole sits at
// the heart of a small galaxy. Kick it glowing orbs, win stars on the floating
// worlds around it (Ringworld's ring run, Cinder's rock rain, the comet surf),
// and every star you feed makes it bigger, lights a constellation and opens a
// new place. At twelve stars a stair of debris spirals up to its edge: step
// in, ride the warp, and watch it bloom into a new spiral galaxy.
//
// Modules: shaders (look), sky, blackhole, islands and props (places),
// orbs, traverse (slings, blossoms, lanes, the star net), spark (the guide),
// modes/* (one per challenge), save (this device), audio (songs and effects).
// The rules shared with the server live in src/shared/galaxy-rules.ts.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SavePass } from 'three/examples/jsm/postprocessing/SavePass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import './galaxy.css';
import { sfx, sfxSpace } from '../../audio/sfx';
import { api, type BoardRow } from '../../net/api';
import { button, h, type Panel } from '../../ui/ui';
import { disposeTree } from '../../world/kit';
import type { Collider } from '../../world/physics';
import type { CameraShot, Carry, MoveInput, PlayerState, SpaceAction, SpaceView, Spot, Tier } from '../../world/space';
import { boardTexture, formatLap, type ExperienceCtx } from '../common';
import { Hud, Particles, Shockwaves, music, type Song } from '../kit';
import {
  BH,
  CINDER,
  DOCK,
  GAP_LAND,
  HUB,
  HUB_R,
  LANE_SPEED,
  RING,
  RING_BLOSSOMS,
  RING_GAPS,
  RING_LANES,
  RING_RETURN_S,
  RING_START_S,
  RING_THETA0,
  STAIR,
  STAR_GOAL,
  TEASER_AT,
  UNLOCK,
  hopArc,
  netTriggered,
  ringCoords,
  ringPoint,
  slingArc,
  type Challenge,
  type Island,
  type Spot3,
} from '../../shared/galaxy-rules';
import { gsfx, HUB_SONG } from './audio';
import { BlackHole } from './blackhole';
import { Cinder, Dock, Hub, ISLAND_COLOR, ISLAND_NAME, RING_BACK_R, Ringworld, Stair, padNear } from './islands';
import { Comet } from './modes/comet';
import { Finale } from './modes/finale';
import { Frenzy, Wake } from './modes/frenzy';
import { RingRun } from './modes/ring';
import type { Round } from './modes/round';
import { Storm } from './modes/storm';
import { Orbs, type Orb } from './orbs';
import { Blossoms, glowSprite } from './props';
import { Save, moonCount } from './save';
import * as S from './shaders';
import { Sky } from './sky';
import { Spark } from './spark';
import { Traverse, type Ride } from './traverse';

export type Zone = 'hub' | 'ring' | 'storm' | 'comet' | 'stair' | 'void';

const TIERS: Record<Tier, { bloom: number; lens: boolean; aberration: number }> = {
  low: { bloom: 0, lens: false, aberration: 0 },
  medium: { bloom: 0.5, lens: false, aberration: 0.0015 },
  high: { bloom: 0.62, lens: true, aberration: 0.003 },
};

const ISLANDS: Island[] = ['ring', 'storm', 'comet'];

interface FlyingStar {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  t: number;
  delay: number;
  challenge: Challenge | 'moons';
}

interface Cine {
  t: number;
  dur: number;
  shot: (u: number, t: number) => CameraShot;
  skip?: () => void;
  onEnd?: () => void;
  letterbox?: boolean;
}

export class Galaxy implements SpaceView {
  readonly indoor = false;
  readonly scene = new THREE.Scene();
  readonly colliders: Collider[] = [];
  readonly door: Spot = { x: HUB.exit.x, z: HUB.exit.z };
  readonly lectern = null;
  readonly chest = null;
  readonly areaDoors = [];
  readonly exhibitSpots = [];
  readonly sun: THREE.DirectionalLight;
  readonly arrival = HUB.arrival;

  readonly uniforms = { uTime: { value: 0 }, uFlare: { value: 0 } };
  readonly save: Save;
  readonly hud: Hud;
  readonly sparks: Particles;
  readonly glows: Particles;
  readonly dust: Particles;
  readonly shock: Shockwaves;
  readonly hole: BlackHole;
  readonly sky: Sky;
  readonly blossoms: Blossoms;
  readonly hub: Hub;
  readonly ring: Ringworld;
  readonly cinder: Cinder;
  readonly dock: Dock;
  readonly stair: Stair;
  readonly orbs: Orbs;
  readonly trav = new Traverse();
  readonly spark: Spark;
  readonly playerPos = new THREE.Vector3();
  player: PlayerState = { x: 0, z: 6, y: 0, vy: 0, grounded: true, yaw: Math.PI, vx: 0, vz: 0, riding: null };
  round: Round | null = null;
  zone: Zone = 'hub';
  /** Stars the black hole has visibly swallowed (catches up with the save). */
  shownFed = 0;
  time = 0;
  tier: Tier | null = null;
  boards: Record<'frenzy' | 'ring' | 'storm' | 'comet', BoardRow[]> = { frenzy: [], ring: [], storm: [], comet: [] };
  bests: Record<'frenzy' | 'ring' | 'storm' | 'comet', number | null> = { frenzy: null, ring: null, storm: null, comet: null };
  disposed = false;

  private lastT = 0;
  private arrivalT = 0;
  private flare = 0;
  private env: THREE.Texture | null = null;
  private composer: EffectComposer | null = null;
  private lens: ShaderPass | null = null;
  private final: ShaderPass | null = null;
  private composerKey = '';
  private pre: SavePass | null = null;
  private cine: Cine | null = null;
  private stars: FlyingStar[] = [];
  private lastTop = 0;
  private lastStone = -1;
  private lastGround = new THREE.Vector3();
  private bubble: THREE.Mesh;
  private bubbleMat: THREE.ShaderMaterial;
  private charge: { island: Island | 'hub'; t: number } | null = null;
  private wakeStar: { mesh: THREE.Mesh; pos: THREE.Vector3; t: number; landed: boolean } | null = null;
  private cometArrival = -1;
  private freeOrbsFor = 0;
  /** Extra screen fade for the finale, 0 to 1, and its colour. */
  fade = { amount: 0, color: new THREE.Color('#000000'), tunnel: 0, spin: 1 };
  private debugLog: string[] = [];
  private fadeEl: HTMLElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private drawInfo = { calls: 0, triangles: 0 };
  private warpEl: HTMLElement;

  constructor(readonly ctx: ExperienceCtx) {
    const s = this.scene;
    s.background = new THREE.Color('#05030c');
    this.save = new Save(ctx.roomId, ctx.area.id);
    this.hud = new Hud(ctx, { accent: '#f4b740', accent2: '#8a6bd1', panel: 'dark', glow: true });
    this.hud.root.classList.add('gx');
    this.sky = new Sky(s, this.uniforms);
    this.hole = new BlackHole(s, this.uniforms);
    this.blossoms = new Blossoms(s, 32);
    this.hub = new Hub(s, this.uniforms, this.playerPos, ctx.ownerName, this.blossoms);
    this.ring = new Ringworld(s, this.uniforms, this.blossoms);
    this.cinder = new Cinder(s, this.uniforms);
    this.dock = new Dock(s, this.uniforms);
    this.stair = new Stair(s, this.uniforms, this.blossoms);
    this.colliders.push(...this.hub.colliders, ...this.ring.colliders, ...this.cinder.colliders, ...this.dock.colliders);
    this.orbs = new Orbs(s, this.uniforms);
    this.orbs.onSwallow = (o) => this.swallowed(o);
    this.orbs.onLaunch = () => sfx.kick(false);
    this.sparks = new Particles(s, { max: 2500, look: 'spark' });
    this.glows = new Particles(s, { max: 1500, look: 'glow' });
    this.dust = new Particles(s, { max: 600, look: 'smoke' });
    this.shock = new Shockwaves(s);
    this.spark = new Spark(s, this.hud.root);
    this.warpEl = h('div', { class: 'gx-warp' }, h('i'), h('i'));
    this.fadeEl = h('div', { class: 'gx-fade' });
    this.hud.root.append(this.warpEl, this.fadeEl);
    this.bubbleMat = new THREE.ShaderMaterial({ vertexShader: S.PLANET_VERT, fragmentShader: S.BUBBLE_FRAG, uniforms: { ...this.uniforms, uAlpha: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.1, 32, 20), this.bubbleMat);
    this.bubble.visible = false;
    this.bubble.renderOrder = 8;
    s.add(this.bubble);

    // Light: the disk glows from afar; a cool lilac key from above casts shadows.
    s.add(new THREE.HemisphereLight('#7a5cff', '#0b0618', 0.95));
    this.sun = new THREE.DirectionalLight('#cbb6ff', 1.25);
    this.sun.position.set(-12, 24, 12);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -15;
    sc.right = sc.top = 15;
    sc.near = 1;
    sc.far = 70;
    this.sun.shadow.bias = -0.0008;
    s.add(this.sun, this.sun.target);

    // Where the journey stands.
    const total = this.save.total;
    this.shownFed = total;
    this.hole.setFed(this.holeFed(total), true);
    this.applyConstellations(true);
    this.stair.setCount(this.stairCount(total), true);
    this.sky.setPour(total >= STAR_GOAL ? 1 : 0);
    this.sky.setBloom(this.save.data.bloomed ? 1 : 0);
    this.dock.comet.visible = total >= UNLOCK.comet;
    this.blossoms.show(this.hub.horizonBlossom, total >= STAR_GOAL);

    this.spark.place(new THREE.Vector3(HUB.exit.x, 2, HUB.exit.z));
    sfxSpace.portal();
    this.arrive();
    void this.loadBoards();
  }

  // -------------------------------------------------------------------------
  // Arrival and the journey

  private arrive(): void {
    const d = this.save.data;
    const begin = () => {
      if (this.disposed) return;
      this.hubMusic();
      if (!d.stars.wake) this.startRound(new Wake(this));
      else this.freeOrbs(true);
    };
    if (!d.flyover) {
      this.flyover(() => {
        this.save.update((x) => (x.flyover = true));
        void this.hud
          .intro({
            key: 'galaxy-bloom',
            title: 'Black hole bloom',
            tagline: 'Feed the black hole. Watch the galaxy grow.',
            tips: [
              { keys: ['move'], text: 'Walk around the crystal hub' },
              { keys: ['interact', 'kick'], touch: 'Action', text: 'Kick glowing orbs off the edge' },
              { keys: ['interact'], touch: 'Action', text: 'Fly on gold star pads to new worlds' },
            ],
          })
          .then(begin);
      });
    } else {
      this.hud.title('Black hole bloom', `${this.save.total} of ${STAR_GOAL} stars fed`);
      begin();
    }
  }

  /** The first-visit flyover: from the black hole, past the ringed planet, down behind you. */
  private flyover(done: () => void): void {
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(58, 22, -18), new THREE.Vector3(24, 24, -24), new THREE.Vector3(-14, 18, -18), new THREE.Vector3(-14, 9, 14), new THREE.Vector3(0, 3.6, 12.5)]);
    const look = new THREE.CatmullRomCurve3([new THREE.Vector3(BH.x, BH.y, BH.z), new THREE.Vector3(RING.cx, 6, RING.cz), new THREE.Vector3(-6, 2, -10), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1.6, 3)]);
    this.hud.letterbox(true);
    this.cine = {
      t: 0,
      dur: 7,
      letterbox: true,
      shot: (u) => {
        const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        return { position: path.getPoint(e), target: look.getPoint(e), fov: 58, lockPlayer: true, skip: () => this.endCine(), skipLabel: 'Skip', blend: u > 0.92 ? 1 - (u - 0.92) / 0.08 : 1 };
      },
      onEnd: done,
    };
  }

  private endCine(): void {
    const c = this.cine;
    if (!c) return;
    this.cine = null;
    if (c.letterbox) this.hud.letterbox(false);
    c.onEnd?.();
  }

  /** Free play on the hub: a few orbs to kick at any time. */
  freeOrbs(now = false): void {
    if (now) {
      this.orbs.clear();
      const spots = [
        [0, -6],
        [-4, -8],
        [4.5, -7],
        [2, -3],
        [-3, -4],
      ];
      for (const [x, z] of spots) this.orbs.spawn(x, z, 'plain', true);
    }
    this.freeOrbsFor = 0;
  }

  /** After a bloom a small new black hole grows again from nothing. */
  holeFed(n: number): number {
    return this.save.data.reborn ? Math.max(0, n - STAR_GOAL) : n;
  }

  /** The bloom's aftermath: a small, hungry black hole and every constellation lit. */
  rebirth(): void {
    this.hole.setFed(this.holeFed(this.shownFed), true);
    this.hole.burp(2);
    this.applyConstellations(true);
    this.flare = 2;
  }

  stairCount(total: number): number {
    return total >= STAR_GOAL ? STAIR.length : total >= TEASER_AT ? 3 : 0;
  }

  // -------------------------------------------------------------------------
  // Rounds

  startRound(r: Round): void {
    this.round?.dispose();
    this.round = r;
  }

  endRound(): void {
    const r = this.round;
    this.round = null;
    r?.dispose();
    this.hud.strip([]);
    this.hud.objective(null);
    this.ctx.pose(null);
    this.hubMusic();
    if (this.zone === 'hub' && this.save.data.stars.wake) this.freeOrbs(this.orbs.onHub === 0);
  }

  playSong(song: Song): void {
    music.play(song, { fadeIn: 0.6 });
  }

  /** The hub lullaby, with a layer for each island you have finished. */
  hubMusic(): void {
    music.play(HUB_SONG, { fadeIn: 1.4 });
    const st = this.save.data.stars;
    music.layer('ring', st.ring > 0);
    music.layer('storm', st.storm > 0);
    music.layer('comet', st.comet > 0);
    music.layer('bloom', this.save.data.bloomed > 0);
  }

  /** Saves stars for a challenge; returns how many are new. They then fly into the black hole. */
  award(ch: Challenge, stars: number): number {
    const before = this.save.data.stars[ch];
    if (stars <= before) return 0;
    this.save.update((d) => (d.stars[ch] = stars));
    return stars - before;
  }

  /** Stars fly from a point into the black hole, one by one, and it grows. */
  feedStars(n: number, from: THREE.Vector3, challenge: Challenge | 'moons', glance = true): Promise<void> {
    if (n <= 0) return Promise.resolve();
    for (let i = 0; i < n; i++) {
      const mesh = glowSprite('#f4b740', 2.4, 1.4);
      mesh.position.copy(from);
      this.scene.add(mesh);
      this.stars.push({ mesh, from: from.clone(), t: 0, delay: i * 0.45, challenge });
    }
    gsfx.fanfare();
    this.hud.banner(n === 1 ? 'Star!' : `${n} stars!`, { color: '#f4b740', size: 'l' });
    return new Promise((resolve) => {
      if (glance) this.glance(1.6 + n * 0.45, resolve);
      else {
        const wait = () => (this.stars.length ? setTimeout(wait, 100) : resolve());
        wait();
      }
    });
  }

  /** The camera glances from behind you to the black hole while stars fly in. */
  private glance(dur: number, done: () => void): void {
    const from = new THREE.Vector3(this.player.x, this.player.y, this.player.z);
    const toHole = new THREE.Vector3(BH.x - from.x, 0, BH.z - from.z).normalize();
    const pos = from.clone().addScaledVector(toHole, -5.5).add(new THREE.Vector3(0, 3.2, 0));
    const target = from.clone().lerp(this.hole.centre, 0.55);
    this.cine = {
      t: 0,
      dur,
      shot: (u) => ({ position: pos, target, fov: 50, lockPlayer: true, blend: Math.min(1, u * 6, (1 - u) * 5), skip: () => this.skipStars(), skipLabel: 'Skip' }),
      onEnd: () => {
        this.skipStars();
        done();
      },
    };
  }

  private skipStars(): void {
    for (const s of [...this.stars]) this.starArrives(s);
    this.stars = [];
    if (this.cine) {
      const c = this.cine;
      this.cine = null;
      c.onEnd?.();
    }
  }

  private starArrives(s: FlyingStar): void {
    this.scene.remove(s.mesh);
    s.mesh.geometry.dispose();
    (s.mesh.material as THREE.Material).dispose();
    this.stars = this.stars.filter((x) => x !== s);
    const before = this.shownFed;
    this.shownFed = Math.min(this.save.total, this.shownFed + 1);
    this.hole.setFed(this.holeFed(this.shownFed));
    this.flare = Math.min(2, this.flare + 1.2);
    this.hole.burp(1);
    gsfx.harp();
    gsfx.rumble();
    this.ctx.shake(0.3);
    this.applyConstellations(false);
    this.unlocks(before, this.shownFed);
  }

  /** What opens as the black hole grows. */
  private unlocks(before: number, after: number): void {
    for (const k of ISLANDS) {
      if (before < UNLOCK[k] && after >= UNLOCK[k]) {
        this.hud.banner(`${ISLAND_NAME[k]} is open`, { color: ISLAND_COLOR[k], size: 'm', ms: 2200 });
        this.ctx.ui.toast(`Fly from the ${k === 'ring' ? 'green' : k === 'storm' ? 'orange' : 'ice blue'} star pad on the hub`, 'good', 3600);
        if (k === 'comet') this.cometArrival = 0;
      }
    }
    if (before < TEASER_AT && after >= TEASER_AT) {
      this.stair.setCount(this.stairCount(after), false);
      this.ctx.ui.toast('Something is gathering by the black hole', 'info', 3600);
    }
    if (before < STAR_GOAL && after >= STAR_GOAL) {
      this.stair.setCount(STAIR.length, false);
      this.sky.setPour(1);
      this.blossoms.show(this.hub.horizonBlossom, true);
      this.hud.banner('The Horizon is open', { sub: 'Climb to the black hole', color: '#f4b740', size: 'l', ms: 2600 });
    }
  }

  private applyConstellations(instant: boolean): void {
    const st = this.save.data.stars;
    const fed = this.shownFed;
    // Light stars in the order they were earned, as far as the black hole has swallowed.
    let budget = fed;
    const order: (Challenge | 'moons')[] = ['wake', 'frenzy', 'ring', 'storm', 'comet', 'moons'];
    for (const id of order) {
      const have = id === 'moons' ? (moonCount(this.save.data.moons) >= 8 ? 2 : moonCount(this.save.data.moons) >= 4 ? 1 : 0) : st[id];
      const lit = Math.min(have, budget);
      budget -= lit;
      this.sky.setLit(id, lit, instant);
    }
  }

  // -------------------------------------------------------------------------
  // Travel

  /** Where each island's sling lands you and where its start pad is. */
  islandSpot(k: Island | 'hub', from?: Island): { x: number; y: number; z: number; yaw: number } {
    if (k === 'hub') {
      const pad = from ? HUB.slings[from] : HUB.slings.ring;
      const r = Math.hypot(pad.x, pad.z);
      const x = (pad.x / r) * (r - 2.6);
      const z = (pad.z / r) * (r - 2.6);
      return { x, y: 0, z, yaw: Math.atan2(-x, -z) };
    }
    if (k === 'ring') {
      const p = ringPoint(RING_START_S, RING.mid);
      const th = RING_THETA0 - (RING_START_S * Math.PI) / 180;
      return { x: p.x, y: RING.top, z: p.z, yaw: Math.atan2(Math.sin(th), -Math.cos(th)) };
    }
    if (k === 'storm') return { x: this.cinder.startSpot.x, y: CINDER.top, z: this.cinder.startSpot.z, yaw: Math.PI / 2 };
    return { x: DOCK.x - 1.5, y: DOCK.top, z: DOCK.z - 1, yaw: Math.PI / 2 };
  }

  /** A star sling flight: a short spin-up on the pad, then the arc. */
  fly(to: Island | 'hub', from: Island | 'hub'): void {
    if (this.trav.busy) return;
    const dest = this.islandSpot(to, from === 'hub' ? undefined : from);
    const start = { x: this.player.x, y: this.player.y, z: this.player.z };
    const color = to === 'hub' ? 0xb9a4ff : new THREE.Color(ISLAND_COLOR[to]).getHex();
    const arc = slingArc(start, dest, this.ctx.reduceMotion());
    this.charge = { island: to, t: 0 };
    gsfx.slingSpin();
    const spin: Ride = {
      kind: 'sling',
      type: 'hold',
      t: 0,
      dur: 0.6,
      pose: 'crouch',
      yaw: Math.atan2(dest.x - start.x, dest.z - start.z),
      at: (u) => ({ x: start.x, y: start.y + u * 0.25, z: start.z }),
    };
    const flight: Ride = {
      kind: 'sling',
      type: 'arc',
      t: 0,
      arc,
      eased: true,
      pose: 'fly',
      onStart: () => {
        this.charge = null;
        gsfx.whoosh();
        this.shock.emit({ x: start.x, y: start.y + 0.06, z: start.z }, { color, radius: 3.5, life: 0.6 });
        this.sparks.burst({ at: { x: start.x, y: start.y + 0.3, z: start.z }, count: 50, shape: 'ring', speed: [4, 9], color: [color, 0xffffff], size: [0.15, 0.3], life: [0.4, 0.8] });
        this.ctx.squash(-0.3);
      },
      onEnd: () => {
        gsfx.plink();
        this.ctx.squash(0.35);
        this.shock.emit({ x: dest.x, y: dest.y + 0.06, z: dest.z }, { color, radius: 3, life: 0.5 });
        this.dust.burst({ at: { x: dest.x, y: dest.y + 0.1, z: dest.z }, count: 24, shape: 'ring', speed: [2, 4], color: 0xb9a4ff, size: [0.4, 0.8], life: [0.4, 0.8], alpha: 0.5, drag: 2 });
        this.lastTop = dest.y;
        this.hud.banner(to === 'hub' ? 'The Rim' : ISLAND_NAME[to], { size: 'm', color: to === 'hub' ? '#b9a4ff' : ISLAND_COLOR[to], ms: 1300 });
        this.ctx.snapCamera(dest.yaw);
      },
    };
    this.trav.start(spin, flight);
  }

  /** The star net: a bubble catches you and floats you back. */
  net(to: { x: number; y: number; z: number; yaw: number }): void {
    const at = { x: this.player.x, y: this.player.y, z: this.player.z };
    gsfx.bloop();
    this.round?.fell?.();
    const hold: Ride = {
      kind: 'net',
      type: 'hold',
      t: 0,
      dur: 0.45,
      pose: 'float',
      yaw: this.player.yaw,
      at: (u) => ({ x: at.x, y: at.y + u * 0.8, z: at.z }),
      onStart: () => {
        this.bubble.visible = true;
        this.ctx.squash(0.3);
      },
    };
    const arc: Ride = {
      kind: 'net',
      type: 'arc',
      t: 0,
      arc: { from: { x: at.x, y: at.y + 0.8, z: at.z }, to, apex: 3, duration: 1.3 },
      eased: true,
      pose: 'float',
      onEnd: () => {
        this.bubble.visible = false;
        gsfx.pop();
        this.sparks.burst({ at: { x: to.x, y: to.y + 1, z: to.z }, count: 30, speed: [2, 5], color: [0xbfe8ff, 0xff9ad5], size: [0.1, 0.22], life: [0.3, 0.6] });
        this.lastTop = to.y;
        this.ctx.snapCamera(to.yaw);
      },
    };
    this.trav.start(hold, arc);
  }

  /** Where the star net takes you in this zone. */
  private checkpoint(): { x: number; y: number; z: number; yaw: number } {
    const fromRound = this.round?.checkpoint?.();
    if (fromRound) return fromRound;
    if (this.zone === 'ring') {
      const p = ringPoint(RING_START_S + 4, RING.mid);
      return { ...this.islandSpot('ring'), x: p.x, z: p.z };
    }
    if (this.zone === 'storm') return this.islandSpot('storm');
    if (this.zone === 'comet') return this.islandSpot('comet');
    if (this.zone === 'stair' && this.lastStone >= 0) {
      const s = STAIR[this.lastStone];
      const n = STAIR[Math.min(STAIR.length - 1, this.lastStone + 1)];
      return { x: s.x, y: s.y, z: s.z, yaw: Math.atan2(n.x - s.x, n.z - s.z) };
    }
    return { x: HUB.arrival.x, y: 0, z: HUB.arrival.z, yaw: HUB.arrival.yaw };
  }

  private zoneAt(x: number, z: number, y: number): Zone {
    if (Math.hypot(x, z) < HUB_R + 2 && y < 3) return 'hub';
    const rr = Math.hypot(x - RING.cx, z - RING.cz);
    if (rr > RING.planetR && rr < RING.outer + 3) return 'ring';
    if (Math.hypot(x - CINDER.x, z - CINDER.z) < CINDER.r + 3) return 'storm';
    if (Math.hypot(x - DOCK.x, z - DOCK.z) < DOCK.r + 4) return 'comet';
    if (STAIR.some((s) => Math.hypot(x - s.x, z - s.z) < s.r + 3)) return 'stair';
    return 'void';
  }

  // -------------------------------------------------------------------------
  // Orbs

  private swallowed(o: Orb): void {
    this.flare = Math.min(2, this.flare + (o.kind === 'moon' ? 1.2 : 0.7));
    this.hole.heat = Math.min(1, this.hole.heat + 0.08);
    this.sparks.burst({ at: this.hole.centre.clone().addScaledVector(new THREE.Vector3().subVectors(o.pos, this.hole.centre).normalize(), this.hole.radius * 1.05), count: 26, speed: [3, 9], color: [o.color.getHex(), 0xffffff], size: [0.3, 0.7], life: [0.4, 0.8] });
    if (o.kind === 'gold') this.save.update((d) => (d.goldFed += 1));
    const handled = this.round && 'swallowed' in this.round ? (this.round as unknown as { swallowed: (o: Orb) => boolean }).swallowed(o) : false;
    if (!handled) gsfx.gulp(null);
  }

  // -------------------------------------------------------------------------
  // SpaceView hooks

  kickAction(p: PlayerState): { label: string; run: () => void } | null {
    if (p.riding || this.trav.busy || this.cine) return null;
    if (this.round?.kick) return this.round.kick(p);
    if (this.round && this.round.id !== 'wake' && this.round.id !== 'frenzy') return null;
    const o = this.orbs.nearestKickable(p);
    if (!o) return null;
    return { label: 'Kick the orb', run: () => this.kickOrb(o, p) };
  }

  kickOrb(o: Orb, p: PlayerState): void {
    // Aim a little toward the black hole when you kick roughly that way.
    let yaw = p.yaw;
    const toHole = Math.atan2(BH.x - o.pos.x, BH.z - o.pos.z);
    const diff = Math.atan2(Math.sin(toHole - yaw), Math.cos(toHole - yaw));
    if (Math.abs(diff) < 0.7) yaw += diff * 0.35;
    const r = this.orbs.kick(o, yaw);
    this.ctx.swing();
    if (r === 'shove') {
      gsfx.shove();
      this.ctx.squash(0.15);
    } else {
      gsfx.kick();
      this.ctx.squash(0.2);
      this.sparks.burst({ at: { x: o.pos.x, y: o.pos.y, z: o.pos.z }, count: 22, shape: 'cone', dir: { x: Math.sin(yaw), y: 0.4, z: Math.cos(yaw) }, spread: 0.6, speed: [3, 8], color: [o.color.getHex(), 0xffffff], size: [0.12, 0.26], life: [0.25, 0.5] });
    }
  }

  actions(p: PlayerState): SpaceAction[] {
    if (p.riding || this.trav.busy || this.cine || this.stars.length) return [];
    const out: SpaceAction[] = [];
    if (this.round) {
      out.push(...(this.round.actions?.(p) ?? []));
      if (this.round.id === 'wake' || this.round.id === 'frenzy') out.push(...this.kickActions(p));
      return out;
    }
    const fed = this.shownFed;
    const near = (top: number) => Math.abs(p.y - top) < 1.3;
    if (this.zone === 'hub' && near(0)) {
      for (const k of ISLANDS) {
        const pad = HUB.slings[k];
        const open = fed >= UNLOCK[k];
        out.push({
          x: pad.x,
          z: pad.z,
          range: 1.5,
          label: open ? `Fly to ${ISLAND_NAME[k]}` : `${ISLAND_NAME[k]} opens at ${UNLOCK[k]} stars`,
          short: open ? 'Fly' : 'Locked',
          run: () => {
            if (open) this.fly(k, 'hub');
            else {
              gsfx.locked();
              this.ctx.ui.toast(`Feed the black hole ${UNLOCK[k] - fed} more ${UNLOCK[k] - fed === 1 ? 'star' : 'stars'} to open ${ISLAND_NAME[k]}`, 'info', 3000);
            }
          },
        });
      }
      const woke = this.save.data.stars.wake > 0;
      out.push({
        x: HUB.shrine.x,
        z: HUB.shrine.z,
        range: 1.9,
        label: woke ? 'Start a feeding frenzy' : 'Feed it five orbs first',
        short: woke ? 'Frenzy' : 'Locked',
        run: () => (woke ? this.startRound(new Frenzy(this)) : gsfx.locked()),
      });
      out.push({ x: HUB.chart.x, z: HUB.chart.z, range: 2.0, label: 'Open the star chart', short: 'Chart', run: () => this.openChart() });
      out.push(...this.kickActions(p));
    } else if (this.zone === 'ring' && near(RING.top)) {
      const sp = ringPoint(RING_START_S, RING.mid);
      const bp = ringPoint(RING_RETURN_S, RING_BACK_R);
      out.push({ x: sp.x, z: sp.z, range: 1.6, label: 'Start the ring run', short: 'Start', run: () => this.startRound(new RingRun(this)) });
      out.push({ x: bp.x, z: bp.z, range: 1.6, label: 'Fly back to the Rim', short: 'Fly', run: () => this.fly('hub', 'ring') });
    } else if (this.zone === 'storm' && near(CINDER.top)) {
      const sp = this.cinder.startSpot;
      const bp = this.cinder.backSpot;
      out.push({ x: sp.x, z: sp.z, range: 1.6, label: 'Start the rock rain', short: 'Start', run: () => this.startRound(new Storm(this)) });
      out.push({ x: bp.x, z: bp.z, range: 1.6, label: 'Fly back to the Rim', short: 'Fly', run: () => this.fly('hub', 'storm') });
    } else if (this.zone === 'comet' && near(DOCK.top)) {
      const rs = this.dock.rideSpot;
      if (this.dock.comet.visible && this.cometArrival < 0) out.push({ x: rs.x, z: rs.z, range: 2.2, label: 'Ride the comet', short: 'Ride', run: () => this.startRound(new Comet(this)) });
      const bp = this.dock.back.spot;
      out.push({ x: bp.x, z: bp.z, range: 1.6, label: 'Fly back to the Rim', short: 'Fly', run: () => this.fly('hub', 'comet') });
    } else if (this.zone === 'stair') {
      const lip = STAIR[STAIR.length - 1];
      if (this.stair.settled >= STAIR.length && near(lip.y) && Math.hypot(p.x - lip.x, p.z - lip.z) < lip.r + 0.5) {
        out.push({ x: lip.x, z: lip.z, range: lip.r + 0.6, label: 'Step into the black hole', short: 'Step in', run: () => this.startRound(new Finale(this)) });
      }
    }
    return out;
  }

  /** The remote's kick: Interact on the orb in front of you. */
  private kickActions(p: PlayerState): SpaceAction[] {
    const o = this.orbs.nearestKickable(p);
    if (!o) return [];
    return [{ x: o.pos.x, z: o.pos.z, range: 2.1, label: o.kind === 'moon' && !o.shoved ? 'Shove the moonball' : 'Kick the orb', short: 'Kick', run: () => this.kickOrb(o, this.player) }];
  }

  gravity(): number {
    if (this.zone === 'comet') return 0.25;
    if (this.zone === 'stair') {
      // Heavier as you near the black hole.
      const lip = STAIR[STAIR.length - 1];
      const d = Math.hypot(this.player.x - lip.x, this.player.z - lip.z);
      return 0.35 + 0.15 * Math.max(0, 1 - d / 50);
    }
    return 0.35;
  }

  runScale(): number {
    return this.round?.boarded ? 1 : 1.3;
  }

  jumpAction(p: PlayerState): { label: string; run: () => void } | null {
    if (this.round?.jump) return this.round.jump(p);
    if (!this.round?.boarded || p.riding) return null;
    // Timed rounds: Jump is a twirl, so no device gets an edge on the boards.
    return {
      label: 'Twirl',
      run: () => {
        this.ctx.swing();
        this.ctx.squash(-0.2);
        gsfx.dust(Math.floor(this.time * 3));
        this.sparks.burst({ at: { x: p.x, y: p.y + 1, z: p.z }, count: 18, shape: 'ring', speed: [2, 4], color: [0xf4b740, 0xff9ad5], size: [0.1, 0.2], life: [0.3, 0.6] });
      },
    };
  }

  holdsTime(): boolean {
    return (this.round?.holdsTime() ?? false) || this.trav.busy || !!this.cine || this.stars.length > 0;
  }

  cameraShot(dt: number): CameraShot | null {
    if (this.cine) {
      if (!this.ctx.ui.isOpen) this.cine.t += dt;
      const c = this.cine;
      const u = Math.min(1, c.t / c.dur);
      const shot = c.shot(u, c.t);
      if (u >= 1) this.endCine();
      return shot;
    }
    return this.round?.shot?.(dt) ?? null;
  }

  carry(h: number, p: PlayerState, move: MoveInput): Carry | null {
    const c = this.trav.carry(h, p, move);
    if (c) return c;
    return this.round?.carry?.(h, p, move) ?? null;
  }

  extraColliders(): Collider[] {
    return [...this.cinder.tileColliders(), ...this.stair.colliders()];
  }

  step(dt: number, p: PlayerState): void {
    this.player = p;
    this.playerPos.set(p.x, p.y, p.z);
    this.hud.update(dt);
    const zone = this.zoneAt(p.x, p.z, p.y);
    this.zone = zone;
    this.cinder.step(dt);

    // Landing tops and the star net.
    if (p.grounded && !this.trav.busy) {
      this.lastTop = p.y;
      this.lastGround.set(p.x, p.y, p.z);
      if (zone === 'stair') {
        const i = STAIR.findIndex((s) => Math.hypot(p.x - s.x, p.z - s.z) < s.r + 0.3 && Math.abs(p.y - s.y) < 0.2);
        if (i >= 0) this.lastStone = i;
      }
    }
    if (!this.trav.busy && !this.cine && netTriggered(p.y, p.grounded, this.lastTop, Math.hypot(p.x, p.z) < HUB_R + 1)) this.net(this.checkpoint());
    if (!this.trav.busy && !this.cine && p.grounded) this.autoRides(p);

    this.orbs.step(dt, p, this.hole);
    this.round?.step(dt, p);
    // Free play: keep a few orbs on the hub.
    if (!this.round && this.save.data.stars.wake && zone === 'hub') {
      this.freeOrbsFor += dt;
      if (this.orbs.onHub < 5 && this.freeOrbsFor > 2.5) {
        this.freeOrbsFor = 0;
        const a = (Math.floor(this.time * 7) % 12) * 0.5 - 2.75;
        const r = 4 + (Math.floor(this.time * 13) % 6);
        const x = Math.sin(a * 0.5) * r;
        const z = -Math.cos(a * 0.5) * r;
        if (Math.hypot(x - p.x, z - p.z) > 2.5) {
          this.orbs.spawn(x, z, 'plain');
          sfxSpace.spawn();
        }
      }
    }
    // The wake star, burped out on the hub, waits for you.
    const ws = this.wakeStar;
    if (ws) {
      ws.t += dt;
      if (ws.landed && Math.hypot(p.x - ws.pos.x, p.z - ws.pos.z) < 1.3 && p.y < 1.5) {
        this.scene.remove(ws.mesh);
        this.wakeStar = null;
        this.award('wake', 1);
        void this.feedStars(1, ws.pos.clone().setY(1), 'wake').then(() => {
          this.hud.objective(null);
          this.freeOrbs(false);
        });
      }
    }
    // Stair stones fly in and lock.
    const locked = this.stair.update(dt, this.time, this.hole.centre);
    if (locked >= 0) {
      gsfx.stone(locked);
      const s = STAIR[locked];
      this.shock.emit({ x: s.x, y: s.y + 0.05, z: s.z }, { color: 0xf4b740, radius: s.r * 2, life: 0.6 });
      this.sparks.burst({ at: { x: s.x, y: s.y, z: s.z }, count: 30, shape: 'ring', speed: [3, 7], color: [0xf4b740, 0xffffff], size: [0.15, 0.3], life: [0.4, 0.8] });
    }
  }

  /** Bounce blossoms and comet lanes carry you when you walk onto them. */
  private autoRides(p: PlayerState): void {
    const sp = Math.hypot(p.vx, p.vz);
    if (sp < 1) return;
    const vx = p.vx / sp;
    const vz = p.vz / sp;
    // Hub to the first stair stone.
    const hb = this.blossoms.get(this.hub.horizonBlossom);
    if (hb.visible && this.zone === 'hub' && Math.hypot(p.x - hb.x, p.z - hb.z) < 0.9) {
      this.hop(this.hub.horizonBlossom, { x: STAIR[0].x, y: STAIR[0].y, z: STAIR[0].z }, 4.5);
      return;
    }
    if (this.zone === 'stair') {
      for (let i = 0; i < this.stair.blossoms.length; i++) {
        const id = this.stair.blossoms[i];
        const b = this.blossoms.get(id);
        if (!b.visible || Math.abs(p.y - b.y) > 0.3 || Math.hypot(p.x - b.x, p.z - b.z) > 0.8) continue;
        if (vx * Math.sin(b.yaw) + vz * Math.cos(b.yaw) < 0.3) continue;
        const n = STAIR[i + 1];
        this.hop(id, { x: n.x, y: n.y, z: n.z }, 2.6);
        return;
      }
    }
    if (this.zone !== 'ring' || Math.abs(p.y - RING.top) > 0.2) return;
    const c = ringCoords(p.x, p.z);
    const th = RING_THETA0 - (c.s * Math.PI) / 180;
    const fwd = vx * Math.sin(th) - vz * Math.cos(th);
    if (fwd < 0.5) return;
    const r = Math.max(RING.inner + 0.6, Math.min(RING.outer - 0.6, c.r));
    for (let g = 0; g < RING_BLOSSOMS.length; g++) {
      const [b0, b1] = RING_BLOSSOMS[g];
      if (c.s >= b0 && c.s <= b1) {
        const land = ringPoint(RING_GAPS[g][1] + GAP_LAND, r);
        const ids = this.ring.blossoms[g];
        const id = ids[r < RING.mid - 1.5 ? 0 : r > RING.mid + 1.5 ? 2 : 1];
        this.hop(id, { x: land.x, y: RING.top, z: land.z }, 2.4);
        return;
      }
    }
    for (let k = 0; k < RING_LANES.length; k++) {
      const [a0, a1] = RING_LANES[k];
      if (c.s >= a0 && c.s < a0 + 2.5) {
        this.lane(k, c.s, a1, r);
        return;
      }
    }
  }

  private hop(id: number, to: Spot3, apex: number): void {
    const from = { x: this.player.x, y: this.player.y, z: this.player.z };
    this.blossoms.trigger(id);
    gsfx.boing();
    this.ctx.squash(0.35);
    const b = this.blossoms.get(id);
    this.glows.burst({ at: { x: b.x, y: b.y + 0.3, z: b.z }, count: 26, shape: 'up', speed: [2, 5], color: [0xff9ad5, 0xf4b740], size: [0.15, 0.3], life: [0.5, 1], gravity: -0.5 });
    this.trav.start({
      kind: 'hop',
      type: 'arc',
      t: 0,
      arc: hopArc(from, to, apex),
      eased: false,
      pose: 'float',
      onEnd: () => {
        this.ctx.squash(0.25);
        this.dust.burst({ at: { x: to.x, y: to.y + 0.1, z: to.z }, count: 14, shape: 'ring', speed: [1.5, 3], color: 0xc9b6ff, size: [0.3, 0.6], life: [0.3, 0.6], alpha: 0.45, drag: 2 });
        gsfx.plink();
      },
    });
  }

  private lane(k: number, s0: number, s1: number, r: number): void {
    const len = (((s1 - s0) * Math.PI) / 180) * r;
    const dur = len / LANE_SPEED;
    gsfx.whoosh();
    const mat = this.ring.laneMats[k];
    this.trav.start({
      kind: 'lane',
      type: 'path',
      t: 0,
      dur,
      pose: 'surf',
      at: (u) => {
        const p = ringPoint(s0 + (s1 - s0) * u, r);
        return { x: p.x, y: RING.top, z: p.z };
      },
      onStart: () => (mat.uniforms.uBoost.value = 1.5),
      onEnd: () => {
        mat.uniforms.uBoost.value = 0;
        this.ctx.squash(0.15);
      },
    });
  }

  // -------------------------------------------------------------------------
  // The star chart

  openChart(): void {
    const d = this.save.data;
    const ui = this.ctx.ui;
    const row = (name: string, stars: number, max: number, best: string) =>
      h('li', {}, h('span', { class: 'gx-chart-name' }, name), h('span', { class: 'gx-chart-stars' }, ...Array.from({ length: max }, (_, i) => h('i', { class: i < stars ? 'on' : '' }, '★'))), h('span', { class: 'gx-chart-best' }, best));
    const fmt = (k: 'frenzy' | 'ring' | 'storm' | 'comet') => {
      const v = d.best[k];
      if (v === null) return 'Not played';
      return k === 'ring' ? formatLap(v) : `${v}`;
    };
    const travel: HTMLButtonElement[] = [];
    let panel: Panel;
    for (const k of ISLANDS) {
      if (this.shownFed >= UNLOCK[k])
        travel.push(
          button(`Fly to ${ISLAND_NAME[k]}`, () => {
            ui.close(panel);
            // Walk-free travel: lift off from where you stand.
            this.fly(k, 'hub');
          }),
        );
    }
    const close = button('Close', () => ui.close(panel), 'primary');
    const again = d.bloomed
      ? button(
          'Start the galaxy again',
          () => {
            ui.close(panel);
            void import('../../ui/dialogs').then(async ({ confirmBox }) => {
              const ok = await confirmBox(ui, { title: 'Start the galaxy again?', body: 'Your stars go back into the sky. Your best scores stay.', ok: 'Start again', cancel: 'Keep my galaxy' });
              if (ok) this.restartJourney();
            });
          },
          'ghost',
        )
      : null;
    panel = {
      el: h(
        'div',
        { class: 'card xk-card xk-card-dark gx-chart' },
        h('div', { class: 'xk-card-kicker' }, 'Star chart'),
        h('h2', {}, `${this.save.total} of ${STAR_GOAL} stars fed`),
        h('p', { class: 'xk-tagline' }, this.save.total >= STAR_GOAL ? (d.bloomed ? `The galaxy has bloomed ${d.bloomed === 1 ? 'once' : `${d.bloomed} times`}.` : 'The Horizon stair is open. Climb to the black hole.') : 'Every star you feed makes the black hole grow.'),
        h(
          'ul',
          { class: 'gx-chart-list' },
          row('Wake it up', d.stars.wake, 1, d.stars.wake ? 'Done' : 'Feed 5 orbs'),
          row('Feeding frenzy', d.stars.frenzy, 3, fmt('frenzy')),
          row('Ring run', d.stars.ring, 3, fmt('ring')),
          row('Rock rain', d.stars.storm, 3, fmt('storm')),
          row('Comet surf', d.stars.comet, 3, fmt('comet')),
        ),
        h('p', { class: 'gx-chart-moons' }, `Lost moons found: ${moonCount(d.moons)} of 8`),
        h('div', { class: 'actions' }, close, ...travel, again),
      ),
      onBack: () => ui.close(panel),
      initial: () => close,
    };
    ui.open(panel);
  }

  private restartJourney(): void {
    this.save.restart();
    this.shownFed = this.save.total;
    this.hole.setFed(this.holeFed(this.shownFed));
    this.applyConstellations(true);
    this.stair.setCount(this.stairCount(this.shownFed), true);
    this.sky.setPour(0);
    this.blossoms.show(this.hub.horizonBlossom, false);
    this.dock.comet.visible = false;
    this.endRound();
    this.orbs.clear();
    this.startRound(new Wake(this));
    this.hud.banner('A new galaxy', { sub: 'Wake the black hole', color: '#f4b740' });
  }

  /** After five orbs: the black hole burps out the first star onto the hub. */
  burpWakeStar(): void {
    const land = new THREE.Vector3(HUB.slings.ring.x + 2.2, 0, HUB.slings.ring.z + 2.4);
    const mesh = glowSprite('#f4b740', 2.2, 1.5);
    this.scene.add(mesh);
    this.wakeStar = { mesh, pos: land, t: 0, landed: false };
    this.hole.burp(1.4);
    gsfx.rumble();
    gsfx.burp();
    this.ctx.shake(0.35);
    this.flare = 2;
  }

  // -------------------------------------------------------------------------
  // Boards

  async loadBoards(): Promise<void> {
    const ctx = this.ctx;
    const [frenzy, modes] = await Promise.all([api.scores(ctx.roomId, ctx.area.id, ctx.browserId), api.modeBoards(ctx.roomId, ctx.area.id, ['ring', 'storm', 'comet'], ctx.browserId)]);
    if (this.disposed) return;
    if (frenzy.ok && frenzy.data.kind === 'galaxy') {
      this.boards.frenzy = frenzy.data.board;
      this.bests.frenzy = frenzy.data.best;
    }
    if (modes.ok && modes.data.kind === 'modes') {
      for (const k of ['ring', 'storm', 'comet'] as const) {
        const b = modes.data.boards[k];
        if (b) {
          this.boards[k] = b.board;
          this.bests[k] = b.best;
        }
      }
    }
    this.paintBoards();
  }

  paintBoards(): void {
    const mat = this.hub.shrineBoard.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    const fb = this.bests.frenzy ?? this.save.data.best.frenzy;
    mat.map = boardTexture('Feeding frenzy', this.boards.frenzy.map((r) => ({ name: r.name, value: String(r.value), you: r.you })), fb !== null ? `Your best ${fb}` : 'Start a frenzy to set a score', '#53f0c0');
    mat.needsUpdate = true;
    const d = this.save.data;
    const rows = (k: 'ring' | 'storm' | 'comet') => this.boards[k].map((r) => ({ name: r.name, value: k === 'ring' ? formatLap(r.value) : String(r.value), you: r.you }));
    const best = (k: 'ring' | 'storm' | 'comet') => {
      const v = d.best[k] ?? this.bests[k];
      return v === null || v === undefined ? null : k === 'ring' ? formatLap(v) : `${v}`;
    };
    this.ring.billboard.paint({ title: 'Ring run', stars: d.stars.ring, best: best('ring'), hint: 'Two laps through every gate', rows: rows('ring') });
    this.cinder.billboard.paint({ title: 'Rock rain', stars: d.stars.storm, best: best('storm'), hint: 'Grab shards, dodge meteors', rows: rows('storm') });
    this.dock.billboard.paint({ title: 'Comet surf', stars: d.stars.comet, best: best('comet'), hint: 'Steer through the stardust', rows: rows('comet') });
  }

  // -------------------------------------------------------------------------
  // Frame

  setQuality(tier: Tier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.sky.setQuality(tier);
    this.hole.setQuality(tier);
    this.hub.setQuality(tier, this.env);
    this.ring.planetMat.uniforms.uDetail.value = tier === 'low' ? 2 : 4;
    for (const p of [this.sparks, this.glows, this.dust]) p.setQuality(tier);
    this.sun.shadow.mapSize.set(tier === 'high' ? 2048 : 1024, tier === 'high' ? 2048 : 1024);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.composerKey = '';
  }

  cutaway(): void {}

  update(_night: number, t: number, _phase: number, focus: THREE.Vector3): void {
    const dt = Math.min(0.1, this.lastT ? t - this.lastT : 0);
    this.lastT = t;
    this.time += dt;
    this.arrivalT += dt;
    this.flare = Math.max(0, this.flare - dt * 1.2);
    this.uniforms.uTime.value = this.time;
    this.uniforms.uFlare.value = Math.min(1.5, this.flare);
    const cam = this.ctx.camera;
    this.sky.update(dt, cam);
    this.hole.update(dt, cam);
    this.blossoms.update(dt, this.time);
    for (const p of [this.sparks, this.glows, this.dust]) p.update(dt);
    this.shock.update(dt);
    this.orbs.update(this.time, this.hole);
    this.hub.seamMat.uniforms.uCenter.value.set(0, 0, 0);
    const fed = this.shownFed;
    const open = { ring: fed >= UNLOCK.ring, storm: fed >= UNLOCK.storm, comet: fed >= UNLOCK.comet };
    const need = { ring: UNLOCK.ring, storm: UNLOCK.storm, comet: UNLOCK.comet };
    if (this.charge) this.charge.t += dt;
    const st = this.save.data.stars;
    this.hub.update(dt, this.time, {
      open,
      need,
      horizon: fed >= STAR_GOAL,
      frenzy: st.wake > 0,
      charge: this.charge && this.charge.island !== 'hub' ? this.charge.island : null,
      chargeT: this.charge?.t ?? 0,
      pips: { hub: st.wake + st.frenzy, ring: st.ring, storm: st.storm, comet: st.comet },
    });
    this.cinder.paintTiles(this.time, fed >= UNLOCK.storm ? 1 : 0);
    this.dock.update(dt, this.time, this.round?.id === 'comet');
    this.updateCometArrival(dt);
    for (const pad of [this.ring.start, this.ring.back, this.cinder.start, this.cinder.back, this.dock.back]) {
      pad.holo.rotation.y += dt * 0.8;
      pad.holo.position.y = 2.2 + Math.sin(this.time * 1.4 + pad.spot.x) * 0.12;
    }
    for (const pad of [this.hub.pads.ring, this.hub.pads.storm, this.hub.pads.comet, this.ring.start, this.ring.back, this.cinder.start, this.cinder.back, this.dock.back]) padNear(pad, cam.position, dt);
    this.round?.update(dt, this.time);

    // Flying stars.
    for (const s of [...this.stars]) {
      s.t += dt;
      const u = Math.max(0, (s.t - s.delay) / 1.4);
      if (u <= 0) continue;
      const e = u * u * (3 - 2 * u);
      const p = new THREE.Vector3().lerpVectors(s.from, this.hole.centre, e);
      p.y += Math.sin(e * Math.PI) * 10;
      s.mesh.position.copy(p);
      s.mesh.quaternion.copy(cam.quaternion);
      s.mesh.scale.setScalar(2.4 * (1 - e * 0.6));
      this.glows.stream({ at: p, count: 1, rate: 60, speed: [0.2, 1], color: [0xf4b740, 0xfff3c4], size: [0.3, 0.6], life: [0.3, 0.6] }, dt);
      if (u >= 1) this.starArrives(s);
    }
    // The wake star's bounce out of the black hole onto the hub.
    const ws = this.wakeStar;
    if (ws) {
      const u = Math.min(1, ws.t / 2.2);
      const e = 1 - Math.pow(1 - u, 2);
      const p = new THREE.Vector3().lerpVectors(this.hole.centre, ws.pos.clone().setY(1), e);
      p.y += Math.sin(e * Math.PI) * 14;
      if (u >= 1) {
        if (!ws.landed) {
          ws.landed = true;
          gsfx.plink();
          this.shock.emit({ x: ws.pos.x, y: 0.06, z: ws.pos.z }, { color: 0xf4b740, radius: 3, life: 0.6 });
          this.hud.objective('Grab the star');
        }
        p.set(ws.pos.x, 1 + Math.sin(this.time * 3) * 0.15, ws.pos.z);
        this.glows.stream({ at: p, count: 1, rate: 20, speed: [0.3, 1], shape: 'up', color: [0xf4b740, 0xfff3c4], size: [0.2, 0.4], life: [0.4, 0.8], gravity: -0.6 }, dt);
      } else this.glows.stream({ at: p, count: 1, rate: 70, speed: [0.2, 1], color: [0xf4b740, 0xfff3c4], size: [0.3, 0.6], life: [0.3, 0.6] }, dt);
      ws.mesh.position.copy(p);
      ws.mesh.quaternion.copy(cam.quaternion);
    }

    // The star net's bubble.
    if (this.bubble.visible) {
      this.bubble.position.set(this.player.x, this.player.y + 0.85, this.player.z);
      this.bubble.scale.setScalar(1 + Math.sin(this.time * 6) * 0.04);
    }
    // Carried trails: sparkles behind slings and hops.
    const k = this.trav.kind;
    if (k === 'sling' || k === 'hop' || k === 'lane') {
      this.glows.stream({ at: { x: this.player.x, y: this.player.y + 0.8, z: this.player.z }, count: 1, rate: k === 'sling' ? 90 : 40, speed: [0.1, 0.6], color: k === 'lane' ? [0xbfe8ff, 0xf4b740] : [0xf4b740, 0x8a6bd1], size: [0.2, 0.45], life: [0.3, 0.7] }, dt);
    }

    // Spark goes where you should go next.
    this.guide();
    this.spark.update(dt, cam, this.playerPos, !!this.cine);

    // Shadows follow you.
    this.sun.position.set(focus.x - 12, focus.y + 24, focus.z + 12);
    this.sun.target.position.set(focus.x, focus.y, focus.z);
    this.sun.target.updateMatrixWorld();

    // Finale fades: DOM layers, so they work on every tier.
    this.fadeEl.style.opacity = this.fade.amount.toFixed(3);
    this.fadeEl.style.background = `#${this.fade.color.getHexString()}`;
    this.warpEl.style.opacity = (this.tier === 'low' ? this.fade.tunnel : 0).toFixed(3);
    this.warpEl.style.setProperty('--spin', `${(1 / Math.max(0.2, this.fade.spin)).toFixed(2)}s`);
    this.paintHud();
  }

  private updateCometArrival(dt: number): void {
    if (this.cometArrival < 0) return;
    this.cometArrival += dt;
    const u = Math.min(1, this.cometArrival / 4);
    const e = 1 - Math.pow(1 - u, 3);
    const from = new THREE.Vector3(120, 60, 120);
    this.dock.comet.visible = true;
    this.dock.comet.position.lerpVectors(from, this.dock.mooring, e);
    if (u >= 1) {
      this.cometArrival = -1;
      this.shock.emit({ x: this.dock.mooring.x, y: this.dock.mooring.y, z: this.dock.mooring.z }, { color: 0xbfe8ff, radius: 5, life: 0.7, normal: { x: 1, y: 0, z: 0 } });
    }
  }

  /** Picks Spark's target: the next useful thing. */
  private guide(): void {
    const sp = this.spark;
    const p = this.playerPos;
    const set = (v: THREE.Vector3 | null, label = '') => {
      sp.target = v;
      sp.label = label;
    };
    if (this.round) {
      const t = (this.round as unknown as { guide?: () => { at: THREE.Vector3; label: string } | null }).guide?.() ?? null;
      set(t?.at ?? null, t?.label ?? '');
      return;
    }
    if (this.wakeStar?.landed) return set(this.wakeStar.pos.clone().setY(0.4), 'Star');
    if (this.trav.busy || this.cine) return set(null);
    const fed = this.shownFed;
    const st = this.save.data.stars;
    const d = this.save.data;
    if (this.zone === 'hub') {
      if (fed >= STAR_GOAL && !d.bloomed) return set(new THREE.Vector3(HUB.horizon.x, 0.2, HUB.horizon.z), 'Horizon');
      // The next island worth a visit: open, and not yet three-starred.
      for (const k of ISLANDS) {
        if (fed >= UNLOCK[k] && st[k] === 0) return set(new THREE.Vector3(HUB.slings[k].x, 0.2, HUB.slings[k].z), ISLAND_NAME[k]);
      }
      if (st.frenzy === 0) return set(new THREE.Vector3(HUB.shrine.x, 1.2, HUB.shrine.z), 'Frenzy');
      for (const k of ISLANDS) if (fed >= UNLOCK[k] && st[k] < 3) return set(new THREE.Vector3(HUB.slings[k].x, 0.2, HUB.slings[k].z), ISLAND_NAME[k]);
      return set(null);
    }
    if (this.zone === 'ring') {
      const s = ringPoint(RING_START_S, RING.mid);
      return set(new THREE.Vector3(s.x, RING.top, s.z), 'Start');
    }
    if (this.zone === 'storm') return set(new THREE.Vector3(this.cinder.startSpot.x, CINDER.top, this.cinder.startSpot.z), 'Start');
    if (this.zone === 'comet') return set(this.dock.comet.visible ? new THREE.Vector3(this.dock.rideSpot.x, DOCK.top, this.dock.rideSpot.z) : null, 'Comet');
    if (this.zone === 'stair') {
      const next = STAIR[Math.min(STAIR.length - 1, this.lastStone + 1)];
      return set(new THREE.Vector3(next.x, next.y, next.z), '');
    }
    set(null);
    void p;
  }

  private paintHud(): void {
    // The hub's own corner: stars fed, and in free play nothing else.
    if (!this.round) {
      this.hud.strip([]);
    }
    let el = this.hud.root.querySelector('.gx-stars') as HTMLElement | null;
    if (!el) {
      el = h('div', { class: 'gx-stars' }, h('i', {}, '★'), h('b'), h('small'));
      this.hud.root.appendChild(el);
    }
    const b = el.querySelector('b')!;
    const txt = `${this.shownFed}`;
    if (b.textContent !== txt) {
      b.textContent = txt;
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
    const small = el.querySelector('small')!;
    const sub = this.shownFed >= STAR_GOAL ? 'fed' : `of ${STAR_GOAL}`;
    if (small.textContent !== sub) small.textContent = sub;
    el.classList.toggle('hidden', !!this.round?.boarded || !!this.cine?.letterbox);
  }

  private ensureComposer(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    const q = TIERS[this.tier ?? 'medium'];
    const size = renderer.getSize(new THREE.Vector2());
    const key = `${this.tier}|${size.x}x${size.y}|${renderer.getPixelRatio()}`;
    if (this.composer && key === this.composerKey) {
      (this.composer.passes[0] as RenderPass).camera = camera;
      return;
    }
    this.composer?.dispose();
    this.pre?.renderTarget.dispose();
    this.composerKey = key;
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(this.scene, camera));
    this.pre = null;
    if (q.lens) {
      this.lens = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uRadius: { value: 0.05 }, uAspect: { value: 1 }, uStrength: { value: 0.9 } }, vertexShader: S.QUAD_VERT, fragmentShader: S.LENS_FRAG });
      composer.addPass(this.lens);
    } else this.lens = null;
    if (q.bloom > 0) {
      // The picture before bloom, for inside the black hole.
      this.pre = new SavePass();
      composer.addPass(this.pre);
      const res = new THREE.Vector2(size.x, size.y).multiplyScalar(this.tier === 'high' ? 1 : 0.5);
      // Only bright things bloom: the disk, the orbs, the seams and the stars.
      composer.addPass(new UnrealBloomPass(res, q.bloom, 0.5, 0.62));
    }
    this.final = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        tPre: { value: null },
        uTime: { value: 0 },
        uWarp: { value: 0 },
        uTunnel: { value: 0 },
        uSpin: { value: 1 },
        uAberration: { value: q.aberration },
        uHoleCenter: { value: new THREE.Vector2(-9, -9) },
        uHoleRadius: { value: 0 },
        uAspect: { value: 1 },
        uFade: { value: 0 },
        uFadeColor: { value: new THREE.Color() },
      },
      vertexShader: S.QUAD_VERT,
      fragmentShader: S.FINAL_FRAG,
    });
    // Set after construction: render target textures cannot be cloned into uniforms.
    this.final.uniforms.tPre.value = this.pre?.renderTarget.texture ?? null;
    composer.addPass(this.final);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): boolean {
    // Count the whole frame (passes included), read on the next frame.
    this.renderer = renderer;
    renderer.info.autoReset = false;
    this.drawInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    renderer.info.reset();
    this.sky.prepare(renderer);
    if (this.tier !== 'low' && !this.env) {
      // Reflections of the nebula for the glass tiles, made once.
      const pm = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      const envSphere = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.sky.nebula);
      envScene.add(envSphere);
      this.env = pm.fromScene(envScene, 0.04).texture;
      pm.dispose();
      envSphere.geometry.dispose();
      this.hub.tileMats.physical.envMap = this.env;
      this.hub.tileMats.physical.envMapIntensity = 0.55;
      this.hub.tileMats.physical.needsUpdate = true;
    }
    if (this.tier === 'low') return false;
    this.ensureComposer(renderer, camera);
    const warp = Math.max(0, 1 - this.arrivalT / 1.8);
    const size = renderer.getSize(new THREE.Vector2());
    const aspect = size.x / size.y;
    const scr = this.hole.screen(camera, aspect);
    if (this.final) {
      const u = this.final.uniforms;
      u.uWarp.value = this.ctx.reduceMotion() ? 0 : warp * warp;
      u.uTime.value = this.time;
      u.uHoleCenter.value.set(scr.ahead ? scr.x : -9, scr.ahead ? scr.y : -9);
      u.uHoleRadius.value = scr.ahead && this.fade.tunnel < 0.5 && this.pre ? scr.r : 0;
      u.uAspect.value = aspect;
      u.uTunnel.value = this.fade.tunnel;
      u.uSpin.value = this.fade.spin;
      u.uFade.value = 0;
    }
    if (this.lens) {
      this.lens.uniforms.uCenter.value.set(scr.x, scr.y);
      this.lens.uniforms.uRadius.value = scr.r;
      this.lens.uniforms.uAspect.value = aspect;
      this.lens.uniforms.uStrength.value = scr.visible ? 0.9 : 0;
    }
    this.composer!.render();
    return true;
  }

  resize(): void {
    this.composerKey = '';
  }

  dispose(): void {
    this.disposed = true;
    if (this.renderer) this.renderer.info.autoReset = true;
    this.round?.dispose();
    this.round = null;
    music.stop(0.6);
    this.hud.dispose();
    this.spark.dispose();
    this.composer?.dispose();
    this.pre?.renderTarget.dispose();
    this.env?.dispose();
    this.sky.dispose();
    this.hole.dispose();
    for (const p of [this.sparks, this.glows, this.dust]) p.dispose();
    this.shock.dispose();
    this.hub.tileMats.physical.dispose();
    this.hub.tileMats.plain.dispose();
    disposeTree(this.scene);
  }

  // -------------------------------------------------------------------------
  // Playtests

  /** For scripted playtests. */
  debugInfo() {
    const d = this.save.data;
    return {
      tier: this.tier,
      zone: this.zone,
      carry: this.trav.kind,
      cine: !!this.cine,
      stars: { ...d.stars },
      total: this.save.total,
      fed: this.shownFed,
      holeRadius: this.hole.radius,
      bloomed: d.bloomed,
      flyingStars: this.stars.length,
      wakeStar: this.wakeStar ? { x: this.wakeStar.pos.x, z: this.wakeStar.pos.z, landed: this.wakeStar.landed } : null,
      round: this.round ? { id: this.round.id, ...(this.round.debug() as object) } : null,
      orbs: this.orbs.live.map((o) => ({ x: o.pos.x, z: o.pos.z, state: o.state, kind: o.kind })),
      spark: this.spark.target ? { x: this.spark.target.x, y: this.spark.target.y, z: this.spark.target.z, label: this.spark.label } : null,
      stair: this.stair.settled,
      boards: { frenzy: this.boards.frenzy.length, ring: this.boards.ring.length, storm: this.boards.storm.length, comet: this.boards.comet.length },
      bests: { ...d.best },
      composer: !!this.composer,
      draw: { ...this.drawInfo },
      log: this.debugLog.slice(-8),
    };
  }

  log(s: string): void {
    this.debugLog.push(s);
  }

  /** Playtests: pretend this many stars were earned (spread over the challenges). */
  debugGrant(stars: number): void {
    const order: Challenge[] = ['wake', 'frenzy', 'frenzy', 'frenzy', 'ring', 'ring', 'ring', 'storm', 'storm', 'storm', 'comet', 'comet', 'comet'];
    this.save.update((d) => {
      for (const k of Object.keys(d.stars) as Challenge[]) d.stars[k] = 0;
      for (let i = 0; i < Math.min(stars, order.length); i++) d.stars[order[i]]++;
      d.flyover = true;
    });
    const before = this.shownFed;
    this.shownFed = this.save.total;
    this.hole.setFed(this.holeFed(this.shownFed), true);
    this.applyConstellations(true);
    this.dock.comet.visible = this.shownFed >= UNLOCK.comet;
    this.stair.setCount(this.stairCount(this.shownFed), true);
    this.sky.setPour(this.shownFed >= STAR_GOAL ? 1 : 0);
    this.blossoms.show(this.hub.horizonBlossom, this.shownFed >= STAR_GOAL);
    if (this.round?.id === 'wake') this.endRound();
    void before;
    this.freeOrbs(true);
    this.paintBoards();
  }

  /** Playtests: skip any cinematic. */
  debugSkip(): void {
    if (this.stars.length) this.skipStars();
    if (this.cine) this.endCine();
  }

  /** Playtests: forget everything on this device. */
  debugReset(): void {
    this.save.update((d) => {
      for (const k of Object.keys(d.stars) as Challenge[]) d.stars[k] = 0;
      d.best = { frenzy: null, ring: null, storm: null, comet: null };
      d.moons = 0;
      d.bloomed = 0;
    });
    this.debugGrant(0);
  }

  /** Playtests: put the player on an island top. */
  debugWarp(where: Island | 'hub' | 'stair' | 'lip'): void {
    this.trav.cancel();
    let s: { x: number; y: number; z: number; yaw: number };
    if (where === 'stair') s = { x: STAIR[0].x, y: STAIR[0].y, z: STAIR[0].z, yaw: Math.PI };
    else if (where === 'lip') {
      const l = STAIR[STAIR.length - 1];
      s = { x: l.x, y: l.y, z: l.z, yaw: Math.atan2(BH.x - l.x, BH.z - l.z) };
    } else s = this.islandSpot(where);
    this.lastTop = s.y;
    this.ctx.teleport(s.x, s.z, s.yaw, s.y);
  }

  /** Playtests: shorten the next timed round. */
  debugShortRound(seconds: number): void {
    (globalThis as unknown as { __galaxyShort?: number }).__galaxyShort = seconds;
  }
}

/** Playtests can shorten rounds; real play never sets this. */
export function shortRound(normal: number): number {
  const s = (globalThis as unknown as { __galaxyShort?: number }).__galaxyShort;
  return s && s > 0 ? Math.min(normal, s) : normal;
}
