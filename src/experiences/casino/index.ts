// The Golden Paddle: a clockwork paddle steamer casino drifting down a
// lantern-lit river. Walk up to anything that glows and play; the server
// decides every outcome (server/casino.ts) and the boat animates it.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { chipsFor, type GameId } from '../../shared/casino/progress';
import { BETS } from '../../shared/slots';
import { disposeTree } from '../../world/kit';
import { box, circle, type Collider } from '../../world/physics';
import type { CameraShot, PlayerState, SpaceAction, SpaceView, Spot, Tier } from '../../world/space';
import { Hud, PostFX, Progress, music } from '../kit';
import { formatCredits, type ExperienceCtx } from '../common';
import { Ambience, sound } from './audio';
import { buildBoat, type BoatView } from './boat';
import { Ceremonies } from './celebrate';
import { Director } from './director';
import { Economy } from './economy';
import { Fx } from './fx';
import { OldLucky } from './games/oldlucky';
import { SAVE_DEFAULTS, type Host, type SaveData } from './host';
import { CasinoHud } from './hud';
import { ARRIVAL, COLLIDERS, EXIT, OLD_LUCKY, SPOTS, zoneAt, type ColliderDef, type ZoneId } from './layout';
import { Lights } from './lighting';
import { makeMats, tierMats, type Mats } from './materials';
import { River } from './river';
import './casino.css';

function toCollider(c: ColliderDef): Collider {
  return c.kind === 'box' ? box(c.x, c.z, c.hx, c.hz, c.rot, c.h, 0.4, false) : circle(c.x, c.z, c.r, c.h, 0.4, false);
}

export class Casino implements SpaceView {
  readonly indoor = true;
  readonly scene = new THREE.Scene();
  readonly colliders: Collider[] = [];
  readonly door: Spot = { x: EXIT.x, z: EXIT.z };
  readonly lectern = null;
  readonly chest = null;
  readonly areaDoors = [];
  readonly exhibitSpots = [];
  readonly sun: THREE.DirectionalLight;
  readonly arrival = { ...ARRIVAL };
  private mats: Mats;
  private boat: BoatView;
  private river: River;
  private lights: Lights;
  private post: PostFX;
  private tier: Tier = 'medium';
  private envTex: THREE.Texture | null = null;
  private focus = new THREE.Vector3(ARRIVAL.x, 1, ARRIVAL.z);
  private player: PlayerState | null = null;
  private lastT = 0;
  private clockS = 0;
  private scale = 1;
  private disposed = false;
  private frameInfo = { calls: 0, triangles: 0 };
  private save: Progress<SaveData>;
  private eco: Economy;
  private hud: CasinoHud;
  private kit: Hud;
  private fx: Fx;
  private director: Director;
  private cer: Ceremonies;
  private host: Host;
  private lucky: OldLucky;
  private ambience = new Ambience();
  private zone: ZoneId | null = null;
  private introShown = false;
  private greeted = false;
  private pollAt = 0;
  private playStart = performance.now();
  private longPlayNoted = false;

