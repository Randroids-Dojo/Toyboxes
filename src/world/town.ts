// The outdoor hub: a round plaza with a clock tower, a ring road for the
// vehicles, twelve claimable houses and the two arcade fronts.

import * as THREE from 'three';
import { ARCADES, SLOT_COUNT, TRIM_COLORS, type ArcadeId, type PropPlacement, type SlotSummary } from '../shared/model';
import { DISPLAY_FONT, cached, lightPoolTexture, mesh, plastic, roundBox, sign, signTexture } from './kit';
import { placeColliders, spaceChakra, vibeCoded } from './arcades';
import { box, circle, type Collider } from './physics';

export const PLAZA_R = 15;
export const ROAD_IN = 15.5;
export const ROAD_OUT = 23;
export const HOUSE_R = 31;
export const WORLD_R = 45;

/** Clockwise from just south of east, round through south to the west. */
export const HOUSE_ANGLES = Array.from({ length: SLOT_COUNT }, (_, i) => ((70 + i * 20) * Math.PI) / 180);
const ARCADE_ANGLES: Record<ArcadeId, number> = { spacechakra: (-36 * Math.PI) / 180, vibecoded: (36 * Math.PI) / 180 };

/** Position on a circle where angle 0 is north (-z) and angles grow clockwise seen from above. */
export function polar(angle: number, r: number): { x: number; z: number } {
  return { x: Math.sin(angle) * r, z: -Math.cos(angle) * r };
}

export interface Entrance {
  kind: 'house' | 'arcade';
  slot: number;
  arcade: ArcadeId | null;
  /** Where the player stands to use the door. */
  x: number;
  z: number;
  /** Facing away from the door, towards the plaza. */
  outYaw: number;
}

const HOUSE_WALLS = ['#fff4de', '#fde6d8', '#e8f1f7', '#fff0c9', '#eef3e2', '#f4e6f4'];
const ROOF_DEFAULT = '#b8aea0';

class House {
  readonly group = new THREE.Group();
  readonly entrance: Entrance;
  private signMesh: THREE.Mesh | null = null;
  private roofMat: THREE.MeshStandardMaterial;
  private doorMat: THREE.MeshStandardMaterial;
  private star: THREE.Mesh;
  private flag: THREE.Group;
  readonly windowMat: THREE.MeshStandardMaterial;
  readonly porchMat: THREE.MeshStandardMaterial;
  private current = '';
  private night = 0;

