// Robots for Club Nova: laser tag bots, the Prism Five duelists, the judges,
// Orbit the DJ and the bar staff. Chunky hovering toys built from rounded
// parts, with glowing trims painted per vertex (one shared material program,
// so each robot is a handful of draw calls) and an LED face screen.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { roundBox } from '../../world/kit';
import { C, canvasTexture } from './util';

export type HeadKind = 'dome' | 'wedge' | 'gear' | 'star' | 'box' | 'slim' | 'crest' | 'metronome' | 'phones' | 'disco' | 'vinyl' | 'bean';
export type Face = 'happy' | 'focused' | 'surprised' | 'dizzy' | 'cheer' | 'bow' | 'off';
const FACES: Face[] = ['happy', 'focused', 'surprised', 'dizzy', 'cheer', 'bow', 'off'];

export interface RobotLook {
  head: HeadKind;
  /** Body plastic. */
  body: number;
  /** Glowing trims, face and badge. */
  trim: number;
  /** Badge on the chest: circle for cyan, triangle for magenta. */
  badge?: 'circle' | 'triangle' | 'star' | null;
  /** Overall scale (1 is player height). */
  scale?: number;
  /** Wider shoulders (captain Volt, Brick). */
  broad?: number;
  /** Second glow colour (duelist ribbons, Twinkle's tips). */
  trim2?: number;
}

// ---------------------------------------------------------------------------
// Shared material: vertex colours, and a per-vertex glow mask lit by uGlow.

const materials = new Set<THREE.MeshStandardMaterial>();

function robotMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.15 });
  const glow = { value: 1 };
  m.userData.glow = glow;
  m.onBeforeCompile = (s) => {
    s.uniforms.uGlow = glow;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlow * 1.7;\ndiffuseColor.rgb *= 1.0 - min(vGlow, 1.0) * 0.6;');
  };
  m.customProgramCacheKey = () => 'nova-robot';
  materials.add(m);
  return m;
}

/** Paints a geometry one colour with a glow amount (0 plain plastic, 1 or more lit). */
function paint(g: THREE.BufferGeometry, color: number, glow = 0): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal'].includes(k)) geo.deleteAttribute(k);
  const n = geo.attributes.position.count;
  const c = new THREE.Color(color);
  const col = new Float32Array(n * 3);
  const gl = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    gl[i] = glow;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
  return geo;
}

function at(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s: number | [number, number, number] = 1): THREE.BufferGeometry {
  const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  return g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), sc));
}

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list)!;
  for (const x of list) x.dispose();
  g.computeBoundingSphere();
  return g;
}

function capsule(r: number, len: number, seg = 10): THREE.BufferGeometry {
  return new THREE.CapsuleGeometry(r, len, 4, seg);
}

function starShape(points: number, outer: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i <= points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}

// ---------------------------------------------------------------------------
// The LED face atlas: one row of expressions.

let faceAtlas: THREE.CanvasTexture | null = null;