  constructor(private readonly ctx: ExperienceCtx) {
    this.tier = ctx.tier();
    const texScale = this.tier === 'low' ? 0.5 : 1;
    this.mats = makeMats();
    tierMats(this.mats, this.tier);
    this.river = new River(this.scene);
    this.sun = this.river.sun;
    this.boat = buildBoat(this.mats, texScale);
    this.scene.add(this.boat.group);
    this.lights = new Lights(this.mats);
    this.scene.add(this.lights.group);
    this.colliders.push(...COLLIDERS.map(toCollider));
    this.post = new PostFX(this.scene, { bloom: { strength: 0.42, radius: 0.5, threshold: 0.9 }, vignette: 0.32, saturation: 1.06, contrast: 1.05, tint: 0xffe2b8, tintAmount: 0.05, grain: 0.018 });

    this.save = new Progress<SaveData>('casino', ctx.roomId, ctx.area.id, SAVE_DEFAULTS);
    this.river.scenery = this.save.data.scenery;
    this.eco = new Economy({ roomId: ctx.roomId, areaId: ctx.area.id, browserId: ctx.browserId, name: () => ctx.name() });
    this.kit = new Hud(ctx, { accent: '#e0ac45', accent2: '#d8574a', panel: 'dark' });
    this.hud = new CasinoHud(ctx.ui.hud);
    this.fx = new Fx(this.scene);
    this.fx.colliders = COLLIDERS;
    this.director = new Director({ cuts: () => this.tier === 'low' || ctx.reduceMotion() });
    this.cer = new Ceremonies(ctx, this.kit, this.fx, this.lights, this.post, this.director);
    const self = this;
    this.host = {
      ctx,
      scene: this.scene,
      mats: this.mats,
      eco: this.eco,
      hud: this.hud,
      kit: this.kit,
      fx: this.fx,
      post: this.post,
      lights: this.lights,
      director: this.director,
      cer: this.cer,
      save: this.save,
      tier: () => this.tier,
      clock: () => this.clockS,
      timeScale: () => this.scale,
      bet: (game: GameId) => {
        const chips = chipsFor(self.eco.rank, game);
        const b = self.save.data.bet;
        if (chips.includes(b)) return b;
        return chips.filter((c) => c <= b).pop() ?? chips[0];
      },
      setBet: (n: number) => {
        self.save.update((d) => (d.bet = n));
        self.hud.setBet(n);
      },
      canAfford: (amount: number) => self.canAfford(amount),
      failed: (error: string, code: string) => self.failed(error, code),
      tried: (game: GameId) => {
        if (!self.save.data.tried[game]) self.save.update((d) => (d.tried[game] = true));
      },
      say: (_who: string, text: string) => ctx.ui.toast(text),
    };
    this.lucky = new OldLucky(this.host);
    this.lucky.onBonus = async (b) => {
      // The River Wheel's bonus ring lands here once it is built; until then the marquee shows it.
      this.kit.banner(typeof b.value === 'number' ? `${b.value}x` : `${b.value}!`, { sub: 'The bonus wheel', color: '#ffd24a', ms: 1800 });
      await new Promise((r) => setTimeout(r, 1800 / this.scale));
    };

    this.eco.onChange(() => this.paintHud());
    this.eco.onStamps = (ids, rankUp, rank) => this.stamped(ids, rankUp, rank);
    this.hud.setBet(this.host.bet('slot'));
    void this.firstLoad();
  }

  // -------------------------------------------------------------------------
  // Flows

  private async firstLoad(): Promise<void> {
    let ok = false;
    for (let i = 0; i < 4 && !ok && !this.disposed; i++) {
      if (i) await new Promise((r) => setTimeout(r, 600 * i));
      ok = await this.eco.load();
    }
    if (this.disposed) return;
    if (!ok) {
      this.ctx.ui.toast("Couldn't reach the boat. Try again in a moment.", 'bad', 4000);
      return;
    }
    // Penny's welcome: the odometer rolls up from nothing.
    this.hud.setCredits(0, { instant: true });
    this.hud.setCredits(this.eco.shown);
    this.paintHud();
    this.kit.title('The Golden Paddle', 'A riverboat of games');
    if (!this.introShown) {
      this.introShown = true;
      await this.kit.intro({
        key: 'casino-golden-paddle',
        title: 'The Golden Paddle',
        tagline: 'Play credits only, never real money.',
        tips: [
          { keys: ['move'], text: 'Walk up to anything that glows' },
          { keys: ['interact'], touch: 'Action', text: 'Press to play it' },
          { keys: [], text: 'Run out and Penny tops you up, free' },
          { keys: [], text: 'Collect stamps to open the upper rooms' },
        ],
      });
    }
    if (!this.greeted) {
      this.greeted = true;
      const st = this.eco.stats;
      this.host.say('penny', st && st.spins > 0 ? `Welcome back aboard, ${this.ctx.name()}!` : `Welcome aboard! ${formatCredits(st?.balance ?? 1000)} play credits.`);
    }
  }

