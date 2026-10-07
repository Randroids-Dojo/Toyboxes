// The sky over Club Nova: a deep violet void with nebula clouds and the
// owner's drawing at planet scale, a giant starburst behind the station.
// Stars twinkle on the beat; a ringed planet and light-streak ships drift by
// on the higher tiers.

import * as THREE from 'three';
import type { Tier } from '../../world/space';
import { C, OUTPUT_CHUNK, rng } from './util';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */ `
uniform float uTime, uBeat, uOct, uDay, uGlow;
uniform vec3 uVoid, uViolet, uUv, uPink;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (float(i) >= uOct) break;
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float up = d.y;
  vec3 col = mix(uVoid * 1.4, uVoid * 0.6, smoothstep(-0.1, 0.7, up));
  // Nebula clouds in long bands.
  vec2 q = vec2(atan(d.z, d.x) * 1.6, up * 3.0);
  float n = fbm(q * 1.4 + vec2(uTime * 0.004, 0.0));
  float n2 = fbm(q * 2.7 - vec2(0.0, uTime * 0.003) + n);
  col += uUv * 0.55 * smoothstep(0.45, 0.95, n2) * (0.6 + 0.4 * n);
  col += uPink * 0.22 * smoothstep(0.62, 1.0, n * n2 * 1.6);
  // The starburst: the room's drawing, centred far behind the arena (north).
  vec3 c = normalize(vec3(0.0, 0.22, -1.0));
  float cd = max(0.0, dot(d, c));
  vec3 side = normalize(cross(c, vec3(0.0, 1.0, 0.0)));
  vec3 upv = cross(side, c);
  vec2 sp = vec2(dot(d, side), dot(d, upv));
  float ang = atan(sp.y, sp.x);
  float rad = length(sp);
  float rays = pow(abs(sin(ang * 13.0 + sin(ang * 5.0) * 1.3)), 6.0) * 0.8 + pow(abs(sin(ang * 31.0 + 1.7)), 14.0) * 0.6;
  float pulse = 0.85 + 0.15 * exp(-fract(uBeat) * 5.0);
  float burst = (smoothstep(0.75, 0.0, rad) * rays * 0.9 + smoothstep(0.22, 0.0, rad) * 1.2) * step(0.0, cd) * pulse;
  col += uViolet * burst * (1.1 + uGlow);
  col += vec3(1.0, 0.95, 1.0) * smoothstep(0.07, 0.0, rad) * step(0.0, cd) * 1.4;
  // Below the deck: dark.
  col *= smoothstep(-0.45, -0.05, up) * 0.85 + 0.15;
  col *= 1.0 + uDay * 0.35;
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}`;

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
uniform float uBeat, uTime, uScale;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float tw = 0.6 + 0.4 * sin(uTime * 2.0 + aPhase * 6.28);
  float onBeat = exp(-fract(uBeat + aPhase * 0.25) * 6.0) * 0.6;
  vA = tw + onBeat;
  gl_PointSize = aSize * uScale * (0.8 + onBeat * 0.5);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w * 0.9999;
}`;

const STAR_FRAG = /* glsl */ `
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  a *= a;
  gl_FragColor = vec4(vec3(1.0, 0.92, 1.0) * a * vA, 1.0);
}`;

export class Sky {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private starMat: THREE.ShaderMaterial;
  private planet: THREE.Group;
  private ships: THREE.InstancedMesh;
  private shipT: number[] = [];
  private dummy = new THREE.Object3D();

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uBeat: { value: 0 },
        uOct: { value: 3 },
        uDay: { value: 0 },
        uGlow: { value: 0 },
        uVoid: { value: new THREE.Color(C.void) },
        uViolet: { value: new THREE.Color(C.violet) },
        uUv: { value: new THREE.Color(C.uv) },
        uPink: { value: new THREE.Color(C.pink) },
      },
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), this.mat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.group.add(dome);

    // Stars on a shell, more toward the top.
    const r = rng(11);
    const n = 4000;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1;
      const y = Math.abs(u) * 0.95 - 0.05;
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * rr * 280, y * 280, Math.sin(a) * rr * 280], i * 3);
      size[i] = 1 + Math.pow(r(), 6) * 4;
      phase[i] = r();
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    sg.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.starMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: { uBeat: { value: 0 }, uTime: { value: 0 }, uScale: { value: 1.5 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    this.group.add(this.stars);

    // A ringed planet low in the east.
    this.planet = new THREE.Group();
    const pm = new THREE.MeshStandardMaterial({ color: 0x3b2a8a, emissive: 0x2a1366, emissiveIntensity: 0.6, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(18, 40, 24), pm);
    const rings = new THREE.Mesh(new THREE.RingGeometry(24, 36, 64, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.pink).multiplyScalar(0.8), transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    rings.rotation.x = -Math.PI / 2 + 0.35;
    rings.rotation.y = 0.25;
    this.planet.add(body, rings);
    this.planet.position.set(150, 34, 70);
    this.group.add(this.planet);

    // Light-streak ships crossing far away.
    const sgeo = new THREE.BoxGeometry(0.4, 0.4, 9);
    this.ships = new THREE.InstancedMesh(sgeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(C.cyan).multiplyScalar(2) }), 6);
    this.ships.frustumCulled = false;
    for (let i = 0; i < 6; i++) this.shipT.push(i * 3.7);
    this.group.add(this.ships);
  }

  setQuality(t: Tier): void {
    this.mat.uniforms.uOct.value = t === 'low' ? 1 : t === 'medium' ? 3 : 5;
    const count = t === 'low' ? 300 : t === 'medium' ? 1500 : 4000;
    this.stars.geometry.setDrawRange(0, count);
    this.ships.visible = t === 'high';
    this.planet.visible = t !== 'low';
  }

  update(time: number, beat: number, day: number, glow: number): void {
    const u = this.mat.uniforms;
    u.uTime.value = time;
    u.uBeat.value = beat;
    u.uDay.value = day;
    u.uGlow.value = glow;
    this.starMat.uniforms.uBeat.value = beat;
    this.starMat.uniforms.uTime.value = time;
    this.planet.rotation.y = time * 0.01;
    if (this.ships.visible) {
      for (let i = 0; i < 6; i++) {
        const t = (time * 0.05 + this.shipT[i] / 22) % 1;
        const lane = i % 3;
        const y = 40 + lane * 18;
        const z = -180 + lane * 60;
        this.dummy.position.set(-260 + t * 520, y, z * (i < 3 ? 1 : -1));
        this.dummy.rotation.set(0, Math.PI / 2, 0);
        this.dummy.updateMatrix();
        this.ships.setMatrixAt(i, this.dummy.matrix);
      }
      this.ships.instanceMatrix.needsUpdate = true;
    }
  }
}
