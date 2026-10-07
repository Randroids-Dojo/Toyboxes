// The places you can stand: the Rim (the hub), Ringworld, Cinder, the Comet
// dock and the Horizon stair. Each builds its meshes and colliders; every
// floating island is physically a pillar up to its top, hidden by a hanging
// underside, and the star net catches you long before the void floor.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CINDER,
  DOCK,
  GATE_H,
  GATE_W,
  HUB,
  HUB_R,
  RING,
  RING_BLOSSOMS,
  RING_GAPS,
  RING_GATE_S,
  RING_LANES,
  RING_RETURN_S,
  RING_START_S,
  RING_THETA0,
  STAIR,
  cinderTiles,
  ringBoxes,
  ringPoint,
  type Island,
} from '../../shared/galaxy-rules';
import { box, circle, type Collider } from '../../world/physics';
import type { Tier } from '../../world/space';
import { Billboard, Blossoms, Sign, beam, glowSprite, glowText, padDecal, underside, veinMaterial, type Uniforms } from './props';
import * as S from './shaders';

export const ISLAND_COLOR: Record<Island, string> = { ring: '#3fb68b', storm: '#ff8a3d', comet: '#bfe8ff' };
export const ISLAND_NAME: Record<Island, string> = { ring: 'Ringworld', storm: 'Cinder', comet: 'Comet dock' };

type PadParts = ReturnType<typeof padDecal>;

/** A star sling pad: decal, beacon, hologram of where it goes and a sign. */
export interface SlingPad {
  spot: { x: number; y: number; z: number };
  /** 0 hidden to 1 shown: the hologram and sign fade when the camera is close. */
  shown: number;
  decal: PadParts;
  beacon: ReturnType<typeof beam>;
  holo: THREE.Object3D;
  sign: Sign;
  group: THREE.Group;
}

function slingPad(x: number, y: number, z: number, color: string, uniforms: Uniforms, holo: THREE.Object3D, parent: THREE.Object3D): SlingPad {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const decal = padDecal(1.25, color, uniforms, true);
  decal.mesh.position.y = 0.03;
  group.add(decal.mesh);
  const beacon = beam(color, 9, 0.9, uniforms, 0.45);
  group.add(beacon.mesh);
  holo.position.y = 2.4;
  holo.scale.multiplyScalar(0.7);
  group.add(holo);
  const sign = new Sign(color, 3.2);
  sign.sprite.position.y = 4.3;
  group.add(sign.sprite);
  // Four little crystal posts around the pad.
  const post = new THREE.ConeGeometry(0.12, 0.7, 5).translate(0, 0.35, 0);
  const pm = new THREE.MeshStandardMaterial({ color: '#2a1c52', emissive: new THREE.Color(color), emissiveIntensity: 0.6, flatShading: true });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const m = new THREE.Mesh(post, pm);
    m.position.set(Math.cos(a) * 1.45, 0, Math.sin(a) * 1.45);
    group.add(m);
  }
  parent.add(group);
  return { spot: { x, y, z }, shown: 1, decal, beacon, holo, sign, group };
}

/** Things that fade out when the camera comes close (signs, rings), so they never fill the screen. */
export class NearFade {
  private items: { obj: THREE.Object3D; near: number; far: number; shown: number }[] = [];
  private v = new THREE.Vector3();

  add(obj: THREE.Object3D, near = 3, far = 5.5): void {
    this.items.push({ obj, near, far, shown: 1 });
  }

  update(cam: THREE.Vector3, dt: number): void {
    for (const it of this.items) {
      it.obj.getWorldPosition(this.v);
      const d = this.v.distanceTo(cam);
      const want = d < it.near ? 0 : d < it.far ? (d - it.near) / (it.far - it.near) : 1;
      it.shown += (want - it.shown) * Math.min(1, dt * 8);
      it.obj.visible = it.shown > 0.02;
      it.obj.traverse((m) => {
        const mat = (m as THREE.Mesh).material as THREE.Material | undefined;
        if (mat && 'opacity' in mat) {
          mat.transparent = true;
          mat.opacity = it.shown * ((mat.userData.alpha as number | undefined) ?? 1);
        }
      });
    }
  }
}

/** Fades a pad's hologram and sign when the camera comes close, so they never fill the screen. */
export function padNear(p: SlingPad, cam: THREE.Vector3, dt: number): void {
  const d = Math.hypot(cam.x - p.spot.x, cam.z - p.spot.z, (cam.y - p.spot.y - 2.4) * 0.6);
  const want = d < 3.2 ? 0 : d < 5.5 ? (d - 3.2) / 2.3 : 1;
  p.shown += (want - p.shown) * Math.min(1, dt * 8);
  const v = p.shown > 0.02;
  p.holo.visible = v;
  p.sign.sprite.visible = v;
  (p.sign.sprite.material as THREE.SpriteMaterial).opacity = p.shown;
  p.holo.traverse((m) => {
    const mat = (m as THREE.Mesh).material as THREE.Material | undefined;
    if (mat && 'opacity' in mat) {
      mat.transparent = true;
      (mat as THREE.MeshBasicMaterial).opacity = Math.min((mat.userData.base as number | undefined) ?? 0.9, p.shown);
    }
  });
}

/** Tiny glowing models of each destination, for the sling holograms and the orrery. */
export function miniature(kind: Island | 'hole' | 'hub', scale = 1): THREE.Group {
  const g = new THREE.Group();
  const glow = (c: string) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.1), transparent: true, opacity: 0.9 });
  if (kind === 'ring') {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), glow('#4aa3df')));
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.06, 6, 40), glow('#3fb68b'));
    r.rotation.x = Math.PI / 2 - 0.4;
    g.add(r);
  } else if (kind === 'storm') {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), new THREE.MeshStandardMaterial({ color: '#3a2a38', emissive: new THREE.Color('#ff8a3d'), emissiveIntensity: 0.6, flatShading: true }));
    g.add(rock);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 5), glow('#ff8a3d'));
    spire.position.y = 0.45;
    g.add(spire);
  } else if (kind === 'comet') {
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), glow('#e6f6ff')));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.2, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#6cc4ff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    tail.rotation.z = Math.PI / 2;
    tail.position.x = 0.7;
    g.add(tail);
  } else if (kind === 'hole') {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshBasicMaterial({ color: '#000' })));
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 6, 32), glow('#f4b740'));
    r.rotation.x = Math.PI / 2 - 0.25;
    g.add(r);
  } else {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.1, 6), glow('#8a6bd1')));
  }
  g.scale.setScalar(scale);
  return g;
}

// ---------------------------------------------------------------------------
// The Rim: the hub

