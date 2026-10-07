// The kart track and casino built from sketchbook pages: publish both into a
// room, visit the kart track (scripts/karttest.ts plays it in full) and play
// the casino games.
//
//   npx tsx scripts/experiencetest.ts [outDir] [url]
//   PHONE=1 npx tsx scripts/experiencetest.ts   (touch controls at 390x844)
//
// The track is the Toybox Grand Prix circuit, as published for room 1.

import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { requireLocalPlaytest } from './autobuild/safety';
import { grandPrixTrack } from '../src/shared/circuits';
import { BLACKJACK } from '../src/experiences/casino/layout';

const out = process.argv[2] ?? '/tmp/toyboxes-exp';
const base = process.argv[3] ?? 'http://localhost:5207/';
requireLocalPlaytest(base);
mkdirSync(out, { recursive: true });
const pages = JSON.parse(readFileSync(new URL('../tests/fixtures/randroid-pages.json', import.meta.url), 'utf8')).pages as { text: string; sketch: { c: number; w: number; p: number[] }[] }[];

async function api(path: string, body?: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(new URL(path, base), { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, headers: r.headers, json: (await r.json()) as Record<string, any> };
}

// A room with the two real pages.
const world = await api('/api/world');
const free = (world.json.slots as { slot: number; roomId: string | null }[]).find((s) => !s.roomId)!;
const claim = await api('/api/room', { action: 'claim', slot: free.slot, name: 'Randroid', pin: '4321', pinConfirm: '4321', browserId: `exp-owner-${Date.now()}-abc` });
const roomId = claim.json.room.id as string;
const pageIds: string[] = [];
for (const p of pages) {
  const r = await api('/api/pages', { roomId, text: p.text, sketch: p.sketch }, { 'x-room-token': claim.json.token });
  pageIds.push(r.json.page.id);
}
// Publish the kart circuit for page 1 and a casino for page 2.
const H = { 'x-toyboxes-admin': '1' };
const login = await fetch(new URL('/api/admin', base), { method: 'POST', headers: { 'content-type': 'application/json', ...H }, body: JSON.stringify({ action: 'login', password: process.env.ADMIN_PASSWORD ?? 'toyboxes-dev' }) });
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
const track = grandPrixTrack();
const content = {
  rev: 0,
  areas: [
    { id: 'kart', name: 'Kart track', theme: { wall: 0, floor: 0, trim: 0 }, props: [], published: true, experience: { kind: 'kart', track, laps: 3 }, pages: [pageIds[0]] },
    { id: 'casino', name: 'Casino', theme: { wall: 0, floor: 0, trim: 5 }, props: [], published: true, experience: { kind: 'casino' }, pages: [pageIds[1]] },
  ],
  exhibits: [],
};
const saved = await api('/api/admin', { action: 'saveContent', roomId, content }, { ...H, cookie });
if (saved.status !== 200) throw new Error(`publish failed ${JSON.stringify(saved.json)}`);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const phone = process.env.PHONE === '1';
const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => localStorage.setItem('toyboxes.identity', JSON.stringify({ browserId: 'exp-player-browser-000001', name: 'Racer' })));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));
let shot = 0;
/** Interact and kick with the on-screen buttons on a phone, keys elsewhere. */
const act = (what: 'interact' | 'kick') => (phone ? page.locator(what === 'interact' ? '.tbtn-action' : '.tbtn-kick').tap() : page.keyboard.press(what === 'interact' ? 'KeyE' : 'KeyF'));
async function forward(ms: number) {
  if (!phone) {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(ms);
    await page.keyboard.up('KeyW');
    return;
  }
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 90, y: 700, id: 9 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 92, y: 640, id: 9 }] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const snap = async (n: string) => {
  shot++;
  await page.screenshot({ path: join(out, `${String(shot).padStart(2, '0')}-${n}.png`) });
  console.log('shot', n);
};
type G = { toyboxes: { debug: Record<string, (...a: any[]) => any> } };
const dbg = <T>(fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as unknown as G).toyboxes.debug[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const state = () => dbg<Record<string, any>>('state');
async function until(check: (s: Record<string, any>) => boolean, what: string, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check(await state())) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`Timed out waiting for ${what}: ${JSON.stringify(await state())}`);
}

