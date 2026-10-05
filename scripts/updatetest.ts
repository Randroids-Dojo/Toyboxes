// The update banner: serve a build, pretend a newer one is live, check the
// banner appears at a calm moment, and that Refresh lands you where you were.
//
//   npm run build && npx vite preview --port 4317 &
//   npx tsx scripts/updatetest.ts [url]

import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:4317/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
let live = 'current';
await ctx.route('**/version.json', async (route) => {
  if (live === 'current') return route.continue();
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: live }) });
});
await ctx.addInitScript(() => localStorage.setItem('toyboxes.identity', JSON.stringify({ browserId: 'update-test-browser-00001', name: 'Upd' })));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
type G = { toyboxes: { debug: { teleport(x: number, z: number, y: number): void; state(): { x: number; z: number; menu: boolean } } } };

await page.goto(url);
await page.waitForSelector('body.ready');
await page.waitForTimeout(1500);
if (await page.locator('.update-banner').count()) throw new Error('Banner showed with no new version');

// A deploy goes live; the tab notices when it regains focus.
live = 'a-newer-build';
await page.evaluate(() => (window as unknown as G).toyboxes.debug.teleport(-6, 4, 1.2));
await page.evaluate(() => window.dispatchEvent(new Event('focus')));
await page.waitForSelector('.update-banner', { timeout: 5000 });
console.log('banner:', await page.locator('.update-banner span').textContent());
await page.screenshot({ path: '/tmp/toyboxes-update-banner.png' });

// The pause menu offers it too, for controllers and remotes.
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const first = await page.locator('.menu-list .btn').first().textContent();
if (first !== 'Get the new version') throw new Error(`Pause menu does not offer the update: ${first}`);
await page.waitForFunction(() => !document.querySelector('.update-banner'), null, { timeout: 2000 }).catch(() => {
  throw new Error('Banner stayed up over the menu');
});
await page.keyboard.press('Escape');
await page.waitForTimeout(800);

await page.locator('.update-go').click();
await page.waitForLoadState('load');
await page.waitForSelector('body.ready');
await page.waitForTimeout(1500);
const st = await page.evaluate(() => (window as unknown as G).toyboxes.debug.state());
console.log('after refresh at', st.x.toFixed(1), st.z.toFixed(1));
if (Math.hypot(st.x + 6, st.z - 4) > 0.5) throw new Error('Refresh did not bring the player back to the same spot');

// Settings has the install row.
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Settings' }).click();
await page.waitForTimeout(300);
const install = await page.locator('.setting', { hasText: 'Add to home screen' }).textContent();
console.log('install row:', install);
await page.screenshot({ path: '/tmp/toyboxes-install-row.png' });
if (errors.length) {
  console.log('ERRORS', errors);
  process.exitCode = 1;
}
console.log('update flow ok');
await browser.close();
