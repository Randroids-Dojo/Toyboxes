// Arcade round trip: walk into an arcade entrance, confirm, land on the
// external site (stubbed here), press Back, and come back outside the same
// door without losing anything.
//
//   npx tsx scripts/arcadetest.ts [url]

import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5207/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.route(/spacechakra\.com|vibecoded\.games/, (route) => route.fulfill({ contentType: 'text/html', body: '<title>Arcade stub</title><h1>Arcade stub</h1>' }));
await ctx.addInitScript(() => {
  if (!localStorage.getItem('toyboxes.identity')) localStorage.setItem('toyboxes.identity', JSON.stringify({ browserId: 'arcade-test-browser-000001', name: 'Ari' }));
});
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));

type Dbg = { toyboxes: { debug: { entrances(): { kind: string; arcade: string | null; x: number; z: number; outYaw: number }[]; teleport(x: number, z: number, y: number): void; state(): Record<string, unknown> } } };

for (const arcade of ['spacechakra', 'vibecoded']) {
  await page.goto(url);
  await page.waitForSelector('body.ready');
  await page.waitForTimeout(1200);
  const e = (await page.evaluate(() => (window as unknown as Dbg).toyboxes.debug.entrances())).find((x) => x.arcade === arcade)!;
  await page.evaluate(([x, z, y]) => (window as unknown as Dbg).toyboxes.debug.teleport(x, z, y), [e.x, e.z, e.outYaw + Math.PI] as const);
  await page.waitForTimeout(400);
  const prompt = (await page.evaluate(() => (window as unknown as Dbg).toyboxes.debug.state())).prompt;
  if (!String(prompt).startsWith('Visit')) throw new Error(`No visit prompt at ${arcade}: ${prompt}`);
  await page.keyboard.press('KeyE');
  await page.getByRole('button', { name: 'Go' }).click();
  await page.waitForURL(/spacechakra|vibecoded/, { timeout: 10000 });
  console.log(arcade, 'reached', page.url());
  await page.goBack();
  await page.waitForSelector('body.ready');
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => (window as unknown as Dbg).toyboxes.debug.state());
  const d = Math.hypot((st.x as number) - e.x, (st.z as number) - e.z);
  console.log(arcade, 'back at', (st.x as number).toFixed(1), (st.z as number).toFixed(1), 'distance from door', d.toFixed(2));
  if (st.space !== 'hub' || d > 1.5) throw new Error(`Did not return to the ${arcade} door`);
  const fade = await page.evaluate(() => document.querySelector('.fade')?.classList.contains('on'));
  if (fade) throw new Error('Screen still faded after returning');
  const asked = await page.locator('input.field').count();
  if (asked) throw new Error('Name asked again after returning');
}

if (errors.length) {
  console.log('ERRORS', errors);
  process.exitCode = 1;
}
console.log('arcade round trips ok');
await browser.close();
