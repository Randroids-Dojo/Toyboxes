// The Wheelhouse, opened at First Mate: the ship's wheel steers the view
// outside (the town's own time, a golden sunset, or moonlight; kept on this
// device), the Captains' brass board, a binnacle and the ship's bell. The
// Captain's Table itself is the high-limit blackjack table (games/blackjack).

import * as THREE from 'three';
import type { PlayerState, SpaceAction } from '../../world/space';
import { DISPLAY_FONT } from '../../world/kit';
import { sound } from './audio';
import { Batch } from './batch';
import type { BoardRow } from './economy';
import type { Host } from './host';
import { HELM, SPOTS, WHEELHOUSE } from './layout';
import { C, canvasTex } from './materials';
import type { River, Scenery } from './river';

const ORDER: Scenery[] = ['town', 'sunset', 'moon'];
const SAY: Record<Scenery, string> = { town: 'Steering by the town clock.', sunset: 'Steering into a golden sunset.', moon: 'Steering by moonlight.' };

export class Wheelhouse {
  private wheel = new THREE.Group();
  private spin = 0;
  private spinV = 0;
  private bell = new THREE.Group();
  private bellT = 0;
  private boardTex: THREE.CanvasTexture;
  private boardKey = '';
  private owned: { dispose(): void }[] = [];
  /** The Captains' board and frame, hung on the partition by the casino. */
  readonly plaques: THREE.Object3D[] = [];

