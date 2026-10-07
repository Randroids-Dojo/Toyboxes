// Shh! The Library: shelve five overdue books while the beans you had for
// lunch build up. Toot under cover of the clock, the radiator, a sneeze or
// a snore; squeeze out silent clouds and let the breeze frame Biscuit.
// Hosted by Ms. Hush. A high stealth camera frames the whole room.

import * as THREE from 'three';
import { music } from '../../../audio/music';
import { h } from '../../../ui/ui';
import { formatLap } from '../../common';
import type { CameraShot, CaptureLabels, PlayerState, SpaceAction } from '../../../world/space';
import type { Action } from '../../../input/input';
import { buildLibrary, type LibrarySet } from '../library-set';
import { CAST, extra, Person, Pug } from '../people';
import { BISCUIT_SPOT, LIB, Library, NOISE_RADIUS, SIGHT, type LibEvent, type MaskEvent } from '../sim/library';
import { rng } from '../sim/rng';
import { LIBRARY_TIPTOE } from '../songs';
import { fx, hiss, SqueezeHiss, toot, voices } from '../toots';
import type { Figures } from '../figures';
import type { Trial, TrialWorld } from './trial';

interface Cast {
  people: Map<string, Person>;
  pug: Pug;
}

const casts = new WeakMap<Figures, Cast>();
const sets = new WeakMap<THREE.Scene, LibrarySet>();

const MASK_NAME: Record<string, string> = { bong: 'the clock', clank: 'the radiator', sneeze: 'a sneeze', snore: 'a snore', stamp: 'the stamp' };

export class LibraryTrial implements Trial {
  readonly id = 'library' as const;
  readonly tooting = false;
  private sim: Library;
  private set: LibrarySet;
  private cast: Cast;
  private phase: 'intro' | 'count' | 'run' | 'done' = 'intro';
  private btn: { src: Action; t: number; squeezing: boolean } | null = null;
  private tapWait = -1;
  private tapSqueeze = false;
  private hissSound = new SqueezeHiss();
  private freezeT = 0;
  private ticket: Promise<string | null>;
  private meter: HTMLElement;
  private meterFill: HTMLElement;
  private meterText: HTMLElement;
  private strikesEl: HTMLElement;
  private pendulumAmp = 0.15;
  private radShake = [0, 0];
  private warnings: MaskEvent[] = [];
  private shelving = -1;
  private player: PlayerState | null = null;
  private tootOnInteract = false;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camInit = false;

