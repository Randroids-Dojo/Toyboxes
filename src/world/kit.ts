// Small building blocks for the toy-like look: matte plastic materials,
// rounded boxes and painted signs.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const mats = new Map<string, THREE.MeshStandardMaterial>();

/** Shared matte plastic material per colour. */
export function plastic(color: string | number, opts: { rough?: number; emissive?: string | number; emissiveIntensity?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.rough ?? 0.62}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? 0}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.62, metalness: 0 });
    if (opts.emissive !== undefined) {
      m.emissive = new THREE.Color(opts.emissive);
      m.emissiveIntensity = opts.emissiveIntensity ?? 1;
    }
    m.userData.keep = true;
    mats.set(key, m);
  }
  return m;
}

const geos = new Map<string, THREE.BufferGeometry>();

export function roundBox(w: number, h: number, d: number, r = 0.08, seg = 2): THREE.BufferGeometry {
  const key = `rb|${w}|${h}|${d}|${r}|${seg}`;
  let g = geos.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2 - 0.001));
    g.userData.keep = true;
    geos.set(key, g);
  }
  return g;
}

export function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geos.get(key) as T | undefined;
  if (!g) {
    g = make();
    g.userData.keep = true;
    geos.set(key, g);
  }
  return g;
}

/** Marks a module-level resource so disposeTree leaves it alone. */
export function keep<T extends { userData: Record<string, unknown> }>(r: T): T {
  r.userData.keep = true;
  return r;
}

/** Frees per-instance geometry, materials and textures under an object. */
export function disposeTree(root: THREE.Object3D): void {
  const seen = new Set<unknown>();
  const free = (r: { dispose(): void; userData: Record<string, unknown> } | null | undefined) => {
    if (!r || seen.has(r) || r.userData.keep) return;
    seen.add(r);
    r.dispose();
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Points).isPoints) return;
    free(m.geometry);
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const sm = mat as THREE.MeshStandardMaterial;
      free(sm.map);
      free(sm.emissiveMap);
      free(sm);
    }
  });
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, opts: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}

export const DISPLAY_FONT = '"Lilita One", "Arial Rounded MT Bold", system-ui, sans-serif';
export const BODY_FONT = '"Atkinson Hyperlegible Next Variable", "Atkinson Hyperlegible Next", system-ui, sans-serif';

export interface SignStyle {
  bg: string;
  fg: string;
  border?: string;
  font?: string;
  /** Extra lines under the title, smaller. */
  sub?: string;
  subColor?: string;
  glow?: string;
  radius?: number;
}

/** Paints text onto a canvas texture sized for a sign of w x h metres. */
export function signTexture(text: string, w: number, h: number, style: SignStyle): THREE.CanvasTexture {
  const ppm = 128;
  const cw = Math.max(64, Math.round(w * ppm));
  const ch = Math.max(32, Math.round(h * ppm));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d')!;
  const rad = (style.radius ?? 0.18) * ppm;
  g.fillStyle = style.bg;
  roundRect(g, 0, 0, cw, ch, rad);
  g.fill();
  if (style.border) {
    g.lineWidth = Math.max(6, ch * 0.06);
    g.strokeStyle = style.border;
    roundRect(g, g.lineWidth / 2, g.lineWidth / 2, cw - g.lineWidth, ch - g.lineWidth, rad);
    g.stroke();
  }
  const font = style.font ?? DISPLAY_FONT;
  const hasSub = !!style.sub;
  let size = ch * (hasSub ? 0.46 : 0.62);
  g.font = `${size}px ${font}`;
  while (g.measureText(text).width > cw * 0.86 && size > 8) {
    size *= 0.92;
    g.font = `${size}px ${font}`;
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (style.glow) {
    g.shadowColor = style.glow;
    g.shadowBlur = size * 0.35;
  }
  g.fillStyle = style.fg;
  g.fillText(text, cw / 2, hasSub ? ch * 0.4 : ch * 0.53);
  if (hasSub) {
    g.shadowBlur = 0;
    let s2 = ch * 0.2;
    g.font = `${s2}px ${BODY_FONT}`;
    while (g.measureText(style.sub!).width > cw * 0.9 && s2 > 6) {
      s2 *= 0.92;
      g.font = `${s2}px ${BODY_FONT}`;
    }
    g.fillStyle = style.subColor ?? style.fg;
    g.fillText(style.sub!, cw / 2, ch * 0.76);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

/** A flat sign: a plane with its own texture, slightly proud of whatever it is mounted on. */
export function sign(text: string, w: number, h: number, style: SignStyle, emissive = 0): THREE.Mesh {
  const tex = signTexture(text, w, h, style);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, transparent: true });
  if (emissive > 0) {
    mat.emissive = new THREE.Color('#ffffff');
    mat.emissiveMap = tex;
    mat.emissiveIntensity = emissive;
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

/** A soft radial pool used for lamp light on the ground at night. */
let poolTex: THREE.CanvasTexture | null = null;
export function lightPoolTexture(): THREE.CanvasTexture {
  if (poolTex) return poolTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,214,150,0.85)');
  grad.addColorStop(0.45, 'rgba(255,196,120,0.35)');
  grad.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  poolTex = keep(new THREE.CanvasTexture(c));
  poolTex.colorSpace = THREE.SRGBColorSpace;
  return poolTex;
}

/** A blob shadow for small moving things when real shadows are off. */
let blobTex: THREE.CanvasTexture | null = null;
export function blobTexture(): THREE.CanvasTexture {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(20,16,40,0.45)');
  grad.addColorStop(1, 'rgba(20,16,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  blobTex = keep(new THREE.CanvasTexture(c));
  return blobTex;
}

export function blob(size: number): THREE.Mesh {
  const m = new THREE.Mesh(
    cached(`blob`, () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }),
  );
  m.scale.set(size, 1, size);
  m.position.y = 0.02;
  m.renderOrder = 1;
  return m;
}
