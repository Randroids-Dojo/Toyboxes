// Builds one circuit's scene: ground and boundary, the road, start gantry,
// grid, boost pads, corner stacks and the paddock, then hands over to the
// theme's dressing (Block Town, Picnic Park, Sandcastle Cove, Starlight
// Bedroom). Everything static is merged by the Batch.

import * as THREE from 'three';
import type { Theme } from '../../../shared/kart/circuits';
import { box, type Collider } from '../../../world/physics';
import type { Tier } from '../../../world/space';
import { EDGE, HW, type Circuit } from '../circuit';
import { Dresser } from './dresser';
import { buildPaddock, type PaddockBuild } from './paddock';
import { PAL, ringStack, tyreStack } from './props';
import { LAYER, buildRoad, decal, paint, type RoadLook } from './road';
import { Batch, Shape, ball, rbox, xform } from './shape';
import { TexCache, boardsPainter, carpetPainter, checksPainter, chevronPainter, ginghamPainter, grassPainter, planksPainter, roadPainter, sandPainter, stripePainter } from './textures';

/** Moving scenery and hazards a theme adds. */
export interface ThemeParts {
  update?(dt: number, t: number, night: number, info: SceneInfo): void;
  /** Hazards that hit karts, checked by the world each step. */
  hazards?: Hazard[];
  /** Water or holes that call the Grabber. */
  water?(x: number, z: number): boolean;
  /** Fades roofs and beams the camera rises into. */
  cutaway?(cam: THREE.Vector3): void;
  /** Off-road surface for dust colour. */
  dust?: number;
  /** A huge landmark for flyovers to frame. */
  hero?: THREE.Vector3;
  dispose?(): void;
}

export interface SceneInfo {
  /** Positions along the lap of the leader and of you, for set pieces that react. */
  leaderS: number;
  finalLap: boolean;
  racing: boolean;
}

export interface Hazard {
  /** Where to steer round it near s (for the computer drivers). */
  danger?(s: number): { off: number; width: number } | null;
  /** Moving colliders this step. */
  colliders(): Collider[];
  /** Whether a kart at (x, z, y) is hit right now. */
  hits(x: number, z: number, y: number): 'spin' | 'tail' | null;
  /** Debug read-out. */
  info(): unknown;
}

export interface CircuitScene {
  group: THREE.Group;
  colliders: Collider[];
  paddock: PaddockBuild;
  padMat: THREE.MeshBasicMaterial;
  startLights: THREE.MeshStandardMaterial[];
  parts: ThemeParts;
  tex: TexCache;
  meshes: THREE.Mesh[];
  /** Night-lit materials: emissive goes up after dark. */
  lamps: THREE.MeshStandardMaterial[];
  /** The environment's point lights (high tier), for themes that light things up. */
  envPoints?: THREE.PointLight[];
  build(): void;
  dispose(): void;
}

export interface SceneOpts {
  ownerName: string;
  tier: Tier;
}

const ROAD: Record<Theme, { base: string; speck: [string, string]; edge: string; curbA: string; curbB: string; ground: 'boards' | 'grass' | 'sand' | 'carpet' }> = {
  playroom: { base: '#4b4e5e', speck: ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.08)'], edge: '#f3efe4', curbA: PAL.tomato, curbB: '#fbf8f0', ground: 'boards' },
  garden: { base: '#6e5340', speck: ['rgba(255,240,220,0.07)', 'rgba(40,20,10,0.12)'], edge: '#fff3d6', curbA: PAL.tomato, curbB: '#fbf8f0', ground: 'grass' },
  beach: { base: '#8a7152', speck: ['rgba(255,240,220,0.1)', 'rgba(40,30,10,0.1)'], edge: '#fff7e6', curbA: PAL.sky, curbB: '#fbf8f0', ground: 'sand' },
  bedroom: { base: '#2a2550', speck: ['rgba(126,240,255,0.06)', 'rgba(0,0,0,0.12)'], edge: '#7ef0ff', curbA: '#ff8fd1', curbB: '#7ef0ff', ground: 'carpet' },
};

