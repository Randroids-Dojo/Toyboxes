// Old Lucky: the biggest slot machine on the river, as the sketchbook drew
// it. Three reels in a three-by-three window with the middle row framed as
// the payline, a lever on the right, twin smokestacks and a jackpot marquee.
// Walk up and pull; the engine-order telegraph beside it changes the bet.
// The server decides every spin; the reels land left to right at a fixed
// tempo whatever is showing (no slowing down for near misses).

import * as THREE from 'three';
import { chipsFor, type GameId } from '../../../shared/casino/progress';
import { BONUS_RING, MAJOR_X, MINI_X, PAYTABLE, REEL_STRIP, type RingSegment, type SlotSymbol } from '../../../shared/slots';
import type { PlayerState, SpaceAction } from '../../../world/space';
import { DISPLAY_FONT } from '../../../world/kit';
import { formatCredits } from '../../common';
import { sound } from '../audio';
import { Batch } from '../batch';
import { frame, type Framing } from '../director';
import type { Host } from '../host';
import { OLD_LUCKY, SPOTS, TELEGRAPH } from '../layout';
import { C, canvasTex } from '../materials';

const N = REEL_STRIP.length;
const R = 1.4;
const A = (55 * Math.PI) / 180;
const CELL = 0.8;
const WIN_Y = 3.6;
const FRONT = 1.1;

export interface SlotResult {
  stops: number[];
  line: SlotSymbol[];
  rule: string | null;
  win: number;
  bonus: { segment: number; value: RingSegment; mult: number; jackpot: 'MINI' | 'MAJOR' | 'GRAND' | null } | null;
  jackpots: { grand: number; spins: number };
}

// ---------------------------------------------------------------------------
// Symbols

