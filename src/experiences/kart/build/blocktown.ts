// Block Town: the playroom floor. Tiny karts race round a giant toy chest,
// under the TOYBOX arch, past a rocking horse, a crayon fence, block towers,
// a spinning top, a toy train and a run of dominoes that topple ahead of the
// leader. A big window lights the room by day; the ceiling lamp by night.

import * as THREE from 'three';
import { EDGE } from '../circuit';
import type { Dresser } from './dresser';
import { PADDOCK } from './paddock';
import { PAL, TOY_COLORS, blockTower, bunting, crayon, grandstand, pegDoll } from './props';
import { LAYER } from './road';
import type { CircuitScene, SceneInfo, ThemeParts } from './scene';
import { Shape, ball, cone, cyl, rbox, torus, xform } from './shape';
import { type TexCache, letterAtlas, letterBlock, letterCell } from './textures';

/** Peg-doll crowd in a grandstand, two instanced draw calls. */
export function crowd(group: THREE.Group, seats: THREE.Vector3[], m: THREE.Matrix4, count: number, palette = TOY_COLORS): { bob(t: number, cheer: number): void } {
  const { body, head } = pegDoll();
  const n = Math.min(count, seats.length);
  const bodies = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.6 }), n);
  const heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ roughness: 0.5 }), n);
  const skins = ['#f2c9a0', '#d9a07a', '#a8714f', '#7a4a32', '#f6d7b8'].map((x) => new THREE.Color(x));
  const shirts = palette.map((x) => new THREE.Color(x));
  // Spread the dolls over all the seats.
  const pick: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) pick.push(seats[Math.floor((i * seats.length) / n)]);
  const base: THREE.Vector3[] = [];
  const mm = new THREE.Matrix4();
  pick.forEach((p, i) => {
    const w = p.clone().applyMatrix4(m);
    base.push(w);
    bodies.setColorAt(i, shirts[(i * 7) % shirts.length]);
    heads.setColorAt(i, skins[(i * 3) % skins.length]);
    mm.makeTranslation(w.x, w.y + 0.42, w.z);
    bodies.setMatrixAt(i, mm);
    mm.makeTranslation(w.x, w.y + 0.92, w.z);
    heads.setMatrixAt(i, mm);
  });
  bodies.castShadow = true;
  group.add(bodies, heads);
  return {
    bob(t, cheer) {
      const k = 0.04 + cheer * 0.22;
      for (let i = 0; i < n; i++) {
        const w = base[i];
        const y = Math.max(0, Math.sin(t * (6 + (i % 5)) + i * 1.7)) * k;
        mm.makeTranslation(w.x, w.y + 0.42 + y, w.z);
        bodies.setMatrixAt(i, mm);
        mm.makeTranslation(w.x, w.y + 0.92 + y, w.z);
        heads.setMatrixAt(i, mm);
      }
      bodies.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
    },
  };
}