export class Hub {
  readonly group = new THREE.Group();
  readonly colliders: Collider[] = [];
  readonly pads: Record<Island, SlingPad>;
  readonly shrineBoard: THREE.Mesh;
  readonly horizonBlossom: number;
  readonly chartPips: Record<string, THREE.Mesh[]> = {};
  private tiles: THREE.InstancedMesh;
  readonly tileMats: { physical: THREE.MeshPhysicalMaterial; plain: THREE.MeshStandardMaterial };
  readonly seamMat: THREE.ShaderMaterial;
  private fenceMat: THREE.ShaderMaterial;
  private shrineRing: THREE.Mesh;
  readonly fade = new NearFade();
  private shrineBeam: ReturnType<typeof beam>;
  private chartTop: THREE.Group;
  private horizonBeam: ReturnType<typeof beam>;
  private rim: THREE.Mesh;

  constructor(
    scene: THREE.Scene,
    uniforms: Uniforms,
    playerPos: THREE.Vector3,
    ownerName: string,
    blossoms: Blossoms,
  ) {
    const s = this.group;
    // Crystal platform of hex tiles.
    const size = 1.2;
    const centres: THREE.Vector2[] = [];
    for (let q = -14; q <= 14; q++) {
      for (let r = -14; r <= 14; r++) {
        const x = size * 1.5 * q;
        const z = size * Math.sqrt(3) * (r + q / 2);
        if (Math.hypot(x, z) <= HUB_R + 0.55) centres.push(new THREE.Vector2(x, z));
      }
    }
    const tileGeo = new THREE.CylinderGeometry(size * 0.96, size * 0.8, 0.7, 6).rotateY(Math.PI / 6).translate(0, -0.35, 0);
    this.tileMats = {
      physical: new THREE.MeshPhysicalMaterial({ color: '#140c30', roughness: 0.26, metalness: 0.1, iridescence: 1, iridescenceIOR: 1.5, iridescenceThicknessRange: [180, 700], clearcoat: 0.35, clearcoatRoughness: 0.3, emissive: new THREE.Color('#2a1060'), emissiveIntensity: 0.5 }),
      plain: new THREE.MeshStandardMaterial({ color: '#1c1238', roughness: 0.4, metalness: 0.25, emissive: new THREE.Color('#241052'), emissiveIntensity: 0.5 }),
    };
    S.fakeIridescence(this.tileMats.plain, uniforms, 0.75);
    this.tiles = new THREE.InstancedMesh(tileGeo, this.tileMats.plain, centres.length);
    const m4 = new THREE.Matrix4();
    centres.forEach((c, i) => {
      // A few millimetres of jitter so neighbouring tops never share a plane.
      m4.makeTranslation(c.x, -((i * 37) % 7) * 0.006, c.y);
      this.tiles.setMatrixAt(i, m4);
    });
    this.tiles.receiveShadow = true;
    s.add(this.tiles);
    const seamPts: number[] = [];
    for (const c of centres) {
      for (let k = 0; k < 6; k++) {
        const a0 = (k / 6) * Math.PI * 2;
        const a1 = ((k + 1) / 6) * Math.PI * 2;
        const rr = size * 0.96;
        seamPts.push(c.x + Math.cos(a0) * rr, 0.015, c.y + Math.sin(a0) * rr, c.x + Math.cos(a1) * rr, 0.015, c.y + Math.sin(a1) * rr);
      }
    }
    const seamGeo = new THREE.BufferGeometry();
    seamGeo.setAttribute('position', new THREE.Float32BufferAttribute(seamPts, 3));
    this.seamMat = new THREE.ShaderMaterial({ vertexShader: S.SEAM_VERT, fragmentShader: S.SEAM_FRAG, uniforms: { ...uniforms, uA: { value: new THREE.Color(0.35, 0.95, 0.85) }, uB: { value: new THREE.Color(0.7, 0.4, 1.0) }, uCenter: { value: new THREE.Vector3() } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    s.add(new THREE.LineSegments(seamGeo, this.seamMat));
    // The crystal root hanging under the hub.
    const rootMat = veinMaterial('#1c1238', '#8a6bd1');
    const root = underside(HUB_R + 0.4, 12, 11, rootMat, { top: -0.72 });
    s.add(root);
    // A thin glowing rim just outside the tiles.
    this.rim = new THREE.Mesh(new THREE.TorusGeometry(HUB_R + 1.05, 0.06, 6, 160), new THREE.MeshBasicMaterial({ color: '#b9a4ff' }));
    this.rim.rotation.x = Math.PI / 2;
    this.rim.position.y = -0.2;
    s.add(this.rim);

    // The energy rail: blocks you, not the orbs; only glows near you.
    this.fenceMat = new THREE.ShaderMaterial({ vertexShader: S.FENCE_VERT, fragmentShader: S.FENCE_FRAG, uniforms: { ...uniforms, uPlayer: { value: playerPos } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    s.add(new THREE.Mesh(new THREE.CylinderGeometry(HUB_R + 0.75, HUB_R + 0.75, 1.8, 120, 1, true).translate(0, 0.9, 0), this.fenceMat));
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      // Taller than any low-gravity jump, so nobody floats over the edge.
      this.colliders.push(box(Math.sin(a) * (HUB_R + 0.95), -Math.cos(a) * (HUB_R + 0.95), 1.0, 0.25, -a, 40, 0.5, false));
    }

    // The way home: a vortex ring.
    const exit = new THREE.Group();
    const ex = HUB.exit;
    exit.position.set(ex.x, 1.9, ex.z);
    exit.add(new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 16, 64), new THREE.MeshBasicMaterial({ color: '#ffd27a' })));
    exit.add(new THREE.Mesh(new THREE.CircleGeometry(1.55, 48), new THREE.ShaderMaterial({ vertexShader: S.QUAD_VERT, fragmentShader: S.VORTEX_FRAG, uniforms, transparent: true, side: THREE.DoubleSide })));
    const exitLabel = glowText(`Back to ${ownerName}'s room`, '#ffd27a', 5.6, 0.8);
    exitLabel.position.set(0, 2.35, 0.05);
    exit.add(exitLabel);
    exit.rotation.y = Math.atan2(-ex.x, -ex.z);
    s.add(exit);
    this.colliders.push(circle(ex.x, ex.z, 1.0, 4, 0.5, true));

    // The frenzy shrine and its board.
    const sh = new THREE.Group();
    sh.position.set(HUB.shrine.x, 0, HUB.shrine.z);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, 1.0, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#160f30', emissive: new THREE.Color('#0f2a2a'), emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.3, flatShading: true }));
    sh.add(plinth);
    const plinthEdge = new THREE.Mesh(new THREE.TorusGeometry(0.93, 0.035, 6, 6), new THREE.MeshBasicMaterial({ color: '#53f0c0' }));
    plinthEdge.rotation.x = Math.PI / 2;
    plinthEdge.rotation.z = Math.PI / 6;
    plinthEdge.position.y = 1.0;
    sh.add(plinthEdge);
    const plinthTop = padDecal(0.85, '#53f0c0', uniforms, false);
    plinthTop.mesh.position.y = 1.02;
    sh.add(plinthTop.mesh);
    this.shrineRing = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 12, 48), new THREE.MeshBasicMaterial({ color: '#53f0c0' }));
    this.shrineRing.position.y = 2.4;
    sh.add(this.shrineRing);
    this.shrineBeam = beam('#53f0c0', 3.2, 0.5, uniforms, 0.2);
    this.shrineBeam.mesh.position.y = 1.02;
    sh.add(this.shrineBeam.mesh);
    const shrineLabel = new Sign('#53f0c0', 3.6);
    shrineLabel.set('Feeding frenzy', null, false);
    shrineLabel.sprite.position.y = 3.7;
    sh.add(shrineLabel.sprite);
    this.fade.add(shrineLabel.sprite, 3.5, 6);
    this.fade.add(this.shrineRing, 2.5, 4.5);
    this.shrineBoard = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.94), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.94, depthWrite: false, side: THREE.DoubleSide }));
    this.shrineBoard.position.set(0, 5.8, 0);
    this.shrineBoard.renderOrder = 6;
    sh.add(this.shrineBoard);
    // Face the middle of the hub.
    sh.rotation.y = Math.atan2(-HUB.shrine.x, -HUB.shrine.z);
    s.add(sh);
    this.colliders.push(circle(HUB.shrine.x, HUB.shrine.z, 1.0, 1.0, 0.5, false));

    // The Star chart: an orrery with every island and star pips.
    const ch = new THREE.Group();
    ch.position.set(HUB.chart.x, 0, HUB.chart.z);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 1.0, 8).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#241a4c', emissive: new THREE.Color('#8a6bd1'), emissiveIntensity: 0.25, roughness: 0.3, flatShading: true }));
    ch.add(ped);
    const table = padDecal(1.25, '#8a6bd1', uniforms, false);
    table.mesh.position.y = 1.08;
    ch.add(table.mesh);
    const tableRim = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.04, 6, 64), new THREE.MeshBasicMaterial({ color: '#b9a4ff' }));
    tableRim.rotation.x = Math.PI / 2;
    tableRim.position.y = 1.06;
    ch.add(tableRim);
    this.chartTop = new THREE.Group();
    this.chartTop.position.y = 1.3;
    const place = (kind: Island | 'hole' | 'hub', x: number, z: number, pips: number, id: string, sc: number) => {
      const m = miniature(kind, sc);
      m.position.set(x, 0, z);
      this.chartTop.add(m);
      const list: THREE.Mesh[] = [];
      for (let i = 0; i < pips; i++) {
        const p = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), new THREE.MeshBasicMaterial({ color: '#3a3450' }));
        p.position.set(x + (i - (pips - 1) / 2) * 0.15, 0.42, z);
        this.chartTop.add(p);
        list.push(p);
      }
      this.chartPips[id] = list;
    };
    place('hub', 0, 0, 4, 'hub', 0.45);
    place('hole', 0.4, -0.95, 0, 'hole', 0.7);
    place('ring', -0.65, -0.8, 3, 'ring', 0.45);
    place('storm', 1.0, -0.1, 3, 'storm', 0.5);
    place('comet', 0.62, 0.62, 3, 'comet', 0.45);
    ch.add(this.chartTop);
    const chartLabel = new Sign('#b9a4ff', 3.2);
    chartLabel.set('Star chart', null, false);
    chartLabel.sprite.position.y = 2.9;
    ch.add(chartLabel.sprite);
    this.fade.add(chartLabel.sprite, 3, 5.5);
    s.add(ch);
    this.colliders.push(circle(HUB.chart.x, HUB.chart.z, 1.2, 1.1, 0.5, false));

    // Star slings.
    const sl = HUB.slings;
    this.pads = {
      ring: slingPad(sl.ring.x, 0, sl.ring.z, ISLAND_COLOR.ring, uniforms, miniature('ring'), s),
      storm: slingPad(sl.storm.x, 0, sl.storm.z, ISLAND_COLOR.storm, uniforms, miniature('storm'), s),
      comet: slingPad(sl.comet.x, 0, sl.comet.z, ISLAND_COLOR.comet, uniforms, miniature('comet'), s),
    };

    // The Horizon blossom, from the twelfth star.
    this.horizonBlossom = blossoms.add(HUB.horizon.x, 0.02, HUB.horizon.z, Math.atan2(STAIR[0].x - HUB.horizon.x, STAIR[0].z - HUB.horizon.z), false);
    this.horizonBeam = beam('#f4b740', 7, 1.1, uniforms, 0);
    this.horizonBeam.mesh.position.set(HUB.horizon.x, 0, HUB.horizon.z);
    s.add(this.horizonBeam.mesh);

    scene.add(s);
  }

  setQuality(tier: Tier, env: THREE.Texture | null): void {
    const physical = tier !== 'low' && tier !== 'medium';
    this.tiles.material = physical ? this.tileMats.physical : this.tileMats.plain;
    this.tileMats.physical.envMap = physical ? env : null;
    this.tileMats.physical.needsUpdate = true;
  }

  update(dt: number, time: number, o: { open: Record<Island, boolean>; need: Record<Island, number>; horizon: boolean; frenzy: boolean; charge: Island | null; chargeT: number; pips: Record<string, number> }): void {
    for (const k of ['ring', 'storm', 'comet'] as Island[]) {
      const p = this.pads[k];
      const on = o.open[k] ? 1 : 0;
      p.decal.u.uOn.value += (on - p.decal.u.uOn.value) * Math.min(1, dt * 3);
      p.decal.u.uCharge.value = o.charge === k ? Math.min(1, o.chargeT / 0.6) : Math.max(0, p.decal.u.uCharge.value - dt * 2);
      p.beacon.u.uAlpha.value = on * 0.45 + p.decal.u.uCharge.value * 0.6;
      p.holo.rotation.y += dt * (0.8 + p.decal.u.uCharge.value * 8);
      p.holo.position.y = 2.4 + Math.sin(time * 1.4 + p.spot.x) * 0.12;
      p.holo.traverse((m) => {
        const mat = (m as THREE.Mesh).material as THREE.Material | undefined;
        if (mat) mat.userData.base = on ? 0.9 : 0.25;
      });
      p.sign.set(ISLAND_NAME[k], on ? null : `${o.need[k]} ★ to open`, !on);
    }
    this.shrineRing.rotation.y += dt * 1.4;
    this.shrineRing.position.y = 2.4 + Math.sin(time * 1.6) * 0.15;
    this.shrineBeam.u.uAlpha.value = o.frenzy ? 0.22 : 0.05;
    this.horizonBeam.u.uAlpha.value += ((o.horizon ? 0.55 : 0) - this.horizonBeam.u.uAlpha.value) * Math.min(1, dt * 2);
    this.chartTop.rotation.y = Math.sin(time * 0.2) * 0.25;
    for (const [id, list] of Object.entries(this.chartPips)) {
      const n = o.pips[id] ?? 0;
      list.forEach((m, i) => (m.material as THREE.MeshBasicMaterial).color.set(i < n ? '#f4b740' : '#3a3450'));
      list.forEach((m) => (m.rotation.y += dt * 2));
    }
  }
}

