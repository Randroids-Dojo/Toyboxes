// Comet surf: stand on the moored comet and ride a fixed loop through the
// galaxy: past Cinder, along the black hole's disk, behind it, through the
// streak field, down through the gap between the blue planet and its ring,
// low over the hub and home. Steer to collect 300 stardust motes in ribbons
// that play the melody; Interact spins a magnet that pulls nearby motes in.

import * as THREE from 'three';
import { api } from '../../../net/api';
import { COMET_MOTES, COMET_SECONDS, DOCK, cometClouds, cometCurve, cometMotes, novaFor, starsFor, THRESHOLDS, type Mote } from '../../../shared/galaxy-rules';
import type { CameraShot, Carry, MoveInput, PlayerState, SpaceAction } from '../../../world/space';
import { Ribbon } from '../../kit';
import { gsfx, COMET_SONG } from '../audio';
import { shortRound, type Galaxy } from '../index';
import type { Round } from './round';

type State = 'intro' | 'countdown' | 'run' | 'landing' | 'done';

const UP = new THREE.Vector3(0, 1, 0);

/** The path's frame at u: forward, right and up. */
function frame(u: number): { p: THREE.Vector3; f: THREE.Vector3; r: THREE.Vector3; up: THREE.Vector3 } {
  const c = cometCurve();
  const a = c.at(u);
  const d = c.dir(u);
  const f = new THREE.Vector3(d.x, d.y, d.z);
  const r = new THREE.Vector3().crossVectors(f, UP).normalize();
  const up = new THREE.Vector3().crossVectors(r, f).normalize();
  return { p: new THREE.Vector3(a.x, a.y, a.z), f, r, up };
}

export class Comet implements Round {
  readonly id = 'comet' as const;
  readonly boarded = true;
  private state: State = 'intro';
  private t = 0;
  private u = 0;
  private ox = 0;
  private oy = 0;
  private vx = 0;
  private vy = 0;
  private score = 0;
  private motes: (Mote & { pos: THREE.Vector3; taken: boolean })[];
  private ribbonLeft = new Map<number, number>();
  private chain = 0;
  private lastTake = -9;
  private clouds: { pos: THREE.Vector3; hit: boolean; mesh: THREE.Group }[] = [];
  private magnet = 0;
  private cooldown = 0;
  private points: THREE.Points;
  private sizes: Float32Array;
  private group = new THREE.Group();
  private ribbonTail: Ribbon[] = [];
  private seconds = shortRound(COMET_SECONDS);
  private camPos = new THREE.Vector3();
  private camTarget = new THREE.Vector3();
  private camInit = false;
  private ribbonsDone = 0;
  private cloudsHit = 0;
  private landing: { from: THREE.Vector3; t: number } | null = null;
  private pos = new THREE.Vector3();
  private dirV = new THREE.Vector3(1, 0, 0);

