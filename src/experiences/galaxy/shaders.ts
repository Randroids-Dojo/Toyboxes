// Shaders for the black hole galaxy. Kept apart from the scene code so the
// look can be tuned without touching gameplay.
//
// Colours are written as display values, then converted to linear at the
// end of each shader, so they look the same drawn straight to the screen
// (low tier) and through the post-processing chain (medium and high).

import type * as THREE from 'three';

const OUT = /* glsl */ `
  gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(2.2));
  #include <colorspace_fragment>
`;

export const NOISE = /* glsl */ `
float hash31(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i + vec3(0, 0, 0)), hash31(i + vec3(1, 0, 0)), f.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm3(vec3 p, float octaves) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= octaves) break;
    s += a * noise3(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}
`;

/** A flowing nebula in the drawing's colours, with stars. `uBloom` turns the black hole's side of the sky into a spiral galaxy. */
export const NEBULA_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const NEBULA_FRAG = /* glsl */ `
uniform float uTime;
uniform float uOctaves;
uniform float uFlare;
uniform float uBloom;
uniform vec3 uHoleDir;
varying vec3 vDir;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  vec3 q = d * 2.2 + vec3(0.0, uTime * 0.015, uTime * 0.01);
  float warp = fbm3(q * 1.6 + uTime * 0.02, uOctaves);
  float w = fbm3(q + warp * 1.8, uOctaves);
  // The drawing's night: #2b2340 deepened so the stars pop.
  vec3 deep = vec3(0.075, 0.055, 0.14);
  vec3 purple = vec3(0.54, 0.42, 0.82);
  vec3 green = vec3(0.25, 0.71, 0.55);
  vec3 blue = vec3(0.29, 0.64, 0.87);
  vec3 gold = vec3(0.96, 0.72, 0.25);
  vec3 col = deep * (0.75 + 0.5 * d.y);
  col = mix(col, purple * 0.6, smoothstep(0.4, 0.8, w));
  col = mix(col, blue * 0.5, smoothstep(0.55, 0.85, fbm3(q * 2.1 + 4.0, uOctaves)) * 0.55);
  col = mix(col, green * 0.55, smoothstep(0.62, 0.92, fbm3(q * 1.3 - 2.0, uOctaves)) * 0.5);
  col += gold * pow(smoothstep(0.72, 1.0, w), 3.0) * 0.8;
  // Brighter towards the black hole.
  float toward = max(0.0, dot(d, uHoleDir));
  col += vec3(0.5, 0.32, 0.9) * pow(toward, 14.0) * (0.45 + uFlare * 0.8);
  // After the bloom: a spiral galaxy where the black hole was.
  if (uBloom > 0.0) {
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 ax = normalize(cross(up, uHoleDir));
    vec3 ay = normalize(cross(uHoleDir, ax));
    vec2 p = vec2(dot(d, ax), dot(d, ay)) / max(0.2, toward);
    p = mat2(0.94, 0.34, -0.34, 0.94) * p * vec2(1.0, 1.6);
    float r = length(p) * 2.6;
    float a = atan(p.y, p.x);
    float arms = 0.5 + 0.5 * sin(2.0 * a - log(r + 0.05) * 4.2 + uTime * 0.12);
    arms = pow(arms, 3.0) * smoothstep(1.6, 0.15, r);
    float core = exp(-r * r * 9.0);
    float dust = fbm3(vec3(p * 5.0, uTime * 0.05), uOctaves);
    vec3 armCol = mix(mix(purple, gold, smoothstep(0.2, 0.9, r)), mix(green, blue, dust), smoothstep(0.5, 1.4, r));
    vec3 g = armCol * arms * (0.6 + 0.8 * dust) * 1.4 + vec3(1.0, 0.92, 0.75) * core * 1.6;
    col += g * uBloom * step(0.0, toward);
  }
  // Stars.
  vec3 sp = d * 380.0;
  vec3 cell = floor(sp);
  float h = hash31(cell);
  if (h > 0.985) {
    vec3 c = cell + vec3(hash31(cell + 1.3), hash31(cell + 2.7), hash31(cell + 5.1));
    float dist = length(sp - c);
    float twinkle = 0.6 + 0.4 * sin(uTime * (1.5 + h * 4.0) + h * 40.0);
    col += vec3(1.0, 0.95, 0.9) * smoothstep(0.55, 0.0, dist) * twinkle * (h - 0.985) * 70.0;
  }
  gl_FragColor = vec4(col, 1.0);
  ${OUT}
}`;

