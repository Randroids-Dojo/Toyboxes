// Arrange mode: pick toys from the chest, drag them where you want them,
// rotate or remove them, and paint the room. Works with mouse, touch,
// controller (stick moves the selected toy) and keyboard (WASD).

import * as THREE from 'three';
import { sfx } from '../audio/sfx';
import type { Input } from '../input/input';
import { api, retryText } from '../net/api';
import {
  FLOOR_COLORS,
  MAX_PROPS,
  PROP_KINDS,
  PROP_SPECS,
  ROOM,
  TRIM_COLORS,
  WALL_COLORS,
  exhibitsIn,
  placementProblem,
  type LayoutContext,
  type PropKind,
  type PropPlacement,
  type RoomPublic,
  type RoomTheme,
} from '../shared/model';
import { choose, confirmBox } from '../ui/dialogs';
import { button, h, type Panel, type UI } from '../ui/ui';
import { disposeTree } from '../world/kit';
import type { Interior } from '../world/interior';
import { Toys } from '../world/toys';
import type { CameraRig } from './camera';

const ICONS: Record<PropKind, string> = {
  ball: '<circle cx="16" cy="16" r="11" fill="#fbf8f0" stroke="#2b2340" stroke-width="2.5"/><path d="M16 10l5 3.6-1.9 5.9h-6.2L11 13.6z" fill="#2b2340"/>',
  goal: '<path d="M4 25V9h24v16" fill="none" stroke="#2b2340" stroke-width="3" stroke-linejoin="round"/><path d="M8 12h16M8 16h16M8 20h16M12 9v16M16 9v16M20 9v16" stroke="#2b2340" stroke-width="1" opacity=".45"/>',
  cone: '<path d="M16 4l8 20H8z" fill="#ff7a2e" stroke="#2b2340" stroke-width="2" stroke-linejoin="round"/><path d="M11.5 16h9" stroke="#fbf8f0" stroke-width="3"/><rect x="5" y="24" width="22" height="4" rx="1.5" fill="#ff7a2e" stroke="#2b2340" stroke-width="2"/>',
  pins: '<g fill="#fbf8f0" stroke="#2b2340" stroke-width="1.8"><path d="M10 27c-3 0-3-6-1.5-9 .8-1.6.2-3-.3-4.2-.8-2 .4-4.3 1.8-4.3s2.6 2.3 1.8 4.3c-.5 1.2-1.1 2.6-.3 4.2 1.5 3 1.5 9-1.5 9z"/><path d="M22 27c-3 0-3-6-1.5-9 .8-1.6.2-3-.3-4.2-.8-2 .4-4.3 1.8-4.3s2.6 2.3 1.8 4.3c-.5 1.2-1.1 2.6-.3 4.2 1.5 3 1.5 9-1.5 9z"/></g><path d="M8.6 12h2.8M20.6 12h2.8" stroke="#e8574a" stroke-width="2"/>',
  crate: '<rect x="6" y="6" width="20" height="20" rx="3" fill="#4aa3df" stroke="#2b2340" stroke-width="2.5"/><text x="16" y="21.5" font-size="13" text-anchor="middle" fill="#fffaf0" font-family="Lilita One, sans-serif">T</text>',
  target: '<circle cx="16" cy="16" r="12" fill="#e8574a" stroke="#2b2340" stroke-width="2"/><circle cx="16" cy="16" r="8" fill="#fbf8f0"/><circle cx="16" cy="16" r="4" fill="#e8574a"/>',
};

function icon(kind: PropKind): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 32 32');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[kind];
  return s;
}

export interface ArrangeHost {
  ui: UI;
  input: Input;
  interior: Interior;
  rig: CameraRig;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  room: RoomPublic;
  token(): string | null;
  touch(): void;
  unlock(reason: string): Promise<string | null>;
  onFinish(room: RoomPublic | null): void;
}

