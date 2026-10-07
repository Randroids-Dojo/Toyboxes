// Sandcastle Cove: a beach playset under the town sky. The sea beyond the
// plank bridge, a lagoon in the infield joined to it by a channel under the
// bridge, three beach balls bouncing across the boardwalk, rock pools and
// crabs in the Crab Claw, the Castle Gate through an 18 m sandcastle, a
// bucket and spade, beach huts behind the paddock and a lighthouse whose
// beam sweeps at night.

import * as THREE from 'three';
import { EDGE } from '../circuit';
import type { Dresser } from './dresser';
import { PADDOCK } from './paddock';
import { PAL, TOY_COLORS, beachBall, grandstand } from './props';
import { LAYER } from './road';
import type { CircuitScene, Hazard, SceneInfo, ThemeParts } from './scene';
import { Shape, ball, cone, cyl, rbox, torus, xform } from './shape';
import type { TexCache } from './textures';
import { crowd } from './blocktown';

/** Water that moves: two scrolling wave textures blended in the shader. */
function waterMaterial(tex: TexCache, deep: string, light: string): THREE.MeshStandardMaterial {
  const t = tex.make(256, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, deep);
    grad.addColorStop(1, light);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 3;
    for (let y = 10; y < h; y += 26) {
      g.beginPath();
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin((x / w) * Math.PI * 4 + y) * 5);
      g.stroke();
    }
  }, { repeat: [1, 1] });
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.15, metalness: 0.05, emissive: new THREE.Color(deep), emissiveIntensity: 0.08 });
}

/** World-space texture coordinates: one texture tile every `tile` metres. */
function planarUV(g: THREE.BufferGeometry, m: THREE.Matrix4, tile: number): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(m);
    uv.setXY(i, v.x / tile, v.z / tile);
  }
  return g;
}