  constructor(
    private w: TrialWorld,
    opts: Record<string, unknown>,
  ) {
    this.sim = new Library(rng((opts.seed as number) ?? (Date.now() & 0xffff)), { short: !!opts.short });
    let set = sets.get(w.scene);
    if (!set) {
      set = buildLibrary(w.scene);
      sets.set(w.scene, set);
    }
    this.set = set;
    set.group.visible = true;
    set.slotBooks.forEach((b) => (b.visible = false));
    set.slotGlow.forEach((g, i) => (g.visible = i < this.sim.books.length));
    let cast = casts.get(w.figures);
    if (!cast) {
      const r = rng(77);
      const people = new Map<string, Person>();
      for (const rd of this.sim.readers) {
        const spec = rd.id === 'hush' ? CAST.hush : rd.id === 'dozer' ? CAST.dozer : { ...extra(rd.id, r), held: 'book' as const };
        people.set(rd.id, new Person(w.figures, spec, rd.x, rd.z, rd.yaw));
      }
      cast = { people, pug: new Pug(w.figures, BISCUIT_SPOT.x, BISCUIT_SPOT.z, 0.6) };
      casts.set(w.figures, cast);
    }
    this.cast = cast;
    for (const p of cast.people.values()) p.p.visible = true;
    cast.pug.p.visible = true;
    w.showVillage(false);
    w.ctx.teleport(LIB.cx, 7.4, Math.PI);
    w.ctx.pose('crouch');
    w.mover.reset();
    // Air in the room: a breeze from the window, swirls under the fans.
    w.clouds.clear();
    w.clouds.fields = [
      (x, _y, z) => (x > LIB.x0 && x < LIB.x1 && z > LIB.z0 && z < LIB.z1 ? { x: -0.35, y: 0, z: Math.abs(z) < 2 && x > 206 ? -z * 0.1 : 0 } : { x: 0, y: 0, z: 0 }),
      ...[195, 206].map((fx0) => (x: number, _y: number, z: number) => {
        const dx = x - fx0;
        const dz = z;
        const d = Math.hypot(dx, dz);
        if (d > 3.2 || d < 0.01) return { x: 0, y: 0, z: 0 };
        const k = (1 - d / 3.2) * 1.1;
        return { x: (-dz / d) * k, y: 0, z: (dx / d) * k };
      }),
    ];
    // HUD.
    w.ph.trial(true);
    w.ph.tummy(false);
    w.hud.strip([
      { id: 'books', label: 'Books', value: `0/${this.sim.books.length}` },
      { id: 'time', label: 'Time', value: formatLap(this.sim.limit * 1000), wide: true },
      { id: 'score', label: 'Score', value: '0' },
    ]);
    w.hud.objective('Shelve the books. Toot when it is noisy.');
    this.meterFill = h('i');
    this.strikesEl = h('span', { class: 'pf-strikes' }, h('i'), h('i'), h('i'));
    this.meterText = h('span', {}, 'Pressure');
    this.meter = h('div', { class: 'pf-meter' }, h('div', {}, this.meterText, this.strikesEl), h('div', { class: 'bar' }, this.meterFill));
    w.ph.root.appendChild(this.meter);
    this.ticket = opts.short ? Promise.resolve(null) : w.boards.ticket('library');
    music.play(LIBRARY_TIPTOE, { fadeIn: 1 });
    music.filter(20000, 0.2);
    w.words.bubble('Shh! Five books, back where they belong.', () => this.head('hush'), { life: 3, tone: 'say' });
    void this.intro().then(() => {
      this.phase = 'count';
      return w.hud.countdown(3, { go: 'Shh!' });
    }).then(() => {
      if (this.phase === 'count') this.phase = 'run';
    });
  }

  private head(id: string): THREE.Vector3 | null {
    const p = this.cast.people.get(id);
    if (p) return new THREE.Vector3(p.p.x, p.top + 0.1, p.p.z);
    if (id === 'biscuit') return new THREE.Vector3(BISCUIT_SPOT.x, 0.9, BISCUIT_SPOT.z);
    return null;
  }

  private async intro(): Promise<void> {
    await this.w.hud.intro({
      key: 'fart-library',
      title: 'Shh! The Library',
      tagline: 'You had beans for lunch. Shelve five books before the big one escapes.',
      tips: [
        { keys: ['interact'], touch: 'Shelve', text: 'Walk to a glowing gap to shelve a book.' },
        { keys: ['kick'], touch: 'Toot', text: 'Toot when something is LOUD: the clock BONG, the radiator, a sneeze.' },
        { keys: ['kick'], touch: 'Toot', text: 'Hold to squeeze: silent, but it leaves a cloud. Blame the dog!' },
      ],
      button: 'Tiptoe in',
    });
  }

  holdsTime(): boolean {
    return this.phase !== 'done';
  }

  captureInput(): CaptureLabels | null {
    if (this.phase === 'count' || this.phase === 'intro') return { action: null, kick: null, jump: null, prompt: 'Get ready...' };
    if (this.freezeT > 0) return { action: null, kick: null, jump: null, prompt: null };
    return null;
  }

  cameraShot(dt: number): CameraShot | null {
    const p = this.player;
    if (!p) return null;
    const x = Math.max(LIB.x0 + 4, Math.min(LIB.x1 - 4, p.x));
    const z = Math.max(LIB.z0 + 3, Math.min(LIB.z1 - 2, p.z));
    const wantPos = new THREE.Vector3(x, 10.8, z + 7.6);
    const wantLook = new THREE.Vector3(x, 0.4, z - 0.9);
    if (!this.camInit) {
      this.camPos.copy(wantPos);
      this.camLook.copy(wantLook);
      this.camInit = true;
    }
    const k = 1 - Math.exp(-5 * dt);
    this.camPos.lerp(wantPos, k);
    this.camLook.lerp(wantLook, k);
    return { position: this.camPos.clone(), target: this.camLook.clone(), fov: 52, blend: 1 };
  }