export class Arranger {
  private layout: PropPlacement[];
  private theme: RoomTheme;
  private selected: string | null = null;
  private toys: Toys;
  private marker: THREE.Mesh;
  private ctx: LayoutContext;
  private panel: Panel;
  private trayButtons = new Map<PropKind, HTMLButtonElement>();
  private statusEl: HTMLElement;
  private doneBtn: HTMLButtonElement;
  private selRow: HTMLElement;
  private drag: { id: string; dx: number; dz: number; lastValid: { x: number; z: number }; pointer: number } | null = null;
  private saving = false;
  private ray = new THREE.Raycaster();
  private floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private problemUntil = 0;
  private counter = 0;
  private listeners: [EventTarget, string, EventListener][] = [];

  constructor(private readonly host: ArrangeHost) {
    this.layout = structuredClone(host.room.layout);
    this.theme = { ...host.room.theme };
    this.ctx = { kind: 'main', exhibits: exhibitsIn(host.room.content, 'main') };
    this.toys = new Toys(this.layout);
    host.interior.scene.add(this.toys.group);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.78, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#3fb68b', transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.marker.position.y = 0.04;
    this.marker.visible = false;
    host.interior.scene.add(this.marker);

    // ---- panel
    const tray = h('div', { class: 'tray' });
    for (const k of PROP_KINDS) {
      const b = button('', () => this.add(k), 'tray-btn');
      b.append(icon(k), h('span', { class: 'tray-name' }, PROP_SPECS[k].name), h('span', { class: 'tray-count' }));
      b.setAttribute('aria-label', PROP_SPECS[k].name);
      b.title = PROP_SPECS[k].name;
      this.trayButtons.set(k, b);
      tray.appendChild(b);
    }
    const swatchRow = (label: string, colors: string[], key: keyof RoomTheme) => {
      const row = h('div', { class: 'paint-row' }, h('span', { class: 'paint-label' }, label));
      colors.forEach((c, i) => {
        const b = button('', () => {
          this.theme = { ...this.theme, [key]: i };
          host.interior.setTheme(this.theme);
          row.querySelectorAll('.swatch').forEach((s, j) => s.classList.toggle('on', j === i));
          host.touch();
        }, 'swatch');
        b.style.setProperty('--c', c);
        b.setAttribute('aria-label', `${label} colour ${i + 1}`);
        if (this.theme[key] === i) b.classList.add('on');
        row.appendChild(b);
      });
      return row;
    };
    const paint = h('div', { class: 'paint hidden' }, swatchRow('Walls', WALL_COLORS, 'wall'), swatchRow('Floor', FLOOR_COLORS, 'floor'), swatchRow('Trim', TRIM_COLORS, 'trim'));
    const paintBtn = button('Paint', () => {
      paint.classList.toggle('hidden');
      tray.classList.toggle('hidden');
      paintBtn.textContent = paint.classList.contains('hidden') ? 'Paint' : 'Toys';
    }, 'ghost');
    this.statusEl = h('p', { class: 'arrange-status', role: 'status' });
    const rotL = button('⟲', () => this.rotate(-1), 'ghost icon-btn');
    rotL.setAttribute('aria-label', 'Rotate left');
    const rotR = button('⟳', () => this.rotate(1), 'ghost icon-btn');
    rotR.setAttribute('aria-label', 'Rotate right');
    const remove = button('Remove', () => this.remove(), 'ghost');
    this.selRow = h('div', { class: 'sel-row hidden' }, rotL, rotR, remove);
    this.doneBtn = button('Done', () => void this.save(), 'primary');
    const cancel = button('Cancel', () => void this.cancel(), 'ghost');
    const el = h(
      'div',
      { class: 'card arrange' },
      h('div', { class: 'arrange-head' }, h('h2', {}, 'Arrange your room'), paintBtn),
      tray,
      paint,
      this.statusEl,
      h('div', { class: 'arrange-foot' }, this.selRow, h('div', { class: 'grow' }), cancel, this.doneBtn),
    );
    this.panel = {
      el,
      light: true,
      onBack: () => {
        if (this.selected) this.select(null);
        else void this.cancel();
      },
      onAlt: () => this.rotate(1),
      onPrev: () => this.cycle(-1),
      onNext: () => this.cycle(1),
      initial: () => this.trayButtons.get('ball') ?? null,
    };
    host.ui.open(this.panel);
    host.input.stickNavigates = false;

    const c = host.canvas;
    this.on(c, 'pointerdown', (e) => this.pointerDown(e as PointerEvent));
    this.on(window, 'pointermove', (e) => this.pointerMove(e as PointerEvent));
    this.on(window, 'pointerup', (e) => this.pointerUp(e as PointerEvent));
    this.on(window, 'pointercancel', (e) => this.pointerUp(e as PointerEvent));
    this.on(c, 'wheel', (e) => {
      if (!this.selected) return;
      e.preventDefault();
      this.rotate((e as WheelEvent).deltaY > 0 ? 1 : -1);
    });
    this.on(window, 'keydown', (e) => {
      const k = e as KeyboardEvent;
      if (this.host.ui.top !== this.panel) return;
      if (k.code === 'KeyR' || k.code === 'KeyE') this.rotate(1);
      else if (k.code === 'KeyQ') this.rotate(-1);
      else if (k.code === 'Delete' || k.code === 'Backspace') this.remove();
      else if (k.code === 'Tab') {
        k.preventDefault();
        this.cycle(k.shiftKey ? -1 : 1);
      } else return;
      k.preventDefault();
    });
    this.refresh();
    this.status(host.ui.device === 'touch' ? 'Tap a toy to add it. Drag toys to move them.' : host.ui.device === 'pad' ? 'Pick a toy. Left stick moves it, X turns it, LB and RB switch toys.' : 'Pick a toy, then drag it. R turns it, Delete removes it.');
  }

