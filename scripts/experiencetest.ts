// The kart track and casino built from sketchbook pages: publish both into a
// room, then drive a timed lap, start a race, and spin the slot machine.
//
//   npx tsx scripts/experiencetest.ts [outDir] [url]
//   PHONE=1 npx tsx scripts/experiencetest.ts   (touch controls at 390x844)
//
// Uses the drawing in tests/fixtures/randroid-pages.json for the track.

import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { trackFromSketch } from '../src/shared/track';

const out = process.argv[2] ?? '/tmp/toyboxes-exp';
const base = process.argv[3] ?? 'http://localhost:5207/';
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
// Publish a kart track from page 1's drawing and a casino for page 2.
const H = { 'x-toyboxes-admin': '1' };
const login = await fetch(new URL('/api/admin', base), { method: 'POST', headers: { 'content-type': 'application/json', ...H }, body: JSON.stringify({ action: 'login', password: process.env.ADMIN_PASSWORD ?? 'toyboxes-dev' }) });
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
const track = trackFromSketch(pages[0].sketch)!;
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
const act = (what: 'interact' | 'kick') => (phone ? page.locator(what === 'interact' ? '.tbtn-action' : '.tbtn-kick').tap() : page.keyboard.press(what === 'interact' ? 'KeyE' : 'Space'));
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

// ---- Kart track
const spots = await dbg<{ areaDoors: { x: number; z: number; name: string }[] }>('spots');
const kartDoor = spots.areaDoors.find((d) => d.name === 'Kart track')!;
await dbg('teleport', kartDoor.x, kartDoor.z + 0.3, Math.PI);
await page.waitForTimeout(300);
await act('interact');
await until((s) => s.space === 'area', 'the kart track');
await page.waitForTimeout(1200);
await snap('track-arrival');
type Exp = { kart: { x: number; z: number; yaw: number }; pad: { x: number; z: number }; length: number; best: number | null; last: number | null; race: { state: string } | null; cpus: { name: string; speed: number }[] };
let exp = await dbg<Exp>('experience');
console.log('track length', exp.length.toFixed(0), 'cpus', exp.cpus.map((c) => `${c.name} ${c.speed.toFixed(1)}`).join(', '));
if (!exp.cpus.some((c) => Math.abs(c.speed) > 3)) throw new Error('Computer drivers are not driving');
await dbg('teleport', exp.kart.x - 1.6, exp.kart.z, Math.PI / 2);
await page.waitForTimeout(300);
await until((s) => String(s.prompt).includes('go-kart'), 'kart prompt');
await act('interact');
await until((s) => s.riding === 'kart', 'riding');
await forward(1500);
await snap('driving-on-track');

// A timed lap: carry the kart around the centre line at kart speed.
const L = exp.length;
const at = (s: number) => page.evaluate(([s]) => ((window as unknown as G).toyboxes.debug.experience() as { at(s: number, o?: number): { x: number; z: number; heading: number } }).at(s, 0), [s] as const);
const startS = L - 20;
const speed = 13; // m/s, just under top speed
const t0 = Date.now();
for (;;) {
  const travelled = ((Date.now() - t0) / 1000) * speed;
  if (travelled > L + 45) break;
  const q = await at(startS + travelled);
  await dbg('teleport', q.x, q.z, q.heading);
  await page.waitForTimeout(80);
}
exp = await dbg<Exp>('experience');
console.log('lap recorded', exp.last, 'best', exp.best);
if (!exp.last || exp.last < 25000) throw new Error(`No sensible lap time recorded: ${exp.last}`);
await page.waitForTimeout(1500);
await snap('lap-timed');
const board = await api(`/api/scores?roomId=${roomId}&areaId=kart`);
console.log('board', JSON.stringify(board.json.board));
if (!board.json.board.some((r: { name: string }) => r.name === 'Racer')) throw new Error('Lap did not reach the board');

// A race from the pad.
await dbg('teleport', exp.pad.x, exp.pad.z, exp.kart.yaw);
await page.waitForTimeout(400);
await until((s) => s.prompt === 'Start a race', 'race prompt');
await act('interact');
if (phone) await page.getByRole('button', { name: 'Race!' }).tap();
else await page.getByRole('button', { name: 'Race!' }).click();
await page.waitForTimeout(1200);
await snap('race-countdown');
await page.waitForTimeout(2600);
exp = await dbg<Exp>('experience');
if (exp.race?.state !== 'running') throw new Error(`Race did not start: ${JSON.stringify(exp.race)}`);
await forward(2500);
await snap('racing');
// Leaving the kart abandons the race.
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
type CExp = { machine: { x: number; z: number }; kiosk: { x: number; z: number }; stats: { balance: number; spins: number; spent: number; earned: number } | null; spinning: boolean; bet: number; reels: number[] };
let c = await dbg<CExp>('experience');
await dbg('teleport', c.machine.x, c.machine.z, Math.PI);
await page.waitForTimeout(400);
await until((s) => String(s.prompt).startsWith('Pull the lever'), 'spin prompt');
await act('kick'); // change bet
await page.waitForTimeout(200);
c = await dbg<CExp>('experience');
console.log('bet now', c.bet);
for (let i = 0; i < 3; i++) {
  await act('interact');
  await page.waitForTimeout(500);
  if (i === 0) await snap('reels-spinning');
  for (let k = 0; k < 40 && (await dbg<CExp>('experience')).spinning; k++) await page.waitForTimeout(150);
}
await page.waitForTimeout(400);
await snap('reels-landed');
c = await dbg<CExp>('experience');
console.log('casino stats', JSON.stringify(c.stats), 'reels', c.reels);
if (!c.stats || c.stats.spins !== 3) throw new Error('Spins were not recorded');
if (c.stats.balance !== 1000 - c.stats.spent + c.stats.earned) throw new Error('Credits do not add up');
await dbg('teleport', c.kiosk.x, c.kiosk.z, Math.PI);
await page.waitForTimeout(300);
await until((s) => s.prompt === 'Check my credits', 'kiosk prompt');
await act('interact');
await page.waitForSelector('.cchart');
await page.waitForTimeout(400);
await snap('credits-kiosk');

if (errors.length) {
  console.log('ERRORS', errors);
  process.exitCode = 1;
}
console.log('done', out, 'room', roomId);
await browser.close();
