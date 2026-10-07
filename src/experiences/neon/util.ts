// Small helpers for Club Nova: the palette, merged static geometry, glow
// materials, canvas textures and a seeded random generator.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BODY_FONT, DISPLAY_FONT, roundRect } from '../../world/kit';

export const C = {
  void: 0x0a0620,
  deck: 0x120b33,
  wall: 0x1b1147,
  panel: 0x2a1a66,
  violet: 0x8668cf,
  lilac: 0xb49cff,
  uv: 0x6b3bff,
  pink: 0xff3dae,
  cyan: 0x2de8ff,
  lime: 0xa8ff3e,
  gold: 0xffc93c,
  orange: 0xff8a3d,
  white: 0xfff4fe,
};

export const HEX = {
  violet: '#8668cf',
  lilac: '#b49cff',
  pink: '#ff3dae',
  cyan: '#2de8ff',
  lime: '#a8ff3e',
  gold: '#ffc93c',
  orange: '#ff8a3d',
  white: '#fff4fe',
};

export { BODY_FONT, DISPLAY_FONT, roundRect };

/** Static meshes merged by material: one draw call per material. */
export class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): void {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    this.addMatrix(geo, mat, m);
  }

  addMatrix(geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4): void {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const list = this.parts.get(mat) ?? [];
    list.push(g);
    this.parts.set(mat, list);
  }

  build(into: THREE.Object3D, opts: { cast?: boolean; receive?: boolean; name?: string } = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, list] of this.parts) {
      const m = new THREE.Mesh(mergeGeometries(list)!, mat);
      m.castShadow = opts.cast ?? false;
      m.receiveShadow = opts.receive ?? true;
      if (opts.name) m.name = opts.name;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      into.add(m);
      out.push(m);
      for (const g of list) g.dispose();
    }
    this.parts.clear();
    return out;
  }
}

const neonCache = new Map<string, THREE.MeshBasicMaterial>();
let neonScale = 1;

/**
 * Without bloom (the low tier) colours above white flatten to white, so neon
 * runs dimmer there to keep its hue.
 */
export function setNeonScale(k: number): void {
  neonScale = k;
  for (const m of neonCache.values()) m.color.copy(m.userData.base as THREE.Color).multiplyScalar(k);
}

/** A neon tube colour: unlit, bright enough to bloom on medium and high. Shared per colour, so batches merge. */
export function neon(color: number, boost = 2.2): THREE.MeshBasicMaterial {
  const key = `${color}:${boost}`;
  let m = neonCache.get(key);
  if (!m || (m as unknown as { disposed?: boolean }).disposed) {
    const base = new THREE.Color(color).multiplyScalar(boost);
    m = new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(neonScale) });
    m.userData.base = base;
    m.addEventListener('dispose', () => neonCache.delete(key));
    neonCache.set(key, m);
  }
  return m;
}

/** A dark plastic with a coloured glow. */
export function glowPlastic(color: number, emissive: number, intensity = 1, rough = 0.45, metal = 0.1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: rough, metalness: metal });
}

export { rng } from '../../shared/neon/rng';

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A soft round glow, white in the middle, for halos and light pools. */
let haloTex: THREE.CanvasTexture | null = null;
export function haloTexture(): THREE.CanvasTexture {
  if (haloTex) return haloTex;
  haloTex = canvasTexture(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });
  return haloTex;
}

/** A soft horizontal bar of light (halo behind a strip). */
let barTex: THREE.CanvasTexture | null = null;
export function barGlowTexture(): THREE.CanvasTexture {
  if (barTex) return barTex;
  barTex = canvasTexture(64, 64, (g) => {
    const r = g.createLinearGradient(0, 0, 0, 64);
    r.addColorStop(0, 'rgba(255,255,255,0)');
    r.addColorStop(0.5, 'rgba(255,255,255,1)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  });
  return barTex;
}

/** Glowing sign text on a transparent canvas, for neon signs. */
export function neonTextTexture(text: string, opts: { w: number; h: number; color: string; size?: number; font?: string; glow?: number; sub?: string; subColor?: string }): THREE.CanvasTexture {
  return canvasTexture(opts.w, opts.h, (g) => {
    const size = opts.size ?? opts.h * 0.5;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${size}px ${opts.font ?? DISPLAY_FONT}`;
    const y = opts.sub ? opts.h * 0.42 : opts.h / 2;
    for (const [blur, alpha] of [
      [opts.glow ?? size * 0.35, 0.9],
      [size * 0.12, 1],
    ] as const) {
      g.shadowColor = opts.color;
      g.shadowBlur = blur;
      g.globalAlpha = alpha;
      g.fillStyle = opts.color;
      g.fillText(text, opts.w / 2, y);
    }
    g.shadowBlur = 0;
    g.globalAlpha = 1;
    g.fillStyle = '#fff8ff';
    g.font = `${size}px ${opts.font ?? DISPLAY_FONT}`;
    g.globalAlpha = 0.75;
    g.fillText(text, opts.w / 2, y);
    g.globalAlpha = 1;
    if (opts.sub) {
      g.font = `600 ${size * 0.34}px ${BODY_FONT}`;
      g.shadowColor = opts.subColor ?? opts.color;
      g.shadowBlur = size * 0.2;
      g.fillStyle = opts.subColor ?? '#ffffff';
      g.fillText(opts.sub, opts.w / 2, opts.h * 0.82);
    }
  });
}

/** Points along a circle in the x,z plane (y up), for outlines. */
export function ring(cx: number, cz: number, r: number, n: number, a0 = 0): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

/** A flat floor mesh from an outline in world x,z (and optional holes), lying at height y. */
export function floorFrom(outline: [number, number][], holes: [number, number][][], y: number, mat: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(shape, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  // World-space UVs, one unit per metre.
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i);
    uv[i * 2 + 1] = p.getZ(i);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

export function smooth(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shader chunk: ACES and sRGB output like the rest of the scene. */
export const OUTPUT_CHUNK = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>`;
