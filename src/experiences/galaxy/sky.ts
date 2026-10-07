// The sky: a flowing nebula (baked once on the low tier), the drawing's
// diagonal comet streaks, drifting motes and the constellations that light up
// as you earn stars. After the bloom the nebula grows a spiral galaxy.

import * as THREE from 'three';
import { BH, CINDER, DOCK, RING, type Challenge } from '../../shared/galaxy-rules';
import type { Tier } from '../../world/space';
import * as S from './shaders';

export const STREAK_COLORS = ['#8a6bd1', '#3fb68b', '#4aa3df', '#f4b740', '#e8574a', '#fffaf0'];

const TIERS: Record<Tier, { motes: number; streaks: number; octaves: number }> = {
  low: { motes: 400, streaks: 40, octaves: 2 },
  medium: { motes: 2000, streaks: 120, octaves: 4 },
  high: { motes: 6000, streaks: 220, octaves: 6 },
};

type Uniforms = { uTime: { value: number }; uFlare: { value: number } };

/** Which constellation each star belongs to, and its colour. */
const CONSTELLATIONS: { id: Challenge | 'moons'; color: string; bearing: number; elev: number; pts: [number, number][] }[] = [
  // Over the hub, behind you as you arrive: the wake star and the frenzy's three.
  { id: 'frenzy', color: '#53f0c0', bearing: 200, elev: 48, pts: [[-6, -4], [0, 3], [7, 1], [11, 7]] },
  { id: 'ring', color: '#3fb68b', bearing: bearingTo(RING.cx, RING.cz) - 6, elev: 36, pts: [[-8, 0], [-1, 5], [7, 2]] },
  { id: 'storm', color: '#ff8a3d', bearing: bearingTo(CINDER.x, CINDER.z), elev: 30, pts: [[-6, 6], [0, 0], [7, 3]] },
  { id: 'comet', color: '#bfe8ff', bearing: bearingTo(DOCK.x, DOCK.z), elev: 34, pts: [[-7, -2], [0, 4], [7, 1]] },
  { id: 'moons', color: '#e8e4ff', bearing: 300, elev: 55, pts: [[-4, 0], [4, 3]] },
];

function bearingTo(x: number, z: number): number {
  return (Math.atan2(x, -z) * 180) / Math.PI;
}

function skyDir(bearing: number, elev: number): THREE.Vector3 {
  const b = (bearing * Math.PI) / 180;
  const e = (elev * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e));
}

export class Sky {
  readonly group = new THREE.Group();
  readonly nebula: THREE.ShaderMaterial;
  private sphere: THREE.Mesh;
  private streaks: THREE.InstancedMesh | null = null;
  private streakState: { pos: THREE.Vector3; speed: number; len: number }[] = [];
  private motes: THREE.Points | null = null;
  private flow = new THREE.Vector3(1, 0.72, 0.25).normalize();
  private pour = 0;
  private tier: Tier | null = null;
  private baked: THREE.WebGLCubeRenderTarget | null = null;
  private bakeKey = '';
  private stars: THREE.Points;
  private lines: THREE.LineSegments;
  private starGlow: Float32Array;
  private lineProg: Float32Array;
  /** Start index of each constellation's stars in the point buffers. */
  private index = new Map<string, { first: number; count: number; color: THREE.Color }>();
  private lit = new Map<string, number>();
  private shown = new Map<string, number>();
  private rnd: () => number;

