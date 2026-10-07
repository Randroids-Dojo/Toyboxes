// Club Nova's static station: the atrium deck around the Nova floor, the
// dock and exit portal, the DJ booth and the big sign, the judges' desk, the
// crowd balconies, the Blade Ring, the Glow Lab and the Comet Yard shell.
// Static parts are merged by material; floors abut along seams covered by
// raised trim, and overlays are drawn inside the floor shaders, so no two
// surfaces share a plane.

import * as THREE from 'three';
import { box, circle, type Collider } from '../../world/physics';
import type { Tier } from '../../world/space';
import { AIRLOCK_HALF, ARENA, BASES, BASE_R, POWER_PADS, WALL_H } from '../../shared/neon/arena';
import { FLOOR_R } from './floor';
import { Batch, C, barGlowTexture, canvasTexture, floorFrom, HEX, neon, neonTextTexture, OUTPUT_CHUNK, ring } from './util';
import { DISPLAY_FONT } from '../../world/kit';

export const ATRIUM_R = 15;
export const RING = { x: -27, z: 0, r: 7 };
export const LAB = { x0: 20, x1: 34, z0: -8, z1: 8 };
export const DOCK = { x0: -5, x1: 5, z0: 14, z1: 26 };
export const PORTAL = { x: 0, z: 25.2, y: 2.0, r: 1.6 };
export const DOOR = { x: 0, z: 24.4 };
export const STAR_PAD = { x: 0, z: 8.5 };
export const BOOTH = { x: 0, z: -10 };
export const ORBIT_SPOT = { x: 0, z: -11.2 };
export const JUDGES = { x: 6.8, z: 6.2 };
export const DUEL_SPOT = { x: -25.6, z: 0 };
export const DUELIST_SPOT = { x: -28.4, z: 0 };
export const DUEL_TERMINAL = { x: -21.5, z: 2.6 };
export const TAG_TERMINAL = { x: 2.6, z: -14 };
export const WARDROBE = { x: 26.5, z: -5 };
export const JUKEBOX = { x: 23, z: 6.2 };
export const BOARDS = [-4.6, 0, 4.6].map((z) => ({ x: 33.7, z }));
export const PEDESTALS = [130, 155, 180, 205, 230].map((d) => {
  const a = (d * Math.PI) / 180;
  return { x: RING.x + Math.cos(a) * 5.8, z: RING.z + Math.sin(a) * 5.8, yaw: Math.atan2(RING.x - (RING.x + Math.cos(a) * 5.8), RING.z - (RING.z + Math.sin(a) * 5.8)) };
});

const SEG = 96;

// ---------------------------------------------------------------------------
// Floor shaders

const DECK_FRAG = /* glsl */ `
uniform vec3 uBase, uLine, uGlow;
uniform float uBeat, uTime;
varying vec2 vP;
float hexLine(vec2 p) {
  vec2 s = vec2(1.0, 1.7320508);
  vec2 a = mod(p, s) - s * 0.5;
  vec2 b = mod(p - s * 0.5, s) - s * 0.5;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 q = abs(g);
  float d = max(dot(q, s * 0.5), q.x);
  return smoothstep(0.47, 0.5, d);
}
void main() {
  float r = length(vP);
  vec3 col = uBase * (1.0 + 0.4 * smoothstep(16.0, 6.0, r));
  float hx = hexLine(vP * 1.7);
  col += uLine * hx * 0.1 * (0.6 + 0.4 * smoothstep(15.0, 7.0, r));
  // A slow ripple out from the Nova floor on each beat.
  float ph = fract(uBeat);
  float wave = 6.5 + ph * 9.0;
  col += uGlow * hx * exp(-pow((r - wave) * 1.2, 2.0)) * (1.0 - ph) * 0.6 * step(r, 15.2);
  // The Core's light on the deck.
  col += uGlow * 0.12 * smoothstep(13.0, 4.0, r);
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}`;

const ARENA_FRAG = /* glsl */ `
uniform vec3 uCyan, uPink, uLine, uGold;
uniform float uBeat, uTime, uPads;
uniform vec4 uBases;
uniform vec4 uPowers;
varying vec2 vP;
float grid(vec2 p, float w) {
  vec2 g = abs(fract(p) - 0.5);
  return smoothstep(0.5 - w, 0.5, max(g.x, g.y));
}
void main() {
  vec2 p = vP;
  float side = smoothstep(-36.5, -33.5, p.y);
  vec3 tint = mix(uPink, uCyan, side);
  vec3 col = vec3(0.03, 0.02, 0.075) + tint * 0.02;
  float g1 = grid(p * 0.5, 0.025);
  float g2 = grid(p * 2.0, 0.03) * 0.25;
  float ph = fract(uBeat);
  float chase = exp(-pow((fract(p.y * 0.05 - uBeat * 0.25) - 0.5) * 6.0, 2.0));
  col += tint * (g1 * (0.16 + chase * 0.22) + g2 * 0.12);
  // Half-way line.
  col += uLine * smoothstep(0.06, 0.0, abs(p.y + 35.0)) * 0.8;
  // Base pads.
  for (int i = 0; i < 2; i++) {
    vec2 c = i == 0 ? uBases.xy : uBases.zw;
    vec3 tc = i == 0 ? uCyan : uPink;
    float d = length(p - c);
    float ringA = smoothstep(0.08, 0.0, abs(d - ${BASE_R.toFixed(2)})) + smoothstep(0.05, 0.0, abs(d - ${(BASE_R - 0.5).toFixed(2)})) * 0.5;
    float fill = smoothstep(${BASE_R.toFixed(2)}, 0.0, d) * 0.18;
    float pulse = 0.7 + 0.3 * exp(-ph * 4.0);
    col += tc * (ringA * 1.1 + fill) * pulse;
  }
  // Power-up pads.
  for (int i = 0; i < 2; i++) {
    vec2 c = i == 0 ? uPowers.xy : uPowers.zw;
    float d = length(p - c);
    col += uGold * (smoothstep(0.06, 0.0, abs(d - 0.8)) * 1.4 + smoothstep(0.8, 0.0, d) * 0.15 * uPads);
  }
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}`;

const RING_FRAG = /* glsl */ `
uniform vec3 uViolet, uPink, uCyan;
uniform float uBeat, uTime, uFight;
uniform vec2 uC;
varying vec2 vP;
void main() {
  vec2 p = vP - uC;
  float r = length(p);
  float a = atan(p.y, p.x);
  vec3 col = vec3(0.04, 0.025, 0.1) * (1.0 + smoothstep(7.0, 0.0, r) * 0.6);
  float ring45 = smoothstep(0.07, 0.0, abs(r - 4.5));
  float ring2 = smoothstep(0.04, 0.0, abs(r - 2.0));
  float hex = smoothstep(0.92, 1.0, abs(sin(a * 6.0))) * smoothstep(4.5, 4.0, r) * smoothstep(1.0, 2.0, r) * 0.25;
  float ph = fract(uBeat);
  col += uViolet * (ring45 * (1.2 + exp(-ph * 4.0) * 0.8) + ring2 * 0.6 + hex);
  // The duel line between the two spots.
  col += mix(uCyan, uPink, step(0.0, -p.x)) * smoothstep(0.05, 0.0, abs(p.y)) * smoothstep(3.0, 0.5, abs(p.x)) * (0.3 + uFight * 0.9);
  col += uViolet * smoothstep(0.1, 0.0, abs(r - 6.85)) * 0.8;
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}`;

