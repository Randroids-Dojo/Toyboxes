// The Nova Core: the room's starburst drawing as a hanging sculpture. A violet
// crystal heart with spikes of uneven length thrown out sideways like the
// drawing's rays, streaks of light behind it and a soft shaft down to the
// dance floor. It pulses on every beat and flares on phrase starts.

import * as THREE from 'three';
import type { Tier } from '../../world/space';
import { C, haloTexture, OUTPUT_CHUNK, rng } from './util';

const HEART_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const HEART_FRAG = /* glsl */ `
uniform vec3 uColor, uRim;
uniform float uPulse;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = pow(1.0 - max(0.0, dot(normalize(vN), normalize(vV))), 2.2);
  vec3 col = uColor * (0.55 + uPulse * 0.9) + uRim * f * (1.4 + uPulse * 1.5);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}`;

export class NovaCore {
  readonly group = new THREE.Group();
  private heart: THREE.Mesh;
  private heartMat: THREE.ShaderMaterial;
  private spikes: THREE.InstancedMesh;
  private spikeMat: THREE.MeshStandardMaterial;
  private streaks: THREE.Mesh;
  private shaft: THREE.Mesh;
  private halo: THREE.Sprite;
  light: THREE.PointLight;
  private flare = 0;
  private spin = 0;

  constructor(readonly y = 7.5) {
    this.group.position.set(0, y, 0);
    this.heartMat = new THREE.ShaderMaterial({
      vertexShader: HEART_VERT,
      fragmentShader: HEART_FRAG,
      uniforms: { uColor: { value: new THREE.Color(C.violet) }, uRim: { value: new THREE.Color(C.lilac) }, uPulse: { value: 0 } },
    });
    this.heart = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 2), this.heartMat);
    this.group.add(this.heart);

    // Spikes: long thin pyramids, biased sideways like the drawing's rays.
    const geo = new THREE.ConeGeometry(1, 1, 5, 1);
    geo.translate(0, 0.5, 0);
    this.spikeMat = new THREE.MeshStandardMaterial({ color: 0x5b3fb0, emissive: C.lilac, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.3, flatShading: true });
    const n = 48;
    this.spikes = new THREE.InstancedMesh(geo, this.spikeMat, n);
    const r = rng(7);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      // Directions mostly near the horizontal, with a few up and down.
      const a = (i / n) * Math.PI * 2 + r() * 0.3;
      let el = (r() - 0.5) * 1.1;
      if (i % 7 === 0) el = (r() < 0.5 ? -1 : 1) * (0.9 + r() * 0.5);
      // Nothing points low enough to come near a jumping player.
      el = Math.max(-0.75, el);
      const dir = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).normalize();
      const len = 1.2 + Math.pow(r(), 1.6) * 3.3;
      const w = 0.12 + r() * 0.22;
      q.setFromUnitVectors(up, dir);
      m.compose(dir.clone().multiplyScalar(1.1), q, new THREE.Vector3(w, len, w * (0.5 + r() * 0.6)));
      this.spikes.setMatrixAt(i, m);
    }
    this.group.add(this.spikes);

    // Ray streaks: a fan of thin additive planes facing the floor and the room.
    const sg: number[] = [];
    const su: number[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + (r() - 0.5) * 0.2;
      const len = 5 + r() * 5;
      const w = 0.25 + r() * 0.35;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const px = -sa * w;
      const pz = ca * w;
      const ex = ca * len;
      const ez = sa * len;
      sg.push(px, 0, pz, -px, 0, -pz, ex - px * 0.1, 0, ez - pz * 0.1, px, 0, pz, ex - px * 0.1, 0, ez - pz * 0.1, ex + px * 0.1, 0, ez + pz * 0.1);
      su.push(0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0);
    }
    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute('position', new THREE.Float32BufferAttribute(sg, 3));
    streakGeo.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
    this.streaks = new THREE.Mesh(
      streakGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color(C.uv) }, uPulse: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uColor; uniform float uPulse; varying vec2 vUv; void main(){ float a = (1.0 - vUv.y) * (1.0 - vUv.y) * (0.35 + uPulse * 0.5); gl_FragColor = vec4(uColor * a, 1.0); }`,
      }),
    );
    this.streaks.position.y = 0.05;
    this.group.add(this.streaks);

    // Soft light shaft to the floor.
    const shaftGeo = new THREE.CylinderGeometry(1.2, 3.2, this.y - 0.3, 32, 1, true);
    shaftGeo.translate(0, -(this.y - 0.3) / 2, 0);
    this.shaft = new THREE.Mesh(
      shaftGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color(C.lilac) }, uPulse: { value: 0 } },
        vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vP; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: `uniform vec3 uColor; uniform float uPulse; varying vec2 vUv; varying vec3 vN; varying vec3 vP; void main(){ vec3 v = normalize(cameraPosition - vP); float edge = pow(abs(dot(normalize(vN), v)), 1.5); float a = edge * (0.05 + 0.08 * uPulse) * smoothstep(0.0, 0.25, vUv.y) * (0.4 + 0.6 * vUv.y); gl_FragColor = vec4(uColor * a, 1.0); }`,
      }),
    );
    this.group.add(this.shaft);

    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: new THREE.Color(C.violet), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.halo.scale.set(11, 11, 1);
    this.group.add(this.halo);

    this.light = new THREE.PointLight(C.lilac, 18, 22, 1.6);
    this.group.add(this.light);
  }

  setQuality(t: Tier): void {
    this.light.visible = t !== 'low';
    this.shaft.visible = t !== 'low';
  }

  /** A bigger flash (phrase starts, combos, Glow time). */
  burst(amount = 1): void {
    this.flare = Math.max(this.flare, amount);
  }

  /** `beat` is the beat being heard (fractional). */
  update(dt: number, beat: number, glow: number, reduceMotion: boolean): void {
    const ph = beat - Math.floor(beat);
    const pulse = beat >= 0 ? Math.exp(-ph * 6) : 0;
    this.flare = Math.max(0, this.flare - dt * 1.8);
    const p = Math.min(1.6, pulse * 0.7 + this.flare + glow * 0.4);
    const s = 1 + (reduceMotion ? 0.01 : 0.04) * pulse + this.flare * 0.05;
    this.heart.scale.setScalar(s);
    this.spikes.scale.setScalar(1 + this.flare * 0.08);
    this.heartMat.uniforms.uPulse.value = p;
    this.spikeMat.emissiveIntensity = 0.7 + p * 0.9;
    this.spin += dt * (0.12 + glow * 0.25);
    this.spikes.rotation.y = this.spin;
    this.heart.rotation.y = -this.spin * 0.6;
    this.streaks.rotation.y = this.spin * 0.5;
    (this.streaks.material as THREE.ShaderMaterial).uniforms.uPulse.value = p;
    (this.shaft.material as THREE.ShaderMaterial).uniforms.uPulse.value = p;
    this.halo.material.opacity = 0.35 + p * 0.35;
    this.light.intensity = 14 + p * 16;
  }
}
