// The boat's upper rooms and its service: velvet ropes that Monty unhooks
// as your rank opens the Moonlight Lounge and the Wheelhouse, Monty's panel
// that says what is inside and which stamps to try, Penny's cage for the free
// top up, the carpet inlays that light the way to your next stamp, and the
// soft glow on stations you have not tried yet. Ranks are earned only.

import * as THREE from 'three';
import { GAME_INFO, RANKS, STAMPS, nextStamp, rankOf, stampGame, type GameId } from '../../shared/casino/progress';
import { BETS, START_CREDITS } from '../../shared/slots';
import { box, type Collider } from '../../world/physics';
import type { PlayerState, SpaceAction } from '../../world/space';
import { button, h, type Panel } from '../../ui/ui';
import { formatCredits } from '../common';
import { sound } from './audio';
import { Batch } from './batch';
import { frame } from './director';
import type { Host } from './host';
import { GATE_COLLIDERS, LOUNGE_GATE, SPOTS, WHEELHOUSE_GATE, type Pt } from './layout';
import { C, canvasTex } from './materials';
import type { Staff } from './staff';

type GateId = 'lounge' | 'wheelhouse';

interface Gate {
  id: GateId;
  rank: number;
  rope: THREE.Mesh;
  hook: THREE.Group;
  open: number;
  light: THREE.Mesh;
  collider: Collider;
  spot: { x: number; z: number; range: number };
}

/** Floor paths from the gangway to each station, for the carpet inlays. */
const PATHS: Record<string, Pt[]> = {
  slot: [{ x: 0, z: 5.6 }, { x: 0, z: -7.4 }],
  roulette: [{ x: 0, z: 5.6 }, { x: 0, z: 1.2 }, { x: -4.6, z: -0.4 }, { x: -5.8, z: -0.6 }],
  blackjack: [{ x: 0, z: 5.6 }, { x: -2.4, z: 5.4 }, { x: -6.4, z: 5.6 }, { x: -7.3, z: 5.4 }],
  wheel: [{ x: 0, z: 5.6 }, { x: 2.4, z: 2.0 }, { x: 11.2, z: 0 }, { x: 15.2, z: 0 }],
  falls: [{ x: 0, z: 5.6 }, { x: -2.4, z: 1.4 }, { x: -10.6, z: 0 }, { x: -14.6, z: -2.6 }, { x: -16.3, z: -4.3 }],
  poker: [{ x: 0, z: 5.6 }, { x: -2.4, z: 1.4 }, { x: -10.6, z: 0 }, { x: -14.2, z: 3.2 }, { x: -16.3, z: 4.6 }],
  captain: [{ x: 0, z: 5.6 }, { x: -2.4, z: 1.4 }, { x: -10.6, z: 0 }, { x: -20.4, z: 0 }, { x: -23.4, z: 1.0 }],
  penny: [{ x: 0, z: 5.6 }, { x: -3.2, z: 5.6 }, { x: -4.9, z: 5.9 }],
};

const STATIONS: { id: GameId | 'penny' | 'logbook'; at: Pt }[] = [
  { id: 'roulette', at: SPOTS.roulette },
  { id: 'blackjack', at: SPOTS.blackjack },
  { id: 'wheel', at: SPOTS.wheel },
  { id: 'logbook', at: SPOTS.logbook },
  { id: 'falls', at: SPOTS.falls },
  { id: 'poker', at: SPOTS.poker1 },
  { id: 'captain', at: SPOTS.captain },
];