const PLAIN_VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const PORTAL_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uA, uB;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float a = atan(p.y, p.x);
  float sw = sin(a * 5.0 + r * 9.0 - uTime * 3.0) * 0.5 + 0.5;
  vec3 col = mix(uA, uB, sw) * (1.2 - r) * 1.6 + vec3(1.0) * smoothstep(0.25, 0.0, r) * 0.8;
  float alpha = smoothstep(1.0, 0.85, r);
  gl_FragColor = vec4(col * alpha, alpha);
  ${OUTPUT_CHUNK}
}`;

export interface StationParts {
  colliders: Collider[];
  /** Things that animate every frame. */
  deckMat: THREE.ShaderMaterial;
  arenaMat: THREE.ShaderMaterial;
  ringMat: THREE.ShaderMaterial;
  portalMat: THREE.ShaderMaterial;
  eq: THREE.InstancedMesh;
  halos: THREE.Mesh[];
  signs: { mesh: THREE.Mesh; base: number; flicker: number }[];
  starPad: THREE.Mesh;
  airlockDoors: THREE.Mesh[];
  lasers: THREE.Group;
  boardMeshes: THREE.Mesh[];
  jukeboxScreen: THREE.Mesh;
  mirrorMat: THREE.MeshStandardMaterial;
  holos: THREE.Object3D[];
}

/** Edge-lit glossy panel colour. */
function panelMat(color = C.wall, rough = 0.35, metal = 0.3): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

/** The atrium deck outline: circle r15 joined to the dock, the airlock and both bridges. */
function deckOutline(): [number, number][] {
  const pts: [number, number][] = [];
  const R = ATRIUM_R;
  const n = 192;
  const zE = Math.sqrt(R * R - 9);
  const zS = Math.sqrt(R * R - 25);
  const zN = Math.sqrt(R * R - AIRLOCK_HALF * AIRLOCK_HALF);
  // Ring of the Blade Ring floor where the west bridge meets it.
  const ringX = RING.x + Math.sqrt(RING.r * RING.r - 9);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * R;
    const z = Math.sin(a) * R;
    if (x > 0 && Math.abs(z) < 3) continue;
    if (z > 0 && Math.abs(x) < 5) continue;
    if (x < 0 && Math.abs(z) < 3) continue;
    if (z < 0 && Math.abs(x) < AIRLOCK_HALF) continue;
    pts.push([x, z]);
  }
  // Rebuild in order with the protrusions inserted by angle.
  const out: [number, number][] = [];
  const sorted = pts.map((p) => ({ p, a: Math.atan2(p[1], p[0]) < 0 ? Math.atan2(p[1], p[0]) + Math.PI * 2 : Math.atan2(p[1], p[0]) }));
  const arc = (a0: number, a1: number) => sorted.filter((s) => s.a > a0 && s.a < a1).sort((x, y) => x.a - y.a).map((s) => s.p);
  const aE = Math.atan2(3, zE);
  const aS0 = Math.atan2(zS, 5);
  const aS1 = Math.atan2(zS, -5);
  const aW0 = Math.atan2(3, -zE);
  const aW1 = Math.atan2(-3, -zE) + Math.PI * 2;
  const aN0 = Math.atan2(-zN, -AIRLOCK_HALF) + Math.PI * 2;
  const aN1 = Math.atan2(-zN, AIRLOCK_HALF) + Math.PI * 2;
  // East bridge (going from z -3 to z 3 along x = 20).
  out.push([zE, -3], [20, -3], [20, 3], [zE, 3]);
  out.push(...arc(aE, aS0));
  out.push([5, zS], [5, DOCK.z1], [-5, DOCK.z1], [-5, zS]);
  out.push(...arc(aS1, aW0));
  // West bridge: out to the Blade Ring, following its edge.
  out.push([-zE, 3], [ringX, 3]);
  const ra0 = Math.atan2(3, ringX - RING.x);
  for (let k = 1; k < 12; k++) {
    const a = ra0 - (k / 12) * ra0 * 2;
    out.push([RING.x + Math.cos(a) * RING.r, RING.z + Math.sin(a) * RING.r]);
  }
  out.push([ringX, -3], [-zE, -3]);
  out.push(...arc(aW1, aN0));
  out.push([-AIRLOCK_HALF, -zN], [-AIRLOCK_HALF, ARENA.z1], [AIRLOCK_HALF, ARENA.z1], [AIRLOCK_HALF, -zN]);
  out.push(...arc(aN1, Math.PI * 2 - aE + 1e-9));
  return out;
}

export function buildStation(scene: THREE.Scene, ownerName: string): StationParts {
  const colliders: Collider[] = [];
  const halos: THREE.Mesh[] = [];
  const signs: StationParts['signs'] = [];
  const S = new Batch();
  const G = new Batch();

  const wallMat = panelMat(C.wall, 0.4, 0.25);
  const darkMat = panelMat(0x0d0826, 0.3, 0.4);
  const panelM = panelMat(C.panel, 0.38, 0.3);
  const glass = new THREE.MeshStandardMaterial({ color: 0x8a7cff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  const neonViolet = neon(C.violet, 2.4);
  const neonPink = neon(C.pink, 2.2);
  const neonCyan = neon(C.cyan, 2.0);
  const neonGold = neon(C.gold, 2.0);
  const neonLilac = neon(C.lilac, 2.0);

  // Halo cards behind neon strips: fake glow on the low tier (no bloom).
  const haloMat = (color: number) => new THREE.MeshBasicMaterial({ map: barGlowTexture(), color: new THREE.Color(color).multiplyScalar(0.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const haloBatch = new Map<number, Batch>();
  const halo = (color: number, w: number, h: number, x: number, y: number, z: number, ry = 0, rx = 0) => {
    let b = haloBatch.get(color);
    if (!b) haloBatch.set(color, (b = new Batch()));
    b.add(new THREE.PlaneGeometry(w, h), haloMat(color), x, y, z, rx, ry, 0);
  };

  // ---- floors

  const deckMat = new THREE.ShaderMaterial({
    vertexShader: PLAIN_VERT,
    fragmentShader: DECK_FRAG,
    uniforms: { uBase: { value: new THREE.Color(0x120b2e) }, uLine: { value: new THREE.Color(C.violet) }, uGlow: { value: new THREE.Color(C.uv) }, uBeat: { value: 0 }, uTime: { value: 0 } },
  });
  scene.add(floorFrom(deckOutline(), [ring(0, 0, FLOOR_R, SEG)], 0, deckMat));

  const arenaMat = new THREE.ShaderMaterial({
    vertexShader: PLAIN_VERT,
    fragmentShader: ARENA_FRAG,
    uniforms: {
      uCyan: { value: new THREE.Color(C.cyan) },
      uPink: { value: new THREE.Color(C.pink) },
      uLine: { value: new THREE.Color(C.lilac) },
      uGold: { value: new THREE.Color(C.gold) },
      uBeat: { value: 0 },
      uTime: { value: 0 },
      uPads: { value: 0 },
      uBases: { value: new THREE.Vector4(BASES.cyan.x, BASES.cyan.z, BASES.magenta.x, BASES.magenta.z) },
      uPowers: { value: new THREE.Vector4(POWER_PADS[0].x, POWER_PADS[0].z, POWER_PADS[1].x, POWER_PADS[1].z) },
    },
  });
  scene.add(
    floorFrom(
      [
        [ARENA.x0, ARENA.z0],
        [ARENA.x1, ARENA.z0],
        [ARENA.x1, ARENA.z1],
        [ARENA.x0, ARENA.z1],
      ],
      [],
      0,
      arenaMat,
    ),
  );

  const ringMat = new THREE.ShaderMaterial({
    vertexShader: PLAIN_VERT,
    fragmentShader: RING_FRAG,
    uniforms: { uViolet: { value: new THREE.Color(C.violet) }, uPink: { value: new THREE.Color(C.pink) }, uCyan: { value: new THREE.Color(C.cyan) }, uBeat: { value: 0 }, uTime: { value: 0 }, uFight: { value: 0 }, uC: { value: new THREE.Vector2(RING.x, RING.z) } },
  });
  // The Blade Ring disc, minus the sliver the bridge floor already covers.
  const ringX = RING.x + Math.sqrt(RING.r * RING.r - 9);
  const ringPts: [number, number][] = [];
  const ra0 = Math.atan2(3, ringX - RING.x);
  for (let k = 0; k <= 72; k++) {
    const a = ra0 + (k / 72) * (Math.PI * 2 - ra0 * 2);
    ringPts.push([RING.x + Math.cos(a) * RING.r, RING.z + Math.sin(a) * RING.r]);
  }
  scene.add(floorFrom(ringPts, [], 0, ringMat));

  const labTex = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#1a1040';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#231650';
    g.fillRect(0, 0, 128, 128);
    g.fillRect(128, 128, 128, 128);
    g.strokeStyle = 'rgba(180,156,255,0.35)';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, 253, 253);
  });
  labTex.wrapS = labTex.wrapT = THREE.RepeatWrapping;
  labTex.repeat.set(0.5, 0.5);
  scene.add(
    floorFrom(
      [
        [LAB.x0, LAB.z0],
        [LAB.x1, LAB.z0],
        [LAB.x1, LAB.z1],
        [LAB.x0, LAB.z1],
      ],
      [],
      0,
      new THREE.MeshStandardMaterial({ map: labTex, emissiveMap: labTex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.22, metalness: 0.3 }),
    ),
  );

  // Seam trims: raised strips over the joins between floors.
  S.add(new THREE.BoxGeometry(2 * AIRLOCK_HALF + 0.2, 0.02, 0.24), neonViolet, 0, 0.01, ARENA.z1);
  S.add(new THREE.BoxGeometry(0.24, 0.02, 6.2), neonGold, LAB.x0, 0.01, 0);

  // ---- atrium: rail ring with gaps for the spokes, glass and a neon top rail

  const railGaps = [
    { a: 0, half: Math.asin(3.2 / 15.2) },
    { a: Math.PI / 2, half: Math.asin(5.2 / 15.2) },
    { a: Math.PI, half: Math.asin(3.2 / 15.2) },
    { a: Math.PI * 1.5, half: Math.asin((AIRLOCK_HALF + 0.2) / 15.2) },
  ];
  const RR = 15.2;
  for (let q = 0; q < 4; q++) {
    const a0 = railGaps[q].a + railGaps[q].half;
    const a1 = railGaps[(q + 1) % 4].a + (q === 3 ? Math.PI * 2 : 0) - railGaps[(q + 1) % 4].half;
    const span = a1 - a0;
    // Glass (a curved open cylinder slice) and the neon rail on top.
    const gl = new THREE.CylinderGeometry(RR, RR, 1.0, 48, 1, true, Math.PI / 2 - a1, span);
    S.add(gl, glass, 0, 0.55, 0);
    const curve = new THREE.EllipseCurve(0, 0, RR, RR, a0, a1, false, 0);
    const pts3 = curve.getPoints(48).map((p) => new THREE.Vector3(p.x, 1.1, p.y));
    S.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3), 64, 0.045, 6, false), neonViolet, 0, 0, 0);
    // Posts and their colliders.
    const posts = Math.max(2, Math.round(span / 0.21));
    for (let k = 0; k <= posts; k++) {
      const a = a0 + (k / posts) * span;
      const x = Math.cos(a) * RR;
      const z = Math.sin(a) * RR;
      S.add(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 8), darkMat, x, 0.55, z);
      if (k < posts) {
        const am = a0 + ((k + 0.5) / posts) * span;
        const len = 2 * RR * Math.sin(span / posts / 2) + 0.1;
        colliders.push(box(Math.cos(am) * RR, Math.sin(am) * RR, len / 2, 0.12, -am + Math.PI / 2, 1.1, 0.5, false));
      }
    }
    // Crowd balconies beyond the rail: two tiers with lit edges.
    const tiers = [
      { r0: 15.5, r1: 17.9, y: 0.5 },
      { r0: 17.9, r1: 20.4, y: 1.1 },
    ];
    for (const t of tiers) {
      const shape = new THREE.Shape();
      const outer = new THREE.EllipseCurve(0, 0, t.r1, t.r1, a0 + 0.02, a1 - 0.02, false, 0).getPoints(40);
      const inner = new THREE.EllipseCurve(0, 0, t.r0, t.r0, a1 - 0.02, a0 + 0.02, true, 0).getPoints(40);
      shape.setFromPoints([...outer, ...inner].map((p) => new THREE.Vector2(p.x, -p.y)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: t.y, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      S.add(geo, panelM, 0, 0, 0);
      const edge = new THREE.EllipseCurve(0, 0, t.r0 + 0.02, t.r0 + 0.02, a0 + 0.03, a1 - 0.03, false, 0).getPoints(40).map((p) => new THREE.Vector3(p.x, t.y + 0.012, p.y));
      S.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 48, 0.03, 5, false), q % 2 ? neonPink : neonCyan, 0, 0, 0);
    }
    // The outer wall behind the balconies.
    const wall = new THREE.CylinderGeometry(21, 21, 4.2, 48, 1, true, Math.PI / 2 - a1 + 0.01, span - 0.02);
    S.add(wall, wallMat, 0, 2.1, 0);
    const strip = new THREE.EllipseCurve(0, 0, 20.93, 20.93, a0 + 0.02, a1 - 0.02, false, 0).getPoints(40).map((p) => new THREE.Vector3(p.x, 3.7, p.y));
    S.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strip), 48, 0.05, 5, false), neonLilac, 0, 0, 0);
  }

  // Tall light pylons on the outer wall, between balconies.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a) * 20.6;
    const z = Math.sin(a) * 20.6;
    S.add(new THREE.BoxGeometry(0.6, 7, 0.6), darkMat, x, 3.5, z, 0, -a, 0);
    G.add(new THREE.BoxGeometry(0.12, 6.4, 0.12), k % 2 ? neonPink : neonCyan, x - Math.cos(a) * 0.3, 3.6, z - Math.sin(a) * 0.3, 0, -a, 0);
    halo(k % 2 ? C.pink : C.cyan, 1.2, 6.4, x - Math.cos(a) * 0.4, 3.6, z - Math.sin(a) * 0.4, -a + Math.PI / 2, 0);
  }

  // ---- dock and exit portal

  for (const side of [-1, 1]) {
    const x = side * (DOCK.x1 + 0.2);
    const zA = Math.sqrt(ATRIUM_R * ATRIUM_R - 25) + 0.3;
    const len = DOCK.z1 - zA;
    S.add(new THREE.BoxGeometry(0.12, 1.0, len), glass, x, 0.55, zA + len / 2);
    G.add(new THREE.BoxGeometry(0.09, 0.09, len), neonViolet, x, 1.1, zA + len / 2);
    colliders.push(box(x, zA + len / 2, 0.12, len / 2, 0, 1.1, 0.5, false));
    halo(C.violet, len, 0.5, x, 1.1, zA + len / 2, Math.PI / 2, 0);
  }
  S.add(new THREE.BoxGeometry(10.6, 1.0, 0.12), glass, 0, 0.55, DOCK.z1 + 0.2);
  G.add(new THREE.BoxGeometry(10.6, 0.09, 0.09), neonViolet, 0, 1.1, DOCK.z1 + 0.2);
  colliders.push(box(0, DOCK.z1 + 0.2, 5.3, 0.12, 0, 1.1, 0.5, false));
  // Portal ring on its plinth.
  const portalRing = new THREE.TorusGeometry(PORTAL.r, 0.16, 12, 64);
  G.add(portalRing, neonLilac, PORTAL.x, PORTAL.y, PORTAL.z);
  S.add(new THREE.TorusGeometry(PORTAL.r + 0.22, 0.1, 8, 64), darkMat, PORTAL.x, PORTAL.y, PORTAL.z);
  S.add(new THREE.CylinderGeometry(1.0, 1.25, 0.3, 24), darkMat, PORTAL.x, 0.15, PORTAL.z);
  colliders.push(circle(PORTAL.x, PORTAL.z, 1.0, 0.3, 0.5, false));
  const portalMat = new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: PORTAL_FRAG,
    uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(C.uv) }, uB: { value: new THREE.Color(C.pink) } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const portalDisc = new THREE.Mesh(new THREE.CircleGeometry(PORTAL.r - 0.1, 48), portalMat);
  portalDisc.position.set(PORTAL.x, PORTAL.y, PORTAL.z);
  scene.add(portalDisc);
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: neonTextTexture('Exit', { w: 512, h: 128, color: HEX.lilac }), transparent: true, depthWrite: false }));
  exitSign.position.set(PORTAL.x, PORTAL.y + PORTAL.r + 0.75, PORTAL.z);
  exitSign.rotation.y = Math.PI;
  scene.add(exitSign);

  // ---- star pad (start a party night)

  const starTex = canvasTexture(256, 256, (g) => {
    g.translate(128, 128);
    const grad = g.createRadialGradient(0, 0, 10, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,240,200,0.9)');
    grad.addColorStop(0.6, 'rgba(255,201,60,0.35)');
    grad.addColorStop(1, 'rgba(255,201,60,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, 128, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 100 : 42;
      if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = 'rgba(255,224,130,1)';
    g.shadowColor = '#ffc93c';
    g.shadowBlur = 24;
    g.fill();
  });
  const starPad = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.08, 40), [
    new THREE.MeshStandardMaterial({ color: 0x2a1a4a, roughness: 0.3, metalness: 0.4 }),
    new THREE.MeshBasicMaterial({ map: starTex, color: 0xffffff }),
    new THREE.MeshStandardMaterial({ color: 0x2a1a4a }),
  ]);
  starPad.position.set(STAR_PAD.x, 0.04, STAR_PAD.z);
  scene.add(starPad);
  G.add(new THREE.TorusGeometry(1.32, 0.035, 6, 48), neonGold, STAR_PAD.x, 0.085, STAR_PAD.z, Math.PI / 2);

  // ---- DJ booth (an arc desk) and its equaliser

  const boothCurve = (r: number) => new THREE.EllipseCurve(BOOTH.x, BOOTH.z - 4, r, r, Math.PI * 0.32, Math.PI * 0.68, false, 0);
  {
    const outer = boothCurve(4.6).getPoints(24);
    const inner = boothCurve(3.5).getPoints(24).reverse();
    const shape = new THREE.Shape([...outer, ...inner].map((p) => new THREE.Vector2(p.x, -p.y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.15, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
    geo.rotateX(-Math.PI / 2);
    S.add(geo, panelM, 0, 0, 0);
    const top = boothCurve(4.62).getPoints(24).map((p) => new THREE.Vector3(p.x, 1.2, p.y));
    S.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(top), 32, 0.04, 6, false), neonPink, 0, 0, 0);
    const pts = boothCurve(4.05).getPoints(3);
    for (let k = 0; k < 3; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      const cx = (a.x + b.x) / 2;
      const cz = (a.y + b.y) / 2;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      colliders.push(box(cx, cz, len / 2 + 0.1, 0.65, -Math.atan2(b.y - a.y, b.x - a.x), 1.15, 0.3, false));
    }
    // Turntables on top.
    for (const dx of [-1.1, 1.1]) {
      S.add(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 32), darkMat, BOOTH.x + dx, 1.22, BOOTH.z + 0.3);
      G.add(new THREE.TorusGeometry(0.42, 0.015, 4, 32), neonCyan, BOOTH.x + dx, 1.255, BOOTH.z + 0.3, Math.PI / 2);
    }
  }
  const eq = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1, 0.05), neon(C.cyan, 1.8), 24);
  {
    const m = new THREE.Matrix4();
    const front = boothCurve(4.66);
    for (let i = 0; i < 24; i++) {
      const p = front.getPoint(0.06 + (i / 23) * 0.88);
      const a = Math.atan2(p.y - (BOOTH.z - 4), p.x - BOOTH.x);
      m.compose(new THREE.Vector3(p.x, 0.5, p.y), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2), new THREE.Vector3(1, 0.5, 1));
      eq.setMatrixAt(i, m);
      eq.setColorAt(i, new THREE.Color(i % 3 === 0 ? C.pink : i % 3 === 1 ? C.violet : C.cyan));
    }
    eq.userData.base = Array.from({ length: 24 }, (_, i) => {
      const p = front.getPoint(0.06 + (i / 23) * 0.88);
      return { x: p.x, z: p.y, a: Math.atan2(p.y - (BOOTH.z - 4), p.x - BOOTH.x) };
    });
    scene.add(eq);
  }

  // ---- the big sign: "Club Nova", owner presents

  {
    const tex = neonTextTexture('Club Nova', { w: 1024, h: 256, color: '#c9b4ff', size: 150, sub: `${ownerName} presents`.slice(0, 32), subColor: HEX.pink });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.75), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(1.4, 1.4, 1.4) }));
    sign.position.set(0, 5.8, -12.2);
    scene.add(sign);
    signs.push({ mesh: sign, base: 1.4, flicker: 0 });
    // Backing frame and pylons.
    S.add(new THREE.BoxGeometry(11.6, 0.14, 0.2), darkMat, 0, 4.35, -12.35);
    S.add(new THREE.BoxGeometry(11.6, 0.14, 0.2), darkMat, 0, 7.25, -12.35);
    G.add(new THREE.BoxGeometry(11.6, 0.05, 0.05), neonViolet, 0, 4.43, -12.22);
    G.add(new THREE.BoxGeometry(11.6, 0.05, 0.05), neonViolet, 0, 7.17, -12.22);
    for (const x of [-5.4, 5.4]) {
      S.add(new THREE.CylinderGeometry(0.22, 0.3, 7.3, 12), darkMat, x, 3.65, -12.35);
      G.add(new THREE.BoxGeometry(0.06, 6.6, 0.06), neonPink, x, 3.4, -12.08);
      colliders.push(circle(x, -12.35, 0.32, 7.3, 0.5, false));
    }
  }

  // ---- judges' desk

  {
    const ang = Math.atan2(-JUDGES.x, -JUDGES.z);
    S.add(roundedDesk(3.6, 1.1, 1.0), panelM, JUDGES.x, 0, JUDGES.z, 0, ang, 0);
    const fx = JUDGES.x + Math.sin(ang) * 0.52;
    const fz = JUDGES.z + Math.cos(ang) * 0.52;
    G.add(new THREE.BoxGeometry(3.5, 0.06, 0.04), neonGold, fx, 1.0, fz, 0, ang, 0);
    G.add(new THREE.BoxGeometry(3.5, 0.06, 0.04), neonGold, fx, 0.15, fz, 0, ang, 0);
    colliders.push(box(JUDGES.x, JUDGES.z, 1.8, 0.5, ang, 1.1, 0.3, false));
    const label = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.5), new THREE.MeshBasicMaterial({ map: neonTextTexture('Judges', { w: 512, h: 96, color: HEX.gold, size: 64 }), transparent: true, depthWrite: false }));
    label.position.set(fx + Math.sin(ang) * 0.03, 0.58, fz + Math.cos(ang) * 0.03);
    label.rotation.y = ang;
    scene.add(label);
  }

  // ---- airlock to Comet Yard

  const airlockDoors: THREE.Mesh[] = [];
  {
    const zN = Math.sqrt(ATRIUM_R * ATRIUM_R - AIRLOCK_HALF * AIRLOCK_HALF);
    const len = zN - Math.abs(ARENA.z1) + 0.0;
    const mid = -(zN + Math.abs(ARENA.z1)) / 2;
    for (const side of [-1, 1]) {
      const x = side * (AIRLOCK_HALF + 0.2);
      S.add(new THREE.BoxGeometry(0.4, 3.2, Math.abs(len)), wallMat, x, 1.6, mid);
      G.add(new THREE.BoxGeometry(0.05, 0.08, Math.abs(len)), neonCyan, x - side * 0.215, 2.7, mid);
      G.add(new THREE.BoxGeometry(0.05, 0.08, Math.abs(len)), neonCyan, x - side * 0.215, 0.3, mid);
      colliders.push(box(x, mid, 0.2, Math.abs(len) / 2, 0, 3.2, 0.5, true));
    }
    // Gate frame at the arena wall with a light curtain.
    // The gate's top bar sits high, above where the follow camera passes.
    S.add(new THREE.BoxGeometry(2 * AIRLOCK_HALF + 0.8, 0.4, 0.6), wallMat, 0, 4.8, ARENA.z1 - 0.3);
    for (const side of [-1, 1]) S.add(new THREE.BoxGeometry(0.4, 4.6, 0.6), wallMat, side * (AIRLOCK_HALF + 0.2), 2.3, ARENA.z1 - 0.3);
    G.add(new THREE.BoxGeometry(2 * AIRLOCK_HALF, 0.07, 0.07), neonCyan, 0, 4.58, ARENA.z1 - 0.62);
    const curtain = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(C.cyan) }, uFade: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime, uFade; uniform vec3 uColor; varying vec2 vUv;
        void main(){
          float lines = pow(abs(sin(vUv.x * 60.0)), 18.0) * 0.5 + pow(abs(sin(vUv.y * 40.0 - uTime * 3.0)), 30.0) * 0.35;
          float edge = smoothstep(0.08, 0.0, min(vUv.x, 1.0 - vUv.x)) + smoothstep(0.05, 0.0, 1.0 - vUv.y);
          float a = (lines * 0.18 + edge * 0.5 + 0.03) * uFade;
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
    });
    for (const side of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(AIRLOCK_HALF, 3.0), curtain);
      door.position.set((side * AIRLOCK_HALF) / 2, 1.5, ARENA.z1 - 0.62);
      door.userData.side = side;
      scene.add(door);
      airlockDoors.push(door);
    }
    const yardSign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.3), new THREE.MeshBasicMaterial({ map: neonTextTexture('Comet Yard', { w: 1024, h: 220, color: HEX.cyan, size: 120, sub: 'Laser tag', subColor: HEX.white }), transparent: true, depthWrite: false }));
    yardSign.position.set(0, 5.75, ARENA.z1 - 0.3);
    scene.add(yardSign);
    signs.push({ mesh: yardSign, base: 1, flicker: 0 });
  }

  // ---- Comet Yard shell

  {
    const W = ARENA.x1 - ARENA.x0;
    const D = ARENA.z1 - ARENA.z0;
    const t = 0.6;
    const walls: [number, number, number, number][] = [
      [ARENA.x0 - t / 2, (ARENA.z0 + ARENA.z1) / 2, t, D + 2 * t],
      [ARENA.x1 + t / 2, (ARENA.z0 + ARENA.z1) / 2, t, D + 2 * t],
      [0, ARENA.z0 - t / 2, W, t],
    ];
    for (const [x, z, w, d] of walls) {
      S.add(new THREE.BoxGeometry(w, WALL_H, d), wallMat, x, WALL_H / 2, z);
      colliders.push(box(x, z, w / 2, d / 2, 0, WALL_H, 0.5, true));
    }
    // South wall, either side of the airlock: solid below, glass above.
    for (const side of [-1, 1]) {
      const x0 = AIRLOCK_HALF + 0.4;
      const w = ARENA.x1 + t - x0;
      const x = side * (x0 + w / 2);
      S.add(new THREE.BoxGeometry(w, 1.2, t), wallMat, x, 0.6, ARENA.z1 + t / 2);
      S.add(new THREE.BoxGeometry(w, WALL_H - 1.2, 0.1), glass, x, 1.2 + (WALL_H - 1.2) / 2, ARENA.z1 + t / 2);
      G.add(new THREE.BoxGeometry(w, 0.06, 0.06), neonPink, x, 1.24, ARENA.z1 + t + 0.02);
      colliders.push(box(x, ARENA.z1 + t / 2, w / 2, t / 2, 0, WALL_H, 0.5, true));
    }
    // Light strips along the inner walls, cyan in our half and pink in theirs.
    for (const side of [-1, 1]) {
      const x = side * (ARENA.x1 - 0.02);
      G.add(new THREE.BoxGeometry(0.04, 0.08, 14.6), neonCyan, x, 2.2, -27.5);
      G.add(new THREE.BoxGeometry(0.04, 0.08, 14.6), neonPink, x, 2.2, -42.5);
      G.add(new THREE.BoxGeometry(0.04, 0.05, 14.6), neonCyan, x, 0.25, -27.5);
      G.add(new THREE.BoxGeometry(0.04, 0.05, 14.6), neonPink, x, 0.25, -42.5);
      halo(C.cyan, 14.6, 0.6, x - side * 0.05, 2.2, -27.5, Math.PI / 2);
      halo(C.pink, 14.6, 0.6, x - side * 0.05, 2.2, -42.5, Math.PI / 2);
    }
    G.add(new THREE.BoxGeometry(W, 0.08, 0.04), neonPink, 0, 2.2, ARENA.z0 + 0.02);
    // Scoreboards above each base (painted by tag.ts).
  }

  // ---- west bridge and the Blade Ring

  for (const side of [-1, 1]) {
    const z = side * 3.2;
    const x0 = -Math.sqrt(ATRIUM_R * ATRIUM_R - 9) - 0.3;
    const x1 = RING.x + Math.sqrt(RING.r * RING.r - 10.24) + 0.25;
    const len = x0 - x1;
    S.add(new THREE.BoxGeometry(len, 1.0, 0.12), glass, (x0 + x1) / 2, 0.55, z);
    G.add(new THREE.BoxGeometry(len, 0.08, 0.08), neonViolet, (x0 + x1) / 2, 1.1, z);
    colliders.push(box((x0 + x1) / 2, z, len / 2, 0.12, 0, 1.1, 0.5, false));
  }
  {
    // Rail around the ring except the bridge gap.
    const gap = Math.asin(3.3 / 7.3);
    const curve = new THREE.EllipseCurve(RING.x, RING.z, 7.3, 7.3, gap, Math.PI * 2 - gap, false, 0);
    const pts = curve.getPoints(64);
    S.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, 1.1, p.y))), 96, 0.05, 6, false), neonViolet, 0, 0, 0);
    S.add(new THREE.CylinderGeometry(7.3, 7.3, 1.0, 64, 1, true, Math.PI / 2 - (Math.PI * 2 - gap), Math.PI * 2 - gap * 2), glass, RING.x, 0.55, RING.z);
    for (let k = 0; k < 32; k++) {
      const a = gap + ((k + 0.5) / 32) * (Math.PI * 2 - gap * 2);
      const len = 2 * 7.3 * Math.sin((Math.PI * 2 - gap * 2) / 64) + 0.1;
      colliders.push(box(RING.x + Math.cos(a) * 7.3, RING.z + Math.sin(a) * 7.3, len / 2, 0.12, -a + Math.PI / 2, 1.1, 0.5, false));
    }
    // The hex light arch over the bridge.
    const archX = -20.2;
    const arch = new THREE.TorusGeometry(3.6, 0.09, 6, 6, Math.PI);
    G.add(arch, neonViolet, archX, 0, 0, 0, Math.PI / 2, 0);
    S.add(new THREE.TorusGeometry(3.75, 0.16, 6, 6, Math.PI), darkMat, archX, 0, 0, 0, Math.PI / 2, 0);
    for (const z of [-3.6, 3.6]) colliders.push(circle(archX, z, 0.25, 4, 0.5, false));
    const ringSign = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.0), new THREE.MeshBasicMaterial({ map: neonTextTexture('Blade Ring', { w: 1024, h: 210, color: HEX.lilac, size: 120 }), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    ringSign.position.set(archX, 4.3, 0);
    ringSign.rotation.y = Math.PI / 2;
    scene.add(ringSign);
    signs.push({ mesh: ringSign, base: 1, flicker: 0 });
    // Pedestals.
    for (const p of PEDESTALS) {
      S.add(new THREE.CylinderGeometry(0.6, 0.7, 0.5, 24), panelM, p.x, 0.25, p.z);
      G.add(new THREE.TorusGeometry(0.62, 0.03, 4, 32), neonLilac, p.x, 0.5, p.z, Math.PI / 2);
      colliders.push(circle(p.x, p.z, 0.7, 0.5, 0.5, false));
    }
  }

  // ---- east bridge and the Glow Lab

  for (const side of [-1, 1]) {
    const z = side * 3.2;
    const x0 = Math.sqrt(ATRIUM_R * ATRIUM_R - 10.24) + 0.3;
    const x1 = LAB.x0 - 0.1;
    S.add(new THREE.BoxGeometry(x1 - x0, 1.0, 0.12), glass, (x0 + x1) / 2, 0.55, z);
    G.add(new THREE.BoxGeometry(x1 - x0, 0.08, 0.08), neonGold, (x0 + x1) / 2, 1.1, z);
    colliders.push(box((x0 + x1) / 2, z, (x1 - x0) / 2, 0.12, 0, 1.1, 0.5, false));
  }
  {
    const H = 3.2;
    const t = 0.4;
    const labWallTex = canvasTexture(256, 256, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#2a1a5e');
      grad.addColorStop(1, '#3b2478');
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = 'rgba(255,201,60,0.55)';
      g.lineWidth = 3;
      for (let x = 0; x <= 256; x += 64) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, 256);
        g.stroke();
      }
      g.fillStyle = 'rgba(255,201,60,0.18)';
      g.fillRect(0, 200, 256, 6);
    });
    labWallTex.wrapS = labWallTex.wrapT = THREE.RepeatWrapping;
    labWallTex.repeat.set(1, 1);
    const labWall = new THREE.MeshStandardMaterial({ map: labWallTex, emissiveMap: labWallTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.5 });
    const W = LAB.x1 - LAB.x0;
    const D = LAB.z1 - LAB.z0;
    const pieces: [number, number, number, number][] = [
      [LAB.x1 + t / 2, 0, t, D + 2 * t],
      [(LAB.x0 + LAB.x1) / 2, LAB.z0 - t / 2, W, t],
      [(LAB.x0 + LAB.x1) / 2, LAB.z1 + t / 2, W, t],
      [LAB.x0 - t / 2, (LAB.z0 - 3) / 2, t, LAB.z0 + 3 < 0 ? -(LAB.z0 + 3) + t : t],
      [LAB.x0 - t / 2, (LAB.z1 + 3) / 2, t, LAB.z1 - 3 + t],
    ];
    for (const [x, z, w, d] of pieces) {
      S.add(boxUV(w, H, d), labWall, x, H / 2, z);
      colliders.push(box(x, z, w / 2, d / 2, 0, H, 0.5, true));
    }
    // Gold strip around the top inside.
    G.add(new THREE.BoxGeometry(W, 0.06, 0.04), neonGold, (LAB.x0 + LAB.x1) / 2, 2.9, LAB.z0 + 0.03);
    G.add(new THREE.BoxGeometry(W, 0.06, 0.04), neonGold, (LAB.x0 + LAB.x1) / 2, 2.9, LAB.z1 - 0.03);
    G.add(new THREE.BoxGeometry(0.04, 0.06, D), neonGold, LAB.x1 - 0.03, 2.9, 0);
    const labSign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.1), new THREE.MeshBasicMaterial({ map: neonTextTexture('Glow Lab', { w: 1024, h: 220, color: HEX.gold, size: 130 }), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    labSign.position.set(LAB.x0 - 0.25, 5.0, 0);
    labSign.rotation.y = -Math.PI / 2;
    scene.add(labSign);
    S.add(new THREE.BoxGeometry(0.3, 1.3, 6.6), darkMat, LAB.x0 - 0.05, 5.0, 0);
    for (const z of [-3.3, 3.3]) S.add(new THREE.CylinderGeometry(0.12, 0.14, 5.6, 10), darkMat, LAB.x0 - 0.05, 2.8, z);
    signs.push({ mesh: labSign, base: 1, flicker: 0 });
    // Milkshake bar.
    S.add(new THREE.BoxGeometry(5, 1.1, 1), panelM, 30, 0.55, 6.4);
    G.add(new THREE.BoxGeometry(5.02, 0.05, 0.05), neonPink, 30, 1.0, 5.88);
    colliders.push(box(30, 6.4, 2.5, 0.5, 0, 1.1, 0.4, false));
    for (let i = 0; i < 6; i++) {
      const col = [C.pink, C.cyan, C.lime, C.gold, C.lilac, C.orange][i];
      G.add(new THREE.CylinderGeometry(0.09, 0.07, 0.26, 10), neon(col, 1.4), 28 + i * 0.8, 1.24, 6.4);
    }
    // Sofas.
    for (const sx of [23.5, 30.5]) {
      S.add(roundedDesk(3, 0.5, 0.9), panelM, sx, 0, -6.6, 0, 0, 0);
      S.add(new THREE.BoxGeometry(3, 0.5, 0.2), panelM, sx, 0.75, -7.0);
      G.add(new THREE.BoxGeometry(3.02, 0.04, 0.04), neonCyan, sx, 0.52, -6.13);
      colliders.push(box(sx, -6.6, 1.5, 0.45, 0, 0.5, 0.3, false));
    }
    // Wardrobe pedestal and its oval mirror frame (the mirror surface is drawn by the world).
    S.add(new THREE.BoxGeometry(1.4, 0.3, 0.6), panelM, WARDROBE.x, 0.15, WARDROBE.z);
    S.add(new THREE.TorusGeometry(1, 0.07, 8, 48), darkMat, WARDROBE.x, 1.55, WARDROBE.z - 0.05, 0, 0, 0, 0.62, 1.25, 1);
    G.add(new THREE.TorusGeometry(1.02, 0.03, 6, 48), neonLilac, WARDROBE.x, 1.55, WARDROBE.z + 0.03, 0, 0, 0, 0.62, 1.25, 1);
    colliders.push(box(WARDROBE.x, WARDROBE.z, 0.7, 0.3, 0, 2.8, 0.3, false));
    // Jukebox.
    S.add(roundedDesk(1.0, 1.6, 0.6), panelM, JUKEBOX.x, 0, JUKEBOX.z, 0, Math.PI, 0);
    G.add(new THREE.TorusGeometry(0.42, 0.04, 6, 24, Math.PI), neonPink, JUKEBOX.x, 1.4, JUKEBOX.z - 0.31, 0, 0, 0);
    colliders.push(box(JUKEBOX.x, JUKEBOX.z, 0.5, 0.3, 0, 1.6, 0.3, false));
    // Boards on the east wall: frames (canvas painted by the world).
    for (const b of BOARDS) {
      S.add(new THREE.BoxGeometry(0.12, 3.1, 4.4), darkMat, b.x - 0.04, 2.75, b.z);
      G.add(new THREE.BoxGeometry(0.04, 0.05, 4.4), neonLilac, b.x - 0.12, 1.18, b.z);
    }
    // A duel terminal and a tag terminal.
  }
  const holos: THREE.Object3D[] = [];
  for (const [t, color, title, icon, yaw] of [
    [TAG_TERMINAL, C.cyan, 'Laser tag', 'blaster', 0],
    [DUEL_TERMINAL, C.lilac, 'Duels', 'blade', -Math.PI / 2],
  ] as const) {
    S.add(roundedDesk(1.0, 1.0, 0.6), panelM, t.x, 0, t.z, 0, yaw, 0);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    G.add(new THREE.BoxGeometry(1.02, 0.05, 0.05), neon(color, 2), t.x + fx * 0.31, 0.98, t.z + fz * 0.31, 0, yaw, 0);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshBasicMaterial({ map: terminalTexture(title, icon, color), color: new THREE.Color(1.1, 1.1, 1.1) }));
    screen.position.set(t.x + fx * 0.05, 1.25, t.z + fz * 0.05);
    screen.rotation.set(-0.35, yaw, 0, 'YXZ');
    scene.add(screen);
    S.add(new THREE.BoxGeometry(0.96, 0.56, 0.05), darkMat, t.x - fx * 0.0, 1.25, t.z - fz * 0.0, -0.35, yaw, 0);
    const holo = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.5), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    holo.position.set(t.x - fx * 0.15, 2.05, t.z - fz * 0.15);
    holo.rotation.x = Math.PI;
    scene.add(holo);
    const iconSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: terminalIcon(icon, color), transparent: true, depthWrite: false }));
    iconSprite.scale.set(0.7, 0.7, 1);
    iconSprite.position.set(t.x - fx * 0.15, 2.45, t.z - fz * 0.15);
    scene.add(iconSprite);
    holos.push(iconSprite);
    colliders.push(box(t.x, t.z, 0.5, 0.3, yaw, 1.4, 0.3, false));
  }

  // Build the batches.
  S.build(scene, { receive: true });
  G.build(scene, { receive: false });
  for (const [, b] of haloBatch) halos.push(...b.build(scene, { receive: false }));
  for (const h of halos) h.renderOrder = 2;

  // Terminal screens and board meshes the world paints.
  const boardMeshes = BOARDS.map((b) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.94), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    m.position.set(b.x - 0.11, 2.75, b.z);
    m.rotation.y = -Math.PI / 2;
    scene.add(m);
    return m;
  });
  const jukeboxScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  jukeboxScreen.position.set(JUKEBOX.x, 1.05, JUKEBOX.z - 0.31);
  jukeboxScreen.rotation.y = Math.PI;
  scene.add(jukeboxScreen);

  // Wardrobe mirror surface.
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xc8c0ff, roughness: 0.05, metalness: 1, emissive: 0x2a1a66, emissiveIntensity: 0.4 });
  const mirror = new THREE.Mesh(new THREE.CircleGeometry(1, 40), mirrorMat);
  mirror.scale.set(0.62, 1.25, 1);
  mirror.position.set(WARDROBE.x, 1.55, WARDROBE.z);
  scene.add(mirror);

  // Sweeping lasers for the late show (medium and high): from the pylon tops, up over the atrium.
  const lasers = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.045, 30, 5, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? C.pink : C.cyan).multiplyScalar(1.4), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.geometry.translate(0, 15, 0);
    const holder = new THREE.Group();
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    holder.position.set(Math.cos(a) * 20.3, 7.1, Math.sin(a) * 20.3);
    holder.add(beam);
    holder.userData.a = a;
    lasers.add(holder);
  }
  scene.add(lasers);

  return { colliders, deckMat, arenaMat, ringMat, portalMat, eq, halos, signs, starPad, airlockDoors, lasers, boardMeshes, jukeboxScreen, mirrorMat, holos };
}

/** A desk with rounded corners standing on the floor (bottom at y 0). */
function roundedDesk(w: number, h: number, d: number): THREE.BufferGeometry {
  const r = Math.min(0.12, d / 3);
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -d / 2);
  s.lineTo(w / 2 - r, -d / 2);
  s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  s.lineTo(w / 2, d / 2 - r);
  s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
  s.lineTo(-w / 2 + r, d / 2);
  s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
  s.lineTo(-w / 2, -d / 2 + r);
  s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Paints a hall of fame board. */
export function paintBoard(mesh: THREE.Mesh, title: string, rows: { name: string; value: string; you: boolean }[], footer: string, accent: string): void {
  const tex = canvasTexture(840, 588, (g) => {
    g.fillStyle = '#0e0828';
    g.fillRect(0, 0, 840, 588);
    g.strokeStyle = accent;
    g.lineWidth = 10;
    g.shadowColor = accent;
    g.shadowBlur = 18;
    g.strokeRect(10, 10, 820, 568);
    g.shadowBlur = 0;
    g.fillStyle = accent;
    g.font = `64px ${DISPLAY_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(title, 420, 66);
    g.font = `600 36px "Atkinson Hyperlegible Next Variable", system-ui, sans-serif`;
    if (!rows.length) {
      g.fillStyle = '#c9c2dc';
      g.fillText('No scores yet. Be the first!', 420, 300);
    }
    rows.slice(0, 8).forEach((r, i) => {
      const y = 140 + i * 48;
      g.fillStyle = r.you ? HEX.gold : '#fff4fe';
      g.textAlign = 'left';
      g.fillText(`${i + 1}. ${r.name}`.slice(0, 22), 50, y);
      g.textAlign = 'right';
      g.fillText(r.value, 790, y);
    });
    g.textAlign = 'center';
    g.fillStyle = accent;
    g.font = `600 30px "Atkinson Hyperlegible Next Variable", system-ui, sans-serif`;
    g.fillText(footer, 420, 548);
  });
  const mat = mesh.material as THREE.MeshBasicMaterial;
  mat.map?.dispose();
  mat.map = tex;
  mat.needsUpdate = true;
}