  actions(p: PlayerState): SpaceAction[] {
    const out: SpaceAction[] = [];
    if (this.phase !== 'run') return out;
    this.sim.books.forEach((b, i) => {
      if (!b.done) out.push({ x: b.sx, z: b.sz, range: 1.4, label: `Shelve the book (aisle ${b.aisle})`, short: 'Shelve', run: () => this.shelve(i) });
    });
    const near = out.some((a) => Math.hypot(a.x - p.x, a.z - p.z) <= a.range);
    this.tootOnInteract = !near && this.w.ctx.ui.device !== 'touch';
    if (this.tootOnInteract) out.push({ x: p.x, z: p.z, range: 0.6, label: this.label(), short: 'Toot', run: () => this.press('interact') });
    return out;
  }

  kickAction(): { label: string; run: () => void } | null {
    if (this.phase !== 'run' || this.tootOnInteract) return null;
    return { label: this.w.ctx.ui.device === 'touch' ? (this.btn?.squeezing || this.tapSqueeze ? 'Shh...' : 'Toot') : this.label(), run: () => this.press('kick') };
  }

  private label(): string {
    if (this.btn?.squeezing || this.tapSqueeze) return 'Squeezing...';
    return this.w.mover.tapMode ? 'Toot (tap twice to squeeze)' : 'Toot (hold to squeeze)';
  }

  private press(src: Action): void {
    if (this.phase !== 'run' || this.freezeT > 0) return;
    if (this.w.mover.tapMode) {
      if (this.tapSqueeze) {
        this.tapSqueeze = false;
        this.hissSound.stop();
        return;
      }
      if (this.tapWait >= 0) {
        this.tapWait = -1;
        this.tapSqueeze = true;
        this.hissSound.start();
      } else this.tapWait = 0;
      return;
    }
    this.btn = { src, t: 0, squeezing: false };
  }

  private shelve(i: number): void {
    if (this.shelving >= 0) return;
    this.shelving = i;
    this.w.ctx.swing();
    setTimeout(() => {
      this.shelving = -1;
      if (this.sim.shelve(i)) {
        fx.thock();
        const b = this.sim.books[i];
        this.set.slotBooks[i].visible = true;
        this.set.slotGlow[i].visible = false;
        this.w.hud.pop('+200', { x: b.x, y: b.y + 0.5, z: b.z }, { color: '#ffd24a' });
        this.w.sparks.burst({ at: { x: b.x, y: b.y, z: b.z }, count: 12, speed: [1, 2], color: [0xffd24a, 0xffffff], size: [0.06, 0.12], life: [0.3, 0.6], drag: 2 });
      }
    }, 450);
  }

  private tootNow(): void {
    const p = this.player;
    if (!p) return;
    const res = this.sim.toot(p.x, p.z);
    const hip = { x: p.x - Math.sin(p.yaw) * 0.2, y: p.y + 0.5, z: p.z - Math.cos(p.yaw) * 0.2 };
    this.w.ctx.squash(-0.15);
    this.w.cloudFx.burst('beans', hip, 6, { speed: 1.6, size: 0.16 });
    if (res === 'masked') {
      toot({ gas: 'beans', size: 'tap', voice: this.w.save.voice, gain: 0.25 });
      this.w.words.word('toot', { x: hip.x, y: hip.y + 0.5, z: hip.z }, { tiny: true, color: '#cfe8a8' });
      this.w.rings.emit({ x: p.x, y: 0.06, z: p.z }, { color: 0xb0d890, radius: 1.2, life: 0.4, alpha: 0.5 });
    } else {
      toot({ gas: 'beans', size: 'tap', voice: this.w.save.voice });
      this.w.words.word('TOOT!', { x: hip.x, y: hip.y + 0.6, z: hip.z }, { color: '#8fd14f', size: 1.2 });
      this.w.rings.emit({ x: p.x, y: 0.06, z: p.z }, { color: 0xff6f8f, radius: NOISE_RADIUS, life: 0.7, alpha: 0.8 });
      this.w.ctx.shake(0.06);
    }
  }