function ringTexture(): THREE.CanvasTexture {
  return canvasTex(
    256,
    256,
    (g, s) => {
      g.clearRect(0, 0, s, s);
      const grd = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
      grd.addColorStop(0, 'rgba(255,207,122,0)');
      grd.addColorStop(0.55, 'rgba(255,207,122,0.85)');
      grd.addColorStop(0.7, 'rgba(255,207,122,0.35)');
      grd.addColorStop(1, 'rgba(255,207,122,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    },
    false,
  );
}

export class Gates {
  private gates: Gate[] = [];
  private owned: { dispose(): void }[] = [];
  private inlays: THREE.InstancedMesh;
  private inlayPaths = new Map<string, [number, number]>();
  private discs: THREE.Vector3[] = [];
  private activePath: string | null = null;
  private glows: THREE.InstancedMesh;
  private glowIds: string[] = [];
  private col = new THREE.Color();
  private panel: Panel | null = null;
  private lastRank = -1;
  private walkedOff = new Set<string>();

  constructor(
    private host: Host,
    private staff: Staff,
  ) {
    const own = <X extends { dispose(): void }>(x: X): X => {
      this.owned.push(x);
      return x;
    };
    const m = host.mats;
    const velvet = own(new THREE.MeshStandardMaterial({ color: '#a8142c', roughness: 0.6 }));
    const lightMat = (color: string) => own(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const mk = (id: GateId, x: number, from: number, to: number, rank: number, spot: { x: number; z: number; range: number }, glow: string) => {
      const b = new Batch();
      for (const z of [from - 0.05, to + 0.05]) {
        b.add(new THREE.CylinderGeometry(0.17, 0.2, 0.06, 18), m.brass, x, 0.03, z);
        b.add(new THREE.CylinderGeometry(0.04, 0.05, 0.95, 10), m.brass, x, 0.5, z);
        b.add(new THREE.SphereGeometry(0.075, 12, 10), m.brass, x, 1.0, z);
      }
      b.build(host.scene);
      // The rope: a sagging tube between the stanchions.
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        pts.push(new THREE.Vector3(0, -Math.sin(t * Math.PI) * 0.22, t * (to - from + 0.1)));
      }
      const rope = new THREE.Mesh(own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.035, 8)), velvet);
      const hook = new THREE.Group();
      hook.position.set(x, 0.92, from - 0.05);
      hook.add(rope);
      rope.castShadow = true;
      host.scene.add(hook);
      // A glow across the arch when it opens.
      const light = new THREE.Mesh(own(new THREE.PlaneGeometry(to - from, 3.2)), lightMat(glow));
      light.position.set(x - 0.2, 1.6, (from + to) / 2);
      light.rotation.y = Math.PI / 2;
      host.scene.add(light);
      const def = GATE_COLLIDERS[id];
      const collider = box(def.x, def.z, def.kind === 'box' ? def.hx : 0.15, def.kind === 'box' ? def.hz : 1, 0, def.h, 0.3, false);
      this.gates.push({ id, rank, rope, hook, open: 0, light, collider, spot });
    };
    mk('lounge', LOUNGE_GATE.rope, LOUNGE_GATE.from, LOUNGE_GATE.to, 1, SPOTS.loungeGate, '#9fb7e8');
    mk('wheelhouse', WHEELHOUSE_GATE.rope, WHEELHOUSE_GATE.from, WHEELHOUSE_GATE.to, 2, SPOTS.wheelhouseGate, '#ffcf7a');
    // A painted sign by each gate.
    const sign = (text: string, sub: string, x: number, z: number, ry: number) => {
      const t = own(
        canvasTex(
          512,
          256,
          (g, W, H) => {
            g.fillStyle = '#13212b';
            g.beginPath();
            g.roundRect(4, 4, W - 8, H - 8, 24);
            g.fill();
            g.strokeStyle = '#e0ac45';
            g.lineWidth = 8;
            g.stroke();
            g.fillStyle = '#ffd24a';
            g.font = `52px "Lilita One", system-ui`;
            g.textAlign = 'center';
            g.fillText(text, W / 2, 110);
            g.fillStyle = '#f4e7cc';
            g.font = `30px "Lilita One", system-ui`;
            g.fillText(sub, W / 2, 175);
          },
          false,
        ),
      );
      const mesh = new THREE.Mesh(own(new THREE.PlaneGeometry(1.4, 0.7)), own(new THREE.MeshStandardMaterial({ map: t, emissive: new THREE.Color('#ffffff'), emissiveMap: t, emissiveIntensity: 0.35, roughness: 0.5 })));
      mesh.position.set(x, 1.55, z);
      mesh.rotation.y = ry;
      const post = new THREE.Mesh(own(new THREE.CylinderGeometry(0.035, 0.04, 1.2, 8)), m.brass);
      post.position.set(x, 0.6, z);
      host.scene.add(mesh, post);
    };
    sign('Moonlight Lounge', 'Bosuns and above', -10.9, -2.6, Math.PI / 2);
    sign('The Wheelhouse', 'First Mates and above', -20.3, -1.7, Math.PI / 2);

    // Carpet inlays: brass discs along each path, lit in sequence when they lead somewhere.
    const discs: THREE.Vector3[] = [];
    for (const [id, path] of Object.entries(PATHS)) {
      const start = discs.length;
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const n = Math.max(1, Math.round(len / 0.9));
        for (let k = i === 0 ? 0 : 1; k <= n; k++) discs.push(new THREE.Vector3(a.x + ((b.x - a.x) * k) / n, 0.007, a.z + ((b.z - a.z) * k) / n));
      }
      this.inlayPaths.set(id, [start, discs.length]);
    }
    // Unlit, so the discs glow on every tier; only the active path's discs are shown.
    const inlayMat = own(new THREE.MeshBasicMaterial({ color: '#ffffff', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
    this.inlays = new THREE.InstancedMesh(own(new THREE.CylinderGeometry(0.13, 0.13, 0.008, 16)), inlayMat, discs.length);
    const mm = new THREE.Matrix4();
    this.discs = discs;
    discs.forEach((_p, i) => {
      this.inlays.setMatrixAt(i, mm.makeScale(0, 0, 0));
      this.inlays.setColorAt(i, this.col.set('#6a4a1a'));
    });
    this.inlays.frustumCulled = false;
    host.scene.add(this.inlays);
    // Glow rings on the floor at stations you have not tried yet.
    const ringMat = own(new THREE.MeshBasicMaterial({ map: own(ringTexture()), color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }));
    this.glows = new THREE.InstancedMesh(own(new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2)), ringMat, STATIONS.length);
    STATIONS.forEach((s, i) => {
      this.glows.setMatrixAt(i, mm.makeTranslation(s.at.x, 0.011, s.at.z));
      this.glows.setColorAt(i, this.col.set('#000000'));
      this.glowIds.push(s.id);
    });
    this.glows.frustumCulled = false;
    this.glows.renderOrder = 2;
    host.scene.add(this.glows);
  }

  /** Ropes still up, for the physics. */
  colliders(): Collider[] {
    return this.gates.filter((g) => g.open < 0.5).map((g) => g.collider);
  }

  isOpen(id: GateId): boolean {
    return this.gates.find((g) => g.id === id)!.open > 0.5;
  }

  actions(p: PlayerState, act: (label: string, short: string, run: () => void) => SpaceAction): SpaceAction[] {
    const out: SpaceAction[] = [];
    const rank = this.host.eco.rank;
    for (const g of this.gates) {
      if (rank >= g.rank) continue;
      out.push({ ...g.spot, ...act(g.id === 'lounge' ? 'Ask Monty about the Moonlight Lounge' : 'Read the Wheelhouse sign', g.id === 'lounge' ? 'Ask' : 'Read', () => this.explain(g)) });
    }
    out.push({ ...SPOTS.penny, ...act(this.host.eco.shown < BETS[0] ? 'Ask Penny for a free top up' : 'Talk to Penny', 'Penny', () => this.penny()) });
    void p;
    return out;
  }

  /** Monty's panel: what is inside, your stamps, and the next ones to try. "Not now" has focus. */
  private explain(g: Gate): void {
    if (this.panel) return;
    const host = this.host;
    const st = host.eco.stats;
    const have = st?.stamps?.length ?? 0;
    const need = RANKS[g.rank];
    const owned = new Set(st?.stamps ?? []);
    const tries = STAMPS.filter((s) => !owned.has(s.id) && (s.group === 'Boarding' || s.group === 'Cards and wheels' || s.group === 'Old Lucky' || (g.rank > 1 && s.group === 'Lounge'))).slice(0, 3);
    const inside = g.id === 'lounge' ? 'Lucky Falls, a pearl drop with three kinds of risk, and Five Card Cabin video poker, under the moon.' : "The Captain's Table for high stakes blackjack, the ship's wheel, and the best view on the river.";
    const notNow = button('Not now', () => host.ctx.ui.close(panel), 'primary');
    const panel: Panel = {
      el: h(
        'div',
        { class: 'card gp-sheet gate-card' },
        h('div', { class: `gate-pic ${g.id}` }),
        h('h2', {}, g.id === 'lounge' ? 'The Moonlight Lounge' : 'The Wheelhouse'),
        h('p', {}, inside),
        h('p', { class: 'gate-count' }, `${need.name}s and above. You have ${have} of ${need.stamps} stamps.`),
        h('div', { class: 'gate-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(need.stamps), 'aria-valuenow': String(have) }, h('i', { style: `width:${Math.min(100, (have / need.stamps) * 100)}%` })),
        tries.length ? h('h3', { class: 'lb-h3' }, 'Stamps to try') : null,
        tries.length ? h('ul', { class: 'gate-tries' }, ...tries.map((s) => h('li', {}, h('b', {}, s.name), ` ${s.hint.charAt(0).toLowerCase()}${s.hint.slice(1)}.`))) : null,
        h('div', { class: 'actions' }, notNow),
      ),
      onBack: () => host.ctx.ui.close(panel),
      onClose: () => (this.panel = null),
      initial: () => notNow,
    };
    this.panel = panel;
    host.ctx.ui.open(panel);
    if (g.id === 'lounge') {
      this.staff.say('monty', `${need.stamps} stamps, and you're in.`);
      this.staff.get('monty')?.play('point', 1.2);
    }
  }

  /** Penny's cage: the free top up when you are out, and a quick look at your credits. */
  private penny(): void {
    if (this.panel) return;
    const host = this.host;
    const st = host.eco.stats;
    if (!st) return;
    const out = host.eco.shown < BETS[0];
    const net = st.earned - st.spent;
    const status = h('p', { class: 'gp-status', role: 'status' });
    const top = button(out ? `Free top up to ${formatCredits(START_CREDITS)}` : 'Top up', () => void this.refill(status, top), 'primary');
    top.disabled = !out;
    const done = button('Done', () => host.ctx.ui.close(panel), out ? '' : 'primary');
    const book = button('Open the logbook', () => {
      host.ctx.ui.close(panel);
      this.openLogbook?.();
    }, 'ghost');
    const panel: Panel = {
      el: h(
        'div',
        { class: 'card gp-sheet penny-card' },
        h('h2', {}, "Penny's cage"),
        h('p', {}, out ? "You're out of credits. A free top up is yours, no strings and no wait." : 'Play credits only, never real money. When you run out, I top you up for free.'),
        h(
          'div',
          { class: 'lb-tiles small' },
          ...([
            ['Balance', formatCredits(host.eco.shown)],
            ['Earned', formatCredits(st.earned)],
            ['Spent', formatCredits(st.spent)],
            ['Net', `${net >= 0 ? '▲ +' : '▼ -'}${formatCredits(Math.abs(net))}`],
            ['This visit', `${host.eco.voyageNet >= 0 ? '+' : '-'}${formatCredits(Math.abs(host.eco.voyageNet))}`],
            ['Free top ups', String(st.refills)],
          ] as const).map(([k, v]) => h('div', { class: 'lb-tile' }, h('small', {}, k), h('b', {}, v))),
        ),
        status,
        h('div', { class: 'actions' }, book, done, top),
      ),
      onBack: () => host.ctx.ui.close(panel),
      onClose: () => (this.panel = null),
      initial: () => (out ? top : done),
    };
    this.panel = panel;
    host.ctx.ui.open(panel);
    this.staff.get('penny')?.play('wave', 1.2);
    this.staff.say('penny', out ? 'Here you are, on the house.' : 'Lovely to see you.');
  }

  /** Set by the casino: opens the logbook from Penny's cage. */
  openLogbook: (() => void) | null = null;

  private async refill(status: HTMLElement, btn: HTMLButtonElement): Promise<void> {
    btn.disabled = true;
    const r = await this.host.eco.refill();
    if (!r.ok) {
      status.textContent = r.error ?? "Couldn't reach the boat.";
      btn.disabled = false;
      sound.error();
      return;
    }
    sound.coins(START_CREDITS);
    status.textContent = `Topped up: ${formatCredits(START_CREDITS)} play credits.`;
    this.host.ctx.ui.toast(`Topped up: ${formatCredits(START_CREDITS)} play credits`, 'good');
    // Penny slides a coin tray across the counter.
    this.host.fx.coinBurst({ x: -5, y: 1.2, z: 7.3 }, 20, { x: 0, z: -1 }, { speed: 1.2, up: 1.6, spread: 0.6 });
    this.staff.get('penny')?.play('deal', 0.8);
  }

  /** Where the carpet inlays should lead now, if anywhere. */
  private target(): string | null {
    const host = this.host;
    const st = host.eco.stats;
    if (!st) return null;
    if (host.eco.shown < BETS[0]) return 'penny';
    if (!host.save.data.tried.slot) return 'slot';
    const ns = nextStamp(st);
    const g = ns ? stampGame(ns.id) : null;
    if (!g || GAME_INFO[g].rank > rankOf(st)) return null;
    return g;
  }

  /** The rank-up moment: the newly opened gate floods with light and the rope drops. */
  rankUp(rank: number): void {
    const g = this.gates.find((x) => x.rank === rank);
    if (!g) return;
    const at = g.id === 'lounge' ? new THREE.Vector3(LOUNGE_GATE.x, 1.4, 0) : new THREE.Vector3(WHEELHOUSE_GATE.x, 1.4, 0);
    const keys = [
      { t: 0, f: frame(at.x + 6.5, 3.2, 3.6, at.x, 1.2, 0, 52) },
      { t: 2.6, f: frame(at.x + 4.2, 2.4, 1.8, at.x, 1.4, 0, 50) },
    ];
    if (rank === 1) {
      this.staff.say('monty', 'Welcome to the Moonlight Lounge!');
      this.staff.get('monty')?.play('tip', 1.6);
    }
    void this.host.director.play(keys.map((k) => ({ t: k.t / this.host.timeScale(), f: k.f })), { skippableAfter: 0.5 });
  }

  update(dt: number, p: PlayerState | null): void {
    const host = this.host;
    const rank = host.eco.rank;
    const now = host.clock();
    if (this.lastRank < 0) {
      // Already open on arrival: no ceremony, the ropes are simply down.
      for (const g of this.gates) g.open = rank >= g.rank ? 1 : 0;
      this.lastRank = host.eco.stats ? rank : -1;
    }
    for (const g of this.gates) {
      const want = rank >= g.rank ? 1 : 0;
      g.open += (want - g.open) * Math.min(1, dt * 1.5);
      // The rope unhooks at the far end and hangs, gathered, from the near stanchion.
      g.hook.scale.z = 1 - g.open * 0.88;
      g.hook.rotation.x = g.open * 1.2;
      const mat = g.light.material as THREE.MeshBasicMaterial;
      mat.opacity = want ? 0.08 + Math.sin(now * 1.5) * 0.02 + (1 - g.open) * 0.4 : 0;
    }
    if (host.eco.stats) this.lastRank = rank;
    // Carpet path.
    let target = this.target();
    if (target && p) {
      const end = PATHS[target][PATHS[target].length - 1];
      if (Math.hypot(p.x - end.x, p.z - end.z) < 2.2) this.walkedOff.add(target);
      if (this.walkedOff.has(target) && target !== 'penny') target = null;
    }
    if (target !== this.activePath) {
      this.activePath = target;
      const [a, b] = target ? this.inlayPaths.get(target)! : [0, 0];
      const mm = new THREE.Matrix4();
      this.discs.forEach((d, i) => this.inlays.setMatrixAt(i, i >= a && i < b ? mm.makeTranslation(d.x, d.y, d.z) : mm.makeScale(0, 0, 0)));
      this.inlays.instanceMatrix.needsUpdate = true;
    }
    if (target) {
      const [a, b] = this.inlayPaths.get(target)!;
      // A pulse runs along the path towards the station (about two discs a second each).
      const head = (now * 3) % (b - a + 6);
      for (let i = a; i < b; i++) {
        const d = head - (i - a);
        const k = d >= 0 && d < 4 ? 1 - d / 4 : 0;
        this.inlays.setColorAt(i, this.col.set('#7a5a24').lerp(new THREE.Color('#ffe2a0'), 0.2 + k * 0.8));
      }
    }
    if (this.inlays.instanceColor) this.inlays.instanceColor.needsUpdate = true;
    // Glows on stations not yet tried (and open to you).
    const pulse = 0.35 + Math.max(0, Math.sin(now * 2.2)) * 0.45;
    this.glowIds.forEach((id, i) => {
      const tried = host.save.data.tried[id] || (id === 'logbook' && host.save.data.tried.logbook);
      const open = id === 'logbook' || GAME_INFO[id as GameId]?.rank <= rank;
      this.glows.setColorAt(i, this.col.setScalar(!tried && open && host.eco.stats ? pulse : 0));
    });
    if (this.glows.instanceColor) this.glows.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    if (this.panel) this.host.ctx.ui.close(this.panel);
    for (const o of this.owned) o.dispose();
    this.inlays.dispose();
    this.glows.dispose();
  }
}

export { C };