  constructor(private g: Galaxy) {
    this.motes = cometMotes().map((m) => {
      const fr = frame(m.u);
      const pos = fr.p.clone().addScaledVector(fr.r, m.ox).addScaledVector(fr.up, m.oy);
      this.ribbonLeft.set(m.ribbon, (this.ribbonLeft.get(m.ribbon) ?? 0) + 1);
      return { ...m, pos, taken: false };
    });
    // Stardust: one draw call.
    const pos = new Float32Array(this.motes.length * 3);
    this.sizes = new Float32Array(this.motes.length);
    const col = new Float32Array(this.motes.length * 3);
    const palette = ['#f4b740', '#8a6bd1', '#3fb68b', '#4aa3df', '#e8574a', '#fffaf0'].map((c) => new THREE.Color(c));
    this.motes.forEach((m, i) => {
      pos.set([m.pos.x, m.pos.y, m.pos.z], i * 3);
      this.sizes[i] = 1;
      const c = palette[m.ribbon % palette.length];
      col.set([c.r, c.g, c.b], i * 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { ...g.uniforms, uScale: { value: 300 } },
        vertexShader: /* glsl */ `
          attribute float aSize; attribute vec3 aColor;
          uniform float uTime; uniform float uScale;
          varying vec3 vC; varying float vS;
          void main() {
            vC = aColor; vS = aSize;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * uScale * (0.9 + 0.2 * sin(uTime * 5.0 + position.x)) / max(1.0, -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vC; varying float vS;
          void main() {
            if (vS < 0.01) discard;
            vec2 p = gl_PointCoord * 2.0 - 1.0;
            float d = length(p);
            float a = smoothstep(1.0, 0.0, d);
            float core = smoothstep(0.35, 0.0, d);
            gl_FragColor = vec4((vC * a + core * 0.8) * 1.1, 1.0);
            gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(2.2));
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.group.add(this.points);
    // Dark clouds: soft clusters that flicker coral as you near them.
    const cloudMat = new THREE.MeshBasicMaterial({ color: '#1a0f2a', transparent: true, opacity: 0.75, depthWrite: false });
    for (const c of cometClouds()) {
      const fr = frame(c.u);
      const p = fr.p.clone().addScaledVector(fr.r, c.ox).addScaledVector(fr.up, c.oy);
      const mesh = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), cloudMat.clone());
        s.position.set(Math.sin(k * 2.1) * 1.1, Math.cos(k * 1.7) * 0.7, Math.sin(k * 1.3) * 1.1);
        s.scale.setScalar(1.1 + (k % 3) * 0.35);
        mesh.add(s);
      }
      mesh.position.copy(p);
      this.group.add(mesh);
      this.clouds.push({ pos: p, hit: false, mesh });
    }
    // The comet's tail while riding: six coloured ribbons.
    ['#8a6bd1', '#3fb68b', '#4aa3df', '#f4b740', '#e8574a', '#fffaf0'].forEach((c) => this.ribbonTail.push(new Ribbon(g.scene, { length: 40, width: 0.5, color: new THREE.Color(c).getHex(), life: 0.9, minStep: 0.2 })));
    g.scene.add(this.group);
    const fr = frame(0);
    this.pos.copy(fr.p);
    void g.hud
      .intro({
        key: 'galaxy-comet',
        title: 'Comet surf',
        tagline: 'Ride the comet round the galaxy. Catch the stardust.',
        tips: [
          { keys: ['move'], text: 'Steer left, right, up and down' },
          { keys: ['interact'], touch: 'Spin', text: 'Spin to pull in stardust around you' },
          { keys: ['move'], text: 'Dark clouds knock stardust loose' },
        ],
      })
      .then(() => this.countdown());
  }

  private countdown(): void {
    if (this.g.round !== this) return;
    this.state = 'countdown';
    gsfx.ride();
    this.g.hud.strip([
      { id: 'motes', label: 'Stardust', value: '0' },
      { id: 'ribbons', label: 'Ribbons', value: '0/24' },
      { id: 'spin', label: 'Spin', value: 'Ready' },
    ]);
    void this.g.hud.countdown(3, { go: 'Surf!' }).then(() => {
      if (this.g.round !== this) return;
      this.state = 'run';
      this.t = 0;
      this.g.playSong(COMET_SONG);
    });
  }

  holdsTime(): boolean {
    return this.state === 'countdown' || this.state === 'run' || this.state === 'landing';
  }

  private spin(): void {
    if (this.state !== 'run' || this.cooldown > 0) return;
    this.magnet = 0.6;
    this.cooldown = 4;
    gsfx.spin();
    this.g.ctx.swing();
    this.g.shock.emit({ x: this.pos.x, y: this.pos.y + 1, z: this.pos.z }, { color: 0xbfe8ff, radius: 4, life: 0.5, normal: { x: this.dirV.x, y: this.dirV.y, z: this.dirV.z } });
  }

  actions(p: PlayerState): SpaceAction[] {
    if (this.state !== 'run' || this.cooldown > 0) return [];
    return [{ x: p.x, z: p.z, range: 6, label: 'Spin', short: 'Spin', run: () => this.spin() }];
  }

  kick(): { label: string; run: () => void } | null {
    return this.state === 'run' && this.cooldown <= 0 ? { label: 'Spin', run: () => this.spin() } : null;
  }

  jump(): { label: string; run: () => void } | null {
    return this.state === 'run' ? { label: 'Spin', run: () => this.spin() } : null;
  }

  carry(h: number, p: PlayerState, move: MoveInput): Carry | null {
    void p;
    const speedU = 1 / this.seconds;
    if (this.state === 'run') {
      this.u = Math.min(1, this.u + speedU * h);
      // Steer within the tube: the stick moves you across and up or down.
      const k = Math.min(1, h * 6);
      this.vx += (move.x * 7 - this.vx) * k;
      this.vy += (move.y * 6 - this.vy) * k;
      this.ox += this.vx * h;
      this.oy += this.vy * h;
      const tube = cometCurve().tube(this.u);
      const l = Math.hypot(this.ox, this.oy);
      if (l > tube) {
        this.ox *= tube / l;
        this.oy *= tube / l;
      }
      if (this.u >= 1) {
        this.state = 'landing';
        this.landing = { from: this.pos.clone(), t: 0 };
      }
    } else if (this.state === 'landing' && this.landing) {
      this.landing.t += h;
      const e = Math.min(1, this.landing.t / 0.9);
      const to = new THREE.Vector3(this.g.dock.rideSpot.x - 0.6, DOCK.top, this.g.dock.rideSpot.z);
      const at = this.landing.from.clone().lerp(to, e);
      at.y += Math.sin(e * Math.PI) * 2.5;
      if (e >= 1) {
        void this.finish();
        return { x: to.x, y: to.y, z: to.z, yaw: -Math.PI / 2, pose: 'cheer', speed: 0 };
      }
      return { x: at.x, y: at.y, z: at.z, yaw: -Math.PI / 2, pose: 'float', speed: 4 };
    } else if (this.state === 'done') return null;
    const fr = frame(this.u);
    this.dirV.copy(fr.f);
    this.pos.copy(fr.p).addScaledVector(fr.r, this.ox).addScaledVector(fr.up, this.oy);
    const yaw = Math.atan2(fr.f.x, fr.f.z);
    return { x: this.pos.x, y: this.pos.y + 0.95, z: this.pos.z, yaw, pose: 'surf', speed: this.state === 'run' ? cometCurve().length * speedU : 0 };
  }

  shot(dt: number): CameraShot | null {
    if (this.state === 'done' || this.state === 'intro') return null;
    const f = this.dirV;
    const want = this.pos.clone().addScaledVector(f, -8).add(new THREE.Vector3(0, 3.2, 0));
    const look = this.pos.clone().addScaledVector(f, 9).add(new THREE.Vector3(0, 1, 0));
    if (!this.camInit) {
      this.camPos.copy(want);
      this.camTarget.copy(look);
      this.camInit = true;
    }
    const k = Math.min(1, dt * (this.g.ctx.reduceMotion() ? 3 : 5));
    this.camPos.lerp(want, k);
    this.camTarget.lerp(look, k);
    const narrow = cometCurve().tube(this.u) < 2;
    return { position: this.camPos, target: this.camTarget, fov: narrow ? 58 : 66, blend: this.state === 'countdown' ? Math.min(1, this.t + 0.6) : 1 };
  }

  step(dt: number, p: PlayerState): void {
    void p;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.magnet = Math.max(0, this.magnet - dt);
    if (this.state === 'countdown') this.t += dt;
    if (this.state !== 'run') return;
    this.t += dt;
    this.g.hud.set('spin', this.cooldown > 0 ? `${Math.ceil(this.cooldown)}` : 'Ready', { bump: false, tone: this.cooldown > 0 ? null : 'good' });
    this.g.hud.bar('ride', this.u, '#bfe8ff');
    const reach = this.magnet > 0 ? 3.2 : 1.35;
    const rider = this.pos.clone().addScaledVector(UP, 0.8);
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      if (m.taken || Math.abs(m.u - this.u) > 0.012) continue;
      if (m.pos.distanceTo(rider) < reach) this.take(i);
    }
    for (const c of this.clouds) {
      if (c.hit) continue;
      if (c.pos.distanceTo(rider) < 2.7) {
        c.hit = true;
        this.cloudsHit++;
        const lost = Math.min(5, this.score);
        this.score -= lost;
        gsfx.cloud();
        this.g.ctx.shake(0.25);
        this.g.hud.set('motes', String(this.score), { tone: 'bad' });
        this.g.hud.pop(`-${lost}`, { x: rider.x, y: rider.y + 1, z: rider.z }, { color: '#e8574a', size: 1.8 });
        this.g.sparks.burst({ at: rider, count: 30, speed: [3, 7], color: [0xf4b740, 0x8a6bd1], size: [0.15, 0.3], life: [0.4, 0.8] });
      }
    }
  }

  private take(i: number): void {
    const m = this.motes[i];
    m.taken = true;
    this.sizes[i] = 0;
    this.score++;
    const now = this.t;
    this.chain = now - this.lastTake < 0.5 ? this.chain + 1 : 0;
    this.lastTake = now;
    gsfx.dust(this.chain);
    this.g.glows.burst({ at: m.pos, count: 4, speed: [1, 3], color: [0xfff3c4, 0xbfe8ff], size: [0.15, 0.3], life: [0.2, 0.4] });
    this.g.hud.set('motes', String(this.score), { tone: 'good' });
    const left = (this.ribbonLeft.get(m.ribbon) ?? 1) - 1;
    this.ribbonLeft.set(m.ribbon, left);
    if (left === 0) {
      this.ribbonsDone++;
      gsfx.phrase(m.ribbon);
      this.g.hud.judge('Ribbon!', '#f4b740');
      this.g.hud.set('ribbons', `${this.ribbonsDone}/24`, { tone: 'good' });
      this.g.sparks.burst({ at: m.pos, count: 40, speed: [3, 8], color: [0xf4b740, 0xffffff], size: [0.15, 0.3], life: [0.4, 0.9] });
    }
  }

  private async finish(): Promise<void> {
    if (this.state === 'done') return;
    this.state = 'done';
    const g = this.g;
    g.hud.bar('ride', null);
    const score = Math.max(0, Math.min(COMET_MOTES, this.score));
    const stars = starsFor('comet', score);
    const prevBest = g.save.data.best.comet;
    const isBest = prevBest === null || score > prevBest;
    if (isBest) g.save.update((d) => (d.best.comet = score));
    gsfx.plink();
    g.ctx.squash(0.3);
    const r = await api.score(g.ctx.roomId, g.ctx.area.id, g.ctx.browserId, g.ctx.name(), 'comet', score);
    if (r.ok) await g.loadBoards();
    else g.paintBoards();
    if (g.round !== this) return;
    const badges: string[] = [];
    if (isBest && score > 0) badges.push('New best!');
    if (this.cloudsHit === 0) badges.push('Clear skies');
    if (g.save.data.bloomed && novaFor('comet', score)) badges.push('Nova!');
    if (!r.ok) badges.push('Not saved to the board');
    const next = THRESHOLDS.comet.stars[stars];
    const choice = await g.hud.results({
      title: stars === 3 ? 'Star surfer' : 'Comet surf',
      subtitle: `${score} of ${COMET_MOTES} stardust, ${this.ribbonsDone} full ribbons`,
      stars,
      badges,
      rows: [
        { label: 'Stardust', value: String(score), best: isBest },
        { label: 'Your best', value: String(Math.max(score, prevBest ?? 0)) },
        { label: 'Next star', value: next === undefined ? 'All three!' : `${next} stardust` },
      ],
      board: { title: 'Most stardust here', rows: g.boards.comet.slice(0, 5).map((x) => ({ name: x.name, value: String(x.value), you: x.you })) },
      buttons: [
        { id: 'again', label: 'Ride again', primary: true },
        { id: 'home', label: 'Fly home' },
        { id: 'stay', label: 'Stay here' },
      ],
    });
    const fresh = g.award('comet', stars);
    g.endRound();
    await g.feedStars(fresh, new THREE.Vector3(g.player.x, DOCK.top + 2, g.player.z), 'comet');
    g.paintBoards();
    if (choice === 'again') g.startRound(new Comet(g));
    else if (choice === 'home') g.fly('hub', 'comet');
  }

  update(dt: number, time: number): void {
    // The comet carries you: nucleus under your feet, tail streaming behind.
    const riding = this.state === 'countdown' || this.state === 'run';
    const comet = this.g.dock.comet;
    if (riding) {
      comet.position.copy(this.pos).addScaledVector(UP, -0.05);
      comet.quaternion.setFromUnitVectors(new THREE.Vector3(-1, 0, 0), this.dirV);
      const tail = this.pos.clone().addScaledVector(this.dirV, -1.2);
      this.ribbonTail.forEach((rb, i) => {
        const a = (i / 6) * Math.PI * 2 + time * 3;
        const side = new THREE.Vector3().crossVectors(this.dirV, UP).normalize();
        rb.push(tail.clone().addScaledVector(side, Math.cos(a) * 0.5).addScaledVector(UP, Math.sin(a) * 0.5));
      });
      if (this.magnet > 0) this.g.glows.stream({ at: { x: this.pos.x, y: this.pos.y + 1, z: this.pos.z }, count: 1, rate: 120, shape: 'ring', speed: [3, 5], color: [0xbfe8ff, 0xffffff], size: [0.2, 0.4], life: [0.2, 0.4] }, dt);
    }
    for (const rb of this.ribbonTail) rb.update(dt, this.g.ctx.camera);
    (this.points.geometry.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    // Clouds flicker coral as you close in.
    for (const c of this.clouds) {
      const d = c.pos.distanceTo(this.pos);
      const warn = !c.hit && d < 30 ? 1 - d / 30 : 0;
      c.mesh.rotation.y += dt * 0.4;
      c.mesh.children.forEach((s, k) => {
        const mat = (s as THREE.Mesh).material as THREE.MeshBasicMaterial;
        const flick = warn > 0 && Math.sin(time * 14 + k) > 0.3 ? warn : 0;
        mat.color.setRGB(0.1 + flick * 0.8, 0.06 + flick * 0.25, 0.16 + flick * 0.2);
        mat.opacity = c.hit ? Math.max(0, mat.opacity - dt) : 0.75;
      });
    }
  }

  guide(): { at: THREE.Vector3; label: string } | null {
    return null;
  }

  dispose(): void {
    this.g.hud.bar('ride', null);
    this.g.scene.remove(this.group);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    for (const c of this.clouds) c.mesh.traverse((m) => ((m as THREE.Mesh).geometry?.dispose(), ((m as THREE.Mesh).material as THREE.Material | undefined)?.dispose()));
    for (const rb of this.ribbonTail) rb.dispose();
    this.g.dock.comet.quaternion.identity();
  }

  debug() {
    // The next stardust ahead, for scripted steering.
    const next = this.motes.find((m) => !m.taken && m.u > this.u + 0.001);
    return { state: this.state, t: this.t, u: this.u, score: this.score, ox: this.ox, oy: this.oy, ribbons: this.ribbonsDone, cooldown: this.cooldown, next: next ? { u: next.u, ox: next.ox, oy: next.oy } : null };
  }
}
