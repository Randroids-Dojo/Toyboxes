// Little Puffington: a fart simulator. A storybook village at its summer
// fete where your toots are a superpower: eat, toot, fly, and cause polite
// chaos. This class owns the scene and wires the SpaceView hooks to the
// village, the townsfolk, the toot moves, the mischief list and the trials.

import * as THREE from 'three';
import './fart.css';
import { box, circle, type Collider } from '../../world/physics';
import type { CameraShot, CaptureLabels, PlayerState, SpaceAction, SpaceView, Tier } from '../../world/space';
import type { ExperienceCtx } from '../common';
import { Hud, Particles, PostFX, Progress, Shockwaves } from '../kit';
import { disposeTree } from '../../world/kit';
import { IS_TV } from '../../input/input';
import { music } from '../../audio/music';
import { ARRIVAL, BALLOON, BANDSTAND, CRUMBS, EXIT, FOUNTAIN, SPOTS, balloonSlice, balloonTop, canopies, villageBoxes, villageCircles } from './layout';
import { buildVillage, type Village } from './village';
import { Figures } from './figures';
import { registerParts } from './people';
import { Clouds } from './sim/clouds';
import { CloudFx, type CloudStyle } from './clouds-fx';
import { Words } from './words';
import { PuffHud } from './pfhud';
import { Mover, type TootEvent } from './moves';
import { GAS, type Gas } from './sim/gas';
import { fx, toot, type Voice } from './toots';
import { C } from './palette';
import { Village3 } from './town';
import { PUFFINGTON_MARCH } from './songs';
import { Props, registerProps } from './props';
import { MISCHIEF, Mischief, type MischiefEvent } from './sim/mischief';
import { TOTAL_BEANS, beanCount, freshSave, migrate, newUnlocks, trialOpen, TRIAL_GATES, type PuffSave, type TrialId } from './sim/progress';
import { openProgramme, openTootomatic, TRIAL_NAMES } from './dialogs';
import type { Trial, TrialWorld } from './modes/trial';
import type { BrainEvent } from './sim/people';
import { Boards } from './boards';
import { RocketRings } from './modes/rings';
import { LibraryTrial } from './modes/library';

const DAY = {
  hemiSky: new THREE.Color(0xcfefff),
  hemiGround: new THREE.Color(0x8a76b8),
  sun: new THREE.Color(0xffe6b8),
  fog: new THREE.Color(0xfce9c8),
  skyTop: new THREE.Color(0x7ec8f2),
  horizon: new THREE.Color(0xfce9c8),
};
const NIGHT = {
  hemiSky: new THREE.Color(0x4a5aa0),
  hemiGround: new THREE.Color(0x2a2048),
  sun: new THREE.Color(0x9db4ff),
  fog: new THREE.Color(0x2a3060),
  skyTop: new THREE.Color(0x101838),
  horizon: new THREE.Color(0x3a3a70),
};

/** Trial modules register here (see modes/). */
export type TrialFactory = (w: TrialWorld, opts: Record<string, unknown>) => Trial;
export const TRIALS: Partial<Record<TrialId, TrialFactory>> = {
  rings: (w, o) => new RocketRings(w, o),
  library: (w, o) => new LibraryTrial(w, o),
};

export class FartSimulator implements SpaceView {
  readonly scene = new THREE.Scene();
  readonly indoor = false;
  readonly door = { x: EXIT.x, z: EXIT.z };
  readonly arrival = { ...ARRIVAL };
  readonly lectern = null;
  readonly chest = null;
  readonly areaDoors = [];
  readonly exhibitSpots = [];
  readonly colliders: Collider[] = [];
  readonly sun = new THREE.DirectionalLight(0xffe6b8, 2.4);
  private hemi = new THREE.HemisphereLight(0xcfefff, 0x8a76b8, 1.5);
  private sunDir = new THREE.Vector3(-0.45, 0.62, 0.62).normalize();
  private nightLights: THREE.PointLight[] = [];

  readonly village: Village;
  readonly figures: Figures;
  readonly clouds = new Clouds();
  readonly cloudFx: CloudFx;
  readonly words: Words;
  readonly hud: Hud;
  readonly ph: PuffHud;
  private post: PostFX;
  readonly dust: Particles;
  readonly sparks: Particles;
  readonly confetti: Particles;
  readonly rings: Shockwaves;
  readonly mover: Mover;
  readonly vil: Village3;
  readonly props: Props;
  readonly boards: Boards;
  private progress: Progress<PuffSave>;
  save: PuffSave;
  private mischief: Mischief;
  private tier: Tier = 'medium';
  private time = 0;
  private night = 0;
  private crumbs: { x: number; y: number; z: number; taken: number }[] = CRUMBS.map(([x, y, z]) => ({ x, y, z, taken: -1 }));
  private crumbMesh: THREE.InstancedMesh;
  private crumbChain = 0;
  private crumbChainT = 0;
  private lastY = 0;
  private player: PlayerState | null = null;
  private canopyList = canopies();
  private musicNear = -1;
  private hoverHeard = 0;
  private tootOnInteract = false;
  private drawStats = { calls: 0, triangles: 0 };
  private lastT = 0;
  private pipQueue: { t: number; gas: Gas }[] = [];
  private intro: { t: number; done: boolean; said: boolean } | null = null;
  private trial: Trial | null = null;
  private emptyHinted = false;
  private sparkleSpot: { x: number; z: number; t: number } | null = null;
  /** The music beat at the moment of the last toot press (for toots on the beat). */
  private pressBeat: number | null = null;

