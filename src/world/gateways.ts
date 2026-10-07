// Themed doorways for the worlds on a room's back wall. Each door hints at
// what is beyond it: a frame in the world's own style, a live painted view
// through the doorway, something on the floor in front, and a small idle
// animation that wakes up as the player walks over.
//
// Layout rule, so a door never clips into a toy or a game cabinet: anything
// below 2 m stays inside the clear zone in front of the door (1.1 m either
// side, see ROOM.areaDoorClear). Only signs and ornaments above 2 m reach wider.

import * as THREE from 'three';
import type { Area, Experience } from '../shared/model';
import { Batch } from './arcades';
import { cached, keep, plastic, roundBox, roundRect, sign, type SignStyle } from './kit';
import { circle, type Collider } from './physics';

type Kind = Experience['kind'];

export interface Gateway {
  /** Mounted on the back wall: x = 0 is the door's centre line, z = 0 the wall's inner face, +z into the room. */
  wall: THREE.Group;
  /** Floor pieces, already placed in room coordinates. */
  floor: THREE.Group;
  colliders: Collider[];
  /** `near` is 0 while the player is away and 1 at the door. */
  update(t: number, night: number, near: number): void;
}

/** Each world's own title, shown under the owner's name for the area. */
const TITLES: Record<Kind, string> = {
  kart: 'Toybox Grand Prix',
  casino: 'The Golden Paddle',
  galaxy: 'Black hole bloom',
  fart: 'Little Puffington',
  neon: 'Club Nova',
};

/** The doorway the view fills. */
const OPEN_W = 1.4;
const OPEN_H = 2.3;
/** Round-topped doorways spring into their arch here. */
const SPRING = 1.7;

// ---------------------------------------------------------------------------
// Views through the doorway: one fragment shader per world, painted in metres
// on the doorway (x from the centre line, y up from the floor).

interface ViewUniforms {
  [name: string]: THREE.IUniform;
  uTime: { value: number };
  uNight: { value: number };
  uNear: { value: number };
  uSize: { value: THREE.Vector2 };
}

const VIEW_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const VIEW_HEAD = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform float uNear;
uniform vec2 uSize;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Twinkling points, about one grid cell in eight.
float stars(vec2 p, float scale) {
  vec2 q = p * scale;
  vec2 cell = floor(q);
  float h = hash(cell);
  vec2 at = cell + 0.25 + 0.5 * vec2(hash(cell + 7.1), hash(cell + 3.3));
  float d = length(q - at);
  return step(0.88, h) * (1.0 - smoothstep(0.0, 0.12, d)) * (0.6 + 0.4 * sin(uTime * (1.5 + h * 3.0) + h * 40.0));
}

// 1 inside a disc of radius r, with a soft edge.
float disc(vec2 p, float r) { return 1.0 - smoothstep(r - 0.006, r, length(p)); }
`;

const VIEW_MAIN = /* glsl */ `
void main() {
  vec2 p = vec2((vUv.x - 0.5) * uSize.x, vUv.y * uSize.y);
  #ifdef SPRING
  if (p.y > SPRING && length(p - vec2(0.0, SPRING)) > uSize.x * 0.5) discard;
  #endif
  vec3 col = scene(p);
  gl_FragColor = vec4(pow(max(col, vec3(0.0)), vec3(2.2)), 1.0);
  #include <colorspace_fragment>
}`;

/** Block Town from the starting grid: the road runs off between kerbs over the floorboards of a giant playroom. */
const KART_VIEW = /* glsl */ `
vec3 block(vec3 col, vec2 q, float x, float hw, float y0, vec3 c) {
  vec2 a = abs(q - vec2(x, y0 + hw));
  if (max(a.x, a.y) > hw) return col;
  vec3 face = c * mix(0.84, 1.05, step(max(a.x, a.y), hw * 0.72));
  return face * mix(1.0, 0.55, uNight * 0.85);
}

vec3 board(float wx, float zz) {
  float plank = floor(wx * 1.4);
  float h = hash(vec2(plank, 3.0));
  vec3 c = mix(vec3(0.851, 0.627, 0.4), vec3(0.725, 0.478, 0.275), h);
  float seam = smoothstep(0.0, 0.05, fract(wx * 1.4));
  float joint = step(0.03, fract(zz * 0.2 + h * 7.0));
  return c * mix(0.7, 1.0, seam * joint);
}

vec3 scene(vec2 p) {
  float hz = 1.3;
  if (p.y > hz) {
    vec2 q = p - vec2(0.0, hz);
    vec3 paper = mix(vec3(1.0, 0.953, 0.839), vec3(0.2, 0.19, 0.36), uNight * 0.85);
    vec3 print = mix(vec3(0.75, 0.89, 1.0), vec3(0.32, 0.34, 0.6), uNight * 0.85);
    vec2 cp = q * 3.2 + vec2(uTime * 0.04, 0.0);
    vec2 f = fract(cp) - 0.5;
    float puff = max(disc(f * vec2(0.9, 1.6), 0.2), disc((f - vec2(0.1, 0.05)) * 1.4, 0.16));
    vec3 col = mix(paper, print, puff * step(0.45, hash(floor(cp))));
    col = mix(col, mix(vec3(1.0, 0.98, 0.94), vec3(0.4, 0.38, 0.5), uNight), step(q.y, 0.05));
    col = block(col, q, -0.5, 0.16, 0.0, vec3(0.91, 0.341, 0.29));
    col = block(col, q, -0.47, 0.12, 0.32, vec3(1.0, 0.824, 0.29));
    col = block(col, q, 0.52, 0.18, 0.0, vec3(0.29, 0.639, 0.875));
    col = block(col, q, 0.27, 0.08, 0.0, vec3(0.247, 0.714, 0.545));
    return col * mix(1.0, 0.82, smoothstep(0.0, 1.0, q.y));
  }
  float d = hz - p.y;
  float z = 2.6 / d;
  float k = 1.0 - d / hz;
  // The road bends one way, then the other.
  float wx = (p.x - 0.22 * sin(uTime * 0.25) * k * k) * z;
  float zz = z + uTime * (5.0 + uNear * 5.0);
  float aw = abs(wx);
  vec3 col;
  if (aw < 1.0) {
    col = vec3(0.294, 0.306, 0.369) * (0.9 + 0.1 * noise(vec2(wx * 6.0, zz * 2.0)));
    col = mix(col, vec3(1.0, 0.98, 0.94), step(aw, 0.05) * step(0.5, fract(zz * 0.3)));
  } else if (aw < 1.28) {
    col = fract(zz * 0.6) < 0.5 ? vec3(0.91, 0.341, 0.29) : vec3(1.0, 0.98, 0.94);
  } else {
    col = board(wx, zz);
  }
  col *= mix(1.0, 0.6, uNight);
  // Haze toward the far wall, before the stripes can shimmer.
  vec3 haze = mix(vec3(0.98, 0.9, 0.78), vec3(0.24, 0.22, 0.38), uNight * 0.85);
  return mix(col, haze, smoothstep(9.0, 40.0, z));
}`;

/** From the deck of the riverboat: a river at sundown, festoon bulbs overhead, the rail in front. */
const CASINO_VIEW = /* glsl */ `
float bankY(float x, float hz) { return hz + 0.07 + 0.035 * sin(x * 4.0 + 1.3) + 0.02 * sin(x * 11.0); }

