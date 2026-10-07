// The paddock: the only place you walk. It sits outside the start straight
// with your kart in its pit box, the timing tower, the podium, the trophy
// cabinet, the framed sketch and the exit door. A boom gate keeps walkers
// off the track and lifts for karts.
//
// Local axes: u runs along the start straight (+u is the race direction),
// v runs away from the road. The fence is at v 11; the back at v 41.

import * as THREE from 'three';
import type { Theme } from '../../../shared/kart/circuits';
import { box, type Collider } from '../../../world/physics';
import type { Circuit } from '../circuit';
import { PAL, flag } from './props';
import { Batch, Shape, ball, cone, cyl, rbox, torus, xform } from './shape';
import { LAYER, decal } from './road';
import type { TexCache } from './textures';

export const PADDOCK = {
  arrival: [-4, 24.5] as const,
  kart: [-4, 17] as const,
  door: [-4, 32.6] as const,
  tower: [17, 21] as const,
  podium: [-21, 21] as const,
  cabinet: [-15, 31] as const,
  sketch: [8, 31] as const,
  gate: [30, 11] as const,
  fence: 11,
  back: 34,
  half: 34,
};

export interface PaddockBuild {
  arrival: { x: number; z: number; yaw: number };
  door: { x: number; z: number };
  kart: { x: number; z: number; yaw: number };
  /** The pit box: stop here in your kart for the race menu. */
  box: { x: number; z: number };
  tower: THREE.Mesh;
  towerAt: { x: number; z: number };
  podium: { x: number; z: number; yaw: number };
  cabinet: THREE.Group;
  cabinetAt: { x: number; z: number; yaw: number };
  sketch: THREE.Mesh;
  sketchAt: { x: number; z: number };
  gateArm: THREE.Object3D;
  gateCollider: Collider;
  ring: THREE.Mesh;
  /** Walkable area bounds (local), for checks. */
  inside(x: number, z: number): boolean;
}

const LOOK: Record<Theme, { floor: string; floorB: string; fence: string; post: string; tower: string; accent: string }> = {
  playroom: { floor: '#e9dcc4', floorB: '#d8c8aa', fence: PAL.cream, post: PAL.tomato, tower: '#2f3a56', accent: PAL.sun },
  garden: { floor: '#c9a26e', floorB: '#b98a5e', fence: PAL.cream, post: PAL.cream, tower: '#3f6e4a', accent: PAL.tomato },
  beach: { floor: '#c79a68', floorB: '#b5875a', fence: '#fff3d6', post: PAL.sky, tower: '#1f5f8b', accent: PAL.sun },
  bedroom: { floor: '#5a46a0', floorB: '#4c3a8c', fence: '#7ef0ff', post: '#ff8fd1', tower: '#22204a', accent: '#7ef0ff' },
};

