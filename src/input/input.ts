// One action model for keyboard and mouse, touch, physical controllers and TV
// remotes. Game code reads actions; it never asks which device produced them.

export type Device = 'kbm' | 'touch' | 'pad';

export type Action =
  | 'interact'
  | 'kick'
  | 'jump'
  | 'back'
  | 'pause'
  | 'run'
  | 'prev'
  | 'next'
  | 'rotateL'
  | 'rotateR'
  | 'remove'
  | 'reset';

export type Dir = 'up' | 'down' | 'left' | 'right';

export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause' | 'prev' | 'next' | 'alt';

/** Samsung Tizen and LG webOS remotes report Back with these key codes; the red colour key (403) works as a menu key too. */
const TV_BACK_CODES = new Set([10009, 461, 403]);

export const IS_TV = /Tizen|SMART-TV|SmartTV|Web0S|webOS|NetCast|HbbTV|BRAVIA|AFT[A-Z]/i.test(navigator.userAgent);

const KEY_ACTIONS: Record<string, Action> = {
  KeyE: 'interact',
  Enter: 'interact',
  NumpadEnter: 'interact',
  Space: 'jump',
  KeyF: 'kick',
  Escape: 'pause',
  KeyP: 'pause',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  KeyQ: 'rotateL',
  KeyR: 'rotateR',
  Delete: 'remove',
  Backspace: 'remove',
  Tab: 'next',
  KeyT: 'reset',
};

const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

const PAD_ACTIONS: [number, Action][] = [
  [PAD.A, 'interact'],
  [PAD.X, 'kick'],
  [PAD.B, 'back'],
  [PAD.START, 'pause'],
  [PAD.SELECT, 'pause'],
  [PAD.LB, 'prev'],
  [PAD.RB, 'next'],
  [PAD.Y, 'remove'],
  [PAD.Y, 'jump'],
  [PAD.L3, 'run'],
  [PAD.R3, 'reset'],
];

const DEADZONE = 0.18;

function dz(v: number): number {
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  return Math.sign(v) * Math.min(1, (a - DEADZONE) / (1 - DEADZONE));
}

function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['button', 'range', 'checkbox', 'radio'].includes((el as HTMLInputElement).type)) || el.isContentEditable;
}

export class Input {
  device: Device = matchMedia('(pointer: coarse)').matches && !IS_TV ? 'touch' : 'kbm';
  /** Movement, x right and y forward, in -1..1. */
  readonly move = { x: 0, y: 0 };
  /** Camera turn this frame, in radians before sensitivity. */
  readonly look = { x: 0, y: 0 };
  /** Analog throttle and brake from triggers, 0..1. */
  throttle = 0;
  brake = 0;
  /** Set while a menu or dialog owns input. */
  menuMode = false;
  /** When false, only the d-pad navigates menus and the stick is free (arrange mode). */
  stickNavigates = true;

  onDevice: ((d: Device) => void) | null = null;
  onMenu: ((a: MenuAction) => void) | null = null;
  onPadLost: (() => void) | null = null;

  private keys = new Set<string>();
  private held = new Set<Action>();
  /** Presses seen this frame. Unread presses expire at the next update. */
  private pressed = new Set<Action>();
  private incoming = new Set<Action>();
  private padPrev: boolean[] = [];
  private padIndex: number | null = null;
  private menuRepeat = { dir: '' as MenuAction | '', next: 0 };
  private mouseLook = { active: false, id: -1, x: 0, y: 0, dx: 0, dy: 0 };
  /** Touch module feeds these. */
  touchMove = { x: 0, y: 0 };
  touchLook = { dx: 0, dy: 0 };
  private touchHeld = new Set<Action>();
  /** When each action was last pressed (performance.now time base), for rhythm timing. */
  private stamps = new Map<Action, number>();
  /** Directional presses since the last takeDirs(), with their times. */
  private dirs: { dir: Dir; at: number }[] = [];
  private stickDir: Dir | null = null;