vec3 sky(vec2 p, float hz) {
  vec3 low = mix(vec3(1.0, 0.68, 0.45), vec3(0.13, 0.2, 0.3), uNight);
  vec3 high = mix(vec3(0.45, 0.33, 0.58), vec3(0.04, 0.06, 0.14), uNight);
  vec3 c = mix(low, high, smoothstep(hz, 2.4, p.y));
  vec2 sp = p - vec2(0.28, hz + 0.24 + uNight * 0.5);
  vec3 light = mix(vec3(1.0, 0.86, 0.55), vec3(0.85, 0.9, 1.0), uNight);
  c = mix(c, light, disc(sp, 0.09));
  c += light * 0.35 * exp(-length(sp) * 7.0);
  return c + vec3(stars(p, 26.0)) * uNight * step(hz + 0.3, p.y);
}

vec3 bank(vec2 p, float hz) {
  vec3 c = mix(vec3(0.12, 0.25, 0.27), vec3(0.03, 0.08, 0.1), uNight);
  vec2 w = vec2(p.x * 40.0, (p.y - hz) * 40.0);
  float lit = step(0.72, hash(floor(w) + 3.0)) * step(p.y, bankY(p.x, hz) - 0.02);
  float spot = 1.0 - smoothstep(0.2, 0.35, length(fract(w) - 0.5));
  return mix(c, vec3(1.0, 0.81, 0.48), lit * spot * (0.35 + 0.65 * uNight));
}

float wire(float x) { return 1.92 - 0.16 * (1.0 - (x / 0.7) * (x / 0.7)); }

vec3 scene(vec2 p) {
  float hz = 1.0;
  vec3 col;
  if (p.y >= hz) {
    col = p.y < bankY(p.x, hz) ? bank(p, hz) : sky(p, hz);
  } else {
    float d = hz - p.y;
    // Ripples bend the reflection sideways.
    float wob = (noise(vec2(p.x * 6.0, 30.0 * d / (d + 0.15) - uTime * 1.2)) - 0.5) * 0.06 * (0.3 + d);
    vec2 m = vec2(p.x + wob, hz + d * 0.9);
    vec3 refl = m.y < bankY(m.x, hz) ? bank(m, hz) : sky(m, hz);
    col = mix(mix(vec3(0.114, 0.31, 0.333), vec3(0.04, 0.12, 0.15), uNight), refl, 0.55);
    col += vec3(1.0, 0.9, 0.7) * step(0.82, noise(vec2(p.x * 40.0, d * 90.0 + uTime * 1.5))) * 0.25 * (1.0 - d);
  }
  // Festoon bulbs on a sagging wire.
  col = mix(col, vec3(0.08, 0.06, 0.05), 1.0 - smoothstep(0.004, 0.009, abs(p.y - wire(p.x))));
  vec3 warm = vec3(1.0, 0.81, 0.48);
  for (int i = 0; i < 7; i++) {
    float bx = -0.54 + float(i) * 0.18;
    vec2 b = p - vec2(bx, wire(bx) - 0.045);
    float tw = 0.75 + 0.25 * sin(uTime * (2.0 + uNear * 3.0) + float(i) * 1.7);
    col = mix(col, warm * (1.05 + 0.25 * uNight), disc(b, 0.028));
    col += warm * exp(-length(b) * 22.0) * (0.25 + 0.35 * uNight) * tw;
  }
  // The deck rail: mahogany handrail, ivory balusters.
  float shade = mix(1.0, 0.7, uNight);
  if (p.y < 0.47) {
    if (p.y > 0.4) {
      col = mix(vec3(0.416, 0.173, 0.114), vec3(0.557, 0.29, 0.18), step(0.455, p.y)) * shade;
    } else if (p.y < 0.09 && p.y > 0.05) {
      col = vec3(0.416, 0.173, 0.114) * shade;
    } else {
      float bx = abs(fract((p.x + 0.07) / 0.14) - 0.5);
      if (bx < 0.1) col = vec3(0.957, 0.906, 0.8) * (1.0 - bx * 2.0) * shade;
    }
  }
  return col;
}`;

/** The black hole in the drawing's own colours, with a ringed planet far off. */
const GALAXY_VIEW = /* glsl */ `
vec3 scene(vec2 p) {
  vec2 c = p - vec2(0.0, 1.22);
  float r = length(c);
  float a = atan(c.y, c.x);
  vec3 col = vec3(0.071, 0.051, 0.141);
  float n = noise(p * 3.0 + vec2(uTime * 0.05, 0.0)) * noise(p * 1.4 - vec2(0.0, uTime * 0.03));
  col += vec3(0.54, 0.42, 0.82) * n * 0.55;
  col += vec3(stars(p, 30.0)) * 0.9;
  // Accretion disk: spiral arms in gold and purple.
  float spin = uTime * (0.6 + uNear * 0.9);
  float arms = sin(a * 3.0 + log(r + 0.02) * 7.0 - spin * 3.0) * 0.5 + 0.5;
  float diskMask = (1.0 - smoothstep(0.25, 0.68, r)) * smoothstep(0.13, 0.19, r);
  vec3 dc = mix(vec3(0.957, 0.718, 0.251), vec3(0.541, 0.42, 0.82), smoothstep(0.16, 0.5, r));
  col = mix(col, dc * (0.7 + 0.6 * arms), diskMask * (0.5 + 0.5 * arms));
  // Photon ring, then the hole itself.
  float ringD = (r - 0.155) * 55.0;
  col += vec3(1.0, 0.95, 0.85) * exp(-ringD * ringD) * 1.2;
  col *= smoothstep(0.12, 0.15, r);
  // A small ringed planet, ring behind and in front.
  vec2 pp = p - vec2(-0.38, 1.98);
  float e = length(vec2(pp.x, (pp.y + pp.x * 0.25) * 3.5));
  float ring = smoothstep(0.085, 0.09, e) * (1.0 - smoothstep(0.115, 0.12, e));
  vec3 green = vec3(0.247, 0.714, 0.545);
  col = mix(col, green, ring * 0.9);
  float body = disc(pp, 0.066);
  vec3 blue = mix(vec3(0.122, 0.31, 0.62), vec3(0.486, 0.769, 0.949), 0.5 + 0.5 * sin(pp.y * 70.0));
  blue *= 0.55 + 0.6 * (1.0 - smoothstep(-0.08, 0.08, pp.x - pp.y));
  col = mix(col, blue, body);
  col = mix(col, green, ring * step(pp.y + pp.x * 0.25, 0.0) * body);
  return col;
}`;

/** Little Puffington over the hills: cottages, a winding path, and now and then a green puff from a chimney. */
const FART_VIEW = /* glsl */ `
float hill(float x, float base, float amp, float f, float ph) { return base + amp * sin(x * f + ph) + amp * 0.4 * sin(x * f * 2.3 + ph * 1.7); }