function drawSymbol(g: CanvasRenderingContext2D, sym: SlotSymbol, s: number): void {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const text = (t: string, size: number, fill: string, stroke: string, y = 0) => {
    g.font = `${size}px ${DISPLAY_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = s * 0.07;
    g.strokeStyle = stroke;
    g.strokeText(t, 0, y);
    g.fillStyle = fill;
    g.fillText(t, 0, y);
  };
  switch (sym) {
    case 'seven': {
      const grd = g.createLinearGradient(0, -s * 0.4, 0, s * 0.4);
      grd.addColorStop(0, '#ff6a5a');
      grd.addColorStop(1, '#b8202e');
      text('7', s * 0.92, grd as unknown as string, '#3a0e14', s * 0.04);
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.fillRect(-s * 0.18, -s * 0.3, s * 0.3, s * 0.05);
      break;
    }
    case 'bar':
      g.fillStyle = '#1d1830';
      g.beginPath();
      g.roundRect(-s * 0.42, -s * 0.19, s * 0.84, s * 0.38, s * 0.09);
      g.fill();
      g.strokeStyle = '#e0ac45';
      g.lineWidth = s * 0.035;
      g.stroke();
      text('BAR', s * 0.28, '#fff6e0', '#1d1830', s * 0.02);
      break;
    case 'bell': {
      const grd = g.createLinearGradient(-s * 0.3, -s * 0.3, s * 0.3, s * 0.3);
      grd.addColorStop(0, '#ffe08a');
      grd.addColorStop(1, '#d08a1a');
      g.fillStyle = grd;
      g.strokeStyle = '#6a4210';
      g.lineWidth = s * 0.045;
      g.beginPath();
      g.moveTo(-s * 0.36, s * 0.22);
      g.quadraticCurveTo(-s * 0.32, -s * 0.36, 0, -s * 0.37);
      g.quadraticCurveTo(s * 0.32, -s * 0.36, s * 0.36, s * 0.22);
      g.closePath();
      g.fill();
      g.stroke();
      g.beginPath();
      g.arc(0, s * 0.28, s * 0.085, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath();
      g.ellipse(-s * 0.13, -s * 0.12, s * 0.05, s * 0.14, 0.3, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'star': {
      g.fillStyle = '#7a4fb0';
      g.strokeStyle = '#2b1a40';
      g.lineWidth = s * 0.045;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.18 : s * 0.42;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.arc(-s * 0.06, -s * 0.08, s * 0.07, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'cherry':
      g.strokeStyle = '#2f8f5a';
      g.lineWidth = s * 0.055;
      g.beginPath();
      g.moveTo(-s * 0.18, s * 0.1);
      g.quadraticCurveTo(-s * 0.05, -s * 0.3, s * 0.16, -s * 0.36);
      g.moveTo(s * 0.18, s * 0.1);
      g.quadraticCurveTo(s * 0.15, -s * 0.2, s * 0.16, -s * 0.36);
      g.stroke();
      g.fillStyle = '#3fae6a';
      g.beginPath();
      g.ellipse(s * 0.26, -s * 0.34, s * 0.12, s * 0.05, -0.4, 0, Math.PI * 2);
      g.fill();
      for (const x of [-s * 0.18, s * 0.18]) {
        const grd = g.createRadialGradient(x - s * 0.05, s * 0.14, 0, x, s * 0.2, s * 0.18);
        grd.addColorStop(0, '#ff6a6a');
        grd.addColorStop(1, '#a8141e');
        g.fillStyle = grd;
        g.strokeStyle = '#5a0a12';
        g.lineWidth = s * 0.035;
        g.beginPath();
        g.arc(x, s * 0.2, s * 0.17, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      break;
    case 'lemon': {
      const grd = g.createRadialGradient(-s * 0.1, -s * 0.08, 0, 0, 0, s * 0.4);
      grd.addColorStop(0, '#fff3a0');
      grd.addColorStop(1, '#e8c21a');
      g.fillStyle = grd;
      g.strokeStyle = '#8a7010';
      g.lineWidth = s * 0.045;
      g.beginPath();
      g.ellipse(0, 0, s * 0.38, s * 0.26, -0.3, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#e8c21a';
      g.beginPath();
      g.arc(s * 0.36, -s * 0.11, s * 0.045, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'paddle': {
      // The Golden Paddle: a little paddle wheel in gold.
      const grd = g.createLinearGradient(0, -s * 0.4, 0, s * 0.4);
      grd.addColorStop(0, '#ffe08a');
      grd.addColorStop(1, '#c88a1a');
      g.strokeStyle = '#5a3a08';
      g.lineWidth = s * 0.04;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.save();
        g.rotate(a);
        g.fillStyle = grd;
        g.beginPath();
        g.roundRect(-s * 0.07, -s * 0.44, s * 0.14, s * 0.17, s * 0.03);
        g.fill();
        g.stroke();
        g.beginPath();
        g.moveTo(0, -s * 0.28);
        g.lineTo(0, -s * 0.1);
        g.stroke();
        g.restore();
      }
      g.fillStyle = grd;
      g.beginPath();
      g.arc(0, 0, s * 0.27, 0, Math.PI * 2);
      g.lineWidth = s * 0.06;
      g.strokeStyle = '#c88a1a';
      g.stroke();
      g.lineWidth = s * 0.03;
      g.strokeStyle = '#5a3a08';
      g.beginPath();
      g.arc(0, 0, s * 0.3, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, s * 0.1, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
    }
  }
}

/** The reel strip, one cell per stop, cell i at v from i/N to (i+1)/N. Blurred for fast spins. */
function stripTexture(cell: number, blur: boolean): THREE.CanvasTexture {
  const t = canvasTex(cell, cell * N, (g, w, H) => {
    g.fillStyle = C.reelFace;
    g.fillRect(0, 0, w, H);
    REEL_STRIP.forEach((sym, i) => {
      const y = H - (i + 1) * cell;
      const grd = g.createLinearGradient(0, y, 0, y + cell);
      grd.addColorStop(0, '#f2eadb');
      grd.addColorStop(0.5, '#fffaf0');
      grd.addColorStop(1, '#efe4d0');
      g.fillStyle = grd;
      g.fillRect(0, y, w, cell);
      if (blur) {
        for (let k = -3; k <= 3; k++) {
          g.save();
          g.globalAlpha = 0.16;
          g.translate(w / 2, y + cell / 2 + k * cell * 0.09);
          drawSymbol(g, sym, cell * 0.84);
          g.restore();
        }
      } else {
        g.save();
        g.translate(w / 2, y + cell / 2);
        drawSymbol(g, sym, cell * 0.84);
        g.restore();
      }
      g.fillStyle = 'rgba(43,35,64,0.14)';
      g.fillRect(0, y, w, 2);
    });
  });
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}

/** A band of a cylinder with v running around it in cells, apex at z 0. */
function bandGeometry(width: number): THREE.BufferGeometry {
  const S = 28;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= S; j++) {
    const a = -A + (2 * A * j) / S;
    const y = R * Math.sin(a);
    const z = R * Math.cos(a) - R;
    const v = (R * a) / CELL / N + 0.5 / N;
    for (const side of [0, 1]) {
      pos.push((side - 0.5) * width, y, z);
      nor.push(0, Math.sin(a), Math.cos(a));
      uv.push(side, v);
    }
    if (j < S) {
      const k = j * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function ellipseArch(w: number, base: number, ry: number, inset = 0): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w / 2 - inset;
  s.moveTo(-hw, inset);
  s.lineTo(hw, inset);
  s.lineTo(hw, base);
  s.absellipse(0, base, hw, ry - inset, 0, Math.PI, false, 0);
  s.lineTo(-hw, inset);
  return s;
}

interface Reel {
  mesh: THREE.Mesh;
  tex: THREE.CanvasTexture;
  blur: THREE.CanvasTexture;
  pos: number;
  speed: number;
  stop: { from: number; to: number; t0: number; dur: number; landed: boolean } | null;
  lastCell: number;
}

const TELEGRAPH_NAMES: Record<number, string> = { 10: 'SLOW', 25: 'HALF', 50: 'FULL', 100: 'FLANK', 250: 'AHEAD', 500: 'FULL AHEAD' };

// ---------------------------------------------------------------------------

export class OldLucky {
  readonly group = new THREE.Group();
  private reels: Reel[] = [];
  private lever = new THREE.Group();
  private leverT = -1;
  private bulbs: THREE.InstancedMesh;
  private bulbInfo: { kind: 'arch' | 'window'; i: number }[] = [];
  private bulbColor = new THREE.Color();
  private marqueeTex: THREE.CanvasTexture;
  private marqueeKey = '';
  private fameMesh: THREE.Mesh;
  /** The wall plaques, so the casino can hang them on their walls. */
  readonly plaques: { fame: THREE.Object3D[]; pay: THREE.Object3D[] } = { fame: [], pay: [] };
  private fameKey = '';
  private paylineMat: THREE.MeshStandardMaterial;
  private lampMat: THREE.MeshStandardMaterial;
  private rimMat: THREE.MeshStandardMaterial;
  private pointer = new THREE.Group();
  private pointerAngle = 0;
  private dialTex: THREE.CanvasTexture;
  private dialKey = '';
  private clapper = 0;
  private owned: { dispose(): void }[] = [];
  spinning = false;
  private landedAt = -10;
  private celebrate = 0;
  private fullSteam = 0;
  /** For playtests: what the reels show and what the server said. */
  shownStops: number[] = [0, 0, 0];
  lastServerStops: number[] | null = null;
  lastResult: SlotResult | null = null;
  spins = 0;

  constructor(private host: Host) {
    const own = <X extends { dispose(): void }>(x: X): X => {
      this.owned.push(x);
      return x;
    };
    const m = host.mats;
    const g = this.group;
    g.position.set(OLD_LUCKY.x, 0, OLD_LUCKY.z);
    host.scene.add(g);
    const cell = host.tier() === 'low' ? 128 : 192;

    const lac = new Batch();
    const brass = new Batch();
    const dark = new Batch();
    const darkMat = own(new THREE.MeshStandardMaterial({ color: C.glassDark, roughness: 0.5 }));
    // Plinth and lower cabinet.
    brass.add(new THREE.BoxGeometry(5.4, 0.2, 2.6), m.brass, 0, 0.1, 0.1);
    lac.add(new THREE.BoxGeometry(5.0, 2.0, 2.2), m.lacquer, 0, 1.2, 0);
    brass.add(new THREE.BoxGeometry(5.1, 0.12, 2.3), m.brass, 0, 2.24, 0);
    // Coin tray.
    brass.add(new THREE.BoxGeometry(3.0, 0.22, 0.6), m.brass, 0, 0.62, FRONT + 0.25);
    dark.add(new THREE.BoxGeometry(2.8, 0.06, 0.45), darkMat, 0, 0.71, FRONT + 0.27);
    // Belly glass frame.
    brass.add(new THREE.BoxGeometry(4.0, 1.12, 0.06), m.brass, 0, 1.55, FRONT + 0.02);
    // Reel housing: back, sides and top (no front, so the window shows the reels).
    dark.add(new THREE.BoxGeometry(4.6, 2.8, 0.9), darkMat, 0, WIN_Y, -0.6);
    for (const sx of [-1, 1]) lac.add(new THREE.BoxGeometry(0.4, 2.8, 2.0), m.lacquer, sx * 2.3, WIN_Y, 0);
    lac.add(new THREE.BoxGeometry(5.0, 0.3, 2.0), m.lacquer, 0, 4.85, 0);
    // The window frame: a lacquer face with a rounded window.
    const face = new THREE.Shape();
    face.moveTo(-2.5, 0);
    face.lineTo(2.5, 0);
    face.lineTo(2.5, 2.8);
    face.lineTo(-2.5, 2.8);
    face.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-1.65 + 0.15, 0.25);
    hole.absarc(1.65 - 0.15, 0.25 + 0.15, 0.15, -Math.PI / 2, 0, false);
    hole.absarc(1.65 - 0.15, 2.55 - 0.15, 0.15, 0, Math.PI / 2, false);
    hole.absarc(-1.65 + 0.15, 2.55 - 0.15, 0.15, Math.PI / 2, Math.PI, false);
    hole.absarc(-1.65 + 0.15, 0.25 + 0.15, 0.15, Math.PI, Math.PI * 1.5, false);
    face.holes.push(hole);
    lac.add(new THREE.ExtrudeGeometry(face, { depth: 0.12, bevelEnabled: false, curveSegments: 6 }), m.lacquer, 0, 2.2, 1.0);
    const bezel = new THREE.Shape();
    bezel.moveTo(-1.82, 0.08);
    bezel.lineTo(1.82, 0.08);
    bezel.lineTo(1.82, 2.72);
    bezel.lineTo(-1.82, 2.72);
    bezel.closePath();
    bezel.holes.push(hole);
    brass.add(new THREE.ExtrudeGeometry(bezel, { depth: 0.04, bevelEnabled: false, curveSegments: 6 }), m.brass, 0, 2.2, 1.12);
    // Dividers between the reels, and the brass bars that frame the payline row.
    for (const x of [-0.545, 0.545]) brass.add(new THREE.BoxGeometry(0.07, 2.3, 0.05), m.brass, x, WIN_Y, 1.02);
    const rowEdge = R * Math.sin(CELL / 2 / R);
    for (const y of [WIN_Y - rowEdge, WIN_Y + rowEdge]) brass.add(new THREE.BoxGeometry(3.3, 0.04, 0.05), m.brass, 0, y, 1.03);
    // Marquee arch with its brass rim.
    const arch = ellipseArch(5.4, 0.6, 1.6);
    lac.add(new THREE.ExtrudeGeometry(arch, { depth: 1.0, bevelEnabled: false, curveSegments: 24 }), m.lacquer, 0, 5.0, -0.1);
    const rim = ellipseArch(5.4, 0.6, 1.6);
    rim.holes.push(new THREE.Path(ellipseArch(5.4, 0.6, 1.6, 0.16).getPoints(48)));
    brass.add(new THREE.ExtrudeGeometry(rim, { depth: 0.06, bevelEnabled: false, curveSegments: 24 }), m.brass, 0, 5.0, 0.9);
    // Twin smokestacks behind the marquee.
    const prof = ([[0.46, 0], [0.46, 0.12], [0.34, 0.3], [0.3, 2.4], [0.36, 2.62], [0.56, 3.05], [0.5, 3.2], [0.44, 3.22], [0.44, 3.1], [0.3, 2.7], [0, 2.7]] as [number, number][]).map(([r, y]) => new THREE.Vector2(r, y));
    const stackGeo = new THREE.LatheGeometry(prof, 20);
    for (const sx of [-2.05, 2.05]) {
      dark.add(stackGeo, m.iron, sx, 5.6, -0.4);
      for (const y of [6.1, 7.3, 8.25]) brass.add(new THREE.TorusGeometry(0.315, 0.035, 8, 24).rotateX(Math.PI / 2), m.brass, sx, y, -0.4);
      // Feathered crown.
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        brass.add(new THREE.ConeGeometry(0.06, 0.24, 6), m.brass, sx + Math.cos(a) * 0.5, 8.92, -0.4 + Math.sin(a) * 0.5);
      }
    }
    // Twisted brass columns either side, with finials.
    for (const sx of [-2.72, 2.72]) {
      brass.add(new THREE.CylinderGeometry(0.11, 0.13, 5.0, 12), m.brass, sx, 2.7, 0.85);
      for (let k = 0; k < 14; k++) brass.add(new THREE.TorusGeometry(0.125, 0.025, 6, 16).rotateX(Math.PI / 2 + 0.35), m.brass, sx, 0.6 + k * 0.33, 0.85);
      brass.add(new THREE.SphereGeometry(0.2, 14, 10), m.brass, sx, 5.35, 0.85);
      brass.add(new THREE.BoxGeometry(0.4, 0.3, 0.4), m.brass, sx, 0.35, 0.85);
    }
    // Lever housing on the right.
    brass.add(new THREE.BoxGeometry(0.5, 0.8, 0.8), m.brass, 2.75, 3.2, 0.5);
    brass.add(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 16).rotateZ(Math.PI / 2), m.brass, 3.1, 3.2, 0.5);
    lac.build(g);
    brass.build(g);
    dark.build(g);

    // The lever: a brass arm with a red knob, pivoting towards you.
    this.lever.position.set(3.2, 3.2, 0.5);
    const arm = new THREE.Mesh(own(new THREE.CylinderGeometry(0.06, 0.07, 2.2, 12).translate(0, 1.1, 0)), m.brass);
    const knob = new THREE.Mesh(own(new THREE.SphereGeometry(0.24, 20, 14)), m.lacquer);
    knob.position.y = 2.3;
    const collar = new THREE.Mesh(own(new THREE.TorusGeometry(0.1, 0.035, 8, 16).rotateX(Math.PI / 2)), m.brass);
    collar.position.y = 2.1;
    arm.castShadow = knob.castShadow = true;
    this.lever.add(arm, knob, collar);
    this.lever.rotation.x = -0.18;
    g.add(this.lever);

    // Reels: curved bands in the window, the strip sliding round them.
    const band = own(bandGeometry(0.98));
    for (let i = 0; i < 3; i++) {
      const tex = own(stripTexture(cell, false));
      const blur = own(stripTexture(cell, true));
      tex.repeat.set(1, 1);
      blur.repeat.set(1, 1);
      const mat = own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, emissive: new THREE.Color('#fff4dc'), emissiveMap: tex, emissiveIntensity: 0.07 }));
      const mesh = new THREE.Mesh(band, mat);
      mesh.position.set((i - 1) * 1.09, WIN_Y, 0.98);
      g.add(mesh);
      const start = (i * 7 + 3) % N;
      this.reels.push({ mesh, tex, blur, pos: start, speed: 0, stop: null, lastCell: start });
      this.shownStops[i] = start;
    }
    // The payline: a red lamp line with diamond lamps at each end.
    this.paylineMat = own(new THREE.MeshStandardMaterial({ color: '#ff3d4a', emissive: new THREE.Color('#ff2a3a'), emissiveIntensity: 0.6, roughness: 0.3 }));
    const pl = new THREE.Mesh(own(new THREE.BoxGeometry(3.3, 0.035, 0.012)), this.paylineMat);
    pl.position.set(0, WIN_Y, 1.008);
    g.add(pl);
    this.lampMat = own(new THREE.MeshStandardMaterial({ color: '#ff5a4a', emissive: new THREE.Color('#ff2a3a'), emissiveIntensity: 0.8, roughness: 0.25 }));
    for (const sx of [-1.95, 1.95]) {
      const lamp = new THREE.Mesh(own(new THREE.OctahedronGeometry(0.13, 0).scale(1, 1, 0.5)), this.lampMat);
      lamp.position.set(sx, WIN_Y, 1.16);
      g.add(lamp);
    }
    // Glass over the reels.
    const glass = new THREE.Mesh(own(new THREE.PlaneGeometry(3.3, 2.3)), own(new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.04, roughness: 0.15, metalness: 0, envMapIntensity: 0.1, depthWrite: false })));
    glass.position.set(0, WIN_Y, 1.07);
    glass.renderOrder = 3;
    g.add(glass);

    // Belly glass: the paytable, lit from behind.
    const pay = own(
      canvasTex(
        1024,
        280,
        (cg, W, Hh) => {
          cg.fillStyle = '#1d1830';
          cg.fillRect(0, 0, W, Hh);
          cg.strokeStyle = '#e0ac45';
          cg.lineWidth = 6;
          cg.strokeRect(10, 10, W - 20, Hh - 20);
          const rows: [string, string][] = [
            ['7 7 7', `${PAYTABLE.three_seven.multiplier}x`],
            ['BAR BAR BAR', `${PAYTABLE.three_bar.multiplier}x`],
            ['3 cherries', `${PAYTABLE.three_cherry.multiplier}x`],
            ['3 bells / 3 stars', `${PAYTABLE.three_bell.multiplier}x`],
            ['Two 7s', `${PAYTABLE.two_seven.multiplier}x`],
            ['Two cherries', `${PAYTABLE.two_cherry.multiplier}x`],
            ['3 lemons', `${PAYTABLE.three_lemon.multiplier}x`],
            ['Mixed fruit', `${PAYTABLE.mixed_fruit.multiplier}x`],
            ['One cherry', 'bet back'],
            ['3 paddles', 'BONUS'],
          ];
          cg.font = `30px ${DISPLAY_FONT}`;
          cg.textBaseline = 'middle';
          rows.forEach(([a, b], i) => {
            const col = i < 5 ? 0 : 1;
            const y = 50 + (i % 5) * 46;
            const x = 40 + col * 500;
            cg.textAlign = 'left';
            cg.fillStyle = i === 9 ? '#ffd24a' : '#fff6e0';
            cg.fillText(a, x, y);
            cg.textAlign = 'right';
            cg.fillStyle = '#ffd24a';
            cg.fillText(b, x + 440, y);
          });
        },
        false,
      ),
    );
    const belly = new THREE.Mesh(own(new THREE.PlaneGeometry(3.8, 1.0)), own(new THREE.MeshStandardMaterial({ map: pay, emissive: new THREE.Color('#ffffff'), emissiveMap: pay, emissiveIntensity: 0.32, roughness: 0.4 })));
    belly.position.set(0, 1.55, FRONT + 0.055);
    g.add(belly);

    // Marquee face: the name and the jackpot meter, redrawn when they change.
    this.marqueeTex = own(canvasTex(1024, 420, () => {}, false));
    const faceShape = ellipseArch(5.4, 0.6, 1.6, 0.16);
    const fg = own(new THREE.ShapeGeometry(faceShape, 24));
    const uv = fg.attributes.uv;
    const p = fg.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + 2.54) / 5.08, (p.getY(i) - 0.16) / (2.2 - 0.32));
    const marquee = new THREE.Mesh(fg, own(new THREE.MeshStandardMaterial({ map: this.marqueeTex, emissive: new THREE.Color('#ffffff'), emissiveMap: this.marqueeTex, emissiveIntensity: 0.32, roughness: 0.5 })));
    marquee.position.set(0, 5.0, 0.905);
    g.add(marquee);

    // Bulbs: round the marquee arch and the reel window, chased in patterns.
    const spots: THREE.Vector3[] = [];
    for (let i = 0; i <= 30; i++) {
      const a = Math.PI - (i / 30) * Math.PI;
      spots.push(new THREE.Vector3(Math.cos(a) * 2.62, 5.6 + Math.sin(a) * 1.52, 0.98));
      this.bulbInfo.push({ kind: 'arch', i });
    }
    for (const y of [5.08, 5.6]) {
      for (const sx of [-2.62, 2.62]) {
        if (y > 5.5) continue;
        spots.push(new THREE.Vector3(sx, y + 0.24, 0.98));
        this.bulbInfo.push({ kind: 'arch', i: sx < 0 ? -1 : 31 });
      }
    }
    const wpts: THREE.Vector3[] = [];
    for (let i = 0; i < 12; i++) wpts.push(new THREE.Vector3(-1.95 + (i / 11) * 3.9, 4.95, 1.17));
    for (let i = 1; i < 6; i++) wpts.push(new THREE.Vector3(1.95, 4.95 - (i / 6) * 2.7, 1.17));
    for (let i = 11; i >= 0; i--) wpts.push(new THREE.Vector3(-1.95 + (i / 11) * 3.9, 2.25, 1.17));
    for (let i = 5; i > 0; i--) wpts.push(new THREE.Vector3(-1.95, 4.95 - (i / 6) * 2.7, 1.17));
    wpts.forEach((v, i) => {
      if (Math.abs(v.y - WIN_Y) < 0.2 && Math.abs(v.x) > 1.9) return;
      spots.push(v);
      this.bulbInfo.push({ kind: 'window', i });
    });
    this.bulbs = new THREE.InstancedMesh(own(new THREE.SphereGeometry(0.065, 10, 8)), own(new THREE.MeshStandardMaterial({ color: '#fff6e0', emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.9, roughness: 0.3 })), spots.length);
    const mm = new THREE.Matrix4();
    spots.forEach((v, i) => {
      this.bulbs.setMatrixAt(i, mm.makeTranslation(v.x, v.y, v.z));
      this.bulbs.setColorAt(i, new THREE.Color(C.bulb));
    });
    this.bulbs.instanceMatrix.needsUpdate = true;
    g.add(this.bulbs);

    // The glow ring on the carpet and a round rug that says where to stand.
    const rug = own(
      canvasTex(
        512,
        512,
        (cg, s) => {
          cg.clearRect(0, 0, s, s);
          cg.fillStyle = '#5a1420';
          cg.beginPath();
          cg.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2);
          cg.fill();
          cg.strokeStyle = '#e0ac45';
          cg.lineWidth = 10;
          cg.beginPath();
          cg.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2);
          cg.stroke();
          cg.lineWidth = 3;
          cg.beginPath();
          cg.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2);
          cg.stroke();
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            cg.fillStyle = i % 2 ? 'rgba(224,172,69,0.55)' : 'rgba(224,172,69,0.25)';
            cg.beginPath();
            cg.moveTo(s / 2, s / 2);
            cg.arc(s / 2, s / 2, s * 0.38, a, a + Math.PI / 16);
            cg.closePath();
            cg.fill();
          }
          cg.fillStyle = '#5a1420';
          cg.beginPath();
          cg.arc(s / 2, s / 2, s * 0.2, 0, Math.PI * 2);
          cg.fill();
          cg.fillStyle = '#e0ac45';
          cg.font = `40px ${DISPLAY_FONT}`;
          cg.textAlign = 'center';
          cg.textBaseline = 'middle';
          cg.fillText('PULL', s / 2, s / 2 - 16);
          cg.fillText('HERE', s / 2, s / 2 + 26);
        },
        false,
      ),
    );
    this.rimMat = own(new THREE.MeshStandardMaterial({ map: rug, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, emissive: new THREE.Color('#ffcf7a'), emissiveMap: rug, emissiveIntensity: 0.15 }));
    const rugMesh = new THREE.Mesh(own(new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2)), this.rimMat);
    rugMesh.position.set(SPOTS.lever.x, 0.006, SPOTS.lever.z);
    rugMesh.receiveShadow = true;
    host.scene.add(rugMesh);

    // The bay as a little theatre: red curtains tied back and a gilded valance.
    this.buildCurtains(own);

    // The engine-order telegraph: a brass dial whose handle shows your bet.
    const tg = new THREE.Group();
    tg.position.set(TELEGRAPH.x, 0, TELEGRAPH.z);
    const tb = new Batch();
    tb.add(new THREE.LatheGeometry(([[0.3, 0], [0.3, 0.08], [0.16, 0.16], [0.11, 0.3], [0.09, 0.95], [0.14, 1.05], [0, 1.05]] as [number, number][]).map(([r, y]) => new THREE.Vector2(r, y)), 16), m.brass, 0, 0, 0);
    tb.add(new THREE.CylinderGeometry(0.42, 0.42, 0.16, 32).rotateX(Math.PI / 2), m.brass, 0, 1.42, 0);
    tb.add(new THREE.TorusGeometry(0.42, 0.04, 8, 32), m.brass, 0, 1.42, 0.08);
    tb.add(new THREE.LatheGeometry(([[0, 0.2], [0.05, 0.19], [0.12, 0.08], [0.15, 0], [0.13, 0]] as [number, number][]).map(([r, y]) => new THREE.Vector2(r, y)), 14), m.brass, 0, 1.86, 0);
    tb.build(tg);
    this.dialTex = own(canvasTex(512, 512, () => {}, false));
    const dial = new THREE.Mesh(own(new THREE.CircleGeometry(0.37, 40)), own(new THREE.MeshStandardMaterial({ map: this.dialTex, emissive: new THREE.Color('#ffffff'), emissiveMap: this.dialTex, emissiveIntensity: 0.15, roughness: 0.4 })));
    dial.position.set(0, 1.42, 0.085);
    tg.add(dial);
    this.pointer.position.set(0, 1.42, 0.1);
    const parm = new THREE.Mesh(own(new THREE.BoxGeometry(0.05, 0.36, 0.03).translate(0, 0.16, 0)), m.brassDark);
    const pknob = new THREE.Mesh(own(new THREE.SphereGeometry(0.06, 12, 8)), m.lacquer);
    pknob.position.set(0, 0.36, 0.02);
    const hub = new THREE.Mesh(own(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14).rotateX(Math.PI / 2)), m.brass);
    this.pointer.add(parm, pknob, hub);
    tg.add(this.pointer);
    host.scene.add(tg);

    // Hall of Fame and paytable plaques on the starboard wall.
    this.fameMesh = new THREE.Mesh(own(new THREE.PlaneGeometry(3.0, 2.0)), own(new THREE.MeshStandardMaterial({ roughness: 0.5, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.45 })));
    this.fameMesh.position.set(SPOTS.fame.x, 3.0, -8.83);
    host.scene.add(this.fameMesh);
    const payPlaque = own(
      canvasTex(
        800,
        560,
        (cg, W, Hh) => {
          cg.fillStyle = C.ui;
          cg.fillRect(0, 0, W, Hh);
          cg.strokeStyle = C.brass;
          cg.lineWidth = 12;
          cg.strokeRect(12, 12, W - 24, Hh - 24);
          cg.fillStyle = C.brass;
          cg.font = `58px ${DISPLAY_FONT}`;
          cg.textAlign = 'center';
          cg.fillText('Old Lucky pays', W / 2, 84);
          cg.font = `32px ${DISPLAY_FONT}`;
          cg.fillStyle = C.ivory;
          const lines = ['x your bet, on the middle row', `Three paddles spin the bonus wheel`, `MINI ${MINI_X}x · MAJOR ${MAJOR_X}x`, 'GRAND grows with every spin', 'Over time it pays back about 95 in 100', 'Interact here for the full odds'];
          lines.forEach((l, i) => cg.fillText(l, W / 2, 160 + i * 62));
        },
        false,
      ),
    );
    const pp = new THREE.Mesh(own(new THREE.PlaneGeometry(2.0, 1.4)), own(new THREE.MeshStandardMaterial({ map: payPlaque, emissive: new THREE.Color('#ffffff'), emissiveMap: payPlaque, emissiveIntensity: 0.4, roughness: 0.5 })));
    pp.position.set(SPOTS.paytable.x, 2.6, -8.83);
    host.scene.add(pp);
    this.plaques.fame.push(this.fameMesh);
    this.plaques.pay.push(pp);
    for (const [x, w, hh, y, list] of [[SPOTS.fame.x, 3.0, 2.0, 3.0, this.plaques.fame], [SPOTS.paytable.x, 2.0, 1.4, 2.6, this.plaques.pay]] as const) {
      const fr = new THREE.Mesh(own(new THREE.BoxGeometry(w + 0.16, hh + 0.16, 0.05)), m.brass);
      fr.position.set(x, y, -8.86);
      host.scene.add(fr);
      list.push(fr);
    }
    this.paint();
  }

  private buildCurtains(own: <X extends { dispose(): void }>(x: X) => X): void {
    const velvet = own(new THREE.MeshStandardMaterial({ color: '#8a1424', roughness: 0.85 }));
    const folds = (w: number, depth: number, n: number) => {
      const s = new THREE.Shape();
      const steps = n * 8;
      s.moveTo(-w / 2, 0);
      for (let i = 0; i <= steps; i++) {
        const x = -w / 2 + (i / steps) * w;
        s.lineTo(x, Math.sin((i / steps) * n * Math.PI * 2) * depth);
      }
      for (let i = steps; i >= 0; i--) {
        const x = -w / 2 + (i / steps) * w;
        s.lineTo(x, Math.sin((i / steps) * n * Math.PI * 2) * depth - 0.04);
      }
      return s;
    };
    const b = new Batch();
    // Side drapes: tall, gathered towards a brass tie-back.
    for (const sx of [-1, 1]) {
      const geo = new THREE.ExtrudeGeometry(folds(0.9, 0.07, 4), { depth: 5.7, bevelEnabled: false, curveSegments: 4 }).rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        // Pinch at the tie-back (y 1.6) so the drape bells out above and below.
        const pinch = 1 - 0.55 * Math.exp(-((y - 1.6) ** 2) / 0.6);
        pos.setX(i, pos.getX(i) * pinch + sx * (1 - pinch) * 0.25);
      }
      geo.computeVertexNormals();
      b.add(geo, velvet, sx * 4.45, 0, -8.82);
    }
    // Valance: a scalloped swag across the top of the bay.
    const val = new THREE.ExtrudeGeometry(folds(10.2, 0.06, 10), { depth: 0.7, bevelEnabled: false, curveSegments: 4 }).rotateX(-Math.PI / 2);
    b.add(val, velvet, 0, 7.9, -8.84);
    b.build(this.host.scene);
    const bb = new Batch();
    for (const sx of [-1, 1]) {
      bb.add(new THREE.TorusGeometry(0.16, 0.035, 8, 16), this.host.mats.brass, sx * 4.48, 1.6, -8.75);
      // Gilded pilasters at the mouth of the bay.
      bb.add(new THREE.BoxGeometry(0.36, 8.3, 0.3), this.host.mats.trim, sx * 5.05, 4.15, -8.92, 0, 0, 0, C.ivory);
      bb.add(new THREE.BoxGeometry(0.5, 0.3, 0.4), this.host.mats.trim, sx * 5.05, 8.3, -8.9, 0, 0, 0, C.brassMatte);
      bb.add(new THREE.BoxGeometry(0.5, 0.24, 0.4), this.host.mats.trim, sx * 5.05, 0.12, -8.9, 0, 0, 0, C.brassMatte);
    }
    bb.add(new THREE.BoxGeometry(10.4, 0.12, 0.12), this.host.mats.brass, 0, 8.56, -8.82);
    bb.build(this.host.scene);
  }

  // -------------------------------------------------------------------------

  /** Redraws the marquee, dial and Hall of Fame when what they show changes. */
  paint(): void {
    const eco = this.host.eco;
    const bet = this.host.bet('slot');
    const grand = eco.jackpots.grand;
    const key = `${grand}|${bet}|${this.fullSteam > 0}`;
    if (key !== this.marqueeKey) {
      this.marqueeKey = key;
      const c = this.marqueeTex.image as HTMLCanvasElement;
      const g = c.getContext('2d')!;
      const W = c.width;
      const H = c.height;
      const bg = g.createRadialGradient(W / 2, H * 0.9, 20, W / 2, H * 0.9, W * 0.7);
      bg.addColorStop(0, '#7a1424');
      bg.addColorStop(1, '#2a0610');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 18; i++) {
        const a = Math.PI + (i / 18) * Math.PI;
        g.fillStyle = i % 2 ? 'rgba(255,207,122,0.10)' : 'rgba(255,207,122,0.04)';
        g.beginPath();
        g.moveTo(W / 2, H * 0.95);
        g.arc(W / 2, H * 0.95, W, a, a + Math.PI / 18);
        g.closePath();
        g.fill();
      }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const title = this.fullSteam > 0 ? 'FULL STEAM' : 'OLD LUCKY';
      g.font = `150px ${DISPLAY_FONT}`;
      g.lineWidth = 16;
      g.strokeStyle = '#2a0610';
      g.strokeText(title, W / 2, H * 0.46);
      const gold = g.createLinearGradient(0, H * 0.3, 0, H * 0.6);
      gold.addColorStop(0, '#fff2b0');
      gold.addColorStop(0.5, '#ffd24a');
      gold.addColorStop(1, '#c8861a');
      g.fillStyle = gold;
      g.fillText(title, W / 2, H * 0.46);
      g.font = `34px ${DISPLAY_FONT}`;
      g.fillStyle = '#fff6e0';
      g.fillText('THE BIGGEST SLOT ON THE RIVER', W / 2, H * 0.2 + 10);
      // The jackpot meter.
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath();
      g.roundRect(W * 0.12, H * 0.66, W * 0.76, H * 0.3, 26);
      g.fill();
      g.strokeStyle = '#e0ac45';
      g.lineWidth = 4;
      g.stroke();
      g.font = `64px ${DISPLAY_FONT}`;
      g.fillStyle = '#ffd24a';
      g.fillText(`GRAND ${Math.floor(grand)}x`, W / 2, H * 0.75);
      g.font = `30px ${DISPLAY_FONT}`;
      g.fillStyle = '#fff6e0';
      g.fillText(`${formatCredits(Math.floor(grand * bet))} at bet ${bet}  ·  MAJOR ${MAJOR_X}x  ·  MINI ${MINI_X}x`, W / 2, H * 0.88);
      this.marqueeTex.needsUpdate = true;
    }
    // The telegraph dial.
    const chips = chipsFor(eco.rank, 'slot');
    const dkey = `${chips.length}|${bet}`;
    if (dkey !== this.dialKey) {
      this.dialKey = dkey;
      const c = this.dialTex.image as HTMLCanvasElement;
      const g = c.getContext('2d')!;
      const s = c.width;
      g.fillStyle = '#f4e7cc';
      g.beginPath();
      g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
      g.fill();
      const all = [10, 25, 50, 100, 250, 500];
      all.forEach((b, i) => {
        const a0 = Math.PI + (i / 6) * Math.PI;
        const open = chips.includes(b);
        g.fillStyle = b === bet ? '#d8382c' : open ? (i % 2 ? '#e8dcc0' : '#f8f0dc') : '#b8b0a0';
        g.beginPath();
        g.moveTo(s / 2, s / 2);
        g.arc(s / 2, s / 2, s * 0.48, a0, a0 + Math.PI / 6);
        g.closePath();
        g.fill();
        g.save();
        g.translate(s / 2, s / 2);
        g.rotate(a0 + Math.PI / 12 + Math.PI / 2);
        g.fillStyle = b === bet ? '#fff6e0' : open ? '#2a1a10' : '#6a6458';
        g.textAlign = 'center';
        g.font = `30px ${DISPLAY_FONT}`;
        g.fillText(String(b), 0, -s * 0.36);
        g.font = `18px ${DISPLAY_FONT}`;
        g.fillText(open ? TELEGRAPH_NAMES[b] : 'LOCKED', 0, -s * 0.27);
        g.restore();
      });
      g.fillStyle = '#2a1a10';
      g.font = `34px ${DISPLAY_FONT}`;
      g.textAlign = 'center';
      g.fillText('BET', s / 2, s * 0.7);
      g.font = `20px ${DISPLAY_FONT}`;
      g.fillText('RING TO CHANGE', s / 2, s * 0.8);
      g.strokeStyle = '#a8782c';
      g.lineWidth = 8;
      g.beginPath();
      g.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2);
      g.stroke();
      this.dialTex.needsUpdate = true;
    }
    // Hall of Fame plaque.
    const fame = eco.fame;
    const fkey = JSON.stringify(fame.slice(0, 6));
    if (fkey !== this.fameKey) {
      this.fameKey = fkey;
      const mat = this.fameMesh.material as THREE.MeshStandardMaterial;
      mat.map?.dispose();
      const tex = canvasTex(
        900,
        600,
        (g, W, Hh) => {
          g.fillStyle = '#2a1a10';
          g.fillRect(0, 0, W, Hh);
          g.strokeStyle = '#e0ac45';
          g.lineWidth = 14;
          g.strokeRect(14, 14, W - 28, Hh - 28);
          g.lineWidth = 3;
          g.strokeRect(34, 34, W - 68, Hh - 68);
          g.fillStyle = '#e0ac45';
          g.textAlign = 'center';
          g.font = `66px ${DISPLAY_FONT}`;
          g.fillText('Hall of Fame', W / 2, 100);
          g.font = `28px ${DISPLAY_FONT}`;
          g.fillStyle = '#f4e7cc';
          g.fillText('Every MAJOR and GRAND jackpot', W / 2, 146);
          const grandWon = fame.some((f) => f.jackpot === 'GRAND');
          if (!fame.length) {
            g.font = `36px ${DISPLAY_FONT}`;
            g.fillText('GRAND: not won yet.', W / 2, 300);
            g.fillStyle = '#ffd24a';
            g.fillText('Could be you.', W / 2, 352);
          } else {
            fame.slice(0, 6).forEach((f, i) => {
              const y = 214 + i * 60;
              g.textAlign = 'left';
              g.fillStyle = f.jackpot === 'GRAND' ? '#ffd24a' : '#f4e7cc';
              g.font = `32px ${DISPLAY_FONT}`;
              g.fillText(`${f.jackpot}  ${f.name}`, 70, y);
              g.textAlign = 'right';
              g.fillText(`${formatCredits(f.credits)}`, W - 70, y);
            });
            if (!grandWon) {
              g.textAlign = 'center';
              g.fillStyle = '#ffd24a';
              g.font = `26px ${DISPLAY_FONT}`;
              g.fillText('GRAND: not won yet. Could be you.', W / 2, Hh - 60);
            }
          }
        },
        false,
      );
      mat.map = tex;
      mat.emissiveMap = tex;
      mat.needsUpdate = true;
    }
  }

  // -------------------------------------------------------------------------
  // Play

  /** The camera frames the machine while you stand at the lever. */
  framing(): Framing {
    return frame(1.0, 4.4, -1.6, 0, 4.7, OLD_LUCKY.z, 52);
  }

  /** Keys for a jackpot orbit round the machine. */
  orbit(): Framing[] {
    return [frame(0, 3.8, -3.0, 0, 4.5, OLD_LUCKY.z, 52), frame(-3.6, 5.0, -4.6, 0, 5.0, OLD_LUCKY.z, 52), frame(3.6, 6.0, -4.4, 0, 5.4, OLD_LUCKY.z, 50), frame(0.8, 4.4, -2.8, 0, 4.2, OLD_LUCKY.z, 50)];
  }

  actions(p: PlayerState, act: (label: string, short: string, run: () => void) => SpaceAction): SpaceAction[] {
    const out: SpaceAction[] = [];
    const eco = this.host.eco;
    if (!this.spinning && !this.host.cer.current) {
      const bet = this.host.bet('slot');
      if (!eco.stats) out.push({ ...SPOTS.lever, ...act('Old Lucky is warming up', 'Wait', () => void eco.load()) });
      else out.push({ ...SPOTS.lever, ...act(`Pull the lever (bet ${bet})`, 'Spin', () => void this.spin()) });
    }
    out.push({ ...SPOTS.telegraph, ...act(`Ring the telegraph (bet ${this.nextBet()})`, `Bet ${this.nextBet()}`, () => this.ring()) });
    void p;
    return out;
  }

  private nextBet(): number {
    const chips = chipsFor(this.host.eco.rank, 'slot');
    const i = chips.indexOf(this.host.bet('slot'));
    return chips[(i + 1) % chips.length];
  }

  /** The telegraph: ding ding, and the handle swings to the next bet. */
  ring(): void {
    if (this.spinning) return;
    const next = this.nextBet();
    this.host.setBet(next);
    const chips = chipsFor(this.host.eco.rank, 'slot');
    sound.telegraph(chips.indexOf(next));
    this.clapper = 1;
    this.host.save.update((d) => (d.telegraphTip = true));
    this.paint();
  }

  /** Set by the casino: a one-time bubble over the telegraph after your first spin. */
  tip: (() => void) | null = null;

  /** Kick at the machine cycles the bet too. */
  kickBet(): void {
    this.ring();
  }

  async spin(): Promise<void> {
    const host = this.host;
    const eco = host.eco;
    if (this.spinning || !eco.stats) return;
    const bet = host.bet('slot');
    if (!host.canAfford(bet, 'slot')) return;
    this.spinning = true;
    this.spins++;
    host.tried('slot');
    this.leverT = 0;
    sound.lever();
    sound.steam(false);
    this.puff(0.6);
    eco.hold(bet);
    if (!this.host.ctx.reduceMotion()) this.host.ctx.shake(0.05);
    const started = host.clock();
    for (const r of this.reels) {
      r.stop = null;
      r.speed = 0.01;
    }
    const res = await eco.play<Omit<SlotResult, 'jackpots'> & { jackpots: { grand: number; spins: number } }>('slot', { bet });
    const ts = host.timeScale();
    const landAt = Math.max(host.clock() + 0.35 / ts, started + 0.95 / ts);
    if (!res.ok) {
      // A calm stop where the reels are, and nothing charged.
      this.reels.forEach((r, i) => this.scheduleStop(r, Math.round(r.pos + 2) % N, landAt + (i * 0.25) / ts, 1.2));
      await this.waitLanded();
      eco.release(bet);
      this.spinning = false;
      host.failed(res.error, res.code);
      return;
    }
    const d = res.data;
    this.lastServerStops = d.stops;
    this.reels.forEach((r, i) => this.scheduleStop(r, d.stops[i], landAt + (i * 0.45) / ts));
    await this.waitLanded();
    this.landedAt = host.clock();
    this.lastResult = d;
    this.paylineFlash(d.win > bet ? 1 : 0.4);
    if (d.rule === 'bonus' && d.bonus) {
      await this.bonus(d, bet);
    } else {
      eco.commit(d, bet);
      const label = d.rule && d.rule !== 'bonus' ? PAYTABLE[d.rule]?.label : undefined;
      const tier = host.cer.win({ paid: d.win, staked: bet, at: new THREE.Vector3(0, 0.75, OLD_LUCKY.z + FRONT + 0.3), dir: { x: 0, z: 1 }, label, pile: true });
      if (tier === 'big' || tier === 'mega') this.celebrate = tier === 'mega' ? 4 : 3;
      else if (tier === 'nice' || tier === 'small') this.celebrate = tier === 'nice' ? 1.6 : 0.9;
      if (tier === 'big' || tier === 'mega') this.puff(1);
    }
    this.paint();
    this.spinning = false;
    if (this.spins === 1 && !host.save.data.telegraphTip) this.tip?.();
  }

  /** Three paddles: FULL STEAM on the marquee, then the River Wheel's bonus ring decides. */
  private async bonus(d: SlotResult & { newStamps: string[]; stats: unknown }, bet: number): Promise<void> {
    const host = this.host;
    this.fullSteam = 2.2;
    this.paint();
    sound.whistle(true);
    this.puff(1.4);
    host.kit.banner('PADDLE WHEEL BONUS', { sub: 'Three golden paddles', color: '#ffd24a', ms: 2000 });
    await new Promise((r) => setTimeout(r, 1500 / host.timeScale()));
    await this.onBonus(d.bonus!, bet, d.win);
    this.fullSteam = 0;
    host.eco.commit(d as never, bet);
    const at = new THREE.Vector3(0, 0.75, OLD_LUCKY.z + FRONT + 0.3);
    if (d.bonus!.jackpot) {
      await host.cer.jackpot({ kind: d.bonus!.jackpot, mult: d.bonus!.mult, credits: d.win, bet, orbit: this.orbit(), at, stern: frame(9.5, 3.2, 1.2, 34, 13, 0, 58), onGrand: () => this.onGrand() });
      this.celebrate = 5;
    } else {
      const tier = host.cer.win({ paid: d.win, staked: bet, at, dir: { x: 0, z: 1 }, label: `Bonus ${d.bonus!.mult}x`, pile: true });
      this.celebrate = tier === 'mega' ? 4 : 3;
    }
  }

  /** Set by the casino: the GRAND sets the River Wheel spinning by itself. */
  onGrand: () => void = () => {};

  /** Set by the casino: flies to the River Wheel and spins the bonus ring. */
  onBonus: (bonus: NonNullable<SlotResult['bonus']>, bet: number, win: number) => Promise<void> = async () => {};

  private waitLanded(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => (this.reels.every((r) => !r.stop && r.speed === 0) ? resolve() : setTimeout(check, 30));
      check();
    });
  }

  private scheduleStop(r: Reel, stop: number, at: number, minTravel = 3): void {
    r.stop = { from: 0, to: stop, t0: at, dur: 0, landed: false };
    r.stop.from = minTravel;
  }

  private puff(strength: number): void {
    for (const sx of [-2.05, 2.05]) {
      this.host.fx.steam.burst({ at: { x: sx, y: 9.0, z: OLD_LUCKY.z - 0.4 }, count: Math.round(14 * strength), shape: 'up', speed: [0.8, 2.4 * strength], color: 0xf6f2ea, size: [0.35, 0.7], sizeEnd: 3, life: [1.2, 2.2], gravity: -0.5, drag: 0.6, alpha: 0.55 });
    }
  }

  private paylineFlash(k: number): void {
    this.paylineMat.emissiveIntensity = 0.6 + 2.2 * k;
    this.lampMat.emissiveIntensity = 0.8 + 2.5 * k;
  }

  update(dt: number, opts: { night: number; near: boolean; boost: number }): void {
    const host = this.host;
    const ts = host.timeScale();
    const now = host.clock();
    // Reels.
    this.reels.forEach((r, i) => {
      if (r.stop && now >= r.stop.t0) {
        const s = r.stop;
        if (!s.landed && s.dur === 0) {
          // Plan the landing: at least `from` more cells, ending on the stop, easing out from the spin speed.
          const minTravel = s.from;
          let target = Math.floor(r.pos + minTravel);
          while ((((target % N) + N) % N) !== s.to) target++;
          s.from = r.pos;
          s.dur = Math.max(0.3, (3 * (target - r.pos)) / Math.max(6, r.speed)) / ts;
          s.to = target;
        }
        const k = Math.min(1, (now - s.t0) / s.dur);
        const e = 1 - (1 - k) ** 3;
        // A small bounce past the stop and back.
        const bounce = k > 0.85 ? Math.sin(((k - 0.85) / 0.15) * Math.PI) * 0.08 : 0;
        r.pos = s.from + (s.to - s.from) * e + bounce;
        if (k >= 1) {
          r.pos = s.to;
          r.stop = null;
          r.speed = 0;
          sound.reelStop(i);
        }
      } else if (r.speed > 0) {
        r.speed = Math.min(18, r.speed + dt * 60);
        r.pos += r.speed * dt;
      }
      const cellNow = Math.floor(r.pos);
      if (cellNow !== r.lastCell && (r.speed > 0 || r.stop)) sound.reelTick();
      r.lastCell = cellNow;
      const fast = r.speed > 9 && host.tier() !== 'low';
      const mat = r.mesh.material as THREE.MeshStandardMaterial;
      const want = fast ? r.blur : r.tex;
      if (mat.map !== want) {
        mat.map = want;
        mat.emissiveMap = want;
        mat.needsUpdate = true;
      }
      want.offset.y = (((r.pos % N) + N) % N) / N;
      this.shownStops[i] = ((Math.round(r.pos) % N) + N) % N;
    });
    // Lever: pulled forward fast, springing back with an overshoot.
    if (this.leverT >= 0) {
      this.leverT += dt * ts;
      const t = this.leverT;
      const pull = t < 0.16 ? t / 0.16 : t < 0.7 ? 1 - ((t - 0.16) / 0.54) ** 1.5 + Math.sin(((t - 0.16) / 0.54) * Math.PI) * 0.08 : 0;
      this.lever.rotation.x = -0.18 + Math.max(0, pull) * 1.45;
      if (t > 0.75) {
        this.leverT = -1;
        this.lever.rotation.x = -0.18;
      }
    } else if (opts.near && !this.spinning) {
      // The lever bobs gently to say "pull me".
      this.lever.rotation.x = -0.18 + Math.max(0, Math.sin(now * 3)) * 0.06;
    }
    // Telegraph handle swings to the bet.
    const chips = [10, 25, 50, 100, 250, 500];
    const idx = chips.indexOf(host.bet('slot'));
    const want = Math.PI / 2 - ((idx + 0.5) / 6) * Math.PI;
    this.pointerAngle += (want - this.pointerAngle) * Math.min(1, dt * 8);
    this.pointer.rotation.z = this.pointerAngle + Math.sin(this.clapper * 20) * this.clapper * 0.08;
    this.clapper = Math.max(0, this.clapper - dt * 2);
    // Payline lamps settle back.
    this.paylineMat.emissiveIntensity += (0.6 - this.paylineMat.emissiveIntensity) * Math.min(1, dt * 2);
    this.lampMat.emissiveIntensity += (0.8 + Math.max(0, Math.sin(now * 2)) * 0.3 - this.lampMat.emissiveIntensity) * Math.min(1, dt * 2);
    // Bulbs: a gentle chase, quicker while spinning, gold during a win. Never over 3 flashes a second.
    this.celebrate = Math.max(0, this.celebrate - dt);
    this.fullSteam = Math.max(0, this.fullSteam - dt);
    const hot = this.celebrate > 0 || opts.boost > 0.3;
    const rate = hot ? 2.5 : this.spinning ? 2 : 1;
    const phase = Math.floor(now * rate * 2);
    const n = this.bulbInfo.length;
    for (let i = 0; i < n; i++) {
      const b = this.bulbInfo[i];
      let on: boolean;
      if (hot) on = (b.i + phase) % 2 === 0;
      else if (this.spinning) on = (b.i + phase) % 4 < 2;
      else on = (b.i + phase) % 6 < 3;
      const base = hot ? '#ffd24a' : b.kind === 'arch' ? C.bulb : '#fff0c8';
      this.bulbColor.set(base).multiplyScalar(on ? 1.2 : 0.3 + opts.night * 0.05);
      this.bulbs.setColorAt(i, this.bulbColor);
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
    // The rug glows until you have pulled the lever once.
    this.rimMat.emissiveIntensity = host.save.data.tried.slot ? 0.12 : 0.18 + Math.max(0, Math.sin(now * 2.4)) * 0.35;
    if (this.fullSteam > 0 && Math.floor(now * 4) !== Math.floor((now - dt) * 4)) this.puff(0.5);
    this.paint();
  }

  get landedAgo(): number {
    return this.host.clock() - this.landedAt;
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.bulbs.dispose();
  }
}

export const SLOT_GAME: GameId = 'slot';
export { BONUS_RING };