  private paintHud(): void {
    this.hud.setCredits(this.eco.shown);
    this.hud.setNet(this.eco.voyageNet);
    this.hud.setRank(this.eco.stats);
    this.hud.setBet(this.host.bet('slot'));
  }

  private canAfford(amount: number): boolean {
    const st = this.eco.stats;
    if (!st) return false;
    if (this.eco.shown >= amount) return true;
    if (this.eco.shown < BETS[0]) {
      sound.error();
      this.ctx.ui.toast("You're out of credits. Visit Penny's cage for a free top up.", 'info', 4200);
    } else {
      sound.error();
      this.ctx.ui.toast(`Not enough credits for ${formatCredits(amount)}. Ring the telegraph for a smaller bet.`, 'info', 4200);
    }
    return false;
  }

  private failed(error: string, code: string): void {
    sound.error();
    if (code === 'broke') this.ctx.ui.toast(error, 'bad', 4200);
    else if (code === 'rate_limited') this.ctx.ui.toast('The boat needs a moment. Your credits were not touched.', 'bad', 4200);
    else this.ctx.ui.toast(`Couldn't reach the boat. Your credits weren't touched.`, 'bad', 4200);
    void error;
  }

  private stamped(ids: string[], rankUp: boolean, rank: number): void {
    if (ids.length) this.hud.stamp(ids);
    if (rankUp) {
      const names = ['Deckhand', 'Bosun', 'First Mate', 'Captain'];
      const opens = ['', 'The Moonlight Lounge is open', 'The Wheelhouse is open', 'Your name goes on the Captains board'];
      setTimeout(() => {
        sound.bell(3);
        sound.fanfare('big');
        this.kit.banner(`${names[rank]}!`, { sub: opens[rank], color: '#ffd24a', ms: 3200, size: 'xl' });
      }, 1200 * ids.length);
    }
  }

  // -------------------------------------------------------------------------
  // SpaceView

  actions(player: PlayerState): SpaceAction[] {
    if (player.riding) return [];
    const act = (label: string, short: string, run: () => void) => ({ range: 0, label, short, run });
    const out: SpaceAction[] = [];
    for (const a of this.lucky.actions(player, (label, short, run) => act(label, short, run) as SpaceAction)) {
      const def = Object.values(SPOTS).find((s) => s.x === a.x && s.z === a.z);
      out.push({ ...a, range: def?.range ?? 1.5 });
    }
    return out;
  }

  kickAction(player: PlayerState): { label: string; run: () => void } | null {
    if (Math.hypot(player.x - SPOTS.lever.x, player.z - SPOTS.lever.z) < 2.6 && !this.lucky.spinning) return { label: `Bet ${this.lucky['nextBet']()}`, run: () => this.lucky.kickBet() };
    if (this.fx.pileCount > 0) {
      return {
        label: 'Kick',
        run: () => {
          const fx = Math.sin(player.yaw);
          const fz = Math.cos(player.yaw);
          const n = this.fx.push(player.x + fx * 0.6, player.z + fz * 0.6, 1.4, 5, 3);
          this.ctx.swing();
          if (n) sound.coins(n);
        },
      };
    }
    return null;
  }

  cameraShot(dt: number): CameraShot | null {
    const p = this.player;
    // Standing on Old Lucky's rug frames the whole machine; it eases back as you walk off.
    const atLever = !!p && Math.hypot(p.x - SPOTS.lever.x, p.z - SPOTS.lever.z) < 1.5;
    this.director.setSeat(atLever || (this.lucky.spinning && !!p && Math.hypot(p.x - SPOTS.lever.x, p.z - SPOTS.lever.z) < 3) ? this.lucky.framing() : null, 0.85);
    return this.director.shot(dt * this.scale);
  }