  private on(t: EventTarget, type: string, fn: EventListener): void {
    t.addEventListener(type, fn, { passive: false });
    this.listeners.push([t, type, fn]);
  }

  private status(text: string, bad = false): void {
    this.statusEl.textContent = text;
    this.statusEl.classList.toggle('bad', bad);
    if (bad) this.problemUntil = performance.now() + 2200;
  }

  private rebuild(): void {
    this.host.interior.scene.remove(this.toys.group);
    disposeTree(this.toys.group);
    this.toys = new Toys(this.layout);
    this.host.interior.scene.add(this.toys.group);
  }

  private refresh(): void {
    const counts: Partial<Record<PropKind, number>> = {};
    for (const p of this.layout) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
    for (const [k, b] of this.trayButtons) {
      const n = counts[k] ?? 0;
      const max = PROP_SPECS[k].max;
      (b.querySelector('.tray-count') as HTMLElement).textContent = `${n}/${max}`;
      b.disabled = n >= max || this.layout.length >= MAX_PROPS;
    }
    this.selRow.classList.toggle('hidden', !this.selected);
    this.rebuild();
    this.placeMarker();
  }

  private others(id: string): PropPlacement[] {
    return this.layout.filter((p) => p.id !== id);
  }

  private problem(p: PropPlacement): string | null {
    return placementProblem(p, this.ctx, this.others(p.id));
  }

  private placeMarker(): void {
    const p = this.layout.find((q) => q.id === this.selected);
    if (!p) {
      this.marker.visible = false;
      return;
    }
    const r = PROP_SPECS[p.kind].radius;
    this.marker.visible = true;
    this.marker.position.set(p.x, 0.04, p.z);
    this.marker.scale.setScalar(Math.max(0.6, r + 0.25) / 0.7);
    const bad = !!this.problem(p);
    (this.marker.material as THREE.MeshBasicMaterial).color.set(bad ? '#e8574a' : '#3fb68b');
  }

  private select(id: string | null): void {
    this.selected = id;
    this.selRow.classList.toggle('hidden', !id);
    this.placeMarker();
  }