function atlas(): THREE.CanvasTexture {
  if (faceAtlas) return faceAtlas;
  const T = 128;
  faceAtlas = canvasTexture(T * FACES.length, T, (g) => {
    g.fillStyle = '#05030c';
    g.fillRect(0, 0, T * FACES.length, T);
    g.strokeStyle = '#ffffff';
    g.fillStyle = '#ffffff';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    FACES.forEach((f, i) => {
      const ox = i * T;
      const L = ox + 40;
      const R = ox + 88;
      const ey = 52;
      g.lineWidth = 11;
      g.shadowColor = '#ffffff';
      g.shadowBlur = 10;
      const arcEye = (x: number, up: boolean) => {
        g.beginPath();
        g.arc(x, ey + (up ? 8 : -8), 13, up ? Math.PI * 1.15 : Math.PI * 0.15, up ? Math.PI * 1.85 : Math.PI * 0.85);
        g.stroke();
      };
      switch (f) {
        case 'happy':
          arcEye(L, true);
          arcEye(R, true);
          g.beginPath();
          g.arc(ox + 64, 78, 18, 0.2, Math.PI - 0.2);
          g.stroke();
          break;
        case 'focused':
          g.beginPath();
          g.moveTo(L - 14, ey - 4);
          g.lineTo(L + 12, ey + 2);
          g.moveTo(R + 14, ey - 4);
          g.lineTo(R - 12, ey + 2);
          g.stroke();
          g.beginPath();
          g.arc(L, ey + 12, 6, 0, Math.PI * 2);
          g.arc(R, ey + 12, 6, 0, Math.PI * 2);
          g.fill();
          g.beginPath();
          g.moveTo(ox + 54, 92);
          g.lineTo(ox + 74, 92);
          g.stroke();
          break;
        case 'surprised':
          g.beginPath();
          g.arc(L, ey, 11, 0, Math.PI * 2);
          g.moveTo(R + 11, ey);
          g.arc(R, ey, 11, 0, Math.PI * 2);
          g.stroke();
          g.beginPath();
          g.arc(ox + 64, 90, 9, 0, Math.PI * 2);
          g.stroke();
          break;
        case 'dizzy':
          for (const x of [L, R]) {
            g.beginPath();
            for (let k = 0; k < 40; k++) {
              const a = k * 0.42;
              const r = 2 + k * 0.32;
              const px = x + Math.cos(a) * r;
              const py = ey + Math.sin(a) * r;
              if (k === 0) g.moveTo(px, py);
              else g.lineTo(px, py);
            }
            g.lineWidth = 6;
            g.stroke();
          }
          g.lineWidth = 9;
          g.beginPath();
          g.moveTo(ox + 48, 94);
          for (let k = 0; k <= 4; k++) g.lineTo(ox + 48 + k * 8, 94 + (k % 2 ? -6 : 0));
          g.stroke();
          break;
        case 'cheer':
          g.beginPath();
          g.moveTo(L - 12, ey - 10);
          g.lineTo(L + 8, ey);
          g.lineTo(L - 12, ey + 10);
          g.moveTo(R + 12, ey - 10);
          g.lineTo(R - 8, ey);
          g.lineTo(R + 12, ey + 10);
          g.stroke();
          g.beginPath();
          g.moveTo(ox + 40, 76);
          g.quadraticCurveTo(ox + 64, 112, ox + 88, 76);
          g.closePath();
          g.fill();
          break;
        case 'bow':
          arcEye(L, false);
          arcEye(R, false);
          g.beginPath();
          g.arc(ox + 64, 82, 12, 0.3, Math.PI - 0.3);
          g.stroke();
          break;
        case 'off':
          break;
      }
      g.shadowBlur = 0;
    });
  });
  return faceAtlas;
}

// ---------------------------------------------------------------------------

export class Robot {
  readonly root = new THREE.Group();
  /** Bobs and leans; holds everything above the hover pod. */
  readonly rig = new THREE.Group();
  readonly head = new THREE.Group();
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  /** End of the right arm, for a blade or blaster. */
  readonly handR = new THREE.Group();
  readonly handL = new THREE.Group();
  /** A part that spins or swings by itself (Orbit's record, Tempo's pendulum). */
  readonly extra = new THREE.Group();
  private mat: THREE.MeshStandardMaterial;
  private faceTex: THREE.CanvasTexture;
  private faceMat: THREE.MeshBasicMaterial;
  private face: Face = 'happy';
  private t = Math.random() * 10;
  private glowTarget = 1;
  readonly look: RobotLook;
  readonly height: number;