  step(h: number, player: PlayerState): void {
    this.player = player;
    this.kit.update(h);
    this.hud.update(h);
    // Walking through the coin pile pushes it about.
    const sp = Math.hypot(player.vx, player.vz);
    if (sp > 0.3 && this.fx.coinCount) this.fx.push(player.x, player.z, 0.45, sp * 0.6, 0.4);
  }

  holdsTime(): boolean {
    return false;
  }

  setQuality(t: Tier): void {
    this.tier = t;
    tierMats(this.mats, t);
    this.river.setQuality(t);
    this.lights.setQuality(t);
    this.post.setQuality(t);
    this.fx.setQuality(t);
    this.scene.environment = t === 'low' ? null : this.envTex;
    this.sun.shadow.mapSize.set(t === 'high' ? 2048 : 1024, t === 'high' ? 2048 : 1024);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): boolean {
    if (!this.envTex && this.tier !== 'low') {
      const pm = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      this.envTex = pm.fromScene(room, 0.04).texture;
      room.dispose();
      pm.dispose();
      this.scene.environment = this.envTex;
      this.scene.environmentIntensity = 0.35;
    }
    renderer.info.autoReset = false;
    renderer.info.reset();
    const drew = this.post.render(renderer, camera);
    if (drew) {
      this.frameInfo.calls = renderer.info.render.calls;
      this.frameInfo.triangles = renderer.info.render.triangles;
      renderer.info.autoReset = true;
    } else {
      // The game draws the low tier itself; read the counts it left on the next frame.
      this.pendingInfo = renderer;
    }
    return drew;
  }

  private pendingInfo: THREE.WebGLRenderer | null = null;

  resize(): void {
    this.post.resize();
  }

  /**
   * The dollhouse cutaway. Exterior walls drop to their skirting when the
   * camera is outside them; any wall drops when it stands between the camera
   * and what it is looking at (the player, or a ceremony's subject).
   */
  cutaway(cam: THREE.Vector3): void {
    const f = this.director.focus ?? this.focus;
    for (const w of this.boat.walls) {
      const { a, b } = w.def;
      const camSide = (cam.x - a.x) * w.n.x + (cam.z - a.z) * w.n.z;
      const focusSide = (f.x - a.x) * w.n.x + (f.z - a.z) * w.n.z;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const dx = (b.x - a.x) / len;
      const dz = (b.z - a.z) / len;
      let cut = false;
      if (w.def.exterior && camSide < 0.25) {
        const t = (cam.x - a.x) * dx + (cam.z - a.z) * dz;
        cut = t > -5 && t < len + 5;
      }
      if (!cut && camSide > 0 !== focusSide > 0) {
        const k = camSide / (camSide - focusSide);
        const px = cam.x + (f.x - cam.x) * k;
        const pz = cam.z + (f.z - cam.z) * k;
        const t = (px - a.x) * dx + (pz - a.z) * dz;
        cut = t > -1 && t < len + 1;
      }
      if (cut !== w.cut) {
        w.cut = cut;
        w.full.visible = !cut;
        w.stub.visible = cut;
      }
    }
    for (const c of this.boat.columns) {
      const vx = f.x - cam.x;
      const vz = f.z - cam.z;
      const l2 = vx * vx + vz * vz || 1;
      const t = ((c.x - cam.x) * vx + (c.z - cam.z) * vz) / l2;
      const d = Math.hypot(cam.x + vx * t - c.x, cam.z + vz * t - c.z);
      const want = t > 0.02 && t < 0.97 && d < 0.8 ? 0.18 : 1;
      c.fade += (want - c.fade) * 0.2;
      c.mat.opacity = c.fade;
      c.mesh.castShadow = c.fade > 0.5;
    }
  }

