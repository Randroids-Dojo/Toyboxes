// Timestamped presses and releases for the rhythm games. Judging uses each
// input event's own time, never the frame time, so a 30 fps TV judges as
// fairly as a fast monitor. Sources: keys (any of the hit keys, so streams can
// be split across two fingers), a full-screen tap zone on touch, and every
// face button, bumper, trigger and d-pad direction on a controller. Holding
// any source counts as holding.

import type { UI } from '../../ui/ui';

export interface RhythmEvent {
  /** performance.now() time of the event. */
  at: number;
  down: boolean;
}

const HIT_CODES = new Set(['Space', 'Enter', 'NumpadEnter', 'KeyE', 'KeyF', 'KeyJ', 'KeyK', 'KeyD']);
/** Face buttons, bumpers, triggers and the d-pad (B and Start keep their meanings). */
const PAD_HITS = [0, 2, 3, 4, 5, 6, 7, 12, 13, 14, 15];

export class RhythmInput {
  private events: RhythmEvent[] = [];
  private held = new Set<string>();
  private padPrev: boolean[] = [];
  private active = false;
  readonly tap: HTMLElement;
  private onKeyDown = (e: KeyboardEvent) => this.key(e, true);
  private onKeyUp = (e: KeyboardEvent) => this.key(e, false);
  private onBlur = () => this.releaseAll(performance.now());

  constructor(private ui: UI) {
    this.tap = document.createElement('div');
    this.tap.className = 'nova-tap';
    this.tap.addEventListener('pointerdown', (e) => {
      if (!this.active || this.ui.isOpen) return;
      e.preventDefault();
      try {
        this.tap.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic pointers cannot always be captured.
      }
      this.down(`p${e.pointerId}`, this.stamp(e.timeStamp));
    });
    const up = (e: PointerEvent) => this.up(`p${e.pointerId}`, this.stamp(e.timeStamp));
    this.tap.addEventListener('pointerup', up);
    this.tap.addEventListener('pointercancel', up);
    this.tap.addEventListener('contextmenu', (e) => e.preventDefault());
    ui.hud.appendChild(this.tap);
    addEventListener('keydown', this.onKeyDown, true);
    addEventListener('keyup', this.onKeyUp, true);
    addEventListener('blur', this.onBlur);
  }

  /** Event times on the performance.now() base. */
  private stamp(ts: number): number {
    const now = performance.now();
    return ts > 0 && ts <= now + 5 && ts > now - 5000 ? ts : now;
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const hit = HIT_CODES.has(e.code) || e.key === 'Enter' || e.keyCode === 13;
    if (!hit) return;
    const id = `k${e.code || e.keyCode}`;
    if (!down) {
      this.up(id, this.stamp(e.timeStamp));
      return;
    }
    if (!this.active || this.ui.isOpen || e.repeat) return;
    // TV remotes repeat keydown without keyup: a second keydown is a repeat.
    if (this.held.has(id)) return;
    this.down(id, this.stamp(e.timeStamp));
  }

  private down(id: string, at: number): void {
    this.held.add(id);
    this.events.push({ at, down: true });
  }

  private up(id: string, at: number): void {
    if (!this.held.delete(id)) return;
    if (!this.held.size) this.events.push({ at, down: false });
  }

  private releaseAll(at: number): void {
    if (this.held.size) {
      this.held.clear();
      this.events.push({ at, down: false });
    }
  }

  /** Reads the controller. Call once per frame while active. */
  poll(now = performance.now()): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) pad = pad ?? p;
    if (!pad) return;
    const ts = pad.timestamp && pad.timestamp <= now + 1 && pad.timestamp > now - 200 ? pad.timestamp : now - 8;
    const on = this.active && !this.ui.isOpen;
    for (const i of PAD_HITS) {
      const v = !!pad.buttons[i]?.pressed;
      const was = !!this.padPrev[i];
      if (v && !was && on) this.down(`b${i}`, ts);
      else if (!v && was) this.up(`b${i}`, ts);
    }
    this.padPrev = pad.buttons.map((b) => !!b?.pressed);
  }

  /** Switches capture on (a rhythm round) or off. */
  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.tap.classList.toggle('on', on);
    if (!on) this.releaseAll(performance.now());
    this.events = [];
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Whether any source is held now. */
  get holding(): boolean {
    return this.held.size > 0;
  }

  /** Presses and releases since the last call, oldest first. */
  take(): RhythmEvent[] {
    const out = this.events;
    this.events = [];
    out.sort((a, b) => a.at - b.at);
    return out;
  }

  /** A press made by code (playtests). */
  inject(at: number, down: boolean): void {
    if (down) this.down('inject', at);
    else this.up('inject', at);
  }

  dispose(): void {
    removeEventListener('keydown', this.onKeyDown, true);
    removeEventListener('keyup', this.onKeyUp, true);
    removeEventListener('blur', this.onBlur);
    this.tap.remove();
  }
}
