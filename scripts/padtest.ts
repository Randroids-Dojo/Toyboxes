// Controller playtest with an injected standard-mapping gamepad: name entry
// through the on-screen keyboard, movement, the pause menu, a claim through
// the PIN pad, sketching with the stick, and a disconnect.
//
//   npx tsx scripts/padtest.ts [outDir] [url]

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? '/tmp/toyboxes-pad';
const url = process.argv[3] ?? 'http://localhost:5207/';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => {
  errors.push(e.message);
  console.log('[pageerror]', e.message);
});
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

// A string, so the bundler running this script cannot inject helpers into it.
await page.addInitScript(`
  (() => {
    const pad = { buttons: new Array(17).fill(0), axes: [0, 0, 0, 0], connected: true };
    window.__pad = pad;
    const snapshot = () => ({
      id: 'Test Pad (STANDARD GAMEPAD)',
      index: 0,
      connected: pad.connected,
      mapping: 'standard',
      timestamp: performance.now(),
      axes: pad.axes.slice(),
      buttons: pad.buttons.map((v) => ({ pressed: v > 0.5, touched: v > 0, value: v })),
    });
    Object.defineProperty(navigator, 'getGamepads', { value: () => (pad.connected ? [snapshot(), null, null, null] : [null, null, null, null]) });
  })();
`);

const BTN = { A: 0, B: 1, X: 2, Y: 3, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
let shot = 0;
const snap = async (name: string) => {
  shot++;
  await page.screenshot({ path: join(out, `${String(shot).padStart(2, '0')}-${name}.png`) });
  console.log('shot', name);
};
const press = async (b: number, hold = 160) => {
  await page.evaluate((i) => ((window as unknown as { __pad: { buttons: number[] } }).__pad.buttons[i] = 1), b);
  await page.waitForTimeout(hold);
  await page.evaluate((i) => ((window as unknown as { __pad: { buttons: number[] } }).__pad.buttons[i] = 0), b);
  await page.waitForTimeout(90);
};
const stick = async (x: number, y: number, ms: number) => {
  await page.evaluate(([x, y]) => {
    const p = (window as unknown as { __pad: { axes: number[] } }).__pad;
    p.axes[0] = x;
    p.axes[1] = y;
  }, [x, y]);
  await page.waitForTimeout(ms);
  await page.evaluate(() => {
    const p = (window as unknown as { __pad: { axes: number[] } }).__pad;
    p.axes[0] = 0;
    p.axes[1] = 0;
  });
  await page.waitForTimeout(120);
};
const focused = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? document.activeElement?.tagName ?? '');
const state = () => page.evaluate(() => (window as unknown as { toyboxes: { debug: { state(): Record<string, unknown> } } }).toyboxes.debug.state());
async function focusButton(label: string, dirs: number[] = [BTN.DOWN, BTN.RIGHT, BTN.UP, BTN.LEFT]): Promise<void> {
  for (let i = 0; i < 24; i++) {
    if ((await focused()) === label) return;
    await press(dirs[Math.floor(i / 6) % dirs.length]);
  }
  throw new Error(`Could not reach "${label}" by d-pad, focus is on "${await focused()}"`);
}

await page.goto(url);
await page.waitForSelector('body.ready');
await page.waitForTimeout(1200);
// Any input from the pad switches the game into controller mode.
await press(BTN.DOWN);
await page.waitForTimeout(200);
const device = await page.evaluate(() => document.body.dataset.device);
if (device !== 'pad') throw new Error(`Expected pad mode, got ${device}`);

// 1. Type a name with the on-screen keyboard: focus starts on the field.
await press(BTN.UP);
await press(BTN.A);
await page.waitForSelector('.osk');
await snap('osk-open');
// Initial key is "q". Type "Jo": find J (row 3) and o (row 2).
await focusButton('A', [BTN.DOWN]);
for (let i = 0; i < 6; i++) await press(BTN.RIGHT);
if ((await focused()) !== 'J') throw new Error(`Expected J, got ${await focused()}`);
await press(BTN.A);
await press(BTN.UP); // u
await press(BTN.RIGHT); // i
await press(BTN.RIGHT); // o
if ((await focused()).toLowerCase() !== 'o') throw new Error(`Expected o, got ${await focused()}`);
await press(BTN.A);
await snap('osk-typed');
await press(BTN.B);
await page.waitForTimeout(200);
const typed = await page.locator('input.field').inputValue();
if (typed !== 'Jo') throw new Error(`Expected "Jo" in the name field, got "${typed}"`);
await focusButton("Let's go", [BTN.DOWN, BTN.RIGHT]);
await press(BTN.A);
await page.waitForTimeout(500);
await snap('named');