await page.goto(new URL(`/?room=${roomId}`, base).toString());
await page.waitForSelector('body.ready');
await until((s) => s.space === 'room', 'the room');
await page.waitForTimeout(800);
await snap('room-with-two-doors');

// ---- Kart track: just a visit here; scripts/karttest.ts plays the Toybox Grand Prix in full.
const spots = await dbg<{ areaDoors: { x: number; z: number; name: string }[] }>('spots');
const kartDoor = spots.areaDoors.find((d) => d.name === 'Kart track')!;
await dbg('teleport', kartDoor.x, kartDoor.z + 0.3, Math.PI);
await page.waitForTimeout(300);
await act('interact');
await until((s) => s.space === 'area', 'the kart track');
await page.waitForTimeout(1500);
const kartInfo = await dbg<{ circuit: string; circuits: string[] }>('experience');
if (kartInfo.circuit !== 'blocktown' || kartInfo.circuits.length !== 4) throw new Error(`Room 1's track should open on Block Town with four circuits: ${JSON.stringify(kartInfo)}`);
await snap('track-arrival');
// Close the first-visit card, then back to the room through the menu.
if (phone) await page.locator('.modal.in .btn.primary').tap();
else await page.keyboard.press('Enter');
await page.waitForTimeout(400);
if (phone) await page.locator('.tbtn-menu').tap();
else await page.keyboard.press('Escape');
await page.waitForTimeout(300);
if (phone) await page.getByRole('button', { name: /Back to Randroid/ }).tap();
else await page.getByRole('button', { name: /Back to Randroid/ }).click();
await until((s) => s.space === 'room', 'back in the room');