export function buildPaddock(c: Circuit, batch: Batch, group: THREE.Group, tex: TexCache, colliders: Collider[], ownerName: string): PaddockBuild {
  const look = LOOK[c.theme];
  const P = (u: number, v: number) => c.pad(u, v);
  const yawOf = (du: number, dv: number) => c.padYaw(du, dv);
  /** A matrix at paddock (u, v), height y, facing along (du, dv). */
  const at = (u: number, v: number, y: number, du = 0, dv = -1) => {
    const q = P(u, v);
    return xform(q.x, y, q.z, 0, yawOf(du, dv), 0);
  };
  const H = PADDOCK.half;

  // ---- Floor: a printed mat just above the ground (prints layer), one big picture per theme.
  const FW = H * 2;
  const FD = PADDOCK.back - PADDOCK.fence + 2;
  const floorTex = tex.get(`pfloor-${c.theme}`, 1024, 512, (g, w, h) => paintFloor(g, w, h, c.theme, look));
  floorTex.wrapS = floorTex.wrapT = THREE.ClampToEdgeWrapping;
  const floorGeo = new THREE.PlaneGeometry(FW, FD).rotateX(-Math.PI / 2);
  const fc = P(0, (PADDOCK.back + PADDOCK.fence) / 2 + 0.5);
  floorGeo.rotateY(yawOf(1, 0) - Math.PI / 2);
  floorGeo.translate(fc.x, LAYER.prints, fc.z);
  batch.raw(floorGeo, new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }), { receive: true });

  // ---- Fence along the track side with a gap for the pit exit, and the sides.
  const fence = new Shape();
  const gate0 = PADDOCK.gate[0] - 4;
  const gate1 = PADDOCK.gate[0] + 4;
  const runFence = (u0: number, u1: number, v0: number, v1: number, firstPost = true) => {
    const len = Math.hypot(u1 - u0, v1 - v0);
    const n = Math.max(1, Math.round(len / 2.4));
    for (let i = firstPost ? 0 : 1; i <= n; i++) {
      const u = u0 + ((u1 - u0) * i) / n;
      const v = v0 + ((v1 - v0) * i) / n;
      batch.shape(new Shape().at(rbox(0.28, 1.3, 0.28, 0.08), look.post, 0, 0.65, 0).at(ball(0.2, 8, 6), look.accent, 0, 1.4, 0), at(u, v, 0), 'plastic');
    }
    const mid = { u: (u0 + u1) / 2, v: (v0 + v1) / 2 };
    for (const y of [0.55, 1.05]) batch.part(rbox(len, 0.14, 0.12, 0.05), look.fence, at(mid.u, mid.v, y, u1 - u0, v1 - v0).multiply(xform(0, 0, 0, 0, Math.PI / 2, 0)), 'plastic');
    const a = P(u0, v0);
    const b = P(u1, v1);
    colliders.push(box((a.x + b.x) / 2, (a.z + b.z) / 2, 0.2, len / 2 + 0.2, Math.atan2(b.x - a.x, b.z - a.z), 1.4, 0.3, false));
  };
  runFence(-H, gate0, PADDOCK.fence, PADDOCK.fence);
  // The gap can reach the corner: then the side fence brings its own corner post.
  const rightRun = H - gate1 > 0.5;
  if (rightRun) runFence(gate1, H, PADDOCK.fence, PADDOCK.fence);
  // The side fences start at the corner posts the front fence already has.
  runFence(-H, -H, PADDOCK.fence, PADDOCK.back, false);
  runFence(H, H, PADDOCK.fence, PADDOCK.back, !rightRun);
  void fence;

  // ---- Boom gate at the pit exit: a collider on foot, lifted for karts.
  const gp = P(gate0 - 0.4, PADDOCK.fence);
  batch.shape(new Shape().at(rbox(0.6, 1.4, 0.6, 0.12), look.tower, 0, 0.7, 0).at(ball(0.18, 10, 8), PAL.tomato, 0, 1.55, 0), at(gate0 - 0.4, PADDOCK.fence, 0), 'plastic');
  const arm = new THREE.Group();
  arm.position.set(gp.x, 1.15, gp.z);
  arm.rotation.y = yawOf(1, 0) - Math.PI / 2;
  const armShape = new Shape();
  for (let i = 0; i < 7; i++) armShape.at(rbox(1.0, 0.16, 0.16, 0.05), i % 2 ? PAL.cream : PAL.tomato, 0.5 + i * 1.0, 0, 0);
  const armMesh = armShape.mesh('plastic');
  arm.add(armMesh);
  group.add(arm);
  const gc = P(PADDOCK.gate[0], PADDOCK.fence);
  const gateCollider = box(gc.x, gc.z, 0.25, 4.4, yawOf(1, 0), 1.4, 0.3, false);

  // ---- Pit box: painted bay with your name, and a glowing ring round the kart.
  const kq = P(PADDOCK.kart[0], PADDOCK.kart[1]);
  const kyaw = yawOf(1, 0);
  const bayTex = tex.get('bay', 256, 384, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#fffaf0';
    g.lineWidth = 14;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = 'rgba(255,210,74,0.9)';
    g.font = `bold 52px system-ui`;
    g.textAlign = 'center';
    g.fillText('PIT', w / 2, h - 40);
  });
  const bay = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 5.2).rotateX(-Math.PI / 2), decal(new THREE.MeshStandardMaterial({ map: bayTex, transparent: true, roughness: 0.8, depthWrite: false }), 2));
  bay.position.set(kq.x, LAYER.prints + 0.006, kq.z);
  bay.rotation.y = kyaw;
  bay.renderOrder = 1;
  group.add(bay);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.25, 40).rotateX(-Math.PI / 2), ringMat);
  ring.position.set(kq.x, LAYER.glow - 0.02, kq.z);
  ring.renderOrder = 2;
  group.add(ring);

  // ---- Timing tower: a tall board on legs, facing the arrival point and the track.
  const tq = P(PADDOCK.tower[0], PADDOCK.tower[1]);
  const tyaw = yawOf(-0.35, -1);
  const towerShape = new Shape();
  for (const sx of [-1.7, 1.7]) towerShape.at(rbox(0.5, 9.6, 0.5, 0.1), look.tower, sx, 4.8, -0.2);
  towerShape.at(rbox(4.4, 7.2, 0.5, 0.18), look.tower, 0, 5.6, -0.25);
  towerShape.at(rbox(4.8, 0.8, 0.8, 0.2), look.accent, 0, 9.6, -0.2);
  towerShape.at(ball(0.35, 12, 9), PAL.tomato, 0, 10.3, -0.2);
  batch.shape(towerShape, xform(tq.x, 0, tq.z, 0, tyaw, 0), 'plastic');
  const tower = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 6.6), new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.35 }));
  const tf = { x: Math.sin(tyaw), z: Math.cos(tyaw) };
  tower.position.set(tq.x + tf.x * 0.02, 5.6, tq.z + tf.z * 0.02);
  tower.rotation.y = tyaw;
  group.add(tower);
  colliders.push(box(tq.x, tq.z, 2.2, 0.5, tyaw, 9.6, 0.3, true));

  // ---- Podium: three numbered toy blocks.
  const pq = P(PADDOCK.podium[0], PADDOCK.podium[1]);
  const pyaw = yawOf(0.25, -1);
  const pod = new Shape();
  const steps: [number, number, string][] = [
    [0, 1.6, PAL.sun],
    [-2.3, 1.1, '#c9d2e3'],
    [2.3, 0.75, '#e0a06a'],
  ];
  for (const [x, h, col] of steps) {
    pod.at(rbox(2.2, h, 2.2, 0.12), col, x, h / 2, 0);
    pod.at(rbox(1.6, 0.04, 1.6, 0.02), PAL.cream, x, h + 0.02, 0);
  }
  batch.shape(pod, xform(pq.x, 0, pq.z, 0, pyaw, 0), 'plastic');
  const numTex = tex.get('podnums', 384, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#1d1830';
    g.font = `bold ${h * 0.8}px system-ui`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    ['2', '1', '3'].forEach((n, i) => g.fillText(n, (i + 0.5) * (w / 3), h / 2));
  });
  // The numbers on the front faces, a centimetre proud of the blocks.
  const nmat = new THREE.MeshStandardMaterial({ map: numTex, transparent: true, roughness: 0.7 });
  const pf = { x: Math.sin(pyaw), z: Math.cos(pyaw) };
  const pr = { x: Math.cos(pyaw), z: -Math.sin(pyaw) };
  [
    [-2.3, 1.1, 0],
    [0, 1.6, 1],
    [2.3, 0.75, 2],
  ].forEach(([x, h, i]) => {
    const g = new THREE.PlaneGeometry(1.1, 1.1);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 3);
    const m = new THREE.Mesh(g, nmat);
    m.position.set(pq.x + pr.x * x + pf.x * 1.112, h / 2, pq.z + pr.z * x + pf.z * 1.112);
    m.rotation.y = pyaw;
    group.add(m);
  });
  colliders.push(box(pq.x, pq.z, 3.5, 1.2, pyaw, 1.6, 0.3, false));

  // ---- Trophy cabinet: a glass-fronted case; trophies are added at run time.
  const cq = P(PADDOCK.cabinet[0], PADDOCK.cabinet[1]);
  const cyaw = yawOf(0, -1);
  const cab = new Shape();
  cab.at(rbox(6.2, 3.6, 1.2, 0.12), PAL.woodDark, 0, 1.8, -0.2);
  cab.at(rbox(5.8, 3.2, 0.1, 0.03), '#4a3a5a', 0, 1.85, -0.72);
  for (const y of [0.35, 1.45, 2.55]) cab.at(rbox(5.8, 0.08, 1.0, 0.02), PAL.wood, 0, y, -0.15);
  cab.at(rbox(6.6, 0.3, 1.5, 0.1), look.accent, 0, 3.7, -0.2);
  batch.shape(cab, xform(cq.x, 0, cq.z, 0, cyaw, 0), 'plastic');
  const cabinet = new THREE.Group();
  cabinet.position.set(cq.x, 0, cq.z);
  cabinet.rotation.y = cyaw;
  group.add(cabinet);
  colliders.push(box(cq.x, cq.z, 3.2, 0.8, cyaw, 3.8, 0.3, true));

  // ---- The framed sketch on an easel.
  const eq = P(PADDOCK.sketch[0], PADDOCK.sketch[1]);
  const eyaw = yawOf(0.2, -1);
  const easel = new Shape();
  for (const sx of [-1, 1]) easel.at(rbox(0.16, 3.6, 0.16, 0.04), PAL.wood, sx * 1.3, 1.75, 0.2, -0.12, 0, sx * -0.06);
  easel.at(rbox(0.16, 3.4, 0.16, 0.04), PAL.wood, 0, 1.6, -0.6, 0.3, 0, 0);
  easel.at(rbox(3.4, 2.6, 0.18, 0.06), PAL.sun, 0, 2.2, 0.32, -0.12, 0, 0);
  easel.at(rbox(3.0, 0.12, 0.4, 0.03), PAL.wood, 0, 0.82, 0.44);
  batch.shape(easel, xform(eq.x, 0, eq.z, 0, eyaw, 0), 'plastic');
  const sketch = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.2), new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.9 }));
  const ef = { x: Math.sin(eyaw), z: Math.cos(eyaw) };
  sketch.position.set(eq.x + ef.x * 0.43, 2.2 + 0.01, eq.z + ef.z * 0.43);
  sketch.rotation.set(0, eyaw, 0, 'YXZ');
  sketch.rotateX(-0.12);
  group.add(sketch);
  colliders.push(box(eq.x, eq.z, 1.6, 0.6, eyaw, 3.4, 0.3, false));

  // ---- Exit door, set in the back wall, with a sign.
  const dq = P(PADDOCK.door[0], PADDOCK.door[1] + 1.4);
  const dyaw = yawOf(0, -1);
  const door = new Shape();
  door.at(rbox(3.6, 4.0, 0.6, 0.15), look.post, 0, 2.0, 0);
  door.at(rbox(2.5, 3.0, 0.7, 0.1), '#2b2340', 0, 1.5, 0);
  door.at(ball(0.12, 8, 6), PAL.sun, 0.8, 1.4, 0.38);
  batch.shape(door, xform(dq.x, 0, dq.z, 0, dyaw, 0), 'plastic');
  colliders.push(box(dq.x, dq.z, 1.8, 0.4, dyaw, 4, 0.3, true));
  const doorSign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 0.7),
    new THREE.MeshStandardMaterial({
      map: tex.get(`doorsign`, 512, 100, (g, w, h) => {
        g.fillStyle = '#fffaf0';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#2b2340';
        g.font = `bold ${h * 0.46}px system-ui`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(`Back to ${ownerName}'s room`, w / 2, h / 2, w * 0.92);
      }),
      roughness: 0.8,
    }),
  );
  const df = { x: Math.sin(dyaw), z: Math.cos(dyaw) };
  doorSign.position.set(dq.x + df.x * 0.31, 4.45, dq.z + df.z * 0.31);
  doorSign.rotation.y = dyaw;
  group.add(doorSign);

  // ---- Flags along the fence, and the pit garage over your kart.
  for (const u of [-34, -17, 0, 17, 26]) batch.shape(flag([PAL.tomato, PAL.sky, PAL.sun, PAL.mint, PAL.gum][Math.abs(u) % 5], 3.4), at(u, PADDOCK.fence, 0, 1, 0), 'plastic');
  {
    // A striped lean-to over the pit box, its two posts on the track side so nothing stands between you and your kart.
    const k = c.paddock;
    const cy = Math.atan2(-k.vz, k.vx);
    const g = new Shape();
    for (const sz of [-3.2, 3.2]) g.at(cyl(0.12, 0.14, 3.9, 10), look.tower, -3.4, 1.95, sz);
    const stripes = 8;
    for (let i = 0; i < stripes; i++) g.at(rbox(5.4, 0.12, 7.4 / stripes + 0.004, 0), i % 2 ? look.accent : PAL.cream, -1.0, 4.0 + i * 0.002, -3.7 + (i + 0.5) * (7.4 / stripes), 0, 0, -0.12);
    for (let i = 0; i < 9; i++) g.at(cone(0.42, 0.6, 3), i % 2 ? look.accent : look.post, 1.7, 3.45, -3.6 + i * 0.9, Math.PI, Math.PI / 2, 0, 1, 1, 0.25);
    batch.shape(g, xform(kq.x, 0, kq.z, 0, cy, 0));
    for (const sz of [-3.2, 3.2]) {
      const q = { x: kq.x + Math.cos(cy) * -3.4 + Math.sin(cy) * sz, z: kq.z - Math.sin(cy) * -3.4 + Math.cos(cy) * sz };
      colliders.push({ kind: 'circle', x: q.x, z: q.z, r: 0.18, h: 3.9, bounce: 0.3, blocksCamera: false });
    }
    // Pit things: a tool chest, spare wheels, a fuel can and cones.
    const pit = new Shape();
    pit.at(rbox(1.4, 1.6, 0.8, 0.08), PAL.tomato, 0, 0.8, 0);
    for (let k = 0; k < 4; k++) pit.at(rbox(1.3, 0.04, 0.02, 0), '#1d1830', 0, 0.4 + k * 0.35, 0.41);
    pit.at(rbox(1.5, 0.12, 0.9, 0.04), '#c9c6d6', 0, 1.66, 0);
    batch.shape(pit, at(-10, 15, 0, 1, 0));
    colliders.push(box(P(-10, 15).x, P(-10, 15).z, 0.8, 0.5, kyaw, 1.7, 0.3, false));
    const tyres = new Shape();
    for (let k = 0; k < 3; k++) tyres.at(torus(0.42, 0.18, 8, 16), '#24212e', 0, 0.18 + k * 0.36, 0, Math.PI / 2, 0, 0);
    tyres.at(torus(0.42, 0.18, 8, 16), '#24212e', 1.2, 0.18, 0.3, Math.PI / 2, 0, 0);
    batch.shape(tyres, at(2.5, 15, 0, 1, 0));
    colliders.push({ kind: 'circle', x: P(2.5, 15).x, z: P(2.5, 15).z, r: 0.7, h: 1.1, bounce: 0.6, blocksCamera: false });
    const can = new Shape().at(rbox(0.6, 0.8, 0.35, 0.08), PAL.sun, 0, 0.4, 0).at(cyl(0.08, 0.08, 0.3, 8), PAL.ink, 0.18, 0.9, 0, 0, 0, -0.5);
    batch.shape(can, at(-11.6, 16.2, 0, 1, 0));
    for (const [u, v] of [
      [-30, 13.5],
      [-26, 13.5],
      [24, 13.5],
    ]) batch.shape(new Shape().at(cone(0.3, 0.8, 10), '#ff7a3d', 0, 0.45, 0).at(rbox(0.6, 0.06, 0.6, 0), '#ff7a3d', 0, 0.03, 0).at(cyl(0.2, 0.25, 0.12, 10), '#fffaf0', 0, 0.5, 0), at(u, v, 0, 1, 0));
  }
  void torus;

  const arrival = P(PADDOCK.arrival[0], PADDOCK.arrival[1]);
  const doorSpot = P(PADDOCK.door[0], PADDOCK.door[1]);
  return {
    arrival: { x: arrival.x, z: arrival.z, yaw: yawOf(0, -1) },
    door: doorSpot,
    kart: { x: kq.x, z: kq.z, yaw: kyaw },
    box: { x: kq.x, z: kq.z },
    tower,
    towerAt: tq,
    podium: { x: pq.x, z: pq.z, yaw: pyaw },
    cabinet,
    cabinetAt: { x: cq.x, z: cq.z, yaw: cyaw },
    sketch,
    sketchAt: eq,
    gateArm: arm,
    gateCollider,
    ring,
    inside: (x, z) => {
      const k = c.paddock;
      const dx = x - k.ox;
      const dz = z - k.oz;
      const u = dx * k.ux + dz * k.uz;
      const v = dx * k.vx + dz * k.vz;
      return Math.abs(u) <= H && v >= PADDOCK.fence && v <= PADDOCK.back;
    },
  };
}

