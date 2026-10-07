// Comet Yard's cover, drawn: edge-lit blocks, chrome mirrors with hex light
// edges, the Core pillar and its beam, the power-up pads and the scoreboards
// over each base. Changing layout sinks the cover into the floor and raises
// it in its new spots over one bar.

import * as THREE from 'three';
import { box, circle, type Collider } from '../../world/physics';
import { ARENA, BASES, LAYOUTS, POWER_PADS, type LayoutId, type Piece } from '../../shared/neon/arena';
import type { Tier } from '../../world/space';
import { C, canvasTexture, DISPLAY_FONT, OUTPUT_CHUNK } from './util';

const EDGE_VERT = /* glsl */ `
varying vec3 vL;
varying vec3 vN;
varying vec3 vW;
void main() {
  vL = position;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const EDGE_FRAG = /* glsl */ `
uniform vec3 uHalf, uBase, uEdge, uEdge2;
uniform float uBeat, uRise, uMirror;
varying vec3 vL;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec3 d = uHalf - abs(vL);
  float m1 = min(d.x, min(d.y, d.z));
  float m3 = max(d.x, max(d.y, d.z));
  float m2 = d.x + d.y + d.z - m1 - m3;
  float edge = smoothstep(0.05, 0.0, m2);
  float halo = smoothstep(0.22, 0.0, m2) * 0.35;
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vW);
  float lit = 0.35 + 0.65 * max(0.0, dot(n, normalize(vec3(0.3, 1.0, 0.4))));
  vec3 base = uBase * lit;
  if (uMirror > 0.5) {
    // Chrome: a bright sky-tinted sheen that moves with the view.
    vec3 r = reflect(-v, n);
    float sky = smoothstep(-0.2, 0.9, r.y);
    float band = pow(abs(sin(r.x * 6.0 + r.z * 4.0)), 18.0);
    base = mix(vec3(0.16, 0.12, 0.32), vec3(0.85, 0.8, 1.0), sky * 0.55) + band * 0.5;
    // Hex cells.
    vec2 q = abs(n.y) > 0.5 ? vL.xz : (abs(n.x) > 0.5 ? vL.zy : vL.xy);
    q *= 4.0;
    vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(q, s) - s * 0.5;
    vec2 b = mod(q - s * 0.5, s) - s * 0.5;
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    float hx = smoothstep(0.44, 0.5, max(dot(abs(g), s * 0.5), abs(g.x)));
    base += uEdge * hx * 0.25;
  }
  float ph = fract(uBeat);
  float pulse = 0.75 + 0.25 * exp(-ph * 4.0);
  vec3 ec = mix(uEdge, uEdge2, smoothstep(-38.0, -32.0, vW.z));
  vec3 col = base + ec * (edge * 1.8 + halo) * pulse;
  // Rising cover glows along its top while it moves.
  col += ec * uRise * smoothstep(0.3, 0.0, d.y) * 1.5;
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT_CHUNK}
}`;

interface Kind {
  key: string;
  w: number;
  h: number;
  d: number;
  mirror: boolean;
}

const KINDS: Record<string, Kind> = {
  box: { key: 'box', w: 1.2, h: 1.5, d: 1.2, mirror: false },
  boxL: { key: 'boxL', w: 1.4, h: 1.5, d: 1.4, mirror: false },
  screen: { key: 'screen', w: 4, h: 1.6, d: 0.4, mirror: false },
  lane: { key: 'lane', w: 0.4, h: 1.6, d: 3, mirror: false },
  laneS: { key: 'laneS', w: 0.4, h: 1.6, d: 2.4, mirror: false },
  mirror: { key: 'mirror', w: 2.6, h: 2.2, d: 0.3, mirror: true },
};

function kindOf(p: Piece): Kind | null {
  if (p.kind === 'pillar') return null;
  if (p.kind === 'mirror') return KINDS.mirror;
  if (p.kind === 'screen') return KINDS.screen;
  if (p.kind === 'lane') return p.hd > 1.3 ? KINDS.lane : KINDS.laneS;
  return p.hw > 0.65 ? KINDS.boxL : KINDS.box;
}

export class ArenaView {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.InstancedMesh>();
  private mats: THREE.ShaderMaterial[] = [];
  private pillarBeam: THREE.Mesh;
  private pillarMat: THREE.ShaderMaterial;
  private pads: { beam: THREE.Mesh; icon: THREE.Sprite; power: string | null }[] = [];
  private boards: { mesh: THREE.Mesh; key: string }[] = [];
  layout: LayoutId = 'prism';
  private next: LayoutId | null = null;
  private morph = 1;
  private colliders: Collider[] = [];
  private dummy = new THREE.Object3D();

  constructor(
    scene: THREE.Scene,
    /** The world's collider list, changed in place when the layout changes. */
    private worldColliders: Collider[],
  ) {
    scene.add(this.group);
    for (const k of Object.values(KINDS)) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: EDGE_VERT,
        fragmentShader: EDGE_FRAG,
        uniforms: {
          uHalf: { value: new THREE.Vector3(k.w / 2, k.h / 2, k.d / 2) },
          uBase: { value: new THREE.Color(0x1d1250) },
          uEdge: { value: new THREE.Color(k.mirror ? C.lilac : C.cyan) },
          uEdge2: { value: new THREE.Color(k.mirror ? C.lilac : C.pink) },
          uBeat: { value: 0 },
          uRise: { value: 0 },
          uMirror: { value: k.mirror ? 1 : 0 },
        },
      });
      this.mats.push(mat);
      // Centred, as the edge shader measures from the middle.
      const geo = new THREE.BoxGeometry(k.w, k.h, k.d);
      const im = new THREE.InstancedMesh(geo, mat, 12);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = false;
      this.meshes.set(k.key, im);
      this.group.add(im);
    }
    // The Core pillar: a glossy column with a light beam up into the sky.
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.45, 4, 32), new THREE.MeshStandardMaterial({ color: 0x1d1250, roughness: 0.3, metalness: 0.4 }));
    pillar.position.set(ARENA.cx, 2, ARENA.cz);
    const ringGeo = new THREE.TorusGeometry(1.33, 0.05, 6, 48);
    const ring1 = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(C.cyan).multiplyScalar(2) }));
    ring1.rotation.x = Math.PI / 2;
    ring1.position.set(ARENA.cx, 1.2, ARENA.cz);
    const ring2 = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(C.pink).multiplyScalar(2) }));
    ring2.rotation.x = Math.PI / 2;
    ring2.position.set(ARENA.cx, 2.8, ARENA.cz);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.3, 0.12, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.lilac).multiplyScalar(1.8) }));
    cap.position.set(ARENA.cx, 4.06, ARENA.cz);
    this.pillarMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uBeat: { value: 0 }, uColor: { value: new THREE.Color(C.lilac) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uBeat; uniform vec3 uColor; varying vec2 vUv; void main(){ float ph = fract(uBeat); float a = (1.0 - vUv.y) * (0.25 + 0.2 * exp(-ph * 4.0)) * (0.6 + 0.4 * sin(vUv.y * 40.0 - uBeat * 6.0)); gl_FragColor = vec4(uColor * a, 1.0); }`,
    });
    this.pillarBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 10, 24, 1, true), this.pillarMat);
    this.pillarBeam.position.set(ARENA.cx, 9.1, ARENA.cz);
    this.group.add(pillar, ring1, ring2, cap, this.pillarBeam);
    // Power-up pads: a beam from above while a power-up waits.
    for (const p of POWER_PADS) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 6, 20, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.gold).multiplyScalar(0.7), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.set(p.x, 3, p.z);
      beam.visible = false;
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: powerIcon('shield'), transparent: true, depthWrite: false }));
      icon.scale.set(0.9, 0.9, 1);
      icon.position.set(p.x, 1.3, p.z);
      icon.visible = false;
      this.group.add(beam, icon);
      this.pads.push({ beam, icon, power: null });
    }
    // Scoreboards over each base, facing into the arena.
    for (const [team, z, rot] of [
      ['cyan', BASES.cyan.z + 2.2, Math.PI],
      ['magenta', BASES.magenta.z - 2.2, 0],
    ] as const) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      m.position.set(0, 3.6, z);
      m.rotation.y = rot;
      this.group.add(m);
      this.boards.push({ mesh: m, key: team });
    }
    this.paintBoards(0, 0, '2:00');
    this.place(this.layout, 1);
    this.setColliders(LAYOUTS[this.layout]);
  }

  private place(id: LayoutId, rise: number): void {
    const counts = new Map<string, number>();
    for (const p of LAYOUTS[id]) {
      const k = kindOf(p);
      if (!k) continue;
      const im = this.meshes.get(k.key)!;
      const i = counts.get(k.key) ?? 0;
      counts.set(k.key, i + 1);
      // Sunk pieces hide below the floor (no z-fighting while they move).
      this.dummy.position.set(p.x, rise >= 1 ? k.h / 2 : -k.h / 2 - 0.02 + (k.h + 0.02) * rise, p.z);
      this.dummy.rotation.set(0, p.rot, 0);
      this.dummy.updateMatrix();
      im.setMatrixAt(i, this.dummy.matrix);
    }
    for (const [key, im] of this.meshes) {
      im.count = counts.get(key) ?? 0;
      im.instanceMatrix.needsUpdate = true;
    }
  }

  private setColliders(pieces: Piece[]): void {
    for (const c of this.colliders) {
      const i = this.worldColliders.indexOf(c);
      if (i >= 0) this.worldColliders.splice(i, 1);
    }
    this.colliders = pieces.map((p) => (p.kind === 'pillar' ? circle(p.x, p.z, p.hw, p.h, 0.5, true) : box(p.x, p.z, p.hw, p.hd, p.rot, p.h, 0.5, false)));
    this.worldColliders.push(...this.colliders);
  }

  /** Sinks the cover and raises the new layout over `seconds`. */
  morphTo(id: LayoutId, seconds = 1.9): void {
    if (id === this.layout && !this.next) return;
    this.next = id;
    this.morph = 0;
    this.morphSeconds = seconds;
  }

  private morphSeconds = 1.9;

  /** Sets a layout at once. */
  setLayout(id: LayoutId): void {
    this.layout = id;
    this.next = null;
    this.morph = 1;
    this.place(id, 1);
    this.setColliders(LAYOUTS[id]);
  }

  get moving(): boolean {
    return this.next !== null;
  }

  showPower(pad: number, power: string | null): void {
    const p = this.pads[pad];
    p.power = power;
    p.beam.visible = !!power;
    p.icon.visible = !!power;
    if (power) {
      const m = p.icon.material as THREE.SpriteMaterial;
      m.map?.dispose();
      m.map = powerIcon(power);
      m.needsUpdate = true;
    }
  }

  paintBoards(cyan: number, magenta: number, time: string): void {
    for (const b of this.boards) {
      const tex = canvasTexture(500, 140, (g) => {
        g.fillStyle = 'rgba(14,8,40,0.92)';
        g.fillRect(0, 0, 500, 140);
        g.lineWidth = 6;
        g.strokeStyle = b.key === 'cyan' ? '#2de8ff' : '#ff3dae';
        g.strokeRect(3, 3, 494, 134);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `84px ${DISPLAY_FONT}`;
        g.fillStyle = '#2de8ff';
        g.fillText(String(cyan), 90, 72);
        g.fillStyle = '#ff3dae';
        g.fillText(String(magenta), 410, 72);
        g.fillStyle = '#fff4fe';
        g.font = `60px ${DISPLAY_FONT}`;
        g.fillText(time, 250, 74);
      });
      const m = b.mesh.material as THREE.MeshBasicMaterial;
      m.map?.dispose();
      m.map = tex;
      m.needsUpdate = true;
    }
  }

  setQuality(t: Tier): void {
    this.pillarBeam.visible = t !== 'low';
  }

  update(dt: number, beat: number, time: number): void {
    for (const m of this.mats) m.uniforms.uBeat.value = beat;
    this.pillarMat.uniforms.uBeat.value = beat;
    if (this.next) {
      this.morph += dt / this.morphSeconds;
      const half = this.morph < 0.5;
      const k = half ? 1 - this.morph * 2 : (this.morph - 0.5) * 2;
      if (!half && this.layout !== this.next) {
        this.layout = this.next;
        this.setColliders(LAYOUTS[this.layout]);
      }
      this.place(this.layout, Math.max(0, Math.min(1, k)));
      for (const m of this.mats) m.uniforms.uRise.value = 1;
      if (this.morph >= 1) {
        this.next = null;
        this.place(this.layout, 1);
        for (const m of this.mats) m.uniforms.uRise.value = 0;
      }
    }
    for (const p of this.pads) {
      if (!p.power) continue;
      p.icon.position.y = 1.3 + Math.sin(time * 2.5) * 0.12;
      p.beam.rotation.y = time;
    }
  }

  dispose(): void {
    for (const c of this.colliders) {
      const i = this.worldColliders.indexOf(c);
      if (i >= 0) this.worldColliders.splice(i, 1);
    }
  }
}

function powerIcon(power: string): THREE.CanvasTexture {
  const color = power === 'shield' ? '#2de8ff' : power === 'overdrive' ? '#ffc93c' : '#b49cff';
  return canvasTexture(128, 128, (g) => {
    g.translate(64, 64);
    g.shadowColor = color;
    g.shadowBlur = 16;
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = 9;
    g.lineJoin = 'round';
    g.beginPath();
    g.arc(0, 0, 48, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    if (power === 'shield') {
      g.moveTo(0, -28);
      g.lineTo(24, -16);
      g.lineTo(20, 12);
      g.lineTo(0, 30);
      g.lineTo(-20, 12);
      g.lineTo(-24, -16);
      g.closePath();
      g.stroke();
    } else if (power === 'overdrive') {
      g.moveTo(6, -32);
      g.lineTo(-16, 4);
      g.lineTo(2, 4);
      g.lineTo(-6, 32);
      g.lineTo(18, -6);
      g.lineTo(0, -6);
      g.closePath();
      g.fill();
    } else {
      for (const r of [12, 24]) {
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.stroke();
      }
    }
  });
}
