// Canvas textures painted at load: the village ground (grass, mown stripes,
// cobbled paths, painted pads and soft contact shadows in one map), small
// tiling materials, canopy stripes, the face atlas and signs. No files.

import * as THREE from 'three';
import { DISPLAY_FONT, BODY_FONT, roundRect } from '../../world/kit';
import { BANDSTAND, BELL_TOWER, FOUNTAIN, LIBRARY, MAYPOLE, POND, villageBoxes } from './layout';
import { hex, C } from './palette';
import { rng } from './sim/rng';

export const GROUND_HALF = 36;

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------------------
// The ground

/** The whole village floor in one map, so no ground decal can z-fight. */
export function groundTexture(size: number): THREE.CanvasTexture {
  const [c, g] = canvas(size);
  const R = rng(7);
  const S = size / (GROUND_HALF * 2);
  const X = (x: number) => (x + GROUND_HALF) * S;
  const Z = (z: number) => (z + GROUND_HALF) * S;
  // Grass with soft mottling.
  g.fillStyle = hex(C.grass);
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = R() * size;
    const y = R() * size;
    const r = (0.6 + R() * 2.4) * S;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const col = R() < 0.5 ? 'rgba(111,163,90,0.35)' : 'rgba(186,220,128,0.28)';
    grd.addColorStop(0, col);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // The green: mown stripes inside a circle.
  g.save();
  g.beginPath();
  g.arc(X(0), Z(0), 13 * S, 0, Math.PI * 2);
  g.clip();
  for (let i = -14; i < 14; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,220,0.07)' : 'rgba(40,90,30,0.07)';
    g.fillRect(X(i), 0, S, size);
  }
  g.restore();
  // The park: a little lusher.
  g.fillStyle = 'rgba(70,130,60,0.12)';
  g.beginPath();
  g.ellipse(X(-24), Z(10), 9 * S, 13 * S, 0, 0, Math.PI * 2);
  g.fill();
  // Contact shadows under buildings and big things.
  const shadow = (x: number, z: number, w: number, d: number, soft: number, a = 0.32) => {
    g.save();
    g.filter = `blur(${Math.max(1, soft * S)}px)`;
    g.fillStyle = `rgba(60,40,90,${a})`;
    g.fillRect(X(x - w), Z(z - d), w * 2 * S, d * 2 * S);
    g.restore();
  };
  for (const b of villageBoxes()) if (b.h > 1 && b.h < 30 && !b.id.startsWith('lane') && !b.id.startsWith('hedge')) shadow(b.x, b.z, b.hw + 0.15, b.hd + 0.15, 0.5, 0.28);
  for (const b of villageBoxes()) if (b.id.startsWith('hedge') || b.id.startsWith('lane')) shadow(b.x, b.z, b.hw + 0.1, b.hd + 0.1, 0.35, 0.22);

  // Paths: grout first, then cobbles inside the same shapes.
  const paths = new Path2D();
  const rect = (x0: number, z0: number, x1: number, z1: number) => paths.rect(X(x0), Z(z0), (x1 - x0) * S, (z1 - z0) * S);
  const disc = (x: number, z: number, r: number) => {
    paths.moveTo(X(x) + r * S, Z(z));
    paths.arc(X(x), Z(z), r * S, 0, Math.PI * 2);
  };
  const lane = (x0: number, z0: number, x1: number, z1: number, w: number) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const l = Math.hypot(dx, dz);
    const nx = (-dz / l) * w * 0.5;
    const nz = (dx / l) * w * 0.5;
    paths.moveTo(X(x0 + nx), Z(z0 + nz));
    paths.lineTo(X(x1 + nx), Z(z1 + nz));
    paths.lineTo(X(x1 - nx), Z(z1 - nz));
    paths.lineTo(X(x0 - nx), Z(z0 - nz));
    paths.closePath();
  };
  rect(-3, 11, 3, 35);
  // Ring round the green.
  paths.moveTo(X(15.2), Z(0));
  paths.arc(X(0), Z(0), 15.2 * S, 0, Math.PI * 2);
  paths.moveTo(X(13), Z(0));
  paths.arc(X(0), Z(0), 13 * S, 0, Math.PI * 2, true);
  disc(FOUNTAIN.x, FOUNTAIN.z, 6.4);
  lane(0, -13, 0, -9, 3);
  lane(5, -15, LIBRARY.door.x, LIBRARY.door.z + 0.5, 3);
  rect(LIBRARY.door.x - 3.5, LIBRARY.z + LIBRARY.hd, LIBRARY.door.x + 3.5, LIBRARY.z + LIBRARY.hd + 3);
  lane(-5, -16, BELL_TOWER.x + 2, BELL_TOWER.z + 2, 2.6);
  disc(BELL_TOWER.x, BELL_TOWER.z, 4.4);
  disc(BANDSTAND.x, BANDSTAND.z, 5.6);
  lane(-8, -4.5, -12, -6, 2.4);
  lane(-15, 0, -16.2, 9, 2.4);
  lane(15, 0, 22, 4, 2.4);
  lane(14, 8, 22, 15, 2.4);
  lane(11, -4, 11.6, -8, 2);
  lane(-13, 6, -15.6, 9, 2);
  g.fillStyle = hex(C.grout);
  g.fill(paths, 'evenodd');
  g.save();
  g.clip(paths, 'evenodd');
  const cob = Math.max(3, 0.32 * S);
  for (let y = 0; y < size; y += cob * 0.86) {
    const off = (Math.round(y / (cob * 0.86)) % 2) * cob * 0.5;
    for (let x = -cob; x < size + cob; x += cob) {
      const v = 0.86 + R() * 0.2;
      const base = new THREE.Color(C.path).multiplyScalar(v);
      g.fillStyle = `#${base.getHexString()}`;
      g.beginPath();
      g.ellipse(x + off + (R() - 0.5) * cob * 0.12, y, cob * 0.43, cob * 0.36, R() * 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
  // Path edges.
  g.strokeStyle = 'rgba(120,90,60,0.35)';
  g.lineWidth = Math.max(1, 0.06 * S);
  g.stroke(paths);

  // Painted "Big one here" pads.
  const pad = (x: number, z: number, r: number, hole: number) => {
    g.save();
    g.translate(X(x), Z(z));
    g.fillStyle = 'rgba(255,247,230,0.95)';
    g.beginPath();
    g.arc(0, 0, r * S, 0, Math.PI * 2);
    g.arc(0, 0, hole * S, 0, Math.PI * 2, true);
    g.fill('evenodd');
    g.strokeStyle = hex(C.tomato);
    g.lineWidth = 0.14 * S;
    g.beginPath();
    g.arc(0, 0, (r - 0.15) * S, 0, Math.PI * 2);
    g.stroke();
    // Chevrons pointing up (outwards on the ground, read as "up").
    g.fillStyle = hex(C.bean);
    for (let k = 0; k < 8; k++) {
      g.save();
      g.rotate((k / 8) * Math.PI * 2);
      const m = (hole + r) / 2;
      g.beginPath();
      g.moveTo(-0.22 * S, (m + 0.2) * S);
      g.lineTo(0, (m - 0.2) * S);
      g.lineTo(0.22 * S, (m + 0.2) * S);
      g.lineTo(0.22 * S, (m + 0.38) * S);
      g.lineTo(0, (m - 0.02) * S);
      g.lineTo(-0.22 * S, (m + 0.38) * S);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.restore();
  };
  pad(MAYPOLE.x, MAYPOLE.z, 2.6, 1.0);
  pad(BELL_TOWER.x + 3.4, BELL_TOWER.z + 3.4, 1.4, 0.0001);
  // Trial pads: a bright ring.
  const ring = (x: number, z: number, col: string) => {
    g.strokeStyle = col;
    g.lineWidth = 0.18 * S;
    g.beginPath();
    g.arc(X(x), Z(z), 1.2 * S, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fill();
  };
  ring(6, 5, '#ffd24a');
  ring(-8.3, -3.6, '#e8574a');
  ring(-15.4, 12.2, '#9b7bd6');
  // Pond bank.
  g.fillStyle = 'rgba(120,150,90,0.6)';
  g.beginPath();
  g.arc(X(POND.x), Z(POND.z), (POND.r + 0.5) * S, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d8c79c';
  g.beginPath();
  g.arc(X(POND.x), Z(POND.z), (POND.r + 0.15) * S, 0, Math.PI * 2);
  g.fill();
  // Flowers in the beds and along the hedges.
  const flowers = [hex(C.flowerY), hex(C.flowerP), '#ffffff', '#b79cf0'];
  for (let i = 0; i < 2600; i++) {
    const x = R() * size;
    const y = R() * size;
    const wx = x / S - GROUND_HALF;
    const wz = y / S - GROUND_HALF;
    if (Math.hypot(wx, wz) < 15.5 && Math.hypot(wx, wz) > 12.6) continue;
    g.fillStyle = flowers[Math.floor(R() * flowers.length)];
    g.globalAlpha = 0.55;
    g.beginPath();
    g.arc(x, y, Math.max(0.8, 0.05 * S), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const t = tex(c, false);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------------------
// Tiling materials (light, so vertex colours tint them)

export function plasterTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  const R = rng(11);
  g.fillStyle = '#f4f1ec';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const v = 225 + Math.floor(R() * 30);
    g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.35)`;
    g.fillRect(R() * 256, R() * 256, 1 + R() * 3, 1 + R() * 3);
  }
  return tex(c);
}

export function roofTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  const R = rng(13);
  g.fillStyle = '#e6e1dc';
  g.fillRect(0, 0, 256, 256);
  const rows = 8;
  const cols = 6;
  const h = 256 / rows;
  const w = 256 / cols;
  for (let r = 0; r < rows; r++) {
    for (let k = -1; k < cols + 1; k++) {
      const x = k * w + (r % 2) * w * 0.5;
      const v = 200 + Math.floor(R() * 55);
      g.fillStyle = `rgb(${v},${v - 6},${v - 10})`;
      g.beginPath();
      g.moveTo(x + 2, r * h);
      g.lineTo(x + w - 2, r * h);
      g.lineTo(x + w - 2, r * h + h * 0.55);
      g.quadraticCurveTo(x + w / 2, r * h + h * 1.15, x + 2, r * h + h * 0.55);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(90,70,60,0.35)';
      g.lineWidth = 2;
      g.stroke();
    }
  }
  return tex(c);
}

export function brickTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  const R = rng(17);
  g.fillStyle = '#cfc7bd';
  g.fillRect(0, 0, 256, 256);
  const bh = 256 / 10;
  const bw = 256 / 4;
  for (let r = 0; r < 10; r++) {
    for (let k = -1; k < 5; k++) {
      const v = 215 + Math.floor(R() * 40);
      g.fillStyle = `rgb(${v},${v - 8},${v - 14})`;
      roundRect(g, k * bw + (r % 2) * bw * 0.5 + 2, r * bh + 2, bw - 4, bh - 4, 3);
      g.fill();
    }
  }
  return tex(c);
}

export function stoneTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  const R = rng(19);
  g.fillStyle = '#d9d3c8';
  g.fillRect(0, 0, 256, 256);
  const bh = 256 / 4;
  for (let r = 0; r < 4; r++) {
    const bw = 256 / 2;
    for (let k = -1; k < 3; k++) {
      const v = 228 + Math.floor(R() * 26);
      g.fillStyle = `rgb(${v},${v - 3},${v - 9})`;
      roundRect(g, k * bw + (r % 2) * bw * 0.5 + 2, r * bh + 2, bw - 4, bh - 4, 6);
      g.fill();
      for (let s = 0; s < 30; s++) {
        g.fillStyle = `rgba(150,140,120,${0.08 + R() * 0.08})`;
        g.fillRect(k * bw + (r % 2) * bw * 0.5 + R() * bw, r * bh + R() * bh, 2, 2);
      }
    }
  }
  return tex(c);
}

export function woodTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128);
  const R = rng(23);
  g.fillStyle = '#efe6dc';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(120,90,60,${0.08 + R() * 0.12})`;
    g.lineWidth = 1 + R() * 2;
    g.beginPath();
    const y = R() * 128;
    g.moveTo(0, y);
    g.bezierCurveTo(40, y + (R() - 0.5) * 8, 90, y + (R() - 0.5) * 8, 128, y);
    g.stroke();
  }
  return tex(c);
}

export function hedgeTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  const R = rng(29);
  g.fillStyle = '#d7e8cc';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = 150 + Math.floor(R() * 105);
    g.fillStyle = `rgb(${v - 20},${v},${v - 40})`;
    g.beginPath();
    g.ellipse(R() * 256, R() * 256, 4 + R() * 6, 2 + R() * 4, R() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

/** Canopy stripes in two colours. */
export function stripeTexture(a: number, b: number, n = 8): THREE.CanvasTexture {
  const [c, g] = canvas(256, 32);
  for (let i = 0; i < n; i++) {
    g.fillStyle = hex(i % 2 ? b : a);
    g.fillRect((i / n) * 256, 0, 256 / n + 1, 32);
  }
  return tex(c);
}

// ---------------------------------------------------------------------------
// Faces: eight expressions on a 4 x 2 atlas

export const FACES = ['neutral', 'gasp', 'peeyew', 'laugh', 'angry', 'sleepy', 'suspicious', 'happy'] as const;
export type Face = (typeof FACES)[number];

export function faceAtlas(): THREE.CanvasTexture {
  const cell = 128;
  const [c, g] = canvas(cell * 4, cell * 2);
  const ink = hex(C.ink);
  FACES.forEach((f, i) => {
    g.save();
    g.translate((i % 4) * cell + cell / 2, Math.floor(i / 4) * cell + cell / 2);
    g.fillStyle = ink;
    g.strokeStyle = ink;
    g.lineCap = 'round';
    g.lineWidth = 7;
    const eye = (x: number, y: number, rx: number, ry: number) => {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(x, y, rx + 4, ry + 4, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = ink;
      g.beginPath();
      g.ellipse(x, y + 2, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(x + rx * 0.35, y - ry * 0.3, Math.max(2, rx * 0.3), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = ink;
    };
    const arcEye = (x: number, y: number, up: boolean) => {
      g.beginPath();
      if (up) g.arc(x, y + 6, 11, Math.PI * 1.15, Math.PI * 1.85);
      else g.arc(x, y - 6, 11, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke();
    };
    const brow = (x: number, y: number, tilt: number) => {
      g.beginPath();
      g.moveTo(x - 14, y + tilt);
      g.lineTo(x + 14, y - tilt);
      g.stroke();
    };
    const ex = 24;
    const ey = -12;
    switch (f) {
      case 'neutral':
        eye(-ex, ey, 8, 11);
        eye(ex, ey, 8, 11);
        g.beginPath();
        g.moveTo(-12, 30);
        g.quadraticCurveTo(0, 36, 12, 30);
        g.stroke();
        break;
      case 'happy':
        arcEye(-ex, ey, true);
        arcEye(ex, ey, true);
        g.beginPath();
        g.arc(0, 22, 16, 0.15 * Math.PI, 0.85 * Math.PI);
        g.stroke();
        g.fillStyle = 'rgba(255,120,140,0.45)';
        g.beginPath();
        g.ellipse(-40, 16, 10, 6, 0, 0, Math.PI * 2);
        g.ellipse(40, 16, 10, 6, 0, 0, Math.PI * 2);
        g.fill();
        break;
      case 'gasp':
        eye(-ex, ey - 4, 11, 15);
        eye(ex, ey - 4, 11, 15);
        brow(-ex, -38, -4);
        brow(ex, -38, 4);
        g.beginPath();
        g.ellipse(0, 32, 10, 14, 0, 0, Math.PI * 2);
        g.fill();
        break;
      case 'peeyew':
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(-ex - 12, ey - 8);
        g.lineTo(-ex + 10, ey);
        g.lineTo(-ex - 12, ey + 8);
        g.moveTo(ex + 12, ey - 8);
        g.lineTo(ex - 10, ey);
        g.lineTo(ex + 12, ey + 8);
        g.stroke();
        g.fillStyle = '#8fd14f';
        g.beginPath();
        g.ellipse(0, 32, 20, 9, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = ink;
        g.stroke();
        break;
      case 'laugh':
        arcEye(-ex, ey, true);
        arcEye(ex, ey, true);
        g.beginPath();
        g.moveTo(-20, 18);
        g.quadraticCurveTo(0, 54, 20, 18);
        g.closePath();
        g.fill();
        g.fillStyle = '#ff8fa0';
        g.beginPath();
        g.ellipse(0, 34, 9, 6, 0, 0, Math.PI * 2);
        g.fill();
        break;
      case 'angry':
        eye(-ex, ey + 2, 7, 9);
        eye(ex, ey + 2, 7, 9);
        g.lineWidth = 8;
        brow(-ex, -30, 7);
        brow(ex, -30, -7);
        g.beginPath();
        g.moveTo(-14, 34);
        g.quadraticCurveTo(0, 24, 14, 34);
        g.stroke();
        break;
      case 'sleepy':
        arcEye(-ex, ey + 4, false);
        arcEye(ex, ey + 4, false);
        g.beginPath();
        g.ellipse(0, 30, 6, 4, 0, 0, Math.PI * 2);
        g.fill();
        break;
      case 'suspicious':
        eye(-ex, ey + 2, 8, 6);
        eye(ex, ey + 2, 8, 6);
        g.lineWidth = 7;
        brow(-ex, -24, 0);
        brow(ex, -30, -5);
        g.beginPath();
        g.moveTo(-10, 32);
        g.lineTo(12, 28);
        g.stroke();
        break;
    }
    g.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Signs

export function signCanvas(lines: { text: string; size: number; color?: string; font?: 'display' | 'body' }[], w: number, h: number, bg: string, border: string): THREE.CanvasTexture {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  roundRect(g, 0, 0, w, h, Math.min(w, h) * 0.12);
  g.fill();
  g.lineWidth = Math.max(4, h * 0.05);
  g.strokeStyle = border;
  roundRect(g, g.lineWidth / 2 + 2, g.lineWidth / 2 + 2, w - g.lineWidth - 4, h - g.lineWidth - 4, Math.min(w, h) * 0.1);
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const total = lines.reduce((s, l) => s + l.size * 1.15, 0);
  let y = h / 2 - total / 2;
  for (const l of lines) {
    g.font = `${l.font === 'body' ? '700 ' : ''}${l.size}px ${l.font === 'body' ? BODY_FONT : DISPLAY_FONT}`;
    g.fillStyle = l.color ?? hex(C.ink);
    g.fillText(l.text, w / 2, y + l.size * 0.6, w * 0.92);
    y += l.size * 1.15;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A pictogram panel strip: stand still, hold, whoosh. */
export function pictogramTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 192);
  g.fillStyle = '#fff7e6';
  roundRect(g, 0, 0, 512, 192, 22);
  g.fill();
  g.strokeStyle = hex(C.ink);
  g.lineWidth = 8;
  roundRect(g, 6, 6, 500, 180, 18);
  g.stroke();
  const ink = hex(C.ink);
  const kid = (x: number, y: number, s = 1) => {
    g.fillStyle = ink;
    g.beginPath();
    g.arc(x, y - 44 * s, 14 * s, 0, Math.PI * 2);
    g.fill();
    roundRect(g, x - 13 * s, y - 30 * s, 26 * s, 34 * s, 8 * s);
    g.fill();
    g.fillRect(x - 11 * s, y + 4 * s, 8 * s, 20 * s);
    g.fillRect(x + 3 * s, y + 4 * s, 8 * s, 20 * s);
  };
  // Panel 1: feet planted.
  kid(85, 120);
  g.fillStyle = hex(C.tomato);
  g.fillRect(55, 150, 60, 8);
  // Panel 2: hold, shaking.
  kid(256, 120);
  g.strokeStyle = hex(C.bean);
  g.lineWidth = 6;
  for (const d of [-1, 1]) {
    g.beginPath();
    g.moveTo(256 + d * 30, 80);
    g.lineTo(256 + d * 40, 90);
    g.lineTo(256 + d * 30, 100);
    g.lineTo(256 + d * 40, 110);
    g.stroke();
  }
  g.fillStyle = hex(C.ink);
  g.font = `34px ${DISPLAY_FONT}`;
  g.textAlign = 'center';
  g.fillText('HOLD', 256, 172);
  // Panel 3: whoosh up with a cloud.
  kid(426, 80, 0.8);
  g.fillStyle = hex(C.bean);
  for (const [dx, dy, r] of [[0, 150, 22], [-22, 160, 16], [22, 160, 16]]) {
    g.beginPath();
    g.arc(426 + dx, dy, r, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = hex(C.ink);
  g.lineWidth = 5;
  for (const dx of [-16, 0, 16]) {
    g.beginPath();
    g.moveTo(426 + dx, 128);
    g.lineTo(426 + dx, 108);
    g.stroke();
  }
  g.strokeStyle = 'rgba(43,29,58,0.25)';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(170, 20);
  g.lineTo(170, 172);
  g.moveTo(342, 20);
  g.lineTo(342, 172);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function clockTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  g.fillStyle = '#fff7e6';
  g.beginPath();
  g.arc(128, 128, 120, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 12;
  g.strokeStyle = hex(C.brass);
  g.stroke();
  g.fillStyle = hex(C.ink);
  g.font = `28px ${DISPLAY_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    g.fillText(String(i), 128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function bookSpineTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  const R = rng(31);
  const cols = ['#c94f4f', '#4f7fc9', '#6fbf3b', '#d9a03f', '#8a6bd1', '#3fb68b', '#e38fb0', '#6b4a3a'];
  let x = 0;
  while (x < 256) {
    const w = 8 + Math.floor(R() * 10);
    g.fillStyle = cols[Math.floor(R() * cols.length)];
    g.fillRect(x, 4 + R() * 10, w - 1, 64);
    g.fillStyle = 'rgba(255,240,200,0.6)';
    g.fillRect(x + 2, 24, w - 5, 3);
    x += w;
  }
  return tex(c);
}

export function balloonTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 256);
  for (let i = 0; i < 16; i++) {
    g.fillStyle = i % 2 ? '#fff1d6' : hex(C.tomato);
    g.fillRect((i / 16) * 512, 0, 512 / 16 + 1, 256);
  }
  g.fillStyle = hex(C.gold);
  g.fillRect(0, 150, 512, 14);
  g.fillStyle = hex(C.ink);
  g.fillRect(0, 164, 512, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