  private add(kind: PropKind): void {
    this.host.touch();
    const spec = PROP_SPECS[kind];
    const count = this.layout.filter((p) => p.kind === kind).length;
    if (count >= spec.max || this.layout.length >= MAX_PROPS) {
      this.status(`That's all the ${spec.name.toLowerCase()} the chest holds`, true);
      return;
    }
    // Find a free spot, spiralling out from the middle of the room.
    const id = `${kind}${Date.now().toString(36)}${this.counter++}`;
    for (let ring = 0; ring < 14; ring++) {
      const r = ring * 0.6;
      const steps = Math.max(1, Math.round(ring * 6));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const cand: PropPlacement = { id, kind, x: Math.round((Math.sin(a) * r - 0.5) * 10) / 10, z: Math.round(Math.cos(a) * r * 10) / 10 - 0.5, rot: 0 };
        if (!this.problem(cand)) {
          this.layout.push(cand);
          this.select(id);
          sfx.place();
          this.refresh();
          this.status(`${spec.name} added`);
          return;
        }
      }
    }
    this.status('No free space left. Move or remove a toy first.', true);
  }

  private rotate(dir: number): void {
    const p = this.layout.find((q) => q.id === this.selected);
    if (!p) return;
    this.host.touch();
    p.rot = Math.round(((p.rot + (dir * Math.PI) / 8) % (Math.PI * 2)) * 1000) / 1000;
    sfx.click();
    this.refresh();
  }

  private remove(): void {
    const i = this.layout.findIndex((q) => q.id === this.selected);
    if (i < 0) return;
    this.host.touch();
    const [p] = this.layout.splice(i, 1);
    this.select(null);
    sfx.click();
    this.refresh();
    this.status(`${PROP_SPECS[p.kind].name} put away`);
  }

  private cycle(dir: number): void {
    if (!this.layout.length) return;
    const i = this.layout.findIndex((q) => q.id === this.selected);
    const next = this.layout[(i + dir + this.layout.length) % this.layout.length];
    this.select(next.id);
    this.status(`${PROP_SPECS[next.kind].name} selected`);
  }

  private floorPoint(e: PointerEvent): THREE.Vector3 | null {
    const r = this.host.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.host.camera);
    const out = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.floor, out);
  }

  private pointerDown(e: PointerEvent): void {
    const pt = this.floorPoint(e);
    if (!pt) return;
    this.host.touch();
    let best: PropPlacement | null = null;
    let bd = Infinity;
    for (const p of this.layout) {
      const d = Math.hypot(p.x - pt.x, p.z - pt.z);
      const reach = PROP_SPECS[p.kind].radius + (e.pointerType === 'touch' ? 0.55 : 0.3);
      if (d < reach && d < bd) {
        bd = d;
        best = p;
      }
    }
    if (!best) {
      this.select(null);
      return;
    }
    e.preventDefault();
    this.select(best.id);
    this.drag = { id: best.id, dx: best.x - pt.x, dz: best.z - pt.z, lastValid: { x: best.x, z: best.z }, pointer: e.pointerId };
  }

  private pointerMove(e: PointerEvent): void {
    if (!this.drag || e.pointerId !== this.drag.pointer) return;
    const pt = this.floorPoint(e);
    const p = this.layout.find((q) => q.id === this.drag!.id);
    if (!pt || !p) return;
    p.x = Math.max(-ROOM.halfW, Math.min(ROOM.halfW, pt.x + this.drag.dx));
    p.z = Math.max(-ROOM.halfD, Math.min(ROOM.halfD, pt.z + this.drag.dz));
    const problem = this.problem(p);
    if (!problem) this.drag.lastValid = { x: p.x, z: p.z };
    else this.status(problem, true);
    this.toys.preview(p);
    this.placeMarker();
  }

  private pointerUp(e: PointerEvent): void {
    if (!this.drag || e.pointerId !== this.drag.pointer) return;
    const p = this.layout.find((q) => q.id === this.drag!.id);
    if (p) {
      const problem = this.problem(p);
      if (problem) {
        p.x = this.drag.lastValid.x;
        p.z = this.drag.lastValid.z;
        this.status(`${problem}. Moved it back.`, true);
        sfx.error();
      } else sfx.place();
      p.x = Math.round(p.x * 100) / 100;
      p.z = Math.round(p.z * 100) / 100;
    }
    this.drag = null;
    this.refresh();
  }

  update(dt: number): void {
    const cover = innerHeight - this.panel.el.getBoundingClientRect().top + 8;
    this.host.rig.overhead(dt, ROOM.halfW, ROOM.halfD, Math.max(0, cover));
    this.host.interior.cutaway(this.host.camera.position);
    if (this.problemUntil && performance.now() > this.problemUntil) {
      this.problemUntil = 0;
      this.statusEl.classList.remove('bad');
    }
    const p = this.layout.find((q) => q.id === this.selected);
    if (!p || this.drag) return;
    const pad = this.host.input.padStick();
    const keys = this.host.input.keyStick();
    let mx = keys.x;
    let mz = keys.y;
    if (pad && this.host.ui.device === 'pad') {
      mx += pad.x;
      mz += pad.y;
    }
    if (mx === 0 && mz === 0) return;
    this.host.touch();
    const step = 3.2 * dt;
    const tryMove = (nx: number, nz: number) => {
      const cand = { ...p, x: nx, z: nz };
      if (!this.problem(cand)) {
        p.x = nx;
        p.z = nz;
        return true;
      }
      return false;
    };
    if (!tryMove(p.x + mx * step, p.z + mz * step)) {
      if (!tryMove(p.x + mx * step, p.z) && !tryMove(p.x, p.z + mz * step)) {
        const why = this.problem({ ...p, x: p.x + mx * step, z: p.z + mz * step });
        if (why && !this.problemUntil) this.status(why, true);
      }
    }
    p.x = Math.round(p.x * 100) / 100;
    p.z = Math.round(p.z * 100) / 100;
    this.toys.preview(p);
    this.placeMarker();
  }

  private dirty(): boolean {
    const r = this.host.room;
    return JSON.stringify(r.layout) !== JSON.stringify(this.layout) || JSON.stringify(r.theme) !== JSON.stringify(this.theme);
  }

  private async save(rev = this.host.room.rev): Promise<void> {
    if (this.saving) return;
    if (!this.dirty()) {
      this.finish(null);
      return;
    }
    const bad = this.layout.map((p) => [p, this.problem(p)] as const).find(([, why]) => why);
    if (bad) {
      this.select(bad[0].id);
      this.status(`${PROP_SPECS[bad[0].kind].name}: ${bad[1]}`, true);
      sfx.error();
      return;
    }
    let token = this.host.token();
    if (!token) token = await this.host.unlock('Editing timed out. Enter the PIN to save your room.');
    if (!token) {
      this.status('Still locked. Your arrangement is not saved yet.', true);
      return;
    }
    this.saving = true;
    this.doneBtn.disabled = true;
    this.doneBtn.textContent = 'Saving...';
    const r = await api.saveLayout(this.host.room.id, token, this.layout, this.theme, rev);
    this.saving = false;
    this.doneBtn.disabled = false;
    this.doneBtn.textContent = 'Done';
    if (r.ok) {
      sfx.confirm();
      this.finish(r.data.room);
      return;
    }
    if (r.status === 409 && r.extra.room) {
      const latest = r.extra.room as RoomPublic;
      const pick = await choose(this.host.ui, {
        title: 'Someone rearranged this room',
        body: 'It was changed on another device while you were arranging.',
        options: [
          { label: 'Keep my arrangement', value: 'mine', primary: true },
          { label: 'Load the other one', value: 'theirs' },
        ],
      });
      if (pick === 'mine') {
        this.host.room = { ...this.host.room, rev: latest.rev };
        return this.save(latest.rev);
      }
      if (pick === 'theirs') {
        this.host.room = latest;
        this.layout = structuredClone(latest.layout);
        this.theme = { ...latest.theme };
        this.host.interior.setTheme(this.theme);
        this.select(null);
        this.refresh();
      }
      return;
    }
    if (r.status === 401) {
      const t = await this.host.unlock('Editing timed out. Enter the PIN to save your room.');
      if (t) return this.save(rev);
      return;
    }
    this.status(`Couldn't save. ${r.error}.${retryText(r)} Press Done to try again.`, true);
    sfx.error();
  }

  private async cancel(): Promise<void> {
    if (this.dirty()) {
      const ok = await confirmBox(this.host.ui, { title: 'Throw away these changes?', body: 'The room goes back to how it was.', ok: 'Throw away', cancel: 'Keep arranging', danger: true });
      if (!ok) return;
    }
    this.host.interior.setTheme(this.host.room.theme);
    this.finish(null);
  }

  private finish(room: RoomPublic | null): void {
    for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
    this.host.input.stickNavigates = true;
    this.host.rig.endOverhead();
    this.host.interior.scene.remove(this.toys.group, this.marker);
    disposeTree(this.toys.group);
    this.marker.geometry.dispose();
    (this.marker.material as THREE.Material).dispose();
    this.host.ui.close(this.panel);
    this.host.onFinish(room);
  }
}