  step(hs: number, p: PlayerState): void {
    this.player = p;
    if (this.phase !== 'run') return;
    if (this.freezeT > 0) {
      this.freezeT -= hs;
      return;
    }
    const input = this.w.ctx.input;
    if (this.tootOnInteract && input.take('kick')) this.press('kick');
    // The toot button: tap toots, holding squeezes.
    if (this.btn) {
      const held = input.isHeld(this.btn.src);
      this.btn.t += hs;
      if (held && !this.btn.squeezing && this.btn.t > 0.28) {
        this.btn.squeezing = true;
        this.hissSound.start();
        this.w.ctx.pose('crouch');
      }
      if (!held) {
        if (!this.btn.squeezing) this.tootNow();
        else this.hissSound.stop();
        this.btn = null;
      }
    }
    if (this.tapWait >= 0) {
      this.tapWait += hs;
      if (this.tapWait > 0.3) {
        this.tapWait = -1;
        this.tootNow();
      }
    }
    if (this.btn?.squeezing || this.tapSqueeze) {
      if (this.sim.squeeze(hs)) {
        this.w.clouds.add('squeeze', p.x - Math.sin(p.yaw) * 0.3, 0.8, p.z - Math.cos(p.yaw) * 0.3, { big: 0.9, vy: 0.1 });
        this.w.cloudFx.burst('squeeze', { x: p.x, y: 0.6, z: p.z }, 2, { speed: 0.6, size: 0.14 });
      }
      if (this.sim.pressure <= 0 && this.tapSqueeze) {
        this.tapSqueeze = false;
        this.hissSound.stop();
      }
    }
    this.sim.step(hs, { x: p.x, z: p.z }, (x, z) => {
      const s = this.w.clouds.stinkAt(x, 1.2, z);
      if (s <= 0) return null;
      const c = this.w.clouds.strongestAt(x, 1.2, z);
      return c ? { stink: s, cx: c.x, cz: c.z } : null;
    });
    for (const e of this.sim.takeEvents()) this.onEvent(e);
    this.w.hud.set('time', formatLap(Math.max(0, this.sim.limit - this.sim.time) * 1000), { bump: false });
    this.w.hud.set('score', this.sim.score().toLocaleString('en-US'));
    this.w.hud.set('books', `${this.sim.shelved}/${this.sim.books.length}`);
  }

