// Club Nova (room 11's neon space party): laser tag, prism blade duels and a
// dance off, all on one beat. This file builds the station and runs the free
// roam between games; each game is a Mode (dance.ts, duel.ts, tag.ts).

import * as THREE from 'three';
import './neon.css';
import { music } from '../../audio/music';
import { tone } from '../../audio/sfx';
import { disposeTree } from '../../world/kit';
import type { Collider } from '../../world/physics';
import type { CameraShot, CaptureLabels, PlayerState, SpaceAction, SpaceView, Tier } from '../../world/space';
import type { ExperienceCtx } from '../common';
import { Hud, Particles, PostFX, Shockwaves } from '../kit';
import { DIFF_NAMES, type Diff } from '../../shared/neon/charts';
import { SONGS, type SongId } from '../../shared/neon/songs';
import { BLADE_COLORS } from '../../shared/neon/progress';
import { DANCE_BOARD, TAG_SECONDS } from '../../shared/neon/rules';
import { boardLine, Boards } from './boards';
import { BeatClock } from './clock';
import { NovaCore } from './core';
import { Crowd } from './crowd';
import { DanceMode, RIVALS, type DanceOutcome } from './dance';
import { FLOOR_R, NovaFloor } from './floor';
import { askSoundCheck, partySettings, songSelect, tagSetup } from './menus';
import { ArenaView } from './arena-view';
import { TagMode, type TagOutcome } from './tag';
import { tagStars, TAG_DIFF_NAMES, type TagDiff } from '../../shared/neon/tag';
import type { LayoutId } from '../../shared/neon/arena';
import { songData } from './music';
import { RhythmInput } from './rhythm-input';
import { DUELISTS, judgeBot, orbitBot, Robot } from './robots';
import { NovaProgress } from './save';
import { Sky } from './sky';
import { nova as snd } from './sounds';
import { BOOTH, buildStation, DOOR, JUDGES, JUKEBOX, ORBIT_SPOT, paintBoard, PEDESTALS, STAR_PAD, stationQuality, TAG_TERMINAL, type StationParts } from './station';
import { SyncMode, type SyncResult } from './sync';
import { Dancer, Fencer, Outfit, type SuitId } from './style';
import { C } from './util';
import type { Mode, Nova } from './world';

export class NeonParty implements SpaceView, Nova {
  readonly scene = new THREE.Scene();
  readonly indoor = false;
  readonly door = DOOR;
  readonly arrival = { x: 0, z: 19.5, yaw: Math.PI };
  readonly lectern = null;
  readonly chest = null;
  readonly areaDoors = [];
  readonly exhibitSpots = [];
  readonly colliders: Collider[];
  readonly sun = new THREE.DirectionalLight(0xe6daff, 1.3);

  readonly hud: Hud;
  readonly post: PostFX;
  readonly fx;
  readonly clock = new BeatClock();
  readonly rin: RhythmInput;
  readonly core: NovaCore;
  readonly floor: NovaFloor;
  readonly crowd: Crowd;
  readonly save: NovaProgress;
  readonly boards: Boards;
  readonly dancer = new Dancer();
  readonly fencer = new Fencer();
  readonly outfit: Outfit;
  readonly orbit: Robot;
  readonly judges: Robot[];
  readonly layer: HTMLElement;

  private sky: Sky;
  private station: StationParts;
  private arena: ArenaView;
  private hemi: THREE.HemisphereLight;
  private fill: THREE.DirectionalLight;
  private duelists: Robot[] = [];
  private extras: Robot[] = [];
  private mode: Mode | null = null;
  private tierNow: Tier = 'medium';
  private lastT = 0;
  private energy = 1;
  private glowAmt = 0;
  private freeDance: { beat: number } | null = null;
  private freeDanceUntil = 0;
  private stepDist = 0;
  private stepCount = 0;
  private lastPos = { x: 0, z: 0 };
  private player_: PlayerState = { x: 0, z: 19.5, y: 0, vy: 0, grounded: true, yaw: Math.PI, vx: 0, vz: 0, riding: null };
  private seenBeat = -1;
  private hints = new Set<string>();
  private hintEl: HTMLElement;
  private intro = { t: 0, on: false };
  private day = 0;
  private toast: string | null = null;
  /** Airlock: shut during a match countdown. */
  doorsShut = false;
  private doorOpen = 1;

