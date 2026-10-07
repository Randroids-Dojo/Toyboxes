// Small building blocks for the galaxy's islands: glowing labels, pad
// decals, light beams, crystal undersides, billboards and bounce blossoms.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BODY_FONT, DISPLAY_FONT, roundRect } from '../../world/kit';
import * as S from './shaders';

export type Uniforms = { uTime: { value: number }; uFlare: { value: number } };

/** Text that glows, on a plane (additive, so it never hides what is behind). */
export function glowText(text: string, color: string, w = 6, hgt = 1.1): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = Math.round(w * 128);
  c.height = Math.round(hgt * 128);
  const g = c.getContext('2d')!;
  g.font = `${c.height * 0.55}px ${DISPLAY_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = c.height * 0.25;
  g.fillStyle = '#ffffff';
  g.fillText(text, c.width / 2, c.height / 2);
  g.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.renderOrder = 5;
  return m;
}

/** A sign that always faces the camera: a name and an optional lock line. */
export class Sign {
  readonly sprite: THREE.Sprite;
  private canvas = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private key = '';

  constructor(
    private color: string,
    width = 4,
  ) {
    this.canvas.width = 512;
    this.canvas.height = 192;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.sprite.scale.set(width, width * 0.375, 1);
    this.sprite.renderOrder = 6;
  }

  set(title: string, sub: string | null, locked: boolean): void {
    const key = `${title}|${sub}|${locked}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, 512, 192);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `76px ${DISPLAY_FONT}`;
    g.lineWidth = 12;
    g.strokeStyle = 'rgba(12,8,30,0.85)';
    g.strokeText(title, 256, sub ? 64 : 96);
    g.fillStyle = locked ? '#b9b3cc' : this.color;
    g.fillText(title, 256, sub ? 64 : 96);
    if (sub) {
      g.font = `600 52px ${BODY_FONT}`;
      g.strokeText(sub, 256, 146);
      g.fillStyle = locked ? '#f4b740' : '#fffaf0';
      g.fillText(sub, 256, 146);
    }
    this.tex.needsUpdate = true;
  }
}

/** A decal for the top of an island (pads, landing rings). Sits above the top with polygon offset. */
export function padDecal(radius: number, color: string, uniforms: Uniforms, star = true): { mesh: THREE.Mesh; u: { uOn: { value: number }; uCharge: { value: number }; uColor: { value: THREE.Color } } } {
  const u = { uColor: { value: new THREE.Color(color) }, uOn: { value: 1 }, uCharge: { value: 0 }, uStar: { value: star ? 1 : 0 } };
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 48).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ vertexShader: S.QUAD_VERT, fragmentShader: S.PAD_FRAG, uniforms: { ...uniforms, ...u }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
  );
  mesh.renderOrder = 4;
  return { mesh, u };
}

/** A soft beam of light straight up. */
export function beam(color: string, height: number, radius: number, uniforms: Uniforms, alpha = 0.6): { mesh: THREE.Mesh; u: { uAlpha: { value: number }; uColor: { value: THREE.Color } } } {
  const u = { uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha } };
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.7, radius, height, 24, 1, true).translate(0, height / 2, 0),
    new THREE.ShaderMaterial({ vertexShader: S.BEAM_VERT, fragmentShader: S.BEAM_FRAG, uniforms: { ...uniforms, ...u }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  mesh.renderOrder = 4;
  return { mesh, u };
}

/** A soft glow sprite (one material per colour). */
export function glowSprite(color: string, size: number, alpha = 1): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({ vertexShader: S.QUAD_VERT, fragmentShader: S.GLOW_FRAG, uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  m.scale.setScalar(size);
  m.renderOrder = 7;
  return m;
}

function hashNoise(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Glowing veins for the standard material: vertex colours drive the
 * emissive glow, not the diffuse colour.
 */
export function veinMaterial(color: string, glow: string, opts: { roughness?: number; metalness?: number } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.55, metalness: opts.metalness ?? 0.15, flatShading: true, vertexColors: true, emissive: new THREE.Color(glow) });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif');
  };
  m.customProgramCacheKey = () => 'galaxy-veins';
  return m;
}

/**
 * The underside of a floating island: a cluster of hanging crystal or rock
 * spikes, flat shaded, glowing toward their tips. One mesh.
 */
