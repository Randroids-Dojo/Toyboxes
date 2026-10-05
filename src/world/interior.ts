// Indoor rooms and inner areas, built like a dollhouse: open on top, and the
// wall between the camera and the player drops to a low cut so the room stays
// readable from any angle.

import * as THREE from 'three';
import { FLOOR_COLORS, ROOM, TRIM_COLORS, WALL_COLORS, areaDoorX, type Area, type Exhibit, type RoomTheme } from '../shared/model';
import { cached, disposeTree, mesh, plastic, roundBox, sign, signTexture } from './kit';
import { box, circle, type Collider } from './physics';
import type { SpaceView } from './space';

export interface InteriorSpec {
  kind: 'main' | 'area';
  title: string;
  /** Shown on the exit door. */
  exitLabel: string;
  theme: RoomTheme;
  exhibits: Exhibit[];
  /** Main room only: published inner areas, one per back-wall door. */
  areas: Area[];
}

export interface Spot {
  x: number;
  z: number;
}

type Side = 'front' | 'back' | 'left' | 'right';

const W = ROOM.halfW;
const D = ROOM.halfD;
const H = ROOM.wallH;
const T = 0.3;

function plankTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  let seed = 5;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let row = 0; row < 8; row++) {
    const y = row * 32;
    g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.05})`;
    g.fillRect(0, y, 256, 32);
    g.fillStyle = 'rgba(60,30,10,0.28)';
    g.fillRect(0, y, 256, 2);
    const off = rnd() * 256;
    g.fillRect(off, y, 2, 32);
    g.fillRect((off + 128) % 256, y, 2, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Interior implements SpaceView {
  readonly indoor = true;
  readonly scene = new THREE.Scene();
  readonly colliders: Collider[] = [];
  readonly door: Spot = { x: 0, z: D - 1.1 };
  readonly lectern: Spot | null;
  readonly chest: Spot | null;
  readonly areaDoors: { area: Area; x: number; z: number }[] = [];
  readonly exhibitSpots: { exhibit: Exhibit; x: number; z: number }[] = [];
  private walls = new Map<Side, { full: THREE.Group; stub: THREE.Group }>();
  private wallMat: THREE.MeshStandardMaterial;
  private floorMat: THREE.MeshStandardMaterial;
  private trimMat: THREE.MeshStandardMaterial;
  private windowMats: THREE.MeshStandardMaterial[] = [];
  private screens: THREE.MeshStandardMaterial[] = [];
  private lamp: THREE.PointLight;
  private hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  private book: THREE.Group | null = null;

  constructor(readonly spec: InteriorSpec) {
    const s = this.scene;
    s.background = new THREE.Color('#efe3cf');
    this.wallMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    this.floorMat = new THREE.MeshStandardMaterial({ roughness: 0.75, map: plankTexture() });
    this.trimMat = new THREE.MeshStandardMaterial({ roughness: 0.5 });
    this.setTheme(spec.theme);

    // Tabletop the dollhouse sits on.
    const table = mesh(cached('table', () => new THREE.CylinderGeometry(24, 24, 0.6, 48)), plastic('#d9c4a3', { rough: 0.9 }), 0, -0.35, 0, { cast: false });
    s.add(table);
    // Base slab sits clearly below the floor so the two never fight for depth.
    s.add(mesh(roundBox(W * 2 + T * 2, 0.3, D * 2 + T * 2, 0.1), this.trimMat, 0, -0.18, 0, { cast: false }));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2).rotateX(-Math.PI / 2), this.floorMat);
    floor.receiveShadow = true;
    floor.position.y = 0.01;
    s.add(floor);
    // Doormat with an arrow, so the way out reads even when the wall is cut.
    const matTex = signTexture('EXIT', 2.2, 1.1, { bg: '#2b2340', fg: '#ffd27a', radius: 0.2 });
    const doormat = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.9, emissive: new THREE.Color('#ffffff'), emissiveMap: matTex, emissiveIntensity: 0.15 }));
    doormat.position.set(0, 0.03, D - 0.75);
    doormat.receiveShadow = true;
    s.add(doormat);

    this.buildWalls();
    this.buildDoor();
    if (spec.kind === 'main') {
      this.lectern = { x: ROOM.lectern.x + 1.25, z: ROOM.lectern.z };
      this.chest = { x: ROOM.chest.x - 1.25, z: ROOM.chest.z };
      this.buildLectern();
      this.buildChest();
      spec.areas.slice(0, ROOM.areaDoors.length).forEach((a, i) => this.buildAreaDoor(a, areaDoorX(i)!));
    } else {
      this.lectern = null;
      this.chest = null;
    }
    for (const e of spec.exhibits) this.buildCabinet(e);

    this.hemi = new THREE.HemisphereLight('#fff6e6', '#8a7660', 1.3);
    this.lamp = new THREE.PointLight('#ffd8a8', 30, 30, 1.4);
    this.lamp.position.set(0, 6, 1);
    this.sun = new THREE.DirectionalLight('#fff3dd', 1.4);
    this.sun.position.set(-6, 14, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -11;
    sc.right = sc.top = 11;
    sc.near = 1;
    sc.far = 40;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    s.add(this.hemi, this.lamp, this.sun, this.sun.target);
  }

  get arrival(): { x: number; z: number; yaw: number } {
    return { x: this.door.x, z: this.door.z - 0.4, yaw: Math.PI };
  }

  setTheme(t: RoomTheme): void {
    this.wallMat.color.set(WALL_COLORS[t.wall] ?? WALL_COLORS[0]);
    this.floorMat.color.set(FLOOR_COLORS[t.floor] ?? FLOOR_COLORS[0]);
    this.trimMat.color.set(TRIM_COLORS[t.trim] ?? TRIM_COLORS[0]);
  }

  private wall(side: Side, len: number, x: number, z: number, rot: number): { full: THREE.Group; stub: THREE.Group } {
    const full = new THREE.Group();
    const stub = new THREE.Group();
    full.position.set(x, 0, z);
    full.rotation.y = rot;
    stub.position.copy(full.position);
    stub.rotation.y = rot;
    full.add(mesh(roundBox(len, H, T, 0.06), this.wallMat, 0, H / 2, 0));
    full.add(mesh(roundBox(len + 0.02, 0.22, T + 0.08, 0.05), this.trimMat, 0, 0.11, 0));
    full.add(mesh(roundBox(len + 0.04, 0.16, T + 0.12, 0.06), this.trimMat, 0, H, 0));
    // A cut wall leaves only its skirting board, so it never blocks the view.
    stub.add(mesh(roundBox(len, 0.24, T, 0.05), this.trimMat, 0, 0.12, 0));
    stub.visible = false;
    this.scene.add(full, stub);
    const w = { full, stub };
    this.walls.set(side, w);
    return w;
  }

  private buildWalls(): void {
    // Inner faces sit exactly on the room bounds.
    this.wall('back', W * 2 + T * 2, 0, -D - T / 2, 0);
    this.wall('front', W * 2 + T * 2, 0, D + T / 2, Math.PI);
    const left = this.wall('left', D * 2, -W - T / 2, 0, Math.PI / 2);
    const right = this.wall('right', D * 2, W + T / 2, 0, -Math.PI / 2);
    for (const w of [left, right]) {
      for (const zx of [-2.6, 2.6]) {
        const frame = mesh(roundBox(2.0, 1.6, T + 0.1, 0.06), this.trimMat, zx, 2.1, 0);
        const m = new THREE.MeshStandardMaterial({ color: '#bfe3ff', roughness: 0.15, emissive: new THREE.Color('#bfe3ff'), emissiveIntensity: 0.5 });
        this.windowMats.push(m);
        const pane = mesh(roundBox(1.7, 1.3, T + 0.14, 0.04), m, zx, 2.1, 0, { cast: false });
        w.full.add(frame, pane);
      }
    }
    this.colliders.push(
      box(0, -D - T / 2, W + T, T / 2, 0, 10, 0.55, false),
      box(0, D + T / 2, W + T, T / 2, 0, 10, 0.55, false),
      box(-W - T / 2, 0, T / 2, D + T, 0, 10, 0.55, false),
      box(W + T / 2, 0, T / 2, D + T, 0, 10, 0.55, false),
    );
  }

  private buildDoor(): void {
    const front = this.walls.get('front')!.full;
    // Front wall group faces inward after its rotation; local +z points into the room.
    front.add(mesh(roundBox(1.9, 2.7, T + 0.12, 0.07), this.trimMat, 0, 1.35, 0));
    front.add(mesh(roundBox(1.5, 2.45, T + 0.18, 0.08), plastic('#8d6e57', { rough: 0.5 }), 0, 1.22, 0));
    front.add(mesh(cached('knob', () => new THREE.SphereGeometry(0.07, 8, 6)), plastic('#f4b740', { rough: 0.3 }), -0.5, 1.2, 0.25));
    const s = sign(this.spec.exitLabel, 2.6, 0.62, { bg: '#2b2340', fg: '#fffaf0', radius: 0.16 }, 0.25);
    s.position.set(0, 3.05, T / 2 + 0.04);
    front.add(s);
  }

  private buildLectern(): void {
    const { x, z } = ROOM.lectern;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = Math.PI / 2;
    const wood = plastic('#a8744d', { rough: 0.7 });
    g.add(mesh(roundBox(0.9, 0.12, 0.7, 0.04), wood, 0, 0.06, 0));
    g.add(mesh(roundBox(0.32, 1.0, 0.32, 0.06), wood, 0, 0.6, 0));
    const top = mesh(roundBox(1.1, 0.1, 0.8, 0.04), wood, 0, 1.15, 0);
    top.rotation.x = 0.35;
    g.add(top);
    // Open sketchbook on the stand.
    const book = new THREE.Group();
    book.position.set(0, 1.24, 0.02);
    book.rotation.x = 0.35;
    const cover = mesh(roundBox(1.0, 0.04, 0.7, 0.02), this.trimMat, 0, 0, 0);
    book.add(cover);
    const pageMat = plastic('#fffaf0', { rough: 0.9 });
    for (const sx of [-1, 1]) {
      const page = mesh(roundBox(0.46, 0.04, 0.64, 0.015), pageMat, sx * 0.24, 0.035, 0, { cast: false });
      page.rotation.z = -sx * 0.06;
      book.add(page);
    }
    // A few pencil lines.
    const lineMat = plastic('#8a6bd1', { rough: 0.9 });
    for (let i = 0; i < 4; i++) book.add(mesh(roundBox(0.32, 0.01, 0.025, 0.005), lineMat, 0.24, 0.06, -0.2 + i * 0.12, { cast: false }));
    g.add(book);
    this.book = book;
    this.scene.add(g);
    this.colliders.push(circle(x, z, 0.55, 1.4, 0.4, false));
  }

  private buildChest(): void {
    const { x, z } = ROOM.chest;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = -Math.PI / 2;
    const body = plastic('#e8574a', { rough: 0.5 });
    g.add(mesh(roundBox(1.5, 0.8, 0.9, 0.1), body, 0, 0.4, 0));
    const lid = mesh(roundBox(1.58, 0.24, 0.98, 0.1), plastic('#f4b740', { rough: 0.45 }), 0, 0.88, 0);
    g.add(lid);
    const label = sign('TOYS', 1.0, 0.36, { bg: '#fffaf0', fg: '#2b2340', radius: 0.1 });
    label.position.set(0, 0.45, 0.47);
    g.add(label);
    // A ball peeking out.
    g.add(mesh(cached('peek', () => new THREE.SphereGeometry(0.2, 14, 10)), plastic('#4aa3df'), 0.45, 1.05, 0.1));
    this.scene.add(g);
    this.colliders.push(box(x, z, 0.5, 0.78, 0, 1.1, 0.5, false));
  }

  private buildAreaDoor(area: Area, dx: number): void {
    const back = this.walls.get('back')!.full;
    const color = TRIM_COLORS[area.theme.trim] ?? '#8a6bd1';
    back.add(mesh(roundBox(1.9, 2.7, T + 0.12, 0.07), plastic(color, { rough: 0.5 }), dx, 1.35, 0));
    back.add(mesh(roundBox(1.5, 2.45, T + 0.18, 0.08), plastic('#2b2340', { rough: 0.4 }), dx, 1.22, 0));
    const s = sign(area.name, 2.4, 0.6, { bg: '#fffaf0', fg: '#2b2340', border: color, radius: 0.14 }, 0.2);
    s.position.set(dx, 3.05, T / 2 + 0.04);
    back.add(s);
    // Glowing threshold.
    const glow = mesh(roundBox(1.4, 0.04, 0.5, 0.02), new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.9 }), dx, 0.03, -D + 0.4, { cast: false });
    this.scene.add(glow);
    this.areaDoors.push({ area, x: dx, z: -D + 1.1 });
  }

  private buildCabinet(e: Exhibit): void {
    const color = TRIM_COLORS[e.color] ?? TRIM_COLORS[0];
    const g = new THREE.Group();
    g.position.set(e.x, 0, e.z);
    g.rotation.y = e.rot;
    const paint = plastic(color, { rough: 0.45 });
    const dark = plastic('#221c33', { rough: 0.6 });
    g.add(mesh(roundBox(1.1, 1.9, 0.85, 0.08), paint, 0, 0.95, 0));
    g.add(mesh(roundBox(1.16, 0.18, 0.5, 0.06), dark, 0, 1.0, 0.45));
    for (const [x, c] of [
      [-0.25, '#e8574a'],
      [0.05, '#f4b740'],
      [0.25, '#3fb68b'],
    ] as const) {
      g.add(mesh(cached('btn', () => new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10)), plastic(c, { rough: 0.3 }), x, 1.11, 0.5, { cast: false }));
    }
    const screenTex = signTexture(e.title, 0.9, 0.7, { bg: '#0f0b1f', fg: '#fffaf0', glow: color, sub: 'Press to play', subColor: '#ffd27a', radius: 0.05 });
    const screenMat = new THREE.MeshStandardMaterial({ map: screenTex, emissive: new THREE.Color('#ffffff'), emissiveMap: screenTex, emissiveIntensity: 0.8, roughness: 0.3 });
    this.screens.push(screenMat);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), screenMat);
    screen.position.set(0, 1.5, 0.45);
    g.add(screen);
    const marquee = sign(e.title, 1.1, 0.32, { bg: '#fffaf0', fg: '#2b2340', border: color, radius: 0.06 }, 0.3);
    marquee.position.set(0, 2.05, 0.48);
    g.add(marquee);
    g.add(mesh(roundBox(1.16, 0.3, 0.9, 0.08), paint, 0, 2.05, 0));
    this.scene.add(g);
    this.colliders.push(box(e.x, e.z, 0.58, 0.45, e.rot, 2.2, 0.5, false));
    this.exhibitSpots.push({ exhibit: e, x: e.x + Math.sin(e.rot) * 1.05, z: e.z + Math.cos(e.rot) * 1.05 });
  }

  /** Drops whichever walls stand between the camera and the room. */
  cutaway(cam: THREE.Vector3): void {
    const set = (side: Side, cut: boolean) => {
      const w = this.walls.get(side)!;
      w.full.visible = !cut;
      w.stub.visible = cut;
    };
    set('front', cam.z > D - 0.3);
    set('back', cam.z < -D + 0.3);
    set('left', cam.x < -W + 0.3);
    set('right', cam.x > W - 0.3);
  }

  update(night: number, t: number): void {
    const day = new THREE.Color('#cfeaff');
    const dusk = new THREE.Color('#2a3570');
    for (const m of this.windowMats) {
      m.emissive.copy(day).lerp(dusk, night);
      m.color.copy(m.emissive);
      m.emissiveIntensity = 0.6 - night * 0.2;
    }
    (this.scene.background as THREE.Color).set('#efe3cf').lerp(new THREE.Color('#231d36'), night * 0.85);
    this.hemi.intensity = 1.3 - night * 0.45;
    this.sun.intensity = 1.4 - night * 0.9;
    this.lamp.intensity = 22 + night * 26;
    for (const m of this.screens) m.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.08 + night * 0.3;
    if (this.book) this.book.position.y = 1.24 + Math.sin(t * 2) * 0.01;
  }

  dispose(): void {
    disposeTree(this.scene);
  }
}