// ---------------------------------------------------------------------------
// Ringworld

class ArchCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private w: number,
    private h: number,
  ) {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const r = this.w / 2;
    const leg = this.h - r;
    const total = leg * 2 + Math.PI * r;
    let d = t * total;
    if (d < leg) return target.set(-r, d, 0);
    d -= leg;
    if (d < Math.PI * r) {
      const a = Math.PI - d / r;
      return target.set(Math.cos(a) * r, leg + Math.sin(a) * r, 0);
    }
    d -= Math.PI * r;
    return target.set(r, leg - d, 0);
  }
}

function ringTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  // Across the walkway (v): bands in the drawing's ring greens.
  for (let y = 0; y < 128; y++) {
    const t = y / 127;
    const band = 0.5 + 0.5 * Math.sin(t * 40) * Math.sin(t * 11 + 1);
    const l = 0.5 + band * 0.25;
    g.fillStyle = `rgb(${Math.round(30 * l + 14)},${Math.round(120 * l + 40)},${Math.round(92 * l + 30)})`;
    g.fillRect(0, y, 512, 1);
  }
  // Pale edge lines and a dashed middle line.
  g.fillStyle = '#c8ffe6';
  g.fillRect(0, 5, 512, 3);
  g.fillRect(0, 120, 512, 3);
  g.fillStyle = 'rgba(220,255,240,0.55)';
  for (let x = 0; x < 512; x += 64) g.fillRect(x + 8, 62, 34, 4);
  // Faint ribs every metre, so speed reads.
  g.fillStyle = 'rgba(10,40,30,0.35)';
  for (let x = 0; x < 512; x += 64) g.fillRect(x, 10, 2, 108);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The ring walkway's runs between gaps, as degrees along the run. */
