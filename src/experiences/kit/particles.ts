// Particles for the worlds: one draw call per system, simulated on the CPU,
// drawn as soft point sprites. Budgets scale with the graphics tier.
//
//   const sparks = new Particles(scene, { max: 1500, look: 'spark' });
//   sparks.burst({ at: pos, count: 40, speed: [3, 8], color: [0xffd24a, 0xff7a3d], life: [0.4, 0.9], gravity: 9 });
//   sparks.update(dt);            // every frame (or from step)
//   sparks.setQuality(tier);      // from setQuality
//
// Looks: 'glow' (soft additive), 'spark' (bright core, additive), 'smoke'
// (soft, normal blending), 'confetti' (spinning flat flakes, normal blending).

import * as THREE from 'three';
import type { Tier } from '../../world/space';

export type Look = 'glow' | 'spark' | 'smoke' | 'confetti';

type V3 = { x: number; y: number; z: number };
type Range = number | [number, number];

export interface BurstOpts {
  at: V3;
  count: number;
  /** Speed in m/s. */
  speed?: Range;
  /** sphere: all ways; up: a fountain; ring: flat outwards; cone: around `dir`; disc: spawn on a flat disc of `radius`. */
  shape?: 'sphere' | 'up' | 'ring' | 'cone' | 'disc';
  dir?: V3;
  /** Cone half angle in radians. */
  spread?: number;
  /** Spawn within this radius of `at`. */
  radius?: number;
  /** One colour, or a random pick between two. */
  color?: number | [number, number];
  /** Colour at the end of life (fades toward it). */
  colorEnd?: number;
  /** Size in metres. */
  size?: Range;
  /** Size at end of life as a share of the start (0 shrinks away, 2 doubles). */
  sizeEnd?: number;
  life?: Range;
  /** Downward acceleration, m/s². Negative floats up. */
  gravity?: number;
  /** Velocity lost per second, 0 to about 5. */
  drag?: number;
  /** Start opacity. */
  alpha?: number;
  /** Velocity added to every particle, e.g. the emitter's own. */
  inherit?: V3;
}

const BUDGET: Record<Tier, number> = { low: 0.35, medium: 0.7, high: 1 };

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aSpin;
attribute vec3 aColor;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
varying float vSpin;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vSpin = aSpin;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uScale / max(0.05, -mv.z), 0.0, 256.0);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG: Record<Look, string> = {
  glow: /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 1.6);
  if (a <= 0.003) discard;
  gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
}`,
  spark: /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = smoothstep(0.45, 0.0, d);
  float halo = pow(max(0.0, 1.0 - d), 3.0) * 0.6;
  float a = core + halo;
  if (a <= 0.003) discard;
  gl_FragColor = vec4((vColor + core * 0.6) * a * vAlpha, 1.0);
}`,
  smoke: /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.35, d) * vAlpha;
  if (a <= 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}`,
  confetti: /* glsl */ `
