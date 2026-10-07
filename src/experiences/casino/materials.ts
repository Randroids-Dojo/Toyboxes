// The Golden Paddle's palette, materials and painted canvas textures:
// carpets, wallpaper, wainscot, planks and the coffered ceiling. Brass is
// real metal on medium and high tiers and matte gold on low.

import * as THREE from 'three';
import type { Tier } from '../../world/space';
import { DISPLAY_FONT } from '../../world/kit';

export const C = {
  teal: '#1d4f55',
  tealDeep: '#0f2e33',
  mahogany: '#6a2c1d',
  mahoganyLit: '#8e4a2e',
  navy: '#1b2147',
  brass: '#e0ac45',
  brassShade: '#a8782c',
  brassMatte: '#d9a838',
  ivory: '#f4e7cc',
  felt: '#1e7a4f',
  lacquer: '#c8303f',
  glassDark: '#1d1830',
  reelFace: '#fffaf0',
  wheelRed: '#b8342c',
  moonWall: '#262a5c',
  moonAccent: '#9fb7e8',
  moonGlass: '#cfe3ff',
  bulb: '#ffcf7a',
  chandelier: '#ffd9a0',
  jackpot: '#ffd24a',
  jackpot2: '#ff5a3c',
  coral: '#d8574a',
  ui: '#13212b',
  earned: '#c27c1a',
  spent: '#2b9cb0',
  hull: '#f2ece0',
  iron: '#2a2a33',
};

