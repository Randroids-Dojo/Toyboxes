// Toybox Grand Prix: tiny karts, giant rooms. The kart world for room 1's
// "Kart track" (and any room's drawn track). Four circuits, seven toy
// drivers, a cup with points and trophies, single races, time trials
// against your ghost with server-checked boards, and free drive.
//
// The world owns one circuit at a time. The paddock is the only place you
// walk; your kart waits in its pit box. Stop there (or anywhere in free
// drive) for the race menu.

import * as THREE from 'three';
import './kart.css';
import { sfx } from '../../audio/sfx';
import { api, type KartRow } from '../../net/api';
import { CUP, areaCircuits, type CircuitId, type HomeId } from '../../shared/kart/circuits';
import { GhostRecorder, decodeGhost, ghostAt, type Ghost } from '../../shared/kart/ghost';
import { BOOSTS, CLASSES, MEDAL_NAMES, cupOrder, medalFor, pointsFor, rng, type BodyId, type ClassId, type ItemId } from '../../shared/kart/rules';
import { trackId } from '../../shared/track';
import { disposeTree } from '../../world/kit';
import { circle, damp, type Collider } from '../../world/physics';
import type { CameraShot, PlayerState, SpaceAction, SpaceView, Spot, Tier } from '../../world/space';
import { formatLap, ordinal, type ExperienceCtx } from '../common';
import { Hud, Particles, Shockwaves, music } from '../kit';
import { aiInputs, driveCpu, type AiWorld } from './ai';
import { dressBlockTown } from './build/blocktown';
import { buildScene, setTier, type CircuitScene, type ThemeParts } from './build/scene';
import { Shape, ball, cyl, rbox } from './build/shape';
import { flyover, gridPan, orbit, type Shot } from './cinema';
import { Circuit, EDGE } from './circuit';
import { DRIVERS, Driver, driverById, type Mood } from './drivers';
import { Env } from './env';
import { ITEM_NAMES, RaceHud } from './hud';
import { Items } from './items';
import { Bubble, TipBoards, boltLine, type Controls } from './onboarding';
import { openRaceMenu, showResults, showStandings, openBoards, openTrophies, openSketch, podiumCard, warmupDone, confirmLeave } from './menu';
import { RaceKart, WheelPool } from './racekart';
import { newRacer, progress, type Racer } from './racer';
import { FLAMES, KartSave, PAINTS } from './save';
import { SONGS } from './songs';
import { PackDrone, kartSfx } from './sounds';
import { DRESSERS } from './themes';
import { zAudit } from './zaudit';

export type SessionKind = 'cup' | 'single' | 'trial' | 'warmup';

export interface SessionOpts {
  kind: SessionKind;
  circuit: HomeId;
  cls: ClassId;
  items: boolean;
  /** Race a board place's ghost in time trial (rank), or your own. */
  ghostRank?: number;
}

interface Cup {
  index: number;
  circuits: HomeId[];
  points: Record<string, number>;
  last: Record<string, number>;
  /** Finishing order of each race so far. */
  races: string[][];
}

interface Session {
  opts: SessionOpts;
  state: 'intro' | 'grid' | 'countdown' | 'running' | 'done' | 'podium';
  /** Race clock from the green light, seconds. */
  t: number;
  /** Time into the current cinematic. */
  shotT: number;
  shotLen: number;
  seed: number;
  rnd: () => number;
  laps: number;
  cup: Cup | null;
  bestLap: number | null;
  lapTimes: number[];
  finalLap: boolean;
  pressedAt: number | null;
  early: boolean;
  resultsOpen: boolean;
  rival: string | null;
  ghost: { pts: number[]; name: string; ms: number } | null;
  /** Your finishing order once you cross the line. */
  order: Racer[] | null;
  /** When you finished, race time. */
  doneAt: number;
}

interface Timing {
  started: boolean;
  lapStart: number;
  dist: number;
  s: number;
  valid: boolean;
  last: number | null;
  wrongFor: number;
  offFor: number;
  rec: GhostRecorder | null;
}

const PAD_BOOST = BOOSTS.pad;
const DRAFT_TIME = 1.1;

export class KartWorld implements SpaceView {
  readonly indoor = false;
  readonly scene = new THREE.Scene();
  readonly colliders: Collider[] = [];
  readonly lectern = null;
  readonly chest = null;
  readonly areaDoors = [];
  readonly exhibitSpots = [];
  door: Spot = { x: 0, z: 0 };
  arrival = { x: 0, z: 0, yaw: 0 };
  readonly env: Env;
  readonly save: KartSave;
  readonly circuits: HomeId[];
  readonly hud: Hud;
  readonly race: RaceHud;
  c!: Circuit;
  cs!: CircuitScene;
  items!: Items;
  readonly you: Racer;
  readonly cpus: Racer[] = [];
  private wheels: WheelPool;
  private sparks: Particles;
  private smoke: Particles;
  private glow: Particles;
  private confetti: Particles;
  private rings: Shockwaves;
  private ghostKart: RaceKart;
  private grabber: THREE.Group;
  private tips: TipBoards | null = null;
  private bubble = new Bubble();
  private drone = new PackDrone();
  private trophy: THREE.Group | null = null;
  private ghostAhead = false;
  private fireworksAt = 0;
  private track: number[];
  private sketchLaps: number;
  session: Session | null = null;
  private timing: Timing = { started: false, lapStart: 0, dist: 0, s: 0, valid: true, last: null, wrongFor: 0, offFor: 0, rec: null };
  boards: Record<string, { board: KartRow[]; best: number | null }> = {};
  private clock = 0;
  private lastFrame = performance.now();
  private tier: Tier = 'medium';
  private lastStage = 0;
  private wasRiding = false;
  private fovKick = 0;
  private flash: { text: string; until: number; tone: 'good' | 'bad' | 'gold' } | null = null;
  private lapFlash: { ms: number; delta: number | null; until: number } | null = null;
  private stuckFor = 0;
  private disposed = false;
  private loading = false;
  private freeRnd = rng(1);
  private sketchStrokes: { c: number; w: number; p: number[] }[] | null = null;
  private trophyMeshes: THREE.Object3D[] = [];
  private lastPlace = 0;
  private tipAt = 0;
  private holdItemFor = 0;
  /** Where the camera looks during directed shots. */
  private shot: Shot | null = null;
  private shotBlend = 0;
  private podiumAt: { racers: Racer[]; center: THREE.Vector3 } | null = null;
  /** Playtests can run the computer drivers at race pace without a race. */
  private simPace = false;
  private z: { audit: number; at: number } = { audit: -1, at: 0 };
  readonly bestKey: string;