/** Room walls with wallpaper, a skirting board and a window; returns the window's materials. */
export function room(d: Dresser, tex: TexCache, look: { wall: string; print: string; skirting: string; height: number; night?: boolean }): { pane: THREE.MeshStandardMaterial; lamp: THREE.MeshStandardMaterial } {
  const c = d.c;
  const b = c.bounds;
  const m = c.def?.bounds ?? 30;
  const x0 = b.minX - m;
  const x1 = b.maxX + m;
  const z0 = b.minZ - m;
  const z1 = b.maxZ + m;
  const H = look.height;
  const paper = tex.make(256, 256, (g, w, h) => {
    g.fillStyle = look.wall;
    g.fillRect(0, 0, w, h);
    g.fillStyle = look.print;
    // Fluffy clouds (or stars at night) in a half-drop repeat.
    for (const [x, y] of [
      [0.25, 0.25],
      [0.75, 0.75],
    ]) {
      if (look.night) {
        g.save();
        g.translate(x * w, y * h);
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 9 : 24;
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
        g.restore();
      } else {
        for (const [dx, dy, r] of [
          [-22, 6, 18],
          [0, -6, 24],
          [24, 4, 18],
          [8, 10, 18],
        ])
          g.beginPath(), g.arc(x * w + dx, y * h + dy, r, 0, Math.PI * 2), g.fill();
      }
    }
  });
  const walls: [number, number, number, number, number][] = [
    // x, z, length, yaw (face direction), which
    [(x0 + x1) / 2, z0, x1 - x0, 0, 0],
    [(x0 + x1) / 2, z1, x1 - x0, Math.PI, 1],
    [x0, (z0 + z1) / 2, z1 - z0, Math.PI / 2, 2],
    [x1, (z0 + z1) / 2, z1 - z0, -Math.PI / 2, 3],
  ];
  const wallMat = new THREE.MeshStandardMaterial({ map: paper, roughness: 0.95 });
  const skirt = new THREE.MeshStandardMaterial({ color: look.skirting, roughness: 0.55 });
  let pane: THREE.MeshStandardMaterial | null = null;
  for (const [x, z, len, yaw, i] of walls) {
    const tx = paper.clone();
    tx.repeat.set(len / 22, H / 22);
    tx.needsUpdate = true;
    const mat = wallMat.clone();
    mat.map = tx;
    const g = new THREE.PlaneGeometry(len, H);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(x, H / 2 - 0.05, z);
    mesh.rotation.y = yaw;
    mesh.receiveShadow = true;
    d.group.add(mesh);
    // Skirting board stands proud of the wall; the side walls' boards stop short of the corners so none overlap.
    const sk = new THREE.Mesh(new THREE.BoxGeometry(i >= 2 ? len - 1.24 : len, 1.6, 0.6), skirt);
    sk.position.set(x + Math.sin(yaw) * 0.3, 0.8 - 0.05, z + Math.cos(yaw) * 0.3);
    sk.rotation.y = yaw;
    sk.receiveShadow = true;
    d.group.add(sk);
    if (i === 3) {
      // The big window in the east wall, with frame, panes and curtains.
      const wy = H * 0.52;
      const ww = Math.min(44, len * 0.4);
      const wh = H * 0.55;
      pane = new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1 });
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), pane);
      glass.position.set(x - 0.05, wy, z);
      glass.rotation.y = yaw;
      d.group.add(glass);
      const frame = new Shape();
      frame.at(rbox(1.2, wh + 1.2, 1.2, 0.2), PAL.cream, 0, 0, 0);
      const f = new Shape();
      // Uprights a touch shorter than the frame's top and bottom bars, so their ends never share a plane.
      for (const sx of [-1, 0, 1]) f.at(rbox(sx === 0 ? 0.7 : 1.4, wh + 1.36, 1.0, 0.2), PAL.cream, (sx * ww) / 2, 0, 0);
      for (const sy of [-1, 1]) f.at(rbox(ww + 1.4, 1.4, 1.0, 0.2), PAL.cream, 0, (sy * wh) / 2, 0);
      f.at(rbox(ww, 0.5, 1.0, 0.15), PAL.cream, 0, 0, 0);
      f.at(rbox(ww + 4, 0.8, 2.6, 0.2), PAL.cream, 0, -wh / 2 - 0.9, 0.8);
      d.batch.shape(f, xform(x - 0.5, wy, z, 0, yaw, 0));
      // Curtains, gathered at the sides.
      const cur = new Shape();
      for (const sx of [-1, 1])
        // Folds of different lengths, so their ends never share a plane.
        for (let k = 0; k < 5; k++) cur.at(cyl(1.0, 1.2, wh + 6 + k * 0.06, 10), k % 2 ? '#ef6fa0' : '#f48fb5', sx * (ww / 2 + 3 + k * 1.3), k * 0.02, 0.5 + (k % 2) * 0.4);
      cur.at(cyl(0.3, 0.3, ww + 26, 10), PAL.woodDark, 0, wh / 2 + 3.4, 0.4, 0, 0, Math.PI / 2);
      d.batch.shape(cur, xform(x - 1.8, wy + 1, z, 0, yaw, 0));
    }
  }
  // A ceiling with a lamp in the middle.
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f6efe2', roughness: 1 }));
  ceil.position.set((x0 + x1) / 2, H - 0.1, (z0 + z1) / 2);
  d.group.add(ceil);
  const lamp = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: new THREE.Color('#ffcf7a'), emissiveIntensity: 0.2, roughness: 0.5 });
  const shade = new Shape();
  shade.at(cyl(0.12, 0.12, 9, 6), PAL.ink, 0, H - 4.6, 0);
  shade.at(cone(5, 3.5, 20), '#ffd24a', 0, H - 9.6, 0, 0, 0, 0);
  d.batch.shape(shade, xform((x0 + x1) / 2, 0, (z0 + z1) / 2), 'plastic', { cast: false });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), lamp);
  bulb.position.set((x0 + x1) / 2, H - 11.4, (z0 + z1) / 2);
  d.group.add(bulb);
  return { pane: pane!, lamp };
}