/** The accretion disk: a hot spiral that spins faster near the hole. Local radius times `uScale` is metres. */
export const DISK_VERT = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const DISK_FRAG = /* glsl */ `
uniform float uTime;
uniform float uFlare;
uniform float uInner;
uniform float uOuter;
uniform float uScale;
uniform float uDetail;
uniform float uFade;
uniform float uHeat;
varying vec2 vPos;
${NOISE}
void main() {
  float r = length(vPos) * uScale;
  float a = atan(vPos.y, vPos.x);
  float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
  float spin = uTime * 9.0 / pow(max(r * 0.6, 1.0), 1.5);
  float swirl = a + spin + log(r) * 2.6;
  float n = fbm3(vec3(cos(swirl) * 3.0, sin(swirl) * 3.0, r * 0.18 - uTime * 0.05), uDetail);
  float streaks = 0.55 + 0.45 * sin(swirl * 7.0 + n * 6.0);
  // Drawing colours: hot white, swirl gold, swirl purple, ring green.
  vec3 hot = vec3(1.0, 0.96, 0.86);
  vec3 gold = vec3(0.96, 0.72, 0.25);
  vec3 purple = vec3(0.54, 0.42, 0.9);
  vec3 green = vec3(0.25, 0.8, 0.58);
  vec3 col = mix(hot, gold, smoothstep(0.0, 0.2 - uHeat * 0.1, t));
  col = mix(col, purple, smoothstep(0.22, 0.6, t));
  col = mix(col, green, smoothstep(0.6, 1.0, t));
  float doppler = 1.0 + 0.75 * sin(a + 0.4);
  float bright = pow(1.0 - t, 1.6) * (0.45 + 0.9 * n) * streaks * doppler * (1.0 + uFlare * 2.5 + uHeat);
  float edge = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.7, t);
  gl_FragColor = vec4(col * bright * 1.8, edge * clamp(bright, 0.0, 1.0) * uFade);
  ${OUT}
}`;

/** The bright, thin photon ring and a soft halo, drawn on a camera-facing quad. */
export const RING_FRAG = /* glsl */ `
uniform float uTime;
uniform float uFlare;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ring = exp(-pow((r - 0.69) / 0.018, 2.0));
  float halo = exp(-pow((r - 0.69) / 0.16, 2.0)) * 0.35;
  float shimmer = 0.85 + 0.15 * sin(atan(p.y, p.x) * 6.0 + uTime * 2.0);
  vec3 col = vec3(1.0, 0.86, 0.62) * (ring * 2.4 + halo) * shimmer * (1.0 + uFlare * 2.0);
  gl_FragColor = vec4(col, (ring + halo) * step(0.62, r));
  ${OUT}
}`;