/** A canvas texture in sRGB that repeats. */
export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Small deterministic noise for painted textures. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A brass paddle wheel: rim, hub and spokes, drawn at (x, y). */
function paddleWheel(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, lw: number): void {
  g.save();
  g.translate(x, y);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = lw;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(0, 0, r * 0.72, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
    g.lineTo(Math.cos(a) * r * 1.12, Math.sin(a) * r * 1.12);
    g.stroke();
    g.fillRect(Math.cos(a) * r * 1.12 - lw * 1.4, Math.sin(a) * r * 1.12 - lw * 1.4, lw * 2.8, lw * 2.8);
  }
  g.beginPath();
  g.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** The Grand Saloon carpet: midnight navy, brass paddle-wheel medallions, coral pinstripes. One tile is 2 m. */
export function saloonCarpet(scale: number): THREE.CanvasTexture {
  const n = Math.round(512 * scale);
  return canvasTex(n, n, (g, s) => {
    g.fillStyle = C.navy;
    g.fillRect(0, 0, s, s);
    const r = rng(7);
    // Pile: faint speckle so the carpet does not read as flat paint.
    for (let i = 0; i < s * 3; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.06)';
      g.fillRect(r() * s, r() * s, 1.5 * scale + 0.5, 1.5 * scale + 0.5);
    }
    // Diagonal lattice of coral pinstripes.
    g.strokeStyle = 'rgba(216,87,74,0.32)';
    g.lineWidth = 2 * scale;
    for (const o of [0, s]) {
      g.beginPath();
      g.moveTo(o - s / 2, 0);
      g.lineTo(o + s / 2, s);
      g.moveTo(o + s / 2, 0);
      g.lineTo(o - s / 2, s);
      g.stroke();
    }
    g.strokeStyle = 'rgba(201,151,58,0.35)';
    g.lineWidth = 1.2 * scale;
    g.strokeRect(s * 0.04, s * 0.04, s * 0.92, s * 0.92);
    paddleWheel(g, s / 2, s / 2, s * 0.12, 'rgba(201,151,58,0.55)', 3.5 * scale);
    for (const [x, y] of [[0, 0], [s, 0], [0, s], [s, s]]) {
      g.fillStyle = 'rgba(201,151,58,0.45)';
      g.beginPath();
      g.arc(x, y, s * 0.035, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** The Moonlight Lounge carpet: indigo with silver crescents. */
export function loungeCarpet(scale: number): THREE.CanvasTexture {
  const n = Math.round(512 * scale);
  return canvasTex(n, n, (g, s) => {
    g.fillStyle = '#1a1c44';
    g.fillRect(0, 0, s, s);
    const r = rng(11);
    for (let i = 0; i < s * 3; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.07)';
      g.fillRect(r() * s, r() * s, 1.5 * scale + 0.5, 1.5 * scale + 0.5);
    }
    g.strokeStyle = 'rgba(159,183,232,0.25)';
    g.lineWidth = 2 * scale;
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2);
    g.stroke();
    // Crescent moon: a disc with a bite painted back in the carpet colour.
    g.fillStyle = 'rgba(207,227,255,0.6)';
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.1, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1a1c44';
    g.beginPath();
    g.arc(s / 2 + s * 0.045, s / 2 - s * 0.028, s * 0.085, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(207,227,255,0.5)';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.beginPath();
      g.arc(s / 2 + Math.cos(a) * s * 0.42, s / 2 + Math.sin(a) * s * 0.42, s * 0.018, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Deck planks running along the boat. One tile is 2 m by 2 m. */
export function planks(scale: number, base = '#9a6a3f', seed = 3): THREE.CanvasTexture {
  const n = Math.round(512 * scale);
  return canvasTex(n, n, (g, s) => {
    const r = rng(seed);
    const rows = 10;
    const h = s / rows;
    const col = new THREE.Color(base);
    for (let i = 0; i < rows; i++) {
      const c = col.clone().offsetHSL((r() - 0.5) * 0.02, (r() - 0.5) * 0.08, (r() - 0.5) * 0.08);
      g.fillStyle = `#${c.getHexString()}`;
      g.fillRect(0, i * h, s, h);
      // Grain.
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(60,30,10,${0.05 + r() * 0.08})`;
        g.lineWidth = 1;
        const y = i * h + r() * h;
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(s * 0.3, y + (r() - 0.5) * 4, s * 0.6, y + (r() - 0.5) * 4, s, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(30,15,5,0.55)';
      g.fillRect(0, i * h, s, Math.max(1, 2 * scale));
      // Butt joints, staggered.
      const off = (i % 2) * s * 0.5 + r() * s * 0.1;
      g.fillRect(off % s, i * h, Math.max(1, 2 * scale), h);
      g.fillStyle = 'rgba(40,30,20,0.6)';
      for (const x of [(off + 6) % s, (off - 6 + s) % s]) {
        g.beginPath();
        g.arc(x, i * h + h * 0.3, 1.4 * scale, 0, Math.PI * 2);
        g.arc(x, i * h + h * 0.7, 1.4 * scale, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

/** Teal damask wallpaper. One tile is 1 m wide, 1.5 m tall. */
export function wallpaper(scale: number, base = C.teal, ink = 'rgba(244,231,204,0.10)', seed = 5): THREE.CanvasTexture {
  const w = Math.round(256 * scale);
  const h = Math.round(384 * scale);
  return canvasTex(w, h, (g, W, H) => {
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    const r = rng(seed);
    for (let i = 0; i < W * 2; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.05)';
      g.fillRect(r() * W, r() * H, 2, 2);
    }
    // Damask: a lily shape, mirrored, in a diamond grid.
    const lily = (x: number, y: number, s: number) => {
      g.save();
      g.translate(x, y);
      g.fillStyle = ink;
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(0, -s);
        g.bezierCurveTo(sx * s * 0.8, -s * 0.6, sx * s * 0.7, s * 0.2, 0, s * 0.5);
        g.bezierCurveTo(sx * s * 0.25, 0, sx * s * 0.2, -s * 0.5, 0, -s);
        g.fill();
        g.beginPath();
        g.ellipse(sx * s * 0.55, s * 0.55, s * 0.28, s * 0.12, sx * 0.6, 0, Math.PI * 2);
        g.fill();
      }
      g.fillRect(-s * 0.05, s * 0.4, s * 0.1, s * 0.5);
      g.restore();
    };
    lily(W / 2, H / 2, W * 0.22);
    lily(0, 0, W * 0.22);
    lily(W, 0, W * 0.22);
    lily(0, H, W * 0.22);
    lily(W, H, W * 0.22);
    g.strokeStyle = ink;
    g.lineWidth = 1.5 * scale;
    g.setLineDash([3 * scale, 6 * scale]);
    g.beginPath();
    g.moveTo(W / 4, 0);
    g.lineTo(W / 4, H);
    g.moveTo((3 * W) / 4, 0);
    g.lineTo((3 * W) / 4, H);
    g.stroke();
  });
}

/** Raised mahogany panels for the wainscot. One tile is 1 m wide, the full wainscot tall. */
export function wainscot(scale: number, base = C.mahogany): THREE.CanvasTexture {
  const w = Math.round(256 * scale);
  const h = Math.round(256 * scale);
  return canvasTex(w, h, (g, W, H) => {
    const col = new THREE.Color(base);
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    const lit = `#${col.clone().offsetHSL(0, 0, 0.08).getHexString()}`;
    const dark = `#${col.clone().offsetHSL(0, 0, -0.08).getHexString()}`;
    const m = W * 0.1;
    // Bevel: light top-left, dark bottom-right.
    g.fillStyle = lit;
    g.fillRect(m, H * 0.12, W - 2 * m, H * 0.04);
    g.fillRect(m, H * 0.12, W * 0.04, H * 0.76);
    g.fillStyle = dark;
    g.fillRect(m, H * 0.84, W - 2 * m, H * 0.04);
    g.fillRect(W - m - W * 0.04, H * 0.12, W * 0.04, H * 0.76);
    const r = rng(9);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(30,10,5,${0.05 + r() * 0.07})`;
      g.beginPath();
      const x = r() * W;
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 4, H * 0.3, x - 4, H * 0.6, x + 2, H);
      g.stroke();
    }
  });
}

/** Coffered ceiling: ivory grid with teal panes and a brass boss. One tile is 2 m. */
export function coffers(scale: number, pane = '#163f45', grid = '#e8dcc0'): THREE.CanvasTexture {
  const n = Math.round(256 * scale);
  return canvasTex(n, n, (g, s) => {
    g.fillStyle = grid;
    g.fillRect(0, 0, s, s);
    g.fillStyle = pane;
    g.fillRect(s * 0.1, s * 0.1, s * 0.8, s * 0.8);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(s * 0.1, s * 0.1, s * 0.8, s * 0.05);
    g.fillRect(s * 0.1, s * 0.1, s * 0.05, s * 0.8);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(s * 0.15, s * 0.85, s * 0.75, s * 0.05);
    g.strokeStyle = 'rgba(224,172,69,0.55)';
    g.lineWidth = 2 * scale;
    g.strokeRect(s * 0.22, s * 0.22, s * 0.56, s * 0.56);
    g.fillStyle = 'rgba(224,172,69,0.85)';
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.06, 0, Math.PI * 2);
    g.fill();
  });
}

/** The painted hull below the deck line: white with a red stripe and a brass rubbing strake. */
export function hullPaint(scale: number): THREE.CanvasTexture {
  const n = Math.round(128 * scale);
  return canvasTex(8, n * 2, (g, _w, H) => {
    g.fillStyle = C.hull;
    g.fillRect(0, 0, 8, H);
    g.fillStyle = '#b8342c';
    g.fillRect(0, H * 0.08, 8, H * 0.1);
    g.fillStyle = '#d9a838';
    g.fillRect(0, H * 0.2, 8, H * 0.03);
    g.fillStyle = '#2a3b4a';
    g.fillRect(0, H * 0.72, 8, H * 0.28);
  });
}

/** A plaque or sign painted with a title and lines, for the walls. */
export function plaqueTex(title: string, lines: string[], opts: { w?: number; h?: number; bg?: string; fg?: string; accent?: string; titleSize?: number; lineSize?: number } = {}): THREE.CanvasTexture {
  const W = opts.w ?? 1024;
  const H = opts.h ?? 640;
  return canvasTex(
    W,
    H,
    (g) => {
      g.fillStyle = opts.bg ?? C.ui;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = opts.accent ?? C.brass;
      g.lineWidth = 14;
      g.strokeRect(14, 14, W - 28, H - 28);
      g.lineWidth = 3;
      g.strokeRect(36, 36, W - 72, H - 72);
      g.fillStyle = opts.accent ?? C.brass;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `${opts.titleSize ?? 84}px ${DISPLAY_FONT}`;
      g.fillText(title, W / 2, 110);
      g.fillStyle = opts.fg ?? C.ivory;
      const size = opts.lineSize ?? 46;
      g.font = `${size}px ${DISPLAY_FONT}`;
      lines.forEach((l, i) => g.fillText(l, W / 2, 200 + i * size * 1.25));
    },
    false,
  );
}

// ---------------------------------------------------------------------------
// Materials

export interface Mats {
  brass: THREE.MeshStandardMaterial;
  brassDark: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  mahogany: THREE.MeshStandardMaterial;
  ivory: THREE.MeshStandardMaterial;
  lacquer: THREE.MeshStandardMaterial;
  felt: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  /** Vertex-coloured matte trim, so many small parts share one draw call. */
  trim: THREE.MeshStandardMaterial;
  bulb: THREE.MeshStandardMaterial;
  all: THREE.Material[];
}

export function makeMats(): Mats {
  const brass = new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.85, roughness: 0.32 });
  const brassDark = new THREE.MeshStandardMaterial({ color: C.brassShade, metalness: 0.8, roughness: 0.42 });
  const iron = new THREE.MeshStandardMaterial({ color: C.iron, metalness: 0.4, roughness: 0.55 });
  const mahogany = new THREE.MeshStandardMaterial({ color: C.mahogany, roughness: 0.55 });
  const ivory = new THREE.MeshStandardMaterial({ color: C.ivory, roughness: 0.6 });
  const lacquer = new THREE.MeshPhysicalMaterial({ color: C.lacquer, roughness: 0.35, clearcoat: 0, clearcoatRoughness: 0.2 });
  const felt = new THREE.MeshStandardMaterial({ color: C.felt, roughness: 0.95 });
  const glass = new THREE.MeshStandardMaterial({ color: '#9fc3ff', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, emissive: new THREE.Color('#1a2a44'), emissiveIntensity: 0.4 });
  const trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  const bulb = new THREE.MeshStandardMaterial({ color: '#fff6e0', emissive: new THREE.Color(C.bulb), emissiveIntensity: 1.6, roughness: 0.3 });
  return { brass, brassDark, iron, mahogany, ivory, lacquer, felt, glass, trim, bulb, all: [brass, brassDark, iron, mahogany, ivory, lacquer, felt, glass, trim, bulb] };
}

/** Low tier: brass turns to matte gold plastic and lacquer loses its clearcoat. */
export function tierMats(m: Mats, tier: Tier): void {
  const metal = tier !== 'low';
  m.brass.metalness = metal ? 0.85 : 0;
  m.brass.roughness = metal ? 0.32 : 0.42;
  m.brass.color.set(metal ? C.brass : C.brassMatte);
  m.brassDark.metalness = metal ? 0.8 : 0;
  m.brassDark.color.set(metal ? C.brassShade : '#b8862e');
  m.iron.metalness = metal ? 0.4 : 0;
  (m.lacquer as THREE.MeshPhysicalMaterial).clearcoat = tier === 'high' ? 1 : 0;
  for (const x of m.all) x.needsUpdate = true;
}
