// Draws toots: cartoon puffs with two light bands, a bright rim, a slow boil
// and a dithered fade (no sorting needed), all in one instanced draw call.
// Lingering clouds from the sim are drawn as clusters; quick bursts from
// your hips are short-lived puffs with their own motion.

import * as THREE from 'three';
import type { Tier } from '../../world/space';
import type { Cloud, CloudGas } from './sim/clouds';
import { GAS } from './sim/gas';

export type CloudStyle = 'classic' | 'rainbow' | 'bubbles' | 'glitter' | 'hearts' | 'golden';

const BUDGET: Record<Tier, number> = { low: 160, medium: 400, high: 800 };

interface Burst {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  s0: number;
  s1: number;
  age: number;
  life: number;
  color: THREE.Color;
}

const VERT = /* glsl */ `
attribute float aAlpha;
uniform float uTime;
varying vec3 vN;
varying vec3 vCol;
varying float vA;
varying vec3 vView;
varying vec3 vWorld;
void main() {
  vec3 p = position;
  float seed = instanceMatrix[3][0] * 1.7 + instanceMatrix[3][2] * 2.3;
  p += normal * sin(position.x * 5.0 + uTime * 2.6 + seed) * sin(position.y * 4.0 + uTime * 2.1) * 0.07;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vCol = instanceColor;
  vA = aAlpha;
  vec4 mv = viewMatrix * wp;
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform vec3 uLight;
uniform vec3 uShade;
uniform float uGlow;
varying vec3 vN;
varying vec3 vCol;
varying float vA;
varying vec3 vView;
varying vec3 vWorld;
float bayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
  return fract(sin(i * 12.9898 + q.y * 3.1) * 43758.5453);
}
void main() {
  // Fade puffs right in front of the camera so they never fill the view.
  float near = smoothstep(1.4, 3.4, length(vView));
  if (vA * near < bayer(gl_FragCoord.xy) * 0.98 + 0.01) discard;
  vec3 n = normalize(vN);
  float d = dot(n, normalize(uLight));
  float band = d > 0.35 ? 1.0 : d > -0.15 ? 0.78 : 0.58;
  vec3 col = vCol * band + uShade * (1.0 - band) * 0.35;
  float rim = pow(1.0 - abs(dot(normalize(vView), n)), 2.5);
  col += vec3(1.0, 0.98, 0.9) * rim * 0.35;
  col += vCol * uGlow;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const RAINBOW = [0xff6f6f, 0xffb35c, 0xffe45c, 0x7fe07f, 0x6fc4ff, 0xb48cff];

export class CloudFx {
  readonly mesh: THREE.InstancedMesh;
  private alpha: THREE.InstancedBufferAttribute;
  private mat: THREE.ShaderMaterial;
  private bursts: Burst[] = [];
  private cap = 400;
  private max: number;
  style: CloudStyle = 'classic';
  private tmp = new THREE.Matrix4();
  private col = new THREE.Color();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(parent: THREE.Object3D, max = 800) {
    this.max = max;
    const geo = new THREE.IcosahedronGeometry(1, 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alpha);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLight: { value: new THREE.Vector3(0.4, 0.8, 0.45) }, uShade: { value: new THREE.Color(0x6e5a9e) }, uGlow: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    parent.add(this.mesh);
  }

  setQuality(t: Tier): void {
    this.cap = Math.min(this.max, BUDGET[t]);
  }

  /** 0 by day, about 0.6 at night so toots glow. */
  set glow(v: number) {
    this.mat.uniforms.uGlow.value = v;
  }

  setLight(dir: THREE.Vector3): void {
    (this.mat.uniforms.uLight.value as THREE.Vector3).copy(dir).normalize();
  }

  /** The colour of a puff for this gas and style. */
  colorFor(gas: CloudGas, i: number): number {
    if (gas === 'golden' || this.style === 'golden') return [0xffd24a, 0xfff3b0, 0xffc43a][i % 3];
    if (this.style === 'rainbow') return RAINBOW[i % RAINBOW.length];
    if (this.style === 'glitter') return [0xffffff, 0xfff3b0, 0xd9f4ff, GAS[gas === 'squeeze' ? 'beans' : gas].colors[0]][i % 4];
    if (this.style === 'hearts') return [0xff8fb1, 0xffc4d6, 0xff6f9a][i % 3];
    if (this.style === 'bubbles') return [0x9fe3ff, 0xd9f6ff, GAS[gas === 'squeeze' ? 'beans' : gas].colors[0]][i % 3];
    if (gas === 'squeeze') return [0xc8e6a0, 0xe4f5c8, 0xa9d17a][i % 3];
    return GAS[gas].colors[i % 3];
  }

  /** Quick puffs from a point (hips), pushed along `dir`. */
  burst(gas: CloudGas, at: { x: number; y: number; z: number }, n: number, opts: { dir?: { x: number; y: number; z: number }; speed?: number; size?: number; spread?: number; life?: number } = {}): void {
    const dir = opts.dir ?? { x: 0, y: -0.3, z: 0 };
    const sp = opts.speed ?? 2.5;
    const spread = opts.spread ?? 1;
    for (let i = 0; i < n; i++) {
      if (this.bursts.length > this.cap * 0.6) this.bursts.shift();
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      const s = (opts.size ?? 0.22) * (0.7 + Math.random() * 0.6);
      this.bursts.push({
        x: at.x + (Math.random() - 0.5) * 0.15,
        y: at.y + (Math.random() - 0.5) * 0.15,
        z: at.z + (Math.random() - 0.5) * 0.15,
        vx: dir.x * sp + r * Math.cos(a) * sp * 0.6 * spread,
        vy: dir.y * sp + u * sp * 0.4 * spread,
        vz: dir.z * sp + r * Math.sin(a) * sp * 0.6 * spread,
        s0: s,
        s1: s * (2 + Math.random()),
        age: 0,
        life: (opts.life ?? 0.9) * (0.7 + Math.random() * 0.6),
        color: new THREE.Color(this.colorFor(gas, i)),
      });
    }
  }

  /** A ring of puffs flat on the ground or under you (double-jump ring, shockwave). */
  ring(gas: CloudGas, at: { x: number; y: number; z: number }, n: number, speed: number, size = 0.3): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (this.bursts.length > this.cap * 0.6) this.bursts.shift();
      this.bursts.push({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * speed, vy: 0.3, vz: Math.sin(a) * speed, s0: size, s1: size * 2.2, age: 0, life: 0.7 + Math.random() * 0.2, color: new THREE.Color(this.colorFor(gas, i)) });
    }
  }

  get burstCount(): number {
    return this.bursts.length;
  }

  update(dt: number, clouds: readonly Cloud[], time: number): void {
    this.mat.uniforms.uTime.value = time;
    let k = 0;
    const cap = this.cap;
    // Lingering clouds: clusters of puffs.
    for (const c of clouds) {
      const t = c.age / c.life;
      // Puffs shrink away at the end (a clean cartoon fade), with a last wisp of dissolve.
      const shrink = t < 0.72 ? 1 : Math.max(0, 1 - (t - 0.72) / 0.28);
      const fade = t < 0.92 ? 1 : 1 - (t - 0.92) / 0.08;
      const n = c.gas === 'cabbage' || c.r1 > 2 ? 9 : c.r1 > 1.2 ? 7 : 5;
      for (let i = 0; i < n && k < cap; i++) {
        const a = (i / n) * Math.PI * 2 + c.seed;
        const ring = i === 0 ? 0 : 0.55;
        const ox = Math.cos(a) * c.r * ring;
        const oz = Math.sin(a) * c.r * ring;
        const oy = i === 0 ? c.r * 0.25 : Math.sin(a * 3 + c.seed) * c.r * 0.18;
        const sc = c.r * (i === 0 ? 0.75 : 0.5 + ((c.seed * (i + 3)) % 7) * 0.03) * (0.9 + Math.sin(time * 1.3 + i + c.seed) * 0.06) * (0.15 + 0.85 * shrink * (1 - (1 - shrink) * (i % 3) * 0.2));
        this.v.set(c.x + ox, c.y + oy, c.z + oz);
        this.s.set(sc, sc * 0.85, sc);
        this.tmp.compose(this.v, this.q.identity(), this.s);
        this.mesh.setMatrixAt(k, this.tmp);
        this.col.setHex(this.colorFor(c.gas, i + Math.floor(c.seed)));
        this.mesh.setColorAt(k, this.col);
        this.alpha.array[k] = fade;
        k++;
      }
    }
    // Bursts.
    this.bursts = this.bursts.filter((b) => {
      b.age += dt;
      if (b.age >= b.life) return false;
      const drag = Math.exp(-3.2 * dt);
      b.vx *= drag;
      b.vy = b.vy * drag + 0.6 * dt;
      b.vz *= drag;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (k < cap) {
        const t = b.age / b.life;
        const end = t < 0.62 ? 1 : Math.max(0.05, 1 - (t - 0.62) / 0.38);
        const sc = (b.s0 + (b.s1 - b.s0) * (1 - (1 - t) * (1 - t))) * end;
        this.v.set(b.x, b.y, b.z);
        this.s.setScalar(sc);
        this.tmp.compose(this.v, this.q.identity(), this.s);
        this.mesh.setMatrixAt(k, this.tmp);
        this.mesh.setColorAt(k, b.color);
        this.alpha.array[k] = t < 0.9 ? 1 : 1 - (t - 0.9) / 0.1;
        k++;
      }
      return true;
    });
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }

  clear(): void {
    this.bursts = [];
    this.mesh.count = 0;
  }

  dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}