  constructor(look: RobotLook) {
    this.look = look;
    const s = look.scale ?? 1;
    const broad = look.broad ?? 1;
    this.mat = robotMaterial();
    const body = look.body;
    const trim = look.trim;
    const dark = new THREE.Color(body).multiplyScalar(0.55).getHex();

    // Hover pod and torso.
    const lathe = (pts: [number, number][], seg = 18) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    const torso: THREE.BufferGeometry[] = [
      paint(at(lathe([[0.001, 0.18], [0.2, 0.2], [0.3, 0.3], [0.32, 0.42], [0.24, 0.5], [0.001, 0.52]]), 0, 0, 0), dark),
      paint(at(new THREE.TorusGeometry(0.22, 0.035, 8, 24), 0, 0.2, 0, Math.PI / 2), trim, 1.6),
      paint(at(lathe([[0.001, 0.5], [0.3, 0.52], [0.4 * broad, 0.7], [0.42 * broad, 0.92], [0.36 * broad, 1.12], [0.18, 1.2], [0.001, 1.21]]), 0, 0, 0, 0, 0, 0, [1, 1, 0.82]), body),
      paint(at(new THREE.TorusGeometry(0.41 * broad, 0.03, 8, 32), 0, 0.86, 0, Math.PI / 2, 0, 0, [1, 0.82, 1]), trim, 1.3),
      paint(at(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 12), 0, 1.24, 0), dark),
    ];
    if (look.badge) {
      const shape = look.badge === 'circle' ? new THREE.Shape().absarc(0, 0, 0.09, 0, Math.PI * 2, false) : look.badge === 'triangle' ? new THREE.Shape([new THREE.Vector2(0, 0.11), new THREE.Vector2(-0.1, -0.07), new THREE.Vector2(0.1, -0.07)]) : starShape(5, 0.11, 0.05);
      torso.push(paint(at(new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false }), 0, 0.98, 0.31 * broad + 0.02), trim, 2));
    }
    const torsoMesh = new THREE.Mesh(merge(torso), this.mat);
    torsoMesh.castShadow = true;
    this.rig.add(torsoMesh);

    // Head.
    const hg: THREE.BufferGeometry[] = [];
    let faceW = 0.34;
    let faceH = 0.22;
    let faceY = 0;
    let faceZ = 0.26;
    switch (look.head) {
      case 'dome':
        hg.push(paint(at(new THREE.SphereGeometry(0.28, 20, 14), 0, 0, 0, 0, 0, 0, [1, 0.92, 1]), body));
        hg.push(paint(at(new THREE.TorusGeometry(0.285, 0.022, 6, 28), 0, -0.04, 0, Math.PI / 2), trim, 1.4));
        faceZ = 0.25;
        break;
      case 'wedge':
        hg.push(paint(at(roundBox(0.5, 0.36, 0.44, 0.08), 0, 0, 0), body));
        hg.push(paint(at(new THREE.BoxGeometry(0.05, 0.32, 0.3), -0.2, 0.26, -0.05, 0, 0, 0.35), trim, 1.4));
        hg.push(paint(at(new THREE.BoxGeometry(0.05, 0.32, 0.3), 0.2, 0.26, -0.05, 0, 0, -0.35), trim, 1.4));
        faceZ = 0.225;
        break;
      case 'gear': {
        hg.push(paint(at(new THREE.CylinderGeometry(0.28, 0.28, 0.32, 20), 0, 0, 0, Math.PI / 2), body));
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          hg.push(paint(at(new THREE.BoxGeometry(0.1, 0.12, 0.26), Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0, 0, 0, a), dark));
        }
        hg.push(paint(at(new THREE.TorusGeometry(0.22, 0.02, 6, 24), 0, 0, 0.165), trim, 1.5));
        faceZ = 0.17;
        faceW = 0.3;
        break;
      }
      case 'star':
        hg.push(paint(at(new THREE.ExtrudeGeometry(starShape(5, 0.42, 0.2), { depth: 0.26, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }), 0, 0, -0.13), body));
        hg.push(paint(at(new THREE.SphereGeometry(0.05, 8, 6), 0, 0.44, 0.06), look.trim2 ?? trim, 2));
        faceZ = 0.17;
        faceW = 0.28;
        faceH = 0.18;
        faceY = -0.02;
        break;
      case 'box':
        hg.push(paint(at(roundBox(0.62, 0.46, 0.5, 0.06), 0, 0, 0), body));
        hg.push(paint(at(new THREE.BoxGeometry(0.66, 0.06, 0.54), 0, 0.2, 0), trim, 1.2));
        faceZ = 0.255;
        faceW = 0.44;
        faceH = 0.24;
        break;
      case 'slim':
        hg.push(paint(at(capsule(0.2, 0.24), 0, 0.04, 0), body));
        hg.push(paint(at(new THREE.TorusGeometry(0.21, 0.018, 6, 24), 0, 0.2, 0, Math.PI / 2), trim, 1.6));
        faceZ = 0.2;
        faceW = 0.26;
        faceH = 0.2;
        break;
      case 'crest':
        hg.push(paint(at(new THREE.SphereGeometry(0.29, 20, 14), 0, 0, 0, 0, 0, 0, [1, 1.08, 1]), body));
        hg.push(paint(at(new THREE.BoxGeometry(0.06, 0.34, 0.5), 0, 0.3, -0.03), look.trim2 ?? trim, 1.8));
        hg.push(paint(at(new THREE.TorusGeometry(0.29, 0.025, 6, 28), 0, -0.02, 0, Math.PI / 2), trim, 1.5));
        faceZ = 0.26;
        break;
      case 'metronome':
        hg.push(paint(at(new THREE.CylinderGeometry(0.12, 0.3, 0.6, 4), 0, 0.12, 0, 0, Math.PI / 4), body));
        hg.push(paint(at(new THREE.BoxGeometry(0.05, 0.5, 0.02), 0, 0.15, 0.2), trim, 0.6));
        faceZ = 0.21;
        faceY = -0.06;
        faceW = 0.28;
        faceH = 0.16;
        break;
      case 'phones':
        hg.push(paint(at(new THREE.SphereGeometry(0.27, 20, 14), 0, 0, 0), body));
        hg.push(paint(at(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 16), -0.3, 0, 0, 0, 0, Math.PI / 2), dark));
        hg.push(paint(at(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 16), 0.3, 0, 0, 0, 0, Math.PI / 2), dark));
        hg.push(paint(at(new THREE.TorusGeometry(0.12, 0.02, 6, 20), -0.365, 0, 0, 0, Math.PI / 2), trim, 1.8));
        hg.push(paint(at(new THREE.TorusGeometry(0.12, 0.02, 6, 20), 0.365, 0, 0, 0, Math.PI / 2), trim, 1.8));
        hg.push(paint(at(new THREE.TorusGeometry(0.32, 0.03, 6, 24, Math.PI), 0, 0.02, 0), dark));
        faceZ = 0.24;
        break;
      case 'disco':
        hg.push(paint(at(new THREE.IcosahedronGeometry(0.3, 1), 0, 0, 0), 0xd8d4f0));
        faceZ = 0.26;
        faceW = 0.28;
        faceH = 0.16;
        break;
      case 'vinyl':
        hg.push(paint(at(roundBox(0.46, 0.4, 0.36, 0.08), 0, 0, 0), body));
        faceZ = 0.185;
        faceW = 0.34;
        faceH = 0.2;
        break;
      case 'bean':
        hg.push(paint(at(new THREE.SphereGeometry(0.26, 16, 12), 0, 0, 0), body));
        faceZ = 0.24;
        break;
    }
    const headMesh = new THREE.Mesh(merge(hg), look.head === 'disco' ? discoMaterial() : this.mat);
    headMesh.castShadow = true;
    this.head.add(headMesh);
    this.head.position.set(0, 1.5, 0);
    this.rig.add(this.head);

    // The LED screen: a curved-feeling flat panel just proud of the head.
    this.faceTex = atlas().clone();
    this.faceTex.repeat.set(1 / FACES.length, 1);
    this.faceMat = new THREE.MeshBasicMaterial({ map: this.faceTex, color: new THREE.Color(trim).lerp(new THREE.Color(0xffffff), 0.45).multiplyScalar(1.5) });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(faceW, faceH), this.faceMat);
    face.position.set(0, faceY, faceZ + 0.006);
    this.head.add(face);
    this.setFace('happy');

    // Extras that move by themselves.
    if (look.head === 'vinyl') {
      const rec = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 40), new THREE.MeshStandardMaterial({ color: 0x0b0814, roughness: 0.25, metalness: 0.5 }));
      rec.rotation.x = Math.PI / 2;
      const label = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.035, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.pink).multiplyScalar(1.6) }));
      label.rotation.x = Math.PI / 2;
      this.extra.add(rec, label);
      this.extra.position.set(0, 0.1, -0.22);
      this.head.add(this.extra);
    }
    if (look.head === 'metronome') {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.03), new THREE.MeshBasicMaterial({ color: new THREE.Color(trim).multiplyScalar(2) }));
      arm.position.y = 0.21;
      const bob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.gold).multiplyScalar(2) }));
      bob.position.y = 0.3;
      this.extra.add(arm, bob);
      this.extra.position.set(0, -0.1, 0.23);
      this.head.add(this.extra);
    }

    // Arms: shoulder pivots with a mitt and a glowing cuff.
    for (const side of [-1, 1]) {
      const arm = side < 0 ? this.armL : this.armR;
      const g = merge([
        paint(at(new THREE.SphereGeometry(0.11, 12, 10), 0, 0, 0), dark),
        paint(at(capsule(0.075, 0.3), 0, -0.22, 0), body),
        paint(at(new THREE.TorusGeometry(0.085, 0.022, 6, 16), 0, -0.4, 0, Math.PI / 2), trim, 1.5),
        paint(at(new THREE.SphereGeometry(0.1, 12, 10), 0, -0.5, 0, 0, 0, 0, [1, 0.9, 1.1]), body),
      ]);
      const m = new THREE.Mesh(g, this.mat);
      m.castShadow = true;
      arm.add(m);
      arm.position.set(side * 0.47 * broad, 1.1, 0);
      arm.rotation.z = side * 0.12;
      const hand = side < 0 ? this.handL : this.handR;
      hand.position.set(0, -0.52, 0.02);
      arm.add(hand);
      this.rig.add(arm);
    }
    this.root.add(this.rig);
    this.root.scale.setScalar(s);
    this.height = 1.8 * s;
  }

  setFace(f: Face): void {
    if (f === this.face) return;
    this.face = f;
    this.faceTex.offset.x = FACES.indexOf(f) / FACES.length;
  }

  get currentFace(): Face {
    return this.face;
  }

  /** 0 for lights out (tagged), 1 normal, above 1 brighter. */
  setGlow(v: number): void {
    this.glowTarget = v;
  }

  /** Idle hover and the beat bob; worlds add their own poses on top. */
  idle(dt: number, beat: number, energy = 1): void {
    this.t += dt;
    const g = this.mat.userData.glow as { value: number };
    g.value += (this.glowTarget - g.value) * Math.min(1, dt * 8);
    this.faceMat.opacity = 1;
    const ph = beat - Math.floor(beat);
    const bob = Math.exp(-ph * 5) * 0.05 * energy;
    this.rig.position.y = 0.05 + Math.sin(this.t * 2.2) * 0.03 + bob;
    if (this.look.head === 'vinyl') this.extra.rotation.z = beat * Math.PI * 0.5;
    if (this.look.head === 'metronome') this.extra.rotation.z = Math.sin(beat * Math.PI) * 0.6;
  }

  dispose(): void {
    this.faceTex.dispose();
    materials.delete(this.mat);
  }
}