vec3 cottage(vec3 col, vec2 p, float x, float y0, float s, vec3 wall, vec3 roof) {
  vec2 q = (p - vec2(x, y0)) / s;
  vec3 shade = vec3(mix(1.0, 0.45, uNight));
  // Chimney, roof, then walls with a window that glows at night.
  if (q.x > 0.03 && q.x < 0.06 && q.y > 0.1 && q.y < 0.2) col = vec3(0.42, 0.29, 0.23) * shade;
  float roofT = (q.y - 0.1) / 0.075;
  if (roofT > 0.0 && roofT < 1.0 && abs(q.x) < 0.095 * (1.0 - roofT)) col = roof * shade;
  if (abs(q.x) < 0.075 && q.y > 0.0 && q.y < 0.1) {
    col = wall * shade;
    vec2 w = abs(q - vec2(-0.03, 0.055));
    if (max(w.x, w.y) < 0.018) col = mix(vec3(0.35, 0.45, 0.6) * shade, vec3(1.0, 0.82, 0.45), uNight);
    vec2 dr = q - vec2(0.03, 0.0);
    if (abs(dr.x) < 0.014 && dr.y < 0.05) col = vec3(0.42, 0.29, 0.23) * shade;
  }
  return col;
}

vec3 scene(vec2 p) {
  float hz = 1.25;
  vec3 low = mix(vec3(0.988, 0.914, 0.784), vec3(0.29, 0.31, 0.54), uNight);
  vec3 high = mix(vec3(0.494, 0.784, 0.949), vec3(0.106, 0.137, 0.278), uNight);
  vec3 col = mix(low, high, smoothstep(hz, 2.4, p.y));
  col += vec3(stars(p, 28.0)) * uNight;
  vec2 sp = p - vec2(-0.3, 2.02);
  vec3 light = mix(vec3(1.0, 0.9, 0.55), vec3(0.95, 0.95, 1.0), uNight);
  col = mix(col, light, disc(sp, 0.08));
  col += light * 0.25 * exp(-length(sp) * 6.0);
  vec3 cloudCol = mix(vec3(1.0), vec3(0.45, 0.48, 0.66), uNight);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float cx = mod(fi * 0.83 + uTime * (0.025 + fi * 0.008), 2.2) - 1.1;
    vec2 cp = p - vec2(cx, 1.62 + fi * 0.2);
    float c = max(disc(cp * vec2(1.0, 1.5), 0.08), max(disc(cp - vec2(-0.06, 0.01), 0.045), disc(cp - vec2(0.05, 0.02), 0.05)));
    col = mix(col, cloudCol, c * 0.95);
  }
  // Far hills, then the village hill, then the near meadow.
  if (p.y < hill(p.x, hz + 0.2, 0.05, 3.0, 0.5)) col = mix(vec3(0.72, 0.85, 0.6), vec3(0.2, 0.27, 0.35), uNight);
  if (p.y < hill(p.x, hz + 0.04, 0.06, 2.2, 2.0)) col = mix(vec3(0.612, 0.796, 0.42), vec3(0.16, 0.24, 0.22), uNight);
  col = cottage(col, p, -0.42, hill(-0.42, hz + 0.04, 0.06, 2.2, 2.0) - 0.01, 1.0, vec3(1.0, 0.945, 0.839), vec3(0.851, 0.4, 0.247));
  col = cottage(col, p, 0.05, hill(0.05, hz + 0.04, 0.06, 2.2, 2.0) - 0.01, 0.85, vec3(1.0, 0.886, 0.604), vec3(0.424, 0.498, 0.659));
  col = cottage(col, p, 0.42, hill(0.42, hz + 0.04, 0.06, 2.2, 2.0) - 0.01, 1.1, vec3(0.976, 0.776, 0.722), vec3(0.851, 0.4, 0.247));
  // Every few seconds a green puff rises from the middle chimney.
  float cyc = fract(uTime / 6.0);
  vec2 pc = p - vec2(0.05 + 0.04 * 0.85, hill(0.05, hz + 0.04, 0.06, 2.2, 2.0) + 0.2 * 0.85 + cyc * 0.35);
  float puffR = 0.02 + cyc * 0.07;
  col = mix(col, vec3(0.561, 0.82, 0.31), disc(pc, puffR) * (1.0 - cyc) * 0.85);
  float nearY = hill(p.x, 0.88, 0.06, 1.6, 4.0);
  if (p.y < nearY) {
    col = mix(vec3(0.435, 0.639, 0.353), vec3(0.12, 0.2, 0.16), uNight);
    vec2 fc = p * 26.0;
    float h = hash(floor(fc));
    vec3 flower = h > 0.94 ? vec3(1.0, 0.831, 0.361) : (h > 0.9 ? vec3(1.0, 0.561, 0.694) : vec3(1.0));
    col = mix(col, flower * mix(1.0, 0.5, uNight), step(0.86, h) * disc(fract(fc) - 0.5, 0.18));
    // The path winds up to the village.
    float cx = 0.12 * sin(p.y * 4.0 + 1.0);
    float hw = 0.34 * (1.0 - p.y / 0.95) + 0.02;
    if (abs(p.x - cx) < hw) {
      vec3 stone = mix(vec3(0.914, 0.827, 0.659), vec3(0.788, 0.682, 0.502), step(0.75, noise(p * vec2(60.0, 90.0))));
      col = stone * mix(1.0, 0.5, uNight);
    }
  }
  return col;
}`;

/** Club Nova: the Nova Core on the horizon, rays across the sky, a neon grid floor pulsing on the beat. */
const NEON_VIEW = /* glsl */ `
vec3 scene(vec2 p) {
  float hz = 1.05;
  float pulse = exp(-fract(uTime * 2.0) * 6.0);
  vec2 cc = vec2(0.0, hz + 0.2);
  vec2 c = p - cc;
  float r = length(c);
  vec3 col;
  if (p.y > hz) {
    col = mix(vec3(0.106, 0.067, 0.278), vec3(0.039, 0.024, 0.125), smoothstep(hz, 2.3, p.y));
    col += vec3(stars(p, 30.0)) * 0.8;
    float rays = step(0.5, fract(atan(c.y, c.x) * 2.546 + uTime * 0.06));
    col += vec3(0.42, 0.23, 1.0) * rays * 0.28 * (1.0 - smoothstep(0.3, 1.4, r));
  } else {
    float d = hz - p.y;
    float z = 1.4 / d;
    float wx = p.x * z;
    float zz = z + uTime * 2.0;
    float w = 0.05;
    float gx = smoothstep(0.5 - w, 0.5, abs(fract(wx * 1.2) - 0.5));
    float gz = smoothstep(0.5 - w, 0.5, abs(fract(zz * 0.9) - 0.5));
    float fade = 1.0 - smoothstep(5.0, 18.0, z);
    col = vec3(0.071, 0.043, 0.2);
    col += vec3(0.176, 0.91, 1.0) * gx * fade * 0.85;
    col += vec3(1.0, 0.24, 0.68) * gz * fade * (0.55 + 0.6 * pulse);
    col += vec3(0.71, 0.61, 1.0) * exp(-abs(p.x) * 9.0) * exp(-d * 2.5) * (0.35 + 0.25 * pulse);
  }
  float R = 0.2 + 0.012 * pulse;
  vec3 core = mix(vec3(1.0, 0.957, 0.996), vec3(0.525, 0.408, 0.812), smoothstep(0.0, R, r));
  col = mix(col, core, disc(c, R));
  col += vec3(0.71, 0.61, 1.0) * exp(-max(r - R, 0.0) * 9.0) * step(R, r) * (0.35 + 0.35 * pulse + uNear * 0.2);
  col += vec3(1.0, 0.24, 0.68) * exp(-abs(p.y - hz) * 60.0) * 0.6;
  return col;
}`;

function viewPlane(scene: string, w: number, h: number, arch: boolean, z: number): { mesh: THREE.Mesh; u: ViewUniforms } {
  const u: ViewUniforms = { uTime: { value: 0 }, uNight: { value: 0 }, uNear: { value: 0 }, uSize: { value: new THREE.Vector2(w, h) } };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VIEW_VERT,
    fragmentShader: VIEW_HEAD + scene + VIEW_MAIN,
    uniforms: u,
    defines: arch ? { SPRING: SPRING.toFixed(3) } : {},
  });
  const m = new THREE.Mesh(cached(`gate-view|${w}|${h}`, () => new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0)), mat);
  m.position.set(0, 0.02, z);
  return { mesh: m, u };
}

function tickView(u: ViewUniforms, t: number, night: number, near: number): void {
  u.uTime.value = t;
  u.uNight.value = night;
  u.uNear.value = near;
}

// ---------------------------------------------------------------------------
// Shared shapes.

/** A doorway outline from the floor up one side, over the top and down the other. Round corners of radius r; r = hw makes an arch. */
function doorPath(hw: number, top: number, r: number, step = 0.04): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i < n; i++) pts.push(new THREE.Vector3(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, 0));
  };
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / step));
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0));
    }
  };
  line(-hw, 0, -hw, top - r);
  arc(-hw + r, top - r, Math.PI, Math.PI / 2);
  if (hw - r > 1e-3) line(-hw + r, top, hw - r, top);
  arc(hw - r, top - r, Math.PI / 2, 0);
  line(hw, top - r, hw, 0);
  pts.push(new THREE.Vector3(hw, 0, 0));
  return pts;
}

function tube(pts: THREE.Vector3[], radius: number): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  return new THREE.TubeGeometry(curve, pts.length * 2, radius, 8, false);
}

/** Points spaced evenly along a path. */
function along(pts: THREE.Vector3[], spacing: number, from = 0): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  let next = from;
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = a.distanceTo(b);
    while (next <= walked + len) {
      out.push(a.clone().lerp(b, (next - walked) / len));
      next += spacing;
    }
    walked += len;
  }
  return out;
}

/** An arch-topped slab, for backings and plaster surrounds. */
function archSlab(hw: number, spring: number, depth: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-hw, 0);
  s.lineTo(-hw, spring);
  s.absarc(0, spring, hw, Math.PI, 0, true);
  s.lineTo(hw, 0);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 24 });
}

/** A flat decal on the floor, lifted clear of it and pulled forward in depth so it never flickers. */
function floorDecal(tex: THREE.Texture, w: number, d: number, y: number, opts: { additive?: boolean; opacity?: number } = {}): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: opts.opacity ?? 1,
    depthWrite: false,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const m = new THREE.Mesh(cached(`gate-decal|${w}|${d}`, () => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2)), mat);
  m.position.y = y;
  m.renderOrder = 1;
  return m;
}

function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = keep(new THREE.CanvasTexture(c));
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const textures = new Map<string, THREE.CanvasTexture>();
function texture(key: string, make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let t = textures.get(key);
  if (!t) {
    t = make();
    textures.set(key, t);
  }
  return t;
}

const checkerTexture = () =>
  texture('checker', () =>
    canvasTexture(128, 32, (g) => {
      for (let x = 0; x < 16; x++)
        for (let y = 0; y < 4; y++) {
          g.fillStyle = (x + y) % 2 ? '#1d1830' : '#fffaf0';
          g.fillRect(x * 8, y * 8, 8, 8);
        }
    }),
  );

const flagTexture = () =>
  texture('flag', () =>
    canvasTexture(64, 40, (g) => {
      for (let x = 0; x < 8; x++)
        for (let y = 0; y < 5; y++) {
          g.fillStyle = (x + y) % 2 ? '#1d1830' : '#fffaf0';
          g.fillRect(x * 8, y * 8, 8, 8);
        }
    }),
  );

/** A soft round glow, white, tinted by the material. */
const glowTexture = () =>
  texture('glow', () =>
    canvasTexture(128, 128, (g) => {
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
    }),
  );

/** The Golden Paddle's runner: navy carpet, coral pinstripes, a brass medallion. */
const carpetTexture = () =>
  texture('carpet', () =>
    canvasTexture(192, 240, (g) => {
      g.fillStyle = '#1b2147';
      g.fillRect(0, 0, 192, 240);
      g.fillStyle = '#c9973a';
      g.fillRect(0, 0, 14, 240);
      g.fillRect(178, 0, 14, 240);
      g.fillStyle = '#d8574a';
      for (const x of [22, 30, 158, 166]) g.fillRect(x, 0, 4, 240);
      g.strokeStyle = '#c9973a';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(96, 120, 40, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.beginPath();
        g.moveTo(96 + Math.cos(a) * 14, 120 + Math.sin(a) * 14);
        g.lineTo(96 + Math.cos(a) * 40, 120 + Math.sin(a) * 40);
        g.stroke();
      }
      g.fillStyle = '#c9973a';
      g.beginPath();
      g.arc(96, 120, 12, 0, Math.PI * 2);
      g.fill();
    }),
  );

/** Puffington cobbles, fading out at the far end. */
const cobbleTexture = () =>
  texture('cobbles', () =>
    canvasTexture(160, 192, (g) => {
      let seed = 11;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      g.fillStyle = '#c9ae80';
      roundRect(g, 0, 0, 160, 192, 26);
      g.fill();
      for (let row = 0; row < 8; row++) {
        const off = row % 2 ? 10 : 0;
        for (let col = -1; col < 8; col++) {
          const x = col * 22 + off + 3 + rnd() * 2;
          const y = row * 24 + 3 + rnd() * 2;
          g.fillStyle = ['#e9d3a8', '#f0dcb4', '#e2c99a'][Math.floor(rnd() * 3)];
          roundRect(g, x, y, 17, 19, 7);
          g.fill();
        }
      }
      // Fade at the room end so the path melts into the floor.
      g.globalCompositeOperation = 'destination-in';
      const fade = g.createLinearGradient(0, 0, 0, 192);
      fade.addColorStop(0, 'rgba(0,0,0,1)');
      fade.addColorStop(0.7, 'rgba(0,0,0,1)');
      fade.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = fade;
      g.fillRect(0, 0, 160, 192);
    }),
  );

/** Club Nova's neon outlines, blurred, as a glow behind the tubes (no bloom needed). */
const neonHaloTexture = (outer: THREE.Vector3[], inner: THREE.Vector3[], w: number, h: number) =>
  texture('neon-halo', () =>
    canvasTexture(256, Math.round((256 * h) / w), (g) => {
      const sx = 256 / w;
      const H = g.canvas.height;
      const stroke = (pts: THREE.Vector3[], color: string) => {
        g.strokeStyle = color;
        g.shadowColor = color;
        g.shadowBlur = 18;
        g.lineWidth = 7;
        g.beginPath();
        pts.forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, (p.x + w / 2) * sx, H - p.y * sx));
        g.stroke();
      };
      for (let i = 0; i < 2; i++) {
        stroke(outer, 'rgba(255,61,174,0.55)');
        stroke(inner, 'rgba(45,232,255,0.55)');
      }
    }),
  );

const ownSign = (area: Area, kind: Kind, w: number, h: number, style: SignStyle, glow: number) => {
  const title = TITLES[kind];
  const sub = title.toLowerCase() === area.name.trim().toLowerCase() ? undefined : title;
  return sign(area.name, w, h, { ...style, sub }, glow);
};

// ---------------------------------------------------------------------------
// The doors.

/** A start gantry in kerb stripes, five race lights that count down, waving flags and tyre stacks. */
function kartGate(area: Area, x: number, wallZ: number): Gateway {
  const wall = new THREE.Group();
  const floor = new THREE.Group();
  floor.position.set(x, 0, wallZ);
  const b = new Batch();
  const ink = plastic('#1d1830', { rough: 0.45 });
  b.add(roundBox(1.56, 2.5, 0.12, 0.04), ink, 0, 1.25, 0);
  const cream = plastic('#fffaf0', { rough: 0.5 });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) b.add(roundBox(0.3, 0.5, 0.34, 0.05), i % 2 ? cream : plastic('#e8574a', { rough: 0.5 }), side * 0.95, 0.25 + i * 0.5, 0.15);
    b.add(cached('gate-pole', () => new THREE.CylinderGeometry(0.025, 0.025, 0.62, 8)), cream, side * 1.12, 3.14, 0.16);
  }
  b.add(roundBox(2.5, 0.36, 0.36, 0.06), ink, 0, 2.66, 0.16);
  const housing = plastic('#2a2438', { rough: 0.4 });
  for (let i = 0; i < 5; i++) b.add(cached('gate-housing', () => new THREE.CylinderGeometry(0.11, 0.11, 0.06, 20).rotateX(Math.PI / 2)), housing, -0.6 + i * 0.3, 2.66, 0.36);
  b.build(wall);
  // Tyre stacks either side of the grid.
  const fb = new Batch();
  const rubber = plastic('#2b2b33', { rough: 0.85 });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) fb.add(cached('gate-tyre', () => new THREE.TorusGeometry(0.19, 0.085, 8, 18).rotateX(Math.PI / 2)), i === 2 ? plastic('#e8574a', { rough: 0.6 }) : rubber, side * 0.8, 0.085 + i * 0.17, 0.66);
  }
  fb.build(floor);
  const colliders = [-1, 1].map((side) => circle(x + side * 0.8, wallZ + 0.66, 0.28, 0.5, 0.6, false));

  const view = viewPlane(KART_VIEW, OPEN_W, OPEN_H, false, 0.07);
  wall.add(view.mesh);

  // Race lights, lit one by one.
  const OFF = new THREE.Color('#3a1414');
  const RED = new THREE.Color('#ff3b30');
  const GREEN = new THREE.Color('#3cff7a');
  const lenses = new THREE.InstancedMesh(cached('gate-lens', () => new THREE.CylinderGeometry(0.08, 0.08, 0.02, 20).rotateX(Math.PI / 2)), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 5);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 5; i++) {
    lenses.setMatrixAt(i, m4.makeTranslation(-0.6 + i * 0.3, 2.66, 0.395));
    lenses.setColorAt(i, OFF);
  }
  lenses.castShadow = false;
  wall.add(lenses);

  // Flags on the gantry poles, waving out from the door.
  const flags: { geo: THREE.PlaneGeometry; base: Float32Array; side: number }[] = [];
  const flagMat = new THREE.MeshStandardMaterial({ map: flagTexture(), side: THREE.DoubleSide, roughness: 0.8 });
  for (const side of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(0.5, 0.3, 8, 1).translate(0.25, 0, 0);
    if (side < 0) geo.scale(-1, 1, 1);
    const flag = new THREE.Mesh(geo, flagMat);
    flag.position.set(side * 1.12, 3.28, 0.16);
    wall.add(flag);
    flags.push({ geo, base: Float32Array.from(geo.attributes.position.array as Float32Array), side });
  }

  const s = ownSign(area, 'kart', 2.0, 0.5, { bg: '#1d1830', fg: '#ffd24a', border: '#e8574a', subColor: '#fffaf0', radius: 0.12 }, 0.25);
  s.position.set(0, 3.2, 0.03);
  wall.add(s);

  const strip = floorDecal(checkerTexture(), 1.9, 0.36, 0.024);
  strip.position.z = 0.25 + 0.18;
  floor.add(strip);

  // The countdown restarts when someone walks up, so the lights go out for them.
  let start = 0;
  let wasNear = false;
  return { wall, floor, colliders, update: (t, night, near) => {
    tickView(view.u, t, night, near);
    if (near > 0.6 && !wasNear) start = t;
    wasNear = near > 0.3 ? wasNear || near > 0.6 : false;
    const c = (t - start) % 6.5;
    for (let i = 0; i < 5; i++) lenses.setColorAt(i, c >= 3.6 && c < 5.2 ? GREEN : c >= 0.8 + i * 0.5 && c < 3.6 ? RED : OFF);
    lenses.instanceColor!.needsUpdate = true;
    for (const f of flags) {
      const pos = f.geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const out = Math.abs(f.base[i * 3]);
        pos.setZ(i, Math.sin(out * 9 - t * 5 + f.side) * 0.05 * (out / 0.5));
      }
      pos.needsUpdate = true;
    }
  } };
}

/** A riverboat saloon door: mahogany arch, chasing marquee bulbs, paddle wheels and a roped carpet. */
function casinoGate(area: Area, x: number, wallZ: number): Gateway {
  const wall = new THREE.Group();
  const floor = new THREE.Group();
  floor.position.set(x, 0, wallZ);
  const b = new Batch();
  const mahogany = plastic('#6a2c1d', { rough: 0.45 });
  const brass = plastic('#e0ac45', { rough: 0.3, emissive: '#6a4a14', emissiveIntensity: 0.35 });
  const ivory = plastic('#f4e7cc', { rough: 0.55 });
  const archPts = doorPath(0.86, SPRING + 0.86, 0.86);
  b.add(archSlab(0.76, SPRING, 0.1), plastic('#0f2e33', { rough: 0.6 }), 0, 0, -0.02);
  b.add(tube(archPts, 0.1), mahogany, 0, 0, 0.1);
  b.add(tube(doorPath(0.75, SPRING + 0.75, 0.75), 0.03), brass, 0, 0, 0.11);
  for (const side of [-1, 1]) b.add(roundBox(0.32, 0.34, 0.32, 0.05), ivory, side * 0.86, 0.17, 0.12);
  b.build(wall);
  // Velvet ropes from brass posts back to the arch.
  const fb = new Batch();
  for (const side of [-1, 1]) {
    fb.add(cached('gate-stanchion-base', () => new THREE.CylinderGeometry(0.12, 0.14, 0.05, 16)), brass, side * 0.8, 0.025, 1.25);
    fb.add(cached('gate-stanchion', () => new THREE.CylinderGeometry(0.028, 0.028, 0.86, 10)), brass, side * 0.8, 0.45, 1.25);
    fb.add(cached('gate-knob', () => new THREE.SphereGeometry(0.05, 12, 8)), brass, side * 0.8, 0.9, 1.25);
    const a = new THREE.Vector3(side * 0.8, 0.86, 1.22);
    const e = new THREE.Vector3(side * 0.82, 0.86, 0.2);
    const mid = a.clone().lerp(e, 0.5).add(new THREE.Vector3(0, -0.22, 0));
    fb.add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, e), 16, 0.025, 8, false), plastic('#c8303f', { rough: 0.7 }), 0, 0, 0);
  }
  fb.build(floor);
  const colliders = [-1, 1].map((side) => circle(x + side * 0.8, wallZ + 1.25, 0.14, 1, 0.5, false));

  const view = viewPlane(CASINO_VIEW, OPEN_W, SPRING + OPEN_W / 2, true, 0.09);
  wall.add(view.mesh);

  // Marquee bulbs along the arch: one instanced mesh, colours chase round.
  const spots = along(archPts, 0.2, 0.42);
  const bulbs = new THREE.InstancedMesh(cached('gate-bulb', () => new THREE.SphereGeometry(0.042, 10, 8)), new THREE.MeshBasicMaterial({ color: '#ffffff' }), spots.length);
  const m4 = new THREE.Matrix4();
  const dim = new THREE.Color('#7a5a30');
  spots.forEach((p, i) => {
    bulbs.setMatrixAt(i, m4.makeTranslation(p.x, p.y, 0.19));
    bulbs.setColorAt(i, dim);
  });
  bulbs.castShadow = false;
  wall.add(bulbs);

  // Little paddle wheels either side of the sign.
  const wheels: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(side * 1.3, 3.0, 0.12);
    const wb = new Batch();
    wb.add(cached('gate-rim', () => new THREE.TorusGeometry(0.27, 0.025, 8, 28)), plastic('#b8342c', { rough: 0.5 }), 0, 0, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      wb.add(roundBox(0.07, 0.17, 0.1, 0.02), ivory, Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0, 0, 0, a - Math.PI / 2);
      wb.add(roundBox(0.02, 0.2, 0.02, 0.008), plastic('#b8342c', { rough: 0.5 }), Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0, 0, 0, a - Math.PI / 2);
    }
    wb.add(cached('gate-hub', () => new THREE.CylinderGeometry(0.06, 0.06, 0.08, 14).rotateX(Math.PI / 2)), brass, 0, 0, 0);
    wb.build(w);
    wall.add(w);
    wheels.push(w);
  }

  const s = ownSign(area, 'casino', 1.9, 0.56, { bg: '#13212b', fg: '#e0ac45', border: '#e0ac45', subColor: '#f4e7cc', radius: 0.14 }, 0.35);
  s.position.set(0, 3.04, 0.03);
  wall.add(s);

  const runner = floorDecal(carpetTexture(), 1.2, 1.5, 0.022);
  runner.position.z = 0.8;
  floor.add(runner);

  const lit = new THREE.Color();
  const warm = new THREE.Color('#ffcf7a');
  return { wall, floor, colliders, update: (t, night, near) => {
    tickView(view.u, t, night, near);
    const speed = 2 + near * 4;
    for (let i = 0; i < spots.length; i++) {
      const on = (i + Math.floor(t * speed)) % 3 === 0;
      lit.copy(on ? warm : dim).multiplyScalar(on ? 1 : 0.8 + night * 0.4);
      bulbs.setColorAt(i, lit);
    }
    bulbs.instanceColor!.needsUpdate = true;
    for (const [i, w] of wheels.entries()) w.rotation.z = t * (0.6 + near * 1.2) * (i ? -1 : 1);
  } };
}

/** A dark stone portal into the galaxy: a glowing edge, gold stars, motes drifting out and a planet floating by. */
function galaxyGate(area: Area, x: number, wallZ: number): Gateway {
  const wall = new THREE.Group();
  const floor = new THREE.Group();
  floor.position.set(x, 0, wallZ);
  const b = new Batch();
  const stone = plastic('#2b2340', { rough: 0.4 });
  b.add(roundBox(1.56, 2.5, 0.12, 0.04), plastic('#120d24', { rough: 0.5 }), 0, 1.25, 0);
  for (const side of [-1, 1]) b.add(roundBox(0.24, 2.62, 0.26, 0.06), stone, side * 0.92, 1.31, 0.1);
  b.add(roundBox(2.08, 0.26, 0.26, 0.06), stone, 0, 2.62, 0.1);
  b.build(wall);

  const view = viewPlane(GALAXY_VIEW, OPEN_W, OPEN_H, false, 0.07);
  wall.add(view.mesh);

  const edgeMat = new THREE.MeshBasicMaterial({ color: '#8a6bd1' });
  const edge = new THREE.Mesh(cached('gate-galaxy-edge', () => tube(doorPath(0.78, 2.45, 0.16), 0.032)), edgeMat);
  edge.position.z = 0.1;
  wall.add(edge);

  // Gold four point stars above the portal, clear of the sign.
  const starShape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.025 : 0.08;
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starAt = [
    [-1.32, 2.25],
    [-1.62, 2.1],
    [1.28, 2.32],
    [1.6, 2.1],
    [1.52, 2.85],
    [-1.15, 3.22],
    [1.18, 3.28],
    [1.62, 3.4],
  ];
  const stars = new THREE.InstancedMesh(cached('gate-star', () => new THREE.ShapeGeometry(starShape)), new THREE.MeshBasicMaterial({ color: '#f4b740' }), starAt.length);
  stars.castShadow = false;
  wall.add(stars);

  // A ringed planet bobbing at the top left.
  const planet = new THREE.Group();
  planet.position.set(-1.4, 2.78, 0.55);
  planet.add(new THREE.Mesh(cached('gate-planet', () => new THREE.SphereGeometry(0.19, 24, 16)), plastic('#4aa3df', { rough: 0.4, emissive: '#1f4f9e', emissiveIntensity: 0.35 })));
  const ring = new THREE.Mesh(cached('gate-ring', () => new THREE.RingGeometry(0.25, 0.34, 40)), new THREE.MeshBasicMaterial({ color: '#3fb68b', side: THREE.DoubleSide }));
  ring.rotation.set(-1.15, 0.25, 0);
  planet.add(ring);
  wall.add(planet);

  // Motes drift out of the portal and fade into the room.
  const MOTES = 36;
  const motePos = new Float32Array(MOTES * 3);
  const moteCol = new Float32Array(MOTES * 3);
  const seeds = Array.from({ length: MOTES }, (_, i) => ({ x: Math.sin(i * 12.9898) * 0.55, y: 0.35 + (((i * 0.618) % 1) * 1.8), phase: (i * 0.37) % 1 }));
  const gold = new THREE.Color('#f4b740');
  const violet = new THREE.Color('#b49cff');
  seeds.forEach((_, i) => (i % 2 ? gold : violet).toArray(moteCol, i * 3));
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  moteGeo.setAttribute('color', new THREE.BufferAttribute(moteCol, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ size: 0.07, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  motes.frustumCulled = false;
  wall.add(motes);

  const s = ownSign(area, 'galaxy', 1.9, 0.6, { bg: '#2b2340', fg: '#fffaf0', border: '#8a6bd1', glow: '#8a6bd1', subColor: '#f4b740', radius: 0.14 }, 0.45);
  s.position.set(0, 3.05, 0.03);
  wall.add(s);

  const pool = floorDecal(glowTexture(), 2.0, 1.4, 0.024, { additive: true, opacity: 0.55 });
  (pool.material as THREE.MeshBasicMaterial).color.set('#8a6bd1');
  pool.position.z = 0.6;
  floor.add(pool);

  const m4 = new THREE.Matrix4();
  const k3 = new THREE.Vector3();
  const purple = new THREE.Color('#8a6bd1');
  const mint = new THREE.Color('#53f0c0');
  return { wall, floor, colliders: [], update: (t, night, near) => {
    tickView(view.u, t, night, near);
    edgeMat.color.copy(purple).lerp(mint, 0.5 + 0.5 * Math.sin(t * 0.9));
    starAt.forEach(([sx, sy], i) => {
      const k = 0.7 + 0.45 * Math.sin(t * 2.2 + i * 1.9);
      stars.setMatrixAt(i, m4.makeRotationZ(t * 0.3 + i).scale(k3.set(k, k, 1)).setPosition(sx, sy, 0.05));
    });
    stars.instanceMatrix.needsUpdate = true;
    planet.position.y = 2.78 + Math.sin(t * 0.8) * 0.04;
    planet.rotation.y = t * 0.4;
    const speed = 0.25 + near * 0.35;
    seeds.forEach((m, i) => {
      const life = (m.phase + t * speed) % 1;
      const swirl = life * 2.5 + i;
      motePos[i * 3] = m.x * (1 - life * 0.3) + Math.sin(swirl) * 0.12 * life;
      motePos[i * 3 + 1] = m.y + Math.cos(swirl) * 0.12 * life + life * 0.2;
      motePos[i * 3 + 2] = 0.1 + life * 1.4;
    });
    moteGeo.attributes.position.needsUpdate = true;
    (pool.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.15 * Math.sin(t * 1.3) + near * 0.15;
  } };
}

/** A Puffington cottage door: plaster and timber, a tiled porch roof with bunting, lanterns, and a toot when you walk up. */
function fartGate(area: Area, x: number, wallZ: number): Gateway {
  const wall = new THREE.Group();
  const floor = new THREE.Group();
  floor.position.set(x, 0, wallZ);
  const b = new Batch();
  const timber = plastic('#6b4a3a', { rough: 0.8 });
  const tile = plastic('#d9663f', { rough: 0.7 });
  b.add(archSlab(1.04, SPRING, 0.06), plastic('#fff1d6', { rough: 0.95 }), 0, 0, -0.02);
  b.add(archSlab(0.76, SPRING, 0.1), plastic('#2b1d3a', { rough: 0.8 }), 0, 0, -0.02);
  b.add(tube(doorPath(0.84, SPRING + 0.84, 0.84), 0.075), timber, 0, 0, 0.1);
  for (const side of [-1, 1]) {
    b.add(roundBox(0.26, 0.2, 0.26, 0.04), plastic('#c9ae80', { rough: 0.9 }), side * 0.84, 0.1, 0.1);
    // Porch roof: two tiled slopes meeting at a ridge.
    b.add(roundBox(1.16, 0.08, 0.66, 0.03), tile, side * 0.55, 2.72, 0.31, 0, 0, -side * 0.3);
    // A brace from the wall up to the eave.
    b.add(roundBox(0.06, 0.61, 0.06, 0.02), timber, side * 0.98, 2.37, 0.25, 0.96, 0, 0);
    // Lantern brackets.
    b.add(roundBox(0.04, 0.04, 0.22, 0.015), timber, side * 1.24, 2.42, 0.11);
    b.add(roundBox(0.16, 0.05, 0.16, 0.02), timber, side * 1.24, 2.36, 0.22);
    b.add(roundBox(0.16, 0.04, 0.16, 0.02), timber, side * 1.24, 2.07, 0.22);
  }
  b.add(cached('gate-ridge', () => new THREE.CylinderGeometry(0.05, 0.05, 0.68, 10).rotateX(Math.PI / 2)), tile, 0, 2.89, 0.31);
  b.build(wall);

  const view = viewPlane(FART_VIEW, OPEN_W, SPRING + OPEN_W / 2, true, 0.09);
  wall.add(view.mesh);

  // Bunting under the front edge of the porch roof.
  const COLORS = ['#e8574a', '#ffd45c', '#4aa3df', '#3fb68b', '#f58a6b', '#8a6bd1'];
  const tri: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < 10; i++) {
    const fx = -0.95 + i * 0.21;
    // Hung just under the slope: its underside drops tan(0.3) per metre from 2.85 at the ridge.
    const top = 2.84 - Math.abs(fx) * Math.tan(0.3);
    tri.push(fx - 0.075, top, 0.64, fx + 0.075, top, 0.64, fx, top - 0.15, 0.64);
    c.set(COLORS[i % COLORS.length]);
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  const buntingGeo = new THREE.BufferGeometry();
  buntingGeo.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
  buntingGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  buntingGeo.computeVertexNormals();
  const bunting = new THREE.Mesh(buntingGeo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }));
  wall.add(bunting);

  const lanternMat = new THREE.MeshBasicMaterial({ color: '#ffd27a' });
  const lb = new Batch();
  for (const side of [-1, 1]) lb.add(roundBox(0.12, 0.24, 0.12, 0.02), lanternMat, side * 1.24, 2.215, 0.22);
  lb.build(wall, false);

  const s = ownSign(area, 'fart', 2.0, 0.5, { bg: '#fff7e6', fg: '#2b1d3a', border: '#6b4a3a', subColor: '#3f7a1f', radius: 0.12 }, 0.15);
  s.position.set(0, 3.24, 0.03);
  wall.add(s);

  const path = floorDecal(cobbleTexture(), 1.3, 1.5, 0.022);
  path.position.z = 0.75;
  floor.add(path);

  // A toot: a few green puffs roll out of the door and fade.
  const PUFFS = 7;
  const puffs = Array.from({ length: PUFFS }, (_, i) => {
    const m = new THREE.Mesh(cached('gate-puff', () => new THREE.IcosahedronGeometry(1, 1)), new THREE.MeshBasicMaterial({ color: i % 3 ? '#8fd14f' : '#d4f58a', transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    wall.add(m);
    return { m, dx: Math.sin(i * 2.4) * 0.35, rise: 0.25 + ((i * 0.37) % 1) * 0.45, delay: i * 0.07 };
  });
  let tootAt = -99;
  let nextIdle = 4;
  let wasNear = false;
  const day = new THREE.Color('#c9a25a');
  const lampNight = new THREE.Color('#ffd27a');
  return { wall, floor, colliders: [], update: (t, night, near) => {
    tickView(view.u, t, night, near);
    const isNear = near > 0.6;
    if ((isNear && !wasNear && t - tootAt > 2.5) || t > nextIdle) {
      tootAt = t;
      nextIdle = t + 10 + Math.random() * 6;
    }
    wasNear = near > 0.3 ? wasNear || isNear : false;
    for (const p of puffs) {
      const k = (t - tootAt - p.delay) / 1.8;
      p.m.visible = k > 0 && k < 1;
      if (!p.m.visible) continue;
      const ease = 1 - (1 - k) * (1 - k);
      p.m.position.set(p.dx * ease, 0.32 + p.rise * ease, 0.15 + ease * 0.8);
      p.m.scale.setScalar(0.07 + ease * 0.24);
      (p.m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
    }
    lanternMat.color.copy(day).lerp(lampNight, Math.min(1, 0.25 + night));
  } };
}

/** Club Nova's airlock: neon tubes pulsing on the beat, level meters and coloured light pools on the floor. */
function neonGate(area: Area, x: number, wallZ: number): Gateway {
  const wall = new THREE.Group();
  const floor = new THREE.Group();
  floor.position.set(x, 0, wallZ);
  const b = new Batch();
  const panel = plastic('#1b1147', { rough: 0.35 });
  b.add(roundBox(1.84, 2.66, 0.12, 0.05), panel, 0, 1.33, 0);
  for (const side of [-1, 1]) b.add(roundBox(0.16, 1.82, 0.06, 0.03), panel, side * 1.02, 1.07, 0.01);
  b.build(wall);

  const view = viewPlane(NEON_VIEW, OPEN_W, OPEN_H, false, 0.07);
  wall.add(view.mesh);

  const outerPts = doorPath(0.86, 2.58, 0.24);
  const innerPts = doorPath(0.76, 2.44, 0.16);
  const pink = new THREE.MeshBasicMaterial({ color: '#ff3dae' });
  const cyan = new THREE.MeshBasicMaterial({ color: '#2de8ff' });
  const outer = new THREE.Mesh(cached('gate-neon-outer', () => tube(outerPts, 0.028)), pink);
  const inner = new THREE.Mesh(cached('gate-neon-inner', () => tube(innerPts, 0.026)), cyan);
  outer.position.z = inner.position.z = 0.1;
  wall.add(outer, inner);
  const haloW = 2.1;
  const haloH = 2.85;
  const haloMat = new THREE.MeshBasicMaterial({ map: neonHaloTexture(outerPts, innerPts, haloW, haloH), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const halo = new THREE.Mesh(cached(`gate-halo|${haloW}|${haloH}`, () => new THREE.PlaneGeometry(haloW, haloH).translate(0, haloH / 2, 0)), haloMat);
  halo.position.z = 0.078;
  halo.renderOrder = 1;
  wall.add(halo);

  // Level meters either side, bouncing to the club's beat.
  const SEG = 10;
  const meters = new THREE.InstancedMesh(roundBox(0.12, 0.13, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: '#ffffff' }), SEG * 2);
  const m4 = new THREE.Matrix4();
  const unlit = new THREE.Color('#2a1a66');
  for (let i = 0; i < SEG * 2; i++) {
    meters.setMatrixAt(i, m4.makeTranslation(i < SEG ? -1.02 : 1.02, 0.3 + (i % SEG) * 0.17, 0.05));
    meters.setColorAt(i, unlit);
  }
  meters.castShadow = false;
  wall.add(meters);
  const ramp = [new THREE.Color('#2de8ff'), new THREE.Color('#8668cf'), new THREE.Color('#ff3dae')];
  const segCol = Array.from({ length: SEG }, (_, i) => {
    const k = (i / (SEG - 1)) * 2;
    return ramp[Math.floor(k)].clone().lerp(ramp[Math.min(2, Math.floor(k) + 1)], k % 1);
  });

  const s = ownSign(area, 'neon', 2.2, 0.6, { bg: '#140c34', fg: '#fff4fe', border: '#ff3dae', glow: '#2de8ff', subColor: '#2de8ff', radius: 0.14 }, 0.6);
  s.position.set(0, 3.05, 0.03);
  wall.add(s);

  const pools = ['#ff3dae', '#2de8ff'].map((color, i) => {
    const p = floorDecal(glowTexture(), 1.1, 1.1, 0.024 + i * 0.002, { additive: true, opacity: 0.6 });
    (p.material as THREE.MeshBasicMaterial).color.set(color);
    floor.add(p);
    return p;
  });

  const pinkBase = new THREE.Color('#ff3dae');
  const cyanBase = new THREE.Color('#2de8ff');
  return { wall, floor, colliders: [], update: (t, night, near) => {
    tickView(view.u, t, night, near);
    const beat = (t * 2) % 1;
    const pulse = Math.exp(-beat * 6);
    const odd = Math.floor(t * 2) % 2 === 1;
    pink.color.copy(pinkBase).multiplyScalar(0.7 + 0.3 * (odd ? pulse : 0.3));
    cyan.color.copy(cyanBase).multiplyScalar(0.7 + 0.3 * (odd ? 0.3 : pulse));
    haloMat.opacity = 0.75 + 0.25 * pulse;
    const amp = 0.45 + near * 0.35;
    for (let side = 0; side < 2; side++) {
      const wob = 0.5 + 0.5 * Math.sin(t * (5.3 + side * 1.7) + side * 2);
      const level = Math.round((0.25 + amp * pulse + 0.2 * wob) * SEG);
      for (let i = 0; i < SEG; i++) meters.setColorAt(side * SEG + i, i < level ? segCol[i] : unlit);
    }
    meters.instanceColor!.needsUpdate = true;
    pools.forEach((p, i) => {
      const a = t * 0.7 + i * Math.PI;
      p.position.set(Math.cos(a) * 0.45, p.position.y, 0.95 + Math.sin(a * 1.3) * 0.3);
      (p.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.3 * pulse;
    });
  } };
}

const BUILDERS: Record<Kind, (area: Area, x: number, wallZ: number) => Gateway> = {
  kart: kartGate,
  casino: casinoGate,
  galaxy: galaxyGate,
  fart: fartGate,
  neon: neonGate,
};

/** The themed door for an area at x on the back wall (inner face at wallZ), or null for a plain area. */
export function buildGateway(area: Area, x: number, wallZ: number): Gateway | null {
  const kind = area.experience?.kind;
  return kind && BUILDERS[kind] ? BUILDERS[kind](area, x, wallZ) : null;
}