  private onEvent(e: LibEvent): void {
    const w = this.w;
    switch (e.kind) {
      case 'warn':
        this.warnings.push(e.mask);
        if (e.mask.kind === 'sneeze') w.words.bubble('Ah... ah...', () => this.head('sneezer'), { life: 1.6, tone: 'think' });
        if (e.mask.kind === 'clank') hiss(1.2, { gain: 0.05, freq: 3000, q: 0.8 });
        break;
      case 'loud': {
        const m = e.mask;
        const word = m.kind === 'bong' ? 'BONG!' : m.kind === 'clank' ? 'CLANK!' : m.kind === 'sneeze' ? 'ACHOO!' : m.kind === 'snore' ? 'SNORRRK' : 'THUNK';
        if (m.kind === 'bong') fx.bong();
        else if (m.kind === 'clank') fx.clank();
        else if (m.kind === 'sneeze') voices.sneeze();
        else if (m.kind === 'snore') voices.snore();
        w.words.word(word, { x: m.x, y: 2.8, z: m.z }, { color: '#fff3b0', size: m.kind === 'bong' ? 1.8 : 1.2, life: 1.1 });
        w.rings.emit({ x: m.x, y: 0.07, z: m.z }, { color: 0xfff3b0, radius: Math.min(14, m.radius), life: 0.8, alpha: 0.35 });
        break;
      }
      case 'masked':
        fx.ding();
        w.hud.judge(e.perfect ? 'Perfect! +75' : 'Masked! +50', e.perfect ? '#ffd24a' : '#8fd14f');
        break;
      case 'heard':
        w.words.icon('?', () => this.head(e.by), { life: 2 });
        break;
      case 'caught': {
        fx.shh();
        fx.strike();
        w.words.bubble('SHHH!', () => this.head(e.by), { tone: 'shout', life: 1.8 });
        w.hud.banner('Shh!', { sub: `Strike ${this.sim.strikes} of 3`, color: '#e8574a', ms: 1200 });
        w.ctx.shake(0.2);
        if (e.first) {
          this.freezeT = 0.6;
          setTimeout(() => w.ctx.ui.toast('They heard you! Wait for a loud noise, like the clock BONG, then toot.', 'info', 4200), 300);
        }
        break;
      }
      case 'smell':
        voices.sniff();
        w.words.bubble('Sniff sniff... pee-yew!', () => this.head(e.by), { life: 2 });
        break;
      case 'framed': {
        fx.dunDun();
        const name = e.target === 'biscuit' ? 'Biscuit!' : 'Mr. Dozer!';
        w.words.bubble(name, () => this.head(e.by), { tone: 'shout', life: 2 });
        w.hud.judge('Framed! +100', '#ffd24a');
        if (e.target === 'biscuit') this.cast.pug.p.sad = 1;
        break;
      }
      case 'blamed':
        fx.strike();
        w.words.bubble('Was that YOU?', () => this.head(e.by), { tone: 'shout', life: 2 });
        w.hud.banner('Pee-yew!', { sub: `Strike ${this.sim.strikes} of 3`, color: '#9b7bd6', ms: 1200 });
        break;
      case 'rumble':
        fx.rumble();
        this.meter.classList.add('hot');
        setTimeout(() => this.meter.classList.remove('hot'), 1500);
        break;
      case 'overflow': {
        // The big one escapes.
        const p = this.player;
        toot({ gas: 'beans', size: 'rocket', voice: w.save.voice, dur: 2.4, gain: 1.2 });
        w.ctx.shake(0.8);
        w.hud.flash('#d4f58a', 500, 0.7);
        if (p) {
          w.clouds.add('beans', p.x, 1, p.z, { big: 4, stink: 0.2 });
          w.cloudFx.ring('beans', { x: p.x, y: 0.4, z: p.z }, 30, 9, 0.5);
          w.confetti.burst({ at: { x: p.x, y: 2, z: p.z }, count: 120, speed: [4, 9], color: [0xe8574a, 0x4aa3df], size: [0.12, 0.22], life: [1.2, 2], gravity: 8, drag: 0.8, sizeEnd: 1 });
        }
        w.words.word('KA-PAAARRP!', p ? { x: p.x, y: 3, z: p.z } : { x: 200, y: 3, z: 0 }, { size: 2.2, life: 2 });
        break;
      }
      case 'end':
        void this.finish(e.why);
        break;
      default:
        break;
    }
  }

  private async finish(why: 'done' | 'time' | 'strikes' | 'overflow'): Promise<void> {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.btn = null;
    this.tapSqueeze = false;
    this.hissSound.stop();
    const w = this.w;
    const score = this.sim.score();
    const beans = this.sim.beans();
    music.duck(0.3, 2);
    if (why === 'done') {
      fx.fanfare();
      w.hud.banner('All shelved!', { sub: `${score.toLocaleString('en-US')} points`, size: 'xl', ms: 1800 });
      w.words.bubble('Hmph. Very... quiet. Well done.', () => this.head('hush'), { life: 3 });
    } else {
      fx.sadTrombone();
      w.hud.banner(why === 'strikes' ? 'Shown the door!' : why === 'overflow' ? 'The big one escaped!' : 'Closing time!', { size: 'l', ms: 2000 });
      w.words.bubble(why === 'time' ? 'Closing time, dearie.' : 'OUT!', () => this.head('hush'), { tone: 'shout', life: 3 });
    }
    const full = this.sim.books.length === 5;
    const res = w.trialBeans('library', beans, full ? score : null, 'higher');
    const ticket = await this.ticket;
    const posted = full && score > 0 ? await w.boards.post('library', score, ticket) : null;
    await new Promise((r) => setTimeout(r, 1400));
    const choice = await w.hud.results({
      title: why === 'done' ? 'All shelved!' : why === 'strikes' ? 'Shown the door' : why === 'overflow' ? 'The big one escaped' : 'Closing time',
      subtitle: `${this.sim.shelved} of ${this.sim.books.length} books shelved`,
      stars: beans,
      rows: [
        { label: 'Score', value: score.toLocaleString('en-US'), best: res.newBest },
        { label: 'Masked toots', value: String(this.sim.maskedCount) },
        { label: 'Framed', value: String(this.sim.frames) },
        { label: 'Strikes', value: `${this.sim.strikes} of 3` },
      ],
      badges: [...(res.newBest ? ['New best!'] : []), ...(res.newBeans ? [`+${res.newBeans} golden bean${res.newBeans > 1 ? 's' : ''}`] : []), ...(posted?.rank ? [`Number ${posted.rank} on the board`] : [])],
      board: { title: posted?.error ? `Quietest librarians (${posted.error})` : 'Quietest librarians', rows: posted?.rows ?? w.boards.rows('library') },
      buttons: [
        { id: 'again', label: 'Play again', primary: true },
        { id: 'next', label: 'Next: Picnic Panic' },
        { id: 'leave', label: 'Back to the fete' },
      ],
    });
    w.ctx.teleport(19, -12.6, 0);
    w.endTrial(choice === 'again' ? 'again' : choice === 'next' ? 'picnic' : undefined);
  }

