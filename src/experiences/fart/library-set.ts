// The library interior, built off the map at (200, 0) and shown only while
// you are inside: oak floor, green wallpaper, tall shelves of book spines,
// reading tables with banker's lamps, the grandfather clock, radiators, an
// open window and two ceiling fans. Open-topped like a doll's house so the
// high stealth camera sees everything.

import * as THREE from 'three';
import { DISPLAY_FONT } from '../../world/kit';
import { Painter, mtx } from './painter';
import { C, hex, painted } from './palette';
import { LIB, shelves, slots } from './sim/library';
import { bookSpineTexture, clockTexture } from './textures';

export interface LibrarySet {
  group: THREE.Group;
  pendulum: THREE.Object3D;
  radiators: THREE.Object3D[];
  fans: THREE.Object3D[];
  curtains: THREE.Object3D[];
  slotGlow: THREE.Mesh[];
  slotBooks: THREE.Mesh[];
  cones: THREE.Mesh[];
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.anisotropy = 4;
  return t;
}

export function buildLibrary(parent: THREE.Object3D): LibrarySet {
  const group = new THREE.Group();
  group.name = 'library';
  group.visible = false;
  parent.add(group);
  const P = new Painter();
  const wood = painted(canvasTex(256, 256, (g) => {
    g.fillStyle = '#e9dcc8';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `rgba(110,70,40,${0.08 + (i % 3) * 0.04})`;
      g.fillRect(0, i * 32, 256, 30);
      g.fillStyle = 'rgba(70,40,20,0.35)';
      g.fillRect(0, i * 32 + 30, 256, 2);
      g.fillRect(((i * 97) % 256), i * 32, 2, 30);
    }
  }));
  const paper = painted(canvasTex(128, 128, (g) => {
    g.fillStyle = '#e6eedc';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(70,110,70,0.35)';
    g.lineWidth = 3;
    for (let x = 0; x < 128; x += 32) {
      g.beginPath();
      g.moveTo(x + 16, 0);
      g.bezierCurveTo(x + 4, 40, x + 28, 80, x + 16, 128);
      g.stroke();
      g.fillStyle = 'rgba(232,87,74,0.35)';
      g.beginPath();
      g.arc(x + 16, 64, 5, 0, Math.PI * 2);
      g.fill();
    }
  }));
  const paint = painted();
  const spines = new THREE.MeshStandardMaterial({ map: bookSpineTexture(), roughness: 0.85 });
  spines.map!.wrapS = spines.map!.wrapT = THREE.RepeatWrapping;

  // Floor and a dark surround.
  P.box(wood, 0xc9935a, LIB.cx, -0.1, 0, LIB.x1 - LIB.x0, 0.1, LIB.z1 - LIB.z0, { base: null, tile: 2.4 });
  const surround = new THREE.Mesh(new THREE.PlaneGeometry(90, 70), new THREE.MeshBasicMaterial({ color: 0x2b1d3a }));
  surround.rotation.x = -Math.PI / 2;
  surround.position.set(LIB.cx, -0.12, 0);
  group.add(surround);
  // Rugs (thin, inset, just proud of the floor).
  P.box(paint, 0x8a3a4a, 207, 0, -1, 7.6, 0.02, 9.6, { base: null });
  P.box(paint, 0xd9a03f, 207, 0.02, -1, 7.0, 0.01, 9.0, { base: null });
  P.box(paint, 0x8a3a4a, 207, 0.03, -1, 6.6, 0.005, 8.6, { base: null });
  // Walls: full height west, north and east; low at the south so the camera sees in.
  const H = 4.5;
  const T = 0.4;
  P.box(paper, 0xffffff, LIB.x0 - T / 2, 0, 0, T, H, LIB.z1 - LIB.z0 + T * 2, { tile: 1.2 });
  P.box(paper, 0xffffff, LIB.x1 + T / 2, 0, -5.25, T, H, 7.5 + T, { tile: 1.2 });
  P.box(paper, 0xffffff, LIB.x1 + T / 2, 0, 5.25, T, H, 7.5 + T, { tile: 1.2 });
  P.box(paper, 0xffffff, LIB.x1 + T / 2, 0, 0, T, 0.9, 3, { tile: 1.2 });
  P.box(paper, 0xffffff, LIB.x1 + T / 2, 3.6, 0, T, 0.9, 3, { tile: 1.2, base: null });
  P.box(paper, 0xffffff, LIB.cx, 0, LIB.z0 - T / 2, LIB.x1 - LIB.x0 + T * 2, H, T, { tile: 1.2 });
  P.box(wood, 0x6b4a3a, (LIB.x0 + 198.4) / 2, 0, LIB.z1 + T / 2, 198.4 - LIB.x0, 1.1, T, { tile: 1 });
  P.box(wood, 0x6b4a3a, (201.6 + LIB.x1) / 2, 0, LIB.z1 + T / 2, LIB.x1 - 201.6, 1.1, T, { tile: 1 });
  // Wainscot (proud of the wallpaper) and a picture rail.
  P.box(wood, 0x6b4a3a, LIB.x0 + 0.03, 0, 0, 0.06, 1.1, LIB.z1 - LIB.z0, { tile: 1, base: null });
  P.box(wood, 0x6b4a3a, LIB.cx, 0, LIB.z0 + 0.03, LIB.x1 - LIB.x0, 1.1, 0.06, { tile: 1, base: null });
  P.box(wood, 0x6b4a3a, LIB.x1 - 0.03, 0, -5.25, 0.06, 1.1, 7.5, { tile: 1, base: null });
  P.box(wood, 0x6b4a3a, LIB.x1 - 0.03, 0, 5.25, 0.06, 1.1, 7.5, { tile: 1, base: null });
  // Beams across the top (the fans hang from them).
  for (const x of [195, 206]) P.box(wood, 0x5a3424, x, H - 0.1, 0, 0.35, 0.35, LIB.z1 - LIB.z0, { base: null, tile: 1 });
  // Shelves with spines on both long faces and coloured end caps with aisle letters.
  const capCols = [0xe8574a, 0x4aa3df, 0x3fb68b, 0xffd45c, 0x8a6bd1];
  const shelfList = shelves();
  shelfList.forEach((s, i) => {
    P.box(wood, 0x7a4e2e, s.x, 0, s.z, s.hw * 2, 2.6, s.hd * 2, { tile: 1 });
    for (const side of [-1, 1]) {
      const g = new THREE.PlaneGeometry(s.hd * 2 - 0.16, 2.3);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * ((s.hd * 2) / 1.6) + i * 0.37, uv.getY(k) * 3);
      P.add(g, spines, 0xffffff, mtx(s.x + side * (s.hw + 0.012), 1.32, s.z, 0, side * Math.PI / 2, 0), { ownUv: true, base: null });
    }
    const col = capCols[Math.floor(i / 2) % capCols.length];
    for (const end of [-1, 1]) P.box(paint, col, s.x, 0, s.z + end * (s.hd + 0.03), s.hw * 2 + 0.1, 2.7, 0.06, { base: null });
  });
  // Aisle letters on posts.
  const letters = canvasTex(512, 128, (g) => {
    ['A', 'B', 'C', 'D', 'E'].forEach((l, i) => {
      g.fillStyle = hex(capCols[i]);
      g.beginPath();
      g.arc(51 + i * 102, 64, 48, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff7e6';
      g.font = `72px ${DISPLAY_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(l, 51 + i * 102, 68);
    });
  });
  const letterMat = new THREE.MeshBasicMaterial({ map: letters, transparent: true });
  slots().forEach((sl, i) => {
    const g = new THREE.PlaneGeometry(0.6, 0.6);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 5);
    const m = new THREE.Mesh(g, letterMat);
    m.position.set(sl.sx, 3.1, sl.sz);
    m.rotation.x = -0.9;
    group.add(m);
  });
  // Book slots: a glowing gap, and the book that fills it.
  const slotGlow: THREE.Mesh[] = [];
  const slotBooks: THREE.Mesh[] = [];
  for (const sl of slots()) {
    const side = sl.sx > sl.x ? 1 : -1;
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.16), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.9 }));
    glow.position.set(sl.x + side * 0.02, sl.y, sl.z);
    group.add(glow);
    slotGlow.push(glow);
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.14), new THREE.MeshStandardMaterial({ color: 0xe8574a, roughness: 0.6 }));
    book.position.set(sl.x - side * 0.1, sl.y, sl.z);
    book.visible = false;
    group.add(book);
    slotBooks.push(book);
  }
  // Ms. Hush's returns desk.
  P.box(wood, 0x8a5a3a, 200, 0, 5.5, 4, 1.05, 1, { tile: 1 });
  P.box(wood, 0x5a3424, 200, 1.05, 5.5, 4.1, 0.06, 1.1, { tile: 1, base: null });
  for (let i = 0; i < 4; i++) P.box(paint, [0xe8574a, 0x4aa3df, 0x3fb68b, 0xffd45c][i], 198.6 + (i % 2) * 0.05, 1.11 + i * 0.07, 5.5, 0.45, 0.07, 0.32, { base: null });
  P.add(new THREE.SphereGeometry(0.1, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint, C.brass, mtx(201.4, 1.11, 5.4), { base: null });
  // Reading tables with green banker's lamps.
  const lampGlow: THREE.Matrix4[] = [];
  for (const [x, z] of [[205, -4], [209, -4], [205, 2], [209, 2]]) {
    P.box(wood, 0x8a5a3a, x, 0.74, z, 2.4, 0.06, 1.2, { tile: 1, base: null });
    for (const dx of [-1.05, 1.05]) for (const dz of [-0.5, 0.5]) P.box(wood, 0x6b4a3a, x + dx, 0, z + dz, 0.08, 0.74, 0.08, { tile: 1 });
    P.add(new THREE.CylinderGeometry(0.03, 0.08, 0.35, 8), paint, C.brass, mtx(x + 0.6, 0.97, z), { base: null });
    P.add(new THREE.CylinderGeometry(0.06, 0.2, 0.14, 12, 1, true), paint, 0x2f8f5a, mtx(x + 0.6, 1.16, z, 0, 0, 0.4), { base: null });
    lampGlow.push(mtx(x + 0.6, 1.1, z));
    for (const dz of [-0.3, 0.3]) P.box(paint, 0xfff7e6, x - 0.4, 0.8, z + dz, 0.4, 0.02, 0.28, { base: null, ry: 0.2 });
  }
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff0b0 }), lampGlow.length);
  lampGlow.forEach((m, i) => lamps.setMatrixAt(i, m));
  group.add(lamps);
  // Mr. Dozer's armchair and Biscuit's cushion.
  P.box(paint, 0x7a3a5a, 210.5, 0, 6.4, 1.2, 0.45, 1.1, { ry: -0.6 });
  P.box(paint, 0x7a3a5a, 210.5 + 0.35, 0.45, 6.4 + 0.3, 1.2, 0.9, 0.25, { ry: -0.6 });
  P.add(new THREE.CylinderGeometry(0.55, 0.6, 0.18, 16), paint, 0xff8fb1, mtx(188.6, 0.09, 6.4), { base: null });
  // The grandfather clock on the north wall.
  P.box(wood, 0x5a3424, 200, 0, -8.6, 0.9, 2.6, 0.5, { tile: 1 });
  P.box(wood, 0x6b4a3a, 200, 2.6, -8.6, 1.0, 0.7, 0.55, { tile: 1, base: null });
  P.box(paint, 0x2b1d3a, 200, 0.5, -8.33, 0.5, 1.6, 0.02, { base: null });
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), new THREE.MeshStandardMaterial({ map: clockTexture() }));
  face.position.set(200, 2.95, -8.31);
  group.add(face);
  const pendulum = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.0, 0.02), new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.6, roughness: 0.3 }));
  rod.position.y = -0.5;
  const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 16).rotateX(Math.PI / 2), rod.material);
  bob.position.y = -1.0;
  pendulum.add(rod, bob);
  pendulum.position.set(200, 2.15, -8.3);
  group.add(pendulum);
  // A SILENCE banner.
  const banner = canvasTex(512, 128, (g) => {
    g.fillStyle = '#8a3a4a';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#ffd24a';
    g.font = `88px ${DISPLAY_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SILENCE', 256, 68);
  });
  const ban = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: banner }));
  ban.position.set(206, 3.4, -8.78);
  group.add(ban);
  const ban2 = ban.clone();
  ban2.position.set(194, 3.4, -8.78);
  group.add(ban2);
  // Radiators on the east wall.
  const radiators: THREE.Object3D[] = [];
  for (const z of [-3, 4]) {
    const r = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.1), new THREE.MeshStandardMaterial({ color: 0xd8d8e0, metalness: 0.4, roughness: 0.5 }));
      fin.position.set(0, 0.5, (i - 3) * 0.14);
      r.add(fin);
    }
    r.position.set(212.65, 0, z);
    group.add(r);
    radiators.push(r);
  }
  // The open window with curtains.
  P.box(paint, 0xfff7e6, LIB.x1 - 0.05, 0.9, -1.55, 0.12, 2.7, 0.1, { base: null });
  P.box(paint, 0xfff7e6, LIB.x1 - 0.05, 0.9, 1.55, 0.12, 2.7, 0.1, { base: null });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.7), new THREE.MeshBasicMaterial({ color: 0x9fd8f5 }));
  sky.position.set(LIB.x1 + 0.3, 2.25, 0);
  sky.rotation.y = -Math.PI / 2;
  group.add(sky);
  const curtains: THREE.Object3D[] = [];
  for (const z of [-1.2, 1.2]) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.8, 4, 8), new THREE.MeshStandardMaterial({ color: 0xe8574a, side: THREE.DoubleSide, roughness: 0.9 }));
    c.geometry.translate(0, -1.4, 0);
    c.position.set(LIB.x1 - 0.25, 3.7, z);
    c.rotation.y = Math.PI / 2;
    group.add(c);
    curtains.push(c);
  }
  // Ceiling fans.
  const fans: THREE.Object3D[] = [];
  for (const x of [195, 206]) {
    const f = new THREE.Group();
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.15, 12), new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.6 }));
    f.add(hub);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.03, 0.22), new THREE.MeshStandardMaterial({ color: 0x6b4a3a }));
      blade.position.x = 0.6;
      const arm = new THREE.Group();
      arm.add(blade);
      arm.rotation.y = (i / 4) * Math.PI * 2;
      f.add(arm);
    }
    const rodf = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), hub.material);
    rodf.position.y = 0.3;
    f.add(rodf);
    f.position.set(x, 3.9, 0);
    group.add(f);
    fans.push(f);
  }
  // Potted plants and a globe.
  for (const [x, z] of [[188, -8], [212, -8], [212, 8], [203, 8.2]]) {
    P.add(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 12), paint, C.terracotta, mtx(x, 0.25, z));
    P.add(new THREE.IcosahedronGeometry(0.5, 1), paint, 0x5f9a4e, mtx(x, 0.95, z, 0, 0, 0, 1, 1.3, 1), { base: null });
  }
  P.add(new THREE.SphereGeometry(0.32, 16, 12), paint, 0x4aa3df, mtx(203.4, 1.25, 7.2), { base: null });
  P.add(new THREE.CylinderGeometry(0.05, 0.25, 0.9, 10), wood, 0x6b4a3a, mtx(203.4, 0.45, 7.2));
  // View cones for readers who are alert (shown in red while they look).
  const cones: THREE.Mesh[] = [];
  const coneGeo = new THREE.CircleGeometry(1, 24, -Math.PI / 2 - (35 * Math.PI) / 180, (70 * Math.PI) / 180);
  coneGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    m.renderOrder = 3;
    m.visible = false;
    group.add(m);
    cones.push(m);
  }
  P.build(group);
  return { group, pendulum, radiators, fans, curtains, slotGlow, slotBooks, cones };
}