export function underside(radius: number, depth: number, seed: number, mat: THREE.Material, opts: { count?: number; top?: number; ring?: [number, number] } = {}): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const n = opts.count ?? Math.round(8 + radius * 1.6);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const top = opts.top ?? -0.05;
  // A central root, then spikes around it.
  for (let i = 0; i < n; i++) {
    const central = i === 0;
    const a = rnd() * Math.PI * 2;
    const ringIn = opts.ring?.[0] ?? 0;
    const ringOut = opts.ring?.[1] ?? radius * 0.78;
    const r = central && !opts.ring ? 0 : ringIn + Math.sqrt(rnd()) * (ringOut - ringIn);
    const fall = 1 - r / Math.max(ringOut, 0.01);
    const len = central && !opts.ring ? depth : depth * (0.25 + 0.6 * fall) * (0.6 + rnd() * 0.5);
    const w = central && !opts.ring ? radius * 0.55 : radius * (0.12 + rnd() * 0.16) * (0.6 + fall);
    const g = new THREE.ConeGeometry(w, len, 6 + (i % 2), 3);
    g.rotateX(Math.PI);
    g.translate(Math.cos(a) * r, top - len / 2, Math.sin(a) * r);
    // Rough it up and colour the glow toward the tip.
    const p = g.getAttribute('position');
    const colors = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k);
      const y = p.getY(k);
      const z = p.getZ(k);
      const along = Math.min(1, Math.max(0, (top - y) / len));
      const j = (hashNoise(Math.round(x * 3), Math.round(y * 3), Math.round(z * 3) + seed) - 0.5) * w * 0.5 * (1 - along * 0.5);
      if (y < top - 0.01) p.setXYZ(k, x + j, y + j * 0.6, z - j);
      const gl = Math.pow(along, 3) * 0.75 + 0.02;
      colors[k * 3] = colors[k * 3 + 1] = colors[k * 3 + 2] = gl;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(g.toNonIndexed());
  }
  const merged = mergeGeometries(parts)!;
  merged.computeVertexNormals();
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(merged, mat);
  return mesh;
}

/** A canvas panel for an island's start pad: title, stars, your best, the board. */
export class Billboard {
  readonly mesh: THREE.Mesh;
  private canvas = document.createElement('canvas');
  private tex: THREE.CanvasTexture;

  constructor(
    private accent: string,
    w = 4.4,
  ) {
    this.canvas.width = 704;
    this.canvas.height = 512;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * 512) / 704), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.renderOrder = 6;
  }

  paint(o: { title: string; stars: number; best: string | null; hint: string; rows: { name: string; value: string; you: boolean }[] }): void {
    const g = this.canvas.getContext('2d')!;
    const W = 704;
    const H = 512;
    g.clearRect(0, 0, W, H);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(36,26,70,0.94)');
    grad.addColorStop(1, 'rgba(14,10,34,0.94)');
    g.fillStyle = grad;
    roundRect(g, 0, 0, W, H, 34);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = this.accent;
    roundRect(g, 4, 4, W - 8, H - 8, 30);
    g.stroke();
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.font = `60px ${DISPLAY_FONT}`;
    g.fillStyle = this.accent;
    g.fillText(o.title, 36, 62);
    // Stars on the right.
    g.textAlign = 'right';
    g.font = `56px ${DISPLAY_FONT}`;
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i < o.stars ? '#f4b740' : 'rgba(255,255,255,0.18)';
      g.fillText('★', W - 36 - (2 - i) * 58, 62);
    }
    g.textAlign = 'left';
    g.font = `600 30px ${BODY_FONT}`;
    g.fillStyle = '#c9c2e6';
    g.fillText(o.best ? `Your best ${o.best}` : o.hint, 36, 122);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(36, 150, W - 72, 3);
    g.font = `600 26px ${BODY_FONT}`;
    g.fillStyle = '#8f87b0';
    g.fillText('Best runs here', 36, 182);
    const rows = o.rows.slice(0, 6);
    if (!rows.length) {
      g.fillStyle = '#c9c2dc';
      g.font = `600 30px ${BODY_FONT}`;
      g.fillText('No runs yet. Be the first!', 36, 240);
    }
    rows.forEach((r, i) => {
      const y = 228 + i * 44;
      g.font = `600 30px ${BODY_FONT}`;
      g.fillStyle = r.you ? '#f4b740' : '#fffaf0';
      g.textAlign = 'left';
      g.fillText(`${i + 1}. ${r.name}`.slice(0, 26), 36, y);
      g.textAlign = 'right';
      g.fillText(r.value, W - 36, y);
    });
    this.tex.needsUpdate = true;
  }
}