  constructor(
    private scene: THREE.Scene,
    private uniforms: Uniforms,
  ) {
    const holeDir = new THREE.Vector3(BH.x, BH.y, BH.z).normalize();
    this.nebula = new THREE.ShaderMaterial({
      vertexShader: S.NEBULA_VERT,
      fragmentShader: S.NEBULA_FRAG,
      uniforms: { ...uniforms, uOctaves: { value: 4 }, uBloom: { value: 0 }, uHoleDir: { value: holeDir } },
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(260, 48, 24), this.nebula);
    this.sphere.renderOrder = -10;
    this.sphere.frustumCulled = false;
    this.group.add(this.sphere);
    let r = 13;
    this.rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);

    // Constellations: glowing points and lines that draw on.
    const pos: number[] = [];
    const col: number[] = [];
    const size: number[] = [];
    const linePos: number[] = [];
    const lineT: number[] = [];
    const lineCol: number[] = [];
    let first = 0;
    for (const c of CONSTELLATIONS) {
      const color = new THREE.Color(c.color);
      const centre = skyDir(c.bearing, c.elev);
      const right = new THREE.Vector3(0, 1, 0).cross(centre).normalize().negate();
      const up = centre.clone().cross(right).normalize().negate();
      const pts = c.pts.map(([px, py]) => centre.clone().multiplyScalar(220).addScaledVector(right, px * 3.4).addScaledVector(up, py * 3.4));
      pts.forEach((p, i) => {
        pos.push(p.x, p.y, p.z);
        col.push(color.r, color.g, color.b);
        size.push(i === 0 ? 9 : 7);
      });
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        linePos.push(a.x, a.y, a.z, b.x, b.y, b.z);
        lineT.push(0, 1);
        lineCol.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
      this.index.set(c.id, { first, count: pts.length, color });
      first += pts.length;
    }
    this.starGlow = new Float32Array(first).fill(0.15);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
    sg.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
    sg.setAttribute('aGlow', new THREE.BufferAttribute(this.starGlow, 1).setUsage(THREE.DynamicDrawUsage));
    this.stars = new THREE.Points(
      sg,
      new THREE.ShaderMaterial({
        uniforms: { ...uniforms },
        vertexShader: /* glsl */ `
          attribute vec3 aColor; attribute float aSize; attribute float aGlow;
          uniform float uTime;
          varying vec3 vC; varying float vG;
          void main() {
            vC = aColor; vG = aGlow;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * (0.6 + aGlow * 1.4) * (0.9 + 0.1 * sin(uTime * 2.0 + position.x));
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vC; varying float vG;
          void main() {
            vec2 p = gl_PointCoord * 2.0 - 1.0;
            float d = length(p);
            float core = smoothstep(0.35, 0.0, d);
            float cross = max(0.0, 1.0 - abs(p.x) * 7.0) * max(0.0, 1.0 - abs(p.y)) + max(0.0, 1.0 - abs(p.y) * 7.0) * max(0.0, 1.0 - abs(p.x));
            float a = (core + cross * 0.5 * vG + pow(max(0.0, 1.0 - d), 3.0) * 0.5) * (0.25 + vG);
            if (a < 0.003) discard;
            vec3 c = mix(vec3(0.5, 0.48, 0.6), mix(vC, vec3(1.0), core * 0.6), smoothstep(0.2, 0.6, vG));
            gl_FragColor = vec4(c * a, 1.0);
            gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(2.2));
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -8;
    this.group.add(this.stars);
    this.lineProg = new Float32Array(linePos.length / 3).fill(0);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    lg.setAttribute('aT', new THREE.Float32BufferAttribute(lineT, 1));
    lg.setAttribute('aColor', new THREE.Float32BufferAttribute(lineCol, 3));
    lg.setAttribute('aProg', new THREE.BufferAttribute(this.lineProg, 1).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(
      lg,
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute float aT; attribute vec3 aColor; attribute float aProg;
          varying float vT; varying vec3 vC; varying float vP;
          void main() { vT = aT; vC = aColor; vP = aProg; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          varying float vT; varying vec3 vC; varying float vP;
          void main() {
            if (vT > vP) discard;
            float head = smoothstep(vP - 0.15, vP, vT) * step(vP, 0.999);
            gl_FragColor = vec4(mix(vC * 0.8, vec3(1.0), head), 1.0);
            gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(2.2));
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = -9;
    this.group.add(this.lines);
    scene.add(this.group);
  }

  setQuality(tier: Tier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    const q = TIERS[tier];
    this.nebula.uniforms.uOctaves.value = q.octaves;
    this.bakeKey = '';
    // Motes around the hub and between the islands.
    if (this.motes) {
      this.group.remove(this.motes);
      this.motes.geometry.dispose();
      (this.motes.material as THREE.Material).dispose();
    }
    const n = q.motes;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const rad = 6 + this.rnd() * 75;
      const a = this.rnd() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * rad + 8;
      pos[i * 3 + 1] = -14 + this.rnd() * 46;
      pos[i * 3 + 2] = Math.sin(a) * rad - 14;
      seed[i] = this.rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.motes = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: S.MOTE_VERT, fragmentShader: S.MOTE_FRAG, uniforms: { ...this.uniforms, uScale: { value: 140 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.motes.frustumCulled = false;
    this.group.add(this.motes);

    if (this.streaks) {
      this.group.remove(this.streaks);
      this.streaks.geometry.dispose();
      (this.streaks.material as THREE.Material).dispose();
    }
    const count = q.streaks;
    this.streaks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader: S.STREAK_VERT, fragmentShader: S.STREAK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), count);
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = -5;
    this.streakState = [];
    const colors = STREAK_COLORS.map((c) => new THREE.Color(c));
    for (let i = 0; i < count; i++) {
      this.streakState.push({ pos: this.streakSpawn(true), speed: 40 + this.rnd() * 90, len: 14 + (i % 5) * 6 });
      this.streaks.setColorAt(i, colors[i % colors.length]);
    }
    this.group.add(this.streaks);
  }

  private streakSpawn(anywhere: boolean): THREE.Vector3 {
    // A slab of sky behind and around the black hole, entering from the lower left.
    const along = anywhere ? this.rnd() : 0;
    const p = new THREE.Vector3(-160 + this.rnd() * 220, -60 + this.rnd() * 120, -230 + this.rnd() * 170);
    return p.addScaledVector(this.flow, along * 260);
  }

  /** 0: streaks fly along the drawing's diagonal; 1: they pour into the black hole (the stair is open). */
  setPour(v: number): void {
    this.pour = v;
  }

  setBloom(v: number): void {
    if (this.nebula.uniforms.uBloom.value !== v) this.bakeKey = '';
    this.nebula.uniforms.uBloom.value = v;
  }

  /** How many stars of a constellation are lit. Animates the new lines on. */
  setLit(id: Challenge | 'moons', n: number, instant = false): void {
    this.lit.set(id, n);
    if (instant) this.shown.set(id, n);
  }

  private litCount(id: string): number {
    if (id === 'frenzy') return (this.shown.get('wake') ?? 0) + (this.shown.get('frenzy') ?? 0);
    return this.shown.get(id) ?? 0;
  }

  update(dt: number, camera: THREE.Camera): void {
    this.group.position.set(0, 0, 0);
    this.sphere.position.copy(camera.position);
    // Grow shown counts toward lit ones, one star at a time.
    for (const [id, n] of this.lit) {
      const s = this.shown.get(id) ?? 0;
      if (s < n) this.shown.set(id, Math.min(n, s + dt * 0.9));
      else if (s > n) this.shown.set(id, n);
    }
    let segIdx = 0;
    for (const c of CONSTELLATIONS) {
      const info = this.index.get(c.id)!;
      const lit = this.litCount(c.id);
      for (let i = 0; i < info.count; i++) {
        const want = Math.max(0, Math.min(1, lit - i));
        this.starGlow[info.first + i] += (0.15 + want * 0.85 - this.starGlow[info.first + i]) * Math.min(1, dt * 3);
      }
      for (let i = 1; i < info.count; i++) {
        const p = Math.max(0, Math.min(1, lit - i));
        this.lineProg[segIdx * 2] = this.lineProg[segIdx * 2 + 1] = p;
        segIdx++;
      }
    }
    (this.stars.geometry.getAttribute('aGlow') as THREE.BufferAttribute).needsUpdate = true;
    (this.lines.geometry.getAttribute('aProg') as THREE.BufferAttribute).needsUpdate = true;

    if (this.streaks) {
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const xAxis = new THREE.Vector3(1, 0, 0);
      const dir = new THREE.Vector3();
      const hole = new THREE.Vector3(BH.x, BH.y, BH.z);
      this.streakState.forEach((st, i) => {
        dir.copy(this.flow);
        if (this.pour > 0) dir.lerp(hole.clone().sub(st.pos).normalize(), this.pour).normalize();
        st.pos.addScaledVector(dir, st.speed * dt);
        const out = st.pos.x > 150 || st.pos.y > 130 || (this.pour > 0.5 && st.pos.distanceTo(hole) < 14);
        if (out) {
          if (this.pour > 0.5) {
            // Pour in from a shell around the black hole.
            const a = this.rnd() * Math.PI * 2;
            const e = (this.rnd() - 0.3) * 1.2;
            st.pos.set(hole.x + Math.cos(a) * Math.cos(e) * 150, hole.y + Math.sin(e) * 90, hole.z + Math.sin(a) * Math.cos(e) * 150 - 30);
          } else st.pos.copy(this.streakSpawn(false)).addScaledVector(this.flow, -40);
        }
        q.setFromUnitVectors(xAxis, dir);
        scale.set(st.len, 0.25 + (i % 3) * 0.12, 1);
        m4.compose(st.pos, q, scale);
        this.streaks!.setMatrixAt(i, m4);
      });
      this.streaks.instanceMatrix.needsUpdate = true;
    }
  }

  /** Low tier: paint the nebula into a cube once (and again after the bloom), so the sky costs nothing per pixel. */
  prepare(renderer: THREE.WebGLRenderer): void {
    const low = this.tier === 'low';
    this.sphere.visible = !low;
    if (!low) {
      if (this.scene.background !== null && this.baked && this.scene.background === this.baked.texture) this.scene.background = new THREE.Color('#05030c');
      return;
    }
    const key = `bloom${this.nebula.uniforms.uBloom.value.toFixed(2)}`;
    if (this.baked && key === this.bakeKey) return;
    this.bakeKey = key;
    if (!this.baked) this.baked = new THREE.WebGLCubeRenderTarget(512);
    const bakeScene = new THREE.Scene();
    const sphere = new THREE.Mesh(this.sphere.geometry, this.nebula);
    bakeScene.add(sphere);
    const cam = new THREE.CubeCamera(1, 600, this.baked);
    cam.update(renderer, bakeScene);
    this.scene.background = this.baked.texture;
  }

  dispose(): void {
    this.baked?.dispose();
    this.streaks?.geometry.dispose();
    this.motes?.geometry.dispose();
  }
}