  update(dt: number, t: number): void {
    const s = this.sim;
    // Telegraphs: the pendulum swings wider before a BONG; radiators shudder.
    const nextBong = s.masks.find((m) => m.kind === 'bong' && m.at > s.time - 0.5);
    const lead = nextBong ? nextBong.at - s.time : 99;
    const want = lead < 2.4 && lead > -0.4 ? 0.6 : 0.15;
    this.pendulumAmp += (want - this.pendulumAmp) * Math.min(1, dt * 3);
    this.set.pendulum.rotation.z = Math.sin(t * (lead < 2.4 ? 5 : 2.4)) * this.pendulumAmp;
    for (let i = 0; i < 2; i++) {
      const rz = this.set.radiators[i].position.z;
      const clank = s.masks.find((m) => m.kind === 'clank' && Math.abs(m.z - rz) < 0.1 && m.at > s.time - 0.3 && m.at - s.time < 1.4);
      this.radShake[i] = clank ? 0.04 : 0;
      this.set.radiators[i].position.x = 212.65 + Math.sin(t * 60) * this.radShake[i];
      if (clank && Math.random() < dt * 8) this.w.dust.burst({ at: { x: 212.4, y: 1.1, z: rz }, count: 2, shape: 'up', speed: [0.5, 1], color: 0xffffff, size: [0.15, 0.3], sizeEnd: 2, life: [0.6, 1], gravity: -0.6, alpha: 0.5 });
    }
    for (const f of this.set.fans) f.rotation.y = t * 3;
    this.set.curtains.forEach((c, i) => (c.rotation.z = Math.sin(t * 1.7 + i) * 0.15 - 0.12));
    this.set.slotGlow.forEach((g) => ((g.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 5) * 0.35));
    // People.
    const hush = s.readers.find((r) => r.id === 'hush');
    for (const r of s.readers) {
      const p = this.cast.people.get(r.id);
      if (!p) continue;
      const pp = p.p;
      pp.x = r.x;
      pp.z = r.z;
      pp.yaw = r.yaw;
      const moving = r.state === 'investigate' || r.state === 'return' || (r.id === 'hush' && s.hushMoving);
      pp.sit = r.id === 'hush' || moving || r.state === 'shush' ? 0 : 1;
      pp.walk += dt * 7;
      pp.stride = moving ? 0.8 : 0;
      pp.armL = { x: 0.9, z: 0.3 };
      pp.armR = { x: 0.9, z: 0.3 };
      pp.headPitch = 0.25;
      pp.headRoll = 0;
      pp.face = 'neutral';
      pp.holding = r.id !== 'hush' && r.id !== 'dozer';
      if (r.state === 'shush') {
        pp.face = 'angry';
        pp.armR = { x: 2.3, z: -0.25 };
        pp.headPitch = 0;
      } else if (r.state === 'investigate') {
        pp.face = 'suspicious';
        pp.headPitch = 0;
        pp.holding = false;
        pp.armL = { x: 0.2, z: 0.2 };
        pp.armR = { x: 0.2, z: 0.2 };
      } else if (r.state === 'sniff') {
        pp.face = 'peeyew';
        pp.armR = { x: 1.9, z: 0.2 + Math.sin(t * 16) * 0.3 };
      } else if (r.state === 'sleep') {
        pp.face = 'sleepy';
        pp.headRoll = 0.35;
        pp.armL = { x: 0.3, z: 0.2 };
        pp.armR = { x: 0.3, z: 0.2 };
      } else if (r.id === 'hush') {
        pp.face = 'suspicious';
        pp.armL = { x: 1.2, z: 0.15 };
        pp.armR = { x: 1.2, z: 0.15 };
        pp.headPitch = 0;
      }
      if (r.id === 'sneezer') {
        const sn = s.masks.find((m) => m.kind === 'sneeze' && m.at > s.time - 0.4 && m.at - s.time < 1.5);
        if (sn) pp.headPitch = sn.at - s.time > 0 ? -0.5 : 0.5;
      }
      p.update();
    }
    void hush;
    this.cast.pug.p.peck = 1;
    this.cast.pug.update();
    // View cones for alert readers.
    s.readers.forEach((r, i) => {
      const c = this.set.cones[i];
      if (!c) return;
      const alert = r.state === 'investigate' || r.state === 'shush';
      c.visible = alert;
      if (alert) {
        c.position.set(r.x, 0.06, r.z);
        c.rotation.y = r.yaw;
        c.scale.setScalar(SIGHT.range * 0.5);
        (c.material as THREE.MeshBasicMaterial).opacity = r.state === 'shush' ? 0.45 : 0.25;
      }
    });
    // Pressure meter and the next loud noise.
    const pr = Math.min(100, s.pressure);
    this.meterFill.style.transform = `scaleX(${pr / 100})`;
    const next = s.nextMask();
    const inS = next ? Math.max(0, next.at - s.time) : 0;
    this.meterText.textContent = `Pressure ${Math.round(pr)}%${next ? `  ·  next noise: ${MASK_NAME[next.kind]} in ${inS.toFixed(0)}` : ''}`;
    this.meter.classList.toggle('hot', pr > 80);
    Array.from(this.strikesEl.children).forEach((el, i) => el.classList.toggle('on', i < s.strikes));
    music.layer('tension', pr > 75);
  }