// ---- Casino
const spots2 = await dbg<{ areaDoors: { x: number; z: number; name: string }[] }>('spots');
const casinoDoor = spots2.areaDoors.find((d) => d.name === 'Casino')!;
await dbg('teleport', casinoDoor.x, casinoDoor.z + 0.3, Math.PI);
await page.waitForTimeout(300);
await act('interact');
await until((s) => s.space === 'area', 'the casino');
await page.waitForTimeout(1500);
await snap('casino-arrival');
type CExp = {
  spots: Record<string, { x: number; z: number; yaw: number }>;
  stats: { balance: number; spins: number; spent: number; earned: number; refillCredits: number } | null;
  introShown: boolean;
  bet: number;
  slot: { spinning: boolean; spins: number; shownStops: number[]; lastServerStops: number[] | null };
  ceremony: unknown;
  roulette: { spinning: boolean; lastPocket: number | null; shownPocket: number | null };
  blackjack: { busy: boolean; view: { phase: string } | null };
};
const cexp = () => dbg<CExp>('experience');
const addsUp = (c: CExp) => !!c.stats && c.stats.balance === 1000 + c.stats.refillCredits + c.stats.earned - c.stats.spent;
const tap = async (selector: string) => {
  const b = page.locator(selector).filter({ visible: true }).first();
  if (phone) await b.tap();
  else await b.click();
  await page.waitForTimeout(200);
};
const cardOpen = () => page.evaluate(() => !!document.querySelector('.modal.in'));
// The how to play card on the first visit.
for (let i = 0; i < 60 && !(await cardOpen()); i++) await page.waitForTimeout(100);
if (!(await cardOpen())) throw new Error('No how to play card on the first casino visit');
await tap('.modal.in .btn.primary');
let c = await cexp();
await dbg('teleport', c.spots.lever.x, c.spots.lever.z, Math.PI);
await page.waitForTimeout(400);
await until((s) => String(s.prompt).startsWith('Pull the lever'), 'spin prompt');
await act('kick'); // change bet
await page.waitForTimeout(200);
console.log('bet now', (await cexp()).bet);
for (let i = 0; i < 3; i++) {
  await until((s) => String(s.prompt).startsWith('Pull the lever'), 'the lever');
  await act('interact');
  await page.waitForTimeout(500);
  if (i === 0) await snap('reels-spinning');
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    c = await cexp();
    if (!c.slot.spinning && !c.ceremony && c.slot.spins === i + 1) break;
    await page.waitForTimeout(200);
  }
}
await page.waitForTimeout(400);
await snap('reels-landed');
c = await cexp();
console.log('casino stats', JSON.stringify(c.stats), 'reels', c.slot.shownStops);
if (!c.stats || c.stats.spins !== 3) throw new Error('Spins were not recorded');
if (JSON.stringify(c.slot.shownStops) !== JSON.stringify(c.slot.lastServerStops)) throw new Error('The reels do not show the server\'s spin');
if (!addsUp(c)) throw new Error('Credits do not add up');
// Roulette: bet on red and spin.
await dbg('teleport', c.spots.roulette.x, c.spots.roulette.z, Math.PI);
await page.waitForTimeout(300);
await until((s) => s.prompt === 'Play roulette', 'roulette prompt');
await act('interact');
await page.waitForSelector('.rl-board');
await page.waitForTimeout(400);
await tap('.rl-cell[data-key="red"]');
await tap('.gp-panel .gp-actions .btn.primary');
await page.waitForTimeout(1500);
await snap('roulette-spinning');
for (let end = Date.now() + 30000; Date.now() < end; await page.waitForTimeout(200)) {
  const r = (await cexp()).roulette;
  if (r.lastPocket !== null && !r.spinning) break;
}
const rl = (await cexp()).roulette;
if (rl.shownPocket !== rl.lastPocket) throw new Error(`Roulette shows ${rl.shownPocket}, the server said ${rl.lastPocket}`);
console.log('roulette:', await page.locator('.modal.in .gp-status').first().textContent());
await snap('roulette-result');
await tap('.modal.in button:text-is("Done")');
await page.waitForTimeout(300);
// Walk straight at the blackjack table: you stop at its rim instead of sinking into it.
const bjTable = BLACKJACK;
await dbg('teleport', bjTable.x, bjTable.z + bjTable.r + 1.4, Math.PI);
await page.waitForTimeout(300);
let gap = Infinity;
const walking = forward(1400);
for (let i = 0; i < 24; i++) {
  const st = await state();
  gap = Math.min(gap, Math.hypot(st.x - bjTable.x, st.z - bjTable.z) - bjTable.r);
  await page.waitForTimeout(50);
}
await walking;
console.log('closest to the blackjack table rim', gap.toFixed(2), 'm');
if (gap < 0.2) throw new Error(`Walked into the blackjack table: ${gap.toFixed(2)} m from its rim`);
if (gap > 0.7) throw new Error(`Never reached the blackjack table: ${gap.toFixed(2)} m from its rim`);
// Blackjack: deal, then stand until the hand ends.
await dbg('teleport', c.spots.blackjack.x, c.spots.blackjack.z, Math.PI);
await page.waitForTimeout(300);
await until((s) => String(s.prompt).includes('blackjack'), 'blackjack prompt');
await act('interact');
await page.waitForSelector('.bj-table');
await page.waitForTimeout(400);
await tap('.gp-panel .gp-actions .btn.primary');
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(500);
  const b = (await cexp()).blackjack;
  if (b.busy) continue;
  if (b.view?.phase !== 'player') break;
  await snap('blackjack-hand');
  await tap('.gp-panel .gp-actions .btn:text-is("Stand")');
}
const bjStatus = (await cardOpen()) ? await page.locator('.modal.in .gp-status').first().textContent() : '(closed for a rank up)';
console.log('blackjack:', bjStatus);
if ((await cexp()).blackjack.view?.phase !== 'done') throw new Error(`Hand did not settle: ${bjStatus}`);
await snap('blackjack-result');
if (await cardOpen()) await tap('.modal.in button:text-is("Done")');
await page.waitForTimeout(300);
c = await cexp();
if (!addsUp(c)) throw new Error('Credits do not add up after table games');
// The Captain's Logbook: your credits over time.
await dbg('teleport', c.spots.logbook.x, c.spots.logbook.z, c.spots.logbook.yaw);
await page.waitForTimeout(300);
await until((s) => String(s.prompt).includes('Logbook'), 'logbook prompt');
await act('interact');
await page.waitForSelector('.lb-tabs');
await page.waitForTimeout(400);
await snap('logbook');

if (errors.length) {
  console.log('ERRORS', errors);
  process.exitCode = 1;
}
console.log('done', out, 'room', roomId);
await browser.close();