let disco: THREE.MeshStandardMaterial | null = null;
function discoMaterial(): THREE.MeshStandardMaterial {
  if (!disco) disco = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 1, flatShading: true, emissive: 0x4a3a8a, emissiveIntensity: 0.5 });
  return disco;
}

// ---------------------------------------------------------------------------
// The cast

export const TEAM_COLORS = { cyan: C.cyan, magenta: C.pink };

export function tagBot(team: 'cyan' | 'magenta', captain = false): Robot {
  if (captain) return new Robot({ head: 'crest', body: 0x3a1f5c, trim: C.pink, trim2: C.gold, badge: 'triangle', scale: 1.25, broad: 1.3 });
  return team === 'cyan' ? new Robot({ head: 'dome', body: 0x1d3a6a, trim: C.cyan, badge: 'circle' }) : new Robot({ head: 'wedge', body: 0x4a1d52, trim: C.pink, badge: 'triangle' });
}

export interface DuelistLook {
  id: string;
  look: RobotLook;
  blade: number;
  twin?: boolean;
}

export const DUELISTS: DuelistLook[] = [
  { id: 'sprocket', look: { head: 'gear', body: 0x6a5a1d, trim: C.gold, badge: 'circle', scale: 0.88 }, blade: C.gold },
  { id: 'twinkle', look: { head: 'star', body: 0x5c1f55, trim: C.pink, trim2: C.white, badge: 'star' }, blade: C.pink, twin: true },
  { id: 'brick', look: { head: 'box', body: 0x5a2f1a, trim: C.orange, badge: 'triangle', scale: 1.12, broad: 1.4 }, blade: C.orange },
  { id: 'mirage', look: { head: 'slim', body: 0x2e1d5e, trim: C.violet, trim2: C.lilac, badge: 'star', scale: 1.05 }, blade: C.lilac },
  { id: 'knight', look: { head: 'crest', body: 0xd8cfae, trim: C.gold, trim2: C.white, badge: 'star', scale: 1.25, broad: 1.15 }, blade: C.white },
];

export function judgeBot(kind: 'tempo' | 'groove' | 'sparkle'): Robot {
  if (kind === 'tempo') return new Robot({ head: 'metronome', body: 0x26335e, trim: C.cyan, badge: 'circle' });
  if (kind === 'groove') return new Robot({ head: 'phones', body: 0x4a1f4a, trim: C.pink, badge: 'circle' });
  return new Robot({ head: 'disco', body: 0x3b2f6a, trim: C.gold, badge: 'star' });
}

export function orbitBot(): Robot {
  return new Robot({ head: 'vinyl', body: 0x2a1a66, trim: C.lilac, badge: 'star', scale: 1.05 });
}