export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** The drawing's blue planet: bands from deep to sky blue, a ring-green atmosphere. */
export const PLANET_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vView;
void main() {
  vPos = position;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

export const PLANET_FRAG = /* glsl */ `
uniform float uTime;
uniform float uDetail;
uniform vec3 uLightDir;
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vView;
${NOISE}
void main() {
  vec3 p = normalize(vPos);
  float bands = p.y * 9.0 + fbm3(p * 3.0 + uTime * 0.03, uDetail) * 2.4;
  vec3 deep = vec3(0.1, 0.24, 0.52);
  vec3 light = vec3(0.36, 0.62, 0.86);
  float b = 0.5 + 0.5 * sin(bands);
  vec3 col = mix(deep, light, b * b);
  // Storm swirls in the bands.
  col = mix(col, vec3(0.62, 0.82, 0.96), smoothstep(0.72, 0.9, fbm3(p * 7.0 + vec3(uTime * 0.02), uDetail)) * 0.35);
  float lit = clamp(dot(vNormal, normalize(uLightDir)) * 0.6 + 0.35, 0.12, 0.9);
  float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 3.5);
  col = col * lit + vec3(0.25, 0.71, 0.55) * rim * 0.55;
  gl_FragColor = vec4(col, 1.0);
  ${OUT}
}`;

/** Comet streaks: a bright head fading to a long tail, tinted per instance. */
export const STREAK_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
void main() {
  vUv = uv;
  vColor = instanceColor;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

export const STREAK_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
void main() {
  float along = vUv.x;
  float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float a = pow(along, 2.2) * smoothstep(0.0, 0.7, across);
  gl_FragColor = vec4(vColor * (0.4 + along * 1.6), a);
  ${OUT}
}`;

/** Drifting motes that swirl slowly around the hub. */
export const MOTE_VERT = /* glsl */ `
uniform float uTime;
uniform float uScale;
attribute float aSeed;
varying float vSeed;
void main() {
  vSeed = aSeed;
  vec3 p = position;
  float ang = uTime * (0.03 + aSeed * 0.05);
  float c = cos(ang);
  float s = sin(ang);
  p.xz = mat2(c, -s, s, c) * p.xz;
  p.y += sin(uTime * 0.6 + aSeed * 40.0) * 0.6;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uScale * (0.6 + aSeed) / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

export const MOTE_FRAG = /* glsl */ `
uniform float uTime;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  vec3 a = vec3(0.6, 0.45, 1.0);
  vec3 b = vec3(0.35, 0.95, 0.75);
  vec3 g = vec3(1.0, 0.78, 0.35);
  vec3 col = vSeed < 0.33 ? a : vSeed < 0.66 ? b : g;
  float tw = 0.6 + 0.4 * sin(uTime * 2.0 + vSeed * 30.0);
  gl_FragColor = vec4(col * tw, (1.0 - d) * 0.9);
  ${OUT}
}`;

/** Glowing seams along crystal tiles, pulsing outwards in rings from `uCenter`. */
export const SEAM_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const SEAM_FRAG = /* glsl */ `
uniform float uTime;
uniform float uFlare;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uCenter;
varying vec3 vWorld;
void main() {
  float r = length(vWorld.xz - uCenter.xz);
  float wave = 0.5 + 0.5 * sin(r * 0.9 - uTime * 2.4);
  vec3 col = mix(uA, uB, 0.5 + 0.5 * sin(uTime * 0.4 + r * 0.25));
  gl_FragColor = vec4(col * (0.35 + wave * 0.9 + uFlare * 1.4), 1.0);
  ${OUT}
}`;

/** The energy rail at the hub's edge: only shows near the player, so it never draws lines across the sky. */
export const FENCE_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const FENCE_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uPlayer;
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  float near = smoothstep(4.0, 0.8, distance(vWorld.xz, uPlayer.xz));
  float lines = 0.5 + 0.5 * sin(vUv.y * 40.0 - uTime * 3.0);
  float hexes = 0.5 + 0.5 * sin(vUv.x * 900.0) * sin(vUv.y * 22.0 + uTime);
  float fade = 1.0 - vUv.y;
  float a = fade * near * 0.6 * (0.55 + lines * 0.3 + hexes * 0.15);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vec3(0.42, 0.77, 1.0), a);
  ${OUT}
}`;

/** The way home: a vortex inside the exit ring. */
export const VORTEX_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float swirl = sin(a * 5.0 + r * 12.0 - uTime * 4.0);
  vec3 col = mix(vec3(0.95, 0.75, 0.3), vec3(0.5, 0.3, 1.0), r) * (0.6 + 0.4 * swirl);
  gl_FragColor = vec4(col * 1.4, smoothstep(1.0, 0.85, r));
  ${OUT}
}`;

/** Glowing orbs that read as spheres even with no bloom: a hot core and a coloured fresnel rim. */
export const ORB_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vCol;
void main() {
  vCol = instanceColor;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

export const ORB_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vN;
varying vec3 vV;
varying vec3 vCol;
void main() {
  float f = max(dot(normalize(vN), normalize(vV)), 0.0);
  float core = pow(f, 3.0);
  float rim = pow(1.0 - f, 2.0);
  vec3 col = vCol * (0.55 + rim * 1.3) + vec3(1.0, 0.98, 0.92) * core * 0.9;
  gl_FragColor = vec4(col, 1.0);
  ${OUT}
}`;

/** A soft additive glow on a camera-facing quad (halos, Spark, stars). */
export const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float d = length(vUv * 2.0 - 1.0);
  float a = pow(max(0.0, 1.0 - d), 2.2) * uAlpha;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * a, 1.0);
  ${OUT}
}`;

/** A vertical beam of light: sling beacons, meteor beams, the stair's finish beam. */
export const BEAM_VERT = /* glsl */ `
varying vec2 vUv;
varying float vFres;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vFres = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;

export const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
varying vec2 vUv;
varying float vFres;
void main() {
  float fade = pow(1.0 - vUv.y, 1.4);
  float pulse = 0.75 + 0.25 * sin(vUv.y * 30.0 - uTime * 6.0);
  float a = fade * pulse * pow(vFres, 1.5) * uAlpha;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * a, 1.0);
  ${OUT}
}`;

/** A pad decal on a top: rings, a star and a spin-up glow. `uOn` 0 is a locked grey pad. */
export const PAD_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uOn;
uniform float uCharge;
uniform float uStar;
varying vec2 vUv;
float star(vec2 p, float r) {
  float a = atan(p.y, p.x) + 1.5708;
  float k = 6.2831 / 5.0;
  float m = cos(floor(0.5 + a / k) * k - a) * length(p);
  float s = 0.5 + 0.5 * cos(5.0 * a);
  return smoothstep(r * (0.55 + 0.45 * s) + 0.02, r * (0.55 + 0.45 * s), length(p));
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float spin = uTime * (0.8 + uCharge * 8.0);
  float ca = cos(spin);
  float sa = sin(spin);
  vec2 q = mat2(ca, -sa, sa, ca) * p;
  float outer = smoothstep(0.06, 0.0, abs(r - 0.92));
  float inner = smoothstep(0.04, 0.0, abs(r - 0.68)) * (0.6 + 0.4 * sin(atan(q.y, q.x) * 8.0));
  float st = uStar > 0.5 ? star(q, 0.5) : smoothstep(0.08, 0.0, abs(r - 0.3));
  float glow = (1.0 - r) * 0.35;
  vec3 col = mix(vec3(0.35, 0.33, 0.45), uColor, uOn);
  float a = (outer + inner * 0.8 + st * 0.9 + glow) * (0.35 + 0.65 * uOn) * (1.0 + uCharge * 1.5);
  gl_FragColor = vec4(col * a, 1.0);
  ${OUT}
}`;

/** A comet lane on the ring walkway: chevrons streaming forward. */
export const LANE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uBoost;
varying vec2 vUv;
void main() {
  float across = abs(vUv.y * 2.0 - 1.0);
  float chev = fract(vUv.x * 18.0 - across * 0.6 - uTime * 2.2);
  float c = smoothstep(0.0, 0.15, chev) * smoothstep(0.55, 0.3, chev);
  float edge = smoothstep(0.82, 0.98, across);
  float endFade = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);
  vec3 col = mix(vec3(0.75, 0.91, 1.0), vec3(0.96, 0.72, 0.25), across * 0.6);
  float a = (c * 0.55 + edge * 0.7 + 0.12) * endFade * (1.0 + uBoost);
  gl_FragColor = vec4(col * a, 1.0);
  ${OUT}
}`;

/** The star net's bubble: clear in the middle, a rainbow rim. */
export const BUBBLE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
varying vec3 vNormal;
varying vec3 vPos;
varying vec3 vView;
void main() {
  float f = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
  vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + f * 1.5 + uTime * 0.2));
  float a = (pow(f, 2.5) * 0.9 + 0.05) * uAlpha;
  gl_FragColor = vec4(mix(vec3(0.75, 0.9, 1.0), rainbow, 0.6) * a, 1.0);
  ${OUT}
}`;

/** A meteor's warning on the floor: a dashed coral ring closing in, with a filled centre. */
export const WARN_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vProg;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float dash = step(0.0, sin(a * 12.0 + uTime * 5.0));
  float ring = smoothstep(0.1, 0.0, abs(r - 0.92)) * dash;
  float closing = smoothstep(0.05, 0.0, abs(r - (1.0 - vProg))) ;
  float fill = (1.0 - r) * 0.25 * vProg;
  vec3 col = vec3(0.91, 0.34, 0.29);
  gl_FragColor = vec4(col * (ring * 0.9 + closing * (0.6 + vProg) + fill), 1.0);
  ${OUT}
}`;