export const RING_RUNS: [number, number][] = [
  [RING_GAPS[3][1] - 360, RING_GAPS[0][0]],
  [RING_GAPS[0][1], RING_GAPS[1][0]],
  [RING_GAPS[1][1], RING_GAPS[2][0]],
  [RING_GAPS[2][1], RING_GAPS[3][0]],
];

/** The sling home sits on the inner half, clear of the camera behind the start line. */
export const RING_BACK_R = RING.inner + 1.7;

export type GateState = 'idle' | 'next' | 'hit' | 'miss' | 'done';

export class Ringworld {
  readonly group = new THREE.Group();
  readonly colliders: Collider[] = [];
  readonly planetMat: THREE.ShaderMaterial;
  readonly start: SlingPad;
  readonly back: SlingPad;
  readonly billboard = new Billboard('#3fb68b');
  /** Blossom ids for each gap: inner, middle, outer. */
  readonly blossoms: number[][] = [];
  readonly laneMats: THREE.ShaderMaterial[] = [];
  private gates: THREE.InstancedMesh;
  private films: THREE.InstancedMesh;
  private gateColor = new THREE.Color();

  constructor(scene: THREE.Scene, uniforms: Uniforms, blossomSys: Blossoms) {
    const g = this.group;
    const top = RING.top;
    // The planet.
    this.planetMat = new THREE.ShaderMaterial({ vertexShader: S.PLANET_VERT, fragmentShader: S.PLANET_FRAG, uniforms: { ...uniforms, uDetail: { value: 4 }, uLightDir: { value: new THREE.Vector3(1, 0.4, 0.5) } } });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(RING.planetR, 64, 40), this.planetMat);
    planet.position.set(RING.cx, RING.planetY, RING.cz);
    g.add(planet);
    this.colliders.push(circle(RING.cx, RING.cz, RING.planetR, RING.planetY + RING.planetR, 0.3, true));