// 2. Move with the left stick.
const before = await state();
await stick(0, -1, 1000);
const after = await state();
const moved = Math.hypot((after.x as number) - (before.x as number), (after.z as number) - (before.z as number));
console.log('moved', moved.toFixed(2));
if (moved < 2) throw new Error('Stick did not move the player');

// 3. Pause menu opens with Start and closes with B.
await press(BTN.START);
await page.waitForTimeout(300);
if (!(await state()).menu) throw new Error('Start did not open the menu');
await press(BTN.DOWN);
await snap('pause-menu');
if ((await focused()) !== 'Settings') throw new Error(`Expected focus on Settings, got ${await focused()}`);
await press(BTN.A);
await page.waitForTimeout(300);
await snap('settings');
await press(BTN.B);
await press(BTN.B);
await page.waitForTimeout(300);
if ((await state()).menu) throw new Error('B did not close the menus');

// 4. Claim the first free room using the PIN pad with the d-pad.
const world = (await (await fetch(new URL('/api/world', url))).json()) as { slots: { slot: number; roomId: string | null }[] };
const free = world.slots.find((s) => !s.roomId)!;
const ent = (await page.evaluate(() => (window as unknown as { toyboxes: { debug: { entrances(): { kind: string; slot: number; x: number; z: number; outYaw: number }[] } } }).toyboxes.debug.entrances())).find((e) => e.kind === 'house' && e.slot === free.slot)!;
await page.evaluate(([x, z, yaw]) => (window as unknown as { toyboxes: { debug: { teleport(x: number, z: number, y: number): void } } }).toyboxes.debug.teleport(x, z, yaw), [ent.x, ent.z, ent.outYaw + Math.PI] as const);
await page.waitForTimeout(400);
await press(BTN.A);
await page.waitForTimeout(300);
await press(BTN.A);
await page.waitForSelector('.pin-card');
for (let i = 0; i < 4; i++) await press(BTN.A); // "5" has focus
await snap('pin-by-pad');
if ((await focused()) !== 'Next') throw new Error(`Expected Next focused after 4 digits, got ${await focused()}`);
await press(BTN.A);
await page.waitForTimeout(300);
for (let i = 0; i < 4; i++) await press(BTN.A);
await press(BTN.A);
await page.waitForTimeout(2800);
const inRoom = await state();
if (inRoom.space !== 'room' || !inRoom.unlocked) throw new Error(`Claim by pad failed: ${JSON.stringify(inRoom)}`);
await snap('room-by-pad');

// 5. Sketch with the stick: open the book, A on the canvas, hold A and move.
const spots = await page.evaluate(() => (window as unknown as { toyboxes: { debug: { spots(): { lectern: { x: number; z: number } } } } }).toyboxes.debug.spots());
await page.evaluate(([x, z]) => (window as unknown as { toyboxes: { debug: { teleport(x: number, z: number, y: number): void } } }).toyboxes.debug.teleport(x, z, -Math.PI / 2), [spots.lectern.x + 0.3, spots.lectern.z] as const);
await page.waitForTimeout(300);
await press(BTN.A);
await page.waitForSelector('.book');
await page.waitForTimeout(700);
await page.evaluate(() => (document.querySelector('canvas.sketch') as HTMLElement).focus());
await press(BTN.A);
await page.evaluate(() => ((window as unknown as { __pad: { buttons: number[] } }).__pad.buttons[0] = 1));
await stick(0.8, 0.4, 700);
await page.evaluate(() => ((window as unknown as { __pad: { buttons: number[] } }).__pad.buttons[0] = 0));
await page.waitForTimeout(150);
await snap('pad-sketch');
const status = await page.locator('.save-state').textContent();
if (status !== 'Not saved yet') throw new Error(`Expected the drawing to make the page dirty, got "${status}"`);
await press(BTN.B);
await press(BTN.B);
await page.waitForTimeout(300);
// The page needs words before it saves, so closing asks first.
await snap('close-unsaved');
const asked = await page.locator('.card h2').last().textContent();
if (!asked?.includes('without saving')) throw new Error(`Expected a close-without-saving prompt, got "${asked}"`);
await press(BTN.A);
await page.waitForTimeout(400);

// 6. Unplugging the controller opens the menu with a note.
await page.evaluate(() => {
  const p = (window as unknown as { __pad: { connected: boolean } }).__pad;
  p.connected = false;
  const e = new Event('gamepaddisconnected');
  Object.defineProperty(e, 'gamepad', { value: { index: 0 } });
  window.dispatchEvent(e);
});
await page.waitForTimeout(400);
await snap('pad-lost');
const note = await page.locator('.note-bad').textContent().catch(() => null);
if (!note?.includes('Controller disconnected')) throw new Error('No disconnect message');

if (errors.length) {
  console.log('ERRORS', errors);
  process.exitCode = 1;
}
console.log('done', out);
await browser.close();
