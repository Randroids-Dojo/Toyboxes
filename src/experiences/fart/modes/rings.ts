// Rocket Rings: a sky rally through twelve gold hoops round the village, in
// order, against the clock and your own ghost. Hosted by Mr. Fizzwhistle.

import * as THREE from 'three';
import { music } from '../../../audio/music';
import { h } from '../../../ui/ui';
import { formatLap } from '../../common';
import type { CaptureLabels, PlayerState, SpaceAction } from '../../../world/space';
import { SPOTS } from '../layout';
import { crossesHoop, hoops, ringsBeans, RINGS_START, type Hoop } from '../../../shared/fart/course';
import { RINGS_GALOP } from '../songs';
import { fx, toot } from '../toots';
import type { Trial, TrialWorld } from './trial';

const LIMIT_MS = 180_000;

interface Pickup {
  x: number;
  y: number;
  z: number;
  gas: 'beans' | 'fizzy' | 'crumb';
  taken: boolean;
}

export class RocketRings implements Trial {
  readonly id = 'rings' as const;
  get tooting(): boolean {
    return this.phase === 'run';
  }
  private phase: 'count' | 'run' | 'done' = 'count';
  private hoops: Hoop[];
  private next = 0;
  private ms = 0;
  private splits: number[] = [];
  private mesh: THREE.InstancedMesh;
  private beacon: THREE.Mesh;
  private pickups: Pickup[] = [];
  private pickMesh: THREE.InstancedMesh;
  private passAnim: { i: number; t: number }[] = [];
  private prev: { x: number; y: number; z: number } | null = null;
  private ticket: Promise<string | null>;
  private ghostRec: number[][] = [];
  private recT = 0;
  private ghost: THREE.Group;
  private ghostPath: number[][] | null;
  private arrow: HTMLElement;
  private v = new THREE.Vector3();