  update(_night: number, t: number, phase: number, focus: THREE.Vector3): void {
    if (this.pendingInfo) {
      this.frameInfo.calls = this.pendingInfo.info.render.calls;
      this.frameInfo.triangles = this.pendingInfo.info.render.triangles;
      this.pendingInfo.info.autoReset = true;
      this.pendingInfo = null;
    }
    const raw = Math.min(0.1, t - (this.lastT || t));
    this.lastT = t;
    const dt = raw * this.scale;
    this.clockS += dt;
    this.focus.copy(focus);
    this.river.update(raw, phase, focus);
    this.boat.glass.emissive.copy(this.river.horizon).multiplyScalar(0.5);
    const beat = music.playing ? music.beat() : this.clockS * 1.73;
    this.lights.update(this.clockS, this.river.night, this.ctx.camera.position, beat);
    this.fx.update(dt);
    this.cer.update(dt);
    const p = this.player;
    const near = !!p && Math.hypot(p.x - SPOTS.lever.x, p.z - SPOTS.lever.z) < 3;
    this.lucky.update(dt, { night: this.river.night, near, boost: this.cer.boost });
    // Music and the river bed follow where you are.
    const z = zoneAt(focus.x, focus.z) ?? 'saloon';
    if (z !== this.zone || !music.playing) {
      this.zone = z;
      this.ambience.start();
      this.ambience.setZone(z === 'bay' ? 'saloon' : z);
    }
    this.ambience.update(raw, this.river.night);
    // Board refresh while aboard: every 20 seconds, 30 on a TV.
    const now = performance.now();
    if (now > this.pollAt && !this.lucky.spinning) {
      this.pollAt = now + (this.tier === 'low' ? 30000 : 20000);
      if (this.eco.loadedAt) void this.eco.load();
    }
    // Healthy play: one gentle note after half an hour of play.
    if (!this.longPlayNoted && now - this.playStart > 30 * 60 * 1000 && (this.eco.stats?.spins ?? 0) > 0) {
      this.longPlayNoted = true;
      this.ctx.ui.toast("You've played for 30 minutes. The river's lovely from the stern deck.", 'info', 6000);
    }
  }

  dispose(): void {
    this.disposed = true;
    music.stop();
    this.ambience.stop();
    this.director.stop();
    this.kit.dispose();
    this.hud.dispose();
    this.post.dispose();
    this.envTex?.dispose();
    this.river.dispose();
    this.lights.dispose();
    this.lucky.dispose();
    this.fx.dispose();
    this.boat.dispose();
    for (const m of this.mats.all) m.dispose();
    disposeTree(this.scene);
  }

  // -------------------------------------------------------------------------
  // Playtests: read-outs and helpers. None of them touch the server or credits.

  debugInfo() {
    const st = this.eco.stats;
    return {
      zone: zoneAt(this.focus.x, this.focus.z),
      tier: this.tier,
      frame: { ...this.frameInfo },
      spots: SPOTS,
      arrival: this.arrival,
      cut: this.boat.walls.filter((w) => w.cut).map((w) => w.def.id),
      rank: this.eco.rank,
      stamps: st?.stamps ?? [],
      stats: st ? { balance: st.balance, spent: st.spent, earned: st.earned, spins: st.spins, refillCredits: st.refillCredits ?? 0 } : null,
      shown: this.eco.shown,
      bet: this.host.bet('slot'),
      jackpots: this.eco.jackpots,
      voyage: this.eco.voyage,
      slot: { spinning: this.lucky.spinning, shownStops: [...this.lucky.shownStops], lastServerStops: this.lucky.lastServerStops, spins: this.lucky.spins, lastWin: this.lucky.lastResult?.win ?? null },
      ceremony: this.cer.current,
      coins: this.fx.coinCount,
      pile: this.fx.pileCount,
      introShown: this.introShown,
      seated: this.director.seated,
      cinematic: this.director.playing,
      oldLucky: { x: OLD_LUCKY.x, z: OLD_LUCKY.z },
    };
  }

  /** Speeds animations up for playtests (the server is not involved). */
  debugTimeScale(k: number): number {
    this.scale = Math.max(0.1, Math.min(10, k));
    return this.scale;
  }

  debugSkipCeremony(): void {
    this.director.skip();
  }
}