export function buildScene(c: Circuit, opts: SceneOpts, dress: (d: Dresser, s: CircuitScene, tex: TexCache) => ThemeParts): CircuitScene {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const tex = new TexCache();
  const batch = new Batch(48);
  const th = ROAD[c.theme];
  const lamps: THREE.MeshStandardMaterial[] = [];
  const b = c.bounds;
  const margin = c.def?.bounds ?? 30;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const W = b.maxX - b.minX + margin * 2;
  const D = b.maxZ - b.minZ + margin * 2;

  // ---- Ground.
  const groundPaint =
    th.ground === 'boards' ? boardsPainter('#d9a066', '#c98f58', '#8a5a33') : th.ground === 'grass' ? grassPainter('#7fc25a', '#5aa84a') : th.ground === 'sand' ? sandPainter('#f2d49b', '#e3b877') : carpetPainter('#1b1f4a', '#262a5e');
  const tile = th.ground === 'boards' ? 10 : 8;
  const gtex = tex.make(512, 512, groundPaint, { repeat: [(W + 400) / tile, (D + 400) / tile] });
  const groundMat = new THREE.MeshStandardMaterial({ map: gtex, roughness: th.ground === 'boards' ? 0.62 : 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  // Outdoors the ground runs on to the horizon; indoors it stops at the walls.
  const gw = c.theme === 'garden' || c.theme === 'beach' ? W + 400 : W;
  const gd = c.theme === 'garden' || c.theme === 'beach' ? D + 400 : D;
  gtex.repeat.set(gw / tile, gd / tile);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd).rotateX(-Math.PI / 2), groundMat);
  ground.position.set(cx, LAYER.ground, cz);
  ground.receiveShadow = true;
  group.add(ground);

  // ---- Boundary colliders (themes draw the walls or fences themselves).
  const half = { w: W / 2, d: D / 2 };
  for (const [x, z, hw, hd] of [
    [cx, cz - half.d, half.w, 0.5],
    [cx, cz + half.d, half.w, 0.5],
    [cx - half.w, cz, 0.5, half.d],
    [cx + half.w, cz, 0.5, half.d],
  ] as const)
    colliders.push(box(x, z, hw, hd, 0, 60, 0.3, true));

  // ---- Road look.
  const roadTex = tex.make(256, 256, roadPainter(th.base, th.speck, th.edge), { repeat: [1, 1] });
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.88 });
  if (c.theme === 'bedroom') {
    // The edge lines glow in the dark.
    roadMat.emissive = new THREE.Color('#ffffff');
    roadMat.emissiveMap = tex.make(256, 256, (g, w, h) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#5fd8e8';
      g.fillRect(w * 0.025, 0, w * 0.02, h);
      g.fillRect(w * 0.955, 0, w * 0.02, h);
    });
    roadMat.emissiveIntensity = 1.2;
  }
  const curbTex = tex.make(32, 64, stripePainter(th.curbA, th.curbB, 2));
  const curbMat = new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.55 });
  if (c.theme === 'bedroom') {
    curbMat.emissive = new THREE.Color('#ffffff');
    curbMat.emissiveMap = curbTex;
    curbMat.emissiveIntensity = 0.55;
  }
  const materials: Record<string, THREE.Material> = { road: roadMat };
  materials.gingham = new THREE.MeshStandardMaterial({ map: tex.make(128, 128, ginghamPainter(PAL.tomato, '#fffaf0'), { repeat: [2, 1] }), roughness: 0.9 });
  materials.planks = new THREE.MeshStandardMaterial({ map: tex.make(256, 256, planksPainter('#b98a5e', '#a97a50', '#5a3a28'), { repeat: [1, 2] }), roughness: 0.85 });
  materials.rug = new THREE.MeshStandardMaterial({ map: tex.make(128, 128, carpetPainter('#6a4fb0', '#5a42a0'), { repeat: [2, 2] }), roughness: 1 });
  const side: Record<string, THREE.Material> = {
    earth: new THREE.MeshStandardMaterial({ color: '#a77b52', roughness: 1, map: tex.make(128, 128, sandPainter('#a77b52', '#8f6644'), { repeat: [1, 1] }) }),
    melon: new THREE.MeshStandardMaterial({
      roughness: 0.6,
      map: tex.make(64, 128, (g, w, h) => {
        g.fillStyle = '#2f8f4e';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#9fe08a';
        g.fillRect(0, h * 0.2, w, h * 0.12);
        g.fillStyle = '#fff6e0';
        g.fillRect(0, h * 0.32, w, h * 0.1);
        g.fillStyle = '#ff6b7a';
        g.fillRect(0, h * 0.42, w, h * 0.58);
        g.fillStyle = '#1d1830';
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.ellipse(w * (0.2 + i * 0.3), h * (0.6 + (i % 2) * 0.15), 3, 6, 0, 0, Math.PI * 2);
          g.fill();
        }
      }),
    }),
    planks: materials.planks,
    books: new THREE.MeshStandardMaterial({
      roughness: 0.7,
      map: tex.make(128, 64, (g, w, h) => {
        const cols = ['#e8574a', '#4aa3df', '#ffd24a', '#3fb68b', '#8a6bd1'];
        for (let i = 0; i < 8; i++) {
          g.fillStyle = cols[i % cols.length];
          g.fillRect(0, (i * h) / 8, w, h / 8);
          g.fillStyle = 'rgba(255,250,240,0.85)';
          g.fillRect(w * 0.1, (i * h) / 8 + 2, w * 0.8, 1.5);
        }
      }),
    }),
  };
  const rail = new THREE.MeshStandardMaterial({ color: c.theme === 'bedroom' ? '#ff8fd1' : c.theme === 'beach' ? '#e8d2a8' : c.theme === 'garden' ? '#2f8f4e' : '#fffaf0', roughness: 0.6 });
  if (c.theme === 'bedroom') {
    rail.emissive = new THREE.Color('#ff8fd1');
    rail.emissiveIntensity = 0.35;
  }
  const surfaces: { s0: number; s1: number; kind: string }[] = [];
  if (c.id === 'picnic') surfaces.push({ s0: 126, s1: 174, kind: 'gingham' });
  if (c.id === 'cove') surfaces.push({ s0: 66, s1: 106, kind: 'planks' }, { s0: 132, s1: 164, kind: 'planks' });
  if (c.id === 'bedroom') surfaces.push({ s0: 72, s1: 116, kind: 'rug' });
  const look: RoadLook = {
    surface: (s) => surfaces.find((x) => s >= x.s0 && s < x.s1)?.kind ?? 'road',
    materials,
    curb: curbMat,
    side,
    rail,
  };
  buildRoad(c, batch, look, colliders);

  // ---- Start line, grid and the gantry with the start lights.
  const checks = tex.make(128, 32, checksPainter('#1d1830', '#fbf8f0', 16, 4));
  checks.wrapS = checks.wrapT = THREE.ClampToEdgeWrapping;
  batch.raw(paint(c, -1.0, 1.0, -HW, HW), decal(new THREE.MeshStandardMaterial({ map: checks, roughness: 0.6 }), 2), { receive: true });
  const gridMat = decal(new THREE.MeshStandardMaterial({ color: '#fbf8f0', roughness: 0.6 }), 2);
  for (let k = 0; k < 8; k++) {
    const g = c.grid(k);
    const lane = k % 2 ? -2.2 : 2.2;
    batch.raw(paint(c, g.s + 1.15, g.s + 1.4, lane - 1.1, lane + 1.1), gridMat);
    for (const e of [-1.1, 1.1]) batch.raw(paint(c, g.s - 0.4, g.s + 1.15, lane + e - 0.12, lane + e + 0.12), gridMat);
  }
  const start = c.frame(0);
  const syaw = Math.atan2(start.tx, start.tz);
  const gw2 = EDGE * 2 + 2.2;
  const g = new Shape();
  for (const sx of [-1, 1]) {
    g.at(rbox(0.6, 6.4, 0.6, 0.15), PAL.ink, sx * gw2 / 2, 3.2, 0);
    g.at(ball(0.45, 12, 9), PAL.sun, sx * gw2 / 2, 6.7, 0);
  }
  g.at(rbox(gw2 + 1.2, 1.3, 0.7, 0.2), PAL.tomato, 0, 6.0, 0);
  g.at(rbox(3.2, 1.0, 0.45, 0.12), PAL.ink, 0, 4.9, -0.2);
  batch.shape(g, xform(start.x, 0, start.z, 0, syaw, 0));
  for (const sx of [-1, 1]) colliders.push(box(start.x + start.nx * sx * gw2 / 2, start.z + start.nz * sx * gw2 / 2, 0.4, 0.4, syaw, 6.4, 0.5, true));
  const startLights: THREE.MeshStandardMaterial[] = [];
  const bulb = new THREE.SphereGeometry(0.28, 14, 10);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.MeshStandardMaterial({ color: '#3a3448', emissive: new THREE.Color('#000000'), roughness: 0.3 });
    startLights.push(m);
    const mesh = new THREE.Mesh(bulb, m);
    const off = (i - 1) * 0.95;
    mesh.position.set(start.x - start.nx * off - start.tx * 0.5, 4.9, start.z - start.nz * off - start.tz * 0.5);
    group.add(mesh);
  }
  // The circuit's name on both faces of the gantry.
  const nameTex = tex.make(1024, 128, (g2, w, h) => {
    g2.fillStyle = '#1d1830';
    g2.fillRect(0, 0, w, h);
    g2.fillStyle = '#ffd24a';
    g2.font = `${h * 0.62}px "Lilita One", system-ui`;
    g2.textAlign = 'center';
    g2.textBaseline = 'middle';
    g2.fillText(c.name.toUpperCase(), w / 2, h * 0.54);
  });
  for (const dir of [-1, 1]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(gw2 - 0.4, 1.0), new THREE.MeshStandardMaterial({ map: nameTex, roughness: 0.6, emissive: new THREE.Color('#ffffff'), emissiveMap: nameTex, emissiveIntensity: 0.25 }));
    sign.position.set(start.x + start.tx * dir * 0.36, 6.0, start.z + start.tz * dir * 0.36);
    sign.rotation.y = syaw + (dir > 0 ? 0 : Math.PI);
    lamps.push(sign.material as THREE.MeshStandardMaterial);
    group.add(sign);
  }

  // ---- Boost pads, following the road's height.
  const chev = tex.make(64, 128, chevronPainter('#ff9d2e', '#ffe14d'), { repeat: [1, 2] });
  const padMat = decal(new THREE.MeshBasicMaterial({ map: chev }), 3);
  for (const p of c.pads) {
    const len = p.len ?? 2.5;
    batch.raw(paint(c, p.s - len, p.s + len, p.off - 1.5, p.off + 1.5), padMat);
  }

  const scene: CircuitScene = {
    group,
    colliders,
    paddock: null as unknown as PaddockBuild,
    padMat,
    startLights,
    parts: {},
    tex,
    meshes: [],
    lamps,
    build: () => {},
    dispose: () => {},
  };

  // ---- Paddock.
  scene.paddock = buildPaddock(c, batch, group, tex, colliders, opts.ownerName);
  const d = new Dresser(c, batch, group, colliders, scene.paddock);
  // Keep the start gantry's feet and the grid's run-off clear.
  d.claim(start.x, start.z, EDGE + 2);

  // ---- Stacks on the outside of the tight corners.
  for (let s = 0; s < c.length; s += 3) {
    const turn = c.path.turnAhead(s, 12);
    if (Math.abs(turn) < 0.8 || c.profile.raiseAt(s + 6)) continue;
    const out = turn > 0 ? -1 : 1;
    const q = c.at(s + 6, out * (EDGE + 2.6));
    if (!d.free(q.x, q.z, 0.8, 1.6)) continue;
    d.claim(q.x, q.z, 1.7);
    const stack = c.theme === 'playroom' ? ringStack(3, 0.62, Math.floor(s)) : tyreStack(3);
    batch.shape(stack, xform(q.x, 0, q.z, 0, s, 0));
    colliders.push({ kind: 'circle', x: q.x, z: q.z, r: 0.65, h: 1.2, bounce: 0.75, blocksCamera: false });
  }

  scene.parts = dress(d, scene, tex);

  scene.build = () => {
    scene.meshes = batch.build(group);
  };
  scene.dispose = () => {
    scene.parts.dispose?.();
    tex.dispose();
  };
  scene.build();
  setTier(scene, opts.tier);
  return scene;
}

/** Shadow casting by tier: off on low (blob shadows), big things only on medium. */
export function setTier(s: CircuitScene, t: Tier): void {
  for (const m of s.meshes) {
    if (m.userData.castWanted === undefined) m.userData.castWanted = m.castShadow;
    m.castShadow = t !== 'low' && (m.userData.castWanted as boolean);
  }
}
