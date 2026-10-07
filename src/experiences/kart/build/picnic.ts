// Picnic Park: a lawn at the edge of a garden, under the town sky. A lemonade
// stand for a paddock, a sandwich the size of a house, a picnic basket in
// the esses, the Watermelon Jump over a lemonade puddle, a juice box whose
// bendy straw arches over the hairpin, a giant gnome who blinks, and ants
// marching over Anthill Rise. Paper lanterns and fireflies after dark.

import * as THREE from 'three';
import { EDGE } from '../circuit';
import type { Dresser } from './dresser';
import { PADDOCK } from './paddock';
import { PAL, TOY_COLORS, flower, grandstand, lollipopTree } from './props';
import { LAYER } from './road';
import type { CircuitScene, SceneInfo, ThemeParts } from './scene';
import { Shape, ball, cone, cyl, rbox, torus, xform } from './shape';
import type { TexCache } from './textures';
import { crowd } from './blocktown';

/** A white picket fence along a line, merged into the batch. */
function picket(d: Dresser, x0: number, z0: number, x1: number, z1: number): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  const n = Math.floor(len / 0.9);
  const s = new Shape();
  // The last picket would sit on the next run's first: leave it out.
  for (let i = 0; i < n; i++) {
    const t = i / n - 0.5;
    // Plain boxes: a rounded one costs nine times the triangles, and there are hundreds.
    s.at(rbox(0.32, 1.5, 0.12, 0), '#fbf8f0', 0, 0.75, t * len);
    s.at(cone(0.23, 0.32, 4), '#fbf8f0', 0, 1.6, t * len, 0, Math.PI / 4, 0);
  }
  for (const y of [0.45, 1.15]) s.at(rbox(0.1, 0.14, len - 0.5, 0), '#f0ebe0', -0.1, y, 0);
  d.batch.shape(s, xform((x0 + x1) / 2, 0, (z0 + z1) / 2, 0, yaw, 0), 'plastic', { cast: false });
}