/** The paddock's floor picture: a play mat, a deck, a boardwalk or a rug. */
function paintFloor(g: CanvasRenderingContext2D, w: number, h: number, theme: Theme, look: { floor: string; floorB: string; accent: string; post: string }): void {
  const r = (() => {
    let s = 29;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  })();
  if (theme === 'playroom') {
    // A town play mat: grass blocks, a grey road loop, little houses, a pond and a zebra crossing.
    g.fillStyle = '#9ad06a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#86c05a';
    for (let i = 0; i < 40; i++) g.fillRect(r() * w, r() * h, 30 + r() * 60, 20 + r() * 40);
    g.strokeStyle = '#8c8a9a';
    g.lineWidth = 46;
    g.lineJoin = 'round';
    g.beginPath();
    g.roundRect(70, 70, w - 140, h - 140, 60);
    g.moveTo(w / 2, 70);
    g.lineTo(w / 2, h - 70);
    g.stroke();
    g.strokeStyle = '#fffaf0';
    g.lineWidth = 4;
    g.setLineDash([22, 18]);
    g.beginPath();
    g.roundRect(70, 70, w - 140, h - 140, 60);
    g.moveTo(w / 2, 70);
    g.lineTo(w / 2, h - 70);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#fffaf0';
    for (let i = 0; i < 6; i++) g.fillRect(w / 2 - 23 + i * 8, h / 2 - 30, 5, 60);
    g.fillStyle = '#5fb8e8';
    g.beginPath();
    g.ellipse(w * 0.75, h * 0.5, 70, 44, 0, 0, Math.PI * 2);
    g.fill();
    const houses = ['#e8574a', '#ffd24a', '#4aa3df', '#ef6fa0', '#8a6bd1'];
    for (let i = 0; i < 9; i++) {
      const x = 130 + ((i * 113) % (w - 260));
      const y = i % 2 ? 130 : h - 190;
      if (Math.abs(x - w / 2) < 60) continue;
      g.fillStyle = houses[i % 5];
      g.fillRect(x, y, 46, 40);
      g.fillStyle = '#7a4a32';
      g.beginPath();
      g.moveTo(x - 6, y);
      g.lineTo(x + 23, y - 24);
      g.lineTo(x + 52, y);
      g.fill();
      g.fillStyle = '#fffaf0';
      g.fillRect(x + 16, y + 18, 14, 22);
    }
    for (let i = 0; i < 14; i++) {
      g.fillStyle = '#3f9e55';
      g.beginPath();
      g.arc(100 + r() * (w - 200), 100 + r() * (h - 200), 10 + r() * 8, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#4aa3df';
    g.lineWidth = 16;
    g.strokeRect(8, 8, w - 16, h - 16);
    return;
  }
  if (theme === 'bedroom') {
    // A round-cornered rug with stars and a moon.
    g.fillStyle = look.floor;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = look.floorB;
    g.lineWidth = 26;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.roundRect(30 + k * 40, 30 + k * 40, w - 60 - k * 80, h - 60 - k * 80, 60);
      g.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const x = 80 + r() * (w - 160);
      const y = 80 + r() * (h - 160);
      g.fillStyle = ['#7ef0ff', '#ff8fd1', '#ffe9a8', '#b6ff8a'][i % 4];
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 ? 6 : 15;
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.fill();
    }
    g.fillStyle = '#ffe9a8';
    g.beginPath();
    g.arc(w * 0.82, h * 0.3, 40, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = look.floor;
    g.beginPath();
    g.arc(w * 0.82 + 18, h * 0.3 - 10, 36, 0, Math.PI * 2);
    g.fill();
    return;
  }
  // Decks and boardwalks: long planks with grain, gaps and nail heads.
  const n = 22;
  for (let i = 0; i < n; i++) {
    const y = (i * h) / n;
    g.fillStyle = i % 3 === 0 ? look.floorB : i % 3 === 1 ? look.floor : '#c49a64';
    g.fillRect(0, y, w, h / n);
    for (let k = 0; k < 14; k++) {
      g.fillStyle = `rgba(80,45,20,${0.05 + r() * 0.07})`;
      g.fillRect(r() * w, y + r() * (h / n), 40 + r() * 140, 1.5);
    }
    g.fillStyle = 'rgba(60,35,20,0.55)';
    g.fillRect(0, y, w, 2);
    const off = (i * 157) % 300;
    for (let x = off; x < w; x += 300) {
      g.fillRect(x, y, 2, h / n);
      g.fillStyle = 'rgba(40,30,30,0.6)';
      g.fillRect(x + 6, y + h / n / 2 - 2, 3, 3);
      g.fillRect(x - 9, y + h / n / 2 - 2, 3, 3);
      g.fillStyle = 'rgba(60,35,20,0.55)';
    }
  }
  if (theme === 'garden') {
    // A checked picnic rug laid on the deck.
    g.fillStyle = 'rgba(232,87,74,0.85)';
    const x0 = w * 0.6;
    const y0 = h * 0.18;
    for (let i = 0; i < 8; i++) {
      g.fillRect(x0 + i * 30, y0, 15, 240);
      g.fillRect(x0, y0 + i * 30, 240, 15);
    }
  }
}