  constructor(canvas: HTMLElement) {
    addEventListener('keydown', (e) => this.keydown(e));
    addEventListener('keyup', (e) => this.keyup(e));
    addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
    canvas.addEventListener('pointerdown', (e) => this.pointerdown(e));
    addEventListener('pointermove', (e) => this.pointermove(e));
    addEventListener('pointerup', (e) => this.pointerup(e));
    addEventListener('pointercancel', (e) => this.pointerup(e));
    addEventListener('gamepadconnected', (e) => {
      this.padIndex = (e as GamepadEvent).gamepad.index;
    });
    addEventListener('gamepaddisconnected', (e) => {
      if (this.padIndex === (e as GamepadEvent).gamepad.index) {
        this.padIndex = null;
        this.padPrev = [];
        if (this.device === 'pad') this.onPadLost?.();
      }
    });
  }

  setDevice(d: Device): void {
    if (d === this.device) return;
    this.device = d;
    this.onDevice?.(d);
  }

  /** Forget everything held, e.g. after the tab was hidden or a menu opened. */
  releaseAll(): void {
    this.keys.clear();
    this.held.clear();
    this.touchHeld.clear();
    this.touchMove.x = this.touchMove.y = 0;
    this.mouseLook.active = false;
    this.move.x = this.move.y = 0;
  }

  isHeld(a: Action): boolean {
    return this.held.has(a) || this.touchHeld.has(a);
  }

  /** When `a` was last pressed (performance.now time base), or null. Event times, not frame times. */
  pressedAt(a: Action): number | null {
    return this.stamps.get(a) ?? null;
  }

  /**
   * Directional presses (arrows, WASD, d-pad, or a flick of the stick) since
   * the last call, oldest first, with their event times. For rhythm games and
   * in-world menus; walking still reads `move`.
   */
  takeDirs(): { dir: Dir; at: number }[] {
    const out = this.dirs;
    this.dirs = [];
    return out;
  }

  private dirPress(dir: Dir, at: number): void {
    this.dirs.push({ dir, at });
    if (this.dirs.length > 16) this.dirs.shift();
  }

  /** True once per press. */
  take(a: Action): boolean {
    if (!this.pressed.has(a)) return false;
    this.pressed.delete(a);
    return true;
  }

  press(a: Action): void {
    this.incoming.add(a);
  }

  touchDown(a: Action, at = performance.now()): void {
    this.setDevice('touch');
    if (!this.touchHeld.has(a)) {
      this.incoming.add(a);
      this.stamps.set(a, at);
    }
    this.touchHeld.add(a);
  }

  touchUp(a: Action): void {
    this.touchHeld.delete(a);
  }