    // The walkway.
    const step = 360 / 48;
    const hw = RING.outer * Math.tan(((step / 2) * Math.PI) / 180);
    const col = (s: number, t: number, first: boolean, last: boolean): THREE.Vector2 => {
      if (first || last) {
        const phi = first ? s + step / 2 : s - step / 2;
        const th = RING_THETA0 - (phi * Math.PI) / 180;
        const c = ringPoint(phi, RING.mid);
        const side = first ? -hw : hw;
        const lz = -3 + 6 * t;
        return new THREE.Vector2(c.x + side * Math.sin(th) + lz * Math.cos(th), c.z - side * Math.cos(th) + lz * Math.sin(th));
      }
      const p = ringPoint(s, RING.inner + (RING.outer - RING.inner) * t);
      return new THREE.Vector2(p.x, p.z);
    };
    const tops: THREE.BufferGeometry[] = [];
    const sides: THREE.BufferGeometry[] = [];
    const edgePts: THREE.Vector3[][] = [];
    const thick = 1.0;
    for (const [s0, s1] of RING_RUNS) {
      const n = Math.max(2, Math.ceil((s1 - s0) / 2.5));
      const cols: { i: THREE.Vector2; o: THREE.Vector2; s: number }[] = [];
      for (let k = 0; k <= n; k++) {
        const s = s0 + ((s1 - s0) * k) / n;
        cols.push({ i: col(s, 0, k === 0, k === n), o: col(s, 1, k === 0, k === n), s });
      }
      // Top.
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      cols.forEach((c, k) => {
        const u = (((c.s - s0) * Math.PI) / 180) * RING.mid / 8;
        pos.push(c.i.x, top, c.i.y, c.o.x, top, c.o.y);
        uv.push(u, 0, u, 1);
        if (k > 0) {
          const a = (k - 1) * 2;
          idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      });
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      tg.setIndex(idx);
      tg.computeVertexNormals();
      // Make sure the top faces up whichever way round the run goes.
      const nrm = tg.getAttribute('normal');
      if (nrm.getY(0) < 0) {
        tg.setIndex(idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]]));
        tg.computeVertexNormals();
      }
      tops.push(tg);
      // Sides, ends and the bottom as one strip set.
      const sp: number[] = [];
      const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => sp.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
      const v3 = (p: THREE.Vector2, y: number) => new THREE.Vector3(p.x, y, p.y);
      for (let k = 1; k < cols.length; k++) {
        const a = cols[k - 1];
        const b = cols[k];
        quad(v3(a.o, top), v3(b.o, top), v3(b.o, top - thick), v3(a.o, top - thick));
        quad(v3(b.i, top), v3(a.i, top), v3(a.i, top - thick), v3(b.i, top - thick));
        quad(v3(a.i, top - thick), v3(a.o, top - thick), v3(b.o, top - thick), v3(b.i, top - thick));
      }
      const f = cols[0];
      const l = cols[cols.length - 1];
      quad(v3(f.i, top), v3(f.o, top), v3(f.o, top - thick), v3(f.i, top - thick));
      quad(v3(l.o, top), v3(l.i, top), v3(l.i, top - thick), v3(l.o, top - thick));
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      sg.computeVertexNormals();
      sides.push(sg);
      edgePts.push(cols.map((c) => new THREE.Vector3(c.i.x, top + 0.03, c.i.y)));
      edgePts.push(cols.map((c) => new THREE.Vector3(c.o.x, top + 0.03, c.o.y)));
    }
    const topMesh = new THREE.Mesh(mergeGeometries(tops)!, new THREE.MeshStandardMaterial({ map: ringTexture(), roughness: 0.55, metalness: 0.1, emissive: new THREE.Color('#0f3a2c'), emissiveIntensity: 0.6 }));
    topMesh.receiveShadow = true;
    g.add(topMesh);
    // Sides and bottom: double sided so the winding never matters.
    g.add(new THREE.Mesh(mergeGeometries(sides)!, new THREE.MeshStandardMaterial({ color: '#1b2a4a', emissive: new THREE.Color('#10233a'), emissiveIntensity: 0.6, roughness: 0.7, side: THREE.DoubleSide, flatShading: true })));
    const tubes = edgePts.map((pts) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.07, 6, false));
    g.add(new THREE.Mesh(mergeGeometries(tubes)!, new THREE.MeshBasicMaterial({ color: new THREE.Color('#7dffc8').multiplyScalar(1.2) })));
    for (const b of ringBoxes()) this.colliders.push(box(b.x, b.z, b.hw, b.hd, b.rot, top, 0.3, false));

    // Comet lanes.
    for (const [a0, a1] of RING_LANES) {
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      const n = Math.ceil((a1 - a0) / 1.5);
      for (let k = 0; k <= n; k++) {
        const s = a0 + ((a1 - a0) * k) / n;
        const pi = ringPoint(s, RING.inner + 0.25);
        const po = ringPoint(s, RING.outer - 0.25);
        pos.push(pi.x, top + 0.035, pi.z, po.x, top + 0.035, po.z);
        uv.push(k / n, 0, k / n, 1);
        if (k > 0) {
          const a = (k - 1) * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      lg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      lg.setIndex(idx);
      const mat = new THREE.ShaderMaterial({ vertexShader: S.QUAD_VERT, fragmentShader: S.LANE_FRAG, uniforms: { ...uniforms, uBoost: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
      this.laneMats.push(mat);
      const lane = new THREE.Mesh(lg, mat);
      lane.renderOrder = 4;
      g.add(lane);
    }

    // Gates: one arch mesh and one shimmer film, instanced.
    const arch = new THREE.TubeGeometry(new ArchCurve(GATE_W, GATE_H), 48, 0.11, 8, false);
    this.gates = new THREE.InstancedMesh(arch, new THREE.MeshBasicMaterial({ color: '#ffffff' }), 16);
    const film = new THREE.ShapeGeometry(
      (() => {
        const sh = new THREE.Shape();
        const r = GATE_W / 2;
        sh.moveTo(-r, 0);
        sh.lineTo(-r, GATE_H - r);
        sh.absarc(0, GATE_H - r, r, Math.PI, 0, true);
        sh.lineTo(r, 0);
        sh.lineTo(-r, 0);
        return sh;
      })(),
      24,
    );
    this.films = new THREE.InstancedMesh(film, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 16);
    this.films.renderOrder = 5;
    g.add(this.gates, this.films);
    this.setGates(0, Array(16).fill('idle'));

    // Blossoms at the end of each run, across the walkway.
    RING_BLOSSOMS.forEach(([b0, b1]) => {
      const ids: number[] = [];
      const s = (b0 + b1) / 2;
      for (const r of [RING.inner + 1, RING.mid, RING.outer - 1]) {
        const p = ringPoint(s, r);
        const th = RING_THETA0 - (s * Math.PI) / 180;
        // Forward along the run is (sin th, -cos th).
        ids.push(blossomSys.add(p.x, top + 0.02, p.z, Math.atan2(Math.sin(th), -Math.cos(th))));
      }
      this.blossoms.push(ids);
    });

    // Start pad and the sling home.
    const sp = ringPoint(RING_START_S, RING.mid);
    this.start = slingPad(sp.x, top, sp.z, '#53f0c0', uniforms, miniature('ring', 0.8), g);
    this.start.beacon.u.uAlpha.value = 0.25;
    const bp = ringPoint(RING_RETURN_S, RING_BACK_R);
    this.back = slingPad(bp.x, top, bp.z, '#b9a4ff', uniforms, miniature('hub', 1.2), g);
    this.back.sign.set('Back to the Rim', null, false);
    this.start.sign.set('Ring run', null, false);
    const bb = ringPoint(RING_START_S - 4, RING.outer + 1.4);
    this.billboard.mesh.position.set(bb.x, top + 3.2, bb.z);
    this.billboard.mesh.lookAt(0, top + 2, 0);
    g.add(this.billboard.mesh);
    scene.add(g);
  }

  /** Places the current lap's gates, each with its state colour. */
  setGates(lap: number, states: GateState[]): void {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    RING_GATE_S.forEach((s, i) => {
      const side = (i + lap) % 2 === 0 ? 'in' : 'out';
      const c = side === 'in' ? RING.inner + 0.2 + GATE_W / 2 : RING.outer - 0.2 - GATE_W / 2;
      const pt = ringPoint(s, c);
      const th = RING_THETA0 - (s * Math.PI) / 180;
      p.set(pt.x, RING.top + 0.03, pt.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -th);
      const st = states[i] ?? 'idle';
      sc.setScalar(st === 'next' ? 1.06 : 1);
      m4.compose(p, q, sc);
      this.gates.setMatrixAt(i, m4);
      this.films.setMatrixAt(i, m4);
      const color = st === 'next' ? '#7dffc8' : st === 'hit' ? '#f4b740' : st === 'miss' ? '#e8574a' : st === 'done' ? '#2b5a4a' : '#3fb68b';
      this.gates.setColorAt(i, this.gateColor.set(color).multiplyScalar(st === 'next' ? 1.6 : 1));
      this.films.setColorAt(i, this.gateColor.set(color).multiplyScalar(st === 'next' ? 0.9 : st === 'done' ? 0.05 : 0.3));
    });
    this.gates.instanceMatrix.needsUpdate = true;
    this.films.instanceMatrix.needsUpdate = true;
    if (this.gates.instanceColor) this.gates.instanceColor.needsUpdate = true;
    if (this.films.instanceColor) this.films.instanceColor.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Cinder: the rock rain island

export type TileState = { state: 'whole' | 'cracked' | 'gone' | 'returning'; t: number; y: number };

function cinderTexture(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const make = (glow: boolean) => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = glow ? '#000' : '#2c2430';
    g.fillRect(0, 0, 256, 256);
    let s = 9;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    if (!glow) {
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(${60 + rnd() * 40},${50 + rnd() * 30},${60 + rnd() * 40},0.25)`;
        g.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 5, 2 + rnd() * 5);
      }
    }
    g.strokeStyle = glow ? '#fff' : '#7a3a20';
    g.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      let x = 128;
      let y = 128;
      g.moveTo(x, y);
      const a = (i / 7) * Math.PI * 2 + rnd();
      for (let k = 0; k < 6; k++) {
        x += Math.cos(a + (rnd() - 0.5) * 1.2) * 22;
        y += Math.sin(a + (rnd() - 0.5) * 1.2) * 22;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = glow ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    return t;
  };
  return { map: make(false), glow: make(true) };
}

export class Cinder {
  readonly group = new THREE.Group();
  readonly colliders: Collider[] = [];
  readonly tiles = cinderTiles();
  readonly tileState: TileState[];
  readonly start: SlingPad;
  readonly back: SlingPad;
  readonly billboard = new Billboard('#ff8a3d');
  private tileMesh: THREE.InstancedMesh;
  private tileCols: Collider[];
  private glow = 0;
  private m4 = new THREE.Matrix4();
  private c = new THREE.Color();
  readonly startSpot = { x: CINDER.x - 9.2, z: CINDER.z + 1.5 };
  readonly backSpot = { x: CINDER.x - 7.4, z: CINDER.z - 5.8 };

  constructor(scene: THREE.Scene, uniforms: Uniforms) {
    const g = this.group;
    const top = CINDER.top;
    const tex = cinderTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.glow, emissive: new THREE.Color('#ffffff'), roughness: 0.85, metalness: 0.05, flatShading: true });
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif');
    };
    mat.customProgramCacheKey = () => 'galaxy-cinder';
    const geo = new THREE.CylinderGeometry(1.17, 0.95, 0.8, 6).rotateY(Math.PI / 6).translate(0, -0.4, 0);
    this.tileMesh = new THREE.InstancedMesh(geo, mat, this.tiles.length);
    this.tileMesh.receiveShadow = true;
    this.tileState = this.tiles.map((_, i) => ({ state: 'whole', t: 0, y: top - ((i * 29) % 5) * 0.008 }));
    this.tileCols = this.tiles.map((t) => circle(CINDER.x + t.x, CINDER.z + t.z, 1.1, top, 0.3, false));
    g.add(this.tileMesh);
    this.paintTiles(0, 0);
    // The spire, with a ledge.
    const spireMat = veinMaterial('#2c2232', '#ff8a3d', { roughness: 0.8 });
    const spireParts: THREE.BufferGeometry[] = [];
    const ledge = new THREE.CylinderGeometry(1.8, 2.0, 2.4, 7).translate(0, 1.2, 0);
    const column = new THREE.CylinderGeometry(0.75, 1.05, 2.4, 6).translate(0, 3.6, 0);
    const tip = new THREE.ConeGeometry(0.75, 1.4, 6).translate(0, 5.5, 0);
    for (const p of [ledge, column, tip]) {
      const pos = p.getAttribute('position');
      const cols = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const band = Math.pow(Math.max(0, Math.sin(pos.getY(i) * 3.1 + Math.atan2(pos.getZ(i), pos.getX(i)) * 3)), 24);
        const v = 0.02 + band * 0.8;
        cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = v;
      }
      p.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      spireParts.push(p.toNonIndexed());
    }
    const spire = new THREE.Mesh(mergeGeometries(spireParts)!, spireMat);
    spire.position.set(CINDER.x, top, CINDER.z);
    spire.castShadow = true;
    g.add(spire);
    this.colliders.push(circle(CINDER.x, CINDER.z, 1.9, top + 2.4, 0.3, true), circle(CINDER.x, CINDER.z, 1.0, top + 4.8, 0.3, true));
    // Basalt roots with ember veins.
    const root = underside(CINDER.r, 13, 23, veinMaterial('#1e1822', '#ff8a3d', { roughness: 0.9 }), { top: top - 0.75 });
    root.position.set(CINDER.x, 0, CINDER.z);
    g.add(root);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(CINDER.r + 0.35, 0.06, 6, 120), new THREE.MeshBasicMaterial({ color: '#ff8a3d' }));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(CINDER.x, top - 0.25, CINDER.z);
    g.add(rim);
    this.start = slingPad(this.startSpot.x, top, this.startSpot.z, '#53f0c0', uniforms, miniature('storm', 0.8), g);
    this.start.sign.set('Rock rain', null, false);
    this.start.beacon.u.uAlpha.value = 0.25;
    this.back = slingPad(this.backSpot.x, top, this.backSpot.z, '#b9a4ff', uniforms, miniature('hub', 1.2), g);
    this.back.sign.set('Back to the Rim', null, false);
    this.billboard.mesh.position.set(CINDER.x - 12.6, top + 3.4, CINDER.z + 5.5);
    this.billboard.mesh.lookAt(0, top + 2, 2);
    g.add(this.billboard.mesh);
    scene.add(g);
  }

  /** The tiles you can stand on now. */
  tileColliders(): Collider[] {
    return this.tileCols.filter((_, i) => this.tileState[i].state !== 'gone');
  }

  /** The tile under a point, or -1. */
  tileAt(x: number, z: number): number {
    let best = -1;
    let bd = 1.25;
    this.tiles.forEach((t, i) => {
      const d = Math.hypot(CINDER.x + t.x - x, CINDER.z + t.z - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  /** A meteor lands: tiles in its radius crack, cracked ones fall. Returns the tiles that fell. */
  impact(x: number, z: number, r: number): number[] {
    const fell: number[] = [];
    this.tiles.forEach((t, i) => {
      const d = Math.hypot(CINDER.x + t.x - x, CINDER.z + t.z - z);
      if (d > r * 0.8) return;
      const s = this.tileState[i];
      if (s.state === 'whole') {
        s.state = 'cracked';
        s.t = 0;
      } else if (s.state === 'cracked') {
        s.state = 'gone';
        s.t = 0;
        fell.push(i);
      }
    });
    return fell;
  }

  reset(): void {
    for (const s of this.tileState) {
      if (s.state !== 'whole') {
        s.state = 'returning';
        s.t = 0;
      }
    }
  }

  step(dt: number): void {
    for (const s of this.tileState) {
      s.t += dt;
      if (s.state === 'gone' && s.t > 10) {
        s.state = 'returning';
        s.t = 0;
      } else if (s.state === 'returning' && s.t > 1) {
        s.state = 'whole';
        s.t = 0;
      }
    }
  }

  /** `glow` lights the cracks (Cinder opens at 3 stars). */
  paintTiles(time: number, glow: number): void {
    this.glow = glow;
    const top = CINDER.top;
    this.tiles.forEach((t, i) => {
      const s = this.tileState[i];
      let y = s.y;
      let scale = 1;
      let rot = 0;
      if (s.state === 'gone') {
        y = top - Math.min(30, 4 * s.t * s.t + s.t * 2);
        rot = s.t * 2;
        scale = Math.max(0, 1 - s.t * 0.4);
      } else if (s.state === 'returning') {
        const e = Math.min(1, s.t);
        y = top - (1 - e) * (1 - e) * 6;
        scale = e;
      }
      this.m4.makeRotationX(rot);
      this.m4.setPosition(CINDER.x + t.x, y, CINDER.z + t.z);
      if (scale !== 1) this.m4.scale(new THREE.Vector3(scale, scale, scale));
      this.tileMesh.setMatrixAt(i, this.m4);
      const flick = 0.75 + 0.25 * Math.sin(time * 9 + i * 1.7);
      const base = 0.25 + 0.35 * this.glow;
      const v = s.state === 'cracked' ? 1.4 * flick : s.state === 'returning' ? 0.9 : base * (0.85 + 0.15 * Math.sin(time * 1.3 + i));
      this.c.setRGB(1.0 * v, 0.45 * v, 0.18 * v);
      this.tileMesh.setColorAt(i, this.c);
    });
    this.tileMesh.instanceMatrix.needsUpdate = true;
    if (this.tileMesh.instanceColor) this.tileMesh.instanceColor.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// The Comet dock

/** Frosted ice for the dock's top: deep blue, frost rings and cracks. */
function iceTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(256, 256, 20, 256, 256, 256);
  grad.addColorStop(0, '#4f86b8');
  grad.addColorStop(0.7, '#2d5c8c');
  grad.addColorStop(1, '#6fb2e0');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  let s = 21;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // Frost speckle.
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(220,240,255,${0.05 + rnd() * 0.12})`;
    const r = rnd() * 2.2;
    g.beginPath();
    g.arc(rnd() * 512, rnd() * 512, r, 0, Math.PI * 2);
    g.fill();
  }
  // Rings and a six-armed frost star.
  g.strokeStyle = 'rgba(200,236,255,0.55)';
  g.lineWidth = 3;
  for (const r of [70, 150, 228]) {
    g.beginPath();
    g.arc(256, 256, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.lineWidth = 2;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    g.beginPath();
    g.moveTo(256, 256);
    g.lineTo(256 + Math.cos(a) * 240, 256 + Math.sin(a) * 240);
    g.stroke();
    for (let j = 1; j < 5; j++) {
      const bx = 256 + Math.cos(a) * j * 48;
      const by = 256 + Math.sin(a) * j * 48;
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(bx, by);
        g.lineTo(bx + Math.cos(a + side * 0.7) * 22, by + Math.sin(a + side * 0.7) * 22);
        g.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Dock {
  readonly group = new THREE.Group();
  readonly colliders: Collider[] = [];
  readonly comet = new THREE.Group();
  readonly start: SlingPad;
  readonly back: SlingPad;
  readonly billboard = new Billboard('#bfe8ff');
  readonly mooring = new THREE.Vector3(DOCK.x + 8.2, DOCK.top + 1.4, DOCK.z);
  readonly rideSpot = { x: DOCK.x + 5.4, z: DOCK.z };
  private tail: THREE.Mesh[] = [];
  readonly iceMat: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, uniforms: Uniforms) {
    const g = this.group;
    const top = DOCK.top;
    const ice = iceTexture();
    this.iceMat = new THREE.MeshStandardMaterial({ map: ice, color: '#ffffff', roughness: 0.22, metalness: 0.08, emissive: new THREE.Color('#3a8ad0'), emissiveMap: ice, emissiveIntensity: 0.35 });
    S.fakeIridescence(this.iceMat, uniforms, 0.3);
    // An ice disc with a faceted edge.
    const disc = new THREE.CylinderGeometry(DOCK.r, DOCK.r - 0.4, 1.2, 14).translate(0, -0.6, 0);
    const discMesh = new THREE.Mesh(disc, this.iceMat);
    discMesh.position.set(DOCK.x, top, DOCK.z);
    discMesh.receiveShadow = true;
    g.add(discMesh);
    // A crescent of ice spikes along the west side.
    const spikeMat = new THREE.MeshStandardMaterial({ color: '#d8f0ff', roughness: 0.1, emissive: new THREE.Color('#6cc4ff'), emissiveIntensity: 0.7, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.55 + (i / 8) * Math.PI * 0.9;
      const h = 1.6 + Math.sin(i * 1.7) * 0.6 + (i === 4 ? 1.4 : 0);
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.45 + (i % 3) * 0.12, h, 5), spikeMat);
      const x = DOCK.x + Math.cos(a) * (DOCK.r - 0.7);
      const z = DOCK.z + Math.sin(a) * (DOCK.r - 0.7);
      sp.position.set(x, top + h / 2 - 0.05, z);
      sp.rotation.z = Math.cos(a) * 0.25;
      sp.rotation.x = -Math.sin(a) * 0.25;
      sp.castShadow = true;
      g.add(sp);
      this.colliders.push(circle(x, z, 0.5, top + h, 0.3, false));
    }
    const root = underside(DOCK.r, 9, 37, veinMaterial('#4a7aa8', '#bfe8ff', { roughness: 0.2 }), { top: top - 1.15 });
    root.position.set(DOCK.x, 0, DOCK.z);
    g.add(root);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(DOCK.r + 0.05, 0.05, 6, 80), new THREE.MeshBasicMaterial({ color: '#bfe8ff' }));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(DOCK.x, top - 0.1, DOCK.z);
    g.add(rim);
    this.colliders.push(circle(DOCK.x, DOCK.z, DOCK.r, top, 0.3, false));

    // The moored comet: an icy nucleus and a long tail in the six streak colours.
    const nucleusGeo = new THREE.IcosahedronGeometry(1.0, 2);
    const p = nucleusGeo.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
      v.multiplyScalar(1 + (Math.sin(v.x * 5) * Math.cos(v.y * 4) * Math.sin(v.z * 6)) * 0.18);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    nucleusGeo.computeVertexNormals();
    const nucleus = new THREE.Mesh(nucleusGeo, new THREE.MeshStandardMaterial({ color: '#eaf8ff', emissive: new THREE.Color('#9fdcff'), emissiveIntensity: 0.9, roughness: 0.3, flatShading: true }));
    nucleus.name = 'nucleus';
    this.comet.add(nucleus);
    this.comet.add(glowSprite('#bfe8ff', 5, 0.9));
    const colors = ['#8a6bd1', '#3fb68b', '#4aa3df', '#f4b740', '#e8574a', '#fffaf0'];
    colors.forEach((c, i) => {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader: S.QUAD_VERT, fragmentShader: S.STREAK_FRAG.replace('varying vec3 vColor;', 'uniform vec3 vColor;'), uniforms: { vColor: { value: new THREE.Color(c) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      t.rotation.x = (i / colors.length) * Math.PI;
      t.scale.set(14 + i * 1.5, 1.1 - i * 0.08, 1);
      t.position.x = 7.5 + i * 0.6;
      // The quad's bright head is at +x; flip so it trails behind.
      t.rotation.y = Math.PI;
      this.tail.push(t);
      this.comet.add(t);
    });
    this.comet.position.copy(this.mooring);
    g.add(this.comet);
    this.start = slingPad(this.rideSpot.x - 0.4, top, this.rideSpot.z - 3.2, '#53f0c0', uniforms, miniature('comet', 0.8), g);
    this.start.group.visible = false;
    const bp = { x: DOCK.x - 2.5, z: DOCK.z + 2.8 };
    this.back = slingPad(bp.x, top, bp.z, '#b9a4ff', uniforms, miniature('hub', 1.2), g);
    this.back.sign.set('Back to the Rim', null, false);
    this.billboard.mesh.position.set(DOCK.x + 1, top + 3.6, DOCK.z - 6.2);
    this.billboard.mesh.lookAt(DOCK.x - 4, top + 2, DOCK.z + 6);
    g.add(this.billboard.mesh);
    scene.add(g);
  }

  update(dt: number, time: number, riding: boolean): void {
    const n = this.comet.getObjectByName('nucleus')!;
    n.rotation.y += dt * 0.6;
    n.rotation.x += dt * 0.25;
    if (!riding) {
      this.comet.position.set(this.mooring.x, this.mooring.y + Math.sin(time * 1.1) * 0.25, this.mooring.z);
      this.comet.rotation.set(0, 0, 0);
    }
    this.tail.forEach((t, i) => (t.rotation.x = (i / this.tail.length) * Math.PI + time * 0.4));
  }
}

// ---------------------------------------------------------------------------
// The Horizon stair

export class Stair {
  readonly group = new THREE.Group();
  readonly stones: THREE.Group[] = [];
  readonly blossoms: number[] = [];
  /** How many stones have settled (0 to 10). */
  settled = 0;
  private target = 0;
  private flyT: number[] = [];
  readonly lipBeam: ReturnType<typeof beam>;
  private cols: Collider[] = [];

  constructor(
    scene: THREE.Scene,
    uniforms: Uniforms,
    private blossomSys: Blossoms,
  ) {
    const mats = [veinMaterial('#2a6b58', '#3fb68b', { roughness: 0.4 }), veinMaterial('#2c2232', '#ff8a3d', { roughness: 0.85 }), veinMaterial('#8fc4e6', '#bfe8ff', { roughness: 0.2 })];
    STAIR.forEach((st, i) => {
      const g = new THREE.Group();
      const topGeo = new THREE.CylinderGeometry(st.r, st.r * 0.85, 0.6, 9).translate(0, -0.3, 0);
      const tp = topGeo.getAttribute('position');
      const tc = new Float32Array(tp.count * 3).fill(0.12);
      topGeo.setAttribute('color', new THREE.BufferAttribute(tc, 3));
      const top = new THREE.Mesh(topGeo.toNonIndexed(), mats[i % 3]);
      top.receiveShadow = true;
      g.add(top);
      g.add(underside(st.r, 3 + st.r, 50 + i, mats[i % 3], { top: -0.55, count: 6 }));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(st.r + 0.04, 0.04, 6, 48), new THREE.MeshBasicMaterial({ color: '#f4b740' }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.12;
      g.add(ring);
      g.position.set(st.x, st.y, st.z);
      g.visible = false;
      this.group.add(g);
      this.stones.push(g);
      this.flyT.push(0);
      if (i < STAIR.length - 1) {
        const nx = STAIR[i + 1];
        const yaw = Math.atan2(nx.x - st.x, nx.z - st.z);
        const off = st.r - 0.75;
        this.blossoms.push(blossomSys.add(st.x + Math.sin(yaw) * off, st.y + 0.02, st.z + Math.cos(yaw) * off, yaw, false));
      }
    });
    const lip = STAIR[STAIR.length - 1];
    this.lipBeam = beam('#f4b740', 26, 1.4, uniforms, 0);
    this.lipBeam.mesh.position.set(lip.x, lip.y, lip.z);
    this.group.add(this.lipBeam.mesh);
    scene.add(this.group);
  }

  /** How many stones should be in place. New ones fly in from orbit unless `instant`. */
  setCount(n: number, instant: boolean): void {
    this.target = n;
    if (instant) {
      this.settled = n;
      this.stones.forEach((s, i) => {
        s.visible = i < n;
        this.flyT[i] = i < n ? 9 : 0;
        const st = STAIR[i];
        s.position.set(st.x, st.y, st.z);
      });
    }
    this.cols = [];
  }

  colliders(): Collider[] {
    if (this.cols.length !== this.settled) this.cols = STAIR.slice(0, this.settled).map((s) => circle(s.x, s.z, s.r, s.y, 0.3, false));
    return this.cols;
  }

  /** Animates stones flying in; returns the index of a stone that just locked, or -1. */
  update(dt: number, time: number, hole: THREE.Vector3): number {
    let locked = -1;
    this.stones.forEach((s, i) => {
      const st = STAIR[i];
      if (i >= this.target) {
        s.visible = false;
        return;
      }
      s.visible = true;
      if (i >= this.settled) {
        // One at a time, in order.
        if (i > this.settled) {
          s.visible = false;
          return;
        }
        this.flyT[i] += dt;
        const t = Math.min(1, this.flyT[i] / 2.2);
        const e = 1 - Math.pow(1 - t, 3);
        const a = time * 0.6 + i;
        const from = new THREE.Vector3(hole.x + Math.cos(a) * 26, hole.y + 4, hole.z + Math.sin(a) * 26);
        s.position.lerpVectors(from, new THREE.Vector3(st.x, st.y, st.z), e);
        s.rotation.y = (1 - e) * 6;
        if (t >= 1) {
          s.position.set(st.x, st.y, st.z);
          s.rotation.y = 0;
          this.settled = i + 1;
          locked = i;
        }
      } else {
        s.position.y = st.y;
      }
    });
    this.blossoms.forEach((id, i) => this.blossomSys.show(id, i + 1 < this.settled));
    this.lipBeam.u.uAlpha.value += ((this.settled >= STAIR.length ? 0.7 : 0) - this.lipBeam.u.uAlpha.value) * Math.min(1, dt * 2);
    return locked;
  }
}