export function stationQuality(p: StationParts, t: Tier): void {
  for (const h of p.halos) h.visible = t === 'low';
  p.lasers.visible = t !== 'low';
  for (let i = 0; i < p.lasers.children.length; i++) p.lasers.children[i].visible = t === 'high' || i % 2 === 0;
}

/** A box with UVs in metres on every face (for tiled wall textures). */
function boxUV(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const az = Math.abs(n.getZ(i));
    const u = ax > 0.5 ? p.getZ(i) + d / 2 : az > 0.5 ? p.getX(i) + w / 2 : p.getX(i) + w / 2;
    const v = p.getY(i) + h / 2;
    uv.setXY(i, u / 3.2, v / 3.2);
  }
  return g;
}

function drawIcon(g: CanvasRenderingContext2D, icon: 'blaster' | 'blade' | 'note', cx: number, cy: number, s: number, color: string): void {
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = s * 0.09;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = color;
  g.shadowBlur = s * 0.25;
  if (icon === 'blaster') {
    g.beginPath();
    g.moveTo(-s * 0.45, -s * 0.1);
    g.lineTo(s * 0.35, -s * 0.1);
    g.lineTo(s * 0.35, s * 0.08);
    g.lineTo(-s * 0.1, s * 0.08);
    g.lineTo(-s * 0.2, s * 0.42);
    g.lineTo(-s * 0.4, s * 0.42);
    g.lineTo(-s * 0.3, s * 0.08);
    g.lineTo(-s * 0.45, s * 0.08);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.moveTo(s * 0.45, -s * 0.01);
    g.lineTo(s * 0.62, -s * 0.01);
    g.stroke();
  } else if (icon === 'blade') {
    g.beginPath();
    g.moveTo(-s * 0.35, s * 0.35);
    g.lineTo(s * 0.4, -s * 0.4);
    g.stroke();
    g.lineWidth = s * 0.14;
    g.beginPath();
    g.moveTo(-s * 0.45, s * 0.45);
    g.lineTo(-s * 0.3, s * 0.3);
    g.stroke();
    g.beginPath();
    g.moveTo(-s * 0.42, s * 0.18);
    g.lineTo(-s * 0.18, s * 0.42);
    g.stroke();
  } else {
    g.beginPath();
    g.ellipse(-s * 0.18, s * 0.28, s * 0.16, s * 0.12, -0.4, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(-s * 0.04, s * 0.26);
    g.lineTo(-s * 0.04, -s * 0.42);
    g.lineTo(s * 0.3, -s * 0.3);
    g.stroke();
  }
  g.restore();
}

function terminalTexture(title: string, icon: 'blaster' | 'blade' | 'note', color: number): THREE.CanvasTexture {
  const hex = `#${new THREE.Color(color).getHexString()}`;
  return canvasTexture(360, 200, (g) => {
    g.fillStyle = '#0e0828';
    g.fillRect(0, 0, 360, 200);
    g.strokeStyle = hex;
    g.lineWidth = 6;
    g.strokeRect(6, 6, 348, 188);
    drawIcon(g, icon, 90, 100, 110, hex);
    g.fillStyle = '#fff4fe';
    g.font = `48px ${DISPLAY_FONT}`;
    g.textBaseline = 'middle';
    g.fillText(title, 160, 82);
    g.fillStyle = hex;
    g.font = `600 24px system-ui`;
    g.fillText('Free play', 162, 130);
  });
}

function terminalIcon(icon: 'blaster' | 'blade' | 'note', color: number): THREE.CanvasTexture {
  const hex = `#${new THREE.Color(color).getHexString()}`;
  return canvasTexture(128, 128, (g) => drawIcon(g, icon, 64, 64, 90, hex));
}
