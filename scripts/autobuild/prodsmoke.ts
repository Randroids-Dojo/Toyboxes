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

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => localStorage.setItem('toyboxes.identity', JSON.stringify({ browserId: 'prod-smoke-browser-000001', name: 'Smoke' })));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
type G = { toyboxes: { debug: Record<string, (...a: any[]) => any> } };
const d = (f: string, ...a: unknown[]) => page.evaluate(([f, a]) => (window as unknown as G).toyboxes.debug[f as string](...(a as unknown[])), [f, a] as const);
const state = () => d('state') as Promise<{ space: string }>;

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
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /^Back to .*'s room$/ }).click();
    await page.waitForTimeout(2500);
  }
}
await browser.close();
if (errors.length) throw new Error(`Page errors: ${errors.join(' | ')}`);
console.log('production smoke passed');
