// The Nova floor: the drawing's starburst as a 16-ray dance floor. On every
// beat a ring of light bursts out along the rays, footsteps light the ray
// under your feet, dance notes run in along the rays to the centre, misses dim
// the floor near you and Glow time turns it to a rainbow.

import * as THREE from 'three';
import { C, OUTPUT_CHUNK } from './util';

export const FLOOR_R = 6.5;
export const RAYS = 16;
const MAX_STEPS = 8;
const MAX_NOTES = 12;

const VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
#define RAYS 16.0
#define PI 3.14159265
uniform float uBeat, uTime, uGlow, uDim, uSpot, uHit, uLow, uMood;
uniform vec3 uViolet, uLilac, uDeck, uHitColor;
uniform vec4 uSteps[${MAX_STEPS}];
uniform vec3 uStepColors[${MAX_STEPS}];
uniform vec4 uNotes[${MAX_NOTES}];
uniform vec3 uNoteColors[${MAX_NOTES}];
uniform vec2 uPlayer;
varying vec2 vP;

vec3 hue(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}
// Distance (in metres, across) from the centre line of the nearest ray.
float rayDist(vec2 p, out float idx) {
  float a = atan(p.y, p.x);
  float seg = 2.0 * PI / RAYS;
  idx = floor(a / seg + 0.5);
  float da = a - idx * seg;
  return abs(sin(da)) * length(p);
}
void main() {
  vec2 p = vP;
  float r = length(p);
  float idx;
  float rd = rayDist(p, idx);
  float beatPh = fract(uBeat);
  // Base deck: dark gloss with the Core's reflection in the middle.
  vec3 col = uDeck * (0.9 + 0.25 * smoothstep(6.5, 0.0, r));
  col += uViolet * 0.35 * smoothstep(3.2, 0.0, r) * (0.8 + 0.4 * exp(-beatPh * 5.0));
  // Ray lanes: thin bright lines with a soft halo, widening outward.
  float w = 0.035 + r * 0.012;
  float lane = smoothstep(w, w * 0.4, rd) + smoothstep(w * 6.0, 0.0, rd) * 0.25;
  float inner = smoothstep(0.9, 1.3, r);
  vec3 rayCol = mix(uViolet, hue(idx / RAYS + uTime * 0.15), uGlow);
  col += rayCol * lane * inner * (0.55 + 0.25 * uMood);
  // Concentric rings.
  float ringA = smoothstep(0.03, 0.0, abs(r - 1.2));
  float ringB = smoothstep(0.025, 0.0, abs(r - 3.6));
  float rim = smoothstep(0.08, 0.0, abs(r - 6.32));
  col += uLilac * (ringA * 1.4 + ringB * 0.5 + rim * 1.2);
  // The beat ring bursting out along the rays.
  float wave = beatPh * 7.5;
  float burst = exp(-pow((r - wave) * 1.6, 2.0)) * (1.0 - beatPh) * (lane * 1.6 + 0.12);
  col += mix(uLilac, hue(r * 0.08 - uTime * 0.3), uGlow) * burst * (0.9 + uGlow);
  // Footsteps light the ray segment under them.
  if (uLow < 0.5) {
    for (int i = 0; i < ${MAX_STEPS}; i++) {
      vec4 s = uSteps[i];
      if (s.w <= 0.0) continue;
      float fr = length(s.xy);
      float fa = atan(s.y, s.x);
      float seg = 2.0 * PI / RAYS;
      float fidx = floor(fa / seg + 0.5);
      if (abs(fidx - idx) > 0.5 && abs(abs(fidx - idx) - RAYS) > 0.5) continue;
      float along = smoothstep(1.0, 0.0, abs(r - fr));
      col += uStepColors[i] * along * lane * s.w * 1.6;
    }
  }
  // Notes running in toward the centre along the rays.
  for (int i = 0; i < ${MAX_NOTES}; i++) {
    vec4 n = uNotes[i];
    if (n.w <= 0.0) continue;
    float seg = 2.0 * PI / RAYS;
    if (abs(n.x - idx) > 0.5 && abs(abs(n.x - idx) - RAYS) > 0.5) continue;
    float g = exp(-pow((r - n.y) * 3.0, 2.0)) * smoothstep(0.35, 0.0, rd);
    col += uNoteColors[i] * g * n.w * 2.2;
  }
  // A judged hit flashes the rays.
  col += uHitColor * uHit * lane * inner * 1.4;
  // Misses dim the floor around the dancer; the spotlight narrows to the middle.
  float near = smoothstep(3.5, 0.5, length(p - uPlayer));
  col *= 1.0 - uDim * 0.55 * near;
  col *= mix(1.0, smoothstep(4.5, 1.0, r) * 0.8 + 0.2, uSpot);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}`;

export class NovaFloor {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private steps: { x: number; z: number; age: number; color: THREE.Color }[] = [];
  private notes: THREE.Vector4[] = [];
  private noteColors: THREE.Color[] = [];
  private hit = 0;

  constructor() {
    const stepsU = Array.from({ length: MAX_STEPS }, () => new THREE.Vector4());
    const stepColors = Array.from({ length: MAX_STEPS }, () => new THREE.Color());
    this.notes = Array.from({ length: MAX_NOTES }, () => new THREE.Vector4());
    this.noteColors = Array.from({ length: MAX_NOTES }, () => new THREE.Color());
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uBeat: { value: 0 },
        uTime: { value: 0 },
        uGlow: { value: 0 },
        uDim: { value: 0 },
        uSpot: { value: 0 },
        uHit: { value: 0 },
        uLow: { value: 0 },
        uMood: { value: 0 },
        uViolet: { value: new THREE.Color(C.violet) },
        uLilac: { value: new THREE.Color(C.lilac) },
        uDeck: { value: new THREE.Color(0x0e0828) },
        uHitColor: { value: new THREE.Color(C.white) },
        uSteps: { value: stepsU },
        uStepColors: { value: stepColors },
        uNotes: { value: this.notes },
        uNoteColors: { value: this.noteColors },
        uPlayer: { value: new THREE.Vector2() },
      },
    });
    // Same 96-sided outline as the hole in the deck around it.
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(FLOOR_R, 96), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = false;
  }

  setLow(low: boolean): void {
    this.mat.uniforms.uLow.value = low ? 1 : 0;
  }

  /** Lights the ray under a footstep. */
  step(x: number, z: number, color: number): void {
    if (Math.hypot(x, z) > FLOOR_R) return;
    this.steps.push({ x, z, age: 0, color: new THREE.Color(color) });
    if (this.steps.length > MAX_STEPS) this.steps.shift();
  }

  flash(color: number, amount = 1): void {
    this.hit = Math.max(this.hit, amount);
    (this.mat.uniforms.uHitColor.value as THREE.Color).setHex(color);
  }

  /** Notes in flight: ray index, distance from the centre and colour. */
  setNotes(list: { ray: number; r: number; color: number; alpha: number }[]): void {
    for (let i = 0; i < MAX_NOTES; i++) {
      const n = list[i];
      if (n) {
        this.notes[i].set(n.ray, n.r, 0, n.alpha);
        this.noteColors[i].setHex(n.color);
      } else this.notes[i].w = 0;
    }
  }

  update(dt: number, time: number, beat: number, opts: { glow: number; dim: number; spot: number; mood: number; px: number; pz: number }): void {
    const u = this.mat.uniforms;
    u.uBeat.value = beat;
    u.uTime.value = time;
    u.uGlow.value = opts.glow;
    u.uDim.value = opts.dim;
    u.uSpot.value = opts.spot;
    u.uMood.value = opts.mood;
    (u.uPlayer.value as THREE.Vector2).set(opts.px, opts.pz);
    this.hit = Math.max(0, this.hit - dt * 3);
    u.uHit.value = this.hit;
    const arr = u.uSteps.value as THREE.Vector4[];
    const cols = u.uStepColors.value as THREE.Color[];
    for (let i = 0; i < MAX_STEPS; i++) {
      const s = this.steps[i];
      if (s) {
        s.age += dt;
        arr[i].set(s.x, s.z, 0, Math.max(0, 1 - s.age / 0.7));
        cols[i].copy(s.color);
      } else arr[i].w = 0;
    }
    this.steps = this.steps.filter((s) => s.age < 0.7);
  }
}

/** The ray index (0 to 15) a world point sits on. */
export function rayOf(x: number, z: number): number {
  const seg = (Math.PI * 2) / RAYS;
  return Math.round(Math.atan2(z, x) / seg);
}
