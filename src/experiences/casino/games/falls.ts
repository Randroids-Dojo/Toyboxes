// Lucky Falls: a pearl drops through twelve rows of brass pegs into one of
// thirteen bins. The server picks the twelve bounces; the pearl follows them
// peg by peg, each peg rings a note, and the bin bursts with light. Three
// risks share the board: calm, lively and wild. Up to five pearls fall at
// once.

import * as THREE from 'three';
import { FALLS_BINS, FALLS_LABEL, FALLS_MAX_PEARLS, FALLS_ROWS, FALLS_RISKS, fallsChances, fallsExpected, type FallsRisk } from '../../../shared/casino/plinko';
import type { PlayerState, SpaceAction } from '../../../world/space';
import { button, h } from '../../../ui/ui';
import { DISPLAY_FONT } from '../../../world/kit';
import { formatCredits } from '../../common';
import { sound } from '../audio';
import { Batch } from '../batch';
import { frame, type Framing } from '../director';
import type { Host } from '../host';
import { FALLS, SPOTS } from '../layout';
import { canvasTex } from '../materials';
import { TablePanel, oddsTable } from '../panel';

const N_BINS = FALLS_ROWS + 1;
const SPACING = 0.265;
const ROW_H = 0.245;
const TOP_Y = 4.15;
const BIN_Y = 0.98;
const FACE_Z = 0.42;
const PEARL_R = 0.075;

/** Where the pearl touches the peg it meets in `row` after `rights` bounces to the right. */
function pegAt(row: number, rights: number): THREE.Vector2 {
  return new THREE.Vector2((rights - row / 2) * SPACING, TOP_Y - row * ROW_H);
}

interface Pearl {
  mesh: THREE.Mesh;
  bits: number[];
  risk: FallsRisk;
  t: number;
  /** Seconds per row. */
  step: number;
  wait: number;
  lastRow: number;
  done: boolean;
  resolve: () => void;
}

export class LuckyFalls {
  readonly group = new THREE.Group();
  private pegs: THREE.InstancedMesh;
  private pegFlash: number[] = [];
  private col = new THREE.Color();
  private pearls: Pearl[] = [];
  private pearlGeo: THREE.SphereGeometry;
  private pearlMat: THREE.MeshStandardMaterial;
  private binTex: THREE.CanvasTexture;
  private binKey = '';
  private binGlow: number[] = new Array(N_BINS).fill(0);
  private binMeshes: THREE.Mesh[] = [];
  private fallMat: THREE.MeshBasicMaterial;
  private fallGlow = 0;
  private owned: { dispose(): void }[] = [];
  private panel: TablePanel | null = null;
  private risk: FallsRisk = 'calm';
  private riskBtns = new Map<FallsRisk, HTMLButtonElement>();
  private dropBtn: HTMLButtonElement | null = null;
  private railEl: HTMLElement | null = null;
  private inFlight = 0;
  history: { mult: number; risk: FallsRisk }[] = [];
  /** For playtests. */
  lastBits: number[] | null = null;
  shownBins: number[] = [];
  drops = 0;