export function dressBlockTown(d: Dresser, scene: CircuitScene, tex: TexCache): ThemeParts {
  const c = d.c;
  const batch = d.batch;
  const atlas = letterAtlas(tex);
  const blockMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.5 });
  /** A letter block in world space, batched with the atlas. */
  const letter = (x: number, y: number, z: number, size: number, yaw: number, letters: string, color: number, tilt = 0) => {
    const cells = [0, 1, 2, 3, 4, 5].map((f) => letterCell(letters[f % letters.length], color + (f > 3 ? 1 : 0)));
    const g = letterBlock(size, cells);
    g.applyMatrix4(xform(x, y, z, 0, yaw, tilt));
    batch.raw(g, blockMat, { cast: true, receive: true });
  };

  const walls = room(d, tex, { wall: '#fff3d6', print: '#bfe3ff', skirting: '#f4ead8', height: 46 });
  scene.lamps.push(walls.lamp);
  const paneDay = tex.make(256, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#5fb0f2');
    grad.addColorStop(1, '#d4ecff');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [x, y, r] of [
      [60, 70, 26],
      [90, 60, 32],
      [120, 72, 24],
      [180, 140, 20],
      [205, 132, 26],
    ])
      g.beginPath(), g.arc(x, y, r, 0, Math.PI * 2), g.fill();
    g.fillStyle = '#7fc25a';
    g.fillRect(0, h * 0.86, w, h * 0.14);
  });
  const paneNight = tex.make(256, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0c1233');
    grad.addColorStop(1, '#2c3768');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff6e0';
    for (let i = 0; i < 60; i++) g.fillRect(Math.random() * w, Math.random() * h * 0.8, 1.5, 1.5);
    g.fillStyle = '#ffe9a8';
    g.beginPath();
    g.arc(w * 0.7, h * 0.28, 22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1f2a55';
    g.fillRect(0, h * 0.86, w, h * 0.14);
  });
  walls.pane.map = paneDay;
  walls.pane.emissiveMap = paneDay;

  // ---- The toy chest behind the paddock: you came out of the toybox.
  {
    const q = c.pad(0, PADDOCK.back + 7.5);
    const yaw = c.padYaw(0, -1);
    const chest = new Shape();
    const W = 46;
    const Dp = 13;
    const Hh = 15;
    chest.at(rbox(W, Hh, Dp, 0.6), '#c46a3a', 0, Hh / 2, 0);
    for (const y of [2.2, Hh - 2.2]) chest.at(rbox(W + 0.3, 1.2, Dp + 0.3, 0.3), '#e8a04a', 0, y, 0);
    for (const sx of [-1, 1]) chest.at(rbox(1.4, Hh + 0.2, Dp + 0.4, 0.3), '#e8a04a', sx * (W / 2 - 1.2), Hh / 2, 0);
    // Painted stars on the front panel.
    for (const [x, y, col] of [
      [-14, 8.5, PAL.sun],
      [14, 8.5, PAL.sky],
      [-7, 11.5, PAL.mint],
      [8, 11.8, PAL.gum],
    ] as [number, number, string][])
      chest.at(new THREE.OctahedronGeometry(1.3, 0), col, x, y, Dp / 2 + 0.2, 0, 0, Math.PI / 4, 1, 1, 0.25);
    // The lid, open and leaning back.
    chest.at(rbox(W, 1.4, Dp, 0.5), '#b25e32', 0, Hh + 5.2, -Dp / 2 - 1.4, -1.25, 0, 0);
    chest.at(rbox(W + 0.4, 1.5, 1.2, 0.3), '#e8a04a', 0, Hh + 10.8, -Dp / 2 - 3.2, -1.25, 0, 0);
    // Toys peeking over the rim.
    chest.at(ball(3.2, 16, 12), PAL.tomato, -12, Hh + 1.4, 0);
    chest.at(ball(2.4, 14, 10), PAL.sky, 15, Hh + 0.6, 1);
    chest.at(rbox(4, 4, 4, 0.4), PAL.sun, 4, Hh + 1.2, -1, 0.2, 0.5, 0.1);
    chest.at(cyl(0.7, 0.7, 9, 12), PAL.mint, -3, Hh + 2.5, 2, 0.4, 0, 0.9);
    batch.shape(chest, xform(q.x, 0, q.z, 0, yaw, 0));
    d.wallBox(q.x, q.z, 23, 6.5, yaw, Hh, true);
    d.claim(q.x, q.z, 22);
  }

  // ---- TOYBOX arch over the main straight: at s 30, or further on where the
  // paddock (on some layouts beside the straight) leaves room for both pillars.
  {
    const side = EDGE + 5.2;
    const size = 2.6;
    const clear = (s: number) => {
      const f = c.frame(s);
      return [1, -1].every((sd) => d.free(f.x + f.nx * sd * side, f.z + f.nz * sd * side, 1.9, 0));
    };
    const s = [30, 64, 68].find(clear) ?? 30;
    const f = c.frame(s);
    const yaw = Math.atan2(f.tx, f.tz);
    for (const sd of [1, -1]) {
      const px = f.x + f.nx * sd * side;
      const pz = f.z + f.nz * sd * side;
      for (let k = 0; k < 3; k++) letter(px, size / 2 + k * (size + 0.002), pz, size, yaw + k * 0.06 * sd, k % 2 ? 'O' : sd > 0 ? 'T' : 'X', (k + (sd > 0 ? 0 : 2)) % 4);
      d.wallBox(px, pz, size / 2 + 0.1, size / 2 + 0.1, yaw, 9, true);
      d.claim(px, pz, 2.4);
    }
    // A long toy plank across the pillars, with TOYBOX spelled on top.
    const beamY = 3 * (size + 0.002) + 0.002;
    batch.part(rbox(side * 2 + size + 1.2, 0.7, 2.2, 0.2), PAL.wood, xform(f.x, beamY + 0.35, f.z, 0, yaw, 0));
    const word = 'TOYBOX';
    const bs = 2.3;
    for (let i = 0; i < 6; i++) {
      const o = (i - 2.5) * (bs + 0.25);
      letter(f.x - f.nx * o, beamY + 0.7 + 0.002 + bs / 2, f.z - f.nz * o, bs, yaw + (i % 2 ? 0.05 : -0.04), word[i], i % 4);
    }
  }

  // ---- Grandstand in the infield facing the main straight.
  let standAt: { x: number; z: number } | undefined;
  {
    const inSide = -c.paddock.side;
    const s = 44;
    const f = c.frame(s);
    const q = { x: f.x + f.nx * inSide * (EDGE + 9.5), z: f.z + f.nz * inSide * (EDGE + 9.5) };
    const yaw = Math.atan2(-f.nx * inSide, -f.nz * inSide);
    const gs = grandstand(26, 4, { frame: '#c9c2d6', seat: PAL.sky, roofA: PAL.tomato, roofB: PAL.cream });
    const m = xform(q.x, 0, q.z, 0, yaw, 0);
    batch.shape(gs.shape, m);
    d.wallBox(q.x - Math.sin(yaw) * 2, q.z - Math.cos(yaw) * 2, 13.5, 4.2, yaw, 5, true);
    d.claim(q.x - Math.sin(yaw) * 2, q.z - Math.cos(yaw) * 2, 14);
    const fans = crowd(d.group, gs.seats, m, 96);
    standAt = { x: q.x, z: q.z };
    // A sign on the roof edge.
    const signTex = tex.make(1024, 128, (g, w, h) => {
      g.fillStyle = '#1d1830';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffd24a';
      g.font = `${h * 0.62}px "Lilita One", system-ui`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('TOYBOX GRAND PRIX', w / 2, h * 0.54);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.75), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, emissive: new THREE.Color('#ffffff'), emissiveMap: signTex, emissiveIntensity: 0.2 }));
    sign.position.set(q.x + Math.sin(yaw) * 3.45, 0.7 + 4 * 0.75 + 2.4, q.z + Math.cos(yaw) * 3.45);
    sign.rotation.y = yaw;
    scene.lamps.push(sign.material as THREE.MeshStandardMaterial);
    d.group.add(sign);
    (scene as { crowd?: typeof fans }).crowd = fans;
  }

  // ---- Rocking horse behind a wall of alphabet blocks at the first corner.
  const horse = new THREE.Group();
  {
    const s = 92;
    const out = d.outsideSide(s);
    const q = d.beside(s, out, 13);
    horse.position.set(q.x, 0, q.z);
    horse.rotation.y = q.yaw + Math.PI / 2;
    const h = new Shape();
    // Rockers.
    h.at(torus(14, 0.5, 6, 40, 0.9), '#b25e32', -1.6, 14, 0, 0, 0, Math.PI * 1.5 - 0.45);
    h.at(torus(14, 0.5, 6, 40, 0.9), '#b25e32', 1.6, 14, 0, 0, 0, Math.PI * 1.5 - 0.45);
    for (const z of [-3.4, 3.4]) for (const sx of [-1, 1]) h.at(rbox(0.6, 3.6, 0.6, 0.2), PAL.wood, sx * 1.6, 1.9, z, z > 0 ? -0.15 : 0.15, 0, 0);
    // Body, neck, head.
    h.at(rbox(3.2, 3.0, 8.4, 1.2), PAL.cream, 0, 5.3, 0);
    h.at(rbox(2.6, 5.0, 2.6, 1.0), PAL.cream, 0, 8.0, 3.4, -0.5, 0, 0);
    h.at(rbox(2.6, 2.4, 4.6, 1.0), PAL.cream, 0, 10.2, 5.4, 0.2, 0, 0);
    for (const sx of [-1, 1]) {
      h.at(cone(0.5, 1.4, 6), PAL.cream, sx * 0.8, 11.9, 4.0, -0.2, 0, 0);
      h.at(ball(0.35, 8, 6), PAL.ink, sx * 1.32, 10.7, 6.2);
    }
    // Mane, saddle, reins, tail.
    for (let k = 0; k < 6; k++) h.at(ball(0.8, 8, 6), PAL.tomato, 0, 7.4 + k * 0.85, 2.0 + k * 0.45);
    h.at(rbox(3.4, 0.6, 3.0, 0.25), PAL.sky, 0, 6.95, -0.6);
    h.at(rbox(3.6, 1.2, 0.4, 0.15), PAL.sun, 0, 6.6, 0.9);
    h.at(rbox(0.8, 4.0, 0.8, 0.35), PAL.tomato, 0, 5.2, -4.8, 0.6, 0, 0);
    h.at(torus(1.4, 0.12, 6, 18), PAL.sun, 0, 9.8, 6.6, 0, 0, 0);
    // Dapples.
    for (const [x, y, z] of [
      [1.62, 5.6, 1.6],
      [1.62, 4.8, -1.8],
      [-1.62, 5.4, -0.4],
      [-1.62, 6.0, 2.4],
    ])
      h.at(ball(0.55, 8, 6), PAL.sky, x, y, z, 0, 0, 0, 0.2, 1, 1);
    const hm = h.mesh('plastic');
    horse.add(hm);
    d.group.add(horse);
    d.claim(q.x, q.z, 9);
    d.colliders.push({ kind: 'circle', x: q.x, z: q.z, r: 5, h: 12, bounce: 0.3, blocksCamera: true });
    // The block wall between the horse and the road.
    for (let k = -5; k <= 5; k++) {
      const p = d.beside(s + k * 2.6, out, 5.2);
      if (!d.free(p.x, p.z, 1.2, 3.6)) continue;
      letter(p.x, 1.1, p.z, 2.2, p.yaw + k * 0.1, 'ABCDEGKNPRSZ'[(k + 5) % 12], (k + 6) % 4);
      if (k % 3 === 0 && d.free(p.x, p.z, 1.2, 3.6)) letter(p.x, 2.2 + 0.002 + 0.9, p.z, 1.8, p.yaw - k * 0.13, 'TOY'[(k + 6) % 3], (k + 7) % 4);
      d.claim(p.x, p.z, 1.6);
      d.colliders.push({ kind: 'circle', x: p.x, z: p.z, r: 1.3, h: 2.5, bounce: 0.5, blocksCamera: false });
    }
  }

  // ---- Crayon fence along the outside of the kink.
  {
    const out = d.outsideSide(142);
    const cols = ['#e8574a', '#f4b740', '#ffd24a', '#3fb68b', '#4aa3df', '#8a6bd1', '#ef6fa0', '#7a4a32', '#1d1830'];
    for (let k = 0; k < 11; k++) {
      const s = 128 + k * 2.8;
      const p = d.beside(s, out, 4.6 + (k % 2) * 0.4);
      const h = 6 + ((k * 7) % 5) * 0.8;
      d.place(crayon(cols[k % cols.length], h, 0.75), p.x, p.z, p.yaw + k, 0.8, { road: 3.4, collide: 0.8 });
    }
  }

  // ---- Block towers in the pockets of the esses.
  for (const [s, side, n] of [
    [186, -1, 4],
    [205, 1, 3],
    [222, -1, 4],
    [242, 1, 3],
    [212, -1, 2],
  ] as [number, number, number][]) {
    const p = d.beside(s, side, 6 + n * 0.8);
    d.place(blockTower(n, 3.2, Math.floor(s)), p.x, p.z, p.yaw + s, 2.6, { road: 4, collide: 2.2 });
  }

  // ---- The spinning top in the hairpin's infield.
  const top = new THREE.Group();
  {
    let best: { x: number; z: number } | null = null;
    for (let s = 270; s <= 312; s += 2) {
      const f = c.frame(s);
      const turn = c.path.turnAhead(s - 6, 12);
      const inside = turn > 0 ? 1 : -1;
      const q = { x: f.x + f.nx * inside * 13, z: f.z + f.nz * inside * 13 };
      if (!best) best = q;
      best = { x: (best.x + q.x) / 2, z: (best.z + q.z) / 2 };
    }
    if (best && d.free(best.x, best.z, 3.4, 2.5)) {
      top.position.set(best.x, 0, best.z);
      const t = new Shape();
      const bands = [PAL.tomato, PAL.cream, PAL.sky, PAL.sun, PAL.mint];
      for (let i = 0; i < 5; i++) t.at(cyl(3.4 - i * 0.3, 3.1 - i * 0.3, 0.9, 24), bands[i], 0, 2.3 + i * 0.9, 0);
      t.at(cone(3.1, 2.2, 24), PAL.tomato, 0, 1.05, 0, Math.PI, 0, 0);
      t.at(cyl(0.35, 0.35, 2.4, 10), PAL.wood, 0, 7.6, 0);
      t.at(ball(0.6, 10, 8), PAL.sun, 0, 8.9, 0);
      top.add(t.mesh('plastic'));
      d.group.add(top);
      d.claim(best.x, best.z, 4);
      d.colliders.push({ kind: 'circle', x: best.x, z: best.z, r: 3.2, h: 8, bounce: 0.9, blocksCamera: false });
    }
  }

  // ---- The toy train on its own oval in the biggest open patch of infield.
  const train = new THREE.Group();
  const trainCars: THREE.Object3D[] = [];
  let trainOval = { x: 0, z: 0, a: 14, b: 8, yaw: 0 };
  {
    const spots = d.openSpots(14, 4);
    const sp = spots[0];
    if (sp) {
      trainOval = { x: sp.x, z: sp.z, a: Math.min(16, sp.clear - 4), b: Math.min(9, sp.clear - 6), yaw: 0.3 };
      // Rails: two thin rings and sleepers, raised as a toy track piece.
      const rails = new Shape();
      const N = 64;
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2;
        const a1 = ((i + 1) / N) * Math.PI * 2;
        for (const off of [-0.55, 0.55]) {
          const p0 = { x: Math.cos(a0) * (trainOval.a + off), z: Math.sin(a0) * (trainOval.b + off) };
          const p1 = { x: Math.cos(a1) * (trainOval.a + off), z: Math.sin(a1) * (trainOval.b + off) };
          const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
          rails.at(rbox(0.16, 0.16, len + 0.05, 0.03), '#9a96aa', (p0.x + p1.x) / 2, 0.36, (p0.z + p1.z) / 2, 0, Math.atan2(p1.x - p0.x, p1.z - p0.z), 0);
        }
        if (i % 2 === 0) {
          const p = { x: Math.cos(a0) * trainOval.a, z: Math.sin(a0) * trainOval.b };
          rails.at(rbox(1.7, 0.2, 0.36, 0.05), PAL.wood, p.x, 0.15, p.z, 0, Math.atan2(-Math.sin(a0) * trainOval.a, Math.cos(a0) * trainOval.b) + Math.PI / 2, 0);
        }
      }
      batch.shape(rails, xform(sp.x, 0, sp.z, 0, trainOval.yaw, 0), 'plastic', { cast: false });
      d.claim(sp.x, sp.z, trainOval.a + 2);
      train.position.set(sp.x, 0, sp.z);
      train.rotation.y = trainOval.yaw;
      const engine = new Shape();
      engine.at(rbox(1.7, 1.2, 3.4, 0.25), PAL.tomato, 0, 1.0, 0);
      engine.at(cyl(0.65, 0.65, 2.2, 14), PAL.ink, 0, 1.35, 0.7, Math.PI / 2, 0, 0);
      engine.at(rbox(1.7, 1.6, 1.3, 0.25), PAL.sky, 0, 1.9, -0.9);
      engine.at(cyl(0.3, 0.4, 1.0, 10), PAL.ink, 0, 2.3, 1.4);
      engine.at(rbox(1.9, 0.2, 1.6, 0.08), PAL.sun, 0, 2.8, -0.9);
      for (const z of [-1.1, 0, 1.1]) for (const sx of [-1, 1]) engine.at(cyl(0.38, 0.38, 0.2, 12), PAL.sun, sx * 0.9, 0.45, z, 0, 0, Math.PI / 2);
      const car = new Shape();
      car.at(rbox(1.7, 1.0, 2.8, 0.25), PAL.mint, 0, 0.95, 0);
      car.at(rbox(1.3, 0.8, 2.2, 0.3), PAL.sun, 0, 1.6, 0);
      for (const z of [-0.8, 0.8]) for (const sx of [-1, 1]) car.at(cyl(0.34, 0.34, 0.2, 12), PAL.ink, sx * 0.9, 0.42, z, 0, 0, Math.PI / 2);
      const parts = [engine.mesh('plastic'), car.mesh('plastic')];
      const car2 = car.mesh('plastic');
      (car2.geometry as THREE.BufferGeometry).dispose();
      car2.geometry = parts[1].geometry;
      for (const p of [parts[0], parts[1], car2]) {
        const o = new THREE.Group();
        o.add(p);
        train.add(o);
        trainCars.push(o);
      }
      // Start spaced out along the oval.
      trainCars.forEach((o, i) => {
        const a = -i * 0.3;
        o.position.set(Math.cos(a) * trainOval.a, 0, Math.sin(a) * trainOval.b);
      });
      d.group.add(train);
    }
  }

  // ---- The domino run outside the back straight.
  const DOM = 40;
  const domGeo = new THREE.BoxGeometry(1.6, 4.4, 0.55);
  domGeo.translate(0, 2.2, 0);
  const domTex = tex.make(128, 256, (g, w, h) => {
    g.fillStyle = '#fbf8f0';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1d1830';
    g.fillRect(w * 0.1, h * 0.49, w * 0.8, h * 0.02);
    const dots = (cx: number, cy: number) => {
      g.beginPath();
      g.arc(cx, cy, w * 0.08, 0, Math.PI * 2);
      g.fill();
    };
    dots(w * 0.3, h * 0.15);
    dots(w * 0.7, h * 0.35);
    dots(w * 0.5, h * 0.25);
    dots(w * 0.3, h * 0.65);
    dots(w * 0.7, h * 0.85);
  });
  const dominoes = new THREE.InstancedMesh(domGeo, new THREE.MeshStandardMaterial({ map: domTex, roughness: 0.4 }), DOM);
  dominoes.castShadow = true;
  const domBase: { x: number; z: number; yaw: number; angle: number }[] = [];
  {
    const out = d.outsideSide(400);
    for (let i = 0; i < DOM; i++) {
      const s = 380 + i * 1.0;
      const f = c.frame(s);
      const q = { x: f.x + f.nx * out * (EDGE + 6.5), z: f.z + f.nz * out * (EDGE + 6.5) };
      const yaw = Math.atan2(f.tx, f.tz);
      domBase.push({ x: q.x, z: q.z, yaw, angle: 0 });
      d.claim(q.x, q.z, 1);
    }
    const a = domBase[0];
    const b = domBase[DOM - 1];
    d.colliders.push({ kind: 'box', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, hw: 1.0, hd: 20.5, rot: a.yaw, cos: Math.cos(a.yaw), sin: Math.sin(a.yaw), h: 4.4, bounce: 0.3, blocksCamera: false });
    d.group.add(dominoes);
  }
  const mm = new THREE.Matrix4();
  const q4 = new THREE.Quaternion();
  const e4 = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const setDominoes = () => {
    domBase.forEach((p, i) => {
      // Tip forward along the race direction.
      e4.set(p.angle, p.yaw, 0, 'YXZ');
      q4.setFromEuler(e4);
      mm.compose(new THREE.Vector3(p.x, 0, p.z), q4, one);
      dominoes.setMatrixAt(i, mm);
    });
    dominoes.instanceMatrix.needsUpdate = true;
  };
  setDominoes();

  // ---- Rugs on the floor in open patches, and scattered toys.
  {
    const spots = d.openSpots(10, 6, null);
    const rugTex = tex.make(256, 256, (g, w, h) => {
      g.fillStyle = '#4aa3df';
      g.beginPath();
      g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
      g.fill();
      const rings = ['#ffd24a', '#fffaf0', '#ef6fa0', '#fffaf0', '#3fb68b'];
      rings.forEach((col, i) => {
        g.strokeStyle = col;
        g.lineWidth = 9;
        g.beginPath();
        g.arc(w / 2, h / 2, w / 2 - 14 - i * 20, 0, Math.PI * 2);
        g.stroke();
      });
    });
    const rugMat = new THREE.MeshStandardMaterial({ map: rugTex, transparent: true, alphaTest: 0.5, roughness: 1 });
    let rugs = 0;
    for (const sp of spots) {
      if (rugs >= 3) break;
      const r = Math.min(9, sp.clear - 4);
      if (r < 5 || !d.free(sp.x, sp.z, r, 2)) continue;
      const g = new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2);
      g.translate(sp.x, LAYER.prints, sp.z);
      batch.raw(g, rugMat, { receive: true });
      // Leave the rug free, but let toys sit near it.
      d.claim(sp.x, sp.z, r * 0.6);
      rugs++;
    }
    let toys = 0;
    for (const sp of d.openSpots(6, 5, null)) {
      if (toys > 22) break;
      const k = toys % 4;
      if (!d.free(sp.x, sp.z, 2, 4)) continue;
      if (k === 0) d.place(blockTower(2 + (toys % 2), 2.4, toys), sp.x, sp.z, toys, 2, { collide: 1.6 });
      else if (k === 1) {
        letter(sp.x, 1.2, sp.z, 2.4, toys * 0.7, 'ABCDEGKNPRSZ'[toys % 12], toys % 4);
        d.claim(sp.x, sp.z, 2);
        d.colliders.push({ kind: 'circle', x: sp.x, z: sp.z, r: 1.4, h: 2.4, bounce: 0.5, blocksCamera: false });
      } else if (k === 2) d.place(new Shape().at(ball(1.6, 16, 12), TOY_COLORS[toys % 7], 0, 1.6, 0).at(torus(1.62, 0.12, 6, 24), PAL.cream, 0, 1.6, 0, Math.PI / 2, 0, 0), sp.x, sp.z, 0, 1.7, { collide: 1.5 });
      else d.place(crayon(TOY_COLORS[toys % 7], 5, 0.6), sp.x, sp.z, 0, 1, { collide: 0.6 });
      toys++;
    }
  }

  // ---- A bookshelf along the far wall.
  {
    const b = c.bounds;
    const m = c.def?.bounds ?? 30;
    const x0 = b.minX - m + 2.2;
    const cz = (b.minZ + b.maxZ) / 2;
    const shelf = new Shape();
    shelf.at(rbox(4, 29.7, 40, 0.3), PAL.woodDark, 0, 14.85, 0);
    for (const y of [0.4, 10, 20, 29.6]) shelf.at(rbox(4.4, 0.8, 40.4, 0.2), PAL.wood, 0.3, y, 0);
    for (let row = 0; row < 3; row++) {
      let z = -19;
      let k = row * 5;
      while (z < 18.5) {
        const w = 1.2 + ((k * 7) % 5) * 0.35;
        const h = 6.2 + ((k * 3) % 4) * 0.8;
        shelf.at(rbox(3.2, h, w, 0.12), TOY_COLORS[k % 7], 0.6, row * 9.6 + 0.8 + h / 2, z + w / 2);
        z += w + 0.08;
        k++;
      }
    }
    batch.shape(shelf, xform(x0, 0, cz), 'plastic');
  }

  // ---- Bunting over the main straight from the arch to the gantry.
  {
    const f0 = c.frame(4);
    const f1 = c.frame(26);
    const mid = { x: (f0.x + f1.x) / 2, z: (f0.z + f1.z) / 2 };
    for (const sd of [1, -1]) {
      const p = { x: mid.x + f0.nx * sd * (EDGE + 4), z: mid.z + f0.nz * sd * (EDGE + 4) };
      batch.shape(bunting(22, 1.2), xform(p.x, 7.0, p.z, 0, Math.atan2(f0.tx, f0.tz) + Math.PI / 2, 0), 'plastic', { cast: false });
    }
  }

  let lastLeader = -1;
  for (const g of [horse, top, train]) g.userData.dynamic = true;
  return {
    stand: standAt,
    hero: new THREE.Vector3(horse.position.x, 8, horse.position.z),
    dust: 0xd9a066,
    update(dt: number, t: number, night: number, info: SceneInfo) {
      walls.pane.map = night > 0.5 ? paneNight : paneDay;
      walls.pane.emissiveMap = walls.pane.map;
      walls.pane.emissiveIntensity = 0.9;
      walls.lamp.emissiveIntensity = 0.2 + night * 2.2;
      horse.rotation.z = Math.sin(t * 1.4) * 0.12;
      top.rotation.y += dt * 9;
      top.rotation.z = Math.sin(t * 0.7) * 0.06;
      top.position.x += Math.sin(t * 0.5) * 0.004;
      // The train runs round its oval.
      trainCars.forEach((o, i) => {
        const a = t * 0.28 - i * 0.3;
        o.position.set(Math.cos(a) * trainOval.a, 0, Math.sin(a) * trainOval.b);
        o.rotation.y = Math.atan2(-Math.sin(a) * trainOval.a, Math.cos(a) * trainOval.b) + Math.PI;
      });
      // Dominoes topple in a wave just ahead of the leader, and stand back up once the pack has gone.
      const L = c.length;
      const lead = info.racing ? info.leaderS : (t * 12) % L;
      let changed = false;
      domBase.forEach((p, i) => {
        const s = 380 + i;
        const ahead = s - lead;
        const want = ahead < 14 && ahead > -40 ? 1.35 : 0;
        const rate = want > p.angle ? 4.5 : 0.8;
        const next = p.angle + Math.sign(want - p.angle) * Math.min(Math.abs(want - p.angle), rate * dt);
        if (Math.abs(next - p.angle) > 1e-4) changed = true;
        p.angle = next;
      });
      if (changed) setDominoes();
      lastLeader = lead;
      const fans = (scene as { crowd?: { bob(t: number, cheer: number): void } }).crowd;
      fans?.bob(t, info.finalLap ? 1 : info.racing ? 0.35 : 0.1);
      void lastLeader;
    },
  };
}