  constructor(readonly slot: number) {
    const a = HOUSE_ANGLES[slot];
    const p = polar(a, HOUSE_R);
    const rot = -a;
    this.group.position.set(p.x, 0, p.z);
    this.group.rotation.y = rot;
    const wall = plastic(HOUSE_WALLS[slot % HOUSE_WALLS.length], { rough: 0.85 });
    this.roofMat = new THREE.MeshStandardMaterial({ color: ROOF_DEFAULT, roughness: 0.55 });
    this.doorMat = new THREE.MeshStandardMaterial({ color: '#8d8174', roughness: 0.5 });
    this.windowMat = new THREE.MeshStandardMaterial({ color: '#9fc6dd', roughness: 0.2, emissive: new THREE.Color('#ffc46b'), emissiveIntensity: 0 });
    this.porchMat = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: new THREE.Color('#ffcf7a'), emissiveIntensity: 0, roughness: 0.4 });

    this.group.add(mesh(roundBox(7, 3.6, 6, 0.18), wall, 0, 1.8, 0));
    // Gabled roof from two tilted slabs.
    for (const sx of [-1, 1]) {
      const slab = mesh(roundBox(4.25, 0.32, 6.8, 0.12), this.roofMat, sx * 1.85, 4.55, 0);
      slab.rotation.z = -sx * 0.5;
      this.group.add(slab);
    }
    // A triangular prism fills the gable ends under the roof.
    const gable = mesh(cached('gable', () => new THREE.CylinderGeometry(4.04, 4.04, 5.9, 3).rotateX(-Math.PI / 2)), wall, 0, 4.18, 0);
    gable.scale.set(1, 0.289, 1);
    this.group.add(gable);
    this.group.add(mesh(roundBox(0.7, 1.2, 0.7, 0.08), plastic('#c9796b', { rough: 0.8 }), 2.0, 5.3, -1.2));

    this.group.add(mesh(roundBox(1.75, 2.6, 0.24, 0.07), plastic('#fbf8f0'), 0, 1.3, 3.02));
    this.group.add(mesh(roundBox(1.35, 2.3, 0.2, 0.08), this.doorMat, 0, 1.15, 3.1));
    this.group.add(mesh(cached('knob', () => new THREE.SphereGeometry(0.07, 8, 6)), plastic('#f4b740', { rough: 0.3 }), 0.45, 1.15, 3.24));
    for (const sx of [-1, 1]) {
      this.group.add(mesh(roundBox(1.5, 1.3, 0.16, 0.06), plastic('#fbf8f0'), sx * 2.35, 1.95, 3.0));
      this.group.add(mesh(roundBox(1.2, 1.0, 0.12, 0.04), this.windowMat, sx * 2.35, 1.95, 3.06, { cast: false }));
    }
    for (const sx of [-1.25, 1.25]) {
      this.group.add(mesh(cached('porch', () => new THREE.SphereGeometry(0.15, 12, 8)), this.porchMat, sx, 2.45, 3.22, { cast: false }));
    }
    // Number plaque.
    const plaque = sign(String(slot + 1), 0.5, 0.5, { bg: '#2b2340', fg: '#fffaf0', radius: 0.25 });
    plaque.position.set(1.25, 1.6, 3.06);
    this.group.add(plaque);
    // Path to the sidewalk.
    const path = mesh(roundBox(1.8, 0.06, 4.2, 0.03), plastic('#e2d6c2', { rough: 0.95 }), 0, 0.055, 5.1, { cast: false });
    this.group.add(path);

    // A little flag in the yard marks a house nobody has claimed yet.
    this.flag = new THREE.Group();
    this.flag.add(mesh(cached('flagpole', () => new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6)), plastic('#fbf8f0'), 0, 0.8, 0));
    const cloth = sign('Free', 0.9, 0.5, { bg: '#f4b740', fg: '#2b2340', radius: 0.06 }, 0.15);
    cloth.position.set(0.47, 1.35, 0.01);
    const back = cloth.clone();
    back.rotation.y = Math.PI;
    back.position.z = -0.01;
    this.flag.add(cloth, back);
    this.flag.position.set(-2.1, 0, 4.4);
    this.flag.rotation.y = 0.5;
    this.group.add(this.flag);

    // A star on the roof means there is something new to play inside.
    const starShape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 0.55 : 0.24;
      const t = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const x = Math.cos(t) * r;
      const y = Math.sin(t) * r;
      if (i === 0) starShape.moveTo(x, y);
      else starShape.lineTo(x, y);
    }
    this.star = mesh(
      cached('star', () => new THREE.ExtrudeGeometry(starShape, { depth: 0.14, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 }).center()),
      plastic('#ffd24a', { rough: 0.3, emissive: '#ffb21e', emissiveIntensity: 0.5 }),
      0,
      6.3,
      0.4,
    );
    this.star.visible = false;
    this.group.add(this.star);

    const door = polar(a, HOUSE_R - 4.3);
    this.entrance = { kind: 'house', slot, arcade: null, x: door.x, z: door.z, outYaw: Math.atan2(-door.x, -door.z) };
    this.setInfo(null);
  }

  /** Walls up to the eaves, plus a narrower box for the ridge, so the camera follows the roof line. */
  get colliders(): Collider[] {
    const { x, z } = this.group.position;
    const rot = this.group.rotation.y;
    return [box(x, z, 3.55, 3.05, rot, 4.4, 0.5, true), box(x, z, 1.9, 3.4, rot, 5.7, 0.5, true)];
  }

  setInfo(s: SlotSummary | null | undefined, loading = false): void {
    const key = loading ? 'loading' : s?.roomId ? `${s.ownerName}|${s.theme?.trim}|${s.hasContent}` : 'free';
    if (key === this.current) return;
    this.current = key;
    const claimed = !!s?.roomId;
    const trim = claimed && s?.theme ? TRIM_COLORS[s.theme.trim] : null;
    this.roofMat.color.set(trim ?? ROOF_DEFAULT);
    this.doorMat.color.set(trim ? new THREE.Color(trim).multiplyScalar(0.85) : '#8d8174');
    this.flag.visible = !claimed && !loading;
    this.star.visible = claimed && !!s?.hasContent;
    if (this.signMesh) {
      this.group.remove(this.signMesh);
      (this.signMesh.material as THREE.MeshStandardMaterial).map?.dispose();
      (this.signMesh.material as THREE.Material).dispose();
      this.signMesh.geometry.dispose();
    }
    const title = loading ? '...' : claimed ? (s!.ownerName ?? 'Claimed') : 'Available';
    const sub = loading ? '' : claimed ? `Room ${this.slot + 1}` : `Room ${this.slot + 1} · Claim it`;
    this.signMesh = sign(title, 3.0, 0.9, { bg: claimed ? '#2b2340' : '#fffaf0', fg: claimed ? '#fffaf0' : '#2b2340', sub, subColor: claimed ? '#ffd27a' : '#8a6bd1', border: trim ?? (claimed ? '#2b2340' : '#d8cfc2'), radius: 0.2 }, 0);
    this.signMesh.position.set(0, 3.22, 3.2);
    this.group.add(this.signMesh);
    this.setNight(this.night);
  }

  setNight(n: number): void {
    this.night = n;
    this.windowMat.emissiveIntensity = n * 0.9;
    this.porchMat.emissiveIntensity = 0.2 + n * 1.6;
    if (this.signMesh) {
      const m = this.signMesh.material as THREE.MeshStandardMaterial;
      if (!m.emissiveMap) {
        m.emissiveMap = m.map;
        m.emissive = new THREE.Color('#ffffff');
      }
      m.emissiveIntensity = n * 0.55;
    }
  }

  spin(t: number): void {
    if (this.star.visible) {
      this.star.rotation.y = t * 1.4;
      this.star.position.y = 6.3 + Math.sin(t * 2) * 0.12;
    }
  }
}