  constructor(readonly ctx: ExperienceCtx) {
    this.save = new NovaProgress(ctx.roomId, ctx.area.id);
    this.boards = new Boards(ctx);
    this.clock.inputOffset = this.save.data.sync.offset;
    this.clock.videoOffset = this.save.data.sync.video;

    // Light: low violet ambient, the Core's light from above, glow everywhere else.
    this.hemi = new THREE.HemisphereLight(0x5a46b8, 0x0a0620, 1.0);
    this.scene.add(this.hemi);
    // A soft light from the camera so faces read anywhere in the club.
    this.fill = new THREE.DirectionalLight(0xd8ccff, 0.55);
    this.scene.add(this.fill, this.fill.target);
    this.sun.position.set(3, 22, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -12;
    sc.right = sc.top = 12;
    sc.near = 2;
    sc.far = 40;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);

    this.sky = new Sky();
    this.scene.add(this.sky.group);
    this.station = buildStation(this.scene, ctx.ownerName);
    this.colliders = this.station.colliders;
    this.arena = new ArenaView(this.scene, this.colliders);

    this.core = new NovaCore();
    this.scene.add(this.core.group);
    this.floor = new NovaFloor();
    this.scene.add(this.floor.mesh);
    this.crowd = new Crowd();
    this.scene.add(this.crowd.mesh);

    // The cast: Orbit at the decks, three judges, the Prism Five on their pedestals.
    this.orbit = orbitBot();
    this.orbit.root.position.set(ORBIT_SPOT.x, 0, ORBIT_SPOT.z);
    this.scene.add(this.orbit.root);
    const ang = Math.atan2(-JUDGES.x, -JUDGES.z);
    this.judges = (['tempo', 'groove', 'sparkle'] as const).map((k, i) => {
      const j = judgeBot(k);
      const off = (i - 1) * 1.15;
      j.root.position.set(JUDGES.x - Math.sin(ang) * 0.9 + Math.cos(ang) * off, 0, JUDGES.z - Math.cos(ang) * 0.9 - Math.sin(ang) * off);
      j.root.rotation.y = ang;
      j.root.scale.setScalar(0.85);
      this.scene.add(j.root);
      return j;
    });
    DUELISTS.forEach((d, i) => {
      const r = new Robot(d.look);
      const p = PEDESTALS[i];
      r.root.position.set(p.x, 0.5, p.z);
      r.root.rotation.y = p.yaw;
      this.scene.add(r.root);
      this.duelists.push(r);
    });
    // A bartender and two loungers in the Glow Lab.
    const bar = new Robot({ head: 'bean', body: 0x3a2a6a, trim: C.pink, badge: 'star' });
    bar.root.position.set(30, 0, 7.4);
    bar.root.rotation.y = Math.PI;
    const l1 = new Robot({ head: 'dome', body: 0x1d3a6a, trim: C.cyan, badge: 'circle', scale: 0.8 });
    l1.root.position.set(22.8, 0.1, -6.6);
    const l2 = new Robot({ head: 'wedge', body: 0x4a1d52, trim: C.pink, badge: 'triangle', scale: 0.8 });
    l2.root.position.set(31.2, 0.1, -6.6);
    this.extras.push(bar, l1, l2);
    for (const r of this.extras) this.scene.add(r.root);

    // Effects and HUD.
    this.fx = {
      sparks: new Particles(this.scene, { max: 1600, look: 'spark' }),
      glow: new Particles(this.scene, { max: 1200, look: 'glow' }),
      confetti: new Particles(this.scene, { max: 900, look: 'confetti' }),
      rings: new Shockwaves(this.scene),
    };
    this.post = new PostFX(this.scene, { bloom: { strength: 0.9, radius: 0.55, threshold: 0.72 }, vignette: 0.38, saturation: 1.12, contrast: 1.06, aberration: 0.0025, grain: 0.025 });
    this.hud = new Hud(ctx, { accent: '#b49cff', accent2: '#ff3dae', panel: 'dark', glow: true });
    this.layer = document.createElement('div');
    this.layer.className = 'nova-layer';
    ctx.ui.hud.appendChild(this.layer);
    this.hintEl = document.createElement('div');
    this.hintEl.className = 'nova-hint';
    this.layer.appendChild(this.hintEl);
    this.rin = new RhythmInput(ctx.ui);

    this.outfit = new Outfit(() => ctx.bones());
    this.wearEquipped();

    // The hall of fame starts empty and fills from the server.
    void this.paintBoards();

    // Roaming music and the arrival.
    this.roam();
    this.hud.title('Club Nova', `${ctx.ownerName} presents`, 3200);
    if (!this.save.seen('flyover')) this.intro = { t: 0, on: true };
    else void this.introCard();
  }