export function dressPicnic(d: Dresser, scene: CircuitScene, tex: TexCache): ThemeParts {
  const c = d.c;
  const batch = d.batch;
  const b = c.bounds;
  const m = c.def?.bounds ?? 30;
  const x0 = b.minX - m;
  const x1 = b.maxX + m;
  const z0 = b.minZ - m;
  const z1 = b.maxZ + m;

  // ---- The garden's edge: a picket fence, hedges and big flowers beyond it.
  picket(d, x0, z0, x1, z0);
  picket(d, x1, z0, x1, z1);
  picket(d, x1, z1, x0, z1);
  picket(d, x0, z1, x0, z0);
  const hedge = new Shape();
  const hedgeAlong = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t < len; t += 5.5) {
      const k = t / len;
      const r = 3 + ((t * 7) % 3) * 0.5;
      hedge.at(ball(r, 10, 8), t % 11 < 5.5 ? '#3f8f45' : '#4aa050', ax + (bx - ax) * k, r * 0.7, az + (bz - az) * k);
    }
  };
  hedgeAlong(x0 - 5, z0 - 5, x1 + 5, z0 - 5);
  hedgeAlong(x1 + 5, z0 - 5, x1 + 5, z1 + 5);
  hedgeAlong(x1 + 5, z1 + 5, x0 - 5, z1 + 5);
  hedgeAlong(x0 - 5, z1 + 5, x0 - 5, z0 - 5);
  batch.shape(hedge, new THREE.Matrix4(), 'matte', { cast: false, detail: true });
  const giant = new Shape();
  let k = 0;
  for (const [x, z] of [
    [x0 - 14, z0 + 30],
    [x0 - 12, (z0 + z1) / 2],
    [x1 + 13, z0 + 40],
    [x1 + 15, z1 - 30],
    [(x0 + x1) / 2, z1 + 15],
    [x0 + 40, z1 + 13],
    [x1 - 40, z0 - 14],
    [x0 + 30, z0 - 15],
  ]) {
    giant.put(flower(16 + (k % 3) * 4, [PAL.gum, PAL.sun, PAL.tomato, '#fffaf0', PAL.grape][k % 5], k % 2 ? 'daisy' : 'tulip'), xform(x, 0, z, 0, k, 0));
    k++;
  }
  batch.shape(giant, new THREE.Matrix4(), 'plastic', { cast: true, detail: true });

  // ---- The lemonade stand behind the paddock.
  {
    const q = c.pad(0, PADDOCK.back + 5);
    const yaw = c.padYaw(0, -1);
    const s = new Shape();
    s.at(rbox(26, 4.4, 5, 0.3), '#fff3d6', 0, 2.2, 0);
    s.at(rbox(26.6, 0.5, 5.6, 0.2), PAL.sun, 0, 4.6, 0);
    for (let i = 0; i < 9; i++) s.at(rbox(26 / 9 + 0.02, 4.6, 0.2, 0.05), i % 2 ? PAL.tomato : '#fffaf0', -13 + (i + 0.5) * (26 / 9), 2.3, 2.62);
    for (const sx of [-12.6, 12.6]) s.at(rbox(0.6, 11, 0.6, 0.15), '#fffaf0', sx, 5.5, 1.6);
    // Striped awning.
    for (let i = 0; i < 10; i++) s.at(rbox(2.8, 0.25, 7.2, 0.1), i % 2 ? '#ffd24a' : '#fffaf0', -12.6 + i * 2.8, 10.6, 1.4, 0.32, 0, 0);
    // A jug and cups on the counter.
    s.at(cyl(1.4, 1.6, 3.4, 16), '#fff6b0', 4, 6.6, 1);
    s.at(cyl(1.42, 1.62, 0.5, 16), PAL.tomato, 4, 5.2, 1);
    s.at(torus(1.0, 0.25, 6, 14, Math.PI), '#fff6b0', 5.6, 6.8, 1, 0, Math.PI / 2, 0);
    for (let i = 0; i < 4; i++) s.at(cyl(0.6, 0.5, 1.4, 12), [PAL.sky, PAL.mint, PAL.gum, PAL.sun][i], -8 + i * 2.2, 5.6, 1.2);
    for (let i = 0; i < 3; i++) s.at(ball(1.2, 12, 9), '#ffe14d', -1 - i * 0.9, 5.4 + i * 0.6, 0.6 - i * 0.4, 0, 0, 0, 1.25, 1, 1);
    batch.shape(s, xform(q.x, 0, q.z, 0, yaw, 0));
    d.wallBox(q.x, q.z, 13.2, 3, yaw, 11, true);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 2),
      new THREE.MeshStandardMaterial({
        map: tex.make(512, 100, (g, w, h) => {
          g.fillStyle = '#e8574a';
          g.fillRect(0, 0, w, h);
          g.fillStyle = '#fffaf0';
          g.font = `${h * 0.7}px "Lilita One", system-ui`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('LEMONADE', w / 2, h * 0.55);
        }),
        roughness: 0.7,
      }),
    );
    const f = { x: Math.sin(yaw), z: Math.cos(yaw) };
    sign.position.set(q.x + f.x * 2.62 + f.x * 0.12, 3.4, q.z + f.z * 2.62 + f.z * 0.12);
    sign.rotation.y = yaw;
    d.group.add(sign);
  }

  // ---- Sandwich Bend: a sandwich the size of a house inside the first corner.
  {
    let best: { x: number; z: number } | null = null;
    for (const sp of d.openSpots(9, 4)) {
      const n = c.path.nearest(sp.x, sp.z);
      if (n.s > 30 && n.s < 70) {
        best = sp;
        break;
      }
    }
    if (best) {
      const s = new Shape();
      const W = 10;
      s.at(rbox(W, 1.2, W, 0.5), '#e9c48a', 0, 0.6, 0);
      s.at(rbox(W - 0.6, 1.1, W - 0.6, 0.45), '#fff6e2', 0, 0.62, 0);
      for (let i = 0; i < 7; i++) s.at(ball(1.6, 10, 6), '#6fcf5a', -4 + (i % 4) * 2.7, 1.55, -3.8 + Math.floor(i / 4) * 7.6, 0, i, 0, 1.4, 0.25, 1.1);
      for (const [x, z] of [
        [-2.4, -1.6],
        [2.2, 1.8],
        [1.6, -2.4],
      ])
        s.at(cyl(1.8, 1.8, 0.35, 18), '#e8574a', x, 1.75, z);
      s.at(rbox(W + 0.8, 0.3, W + 0.8, 0.05), '#ffd24a', 0, 2.1, 0, 0, 0.785, 0);
      s.at(rbox(W, 1.2, W, 0.5), '#e9c48a', 0, 2.85, 0, 0.04, 0.1, 0);
      s.at(rbox(W - 0.6, 1.1, W - 0.6, 0.45), '#fff6e2', 0, 2.83, 0, 0.04, 0.1, 0);
      s.at(cyl(0.12, 0.12, 4, 8), '#c98a54', 0, 4.4, 0);
      s.at(cone(0.6, 1.0, 3), PAL.tomato, 0.5, 6.0, 0, 0, 0, Math.PI / 2);
      d.place(s, best.x, best.z, 0.3, 7.2, { collide: 6.4 });
    }
  }

  // ---- The picnic basket in a pocket of the esses.
  {
    const p = d.beside(100, d.outsideSide(90), 9);
    const s = new Shape();
    for (let i = 0; i < 8; i++) s.at(rbox(9, 0.75, 6, 0.2), i % 2 ? '#b98a5e' : '#a87a4e', 0, 0.4 + i * 0.76, 0);
    s.at(rbox(9.4, 0.6, 6.4, 0.25), '#8a5a3b', 0, 6.4, 0);
    s.at(torus(3.6, 0.35, 8, 24, Math.PI), '#8a5a3b', 0, 6.7, 0);
    s.at(rbox(4, 0.4, 6.6, 0.15), PAL.tomato, -2.4, 6.75, 0, 0, 0, -0.2);
    s.at(rbox(4, 0.42, 6.6, 0.15), '#fffaf0', -2.4, 6.72, 0.01, 0, 0.02, -0.2);
    d.place(s, p.x, p.z, p.yaw, 5.6, { collide: 5 });
  }

  // ---- Lemonade puddle under the jump's gap, and the watermelon decor.
  {
    const gap = c.def!.raises[0].gap!;
    const mid = (gap.s0 + gap.s1) / 2;
    const q = c.at(mid, 0);
    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#ffe46b', roughness: 0.08, metalness: 0.1, emissive: new THREE.Color('#ffd24a'), emissiveIntensity: 0.15 }),
    );
    puddle.scale.set(EDGE + 0.6, 1, (gap.s1 - gap.s0) / 2 + 0.6);
    puddle.position.set(q.x, LAYER.prints, q.z);
    puddle.rotation.y = q.heading;
    d.group.add(puddle);
    // A slice of melon resting on each side of the run.
    for (const sd of [1, -1]) {
      const p = d.beside(118, sd, 6);
      const s = new Shape();
      s.at(new THREE.CylinderGeometry(4, 4, 1.2, 24, 1, false, 0, Math.PI), '#2f8f4e', 0, 0, 0, Math.PI / 2, 0, 0);
      s.at(new THREE.CylinderGeometry(3.6, 3.6, 1.26, 24, 1, false, 0, Math.PI), '#ff6b7a', 0, 0.02, 0, Math.PI / 2, 0, 0);
      for (let i = 0; i < 5; i++) s.at(ball(0.18, 6, 5), PAL.ink, -2 + i, 1.4 + (i % 2) * 0.8, 0.64);
      d.place(s, p.x, p.z, p.yaw + Math.PI / 2, 4, { collide: 3.4 });
    }
  }

  // ---- Juice Box hairpin: the box in the infield, its bendy straw over the road.
  const strawMats: THREE.Material[] = [];
  {
    const f = c.frame(197);
    const turn = c.path.turnAhead(190, 12);
    const inside = turn > 0 ? 1 : -1;
    const q = { x: f.x + f.nx * inside * 13.5, z: f.z + f.nz * inside * 13.5 };
    // Make sure it is the middle of the hairpin.
    const yaw = Math.atan2(f.tx, f.tz);
    const box = new Shape();
    box.at(rbox(6, 11, 4, 0.3), '#ffb02e', 0, 5.5, 0);
    box.at(rbox(6.05, 4.5, 4.05, 0.2), '#fffaf0', 0, 5.6, 0);
    box.at(ball(1.6, 12, 9), '#ff7a3d', 0, 5.6, 2.05, 0, 0, 0, 1, 1, 0.2);
    box.at(ball(1.3, 12, 9), '#ff9d2e', -1.4, 6.4, 2.06, 0, 0, 0, 1, 1, 0.2);
    if (d.place(box, q.x, q.z, yaw, 4.2, { collide: 3.6 })) {
      // The straw: up from the box, over the road and down beyond the far curb.
      const reach = 13.5 + EDGE + 5;
      const straw = new THREE.Group();
      const segs = 18;
      const mat = new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.4, transparent: true, opacity: 1 });
      const stripe = new THREE.MeshStandardMaterial({ color: '#ef6fa0', roughness: 0.4, transparent: true, opacity: 1 });
      strawMats.push(mat, stripe);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const along = t * reach;
        const y = 11 + Math.sin(t * Math.PI) * 3 - (t > 0.85 ? (t - 0.85) * 40 : 0);
        pts.push(new THREE.Vector3(q.x - f.nx * inside * along, Math.max(0.5, y), q.z - f.nz * inside * along));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.55, 10, false), mat);
      tube.castShadow = true;
      straw.add(tube);
      for (let i = 1; i < 12; i++) {
        const p = curve.getPointAt(i / 12);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.08, 6, 14), stripe);
        ring.position.copy(p);
        ring.lookAt(curve.getPointAt(Math.min(1, i / 12 + 0.01)));
        straw.add(ring);
      }
      d.group.add(straw);
      const end = pts[pts.length - 1];
      d.colliders.push({ kind: 'circle', x: end.x, z: end.z, r: 0.7, h: 3, bounce: 0.4, blocksCamera: false });
      d.claim(end.x, end.z, 1.5);
    }
  }

  // ---- The gnome on the outside of the long sweeper.
  const gnomeEyes = new THREE.Group();
  {
    const s0 = 262;
    const out = d.outsideSide(s0);
    const p = d.beside(s0, out, 14);
    const g = new Shape();
    g.at(cyl(4.2, 5, 1.2, 20), '#9a96aa', 0, 0.6, 0);
    g.at(cyl(3.6, 4.4, 6, 18), '#4aa3df', 0, 4, 0);
    g.at(rbox(9, 1.0, 1.4, 0.3), '#8a5a3b', 0, 3.2, 3.6);
    for (const sx of [-1.6, 1.6]) g.at(ball(1.4, 10, 8), '#5a3a28', sx, 1.4, 2.4, 0, 0, 0, 1, 0.7, 1.4);
    g.at(cyl(3.4, 3.6, 3, 18), '#e8574a', 0, 8.4, 0);
    for (const sx of [-1, 1]) g.at(rbox(1.2, 4.4, 1.2, 0.5), '#e8574a', sx * 3.8, 8.2, 0.6, 0.6, 0, sx * 0.4);
    // Head, beard, nose, hat.
    g.at(ball(2.8, 16, 12), '#f6d7b8', 0, 11.8, 0.6);
    g.at(cone(3.0, 5.0, 16), '#fffaf0', 0, 9.6, 1.4, Math.PI + 0.15, 0, 0);
    g.at(ball(0.9, 10, 8), '#f4a08a', 0, 11.8, 3.3);
    g.at(cone(3.2, 8.5, 18), '#e8574a', 0, 17.6, -0.2, -0.12, 0, 0);
    g.at(torus(2.9, 0.4, 8, 22), '#ffd24a', 0, 13.6, 0.2, Math.PI / 2, 0, 0);
    d.place(g, p.x, p.z, p.yaw, 5.2, { collide: 4.4 });
    const eyes = new Shape();
    for (const sx of [-1, 1]) eyes.at(ball(0.45, 10, 8), PAL.ink, sx * 1.0, 0, 0);
    gnomeEyes.add(eyes.mesh('gloss', { cast: false }));
    const fwd = { x: Math.sin(p.yaw), z: Math.cos(p.yaw) };
    gnomeEyes.position.set(p.x + fwd.x * 3.15, 12.5, p.z + fwd.z * 3.15);
    gnomeEyes.rotation.y = p.yaw;
    d.group.add(gnomeEyes);
  }

  // ---- Anthill Rise: the anthill and its marching ants.
  const ants = new THREE.InstancedMesh(new Shape().at(ball(0.18, 6, 5), PAL.ink, 0, 0.18, 0.22).at(ball(0.14, 6, 5), PAL.ink, 0, 0.16, 0).at(ball(0.2, 6, 5), PAL.ink, 0, 0.18, -0.26).geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }), 60);
  const antPath: THREE.Vector3[] = [];
  {
    const inside = -d.outsideSide(313);
    const top = d.beside(313, inside, 16);
    const hill = new Shape();
    hill.at(cone(6, 4, 14), '#a7764e', 0, 2, 0);
    hill.at(cyl(0.9, 0.9, 0.2, 12), '#3a2418', 0, 3.95, 0);
    if (d.place(hill, top.x, top.z, 0, 6, { collide: 4.5, road: 3 })) {
      // Ants walk from the hill to a fallen cookie and back.
      const cookie = d.openSpots(5, 4).find((sp) => Math.hypot(sp.x - top.x, sp.z - top.z) > 14 && Math.hypot(sp.x - top.x, sp.z - top.z) < 40);
      const target = cookie ?? { x: top.x + 15, z: top.z };
      const ck = new Shape();
      ck.at(cyl(2.2, 2.2, 0.5, 20), '#d9a066', 0, 0.25, 0);
      for (let i = 0; i < 6; i++) ck.at(ball(0.3, 6, 5), '#5a3a28', Math.cos(i) * 1.4, 0.5, Math.sin(i * 1.7) * 1.4);
      d.place(ck, target.x, target.z, 0, 2.3, { collide: 0, road: 2 });
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        antPath.push(new THREE.Vector3(top.x + (target.x - top.x) * t + Math.sin(t * 9) * 1.2, 0, top.z + (target.z - top.z) * t + Math.cos(t * 7) * 1.2));
      }
      d.group.add(ants);
    }
  }

  // ---- Grandstand on a cake stand, facing the main straight.
  let fans: { bob(t: number, cheer: number): void } | null = null;
  let standAt: { x: number; z: number } | undefined;
  {
    const inSide = -c.paddock.side;
    const s = c.length - 20;
    const f = c.frame(s);
    const q = { x: f.x + f.nx * inSide * (EDGE + 15), z: f.z + f.nz * inSide * (EDGE + 15) };
    const yaw = Math.atan2(-f.nx * inSide, -f.nz * inSide);
    const stand = new Shape();
    stand.at(cyl(12.5, 12.5, 0.6, 32), '#fffaf0', 0, 1.6, -1.6);
    stand.at(cyl(1.4, 2.4, 1.6, 16), '#fffaf0', 0, 0.8, -1.6);
    // Icing piped round the plate's rim.
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      stand.at(ball(0.45, 8, 6), '#ef6fa0', Math.cos(a) * 12.3, 2.0, -1.6 + Math.sin(a) * 12.3, 0, 0, 0, 1, 0.8, 1);
    }
    const gs = grandstand(22, 4, { frame: '#f6c0d0', seat: '#fffaf0', roofA: '#ef6fa0', roofB: '#fffaf0' });
    stand.put(gs.shape, xform(0, 1.9, 0));
    const mm = xform(q.x, 0, q.z, 0, yaw, 0);
    batch.shape(stand, mm);
    d.wallBox(q.x - Math.sin(yaw) * 1.6, q.z - Math.cos(yaw) * 1.6, 12.5, 6, yaw, 8, true);
    d.claim(q.x, q.z, 13.5);
    fans = crowd(d.group, gs.seats.map((v) => v.clone().add(new THREE.Vector3(0, 1.9, 0))), mm, 80);
    standAt = { x: q.x, z: q.z };
    // A cherry on the roof.
    batch.part(ball(1.4, 12, 9), '#e8574a', xform(q.x - Math.sin(yaw) * 2, 0.7 + 4 * 0.75 + 3.2 + 1.9 + 1.4, q.z - Math.cos(yaw) * 2));
  }

  // ---- Flowers along the border straight, trees and picnic things in the open.
  {
    const out = d.outsideSide(392);
    for (let i = 0; i < 9; i++) {
      const s = 376 + i * 4;
      const p = d.beside(s, out, 5 + (i % 2) * 1.2);
      d.place(flower(5 + (i % 3), [PAL.gum, PAL.sun, '#fffaf0', PAL.tomato, PAL.grape][i % 5], i % 2 ? 'daisy' : 'tulip'), p.x, p.z, i, 1.2, { collide: 0.4, road: 3.5 });
    }
    let n = 0;
    for (const sp of d.openSpots(8, 7, null)) {
      if (n > 26) break;
      if (!d.free(sp.x, sp.z, 3, 5)) continue;
      const kind = n % 5;
      if (kind === 0 || kind === 3) d.place(lollipopTree(8 + (n % 3) * 2, ['#4fae5a', '#5cbf63', '#3f9e55'][n % 3]), sp.x, sp.z, n, 3, { collide: 0.8, detail: n > 8 });
      else if (kind === 1) d.place(flower(6 + (n % 2) * 2, TOY_COLORS[n % 7], n % 2 ? 'daisy' : 'tulip'), sp.x, sp.z, n, 1.5, { collide: 0.5, detail: true });
      else if (kind === 2) {
        // A strawberry.
        const s = new Shape();
        s.at(ball(1.5, 12, 9), '#e8574a', 0, 1.4, 0, 0, 0, 0, 1, 1.2, 1);
        for (let i = 0; i < 5; i++) s.at(cone(0.5, 0.5, 4), '#3fb68b', Math.cos(i * 1.26) * 0.6, 3.1, Math.sin(i * 1.26) * 0.6, Math.cos(i * 1.26) * 0.8, 0, Math.sin(i * 1.26) * 0.8);
        for (let i = 0; i < 10; i++) s.at(ball(0.08, 4, 3), '#ffe46b', Math.cos(i * 2.4) * 1.45, 0.9 + (i % 4) * 0.45, Math.sin(i * 2.4) * 1.45);
        d.place(s, sp.x, sp.z, n, 1.7, { collide: 1.4, detail: true });
      } else {
        // A paper plate with a cupcake.
        const s = new Shape();
        s.at(cyl(2.4, 2.0, 0.2, 24), '#fffaf0', 0, 0.1, 0);
        s.at(cyl(1.0, 0.8, 1.0, 14), '#4aa3df', 0, 0.7, 0);
        s.at(ball(1.15, 14, 10), '#ffd1e0', 0, 1.35, 0, 0, 0, 0, 1, 0.75, 1);
        s.at(ball(0.3, 8, 6), '#e8574a', 0, 2.2, 0);
        d.place(s, sp.x, sp.z, n, 2.5, { collide: 1.2, detail: true });
      }
      n++;
    }
  }

  // ---- Paper lanterns strung along the main straight; they glow at night.
  const lanternMat = new THREE.MeshStandardMaterial({ color: '#ffe9b8', emissive: new THREE.Color('#ffb84a'), emissiveIntensity: 0.1, roughness: 0.6 });
  scene.lamps.push(lanternMat);
  {
    const geo = new THREE.SphereGeometry(0.5, 10, 8);
    const out = d.outsideSide(10) * -1;
    const lanterns: THREE.Matrix4[] = [];
    for (let s = 6; s < 30; s += 4) {
      const p = d.beside(s, -c.paddock.side, 2.4);
      lanterns.push(xform(p.x, 5.2 + Math.sin(s) * 0.3, p.z, 0, 0, 0, 1, 1.25, 1));
    }
    const lm = new THREE.InstancedMesh(geo, lanternMat, lanterns.length);
    lanterns.forEach((mx, i) => lm.setMatrixAt(i, mx));
    d.group.add(lm);
    void out;
  }

  const am = new THREE.Matrix4();
  const blinkAt = { t: 3 };
  return {
    stand: standAt,
    hero: new THREE.Vector3(gnomeEyes.position.x, 10, gnomeEyes.position.z),
    dust: 0x9a7a52,
    update(dt: number, t: number, night: number, info: SceneInfo) {
      // The gnome blinks.
      blinkAt.t -= dt;
      gnomeEyes.scale.y = blinkAt.t < 0.15 ? 0.1 : 1;
      if (blinkAt.t <= 0) blinkAt.t = 2.5 + Math.random() * 3;
      // Ants march.
      if (antPath.length) {
        for (let i = 0; i < 60; i++) {
          const u = ((t * 0.04 + i / 60) % 1) * 2;
          const back = u > 1;
          const v = back ? 2 - u : u;
          const fi = v * (antPath.length - 1);
          const a = antPath[Math.floor(fi)];
          const bb = antPath[Math.min(antPath.length - 1, Math.floor(fi) + 1)];
          const x = a.x + (bb.x - a.x) * (fi % 1) + (back ? 0.6 : -0.6);
          const z = a.z + (bb.z - a.z) * (fi % 1);
          am.makeRotationY(Math.atan2(bb.x - a.x, bb.z - a.z) + (back ? Math.PI : 0));
          am.setPosition(x, 0, z);
          ants.setMatrixAt(i, am);
        }
        ants.instanceMatrix.needsUpdate = true;
      }
      lanternMat.emissiveIntensity = 0.1 + night * 2;
      fans?.bob(t, info.finalLap ? 1 : info.racing ? 0.35 : 0.1);
    },
    cutaway(cam: THREE.Vector3) {
      // The straw fades if the camera rises into it.
      const fade = cam.y > 9 ? 0.25 : 1;
      for (const mt of strawMats) (mt as THREE.MeshStandardMaterial).opacity += (fade - (mt as THREE.MeshStandardMaterial).opacity) * 0.2;
    },
  };
}
