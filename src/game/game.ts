// The running game: one town, the room or inner area you are standing in,
// your toy figure, the vehicles, and the flows for claiming and editing rooms.

import * as THREE from 'three';
import { Engine, setMusicVolume, setVolume, sfx, suspendAudio, unlockAudio } from '../audio/sfx';
import * as local from '../core/local';
import { APP_VERSION, newerVersion } from '../core/update';
import { IS_TV, type Input } from '../input/input';
import type { TouchControls } from '../input/touch';
import { api, retryText } from '../net/api';
import { ARCADES, EMPTY_CONTENT, exhibitsIn, type Area, type ArcadeId, type Exhibit, type Experience, type RoomPublic, type SlotSummary } from '../shared/model';
import { askName, choose, confirmBox, pinPad } from '../ui/dialogs';
import { openSketchbook, type EditSession } from '../ui/sketchbook';
import { h, type UI } from '../ui/ui';
import { Avatar, shirtFor, type Pose, type PoseFn } from '../world/avatar';
import { Interior } from '../world/interior';
import { disposeTree } from '../world/kit';
import { circle, clamp, damp, groundHeight, rayFraction, resolveCircle, wrapAngle, type Collider } from '../world/physics';
import { Sky, dayPhase } from '../world/sky';
import { Town, type Entrance } from '../world/town';
import { Toys, type Mover, type ToyEvent } from '../world/toys';
import { Vehicle } from '../world/vehicles';
import type { ExperienceCtx } from '../experiences/common';
import type { CameraShot, CaptureLabels, PlayerState, SpaceView, Tier } from '../world/space';
import { Arranger } from './arrange';
import { CameraRig } from './camera';
import { controlsPanel, pauseMenu, settingsPanel } from './menus';

type WorldClass = new (ctx: ExperienceCtx) => SpaceView;

/** Each world's code downloads the first time it is needed, so the town never loads all of them. */
const WORLD_CODE: Record<Experience['kind'], () => Promise<WorldClass>> = {
  kart: () => import('../experiences/kart/index').then((m) => m.KartWorld),
  casino: () => import('../experiences/casino').then((m) => m.Casino),
  galaxy: () => import('../experiences/galaxy').then((m) => m.Galaxy),
  neon: () => import('../experiences/neon/index').then((m) => m.NeonParty),
  fart: () => import('../experiences/fart').then((m) => m.FartSimulator),
};
const worldLoads = new Map<Experience['kind'], Promise<WorldClass>>();

/** Starts (or reuses) the download of a world's code; a failed download can be tried again. */
function worldCode(kind: Experience['kind']): Promise<WorldClass> {
  let p = worldLoads.get(kind);
  if (!p) {
    p = WORLD_CODE[kind]();
    p.catch(() => worldLoads.delete(kind));
    worldLoads.set(kind, p);
  }
  return p;
}

type Space =
  | { kind: 'hub' }
  | { kind: 'room'; room: RoomPublic; interior: Interior }
  | { kind: 'area'; room: RoomPublic; area: Area; interior: SpaceView };

interface Interactable {
  x: number;
  z: number;
  range: number;
  label: string;
  /** Short label for the touch button. */
  short: string;
  run: () => void;
}

const PLAYER_R = 0.36;
const WALK = 6.0;
/** Jumps clear about 1.2 m, enough to land on a toy block. Spaces can lower gravity. */
const GRAVITY = 24;
const JUMP_SPEED = 7.6;
const IDLE_RELOCK_MS = 5 * 60 * 1000;

export class Game {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly rig: CameraRig;
  private sky: Sky;
  private town: Town;
  private hubToys: Toys;
  private vehicles: Vehicle[] = [];
  private space: Space = { kind: 'hub' };
  private toys: Toys;
  private avatar: Avatar;
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector2();
  /** Vertical speed on foot; pos.y is the height of your feet. */
  private vy = 0;
  private grounded = true;
  /** Top of whatever is under you, for the shadow. */
  private groundY = 0;
  private yaw = Math.PI;
  private riding: Vehicle | null = null;
  private engine = new Engine();
  private slots: SlotSummary[] | null = null;
  private settings = local.settings();
  private session: { roomId: string; slot: number; token: string; expiresAt: number; lastActive: number } | null = null;
  private arranger: Arranger | null = null;
  private busy = false;
  private paused = false;
  private stepDist = 0;
  private movedFor = 0;
  private hintTimer = 0;
  private worldTimer = 0;
  private worldFailures = 0;
  private current: Interactable | null = null;
  private fadeEl: HTMLElement;
  private renderScale = 1;
  /** The experience's directed camera and input capture this frame. */
  private shot: CameraShot | null = null;
  /** How far a shot's pivot check has lifted the blended camera, eased. */
  private shotLift = 0;
  /** Set while the experience carries the player (see SpaceView.carry). */
  private carrying: { pose: Pose; speed: number } | null = null;
  /** A pose the experience asked for on foot. */
  private worldPose: Pose | PoseFn | null = null;
  private capture: CaptureLabels | null = null;
  private frameTimes: number[] = [];
  private lastScaleChange = 0;
  /** Graphics tier: fixed by the settings, or measured on Auto. */
  private tier: Tier = 'high';
  private tierCeiling: Tier = 'high';
  private lastTierChange = 0;
  private perf = { fps: 0, mean: 0, p75: 0, worst: 0 };
  private perfEl: HTMLElement;
  private shadowSize = 1024;
  /** Set by main when a newer deploy is live. */
  private updateReady = false;

  constructor(
    readonly renderer: THREE.WebGLRenderer,
    readonly input: Input,
    readonly touch: TouchControls,
    readonly ui: UI,
  ) {
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 400);
    this.rig = new CameraRig(this.camera);
    this.sky = new Sky(this.scene);
    this.town = new Town();
    this.scene.add(this.town.group);
    this.hubToys = new Toys(this.town.toyLayout);
    this.scene.add(this.hubToys.group);
    this.toys = this.hubToys;
    for (const v of this.town.vehicleSpots) {
      const veh = new Vehicle(v.kind, `${v.kind}-${v.x}`, v.x, v.z, v.yaw, v.color);
      this.vehicles.push(veh);
      this.scene.add(veh.root);
    }
    const id = local.identity();
    this.avatar = new Avatar(shirtFor(id.name ?? 'Toy'));
    this.scene.add(this.avatar.root);
    this.pos.set(this.town.spawn.x, 0, this.town.spawn.z);
    this.yaw = this.town.spawn.yaw;
    this.rig.snap(this.follow(), this.yaw);
    this.fadeEl = h('div', { class: 'fade' });
    document.body.appendChild(this.fadeEl);
    this.perfEl = h('div', { class: 'perf hidden', 'aria-hidden': 'true' });
    ui.hud.appendChild(this.perfEl);
    this.applySettings(this.settings);

