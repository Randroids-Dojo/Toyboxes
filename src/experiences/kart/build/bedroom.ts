// Starlight Bedroom: a child's bedroom at night, lit by a moon nightlight.
// The only anticlockwise circuit. An alarm clock that rings for the final
// lap, a slipper, the Book Stack Leap, the glowing moon in the Nightlight
// loop, a run under the bed past glow stars and a dust bunny, a sleeping
// cat whose tail sweeps the chicane, a toy rocket that lifts off on the last
// lap, and a planet mobile turning overhead.

import * as THREE from 'three';
import { EDGE } from '../circuit';
import type { Dresser } from './dresser';
import { PADDOCK } from './paddock';
import { PAL, TOY_COLORS, blockTower, crayon, grandstand } from './props';
import type { CircuitScene, Hazard, SceneInfo, ThemeParts } from './scene';
import { Shape, ball, cone, cyl, rbox, torus, xform } from './shape';
import type { TexCache } from './textures';
import { crowd, room } from './blocktown';

const GLOW = ['#7ef0ff', '#ff8fd1', '#b6ff8a', '#ffe9a8'];

function star(r: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return new THREE.ShapeGeometry(s);
}

export function dressBedroom(d: Dresser, scene: CircuitScene, tex: TexCache): ThemeParts {
  const c = d.c;
  const batch = d.batch;
  const b = c.bounds;
  const m = c.def?.bounds ?? 30;
  const x0 = b.minX - m;
  const x1 = b.maxX + m;
  const z0 = b.minZ - m;
  const z1 = b.maxZ + m;
  const H = 40;
  const walls = room(d, tex, { wall: '#232a66', print: '#ffe9a8', skirting: '#3a3480', height: H, night: true });
  scene.lamps.push(walls.lamp);
  walls.lamp.emissiveIntensity = 0.05;
  // The window shows the night sky and a big moon.
  const pane = tex.make(256, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0a0f2e');
    grad.addColorStop(1, '#2a3270');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff6e0';
    for (let i = 0; i < 90; i++) g.fillRect(Math.random() * w, Math.random() * h * 0.85, 1.5, 1.5);
    g.fillStyle = '#ffe9a8';
    g.beginPath();
    g.arc(w * 0.68, h * 0.3, 30, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#16204a';
    g.fillRect(0, h * 0.86, w, h * 0.14);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = '#1f2a5c';
      g.fillRect(i * 46, h * 0.7 - (i % 3) * 14, 32, h * 0.3);
      g.fillStyle = '#ffd24a';
      g.fillRect(i * 46 + 8, h * 0.76 - (i % 3) * 14, 6, 6);
    }
  });
  walls.pane.map = pane;
  walls.pane.emissiveMap = pane;
  walls.pane.emissiveIntensity = 1.1;

  // ---- Glow-in-the-dark stars on the ceiling, one draw call.
  {
    const geo = star(1.6).rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: '#d8ffb0', side: THREE.DoubleSide });
    const n = 90;
    const stars = new THREE.InstancedMesh(geo, mat, n);
    const mm = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const x = x0 + ((i * 37.7) % 1) * 0 + ((i * 0.61803) % 1) * (x1 - x0);
      const z = z0 + ((i * 0.41421) % 1) * (z1 - z0);
      const s = 0.6 + ((i * 7) % 5) * 0.25;
      mm.makeRotationY(i).scale(new THREE.Vector3(s, 1, s)).setPosition(x, H - 0.3, z);
      stars.setMatrixAt(i, mm);
      stars.setColorAt(i, col.set(GLOW[i % 4]));
    }
    d.group.add(stars);
  }

  // ---- A chest of drawers behind the paddock, toys on top.
  {
    const q = c.pad(0, PADDOCK.back + 6);
    const yaw = c.padYaw(0, -1);
    const s = new Shape();
    s.at(rbox(40, 16, 10, 0.5), '#7a5ab8', 0, 8, 0);
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 3; k++) {
        s.at(rbox(12, 4.2, 0.4, 0.3), '#9a7ad8', -13 + k * 13, 3 + r * 5, 5.05);
        s.at(ball(0.5, 10, 8), '#ffd24a', -13 + k * 13, 3 + r * 5, 5.4);
      }
    s.at(rbox(41, 0.8, 11, 0.3), '#5a3a98', 0, 16.4, 0);
    // A lamp, a teddy and a stack of blocks on top.
    s.at(cyl(1.6, 2.2, 0.6, 16), '#ffd24a', -12, 17.1, 0);
    s.at(cyl(0.3, 0.3, 5, 8), '#ffd24a', -12, 19.6, 0);
    s.at(ball(2.2, 14, 10), '#b07a52', 10, 19.4, 0);
    s.at(ball(1.6, 12, 9), '#b07a52', 10, 22.4, 0);
    for (const sx of [-1, 1]) s.at(ball(0.6, 8, 6), '#b07a52', 10 + sx * 1.3, 23.8, 0);
    s.at(ball(0.6, 8, 6), '#f2d6b0', 10, 22.2, 1.4);
    batch.shape(s, xform(q.x, 0, q.z, 0, yaw, 0));
    d.wallBox(q.x, q.z, 20, 5, yaw, 16, true);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(3, 3, 18, 1, true), new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: new THREE.Color('#ffd27a'), emissiveIntensity: 1.2, side: THREE.DoubleSide }));
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    shade.position.set(q.x + right.x * -12, 23, q.z + right.z * -12);
    d.group.add(shade);
  }

  // ---- The alarm clock on the outside of the first corner.
  const clock = new THREE.Group();
  const hands: THREE.Object3D[] = [];
  const bells: THREE.Object3D[] = [];
  {
    const p = d.beside(58, d.outsideSide(58), 11);
    clock.position.set(p.x, 0, p.z);
    clock.rotation.y = p.yaw;
    const s = new Shape();
    s.at(cyl(6, 6, 3, 32), '#e8574a', 0, 7.2, 0, Math.PI / 2, 0, 0);
    s.at(torus(6, 0.5, 8, 32), '#ffd24a', 0, 7.2, 1.5);
    for (const sx of [-1, 1]) s.at(cyl(0.4, 0.6, 2.6, 8), '#ffd24a', sx * 3.6, 0.6, 0, 0, 0, sx * 0.4);
    s.at(cyl(0.25, 0.25, 3, 8), '#ffd24a', 0, 13.5, 0);
    clock.add(s.mesh('plastic'));
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(5.4, 40),
      new THREE.MeshStandardMaterial({
        map: tex.make(256, 256, (g, w, h) => {
          g.fillStyle = '#fffaf0';
          g.beginPath();
          g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#1d1830';
          g.font = '30px "Lilita One", system-ui';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          for (let i = 1; i <= 12; i++) {
            const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
            g.fillText(String(i), w / 2 + Math.cos(a) * w * 0.38, h / 2 + Math.sin(a) * h * 0.38);
          }
        }),
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 0.35,
        roughness: 0.5,
      }),
    );
    face.material.emissiveMap = face.material.map;
    face.position.set(0, 7.2, 1.51);
    clock.add(face);
    for (const [len, w] of [
      [3.6, 0.3],
      [2.4, 0.45],
    ]) {
      const hnd = new THREE.Group();
      hnd.position.set(0, 7.2, 1.62 + hands.length * 0.16);
      hnd.add(new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.12).translate(0, len / 2 - 0.3, 0), new THREE.MeshStandardMaterial({ color: '#1d1830' })));
      clock.add(hnd);
      hands.push(hnd);
    }
    for (const sx of [-1, 1]) {
      const bell = new THREE.Group();
      bell.position.set(sx * 3.4, 12.6, 0);
      bell.rotation.z = -sx * 0.5;
      bell.add(new THREE.Mesh(new THREE.SphereGeometry(2.0, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffd24a', roughness: 0.3, metalness: 0.2 })));
      clock.add(bell);
      bells.push(bell);
    }
    d.group.add(clock);
    d.claim(p.x, p.z, 7);
    d.colliders.push({ kind: 'circle', x: p.x, z: p.z, r: 5, h: 14, bounce: 0.4, blocksCamera: true });
  }

  // ---- A fuzzy slipper at the slipper turn.
  {
    const p = d.beside(128, d.outsideSide(128), 9);
    const s = new Shape();
    s.at(rbox(7, 2.2, 15, 1.0), '#ff8fd1', 0, 1.1, 0);
    s.at(ball(3.6, 14, 10), '#ff8fd1', 0, 2.2, 4.6, 0, 0, 0, 1, 0.75, 1.1);
    s.at(rbox(6.4, 0.4, 14, 0.2), '#ffd1e8', 0, 2.3, -0.6);
    s.at(ball(1.8, 12, 9), '#fffaf0', 0, 4.4, 5.8);
    d.place(s, p.x, p.z, p.yaw + 0.5, 7.5, { collide: 6 });
  }

  // ---- Books stacked by the leap, and the moon nightlight in the loop.
  {
    for (const [s0, sd] of [
      [148, 1],
      [150, -1],
      [171, 1],
      [172, -1],
    ] as [number, number][]) {
      const p = d.beside(s0, sd, 7);
      const st = new Shape();
      let y = 0;
      for (let i = 0; i < 5 - (s0 % 2); i++) {
        const hh = 0.7 + ((i * 3) % 4) * 0.2;
        st.at(rbox(4.2 - i * 0.2, hh, 6 - i * 0.3, 0.06), TOY_COLORS[(i + s0) % 7], 0, y + hh / 2, 0, 0, i * 0.12, 0);
        st.at(rbox(4.0 - i * 0.2, hh * 0.86, 0.1, 0.02), '#fffaf0', 0, y + hh / 2, (6 - i * 0.3) / 2 + 0.01, 0, i * 0.12, 0);
        y += hh + 0.002;
      }
      d.place(st, p.x, p.z, p.yaw, 3, { collide: 2.6, road: 3 });
    }
  }
  const moonMat = new THREE.MeshStandardMaterial({ color: '#ffe9a8', emissive: new THREE.Color('#ffd27a'), emissiveIntensity: 1.6, roughness: 0.6 });
  let moonAt = new THREE.Vector3();
  {
    let best: { x: number; z: number } | null = null;
    for (const sp of d.openSpots(8, 3)) {
      const n = c.path.nearest(sp.x, sp.z);
      if (n.s > 205 && n.s < 246) {
        best = sp;
        break;
      }
    }
    if (best) {
      const s = new Shape();
      s.at(cyl(2.4, 3, 1.2, 20), '#5a46a0', 0, 0.6, 0);
      s.at(cyl(0.5, 0.5, 4, 10), '#7a5ab8', 0, 3, 0);
      batch.shape(s, xform(best.x, 0, best.z));
      const moon = new THREE.Mesh(new THREE.SphereGeometry(4.2, 28, 18), moonMat);
      moon.position.set(best.x, 8.6, best.z);
      d.group.add(moon);
      // A crescent shade turns the moon into a crescent.
      const cut = new THREE.Mesh(new THREE.SphereGeometry(4.0, 24, 16), new THREE.MeshStandardMaterial({ color: '#232a66', roughness: 0.9 }));
      cut.position.set(best.x + 2.2, 9.4, best.z + 1.2);
      d.group.add(cut);
      d.claim(best.x, best.z, 5);
      d.colliders.push({ kind: 'circle', x: best.x, z: best.z, r: 3, h: 13, bounce: 0.3, blocksCamera: true });
      moonAt = moon.position.clone();
    }
  }

  // ---- Under the bed: the bed over the road, glow stars on its underside, a dust bunny.
  const roofMats: THREE.MeshStandardMaterial[] = [];
  {
    const t = c.def!.tunnels[0];
    const mid = (t.s0 + t.s1) / 2;
    const f = c.frame(mid);
    const yaw = Math.atan2(f.tx, f.tz);
    // The road runs across the bed, from one side to the other: legs and headboard stay off the road.
    const len = t.s1 - t.s0 + 4;
    const W = EDGE * 2 + 12;
    const head = d.outsideSide(mid);
    const frame = new Shape();
    for (const sd of [1, -1]) for (const e of [-1, 1]) frame.at(rbox(1.4, t.roof, 1.4, 0.3), '#8a5a3b', sd * (W / 2 - 1), t.roof / 2, e * (len / 2 - 1));
    frame.at(rbox(W, 1.2, len, 0.4), '#8a5a3b', 0, t.roof + 0.6, 0);
    // The headboard along one side, rising high, with brass knobs.
    frame.at(rbox(1.4, 13, len + 1.4, 0.6), '#a8714f', head * (W / 2 + 0.7), t.roof / 2 + 6.4, 0);
    for (let i = 0; i < 5; i++) frame.at(ball(0.7, 8, 6), '#ffd24a', head * (W / 2 + 0.7), t.roof / 2 + 13.2, -len / 2 + 1 + i * ((len - 2) / 4));
    batch.shape(frame, xform(f.x, 0, f.z, 0, yaw, 0));
    for (const sd of [1, -1])
      for (const e of [-1, 1]) {
        const lx = f.x + f.nx * sd * (W / 2 - 1) + f.tx * e * (len / 2 - 1);
        const lz = f.z + f.nz * sd * (W / 2 - 1) + f.tz * e * (len / 2 - 1);
        d.colliders.push({ kind: 'circle', x: lx, z: lz, r: 1, h: t.roof, bounce: 0.3, blocksCamera: false });
      }
    // xform's local +x is the road's right; the left normal is -x.
    const hx = f.x - f.nx * head * (W / 2 + 0.7);
    const hz = f.z - f.nz * head * (W / 2 + 0.7);
    d.wallBox(hx, hz, 0.8, len / 2 + 0.7, yaw, t.roof + 13, true);
    // Mattress and duvet: their own mesh so they fade when the camera rises into them.
    const mat = new THREE.MeshStandardMaterial({ color: '#4aa3df', roughness: 0.9, transparent: true, opacity: 1 });
    roofMats.push(mat);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(W - 0.4, 3, len - 1.6), mat);
    bed.position.set(f.x, t.roof + 2.7, f.z);
    bed.rotation.y = yaw;
    bed.castShadow = true;
    d.group.add(bed);
    const duvetMat = new THREE.MeshStandardMaterial({
      roughness: 0.95,
      transparent: true,
      opacity: 1,
      map: tex.make(128, 128, (g, w, h) => {
        g.fillStyle = '#ffd24a';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffb02e';
        for (let i = 0; i < 6; i++) {
          g.beginPath();
          g.arc((i % 3) * 48 + 16, Math.floor(i / 3) * 64 + 24, 10, 0, Math.PI * 2);
          g.fill();
        }
      }, { repeat: [4, 4] }),
    });
    roofMats.push(duvetMat);
    const duvet = new THREE.Mesh(new THREE.BoxGeometry(W + 1, 1.2, len - 4), duvetMat);
    duvet.position.set(f.x, t.roof + 4.6, f.z);
    duvet.rotation.y = yaw;
    d.group.add(duvet);
    // Glow stars stuck under the bed, facing down.
    const sg = star(0.7).rotateX(-Math.PI / 2);
    const smat = new THREE.MeshBasicMaterial({ color: '#b6ff8a', side: THREE.DoubleSide });
    const n = 16;
    const stars = new THREE.InstancedMesh(sg, smat, n);
    const mm = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const u = (((i * 0.618) % 1) - 0.5) * (W - 3);
      const v = (((i * 0.414) % 1) - 0.5) * (len - 4);
      mm.makeRotationY(i).setPosition(f.x + f.nx * u + f.tx * v, t.roof - 0.02, f.z + f.nz * u + f.tz * v);
      stars.setMatrixAt(i, mm);
      stars.setColorAt(i, new THREE.Color(GLOW[i % 4]));
    }
    d.group.add(stars);
    // The dust bunny with googly eyes, just off the road under the bed.
    const bun = new Shape();
    for (let i = 0; i < 9; i++) bun.at(ball(0.9, 8, 6), '#c9c2d6', Math.cos(i * 2.4) * 0.9, 1 + Math.sin(i * 1.7) * 0.5, Math.sin(i * 2.4) * 0.9);
    for (const sx of [-1, 1]) {
      bun.at(ball(0.42, 10, 8), '#fffaf0', sx * 0.5, 1.6, 1.2);
      bun.at(ball(0.2, 8, 6), PAL.ink, sx * 0.5, 1.6, 1.55);
    }
    const bp = d.beside(mid + 3, -1, 2.6);
    d.place(bun, bp.x, bp.z, bp.yaw, 1.6, { collide: 1.4, road: 1.2, force: true });
    d.claim(f.x, f.z, len / 2 + 4);
  }

  // ---- The sleeping cat and its sweeping tail: the hazard.
  const tail = new THREE.Group();
  const catEars: THREE.Object3D[] = [];
  const TAIL_S = 296;
  const tailInfo = { angle: 0, sweeping: false, warn: false, tip: new THREE.Vector3(), base: new THREE.Vector3() };
  let catYaw = 0;
  {
    // The side of the chicane's middle with the most open floor.
    const room = (sd: number) => {
      const q = d.beside(TAIL_S, sd, 13);
      return c.roadClearance(q.x, q.z);
    };
    const inside = room(1) >= room(-1) ? 1 : -1;
    const p = d.beside(TAIL_S, inside, 13);
    catYaw = p.yaw;
    const cat = new Shape();
    cat.at(ball(5.2, 18, 12), '#f2994a', 0, 3, -2.4, 0, 0, 0, 1.35, 0.6, 1);
    cat.at(ball(3.6, 16, 12), '#f2994a', 4.4, 3.2, 2.6);
    for (const sx of [-1, 1]) cat.at(ball(0.9, 8, 6), PAL.ink, 4.4 + sx * 1.3, 3.6, 5.85, 0, 0, 0, 0.8, 0.12, 0.2);
    cat.at(ball(0.5, 8, 6), '#e86f8a', 4.4, 2.8, 6.1);
    cat.at(ball(2.6, 12, 9), '#fff3e0', 4.4, 2.0, 4.6, 0, 0, 0, 1, 0.7, 0.6);
    // Stripes.
    for (let i = 0; i < 4; i++) cat.at(rbox(0.6, 0.3, 9, 0.1), '#c96f2a', -4 + i * 2.6, 6.3, -2, 0.1, 0, 0);
    for (const sx of [-1, 1]) cat.at(ball(1.4, 10, 8), '#f2994a', 2 + sx * 2.6, 0.9, 5.4, 0, 0, 0, 1, 0.5, 1.3);
    if (d.place(cat, p.x, p.z, p.yaw + Math.PI / 2, 7, { collide: 6.4, road: 1, force: true })) {
      for (const sx of [-1, 1]) {
        const ear = new THREE.Group();
        const fwd = { x: Math.sin(p.yaw + Math.PI / 2), z: Math.cos(p.yaw + Math.PI / 2) };
        const rt = { x: Math.cos(p.yaw + Math.PI / 2), z: -Math.sin(p.yaw + Math.PI / 2) };
        ear.position.set(p.x + rt.x * (4.4 + sx * 1.8) + fwd.x * 2.6, 6.4, p.z + rt.z * (4.4 + sx * 1.8) + fwd.z * 2.6);
        ear.rotation.y = p.yaw + Math.PI / 2;
        ear.add(new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 4), new THREE.MeshStandardMaterial({ color: '#f2994a', roughness: 0.7 })));
        d.group.add(ear);
        catEars.push(ear);
      }
      // The tail pivots at the cat's back, sweeping across the road toward s 296.
      const base = d.beside(TAIL_S, inside, 6.5);
      tailInfo.base.set(base.x, 0, base.z);
      tail.position.set(base.x, 1.2, base.z);
      const ts = new Shape();
      const segs = 8;
      const reach = EDGE * 2 + 8;
      for (let i = 0; i < segs; i++) ts.at(cyl(0.9 - i * 0.04, 0.95 - i * 0.04, reach / segs + 0.3, 12), i % 2 ? '#c96f2a' : '#f2994a', 0, 0, (i + 0.5) * (reach / segs), Math.PI / 2, 0, 0);
      ts.at(ball(0.8, 10, 8), '#fff3e0', 0, 0, reach);
      tail.add(ts.mesh('plastic'));
      d.group.add(tail);
    }
  }

  // ---- The toy rocket on its launch pad in the infield.
  const rocket = new THREE.Group();
  const rocketFlame = new THREE.Mesh(new THREE.ConeGeometry(1.2, 5, 14).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: '#ffb02e', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  let rocketBase = new THREE.Vector3();
  {
    const sp = d.openSpots(9, 4).find((o) => Math.hypot(o.x - moonAt.x, o.z - moonAt.z) > 25) ?? d.openSpots(8, 4)[0];
    if (sp) {
      const pad = new Shape();
      pad.at(cyl(4, 4.4, 1, 6), '#5d6a82', 0, 0.5, 0);
      for (let i = 0; i < 3; i++) pad.at(rbox(0.5, 9, 0.5, 0.1), '#aab4c6', Math.cos((i / 3) * Math.PI * 2) * 3.4, 4.5, Math.sin((i / 3) * Math.PI * 2) * 3.4);
      batch.shape(pad, xform(sp.x, 0, sp.z));
      const r = new Shape();
      r.at(cyl(1.8, 1.8, 9, 18), '#fffaf0', 0, 5.5, 0);
      r.at(cone(1.8, 3.6, 18), PAL.tomato, 0, 11.8, 0);
      for (let i = 0; i < 3; i++) r.at(rbox(0.3, 3, 2.4, 0.1), PAL.tomato, Math.cos((i / 3) * Math.PI * 2) * 1.9, 2.2, Math.sin((i / 3) * Math.PI * 2) * 1.9, 0, -(i / 3) * Math.PI * 2, 0);
      r.at(cyl(0.8, 0.8, 0.2, 16), '#7ef0ff', 0, 7.5, 1.75, Math.PI / 2, 0, 0);
      r.at(torus(0.85, 0.12, 6, 16), '#ffd24a', 0, 7.5, 1.8);
      r.at(cyl(1.2, 1.5, 1, 12), '#5d6a82', 0, 0.9, 0);
      rocket.add(r.mesh('plastic'));
      rocketFlame.position.y = -1.6;
      rocketFlame.visible = false;
      rocket.add(rocketFlame);
      rocket.position.set(sp.x, 1, sp.z);
      d.group.add(rocket);
      rocketBase = rocket.position.clone();
      d.claim(sp.x, sp.z, 5);
      d.colliders.push({ kind: 'circle', x: sp.x, z: sp.z, r: 4.2, h: 10, bounce: 0.4, blocksCamera: true });
    }
  }

  // ---- The planet mobile turning over the infield.
  const mobile = new THREE.Group();
  {
    const sp = d.openSpots(4, 8)[0];
    const at = sp ?? { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
    mobile.position.set(at.x, H, at.z);
    const s = new Shape();
    s.at(cyl(0.1, 0.1, 10, 6), '#fffaf0', 0, -5, 0);
    s.at(rbox(22, 0.3, 0.3, 0.1), '#fffaf0', 0, -10, 0);
    s.at(rbox(0.3, 0.3, 22, 0.1), '#fffaf0', 0, -10.32, 0);
    const planets: [number, number, number, string, number][] = [
      [11, 0, 2.2, '#ff8fd1', 0],
      [-11, 0, 1.8, '#7ef0ff', 1],
      [0, 11, 2.6, '#ffd24a', 1],
      [0, -11, 1.6, '#b6ff8a', 0],
    ];
    for (const [x, z, r, col, ring] of planets) {
      s.at(cyl(0.05, 0.05, 6, 4), '#fffaf0', x, -13, z);
      s.at(ball(r, 16, 12), col, x, -16 - r, z);
      if (ring) s.at(torus(r * 1.6, 0.18, 6, 24), '#fffaf0', x, -16 - r, z, Math.PI / 2 - 0.3, 0, 0.2);
    }
    mobile.add(s.mesh('glow', { cast: false }));
    d.group.add(mobile);
  }

  // ---- Grandstand of board-game boxes beside the main straight.
  let fans: { bob(t: number, cheer: number): void } | null = null;
  let standAt: { x: number; z: number } | undefined;
  {
    const inSide = -c.paddock.side;
    const s = c.length - 18;
    const f = c.frame(s);
    const q = { x: f.x + f.nx * inSide * (EDGE + 10), z: f.z + f.nz * inSide * (EDGE + 10) };
    const yaw = Math.atan2(-f.nx * inSide, -f.nz * inSide);
    const gs = grandstand(22, 4, { frame: '#3a3480', seat: '#ff8fd1', roofA: '#7ef0ff', roofB: '#2b2560' });
    const boxes = new Shape();
    for (let t = 0; t < 4; t++) boxes.at(rbox(22.6, 0.5, 1.8, 0.1), TOY_COLORS[(t * 2) % 7], 0, 0.7 + t * 0.75 - 0.2, -t * 1.7 + 1.7);
    boxes.put(gs.shape, new THREE.Matrix4());
    const mm = xform(q.x, 0, q.z, 0, yaw, 0);
    batch.shape(boxes, mm);
    d.wallBox(q.x - Math.sin(yaw) * 2, q.z - Math.cos(yaw) * 2, 11.5, 4.2, yaw, 5, true);
    d.claim(q.x, q.z, 13);
    fans = crowd(d.group, gs.seats, mm, 72);
    standAt = { x: q.x, z: q.z };
  }

  // ---- Toys on the carpet.
  {
    let n = 0;
    for (const sp of d.openSpots(6, 6, null)) {
      if (n > 20) break;
      if (!d.free(sp.x, sp.z, 2.5, 4)) continue;
      const kind = n % 4;
      if (kind === 0) d.place(blockTower(2 + (n % 3), 2.4, n), sp.x, sp.z, n, 2, { collide: 1.6 });
      else if (kind === 1) d.place(crayon(GLOW[n % 4], 5, 0.6), sp.x, sp.z, n, 1, { collide: 0.6 });
      else if (kind === 2) {
        // A little toy robot.
        const s = new Shape();
        s.at(rbox(2, 2.4, 1.4, 0.2), '#aab4c6', 0, 2.2, 0);
        s.at(rbox(1.6, 1.4, 1.4, 0.2), '#aab4c6', 0, 4.2, 0);
        s.at(rbox(1.2, 0.4, 0.1, 0.05), '#7ef0ff', 0, 4.3, 0.72);
        for (const sx of [-1, 1]) {
          s.at(rbox(0.6, 1.4, 0.6, 0.2), '#5d6a82', sx * 0.6, 0.7, 0);
          s.at(rbox(0.5, 1.6, 0.5, 0.2), '#5d6a82', sx * 1.35, 2.2, 0);
        }
        s.at(ball(0.25, 8, 6), '#ff8fd1', 0, 5.2, 0);
        d.place(s, sp.x, sp.z, n, 1.6, { collide: 1.2 });
      } else {
        const s = new Shape();
        s.at(ball(1.4, 14, 10), GLOW[n % 4], 0, 1.4, 0);
        d.place(s, sp.x, sp.z, 0, 1.5, { collide: 1.3, finish: 'glow' });
      }
      n++;
    }
  }

  let launched = 0;
  let ring = 0;
  let wasFinal = false;
  let tailT = 0;
  const reachLen = EDGE * 2 + 8;
  const hazard: Hazard = {
    danger: (s: number) => (Math.abs(c.path.delta(s, TAIL_S)) < 8 && (tailInfo.sweeping || tailInfo.warn) ? { off: 0, width: 9 } : null),
    colliders: () => [],
    hits: (x, z, y) => {
      if (!tailInfo.sweeping || y > 2.5) return null;
      // Distance from the kart to the tail's line.
      const bx = tailInfo.base.x;
      const bz = tailInfo.base.z;
      const dx = tailInfo.tip.x - bx;
      const dz = tailInfo.tip.z - bz;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - bx) * dx + (z - bz) * dz) / l2));
      return Math.hypot(x - (bx + dx * t), z - (bz + dz * t)) < 1.7 ? 'tail' : null;
    },
    info: () => ({ kind: 'tail', sweeping: tailInfo.sweeping, warn: tailInfo.warn, angle: +tailInfo.angle.toFixed(2) }),
  };

  for (const g of [clock, tail, rocket, mobile, ...catEars]) g.userData.dynamic = true;
  return {
    stand: standAt,
    hero: moonAt.clone(),
    dust: 0x8a7ad8,
    hazards: [hazard],
    update(dt: number, t: number, _night: number, info: SceneInfo) {
      // Clock hands tick; the bells ring on the final lap.
      hands[0].rotation.z = -Math.floor(t) * ((Math.PI * 2) / 60);
      hands[1].rotation.z = -t * 0.01;
      if (info.finalLap && !wasFinal) ring = 3;
      wasFinal = info.finalLap;
      ring = Math.max(0, ring - dt);
      bells.forEach((bl, i) => (bl.rotation.x = ring > 0 ? Math.sin(t * 60 + i) * 0.25 : 0));
      clock.position.y = ring > 0 ? Math.abs(Math.sin(t * 40)) * 0.15 : 0;
      // The cat's tail: 9 s cycle, a 1.5 s twitch warning, then a 1.2 s sweep across and back.
      tailT += dt;
      const cyc = tailT % 9;
      tailInfo.warn = cyc > 6.3 && cyc < 7.8;
      tailInfo.sweeping = cyc >= 7.8;
      const u = tailInfo.sweeping ? (cyc - 7.8) / 1.2 : 0;
      // Rest: tucked alongside the cat; sweep: swings out over the road and back.
      const rest = catYaw + Math.PI * 0.95;
      const out = catYaw;
      const swing = tailInfo.sweeping ? Math.sin(u * Math.PI) : tailInfo.warn ? Math.sin((cyc - 6.3) * 9) * 0.04 + 0.05 : 0;
      tailInfo.angle = rest + (out - rest) * swing;
      tail.rotation.set(0, tailInfo.angle, 0);
      tail.position.y = 1.2 + (tailInfo.warn ? 0.5 : 0) + swing * 0.4;
      tailInfo.tip.set(tailInfo.base.x + Math.sin(tailInfo.angle) * reachLen, 0, tailInfo.base.z + Math.cos(tailInfo.angle) * reachLen);
      catEars.forEach((e, i) => (e.rotation.z = tailInfo.warn ? Math.sin(t * 30 + i) * 0.25 : 0));
      // The rocket lifts off on the final lap.
      if (info.finalLap && info.racing) launched = Math.min(1, launched + dt / 6);
      else if (!info.racing) launched = Math.max(0, launched - dt);
      rocket.position.y = rocketBase.y + launched * launched * (H - 16);
      rocket.rotation.y = launched * 3;
      rocketFlame.visible = launched > 0 && launched < 1;
      rocketFlame.scale.setScalar(0.8 + Math.random() * 0.4);
      mobile.rotation.y = t * 0.08;
      moonMat.emissiveIntensity = 1.5 + Math.sin(t * 0.8) * 0.1;
      fans?.bob(t, info.finalLap ? 1 : info.racing ? 0.35 : 0.1);
      // Point lights for the moon and the rocket (the env shows them on high only).
      const pts = scene.envPoints;
      if (pts) {
        pts[0].position.copy(moonAt);
        pts[0].intensity = 60;
        pts[0].color.set('#ffd27a');
        pts[1].position.set(rocket.position.x, rocket.position.y + 2, rocket.position.z);
        pts[1].intensity = rocketFlame.visible ? 80 : 0;
        pts[1].color.set('#ff9d2e');
      }
    },
    cutaway(cam: THREE.Vector3) {
      const t = c.def!.tunnels[0];
      const n = c.path.nearest(cam.x, cam.z);
      const inside = n.s > t.s0 - 6 && n.s < t.s1 + 6 && n.dist < EDGE + 5 && cam.y > t.roof - 1.5;
      for (const mt of roofMats) mt.opacity += ((inside ? 0.18 : 1) - mt.opacity) * 0.25;
    },
  };
}
