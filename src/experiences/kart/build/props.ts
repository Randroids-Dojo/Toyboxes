// Procedural toys, scaled up for a tiny kart: everything a circuit is
// dressed with. Each returns a Shape (coloured parts) so a Batch can merge
// hundreds of them into a few draw calls.

import * as THREE from 'three';
import { Shape, ball, cone, cyl, rbox, torus, xform } from './shape';

export const PAL = {
  ink: '#1d1830',
  cream: '#fffaf0',
  sun: '#ffd24a',
  tomato: '#e8574a',
  sky: '#4aa3df',
  mint: '#3fb68b',
  grape: '#8a6bd1',
  gum: '#ef6fa0',
  amber: '#f4b740',
  wood: '#c98a54',
  woodDark: '#8a5a3b',
};

export const TOY_COLORS = [PAL.tomato, PAL.sky, PAL.sun, PAL.mint, PAL.grape, PAL.gum, PAL.amber];

/** A crayon standing up, tip at the top. `h` total height. */
export function crayon(color: string, h: number, r: number): Shape {
  const s = new Shape();
  const body = h * 0.78;
  s.at(cyl(r, r, body, 12), color, 0, body / 2, 0);
  s.at(cyl(r * 1.02, r * 1.02, body * 0.62, 12), '#fffaf0', 0, body * 0.5, 0);
  s.at(cyl(r * 1.04, r * 1.04, body * 0.5, 12), color, 0, body * 0.5, 0, 0, 0, 0, 1, 1, 1);
  for (const y of [0.22, 0.78]) s.at(cyl(r * 1.05, r * 1.05, h * 0.02, 12), '#1d1830', 0, body * y, 0);
  s.at(cyl(r * 0.45, r, h * 0.14, 12), color, 0, body + h * 0.07, 0);
  s.at(cone(r * 0.45, h * 0.08, 12), color, 0, body + h * 0.18, 0);
  return s;
}

/** A stack of toy rings on a peg: the tyre wall of a playroom. */
export function ringStack(rings: number, r: number, seed = 0): Shape {
  const s = new Shape();
  const th = r * 0.42;
  for (let i = 0; i < rings; i++) {
    const rr = r * (1 - i * 0.12);
    s.at(torus(rr * 0.68, rr * 0.32, 8, 18), TOY_COLORS[(i + seed) % TOY_COLORS.length], 0, th * 0.5 + i * th * 1.02, 0, Math.PI / 2, 0, 0, 1, 1, 0.9);
  }
  s.at(cyl(r * 0.16, r * 0.18, th * rings + r * 0.3, 10), PAL.wood, 0, (th * rings + r * 0.3) / 2, 0);
  s.at(ball(r * 0.26, 10, 8), PAL.tomato, 0, th * rings + r * 0.3, 0);
  return s;
}

/** A tyre wall: black rubber tyres stacked three high. */
export function tyreStack(n = 3): Shape {
  const s = new Shape();
  for (let k = 0; k < n; k++) s.at(torus(0.4, 0.17, 8, 16), k % 2 ? '#2a2733' : '#24212e', 0, 0.17 + k * 0.32, 0, Math.PI / 2, 0, 0);
  return s;
}

/** A pennant flag on a pole. */
export function flag(color: string, h = 3): Shape {
  const s = new Shape();
  s.at(cyl(0.05, 0.06, h, 8), '#fffaf0', 0, h / 2, 0);
  s.at(ball(0.09, 8, 6), PAL.sun, 0, h + 0.05, 0);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.7, 0, 1.2, -0.35, 0, 0, 0, 0, 1.2, -0.35, 0, 0, -0.7, 0], 3));
  tri.computeVertexNormals();
  s.add(tri, color, xform(0.05, h - 0.05, 0));
  return s;
}

/** Bunting: little flags hanging from a line between two points (local, line along +x). */
export function bunting(len: number, sag: number, colors = TOY_COLORS): Shape {
  const s = new Shape();
  const n = Math.max(3, Math.floor(len / 0.9));
  const tri = new THREE.BufferGeometry();
  // Double sided triangle.
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.3, 0, 0, 0.3, 0, 0, 0, -0.55, 0, 0.3, 0, 0, -0.3, 0, 0, 0, -0.55, 0], 3));
  tri.computeVertexNormals();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (t - 0.5) * len;
    const y = -Math.sin(t * Math.PI) * sag;
    if (i < n) {
      const t2 = (i + 1) / n;
      const x2 = (t2 - 0.5) * len;
      const y2 = -Math.sin(t2 * Math.PI) * sag;
      const seg = Math.hypot(x2 - x, y2 - y);
      s.at(cyl(0.02, 0.02, seg, 4), '#fffaf0', (x + x2) / 2, (y + y2) / 2, 0, 0, 0, Math.PI / 2 + Math.atan2(y2 - y, x2 - x));
      s.add(tri, colors[i % colors.length], xform((x + x2) / 2, (y + y2) / 2, 0));
    }
  }
  return s;
}

/** A peg-doll fan: a capsule body and a ball head. Instanced by grandstands. */
export function pegDoll(): { body: THREE.BufferGeometry; head: THREE.BufferGeometry } {
  return { body: new THREE.CapsuleGeometry(0.24, 0.34, 3, 8), head: new THREE.SphereGeometry(0.2, 10, 8) };
}

/**
 * A grandstand: stepped tiers with seats and a striped roof, facing +z. `w`
 * wide. Returns the shape and seat positions for the crowd.
 */