  constructor(
    private w: TrialWorld,
    opts: Record<string, unknown>,
  ) {
    const all = hoops();
    this.hoops = opts.short ? all.slice(0, 3) : all;
    // Hoops: gold rings, one draw call.
    const geo = new THREE.TorusGeometry(1.5, 0.14, 10, 40);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffb020, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.3 }), this.hoops.length);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.hoops.length * 3), 3);
    this.mesh.frustumCulled = false;
    w.scene.add(this.mesh);
    // A beam of light over the next hoop.
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    w.scene.add(this.beacon);
    // Pickups: crumbs between hoops, a bean tin by the statue, fizzy pop past the tower.
    let px = RINGS_START.x;
    let py = 1;
    let pz = RINGS_START.z;
    for (const hp of this.hoops) {
      this.pickups.push({ x: (px + hp.x) / 2, y: (py + hp.y) / 2 + 0.5, z: (pz + hp.z) / 2, gas: 'crumb', taken: false });
      px = hp.x;
      py = hp.y;
      pz = hp.z;
    }
    if (!opts.short) {
      this.pickups.push({ x: 0, y: 5.4, z: -15, gas: 'beans', taken: false });
      this.pickups.push({ x: -19.2, y: 14.8, z: -14.2, gas: 'fizzy', taken: false });
    }
    this.pickMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.26, 1), new THREE.MeshToonMaterial({ color: 0xffffff, emissive: 0x404040 }), this.pickups.length);
    this.pickMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.pickups.length * 3), 3);
    this.pickups.forEach((p, i) => this.pickMesh.setColorAt(i, new THREE.Color(p.gas === 'beans' ? 0xe8574a : p.gas === 'fizzy' ? 0xff8fc8 : 0xd4f58a)));
    this.pickMesh.frustumCulled = false;
    w.scene.add(this.pickMesh);
    // Your best run as a ghost.
    this.ghostPath = opts.short ? null : w.save.ghost;
    this.ghost = new THREE.Group();
    const gm = new THREE.MeshBasicMaterial({ color: 0x8fd14f, transparent: true, opacity: 0.38, depthWrite: false });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.6, 4, 10), gm);
    body.position.y = 0.65;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), gm);
    head.position.y = 1.35;
    this.ghost.add(body, head);
    this.ghost.visible = false;
    w.scene.add(this.ghost);
    this.arrow = h('div', { class: 'pf-arrow hidden' });
    this.arrow.innerHTML = '<svg viewBox="0 0 44 44"><path d="M22 4 L40 38 L22 30 L4 38 Z" fill="#ffd24a" stroke="#2b1d3a" stroke-width="3" stroke-linejoin="round"/></svg>';
    w.ph.root.appendChild(this.arrow);

    // Start: on the pad, facing the first hoop, a full tank of beans.
    const h0 = this.hoops[0];
    w.ctx.teleport(RINGS_START.x, RINGS_START.z, Math.atan2(h0.x - RINGS_START.x, h0.z - RINGS_START.z));
    w.mover.tank.eat('beans');
    w.mover.reset();
    w.hud.strip([
      { id: 'time', label: 'Time', value: '0:00.00', wide: true },
      { id: 'ring', label: 'Ring', value: `0/${this.hoops.length}` },
      { id: 'split', label: 'Split', value: '--', wide: true },
    ]);
    w.hud.objective('Fly through the gold rings in order');
    w.words.bubble('Ready, steady...', () => w.vil.head('fizz'), { life: 2.5, tone: 'shout' });
    this.ticket = w.boards.ticket('rings');
    music.play(RINGS_GALOP, { fadeIn: 0.5 });
    music.filter(20000, 0.2);
    void this.intro().then(() => w.hud.countdown(3, { go: 'TOOT!', tick: (n) => (n === 0 ? toot({ gas: 'beans', size: 'boost', voice: w.save.voice }) : undefined) })).then(() => {
      if (this.phase === 'count') this.phase = 'run';
    });
    this.paint();
  }

  private async intro(): Promise<void> {
    if (this.w.save.seen.includes('rings')) return;
    this.w.save.seen.push('rings');
    this.w.saveNow();
    await this.w.hud.intro({
      key: 'fart-rings',
      title: 'Rocket Rings',
      tagline: 'Fly through all the gold rings in order. Fast!',
      tips: [
        { keys: ['kick'], touch: 'Toot', text: 'Big ones and boosts get you up high.' },
        { keys: ['jump'], touch: 'Boost', text: 'Grab the bean tin and fizzy pop on the way.' },
        { keys: ['move'], text: 'Follow the beam of light to the next ring.' },
      ],
      button: 'Ready',
      force: true,
    });
  }

  holdsTime(): boolean {
    return this.phase !== 'done';
  }

  /** Back on the start pad after the first ring, you can give up the rally. */
  actions(p: PlayerState): SpaceAction[] {
    if (this.phase !== 'run' || this.next === 0) return [];
    if (Math.hypot(p.x - SPOTS.rings.x, p.z - SPOTS.rings.z) > SPOTS.rings.range || !p.grounded) return [];
    return [{ ...SPOTS.rings, label: 'Give up the rally', short: 'Give up', run: () => this.giveUp() }];
  }

  private giveUp(): void {
    this.phase = 'done';
    music.duck(0.4, 1);
    this.w.endTrial();
  }

  /** Playtests: a short course with the real start. */
  debugShorten(n: number): void {
    this.hoops = this.hoops.slice(0, n);
    this.w.hud.set('ring', `${this.next}/${this.hoops.length}`);
  }

  captureInput(): CaptureLabels | null {
    return this.phase === 'count' ? { action: null, kick: null, jump: null, prompt: 'Get ready...' } : null;
  }

  step(hs: number, p: PlayerState): void {
    const at = { x: p.x, y: p.y + 0.8, z: p.z };
    if (this.phase === 'run') {
      this.ms += hs * 1000;
      if (this.prev) {
        const hp = this.hoops[this.next];
        if (hp && crossesHoop(hp, this.prev, at)) this.pass();
      }
      // Pickups.
      for (const k of this.pickups) {
        if (k.taken || Math.hypot(k.x - at.x, k.y - at.y, k.z - at.z) > 1.2) continue;
        k.taken = true;
        if (k.gas === 'crumb') {
          this.w.mover.tank.crumb();
          fx.crumb(this.next);
        } else {
          this.w.mover.tank.eat(k.gas);
          fx.gulp();
          this.w.ctx.ui.toast(k.gas === 'beans' ? 'Beans! Rocket power.' : 'Fizzy pop! Hold to glide.', 'good', 1600);
        }
        this.w.sparks.burst({ at: k, count: 16, speed: [1, 3], color: [0xffd24a, 0xffffff], size: [0.08, 0.16], life: [0.3, 0.7], drag: 2 });
      }
      this.recT += hs;
      if (this.recT >= 0.1) {
        this.recT -= 0.1;
        this.ghostRec.push([Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.z * 100) / 100]);
      }
      if (this.ms > LIMIT_MS) void this.finish(false);
    }
    this.prev = at;
    this.w.hud.set('time', formatLap(this.ms), { bump: false });
  }

  private pass(): void {
    const i = this.next;
    this.splits.push(this.ms);
    this.passAnim.push({ i, t: 0 });
    this.next++;
    fx.chime(i);
    const hp = this.hoops[i];
    this.w.sparks.burst({ at: hp, count: 30, shape: 'ring', speed: [3, 6], color: [0xffd24a, 0xfff3b0], size: [0.1, 0.2], life: [0.4, 0.8], drag: 2 });
    this.w.rings.emit(hp, { color: 0xffd24a, radius: 3.5, life: 0.5, normal: { x: hp.nx, y: hp.ny, z: hp.nz } });
    this.w.hud.set('ring', `${this.next}/${this.hoops.length}`);
    const best = this.w.save.trials.rings.best !== null ? this.bestSplitsFor(i) : null;
    if (best !== null) {
      const d = this.ms - best;
      this.w.hud.set('split', `${d <= 0 ? '-' : '+'}${(Math.abs(d) / 1000).toFixed(2)}`, { tone: d <= 0 ? 'good' : 'bad' });
    }
    if (this.next >= this.hoops.length) void this.finish(true);
    this.paint();
  }

  private bestSplitsFor(i: number): number | null {
    const g = this.w.save.ghost;
    if (!g || !this.ghostPath) return null;
    // Splits are stored after the ghost path as a final row.
    const row = g[g.length - 1];
    return row && row.length > i && g.length > 1 ? row[i] : null;
  }

  private async finish(done: boolean): Promise<void> {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.arrow.classList.add('hidden');
    const w = this.w;
    const ms = Math.round(this.ms);
    const beans = done && this.hoops.length === hoops().length ? ringsBeans(ms) : done ? 1 : 0;
    music.duck(0.3, 2);
    if (done) {
      fx.fanfare();
      w.confetti.burst({ at: { x: w.player()!.x, y: w.player()!.y + 3, z: w.player()!.z }, count: 120, shape: 'up', speed: [3, 7], color: [0xffd24a, 0xe8574a], size: [0.1, 0.18], life: [1.6, 2.6], gravity: 5, drag: 1.2, sizeEnd: 1 });
      w.hud.banner('Rally finished!', { sub: formatLap(ms), size: 'xl', ms: 1800 });
      w.words.bubble(ms < 48000 ? 'Wizzo! Record pace!' : 'Wizzo!', () => w.vil.head('fizz'), { tone: 'shout', life: 2.5 });
    } else {
      fx.sadTrombone();
      w.hud.banner('Out of time', { size: 'l' });
    }
    const full = this.hoops.length === hoops().length;
    const before = w.save.trials.rings.best;
    const res = w.trialBeans('rings', beans, done && full ? ms : null, 'lower');
    if (done && full && res.newBest) {
      w.save.ghost = [...this.ghostRec, this.splits.map((s) => Math.round(s))];
      w.saveNow();
    }
    const ticket = await this.ticket;
    const posted = done && full ? await w.boards.post('rings', ms, ticket) : null;
    await new Promise((r) => setTimeout(r, 1200));
    const choice = await w.hud.results({
      title: done ? 'Rally finished!' : 'Out of time',
      subtitle: done ? `${this.hoops.length} rings in ${formatLap(ms)}` : 'The rings will be here when you come back.',
      stars: beans,
      rows: [
        { label: 'Time', value: done ? formatLap(ms) : '--', best: res.newBest },
        { label: 'Your best', value: formatLap(w.save.trials.rings.best ?? before) },
        { label: 'Golden beans', value: `${w.save.trials.rings.beans} of 3` },
      ],
      badges: [...(res.newBest ? ['New best!'] : []), ...(res.newBeans ? [`+${res.newBeans} golden bean${res.newBeans > 1 ? 's' : ''}`] : []), ...(posted?.rank ? [`Number ${posted.rank} on the board`] : [])],
      board: { title: posted?.error ? `Fastest rally (${posted.error})` : 'Fastest rally', rows: posted?.rows ?? w.boards.rows('rings') },
      buttons: [
        { id: 'again', label: 'Play again', primary: true },
        { id: 'next', label: 'Next: Brass Band Bash' },
        { id: 'leave', label: 'Back to the fete' },
      ],
    });
    w.endTrial(choice === 'again' ? 'again' : choice === 'next' ? 'band' : undefined);
  }

  update(dt: number, t: number): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    this.hoops.forEach((hp, i) => {
      const anim = this.passAnim.find((a) => a.i === i);
      let scale = 1;
      let spin = 0;
      if (anim) {
        anim.t += dt;
        scale = Math.max(0, 1 - anim.t * 1.4);
        spin = anim.t * 9;
      } else if (i === this.next) {
        scale = 1 + Math.sin(t * 5) * 0.06;
      }
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(hp.nx, hp.ny, hp.nz));
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spin + t * 0.3));
      s.setScalar(scale);
      m.compose(this.v.set(hp.x, hp.y, hp.z), q, s);
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    const nh = this.hoops[this.next];
    this.beacon.visible = !!nh && this.phase !== 'done';
    if (nh) {
      this.beacon.position.set(nh.x, nh.y + 21.7, nh.z);
      (this.beacon.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(t * 4) * 0.04;
    }
    this.pickups.forEach((k, i) => {
      const sc = k.taken ? 0 : k.gas === 'crumb' ? 0.85 : 1.9 + Math.sin(t * 6) * 0.15;
      m.compose(this.v.set(k.x, k.y + Math.sin(t * 2 + i) * 0.1, k.z), q.setFromEuler(new THREE.Euler(0, t * 2 + i, 0)), s.set(sc, sc * 0.8, sc));
      this.pickMesh.setMatrixAt(i, m);
    });
    this.pickMesh.instanceMatrix.needsUpdate = true;
    // The ghost runs your best line.
    const gp = this.ghostPath;
    if (gp && gp.length > 2 && this.phase === 'run') {
      const f = this.ms / 100;
      const i = Math.min(gp.length - 3, Math.floor(f));
      const k = f - i;
      const a = gp[i];
      const b = gp[i + 1];
      if (a && b && b.length === 3) {
        this.ghost.visible = true;
        this.ghost.position.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
        this.ghost.rotation.y = Math.atan2(b[0] - a[0], b[2] - a[2]);
      } else this.ghost.visible = false;
    } else this.ghost.visible = false;
    // Off-screen arrow to the next hoop.
    if (nh && this.phase === 'run') {
      this.v.set(nh.x, nh.y, nh.z).project(this.w.ctx.camera);
      const off = this.v.z > 1 || Math.abs(this.v.x) > 0.92 || Math.abs(this.v.y) > 0.88;
      this.arrow.classList.toggle('hidden', !off);
      if (off) {
        let x = this.v.x;
        let y = this.v.y;
        if (this.v.z > 1) {
          x = -x;
          y = -y;
        }
        const ang = Math.atan2(x, y);
        const r = Math.min(0.86 / Math.max(Math.abs(Math.sin(ang)), 0.01), 0.82 / Math.max(Math.abs(Math.cos(ang)), 0.01));
        const sx = (Math.sin(ang) * r + 1) / 2;
        const sy = (1 - Math.cos(ang) * r) / 2;
        this.arrow.style.transform = `translate(${sx * innerWidth}px, ${sy * innerHeight}px) rotate(${ang}rad)`;
      }
    }
  }

  private paint(): void {
    this.hoops.forEach((_, i) => {
      const c = i < this.next ? 0x8fd14f : i === this.next ? 0xffe27a : 0x9a8a6a;
      this.mesh.setColorAt(i, new THREE.Color(c));
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const o of [this.mesh, this.beacon, this.pickMesh]) {
      this.w.scene.remove(o);
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    this.w.scene.remove(this.ghost);
    this.ghost.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.arrow.remove();
    this.w.hud.strip([]);
    this.w.hud.objective(null);
  }

  debug(): Record<string, unknown> {
    return { phase: this.phase, next: this.next, hoops: this.hoops.length, ms: Math.round(this.ms), nextHoop: this.hoops[this.next] ?? null };
  }
}
