// Virtual controls: a floating stick on the left, drag-to-look on the right,
// and context buttons that stay clear of the safe-area insets.

import type { Action, Input } from './input';

const STICK_RADIUS = 56;

export class TouchControls {
  readonly root: HTMLDivElement;
  private surface: HTMLDivElement;
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private actionBtn: HTMLButtonElement;
  private kickBtn: HTMLButtonElement;
  private jumpBtn: HTMLButtonElement;
  private stick: { id: number; x: number; y: number } | null = null;
  private lookers = new Map<number, { x: number; y: number }>();
  private enabled = true;

  constructor(private readonly input: Input, parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'touch';
    this.root.innerHTML = `
      <div class="touch-surface"></div>
      <div class="stick-base"><div class="stick-knob"></div></div>
      <button class="tbtn tbtn-kick" tabindex="-1" aria-label="Kick">Kick</button>
      <button class="tbtn tbtn-jump" tabindex="-1" aria-label="Jump">Jump</button>
      <button class="tbtn tbtn-action" tabindex="-1" aria-label="Interact"></button>
      <button class="tbtn tbtn-menu" tabindex="-1" aria-label="Menu"><span></span><span></span><span></span></button>
    `;
    parent.appendChild(this.root);
    this.surface = this.root.querySelector('.touch-surface')!;
    this.base = this.root.querySelector('.stick-base')!;
    this.knob = this.root.querySelector('.stick-knob')!;
    this.actionBtn = this.root.querySelector('.tbtn-action')!;
    this.kickBtn = this.root.querySelector('.tbtn-kick')!;
    this.jumpBtn = this.root.querySelector('.tbtn-jump')!;
    this.bindButton(this.actionBtn, 'interact');
    this.bindButton(this.kickBtn, 'kick');
    this.bindButton(this.jumpBtn, 'jump');
    this.bindButton(this.root.querySelector('.tbtn-menu')!, 'pause');

    this.surface.addEventListener('pointerdown', (e) => this.down(e));
    this.surface.addEventListener('pointermove', (e) => this.moveEv(e));
    this.surface.addEventListener('pointerup', (e) => this.up(e));
    this.surface.addEventListener('pointercancel', (e) => this.up(e));
    this.surface.addEventListener('lostpointercapture', (e) => this.up(e));
  }

  private bindButton(el: HTMLElement, a: Action): void {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('down');
      this.input.touchDown(a);
    });
    const release = () => {
      el.classList.remove('down');
      this.input.touchUp(a);
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
    if (!v) this.reset();
  }

  /** Off while dialogs or the arrange editor own the screen. */
  setEnabled(v: boolean): void {
    this.enabled = v;
    this.root.classList.toggle('disabled', !v);
    if (!v) this.reset();
  }

  /** Label the context button, or hide it when there is nothing to do. */
  setAction(label: string | null): void {
    if (label) {
      if (this.actionBtn.textContent !== label) this.actionBtn.textContent = label;
      this.actionBtn.classList.remove('gone');
    } else {
      this.actionBtn.classList.add('gone');
    }
  }

  setKick(label: string | null): void {
    if (label) {
      if (this.kickBtn.textContent !== label) this.kickBtn.textContent = label;
      this.kickBtn.classList.remove('gone');
    } else {
      this.kickBtn.classList.add('gone');
    }
  }

  setJump(show: boolean): void {
    this.jumpBtn.classList.toggle('gone', !show);
  }

  private reset(): void {
    this.stick = null;
    this.lookers.clear();
    this.base.classList.remove('on');
    this.input.touchMove.x = this.input.touchMove.y = 0;
  }

  private down(e: PointerEvent): void {
    if (!this.enabled) return;
    e.preventDefault();
    this.input.setDevice('touch');
    this.surface.setPointerCapture(e.pointerId);
    const w = this.surface.clientWidth;
    if (!this.stick && e.clientX < w * 0.45) {
      this.stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.base.style.transform = `translate(${e.clientX - STICK_RADIUS}px, ${e.clientY - STICK_RADIUS}px)`;
      this.knob.style.transform = 'translate(0px, 0px)';
      this.base.classList.add('on');
    } else {
      this.lookers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  }

  private moveEv(e: PointerEvent): void {
    if (!this.enabled) return;
    if (this.stick && e.pointerId === this.stick.id) {
      let dx = e.clientX - this.stick.x;
      let dy = e.clientY - this.stick.y;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        // Drag the base along so the stick never feels stuck at its rim.
        const over = len - STICK_RADIUS;
        this.stick.x += (dx / len) * over;
        this.stick.y += (dy / len) * over;
        this.base.style.transform = `translate(${this.stick.x - STICK_RADIUS}px, ${this.stick.y - STICK_RADIUS}px)`;
        dx = (dx / len) * STICK_RADIUS;
        dy = (dy / len) * STICK_RADIUS;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / STICK_RADIUS;
      const ny = dy / STICK_RADIUS;
      const mag = Math.hypot(nx, ny);
      const k = mag < 0.12 ? 0 : (mag - 0.12) / 0.88 / mag;
      this.input.touchMove.x = nx * k;
      this.input.touchMove.y = -ny * k;
      return;
    }
    const l = this.lookers.get(e.pointerId);
    if (l) {
      this.input.touchLook.dx += e.clientX - l.x;
      this.input.touchLook.dy += e.clientY - l.y;
      l.x = e.clientX;
      l.y = e.clientY;
    }
  }

  private up(e: PointerEvent): void {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null;
      this.base.classList.remove('on');
      this.input.touchMove.x = this.input.touchMove.y = 0;
    }
    this.lookers.delete(e.pointerId);
  }
}