export function grandstand(w: number, tiers: number, look: { frame: string; seat: string; roofA: string; roofB: string }): { shape: Shape; seats: THREE.Vector3[] } {
  const s = new Shape();
  const seats: THREE.Vector3[] = [];
  const depth = 1.7;
  for (let t = 0; t < tiers; t++) {
    const hgt = 0.7 + t * 0.75;
    s.at(rbox(w, hgt, depth, 0.06), look.frame, 0, hgt / 2, -t * depth + depth);
    s.at(rbox(w - 0.6, 0.16, 0.5, 0.05), look.seat, 0, hgt + 0.08, -t * depth + depth - 0.3);
    for (let x = -w / 2 + 0.9; x < w / 2 - 0.6; x += 0.85) seats.push(new THREE.Vector3(x, hgt + 0.16, -t * depth + depth - 0.25));
  }
  const back = 0.7 + tiers * 0.75;
  // Posts stand a few millimetres proud of the base so their feet never share its plane.
  for (const sx of [-1, 1]) s.at(rbox(0.35, back + 3.2, 0.35, 0.06), look.frame, sx * (w / 2 - 0.2), (back + 3.2) / 2 + 0.004, -(tiers - 1) * depth + 0.2);
  for (const sx of [-1, 1]) s.at(rbox(0.3, 3.2, 0.3, 0.06), look.frame, sx * (w / 2 - 0.2), 1.6 + 0.004, depth + 0.6);
  // Striped roof.
  const stripes = Math.round(w / 1.6);
  for (let i = 0; i < stripes; i++) {
    const x = -w / 2 + (i + 0.5) * (w / stripes);
    s.at(rbox(w / stripes + 0.01, 0.16, depth * tiers + 1.6, 0.04), i % 2 ? look.roofA : look.roofB, x, back + 3.2, -(tiers - 1) * depth / 2 + 0.6, 0.06, 0, 0);
  }
  s.at(rbox(w + 0.4, 0.3, 0.3, 0.08), look.roofA, 0, back + 3.05, depth + 1.35);
  return { shape: s, seats };
}

/** A round lollipop tree for gardens. */
export function lollipopTree(h: number, crown: string): Shape {
  const s = new Shape();
  s.at(cyl(h * 0.05, h * 0.07, h * 0.6, 8), PAL.woodDark, 0, h * 0.3, 0);
  s.at(ball(h * 0.32, 12, 9), crown, 0, h * 0.72, 0);
  s.at(ball(h * 0.2, 10, 8), crown, h * 0.18, h * 0.62, h * 0.1);
  return s;
}

/** A daisy or tulip, scaled up to tree size. */
export function flower(h: number, petal: string, kind: 'daisy' | 'tulip'): Shape {
  const s = new Shape();
  s.at(cyl(h * 0.035, h * 0.045, h, 8), '#4f9e45', 0, h / 2, 0);
  s.at(ball(h * 0.12, 8, 6), '#5cbf63', h * 0.1, h * 0.35, 0, 0, 0, -0.6, 1.6, 0.3, 0.8);
  if (kind === 'daisy') {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      s.at(ball(h * 0.11, 8, 6), petal, Math.cos(a) * h * 0.16, h, Math.sin(a) * h * 0.16, 0, -a, 0, 1.5, 0.35, 0.7);
    }
    s.at(ball(h * 0.09, 10, 8), PAL.sun, 0, h + h * 0.03, 0, 0, 0, 0, 1, 0.6, 1);
  } else {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      s.at(ball(h * 0.1, 8, 6), petal, Math.cos(a) * h * 0.06, h + h * 0.06, Math.sin(a) * h * 0.06, 0, -a, 0.25, 0.8, 1.6, 0.8);
    }
  }
  return s;
}

/** A beach ball's look: six coloured segments. Used by the hazard and the decor. */
export function beachBall(r: number): Shape {
  const s = new Shape();
  const cols = [PAL.tomato, PAL.cream, PAL.sky, PAL.cream, PAL.sun, PAL.cream];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.SphereGeometry(r, 6, 12, (i / 6) * Math.PI * 2, Math.PI / 3);
    s.add(g, cols[i]);
  }
  s.at(cyl(r * 0.2, r * 0.2, r * 2.02, 10), PAL.cream, 0, 0, 0);
  return s;
}

/** A giant toy block stack of 2 to 4 plain blocks with rounded edges. */
export function blockTower(n: number, size: number, seed: number): Shape {
  const s = new Shape();
  let y = 0;
  for (let i = 0; i < n; i++) {
    const sz = size * (1 - i * 0.08);
    s.at(rbox(sz, sz, sz, sz * 0.08), TOY_COLORS[(seed + i * 3) % TOY_COLORS.length], (i % 2 ? 0.08 : -0.06) * size, y + sz / 2, 0, 0, i * 0.18 + seed * 0.3, 0);
    // 2 mm between stacked blocks, so faces never touch.
    y += sz + 0.002;
  }
  return s;
}

/** An empty frame of posts and a top beam (gantry, gate). Local x across, facing z. */
export function gantry(width: number, height: number, color: string, post = '#2f3a56'): Shape {
  const s = new Shape();
  for (const sx of [-1, 1]) s.at(rbox(0.45, height, 0.45, 0.1), post, sx * width / 2, height / 2, 0);
  s.at(rbox(width + 0.9, 1.1, 0.55, 0.15), color, 0, height, 0);
  return s;
}
