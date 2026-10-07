// The crowd on the balconies: little bean robots in many colours, all one
// instanced mesh. The vertex shader bobs their bodies and swings their arms
// from the beat, and lifts every arm for a cheer, so a full house costs one
// draw call.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Tier } from '../../world/space';
import { C, rng } from './util';

const MAX = 80;

function part(g: THREE.BufferGeometry, p: number, glow: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  const geo = (g.index ? g.toNonIndexed() : g).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal'].includes(k)) geo.deleteAttribute(k);
  const n = geo.attributes.position.count;
  geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(p), 1));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1));
  return geo;
}

export class Crowd {
  readonly mesh: THREE.InstancedMesh;
  private uniforms = { uBeat: { value: 0 }, uEnergy: { value: 1 }, uCheer: { value: 0 }, uTime: { value: 0 } };
  private cheer = 0;
  readonly spots: THREE.Vector3[] = [];

  constructor() {
    const geo = mergeGeometries([
      part(new THREE.CapsuleGeometry(0.24, 0.36, 4, 10), 0, 0, 0, 0.5, 0),
      part(new THREE.TorusGeometry(0.245, 0.03, 6, 18).rotateX(Math.PI / 2), 0, 1.4, 0, 0.55, 0),
      part(new THREE.SphereGeometry(0.2, 12, 10), 1, 0, 0, 1.0, 0),
      part(new THREE.BoxGeometry(0.22, 0.07, 0.04), 1, 2.2, 0, 1.02, 0.18),
      part(new THREE.CapsuleGeometry(0.06, 0.26, 3, 6), 2, 0, -0.3, 0.62, 0),
      part(new THREE.CapsuleGeometry(0.06, 0.26, 3, 6), 3, 0, 0.3, 0.62, 0),
    ])!;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.1 });
    mat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, this.uniforms);
      s.vertexShader = s.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute float aPart;
attribute float aGlow;
uniform float uBeat, uEnergy, uCheer, uTime;
varying float vGlow;
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vGlow = aGlow;
float seed = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);
float ph = fract(uBeat + seed * 0.12);
float bounce = exp(-ph * 4.0) * (0.06 + 0.1 * uEnergy);
if (aPart > 1.5) {
  float side = aPart < 2.5 ? -1.0 : 1.0;
  vec3 sh = vec3(side * 0.3, 0.75, 0.0);
  vec3 q = transformed - sh;
  float swing = sin((uBeat + seed) * 3.14159) * (0.5 + 0.4 * uEnergy);
  float up = mix(swing * side * 0.6, -side * 2.6 + sin(uTime * 9.0 + seed * 6.0) * 0.25, uCheer);
  q.xy = rot(up) * q.xy;
  transformed = q + sh;
}
transformed.y += bounce + uEnergy * 0.06 * max(0.0, sin((uBeat + seed) * 6.2832)) * step(1.5, uEnergy);
transformed.x += sin((uBeat + seed * 4.0) * 1.5708) * 0.04 * uEnergy;`,
        );
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * 1.8;');
    };
    mat.customProgramCacheKey = () => 'nova-crowd';
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    const r = rng(23);
    const colors = [C.pink, C.cyan, C.lime, C.gold, C.lilac, C.orange, 0x6b9bff, 0xff7ad9];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    // Four balconies between the spokes, two rows each; the best spots first so lower tiers keep a spread.
    const spots: { x: number; y: number; z: number }[] = [];
    for (let k = 0; k < MAX; k++) {
      const quad = k % 4;
      const idx = Math.floor(k / 4);
      const row = idx % 2;
      const slot = Math.floor(idx / 2);
      const a0 = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75][quad];
      const a = a0 + ((slot * 0.37) % 1 - 0.5) * 0.95 + (r() - 0.5) * 0.04;
      const rad = row === 0 ? 17 : 18.8;
      spots.push({ x: Math.cos(a) * rad, y: row === 0 ? 0.62 : 1.22, z: Math.sin(a) * rad });
    }
    spots.forEach((p, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-p.x, -p.z));
      const s = 0.9 + r() * 0.25;
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(s, s, s));
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]).multiplyScalar(0.75));
      this.spots.push(new THREE.Vector3(p.x, p.y, p.z));
    });
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
  }

  setQuality(t: Tier): void {
    this.mesh.count = t === 'low' ? 16 : t === 'medium' ? 40 : 80;
  }

  /** Arms up for a moment. */
  cheerNow(seconds = 1.6): void {
    this.cheer = Math.max(this.cheer, seconds);
  }

  update(dt: number, time: number, beat: number, energy: number): void {
    this.cheer = Math.max(0, this.cheer - dt);
    const u = this.uniforms;
    u.uBeat.value = beat;
    u.uTime.value = time;
    u.uEnergy.value += (energy - u.uEnergy.value) * Math.min(1, dt * 3);
    u.uCheer.value += ((this.cheer > 0 ? 1 : 0) - u.uCheer.value) * Math.min(1, dt * 10);
  }
}
