// Creator loop: a visitor claims a room and writes pages, the admin reviews
// them, publishes a game cabinet and an inner area, resets the PIN, and a
// second browser sees the published content.
//
//   npx tsx scripts/admintest.ts [outDir] [url]

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? '/tmp/toyboxes-admin';
const base = process.argv[3] ?? 'http://localhost:5207/';
mkdirSync(out, { recursive: true });

async function api(path: string, body?: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(new URL(path, base), {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.${Math.floor(Math.random() * 250)}.1`, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: (await r.json()) as Record<string, any> };
}

// A visitor with a room and two pages, made through the public API.
const world = await api('/api/world');
const free = (world.json.slots as { slot: number; roomId: string | null }[]).find((s) => !s.roomId)!;
const claim = await api('/api/room', { action: 'claim', slot: free.slot, name: 'Mia', pin: '2468', pinConfirm: '2468', browserId: `admintest-${Date.now()}-abcdef` });
if (claim.status !== 200) throw new Error(`claim failed ${JSON.stringify(claim.json)}`);
const roomId = claim.json.room.id as string;
const token = claim.json.token as string;
for (const text of ['A penalty shootout with a goalie that dives.', 'A bowling alley with a ramp.']) {
  const r = await fetch(new URL('/api/pages', base), { method: 'POST', headers: { 'content-type': 'application/json', 'x-room-token': token }, body: JSON.stringify({ roomId, text, sketch: [{ c: 1, w: 1, p: [100, 100, 600, 700, 900, 200] }] }) });
  if (r.status !== 200) throw new Error('page failed');
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
let shot = 0;
const snap = async (name: string, p = page) => {
  shot++;
  await p.screenshot({ path: join(out, `${String(shot).padStart(2, '0')}-${name}.png`), fullPage: false });
  console.log('shot', name);
};

await page.goto(new URL('/admin/', base).toString());
await page.waitForSelector('.signin');
await page.locator('input[type=password]').fill('wrong-password');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForSelector('.err:has-text("not right")');
// Production runs pass the real password through ADMIN_PASSWORD.
await page.locator('input[type=password]').fill(process.env.ADMIN_PASSWORD ?? 'toyboxes-dev');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForSelector('.row');
await snap('feed');

// Open the first page from the feed: it marks the page as read.
await page.locator('.row', { hasText: 'Mia' }).first().click();
await page.waitForSelector('.detail-head');
await page.waitForTimeout(400);
await snap('room-detail');

// Mark page 1 as being built.
await page.locator('article.page', { hasText: 'Page 1' }).locator('select').selectOption('building');
await page.waitForTimeout(500);

// Publish a cabinet in the main room, built from page 1.
await page.getByRole('button', { name: '+ Game cabinet here' }).click();
await page.locator('.inspector label:has-text("Title") input').fill('Penalty Kicks');
await page.locator('.inspector label:has-text("Title") input').dispatchEvent('change');
await page.locator('.inspector label:has-text("Link") input').fill('https://www.vibecoded.games/');
await page.locator('.inspector label:has-text("Link") input').dispatchEvent('change');
await page.locator('.inspector .links label', { hasText: 'Page 1' }).locator('input').check();
await page.locator('.inspector > label.check', { hasText: 'Published' }).locator('input').check();
// Add an inner area with a cabinet of its own.
await page.getByRole('button', { name: '+ Inner area' }).click();
await page.locator('.area-fields input.in').fill('Bowling alley');
await page.locator('.area-fields input.in').dispatchEvent('change');
await page.locator('.area-fields > .line label.check input').check();
await page.getByRole('button', { name: 'Bowling pins' }).click();
await page.getByRole('button', { name: '+ Game cabinet here' }).click();
await page.locator('.inspector label:has-text("Title") input').fill('Strike Zone');
await page.locator('.inspector label:has-text("Title") input').dispatchEvent('change');
await page.locator('.inspector label:has-text("Link") input').fill('/');
await page.locator('.inspector label:has-text("Link") input').dispatchEvent('change');
await page.locator('.inspector > label.check', { hasText: 'Published' }).locator('input').check();
await snap('content-editor');
await page.getByRole('button', { name: 'Save and publish' }).click();
await page.waitForSelector('.flash:has-text("Saved")');
await snap('published');

// Reset the PIN: the owner's old edit token stops working.
await page.locator('input[aria-label="New PIN"]').fill('1357');
await page.getByRole('button', { name: 'Set new PIN' }).click();
await page.waitForSelector('.flash:has-text("PIN changed")');
const stale = await fetch(new URL('/api/pages', base), { method: 'POST', headers: { 'content-type': 'application/json', 'x-room-token': token }, body: JSON.stringify({ roomId, text: 'x', sketch: [] }) });
if (stale.status !== 401) throw new Error(`Old token still works after PIN reset (${stale.status})`);
const fresh = await api('/api/room', { action: 'unlock', roomId, pin: '1357' });
if (fresh.status !== 200) throw new Error('New PIN does not unlock');

// A second browser visits the room and sees the published work.
const visitor = await browser.newPage({ viewport: { width: 1280, height: 800 } });
visitor.on('pageerror', (e) => errors.push(e.message));
await visitor.addInitScript(() => localStorage.setItem('toyboxes.identity', JSON.stringify({ browserId: 'visitor-browser-0000000001', name: 'Sam' })));
await visitor.goto(new URL(`/?room=${roomId}`, base).toString());
await visitor.waitForSelector('body.ready');
await visitor.waitForTimeout(2200);
type Dbg = { toyboxes: { debug: { spots(): { exhibits: { x: number; z: number; title: string }[]; areaDoors: { x: number; z: number; name: string }[] }; teleport(x: number, z: number, y: number): void; state(): Record<string, unknown> } } };
const spots = await visitor.evaluate(() => (window as unknown as Dbg).toyboxes.debug.spots());
console.log('visitor sees', JSON.stringify(spots));
if (!spots.exhibits.some((e) => e.title === 'Penalty Kicks')) throw new Error('Visitor does not see the published cabinet');
if (!spots.areaDoors.some((d) => d.name === 'Bowling alley')) throw new Error('Visitor does not see the inner area door');
const cab = spots.exhibits.find((e) => e.title === 'Penalty Kicks')!;
await visitor.evaluate(([x, z]) => (window as unknown as Dbg).toyboxes.debug.teleport(x, z + 1.2, Math.PI), [cab.x, cab.z] as const);
await visitor.waitForTimeout(600);
await snap('visitor-room', visitor);
// The visitor reads the sketchbook without a PIN, and cannot change it.
type Spots2 = { toyboxes: { debug: { spots(): { lectern: { x: number; z: number } } } } };
const lectern = (await visitor.evaluate(() => (window as unknown as Spots2).toyboxes.debug.spots())).lectern;
await visitor.evaluate(([x, z]) => (window as unknown as Dbg).toyboxes.debug.teleport(x, z, -Math.PI / 2), [lectern.x + 0.3, lectern.z] as const);
await visitor.waitForTimeout(400);
const bookPrompt = (await visitor.evaluate(() => (window as unknown as Dbg).toyboxes.debug.state())).prompt;
if (bookPrompt !== 'Read the sketchbook') throw new Error(`Expected a read prompt, got ${bookPrompt}`);
await visitor.keyboard.press('KeyE');
await visitor.waitForSelector('.book.reading');
await visitor.waitForTimeout(600);
if (await visitor.locator('.pin-card').count()) throw new Error('Reading the sketchbook asked for a PIN');
const page1 = await visitor.locator('textarea.page-text').inputValue();
if (!page1.startsWith('A penalty shootout')) throw new Error(`Visitor sees "${page1}" on page one`);
if (!(await visitor.locator('textarea.page-text').evaluate((t) => (t as HTMLTextAreaElement).readOnly))) throw new Error('Visitor can type in the book');
if (await visitor.locator('.book .tools').isVisible()) throw new Error('Drawing tools showed for a visitor');
await snap('visitor-reads-book', visitor);
await visitor.getByRole('button', { name: 'Next ›' }).click();
await visitor.waitForTimeout(400);
const page2 = await visitor.locator('textarea.page-text').inputValue();
if (!page2.startsWith('A bowling alley')) throw new Error(`Visitor sees "${page2}" on page two`);
await visitor.getByRole('button', { name: 'Write or edit' }).click();
await visitor.waitForSelector('.pin-card');
await snap('visitor-edit-asks-pin', visitor);
await visitor.locator('.pin-card').getByRole('button', { name: 'Cancel' }).click();
await visitor.waitForTimeout(300);
if (!(await visitor.locator('.book.reading').count())) throw new Error('Book left reading mode without a PIN');
await visitor.getByRole('button', { name: 'Close' }).click();
await visitor.waitForTimeout(400);

const door = spots.areaDoors[0];
await visitor.evaluate(([x, z]) => (window as unknown as Dbg).toyboxes.debug.teleport(x, z + 0.3, Math.PI), [door.x, door.z] as const);
await visitor.waitForTimeout(400);
await visitor.keyboard.press('KeyE');
await visitor.waitForTimeout(1200);
const st = await visitor.evaluate(() => (window as unknown as Dbg).toyboxes.debug.state());
if (st.space !== 'area') throw new Error(`Visitor could not enter the inner area: ${JSON.stringify(st)}`);
await snap('visitor-area', visitor);
// Entering never asked for a PIN.
if (await visitor.locator('.pin-card').count()) throw new Error('A PIN was asked for entry');

if (errors.length) {
  console.log('ERRORS', errors);
  process.exitCode = 1;
}
console.log('done', out);
await browser.close();
