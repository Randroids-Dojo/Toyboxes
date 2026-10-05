// Day and night. The phase comes from the wall clock, so every visitor sees
// the same time of day without any server traffic.

import * as THREE from 'three';
import type { TimeMode } from '../core/local';

export const CYCLE_MINUTES = 24;

/** 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
export function dayPhase(nowMs: number, mode: TimeMode): number {
  switch (mode) {
    case 'day':
      return 0.42;
    case 'sunset':
      return 0.735;
    case 'night':
      return 0.02;
    default:
      return (nowMs / 60000 / CYCLE_MINUTES) % 1;
  }
}

interface Look {
  top: THREE.Color;
  horizon: THREE.Color;
  light: THREE.Color;
  lightI: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiI: number;
}

const c = (h: string) => new THREE.Color(h);

const NIGHT: Look = { top: c('#0c1233'), horizon: c('#2c3768'), light: c('#9db0ff'), lightI: 0.55, hemiSky: c('#6474b8'), hemiGround: c('#2a2440'), hemiI: 0.9 };
const DUSK: Look = { top: c('#3b4f96'), horizon: c('#ff9a6a'), light: c('#ffb47c'), lightI: 1.5, hemiSky: c('#b7a6d8'), hemiGround: c('#5a4a48'), hemiI: 0.9 };
const DAY: Look = { top: c('#4f9cf2'), horizon: c('#d4ecff'), light: c('#fff1da'), lightI: 2.6, hemiSky: c('#d4e8ff'), hemiGround: c('#8c7a5c'), hemiI: 1.15 };

function mix(a: Look, b: Look, t: number, out: Look): Look {
  out.top.copy(a.top).lerp(b.top, t);
  out.horizon.copy(a.horizon).lerp(b.horizon, t);
  out.light.copy(a.light).lerp(b.light, t);
  out.lightI = a.lightI + (b.lightI - a.lightI) * t;
  out.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, t);
  out.hemiGround.copy(a.hemiGround).lerp(b.hemiGround, t);
  out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * t;
  return out;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float sunSize;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, -0.2, 1.0);
  vec3 col = mix(horizon, top, pow(smoothstep(-0.05, 0.75, h), 0.7));
  float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
  col += sunColor * (pow(d, 900.0 / sunSize) * 1.4 + pow(d, 12.0) * 0.18);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  /** 0 in full day, 1 at night. Lamps and windows read this. */
  night = 0;
  phase = 0;
  private dome: THREE.Mesh;
  private stars: THREE.Points;
  private look: Look = { top: c('#000'), horizon: c('#000'), light: c('#000'), lightI: 0, hemiSky: c('#000'), hemiGround: c('#000'), hemiI: 0 };
  private uniforms: Record<string, THREE.IUniform>;
  private fog: THREE.Fog;

  constructor(scene: THREE.Scene) {
    this.uniforms = {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color() },
      sunSize: { value: 1 },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(300, 32, 16),
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.dome.renderOrder = -10;
    this.group.add(this.dome);

    const pts: number[] = [];
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 700; i++) {
      const u = rnd() * Math.PI * 2;
      const v = 0.08 + rnd() * 0.92;
      const r = Math.sqrt(1 - v * v);
      pts.push(Math.cos(u) * r * 280, v * 280, Math.sin(u) * r * 280);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#fff6e0', size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
    this.group.add(this.stars);

    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -26;
    sc.right = sc.top = 26;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
    scene.add(this.group, this.sun, this.sun.target, this.hemi);
    this.fog = new THREE.Fog('#cfe6ff', 70, 190);
    scene.fog = this.fog;
  }

  update(phase: number, focus: THREE.Vector3): void {
    this.phase = phase;
    const ang = (phase - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    const dayT = smooth(-0.02, 0.32, elev);
    const nightT = 1 - smooth(-0.22, 0.02, elev);
    if (nightT > 0.5) mix(NIGHT, DUSK, 1 - nightT, this.look);
    else mix(DUSK, DAY, dayT, this.look);
    this.night = nightT;

    // The sun swings east to west; at night a moon takes over from high up.
    const sunDir = new THREE.Vector3(Math.cos(ang), Math.max(elev, -0.3), -0.35).normalize();
    const lightDir = elev > -0.05 ? new THREE.Vector3(Math.cos(ang), Math.max(0.18, elev), -0.35).normalize() : new THREE.Vector3(-0.4, 0.75, 0.5).normalize();
    this.uniforms.top.value.copy(this.look.top);
    this.uniforms.horizon.value.copy(this.look.horizon);
    this.uniforms.sunDir.value.copy(elev > -0.1 ? sunDir : lightDir);
    this.uniforms.sunColor.value.copy(elev > -0.1 ? this.look.light : new THREE.Color('#d8e0ff')).multiplyScalar(elev > -0.1 ? 1 : 0.6);
    this.uniforms.sunSize.value = elev > -0.1 ? 1.2 : 0.7;
    (this.stars.material as THREE.PointsMaterial).opacity = smooth(0.35, 0.9, nightT);
    this.stars.visible = nightT > 0.3;

    this.sun.color.copy(this.look.light);
    this.sun.intensity = this.look.lightI;
    this.hemi.color.copy(this.look.hemiSky);
    this.hemi.groundColor.copy(this.look.hemiGround);
    this.hemi.intensity = this.look.hemiI;
    this.fog.color.copy(this.look.horizon).lerp(this.look.top, 0.15);

    this.group.position.set(focus.x, 0, focus.z);
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(lightDir, 60);
  }

  setShadowQuality(size: number): void {
    this.sun.castShadow = size > 0;
    if (size > 0 && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
  }
}