function arcade(id: ArcadeId): { group: THREE.Group; entrance: Entrance; colliders: Collider[]; animate: (t: number, night: number) => void } {
  const a = ARCADE_ANGLES[id];
  const p = polar(a, HOUSE_R + 1.5);
  const build = id === 'spacechakra' ? spaceChakra() : vibeCoded();
  build.group.position.set(p.x, 0, p.z);
  build.group.rotation.y = -a;
  const door = polar(a, HOUSE_R + 1.5 - 5.8);
  return {
    group: build.group,
    entrance: { kind: 'arcade', slot: -1, arcade: id, x: door.x, z: door.z, outYaw: Math.atan2(-door.x, -door.z) },
    colliders: placeColliders(build.colliders, p.x, p.z, -a),
    animate: build.animate,
  };
}

function groundTexture(color: string, lines: string, scale: number, kind: 'grass' | 'tiles' | 'road'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  if (kind === 'grass') {
    for (let i = 0; i < 900; i++) {
      g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,40,0,0.06)';
      g.fillRect(rnd() * 256, rnd() * 256, 3, 6);
    }
  } else if (kind === 'tiles') {
    g.strokeStyle = lines;
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(i * 64, 0);
      g.lineTo(i * 64, 256);
      g.moveTo(0, i * 64);
      g.lineTo(256, i * 64);
      g.stroke();
    }
    for (let i = 0; i < 6; i++) {
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(Math.floor(rnd() * 4) * 64 + 2, Math.floor(rnd() * 4) * 64 + 2, 60, 60);
    }
  } else {
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
      g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(scale, scale);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Town {
  readonly group = new THREE.Group();
  readonly colliders: Collider[] = [];
  readonly entrances: Entrance[] = [];
  // Start south-east of the tower, looking north-west across the plaza at
  // SpaceChakra, the tower and the parked vehicles.
  readonly spawn = { x: 5.2, z: 9.2, yaw: Math.PI + 0.42 };
  readonly vehicleSpots = [
    { kind: 'scooter' as const, x: -2.2, z: 9.8, yaw: Math.PI * 0.75, color: '#4aa3df' },
    { kind: 'kart' as const, x: -5.0, z: 8.6, yaw: Math.PI * 0.72, color: '#e8574a' },
    { kind: 'kart' as const, x: -7.4, z: 6.8, yaw: Math.PI * 0.68, color: '#3fb68b' },
  ];
  readonly toyLayout: PropPlacement[] = [
    { id: 'hub-ball', kind: 'ball', x: 6.5, z: 2.2, rot: 0 },
    { id: 'hub-goal', kind: 'goal', x: 12.4, z: 0.6, rot: -Math.PI / 2 },
    { id: 'hub-pins', kind: 'pins', x: -12.3, z: 0.4, rot: Math.PI / 2 },
    { id: 'hub-ball2', kind: 'ball', x: -6.8, z: 0.4, rot: 0 },
    { id: 'hub-target', kind: 'target', x: 0, z: -12.6, rot: 0 },
    ...[-26, -15, -5, 5, 15, 26].map((deg, i) => {
      const p = polar((deg * Math.PI) / 180, 19 + (i % 2 ? 1.6 : -1.6));
      return { id: `hub-cone${i}`, kind: 'cone' as const, x: p.x, z: p.z, rot: 0 };
    }),
  ];
  private houses: House[] = [];
  private lampMats: THREE.MeshStandardMaterial[] = [];
  private pools: THREE.Mesh[] = [];
  private lights: THREE.PointLight[] = [];
  private arcadeAnims: ((t: number, night: number) => void)[] = [];
  private clockHands: { hour: THREE.Object3D; minute: THREE.Object3D }[] = [];
  private water: THREE.Mesh;

  constructor() {
    const g = this.group;
    const grass = new THREE.Mesh(new THREE.CircleGeometry(150, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: groundTexture('#86c45e', '', 40, 'grass'), roughness: 1 }));
    grass.receiveShadow = true;
    g.add(grass);
    const road = new THREE.Mesh(new THREE.RingGeometry(ROAD_IN, ROAD_OUT, 96, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: groundTexture('#53566a', '', 12, 'road'), roughness: 0.92 }));
    road.position.y = 0.02;
    road.receiveShadow = true;
    g.add(road);
    for (const [r0, r1, color] of [
      [ROAD_OUT, ROAD_OUT + 1.6, '#e9e2d4'],
      [PLAZA_R, ROAD_IN, '#e9e2d4'],
    ] as const) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 96, 1).rotateX(-Math.PI / 2), plastic(color, { rough: 0.95 }));
      ring.position.y = 0.06;
      ring.receiveShadow = true;
      g.add(ring);
    }
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(PLAZA_R, 72).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: groundTexture('#ecdcbc', 'rgba(150,120,90,0.35)', 7, 'tiles'), roughness: 0.95 }));
    plaza.position.y = 0.05;
    plaza.receiveShadow = true;
    g.add(plaza);
    // Lawn for the kick-about.
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(4.6, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: groundTexture('#7dbd57', '', 3, 'grass'), roughness: 1 }));
    lawn.scale.set(1.25, 1, 1.15);
    lawn.position.set(9.4, 0.075, 0.6);
    lawn.receiveShadow = true;
    g.add(lawn);
    // Bowling lane.
    const lane = mesh(roundBox(6.2, 0.04, 1.6, 0.02), plastic('#e3b986', { rough: 0.5 }), -9.7, 0.065, 0.4, { cast: false });
    g.add(lane);
    // Centre line dashes.
    const dashGeo = new THREE.PlaneGeometry(0.22, 1.6).rotateX(-Math.PI / 2);
    const dashMat = plastic('#fff3c4', { rough: 0.8 });
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      const p = polar(a, (ROAD_IN + ROAD_OUT) / 2);
      const d = new THREE.Mesh(dashGeo, dashMat);
      d.position.set(p.x, 0.04, p.z);
      d.rotation.y = -a + Math.PI / 2;
      d.receiveShadow = true;
      g.add(d);
    }
    // Parking bays.
    for (const v of this.vehicleSpots) {
      const bay = mesh(roundBox(2.0, 0.03, 2.8, 0.01), plastic('#d9cba8', { rough: 0.9 }), v.x, 0.07, v.z, { cast: false, receive: true });
      bay.rotation.y = v.yaw;
      g.add(bay);
    }

    this.water = this.buildTower();
    this.buildLamps();

    for (let s = 0; s < SLOT_COUNT; s++) {
      const h = new House(s);
      this.houses.push(h);
      g.add(h.group);
      this.colliders.push(...h.colliders);
      this.entrances.push(h.entrance);
      h.setInfo(null, true);
    }
    for (const a of ARCADES) {
      const ar = arcade(a.id);
      g.add(ar.group);
      this.colliders.push(...ar.colliders);
      this.arcadeAnims.push(ar.animate);
      this.entrances.push(ar.entrance);
    }
    this.buildBillboard();
    this.buildTrees();
    // Keep everyone inside the hedge.
    const n = 40;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = polar(a, WORLD_R + 1);
      this.colliders.push(box(p.x, p.z, 4.2, 1, -a, 3, 0.4, false));
    }
  }

  private buildTower(): THREE.Mesh {
    const g = this.group;
    const stone = plastic('#d9c7a6', { rough: 0.9 });
    const basin = mesh(cached('basin', () => new THREE.CylinderGeometry(3.4, 3.6, 0.7, 40)), stone, 0, 0.35, 0);
    g.add(basin);
    const water = mesh(cached('water', () => new THREE.CylinderGeometry(3.05, 3.05, 0.1, 40)), new THREE.MeshStandardMaterial({ color: '#5cc4e6', roughness: 0.15, metalness: 0.1, emissive: new THREE.Color('#1d7fa6'), emissiveIntensity: 0.15 }), 0, 0.62, 0, { cast: false });
    g.add(water);
    const tower = mesh(roundBox(1.9, 7.2, 1.9, 0.2), plastic('#f6e7c8', { rough: 0.8 }), 0, 4.0, 0);
    g.add(tower);
    g.add(mesh(roundBox(2.3, 0.4, 2.3, 0.12), plastic('#8a6bd1'), 0, 7.7, 0));
    const roof = mesh(cached('troof', () => new THREE.ConeGeometry(1.75, 2.0, 4).rotateY(Math.PI / 4)), plastic('#e8574a', { rough: 0.5 }), 0, 8.9, 0);
    g.add(roof);
    g.add(mesh(cached('tball', () => new THREE.SphereGeometry(0.22, 12, 8)), plastic('#f4b740', { rough: 0.3 }), 0, 10.0, 0));
    // Clock faces show the town's time of day.
    const faceTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const x = c.getContext('2d')!;
      x.fillStyle = '#fffaf0';
      x.beginPath();
      x.arc(128, 128, 124, 0, Math.PI * 2);
      x.fill();
      x.lineWidth = 10;
      x.strokeStyle = '#2b2340';
      x.stroke();
      x.fillStyle = '#2b2340';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        x.beginPath();
        x.arc(128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96, i % 3 === 0 ? 10 : 5, 0, Math.PI * 2);
        x.fill();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.6, emissive: new THREE.Color('#fff3d0'), emissiveMap: faceTex, emissiveIntensity: 0.1 });
    this.lampMats.push(faceMat);
    const handMat = plastic('#2b2340');
    for (let i = 0; i < 4; i++) {
      const holder = new THREE.Group();
      holder.rotation.y = (i * Math.PI) / 2;
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.78, 32), faceMat);
      face.position.set(0, 6.4, 0.99);
      holder.add(face);
      const hour = new THREE.Group();
      hour.position.set(0, 6.4, 1.02);
      hour.add(mesh(roundBox(0.09, 0.42, 0.03, 0.02), handMat, 0, 0.19, 0, { cast: false }));
      const minute = new THREE.Group();
      minute.position.set(0, 6.4, 1.05);
      minute.add(mesh(roundBox(0.06, 0.62, 0.03, 0.02), handMat, 0, 0.29, 0, { cast: false }));
      holder.add(hour, minute);
      this.clockHands.push({ hour, minute });
      g.add(holder);
    }
    this.colliders.push(circle(0, 0, 3.6, 0.75, 0.5, false));
    this.colliders.push(box(0, 0, 0.95, 0.95, 0, 12, 0.5, true));
    return water;
  }

  private buildLamps(): void {
    const pole = cached('lpole', () => new THREE.CylinderGeometry(0.08, 0.11, 3.4, 8));
    const head = cached('lhead', () => new THREE.SphereGeometry(0.3, 14, 10));
    const poleMat = plastic('#2f3a56', { rough: 0.5 });
    const poolGeo = new THREE.CircleGeometry(4.2, 24).rotateX(-Math.PI / 2);
    const poolMat = new THREE.MeshBasicMaterial({ map: lightPoolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const spots: { x: number; z: number }[] = [];
    for (let i = 0; i < 10; i++) spots.push(polar((i / 10) * Math.PI * 2 + Math.PI / 10, PLAZA_R - 0.8));
    for (let i = 0; i < 12; i++) spots.push(polar((i / 12) * Math.PI * 2, ROAD_OUT + 0.8));
    for (const s of spots) {
      this.group.add(mesh(pole, poleMat, s.x, 1.7, s.z));
      const m = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: new THREE.Color('#ffcf7a'), emissiveIntensity: 0.1, roughness: 0.4 });
      this.lampMats.push(m);
      this.group.add(mesh(head, m, s.x, 3.5, s.z, { cast: false }));
      const pool = new THREE.Mesh(poolGeo, poolMat);
      pool.position.set(s.x, 0.11, s.z);
      pool.renderOrder = 2;
      this.pools.push(pool);
      this.group.add(pool);
      this.colliders.push(circle(s.x, s.z, 0.18, 3.4, 0.6, false));
    }
    // A few real lights around the plaza; the rest is glow.
    for (const a of [0.3, 2.4, 4.5]) {
      const p = polar(a, 9);
      const l = new THREE.PointLight('#ffc27a', 0, 22, 1.6);
      l.position.set(p.x, 4, p.z);
      this.lights.push(l);
      this.group.add(l);
    }
    // Benches.
    const wood = plastic('#b07a4f', { rough: 0.8 });
    for (const a of [0.9, 2.2, 4.1, 5.4]) {
      const p = polar(a, PLAZA_R - 2.6);
      const b = new THREE.Group();
      b.add(mesh(roundBox(2.0, 0.12, 0.55, 0.04), wood, 0, 0.5, 0));
      b.add(mesh(roundBox(2.0, 0.5, 0.1, 0.04), wood, 0, 0.82, -0.25));
      for (const sx of [-0.8, 0.8]) b.add(mesh(roundBox(0.1, 0.5, 0.5, 0.03), plastic('#2f3a56'), sx, 0.25, 0));
      b.position.set(p.x, 0, p.z);
      b.rotation.y = -a + Math.PI;
      this.group.add(b);
      this.colliders.push(box(p.x, p.z, 1.0, 0.3, b.rotation.y, 0.9, 0.5, false));
    }
  }

  private buildBillboard(): void {
    const p = polar(0, HOUSE_R + 2);
    const grp = new THREE.Group();
    grp.position.set(p.x, 0, p.z);
    const letters = 'TOYBOXES';
    const colors = ['#e8574a', '#f4b740', '#4aa3df', '#3fb68b', '#8a6bd1', '#f58a6b', '#ef6fa0', '#2fb3b3'];
    for (let i = 0; i < letters.length; i++) {
      const tex = signTexture(letters[i], 1, 1, { bg: colors[i], fg: '#fffaf0', radius: 0.14, font: DISPLAY_FONT });
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0 });
      this.lampMats.push(mat);
      const side = plastic(colors[i], { rough: 0.55 });
      const b = new THREE.Mesh(roundBox(1.3, 1.3, 1.3, 0.12), [side, side, side, side, mat, side]);
      b.castShadow = true;
      b.position.set((i - 3.5) * 1.42, 1.1 + (i % 2) * 0.12, 0);
      b.rotation.z = ((i % 3) - 1) * 0.05;
      grp.add(b);
    }
    this.group.add(grp);
    this.colliders.push(box(p.x, p.z, 5.8, 0.75, 0, 2, 0.6, true));
  }

  private buildTrees(): void {
    const trunkGeo = cached('trunk', () => new THREE.CylinderGeometry(0.18, 0.24, 1.6, 8));
    const crownGeo = cached('crown', () => new THREE.IcosahedronGeometry(1.3, 1));
    const trunkMat = plastic('#8a5a3b', { rough: 0.9 });
    const crowns = ['#4fae5a', '#5cbf63', '#3f9e55', '#6ccc6a'].map((c) => plastic(c, { rough: 0.85 }));
    const spots: { x: number; z: number; s: number }[] = [];
    let seed = 3;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    // Between houses and in the back gardens.
    for (let i = 0; i < SLOT_COUNT - 1; i++) {
      const a = (HOUSE_ANGLES[i] + HOUSE_ANGLES[i + 1]) / 2;
      const p = polar(a, HOUSE_R - 1 + rnd() * 2);
      spots.push({ ...p, s: 0.8 + rnd() * 0.3 });
    }
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2;
      const p = polar(a, 37 + rnd() * 6.5);
      spots.push({ ...p, s: 0.9 + rnd() * 0.6 });
    }
    for (const s of spots) {
      const t = mesh(trunkGeo, trunkMat, s.x, 0.8 * s.s, s.z);
      t.scale.setScalar(s.s);
      const c = mesh(crownGeo, crowns[Math.floor(rnd() * crowns.length)], s.x, 2.4 * s.s, s.z);
      c.scale.set(s.s, s.s * 1.1, s.s);
      this.group.add(t, c);
      this.colliders.push(circle(s.x, s.z, 0.3 * s.s, 4, 0.5, false));
    }
    // Hedge ring at the edge of town.
    const hedgeGeo = cached('hedge', () => new THREE.CapsuleGeometry(0.9, 2.4, 4, 10).rotateZ(Math.PI / 2));
    const hedgeMat = plastic('#3f9a4f', { rough: 0.9 });
    const n = 64;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = polar(a, WORLD_R + 1.2);
      const h = mesh(hedgeGeo, hedgeMat, p.x, 0.85, p.z);
      h.rotation.y = -a;
      this.group.add(h);
    }
  }

  setSlots(slots: SlotSummary[] | null): void {
    this.houses.forEach((h, i) => h.setInfo(slots ? slots[i] : null, !slots));
  }

  update(night: number, t: number, phase: number): void {
    for (const h of this.houses) {
      h.setNight(night);
      h.spin(t);
    }
    for (const m of this.lampMats) m.emissiveIntensity = 0.08 + night * 1.6;
    for (const p of this.pools) (p.material as THREE.MeshBasicMaterial).opacity = Math.max(0, night - 0.15) * 0.8;
    for (const l of this.lights) l.intensity = Math.max(0, night - 0.2) * 40;
    for (const f of this.arcadeAnims) f(t, night);
    const hours = phase * 24;
    for (const c of this.clockHands) {
      c.hour.rotation.z = -((hours % 12) / 12) * Math.PI * 2;
      c.minute.rotation.z = -((hours % 1) * Math.PI * 2);
    }
    this.water.position.y = 0.62 + Math.sin(t * 1.3) * 0.015;
  }
}