export function dressCove(d: Dresser, scene: CircuitScene, tex: TexCache): ThemeParts {
  const c = d.c;
  const batch = d.batch;
  const b = c.bounds;
  const m = c.def?.bounds ?? 28;
  const x0 = b.minX - m;
  const x1 = b.maxX + m;
  const z0 = b.minZ - m;
  const z1 = b.maxZ + m;

  // ---- The sea: beyond a coastline parallel to the bridge, outside it.
  const bf = c.frame(148);
  const outB = d.outsideSide(148);
  // The shore runs parallel to the bridge, far enough out that no part of the road is in the sea.
  let reachOut = 0;
  for (let i = 0; i < c.path.n; i++) reachOut = Math.max(reachOut, (c.path.x[i] - bf.x) * bf.nx * outB + (c.path.z[i] - bf.z) * bf.nz * outB);
  const shore = reachOut + EDGE + 12;
  const coast = { x: bf.x + bf.nx * outB * shore, z: bf.z + bf.nz * outB * shore, nx: bf.nx * outB, nz: bf.nz * outB };
  const seaDist = (x: number, z: number) => (x - coast.x) * coast.nx + (z - coast.z) * coast.nz;
  const seaMat = waterMaterial(tex, '#1f7fb8', '#3fc1d9');
  const seaGeo = new THREE.PlaneGeometry(900, 500).rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.position.set(coast.x + coast.nx * 250, LAYER.prints, coast.z + coast.nz * 250);
  sea.rotation.y = Math.atan2(coast.nx, coast.nz);
  sea.updateMatrix();
  planarUV(seaGeo, sea.matrix, 14);
  sea.receiveShadow = true;
  d.group.add(sea);
  // A band of foam and wet sand along the shore.
  const foamMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false });
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(900, 1.6).rotateX(-Math.PI / 2), foamMat);
  foam.position.set(coast.x + coast.nx * 0.6, LAYER.prints + 0.01, coast.z + coast.nz * 0.6);
  foam.rotation.y = sea.rotation.y;
  foam.renderOrder = 2;
  d.group.add(foam);

  // ---- The lagoon in the infield and the channel under the bridge.
  const lagoonAt = d.openSpots(13, 4).find((sp) => seaDist(sp.x, sp.z) < -20) ?? null;
  const lag = lagoonAt ? { x: lagoonAt.x, z: lagoonAt.z, a: Math.min(13, lagoonAt.clear - 2), b: Math.min(9, lagoonAt.clear - 4) } : null;
  const waterMat2 = waterMaterial(tex, '#2a8fc4', '#5fd3e6');
  if (lag) {
    const g = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, waterMat2);
    mesh.scale.set(lag.a, 1, lag.b);
    mesh.position.set(lag.x, LAYER.prints, lag.z);
    mesh.updateMatrix();
    planarUV(g, mesh.matrix, 8);
    d.group.add(mesh);
    d.claim(lag.x, lag.z, lag.a);
  }
  const bridgeMid = c.frame(148);
  const channelMats: THREE.MeshStandardMaterial[] = [];
  const channel: { ax: number; az: number; bx: number; bz: number; w: number }[] = [];
  if (lag) {
    channel.push({ ax: lag.x, az: lag.z, bx: bridgeMid.x - coast.nx * (EDGE + 3), bz: bridgeMid.z - coast.nz * (EDGE + 3), w: 2.4 });
    // Straight across under the bridge and out to the sea.
    channel.push({ ax: bridgeMid.x - coast.nx * (EDGE + 3), az: bridgeMid.z - coast.nz * (EDGE + 3), bx: bridgeMid.x + coast.nx * (shore + 2), bz: bridgeMid.z + coast.nz * (shore + 2), w: 2.4 });
    channel.forEach((ch, i) => {
      const len = Math.hypot(ch.bx - ch.ax, ch.bz - ch.az);
      const g = new THREE.PlaneGeometry(ch.w * 2, len + ch.w).rotateX(-Math.PI / 2);
      // Each piece sits a few millimetres under the one before, so where they overlap one is always on top.
      const mat = waterMat2.clone();
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = 1 + i;
      mat.polygonOffsetUnits = 2 + i * 2;
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set((ch.ax + ch.bx) / 2, LAYER.prints - 0.007 * (i + 1), (ch.az + ch.bz) / 2);
      mesh.rotation.y = Math.atan2(ch.bx - ch.ax, ch.bz - ch.az);
      mesh.updateMatrix();
      planarUV(g, mesh.matrix, 8);
      d.group.add(mesh);
      channelMats.push(mat);
    });
  }
  /** Distance from a point to the channel's middle line. */
  const inChannel = (x: number, z: number) =>
    channel.some((ch) => {
      const dx = ch.bx - ch.ax;
      const dz = ch.bz - ch.az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ch.ax) * dx + (z - ch.az) * dz) / l2));
      return Math.hypot(x - (ch.ax + dx * t), z - (ch.az + dz * t)) < ch.w;
    });
  const water = (x: number, z: number): boolean => {
    if (seaDist(x, z) > 0) return true;
    if (lag && ((x - lag.x) / lag.a) ** 2 + ((z - lag.z) / lag.b) ** 2 < 1) return true;
    // The channel, except right under the bridge deck (you are on the bridge there).
    return inChannel(x, z) && c.roadClearance(x, z) > 0.5;
  };

  // Rubber ducks bob on the lagoon.
  const duckGeo = new Shape()
    .at(ball(0.9, 12, 9), '#ffd24a', 0, 0.45, 0, 0, 0, 0, 1.2, 0.8, 1)
    .at(ball(0.55, 12, 9), '#ffd24a', 0, 1.15, 0.5)
    .at(rbox(0.45, 0.16, 0.4, 0.07), '#ff7a3d', 0, 1.1, 1.0)
    .at(ball(0.1, 6, 5), PAL.ink, 0.22, 1.32, 0.9)
    .at(ball(0.1, 6, 5), PAL.ink, -0.22, 1.32, 0.9)
    .geometry();
  const ducks = new THREE.InstancedMesh(duckGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }), 5);
  ducks.castShadow = true;
  if (lag) d.group.add(ducks);

  // ---- Beach huts behind the paddock, and a lifeguard tower.
  {
    const yaw = c.padYaw(0, -1);
    for (let i = 0; i < 7; i++) {
      const q = c.pad(-30 + i * 10, PADDOCK.back + 4);
      const col = [PAL.tomato, PAL.sky, PAL.sun, PAL.mint, PAL.gum, PAL.grape, '#ff9d2e'][i];
      const s = new Shape();
      s.at(rbox(7, 6, 6, 0.2), '#fffaf0', 0, 3, 0);
      for (let k = 0; k < 6; k++) s.at(rbox(7 / 6 + 0.02, 6.04, 6.04, 0.02), k % 2 ? col : '#fffaf0', -3.5 + (k + 0.5) * (7 / 6), 3, 0);
      // Two roof halves meeting under a ridge cap (one a touch lower, so their bevels never coincide).
      s.at(rbox(4.4, 0.5, 7.2, 0.15), col, -1.95, 6.55, 0, 0, 0, 0.35);
      s.at(rbox(4.4, 0.5, 7.2, 0.15), col, 1.95, 6.53, 0, 0, 0, -0.35);
      s.at(cyl(0.35, 0.35, 7.4, 10), '#fffaf0', 0, 7.45, 0, Math.PI / 2, 0, 0);
      s.at(rbox(2.4, 3.6, 0.3, 0.1), '#2b2340', 0, 1.8, 3.05);
      s.at(rbox(7.6, 0.4, 1.6, 0.1), '#b98a5e', 0, 0.2, 3.6);
      batch.shape(s, xform(q.x, 0, q.z, 0, yaw, 0));
    }
    const mid = c.pad(0, PADDOCK.back + 4);
    d.wallBox(mid.x, mid.z, 34, 3.4, c.padYaw(1, 0), 8, true);
  }

  // ---- The plank bridge's piers in the water, and the boardwalk's railing posts.
  // ---- Castle Gate: an 18 m sandcastle with a tunnel.
  const roofMats: THREE.MeshStandardMaterial[] = [];
  {
    const t = c.def!.tunnels[0];
    const sand = '#f0cf8f';
    const sandDark = '#d9b06a';
    const mid = (t.s0 + t.s1) / 2;
    const f = c.frame(mid);
    const yaw = Math.atan2(f.tx, f.tz);
    const len = t.s1 - t.s0;
    const castle = new Shape();
    for (const sd of [1, -1]) {
      // Thick walls either side of the road.
      castle.at(rbox(7, 12, len, 0.6), sand, sd * (EDGE + 0.4 + 3.5), 6, 0);
      castle.at(rbox(0.4, 6.4, len, 0.05), sandDark, sd * (EDGE + 0.6), 3.2, 0);
      // Towers at the corners.
      for (const e of [-1, 1]) {
        const tx = sd * (EDGE + 6);
        const tz = e * (len / 2 + 1.5);
        castle.at(cyl(4, 4.6, 16, 18), sand, tx, 8, tz);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          castle.at(rbox(1.4, 1.6, 1.4, 0.2), sand, tx + Math.cos(a) * 3.6, 16.6, tz + Math.sin(a) * 3.6, 0, -a, 0);
        }
        castle.at(cyl(0.12, 0.12, 5, 6), PAL.cream, tx, 19.5, tz);
        castle.at(cone(1.6, 1, 3), [PAL.tomato, PAL.sky][(sd + e + 2) % 2], tx + 0.9, 21, tz, Math.PI / 2, 0, -Math.PI / 2, 1, 1, 0.2);
        // Shell windows.
        for (const wy of [6, 11]) castle.at(ball(0.8, 8, 6), '#ffd1e0', tx - sd * 3.9, wy, tz, 0, 0, 0, 0.3, 1, 1);
      }
      // Crenellations along the wall tops.
      for (let z = -len / 2 + 1; z < len / 2; z += 2.4) castle.at(rbox(1.5, 1.4, 1.5, 0.2), sand, sd * (EDGE + 4.5), 12.7, z);
      // Bucket-shaped ridges: horizontal grooves down the walls.
      for (const gy of [3, 6, 9]) castle.at(rbox(7.1, 0.3, len + 0.1, 0.1), sandDark, sd * (EDGE + 0.4 + 3.5), gy, 0);
      d.wallBox(f.x + f.nx * sd * (EDGE + 0.4 + 3.5), f.z + f.nz * sd * (EDGE + 0.4 + 3.5), 3.6, len / 2, yaw, 12, false);
      d.wallBox(f.x + f.nx * sd * (EDGE + 6), f.z + f.nz * sd * (EDGE + 6), 4.2, len / 2 + 5, yaw, 16, false);
    }
    // The archway face over each entrance.
    for (const e of [-1, 1]) castle.at(rbox(EDGE * 2 + 1.2, 1.2, 1, 0.2), sandDark, 0, t.roof + 0.6, e * (len / 2 + 0.3));
    batch.shape(castle, xform(f.x, 0, f.z, 0, yaw, 0));
    // The roof is its own mesh so it can fade when the camera rises into it.
    const roofMat = new THREE.MeshStandardMaterial({ color: sand, roughness: 0.9, transparent: true, opacity: 1 });
    roofMats.push(roofMat);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(EDGE * 2 + 1, 12 - t.roof, len), roofMat);
    roof.position.set(f.x, t.roof + (12 - t.roof) / 2, f.z);
    roof.rotation.y = yaw;
    roof.castShadow = true;
    d.group.add(roof);
    // A flag on top.
    batch.part(cyl(0.15, 0.15, 6, 8), PAL.cream, xform(f.x, 15, f.z));
    batch.part(cone(2, 1.2, 3), PAL.sun, xform(f.x + 1.1, 17.4, f.z, Math.PI / 2, 0, -Math.PI / 2, 1, 1, 0.2));
    d.claim(f.x, f.z, len / 2 + 8);
  }

  // ---- Bucket and spade outside Bucket corner.
  {
    const p = d.beside(352, d.outsideSide(352), 9);
    const s = new Shape();
    s.at(cyl(4.4, 3.6, 7, 20), PAL.tomato, 0, 3.5, 0);
    s.at(cyl(4.6, 4.6, 0.6, 20), '#c94436', 0, 7, 0);
    s.at(torus(4.4, 0.18, 6, 24, Math.PI), PAL.sun, 0, 7, 0, 0, 0, 0);
    s.at(cyl(3.9, 3.9, 0.3, 20), '#f0cf8f', 0, 6.9, 0);
    // The spade leaning on it.
    s.at(rbox(0.4, 9, 0.4, 0.15), PAL.sky, 5, 4, 1, 0, 0, 0.35);
    s.at(rbox(2.4, 3, 0.25, 0.3), PAL.sky, 6.5, 0.9, 1, 0, 0, 0.35);
    d.place(s, p.x, p.z, p.yaw, 5, { collide: 4.6 });
  }

  // ---- Rocks, rock pools and crabs round the Crab Claw.
  const crabs = new THREE.InstancedMesh(
    new Shape()
      .at(ball(0.7, 10, 8), '#e8574a', 0, 0.45, 0, 0, 0, 0, 1.3, 0.6, 1)
      .at(ball(0.12, 6, 5), '#fffaf0', 0.3, 0.95, 0.4)
      .at(ball(0.12, 6, 5), '#fffaf0', -0.3, 0.95, 0.4)
      .at(ball(0.35, 8, 6), '#e8574a', 0.95, 0.6, 0.45)
      .at(ball(0.35, 8, 6), '#e8574a', -0.95, 0.6, 0.45)
      .geometry(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
    6,
  );
  const crabSpots: { x: number; z: number; a: number }[] = [];
  {
    const poolMat = waterMaterial(tex, '#2a8fc4', '#7fe0ee');
    let n = 0;
    for (let s = 166; s < 268; s += 7) {
      for (const sd of [1, -1]) {
        const p = d.beside(s, sd, 4.5 + ((s * 7) % 5));
        if (!d.free(p.x, p.z, 2, 4) || seaDist(p.x, p.z) > -4) continue;
        if (n % 3 === 2) {
          // A rock pool with a starfish.
          const g = new THREE.CircleGeometry(2.2, 24).rotateX(-Math.PI / 2);
          g.translate(p.x, LAYER.prints, p.z);
          planarUV(g, new THREE.Matrix4(), 5);
          batch.raw(g, poolMat);
          d.claim(p.x, p.z, 2.4);
          batch.part(new THREE.CylinderGeometry(0.8, 0.8, 0.2, 5), '#ff9d2e', xform(p.x + 1.2, 0.1, p.z + 1.4, 0, n, 0));
        } else {
          const r = new Shape();
          r.at(ball(1.8, 8, 6), '#9a96aa', 0, 1.0, 0, 0, n, 0, 1.2, 0.8, 1);
          r.at(ball(1.2, 8, 6), '#8a86a0', 1.1, 0.7, 0.6, 0, n * 2, 0);
          r.at(ball(0.9, 8, 6), '#a7a3b8', -0.9, 0.5, -0.8);
          d.place(r, p.x, p.z, n, 2.2, { collide: 1.8, road: 4 });
          if (crabSpots.length < 6 && n % 2 === 0) crabSpots.push({ x: p.x, z: p.z, a: n });
        }
        n++;
      }
    }
    d.group.add(crabs);
  }

  // ---- Grandstand of beach towels on a dune by the main straight.
  let fans: { bob(t: number, cheer: number): void } | null = null;
  let standAt: { x: number; z: number } | undefined;
  {
    const inSide = -c.paddock.side;
    const s = c.length - 16;
    const f = c.frame(s);
    const q = { x: f.x + f.nx * inSide * (EDGE + 10), z: f.z + f.nz * inSide * (EDGE + 10) };
    const yaw = Math.atan2(-f.nx * inSide, -f.nz * inSide);
    const dune = new Shape();
    dune.at(ball(13, 18, 10), '#f2d49b', 0, -6.5, -2, 0, 0, 0, 1.2, 0.6, 0.7);
    const gs = grandstand(20, 4, { frame: '#f2d49b', seat: PAL.sky, roofA: PAL.tomato, roofB: '#fffaf0' });
    // Towels on each tier.
    for (let t = 0; t < 4; t++) for (let i = 0; i < 5; i++) dune.at(rbox(3.4, 0.08, 1.4, 0.03), TOY_COLORS[(t * 5 + i) % 7], -8 + i * 4, 0.7 + t * 0.75 + 0.2, -t * 1.7 + 1.4, 0, 0, 0);
    dune.put(gs.shape, new THREE.Matrix4());
    const mm = xform(q.x, 0, q.z, 0, yaw, 0);
    batch.shape(dune, mm);
    d.wallBox(q.x - Math.sin(yaw) * 2, q.z - Math.cos(yaw) * 2, 12, 5, yaw, 6, true);
    d.claim(q.x, q.z, 14);
    fans = crowd(d.group, gs.seats, mm, 72);
    standAt = { x: q.x, z: q.z };
  }

  // ---- Umbrellas, towels, palms and sandcastles on the open sand.
  {
    let n = 0;
    for (const sp of d.openSpots(7, 7, null)) {
      if (n > 22) break;
      if (seaDist(sp.x, sp.z) > -4 || water(sp.x, sp.z) || !d.free(sp.x, sp.z, 3, 4.5)) continue;
      const kind = n % 4;
      if (kind === 0) {
        const s = new Shape();
        s.at(cyl(0.12, 0.12, 6, 8), '#fffaf0', 0, 3, 0, 0.1, 0, 0.05);
        for (let i = 0; i < 8; i++) s.at(new THREE.ConeGeometry(4, 1.6, 8, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4), i % 2 ? '#ff7b6b' : '#fffaf0', 0.3, 6.3, 0.6, 0.1, 0, 0.05);
        s.at(rbox(3, 0.08, 5, 0.03), TOY_COLORS[n % 7], 2, 0.06, -1, 0, 0.3, 0);
        d.place(s, sp.x, sp.z, n, 4, { collide: 0.4 });
      } else if (kind === 1) {
        // A toy palm.
        const s = new Shape();
        for (let i = 0; i < 6; i++) s.at(cyl(0.45 - i * 0.03, 0.5 - i * 0.03, 1.6, 8), i % 2 ? '#b98a5e' : '#a87a4e', Math.sin(i * 0.4) * 0.6, 0.8 + i * 1.55, 0, 0, 0, -0.08);
        // Leaves droop outward from the crown, each at its own height so none share a plane.
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          s.at(rbox(0.9, 0.12, 4.2, 0.05), '#3fb68b', Math.cos(a) * 2.4, 9.5 + i * 0.03, Math.sin(a) * 2.4, 0.35, Math.PI / 2 - a, 0);
        }
        s.at(ball(0.4, 8, 6), '#8a5a3b', 0.6, 9.3, 0.3);
        s.at(ball(0.4, 8, 6), '#8a5a3b', 0.2, 9.2, -0.5);
        d.place(s, sp.x, sp.z, n, 2, { collide: 0.6 });
      } else if (kind === 2) {
        // A little sandcastle.
        const s = new Shape();
        s.at(cyl(1.6, 1.9, 2, 12), '#f0cf8f', 0, 1, 0);
        s.at(cyl(1.0, 1.2, 1.4, 12), '#f0cf8f', 0, 2.7, 0);
        for (let i = 0; i < 6; i++) s.at(rbox(0.4, 0.4, 0.4, 0.05), '#f0cf8f', Math.cos(i) * 0.9, 3.6, Math.sin(i) * 0.9, 0, -i, 0);
        s.at(cyl(0.05, 0.05, 1.4, 5), '#fffaf0', 0, 4.1, 0);
        s.at(cone(0.5, 0.3, 3), TOY_COLORS[n % 7], 0.3, 4.6, 0, Math.PI / 2, 0, -Math.PI / 2, 1, 1, 0.2);
        d.place(s, sp.x, sp.z, n, 2, { collide: 1.8 });
      } else {
        d.place(beachBall(1.4), sp.x, sp.z, n, 1.5, { collide: 1.4 });
      }
      n++;
    }
  }

  // ---- The lighthouse on a rock out to sea.
  const beam = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: new THREE.Color('#ffe08a'), emissiveIntensity: 0.3 });
  scene.lamps.push(lampMat);
  {
    const lx = coast.x + coast.nx * 40 + bf.tx * 30;
    const lz = coast.z + coast.nz * 40 + bf.tz * 30;
    const s = new Shape();
    s.at(ball(9, 12, 8), '#8a86a0', 0, -3, 0, 0, 0, 0, 1, 0.6, 1);
    for (let i = 0; i < 6; i++) s.at(cyl(2.6 - i * 0.2, 2.8 - i * 0.2, 3, 16), i % 2 ? PAL.tomato : '#fffaf0', 0, 3 + i * 3, 0);
    s.at(cyl(2.2, 2.2, 0.6, 16), PAL.ink, 0, 21, 0);
    s.at(cone(2.4, 2.4, 16), PAL.tomato, 0, 25.6, 0);
    batch.shape(s, xform(lx, 0, lz));
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 3, 16), lampMat);
    lamp.position.set(lx, 22.9, lz);
    d.group.add(lamp);
    const cone2 = new THREE.Mesh(new THREE.ConeGeometry(12, 80, 20, 1, true).translate(0, -40, 0).rotateZ(Math.PI / 2), beamMat);
    beam.add(cone2);
    beam.position.set(lx, 22.9, lz);
    beam.renderOrder = 4;
    d.group.add(beam);
  }

  // ---- A low fence and dune grass along the land edges.
  {
    const s = new Shape();
    const along = (ax: number, az: number, bx: number, bz: number) => {
      const len = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t < len; t += 2.2) {
        const k = t / len;
        const x = ax + (bx - ax) * k;
        const z = az + (bz - az) * k;
        if (seaDist(x, z) > -2) continue;
        s.at(rbox(0.25, 1.4, 0.25, 0), '#b98a5e', x, 0.7, z, 0, 0, (t % 4.4 < 2.2 ? 1 : -1) * 0.06);
        if (t % 6.6 < 2.2) s.at(cone(0.9, 1.6, 5), '#9ac46a', x + 1.2, 0.8, z + 0.6);
      }
    };
    along(x0, z0, x1, z0);
    along(x1, z0, x1, z1);
    along(x1, z1, x0, z1);
    along(x0, z1, x0, z0);
    batch.shape(s, new THREE.Matrix4(), 'plastic', { cast: false, detail: true });
  }

  // ---- Beach balls bouncing across the boardwalk: the hazard.
  const balls: THREE.Mesh[] = [];
  const shadows: THREE.Mesh[] = [];
  const ballGeo = beachBall(1.2).geometry();
  const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25, depthWrite: false });
  const shadowGeo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
  const BALLS = [76, 88, 100].map((s, i) => ({ s, phase: i * 2.1, x: 0, z: 0, y: 0 }));
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }));
    m.castShadow = true;
    m.userData.dynamic = true;
    d.group.add(m);
    balls.push(m);
    const sh = new THREE.Mesh(shadowGeo, shadowMat);
    sh.renderOrder = 2;
    d.group.add(sh);
    shadows.push(sh);
  }
  let hazardT = 0;
  const reach = EDGE + 3.5;
  const ballAt = (bb: (typeof BALLS)[number], t: number) => {
    const u = (t / 6 + bb.phase / 6) % 1;
    // Across and back in 6 seconds, three hops each way.
    const off = Math.sin(u * Math.PI * 2) * reach;
    const hop = Math.abs(Math.sin(u * Math.PI * 6));
    const q = c.at(bb.s, off);
    return { x: q.x, z: q.z, y: 1.2 + hop * 3.2, hop, off };
  };
  const hazard: Hazard = {
    danger: (s: number) => {
      for (const bb of BALLS) if (Math.abs(c.path.delta(s, bb.s)) < 5) return { off: ballAt(bb, hazardT + 0.6).off, width: 2.4 };
      return null;
    },
    colliders: () => [],
    hits: (x, z, y) => {
      for (const bb of BALLS) if (Math.hypot(x - bb.x, z - bb.z) < 2.1 && y + 1 > bb.y - 1.2 && bb.y < 2.6) return 'spin';
      return null;
    },
    info: () => ({ kind: 'balls', balls: BALLS.map((bb) => ({ x: +bb.x.toFixed(1), z: +bb.z.toFixed(1), y: +bb.y.toFixed(1) })) }),
  };

  return {
    stand: standAt,
    hero: new THREE.Vector3(c.frame(287).x, 10, c.frame(287).z),
    dust: 0xe3c58a,
    hazards: [hazard],
    water,
    update(dt: number, t: number, night: number, info: SceneInfo) {
      hazardT += dt;
      (seaMat.map as THREE.Texture).offset.set(t * 0.01, t * 0.02);
      (waterMat2.map as THREE.Texture).offset.set(-t * 0.015, t * 0.01);
      for (const cm2 of channelMats) cm2.map = waterMat2.map;
      foamMat.opacity = 0.4 + Math.sin(t * 1.3) * 0.2;
      for (let i = 0; i < 3; i++) {
        const p = ballAt(BALLS[i], hazardT);
        BALLS[i].x = p.x;
        BALLS[i].z = p.z;
        BALLS[i].y = p.y;
        balls[i].position.set(p.x, p.y, p.z);
        balls[i].rotation.x += dt * 3;
        balls[i].rotation.z += dt * 2;
        const sh = shadows[i];
        sh.position.set(p.x, LAYER.glow - 0.05 + c.profile.h(BALLS[i].s), p.z);
        // The shadow grows as the ball comes down.
        const k = 1.4 + (1 - p.hop) * 0.8;
        sh.scale.set(k, 1, k);
        shadowMat.opacity = 0.18 + (1 - p.hop) * 0.15;
      }
      // Ducks bob on the lagoon; crabs scuttle sideways.
      if (lag) {
        const mm = new THREE.Matrix4();
        for (let i = 0; i < 5; i++) {
          const a = t * 0.12 + (i / 5) * Math.PI * 2;
          mm.makeRotationY(-a + Math.sin(t + i) * 0.2);
          mm.setPosition(lag.x + Math.cos(a) * lag.a * 0.6, Math.sin(t * 2 + i) * 0.1, lag.z + Math.sin(a) * lag.b * 0.6);
          ducks.setMatrixAt(i, mm);
        }
        ducks.instanceMatrix.needsUpdate = true;
      }
      const cm = new THREE.Matrix4();
      crabSpots.forEach((sp, i) => {
        const sx = Math.sin(t * 0.9 + i * 1.7) * 2.2;
        cm.makeRotationY(sp.a + Math.sin(t * 6 + i) * 0.15);
        cm.setPosition(sp.x + Math.cos(sp.a) * sx + 2.6, 0, sp.z + Math.sin(sp.a) * sx);
        crabs.setMatrixAt(i, cm);
      });
      crabs.count = crabSpots.length;
      crabs.instanceMatrix.needsUpdate = true;
      // The lighthouse beam sweeps after dark.
      beam.rotation.y = t * 0.6;
      beamMat.opacity = night * 0.16;
      lampMat.emissiveIntensity = 0.3 + night * 2.4;
      fans?.bob(t, info.finalLap ? 1 : info.racing ? 0.35 : 0.1);
    },
    cutaway(cam: THREE.Vector3) {
      const t = c.def!.tunnels[0];
      const n = c.path.nearest(cam.x, cam.z);
      const inside = n.s > t.s0 - 2 && n.s < t.s1 + 2 && n.dist < EDGE + 1 && cam.y > t.roof - 1.2;
      for (const mt of roofMats) mt.opacity += ((inside ? 0.2 : 1) - mt.opacity) * 0.25;
    },
  };
}