export const WARN_VERT = /* glsl */ `
attribute float aProg;
varying vec2 vUv;
varying float vProg;
void main() {
  vUv = uv;
  vProg = aProg;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

/** Bends the picture around the black hole (high quality only). */
export const LENS_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uAspect;
uniform float uStrength;
varying vec2 vUv;
void main() {
  vec2 d = vUv - uCenter;
  d.x *= uAspect;
  float r = length(d);
  vec2 uv = vUv;
  if (r > uRadius * 0.98 && uStrength > 0.0) {
    vec2 off = normalize(d) * uStrength * uRadius * uRadius / r;
    off.x /= uAspect;
    uv = vUv - off * smoothstep(uRadius * 8.0, uRadius, r);
  }
  gl_FragColor = texture2D(tDiffuse, uv);
}`;

/**
 * The finishing pass: the portal fall on arrival, the warp tunnel of the
 * finale, colour fringing, a vignette, flashes, and the mask that keeps bloom
 * out of the black hole (warped the same way as the picture).
 */
export const FINAL_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uWarp;
uniform float uTunnel;
uniform float uSpin;
uniform float uAberration;
uniform vec2 uHoleCenter;
uniform float uHoleRadius;
uniform float uAspect;
uniform float uFade;
uniform vec3 uFadeColor;
varying vec2 vUv;
vec3 streakCol(float k) {
  k = mod(k, 6.0);
  if (k < 1.0) return vec3(0.54, 0.42, 0.82);
  if (k < 2.0) return vec3(0.25, 0.71, 0.55);
  if (k < 3.0) return vec3(0.29, 0.64, 0.87);
  if (k < 4.0) return vec3(0.96, 0.72, 0.25);
  if (k < 5.0) return vec3(0.91, 0.34, 0.29);
  return vec3(1.0, 0.98, 0.94);
}
void main() {
  vec2 c = vUv - 0.5;
  float r = length(c);
  // Arrival: the view spirals in from the portal.
  float ang = uWarp * 3.5 * (1.0 - r);
  float cs = cos(ang);
  float sn = sin(ang);
  vec2 w = mat2(cs, -sn, sn, cs) * c * (1.0 - uWarp * 0.6) + 0.5;
  float ab = uAberration + uWarp * 0.02 + uTunnel * 0.01;
  vec3 col;
  col.r = texture2D(tDiffuse, w + c * ab).r;
  col.g = texture2D(tDiffuse, w).g;
  col.b = texture2D(tDiffuse, w - c * ab).b;
  col += vec3(0.6, 0.4, 1.0) * uWarp * (1.0 - r) * 0.8;
  // Bloom must not light up the inside of the black hole. Same warp as the picture.
  vec2 hd = w - uHoleCenter;
  hd.x *= uAspect;
  col *= mix(0.03, 1.0, smoothstep(uHoleRadius * 0.86, uHoleRadius * 1.02, length(hd)));
  // The finale's warp: a tunnel of the drawing's six streak colours.
  if (uTunnel > 0.0) {
    vec2 p = c * vec2(uAspect, 1.0);
    float pr = length(p) + 0.001;
    float pa = atan(p.y, p.x) + uSpin * uTime * 0.6;
    float depth = 0.35 / pr + uTime * 2.4;
    float lane = floor(pa / 6.2831 * 28.0);
    float h = fract(sin(lane * 91.7) * 4375.5);
    float seg = fract(depth * (0.6 + h) + h * 7.0);
    float streak = smoothstep(0.0, 0.05, seg) * smoothstep(0.55, 0.1, seg);
    float thin = smoothstep(0.5, 0.15, abs(fract(pa / 6.2831 * 28.0) - 0.5) * 2.0);
    vec3 t = streakCol(lane + floor(h * 6.0)) * streak * thin * smoothstep(0.02, 0.35, pr) * 2.4;
    t += vec3(1.0, 0.95, 0.85) * exp(-pr * 9.0) * 1.2;
    col = mix(col, t, uTunnel);
  }
  col *= 1.0 - smoothstep(0.45, 0.85, r) * 0.42;
  col = mix(col, uFadeColor, uFade);
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * A cheap iridescent sheen for the standard material on low and medium:
 * the glancing edges shift hue with the view angle, so the crystal never
 * reads as flat navy.
 */
export function fakeIridescence(mat: THREE.MeshStandardMaterial, uniforms: { uTime: { value: number }; uFlare: { value: number } }, strength = 0.7): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uFlare = uniforms.uFlare;
    shader.uniforms.uIrid = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uFlare;\nuniform float uIrid;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float fres = 1.0 - abs(dot(normalize(vViewPosition), normal));
          vec3 irid = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + fres * 1.3 + uTime * 0.03));
          totalEmissiveRadiance += irid * (pow(fres, 3.0) * uIrid + uFlare * 0.08) * vec3(0.32, 0.36, 0.55);
        }`,
      );
  };
  mat.customProgramCacheKey = () => `galaxy-irid-${strength}`;
}