  // ---- Nova interface

  tier(): Tier {
    return this.tierNow;
  }

  player(): PlayerState {
    return this.player_;
  }

  playSong(id: SongId, opts: { variant?: 'swing'; loop?: boolean; fadeIn?: number } = {}): void {
    const data = songData(id, opts);
    music.stop(0.05);
    music.play(data, { fadeIn: opts.fadeIn ?? 0.6 });
    this.clock.start(SONGS[id], music.playing === data.name ? data.name : null, 120);
  }

  /** The lounge song and the free roam. */
  roam(): void {
    this.playSong('hello', { loop: true, fadeIn: 1.5 });
  }

  endMode(): void {
    const m = this.mode;
    this.mode = null;
    m?.dispose();
    this.ctx.pose(null);
    this.ctx.hold(null);
    this.hud.strip([]);
    this.hud.objective(null);
    this.rin.setActive(false);
    this.setEnergy(1, 0);
    this.roam();
  }

  hint(key: string, text: string): void {
    if (this.save.seen(key) || this.hints.has(key)) return;
    this.hints.add(key);
    this.save.markSeen(key);
    this.hintEl.textContent = text;
    this.hintEl.classList.remove('on');
    void this.hintEl.offsetWidth;
    this.hintEl.classList.add('on');
  }

  setEnergy(energy: number, glow: number): void {
    this.energy = energy;
    this.glowAmt = glow;
  }

  // ---- the hall of fame in the Glow Lab

  private async paintBoards(): Promise<void> {
    const sets: { title: string; modes: string[]; accent: string; fmt: (v: number) => string }[] = [
      { title: 'Party nights', modes: ['night'], accent: '#ffc93c', fmt: (v) => v.toLocaleString('en-US') },
      { title: 'Laser tag', modes: ['tag'], accent: '#2de8ff', fmt: (v) => v.toLocaleString('en-US') },
      { title: 'Nova Lights', modes: ['dance-nova-lights'], accent: '#ff3dae', fmt: (v) => v.toLocaleString('en-US') },
    ];
    sets.forEach((b, i) => paintBoard(this.station.boardMeshes[i], b.title, [], 'Hall of fame', b.accent));
    const got = await this.boards.fetch(sets.flatMap((b) => b.modes));
    if (this.disposed) return;
    sets.forEach((b, i) => {
      const rows = (got[b.modes[0]]?.rows ?? []).map((r) => ({ name: r.name, value: b.fmt(r.value), you: r.you }));
      paintBoard(this.station.boardMeshes[i], b.title, rows, 'Hall of fame', b.accent);
    });
  }

  private disposed = false;

  // ---- cosmetics

  private wearEquipped(): void {
    const e = this.save.data.equipped;
    this.outfit.wear(e.suit as SuitId, e.helmet);
  }

  bladeColor(): number {
    return BLADE_COLORS[this.save.data.equipped.blade] ?? C.cyan;
  }

  // ---- intro

  private async introCard(): Promise<void> {
    await this.hud.intro({
      key: 'neon-club-nova',
      title: 'Club Nova',
      tagline: 'Laser tag, prism blades and a dance off. Everything moves to the beat.',
      tips: [
        { keys: ['move'], text: 'Walk around the club' },
        { keys: ['interact'], touch: 'Action', text: 'Dance on the beat, play and pick songs' },
        { keys: ['pause'], touch: 'Menu', text: 'Pause any time' },
      ],
      button: "Let's party",
    });
  }

  // ---- SpaceView hooks

  setQuality(t: Tier): void {
    this.tierNow = t;
    this.post.setQuality(t);
    this.sky.setQuality(t);
    this.core.setQuality(t);
    this.crowd.setQuality(t);
    this.floor.setLow(t === 'low');
    for (const p of [this.fx.sparks, this.fx.glow, this.fx.confetti]) p.setQuality(t);
    stationQuality(this.station, t);
    this.arena.setQuality(t);
    this.sun.shadow.mapSize.set(t === 'high' ? 2048 : 1024, t === 'high' ? 2048 : 1024);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): boolean {
    // Count every pass of the last frame (post adds a few), then start again.
    if (renderer.info.autoReset) this.renderer = renderer;
    renderer.info.autoReset = false;
    this.lastInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    renderer.info.reset();
    return this.post.render(renderer, camera);
  }

  private renderer: THREE.WebGLRenderer | null = null;