  dispose(): void {
    this.hissSound.stop();
    this.set.group.visible = false;
    for (const p of this.cast.people.values()) {
      p.p.visible = false;
      p.update();
    }
    this.cast.pug.p.visible = false;
    this.cast.pug.update();
    this.meter.remove();
    this.w.ph.tummy(true);
    this.w.clouds.fields = [];
    this.w.clouds.clear();
    this.w.ctx.pose(null);
    this.w.hud.strip([]);
    this.w.hud.objective(null);
  }

  debug(): Record<string, unknown> {
    const s = this.sim;
    const next = s.nextMask();
    return {
      phase: this.phase,
      time: +s.time.toFixed(2),
      pressure: Math.round(s.pressure),
      strikes: s.strikes,
      shelved: s.shelved,
      books: s.books.map((b) => ({ x: b.sx, z: b.sz, done: b.done })),
      masked: s.maskedCount,
      frames: s.frames,
      score: s.score(),
      nextMask: next ? { kind: next.kind, at: +next.at.toFixed(2), in: +(next.at - s.time).toFixed(2), x: next.x, z: next.z, radius: next.radius } : null,
      readers: s.readers.map((r) => ({ id: r.id, state: r.state, x: +r.x.toFixed(2), z: +r.z.toFixed(2) })),
      ended: s.ended?.why ?? null,
    };
  }

  /** Playtests: set the pressure. */
  debugPressure(p: number): void {
    this.sim.pressure = p;
  }

  /** Playtests: fewer books. */
  debugShorten(n: number): void {
    this.sim.books = this.sim.books.slice(0, n);
    this.set.slotGlow.forEach((g, i) => (g.visible = i < n));
    this.w.hud.set('books', `${this.sim.shelved}/${n}`);
  }

  /** Playtests: jump the clock to a moment before the next loud noise. */
  debugSkipTo(seconds: number): void {
    this.sim.time = seconds;
  }
}