  constructor(private ctx: ExperienceCtx) {
    this.tier = ctx.tier();
    this.scene.background = new THREE.Color(C.sky);
    this.scene.fog = new THREE.Fog(DAY.fog.getHex(), 60, 170);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -24;
    sc.right = sc.top = 24;
    sc.near = 1;
    sc.far = 120;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    for (const [x, z] of [[BANDSTAND.x, BANDSTAND.z], [-6.5, 17]]) {
      const l = new THREE.PointLight(0xffc878, 0, 14, 1.6);
      l.position.set(x, 3.8, z);
      this.nightLights.push(l);
      this.scene.add(l);
    }

    for (const b of villageBoxes()) this.colliders.push(box(b.x, b.z, b.hw, b.hd, b.rot ?? 0, b.h, 0.3, b.cam ?? true));
    for (const c of villageCircles()) this.colliders.push(circle(c.x, c.z, c.r, c.h, 0.3, c.cam ?? true));

    this.progress = new Progress<PuffSave>('fart', ctx.roomId, ctx.area.id, freshSave(), 2);
    this.save = migrate(this.progress.data);
    Object.assign(this.progress.data, this.save);
    this.save = this.progress.data;
    this.mischief = new Mischief(this.save.mischief);

    this.village = buildVillage(this.scene, this.tier, ctx.ownerName);
    this.figures = new Figures(this.scene, { instances: 1600, vertices: 110000, indices: 300000, faces: 72, blobs: 72 });
    registerParts(this.figures);
    registerProps(this.figures);
    this.cloudFx = new CloudFx(this.scene, 800);
    this.cloudFx.style = this.save.cloud;
    this.dust = new Particles(this.scene, { max: 600, look: 'smoke' });
    this.sparks = new Particles(this.scene, { max: 700, look: 'spark' });
    this.confetti = new Particles(this.scene, { max: 600, look: 'confetti' });
    this.rings = new Shockwaves(this.scene);
    this.crumbMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.22, 1), new THREE.MeshToonMaterial({ color: 0xd4f58a, emissive: 0x5e9e2e, emissiveIntensity: 0.35 }), this.crumbs.length);
    this.crumbMesh.frustumCulled = false;
    this.scene.add(this.crumbMesh);

    this.words = new Words(ctx.ui.hud);
    this.vil = new Village3(this.figures, this.words, (x, z) => this.clouds.stinkAt(x, 1.5, z), (x, z) => this.clouds.strongestAt(x, 1.5, z), this.tier);
    this.vil.onEvent = (e) => this.onBrain(e);
    this.props = new Props(this.figures, {
      tins: (down) => this.mis({ kind: 'tins', down }, { x: 4.6, y: 1.2, z: 21.2 }),
      gnomes: (down) => {
        if (down > 0) this.words.word(`${down}/8`, this.headPoint(), { color: '#ff8f6b', size: 0.7 });
        this.mis({ kind: 'gnomes', down });
      },
      laundry: () => this.mis({ kind: 'laundry' }, { x: 25, y: 7, z: 11.5 }),
      bell: () => {
        this.ctx.shake(0.3);
        this.words.word('BONG!', { x: -21, y: 13.5, z: -21 }, { color: '#ffd24a', size: 1.8, life: 1.6 });
        this.rings.emit({ x: -21, y: 11.8, z: -21 }, { color: 0xffd24a, radius: 8, life: 1.2, normal: { x: 0, y: 0, z: 1 } });
        this.vil.hear({ x: -21, z: -21, noise: 30, gas: 'bell', big: false });
        this.mis({ kind: 'bell' }, { x: -21, y: 12, z: -21 });
      },
      fountain: () => this.mis({ kind: 'fountain' }, { x: FOUNTAIN.x, y: 1, z: FOUNTAIN.z }),
      hatLanded: (on) => {
        const mayor = this.vil.person('mayor');
        if (mayor) mayor.p.hatOff = on !== null;
      },
      sparkle: (at, color, n) => this.sparks.burst({ at, count: n ?? 10, speed: [1, 3], color: [color, 0xffffff], size: [0.08, 0.15], life: [0.4, 0.8], drag: 2 }),
      steam: (at) => this.dust.burst({ at, count: 6, shape: 'up', speed: [0.4, 1], color: 0xffffff, size: [0.15, 0.3], sizeEnd: 2.2, life: [0.8, 1.4], gravity: -0.8, alpha: 0.6 }),
      bubbles: (at, n) => this.sparks.burst({ at, count: n, shape: 'up', radius: 1.2, speed: [0.6, 1.4], color: [0x9fe3ff, 0xffffff], size: [0.3, 0.7], sizeEnd: 1.4, life: [1.4, 2.4], gravity: -1.2, drag: 0.6, alpha: 0.5 }),
    });
    this.boards = new Boards(ctx, this.village);
    this.ph = new PuffHud(ctx.ui.hud);
    this.hud = new Hud(ctx, { accent: '#e8574a', accent2: '#6fbf3b', panel: 'light' });
    this.post = new PostFX(this.scene, { bloom: { strength: 0.35, radius: 0.5, threshold: 0.86 }, vignette: 0.28, saturation: 1.08, contrast: 1.04, lift: 0.02 });

    this.mover = new Mover(ctx, {
      onToot: (e, kind) => this.onToot(e, kind),
      onEmpty: () => this.onEmpty(),
      onLand: () => {},
      voice: () => this.voice,
      fx: {
        puffs: (gas, at, n, dir, speed, size) => this.cloudFx.burst(gas, at, n, { dir, speed, size }),
        ring: (gas, at, n, speed, size) => this.cloudFx.ring(gas, at, n, speed, size),
        cloud: (gas, at, big) => this.clouds.add(gas, at.x, at.y, at.z, { big }),
        word: (text, at, color, size) => this.words.word(text, at, { color, size }),
        dust: (at, r) => {
          this.dust.burst({ at: { x: at.x, y: at.y + 0.1, z: at.z }, count: Math.round(10 + r * 8), shape: 'ring', speed: [r * 1.2, r * 2.4], color: [0xe9d3a8, 0xfff1d6], size: [0.25, 0.5], sizeEnd: 2, life: [0.4, 0.8], drag: 3, alpha: 0.7 });
          this.rings.emit({ x: at.x, y: at.y + 0.05, z: at.z }, { color: 0xfff1d6, radius: r * 1.4, life: 0.45, alpha: 0.5 });
        },
      },
    });
    this.mover.tapMode = this.save.tapMode ?? IS_TV;
    this.ph.beans(beanCount(this.save), TOTAL_BEANS);
    this.refreshHint();
    this.village.closedSign.visible = !trialOpen('library', beanCount(this.save));
    this.setQuality(this.tier);
    music.play(PUFFINGTON_MARCH, { fadeIn: 2 });
    if (!this.save.seenIntro) this.intro = { t: 0, done: false, said: false };
    else this.hud.title('Little Puffington', 'A fart simulator');
  }

  get voice(): Voice {
    return this.save.voice;
  }

  // ---------------------------------------------------------------------------
  // Golden beans and mischief

  private mis(e: MischiefEvent, at?: { x: number; y: number; z: number }): void {
    const id = this.mischief.on(e);
    if (!id) return;
    const item = MISCHIEF.find((m) => m.id === id)!;
    this.save.mischief = [...this.mischief.done];
    this.award(item.text, at ?? this.headPoint());
  }

  private headPoint(): { x: number; y: number; z: number } {
    const p = this.player;
    return p ? { x: p.x, y: p.y + 1.8, z: p.z } : { x: 0, y: 2, z: 0 };
  }

  /** A golden bean: fly it to the jar, tick the notebook, and check unlocks. */
  private award(text: string, at: { x: number; y: number; z: number }, title = 'Mischief done!'): void {
    const before = beanCount(this.save) - 1;
    this.progress.save();
    this.ph.tick(title, text);
    fx.scribble();
    setTimeout(() => fx.bean(), 250);
    setTimeout(() => fx.ooh(), 450);
    this.sparks.burst({ at, count: 26, speed: [2, 5], color: [0xffd24a, 0xfff3b0], size: [0.1, 0.2], life: [0.5, 1], drag: 2 });
    const v = new THREE.Vector3(at.x, at.y, at.z).project(this.ctx.camera);
    const sx = ((v.x + 1) / 2) * innerWidth;
    const sy = ((1 - v.y) / 2) * innerHeight;
    this.ph.flyBean(v.z < 1 ? sx : innerWidth / 2, v.z < 1 ? sy : innerHeight / 2, () => {
      this.ph.beans(beanCount(this.save), TOTAL_BEANS, true);
      fx.ding();
    });
    this.afterBeans(before, beanCount(this.save));
    this.refreshHint();
  }

  /** Unlock toasts, gates opening and the medal ceremony. */
  private afterBeans(before: number, after: number): void {
    for (const u of newUnlocks(before, after)) {
      setTimeout(() => this.ctx.ui.toast(u.kind === 'golden' ? 'The golden toot is yours! See the Toot-o-Matic.' : `New ${u.kind === 'voice' ? 'toot voice' : 'cloud style'}: ${u.name}. Try it at the Toot-o-Matic.`, 'good', 3800), 1400);
      const horn = this.village.tootomaticHorn.position;
      this.sparks.burst({ at: { x: horn.x, y: horn.y + 1, z: horn.z }, count: 30, speed: [2, 4], color: [0xffd24a, 0xff8fc8], size: [0.1, 0.2], life: [0.6, 1.2], drag: 1.5 });
    }
    for (const t of ['library', 'picnic'] as TrialId[]) {
      if (before < TRIAL_GATES[t] && after >= TRIAL_GATES[t]) {
        setTimeout(() => this.ctx.ui.toast(`${TRIAL_NAMES[t]} is open!`, 'good', 3600), 2600);
        if (t === 'library') this.village.closedSign.visible = false;
      }
    }
    if (after >= TOTAL_BEANS && !this.save.medal) setTimeout(() => this.ceremony(), 3000);
  }

  private refreshHint(): void {
    const n = this.mischief.next();
    this.ph.hint(n ? n.text : null);
  }

  private ceremony(): void {
    // The medal ceremony (must-have 11) hooks in here.
  }

  // ---------------------------------------------------------------------------
  // Toots and the world

  private onToot(e: TootEvent, kind: string): void {
    this.trial?.onToot?.(e, kind);
    if (kind === 'hover') {
      this.hoverHeard -= 1 / 60;
      if (this.hoverHeard > 0) return;
      this.hoverHeard = 1.2;
      this.vil.hear({ x: e.x, z: e.z, noise: e.gas === 'fizzy' ? 5 : 8, gas: e.gas, big: false });
      this.props.blast(e.x, e.y - 0.4, e.z, 1.2, e.gas);
      return;
    }
    if (e.noise > 0) this.vil.hear({ x: e.x, z: e.z, noise: e.noise, gas: e.gas, big: kind === 'rocket' });
    const scare = Math.max(e.push * 2.4, e.noise * 0.5);
    const n = this.vil.flock.scatter(e.x, e.z, scare) + this.vil.flock2.scatter(e.x, e.z, scare);
    if (n > 0) {
      fx.flap();
      this.mis({ kind: 'pigeons', n }, { x: e.x, y: 3, z: e.z });
      if (n >= 3) this.words.word(`${n} pigeons!`, { x: e.x, y: e.y + 2.2, z: e.z }, { color: '#d8d8e0', size: 0.8 });
    }
    if (this.vil.ducks.startle(e.x, e.z, e.noise * 0.6) + this.vil.fountainDucks.startle(e.x, e.z, e.noise * 0.6) > 0) fx.quack();
    // Knock props; a big one sends a shockwave along the ground.
    this.props.blast(e.x, e.y, e.z, kind === 'rocket' ? 4 : e.push, e.gas);
    if (kind === 'rocket') this.rings.emit({ x: e.x, y: (this.player?.y ?? 0) + 0.06, z: e.z }, { color: GAS[e.gas as Gas]?.colors[1] ?? 0xffffff, radius: 4, life: 0.6, alpha: 0.7 });
    const p = this.player;
    if (p) this.props.fountainToot(p.x, p.y, p.z);
    // The Mayor's hat.
    const mayor = this.vil.actors.get('mayor');
    if (mayor && !this.props.hat && ((e.gas === 'beans' && this.vil.near('mayor', e.x, e.z, 2.2)) || (kind === 'rocket' && this.vil.near('mayor', e.x, e.z, 4)))) {
      const mp = this.vil.person('mayor')!;
      let best: { id: string; d: number } | null = null;
      for (const [id, a] of this.vil.actors) {
        if (id === 'mayor' || id === 'biscuit' || a.brain.mood === 'away' || a.brain.spec.deaf) continue;
        const d = Math.hypot(a.brain.x - mayor.brain.x, a.brain.z - mayor.brain.z);
        if (d < 7 && (!best || d < best.d)) best = { id, d };
      }
      const target = best ? this.vil.person(best.id) : null;
      mp.p.hatOff = true;
      this.props.popHat(mp.hatPos.clone(), target ? target.hatPos.clone() : null, target);
      this.mis({ kind: 'hat' }, { x: mp.hatPos.x, y: mp.hatPos.y + 0.5, z: mp.hatPos.z });
    }
    // Pip copies you with his whoopee cushion.
    const pip = this.vil.actors.get('pip');
    if (pip && Math.hypot(pip.brain.x - e.x, pip.brain.z - e.z) < 10 && (e.gas === 'beans' || e.gas === 'fizzy' || e.gas === 'cabbage')) {
      this.pipQueue.push({ t: 0.7, gas: e.gas });
      this.mis({ kind: 'pip', gas: e.gas }, this.vil.head('pip') ?? undefined);
    }
    // Toot along with the band.
    if (Math.hypot(e.x - BANDSTAND.x, e.z - BANDSTAND.z) < 10 && music.playing === PUFFINGTON_MARCH.name && !this.trial) {
      const beat = this.pressBeat;
      if (beat !== null) {
        const ok = this.mischief.on({ kind: 'beat', offset: beat - Math.round(beat), t: this.time });
        const streak = this.mischief.bandStreak;
        if (streak > 0 && !ok) this.words.word(['', 'On the beat!', 'Two!', 'Three!', 'Four!'][Math.min(4, streak)], { x: e.x, y: e.y + 2, z: e.z }, { color: '#ffd24a', size: 0.8 });
        if (ok) {
          this.save.mischief = [...this.mischief.done];
          this.award(MISCHIEF.find((m) => m.id === ok)!.text, { x: BANDSTAND.x, y: 3, z: BANDSTAND.z });
          this.words.bubble('Bravo!', () => this.vil.head('tuba'), { tone: 'shout' });
        }
      }
    }
  }

  private press(src: 'interact' | 'kick' | 'jump'): void {
    const b = music.beat();
    this.pressBeat = b >= 0 ? b : null;
    this.mover.press(src);
  }

  private onEmpty(): void {
    this.ph.flash();
    this.ph.shake();
    if (!this.emptyHinted && this.player) {
      this.emptyHinted = true;
      const p = this.player;
      const food = [SPOTS.beans, SPOTS.fizzy, SPOTS.cabbage].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      this.sparkleSpot = { x: food.x, z: food.z, t: 5 };
      this.ctx.ui.toast('Empty tummy! Find food.', 'info', 2400);
    }
  }

  private onBrain(e: BrainEvent): void {
    switch (e.kind) {
      case 'cup': {
        const p = this.vil.person(e.id);
        if (p) this.props.cup(p.hand.clone(), e.yaw + Math.PI * 0.5);
        this.mis({ kind: 'cup' }, p ? { x: p.hand.x, y: p.hand.y + 0.6, z: p.hand.z } : undefined);
        break;
      }
      case 'blame':
        if (e.target === 'biscuit' || e.target === 'mayor') {
          fx.dunDun();
          this.ctx.ui.toast(e.target === 'biscuit' ? 'Framed! Biscuit gets the blame.' : 'Framed! The Mayor gets the blame.', 'good', 2400);
          const h = this.vil.head(e.target);
          if (h) this.words.icon('!', () => this.vil.head(e.target), { life: 2, cls: 'alert' });
          this.mis({ kind: 'blame', target: e.target }, h ? { x: h.x, y: h.y + 0.5, z: h.z } : undefined);
        }
        break;
      case 'fled':
        this.mis({ kind: 'fled', id: e.id, t: this.time }, { x: -6.5, y: 2, z: 16.5 });
        break;
      case 'chase':
        if (e.on) this.ctx.ui.toast('Run! Constable Bobbins is after you.', 'info', 2600);
        else if (e.escaped) this.mis({ kind: 'escaped' });
        break;
      case 'caught':
        this.ctx.ui.toast('Caught! Next time get out of sight, or up on a roof.', 'info', 3000);
        break;
      case 'smell':
        if (this.vil.head(e.id)) this.words.icon('~~~', () => this.vil.head(e.id), { life: 2.2, cls: 'stink' });
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // SpaceView hooks

  actions(p: PlayerState): SpaceAction[] {
    const out: SpaceAction[] = [];
    if (this.trial?.actions) {
      out.push(...this.trial.actions(p));
    } else if (!this.trial) {
      const eat = (g: Gas, spot: { x: number; z: number; range: number }) =>
        out.push({ x: spot.x, z: spot.z, range: spot.range, label: GAS[g].food, short: g === 'fizzy' ? 'Drink' : 'Eat', run: () => this.eat(g) });
      eat('beans', SPOTS.beans);
      eat('fizzy', SPOTS.fizzy);
      eat('cabbage', SPOTS.cabbage);
      out.push({ ...SPOTS.programme, label: 'Read the fete programme', short: 'Read', run: () => void this.openProgramme() });
      out.push({ ...SPOTS.tootomatic, label: 'Use the Toot-o-Matic', short: 'Voices', run: () => void this.openTootomatic() });
      const beans = beanCount(this.save);
      for (const t of ['rings', 'band', 'library', 'picnic'] as TrialId[]) {
        const spot = SPOTS[t];
        const open = trialOpen(t, beans);
        out.push({ ...spot, label: open ? `Start ${TRIAL_NAMES[t]}` : `${TRIAL_NAMES[t]}: opens at ${TRIAL_GATES[t]} golden beans`, short: open ? 'Start' : 'Locked', run: () => (open ? this.startTrial(t) : this.locked(t)) });
      }
    }
    // Nothing to use in reach: Interact toots (the remote's OK button).
    const near = out.some((a) => Math.hypot(a.x - p.x, a.z - p.z) <= a.range) || (!this.trial && Math.hypot(this.door.x - p.x, this.door.z - p.z) <= 1.75);
    this.tootOnInteract = !near && this.tooting() && this.ctx.ui.device !== 'touch';
    if (this.tootOnInteract) out.push({ x: p.x, z: p.z, range: 0.6, label: this.mover.label(p), short: 'Toot', run: () => this.press('interact') });
    return out;
  }

  private tooting(): boolean {
    return (!this.trial || this.trial.tooting) && !(this.intro && !this.intro.done);
  }

  kickAction(p: PlayerState): { label: string; run: () => void } | null {
    if (this.trial?.kickAction) return this.trial.kickAction(p);
    if (!this.tooting() || this.tootOnInteract) return null;
    return { label: this.mover.label(p), run: () => this.press('kick') };
  }

  jumpAction(p: PlayerState): { label: string; run: () => void } | null {
    if (p.grounded || !this.tooting()) return null;
    return { label: 'Boost', run: () => this.press('jump') };
  }

  gravity(): number {
    return this.trial?.gravity?.() ?? this.mover.gravity();
  }

  holdsTime(): boolean {
    return this.trial?.holdsTime() ?? false;
  }

  runScale(): number {
    return this.trial ? 1 : 1.3;
  }

  captureInput(): CaptureLabels | null {
    return this.trial?.captureInput?.() ?? null;
  }

  cameraShot(dt: number): CameraShot | null {
    if (this.intro && !this.intro.done) return this.introShot(dt);
    return this.trial?.cameraShot?.(dt) ?? null;
  }

  extraColliders(): Collider[] {
    const out: Collider[] = [];
    const p = this.player;
    if (p) {
      for (const a of this.vil.actors.values()) {
        const b = a.brain;
        if (b.mood === 'away' || Math.abs(b.x - p.x) > 5 || Math.abs(b.z - p.z) > 5) continue;
        out.push(circle(b.x, b.z, b.spec.id === 'biscuit' || b.spec.id === 'pip' ? 0.3 : 0.38, a.y + (b.spec.id === 'biscuit' ? 0.5 : 1.7), 0.2, false));
      }
      const r = balloonSlice(p.y + 0.8);
      if (r > 0.6 && p.y + 0.8 < BALLOON.cy + 1.2) out.push(circle(BALLOON.x, BALLOON.z, r, 60, 0.3, false));
    }
    if (this.trial?.extraColliders) out.push(...this.trial.extraColliders());
    return out;
  }

  private eat(g: Gas): void {
    this.mover.tank.eat(g);
    this.mover.reset();
    fx.nom();
    if (g === 'fizzy') fx.gulp();
    setTimeout(() => fx.rumble(), 700);
    this.ctx.squash(0.15);
    this.ph.shake();
    navigator.vibrate?.(80);
    this.sparkleSpot = null;
    const p = this.player;
    if (p) this.dust.burst({ at: { x: p.x, y: p.y + 1.3, z: p.z }, count: 8, speed: [0.5, 1.5], color: g === 'beans' ? [0xd86a3a, 0xffd45c] : g === 'fizzy' ? [0xff8fc8, 0x9fe3ff] : [0x8fcf5a, 0xb7e36a], size: [0.05, 0.1], life: [0.4, 0.7], gravity: 6 });
    const keeper = g === 'beans' ? 'gran' : g === 'fizzy' ? 'fizz' : 'sprout';
    const line = g === 'beans' ? ['There you go, dearie!', 'Lovely jubbly!', 'Mind how you go!'] : g === 'fizzy' ? ['Fizz-tastic!', 'Mind the bubbles!'] : ['Prize cabbage, that.', 'Eat your greens!'];
    this.words.bubble(line[Math.floor(Math.random() * line.length)], () => this.vil.head(keeper));
    if (g === 'cabbage' && !this.save.ateCabbage) {
      this.save.ateCabbage = true;
      this.progress.save();
    }
  }

  private locked(t: TrialId): void {
    fx.bonk();
    this.ctx.ui.toast(`${TRIAL_NAMES[t]} opens at ${TRIAL_GATES[t]} golden beans. You have ${beanCount(this.save)}.`, 'info', 3200);
  }

  // ---------------------------------------------------------------------------
  // Trials

  private trialWorld(): TrialWorld {
    return {
      ctx: this.ctx,
      scene: this.scene,
      hud: this.hud,
      ph: this.ph,
      words: this.words,
      figures: this.figures,
      clouds: this.clouds,
      cloudFx: this.cloudFx,
      vil: this.vil,
      village: this.village,
      props: this.props,
      mover: this.mover,
      sparks: this.sparks,
      confetti: this.confetti,
      dust: this.dust,
      rings: this.rings,
      save: this.save,
      boards: this.boards,
      saveNow: () => this.progress.save(),
      trialBeans: (id, beans, best, better) => this.trialBeans(id, beans, best, better),
      endTrial: (next) => this.endTrial(next),
      showVillage: (on) => this.showVillage(on),
      player: () => this.player,
      tier: () => this.tier,
    };
  }

  private trialBeans(id: TrialId, beans: number, best: number | null, better: 'lower' | 'higher'): { newBeans: number; newBest: boolean } {
    const before = beanCount(this.save);
    const s = this.save.trials[id];
    const gained = Math.max(0, beans - s.beans);
    s.beans = Math.max(s.beans, beans);
    s.plays++;
    const newBest = best !== null && (s.best === null || (better === 'lower' ? best < s.best : best > s.best));
    if (newBest) s.best = best;
    this.progress.save();
    if (gained > 0) {
      this.ph.beans(beanCount(this.save), TOTAL_BEANS, true);
      this.afterBeans(before, beanCount(this.save));
      this.refreshHint();
    }
    return { newBeans: gained, newBest };
  }

  startTrial(id: TrialId, opts: Record<string, unknown> = {}): void {
    const make = TRIALS[id];
    if (!make) {
      this.ctx.ui.toast(`${TRIAL_NAMES[id]} is being set up. Come back soon!`, 'info');
      return;
    }
    this.trial?.dispose();
    this.mover.reset();
    this.ph.trial(true);
    this.trial = make(this.trialWorld(), opts);
  }

  private endTrial(next?: TrialId | 'again'): void {
    const id = this.trial?.id;
    this.trial?.dispose();
    this.trial = null;
    this.ph.trial(false);
    this.hud.strip([]);
    this.hud.objective(null);
    this.mover.reset();
    this.showVillage(true);
    if (music.playing !== PUFFINGTON_MARCH.name) music.play(PUFFINGTON_MARCH, { fadeIn: 1.5 });
    this.musicNear = -1;
    if (next === 'again' && id) this.startTrial(id);
    else if (next && next !== 'again') {
      const spot = SPOTS[next];
      this.ctx.teleport(spot.x, spot.z + 1.2, Math.PI);
      if (trialOpen(next, beanCount(this.save))) this.startTrial(next);
    }
  }

  private showVillage(on: boolean): void {
    this.village.group.visible = on;
    this.crumbMesh.visible = on;
  }

  // ---------------------------------------------------------------------------
  // Intro flyover (first visit)

  private introShot(dt: number): CameraShot | null {
    const it = this.intro!;
    it.t += dt;
    const T = 7.5;
    if (!it.said && it.t > 3.2) {
      it.said = true;
      this.words.bubble('Welcome to the Summer Fete. Strictly no funny business.', () => this.vil.head('mayor'), { life: 3.4, tone: 'say' });
    }
    if (it.t >= T) {
      this.finishIntro();
      return null;
    }
    const keys = [
      { t: 0, p: new THREE.Vector3(6, 30, 48), l: new THREE.Vector3(0, 8, -1) },
      { t: 2.5, p: new THREE.Vector3(24, 18, 12), l: new THREE.Vector3(0, 6, -4) },
      { t: 5, p: new THREE.Vector3(-14, 14, 16), l: new THREE.Vector3(-8, 3, -2) },
      { t: 7.5, p: new THREE.Vector3(0, 4.2, 32.5), l: new THREE.Vector3(0, 1.4, 22) },
    ];
    let i = 0;
    while (i < keys.length - 2 && it.t > keys[i + 1].t) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const k = Math.min(1, (it.t - a.t) / (b.t - a.t));
    const e = k * k * (3 - 2 * k);
    this.hud.letterbox(true);
    return { position: a.p.clone().lerp(b.p, e), target: a.l.clone().lerp(b.l, e), blend: it.t > T - 0.8 ? (T - it.t) / 0.8 : 1, lockPlayer: true, skip: () => this.finishIntro(), skipLabel: 'Skip' };
  }

  private finishIntro(): void {
    if (!this.intro || this.intro.done) return;
    this.intro.done = true;
    this.hud.letterbox(false);
    this.save.seenIntro = true;
    this.progress.save();
    this.hud.title('Little Puffington', 'A fart simulator');
    setTimeout(() => fx.rumble(), 600);
    void this.hud.intro({
      key: 'fart-village',
      title: 'Little Puffington',
      tagline: 'Eat beans. Toot. Fly. Cause polite chaos at the fete.',
      tips: [
        { keys: ['move'], text: 'Walk to a stall and eat something.' },
        { keys: ['kick'], touch: 'Toot', text: 'Toot to hop. Toot while walking to scoot.' },
        { keys: ['kick'], touch: 'Toot', text: 'Hold it, standing still, for a big one.' },
        { keys: ['jump'], touch: 'Boost', text: 'In the air: toot to boost, hold to hover.' },
      ],
      button: "Let's toot",
    });
  }

  // ---------------------------------------------------------------------------
  // Dialogs

  private async openProgramme(): Promise<void> {
    fx.click();
    await openProgramme(this.ctx.ui, this.save, {
      onTapMode: (on) => {
        this.save.tapMode = on;
        this.mover.tapMode = on;
        this.progress.save();
      },
      onCalibrate: () => this.startTrial('band', { calibrate: true }),
      onReset: () => {
        this.progress.reset(freshSave());
        this.save = this.progress.data;
        this.mischief = new Mischief([]);
        this.cloudFx.style = 'classic';
        this.mover.tapMode = IS_TV;
        this.ph.beans(0, TOTAL_BEANS, true);
        this.refreshHint();
        this.village.closedSign.visible = true;
        this.ctx.ui.toast('Progress reset. A fresh fete!', 'info');
      },
    });
  }

  private async openTootomatic(): Promise<void> {
    fx.click();
    await openTootomatic(this.ctx.ui, this.save, (c) => {
      if (c.kind === 'voice') this.save.voice = c.id as Voice;
      else {
        this.save.cloud = c.id as CloudStyle;
        this.cloudFx.style = this.save.cloud;
      }
      this.progress.save();
      const at = { x: 6.5, y: 2.6, z: 9.4 };
      toot({ gas: 'beans', size: 'boost', voice: this.save.voice });
      this.cloudFx.burst('beans', at, 12, { speed: 2.4, size: 0.25 });
      this.clouds.add('beans', at.x, at.y, at.z, { big: 0.8, stink: 0 });
    });
  }

  // ---------------------------------------------------------------------------
  // Steps

  step(h: number, p: PlayerState): void {
    this.player = p;
    this.time += h;
    this.vil.setPlayer(p.x, p.y, p.z);
    this.vil.step(h);
    this.mover.enabled = this.tooting();
    if (this.tootOnInteract && this.mover.enabled && this.ctx.input.take('kick')) this.press('kick');
    this.mover.step(h, p);
    this.bounces(p);
    this.crumbStep(h, p);
    this.clouds.step(h);
    this.props.step(h);
    this.trial?.step(h, p);
    for (const q of this.pipQueue) q.t -= h;
    while (this.pipQueue.length && this.pipQueue[0].t <= 0) {
      const q = this.pipQueue.shift()!;
      const head = this.vil.head('pip');
      if (head) {
        toot({ gas: q.gas, size: q.gas === 'fizzy' ? 'blip' : 'tap', voice: 'duck', gain: 0.45, extras: false });
        this.cloudFx.burst(q.gas, { x: head.x, y: head.y - 0.8, z: head.z }, 5, { speed: 1.5, size: 0.14 });
        this.words.word('pfft!', { x: head.x, y: head.y + 0.2, z: head.z }, { color: '#ff8fc8', size: 0.7 });
      }
    }
    if (this.sparkleSpot) {
      this.sparkleSpot.t -= h;
      if (Math.random() < h * 12) this.sparks.burst({ at: { x: this.sparkleSpot.x, y: 1.6, z: this.sparkleSpot.z }, count: 2, radius: 0.6, speed: [0.3, 1], color: [0xffd24a, 0xffffff], size: [0.08, 0.14], life: [0.5, 0.9], gravity: -0.5 });
      if (this.sparkleSpot.t <= 0) this.sparkleSpot = null;
    }
    this.hud.update(h);
    this.ph.update(h);
    this.lastY = p.y;
  }

  /** Bouncy canopies and the balloon crown. */
  private bounces(p: PlayerState): void {
    if (p.vy >= 0) return;
    for (const c of this.canopyList) {
      if (Math.hypot(p.x - c.x, p.z - c.z) > c.r) continue;
      if (this.lastY >= c.y - 0.05 && p.y < c.y + 0.02) {
        const vy = Math.max(c.bounce, 0.8 * -p.vy);
        this.ctx.impulse(0, vy, 0);
        this.ctx.squash(-0.3);
        fx.boing(vy);
        const cm = this.village.canopies.find((x) => x.id === c.id);
        if (cm) cm.wobble = 1;
        this.sparks.burst({ at: { x: p.x, y: c.y + 0.2, z: p.z }, count: 14, shape: 'ring', speed: [2, 4], color: [0xffd24a, 0xffffff], size: [0.08, 0.16], life: [0.3, 0.6], drag: 2 });
        this.ctx.shake(0.08);
        this.words.word('BOING!', { x: p.x, y: c.y + 0.8, z: p.z }, { color: '#9fe3ff', size: 0.9 });
        return;
      }
    }
    const top = balloonTop(p.x, p.z);
    if (top !== null && this.lastY >= top - 0.4 && p.y < top + 0.05) {
      const crown = Math.hypot(p.x - BALLOON.x, p.z - BALLOON.z) < 1.6;
      const vy = crown ? 16 : Math.max(9, 0.8 * -p.vy);
      const d = Math.hypot(p.x - BALLOON.x, p.z - BALLOON.z) || 1;
      this.ctx.impulse(crown ? 0 : ((p.x - BALLOON.x) / d) * 3, vy, crown ? 0 : ((p.z - BALLOON.z) / d) * 3);
      this.ctx.squash(-0.35);
      fx.boing(vy);
      this.ctx.shake(crown ? 0.15 : 0.08);
      this.sparks.burst({ at: { x: p.x, y: top + 0.2, z: p.z }, count: crown ? 30 : 14, shape: 'ring', speed: [2, 5], color: [0xffd24a, 0xe8574a], size: [0.1, 0.2], life: [0.4, 0.8], drag: 2 });
      this.words.word(crown ? 'SUPER BOING!' : 'BOING!', { x: p.x, y: top + 1, z: p.z }, { color: '#ffd24a', size: crown ? 1.3 : 0.9 });
      if (crown) this.mis({ kind: 'balloon' }, { x: p.x, y: top + 1.5, z: p.z });
    }
  }

  private crumbStep(h: number, p: PlayerState): void {
    this.crumbChainT -= h;
    if (this.crumbChainT <= 0) this.crumbChain = 0;
    for (const c of this.crumbs) {
      if (c.taken >= 0) {
        c.taken += h;
        if (c.taken > 12) c.taken = -1;
        continue;
      }
      if (Math.hypot(p.x - c.x, p.y + 0.8 - c.y, p.z - c.z) < 1.0) {
        c.taken = 0;
        this.mover.tank.crumb();
        fx.crumb(this.crumbChain++);
        this.crumbChainT = 2.5;
        this.sparks.burst({ at: c, count: 12, speed: [1, 3], color: [0xd4f58a, 0xffffff], size: [0.08, 0.14], life: [0.3, 0.6], drag: 2 });
        this.cloudFx.burst('beans', c, 5, { speed: 1.5, size: 0.14 });
      }
    }
  }

  update(night: number, t: number, _phase: number, focus: THREE.Vector3): void {
    const dt = Math.min(0.1, Math.max(0, t - (this.lastT || t)));
    this.lastT = t;
    this.night = night;
    this.dayNight(night, focus);
    const v = this.village;
    for (const c of v.canopies) {
      if (c.wobble > 0) {
        c.wobble = Math.max(0, c.wobble - dt * 1.6);
        const w = Math.sin(c.wobble * 22) * c.wobble * 0.25;
        c.mesh.scale.set(1 + w * 0.5, 1 - w, 1 + w * 0.5);
      }
    }
    v.balloon.rotation.z = Math.sin(t * 0.4) * 0.03;
    v.balloon.rotation.x = Math.cos(t * 0.33) * 0.025;
    v.balloon.rotation.y = t * 0.05;
    v.sails.rotation.z = t * 0.6;
    v.weathercock.rotation.y = Math.sin(t * 0.2) * 0.4;
    v.bell.rotation.x = Math.sin(t * 7) * this.props.bellSwing * 0.5;
    const now = new Date();
    v.clockHands[0].rotation.z = -((now.getHours() % 12) / 12) * Math.PI * 2;
    v.clockHands[1].rotation.z = -(now.getMinutes() / 60) * Math.PI * 2;
    v.fountainWater.position.y = FOUNTAIN.water + Math.sin(t * 2) * 0.01;
    const m = new THREE.Matrix4();
    this.crumbs.forEach((c, i) => {
      const s = c.taken >= 0 ? 0 : 1 + Math.sin(t * 3 + i) * 0.08;
      m.compose(new THREE.Vector3(c.x, c.y + Math.sin(t * 2 + i) * 0.12, c.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t + i, 0)), new THREE.Vector3(s, s * 0.8, s));
      this.crumbMesh.setMatrixAt(i, m);
    });
    this.crumbMesh.instanceMatrix.needsUpdate = true;
    this.vil.update(dt, music.playing === PUFFINGTON_MARCH.name ? music.beat() : -1);
    this.props.update(t);
    if (!this.trial) this.musicLevel(focus);
    this.trial?.update(dt, t);
    this.cloudFx.update(dt, this.clouds.list, t);
    this.dust.update(dt);
    this.sparks.update(dt);
    this.confetti.update(dt);
    this.rings.update(dt);
    this.words.update(dt, this.ctx.camera);
    const tk = this.mover.tank;
    this.ph.gauge(tk.gas, tk.amount, { cost: this.mover.previewCost });
  }

  /** The band is heard clearly near the bandstand and muffled across town. */
  private musicLevel(focus: THREE.Vector3): void {
    const d = Math.hypot(focus.x - BANDSTAND.x, focus.z - BANDSTAND.z);
    const near = d < 9 ? 1 : d < 30 ? 1 - (d - 9) / 21 : 0;
    const q = Math.round(near * 10) / 10;
    if (q === this.musicNear) return;
    this.musicNear = q;
    music.filter(900 + q * 19000, 0.6);
    music.layer('drums', q > 0.3 && this.night < 0.6);
    music.layer('glock', q > 0.5 && this.tier === 'high');
  }

  private dayNight(night: number, focus: THREE.Vector3): void {
    const n = night;
    this.hemi.color.copy(DAY.hemiSky).lerp(NIGHT.hemiSky, n);
    this.hemi.groundColor.copy(DAY.hemiGround).lerp(NIGHT.hemiGround, n);
    this.hemi.intensity = 1.5 - n * 0.55;
    this.sun.color.copy(DAY.sun).lerp(NIGHT.sun, n);
    this.sun.intensity = 2.4 - n * 1.75;
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 50);
    this.sun.target.position.copy(focus);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(DAY.fog).lerp(NIGHT.fog, n);
    (this.scene.background as THREE.Color).copy(DAY.skyTop).lerp(NIGHT.skyTop, n);
    const sky = this.village.sky.material as THREE.ShaderMaterial;
    (sky.uniforms.uTop.value as THREE.Color).copy(DAY.skyTop).lerp(NIGHT.skyTop, n);
    (sky.uniforms.uHorizon.value as THREE.Color).copy(DAY.horizon).lerp(NIGHT.horizon, n);
    sky.uniforms.uStars.value = Math.max(0, n * 1.4 - 0.4);
    (sky.uniforms.uSun.value as THREE.Vector3).copy(this.sunDir);
    (sky.uniforms.uSunCol.value as THREE.Color).setHex(n > 0.5 ? 0xdde6ff : 0xfff2c8);
    this.village.windowsMat.emissiveIntensity = n * 1.3;
    this.village.pools.visible = n > 0.05;
    (this.village.pools.material as THREE.MeshBasicMaterial).opacity = n * 0.9;
    for (const l of this.village.lanterns) (l.material as THREE.MeshBasicMaterial).color.setRGB(1 + n * 0.8, 0.88 + n * 0.6, 0.66 + n * 0.3);
    (this.village.skyPuffs.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.35 - n * 0.3;
    this.cloudFx.glow = n * 0.55;
    this.cloudFx.setLight(this.sunDir);
    const pl = this.tier === 'high' ? Math.max(0, n - 0.3) * 18 : 0;
    for (const l of this.nightLights) {
      l.intensity = pl;
      l.visible = pl > 0;
    }
  }

  setQuality(t: Tier): void {
    this.tier = t;
    const shadow = t === 'high' ? 2048 : t === 'medium' ? 1024 : 0;
    if (shadow && this.sun.shadow.mapSize.x !== shadow) {
      this.sun.shadow.mapSize.set(shadow, shadow);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    this.figures.setOutlines(t !== 'low', t === 'high' ? 0.022 : 0.018);
    this.figures.setBlobOpacity(t === 'low' ? 0.6 : 0.3);
    this.cloudFx.setQuality(t);
    this.dust.setQuality(t);
    this.sparks.setQuality(t);
    this.confetti.setQuality(t);
    this.post.setQuality(t);
    if (this.village.flowers) this.village.flowers.visible = t !== 'low';
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): boolean {
    const info = renderer.info;
    const auto = info.autoReset;
    info.autoReset = false;
    info.reset();
    if (!this.post.render(renderer, camera)) renderer.render(this.scene, camera);
    this.drawStats.calls = info.render.calls;
    this.drawStats.triangles = info.render.triangles;
    info.autoReset = auto;
    return true;
  }

  resize(): void {
    this.post.resize();
  }

  cutaway(_cam: THREE.Vector3): void {}

  dispose(): void {
    music.stop();
    this.boards.dispose();
    this.trial?.dispose();
    this.trial = null;
    this.mover.dispose();
    this.hud.dispose();
    this.ph.dispose();
    this.words.dispose();
    this.post.dispose();
    this.dust.dispose();
    this.sparks.dispose();
    this.confetti.dispose();
    this.rings.dispose();
    this.cloudFx.dispose();
    this.figures.dispose();
    disposeTree(this.scene);
  }

  // ---------------------------------------------------------------------------
  // Debug (playtests)

  debugInfo(): Record<string, unknown> {
    const p = this.player;
    const brains: Record<string, { mood: string; x: number; z: number; said: string; cup: boolean }> = {};
    for (const [id, a] of this.vil.actors) brains[id] = { mood: a.brain.mood, x: +a.brain.x.toFixed(2), z: +a.brain.z.toFixed(2), said: a.brain.said, cup: a.brain.hasCup };
    return {
      mode: this.trial?.id ?? (this.intro && !this.intro.done ? 'intro' : 'fete'),
      player: p ? { x: p.x, y: p.y, z: p.z, vy: p.vy, grounded: p.grounded } : null,
      gas: { type: this.mover.tank.gas, amount: Math.round(this.mover.tank.amount), hovering: this.mover.hovering, tapMode: this.mover.tapMode },
      moves: this.mover.stats,
      clouds: this.clouds.list.length,
      people: brains,
      props: { tinsDown: this.props.tinsDown, gnomesDown: this.props.gnomesDown, laundry: this.props.laundryIsDown, hat: !!this.props.hat },
      mischief: [...this.mischief.done],
      beans: beanCount(this.save),
      voice: this.save.voice,
      cloud: this.save.cloud,
      chase: this.vil.town.chase.on,
      trial: this.trial?.debug() ?? null,
      night: this.night,
      tier: this.tier,
      draws: this.drawStats.calls,
      triangles: this.drawStats.triangles,
    };
  }

  debugGive(g: Gas): void {
    this.eat(g);
  }

  debugResetMoves(): void {
    this.mover.stats.maxY = 0;
  }

  debugTapMode(on: boolean): void {
    this.mover.tapMode = on;
  }

  debugSkipIntro(): void {
    if (this.intro) this.finishIntro();
  }

  debugBeans(n: number): void {
    const before = beanCount(this.save);
    for (const id of MISCHIEF.map((m) => m.id).slice(0, Math.min(15, n))) this.mischief.done.add(id);
    this.save.mischief = [...this.mischief.done];
    const extra = Math.max(0, n - 15);
    (['rings', 'library', 'band', 'picnic'] as TrialId[]).forEach((t, i) => {
      this.save.trials[t].beans = Math.max(this.save.trials[t].beans, Math.min(3, Math.max(0, extra - i * 3)));
    });
    this.progress.save();
    this.ph.beans(beanCount(this.save), TOTAL_BEANS, true);
    this.afterBeans(before, beanCount(this.save));
    this.refreshHint();
  }

  debugResetSave(): void {
    this.progress.reset(freshSave());
    this.save = this.progress.data;
    this.mischief = new Mischief([]);
    this.ph.beans(0, TOTAL_BEANS);
  }

  /** Puts the player at a point in the air (playtests use real input from there). */
  debugPlace(x: number, y: number, z: number, yaw: number): void {
    this.ctx.teleport(x, z, yaw, y);
  }

  debugStartTrial(id: TrialId, opts: Record<string, unknown> = {}): void {
    this.startTrial(id, opts);
  }

  debugTrial(method: string, ...args: unknown[]): unknown {
    const t = this.trial as unknown as Record<string, unknown> | null;
    const f = t?.[method];
    return typeof f === 'function' ? (f as (...a: unknown[]) => unknown).apply(t, args) : null;
  }
}
