// Little Puffington: a fart simulator. A storybook village at its summer
// fete where your toots are a superpower: eat, toot, fly, and cause polite
// chaos. This class owns the scene and wires the SpaceView hooks to the
// village, the townsfolk, the toot moves and the trials.

import * as THREE from 'three';
import './fart.css';
import { box, circle, type Collider } from '../../world/physics';
import type { CameraShot, CaptureLabels, PlayerState, SpaceAction, SpaceView, Tier } from '../../world/space';
import type { ExperienceCtx } from '../common';
import { Hud, Particles, PostFX, Shockwaves } from '../kit';
import { disposeTree } from '../../world/kit';
import { IS_TV } from '../../input/input';
import { ARRIVAL, BALLOON, CRUMBS, EXIT, SPOTS, balloonSlice, balloonTop, canopies, villageBoxes, villageCircles } from './layout';
import { buildVillage, type Village } from './village';
import { Figures } from './figures';
import { registerParts } from './people';
import { Clouds } from './sim/clouds';
import { CloudFx } from './clouds-fx';
import { Words } from './words';
import { PuffHud } from './pfhud';
import { Mover, type TootEvent } from './moves';
import { GAS, type Gas } from './sim/gas';
import { fx, type Voice } from './toots';
import { C } from './palette';
import { Village3 } from './town';
import { music } from '../../audio/music';
import { PUFFINGTON_MARCH } from './songs';
import { BANDSTAND } from './layout';