varying vec3 vColor; varying float vAlpha; varying float vSpin;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vSpin), s = sin(vSpin);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  // A flake that flips: its width breathes as it tumbles.
  float w = 0.12 + 0.36 * abs(sin(vSpin * 1.7));
  if (abs(p.x) > w || abs(p.y) > 0.32) discard;
  gl_FragColor = vec4(vColor * (0.75 + 0.25 * sin(vSpin * 3.1)), vAlpha);
}`,
};

function pick(r: Range | undefined, fallback: number): number {
  if (r === undefined) return fallback;
  return typeof r === 'number' ? r : r[0] + Math.random() * (r[1] - r[0]);
}

const tmpColor = new THREE.Color();
const tmpEnd = new THREE.Color();

export class Particles {
  readonly points: THREE.Points;
  private readonly max: number;
  private live = 0;
  private quality = 1;
  // Per particle state.
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private col0: Float32Array;
  private col1: Float32Array;
  private size: Float32Array;
  private size0: Float32Array;
  private sizeEnd: Float32Array;
  private alpha: Float32Array;
  private alpha0: Float32Array;
  private spin: Float32Array;
  private spinV: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;

  constructor(
    parent: THREE.Object3D,
    opts: { max?: number; look?: Look; renderOrder?: number } = {},
  ) {
    this.max = opts.max ?? 1000;
    const n = this.max;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.col0 = new Float32Array(n * 3);
    this.col1 = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.sizeEnd = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.alpha0 = new Float32Array(n);
    this.spin = new Float32Array(n);
    this.spinV = new Float32Array(n);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSpin', new THREE.BufferAttribute(this.spin, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    const look = opts.look ?? 'glow';
    const additive = look === 'glow' || look === 'spark';
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: VERT,
      fragmentShader: FRAG[look],
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = opts.renderOrder ?? 10;
    const size = new THREE.Vector2();
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      renderer.getDrawingBufferSize(size);
      const fov = (camera as THREE.PerspectiveCamera).fov ?? 55;
      this.mat.uniforms.uScale.value = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    };
    parent.add(this.points);
  }

  setQuality(tier: Tier): void {
    this.quality = BUDGET[tier];
  }

  /** How many particles are alive. */
  get count(): number {
    return this.live;
  }

  burst(o: BurstOpts): void {
    const n = Math.max(1, Math.round(o.count * this.quality));
    for (let k = 0; k < n; k++) this.spawn(o);
  }

  /** Spawns by rate: call every frame with dt for a steady stream. */
  stream(o: BurstOpts & { rate: number }, dt: number): void {
    const want = o.rate * dt * this.quality;
    let n = Math.floor(want);
    if (Math.random() < want - n) n++;
    for (let k = 0; k < n; k++) this.spawn(o);
  }

  private spawn(o: BurstOpts): void {
    if (this.live >= this.max) return;
    const i = this.live++;
    const i3 = i * 3;
    // Direction.
    let dx = 0;
    let dy = 1;
    let dz = 0;
    const shape = o.shape ?? 'sphere';
    if (shape === 'sphere' || shape === 'up' || shape === 'disc') {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      dx = r * Math.cos(a);
      dy = shape === 'up' ? Math.abs(u) * 0.8 + 0.2 : shape === 'disc' ? Math.abs(u) * 0.4 : u;
      dz = r * Math.sin(a);
    } else if (shape === 'ring') {
      const a = Math.random() * Math.PI * 2;
      dx = Math.cos(a);
      dy = (Math.random() - 0.5) * 0.15;
      dz = Math.sin(a);
    } else if (shape === 'cone') {
      const d = o.dir ?? { x: 0, y: 1, z: 0 };
      const len = Math.hypot(d.x, d.y, d.z) || 1;
      const spread = o.spread ?? 0.4;
      // Random direction within the cone around d.
      const axis = new THREE.Vector3(d.x / len, d.y / len, d.z / len);
      const ortho = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const b1 = new THREE.Vector3().crossVectors(axis, ortho).normalize();
      const b2 = new THREE.Vector3().crossVectors(axis, b1);
      const ang = Math.random() * spread;
      const rot = Math.random() * Math.PI * 2;
      const v = axis.multiplyScalar(Math.cos(ang)).addScaledVector(b1, Math.sin(ang) * Math.cos(rot)).addScaledVector(b2, Math.sin(ang) * Math.sin(rot));
      dx = v.x;
      dy = v.y;
      dz = v.z;
    }
    const sp = pick(o.speed, 3);
    const rad = o.radius ?? 0;
    let ox = 0;
    let oy = 0;
    let oz = 0;
    if (rad > 0) {
      const a = Math.random() * Math.PI * 2;
      const r = rad * Math.sqrt(Math.random());
      ox = Math.cos(a) * r;
      oz = Math.sin(a) * r;
      oy = shape === 'disc' ? 0 : (Math.random() - 0.5) * rad;
    }
    this.pos[i3] = o.at.x + ox;
    this.pos[i3 + 1] = o.at.y + oy;
    this.pos[i3 + 2] = o.at.z + oz;
    this.vel[i3] = dx * sp + (o.inherit?.x ?? 0);
    this.vel[i3 + 1] = dy * sp + (o.inherit?.y ?? 0);
    this.vel[i3 + 2] = dz * sp + (o.inherit?.z ?? 0);
    const c = o.color ?? 0xffffff;
    if (typeof c === 'number') tmpColor.setHex(c);
    else tmpColor.setHex(c[0]).lerp(tmpEnd.setHex(c[1]), Math.random());
    if (o.colorEnd !== undefined) tmpEnd.setHex(o.colorEnd);
    else tmpEnd.copy(tmpColor);
    this.col0[i3] = this.col[i3] = tmpColor.r;
    this.col0[i3 + 1] = this.col[i3 + 1] = tmpColor.g;
    this.col0[i3 + 2] = this.col[i3 + 2] = tmpColor.b;
    this.col1[i3] = tmpEnd.r;
    this.col1[i3 + 1] = tmpEnd.g;
    this.col1[i3 + 2] = tmpEnd.b;
    this.size0[i] = this.size[i] = pick(o.size, 0.15);
    this.sizeEnd[i] = o.sizeEnd ?? 0;
    this.alpha0[i] = this.alpha[i] = o.alpha ?? 1;
    this.spin[i] = Math.random() * Math.PI * 2;
    this.spinV[i] = (Math.random() - 0.5) * 12;
    this.age[i] = 0;
    this.life[i] = Math.max(0.05, pick(o.life, 0.8));
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.live) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.kill(i);
        continue;
      }
      const i3 = i * 3;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= k;
      this.vel[i3 + 1] = this.vel[i3 + 1] * k - this.grav[i] * dt;
      this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = this.age[i] / this.life[i];
      this.size[i] = this.size0[i] * (1 + (this.sizeEnd[i] - 1) * t);
      // Quick fade in, long fade out.
      this.alpha[i] = this.alpha0[i] * Math.min(1, t * 12) * (1 - t * t);
      this.col[i3] = this.col0[i3] + (this.col1[i3] - this.col0[i3]) * t;
      this.col[i3 + 1] = this.col0[i3 + 1] + (this.col1[i3 + 1] - this.col0[i3 + 1]) * t;
      this.col[i3 + 2] = this.col0[i3 + 2] + (this.col1[i3 + 2] - this.col0[i3 + 2]) * t;
      this.spin[i] += this.spinV[i] * dt;
      i++;
    }
    this.geo.setDrawRange(0, this.live);
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha', 'aSpin']) {
      const a = this.geo.getAttribute(name) as THREE.BufferAttribute;
      a.clearUpdateRanges();
      if (this.live) a.addUpdateRange(0, this.live * a.itemSize);
      a.needsUpdate = true;
    }
  }

  private kill(i: number): void {
    const last = --this.live;
    if (i === last) return;
    const i3 = i * 3;
    const l3 = last * 3;
    for (const arr of [this.pos, this.vel, this.col, this.col0, this.col1]) {
      arr[i3] = arr[l3];
      arr[i3 + 1] = arr[l3 + 1];
      arr[i3 + 2] = arr[l3 + 2];
    }
    for (const arr of [this.size, this.size0, this.sizeEnd, this.alpha, this.alpha0, this.spin, this.spinV, this.age, this.life, this.grav, this.drag]) arr[i] = arr[last];
  }

  clear(): void {
    this.live = 0;
    this.geo.setDrawRange(0, 0);
  }

  dispose(): void {
    this.points.parent?.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
  }
}

/**
 * A glowing ribbon that follows a moving point: blade swings, comets, drift
 * lines. Faces the camera; fades toward its tail.
 */
export class Ribbon {
  readonly mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private ages: number[] = [];
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;
  private positions: Float32Array;
  private alphas: Float32Array;

  constructor(
    parent: THREE.Object3D,
    private opts: { length?: number; width?: number; color?: number; life?: number; minStep?: number } = {},
  ) {
    const n = opts.length ?? 32;
    this.positions = new Float32Array(n * 2 * 3);
    this.alphas = new Float32Array(n * 2);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(opts.color ?? 0x66ddff) } },
      vertexShader: /* glsl */ `attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor * vA, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    parent.add(this.mesh);
  }

  set color(c: number) {
    (this.mat.uniforms.uColor.value as THREE.Color).setHex(c);
  }

  /** Adds the current head position. Call every frame while it moves. */
  push(p: V3): void {
    const head = this.pts[0];
    const min = this.opts.minStep ?? 0.05;
    if (head && Math.hypot(head.x - p.x, head.y - p.y, head.z - p.z) < min) {
      head.set(p.x, p.y, p.z);
      this.ages[0] = 0;
      return;
    }
    this.pts.unshift(new THREE.Vector3(p.x, p.y, p.z));
    this.ages.unshift(0);
    const n = this.opts.length ?? 32;
    if (this.pts.length > n) {
      this.pts.length = n;
      this.ages.length = n;
    }
  }

  /** Ages the trail and rebuilds it to face the camera. */
  update(dt: number, camera: THREE.Camera): void {
    const life = this.opts.life ?? 0.35;
    for (let i = 0; i < this.ages.length; i++) this.ages[i] += dt;
    while (this.ages.length && this.ages[this.ages.length - 1] > life) {
      this.ages.pop();
      this.pts.pop();
    }
    const n = this.pts.length;
    if (n < 2) {
      this.geo.setDrawRange(0, 0);
      return;
    }
    const w = (this.opts.width ?? 0.25) / 2;
    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const dir = new THREE.Vector3();
    const view = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const p = this.pts[i];
      const q = this.pts[Math.min(n - 1, i + 1)];
      const r = this.pts[Math.max(0, i - 1)];
      dir.subVectors(r, q);
      if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
      view.subVectors(camPos, p);
      side.crossVectors(dir, view).normalize();
      const t = i / (n - 1);
      const fade = (1 - t) * Math.max(0, 1 - this.ages[i] / life);
      const ww = w * (1 - t * 0.7);
      this.positions.set([p.x + side.x * ww, p.y + side.y * ww, p.z + side.z * ww, p.x - side.x * ww, p.y - side.y * ww, p.z - side.z * ww], i * 6);
      this.alphas[i * 2] = this.alphas[i * 2 + 1] = fade;
    }
    this.geo.setDrawRange(0, (n - 1) * 6);
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.pts = [];
    this.ages = [];
    this.geo.setDrawRange(0, 0);
  }

  dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

