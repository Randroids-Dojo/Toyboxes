// Shaders for the black hole galaxy. Kept apart from the scene code so the
// look can be tuned without touching gameplay.
//
// Colours are written as display values, then converted to linear at the
// end of each shader, so they look the same drawn straight to the screen
// (low tier) and through the post-processing chain (medium and high).

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

/** A flowing nebula in the visitor's colours, with stars. */
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
varying vec3 vDir;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  vec3 q = d * 2.2 + vec3(0.0, uTime * 0.015, uTime * 0.01);
  float warp = fbm3(q * 1.6 + uTime * 0.02, uOctaves);
  float w = fbm3(q + warp * 1.8, uOctaves);
  vec3 deep = vec3(0.035, 0.02, 0.085);
  vec3 purple = vec3(0.42, 0.22, 0.82);
  vec3 green = vec3(0.14, 0.72, 0.55);
  vec3 blue = vec3(0.22, 0.52, 0.9);
  vec3 gold = vec3(0.96, 0.72, 0.28);
  vec3 col = deep;
  col = mix(col, purple * 0.75, smoothstep(0.38, 0.78, w));
  col = mix(col, blue * 0.6, smoothstep(0.55, 0.85, fbm3(q * 2.1 + 4.0, uOctaves)) * 0.6);
  col = mix(col, green * 0.7, smoothstep(0.62, 0.92, fbm3(q * 1.3 - 2.0, uOctaves)) * 0.55);
  col += gold * pow(smoothstep(0.72, 1.0, w), 3.0) * 0.9;
  // Brighter towards the black hole, which sits ahead and a little up.
  float toward = max(0.0, dot(d, normalize(vec3(0.0, 0.18, -1.0))));
  col += vec3(0.5, 0.3, 0.9) * pow(toward, 12.0) * (0.5 + uFlare);
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
  gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(2.2));
  #include <colorspace_fragment>
}`;

/** The accretion disk: a hot spiral that spins faster near the hole. */
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
uniform float uDetail;
uniform float uFade;
varying vec2 vPos;
${NOISE}
void main() {
  float r = length(vPos);
  float a = atan(vPos.y, vPos.x);
  float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
  float spin = uTime * 9.0 / pow(max(r, 1.0), 1.5);
  float swirl = a + spin + log(r) * 2.6;
  float n = fbm3(vec3(cos(swirl) * 3.0, sin(swirl) * 3.0, r * 0.22 - uTime * 0.05), uDetail);
  float streaks = 0.55 + 0.45 * sin(swirl * 7.0 + n * 6.0);
  vec3 hot = vec3(1.0, 0.95, 0.82);
  vec3 gold = vec3(0.98, 0.7, 0.24);
  vec3 purple = vec3(0.56, 0.32, 0.98);
  vec3 green = vec3(0.18, 0.86, 0.6);
  vec3 col = mix(hot, gold, smoothstep(0.0, 0.22, t));
  col = mix(col, purple, smoothstep(0.22, 0.6, t));
  col = mix(col, green, smoothstep(0.6, 1.0, t));
  float doppler = 1.0 + 0.75 * sin(a + 0.4);
  float bright = pow(1.0 - t, 1.6) * (0.45 + 0.9 * n) * streaks * doppler * (1.0 + uFlare * 2.5);
  float edge = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.7, t);
  gl_FragColor = vec4(col * bright * 1.8, edge * clamp(bright, 0.0, 1.0) * uFade);
  gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(2.2));
  #include <colorspace_fragment>
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
  gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(2.2));
  #include <colorspace_fragment>
}`;

