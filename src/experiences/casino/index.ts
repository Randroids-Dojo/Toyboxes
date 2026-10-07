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
import { Director, frame } from './director';
import { Economy } from './economy';
import { Fx } from './fx';
import { Blackjack } from './games/blackjack';
import { OldLucky } from './games/oldlucky';
import { Roulette } from './games/roulette';
import { RiverWheel } from './games/riverwheel';
import { LuckyFalls } from './games/falls';
import { FiveCardCabin } from './games/poker';
import { SAVE_DEFAULTS, type Host, type SaveData } from './host';
import { CasinoHud } from './hud';
import { ARRIVAL, BLACKJACK, CAPTAIN_TABLE, COLLIDERS, EXIT, OLD_LUCKY, SPOTS, STAGE, TELEGRAPH, zoneAt, type ColliderDef, type ZoneId } from './layout';
import { Lights } from './lighting';
import { Logbook } from './logbook';
import { Gates } from './gates';
import { Wheelhouse } from './wheelhouse';
import { makeMats, tierMats, type Mats } from './materials';
import { River } from './river';
import { Staff, type StaffId } from './staff';
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
  private roulette: Roulette;
  private wheel: RiverWheel;
  private logbook: Logbook;
  private falls: LuckyFalls;
  private wheelhouse: Wheelhouse;
  private poker: FiveCardCabin;
  private gates: Gates;
  private doors: { left: THREE.Group; right: THREE.Group; open: number } | null = null;
  private blackjack: Blackjack;
  private captain: Blackjack;
  private staff: Staff;
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
      say: (who: string, text: string) => self.staff.say(who as StaffId, text),
    };
    this.staff = new Staff(this.scene, this.mats, ctx.ui.hud, ctx.camera, [
      ['penny', -5, 8.2, Math.PI],
      ['rivet', BLACKJACK.x, BLACKJACK.z - 0.65, 0],
      ['spinner', -6.5, -4.0, 0],
      ['monty', -11.2, 2.6, Math.PI / 2],
      ['captain', CAPTAIN_TABLE.x, CAPTAIN_TABLE.z - 0.65, 0],
      ['ivory', -11.0, -7.7, (-3 * Math.PI) / 4],
      ['strum', -9.95, -8.35, Math.PI / 5],
      ['oompa', -11.45, -6.85, Math.PI / 3],
    ]);
    for (const id of ['ivory', 'strum', 'oompa'] as StaffId[]) {
      const a = this.staff.get(id)!;
      a.root.position.y = STAGE.h;
      a.seated = true;
      a.play('play', 1);
    }
    this.staff.instruments();
    this.lucky = new OldLucky(this.host);
    this.roulette = new Roulette(this.host, this.staff);
    this.blackjack = new Blackjack(this.host, this.staff, { table: 'saloon', x: BLACKJACK.x, z: BLACKJACK.z, dealer: 'rivet', title: "Rivet's Twenty-One", spot: SPOTS.blackjack, label: 'Play blackjack', short: 'Cards' });
    this.captain = new Blackjack(this.host, this.staff, { table: 'captain', x: CAPTAIN_TABLE.x, z: CAPTAIN_TABLE.z, dealer: 'captain', title: "The Captain's Table", spot: SPOTS.captain, label: "Sit at the Captain's Table", short: 'Captain' });
    this.wheel = new RiverWheel(this.host);
    this.lucky.onBonus = (b) => this.wheel.bonus(b.segment, b.value, b.mult, this.lucky.framing(), this.lucky.framing());
    this.lucky.onGrand = () => this.wheel.celebrate();
    this.lucky.tip = () => {
      this.staff.sayAt(new THREE.Vector3(TELEGRAPH.x, 2.3, TELEGRAPH.z), 'Ring me to change your bet.', 4.5);
      this.save.update((d) => (d.telegraphTip = true));
    };
    this.doors = this.buildDoors();
    this.logbook = new Logbook(this.host, this.boat.walls.find((w) => w.def.id === 'port')?.full ?? null);
    this.gates = new Gates(this.host, this.staff);
    this.falls = new LuckyFalls(this.host);
    this.poker = new FiveCardCabin(this.host);
    this.wheelhouse = new Wheelhouse(this.host, this.river);
    // Plaques and boards hung on walls go with their wall when the cutaway drops it.
    for (const [wallId, objs] of [
      ['starA', this.lucky.plaques.fame],
      ['starB', this.lucky.plaques.pay],
      ['wheelPart', this.wheelhouse.plaques],
    ] as const) {
      const wall = this.boat.walls.find((w) => w.def.id === wallId);
      if (!wall) continue;
      wall.full.updateMatrixWorld(true);
      for (const o of objs) {
        o.updateMatrixWorld(true);
        wall.full.attach(o);
      }
    }
    this.gates.openLogbook = () => this.logbook.open();

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
      // A glide down the saloon to behind you as the band plays you aboard (a cut on low and with Reduce motion).
      sound.fanfare('small');
      this.staff.get('ivory')?.play('play', 1);
      void this.director.play([
        { t: 0, f: frame(-6, 7.4, 13.5, 0, 2.0, -6, 52) },
        { t: 2.2 / this.scale, f: frame(ARRIVAL.x, 5.3, ARRIVAL.z + 6.0, ARRIVAL.x, 1.2, ARRIVAL.z, 55) },
      ], { skippableAfter: 0 });
      await new Promise((r) => setTimeout(r, 900));
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
        // Stand up from any table, then the camera pans to the gate that just opened.
        if (rank <= 2) {
          this.ctx.ui.closeAll();
          this.gates.rankUp(rank);
        }
        this.wheelhouse.ringBell();
      }, 1200 * ids.length);
    }
  }

  /** Glass doors onto the stern deck: they slide open as you come near and never block you. */
  private buildDoors(): { left: THREE.Group; right: THREE.Group; open: number } {
    const mk = (side: 1 | -1) => {
      const g = new THREE.Group();
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.6, 2.2), this.mats.glass);
      glass.position.y = 1.47;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 2.3), this.mats.brass);
      bar.position.y = 1.1;
      g.add(glass, bar);
      // A brass frame of four rails round the glass.
      for (const [y, hh, d, z] of [[0.06, 0.12, 2.5, 0], [2.88, 0.12, 2.5, 0], [1.47, 2.9, 0.12, 1.19], [1.47, 2.9, 0.12, -1.19]] as const) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, hh, d), this.mats.brass);
        rail.position.set(0, y, z);
        g.add(rail);
      }
      g.position.set(12.0, 0, side * 1.25);
      this.scene.add(g);
      return g;
    };
    return { left: mk(-1), right: mk(1), open: 0 };
  }

  private updateDoors(dt: number): void {
    const d = this.doors;
    const p = this.player;
    if (!d || !p) return;
    const near = Math.hypot(p.x - 12.15, p.z) < 3.2 || this.director.playing;
    const was = d.open;
    d.open += ((near ? 1 : 0) - d.open) * Math.min(1, dt * 5);
    if (was < 0.05 && d.open >= 0.05) sound.door();
    d.left.position.z = -1.25 - d.open * 2.3;
    d.right.position.z = 1.25 + d.open * 2.3;
  }

  // -------------------------------------------------------------------------
  // SpaceView

  actions(player: PlayerState): SpaceAction[] {
    if (player.riding) return [];
    const act = (label: string, short: string, run: () => void) => ({ label, short, run }) as SpaceAction;
    return [...this.lucky.actions(player, act), ...this.roulette.actions(player, act), ...this.blackjack.actions(player, act), ...this.wheel.actions(player, act), ...this.logbook.actions(player, act), ...this.gates.actions(player, act), ...this.falls.actions(player, act), ...this.poker.actions(player, act), ...this.wheelhouse.actions(player, act), ...this.captain.actions(player, act)];
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
    this.director.setAuto(atLever || (this.lucky.spinning && !!p && Math.hypot(p.x - SPOTS.lever.x, p.z - SPOTS.lever.z) < 3) ? this.lucky.framing() : null, 0.85);
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

  extraColliders(): Collider[] {
    return this.gates.colliders();
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
      // Also fade a column right in front of the camera (seat framings come in close).
      const near = Math.hypot(c.x - cam.x, c.z - cam.z) < 2.2 && t > 0;
      const want = (t > 0.02 && t < 0.97 && d < 0.8) || near ? 0.18 : 1;
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
    this.roulette.update(dt);
    this.wheel.update(dt, { boost: this.cer.boost });
    this.logbook.update(raw);
    this.gates.update(dt, this.player);
    this.falls.update(dt);
    this.poker.update(dt);
    this.wheelhouse.update(dt);
    this.updateDoors(raw);
    this.blackjack.update(dt);
    this.captain.update(dt);
    this.staff.update(dt, beat, p ? new THREE.Vector3(p.x, 1.4, p.z) : null);
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
    this.roulette.dispose();
    this.wheel.dispose();
    this.logbook.dispose();
    this.gates.dispose();
    this.falls.dispose();
    this.poker.dispose();
    this.wheelhouse.dispose();
    this.blackjack.dispose();
    this.captain.dispose();
    this.staff.dispose();
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
      roulette: { spinning: this.roulette.spinning, shownPocket: this.roulette.shownPocket, lastPocket: this.roulette.lastPocket, history: this.roulette.history.slice(0, 8) },
      blackjack: this.blackjack.debug(),
      wheel: { spinning: this.wheel.spinning, shownSegment: this.wheel.shownSegment, lastSegment: this.wheel.lastSegment, shownBonus: this.wheel.shownBonus },
      doors: this.doors?.open ?? 0,
      falls: { lastBits: this.falls.lastBits, shownBins: this.falls.shownBins.slice(0, 8), drops: this.falls.drops, history: this.falls.history.slice(0, 8) },
      poker: { hands: this.poker.hands, lastRank: this.poker.lastRank },
      gates: { lounge: this.gates.isOpen('lounge'), wheelhouse: this.gates.isOpen('wheelhouse') },
      captain: this.captain.debug(),
    };
  }

  /** Speeds animations up for playtests (the server is not involved). */
  debugTimeScale(k: number): number {
    this.scale = Math.max(0.1, Math.min(10, k));
    return this.scale;
  }

  /** Shows the outside as the helm would (visuals only, for screenshots). */
  debugScenery(s: 'town' | 'sunset' | 'moon'): void {
    this.river.scenery = s;
  }

  /** Reads your record from the server again (read only). */
  debugRefresh(): Promise<boolean> {
    return this.eco.load();
  }

  debugSkipCeremony(): void {
    this.director.skip();
  }

  /** Plays the bonus flight and ring for a made-up segment: visuals only, no server, no credits. */
  async debugBonus(segment: number): Promise<void> {
    const { BONUS_RING } = await import('../../shared/slots');
    const v = BONUS_RING[segment];
    const mult = typeof v === 'number' ? v : v === 'MINI' ? 20 : v === 'MAJOR' ? 100 : this.eco.jackpots.grand;
    await this.wheel.bonus(segment, v, mult, this.lucky.framing(), this.lucky.framing());
    if (typeof v === 'string') await this.cer.jackpot({ kind: v, mult, credits: mult * 10, bet: 10, orbit: this.lucky.orbit(), at: new THREE.Vector3(0, 0.75, OLD_LUCKY.z + 1.4) });
  }
}