/**
 * Bounce blossoms: flowers lying on island tops that fling you over a gap.
 * One draw call for every petal and one for the centres.
 */
export class Blossoms {
  private petals: THREE.InstancedMesh;
  private hearts: THREE.InstancedMesh;
  private list: { x: number; y: number; z: number; yaw: number; t: number; visible: boolean; scale: number }[] = [];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();

  constructor(parent: THREE.Object3D, max = 32) {
    const petal = new THREE.SphereGeometry(1, 12, 8);
    const pm = new THREE.MeshStandardMaterial({ color: '#ff9ad5', emissive: new THREE.Color('#c24a9a'), emissiveIntensity: 0.55, roughness: 0.4 });
    this.petals = new THREE.InstancedMesh(petal, pm, max * 7);
    this.petals.count = 0;
    this.petals.frustumCulled = false;
    const heart = new THREE.CylinderGeometry(0.32, 0.38, 0.18, 16);
    this.hearts = new THREE.InstancedMesh(heart, new THREE.MeshStandardMaterial({ color: '#f4b740', emissive: new THREE.Color('#f4b740'), emissiveIntensity: 0.8, roughness: 0.3 }), max);
    this.hearts.count = 0;
    this.hearts.frustumCulled = false;
    parent.add(this.petals, this.hearts);
  }

  /** Adds a blossom at a top, pointing along `yaw` (0 faces +z). Returns its id. */
  add(x: number, y: number, z: number, yaw: number, visible = true): number {
    this.list.push({ x, y, z, yaw, t: 9, visible, scale: visible ? 1 : 0 });
    return this.list.length - 1;
  }

  show(id: number, on: boolean): void {
    this.list[id].visible = on;
  }

  /** The press-and-fling animation. */
  trigger(id: number): void {
    this.list[id].t = 0;
  }

  get(id: number): { x: number; y: number; z: number; yaw: number; visible: boolean } {
    return this.list[id];
  }

  update(dt: number, time: number): void {
    let pi = 0;
    const colors = [new THREE.Color('#ff9ad5'), new THREE.Color('#b9a4ff')];
    const gold = new THREE.Color('#ffd27a');
    this.list.forEach((b, i) => {
      b.t += dt;
      const want = b.visible ? 1 : 0;
      b.scale += (want - b.scale) * Math.min(1, dt * 4);
      if (b.scale < 0.01 && !b.visible) {
        this.m4.makeScale(0, 0, 0);
        this.hearts.setMatrixAt(i, this.m4);
        return;
      }
      // Squash then spring open.
      const t = b.t;
      const squash = t < 0.12 ? 1 - (t / 0.12) * 0.6 : t < 0.7 ? 0.4 + Math.sin(((t - 0.12) / 0.58) * Math.PI) * 1.1 + ((t - 0.12) / 0.58) * 0.6 : 1;
      const open = t < 0.12 ? 0.2 : t < 0.7 ? 0.2 + Math.sin(((t - 0.12) / 0.58) * Math.PI) * 0.9 : 0.2;
      const breathe = 1 + Math.sin(time * 2 + i) * 0.04;
      for (let k = 0; k < 7; k++) {
        const a = b.yaw + (k / 7) * Math.PI * 2;
        const lift = open + (k === 0 ? 0.15 : 0);
        this.e.set(-lift, a, 0, 'YXZ');
        this.q.setFromEuler(this.e);
        const r = 0.5 * b.scale;
        this.v.set(b.x + Math.sin(a) * r, b.y + 0.12 * squash * b.scale, b.z + Math.cos(a) * r);
        this.sc.set(0.26 * b.scale * breathe, 0.07 * b.scale * squash, 0.5 * b.scale * breathe);
        this.m4.compose(this.v, this.q, this.sc);
        this.petals.setMatrixAt(pi, this.m4);
        this.petals.setColorAt(pi, k === 0 ? gold : colors[k % 2]);
        pi++;
      }
      this.q.identity();
      this.v.set(b.x, b.y + 0.09 * squash * b.scale, b.z);
      this.sc.set(b.scale, b.scale * squash, b.scale);
      this.m4.compose(this.v, this.q, this.sc);
      this.hearts.setMatrixAt(i, this.m4);
    });
    this.petals.count = pi;
    this.hearts.count = this.list.length;
    this.petals.instanceMatrix.needsUpdate = true;
    if (this.petals.instanceColor) this.petals.instanceColor.needsUpdate = true;
    this.hearts.instanceMatrix.needsUpdate = true;
  }
}