  constructor(readonly ctx: ExperienceCtx) {
    const exp = ctx.area.experience;
    if (!exp || exp.kind !== 'kart') throw new Error('Not a kart track');
    this.track = exp.track;
    this.sketchLaps = exp.laps || 3;
    this.circuits = areaCircuits(exp.track);
    this.bestKey = `toyboxes.pb.${ctx.roomId}.${ctx.area.id}.${trackId(exp.track)}`;
    this.save = new KartSave(ctx.roomId, ctx.area.id, ctx.ui.device === 'touch');
    // The old personal best on the home track carries over.
    const old = Number(localStorage.getItem(this.bestKey));
    const home = this.circuits[0];
    if (old > 0 && (!this.save.d.bestLap[home] || old < this.save.d.bestLap[home])) this.save.d.bestLap[home] = old;
    this.scene.background = new THREE.Color('#f3e6cf');
    this.env = new Env(this.scene);
    this.tier = ctx.tier();
    this.hud = new Hud(ctx, { accent: '#ffd24a', accent2: '#e8574a', panel: 'dark', font: '"Lilita One", system-ui' });
    this.race = new RaceHud(ctx.ui.hud);
    this.sparks = new Particles(this.scene, { max: 1200, look: 'spark' });
    this.smoke = new Particles(this.scene, { max: 700, look: 'smoke' });
    this.glow = new Particles(this.scene, { max: 900, look: 'glow' });
    this.confetti = new Particles(this.scene, { max: 900, look: 'confetti' });
    this.rings = new Shockwaves(this.scene);
    this.wheels = new WheelPool(this.scene, 40);

    // Your kart.
    const k = this.save.d.kart;
    const paint = PAINTS.find((p) => p.id === k.paint)?.color ?? '#e8574a';
    const mine = new RaceKart('my-kart', 0, 0, 0, paint, k.body, CLASSES.battery);
    mine.player = true;
    mine.assists = { ...this.save.d.assists };
    this.you = newRacer('you', ctx.name() || 'You', paint, mine, null, null);
    this.scene.add(mine.root);
    // The computer drivers.
    for (const def of DRIVERS) {
      const kart = new RaceKart(`cpu-${def.id}`, 0, 0, 0, def.kart, def.body, CLASSES.battery);
      const driver = new Driver(def);
      kart.seat.add(driver.root);
      const r = newRacer(def.id, def.name, def.kart, kart, def, driver);
      r.tag = this.nameTag(def.name, def.kart);
      kart.root.add(r.tag);
      this.cpus.push(r);
      this.scene.add(kart.root);
    }
    // The ghost kart: see-through, no driver.
    this.ghostKart = new RaceKart('ghost', 0, 0, 0, '#7ef0ff', 'classic', CLASSES.battery);
    this.ghostKart.bodyMesh.material = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.38, emissive: new THREE.Color('#4fe3ff'), emissiveIntensity: 0.6, depthWrite: false });
    this.ghostKart.root.visible = false;
    this.ghostKart.setShadowBlob(false);
    this.scene.add(this.ghostKart.root);
    this.wheels.set([mine, ...this.cpus.map((r) => r.kart)]);
    this.cpus[0].kart.root.add(this.bubble.sprite);
    this.grabber = this.buildGrabber();
    this.scene.add(this.grabber);

    this.load(home);
    this.env.setQuality(this.tier);
    void this.loadBoards();
    void this.loadSketch();
    music.play(SONGS.paddock, { fadeIn: 2 });
    // First visit: the intro card, then the title sweep.
    void this.hud
      .intro({
        key: 'kart-grand-prix',
        title: 'Toybox Grand Prix',
        tagline: 'Tiny karts, giant rooms.',
        tips: [
          { keys: ['move'], touch: 'Stick', text: 'Steer. Gas is up, or automatic.' },
          { keys: ['jump', 'kick'], touch: 'Brake', text: 'Hold while turning to drift. Let go for a boost.' },
          { keys: ['interact'], touch: 'Action', text: 'Use your item. Stop in the pit box for races.' },
        ],
        button: 'Start your engines',
      })
      .then(() => {
        if (!this.disposed) this.hud.title('Toybox Grand Prix', this.c.name, 2600);
      });
  }

  get sun(): THREE.DirectionalLight {
    return this.env.sun;
  }

  get kart(): RaceKart {
    return this.you.kart;
  }

  get racers(): Racer[] {
    return [this.you, ...this.cpus];
  }

  /** The racers in this session (time trial is you alone). */
  private active(): Racer[] {
    const s = this.session;
    if (!s) return this.racers;
    if (s.opts.kind === 'trial') return [this.you];
    if (s.opts.kind === 'warmup') return [this.you, this.cpus[0]];
    return this.racers;
  }

  // -------------------------------------------------------------------------
  // Loading a circuit

  /** Builds a circuit in place of the current one. */
  load(id: HomeId): void {
    if (this.cs) {
      this.scene.remove(this.cs.group);
      this.cs.dispose();
      disposeTree(this.cs.group);
      this.items.dispose();
    }
    this.c = new Circuit(id, this.track, this.sketchLaps);
    const theme = this.c.theme;
    this.cs = buildScene(this.c, { ownerName: this.ctx.ownerName, tier: this.tier }, (d, s, tex): ThemeParts => (id === 'blocktown' || id === 'sketch' ? dressBlockTown(d, s, tex) : DRESSERS[theme](d, s, tex)));
    this.cs.envPoints = this.env.points;
    this.scene.add(this.cs.group);
    this.colliders.length = 0;
    this.colliders.push(...this.cs.colliders);
    // Tip boards on the home circuit, where the warm-up lap runs.
    this.tips?.dispose();
    this.tips = id === this.circuits[0] ? new TipBoards(this.c) : null;
    if (this.tips) {
      this.scene.add(this.tips.group);
      this.colliders.push(...this.tips.colliders);
    }
    this.items = new Items(this.c, () => this.rnd(), this.itemEvents());
    this.items.enabled = false;
    this.items.show(false);
    this.scene.add(this.items.group);
    this.door = this.cs.paddock.door;
    this.arrival = this.cs.paddock.arrival;
    this.env.setTheme(theme, Math.max(this.c.bounds.maxX - this.c.bounds.minX, this.c.bounds.maxZ - this.c.bounds.minZ));
    this.scene.background = new THREE.Color(theme === 'bedroom' ? '#141838' : theme === 'playroom' ? '#f3e6cf' : '#cfe6ff');
    this.race.setCircuit(this.c, this.ctx.ui.device === 'touch' && innerWidth < 600 ? 116 : 156);
    this.placeInPit();
    this.spreadCpus();
    this.timing = { started: false, lapStart: 0, dist: 0, s: 0, valid: true, last: null, wrongFor: 0, offFor: 0, rec: null };
    this.paintTower();
    this.paintSketch();
    this.placeTrophies();
    this.setQuality(this.tier);
    this.z.audit = -1;
  }

  private rnd(): number {
    return this.session ? this.session.rnd() : this.freeRnd();
  }

  /** Your kart back in its pit box, facing out. */
  placeInPit(): void {
    const k = this.cs.paddock.kart;
    const v = this.kart;
    v.reset();
    v.pos.set(k.x, 0, k.z);
    v.yaw = k.yaw;
    v.frozen = false;
    v.sync();
    this.you.grab = null;
    const n = this.c.path.nearest(k.x, k.z);
    this.you.hint = n.index;
    this.you.s = n.s;
    this.timing.s = n.s;
    this.timing.started = false;
  }

  /** Computer drivers cruising round the lap (free drive). */
  private spreadCpus(): void {
    const L = this.c.length;
    this.cpus.forEach((r, i) => {
      r.kart.root.visible = true;
      const s = L * (0.1 + i * 0.125);
      const q = this.c.at(s, r.def!.lane);
      this.placeKart(r, q.x, q.z, q.heading, s);
      r.finishedAt = null;
      r.item = null;
      r.roulette = 0;
      r.mood = 'drive';
    });
  }

  private placeKart(r: Racer, x: number, z: number, yaw: number, s: number): void {
    const v = r.kart;
    v.reset();
    v.pos.set(x, this.c.profile.h(s), z);
    v.yaw = yaw;
    v.sync();
    r.s = this.c.wrap(s);
    r.hint = this.c.idx(s);
    r.grab = null;
    r.offFor = 0;
    r.stuckFor = 0;
    r.ai.off = r.def?.lane ?? 0;
    r.ai.drifting = false;
  }

  private nameTag(name: string, color: string): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 72;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(29,24,48,0.88)';
    g.beginPath();
    g.roundRect(4, 4, 248, 64, 30);
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = color;
    g.stroke();
    g.fillStyle = '#fffaf0';
    g.font = '40px "Lilita One", system-ui';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name, 128, 38);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
    s.scale.set(1.15, 0.32, 1);
    s.position.set(0, 2.35, 0);
    return s;
  }

  private buildGrabber(): THREE.Group {
    const g = new THREE.Group();
    const s = new Shape();
    s.at(cyl(0.08, 0.08, 14, 8), '#c9c6d6', 0, 7.5, 0);
    s.at(rbox(1.0, 0.5, 1.0, 0.15), '#e8574a', 0, 0.6, 0);
    s.at(ball(0.3, 10, 8), '#ffd24a', 0, 0.95, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      s.at(rbox(0.16, 1.1, 0.16, 0.06), '#c9c6d6', Math.cos(a) * 0.55, 0.0, Math.sin(a) * 0.55, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
      s.at(ball(0.12, 8, 6), '#ffd24a', Math.cos(a) * 0.72, -0.55, Math.sin(a) * 0.72);
    }
    g.add(s.mesh('plastic', { cast: false }));
    g.visible = false;
    return g;
  }

  // -------------------------------------------------------------------------
  // Boards, the tower, the sketch and the trophies

  async loadBoards(): Promise<void> {
    const r = await api.kartBoards(this.ctx.roomId, this.ctx.area.id, this.ctx.browserId);
    if (this.disposed || !r.ok) return;
    this.boards = r.data.boards;
    for (const [id, b] of Object.entries(this.boards)) {
      if (b.best && (!this.save.d.bestLap[id] || b.best < this.save.d.bestLap[id])) this.save.d.bestLap[id] = b.best;
      if (b.best && (!this.save.d.trialLap[id] || b.best < this.save.d.trialLap[id])) this.save.d.trialLap[id] = b.best;
    }
    this.save.save();
    this.paintTower();
  }

  private paintTower(): void {
    if (!this.cs) return;
    const mat = this.cs.paddock.tower.material as THREE.MeshStandardMaterial;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 890;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1d1830';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#ffd24a';
    g.font = '60px "Lilita One", system-ui';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(this.c.name, 256, 62, 480);
    g.fillStyle = '#c9c2dc';
    g.font = '600 30px system-ui';
    g.fillText('Best time trial laps', 256, 118);
    const rows = this.boards[this.c.id]?.board ?? [];
    g.textAlign = 'left';
    for (let i = 0; i < 10; i++) {
      const y = 180 + i * 64;
      // Split-flap tiles.
      g.fillStyle = i % 2 ? '#2b2546' : '#251f40';
      g.fillRect(16, y - 28, 480, 56);
      g.fillStyle = '#1d1830';
      g.fillRect(16, y - 1, 480, 2);
      const r = rows[i];
      g.fillStyle = r?.you ? '#ffd24a' : '#fffaf0';
      g.font = '600 32px system-ui';
      g.fillText(`${i + 1}`, 30, y + 2);
      if (r) {
        g.fillText(r.name.slice(0, 12), 86, y + 2, 250);
        g.textAlign = 'right';
        g.fillText(formatLap(r.value), 486, y + 2);
        g.textAlign = 'left';
      } else if (i === 0) {
        g.fillStyle = '#8f88a8';
        g.fillText('Set the first lap!', 86, y + 2);
      }
    }
    const best = this.save.d.bestLap[this.c.id];
    g.fillStyle = '#7ef0ff';
    g.textAlign = 'center';
    g.font = '600 30px system-ui';
    g.fillText(best ? `Your best ${formatLap(best)}` : 'Time trial puts you on this board', 256, 850);
    mat.map?.dispose();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat.map = tex;
    mat.emissiveMap = tex;
    mat.needsUpdate = true;
  }

  private async loadSketch(): Promise<void> {
    const pageId = this.ctx.area.pages?.[0];
    if (!pageId) return;
    const r = await api.pages(this.ctx.roomId);
    if (this.disposed || !r.ok) return;
    const page = r.data.pages.find((p) => p.id === pageId);
    if (!page) return;
    this.sketchStrokes = page.sketch;
    this.paintSketch();
  }

  private paintSketch(): void {
    if (!this.cs) return;
    const mat = this.cs.paddock.sketch.material as THREE.MeshStandardMaterial;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 376;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fffaf0';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = 'rgba(74,163,223,0.25)';
    g.lineWidth = 2;
    for (let y = 30; y < c.height; y += 28) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(c.width, y);
      g.stroke();
    }
    const strokes = this.sketchStrokes;
    if (strokes?.length) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const st of strokes)
        for (let i = 0; i + 1 < st.p.length; i += 2) {
          minX = Math.min(minX, st.p[i]);
          maxX = Math.max(maxX, st.p[i]);
          minY = Math.min(minY, st.p[i + 1]);
          maxY = Math.max(maxY, st.p[i + 1]);
        }
      const k = Math.min((c.width - 60) / Math.max(1, maxX - minX), (c.height - 60) / Math.max(1, maxY - minY));
      const cols = ['#1d1830', '#e8574a', '#4aa3df', '#3fb68b', '#ffd24a', '#8a6bd1'];
      g.lineCap = g.lineJoin = 'round';
      for (const st of strokes) {
        g.strokeStyle = cols[st.c % cols.length] ?? '#1d1830';
        g.lineWidth = Math.max(2, st.w * 3 * k);
        g.beginPath();
        for (let i = 0; i + 1 < st.p.length; i += 2) {
          const x = 30 + (st.p[i] - minX) * k;
          const y = 30 + (st.p[i + 1] - minY) * k;
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.stroke();
      }
    } else {
      g.fillStyle = '#1d1830';
      g.font = '40px "Lilita One", system-ui';
      g.textAlign = 'center';
      g.fillText('Where it all began', 256, 188);
    }
    mat.map?.dispose();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat.map = tex;
    mat.needsUpdate = true;
  }

  /** Your trophies as little 3D cups in the cabinet. */
  placeTrophies(): void {
    const cab = this.cs.paddock.cabinet;
    for (const t of this.trophyMeshes) cab.remove(t);
    this.trophyMeshes = [];
    const order: ClassId[] = ['windup', 'battery', 'rocket'];
    order.forEach((cls, i) => {
      const place = this.save.d.cups[cls];
      if (!place || place > 3) return;
      const col = place === 1 ? '#f5c542' : place === 2 ? '#d6dbe6' : '#d9905a';
      const s = new Shape();
      s.at(cyl(0.32, 0.4, 0.18, 14), '#3a3448', 0, 0.09, 0);
      s.at(cyl(0.08, 0.12, 0.42, 10), col, 0, 0.39, 0);
      s.at(cyl(0.42, 0.16, 0.6, 16), col, 0, 0.9, 0);
      for (const sx of [-1, 1]) s.at(new THREE.TorusGeometry(0.16, 0.04, 6, 12, Math.PI), col, sx * 0.42, 0.95, 0, 0, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
      const m = s.mesh('gloss');
      m.position.set(-1.9 + i * 1.9, 2.55 + 0.04, -0.1);
      cab.add(m);
      this.trophyMeshes.push(m);
    });
    // Medals on the lower shelf.
    CUP.forEach((id, i) => {
      const med = this.save.d.medals[id] ?? 0;
      if (!med) return;
      const col = ['#d9905a', '#d6dbe6', '#f5c542', '#7ef0ff'][med - 1];
      const s = new Shape();
      s.at(cyl(0.3, 0.3, 0.06, 16), col, 0, 0.35, 0, Math.PI / 2, 0, 0);
      s.at(rbox(0.12, 0.3, 0.02, 0.01), '#e8574a', 0, 0.62, 0);
      const m = s.mesh('gloss');
      m.position.set(-2.2 + i * 1.45, 1.45 + 0.04, -0.2);
      cab.add(m);
      this.trophyMeshes.push(m);
    });
  }

  // -------------------------------------------------------------------------
  // Item and hit events

  private itemEvents() {
    return {
      pickup: (r: Racer) => {
        const p = r.kart.pos;
        this.confetti.burst({ at: { x: p.x, y: p.y + 1.2, z: p.z }, count: 24, speed: [2, 5], color: [0xffd24a, 0xfffaf0], life: [0.4, 0.8], size: [0.12, 0.2], gravity: 6 });
        if (r.you) kartSfx.capsule();
      },
      landed: (r: Racer, id: ItemId) => {
        if (r.you) {
          kartSfx.itemLand();
          this.holdItemFor = 0;
          void id;
        }
      },
      used: (r: Racer, id: ItemId) => {
        const p = r.kart.pos;
        if (r.you) {
          this.save.d.stats.items++;
          this.save.d.learned.item = true;
        }
        if (id === 'spring' || id === 'triple') {
          if (this.near(p)) kartSfx.spring();
          this.glow.burst({ at: { x: p.x, y: p.y + 0.5, z: p.z }, count: 18, shape: 'ring', speed: [3, 5], color: [0xffd24a, 0xff9d2e], life: [0.25, 0.45], size: [0.3, 0.5] });
          if (r.you) this.fovKick = Math.max(this.fovKick, 6);
        } else if (id === 'ball') {
          if (this.near(p)) kartSfx.ballThrow();
        } else if (id === 'marbles') {
          if (this.near(p)) kartSfx.marbles();
        } else if (id === 'bubble') {
          if (this.near(p)) kartSfx.bubble();
        } else if (id === 'plane') {
          if (this.near(p)) kartSfx.plane();
        }
        if (!r.you && r.def && this.near(p, 25)) kartSfx.voice(r.def.kind, 'happy');
      },
      hit: (t: Racer, by: Racer | null, kind: 'spin' | 'marbles', blocked: boolean, at: THREE.Vector3) => {
        if (blocked) {
          kartSfx.pop();
          this.sparks.burst({ at, count: 30, speed: [2, 5], color: [0xbff4ff, 0xff8fd1], life: [0.3, 0.6], size: [0.1, 0.2] });
          if (t.you) this.say('Blocked!', 'good');
          return;
        }
        t.hitsTaken++;
        if (by) by.hitsDealt++;
        this.sparks.burst({ at: { x: at.x, y: at.y + 0.6, z: at.z }, count: 26, speed: [2, 6], color: [0xffd24a, 0xffffff], life: [0.3, 0.6], size: [0.12, 0.22], gravity: 6 });
        if (t.driver) t.mood = 'dizzy';
        t.moodUntil = this.clock + 1.2;
        if (t.you) {
          kartSfx.spinout();
          this.ctx.shake(0.25);
          this.hud.flash('#ffffff', 220, 0.3);
          this.say(kind === 'marbles' ? 'Marbles!' : 'Bonk!', 'bad');
          navigator.vibrate?.(60);
        } else if (by?.you) {
          kartSfx.hitOther();
          this.save.d.stats.hits++;
          this.say(`Hit ${t.name}!`, 'good');
          if (t.def) kartSfx.voice(t.def.kind, 'hurt');
        } else if (t.def && this.near(t.kart.pos, 20)) kartSfx.voice(t.def.kind, 'hurt');
      },
      bounce: (at: THREE.Vector3, speed: number) => {
        if (this.near(at, 30)) kartSfx.boing(speed);
        this.sparks.burst({ at, count: 8, speed: [1, 3], color: 0xfffaf0, life: [0.2, 0.4], size: [0.08, 0.14] });
      },
    };
  }

  private near(p: { x: number; z: number }, d = 40): boolean {
    return Math.hypot(p.x - this.kart.pos.x, p.z - this.kart.pos.z) < d;
  }

  /** A short word in the HUD's sub line. */
  say(text: string, tone: 'good' | 'bad' | 'gold' = 'good'): void {
    this.flash = { text, until: this.clock + 1.5, tone };
    if (tone !== 'bad') this.hud.judge(text, tone === 'gold' ? '#ffd24a' : '#6ff0b0');
    else this.hud.judge(text, '#ff8a7a');
  }

  // -------------------------------------------------------------------------
  // Sessions

  /** Starts a race, cup, time trial or the warm-up lap. */
  async startSession(opts: SessionOpts, cup: Cup | null = null): Promise<void> {
    if (this.loading || this.disposed) return;
    this.loading = true;
    this.ctx.ui.closeAll();
    // A curtain while the circuit builds.
    this.hud.flash('#1d1830', 700, 1);
    await new Promise((r) => setTimeout(r, 120));
    if (this.c.id !== opts.circuit) this.load(opts.circuit);
    this.items.reset();
    const seed = Math.floor(Math.random() * 1e9);
    const rival = opts.kind === 'cup' || opts.kind === 'single' ? this.pickRival(opts.cls) : null;
    const laps = opts.kind === 'warmup' ? 1 : this.c.laps;
    this.session = {
      opts,
      state: 'intro',
      t: 0,
      shotT: 0,
      shotLen: this.save.d.stats.races > 0 || opts.kind !== 'cup' ? 3.5 : 7,
      seed,
      rnd: rng(seed),
      laps,
      cup,
      bestLap: null,
      lapTimes: [],
      finalLap: false,
      pressedAt: null,
      early: false,
      resultsOpen: false,
      rival,
      ghost: null,
      order: null,
      doneAt: 0,
    };
    if (opts.kind === 'warmup' || opts.kind === 'trial') this.session.shotLen = 0;
    const cls = CLASSES[opts.cls];
    this.items.enabled = opts.items && (opts.kind === 'cup' || opts.kind === 'single' || opts.kind === 'warmup');
    this.items.show(this.items.enabled);
    // Karts take this class's numbers.
    const trial = opts.kind === 'trial';
    this.kart.applyClass(trial ? CLASSES.battery : cls);
    for (const r of this.cpus) r.kart.applyClass(cls);
    // The grid: you start at the back; in the cup the grid follows the standings in reverse.
    const field = this.active();
    for (const r of this.cpus) r.kart.root.visible = field.includes(r);
    let order = field.filter((r) => !r.you);
    if (cup && cup.index > 0) order = cupOrder(order.map((r) => ({ id: r.id, points: cup.points[r.id] ?? 0, last: cup.last[r.id] ?? 9, r }))).map((x) => x.r).reverse();
    else order = order.sort((a, b) => (a.def!.skill - b.def!.skill) * -1);
    const slots = [...order, this.you];
    slots.forEach((r, i) => {
      const g = trial ? this.trialStart() : opts.kind === 'warmup' ? (r.you ? this.c.grid(1) : this.c.grid(0)) : this.c.grid(i);
      this.placeKart(r, g.x, g.z, g.yaw, g.s);
      r.kart.frozen = true;
      r.raced = 0;
      r.toLine = this.c.length - g.s;
      r.finishedAt = null;
      r.item = null;
      r.itemCount = 0;
      r.roulette = 0;
      r.mood = 'drive';
      r.draft = 0;
      r.place = i + 1;
      r.hitsDealt = 0;
      r.hitsTaken = 0;
      // Each driver's wander comes from the race's seed, so a seed replays the same race.
      r.ai.phase = this.session!.rnd() * 10;
    });
    this.ctx.teleport(this.kart.pos.x, this.kart.pos.z, this.kart.yaw);
    this.kart.frozen = true;
    this.timing = { started: false, lapStart: 0, dist: 0, s: this.you.s, valid: true, last: this.timing.last, wrongFor: 0, offFor: 0, rec: null };
    for (const m of this.cs.startLights) this.setLight(m, null);
    // Time trial: a ghost to race.
    this.ghostKart.root.visible = false;
    if (trial) {
      let g: Ghost | null = null;
      let name = 'Your best';
      if (opts.ghostRank) {
        const r = await api.kartGhost(this.ctx.roomId, this.ctx.area.id, opts.circuit, opts.ghostRank);
        if (r.ok) {
          g = r.data.ghost;
          name = r.data.name;
        } else this.ctx.ui.toast('That ghost is not available right now', 'bad');
      }
      g ??= this.save.ghost(opts.circuit);
      if (g && g.c === opts.circuit) {
        this.session.ghost = { pts: decodeGhost(g), name, ms: g.ms };
        this.ghostKart.setup(g.body, '#7ef0ff', CLASSES.battery);
      }
    }
    this.race.mode(trial || opts.kind === 'warmup' ? 'solo' : 'race');
    this.race.show(true);
    this.hud.letterbox(this.session.shotLen > 0);
    music.play(SONGS[opts.circuit], { fadeIn: 1.5 });
    const what = opts.kind === 'cup' ? `Toybox Cup, race ${(cup?.index ?? 0) + 1} of ${cup?.circuits.length ?? 4}` : opts.kind === 'trial' ? 'Time trial' : opts.kind === 'warmup' ? 'Warm-up lap with Bolt' : `${CLASSES[opts.cls].name} class`;
    this.hud.title(this.c.name, `${what} · ${laps} ${laps === 1 ? 'lap' : 'laps'}`, 2600);
    kartSfx.fanfare(false);
    this.loading = false;
    if (this.session.shotLen <= 0) this.toGrid(true);
  }

  /** Where a time trial starts: in the middle of the road, a run-up behind the line. */
  private trialStart(): { x: number; z: number; yaw: number; s: number } {
    const s = this.c.length - 30;
    const q = this.c.at(s, 0);
    return { x: q.x, z: q.z, yaw: q.heading, s };
  }

  private pickRival(cls: ClassId): string | null {
    if (cls === 'rocket') return 'barnaby';
    const r = this.save.d.rival;
    return r && driverById(r) ? r : 'bolt';
  }

  private toGrid(skipPan = false): void {
    const s = this.session;
    if (!s) return;
    s.state = 'grid';
    s.shotT = 0;
    s.shotLen = skipPan || s.opts.kind === 'trial' || s.opts.kind === 'warmup' ? 0 : 3;
    if (s.shotLen > 0) {
      for (const r of this.cpus) if (r.kart.root.visible) {
        r.mood = 'wave';
        r.moodUntil = this.clock + 3;
      }
      if (s.rival) {
        const rv = driverById(s.rival)!;
        this.hud.banner(`Rival: ${rv.name}`, { sub: rv.tag, ms: 2400, size: 'm', color: rv.kart });
      }
      kartSfx.horn('robot');
    } else this.toCountdown();
  }

  private toCountdown(): void {
    const s = this.session;
    if (!s) return;
    s.state = 'countdown';
    // Cut straight to the follow camera behind your kart.
    this.shot = null;
    this.shotBlend = 0;
    this.hud.letterbox(false);
    this.ctx.snapCamera(this.kart.yaw);
    s.pressedAt = null;
    s.early = false;
    void this.hud
      .countdown(3, {
        tick: (n) => {
          if (n > 0) {
            this.setLight(this.cs.startLights[3 - n], '#ff3b30');
            if (n === 1) s.pressedAt = null;
          } else for (const m of this.cs.startLights) this.setLight(m, '#3fe07a');
        },
      })
      .then(() => this.go());
  }

  private go(): void {
    const s = this.session;
    if (!s || s.state !== 'countdown') return;
    s.state = 'running';
    s.t = 0;
    for (const r of this.active()) r.kart.frozen = false;
    // Some drivers nail the start too.
    for (const r of this.cpus) if (r.kart.root.visible && s.rnd() < r.def!.daring * 0.6) r.kart.boost = 0.7;
    const rocket = s.pressedAt !== null && !s.early;
    if (rocket) {
      this.kart.boost = BOOSTS.rocket;
      kartSfx.rocket();
      this.say('Rocket start!', 'gold');
      this.fovKick = Math.max(this.fovKick, 6);
      this.save.d.learned.rocket = true;
      const p = this.kart.pos;
      this.glow.burst({ at: { x: p.x, y: p.y + 0.4, z: p.z }, count: 40, shape: 'ring', speed: [3, 6], color: [0xffb02e, 0xff5a2a], life: [0.3, 0.6], size: [0.3, 0.6] });
    } else if (s.early) {
      this.kart.speed = 0;
      this.kart.spinT = 0.5;
      kartSfx.sputter();
      this.say('Too early', 'bad');
    }
    if (s.opts.kind !== 'trial') {
      // Lap one starts at the green light; the first crossing just counts it.
      this.timing.started = true;
      this.timing.lapStart = this.clock;
      this.timing.dist = -this.you.toLine;
      this.timing.valid = true;
    }
    setTimeout(() => {
      if (!this.disposed && this.cs) for (const m of this.cs.startLights) this.setLight(m, null);
    }, 2500);
  }

  private setLight(m: THREE.MeshStandardMaterial | undefined, color: string | null): void {
    if (!m) return;
    m.color.set(color ?? '#3a3448');
    m.emissive.set(color ?? '#000000');
    m.emissiveIntensity = color ? 2.4 : 0;
  }

  /** Ends the session and puts you back in the paddock. */
  endSession(toPit = true): void {
    const s = this.session;
    this.session = null;
    this.hud.letterbox(false);
    this.race.mode('free');
    this.ghostKart.root.visible = false;
    this.items.enabled = false;
    this.items.show(false);
    this.items.reset();
    this.podiumAt = null;
    this.shot = null;
    if (this.trophy) {
      this.scene.remove(this.trophy);
      disposeTree(this.trophy);
      this.trophy = null;
    }
    this.fireworksAt = 0;
    for (const r of this.racers) {
      r.kart.frozen = false;
      r.kart.applyClass(CLASSES.battery);
      r.item = null;
      r.roulette = 0;
    }
    if (this.cs) for (const m of this.cs.startLights) this.setLight(m, null);
    this.spreadCpus();
    if (toPit) {
      this.placeInPit();
      if (this.kart.ridden) this.ctx.teleport(this.kart.pos.x, this.kart.pos.z, this.kart.yaw);
    }
    void s;
    music.play(SONGS.paddock, { fadeIn: 1.5 });
  }

  // -------------------------------------------------------------------------
  // SpaceView hooks

  rideables(): RaceKart[] {
    return [this.kart];
  }

  extraColliders(): Collider[] {
    const out: Collider[] = [];
    for (const r of this.cpus) if (r.kart.root.visible && !r.grab) out.push(circle(r.kart.pos.x, r.kart.pos.z, r.kart.t.radius * 0.9, r.kart.pos.y + 1.2, 0.7, false));
    for (const hz of this.cs.parts.hazards ?? []) out.push(...hz.colliders());
    // The boom gate keeps walkers in the paddock; karts drive through.
    if (!this.kart.ridden) out.push(this.cs.paddock.gateCollider);
    return out;
  }

  actions(player: PlayerState): SpaceAction[] {
    const p = this.cs.paddock;
    const out: SpaceAction[] = [];
    out.push({ x: p.towerAt.x, z: p.towerAt.z, range: 4, label: 'See the lap boards', short: 'Boards', run: () => openBoards(this) });
    out.push({ x: p.cabinetAt.x, z: p.cabinetAt.z, range: 4.2, label: 'Your trophies', short: 'Trophies', run: () => openTrophies(this) });
    out.push({ x: p.sketchAt.x, z: p.sketchAt.z, range: 3.4, label: 'Look at the drawing', short: 'Look', run: () => openSketch(this) });
    void player;
    return out;
  }

  holdsTime(): boolean {
    const s = this.session;
    return !!s && s.state !== 'done';
  }


  /** Lost: off the road too long, stuck, or wrong way for ages. */
  private lost(): boolean {
    if (this.you.grab) return false;
    if (this.cs.paddock.inside(this.kart.pos.x, this.kart.pos.z)) return false;
    return this.timing.offFor > 2.2 || this.stuckFor > 1.5;
  }

  rideAction(player: PlayerState): { label: string; short: string; run: () => void } | null {
    if (player.riding !== this.kart) return null;
    const s = this.session;
    const k = this.kart;
    const remote = k.assists.remote;
    if (this.you.grab) return { label: '', short: '', run: () => {} };
    if (s && s.state !== 'running') {
      if (s.state === 'done' || s.state === 'podium') return { label: '', short: '', run: () => {} };
      return { label: '', short: '', run: () => {} };
    }
    if (this.lost()) return { label: 'Back on track', short: 'Reset', run: () => this.callGrabber(this.you) };
    // In the air the button is a trick on the remote.
    if (remote && k.air) return { label: 'Trick', short: 'Trick', run: () => this.doTrick() };
    if (!s && Math.abs(k.speed) < 1.5) return { label: 'Race menu', short: 'Races', run: () => openRaceMenu(this) };
    if (remote) {
      const drifting = k.remoteDrift || k.drift !== 0;
      return { label: drifting ? 'Boost' : 'Drift', short: drifting ? 'Boost' : 'Drift', run: () => this.remoteDrift() };
    }
    if (this.you.item && this.you.roulette <= 0) {
      const name = ITEM_NAMES[this.you.item];
      return { label: `Use ${name.toLowerCase()}`, short: name.split(' ').pop()!, run: () => this.useItem(this.you) };
    }
    return { label: '', short: '', run: () => {} };
  }

  rideBack(player: PlayerState): boolean {
    if (player.riding !== this.kart) return false;
    const s = this.session;
    if (s) {
      if (s.state === 'done' || s.state === 'podium') return true;
      void confirmLeave(this, 'Leave the race?', 'Your race so far will not count.').then((ok) => {
        if (ok && this.session === s) this.endSession(true);
      });
      return true;
    }
    if (this.cs.paddock.inside(this.kart.pos.x, this.kart.pos.z)) return false;
    void confirmLeave(this, 'Back to the paddock?', 'You can get out of your kart there.').then((ok) => {
      if (ok && !this.session) {
        this.placeInPit();
        this.ctx.teleport(this.kart.pos.x, this.kart.pos.z, this.kart.yaw);
      }
    });
    return true;
  }

  pauseItems(): { label: string; run: () => void }[] {
    const s = this.session;
    if (s && s.state !== 'done' && s.state !== 'podium') {
      const what = s.opts.kind === 'cup' ? 'Leave the cup' : s.opts.kind === 'trial' ? 'Leave the time trial' : s.opts.kind === 'warmup' ? 'Leave the warm-up' : 'Leave the race';
      return [
        { label: what, run: () => this.session === s && this.endSession(true) },
        ...(s.opts.kind !== 'warmup' ? [{ label: 'Restart', run: () => this.session === s && void this.startSession(s.opts, s.cup ? { ...s.cup } : null) }] : []),
      ];
    }
    if (!s && this.kart.ridden && !this.cs.paddock.inside(this.kart.pos.x, this.kart.pos.z))
      return [
        {
          label: 'Back to the paddock',
          run: () => {
            this.placeInPit();
            this.ctx.teleport(this.kart.pos.x, this.kart.pos.z, this.kart.yaw);
          },
        },
      ];
    return [];
  }

  /** Gets you out of the kart in the pit box (from the race menu). */
  getOut(): void {
    this.ctx.ui.closeAll();
    // Back on a controller dismounts; everywhere else the menu asks the game through a fake Back.
    this.wantOut = true;
  }

  wantOut = false;

  private remoteDrift(): void {
    const r = this.kart.toggleRemoteDrift();
    if (r === 'start') kartSfx.tick();
  }

  private doTrick(): void {
    if (this.kart.trick()) {
      kartSfx.trick();
      this.save.d.learned.trick = true;
    }
  }

  useItem(r: Racer): void {
    this.items.use(r, this.active());
  }

  cameraShot(dt: number): CameraShot | null {
    if (this.debugCam) return { position: this.debugCam.pos, target: this.debugCam.target, fov: this.debugCam.fov, blend: 1 };
    const s = this.session;
    let shot: Shot | null = null;
    let lock = false;
    let skip: (() => void) | undefined;
    if (s && s.state === 'intro' && s.shotLen > 0) {
      s.shotT += dt;
      shot = flyover(this.c, s.shotT, s.shotLen, this.cs.parts.hero ?? null);
      lock = true;
      skip = () => this.toGrid(true);
      if (s.shotT >= s.shotLen) this.toGrid();
    } else if (s && s.state === 'intro') {
      this.toGrid(true);
    } else if (s && s.state === 'grid' && s.shotLen > 0) {
      s.shotT += dt;
      shot = gridPan(this.c, s.shotT, s.shotLen, this.active().length);
      lock = true;
      skip = () => this.toCountdown();
      if (s.shotT >= s.shotLen) this.toCountdown();
    } else if (s && s.state === 'done' && s.shotT < 3.2) {
      s.shotT += dt;
      const p = this.kart.pos;
      shot = orbit(new THREE.Vector3(p.x, p.y + 0.6, p.z), s.shotT, 6, 2.4, this.kart.yaw + Math.PI, 0.5);
    } else if (s && s.state === 'podium' && this.podiumAt) {
      s.shotT += dt;
      shot = orbit(this.podiumAt.center, s.shotT, 11, 3.2, this.cs.paddock.podium.yaw, 0.3);
      lock = true;
    } else if (this.you.grab) {
      const g = this.you.grab;
      shot = { pos: new THREE.Vector3(g.to.x - Math.sin(g.to.yaw) * 9, g.to.y + 6, g.to.z - Math.cos(g.to.yaw) * 9), target: this.kart.pos.clone(), fov: 55 };
    }
    // Ease shots in and out.
    this.shotBlend += ((shot ? 1 : 0) - this.shotBlend) * damp(shot ? 6 : 4, dt);
    if (shot) this.shot = shot;
    if (!this.shot || this.shotBlend < 0.01) {
      this.shot = null;
      return null;
    }
    return { position: this.shot.pos, target: this.shot.target, fov: this.shot.fov, blend: shot && lock ? 1 : this.shotBlend, lockPlayer: lock, skip, skipLabel: 'Skip' };
  }

  // -------------------------------------------------------------------------
  // The fixed step

  step(h: number, player: PlayerState): void {
    if (this.loading) return;
    this.clock += h;
    this.hud.update(h);
    const s = this.session;
    const riding = player.riding === this.kart;
    if (riding && !this.wasRiding) this.onMount();
    if (!riding && this.wasRiding) this.onDismount();
    this.wasRiding = riding;
    if (s && !riding && s.state !== 'podium') this.endSession(false);
    if (s) s.t += s.state === 'running' || s.state === 'done' ? h : 0;
    this.kart.player = true;

    // Countdown: rocket start is gas held from the last red light.
    if (s && s.state === 'countdown') {
      const gas = this.kart.throttleIn > 0.5;
      const lastRed = this.cs.startLights[2].emissiveIntensity > 0;
      if (gas && !lastRed) s.early = true;
      if (!gas) {
        s.early = false;
        s.pressedAt = null;
      } else if (lastRed) s.pressedAt ??= this.clock;
    }

    const field = this.active();
    const racing = !!s && (s.state === 'running' || s.state === 'done');
    // Buttons the game leaves to us while riding: tricks in the air, and Up for items on the remote layout.
    if (riding && !this.ctx.ui.isOpen) {
      const input = this.ctx.input;
      const dirs = input.takeDirs();
      if (this.kart.assists.remote && s?.state === 'running' && dirs.some((d) => d.dir === 'up') && this.you.item && this.you.roulette <= 0) this.useItem(this.you);
      const trickPress = input.take('kick') || input.take('jump');
      if (trickPress && this.kart.air) this.doTrick();
    }
    // ---- Where everyone is; your kart was already driven by the game this step.
    this.track1(this.you, h, riding);
    const aiw = this.aiWorld(racing);
    for (const r of this.cpus) {
      if (!field.includes(r)) continue;
      if (s && s.opts.kind === 'warmup') this.warmupPace(r, aiw);
      else driveCpu(r, aiw, h, this.colliders.concat(this.cs.parts.hazards?.flatMap((z) => z.colliders()) ?? []));
      this.track1(r, h, true);
    }
    if (riding) this.timeLap(h);
    this.stuckFor = riding && this.kart.throttleIn > 0.5 && Math.abs(this.kart.speed) < 0.6 && !this.kart.frozen && !this.you.grab ? this.stuckFor + h : 0;

    // ---- Boost pads and slipstreams.
    this.cs.padMat.map!.offset.y = (this.clock * 1.6) % 1;
    for (const r of field) {
      const k = r.kart;
      if (!k.onRoad || k.frozen || k.air || r.grab) continue;
      for (const pd of this.c.pads) {
        const len = pd.len ?? 2.5;
        if (Math.abs(this.c.path.delta(pd.s, r.s)) < len && Math.abs(r.off - pd.off) < 1.9 && k.boost < PAD_BOOST - 0.2) {
          k.boost = PAD_BOOST;
          if (r.you && riding) {
            sfx.boost();
            this.say('Boost!');
            this.fovKick = Math.max(this.fovKick, 6);
          }
        }
      }
      const tucked = k.speed > 11 && Math.abs(this.c.path.turnAhead(r.s, 15)) < 0.25 && field.some((o) => o !== r && this.c.path.delta(r.s, o.s) > 2 && this.c.path.delta(r.s, o.s) < 9 && Math.abs(o.off - r.off) < 1.3);
      r.draft = r.draft < 0 ? r.draft + h : tucked ? r.draft + h : Math.max(0, r.draft - h * 2);
      if (r.you && tucked && riding && Math.random() < 0.3) {
        const p = k.pos;
        this.glow.burst({ at: { x: p.x + (Math.random() - 0.5) * 2, y: p.y + 0.8, z: p.z + (Math.random() - 0.5) * 2 }, count: 1, speed: [0, 0.2], color: 0xbfe3ff, life: [0.2, 0.3], size: [0.4, 0.6], alpha: 0.4, inherit: { x: Math.sin(k.yaw) * -4, y: 0, z: Math.cos(k.yaw) * -4 } });
      }
      if (r.draft >= DRAFT_TIME) {
        r.draft = -4;
        k.boost = Math.max(k.boost, BOOSTS.draft);
        if (r.you && riding) {
          sfx.boost();
          this.say('Slipstream!');
          this.fovKick = Math.max(this.fovKick, 5);
        }
      }
    }

    // ---- Items, hazards, places.
    this.items.update(h, field, racing && s!.state === 'running');
    for (const hz of this.cs.parts.hazards ?? []) {
      for (const r of field) {
        if (r.grab || r.kart.frozen) continue;
        const hit = hz.hits(r.kart.pos.x, r.kart.pos.z, r.kart.pos.y);
        if (hit && r.kart.immune <= 0) {
          r.kart.hit(hit === 'tail' ? 'tail' : 'spin');
          if (hit === 'tail') {
            // The tail sweeps you sideways.
            const f = this.c.frame(r.s);
            r.kart.pos.x += f.nx * 1.4;
            r.kart.pos.z += f.nz * 1.4;
          }
          this.itemEvents().hit(r, null, 'spin', false, r.kart.pos.clone());
        }
      }
    }
    if (s) this.updatePlaces(field);
    if (racing) this.raceLogic(field, h);
    this.stepGrabs(field, h);

    // ---- Ghosts: record your lap, play back the one you race.
    if (this.timing.rec && this.timing.started && riding) this.timing.rec.step(h, this.kart.pos.x, this.kart.pos.z);
    if (s?.ghost && s.opts.kind === 'trial' && this.timing.started) {
      const t = this.clock - this.timing.lapStart;
      const g = s.ghost;
      if (t * 1000 <= g.ms + 400) {
        const q = ghostAt(g.pts, t);
        const n = this.c.path.nearest(q.x, q.z, this.c.idx(this.timing.s), 30);
        const v = this.ghostKart;
        v.pos.set(q.x, this.c.profile.ground(n.s, n.offset), q.z);
        v.yaw = q.yaw;
        v.sync();
        v.root.visible = true;
      } else this.ghostKart.root.visible = false;
    }

    // ---- Effects bookkeeping.
    if (this.kart.turbo) {
      if (riding) {
        sfx.boost();
        this.fovKick = Math.max(this.fovKick, this.kart.turbo === 2 ? 8 : 4);
        this.save.d.learned.turbo = true;
        this.save.d.stats.turbos++;
      }
      this.kart.turbo = 0;
    }
    for (const r of this.cpus) r.kart.turbo = 0;
    const stage = this.kart.driftStage;
    if (riding && stage > this.lastStage) sfx.driftSpark(stage);
    if (riding && this.kart.drift && !this.save.d.learned.drift) {
      this.save.d.learned.drift = true;
      this.save.d.stats.drifts++;
    }
    this.lastStage = stage;
    if (this.kart.bumped) {
      if (riding) {
        kartSfx.wall(Math.min(1, this.kart.bumped / 14));
        this.ctx.shake(Math.min(0.35, this.kart.bumped / 40));
      }
      const p = this.kart.pos;
      this.sparks.burst({ at: { x: p.x + Math.sin(this.kart.yaw) * 1, y: p.y + 0.4, z: p.z + Math.cos(this.kart.yaw) * 1 }, count: 14, speed: [2, 5], color: [0xffd24a, 0xffffff], life: [0.2, 0.45], size: [0.08, 0.16], gravity: 8 });
      this.kart.bumped = 0;
    }
    this.contextTips(riding, h);
    if (riding && !this.kart.onRoad && !this.kart.air && Math.abs(this.kart.speed) > 3 && !this.cs.paddock.inside(this.kart.pos.x, this.kart.pos.z)) kartSfx.rumble();
    // The crowd cheers as you go past a grandstand at speed.
    if (riding && s?.state === 'running' && this.kart.speed > 10) {
      const stand = this.cs.parts.stand;
      if (stand && Math.hypot(stand.x - this.kart.pos.x, stand.z - this.kart.pos.z) < 22) kartSfx.crowd();
    }
    // Lift the boom gate for karts.
    const arm = this.cs.paddock.gateArm;
    const want = this.kart.ridden ? 1.35 : 0;
    arm.rotation.z += (want - arm.rotation.z) * damp(3, h);
    // The ring round your kart while you are on foot.
    this.cs.paddock.ring.visible = !riding && !s;
    this.save.d.stats.metres += Math.abs(this.kart.speed) * h * (riding ? 1 : 0);
  }

  /** Lap position, height, surface and the Grabber's triggers for one kart. */
  private track1(r: Racer, h: number, active: boolean): void {
    const c = this.c;
    const k = r.kart;
    if (r.grab) return;
    let n = c.path.nearest(k.pos.x, k.pos.z, r.hint, 8);
    if (n.dist > EDGE + 6) n = c.path.nearest(k.pos.x, k.pos.z);
    const ds = c.path.delta(r.s, n.s);
    if (!r.you && Math.abs(ds) < 30) {
      if (this.session && (this.session.state === 'running' || this.session.state === 'done')) r.raced += ds;
      r.laps += ds / c.length;
    }
    r.hint = n.index;
    r.s = n.s;
    r.off = n.offset;
    r.dist = n.dist;
    k.edgeOff = n.offset;
    const onRoad = n.dist < EDGE + 0.3 && !c.profile.gapAt(n.s);
    k.onRoad = onRoad;
    k.grip = onRoad || k.air ? 1 : 0.5;
    // Height: the road, a verge or the floor.
    const inPaddock = this.cs.paddock.inside(k.pos.x, k.pos.z);
    const ground = inPaddock ? 0 : c.profile.ground(n.s, n.offset);
    const gap = !!c.profile.gapAt(n.s) && n.dist < EDGE + 0.4;
    if (this.session?.state === 'podium') return;
    const landed = k.stepHeight(h, ground, gap);
    if (k.air && k.airTime < h * 1.5 && active) {
      // Take-off.
      if (r.you) kartSfx.jump();
      const p = k.pos;
      this.smoke.burst({ at: { x: p.x, y: p.y, z: p.z }, count: 10, speed: [1, 3], color: this.cs.parts.dust ?? 0xd9c3a0, life: [0.4, 0.8], size: [0.5, 0.9], sizeEnd: 2, alpha: 0.5 });
    }
    if (landed > 0) {
      k.landed = 0;
      const p = k.pos;
      this.rings.emit({ x: p.x, y: p.y + 0.06, z: p.z }, { color: 0xfffaf0, radius: 2.4, life: 0.4, alpha: 0.6 });
      this.smoke.burst({ at: { x: p.x, y: p.y + 0.1, z: p.z }, count: 16, shape: 'ring', speed: [2, 4], color: this.cs.parts.dust ?? 0xd9c3a0, life: [0.4, 0.8], size: [0.5, 1], sizeEnd: 2.2, alpha: 0.55 });
      if (r.you) {
        kartSfx.land(Math.min(1, landed / 10));
        this.ctx.shake(Math.min(0.3, landed / 30));
      }
      // A trick landed cleanly is a boost.
      if (k.trickDone && k.trickT <= 0 && !gap) {
        k.boost = Math.max(k.boost, BOOSTS.trick);
        if (r.you) {
          this.say('Trick!', 'gold');
          sfx.boost();
          this.fovKick = Math.max(this.fovKick, 5);
          this.sparks.burst({ at: { x: p.x, y: p.y + 0.8, z: p.z }, count: 30, speed: [2, 5], color: [0xffd24a, 0x7ef0ff], life: [0.3, 0.6], size: [0.12, 0.22] });
        }
      }
      k.trickDone = false;
    }
    // Off the road, in water or a gap: the Grabber comes.
    r.offFor = !onRoad && !inPaddock && active ? r.offFor + h : 0;
    r.offMax = Math.max(r.offMax, r.offFor);
    const inWater = !k.air && !inPaddock && k.pos.y < 0.4 && !!this.cs.parts.water?.(k.pos.x, k.pos.z);
    const fell = !k.air && gap;
    if (active && !r.you) {
      r.stuckFor = k.speed < 1 && !k.frozen ? r.stuckFor + h : 0;
      if (r.offFor > 3 || r.stuckFor > 2.5 || inWater || fell) this.callGrabber(r, inWater ? 'water' : fell ? 'gap' : r.offFor > 3 ? 'off' : 'stuck');
    } else if (r.you && active && (inWater || fell || (r.offFor > 3 && this.session?.state === 'running' && !this.kart.assists.autoGas && false))) this.callGrabber(r);
  }

  /** The Grabber lifts a kart back onto the road, a little behind where it left. */
  callGrabber(r: Racer, why = 'asked'): void {
    if (r.grab) return;
    r.lastGrab = `${why} at ${r.s.toFixed(0)}`;
    const c = this.c;
    let back = r.s - 2;
    // Not inside a gap, and clear of other karts.
    for (let tries = 0; tries < 30 && (c.profile.gapAt(back) || this.active().some((o) => o !== r && Math.abs(c.path.delta(o.s, back)) < 3)); tries++) back -= 2;
    const q = c.at(back, 0);
    const k = r.kart;
    r.grab = { t: 0, from: { x: k.pos.x, y: k.pos.y, z: k.pos.z, yaw: k.yaw }, to: { x: q.x, y: q.y, z: q.z, yaw: q.heading, s: c.wrap(back) } };
    r.grabs++;
    k.speed = 0;
    k.frozen = true;
    k.remoteDrift = false;
    if (r.you) {
      kartSfx.grabber();
      this.say('Grabbed!', 'bad');
    }
    const inWater = this.cs.parts.water?.(k.pos.x, k.pos.z);
    if (inWater) {
      if (this.near(k.pos)) kartSfx.splash();
      this.glow.burst({ at: { x: k.pos.x, y: 0.1, z: k.pos.z }, count: 20, shape: 'up', speed: [2, 5], color: 0xbfefff, life: [0.4, 0.8], size: [0.2, 0.4], gravity: 9 });
    }
  }

  private stepGrabs(field: Racer[], h: number): void {
    let shown: Racer | null = null;
    for (const r of field) {
      const g = r.grab;
      if (!g) continue;
      g.t += h;
      const k = r.kart;
      const T = 1.4;
      const u = Math.min(1, g.t / T);
      const lift = Math.sin(Math.min(1, u * 1.15) * Math.PI) * 3;
      const m = u < 0.3 ? 0 : Math.min(1, (u - 0.3) / 0.55);
      const e = m * m * (3 - 2 * m);
      k.pos.set(g.from.x + (g.to.x - g.from.x) * e, g.from.y + (g.to.y - g.from.y) * e + lift, g.from.z + (g.to.z - g.from.z) * e);
      k.yaw = g.from.yaw + ((((g.to.yaw - g.from.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * e);
      k.sync();
      if (!shown || r.you) shown = r;
      if (g.t >= T) {
        r.grab = null;
        k.frozen = !!this.session && (this.session.state === 'countdown' || this.session.state === 'grid' || this.session.state === 'intro');
        k.reset();
        k.pos.set(g.to.x, g.to.y, g.to.z);
        k.yaw = g.to.yaw;
        k.immune = 1;
        k.sync();
        r.s = g.to.s;
        r.hint = this.c.idx(g.to.s);
        r.offFor = 0;
        r.stuckFor = 0;
        r.ai.off = 0;
        if (r.you) {
          this.timing.offFor = 0;
          this.stuckFor = 0;
          this.timing.s = g.to.s;
          this.ctx.snapCamera(g.to.yaw);
        }
      }
    }
    // The claw shows over whoever is being lifted (yours first).
    const gb = this.grabber;
    if (shown?.grab) {
      const k = shown.kart;
      const u = shown.grab.t / 1.4;
      gb.visible = true;
      const drop = u < 0.15 ? (1 - u / 0.15) * 8 : u > 0.85 ? ((u - 0.85) / 0.15) * 8 : 0;
      gb.position.set(k.pos.x, k.pos.y + 1.6 + drop, k.pos.z);
      gb.rotation.y += h * 2;
    } else gb.visible = false;
  }

  private aiWorld(racing: boolean): AiWorld {
    const s = this.session;
    const field = this.active();
    return {
      c: this.c,
      cls: CLASSES[s?.opts.cls ?? 'battery'],
      racers: field,
      you: this.you,
      rnd: () => this.rnd(),
      racing: (racing && s?.state === 'running') || this.simPace,
      items: this.items.enabled,
      threat: (r) => this.items.threat(r),
      useItem: (r) => this.useItem(r),
      danger: (sv) => this.items.danger(sv) ?? (this.cs.parts.hazards ?? []).map((hz) => hz.danger?.(sv) ?? null).find((x) => x) ?? null,
    };
  }

  /** Bolt leads the warm-up lap and waits for you. */
  private warmupPace(r: Racer, w: AiWorld): void {
    const gap = progress(r) - progress(this.you);
    const k = r.kart;
    const scale = gap > 30 ? 0.45 : gap > 18 ? 0.75 : 1;
    const top = k.t.maxSpeed;
    k.t.maxSpeed = CLASSES.windup.top * scale;
    driveCpu(r, { ...w, racing: false }, 1 / 60, this.colliders);
    k.t.maxSpeed = top;
  }

  private updatePlaces(field: Racer[]): void {
    const sorted = [...field].sort((a, b) => {
      if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt;
      if (a.finishedAt !== null) return -1;
      if (b.finishedAt !== null) return 1;
      return progress(b) - progress(a);
    });
    sorted.forEach((r, i) => (r.place = i + 1));
  }

  /** Laps, the final lap, finishing, and the results. */
  private raceLogic(field: Racer[], h: number): void {
    const s = this.session!;
    const L = this.c.length;
    const total = s.laps * L;
    // Your race progress comes from lap timing (shortcuts do not count).
    const mine = progress(this.you);
    if (!s.finalLap && s.laps > 1 && mine >= total - L && s.state === 'running') {
      s.finalLap = true;
      this.hud.banner('Final lap!', { color: '#ffd24a', size: 'l' });
      kartSfx.bell();
      music.queue('final');
      music.tempo(SONGS[s.opts.circuit].bpm * 1.06);
    }
    for (const r of field) {
      if (r.finishedAt !== null) continue;
      if (progress(r) >= total) {
        r.finishedAt = s.t;
        if (!r.you) {
          r.mood = this.you.finishedAt === null ? 'cheer' : 'sulk';
          r.moodUntil = this.clock + 5;
          if (r.def && this.near(r.kart.pos, 30)) kartSfx.voice(r.def.kind, 'happy');
        }
      }
    }
    if (this.you.finishedAt !== null && s.state === 'running') this.finish();
    // Your place changes.
    if (s.state === 'running' && this.lastPlace && this.you.place !== this.lastPlace && s.opts.kind !== 'trial' && s.opts.kind !== 'warmup') {
      if (this.you.place < this.lastPlace) {
        kartSfx.passUp();
        // Whoever you just passed has something to say about it.
        const passed = field.find((r) => r.place === this.you.place + 1 && r.def);
        if (passed?.def && this.near(passed.kart.pos, 15)) kartSfx.voice(passed.def.kind, 'hey');
      } else kartSfx.passDown();
    }
    this.lastPlace = this.you.place;
    // Results once everyone is in, or a few seconds after you.
    if (s.state === 'done' && !s.resultsOpen && s.shotT >= 3.2) {
      const allIn = field.every((r) => r.finishedAt !== null);
      if (allIn || s.t - s.doneAt > 4) void this.results();
    }
    void h;
  }

  private finish(): void {
    const s = this.session!;
    s.state = 'done';
    s.shotT = 0;
    s.doneAt = s.t;
    const place = this.you.place;
    kartSfx.finish();
    const trial = s.opts.kind === 'trial';
    const warm = s.opts.kind === 'warmup';
    if (warm) this.hud.banner("You're ready!", { color: '#6ff0b0', size: 'xl', ms: 2000 });
    else if (trial) this.hud.banner('Finished!', { color: '#7ef0ff', size: 'xl', ms: 2000 });
    else this.hud.banner(place === 1 ? 'YOU WIN!' : ordinal(place), { color: place === 1 ? '#ffd24a' : place <= 3 ? '#7ef0ff' : '#fffaf0', size: 'xl', ms: 2400, sub: place <= 3 ? 'On the podium!' : undefined });
    kartSfx.fanfare(place === 1 || trial || warm);
    if ((this.c.theme === 'garden' || this.c.theme === 'beach') && this.env.night > 0.5) this.fireworksAt = this.clock + 4;
    music.duck(0.5, 2);
    const p = this.kart.pos;
    // Confetti cannons on both sides of the line.
    const f0 = this.c.frame(0);
    for (const sd of [1, -1]) this.confetti.burst({ at: { x: f0.x + f0.nx * sd * (EDGE + 1.1), y: 6, z: f0.z + f0.nz * sd * (EDGE + 1.1) }, count: 120, shape: 'cone', dir: { x: -f0.nx * sd, y: 1.4, z: -f0.nz * sd }, spread: 0.5, speed: [6, 12], color: [0xffd24a, 0x4aa3df], life: [1.8, 3], size: [0.14, 0.24], gravity: 5, drag: 1.1, sizeEnd: 1 });
    kartSfx.confetti();
    this.confetti.burst({ at: { x: p.x, y: p.y + 4, z: p.z }, count: place <= 3 || trial || warm ? 220 : 80, shape: 'up', speed: [3, 9], color: [0xffd24a, 0xe8574a], life: [2, 3.2], size: [0.14, 0.24], gravity: 5, drag: 1.2, sizeEnd: 1 });
    for (const r of this.cpus)
      if (r.finishedAt === null) {
        r.mood = 'sulk';
        r.moodUntil = this.clock + 4;
      }
    this.kart.frozen = false;
    // Keep driving gently after the line.
    this.kart.speed = Math.min(this.kart.speed, 10);
  }

  // -------------------------------------------------------------------------
  // Lap timing for your kart

  private timeLap(h: number): void {
    const c = this.c;
    const L = c.length;
    const t = this.timing;
    const s = this.session;
    if (this.you.grab) return;
    const sNow = this.you.s;
    const ds = c.path.delta(t.s, sNow);
    if (Math.abs(ds) > 25) {
      // A jump along the lap means a shortcut across the grass.
      if (t.started && t.valid) this.ctx.ui.toast('Shortcut! That lap will not count.', 'bad');
      t.valid = false;
    } else {
      t.dist += ds;
      if (s && (s.state === 'running' || s.state === 'done')) this.you.raced += ds;
    }
    t.wrongFor = ds < -0.01 && Math.abs(this.kart.speed) > 2 ? t.wrongFor + h : Math.max(0, t.wrongFor - h * 2);
    t.offFor = this.you.offFor;
    const crossed = t.s > L - 25 && sNow < 25 && ds > 0;
    t.s = sNow;
    if (!crossed) return;
    if (s && (s.state === 'countdown' || s.state === 'grid' || s.state === 'intro')) return;
    const now = this.clock;
    const id = this.c.id;
    if (t.started && t.valid && t.dist > L * 0.92) {
      const ms = Math.round((now - t.lapStart) * 1000);
      const prevBest = this.save.d.bestLap[id] ?? null;
      t.last = ms;
      this.save.d.stats.laps++;
      if (s) {
        s.lapTimes.push(ms);
        s.bestLap = s.bestLap ? Math.min(s.bestLap, ms) : ms;
      }
      const isBest = !prevBest || ms < prevBest;
      if (isBest) {
        this.save.d.bestLap[id] = ms;
        if (this.c.id === this.circuits[0]) localStorage.setItem(this.bestKey, String(ms));
        this.hud.banner('Best lap!', { color: '#ffd24a', size: 'm', ms: 1600 });
        const p = this.kart.pos;
        this.sparks.burst({ at: { x: p.x, y: p.y + 1, z: p.z }, count: 50, speed: [2, 6], color: [0xffd24a, 0xfffaf0], life: [0.5, 1], size: [0.12, 0.22] });
      }
      sfx.lap(isBest);
      this.lapFlash = { ms, delta: prevBest ? ms - prevBest : null, until: this.clock + 3 };
      // Time trial laps go to the board, checked by the server from the ghost.
      if (s?.opts.kind === 'trial' && t.rec) {
        const g = t.rec.finish(this.kart.pos.x, this.kart.pos.z, ms);
        if (g) this.trialLap(ms, g);
      }
      this.save.save();
    }
    t.started = !s || s.opts.kind !== 'trial' || !s.order;
    t.lapStart = now;
    t.dist = 0;
    t.valid = true;
    if (s?.opts.kind === 'trial') {
      // The trial's laps count from the first crossing.
      if (this.you.raced < 1) this.you.toLine = 0;
      t.rec = new GhostRecorder(id, this.kart.bodyId);
      t.rec.start(this.kart.pos.x, this.kart.pos.z);
      t.started = true;
    }
  }

  /** A time trial lap: medal, ghost, and the board (saved honestly). */
  private trialLap(ms: number, g: Ghost): void {
    const id = this.c.id;
    const def = this.c.def;
    const d = this.save.d;
    if (!d.trialLap[id] || ms < d.trialLap[id]) {
      d.trialLap[id] = ms;
      this.save.setGhost(id, g);
      if (this.session) this.session.ghost = { pts: decodeGhost(g), name: 'Your best', ms };
    }
    if (def) {
      const med = medalFor(ms, def.medals);
      if (med > (d.medals[id] ?? 0)) {
        d.medals[id] = med;
        kartSfx.stamp();
        this.hud.banner(`${MEDAL_NAMES[med]} medal`, { color: ['#d9905a', '#d6dbe6', '#f5c542', '#7ef0ff'][med - 1], size: 'l', ms: 2200 });
        this.grantMedalUnlocks();
        this.placeTrophies();
      }
    }
    if (this.kart.t.maxSpeed > CLASSES.battery.top * 1.04) return;
    void api.kartLap(this.ctx.roomId, this.ctx.area.id, this.ctx.browserId, this.ctx.name(), id, this.kart.bodyId, ms, g).then((r) => {
      if (this.disposed) return;
      if (r.ok) {
        if (r.data.improved) {
          this.ctx.ui.toast(r.data.rank ? `Saved to the board: ${ordinal(r.data.rank)} on ${this.c.name}` : 'Saved to the board', 'good');
          kartSfx.clatter();
          void this.loadBoards();
        }
      } else this.ctx.ui.toast('Saved on this device. The board did not take that lap.', 'bad');
    });
  }

  private grantMedalUnlocks(): void {
    const d = this.save.d;
    const meds = CUP.map((id) => d.medals[id] ?? 0);
    const got: string[] = [];
    if (meds.some((m) => m >= 1) && this.save.grant('paint', 'orange')) got.push('Orange paint');
    if (meds.some((m) => m >= 2) && this.save.grant('paint', 'lime')) got.push('Lime paint');
    if (meds.some((m) => m >= 3) && this.save.grant('paint', 'night')) got.push('Midnight paint');
    const flames: Record<CircuitId, string> = { blocktown: 'blue', picnic: 'green', cove: 'pink', bedroom: 'violet' };
    CUP.forEach((id, i) => {
      if (meds[i] >= 3 && this.save.grant('flame', flames[id])) got.push(`${FLAMES.find((f) => f.id === flames[id])!.name} flame`);
    });
    if (meds.every((m) => m >= 4) && this.save.grant('flame', 'rainbow')) got.push('Rainbow flame');
    for (const g of got) this.ctx.ui.toast(`Unlocked: ${g}`, 'good', 3600);
  }

  // -------------------------------------------------------------------------
  // Results, standings and the podium

  private async results(): Promise<void> {
    const s = this.session!;
    s.resultsOpen = true;
    const field = this.active();
    this.updatePlaces(field);
    const order = [...field].sort((a, b) => a.place - b.place);
    s.order = order;
    const place = this.you.place;
    const d = this.save.d;
    const kind = s.opts.kind;
    if (kind === 'warmup') {
      d.warmupDone = true;
      this.save.save();
      const go = await warmupDone(this);
      this.endSession(true);
      if (go === 'cup') void this.startSession({ kind: 'cup', circuit: CUP.includes(this.circuits[0] as CircuitId) ? this.circuits[0] : this.circuits[0], cls: 'windup', items: true }, this.newCup());
      return;
    }
    if (kind !== 'trial') {
      d.stats.races++;
      if (place === 1) d.stats.wins++;
      if (place <= 3) d.stats.podiums++;
      // Beat a driver: their horn is yours.
      for (const r of order) if (r.def && r.place > place && !d.beaten.includes(r.id)) d.beaten.push(r.id);
      if (place === 1) this.save.grant('paint', 'grape');
      // Your rival sulks when you beat them.
      const rv = this.cpus.find((r) => r.id === s.rival);
      if (rv && rv.place > place) {
        rv.mood = 'sulk';
        rv.moodUntil = this.clock + 6;
      }
    }
    if (s.cup) {
      const cup = s.cup;
      for (const r of order) {
        cup.points[r.id] = (cup.points[r.id] ?? 0) + pointsFor(r.place);
        cup.last[r.id] = r.place;
      }
      cup.races.push(order.map((r) => r.id));
    }
    this.save.save();
    const choice = await showResults(this, order);
    if (this.disposed) return;
    if (s.cup) {
      const cup = s.cup;
      await showStandings(this, cup);
      if (cup.index + 1 < cup.circuits.length) {
        if (choice === 'leave') {
          this.endSession(true);
          return;
        }
        const next: Cup = { ...cup, index: cup.index + 1 };
        void this.startSession({ ...s.opts, circuit: cup.circuits[next.index] }, next);
        return;
      }
      await this.cupDone(cup);
      return;
    }
    if (choice === 'again') void this.startSession(s.opts, null);
    else if (choice === 'trial') void this.startSession({ ...s.opts, kind: 'trial', items: false }, null);
    else this.endSession(true);
  }

  newCup(): Cup {
    return { index: 0, circuits: [...this.circuits], points: {}, last: {}, races: [] };
  }

  private async cupDone(cup: Cup): Promise<void> {
    const s = this.session!;
    const rows = cupOrder(this.racers.map((r) => ({ id: r.id, points: cup.points[r.id] ?? 0, last: cup.last[r.id] ?? 9, r })));
    const place = rows.findIndex((x) => x.r.you) + 1;
    const d = this.save.d;
    const cls = s.opts.cls;
    const prev = d.cups[cls];
    d.stats.cups++;
    if (!prev || place < prev) d.cups[cls] = Math.min(4, place);
    // The rival next time is whoever finished nearest you.
    const near = rows[place] ?? rows[place - 2];
    if (near && !near.r.you) d.rival = near.r.id;
    const unlocks: string[] = [];
    if (this.save.grant('body', 'zippy')) unlocks.push('Zippy kart');
    if (this.save.grant('paint', 'gum')) unlocks.push('Bubblegum paint');
    if (place === 1 && cls === 'battery' && this.save.grant('body', 'chunky')) unlocks.push('Chunky kart');
    if (place === 1 && cls === 'windup' && this.save.grant('paint', 'chrome')) unlocks.push('Chrome paint');
    if (place === 1 && cls === 'battery' && this.save.grant('paint', 'gold')) unlocks.push('Gold paint');
    if (place === 1 && cls === 'rocket' && this.save.grant('paint', 'rainbow')) unlocks.push('Glitter paint');
    if (cls === 'battery' && place <= 3 && !(prev && prev <= 3)) unlocks.push('Rocket class');
    this.save.save();
    this.placeTrophies();
    if (place <= 3) {
      await this.podium(rows.slice(0, 3).map((x) => x.r));
    }
    await podiumCard(this, place, cls, unlocks);
    this.endSession(true);
  }

  /** The top three on the podium blocks, a trophy, confetti and an orbiting camera. */
  private async podium(top: Racer[]): Promise<void> {
    const s = this.session!;
    s.state = 'podium';
    s.shotT = 0;
    const p = this.cs.paddock.podium;
    const yaw = p.yaw;
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const spots: [number, number][] = [
      [0, 1.6],
      [-2.3, 1.1],
      [2.3, 0.75],
    ];
    top.forEach((r, i) => {
      const [x, h] = spots[i];
      const k = r.kart;
      r.kart.root.visible = true;
      k.reset();
      k.frozen = true;
      k.pos.set(p.x + right.x * x, h + 0.003, p.z + right.z * x);
      k.yaw = yaw;
      k.sync();
      r.grab = null;
      r.mood = 'cheer';
      r.moodUntil = this.clock + 30;
      if (r.you) this.ctx.teleport(k.pos.x, k.pos.z, yaw);
      k.pos.y = h + 0.003;
      k.sync();
    });
    for (const r of this.cpus)
      if (!top.includes(r)) {
        r.mood = 'sulk';
        r.moodUntil = this.clock + 10;
      }
    this.podiumAt = { racers: top, center: new THREE.Vector3(p.x, 1.6, p.z) };
    // The cup comes down from above, gold for a win.
    const cls = s.opts.cls;
    const tcol = top[0].you ? '#f5c542' : top[1]?.you ? '#d6dbe6' : '#d9905a';
    const ts = new Shape();
    ts.at(cyl(0.7, 0.85, 0.35, 18), '#3a3448', 0, 0.17, 0);
    ts.at(cyl(0.18, 0.26, 0.9, 12), tcol, 0, 0.8, 0);
    ts.at(cyl(0.95, 0.35, 1.3, 20), tcol, 0, 1.9, 0);
    for (const sx of [-1, 1]) ts.at(new THREE.TorusGeometry(0.36, 0.08, 6, 14, Math.PI), tcol, sx * 0.95, 2.0, 0, 0, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
    ts.at(new THREE.OctahedronGeometry(0.3, 0), '#7ef0ff', 0, 2.9, 0);
    this.trophy = new THREE.Group();
    this.trophy.add(ts.mesh('gloss'));
    this.trophy.scale.setScalar(0.62);
    this.trophy.position.set(p.x, 14, p.z);
    this.scene.add(this.trophy);
    void cls;
    kartSfx.fanfare(true);
    music.duck(0.6, 3);
    const c = this.podiumAt.center;
    for (let i = 0; i < 4; i++)
      setTimeout(() => {
        if (this.disposed) return;
        kartSfx.confetti();
        this.confetti.burst({ at: { x: c.x + (i - 1.5) * 2, y: 6, z: c.z }, count: 160, shape: 'up', speed: [3, 8], color: [0xffd24a, 0xe8574a], life: [2.2, 3.4], size: [0.14, 0.24], gravity: 4, drag: 1.2, sizeEnd: 1 });
      }, i * 700);
    await new Promise((r) => setTimeout(r, 6000));
  }

  // -------------------------------------------------------------------------
  // Mounting, tips

  private onMount(): void {
    kartSfx.horn('you');
    this.drone.start();
    this.race.mode(this.session ? 'race' : 'free');
    this.race.show(true);
    this.kart.assists = { ...this.save.d.assists };
    // First ride: offer the warm-up lap with Bolt.
    if (!this.save.d.warmupDone && !this.session && !this.loading) {
      setTimeout(() => {
        if (this.disposed || !this.kart.ridden || this.session) return;
        void confirmLeave(this, 'Warm-up lap with Bolt?', 'Bolt shows you the boost pads, drifting and items. One lap.', 'Yes please', 'Skip').then((ok) => {
          if (ok && this.kart.ridden && !this.session) void this.startSession({ kind: 'warmup', circuit: this.circuits[0], cls: 'windup', items: true });
          else {
            this.save.d.warmupDone = true;
            this.save.save();
          }
        });
      }, 500);
    }
  }

  private onDismount(): void {
    this.drone.stop();
    this.race.show(false);
    this.kart.remoteDrift = false;
    this.save.save();
  }

  /** Short tips, only until you have done the thing. */
  private contextTips(riding: boolean, h: number): void {
    if (!riding) return;
    const s = this.session;
    const d = this.save.d;
    const ui = this.ctx.ui;
    if (this.you.item) this.holdItemFor += h;
    if (this.clock < this.tipAt) return;
    const driftKey = this.kart.assists.remote ? 'OK' : ui.device === 'pad' ? 'X' : ui.device === 'touch' ? 'Brake' : 'Space';
    const itemKey = this.kart.assists.remote ? 'Up' : ui.device === 'pad' ? 'A' : ui.device === 'touch' ? 'Action' : 'E';
    if (s?.state === 'running' && !d.learned.drift && this.timing.dist > this.c.length * 1.1) {
      ui.toast(this.kart.assists.remote ? 'Press OK while turning to drift. OK again for a boost.' : `Hold ${driftKey} while you turn to drift. Let go for a boost.`, 'info', 4200);
      this.tipAt = this.clock + 40;
    } else if (this.you.item && this.holdItemFor > 20 && !d.learned.item) {
      ui.toast(`Use your item with ${itemKey}`, 'info', 3600);
      this.tipAt = this.clock + 40;
    }
  }

  // -------------------------------------------------------------------------
  // Drawing

  update(night: number, t: number, phase: number, focus: THREE.Vector3): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (!this.cs) return;
    this.env.update(phase, focus, night);
    const n = this.env.night;
    for (const m of this.cs.lamps) m.emissiveIntensity = 0.2 + n * 1.4;
    (this.cs.paddock.tower.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.35 + n * 0.5;
    const s = this.session;
    const leader = s ? [...this.active()].sort((a, b) => a.place - b.place)[0] : null;
    this.cs.parts.update?.(dt, t, n, { leaderS: leader ? leader.s : this.cpus[0].s, finalLap: !!s?.finalLap, racing: !!s && s.state === 'running' });
    // Drivers.
    for (const r of this.cpus) {
      if (!r.kart.root.visible) continue;
      if (r.mood !== 'drive' && this.clock > r.moodUntil) r.mood = 'drive';
      const mood: Mood = r.kart.spinT > 0 ? 'dizzy' : r.mood;
      r.driver!.animate(dt, r.kart.steer, r.kart.speed, mood);
      if (r.tag) r.tag.visible = this.tier !== 'low' || Math.hypot(r.kart.pos.x - focus.x, r.kart.pos.z - focus.z) < 22;
    }
    // The ghost kart shimmers.
    if (this.ghostKart.root.visible) (this.ghostKart.bodyMesh.material as THREE.MeshStandardMaterial).opacity = 0.32 + Math.sin(t * 6) * 0.06;
    this.kartFx(dt);
    this.wheels.update();
    // The pack's engines: one hum, loudest when a kart is close.
    let nearest = Infinity;
    let nearSpeed = 0;
    for (const r of this.cpus) {
      if (!r.kart.root.visible) continue;
      const dd = Math.hypot(r.kart.pos.x - this.kart.pos.x, r.kart.pos.z - this.kart.pos.z);
      if (dd < nearest) {
        nearest = dd;
        nearSpeed = Math.abs(r.kart.speed);
      }
    }
    this.drone.set(this.kart.ridden ? Math.max(0, 1 - nearest / 40) : 0, Math.min(1, nearSpeed / 16));
    // Passing your ghost: it bursts into sparkles.
    if (s?.opts.kind === 'trial' && this.ghostKart.root.visible) {
      const n = this.c.path.nearest(this.ghostKart.pos.x, this.ghostKart.pos.z, this.c.idx(this.you.s), 20);
      const ahead = this.c.path.delta(this.you.s, n.s) > 0;
      if (this.ghostAhead && !ahead) {
        const gp = this.ghostKart.pos;
        this.sparks.burst({ at: { x: gp.x, y: gp.y + 0.8, z: gp.z }, count: 50, speed: [1, 4], color: [0x7ef0ff, 0xffffff], life: [0.4, 0.9], size: [0.12, 0.22] });
        sfx.ding(false);
      }
      this.ghostAhead = ahead;
    }
    // Fireworks over the line after dark outdoors, once you finish.
    if (this.fireworksAt > 0 && this.clock < this.fireworksAt) {
      if (Math.random() < dt * 2.5) {
        const f0 = this.c.frame(Math.random() * 40 - 20);
        const col = [0xffd24a, 0xff7ad9, 0x7ef0ff, 0xb6ff8a][Math.floor(Math.random() * 4)];
        this.glow.burst({ at: { x: f0.x + (Math.random() - 0.5) * 30, y: 26 + Math.random() * 10, z: f0.z + (Math.random() - 0.5) * 30 }, count: 70, speed: [6, 11], color: col, colorEnd: 0x1d1830, life: [0.9, 1.6], size: [0.4, 0.7], gravity: 4, drag: 1.2 });
        sfx.bounce(0.2);
      }
    }
    // The trophy comes down over the podium, turning.
    if (this.trophy) {
      this.trophy.position.y += (3.3 - this.trophy.position.y) * Math.min(1, dt * 1.6);
      this.trophy.rotation.y += dt * 1.4;
    }
    this.sparks.update(dt);
    this.smoke.update(dt);
    this.glow.update(dt);
    this.confetti.update(dt);
    this.rings.update(dt);
    this.fovKick = Math.max(0, this.fovKick - dt * 9);
    this.paintHud(dt);
    // Onboarding: tip boards for this device, and Bolt talking you round the warm-up lap.
    const warm = s?.opts.kind === 'warmup';
    if (this.tips) {
      const controls: Controls = this.kart.assists.remote ? 'remote' : this.ctx.ui.device;
      this.tips.update(controls);
      this.tips.show(warm || (!s && !this.save.d.warmupDone && this.kart.ridden));
    }
    this.bubble.sprite.visible = warm && s.state !== 'done';
    if (warm) this.bubble.say(boltLine(this.cpus[0].s, { drifted: this.save.d.learned.drift, turbo: this.save.d.learned.turbo, item: this.save.d.learned.item }));
    // The pit ring pulses.
    const ring = this.cs.paddock.ring;
    if (ring.visible) (ring.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(t * 4) * 0.25;
    if (this.wantOut && this.kart.ridden) {
      this.wantOut = false;
      // Same as Back on a controller in the paddock: the game puts you on your feet.
      this.ctx.input.press('back');
    }
  }

  /** Drift sparks, boost flames, smoke and dust for every visible kart. */
  private kartFx(dt: number): void {
    const flame = FLAMES.find((f) => f.id === this.save.d.kart.flame) ?? FLAMES[0];
    for (const r of this.active()) {
      const k = r.kart;
      if (!k.root.visible || r.grab) continue;
      const fx = Math.sin(k.yaw);
      const fz = Math.cos(k.yaw);
      const rx = Math.cos(k.yaw);
      const rz = -Math.sin(k.yaw);
      const p = k.pos;
      const close = this.near(p, this.tier === 'low' ? 28 : 60);
      if (!close) continue;
      if (k.drift && k.speed > 3 && !k.air) {
        const stage = k.driftStage;
        const col = stage === 2 ? 0xff9d2e : stage === 1 ? 0x4fc3ff : 0xfff3c4;
        for (const sx of [-1, 1])
          this.sparks.stream({ at: { x: p.x - fx * 0.75 + rx * sx * 0.62, y: p.y + 0.1, z: p.z - fz * 0.75 + rz * sx * 0.62 }, rate: stage ? 70 : 30, count: 1, speed: [1.5, 4], shape: 'cone', dir: { x: -fx + rx * sx * 0.6, y: 0.7, z: -fz + rz * sx * 0.6 }, spread: 0.6, color: col, life: [0.15, 0.3], size: [0.08, stage ? 0.2 : 0.12], gravity: 9 }, dt);
        this.smoke.stream({ at: { x: p.x - fx * 0.9, y: p.y + 0.15, z: p.z - fz * 0.9 }, rate: 14, count: 1, speed: [0.3, 1], color: 0xe8e4f0, life: [0.5, 0.9], size: [0.5, 0.8], sizeEnd: 2.4, alpha: 0.35 }, dt);
      }
      if (k.boost > 0) {
        const c1 = r.you ? flame.color : 0xffb02e;
        const c2 = r.you ? flame.color2 : 0xff5a2a;
        for (const e of k.exhaust) {
          const wx = p.x + rx * e.x + fx * e.z;
          const wz = p.z + rz * e.x + fz * e.z;
          this.glow.stream({ at: { x: wx, y: p.y + e.y, z: wz }, rate: 90, count: 1, speed: [2, 4], shape: 'cone', dir: { x: -fx, y: 0.15, z: -fz }, spread: 0.25, color: [c1, c2], colorEnd: c2, life: [0.12, 0.22], size: [0.35, 0.55], sizeEnd: 0.2, inherit: { x: fx * k.speed * 0.8, y: 0, z: fz * k.speed * 0.8 } }, dt);
        }
      }
      if (!k.onRoad && !k.air && Math.abs(k.speed) > 3) this.smoke.stream({ at: { x: p.x - fx * 0.8, y: p.y + 0.1, z: p.z - fz * 0.8 }, rate: 16, count: 1, speed: [0.5, 1.5], shape: 'up', color: this.cs.parts.dust ?? 0xd9c3a0, life: [0.4, 0.7], size: [0.4, 0.7], sizeEnd: 2, alpha: 0.45 }, dt);
      k.setShadowBlob(this.tier === 'low' || k.air || r.you);
    }
  }

  private paintHud(dt: number): void {
    const rh = this.race;
    const s = this.session;
    const riding = this.kart.ridden;
    rh.show((riding || !!s) && !(s && (s.state === 'podium' || ((s.state === 'intro' || s.state === 'grid') && s.shotLen > 0))));
    if (!riding && !s) return;
    const t = this.timing;
    const field = this.active();
    const trial = s?.opts.kind === 'trial';
    if (s && !trial && s.opts.kind !== 'warmup') rh.setPlace(this.you.place, field.length);
    if (s) {
      const lap = Math.min(s.laps, Math.max(1, Math.floor(progress(this.you) / this.c.length) + 1));
      rh.setLap(s.state === 'countdown' || s.state === 'intro' || s.state === 'grid' ? 'Get ready' : s.state === 'done' ? 'Finished' : s.laps > 1 ? `Lap ${lap}/${s.laps}` : 'Warm-up lap');
    } else rh.setLap(t.started ? (t.valid ? 'Free drive' : 'Lap not counted') : 'Cross the line to time a lap');
    const flashing = !!this.lapFlash && this.clock < this.lapFlash.until;
    let time = '--';
    if (flashing) time = formatLap(this.lapFlash!.ms);
    else if (t.started && (!s || s.state === 'running')) time = formatLap((this.clock - t.lapStart) * 1000);
    rh.setTime(time, flashing);
    const best = this.save.d.bestLap[this.c.id];
    let sub = `Best ${formatLap(best ?? null)}`;
    let tone: 'good' | 'bad' | 'gold' | null = null;
    if (flashing && this.lapFlash!.delta !== null) {
      const dd = this.lapFlash!.delta!;
      sub = `${dd <= 0 ? '-' : '+'}${(Math.abs(dd) / 1000).toFixed(2)} vs best`;
      tone = dd <= 0 ? 'good' : 'bad';
    } else if (s?.state === 'countdown' && !this.save.d.learned.rocket) {
      sub = this.kart.assists.remote ? 'Press Up on the last light for a rocket start' : this.ctx.ui.device === 'touch' ? 'Stick up on the last light for a rocket start' : 'Gas on the last light for a rocket start';
    } else if (this.flash && this.clock < this.flash.until) {
      sub = this.flash.text;
      tone = this.flash.tone;
    } else if (trial && s?.ghost && t.started) {
      sub = `Ghost: ${s.ghost.name} ${formatLap(s.ghost.ms)}`;
    }
    rh.setSub(sub, tone);
    rh.wrongWay(riding && t.wrongFor > 1.2 && !this.you.grab);
    rh.incoming(this.items.incoming(this.you));
    if (this.items.incoming(this.you) && Math.random() < 0.05) kartSfx.whistle();
    const remote = this.kart.assists.remote;
    const label = this.you.item ? `${ITEM_NAMES[this.you.item]}${this.you.item === 'triple' ? ` x${this.you.itemCount}` : ''}` : '';
    rh.setItem(this.you.item, this.you.itemCount, this.you.roulette > 0, dt, label ? `${label} · ${remote ? 'Up' : this.ctx.ui.device === 'pad' ? 'A' : this.ctx.ui.device === 'touch' ? 'Action' : 'E'}` : '');
    if (this.you.roulette > 0) kartSfx.rouletteTick();
    if (s) rh.setOrder([...field].sort((a, b) => a.place - b.place), s.rival);
    rh.paintMap(field, this.ghostKart.root.visible ? this.ghostKart.pos : null);
  }

  cutaway(cam: THREE.Vector3): void {
    this.cs?.parts.cutaway?.(cam);
  }

  setQuality(tier: Tier): void {
    this.tier = tier;
    this.env.setQuality(tier);
    for (const p of [this.sparks, this.smoke, this.glow, this.confetti]) p.setQuality(tier);
    if (this.cs) setTier(this.cs, tier);
    for (const r of this.racers) r.kart.bodyMesh.castShadow = tier !== 'low';
    for (const r of this.cpus) for (const m of r.driver!.meshes) m.castShadow = tier === 'high';
    this.wheels.mesh.castShadow = tier !== 'low';
  }

  private base = { near: 0, far: 0 };

  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): boolean {
    // A finer depth range while racing, and the speed kick on the field of view.
    if (!this.base.near) this.base = { near: camera.near, far: camera.far };
    const near = 0.3;
    const far = Math.max(this.base.far, 600);
    const speed = this.kart.ridden ? Math.abs(this.kart.speed) : 0;
    const kick = (this.ctx.reduceMotion() ? 0.5 : 1) * (Math.min(1, speed / 18) * 6 + this.fovKick);
    const fov = camera.fov + (this.shot && this.shotBlend > 0.5 ? 0 : kick);
    if (camera.near !== near || camera.far !== far || Math.abs(camera.fov - fov) > 0.01) {
      camera.near = near;
      camera.far = far;
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    if (this.env.post.render(renderer, camera)) return true;
    renderer.render(this.scene, camera);
    return true;
  }

  resize(): void {
    this.env.post.resize();
  }

  dispose(): void {
    this.disposed = true;
    this.save.save();
    music.stop();
    this.hud.dispose();
    this.race.dispose();
    this.items?.dispose();
    this.tips?.dispose();
    this.bubble.dispose();
    this.cs?.dispose();
    this.env.dispose();
    this.wheels.dispose();
    for (const p of [this.sparks, this.smoke, this.glow, this.confetti]) p.dispose();
    this.rings.dispose();
    const cam = this.ctx.camera;
    if (this.base.near) {
      cam.near = this.base.near;
      cam.far = this.base.far;
      cam.updateProjectionMatrix();
    }
    this.drone.stop();
    disposeTree(this.scene);
  }

  // -------------------------------------------------------------------------
  // Playtests

  debugInfo() {
    const s = this.session;
    const k = this.kart;
    return {
      circuit: this.c.id,
      circuits: this.circuits,
      length: this.c.length,
      laps: this.c.laps,
      tier: this.tier,
      state: s ? s.state : 'free',
      session: s ? { kind: s.opts.kind, cls: s.opts.cls, seed: s.seed, t: s.t, laps: s.laps, finalLap: s.finalLap, results: s.resultsOpen, cup: s.cup ? { index: s.cup.index, points: s.cup.points } : null, rival: s.rival, ghost: !!s.ghost, bestLap: s.bestLap } : null,
      kart: { x: k.pos.x, y: k.pos.y, z: k.pos.z, yaw: k.yaw, speed: k.speed, drift: k.drift, stage: k.driftStage, boost: k.boost, air: k.air, onRoad: k.onRoad, s: this.you.s, off: this.you.off, item: this.you.item, roulette: this.you.roulette, immune: k.immune, bubble: k.bubble, spin: k.spinT, body: k.bodyId, top: k.t.maxSpeed, assists: k.assists, remoteDrift: k.remoteDrift, place: this.you.place, raced: this.you.raced, grabs: this.you.grabs, grabbed: !!this.you.grab, frozen: k.frozen },
      timing: { started: this.timing.started, valid: this.timing.valid, last: this.timing.last, best: this.save.d.bestLap[this.c.id] ?? null, trial: this.save.d.trialLap[this.c.id] ?? null },
      paddock: { box: this.cs.paddock.box, arrival: this.arrival, door: this.door, tower: this.cs.paddock.towerAt },
      pads: this.c.pads,
      capsules: this.items.capsuleSpots(),
      items: this.items.debug(),
      cpus: this.cpus.map((r) => ({ id: r.id, name: r.name, s: r.s, speed: r.kart.speed, laps: r.laps, offMax: r.offMax, grabs: r.grabs, place: r.place, visible: r.kart.root.visible, item: r.item, finished: r.finishedAt })),
      boards: Object.fromEntries(Object.entries(this.boards).map(([id, b]) => [id, b.board.length])),
      save: { cups: this.save.d.cups, medals: this.save.d.medals, bodies: this.save.d.bodies, warmupDone: this.save.d.warmupDone, learned: this.save.d.learned, stats: this.save.d.stats },
      render: this.renderInfo,
      zAudit: this.z.audit,
      hazards: (this.cs.parts.hazards ?? []).map((hz) => hz.info()),
    };
  }

  private debugCam: Shot | null = null;

  /** A fixed camera for screenshots (null hands back). */
  debugCamera(pos: [number, number, number] | null, target?: [number, number, number], fov = 50): boolean {
    this.debugCam = pos && target ? { pos: new THREE.Vector3(...pos), target: new THREE.Vector3(...target), fov } : null;
    return true;
  }

  /** Filled by the playtest from renderer.info through debugRender. */
  renderInfo: { calls: number; triangles: number } | null = null;

  /** Measures draw calls and triangles for one plain frame from the current camera. */
  debugRender(): { calls: number; triangles: number } {
    const r = (window as unknown as { toyboxes?: { renderer?: THREE.WebGLRenderer } }).toyboxes?.renderer;
    if (!r) return { calls: -1, triangles: -1 };
    r.info.autoReset = false;
    r.info.reset();
    this.render(r, this.ctx.camera);
    const out = { calls: r.info.render.calls, triangles: r.info.render.triangles };
    r.info.autoReset = true;
    this.renderInfo = out;
    return out;
  }

  /** Colliders near a point (playtests). */
  debugColliders(x: number, z: number, r = 4) {
    return this.colliders.concat(this.extraColliders()).filter((c) => Math.hypot(c.x - x, c.z - z) < r + (c.kind === 'box' ? Math.max(c.hw, c.hd) : c.r)).map((c) => ({ ...c }));
  }

  /** The heaviest meshes in the scene, for triangle budgets. */
  debugHeavy(): { what: string; tris: number; at: string }[] {
    const out: { what: string; tris: number; at: string }[] = [];
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      const g = m.geometry as THREE.BufferGeometry;
      const n = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      const inst = (m as unknown as THREE.InstancedMesh).isInstancedMesh ? (m as unknown as THREE.InstancedMesh).count : 1;
      g.computeBoundingSphere();
      const c = g.boundingSphere!.center.clone().applyMatrix4(m.matrixWorld);
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
      out.push({ what: `${m.userData.batch ? 'batch' : m.type}:${mat.vertexColors ? 'vc' : mat.map ? 'tex' : mat.color?.getHexString()}`, tris: n * inst, at: `${c.x.toFixed(0)},${c.y.toFixed(0)},${c.z.toFixed(0)} r${g.boundingSphere!.radius.toFixed(0)}` });
    });
    return out.sort((a, b) => b.tris - a.tris).slice(0, 18);
  }

  debugLoadCircuit(id: HomeId): boolean {
    if (this.session) this.endSession(false);
    this.load(id);
    if (this.kart.ridden) this.ctx.teleport(this.kart.pos.x, this.kart.pos.z, this.kart.yaw);
    else this.ctx.teleport(this.arrival.x, this.arrival.z, this.arrival.yaw);
    return true;
  }

  debugStart(kind: SessionKind, circuit?: HomeId, cls: ClassId = 'battery', items = true): boolean {
    void this.startSession({ kind, circuit: circuit ?? this.c.id, cls, items }, kind === 'cup' ? this.newCup() : null);
    return true;
  }

  /** Puts you a few metres from the finish, for results playtests. */
  debugNearFinish(): boolean {
    const s = this.session;
    if (!s || s.state !== 'running') return false;
    this.you.raced = this.you.toLine + s.laps * this.c.length - 3;
    return true;
  }

  /** A point at s and offset (for screenshot cameras). */
  debugAt(s: number, off = 0) {
    return this.c.at(s, off);
  }

  debugGiveItem(id: ItemId): boolean {
    this.you.item = id;
    this.you.itemCount = id === 'triple' ? 3 : 1;
    this.you.roulette = 0;
    return true;
  }

  /**
   * Drives one clean lap of the centre line at a steady speed through the
   * real step (lap timing, ghost recording, the board), for playtests.
   */
  debugAutopilotLap(speed = 14.5): { steps: number } {
    const k = this.kart;
    const L = this.c.length;
    const ps = (): PlayerState => ({ x: k.pos.x, z: k.pos.z, y: k.pos.y, vy: 0, grounded: true, yaw: k.yaw, vx: 0, vz: 0, riding: k });
    let s = this.you.s;
    const end = s + this.c.path.delta(s, 0) + (this.c.path.delta(s, 0) < 5 ? L : 0) + L + 2;
    let steps = 0;
    while (s < end && steps < 60 * 120) {
      s += speed / 60;
      const q = this.c.at(s, 0);
      k.pos.set(q.x, q.y, q.z);
      k.yaw = q.heading;
      k.speed = speed;
      k.frozen = false;
      k.sync();
      this.step(1 / 60, ps());
      steps++;
    }
    return { steps };
  }

  /** Lets the computer drivers' brain drive your kart (Barnaby's style), for motion screenshots. */
  debugAutopilot(on: boolean): boolean {
    const def = driverById('barnaby')!;
    this.kart.auto = on ? (dt) => aiInputs(this.you, def, this.aiWorld(!!this.session), dt) : null;
    return true;
  }

  /** Teleports your kart to a distance along the lap. */
  debugTeleportS(s: number, off = 0): boolean {
    const q = this.c.at(s, off);
    this.ctx.teleport(q.x, q.z, q.heading);
    this.kart.pos.y = q.y;
    this.kart.air = false;
    this.you.s = this.c.wrap(s);
    this.you.hint = this.c.idx(s);
    this.timing.s = this.you.s;
    this.kart.sync();
    return true;
  }

  /** A computer kart parked on the road ahead of you, for item hits. */
  debugPlaceCpu(i: number, ds: number, off = 0): boolean {
    const r = this.cpus[i];
    const s = this.you.s + ds;
    const q = this.c.at(s, off);
    this.placeKart(r, q.x, q.z, q.heading, s);
    r.kart.root.visible = true;
    return true;
  }

  debugSkip(): boolean {
    const s = this.session;
    if (!s) return false;
    if (s.state === 'intro') this.toGrid(true);
    else if (s.state === 'grid') this.toCountdown();
    return true;
  }

  debugAssist(a: Partial<RaceKart['assists']>): boolean {
    Object.assign(this.save.d.assists, a);
    this.kart.assists = { ...this.save.d.assists };
    this.save.save();
    return true;
  }

  debugBody(body: BodyId): boolean {
    this.save.d.kart.body = body;
    this.kart.setup(body, this.kart.paint, CLASSES.battery);
    return true;
  }

  /** Runs every computer driver at race pace without drawing, for playtests. */
  debugSimulate(seconds: number, cls: ClassId = 'battery') {
    const idle: PlayerState = { x: this.arrival.x, z: this.arrival.z, y: 0, vy: 0, grounded: true, yaw: 0, vx: 0, vz: 0, riding: null };
    const wasSession = this.session;
    this.session = null;
    this.simPace = true;
    for (const r of this.cpus) {
      r.laps = 0;
      r.offMax = 0;
      r.grabs = 0;
      r.lastGrab = '';
      r.kart.applyClass(CLASSES[cls]);
      r.kart.root.visible = true;
    }
    const t0 = this.clock;
    const wasRiding = this.wasRiding;
    for (let i = 0; i < seconds * 60; i++) this.step(1 / 60, idle);
    this.wasRiding = wasRiding;
    this.simPace = false;
    this.session = wasSession;
    for (const r of this.cpus) r.kart.applyClass(CLASSES.battery);
    return { seconds: this.clock - t0, cpus: this.cpus.map((r) => ({ name: r.name, laps: r.laps, offMax: r.offMax, grabs: r.grabs, lastGrab: r.lastGrab })) };
  }

  /** Parks the drivers in a row facing the arrival spot, for close-up screenshots. */
  debugLineUp(on: boolean): boolean {
    this.cpus.forEach((r, i) => {
      r.kart.frozen = on;
      if (on) {
        const yaw = this.arrival.yaw;
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        const side = (i - 3) * 2.4;
        r.kart.reset();
        r.kart.pos.set(this.arrival.x + fx * 6 + fz * side, 0, this.arrival.z + fz * 6 - fx * side);
        r.kart.yaw = yaw + Math.PI;
        r.kart.sync();
        r.mood = i % 3 === 0 ? 'cheer' : i % 3 === 1 ? 'wave' : 'drive';
        r.moodUntil = this.clock + 60;
      } else this.spreadCpus();
    });
    return true;
  }

  /** The z-fight audit (see zaudit.ts): pairs of overlapping coplanar faces. */
  debugZAudit(): number {
    this.z.audit = zAudit(this.cs.group);
    return this.z.audit;
  }

  /** Where the z-fight audit finds overlaps (first dozen), with mesh names. */
  debugZReport(): string[] {
    const out: string[] = [];
    zAudit(this.cs.group, (m) => out.push(m));
    return out;
  }

  debugUnlockAll(): boolean {
    const d = this.save.d;
    d.bodies = ['classic', 'zippy', 'chunky'];
    d.paints = PAINTS.map((p) => p.id);
    d.flames = FLAMES.map((f) => f.id);
    d.cups.battery = 1;
    this.save.save();
    return true;
  }
}