  private lastInfo = { calls: 0, triangles: 0 };

  resize(): void {
    this.post.resize();
  }

  holdsTime(): boolean {
    return this.mode?.holds() ?? false;
  }

  gravity(): number {
    return 1;
  }

  captureInput(): CaptureLabels | null {
    if (this.intro.on) return null;
    return this.mode?.capture() ?? null;
  }

  cameraShot(dt: number): CameraShot | null {
    if (this.intro.on) return this.flyover(dt);
    return this.mode?.shot(dt) ?? null;
  }

  private flyover(dt: number): CameraShot {
    this.intro.t += dt;
    const t = Math.min(1, this.intro.t / 4.2);
    const e = t * t * (3 - 2 * t);
    const a = -0.6 + e * 0.6;
    const pos = new THREE.Vector3(Math.sin(a) * (14 - e * 6), 12 - e * 8.5, Math.cos(a) * (14 - e * 6) + e * 13);
    const target = new THREE.Vector3(0, 7.5 - e * 6.2, e * 14);
    if (this.intro.t > 4.2) this.endIntro();
    return { position: pos, target, blend: Math.min(1, (4.6 - this.intro.t) * 2.5), lockPlayer: true, skip: () => this.endIntro(), skipLabel: 'Skip' };
  }

  private endIntro(): void {
    if (!this.intro.on) return;
    this.intro.on = false;
    this.save.markSeen('flyover');
    this.ctx.snapCamera(Math.PI);
    void this.introCard();
  }

  extraColliders(): Collider[] {
    return this.mode?.colliders?.() ?? [];
  }

  actions(p: PlayerState): SpaceAction[] {
    if (this.mode) return this.mode.actions?.(p) ?? [];
    const out: SpaceAction[] = [];
    out.push({ x: BOOTH.x, z: BOOTH.z + 1.6, range: 2.2, label: 'Dance off: pick a song', short: 'Songs', run: () => this.openSongs() });
    out.push({ x: STAR_PAD.x, z: STAR_PAD.z, range: 1.8, label: 'Dance off with Orbit', short: 'Dance', run: () => this.openSongs() });
    out.push({ x: TAG_TERMINAL.x, z: TAG_TERMINAL.z + 0.9, range: 1.8, label: 'Laser tag', short: 'Tag', run: () => this.openTag() });
    out.push({ x: JUKEBOX.x, z: JUKEBOX.z - 1.2, range: 1.8, label: 'Party settings and sound check', short: 'Settings', run: () => this.openSettings() });
    if (Math.hypot(p.x, p.z) < FLOOR_R - 0.3) out.push({ x: p.x, z: p.z, range: 0.5, label: 'Dance', short: 'Dance', run: () => this.queueFreeDance() });
    return out;
  }

  kickAction(): { label: string; run: () => void } | null {
    return this.mode?.kick?.(this.player_) ?? null;
  }