/** Expanding rings on the ground or in the air: landings, hits, beats. Pooled. */
export class Shockwaves {
  private pool: { mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; age: number; life: number; radius: number; alpha: number }[] = [];
  private geo = new THREE.RingGeometry(0.82, 1, 48, 1);

  constructor(private parent: THREE.Object3D) {}

  /** `up` lays the ring flat (default); give a normal to stand it up. Keep it a few cm above any floor. */
  emit(at: V3, opts: { color?: number; radius?: number; life?: number; alpha?: number; normal?: V3 } = {}): void {
    let w = this.pool.find((p) => p.age >= p.life);
    if (!w) {
      const mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      mesh.renderOrder = 9;
      this.parent.add(mesh);
      w = { mesh, age: 0, life: 1, radius: 1, alpha: 1 };
      this.pool.push(w);
    }
    w.age = 0;
    w.life = opts.life ?? 0.5;
    w.radius = opts.radius ?? 3;
    w.alpha = opts.alpha ?? 0.9;
    w.mesh.material.color.setHex(opts.color ?? 0xffffff);
    w.mesh.position.set(at.x, at.y, at.z);
    const n = opts.normal ?? { x: 0, y: 1, z: 0 };
    w.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n.x, n.y, n.z).normalize());
    w.mesh.visible = true;
  }

  update(dt: number): void {
    for (const w of this.pool) {
      if (w.age >= w.life) {
        w.mesh.visible = false;
        continue;
      }
      w.age += dt;
      const t = Math.min(1, w.age / w.life);
      const e = 1 - Math.pow(1 - t, 3);
      w.mesh.scale.setScalar(0.05 + e * w.radius);
      w.mesh.material.opacity = w.alpha * (1 - t);
    }
  }

  dispose(): void {
    for (const w of this.pool) {
      this.parent.remove(w.mesh);
      w.mesh.material.dispose();
    }
    this.geo.dispose();
    this.pool = [];
  }
}