const DAY = {
  hemiSky: new THREE.Color(0xcfefff),
  hemiGround: new THREE.Color(0x8a76b8),
  sun: new THREE.Color(0xffe6b8),
  fog: new THREE.Color(0xfce9c8),
  skyTop: new THREE.Color(0x7ec8f2),
  horizon: new THREE.Color(0xfce9c8),
};
const NIGHT = {
  hemiSky: new THREE.Color(0x3a4a8a),
  hemiGround: new THREE.Color(0x2a2048),
  sun: new THREE.Color(0x9db4ff),
  fog: new THREE.Color(0x2a3060),
  skyTop: new THREE.Color(0x101838),
  horizon: new THREE.Color(0x3a3a70),
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

  private village: Village;
  private figures: Figures;
  private clouds = new Clouds();
  private cloudFx: CloudFx;
  private words: Words;
  private hud: Hud;
  private ph: PuffHud;
  private post: PostFX;
  private dust: Particles;
  private sparks: Particles;
  private confetti: Particles;
  private rings: Shockwaves;
  readonly mover: Mover;
  private tier: Tier = 'medium';
  private time = 0;
  private night = 0;
  private crumbs: { x: number; y: number; z: number; taken: number }[] = CRUMBS.map(([x, y, z]) => ({ x, y, z, taken: -1 }));
  private crumbMesh: THREE.InstancedMesh;
  private crumbChain = 0;
  private crumbChainT = 0;
  private lastY = 0;
  private player: PlayerState | null = null;
  private voice: Voice = 'classic';
  private canopyList = canopies();
  readonly vil: Village3;
  private musicNear = -1;

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

    // Colliders from the layout.
    for (const b of villageBoxes()) this.colliders.push(box(b.x, b.z, b.hw, b.hd, b.rot ?? 0, b.h, 0.3, b.cam ?? true));
    for (const c of villageCircles()) this.colliders.push(circle(c.x, c.z, c.r, c.h, 0.3, c.cam ?? true));

    this.village = buildVillage(this.scene, this.tier, ctx.ownerName);
    this.figures = new Figures(this.scene, { instances: 1400, vertices: 90000, indices: 240000, faces: 64, blobs: 64 });
    registerParts(this.figures);
    this.cloudFx = new CloudFx(this.scene, 800);
    this.dust = new Particles(this.scene, { max: 600, look: 'smoke' });
    this.sparks = new Particles(this.scene, { max: 600, look: 'spark' });
    this.confetti = new Particles(this.scene, { max: 500, look: 'confetti' });
    this.rings = new Shockwaves(this.scene);
    // Puff crumbs: little floating clouds that refill a bit.
    this.crumbMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.22, 1), new THREE.MeshToonMaterial({ color: 0xd4f58a, emissive: 0x5e9e2e, emissiveIntensity: 0.35 }), this.crumbs.length);
    this.crumbMesh.frustumCulled = false;
    this.scene.add(this.crumbMesh);

    this.words = new Words(ctx.ui.hud);
    this.vil = new Village3(this.figures, this.words, (x, z) => this.clouds.stinkAt(x, 1.5, z), (x, z) => this.clouds.strongestAt(x, 1.5, z), this.tier);
    this.ph = new PuffHud(ctx.ui.hud);
    this.hud = new Hud(ctx, { accent: '#e8574a', accent2: '#6fbf3b', panel: 'light' });
    this.post = new PostFX(this.scene, { bloom: { strength: 0.35, radius: 0.5, threshold: 0.86 }, vignette: 0.28, saturation: 1.08, contrast: 1.04, lift: 0.02 });

    this.mover = new Mover(ctx, {
      onToot: (e, kind) => this.onToot(e, kind),
      onEmpty: () => {
        this.ph.flash();
        this.ph.shake();
      },
      onLand: (fall) => this.onLand(fall),
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
    this.mover.tapMode = IS_TV;
    this.hud.title('Little Puffington', 'A fart simulator');
    this.setQuality(this.tier);
    music.play(PUFFINGTON_MARCH, { fadeIn: 2 });
  }

  // ---------------------------------------------------------------------------
  // Toots and the world

  private onToot(e: TootEvent, kind: string): void {
    if (kind === 'hover') {
      // A hover is heard as a steady drone: a soft hearing check now and then.
      this.hoverHeard -= 1 / 60;
      if (this.hoverHeard > 0) return;
      this.hoverHeard = 1.2;
      this.vil.hear({ x: e.x, z: e.z, noise: e.gas === 'fizzy' ? 5 : 8, gas: e.gas, big: false });
      return;
    }
    if (e.noise > 0) this.vil.hear({ x: e.x, z: e.z, noise: e.noise, gas: e.gas, big: kind === 'rocket' });
    const scare = Math.max(e.push * 2.4, e.noise * 0.5);
    const n = this.vil.flock.scatter(e.x, e.z, scare) + this.vil.flock2.scatter(e.x, e.z, scare);
    if (n > 0) {
      fx.flap();
      this.sparks.burst({ at: { x: e.x, y: 0.6, z: e.z }, count: 4, speed: [1, 2], color: [0xd8d8e0, 0x9aa3b5], size: [0.06, 0.1], life: [0.6, 1], gravity: 2 });
    }
    if (this.vil.ducks.startle(e.x, e.z, e.noise * 0.6) + this.vil.fountainDucks.startle(e.x, e.z, e.noise * 0.6) > 0) fx.quack();
  }
  private hoverHeard = 0;

  private onLand(fall: number): void {
    void fall;
  }

  // ---------------------------------------------------------------------------
  // SpaceView hooks

  actions(p: PlayerState): SpaceAction[] {
    const out: SpaceAction[] = [];
    const eat = (g: Gas, spot: { x: number; z: number; range: number }) =>
      out.push({ x: spot.x, z: spot.z, range: spot.range, label: GAS[g].food, short: g === 'fizzy' ? 'Drink' : 'Eat', run: () => this.eat(g) });
    eat('beans', SPOTS.beans);
    eat('fizzy', SPOTS.fizzy);
    eat('cabbage', SPOTS.cabbage);
    // Nothing to use in reach: Interact toots (the remote's OK button).
    const near = out.some((a) => Math.hypot(a.x - p.x, a.z - p.z) <= a.range) || Math.hypot(this.door.x - p.x, this.door.z - p.z) <= 1.75;
    this.tootOnInteract = !near && this.mover.enabled && this.ctx.ui.device !== 'touch';
    if (this.tootOnInteract) out.push({ x: p.x, z: p.z, range: 0.6, label: this.mover.label(p), short: 'Toot', run: () => this.mover.press('interact') });
    return out;
  }

  kickAction(p: PlayerState): { label: string; run: () => void } | null {
    // With Interact already tooting, F and X toot too (taken in step) and the prompt shows one Toot.
    if (!this.mover.enabled || this.tootOnInteract) return null;
    return { label: this.mover.label(p), run: () => this.mover.press('kick') };
  }
  private tootOnInteract = false;

  jumpAction(p: PlayerState): { label: string; run: () => void } | null {
    if (p.grounded || !this.mover.enabled) return null;
    return { label: 'Boost', run: () => this.mover.press('jump') };
  }

  gravity(): number {
    return this.mover.gravity();
  }

  holdsTime(): boolean {
    return false;
  }

  captureInput(): CaptureLabels | null {
    return null;
  }

  cameraShot(_dt: number): CameraShot | null {
    return null;
  }

  extraColliders(): Collider[] {
    const out: Collider[] = [];
    const p = this.player;
    if (p) {
      // Townsfolk near you are solid (you bump round them).
      for (const a of this.vil.actors.values()) {
        const b = a.brain;
        if (b.mood === 'away' || Math.abs(b.x - p.x) > 5 || Math.abs(b.z - p.z) > 5) continue;
        out.push(circle(b.x, b.z, b.spec.id === 'biscuit' ? 0.3 : b.spec.id === 'pip' ? 0.3 : 0.38, a.y + (b.spec.id === 'biscuit' ? 0.5 : 1.7), 0.2, false));
      }
      // The balloon envelope: a slice at your height pushes you out sideways
      // (the top half is bouncy instead, handled in step).
      const r = balloonSlice(p.y + 0.8);
      if (r > 0.6 && p.y + 0.8 < BALLOON.cy + 1.2) out.push(circle(BALLOON.x, BALLOON.z, r, 60, 0.3, false));
    }
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
  }

  step(h: number, p: PlayerState): void {
    this.player = p;
    this.time += h;
    this.vil.setPlayer(p.x, p.y, p.z);
    this.vil.step(h);
    if (this.tootOnInteract && this.mover.enabled && this.ctx.input.take('kick')) this.mover.press('kick');
    this.mover.step(h, p);
    this.bounces(h, p);
    this.crumbStep(h, p);
    this.clouds.step(h);
    this.hud.update(h);
    this.ph.update(h);
    this.lastY = p.y;
  }

  /** Bouncy canopies and the balloon crown. */
  private bounces(_h: number, p: PlayerState): void {
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
        this.onBounce(c.id);
        return;
      }
    }
    const top = balloonTop(p.x, p.z);
    if (top !== null && this.lastY >= top - 0.4 && p.y < top + 0.05) {
      const crown = Math.hypot(p.x - BALLOON.x, p.z - BALLOON.z) < 1.6;
      const vy = crown ? 16 : Math.max(9, 0.8 * -p.vy);
      // Off the crown, slide outwards a little.
      const d = Math.hypot(p.x - BALLOON.x, p.z - BALLOON.z) || 1;
      this.ctx.impulse(crown ? 0 : ((p.x - BALLOON.x) / d) * 3, vy, crown ? 0 : ((p.z - BALLOON.z) / d) * 3);
      this.ctx.squash(-0.35);
      fx.boing(vy);
      this.ctx.shake(crown ? 0.15 : 0.08);
      this.sparks.burst({ at: { x: p.x, y: top + 0.2, z: p.z }, count: crown ? 30 : 14, shape: 'ring', speed: [2, 5], color: [0xffd24a, 0xe8574a], size: [0.1, 0.2], life: [0.4, 0.8], drag: 2 });
      this.onBounce(crown ? 'balloon-crown' : 'balloon');
    }
  }

  private onBounce(id: string): void {
    void id;
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
    // Canopies wobble after a bounce.
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
    const now = new Date();
    v.clockHands[0].rotation.z = -((now.getHours() % 12) / 12) * Math.PI * 2;
    v.clockHands[1].rotation.z = -(now.getMinutes() / 60) * Math.PI * 2;
    // Crumbs bob and spin.
    const m = new THREE.Matrix4();
    this.crumbs.forEach((c, i) => {
      const s = c.taken >= 0 ? 0 : 1 + Math.sin(t * 3 + i) * 0.08;
      m.compose(new THREE.Vector3(c.x, c.y + Math.sin(t * 2 + i) * 0.12, c.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t + i, 0)), new THREE.Vector3(s, s * 0.8, s));
      this.crumbMesh.setMatrixAt(i, m);
    });
    this.crumbMesh.instanceMatrix.needsUpdate = true;
    this.vil.update(dt, music.beat());
    this.musicLevel(focus);
    this.cloudFx.update(dt, this.clouds.list, t);
    this.dust.update(dt);
    this.sparks.update(dt);
    this.confetti.update(dt);
    this.rings.update(dt);
    this.words.update(dt, this.ctx.camera);
    const tk = this.mover.tank;
    this.ph.gauge(tk.gas, tk.amount, { cost: this.mover.previewCost });
  }
  private lastT = 0;

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
    this.hemi.intensity = 1.5 - n * 0.7;
    this.sun.color.copy(DAY.sun).lerp(NIGHT.sun, n);
    this.sun.intensity = 2.4 - n * 1.9;
    // Shadows follow the player.
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
    // Count every pass of the frame, so debugInfo reports the real cost.
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
  private drawStats = { calls: 0, triangles: 0 };

  resize(): void {
    this.post.resize();
  }

  cutaway(_cam: THREE.Vector3): void {}

  dispose(): void {
    music.stop();
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
    return {
      mode: 'fete',
      player: p ? { x: p.x, y: p.y, z: p.z, vy: p.vy, grounded: p.grounded } : null,
      gas: { type: this.mover.tank.gas, amount: Math.round(this.mover.tank.amount), hovering: this.mover.hovering, tapMode: this.mover.tapMode },
      moves: this.mover.stats,
      clouds: this.clouds.list.length,
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
}
