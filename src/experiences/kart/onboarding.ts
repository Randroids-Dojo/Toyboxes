// Learning in the world: tip boards beside the road at the exact spot each
// skill is needed, painted with this device's own controls ("Hold Space to
// drift", "Hold X to drift", "OK to drift"), and Bolt's speech bubbles on
// the warm-up lap. Nothing here is a wall of text.

import * as THREE from 'three';
import { DISPLAY_FONT, roundRect } from '../../world/kit';
import { circle, type Collider } from '../../world/physics';
import { EDGE, type Circuit } from './circuit';

export type Controls = 'kbm' | 'touch' | 'pad' | 'remote';

interface Tip {
  s: number;
  /** Words around the control: [before, control, after]. */
  text: (c: Controls) => [string, string, string];
}

const KEY: Record<string, Record<Controls, string>> = {
  gas: { kbm: 'W', touch: 'Auto', pad: 'RT', remote: 'Auto' },
  drift: { kbm: 'Space', touch: 'Brake', pad: 'X', remote: 'OK' },
  item: { kbm: 'E', touch: 'Action', pad: 'A', remote: 'Up' },
};

const TIPS: Tip[] = [
  { s: 14, text: () => ['Orange pads', 'BOOST', 'you'] },
  { s: 60, text: (c) => (c === 'remote' ? ['Turn, then', 'OK', 'to drift'] : ['Hold', KEY.drift[c], 'while turning']) },
  { s: 96, text: (c) => (c === 'remote' ? ['Press', 'OK', 'again: boost!'] : ['Let go of', KEY.drift[c], 'for a boost']) },
  { s: 104, text: () => ['Drive through a', '?', 'capsule'] },
  { s: 150, text: (c) => ['Use your item with', KEY.item[c], ''] },
  { s: 262, text: () => ['Long drifts:', 'BLUE', 'then orange sparks'] },
];

function paint(g: CanvasRenderingContext2D, w: number, h: number, [a, key, b]: [string, string, string]): void {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#1d1830';
  roundRect(g, 0, 0, w, h, 40);
  g.fill();
  g.lineWidth = 12;
  g.strokeStyle = '#ffd24a';
  roundRect(g, 6, 6, w - 12, h - 12, 34);
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fffaf0';
  g.font = `600 40px system-ui`;
  g.fillText(a, w / 2, h * 0.24, w * 0.9);
  // The control in a key cap.
  g.font = `${key.length > 3 ? 64 : 80}px ${DISPLAY_FONT}`;
  const kw = Math.max(110, g.measureText(key).width + 50);
  g.fillStyle = '#ffd24a';
  roundRect(g, w / 2 - kw / 2, h * 0.38, kw, h * 0.3, 18);
  g.fill();
  g.fillStyle = '#1d1830';
  g.fillText(key, w / 2, h * 0.535);
  g.fillStyle = '#fffaf0';
  g.font = `600 40px system-ui`;
  g.fillText(b, w / 2, h * 0.84, w * 0.9);
}

export class TipBoards {
  readonly group = new THREE.Group();
  /** The posts, for the world's colliders. */
  readonly colliders: Collider[] = [];
  private boards: { tip: Tip; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture }[] = [];
  private shown: Controls | null = null;

  constructor(c: Circuit) {
    const post = new THREE.MeshStandardMaterial({ color: '#2f3a56', roughness: 0.6 });
    const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.2, 8);
    for (const tip of TIPS) {
      if (tip.s > c.length - 50) continue;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 320;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.25, roughness: 0.6 });
      const board = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.5), mat);
      // On the outside of the road, angled toward oncoming karts.
      const f = c.frame(tip.s);
      const turn = c.path.turnAhead(tip.s - 6, 14);
      const side = Math.abs(turn) > 0.05 ? (turn > 0 ? -1 : 1) : c.inside(f.x + f.nx * 20, f.z + f.nz * 20) ? -1 : 1;
      const x = f.x + f.nx * side * (EDGE + 4.2);
      const z = f.z + f.nz * side * (EDGE + 4.2);
      for (const px of [-1.4, 1.4]) {
        const yaw = Math.atan2(-f.tx, -f.tz) - side * 0.3;
        this.colliders.push(circle(x + Math.cos(yaw) * px, z - Math.sin(yaw) * px, 0.2, 3.2, 0.4, false));
      }
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = Math.atan2(-f.tx, -f.tz) - side * 0.3;
      board.position.y = 3.2;
      g.add(board);
      for (const px of [-1.4, 1.4]) {
        const p = new THREE.Mesh(postGeo, post);
        p.position.set(px, 1.6, -0.06);
        g.add(p);
      }
      this.group.add(g);
      this.boards.push({ tip, canvas, tex });
    }
    this.group.visible = false;
  }

  /** Repaints the boards for this device when it changes. */
  update(controls: Controls): void {
    if (controls === this.shown) return;
    this.shown = controls;
    for (const b of this.boards) {
      paint(b.canvas.getContext('2d')!, b.canvas.width, b.canvas.height, b.tip.text(controls));
      b.tex.needsUpdate = true;
    }
  }

  show(on: boolean): void {
    this.group.visible = on;
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.map?.dispose();
      mat.dispose();
    });
  }
}

/** What Bolt says on the warm-up lap, by where you both are. Five words at most. */
export function boltLine(s: number, stage: { drifted: boolean; turbo: boolean; item: boolean }): string {
  if (s < 12 || s > 540) return 'Follow me!';
  if (s < 40) return 'Boost pads go fast!';
  if (s < 100) return stage.drifted ? 'Nice drift!' : 'Drift through here!';
  if (s < 135) return 'Grab a capsule!';
  if (s < 200) return stage.item ? 'Great throw!' : 'Now use your item!';
  if (s < 300) return stage.turbo ? 'Blue sparks, nice!' : 'Hold drifts longer!';
  return 'Almost there!';
}

/** A speech bubble sprite that can be repainted. */
export class Bubble {
  readonly sprite: THREE.Sprite;
  private canvas = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private text = '';

  constructor() {
    this.canvas.width = 512;
    this.canvas.height = 160;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    // A touch under white so bloom never washes the words out.
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthWrite: false, transparent: true, color: '#e6dfcf' }));
    this.sprite.scale.set(3.2, 1, 1);
    this.sprite.position.set(0, 3.3, 0);
    this.sprite.visible = false;
  }

  say(text: string): void {
    if (text === this.text) return;
    this.text = text;
    const g = this.canvas.getContext('2d')!;
    const w = this.canvas.width;
    const h = this.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#fffaf0';
    g.strokeStyle = '#1d1830';
    g.lineWidth = 8;
    roundRect(g, 8, 8, w - 16, h - 46, 40);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(w / 2 - 22, h - 40);
    g.lineTo(w / 2, h - 8);
    g.lineTo(w / 2 + 22, h - 40);
    g.fill();
    g.fillStyle = '#1d1830';
    g.font = `60px ${DISPLAY_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, (h - 38) / 2 + 6, w - 60);
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.tex.dispose();
    this.sprite.material.dispose();
  }
}