  constructor(
    private host: Host,
    private river: River,
  ) {
    const own = <X extends { dispose(): void }>(x: X): X => {
      this.owned.push(x);
      return x;
    };
    const m = host.mats;
    const s = host.scene;
    // The ship's wheel on its pedestal, facing aft towards you.
    const ped = new Batch();
    ped.add(new THREE.BoxGeometry(0.5, 1.05, 0.5), m.trim, HELM.x, 0.525, HELM.z, 0, 0, 0, C.mahogany);
    ped.add(new THREE.BoxGeometry(0.56, 0.06, 0.56), m.brass, HELM.x, 1.06, HELM.z);
    ped.build(s);
    this.wheel.position.set(HELM.x + 0.32, 1.35, HELM.z);
    this.wheel.rotation.y = Math.PI / 2;
    const wb = new Batch();
    wb.add(new THREE.TorusGeometry(0.62, 0.05, 10, 40), m.trim, 0, 0, 0, 0, 0, 0, C.mahoganyLit);
    wb.add(new THREE.TorusGeometry(0.3, 0.03, 8, 30), m.trim, 0, 0, 0, 0, 0, 0, C.mahoganyLit);
    wb.add(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 16).rotateX(Math.PI / 2), m.brass, 0, 0, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      wb.add(new THREE.CylinderGeometry(0.025, 0.03, 0.62, 8).rotateZ(a + Math.PI / 2), m.trim, Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0, 0, 0, 0, C.mahoganyLit);
      // Turned handles beyond the rim.
      wb.add(new THREE.CylinderGeometry(0.035, 0.025, 0.24, 8).rotateZ(a + Math.PI / 2), m.trim, Math.cos(a) * 0.78, Math.sin(a) * 0.78, 0, 0, 0, 0, C.mahoganyLit);
      wb.add(new THREE.SphereGeometry(0.04, 8, 6), m.brass, Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0);
    }
    wb.build(this.wheel);
    s.add(this.wheel);
    // A binnacle with a compass, and the ship's bell on a bracket.
    const bn = new Batch();
    bn.add(new THREE.CylinderGeometry(0.18, 0.24, 1.0, 16), m.trim, HELM.x + 1.2, 0.5, HELM.z + 1.3, 0, 0, 0, C.mahogany);
    bn.add(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.brass, HELM.x + 1.2, 1.0, HELM.z + 1.3);
    bn.add(new THREE.BoxGeometry(0.08, 0.6, 0.08), m.brass, HELM.x + 1.2, 1.35, HELM.z - 1.6);
    bn.add(new THREE.BoxGeometry(0.4, 0.06, 0.08), m.brass, HELM.x + 1.05, 1.62, HELM.z - 1.6);
    bn.build(s);
    this.bell.position.set(HELM.x + 0.9, 1.55, HELM.z - 1.6);
    const bellMesh = new THREE.Mesh(own(new THREE.LatheGeometry(([[0, 0], [0.04, -0.01], [0.09, -0.08], [0.13, -0.22], [0.15, -0.26], [0.13, -0.26], [0, -0.24]] as [number, number][]).map(([r, y]) => new THREE.Vector2(r, y)), 18)), m.brass);
    this.bell.add(bellMesh);
    s.add(this.bell);
    // The Captains' board on the partition, facing the wheelhouse.
    this.boardTex = own(canvasTex(768, 512, () => {}, false));
    const board = new THREE.Mesh(own(new THREE.PlaneGeometry(2.1, 1.4)), own(new THREE.MeshStandardMaterial({ map: this.boardTex, emissive: new THREE.Color('#ffffff'), emissiveMap: this.boardTex, emissiveIntensity: 0.3, roughness: 0.4, metalness: 0.2 })));
    // Three centimetres in front of its brass frame, so the two never share a plane.
    board.position.set(WHEELHOUSE.x1 - 0.18, 2.6, 3.2);
    board.rotation.y = -Math.PI / 2;
    const frameMesh = new THREE.Mesh(own(new THREE.BoxGeometry(0.04, 1.56, 2.26)), m.brass);
    frameMesh.position.set(WHEELHOUSE.x1 - 0.13, 2.6, 3.2);
    s.add(board, frameMesh);
    this.plaques.push(board, frameMesh);
    this.paintBoard();
  }

  private paintBoard(): void {
    const rows: BoardRow[] = this.host.eco.boards.captains;
    const key = JSON.stringify(rows.slice(0, 8));
    if (key === this.boardKey) return;
    this.boardKey = key;
    const c = this.boardTex.image as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#e0ac45');
    grd.addColorStop(0.5, '#f2c463');
    grd.addColorStop(1, '#a8782c');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#5a3a08';
    g.lineWidth = 6;
    g.strokeRect(18, 18, W - 36, H - 36);
    g.fillStyle = '#3a2408';
    g.textAlign = 'center';
    g.font = `60px ${DISPLAY_FONT}`;
    g.fillText('CAPTAINS', W / 2, 92);
    g.font = `30px ${DISPLAY_FONT}`;
    if (!rows.length) {
      g.fillText('No Captains yet.', W / 2, 250);
      g.fillText('Collect 26 stamps to be the first.', W / 2, 300);
    } else rows.slice(0, 8).forEach((r, i) => g.fillText(`${r.name}  ·  ${r.value} stamps`, W / 2, 160 + i * 42));
    this.boardTex.needsUpdate = true;
  }

  actions(_p: PlayerState, act: (label: string, short: string, run: () => void) => SpaceAction): SpaceAction[] {
    if (this.host.eco.rank < 2) return [];
    const next = ORDER[(ORDER.indexOf(this.river.scenery) + 1) % ORDER.length];
    const label = next === 'town' ? 'Steer by the town clock' : next === 'sunset' ? 'Steer into the sunset' : 'Steer by moonlight';
    return [{ ...SPOTS.helm, ...act(label, 'Steer', () => this.steer()) }];
  }

  private steer(): void {
    const next = ORDER[(ORDER.indexOf(this.river.scenery) + 1) % ORDER.length];
    this.river.scenery = next;
    this.host.save.update((d) => (d.scenery = next));
    this.spinV = 9;
    this.ringBell();
    this.host.ctx.ui.toast(SAY[next]);
    this.host.ctx.swing();
  }

  ringBell(): void {
    this.bellT = 1.4;
    sound.bell(1);
  }

  update(dt: number): void {
    this.spin += this.spinV * dt;
    this.spinV *= Math.exp(-dt * 1.8);
    this.wheel.rotation.z = this.spin;
    this.bellT = Math.max(0, this.bellT - dt);
    this.bell.rotation.x = Math.sin(this.bellT * 14) * this.bellT * 0.25;
    this.paintBoard();
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
  }
}
