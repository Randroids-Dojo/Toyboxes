// Scripted playtest of the critical flows with real keyboard, mouse and touch
// input. Saves screenshots and fails loudly on page errors.
//
//   npx tsx scripts/playtest.ts [desktop|phone] [outDir] [url]
//
// Needs the dev server (`npm run dev`), which serves the API from memory.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';

const mode = process.argv[2] ?? 'desktop';
const out = process.argv[3] ?? `/tmp/toyboxes-play-${mode}`;
const url = process.argv[4] ?? 'http://localhost:5207/';
mkdirSync(out, { recursive: true });

const phone = mode === 'phone';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(
  phone
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
);
const page = await ctx.newPage();
const errors: string[] = [];
page.on('console', (m) => {
  // Expected API refusals (a deliberately wrong PIN) are logged by the browser; the UI handles them.
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) {
    errors.push(m.text());
    console.log('[console]', m.text());
  }
});
page.on('pageerror', (e) => {
  errors.push(e.message);
  console.log('[pageerror]', e.message);
});

let shot = 0;
async function snap(name: string): Promise<void> {
  shot++;
  await page.screenshot({ path: join(out, `${String(shot).padStart(2, '0')}-${name}.png`) });
  console.log('shot', name);
}

type Dbg = {
  toyboxes: {
    debug: {
      teleport(x: number, z: number, yaw: number): void;
      state(): Record<string, unknown>;
      entrances(): { kind: string; slot: number; x: number; z: number; outYaw: number }[];
      vehicles(): { kind: string; x: number; z: number; yaw: number }[];
      spots(): { door: { x: number; z: number }; lectern: { x: number; z: number }; chest: { x: number; z: number } } | null;
    };
  };
};

const state = () => page.evaluate(() => (window as unknown as Dbg).toyboxes.debug.state());
const teleport = (x: number, z: number, yaw: number) => page.evaluate(([x, z, yaw]) => (window as unknown as Dbg).toyboxes.debug.teleport(x, z, yaw), [x, z, yaw] as const);

async function hold(key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

async function expectState(check: (s: Record<string, unknown>) => boolean, what: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const s = await state();
    if (check(s)) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`Expected ${what}, got ${JSON.stringify(await state())}`);
}

async function tapButton(p: Page, name: string | RegExp): Promise<void> {
  const b = p.getByRole('button', { name }).first();
  if (phone) await b.tap();
  else await b.click();
}

async function enterPin(pin: string): Promise<void> {
  for (const d of pin) {
    const b = page.locator('.modal').last().getByRole('button', { name: d, exact: true });
    if (phone) await b.tap();
    else await b.click();
  }
}

await page.goto(url);
await page.waitForSelector('body.ready', { timeout: 20000 });
await page.waitForTimeout(1500);
await snap('first-visit-name');

// 1. Name, remembered on this browser.
await page.locator('input.field').fill('Cris');
await tapButton(page, "Let's go");
if (phone) {
  const dev = await page.evaluate(() => document.body.dataset.device);
  if (dev !== 'touch') throw new Error(`Expected touch controls on a phone, got ${dev}`);
}
await page.waitForTimeout(800);
await snap('hub-arrival');

// 2. Walk.
if (phone) {
  const stick = { x: 90, y: 700 };
  await page.touchscreen.tap(stick.x, stick.y);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: stick.x, y: stick.y, id: 1 }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: stick.x, y: stick.y - i * 6, id: 1 }] });
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(1200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
} else {
  await hold('KeyW', 1400);
}
const walked = await state();
console.log('after walk', walked);
if (Math.abs((walked.z as number) - 8.5) < 1) throw new Error('Player did not move');
await snap('walked');

// 3. Ride the go-kart.
const vehicles = await page.evaluate(() => (window as unknown as Dbg).toyboxes.debug.vehicles());
const kart = vehicles.find((v) => v.kind === 'kart')!;
await teleport(kart.x - 1.6, kart.z, Math.PI / 2);
await page.waitForTimeout(400);
await expectState((s) => String(s.prompt).includes('go-kart'), 'kart prompt');
await snap('kart-prompt');
if (phone) await page.locator('.tbtn-action').tap();
else await page.keyboard.press('KeyE');
await expectState((s) => s.riding === 'kart', 'riding the kart');
if (phone) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 90, y: 700, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 95, y: 640, id: 2 }] });
  await page.waitForTimeout(1600);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
} else {
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyA');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');
}
await snap('driving');
const drove = await state();
console.log('after drive', drove);
if (phone) await page.locator('.tbtn-action').tap();
else await page.keyboard.press('KeyE');
await expectState((s) => s.riding === null, 'got off');

// 4. Claim the first free room.
const world = (await (await fetch(new URL('/api/world', url))).json()) as { slots: { slot: number; roomId: string | null }[] };
const free = world.slots.find((s) => !s.roomId);
if (!free) throw new Error('No free rooms left; restart the dev server for a fresh store');
const ent = (await page.evaluate(() => (window as unknown as Dbg).toyboxes.debug.entrances())).find((e) => e.kind === 'house' && e.slot === free.slot)!;
await teleport(ent.x, ent.z, ent.outYaw + Math.PI);
await page.waitForTimeout(500);
await expectState((s) => String(s.prompt).startsWith(`Claim room ${free.slot + 1}`), 'claim prompt');
await snap('claim-prompt');
if (phone) await page.locator('.tbtn-action').tap();
else await page.keyboard.press('KeyE');
await page.waitForTimeout(400);
await snap('claim-dialog');
await tapButton(page, /Choose a PIN/);
await page.waitForTimeout(300);
await enterPin('0427');
await snap('pin-1');
await tapButton(page, 'Next');
await page.waitForTimeout(300);
await enterPin('0427');
await tapButton(page, 'Claim');
await page.waitForTimeout(2600);
await expectState((s) => s.space === 'room' && s.unlocked === true, 'inside my unlocked room');
await snap('my-room');