  private keydown(e: KeyboardEvent): void {
    const tvBack = TV_BACK_CODES.has(e.keyCode);
    if (isTextField(e.target)) {
      const single = (e.target as HTMLElement).tagName === 'INPUT';
      let m: MenuAction | null = null;
      if (e.key === 'Escape' || tvBack) m = 'back';
      else if (single && e.key === 'ArrowUp') m = 'up';
      else if (single && e.key === 'ArrowDown') m = 'down';
      // TV remotes get the on-screen keyboard instead of the system one.
      else if (IS_TV && e.key === 'Enter') m = 'confirm';
      if (m) {
        this.setDevice('kbm');
        e.preventDefault();
        this.onMenu?.(m);
      }
      return;
    }
    this.setDevice('kbm');
    if (this.menuMode) {
      // WASD stays live for editors that move things while a panel is open.
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) this.keys.add(e.code);
      const m = this.keyToMenu(e, tvBack);
      if (m) {
        e.preventDefault();
        this.onMenu?.(m);
      }
      return;
    }
    if (tvBack) {
      // The remote has no other menu key, so Back opens the menu in play.
      e.preventDefault();
      this.incoming.add('pause');
      return;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    const dir: Dir | undefined = ({ ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' } as Record<string, Dir>)[e.code];
    if (dir) this.dirPress(dir, e.timeStamp || performance.now());
    const a = KEY_ACTIONS[e.code];
    if (a) {
      this.held.add(a);
      this.incoming.add(a);
      this.stamps.set(a, e.timeStamp || performance.now());
    }
  }

  private keyToMenu(e: KeyboardEvent, tvBack: boolean): MenuAction | null {
    if (tvBack || e.key === 'Escape') return 'back';
    switch (e.key) {
      case 'ArrowUp':
        return 'up';
      case 'ArrowDown':
        return 'down';
      case 'ArrowLeft':
        return 'left';
      case 'ArrowRight':
        return 'right';
    }
    return null;
  }

  private keyup(e: KeyboardEvent): void {
    this.keys.delete(e.code);
    const a = KEY_ACTIONS[e.code];
    if (a && !Object.entries(KEY_ACTIONS).some(([code, act]) => act === a && this.keys.has(code))) this.held.delete(a);
  }

  private pointerdown(e: PointerEvent): void {
    if (e.pointerType === 'touch') return;
    this.setDevice('kbm');
    this.mouseLook = { active: true, id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
  }

  private pointermove(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && this.device !== 'kbm' && (Math.abs(e.movementX) + Math.abs(e.movementY) > 6)) this.setDevice('kbm');
    if (!this.mouseLook.active || e.pointerId !== this.mouseLook.id) return;
    this.mouseLook.dx += e.clientX - this.mouseLook.x;
    this.mouseLook.dy += e.clientY - this.mouseLook.y;
    this.mouseLook.x = e.clientX;
    this.mouseLook.y = e.clientY;
  }

  private pointerup(e: PointerEvent): void {
    if (e.pointerId === this.mouseLook.id) this.mouseLook.active = false;
  }

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (this.padIndex !== null && pads[this.padIndex]) return pads[this.padIndex];
    for (const p of pads) {
      if (p && p.connected) {
        this.padIndex = p.index;
        return p;
      }
    }
    return null;
  }

  /** Call once per frame before game logic reads input. */
  update(dt: number, now: number): void {
    this.pressed = this.incoming;
    this.incoming = new Set();

    let mx = 0;
    let my = 0;
    const k = this.keys;
    if (!this.menuMode) {
      if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
      if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    }
    let lx = this.mouseLook.dx * 0.0055;
    let ly = this.mouseLook.dy * 0.0045;
    this.mouseLook.dx = this.mouseLook.dy = 0;
    lx += this.touchLook.dx * 0.0065;
    ly += this.touchLook.dy * 0.005;
    this.touchLook.dx = this.touchLook.dy = 0;
    if (k.has('KeyJ')) lx -= 2.2 * dt;
    if (k.has('KeyL')) lx += 2.2 * dt;
    if (k.has('KeyI')) ly -= 1.5 * dt;
    if (k.has('KeyK')) ly += 1.5 * dt;

    this.throttle = 0;
    this.brake = 0;
    const p = this.pad();
    if (p) {
      const b = (i: number) => !!p.buttons[i]?.pressed;
      const v = (i: number) => p.buttons[i]?.value ?? 0;
      const ax = dz(p.axes[0] ?? 0);
      const ay = dz(p.axes[1] ?? 0);
      const rx = dz(p.axes[2] ?? 0);
      const ry = dz(p.axes[3] ?? 0);
      const any = p.buttons.some((x) => x?.pressed) || Math.abs(ax) + Math.abs(ay) + Math.abs(rx) + Math.abs(ry) > 0.5;
      if (any) this.setDevice('pad');
      if (this.menuMode) {
        this.padMenu(p, ax, ay, now);
      } else {
        let px = ax;
        let py = -ay;
        if (b(PAD.LEFT)) px -= 1;
        if (b(PAD.RIGHT)) px += 1;
        if (b(PAD.UP)) py += 1;
        if (b(PAD.DOWN)) py -= 1;
        if (Math.abs(px) + Math.abs(py) > Math.abs(mx) + Math.abs(my)) {
          mx = px;
          my = py;
        }
        lx += rx * 2.6 * dt;
        ly += ry * 1.8 * dt;
        this.throttle = v(PAD.RT);
        this.brake = v(PAD.LT);
        const stamp = p.timestamp || performance.now();
        for (const [i, d] of [[PAD.UP, 'up'], [PAD.DOWN, 'down'], [PAD.LEFT, 'left'], [PAD.RIGHT, 'right']] as const) if (b(i) && !this.padPrev[i]) this.dirPress(d, stamp);
        for (const [i, a] of PAD_ACTIONS) {
          const down = b(i);
          if (down && !this.padPrev[i]) {
            this.pressed.add(a);
            this.stamps.set(a, stamp);
          }
          if (down) this.held.add(a);
          else if (this.padPrev[i]) this.held.delete(a);
        }
      }
      this.padPrev = p.buttons.map((x) => !!x?.pressed);
    }

    if (Math.abs(this.touchMove.x) + Math.abs(this.touchMove.y) > Math.abs(mx) + Math.abs(my)) {
      mx = this.touchMove.x;
      my = this.touchMove.y;
    }
    // A flick of a stick (pad or touch) past most of its travel counts as a directional press.
    const sx = this.touchMove.x || (this.pad() ? dz(this.pad()!.axes[0] ?? 0) : 0);
    const sy = this.touchMove.y || (this.pad() ? -dz(this.pad()!.axes[1] ?? 0) : 0);
    const flick: Dir | null = Math.hypot(sx, sy) < 0.6 ? null : Math.abs(sx) > Math.abs(sy) ? (sx > 0 ? 'right' : 'left') : sy > 0 ? 'up' : 'down';
    if (flick && flick !== this.stickDir && !this.menuMode) this.dirPress(flick, performance.now());
    this.stickDir = flick;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    this.move.x = this.menuMode ? 0 : mx;
    this.move.y = this.menuMode ? 0 : my;
    this.look.x = this.menuMode ? 0 : lx;
    this.look.y = this.menuMode ? 0 : ly;
  }

  private padMenu(p: Gamepad, ax: number, ay: number, now: number): void {
    const b = (i: number) => !!p.buttons[i]?.pressed;
    const edge = (i: number) => b(i) && !this.padPrev[i];
    if (edge(PAD.A)) this.onMenu?.('confirm');
    if (edge(PAD.B)) this.onMenu?.('back');
    if (edge(PAD.START)) this.onMenu?.('pause');
    if (edge(PAD.LB)) this.onMenu?.('prev');
    if (edge(PAD.RB)) this.onMenu?.('next');
    if (edge(PAD.X) || edge(PAD.Y)) this.onMenu?.('alt');
    let dir: MenuAction | '' = '';
    const sx = this.stickNavigates ? ax : 0;
    const sy = this.stickNavigates ? ay : 0;
    if (b(PAD.UP) || sy < -0.6) dir = 'up';
    else if (b(PAD.DOWN) || sy > 0.6) dir = 'down';
    else if (b(PAD.LEFT) || sx < -0.6) dir = 'left';
    else if (b(PAD.RIGHT) || sx > 0.6) dir = 'right';
    if (!dir) {
      this.menuRepeat.dir = '';
      return;
    }
    if (dir !== this.menuRepeat.dir) {
      this.menuRepeat = { dir, next: now + 380 };
      this.onMenu?.(dir);
    } else if (now >= this.menuRepeat.next) {
      this.menuRepeat.next = now + 120;
      this.onMenu?.(dir);
    }
  }

  /** Raw stick for menus that move things (sketch cursor, arrange mode). */
  padStick(): { x: number; y: number; a: boolean } | null {
    const p = this.pad();
    if (!p) return null;
    return { x: dz(p.axes[0] ?? 0), y: dz(p.axes[1] ?? 0), a: !!p.buttons[PAD.A]?.pressed };
  }

  hasPad(): boolean {
    return this.pad() !== null;
  }

  /** Arrow/WASD keys for menus that move things with the keyboard. */
  keyStick(): { x: number; y: number } {
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.has('KeyA')) x -= 1;
    if (k.has('KeyD')) x += 1;
    if (k.has('KeyW')) y -= 1;
    if (k.has('KeyS')) y += 1;
    return { x, y };
  }
}
