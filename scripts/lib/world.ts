// Shared playtest harness for the worlds: claims a local room, publishes one
// experience area through the dev admin, opens it in headless Chromium on the
// chosen device and walks in. Drives the real input for each device.
//
//   const w = await openWorld({ kind: 'neon', areaId: 'neon-party', name: 'Neon space party' });
//   await w.act();                      // interact: E, A, OK or the touch Action button
//   await w.until(async () => (await w.exp()).state === 'menu', 'menu');
//   await w.shot('arena');
//   await w.done('Neon playtest passed');
//
// Device from the environment: PHONE=1, PAD=1 or REMOTE=1 (desktop otherwise).
// Server from TOYBOXES_BASE (default http://localhost:5207/). Local memory
// servers only. CPU_SLOWDOWN=3 slows the page's CPU, as on a weak phone or a
// busy machine, to shake out timing that only works at a high frame rate.

import { mkdirSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { requireLocalPlaytest } from '../autobuild/safety';

export type Device = 'desktop' | 'phone' | 'pad' | 'remote';
export type Button = 'interact' | 'kick' | 'jump';
export type Dir = 'up' | 'down' | 'left' | 'right';

export interface World {
  page: Page;
  device: Device;
  out: string;
  roomId: string;
  errors: string[];
  /** Calls window.toyboxes.debug[f](...args). */
  dbg<T = any>(f: string, ...args: unknown[]): Promise<T>;
  /** The experience's debugInfo(). */
  exp<T = any>(): Promise<T>;
  /** Calls a debug method on the experience. */
  call<T = any>(method: string, ...args: unknown[]): Promise<T>;
  /** Presses a button the way this device would. */
  act(b?: Button): Promise<void>;
  /** Holds a button for `ms`. */
  hold(b: Button, ms: number): Promise<void>;
  /** A short directional press: arrows, d-pad (phones have no arrows; use taps on your own buttons). */
  dir(d: Dir, ms?: number): Promise<void>;
  /** Walks with the stick or keys for `ms`. */
  walk(d: Dir, ms: number): Promise<void>;
  /** Back: Escape, B, or Escape for the remote. */
  back(): Promise<void>;
  /** Presses the focused button of the open card (Enter, A, OK, or a tap on its primary button). */
  confirm(): Promise<void>;
  /** Whether a card or menu is open. */
  menuOpen(): Promise<boolean>;
  until(check: () => Promise<boolean>, what: string, ms?: number): Promise<void>;
  shot(name: string): Promise<void>;
  /** Fails on page errors, closes the browser and prints the pass line. */
  done(message: string): Promise<void>;
  browser: Browser;
}

const PAD_BUTTON: Record<Button, number> = { interact: 0, kick: 2, jump: 3 };
const PAD_DIR: Record<Dir, number> = { up: 12, down: 13, left: 14, right: 15 };
const KEY: Record<Button, string> = { interact: 'KeyE', kick: 'KeyF', jump: 'Space' };
const ARROW: Record<Dir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const TOUCH: Record<Button, string> = { interact: '.tbtn-action', kick: '.tbtn-kick', jump: '.tbtn-jump' };

export function deviceFromEnv(): Device {
  return process.env.PHONE === '1' ? 'phone' : process.env.PAD === '1' ? 'pad' : process.env.REMOTE === '1' ? 'remote' : 'desktop';
}

export async function openWorld(opts: {
  kind: string;
  areaId: string;
  name: string;
  /** Extra fields for the experience, e.g. a kart track. */
  experience?: Record<string, unknown>;
  device?: Device;
  time?: 'day' | 'night' | 'sunset';
  out?: string;
  /** Walk through the area door (default) or stop in the room. */
  enter?: boolean;
  quality?: 'low' | 'medium' | 'high';
  /**
   * Render on this Mac's GPU instead of SwiftShader, whose software rendering
   * keeps the page's main thread busy far longer than a phone's GPU would.
   * Timing tests want this; elsewhere SwiftShader is the steadier default.
   */
  gpu?: boolean;
}): Promise<World> {
  const base = process.env.TOYBOXES_BASE ?? 'http://localhost:5207/';
  requireLocalPlaytest(base);
  const device = opts.device ?? deviceFromEnv();
  const out = opts.out ?? `/tmp/toyboxes-${opts.kind}-${device}`;
  mkdirSync(out, { recursive: true });
  const api = async (path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const r = await fetch(new URL(path, base), { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json();
    if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(data)}`);
    return { data, headers: r.headers };
  };
  const free = (await api('/api/world')).data.slots.find((s: { roomId: string | null }) => !s.roomId);
  if (!free) throw new Error('The local town is full; restart the dev server');
  const stamp = Date.now();
  // A made-up local address per run keeps repeated local runs under the claim limit.
  const fakeIp = `10.${(stamp >> 16) & 255}.${(stamp >> 8) & 255}.${stamp & 255}`;
  const claim = await api('/api/room', { action: 'claim', slot: free.slot, name: `${opts.kind} tester`.slice(0, 20), pin: '2468', pinConfirm: '2468', browserId: `${opts.kind}-test-${stamp}-owner` }, { 'x-forwarded-for': fakeIp });
  const roomId = claim.data.room.id as string;
  const H = { 'x-toyboxes-admin': '1' };
  const login = await api('/api/admin', { action: 'login', password: 'toyboxes-dev' }, H);
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
  await api(
    '/api/admin',
    { action: 'saveContent', roomId, content: { rev: 0, areas: [{ id: opts.areaId, name: opts.name, theme: { wall: 0, floor: 0, trim: 4 }, props: [], published: true, experience: { kind: opts.kind, ...(opts.experience ?? {}) }, pages: [] }], exhibits: [] } },
    { ...H, cookie },
  );
  const gl = opts.gpu && process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await chromium.launch({ args: [...gl, '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext(device === 'phone' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
  // tsx names functions inside page.evaluate callbacks with a __name helper the page lacks.
  await ctx.addInitScript('window.__name = (f) => f;');
  const browserId = `${opts.kind}-test-player-${String(stamp).slice(-8)}`;
  await ctx.addInitScript((id) => localStorage.setItem('toyboxes.identity', JSON.stringify({ browserId: id, name: 'Tester' })), browserId);
  await ctx.addInitScript(([time, quality]) => localStorage.setItem('toyboxes.settings', JSON.stringify({ time, quality })), [opts.time ?? 'day', opts.quality ?? 'auto'] as const);
  const page = await ctx.newPage();
  const slowdown = Number(process.env.CPU_SLOWDOWN ?? 1);
  if (slowdown > 1) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: slowdown });
  const errors: string[] = [];
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.log('pageerror', e.message);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('console error', m.text());
  });
  if (device === 'pad')
    await page.addInitScript(`(() => {
      const pad = { buttons: new Array(17).fill(0), axes: [0, 0, 0, 0], connected: true }; window.__pad = pad;
      const snapshot = () => ({ id: 'Test Pad (STANDARD GAMEPAD)', index: 0, connected: pad.connected, mapping: 'standard', timestamp: performance.now(), axes: pad.axes.slice(), buttons: pad.buttons.map((v) => ({ pressed: v > 0.5, touched: v > 0, value: v })) });
      Object.defineProperty(navigator, 'getGamepads', { value: () => (pad.connected ? [snapshot(), null, null, null] : [null, null, null, null]) });
    })();`);

  const dbg = <T = any>(f: string, ...args: unknown[]): Promise<T> => page.evaluate(([f, a]) => (window as any).toyboxes.debug[f as string](...(a as unknown[])), [f, args] as const) as Promise<T>;
  // Waits two frames after each change so a slow (software rendered) frame never misses a press or a release.
  const padSet = (i: number, v: number) =>
    page.evaluate(
      ([i, v]) => {
        (window as any).__pad.buttons[i] = v;
        return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      },
      [i, v] as const,
    );
  const w: World = {
    page,
    device,
    out,
    roomId,
    errors,
    browser,
    dbg,
    exp: () => dbg('experience'),
    call: (method, ...args) => dbg('experienceCall', method, ...args),
    async act(b: Button = 'interact') {
      if (device === 'phone') await page.locator(TOUCH[b]).tap();
      else if (device === 'pad') {
        await padSet(PAD_BUTTON[b], 1);
        await page.waitForTimeout(90);
        await padSet(PAD_BUTTON[b], 0);
      } else if (device === 'remote') {
        if (b !== 'interact') throw new Error(`A TV remote has no ${b} button`);
        await page.keyboard.press('Enter');
      } else await page.keyboard.press(KEY[b]);
      await page.waitForTimeout(120);
    },
    async hold(b: Button, ms: number) {
      if (device === 'phone') {
        const box = await page.locator(TOUCH[b]).boundingBox();
        if (!box) throw new Error(`No ${b} button on screen`);
        const cdp = await page.context().newCDPSession(page);
        const pt = [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 7 }];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
        await page.waitForTimeout(ms);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else if (device === 'pad') {
        await padSet(PAD_BUTTON[b], 1);
        await page.waitForTimeout(ms);
        await padSet(PAD_BUTTON[b], 0);
      } else {
        if (device === 'remote' && b !== 'interact') throw new Error(`A TV remote has no ${b} button`);
        const key = device === 'remote' ? 'Enter' : KEY[b];
        await page.keyboard.down(key);
        await page.waitForTimeout(ms);
        await page.keyboard.up(key);
      }
      await page.waitForTimeout(60);
    },
    async dir(d: Dir, ms = 90) {
      if (device === 'pad') {
        await padSet(PAD_DIR[d], 1);
        await page.waitForTimeout(ms);
        await padSet(PAD_DIR[d], 0);
      } else if (device === 'phone') throw new Error('Phones have no arrows; tap the world\'s own buttons');
      else {
        await page.keyboard.down(ARROW[d]);
        await page.waitForTimeout(ms);
        await page.keyboard.up(ARROW[d]);
      }
      await page.waitForTimeout(40);
    },
    async walk(d: Dir, ms: number) {
      if (device === 'phone') {
        const cdp = await page.context().newCDPSession(page);
        const x0 = 110;
        const y0 = 640;
        const dx = d === 'left' ? -50 : d === 'right' ? 50 : 0;
        const dy = d === 'up' ? -50 : d === 'down' ? 50 : 0;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 3 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + dx, y: y0 + dy, id: 3 }] });
        await page.waitForTimeout(ms);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else if (device === 'pad') {
        const axis = d === 'left' || d === 'right' ? 0 : 1;
        const v = d === 'left' || d === 'up' ? -1 : 1;
        await page.evaluate(([a, v]) => ((window as any).__pad.axes[a] = v), [axis, v] as const);
        await page.waitForTimeout(ms);
        await page.evaluate((a) => ((window as any).__pad.axes[a] = 0), axis);
      } else {
        const key = device === 'remote' ? ARROW[d] : { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' }[d];
        await page.keyboard.down(key);
        await page.waitForTimeout(ms);
        await page.keyboard.up(key);
      }
      await page.waitForTimeout(60);
    },
    async back() {
      if (device === 'pad') {
        await padSet(1, 1);
        await page.waitForTimeout(90);
        await padSet(1, 0);
      } else await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    },
    async confirm() {
      if (device === 'phone') {
        const primary = page.locator('.modal.in .btn.primary');
        await ((await primary.count()) ? primary.first() : page.locator('.modal.in .btn').first()).tap();
      }
      else if (device === 'pad') {
        await padSet(0, 1);
        await page.waitForTimeout(90);
        await padSet(0, 0);
      } else await page.keyboard.press('Enter');
      await page.waitForTimeout(250);
    },
    menuOpen: () => page.evaluate(() => !!document.querySelector('.modal.in')),
    async until(check, what, ms = 15000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (await check()) return;
        await page.waitForTimeout(100);
      }
      await page.screenshot({ path: `${out}/failure.png` });
      throw new Error(`Timed out: ${what}: ${JSON.stringify(await dbg('state'))} ${JSON.stringify(await dbg('experience')).slice(0, 1500)}`);
    },
    async shot(name: string) {
      await page.screenshot({ path: `${out}/${name}.png` });
    },
    async done(message: string) {
      await browser.close();
      if (errors.length) throw new Error(`ERRORS: ${errors.join(' | ')}`);
      console.log(`${message}: ${out}`);
    },
  };

  await page.goto(new URL(`/?room=${roomId}`, base).toString());
  await page.waitForSelector('body.ready');
  await w.until(async () => (await dbg('state')).space === 'room', 'room');
  await page.waitForTimeout(800);
  if (device === 'pad') {
    // Hold a d-pad button until the game notices the controller (first frames can be slow).
    await padSet(13, 1);
    const until = Date.now() + 8000;
    while (Date.now() < until && (await page.evaluate(() => document.body.dataset.device)) !== 'pad') await page.waitForTimeout(100);
    await padSet(13, 0);
    await page.waitForTimeout(200);
    if ((await page.evaluate(() => document.body.dataset.device)) !== 'pad') throw new Error('Controller did not activate');
  }
  if (opts.enter !== false) {
    const door = (await dbg('spots')).areaDoors[0];
    await dbg('teleport', door.x, door.z + 0.3, Math.PI);
    await page.waitForTimeout(300);
    await w.act();
    await w.until(async () => (await dbg('state')).space === 'area', 'enter the area');
    await page.waitForTimeout(600);
  }
  return w;
}