// 5. Sketchbook: two pages.
const spots = (await page.evaluate(() => (window as unknown as Dbg).toyboxes.debug.spots()))!;
await teleport(spots.lectern.x + 0.3, spots.lectern.z, -Math.PI / 2);
await page.waitForTimeout(400);
await expectState((s) => String(s.prompt).includes('sketchbook'), 'book prompt');
if (phone) await page.locator('.tbtn-action').tap();
else await page.keyboard.press('KeyE');
await page.waitForSelector('.book', { timeout: 5000 });
await page.waitForTimeout(600);
const canvas = page.locator('canvas.sketch');
const box = (await canvas.boundingBox())!;
const pt = (i: number) => ({ x: box.x + box.width * (0.2 + i * 0.05), y: box.y + box.height * (0.7 - Math.sin(i / 4) * 0.3) });
if (phone) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...pt(0), id: 5 }] });
  for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...pt(i), id: 5 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
} else {
  await page.mouse.move(pt(0).x, pt(0).y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(pt(i).x, pt(i).y);
  await page.mouse.up();
}
await page.locator('textarea.page-text').fill('A soccer game in my room. Two goals, and the ball should bounce off the walls.');
await snap('sketchbook-page-1');
await tapButton(page, 'Save page');
await page.waitForFunction(() => document.querySelector('.save-state')?.textContent === 'Saved', null, { timeout: 8000 });
await tapButton(page, /New page/);
await page.waitForTimeout(500);
await page.locator('textarea.page-text').fill('A go-kart course behind a secret door.');
await tapButton(page, 'Save page');
await page.waitForFunction(() => document.querySelector('.save-state')?.textContent === 'Saved', null, { timeout: 8000 });
await tapButton(page, '‹ Back');
await page.waitForTimeout(500);
await page.locator('textarea.page-text').fill('A soccer game in my room with three goals.');
await tapButton(page, 'Save page');
await page.waitForFunction(() => document.querySelector('.save-state')?.textContent === 'Saved', null, { timeout: 8000 });
await snap('sketchbook-revised');
const pageLabel = await page.locator('.book-page').textContent();
if (!pageLabel?.startsWith('Page 1')) throw new Error(`Expected to be on page 1, got ${pageLabel}`);
await tapButton(page, 'Close');
await page.waitForTimeout(500);

// 6. Arrange toys: add a cone and save.
await teleport(spots.chest.x - 0.3, spots.chest.z, Math.PI / 2);
await page.waitForTimeout(400);
await expectState((s) => String(s.prompt).includes('Arrange'), 'arrange prompt');
if (phone) await page.locator('.tbtn-action').tap();
else await page.keyboard.press('KeyE');
await page.waitForSelector('.arrange', { timeout: 5000 });
await page.waitForTimeout(800);
const tray = (t: string) => page.locator('.tray-btn').filter({ hasText: t });
if (phone) await tray('Cone').tap();
else await tray('Cone').click();
await page.waitForTimeout(300);
if (phone) await tray('Target').tap();
else await tray('Target').click();
await page.waitForTimeout(600);
await snap('arrange');
await tapButton(page, 'Done');
await page.waitForTimeout(1200);
await snap('arranged-room');

// 7. Kick the ball into the goal (starter layout: ball at 0,-1; goal at 0,-3.4 facing +z).
await teleport(0, 0.2, Math.PI);
await page.waitForTimeout(500);
if (phone) await page.locator('.tbtn-kick').tap();
else await page.keyboard.press('Space');
await page.waitForTimeout(250);
await snap('kick');
await page.waitForTimeout(1000);

// 8. Leave, check the house sign, then reload as a returning visitor.
await teleport(spots.door.x, spots.door.z, 0);
await page.waitForTimeout(400);
if (phone) await page.locator('.tbtn-action').tap();
else await page.keyboard.press('KeyE');
await expectState((s) => s.space === 'hub', 'back in town');
await page.waitForTimeout(900);
await snap('back-in-town');
await page.reload();
await page.waitForSelector('body.ready');
await page.waitForTimeout(1500);
const nameDialog = await page.locator('input.field').count();
if (nameDialog) throw new Error('Name was asked again on a return visit');
await snap('return-visit');

// 9. Rename: a wrong PIN changes nothing, the right one renames the room too.
if (!phone) {
  await page.keyboard.press('Escape');
  await tapButton(page, 'Change my name');
  await page.locator('input.field').fill('Crispin');
  await tapButton(page, 'Save name');
  await tapButton(page, /Also on room/);
  await enterPin('9999');
  await tapButton(page, 'Rename');
  await page.waitForSelector('.error:has-text("not right")');
  const still = (await (await fetch(new URL('/api/world', url))).json()) as { slots: { slot: number; ownerName: string | null }[] };
  if (still.slots[free.slot].ownerName !== 'Cris') throw new Error('A wrong PIN changed the room name');
  await enterPin('0427');
  await tapButton(page, 'Rename');
  await page.waitForSelector('.toast:has-text("Updated")');
  await snap('renamed');
  const after = (await (await fetch(new URL('/api/world', url))).json()) as { slots: { slot: number; ownerName: string | null }[] };
  if (after.slots[free.slot].ownerName !== 'Crispin') throw new Error('Room was not renamed');
}

if (errors.length) {
  console.log('ERRORS', errors);
  process.exitCode = 1;
}
console.log('done', out);
await browser.close();