    ui.onMenuButton = () => this.openPause();
    ui.onLockButton = () => this.lock(true);
    input.onPadLost = () => this.openPause('Controller disconnected. Reconnect it, or carry on with the keyboard or touch.');
  }

  // -------------------------------------------------------------------------
  // Boot

  async start(): Promise<void> {
    const id = local.identity();
    void this.loadWorld();
    const ret = local.returnSpot();
    // /?room=<id> opens a room directly (used by the admin page and for sharing).
    const deep = new URLSearchParams(location.search).get('room');
    if (deep && /^[a-zA-Z0-9_-]{6,32}$/.test(deep)) {
      history.replaceState(null, '', location.pathname);
      void this.enterRoom(deep);
    } else if (ret) {
      local.setReturnSpot(null);
      if (ret.space === 'hub') {
        this.placePlayer(ret.x, ret.z, ret.yaw);
      } else if (ret.roomId) {
        void this.enterRoom(ret.roomId, { areaId: ret.areaId, at: ret });
      }
    }
    if (!id.name) {
      const name = await askName(this.ui, { current: null, first: true });
      if (name) {
        local.setName(name);
        this.avatar.setShirt(shirtFor(name));
      }
    }
    this.hintTimer = 14;
  }

  private async loadWorld(): Promise<void> {
    const r = await api.world();
    if (r.ok) {
      this.slots = r.data.slots;
      this.worldFailures = 0;
      this.town.setSlots(this.slots);
      // Forget a remembered room that no longer exists.
      const mine = local.myRoom();
      if (mine && !this.slots.some((s) => s.roomId === mine.roomId)) local.setMyRoom(null);
    } else {
      this.worldFailures++;
      if (this.worldFailures === 1) this.ui.toast("Couldn't load the rooms yet. Still trying.", 'bad');
    }
    this.worldTimer = r.ok ? 45 : Math.min(30, 3 * this.worldFailures);
  }

  // -------------------------------------------------------------------------
  // Settings and quality

  applySettings(s: local.Settings): void {
    this.settings = s;
    setVolume(s.volume);
    setMusicVolume(s.music);
    document.documentElement.classList.toggle('large-text', s.largeText || IS_TV);
    document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
    const q: Tier = s.quality === 'auto' ? (IS_TV || matchMedia('(pointer: coarse)').matches ? 'medium' : 'high') : s.quality;
    this.tierCeiling = s.quality === 'auto' ? 'high' : q;
    this.setTier(q);
    this.renderScale = q === 'low' ? 0.6 : q === 'medium' ? 0.85 : 1;
    this.applyPixelRatio();
    this.updateTouchVisibility();
    this.perfEl.classList.toggle('hidden', !s.showFps);
  }

  private setTier(t: Tier): void {
    this.tier = t;
    this.shadowSize = t === 'high' ? 2048 : t === 'medium' ? 1024 : 0;
    this.renderer.shadowMap.enabled = this.shadowSize > 0;
    this.sky.setShadowQuality(this.shadowSize);
    const sv = this.view();
    if (sv) {
      sv.sun.castShadow = this.shadowSize > 0;
      sv.setQuality?.(t);
    }
  }

  private applyPixelRatio(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, IS_TV ? 1 : 2);
    this.renderer.setPixelRatio(dpr * this.renderScale);
  }

  /**
   * Measures frame times every 40 frames. On Auto, long frames first trim the
   * render resolution, then drop the graphics tier; spare time raises them.
   */
  private adaptQuality(frameMs: number, now: number): void {
    this.frameTimes.push(frameMs);
    if (this.frameTimes.length < 40) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    this.frameTimes = [];
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    this.perf = { fps: Math.round(1000 / Math.max(1, mean)), mean, p75, worst: sorted[sorted.length - 1] };
    if (this.settings.showFps) this.perfEl.textContent = `${this.perf.fps} fps · ${p75.toFixed(1)} ms · ${this.tier[0].toUpperCase()}${this.tier.slice(1)} · ${this.renderScale.toFixed(2)}x`;
    if (this.settings.quality !== 'auto' || document.hidden) return;
    const order: Tier[] = ['low', 'medium', 'high'];
    const idx = order.indexOf(this.tier);
    if (p75 > 24) {
      if (this.renderScale > 0.55 && now - this.lastScaleChange > 1500) {
        this.renderScale = Math.max(0.55, this.renderScale - 0.1);
        this.lastScaleChange = now;
        this.applyPixelRatio();
      } else if (this.renderScale <= 0.55 && idx > 0 && now - this.lastTierChange > 4000) {
        this.lastTierChange = now;
        this.renderScale = 0.85;
        this.applyPixelRatio();
        this.setTier(order[idx - 1]);
      }
    } else if (p75 < 12) {
      if (this.renderScale < 1 && now - this.lastScaleChange > 1500) {
        this.renderScale = Math.min(1, this.renderScale + 0.05);
        this.lastScaleChange = now;
        this.applyPixelRatio();
      } else if (this.renderScale >= 1 && idx < order.indexOf(this.tierCeiling) && now - this.lastTierChange > 10000) {
        this.lastTierChange = now;
        this.setTier(order[idx + 1]);
      }
    }
  }

  updateTouchVisibility(): void {
    const t = this.settings.touchControls;
    const show = t === 'show' || (t === 'auto' && this.ui.device === 'touch');
    this.touch.setVisible(show && !this.arranger);
    this.ui.setMenuButton(!show);
  }

  resize(): void {
    const w = innerWidth;
    const hh = innerHeight;
    this.renderer.setSize(w, hh, false);
    this.camera.aspect = w / hh;
    this.camera.fov = w < hh ? 68 : 55;
    this.camera.updateProjectionMatrix();
    this.view()?.resize?.(w, hh);
  }

  // -------------------------------------------------------------------------
  // Edit sessions (PIN unlock)

  private editSession(): EditSession {
    return {
      token: () => this.token(),
      touch: () => {
        if (this.session) this.session.lastActive = Date.now();
      },
      unlock: (reason) => this.unlock(reason),
    };
  }

  private token(): string | null {
    const s = this.session;
    const room = this.currentRoom();
    if (!s || !room || s.roomId !== room.id) return null;
    if (Date.now() > s.expiresAt - 5000) {
      this.lock(false);
      return null;
    }
    return s.token;
  }

  private currentRoom(): RoomPublic | null {
    return this.space.kind === 'hub' ? null : this.space.room;
  }

  private lock(announce: boolean): void {
    if (!this.session) return;
    this.session = null;
    this.ui.setLocked(false);
    if (announce) this.ui.toast('Editing locked');
  }

  /** Opens the PIN pad for the room you are in. Resolves to a token or null. */
  private unlock(reason?: string): Promise<string | null> {
    const room = this.currentRoom();
    if (!room) return Promise.resolve(null);
    const existing = this.token();
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      let settled = false;
      const pad = pinPad(this.ui, {
        title: `Room ${room.slot + 1} PIN`,
        note: reason ?? `Enter the PIN for ${room.ownerName}'s room to make changes.`,
        submitLabel: 'Unlock',
        onSubmit: async (pin) => {
          const r = await api.unlock(room.id, pin);
          if (!r.ok) {
            if (r.code === 'wrong_pin') {
              const left = Number(r.extra.attemptsLeft);
              return left > 0 ? `That PIN is not right. ${left} ${left === 1 ? 'try' : 'tries'} left for now.` : r.error;
            }
            return `${r.error}.${retryText(r)}`;
          }
          this.session = { roomId: room.id, slot: room.slot, token: r.data.token, expiresAt: r.data.expiresAt, lastActive: Date.now() };
          local.setMyRoom({ roomId: room.id, slot: room.slot });
          this.ui.setLocked(true);
          sfx.confirm();
          settled = true;
          this.ui.close(pad);
          resolve(r.data.token);
          return null;
        },
        onCancel: () => {
          if (!settled) resolve(null);
        },
      });
    });
  }

  // -------------------------------------------------------------------------
  // Spaces

  private fade(on: boolean): Promise<void> {
    this.fadeEl.classList.toggle('on', on);
    return new Promise((r) => setTimeout(r, on ? 200 : 10));
  }

  private placePlayer(x: number, z: number, yaw: number): void {
    if (this.riding) {
      this.riding.pos.set(x, 0, z);
      this.riding.yaw = yaw;
      this.riding.speed = 0;
      this.riding.boost = 0;
      this.riding.drift = 0;
      this.riding.sync();
    }
    this.pos.set(x, 0, z);
    this.vel.set(0, 0);
    this.vy = 0;
    this.grounded = true;
    this.groundY = 0;
    this.yaw = yaw;
    this.avatar.root.position.copy(this.pos);
    this.avatar.root.rotation.y = yaw;
    this.rig.snap(this.follow(), yaw);
  }

  private colliders(): Collider[] {
    if (this.space.kind === 'hub') {
      const vs = this.vehicles.filter((v) => v !== this.riding).map((v) => circle(v.pos.x, v.pos.z, v.t.radius * 0.9, 1.2, 0.6, false));
      return this.town.colliders.concat(this.hubToys.colliders, vs);
    }
    const sv = this.view()!;
    const parked = this.rideables()
      .filter((v) => v !== this.riding)
      .map((v) => circle(v.pos.x, v.pos.z, v.t.radius * 0.9, 1.2, 0.6, false));
    return sv.colliders.concat(this.toys.colliders, sv.extraColliders?.() ?? [], parked);
  }

  /** Vehicles you can ride where you are. */
  private rideables(): Vehicle[] {
    if (this.space.kind === 'hub') return this.vehicles;
    return this.view()?.rideables?.() ?? [];
  }

  /** The room, area or experience you are in, through its common interface. */
  private view(): SpaceView | null {
    return this.space.kind === 'hub' ? null : this.space.interior;
  }

  private currentScene(): THREE.Scene {
    return this.space.kind === 'hub' ? this.scene : this.space.interior.scene;
  }

  private playerState(): PlayerState {
    return { x: this.pos.x, z: this.pos.z, y: this.pos.y, vy: this.vy, grounded: this.grounded, yaw: this.yaw, vx: this.vel.x, vz: this.vel.y, riding: this.riding };
  }

  private setScene(space: Space): void {
    const old = this.space;
    // Whatever the last world set on the player goes with it.
    this.avatar.hold(null);
    this.worldPose = null;
    this.carrying = null;
    this.shot = null;
    this.capture = null;
    if (old.kind !== 'hub') {
      old.interior.scene.remove(this.toys.group, this.avatar.root);
      disposeTree(this.toys.group);
      old.interior.dispose();
    }
    this.space = space;
    if (space.kind === 'hub') {
      this.toys = this.hubToys;
      this.scene.add(this.avatar.root);
      this.rig.indoor = false;
    } else {
      const layout = space.kind === 'room' ? space.room.layout : space.area.experience ? [] : space.area.props;
      this.toys = new Toys(layout);
      space.interior.scene.add(this.toys.group, this.avatar.root);
      this.rig.indoor = space.interior.indoor;
      space.interior.sun.castShadow = this.shadowSize > 0;
      const sv: SpaceView = space.interior;
      sv.setQuality?.(this.tier);
      sv.resize?.(innerWidth, innerHeight);
    }
  }

  private roomTitle(room: RoomPublic): string {
    return `${room.ownerName}'s room`;
  }

  async enterRoom(roomId: string, opts: { areaId?: string; at?: { x: number; z: number; yaw: number }; fresh?: RoomPublic } = {}): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    if (this.riding) this.dismount();
    sfx.door();
    await this.fade(true);
    let room = opts.fresh ?? null;
    if (!room) {
      const r = await api.room(roomId);
      if (!r.ok) {
        this.busy = false;
        await this.fade(false);
        this.ui.toast(r.status === 404 ? 'That room is not claimed any more' : `Couldn't open the room. ${r.error}`, 'bad', 3600);
        if (r.status === 404) void this.loadWorld();
        return;
      }
      room = r.data.room;
    }
    const prevRoom = this.currentRoom();
    if (this.session && (!prevRoom || prevRoom.id !== room.id) && this.session.roomId !== room.id) this.lock(false);
    const area = opts.areaId ? room.content.areas.find((a) => a.id === opts.areaId) : undefined;
    if (!area || !(await this.buildArea(room, area))) this.buildRoom(room);
    const arrival = this.space.kind === 'hub' ? null : this.space.interior.arrival;
    if (opts.at) this.placePlayer(opts.at.x, opts.at.z, opts.at.yaw);
    else if (arrival) this.placePlayer(arrival.x, arrival.z, arrival.yaw);
    this.busy = false;
    await this.fade(false);
  }

  private buildRoom(room: RoomPublic): void {
    const content = room.content ?? EMPTY_CONTENT;
    const interior = new Interior({
      kind: 'main',
      title: this.roomTitle(room),
      exitLabel: 'Back to town',
      theme: room.theme,
      exhibits: exhibitsIn(content, 'main'),
      areas: content.areas,
    });
    this.setScene({ kind: 'room', room, interior });
    // Fetch the code for this room's worlds now, so their doors open without a wait.
    for (const d of interior.areaDoors) if (d.area.experience) void worldCode(d.area.experience.kind);
  }

  private experienceCtx(room: RoomPublic, area: Area): ExperienceCtx {
    return {
      ui: this.ui,
      roomId: room.id,
      ownerName: room.ownerName,
      area,
      browserId: local.identity().browserId,
      name: () => local.identity().name ?? 'Player',
      snapCamera: (yaw) => this.rig.snap(this.follow(), yaw),
      camera: this.camera,
      shake: (amount) => this.rig.shake(amount),
      input: this.input,
      reduceMotion: () => this.settings.reduceMotion,
      tier: () => this.tier,
      cameraYaw: () => this.controlYaw(),
      pose: (p) => (this.worldPose = p),
      bones: () => this.avatar.bones(),
      swing: () => this.avatar.swing(),
      hold: (obj) => this.avatar.hold(obj),
      squash: (amount) => this.avatar.squash(amount),
      teleport: (x, z, yaw, y = 0) => {
        this.placePlayer(x, z, yaw);
        if (y) {
          this.pos.y = y;
          this.groundY = groundHeight(x, z, PLAYER_R * 0.7, this.colliders(), y + 0.01);
          this.grounded = y <= this.groundY + 0.02;
          this.avatar.root.position.copy(this.pos);
        }
        this.rig.snap(this.follow(), yaw);
      },
      impulse: (vx, vy, vz) => {
        this.vel.x += vx;
        this.vel.y += vz;
        if (vy) {
          this.vy = vy;
          this.grounded = false;
        }
      },
    };
  }

  /** Builds an inner area. False when its world's code could not be downloaded; nothing changes then. */
  private async buildArea(room: RoomPublic, area: Area): Promise<boolean> {
    const kind = area.experience?.kind;
    if (kind && WORLD_CODE[kind]) {
      let World: WorldClass;
      try {
        World = await worldCode(kind);
      } catch {
        // A tab opened before a release asks for world code that is gone now: reload into the new version, at this door.
        if (await newerVersion(APP_VERSION)) {
          const door = this.view()?.areaDoors.find((d) => d.area.id === area.id);
          local.setReturnSpot({ space: 'room', roomId: room.id, x: door?.x ?? 0, z: (door?.z ?? 0) + 0.6, yaw: Math.PI, at: Date.now() });
          location.reload();
          return false;
        }
        this.ui.toast(`Couldn't load ${area.name}. Check the connection and try again.`, 'bad', 3600);
        return false;
      }
      this.setScene({ kind: 'area', room, area, interior: new World(this.experienceCtx(room, area)) });
      return true;
    }
    const interior = new Interior({
      kind: 'area',
      title: area.name,
      exitLabel: `Back to ${room.ownerName}'s room`,
      theme: area.theme,
      exhibits: exhibitsIn(room.content, area.id),
      areas: [],
    });
    this.setScene({ kind: 'area', room, area, interior });
    return true;
  }

  private async enterArea(area: Area): Promise<void> {
    if (this.space.kind !== 'room' || this.busy) return;
    this.busy = true;
    const room = this.space.room;
    sfx.door();
    await this.fade(true);
    if (await this.buildArea(room, area)) {
      const arrival = (this.space as { interior: SpaceView }).interior.arrival;
      this.placePlayer(arrival.x, arrival.z, arrival.yaw);
    }
    this.busy = false;
    await this.fade(false);
  }

  private async leaveArea(): Promise<void> {
    if (this.space.kind !== 'area' || this.busy) return;
    if (this.riding) this.dismount();
    this.busy = true;
    const { room, area } = this.space;
    sfx.door();
    await this.fade(true);
    this.buildRoom(room);
    const door = this.view()!.areaDoors.find((d) => d.area.id === area.id);
    if (door) this.placePlayer(door.x, door.z + 0.6, 0);
    this.busy = false;
    await this.fade(false);
  }

  private async exitToHub(): Promise<void> {
    if (this.space.kind === 'hub' || this.busy) return;
    if (this.riding) this.dismount();
    this.busy = true;
    const slot = this.space.room.slot;
    sfx.door();
    await this.fade(true);
    if (this.session) this.lock(true);
    this.setScene({ kind: 'hub' });
    const e = this.town.entrances.find((en) => en.kind === 'house' && en.slot === slot);
    // Step out onto the path so the camera has room behind you.
    if (e) this.placePlayer(e.x + Math.sin(e.outYaw) * 2.2, e.z + Math.cos(e.outYaw) * 2.2, e.outYaw);
    this.busy = false;
    void this.loadWorld();
    await this.fade(false);
  }

  // -------------------------------------------------------------------------
  // Interactions

  private interactables(): Interactable[] {
    const out: Interactable[] = [];
    if (this.riding) return out;
    if (this.space.kind === 'hub') {
      for (const e of this.town.entrances) out.push(...this.entranceAction(e));
      for (const v of this.vehicles) {
        out.push({
          x: v.pos.x,
          z: v.pos.z,
          range: v.kind === 'kart' ? 2.0 : 1.6,
          label: v.kind === 'kart' ? 'Drive the go-kart' : 'Ride the scooter',
          short: v.kind === 'kart' ? 'Drive' : 'Ride',
          run: () => this.mount(v),
        });
      }
      return out;
    }
    const sp = this.space;
    const it = sp.interior;
    if (sp.kind === 'room') {
      out.push({ x: it.door.x, z: it.door.z, range: 1.7, label: 'Back to town', short: 'Exit', run: () => void this.exitToHub() });
      if (it.lectern) {
        const writing = !!this.session && this.session.roomId === sp.room.id;
        out.push({ x: it.lectern.x, z: it.lectern.z, range: 1.6, label: writing ? 'Open the sketchbook' : 'Read the sketchbook', short: writing ? 'Sketch' : 'Read', run: () => void this.openBook() });
      }
      if (it.chest) out.push({ x: it.chest.x, z: it.chest.z, range: 1.6, label: 'Arrange toys', short: 'Arrange', run: () => void this.openArrange() });
      for (const d of it.areaDoors) out.push({ x: d.x, z: d.z, range: 1.6, label: `Enter ${d.area.name}`, short: 'Enter', run: () => void this.enterArea(d.area) });
    } else {
      out.push({ x: it.door.x, z: it.door.z, range: 1.7, label: `Back to ${sp.room.ownerName}'s room`, short: 'Exit', run: () => void this.leaveArea() });
      const view = it as SpaceView;
      for (const v of view.rideables?.() ?? []) {
        out.push({ x: v.pos.x, z: v.pos.z, range: v.kind === 'kart' ? 2.0 : 1.6, label: v.kind === 'kart' ? 'Drive the go-kart' : 'Ride the scooter', short: v.kind === 'kart' ? 'Drive' : 'Ride', run: () => this.mount(v) });
      }
      out.push(...(view.actions?.(this.playerState()) ?? []));
    }
    for (const e of it.exhibitSpots) out.push({ x: e.x, z: e.z, range: 1.5, label: `Play ${e.exhibit.title}`, short: 'Play', run: () => void this.playExhibit(e.exhibit) });
    return out;
  }

  private entranceAction(e: Entrance): Interactable[] {
    if (e.kind === 'arcade') {
      const a = ARCADES.find((x) => x.id === e.arcade)!;
      return [{ x: e.x, z: e.z, range: 2.2, label: `Visit ${a.name}`, short: 'Visit', run: () => void this.visitArcade(a.id) }];
    }
    if (!this.slots) return [];
    const s = this.slots[e.slot];
    if (s?.roomId && s.ownerName) {
      const mine = local.myRoom()?.roomId === s.roomId;
      return [{ x: e.x, z: e.z, range: 1.9, label: mine ? 'Enter your room' : `Enter ${s.ownerName}'s room`, short: 'Enter', run: () => void this.enterRoom(s.roomId!) }];
    }
    if (s?.roomId) return [];
    return [{ x: e.x, z: e.z, range: 1.9, label: `Claim room ${e.slot + 1}`, short: 'Claim', run: () => void this.claim(e.slot) }];
  }

  private pickInteractable(): Interactable | null {
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const it of this.interactables()) {
      const dx = it.x - this.pos.x;
      const dz = it.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > it.range) continue;
      const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      const score = d - facing * 0.6;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    return best;
  }

  private mount(v: Vehicle): void {
    if (v.ridden) return;
    this.riding = v;
    v.ridden = true;
    this.vel.set(0, 0);
    this.vy = 0;
    this.grounded = true;
    this.pos.y = 0;
    this.currentScene().remove(this.avatar.root);
    v.seat.add(this.avatar.root);
    this.avatar.root.position.set(0, 0, 0);
    this.avatar.root.rotation.set(0, 0, 0);
    this.engine.start(v.kind);
    sfx.mount();
    if (!local.seenHint(`ride-${this.ui.device}`)) {
      local.markHint(`ride-${this.ui.device}`);
      this.ui.toast(this.ui.device === 'pad' ? 'RT to go, LT to brake, A to get off' : this.ui.device === 'touch' ? 'Push the stick up to go. Brake button stops.' : 'W to go, S to brake, E to get off');
    }
  }

  private dismount(): void {
    const v = this.riding;
    if (!v) return;
    this.riding = null;
    v.ridden = false;
    this.engine.stop();
    v.seat.remove(this.avatar.root);
    this.currentScene().add(this.avatar.root);
    // Step off to the side that has room.
    const rx = -Math.cos(v.yaw);
    const rz = Math.sin(v.yaw);
    const cols = this.colliders();
    let placed = false;
    for (const side of [1, -1]) {
      const p = { x: v.pos.x + rx * side * (v.t.radius + 0.7), z: v.pos.z + rz * side * (v.t.radius + 0.7) };
      const test = { ...p };
      const hit = resolveCircle(test, PLAYER_R, cols);
      if (!hit || hit.depth < 0.05) {
        this.pos.set(test.x, 0, test.z);
        placed = true;
        break;
      }
    }
    if (!placed) this.pos.set(v.pos.x - Math.sin(v.yaw) * (v.t.radius + 0.8), 0, v.pos.z - Math.cos(v.yaw) * (v.t.radius + 0.8));
    this.yaw = v.yaw;
    this.vel.set(Math.sin(v.yaw) * v.speed * 0.3, Math.cos(v.yaw) * v.speed * 0.3);
    v.speed *= 0.5;
    this.avatar.root.position.copy(this.pos);
    sfx.mount();
  }

  private async visitArcade(id: ArcadeId): Promise<void> {
    const a = ARCADES.find((x) => x.id === id)!;
    const go = await confirmBox(this.ui, {
      title: `Visit ${a.name}?`,
      body: `It opens ${a.host} in this tab. Use your browser's Back button to come back to Toyboxes.`,
      ok: 'Go',
      cancel: 'Stay here',
    });
    if (!go) return;
    this.leaveFor(a.url, { space: 'hub', x: this.pos.x, z: this.pos.z, yaw: this.yaw });
  }

  private async playExhibit(e: Exhibit): Promise<void> {
    const go = await confirmBox(this.ui, {
      title: e.title,
      body: h('div', {}, e.blurb ? h('p', {}, e.blurb) : '', h('p', { class: 'muted' }, 'It opens in this tab. Use Back to come back to this room.')),
      ok: 'Play',
      cancel: 'Not now',
    });
    if (!go || this.space.kind === 'hub') return;
    this.leaveFor(e.url, {
      space: this.space.kind,
      roomId: this.space.room.id,
      areaId: this.space.kind === 'area' ? this.space.area.id : undefined,
      x: this.pos.x,
      z: this.pos.z,
      yaw: this.yaw + Math.PI,
    });
  }

  private leaveFor(url: string, spot: Omit<local.ReturnSpot, 'at'>): void {
    local.setReturnSpot({ ...spot, at: Date.now() });
    this.lock(false);
    this.fadeEl.classList.add('on');
    setTimeout(() => {
      location.href = url;
    }, 180);
  }

  /** Back from an arcade through the bfcache: the page was never unloaded. */
  restored(): void {
    local.setReturnSpot(null);
    this.fadeEl.classList.remove('on');
    this.input.releaseAll();
    this.busy = false;
  }

  // -------------------------------------------------------------------------
  // Claim, rename, book, arrange

  private async claim(slot: number): Promise<void> {
    const id = local.identity();
    const mine = local.myRoom();
    if (mine && this.slots?.some((s) => s.roomId === mine.roomId)) {
      const pick = await choose(this.ui, {
        title: `Room ${slot + 1} is free`,
        body: `You already have room ${mine.slot + 1}. Each visitor gets one room.`,
        options: [{ label: 'Go to my room', value: 'go', primary: true }],
        cancel: 'Close',
      });
      if (pick === 'go') {
        const e = this.town.entrances.find((en) => en.kind === 'house' && en.slot === mine.slot);
        if (e) this.ui.toast(`Your room is number ${mine.slot + 1}`, 'info');
      }
      return;
    }
    const step = await choose(this.ui, {
      title: `Claim room ${slot + 1}?`,
      body: `It will say ${id.name}'s room on the door. Anyone can visit. A four-digit PIN keeps the editing yours.`,
      options: [
        { label: 'Choose a PIN', value: 'pin', primary: true },
        { label: 'Change my name first', value: 'name' },
      ],
      cancel: 'Not now',
    });
    if (step === 'name') {
      await this.rename();
      return this.claim(slot);
    }
    if (step !== 'pin') return;
    let first = '';
    const firstPad = pinPad(this.ui, {
      title: 'Choose a PIN',
      note: 'Four digits. You need it to change your room, from any device. Keep it to yourself.',
      submitLabel: 'Next',
      onSubmit: async (pin) => {
        first = pin;
        this.ui.close(firstPad);
        confirmPad();
        return null;
      },
    });
    const confirmPad = () => {
      const pad = pinPad(this.ui, {
        title: 'Enter it again',
        note: `Same four digits, to be sure.`,
        submitLabel: 'Claim',
        onSubmit: async (pin) => {
          if (pin !== first) return "That doesn't match the first PIN. Try again.";
          const name = local.identity().name ?? 'Visitor';
          const r = await api.claim(slot, name, first, pin, id.browserId);
          if (!r.ok) {
            if (r.status === 0 || r.status >= 500) return `${r.error}. Nothing was claimed yet. Try again.`;
            this.ui.close(pad);
            if (r.code === 'has_room' && typeof r.extra.roomId === 'string') local.setMyRoom({ roomId: r.extra.roomId, slot: Number(r.extra.slot) });
            await confirmBox(this.ui, { title: "Couldn't claim the room", body: `${r.error}.${retryText(r)}`, ok: 'OK', cancel: 'Close' });
            void this.loadWorld();
            return null;
          }
          this.ui.close(pad);
          const room = r.data.room;
          this.session = { roomId: room.id, slot: room.slot, token: r.data.token, expiresAt: r.data.expiresAt, lastActive: Date.now() };
          local.setMyRoom({ roomId: room.id, slot: room.slot });
          if (this.slots) {
            this.slots[slot] = { slot, roomId: room.id, ownerName: room.ownerName, theme: room.theme, hasContent: false };
            this.town.setSlots(this.slots);
          }
          sfx.goal();
          this.ui.banner(`Room ${slot + 1} is yours`, '#ffd24a');
          setTimeout(async () => {
            await this.enterRoom(room.id, { fresh: room });
            this.ui.setLocked(true);
            this.ui.toast('Open the sketchbook to ask for a game. The toy chest has toys.', 'good', 5200);
          }, 900);
          return null;
        },
      });
    };
  }

  private async rename(): Promise<void> {
    const id = local.identity();
    const name = await askName(this.ui, { current: id.name, first: false });
    if (!name || name === id.name) return;
    const mine = local.myRoom();
    const owned = mine && this.slots?.find((s) => s.roomId === mine.roomId);
    let scope: 'browser' | 'room' | null = 'browser';
    if (owned) {
      scope = await choose(this.ui, {
        title: `Use ${name} where?`,
        body: 'Your name on this device can change on its own, or your room can change with it.',
        options: [
          { label: 'Only on this device', value: 'browser', note: `Room ${owned.slot + 1} still says ${owned.ownerName}. Your lap and casino scores use the new name.` },
          { label: `Also on room ${owned.slot + 1}`, value: 'room', note: 'Needs the room PIN', primary: true },
        ],
      });
    }
    if (!scope) return;
    // Scores belong to this device, so they always follow its name.
    const renameScores = () => void api.scoreName(id.browserId, name);
    if (scope === 'browser' || !owned) {
      local.setName(name);
      renameScores();
      this.avatar.setShirt(shirtFor(name));
      this.ui.toast(`You're ${name} on this device now`, 'good');
      return;
    }
    const pad = pinPad(this.ui, {
      title: `Room ${owned.slot + 1} PIN`,
      note: `To change the name on room ${owned.slot + 1} to ${name}.`,
      submitLabel: 'Rename',
      onSubmit: async (pin) => {
        const r = await api.rename(owned.roomId!, pin, name);
        if (!r.ok) {
          if (r.status === 404) {
            local.setMyRoom(null);
            this.ui.close(pad);
            this.ui.toast('That room is not yours any more. Only this device changed.', 'bad', 4200);
            local.setName(name);
            renameScores();
            return null;
          }
          if (r.code === 'wrong_pin') {
            const left = Number(r.extra.attemptsLeft);
            return left > 0 ? `That PIN is not right. ${left} ${left === 1 ? 'try' : 'tries'} left for now. Nothing changed.` : r.error;
          }
          return `${r.error}.${retryText(r)} Nothing changed.`;
        }
        this.ui.close(pad);
        local.setName(name);
        renameScores();
        this.avatar.setShirt(shirtFor(name));
        if (this.slots) {
          const s = this.slots.find((x) => x.roomId === owned.roomId);
          if (s) s.ownerName = r.data.room.ownerName;
          this.town.setSlots(this.slots);
        }
        if (this.space.kind !== 'hub' && this.space.room.id === owned.roomId) this.space.room = r.data.room;
        sfx.confirm();
        this.ui.toast(`Updated: ${[...r.data.changed, 'your scores'].join(', ')}`, 'good');
        return null;
      },
    });
  }

  /** Anyone can read the book; the PIN is only asked for when they choose to write. */
  private async openBook(): Promise<void> {
    if (this.space.kind !== 'room') return;
    const room = this.space.room;
    sfx.page();
    await openSketchbook(this.ui, this.input, { roomId: room.id, ownerName: room.ownerName, session: this.editSession() });
  }

  private async openArrange(): Promise<void> {
    if (this.space.kind !== 'room' || this.arranger) return;
    const space = this.space;
    if (!this.token()) {
      const pick = await choose(this.ui, {
        title: 'Toy chest',
        body: `Arranging ${space.room.ownerName}'s room needs the room PIN. Anyone can play with the toys already out.`,
        options: [{ label: 'Enter the PIN', value: 'pin', primary: true }],
        cancel: 'Close',
      });
      if (pick !== 'pin') return;
      const t = await this.unlock();
      if (!t) return;
    }
    // Hide the live toys; the editor shows its own copy.
    this.toys.group.visible = false;
    this.avatar.root.visible = false;
    this.touch.setVisible(false);
    this.arranger = new Arranger({
      ui: this.ui,
      input: this.input,
      interior: space.interior,
      rig: this.rig,
      camera: this.camera,
      canvas: this.renderer.domElement,
      room: space.room,
      token: () => this.token(),
      touch: () => {
        if (this.session) this.session.lastActive = Date.now();
      },
      unlock: (reason) => this.unlock(reason),
      onFinish: (room) => {
        this.arranger = null;
        this.avatar.root.visible = true;
        if (room && this.space.kind === 'room') {
          this.space.room = room;
          this.space.interior.setTheme(room.theme);
          this.space.interior.scene.remove(this.toys.group);
          disposeTree(this.toys.group);
          this.toys = new Toys(room.layout);
          this.space.interior.scene.add(this.toys.group);
          if (this.slots) {
            const s = this.slots.find((x) => x.roomId === room.id);
            if (s) s.theme = room.theme;
          }
          this.ui.toast('Room saved. Everyone who visits sees it this way.', 'good', 3600);
        } else {
          this.toys.group.visible = true;
        }
        this.rig.snap(this.follow(), this.yaw);
        this.updateTouchVisibility();
      },
    });
  }

  // -------------------------------------------------------------------------
  // Menus

  /** Nothing in progress that a refresh would cost: no dialog, editor, transition or race. */
  isCalm(): boolean {
    return !this.ui.isOpen && !this.busy && !this.arranger && !this.paused && !(this.view()?.holdsTime?.() ?? false);
  }

  setUpdateReady(): void {
    this.updateReady = true;
  }

  /** Reload into the newer version and come back to the same spot. */
  refreshForUpdate(): void {
    if (this.riding) this.dismount();
    if (this.space.kind === 'hub') local.setReturnSpot({ space: 'hub', x: this.pos.x, z: this.pos.z, yaw: this.yaw, at: Date.now() });
    else local.setReturnSpot({ space: this.space.kind, roomId: this.space.room.id, areaId: this.space.kind === 'area' ? this.space.area.id : undefined, x: this.pos.x, z: this.pos.z, yaw: this.yaw, at: Date.now() });
    this.fadeEl.classList.add('on');
    setTimeout(() => location.reload(), 150);
  }

  openPause(note?: string): void {
    if (this.ui.isOpen && !note) return;
    if (this.arranger) return;
    this.paused = true;
    const items = [
      ...(this.updateReady ? [{ label: 'Get the new version', action: () => this.refreshForUpdate(), primary: true }] : []),
      { label: 'Resume', action: () => close(), primary: !this.updateReady },
      ...(this.view()?.pauseItems?.() ?? []).map((it) => ({ label: it.label, action: () => {
        close();
        it.run();
      } })),
      { label: 'Settings', action: () => settingsPanel(this.ui, (s) => this.applySettings(s)) },
      { label: 'Change my name', action: () => void this.rename() },
      { label: 'Reset the toys', action: () => {
        this.toys.reset();
        close();
        this.ui.toast('Toys are back where they started');
      } },
    ];
    if (this.space.kind === 'hub') {
      items.push({ label: 'Park the vehicles', action: () => {
        if (this.riding) this.dismount();
        for (const v of this.vehicles) v.park();
        close();
      } });
    } else {
      if (this.space.kind === 'area') {
        const owner = this.space.room.ownerName;
        items.push({ label: `Back to ${owner}'s room`, action: () => {
          close();
          void this.leaveArea();
        } });
      }
      items.push({ label: 'Back to town', action: () => {
        close();
        void this.exitToHub();
      } });
    }
    if (this.session) items.push({ label: 'Lock editing', action: () => {
      this.lock(true);
      close();
    } });
    items.push({ label: 'Controls', action: () => controlsPanel(this.ui) });
    const title = this.space.kind === 'hub' ? 'Toyboxes' : this.space.kind === 'room' ? this.roomTitle(this.space.room) : this.space.area.name;
    const panel = pauseMenu(this.ui, { title, note, items, onResume: () => (this.paused = false) });
    const close = () => {
      this.ui.close(panel);
      this.paused = false;
    };
  }

  // -------------------------------------------------------------------------
  // Frame

  private follow() {
    const v = this.riding;
    return {
      x: v ? v.pos.x : this.pos.x,
      z: v ? v.pos.z : this.pos.z,
      height: v ? 1.35 + v.pos.y : 1.25 + this.pos.y,
      heading: v ? v.yaw : this.yaw,
      speed: v ? Math.abs(v.speed) : this.carrying ? this.carrying.speed : this.vel.length(),
      riding: !!v,
    };
  }

  private handleEvents(events: ToyEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'goal':
          sfx.goal();
          this.ui.banner('GOAL!', '#ffd24a');
          navigator.vibrate?.(40);
          break;
        case 'strike':
          sfx.strike();
          this.ui.banner('STRIKE!', '#4aa3df');
          break;
        case 'pins':
          sfx.ding(false);
          this.ui.toast(`${e.count} ${e.count === 1 ? 'pin' : 'pins'} down`);
          break;
        case 'target':
          sfx.ding(e.bullseye);
          if (e.bullseye) this.ui.banner('Bullseye!', '#e8574a');
          break;
        case 'bounce':
          sfx.bounce(e.strength);
          break;
        case 'knock':
          sfx.knock();
          break;
      }
    }
  }

  frame(dt: number, now: number, frameMs: number): void {
    this.adaptQuality(frameMs, now);
    this.input.update(dt, now);
    const menu = this.ui.isOpen;

    if (this.session && Date.now() - this.session.lastActive > IDLE_RELOCK_MS && !this.arranger) {
      this.lock(false);
      this.ui.toast('Editing locked after a quiet spell');
    }

    if (!menu && !this.busy) {
      if (this.input.take('pause')) this.openPause();
      if (this.input.take('reset')) {
        this.toys.reset();
        this.ui.toast('Toys reset');
      }
    }
    const control = !menu && !this.busy && !this.paused;
    // An experience can direct the camera (and freeze the player for it), or
    // read the controls itself for a mini-game.
    const svNow = this.view();
    const shot = this.arranger ? null : (svNow?.cameraShot?.(dt) ?? null);
    const capture = shot?.lockPlayer || this.arranger ? null : (svNow?.captureInput?.() ?? null);
    const steer = control && !shot?.lockPlayer && !capture;
    this.shot = shot;
    this.capture = capture;

    this.worldTimer -= dt;
    if (this.worldTimer <= 0 && this.space.kind === 'hub') void this.loadWorld();

    // ---- simulation, in steps of at most 1/60 s
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / steps;
    const cols = this.colliders();
    const events: ToyEvent[] = [];
    const sv = this.view();
    // A race (or a timed lap) stops the clock while a menu is open.
    const frozen = (menu || this.paused) && !!sv?.holdsTime?.();
    for (let i = 0; i < steps; i++) {
      if (this.arranger || frozen) break;
      if (this.riding) {
        const v = this.riding;
        const mx = steer ? this.input.move.x : 0;
        const my = steer ? this.input.move.y : 0;
        const throttle = steer ? clamp(my + this.input.throttle - this.input.brake, -1, 1) : 0;
        // Kick or jump held brakes (and drifts on a race track).
        const brake = steer && (this.input.isHeld('kick') || this.input.isHeld('jump')) ? 1 : 0;
        v.drive(h, throttle, -mx, brake, cols);
        if (v.bumped) {
          sfx.bump(Math.min(1, v.bumped / 10));
          this.rig.bump(Math.min(0.5, v.bumped / 20));
          v.bumped = 0;
        }
        this.pos.copy(v.pos);
        this.yaw = v.yaw;
      } else if (this.carryStep(sv, h, steer, cols)) {
        // The world carried the player this step.
      } else {
        // Camera-relative walking.
        const mx = steer ? this.input.move.x : 0;
        const my = steer ? this.input.move.y : 0;
        const camYaw = this.controlYaw();
        const fx = Math.sin(camYaw);
        const fz = Math.cos(camYaw);
        const rx = -fz;
        const rz = fx;
        const mag = Math.min(1, Math.hypot(mx, my));
        const speed = WALK * mag * (this.input.isHeld('run') ? (sv?.runScale?.() ?? 1.3) : 1);
        let wx = fx * my + rx * mx;
        let wz = fz * my + rz * mx;
        const wl = Math.hypot(wx, wz);
        if (wl > 0) {
          wx = (wx / wl) * speed;
          wz = (wz / wl) * speed;
        }
        const k = damp(mag > 0 ? 12 : 16, h);
        this.vel.x += (wx - this.vel.x) * k;
        this.vel.y += (wz - this.vel.y) * k;
        this.pos.x += this.vel.x * h;
        this.pos.z += this.vel.y * h;
        // Things lower than your feet pass under you.
        const hit = resolveCircle(this.pos, PLAYER_R, cols, this.pos.y);
        if (hit) {
          const vn = this.vel.x * hit.nx + this.vel.y * hit.nz;
          if (vn < 0) {
            this.vel.x -= vn * hit.nx;
            this.vel.y -= vn * hit.nz;
          }
        }
        const sp = this.vel.length();
        if (sp > 0.4) this.yaw += wrapAngle(Math.atan2(this.vel.x, this.vel.y) - this.yaw) * damp(14, h);
        if (this.grounded) this.stepDist += sp * h;
        if (this.stepDist > 1.25) {
          this.stepDist = 0;
          sfx.step();
        }
        if (sp > 1) this.movedFor += h;
        // Jumping, falling and landing on top of low things like toy blocks.
        const spaceJump = sv?.jumpAction?.(this.playerState()) ?? null;
        if (i === 0 && steer && spaceJump && this.input.take('jump')) spaceJump.run();
        else if (i === 0 && steer && this.grounded && this.input.take('jump')) {
          this.vy = JUMP_SPEED;
          this.grounded = false;
          this.avatar.jump();
          sfx.jump();
        }
        const was = this.pos.y;
        this.vy -= GRAVITY * (sv?.gravity?.() ?? 1) * h;
        this.pos.y += this.vy * h;
        this.groundY = groundHeight(this.pos.x, this.pos.z, PLAYER_R * 0.7, cols, Math.max(was, this.pos.y));
        if (this.pos.y <= this.groundY) {
          if (!this.grounded && this.vy < -4) sfx.land(Math.min(1, -this.vy / 12));
          this.pos.y = this.groundY;
          this.vy = 0;
          this.grounded = true;
        } else this.grounded = false;
      }
      for (const v of this.rideables()) if (v !== this.riding) v.idle(h, this.space.kind === 'hub' ? this.town.colliders : cols);
      sv?.step?.(h, this.playerState());
      const movers: Mover[] = [];
      if (this.riding) {
        const vv = this.riding.velocity;
        movers.push({ x: this.riding.pos.x, z: this.riding.pos.z, vx: vv.x, vz: vv.z, r: this.riding.t.radius, h: 0.9, kind: 'vehicle' });
      } else {
        movers.push({ x: this.pos.x, z: this.pos.z, vx: this.vel.x, vz: this.vel.y, r: PLAYER_R, h: 0.5, kind: 'player' });
      }
      if (this.space.kind === 'hub') {
        for (const v of this.vehicles) {
          if (v === this.riding || Math.abs(v.speed) < 0.3) continue;
          const vv = v.velocity;
          movers.push({ x: v.pos.x, z: v.pos.z, vx: vv.x, vz: vv.z, r: v.t.radius, h: 0.9, kind: 'vehicle' });
        }
      }
      const spaceKick = !this.riding ? sv?.kickAction?.(this.playerState()) : null;
      if (i === 0 && steer && spaceKick && this.input.take('kick')) spaceKick.run();
      else if (i === 0 && steer && !this.riding && this.input.take('kick')) {
        this.avatar.kick();
        const hitBall = this.toys.kick(this.pos.x, this.pos.z, this.yaw);
        sfx.kick(hitBall);
        if (hitBall) navigator.vibrate?.(15);
      }
      events.push(...this.toys.step(h, movers, this.space.kind === 'hub' ? this.town.colliders : this.space.interior.colliders));
    }
    this.handleEvents(events);

    // ---- interactions
    this.current = steer && !this.arranger ? this.pickInteractable() : null;
    if (control && shot?.lockPlayer) {
      if (this.input.take('interact') && shot.skip) shot.skip();
    } else if (steer && this.input.take('interact')) {
      if (this.riding) {
        const act = sv?.rideAction?.(this.playerState());
        if (act) act.run();
        else this.dismount();
      } else if (this.current) {
        unlockAudio();
        this.current.run();
      }
    }
    if (steer && this.riding && this.input.take('back') && !sv?.rideBack?.(this.playerState())) this.dismount();

    // ---- avatar, vehicles and the camera
    if (!this.riding) {
      this.avatar.root.position.copy(this.pos);
      this.avatar.root.rotation.y = this.yaw;
    }
    this.avatar.setAir(this.riding ? 0 : this.pos.y - this.groundY, !this.riding && !this.grounded);
    this.avatar.setPose(this.riding ? null : (this.carrying?.pose ?? (this.space.kind === 'area' ? this.worldPose : null)));
    this.avatar.animate(dt, this.riding ? 0 : this.vel.length(), this.riding ? this.riding.kind : 'none', this.settings.reduceMotion);
    if (this.riding) this.engine.set(Math.min(1, Math.abs(this.riding.speed) / this.riding.t.maxSpeed), this.riding.kind);

    const phase = dayPhase(Date.now(), this.settings.time);
    const t = now / 1000;
    if (this.arranger) {
      this.arranger.update(dt);
    } else {
      const look = steer ? this.input.look : { x: 0, y: 0 };
      this.rig.update(dt, now, look, this.follow(), cols, this.settings);
      this.applyShot(shot, cols, dt);
      this.rig.applyShake(dt, this.settings.reduceMotion);
      if (this.space.kind !== 'hub') this.space.interior.cutaway(this.camera.position);
    }
    this.sky.update(phase, this.pos);
    if (this.space.kind === 'hub') {
      this.town.update(this.sky.night, t, phase);
    } else {
      this.space.interior.update(this.sky.night, t, phase, this.riding ? this.riding.pos : this.pos);
    }

    this.updateHud(dt, control);
    const scene = this.space.kind === 'hub' ? this.scene : this.space.interior.scene;
    if (!this.view()?.render?.(this.renderer, this.camera)) this.renderer.render(scene, this.camera);
  }

  /** Which way "forward" points for the controls: the directed shot's view, else the follow camera's. */
  private controlYaw(): number {
    if (this.shot && (this.shot.blend ?? 1) >= 0.5) {
      const d = this.camera.getWorldDirection(new THREE.Vector3());
      if (Math.hypot(d.x, d.z) > 0.05) return Math.atan2(d.x, d.z);
    }
    return this.rig.yaw;
  }

  /** Lets the experience carry the player for one step. Returns true when it did. */
  private carryStep(sv: SpaceView | null, h: number, steer: boolean, cols: Collider[]): boolean {
    if (!sv?.carry) {
      this.carrying = null;
      return false;
    }
    const mx = steer ? this.input.move.x : 0;
    const my = steer ? this.input.move.y : 0;
    const yaw = this.controlYaw();
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const c = sv.carry(h, this.playerState(), { x: mx, y: my, wx: fx * my - fz * mx, wz: fz * my + fx * mx });
    if (!c) {
      if (this.carrying) {
        // Hand back without leftover walking speed.
        this.vel.set(0, 0);
        this.vy = Math.min(this.vy, 0);
      }
      this.carrying = null;
      return false;
    }
    const lx = this.pos.x;
    const lz = this.pos.z;
    const ly = this.pos.y;
    this.pos.set(c.x, c.y, c.z);
    this.yaw = c.yaw;
    this.vy = h > 0 ? (c.y - ly) / h : 0;
    this.vel.set(0, 0);
    this.grounded = false;
    this.groundY = groundHeight(c.x, c.z, PLAYER_R * 0.7, cols, c.y);
    this.carrying = { pose: c.pose ?? 'fly', speed: c.speed ?? (h > 0 ? Math.hypot(c.x - lx, c.z - lz) / h : 0) };
    return true;
  }

  /** Blends the follow camera toward an experience's directed shot. */
  private applyShot(shot: CameraShot | null, cols: Collider[], dt: number): void {
    const base = innerWidth < innerHeight ? 68 : 55;
    let fov = base;
    if (!shot?.pivot) this.shotLift = 0;
    if (shot) {
      const b = clamp(shot.blend ?? 1, 0, 1);
      if (b > 0) {
        // Blend the look point rather than the rotation, so the view never rolls.
        const look = this.rig.look.clone().lerp(shot.target, b);
        const cam = this.camera.position.lerp(shot.position, b);
        const pv = shot.pivot;
        if (pv) {
          // Like the follow camera: rise over a low blocker first, then pull in if that is not enough.
          const clear = (up: number) => rayFraction(pv.x, pv.y, pv.z, cam.x, cam.y + up, cam.z, cols) >= 1;
          let want = 0;
          if (!clear(0)) for (let up = 0.5; up <= 4; up += 0.5) if (clear(up)) {
            want = up;
            break;
          }
          this.shotLift += (want - this.shotLift) * damp(want > this.shotLift ? 10 : 2.5, dt);
          cam.y += this.shotLift;
          const f = rayFraction(pv.x, pv.y, pv.z, cam.x, cam.y, cam.z, cols);
          const len = cam.distanceTo(pv);
          if (f < 1 && len > 0) cam.sub(pv).multiplyScalar(Math.max(0.6, f * len - 0.3) / len).add(pv);
        }
        this.camera.lookAt(look);
        fov = base + ((shot.fov ?? base) - base) * b;
      }
    }
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private updateHud(dt: number, control: boolean): void {
    const ui = this.ui;
    const place = this.space.kind === 'hub' ? 'Toyboxes town' : this.space.kind === 'room' ? `${this.roomTitle(this.space.room)} · Room ${this.space.room.slot + 1}` : `${this.space.area.name} · ${this.space.room.ownerName}'s room`;
    ui.setPlace(place);
    ui.setLocked(!!this.session && !!this.currentRoom() && this.session.roomId === this.currentRoom()!.id);
    if (!control || this.arranger) {
      ui.prompt(null);
      this.touch.setAction(null);
      ui.hint(null);
      return;
    }
    const sv = this.view();
    if (this.shot?.lockPlayer) {
      ui.prompt(this.shot.skip ? (this.shot.skipLabel ?? 'Skip') : null);
      this.touch.setAction(this.shot.skip ? (this.shot.skipLabel ?? 'Skip') : null);
      this.touch.setKick(null);
      this.touch.setJump(false);
      ui.hint(null);
      return;
    }
    if (this.capture) {
      const c = this.capture;
      ui.prompt(c.prompt ?? null);
      this.touch.setAction(c.action);
      this.touch.setKick(c.kick);
      this.touch.setJump(c.jump ?? false);
      ui.hint(null);
      return;
    }
    if (this.riding) {
      const act = sv?.rideAction?.(this.playerState());
      const label = act ? act.label : 'Get off';
      ui.prompt(label || null);
      this.touch.setAction(act ? act.short || null : 'Get off');
      this.touch.setKick('Brake');
      this.touch.setJump(false);
    } else {
      const it = this.current;
      const kick = sv?.kickAction?.(this.playerState()) ?? null;
      ui.prompt(it ? it.label : null, 'interact', kick ? ['kick', kick.label] : undefined);
      this.touch.setAction(it ? it.short : null);
      const ball = this.toys.nearestBall(this.pos.x, this.pos.z);
      this.touch.setKick(kick ? kick.label : 'Kick');
      const jumpAct = sv?.jumpAction?.(this.playerState()) ?? null;
      this.touch.setJump(jumpAct ? jumpAct.label : true);
      if (!it && !kick && ball && ball.dist < 1.8) ui.prompt('Kick', 'kick');
    }
    // The hint shows walking controls, so it ends once you ride or a world takes the controls.
    if (this.riding || this.capture || this.shot) this.hintTimer = 0;
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.movedFor > 2.5 && this.hintTimer > 2) this.hintTimer = 2;
      ui.hint(
        this.hintTimer > 0
          ? [
              ['move', 'Move'],
              ['look', 'Look'],
              ['interact', 'Use'],
              ['jump', 'Jump'],
              ['kick', 'Kick'],
              ['pause', 'Menu'],
            ]
          : null,
      );
    } else ui.hint(null);
  }

  // -------------------------------------------------------------------------

  /** Read-outs and a teleport for scripted playtests. Nothing here touches the server. */
  readonly debug = {
    teleport: (x: number, z: number, yaw: number) => this.placePlayer(x, z, yaw),
    state: () => ({
      space: this.space.kind,
      x: this.pos.x,
      z: this.pos.z,
      y: this.pos.y,
      grounded: this.grounded,
      carried: !!this.carrying,
      camYaw: this.controlYaw(),
      yaw: this.yaw,
      riding: this.riding?.kind ?? null,
      speed: this.riding ? this.riding.speed : this.vel.length(),
      prompt: this.riding ? (this.view()?.rideAction?.(this.playerState())?.label ?? 'Get off') : (this.current?.label ?? null),
      room: this.currentRoom()?.id ?? null,
      unlocked: !!this.token(),
      night: this.sky.night,
      renderScale: this.renderScale,
      tier: this.tier,
      fps: this.perf.fps,
      p75: this.perf.p75,
      menu: this.ui.isOpen,
    }),
    entrances: () => this.town.entrances,
    vehicles: () => this.vehicles.map((v) => ({ kind: v.kind, x: v.pos.x, z: v.pos.z, yaw: v.yaw })),
    spots: () => {
      if (this.space.kind === 'hub') return null;
      const it = this.space.interior;
      return { door: it.door, lectern: it.lectern, chest: it.chest, areaDoors: it.areaDoors.map((d) => ({ x: d.x, z: d.z, name: d.area.name })), exhibits: it.exhibitSpots.map((e) => ({ x: e.x, z: e.z, title: e.exhibit.title })) };
    },
    toys: () => this.toys.nearestBall(this.pos.x, this.pos.z),
    /** Toy blocks in the current space, for jump playtests. */
    blocks: () => this.toys.placements.filter((p) => p.kind === 'crate').map((p) => ({ x: p.x, z: p.z, rot: p.rot })),
    experience: () => {
      if (this.space.kind !== 'area') return null;
      const sv = this.space.interior as SpaceView & { debugInfo?: () => unknown };
      return sv.debugInfo?.() ?? null;
    },
    /** Calls a debug method on the current experience, e.g. to shorten a round. */
    experienceCall: (method: string, ...args: unknown[]) => {
      const sv = this.view() as (SpaceView & Record<string, unknown>) | null;
      const fn = sv?.[method];
      return typeof fn === 'function' ? (fn as (...a: unknown[]) => unknown).apply(sv, args) : null;
    },
    /** Pins the graphics tier, as the Graphics setting would. */
    setQuality: (q: local.Quality) => this.applySettings({ ...this.settings, quality: q }),
    /** The music sequencer's scheduling health; `reset` starts a fresh count. Loaded on demand to keep it out of the first download. */
    music: async (reset = false) => {
      const { music } = await import('../audio/music');
      if (reset) music.resetHealth();
      return { playing: music.playing, ...music.health() };
    },
  };

  onHidden(hidden: boolean): void {
    suspendAudio(hidden);
    if (hidden) {
      this.input.releaseAll();
      if (this.riding) this.engine.set(0, this.riding.kind);
    }
  }
}