  step(h: number, p: PlayerState): void {
    this.player_ = p;
    if (this.mode) {
      this.mode.step(h, p);
      return;
    }
    this.hud.update(h);
    // Footsteps on the Nova floor light the rays and play notes on the beat.
    const d = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z);
    this.lastPos = { x: p.x, z: p.z };
    if (Math.hypot(p.x, p.z) < FLOOR_R && p.grounded && d < 1) {
      this.stepDist += d;
      if (this.stepDist > 0.95) {
        this.stepDist = 0;
        this.floor.step(p.x, p.z, this.suitColor());
        const beat = this.clock.beatAt();
        const next = Math.ceil(beat * 2) / 2;
        const wait = ((next - beat) * 60) / this.clock.bpm();
        snd.stepAt(this.stepCount++, wait);
      }
    }
  }

  private suitColor(): number {
    return { starter: C.lilac, retro: C.pink, circuit: C.lime, mirror: C.white, nebula: C.uv, comet: C.cyan, supernova: C.gold }[this.save.data.equipped.suit as SuitId] ?? C.lilac;
  }

  private queueFreeDance(): void {
    const beat = this.clock.beatAt();
    this.freeDance = { beat: Math.floor(beat) + 1 };
    this.hint('hint-freedance', 'Dance on the beat!');
  }

  private openTag(): void {
    tagSetup(this, (diff, layout) => this.startTag(diff, layout), () => undefined);
  }

  startTag(diff: TagDiff, layout: LayoutId = 'prism', opts: { size?: 2 | 3 | 4; duration?: number; captain?: boolean; echo?: boolean } = {}): void {
    if (this.mode) this.endMode();
    const seed = (Date.now() & 0xffffff) | 1;
    this.ticket = null;
    const board = diff !== 'easy' && !opts.duration;
    this.mode = new TagMode(this, this.arena, {
      diff,
      size: opts.size ?? 3,
      layout,
      duration: opts.duration ?? TAG_SECONDS,
      captain: opts.captain ?? false,
      echo: opts.echo ?? false,
      practice: !this.save.seen('tag-practice'),
      seed,
      onDone: (o) => void this.tagDone(diff, layout, o, board),
    });
    if (board) void this.boards.start('tag').then((t) => (this.ticket = t));
  }

  private async tagDone(diff: TagDiff, layout: LayoutId, o: TagOutcome, board: boolean): Promise<void> {
    if (o.quit) {
      this.endMode();
      return;
    }
    const s = o.score;
    const key = `tag:${diff}`;
    const total = s?.total ?? 0;
    const newBest = this.save.best(key, total);
    const stars = s ? tagStars(diff, s) : 0;
    const gained = this.save.award(key, stars);
    if (s && s.win && total >= ({ easy: 1500, normal: 2200, hard: 3000 }[diff] * 1.6)) this.save.data.crowns[key] = true;
    this.save.data.tagLosses = o.won ? 0 : this.save.data.tagLosses + 1;
    this.save.save();
    let line = board ? 'Saving your score...' : 'Easy matches stay on this device.';
    let rows: { name: string; value: string; you?: boolean }[] | null = null;
    if (board && s) {
      const posted = await this.boards.submit('tag', Math.round(total * (diff === 'hard' ? 1.25 : 1)), o.log, this.ticket);
      line = boardLine(posted, false);
      const b = await this.boards.fetch(['tag'], true);
      rows = (b.tag?.rows ?? []).slice(0, 5).map((x) => ({ name: x.name, value: x.value.toLocaleString('en-US'), you: x.you }));
    }
    const choice = await this.hud.results({
      title: o.won ? 'Cyan wins!' : o.us === o.them ? 'A draw' : 'Magenta wins',
      subtitle: `${o.us} to ${o.them} · ${TAG_DIFF_NAMES[diff]}`,
      stars,
      rows: [
        { label: 'Your points', value: total.toLocaleString('en-US'), best: newBest },
        { label: 'Tags', value: String(s?.tags ?? 0) },
        { label: 'Bank shots / Reflects', value: `${s?.banks ?? 0} / ${s?.reflects ?? 0}` },
        { label: 'Beat shots', value: String(s?.beats ?? 0) },
      ],
      badges: [...(newBest && total > 0 ? ['New best!'] : []), ...(gained ? [`+${gained} star${gained > 1 ? 's' : ''}`] : [])],
      board: rows ? { title: line, rows } : undefined,
      buttons: [
        { id: 'again', label: 'Play again', primary: true },
        ...(diff !== 'easy' && this.save.data.tagLosses >= 2 ? [{ id: 'easier', label: 'Easier bots' }] : []),
        { id: 'done', label: 'Done' },
      ],
    });
    if (!rows && board) this.ctx.ui.toast(line);
    this.endMode();
    if (choice === 'again') this.startTag(diff, layout);
    else if (choice === 'easier') this.startTag(diff === 'hard' ? 'normal' : 'easy', layout);
    else this.ctx.teleport(TAG_TERMINAL.x, TAG_TERMINAL.z + 1.4, 0);
  }

  runScale(): number {
    return this.mode ? 1 : 1.3;
  }

  private openSongs(): void {
    songSelect(
      this,
      (song, diff) => this.startDance(song, diff),
      () => this.roam(),
    );
  }

  private openSettings(): void {
    partySettings(
      this,
      () => this.runSync(() => this.roam()),
      () => undefined,
    );
  }

  /** Runs the sound check, then `after`. */
  runSync(after: () => void): void {
    if (this.mode) this.endMode();
    this.mode = new SyncMode(this, (r) => {
      this.applySync(r);
      this.endMode();
      after();
    });
  }

  private applySync(r: SyncResult): void {
    const sync = this.save.data.sync;
    if (r.offset !== null) {
      sync.offset = r.offset;
      sync.checked = true;
    }
    if (r.holdOk === false) sync.easyHolds = true;
    this.clock.inputOffset = sync.offset;
    this.save.save();
    this.ctx.ui.toast(r.offset === null ? 'No claps heard. Try again any time at the jukebox.' : r.holdOk === false ? "You've got rhythm! Easy holds are on for this screen." : "You've got rhythm!", r.offset === null ? 'info' : 'good', 3200);
  }

  /** Starts a rhythm game, offering the sound check the first time. */
  private withSync(start: () => void): void {
    if (this.save.data.sync.checked || this.save.seen('ask-sync')) {
      start();
      return;
    }
    this.save.markSeen('ask-sync');
    askSoundCheck(this, () => this.runSync(start), start, () => this.roam());
  }

  pauseItems(): { label: string; run: () => void }[] {
    const m = this.mode;
    if (m instanceof DanceMode && m.playing) {
      return [
        { label: 'Restart the song', run: () => this.startDance(m.song, m.diff, true) },
        { label: 'Leave the dance off', run: () => this.endMode() },
      ];
    }
    if (m instanceof SyncMode) return [{ label: 'Skip the sound check', run: () => this.endMode() }];
    if (m instanceof TagMode && m.playing) return [{ label: 'Leave the match', run: () => m.abandon() }];
    return [];
  }

  startDance(song: SongId, diff: Diff, now = false): void {
    if (!now) {
      this.withSync(() => this.startDance(song, diff, true));
      return;
    }
    if (this.mode) this.endMode();
    const rival = diff === 'nova' ? RIVALS.orbit : song === 'lights' ? RIVALS.twirl : song === 'glitter' ? RIVALS.shimmer : song === 'heart' ? RIVALS.boogie : RIVALS.strobe;
    const mode = new DanceMode(this, { song, diff, rival, seed: Date.now() & 0xffff, onDone: (o) => void this.danceDone(song, diff, o) });
    this.mode = mode;
    const modeId = diff === 'normal' ? (DANCE_BOARD[song] ?? null) : null;
    this.ticket = null;
    if (modeId && !this.save.data.sync.wide) void this.boards.start(modeId).then((t) => (this.ticket = t));
  }

  private ticket: string | null = null;

  private async danceDone(song: SongId, diff: Diff, o: DanceOutcome): Promise<void> {
    const key = `dance:${song}:${diff}`;
    const r = o.result;
    const newBest = this.save.best(key, r.score);
    const gained = this.save.award(key, o.stars);
    if (r.cards.total >= 30) this.save.data.crowns[key] = true;
    this.save.save();
    const modeId = diff === 'normal' ? (DANCE_BOARD[song] ?? null) : null;
    let line = diff === 'normal' ? 'Saving your score...' : `${DIFF_NAMES[diff]} bests stay on this device.`;
    let boardRows: { name: string; value: string; you?: boolean }[] | null = null;
    if (modeId && !o.wide) {
      const posted = await this.boards.submit(modeId, r.score, o.log, this.ticket);
      line = boardLine(posted, false);
      const b = await this.boards.fetch([modeId], true);
      boardRows = (b[modeId]?.rows ?? []).slice(0, 5).map((x) => ({ name: x.name, value: x.value.toLocaleString('en-US'), you: x.you }));
    } else if (o.wide) line = boardLine(null, true);
    const c = r.counts;
    const choice = await this.hud.results({
      title: r.cards.total >= 26 ? 'Superstar!' : r.cards.total >= 21 ? 'Great show!' : 'Nice moves!',
      subtitle: `${SONGS[song].name} · ${DIFF_NAMES[diff]}`,
      stars: o.stars,
      rows: [
        { label: 'Score', value: r.score.toLocaleString('en-US'), best: newBest },
        { label: 'Judges', value: `${r.cards.tempo} + ${r.cards.groove} + ${r.cards.sparkle} = ${r.cards.total}` },
        { label: 'Perfect / Great / Good / Miss', value: `${c.P} / ${c.G} / ${c.O} / ${c.M}` },
        { label: 'Best combo', value: String(r.maxCombo) },
      ],
      badges: [...(newBest ? ['New best!'] : []), ...(gained ? [`+${gained} star${gained > 1 ? 's' : ''}`] : []), ...(r.cards.total >= 30 ? ['Crowned!'] : [])],
      board: boardRows ? { title: line, rows: boardRows } : undefined,
      buttons: [
        { id: 'again', label: 'Dance again', primary: true },
        { id: 'songs', label: 'Pick a song' },
        { id: 'done', label: 'Done' },
      ],
    });
    if (!boardRows) this.ctx.ui.toast(line);
    this.endMode();
    if (choice === 'again') this.startDance(song, diff);
    else if (choice === 'songs') this.openSongs();
    else this.ctx.teleport(0, 4.5, Math.PI);
  }

  update(night: number, t: number, _phase: number, focus: THREE.Vector3): void {
    const dt = this.lastT ? Math.min(0.1, Math.max(0, t - this.lastT)) : 1 / 60;
    this.lastT = t;
    const now = performance.now();
    const paused = this.ctx.ui.isOpen;
    this.clock.sync(now);
    this.mode?.frame(dt, now, paused);
    const beat = this.clock.running ? this.clock.drawBeat(now) : t * 1.5;
    const reduce = this.ctx.reduceMotion();
    this.day = 1 - night;

    // Matinee by day, late show at night.
    this.hemi.intensity = 0.7 + this.day * 0.35;
    this.sun.intensity = 1.1 + this.day * 0.4;
    this.sky.group.position.set(focus.x, 0, focus.z);
    this.sky.update(t, beat, this.day * 0.3, this.glowAmt);
    this.core.update(dt, beat, this.glowAmt, reduce);
    if (!this.mode || this.mode.kind !== 'dance') this.floor.update(dt, t, beat, { glow: this.glowAmt, dim: 0, spot: 0, mood: 0, px: focus.x, pz: focus.z });
    this.crowd.update(dt, t, beat, this.energy);
    this.orbit.idle(dt, beat, 1);
    this.orbit.armR.rotation.x = -1.2 + Math.sin(beat * Math.PI * 2) * 0.25;
    this.orbit.armL.rotation.x = -0.9 + Math.sin(beat * Math.PI) * 0.4;
    for (const j of this.judges) if (!this.mode) j.idle(dt, beat, 0.5);
    for (const d of this.duelists) d.idle(dt, beat, 0.3);
    for (const r of this.extras) r.idle(dt, beat, 0.6);
    for (const p of [this.fx.sparks, this.fx.glow, this.fx.confetti]) p.update(dt);
    this.fx.rings.update(dt);
    this.outfit.update(dt, t, beat);

    // Station animation.
    const st = this.station;
    st.deckMat.uniforms.uBeat.value = beat;
    st.deckMat.uniforms.uTime.value = t;
    st.arenaMat.uniforms.uBeat.value = beat;
    st.ringMat.uniforms.uBeat.value = beat;
    st.portalMat.uniforms.uTime.value = t;
    this.animateEq(beat);
    this.arena.update(dt, beat, t);
    st.lasers.visible = this.tierNow !== 'low' && (night > 0.35 || this.glowAmt > 0);
    if (st.lasers.visible) {
      st.lasers.children.forEach((hld, i) => {
        const a = hld.userData.a as number;
        const sweep = Math.sin(t * 0.6 + i * 1.7) * 0.5 + Math.sin(beat * Math.PI * 0.25 + i) * 0.15;
        const reach = 14 + Math.sin(t * 0.45 + i * 2.3) * 3;
        const tx = Math.cos(a + sweep) * (20.3 - reach);
        const tz = Math.sin(a + sweep) * (20.3 - reach);
        hld.lookAt(tx, 15 + Math.sin(t * 0.8 + i) * 3, tz);
        hld.rotateX(Math.PI / 2);
      });
    }
    const signK = this.tierNow === 'low' ? 1.25 : 0.82;
    for (const s of st.signs) {
      const m = s.mesh.material as THREE.MeshBasicMaterial;
      m.color.setScalar(signK * (0.92 + 0.08 * Math.exp(-(beat % 1) * 5)));
    }
    for (const hl of st.holos) hl.position.y = 2.45 + Math.sin(t * 2) * 0.05;
    // The airlock curtain slides open when the yard is free and fades when the camera is near it.
    const cam = this.ctx.camera.position;
    // Seen from inside the yard (or right next to it) the curtain hides.
    const near = (Math.abs(cam.z - -20.3) < 2.5 && Math.abs(cam.x) < 5) || this.player_.z < -20 ? 0 : 1;
    this.doorOpen += ((this.doorsShut ? 0 : 1) - this.doorOpen) * Math.min(1, dt * 4);
    for (const d of st.airlockDoors) {
      d.visible = this.doorOpen < 0.98;
      const mat = d.material as THREE.ShaderMaterial;
      mat.uniforms.uFade.value = near * (1 - this.doorOpen);
      mat.uniforms.uTime.value = t;
    }
    this.fill.position.copy(this.ctx.camera.position).add(new THREE.Vector3(0, 2, 0));
    this.fill.target.position.set(focus.x, 1, focus.z);
    // Shadows follow the player.
    this.sun.position.set(focus.x + 3, 22, focus.z + 4);
    this.sun.target.position.set(focus.x, 0, focus.z);

    // Free dancing on the beat.
    if (this.freeDance && beat >= this.freeDance.beat - 0.02) {
      this.freeDance = null;
      this.dancer.beat = () => this.clock.drawBeat();
      this.dancer.hit(0.5);
      this.ctx.pose(this.dancer.pose);
      this.freeDanceUntil = t + 0.55;
      const p = this.player_;
      this.floor.flash(this.suitColor(), 0.9);
      this.fx.rings.emit({ x: p.x, y: 0.05, z: p.z }, { color: this.suitColor(), radius: 3, life: 0.6 });
      this.crowd.cheerNow(0.8);
      snd.hit('P');
    }
    if (this.freeDanceUntil && t > this.freeDanceUntil && !this.mode) {
      this.freeDanceUntil = 0;
      this.ctx.pose(null);
    }
    // Beat count for debug and pulses.
    const bi = Math.floor(beat);
    if (bi !== this.seenBeat) {
      this.seenBeat = bi;
      if (bi % 16 === 0 && !this.mode) this.core.burst(0.5);
    }
    void tone;
    void this.toast;
  }

  private animateEq(beat: number): void {
    const eq = this.station.eq;
    const base = eq.userData.base as { x: number; z: number; a: number }[];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const ph = beat - Math.floor(beat);
    for (let i = 0; i < base.length; i++) {
      const b = base[i];
      const hgt = 0.2 + 0.75 * Math.abs(Math.sin(beat * Math.PI * 0.5 + i * 0.7)) * (0.5 + 0.5 * Math.exp(-ph * 4));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -b.a + Math.PI / 2);
      m.compose(new THREE.Vector3(b.x, 0.08 + hgt / 2, b.z), q, new THREE.Vector3(1, hgt, 1));
      eq.setMatrixAt(i, m);
    }
    eq.instanceMatrix.needsUpdate = true;
  }

  cutaway(): void {}

  dispose(): void {
    this.disposed = true;
    this.mode?.dispose();
    this.mode = null;
    music.stop(0.6);
    this.clock.stop();
    this.outfit.remove();
    this.ctx.pose(null);
    this.ctx.hold(null);
    this.rin.dispose();
    this.hud.dispose();
    this.layer.remove();
    this.post.dispose();
    this.arena.dispose();
    if (this.renderer) this.renderer.info.autoReset = true;
    for (const p of [this.fx.sparks, this.fx.glow, this.fx.confetti]) p.dispose();
    this.fx.rings.dispose();
    for (const r of [this.orbit, ...this.judges, ...this.duelists, ...this.extras]) r.dispose();
    disposeTree(this.scene);
  }

  // ---- debug (playtests)

  debugInfo(): Record<string, unknown> {
    const now = performance.now();
    return {
      mode: this.mode?.kind ?? 'roam',
      tier: this.tierNow,
      calls: this.lastInfo.calls,
      triangles: this.lastInfo.triangles,
      beat: this.clock.running ? this.clock.beatAt(now) : null,
      bpm: this.clock.running ? this.clock.bpm(now) : null,
      audible: this.clock.audible,
      offset: this.clock.inputOffset,
      intro: this.intro.on,
      stars: this.save.stars,
      nights: this.save.data.nights,
      sync: this.save.data.sync,
      board: this.boards.last,
      game: this.mode?.info() ?? null,
    };
  }

  debugDance(song: SongId = 'lights', diff: Diff = 'easy'): void {
    this.ctx.ui.closeAll();
    this.startDance(song, diff);
  }

  /** Presses as if from a device at an exact performance.now() time (down or up). */
  debugPress(at: number, down: boolean): void {
    this.rin.inject(at, down);
  }

  debugSetOffset(ms: number): void {
    this.clock.inputOffset = ms;
    this.save.data.sync.offset = ms;
    this.save.save();
  }

  debugSync(): void {
    this.ctx.ui.closeAll();
    this.runSync(() => this.roam());
  }

  debugTag(diff: TagDiff = 'normal', layout: LayoutId = 'prism', duration?: number): void {
    this.ctx.ui.closeAll();
    this.startTag(diff, layout, { duration });
  }

  debugSkipPractice(): void {
    this.save.markSeen('tag-practice');
  }

  debugSkipIntro(): void {
    this.endIntro();
  }
}
