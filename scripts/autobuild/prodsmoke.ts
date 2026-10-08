// Read-only check of the live site after a release: the town loads, the
// API answers, and every published inner area of the given rooms opens
// without page errors. Writes nothing (no laps, spins or claims).
//
//   npx tsx scripts/autobuild/prodsmoke.ts [roomId ...]

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.TOYBOXES_URL ?? 'https://toyboxes.games';
const rooms = process.argv.slice(2);
const out = '/tmp/toyboxes-prodsmoke';
mkdirSync(out, { recursive: true });

for (const path of ['/', '/admin/', '/api/world', '/version.json', '/manifest.webmanifest']) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`${path} answered ${r.status}`);
}

// A fresh, cookie-free session request exercises the deployed admin module.
// Reading /admin/ alone checks HTML and cannot catch function import failures.
const session = await fetch(`${BASE}/api/admin?view=session`, { cache: 'no-store', headers: { 'x-toyboxes-admin': '1' } });
if (!session.ok) throw new Error(`Admin session endpoint answered ${session.status}`);
if ((await session.json()).admin !== false) throw new Error('A fresh admin session must be signed out');
console.log('admin session endpoint passed');

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => localStorage.setItem('toyboxes.identity', JSON.stringify({ browserId: 'prod-smoke-browser-000001', name: 'Smoke' })));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
type G = { toyboxes: { debug: Record<string, (...a: any[]) => any> } };
const d = (f: string, ...a: unknown[]) => page.evaluate(([f, a]) => (window as unknown as G).toyboxes.debug[f as string](...(a as unknown[])), [f, a] as const);
const state = () => d('state') as Promise<{ space: string }>;

/**
 * Back to the room through the pause menu. Worlds can open an intro card or
 * fly the camera round on a first visit; Escape closes or skips those first,
 * then opens the menu. A world may ask to confirm leaving.
 */
async function leave(name: string): Promise<void> {
  const back = page.getByRole('button', { name: /^Back to .*'s room$/ });
  const confirm = page.getByRole('button', { name: /^(Leave|Yes, leave)/ });
  for (let i = 0; i < 12; i++) {
    const s = (await state()) as { space: string; menu: boolean };
    if (s.space === 'room') {
      if (s.menu) await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      return;
    }
    // A card that opens over the menu blocks the click; Escape closes it and
    // the next pass tries again.
    if (await back.isVisible().catch(() => false)) {
      await back.click({ timeout: 5000 }).catch(() => page.keyboard.press('Escape'));
      await page.waitForTimeout(2800);
    } else if (await confirm.first().isVisible().catch(() => false)) {
      await confirm.first().click({ timeout: 5000 }).catch(() => page.keyboard.press('Escape'));
      await page.waitForTimeout(2800);
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(900);
    }
  }
  await page.waitForTimeout(2000);
  if ((await state()).space !== 'room') throw new Error(`Could not leave ${name}`);
}

await page.goto(BASE);
await page.waitForSelector('body.ready', { timeout: 30000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}/town.png` });

for (const roomId of rooms) {
  await page.goto(`${BASE}/?room=${roomId}`);
  await page.waitForSelector('body.ready', { timeout: 30000 });
  await page.waitForTimeout(2500);
  if ((await state()).space !== 'room') throw new Error(`Room ${roomId} did not open`);
  const spots = await d('spots');
  for (const door of spots.areaDoors as { x: number; z: number; name: string }[]) {
    await d('teleport', door.x, door.z + 0.3, Math.PI);
    await page.waitForTimeout(300);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(3500);
    if ((await state()).space !== 'area') throw new Error(`${door.name} in ${roomId} did not open`);
    await page.screenshot({ path: `${out}/${roomId}-${door.name.replace(/\W+/g, '-')}.png` });
    console.log(`opened ${door.name} in ${roomId}`);
    await leave(door.name);
  }
}
await browser.close();
if (errors.length) throw new Error(`Page errors: ${errors.join(' | ')}`);
console.log('production smoke passed');