export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** A banded blue world with an atmosphere rim. */
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
  vec3 deep = vec3(0.09, 0.27, 0.62);
  vec3 light = vec3(0.32, 0.66, 0.95);
  vec3 col = mix(deep, light, 0.5 + 0.5 * sin(bands));
  float lit = clamp(dot(vNormal, normalize(uLightDir)) * 0.8 + 0.35, 0.08, 1.2);
  float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 3.0);
  col = col * lit + vec3(0.35, 0.85, 0.75) * rim * 0.9;
  gl_FragColor = vec4(col, 1.0);
  gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(2.2));
  #include <colorspace_fragment>
}`;

export const PLANET_RING_FRAG = /* glsl */ `
uniform float uInner;
uniform float uOuter;
varying vec2 vPos;
void main() {
  float t = clamp((length(vPos) - uInner) / (uOuter - uInner), 0.0, 1.0);
  float bands = 0.55 + 0.45 * sin(t * 48.0) * sin(t * 13.0 + 1.0);
  vec3 col = mix(vec3(0.16, 0.78, 0.55), vec3(0.62, 0.95, 0.72), t) * bands;
  float edge = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.85, t);
  gl_FragColor = vec4(col * 1.3, edge * 0.8);
  gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(2.2));
  #include <colorspace_fragment>
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
  gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(2.2));
  #include <colorspace_fragment>
}`;

/** Drifting motes that swirl slowly around the platform. */
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
  vec3 a = vec3(0.6, 0.4, 1.0);
  vec3 b = vec3(0.3, 1.0, 0.8);
  vec3 g = vec3(1.0, 0.8, 0.4);
  vec3 col = vSeed < 0.33 ? a : vSeed < 0.66 ? b : g;
  float tw = 0.6 + 0.4 * sin(uTime * 2.0 + vSeed * 30.0);
  gl_FragColor = vec4(col * tw, (1.0 - d) * 0.9);
  gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(2.2));
  #include <colorspace_fragment>
}`;

/** Glowing seams along the crystal tiles, pulsing outwards in rings. */
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
varying vec3 vWorld;
void main() {
  float r = length(vWorld.xz);
  float wave = 0.5 + 0.5 * sin(r * 0.9 - uTime * 2.4);
  vec3 a = vec3(0.35, 0.95, 0.85);
  vec3 b = vec3(0.7, 0.4, 1.0);
  vec3 col = mix(a, b, 0.5 + 0.5 * sin(uTime * 0.4 + r * 0.25));
  gl_FragColor = vec4(col * (0.35 + wave * 0.9 + uFlare), 1.0);
  gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(2.2));
  #include <colorspace_fragment>
}`;

/** The energy fence at the platform edge: brighter close to the player. */
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
  float near = smoothstep(4.0, 0.5, distance(vWorld.xz, uPlayer.xz));
  float lines = 0.5 + 0.5 * sin(vUv.y * 40.0 - uTime * 3.0);
  float fade = 1.0 - vUv.y;
  float a = fade * (0.05 + near * 0.55) * (0.6 + lines * 0.4);
  gl_FragColor = vec4(vec3(0.45, 0.9, 1.0), a);
  gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(2.2));
  #include <colorspace_fragment>
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
  gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(2.2));
  #include <colorspace_fragment>
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

/** The finishing pass: the portal fall on arrival, colour fringing and a vignette. */
export const FINAL_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uWarp;
uniform float uAberration;
uniform vec2 uHoleCenter;
uniform float uHoleRadius;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 c = vUv - 0.5;
  float r = length(c);
  // Arrival: the view spirals in from the portal.
  float ang = uWarp * 3.5 * (1.0 - r);
  float cs = cos(ang);
  float sn = sin(ang);
  vec2 w = mat2(cs, -sn, sn, cs) * c * (1.0 - uWarp * 0.6) + 0.5;
  float ab = uAberration + uWarp * 0.02;
  vec3 col;
  col.r = texture2D(tDiffuse, w + c * ab).r;
  col.g = texture2D(tDiffuse, w).g;
  col.b = texture2D(tDiffuse, w - c * ab).b;
  col += vec3(0.6, 0.4, 1.0) * uWarp * (1.0 - r) * 0.8;
  col *= 1.0 - smoothstep(0.45, 0.85, r) * 0.45;
  // Bloom must not light up the inside of the black hole.
  vec2 hd = vUv - uHoleCenter;
  hd.x *= uAspect;
  col *= mix(0.03, 1.0, smoothstep(uHoleRadius * 0.86, uHoleRadius * 1.02, length(hd)));
  gl_FragColor = vec4(col, 1.0);
}`;