  constructor(private host: Host) {
    const own = <X extends { dispose(): void }>(x: X): X => {
      this.owned.push(x);
      return x;
    };
    const m = host.mats;
    const g = this.group;
    g.position.set(FALLS.x, 0, FALLS.z);
    host.scene.add(g);
    // The tower: a plinth, a tall backboard shaped like a waterfall, and a brass frame.
    const b = new Batch();
    const brass = new Batch();
    b.add(new THREE.BoxGeometry(FALLS.w + 0.3, 0.5, 0.9), m.trim, 0, 0.25, 0, 0, 0, 0, '#1c1f45');
    brass.add(new THREE.BoxGeometry(FALLS.w + 0.34, 0.05, 0.94), m.brass, 0, 0.52, 0);
    const shape = new THREE.Shape();
    shape.moveTo(-FALLS.w / 2, 0);
    shape.lineTo(FALLS.w / 2, 0);
    shape.lineTo(FALLS.w / 2, 1.2);
    shape.quadraticCurveTo(FALLS.w / 2 - 0.1, 3.4, 0.55, FALLS.h - 0.35);
    shape.quadraticCurveTo(0, FALLS.h + 0.25, -0.55, FALLS.h - 0.35);
    shape.quadraticCurveTo(-FALLS.w / 2 + 0.1, 3.4, -FALLS.w / 2, 1.2);
    shape.closePath();
    b.add(new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false, curveSegments: 16 }), m.trim, 0, 0.52, 0.0, 0, 0, 0, '#262a5c');
    b.build(g);
    // The face: deep night blue with silver ripples, a few stars.
    const face = own(
      canvasTex(
        512,
        768,
        (cg, W, H) => {
          const grd = cg.createLinearGradient(0, 0, 0, H);
          grd.addColorStop(0, '#141738');
          grd.addColorStop(1, '#2b3270');
          cg.fillStyle = grd;
          cg.fillRect(0, 0, W, H);
          cg.strokeStyle = 'rgba(159,183,232,0.14)';
          cg.lineWidth = 3;
          for (let i = 0; i < 26; i++) {
            const y = (i / 26) * H;
            cg.beginPath();
            for (let x = 0; x <= W; x += 16) cg.lineTo(x, y + Math.sin(x * 0.03 + i) * 6);
            cg.stroke();
          }
          cg.fillStyle = 'rgba(207,227,255,0.8)';
          for (let i = 0; i < 40; i++) {
            cg.beginPath();
            cg.arc(Math.random() * W, Math.random() * H * 0.5, 1 + Math.random() * 2, 0, Math.PI * 2);
            cg.fill();
          }
          cg.fillStyle = '#cfe3ff';
          cg.font = `54px ${DISPLAY_FONT}`;
          cg.textAlign = 'center';
          cg.fillText('LUCKY FALLS', W / 2, 70);
        },
        false,
      ),
    );
    const faceGeo = own(new THREE.ShapeGeometry(shape, 16));
    const uv = faceGeo.attributes.uv;
    const pos = faceGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + FALLS.w / 2) / FALLS.w, pos.getY(i) / (FALLS.h + 0.25));
    const faceMesh = new THREE.Mesh(faceGeo, own(new THREE.MeshStandardMaterial({ map: face, roughness: 0.6, emissive: new THREE.Color('#ffffff'), emissiveMap: face, emissiveIntensity: 0.18 })));
    faceMesh.position.set(0, 0.52, 0.305);
    g.add(faceMesh);
    // The glow that pours down the board for an edge bin.
    this.fallMat = own(new THREE.MeshBasicMaterial({ color: '#cfe3ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    const fall = new THREE.Mesh(faceGeo, this.fallMat);
    fall.position.set(0, 0.52, 0.31);
    g.add(fall);
    // Pegs: one instanced mesh, flashing per peg.
    const pegGeo = own(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10).rotateX(Math.PI / 2));
    const count = (FALLS_ROWS * (FALLS_ROWS + 1)) / 2;
    this.pegs = new THREE.InstancedMesh(pegGeo, own(new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.0, metalness: 0.6, roughness: 0.3 })), count);
    const mm = new THREE.Matrix4();
    let k = 0;
    for (let r = 0; r < FALLS_ROWS; r++)
      for (let j = 0; j <= r; j++) {
        const p = pegAt(r, j);
        this.pegs.setMatrixAt(k, mm.makeTranslation(p.x, p.y, FACE_Z - 0.04));
        this.pegs.setColorAt(k, this.col.set('#d9a838'));
        this.pegFlash.push(0);
        k++;
      }
    this.pegs.castShadow = true;
    g.add(this.pegs);
    // The chute at the top.
    brass.add(new THREE.CylinderGeometry(0.22, 0.08, 0.3, 16, 1, true), m.brass, 0, TOP_Y + 0.42, FACE_Z);
    brass.add(new THREE.TorusGeometry(0.22, 0.025, 6, 20).rotateX(Math.PI / 2), m.brass, 0, TOP_Y + 0.57, FACE_Z);
    // Bins: dividers and a lit label strip.
    for (let i = 0; i <= N_BINS; i++) brass.add(new THREE.BoxGeometry(0.025, 0.42, 0.2), m.brass, (i - N_BINS / 2) * SPACING, BIN_Y + 0.05, FACE_Z);
    brass.add(new THREE.BoxGeometry(N_BINS * SPACING + 0.06, 0.04, 0.24), m.brass, 0, BIN_Y - 0.16, FACE_Z);
    brass.build(g);
    this.binTex = own(canvasTex(1024, 128, () => {}, false));
    const strip = new THREE.Mesh(own(new THREE.PlaneGeometry(N_BINS * SPACING, 0.34)), own(new THREE.MeshStandardMaterial({ map: this.binTex, emissive: new THREE.Color('#ffffff'), emissiveMap: this.binTex, emissiveIntensity: 0.5, roughness: 0.5 })));
    strip.position.set(0, BIN_Y - 0.38, 0.485);
    g.add(strip);
    // A glow in each bin, lit when a pearl lands.
    const binGlowGeo = own(new THREE.PlaneGeometry(SPACING - 0.03, 0.4));
    for (let i = 0; i < N_BINS; i++) {
      const mat = own(new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      const bm = new THREE.Mesh(binGlowGeo, mat);
      bm.position.set((i - (N_BINS - 1) / 2) * SPACING, BIN_Y + 0.05, FACE_Z - 0.06);
      g.add(bm);
      this.binMeshes.push(bm);
    }
    this.pearlGeo = own(new THREE.SphereGeometry(PEARL_R, 18, 14));
    this.pearlMat = own(new THREE.MeshStandardMaterial({ color: '#fff8f0', roughness: 0.15, metalness: 0.25, emissive: new THREE.Color('#cfe3ff'), emissiveIntensity: 0.25 }));
    this.paintBins();
  }

  private paintBins(): void {
    const key = this.risk;
    if (key === this.binKey) return;
    this.binKey = key;
    const c = this.binTex.image as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    g.fillStyle = '#13212b';
    g.fillRect(0, 0, W, H);
    const bins = FALLS_BINS[this.risk];
    const w = W / N_BINS;
    bins.forEach((v, i) => {
      const hot = v >= 5;
      const good = v > 1;
      g.fillStyle = hot ? '#d39a32' : good ? '#2f5a4a' : v === 1 ? '#22394a' : '#1a2430';
      g.fillRect(i * w + 3, 6, w - 6, H - 12);
      g.fillStyle = hot ? '#1d1408' : '#f4e7cc';
      g.font = `${v >= 100 ? 30 : 36}px ${DISPLAY_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(`${v}x`, i * w + w / 2, H / 2 + 2);
    });
    this.binTex.needsUpdate = true;
  }

  // -------------------------------------------------------------------------

  /** From across the lounge and to the left (you stand to the right), the whole board above the compact panel. */
  framing(): Framing {
    return frame(FALLS.x - 2.2, 3.3, FALLS.z + 11.4, FALLS.x - 0.2, 0.55, FALLS.z, 50);
  }

  actions(_p: PlayerState, act: (label: string, short: string, run: () => void) => SpaceAction): SpaceAction[] {
    if (!this.host.eco.stats || this.host.eco.rank < 1) return [];
    return [{ ...SPOTS.falls, ...act('Drop pearls at Lucky Falls', 'Falls', () => this.open()) }];
  }

  open(): void {
    if (this.panel?.open) return;
    const host = this.host;
    const risks = h('div', { class: 'lf-risks', role: 'group', 'aria-label': 'Risk' });
    this.riskBtns.clear();
    for (const r of FALLS_RISKS) {
      const b = button(FALLS_LABEL[r], () => this.setRisk(r), `lf-risk lf-${r}`);
      b.setAttribute('aria-pressed', 'false');
      this.riskBtns.set(r, b);
      risks.appendChild(b);
    }
    this.railEl = h('div', { class: 'lf-rail', 'aria-label': 'Last pearls' });
    this.dropBtn = button('Drop a pearl', () => void this.drop(), 'primary');
    const panel = new TablePanel(host, {
      id: 'falls',
      title: 'Lucky Falls',
      game: 'falls',
      chips: 'bet',
      coach: 'Pick calm, lively or wild, then drop pearls.',
      help: ['Pick a bet and a risk: calm wins often, wild wins big but rarely.', 'Drop a pearl. It bounces off twelve pegs into a bin, and the bin pays its number times your bet.', 'Up to five pearls can fall at once.'],
      odds: () => {
        const ch = fallsChances();
        const bins = FALLS_BINS[this.risk];
        const rows: [string, string, string][] = [];
        for (let i = 0; i <= FALLS_ROWS / 2; i++) {
          const p = i === FALLS_ROWS / 2 ? ch[i] : ch[i] * 2;
          rows.push([i === FALLS_ROWS / 2 ? 'The middle bin' : `${i === 0 ? 'The edge bins' : `Bins ${i + 1} in from the edge`}`, `${bins[i]}x`, `1 in ${Math.round(1 / p)}`]);
        }
        return oddsTable(rows, `${FALLS_LABEL[this.risk]} returns about ${Math.round(fallsExpected(this.risk) * 100)} in 100 over time. Wins round down to whole credits.`);
      },
      initial: () => this.dropBtn,
      onClose: () => host.director.setSeat(null),
    });
    // Risk sits beside the chips, so the panel stays one row shorter and the board stays in view.
    panel.el.querySelector('.gp-chip-wrap')?.append(h('span', { class: 'gp-chip-label lf-risk-label' }, 'Risk'), risks);
    panel.actions.prepend(this.railEl);
    panel.actions.append(this.dropBtn);
    panel.el.classList.add('compact');
    this.panel = panel;
    this.paintPanel();
    panel.status(`${FALLS_LABEL[this.risk]} waters. Drop a pearl.`);
    panel.show();
    host.director.setSeat(this.framing());
    host.tried('falls');
  }

  private setRisk(r: FallsRisk): void {
    if (this.inFlight) {
      this.panel?.status('Wait for the pearls to land before changing the risk.', 'bad');
      return;
    }
    this.risk = r;
    sound.click();
    this.paintBins();
    this.paintPanel();
    this.panel?.status(r === 'calm' ? 'Calm waters: small wins, often.' : r === 'lively' ? 'Lively: bigger swings.' : 'Wild: rare big wins at the edges.');
  }

  private paintPanel(): void {
    for (const [r, b] of this.riskBtns) {
      b.classList.toggle('on', r === this.risk);
      b.setAttribute('aria-pressed', String(r === this.risk));
    }
    if (this.dropBtn) {
      this.dropBtn.disabled = this.inFlight >= FALLS_MAX_PEARLS;
      this.dropBtn.textContent = this.inFlight ? `Drop another (${this.inFlight} falling)` : 'Drop a pearl';
    }
    if (this.panel) {
      this.panel.locked = this.inFlight > 0;
      this.panel.paintChips();
    }
    this.railEl?.replaceChildren(h('small', {}, 'Last'), ...this.history.slice(0, 8).map((x) => h('span', { class: `lf-pill${x.mult > 1 ? ' up' : x.mult === 1 ? ' even' : ''}` }, `${x.mult}x`)));
  }

  async drop(): Promise<void> {
    const host = this.host;
    const p = this.panel;
    if (!p || this.inFlight >= FALLS_MAX_PEARLS) return;
    const bet = p.chip;
    if (!host.canAfford(bet, 'falls')) return;
    host.eco.hold(bet);
    this.inFlight++;
    this.drops++;
    this.paintPanel();
    const risk = this.risk;
    // The pearl wobbles in the chute while the server picks its bounces.
    const mesh = new THREE.Mesh(this.pearlGeo, this.pearlMat);
    mesh.castShadow = true;
    mesh.position.set(0, TOP_Y + 0.4, FACE_Z);
    this.group.add(mesh);
    const pearl: Pearl = { mesh, bits: [], risk, t: 0, step: 0.24 / host.timeScale(), wait: 0.35 / host.timeScale(), lastRow: -1, done: false, resolve: () => {} };
    this.pearls.push(pearl);
    sound.chip();
    const res = await host.eco.play<{ bits: number[]; bin: number; mult: number; win: number }>('falls', { bet, risk });
    if (!res.ok) {
      this.group.remove(mesh);
      this.pearls = this.pearls.filter((x) => x !== pearl);
      host.eco.release(bet);
      this.inFlight--;
      this.paintPanel();
      p.status("Couldn't reach the boat. Your credits weren't touched.", 'bad');
      host.failed(res.error, res.code);
      return;
    }
    const d = res.data;
    this.lastBits = d.bits;
    pearl.bits = d.bits;
    await new Promise<void>((resolve) => (pearl.resolve = resolve));
    // Landed.
    this.group.remove(mesh);
    this.shownBins.unshift(pearl.bits.reduce((a, b) => a + b, 0));
    this.history.unshift({ mult: d.mult, risk });
    this.binGlow[d.bin] = 1;
    sound.bin(d.mult);
    host.eco.commit(d, bet);
    const at = this.group.localToWorld(new THREE.Vector3((d.bin - (N_BINS - 1) / 2) * SPACING, BIN_Y + 0.2, FACE_Z + 0.1));
    host.kit.pop(`${d.mult}x`, at, { color: d.mult > 1 ? '#ffd24a' : '#cfe3ff', size: d.mult >= 5 ? 2 : 1.3, life: 1.2, rise: 0.5 });
    host.kit.update(0);
    host.fx.glow.burst({ at, count: d.mult >= 5 ? 40 : 14, speed: [0.5, 2], color: d.mult > 1 ? [0xffd24a, 0xfff0c0] : [0x9fb7e8, 0xcfe3ff], size: [0.12, 0.3], life: [0.4, 0.9], gravity: -0.5 });
    if (d.bin === 0 || d.bin === FALLS_ROWS) {
      this.fallGlow = 1;
      sound.arpeggio();
      if (risk === 'wild') host.kit.banner('OVER THE FALLS', { sub: `${d.mult}x: ${formatCredits(d.win)}`, color: '#cfe3ff', ms: 2600 });
      if (!host.ctx.reduceMotion()) host.ctx.shake(0.12);
    }
    if (d.win > bet && d.mult >= 5) host.cer.win({ paid: d.win, staked: bet, at, dir: { x: 0, z: 1 }, quiet: true });
    this.inFlight--;
    p.status(d.win > bet ? `${d.mult}x: you win ${formatCredits(d.win)}!` : d.win === bet ? `${d.mult}x: your bet comes back.` : `${d.mult}x: ${formatCredits(d.win)} back.`, d.win > bet ? 'good' : '');
    this.paintPanel();
  }

  update(dt: number): void {
    const n = this.pegFlash.length;
    for (const pearl of this.pearls) {
      if (pearl.done) continue;
      if (!pearl.bits.length || pearl.wait > 0) {
        // Wobbling in the chute.
        if (pearl.bits.length) pearl.wait -= dt;
        pearl.t += dt;
        pearl.mesh.position.x = Math.sin(pearl.t * 30) * 0.02;
        continue;
      }
      pearl.t += dt / pearl.step;
      const rowF = Math.min(FALLS_ROWS + 0.999, pearl.t);
      const row = Math.floor(rowF);
      const f = rowF - row;
      let rights = 0;
      for (let i = 0; i < row && i < pearl.bits.length; i++) rights += pearl.bits[i];
      let from: THREE.Vector2;
      let to: THREE.Vector2;
      if (row === 0) {
        from = new THREE.Vector2(0, TOP_Y + 0.4);
        to = pegAt(0, 0).add(new THREE.Vector2(0, PEARL_R + 0.03));
      } else {
        from = pegAt(row - 1, rights - (pearl.bits[row - 1] ?? 0)).add(new THREE.Vector2(0, PEARL_R + 0.03));
        to = row < FALLS_ROWS ? pegAt(row, rights).add(new THREE.Vector2(0, PEARL_R + 0.03)) : new THREE.Vector2((rights - FALLS_ROWS / 2) * SPACING, BIN_Y);
      }
      // A little hop off each peg: up, then down onto the next.
      const x = from.x + (to.x - from.x) * f;
      const y = from.y + (to.y - from.y) * f + Math.sin(f * Math.PI) * 0.09;
      pearl.mesh.position.set(x, y, FACE_Z + 0.02);
      const squash = 1 - Math.max(0, 0.25 - f) * 1.2;
      pearl.mesh.scale.set(2 - squash, squash, 1);
      // Entering a new row means the pearl just struck the previous row's peg: it flashes and sings.
      if (row !== pearl.lastRow) {
        if (pearl.lastRow >= 0 && pearl.lastRow < FALLS_ROWS) {
          const rr = pearl.lastRow;
          const jj = rights - (pearl.bits[row - 1] ?? 0);
          const idx = (rr * (rr + 1)) / 2 + jj;
          if (idx >= 0 && idx < n) this.pegFlash[idx] = 1;
          sound.peg(rr, jj);
        }
        pearl.lastRow = row;
      }
      if (pearl.t >= FALLS_ROWS + 0.999) {
        pearl.done = true;
        pearl.resolve();
      }
    }
    this.pearls = this.pearls.filter((p) => !p.done);
    let flashing = false;
    for (let i = 0; i < n; i++) {
      if (this.pegFlash[i] <= 0) continue;
      flashing = true;
      this.pegFlash[i] = Math.max(0, this.pegFlash[i] - dt * 3);
      this.pegs.setColorAt(i, this.col.set('#d9a838').lerp(new THREE.Color('#ffffff'), this.pegFlash[i]));
    }
    if (flashing && this.pegs.instanceColor) this.pegs.instanceColor.needsUpdate = true;
    this.binMeshes.forEach((bm, i) => {
      this.binGlow[i] = Math.max(0, this.binGlow[i] - dt * 1.2);
      (bm.material as THREE.MeshBasicMaterial).opacity = this.binGlow[i] * 0.8;
    });
    this.fallGlow = Math.max(0, this.fallGlow - dt * 0.6);
    this.fallMat.opacity = this.fallGlow * 0.45;
  }

  dispose(): void {
    this.panel?.dispose();
    for (const o of this.owned) o.dispose();
    this.pegs.dispose();
  }
}
