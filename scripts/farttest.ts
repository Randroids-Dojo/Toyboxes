// Playtest for Little Puffington (the fart world): drives the real input on
// desktop, PHONE=1, PAD=1 or REMOTE=1 (arrows, OK and Back only) through the
// first visit, eating, toots, a big one, mischief, all four trials, the
// Toot-o-Matic and the exit, with screenshots and the cost of each tier.
//
//   TOYBOXES_BASE=http://localhost:5207/ npx tsx scripts/farttest.ts
//   PHONE=1 / PAD=1 / REMOTE=1 for the other devices.

import { openWorld, type World } from './lib/world';

const BUDGET = { low: { draws: 90, tris: 120_000 }, medium: { draws: 160, tris: 300_000 }, high: { draws: 260, tris: 600_000 } } as const;

// Pads and remotes start on the low tier so headless frames keep up with button presses.
const w0 = await openWorld({ kind: 'fart', areaId: 'puff-challenge', name: 'Fart simulator', quality: process.env.PAD === '1' || process.env.REMOTE === '1' ? 'low' : 'medium' });
const { page, device } = w0;
// Headless frames can be slower than the harness's 90 ms pad taps (a real pad is polled 60 times a second),
// so pad buttons are held a little longer here. Everything else goes straight to the harness.
const PAD_ACTION: Record<number, string> = { 0: 'interact', 2: 'kick', 3: 'jump' };
const padPress = async (i: number, ms = 300) => {
  await page.evaluate(([b, v]) => ((window as any).__pad.buttons[b] = v), [i, 1] as const);
  const action = PAD_ACTION[i];
  const inMenu = await page.evaluate(() => !!document.querySelector('.modal.in'));
  if (action && !inMenu) {
    // Hold until the game has polled the press, then let go.
    const end = Date.now() + 1500;
    while (Date.now() < end && !(await page.evaluate((a) => (window as any).toyboxes.space.interior?.ctx?.input?.isHeld(a), action))) await page.waitForTimeout(25);
    await page.waitForTimeout(30);
  } else await page.waitForTimeout(ms);
  await page.evaluate((b) => ((window as any).__pad.buttons[b] = 0), i);
  await page.waitForTimeout(150);
};
const PADB = { interact: 0, kick: 2, jump: 3 } as const;
const PADD = { up: 12, down: 13, left: 14, right: 15 } as const;
const w: World = device !== 'pad' ? w0 : {
  ...w0,
  act: async (b = 'interact') => padPress(PADB[b]),
  confirm: async () => {
    await padPress(0);
    await page.waitForTimeout(150);
  },
  back: async () => padPress(1),
  dir: async (d) => padPress(PADD[d], 120),
};
const remote = device === 'remote';
const phone = device === 'phone';
const exp = () => w.exp();
const wait = (ms: number) => page.waitForTimeout(ms);
const check = (ok: boolean, what: string, extra: unknown = '') => {
  if (!ok) throw new Error(`${device}: ${what} ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`);
  console.log(`ok  ${what}`);
};

/** A toot the way this device does it: OK on the remote, the Toot (Kick) button elsewhere. */
// (The harness taps pad buttons for 90 ms; headless frames can be slower than that, so pads hold a little longer.)
const toot = () => (remote ? w.act('interact') : w.act('kick'));
/** A quick touch on the phone's Toot button, straight through the touch events (for rhythm, where tap() is too slow). */
let cdp: Awaited<ReturnType<ReturnType<typeof page.context>['newCDPSession']>> | null = null;
async function quickToot(): Promise<void> {
  if (!phone) return toot();
  cdp ??= await page.context().newCDPSession(page);
  const box = await page.locator('.tbtn-kick').boundingBox();
  if (!box) throw new Error('No Toot button');
  const pt = [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 9 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const tootHold = (ms: number) => (remote ? w.hold('interact', ms) : w.hold('kick', ms));
const place = async (x: number, z: number, yaw: number) => {
  await w.dbg('teleport', x, z, yaw);
  await wait(500);
};
/** Picks a card button by its label: taps it on a phone, or moves focus to it with the device. */
async function choose(world: World, label: string): Promise<void> {
  if (phone) {
    await page.locator('.modal.in .btn', { hasText: label }).first().tap();
    await wait(300);
    return;
  }
  for (let i = 0; i < 8; i++) {
    const text = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent ?? '');
    if (text.includes(label)) break;
    await world.dir(i < 4 ? 'right' : 'down');
  }
  await world.confirm();
}

// 1. First visit: the flyover, skipped with the device, then the intro card.
await w.until(async () => (await exp()).mode === 'intro', 'the intro flyover');
await w.shot('01-flyover');
await wait(600);
await w.act();
await w.until(() => w.menuOpen(), 'the intro card');
await w.shot('02-intro-card');
await w.confirm();
await w.until(async () => !(await w.menuOpen()) && (await exp()).mode === 'fete', 'the fete');
await wait(800);
await w.shot('03-arrival');

// 2. Eat at Gran's stall.
await place(1.9, 19.0, Math.PI / 2);
check((await w.dbg('state')).prompt === 'Eat beans' || phone, 'Gran offers beans', (await w.dbg('state')).prompt);
await w.act();
await wait(600);
let e = await exp();
check(e.gas.type === 'beans' && e.gas.amount === 100, 'a tummy full of beans', e.gas);

// 3. Toot next to Lady Featherstone: a double take, the teacup flies, a golden bean.
const lady = e.people.lady;
await place(lady.x - 1.1, lady.z + 0.7, Math.PI / 2);
await toot();
await wait(900);
await w.shot('04-tea');
e = await exp();
check(e.people.lady.mood === 'startled' && !e.people.lady.cup, 'Lady Featherstone spills her tea', e.people.lady);
check(e.mischief.includes('tea') && e.beans >= 1, 'a golden bean for the tea', e.mischief);

// 4. A jump (a toot hop on the remote) and a toot boost in the air.
await w.call('debugGive', 'beans');
await place(0, 8, Math.PI);
await w.call('debugResetMoves');
if (device === 'pad') {
  // Jump, then boost straight away (each pad press waits until the game has seen it).
  await w.act('jump');
  await w.act('kick');
} else {
  if (remote) await toot();
  else await w.act('jump');
  // Taps on the phone take a moment of their own, so no extra wait there.
  await wait(remote ? 100 : phone ? 0 : 280);
  await toot();
}
await wait(1100);
e = await exp();
check(e.moves.maxY > 2.5, 'boosted over 2.5 m', e.moves.maxY);

// 5. A big one from the maypole pad.
await w.call('debugGive', 'beans');
await place(-5, 5.1, Math.PI);
await w.call('debugResetMoves');
// Held well past full charge: headless frames can run slower than the clock.
await tootHold(1800);
await wait(350);
await w.shot('05-big-one');
await wait(1000);
e = await exp();
check(e.moves.maxY > 6 && e.moves.rockets >= 1, 'a big one over 6 m', e.moves);

// 6. Rocket Rings with real input (a three-ring course), Play again, then give up.
await place(6, 5.6, Math.PI);
check((await w.dbg('state')).prompt === 'Start Rocket Rings' || phone, 'the rally pad', (await w.dbg('state')).prompt);
await w.act();
await w.until(() => w.menuOpen(), 'the rally card');
// The test course: three low rings in a line ahead of the pad, flown through on foot.
await w.call('debugTrial', 'debugTestCourse');
await w.confirm();
await w.until(async () => (await exp()).trial?.phase === 'run', 'the rally countdown', 12000);
for (let i = 0; i < 3; i++) {
  for (let k = 0; k < 12 && (await exp()).trial?.next <= i && !(await w.menuOpen()); k++) {
    await w.dbg('teleport', 6, (await exp()).player.z, Math.PI);
    await w.walk('up', 500);
  }
  if (i === 1) await w.shot('06-rings');
}
await w.until(() => w.menuOpen(), 'the rally results', 15000);
await w.shot('07-rings-results');
e = await exp();
check(e.trial?.next === 3, 'three rings passed', e.trial);
await w.confirm();
await w.until(async () => (await exp()).trial?.phase === 'count' || (await w.menuOpen()), 'play again');
if (await w.menuOpen()) await w.confirm();
await w.until(async () => (await exp()).trial?.phase === 'run', 'the second rally', 12000);
// The full course this time: walk through the first ring (low enough on foot), then give up on the pad.
for (let k = 0; k < 12 && (await exp()).trial?.next < 1; k++) {
  // Line up on the ring each time (the follow camera drifts on a phone).
  const pz = (await exp()).player.z;
  await w.dbg('teleport', 6, pz, Math.PI);
  await w.walk('up', 500);
}
e = await exp();
await w.shot('06b-first-ring');
check(e.trial?.next === 1, 'the first real ring on foot', { trial: e.trial, player: e.player });
await place(6, 5, Math.PI);
await wait(400);
await w.act();
await w.until(async () => (await exp()).mode === 'fete', 'gave up the rally');
check(true, 'Play again and Give up work');

// 7. The library (needs three golden beans): mask a toot on the BONG, get caught, squeeze, shelve.
await w.call('debugBeans', 3);
await place(19, -12.8, Math.PI);
await wait(500);
await w.act();
await w.until(() => w.menuOpen(), 'the library card');
await w.call('debugTrial', 'debugShorten', 2);
await w.confirm();
await w.until(async () => (await exp()).trial?.phase === 'run', 'into the library', 12000);
await w.shot('08-library');
await place(195.2, -1.2, 0);
await w.call('debugTrial', 'debugSkipTo', 11.86);
await toot();
await wait(500);
e = await exp();
check(e.trial.masked === 1 && e.trial.strikes === 0, 'a toot masked by the clock', e.trial);
await place(203.4, -5.6, 0);
await wait(1200);
await toot();
await wait(700);
await w.shot('09-library-caught');
e = await exp();
check(e.trial.strikes === 1, 'caught tooting in plain sight', e.trial);
await place(189.5, 5.6, 0);
const strikesBefore = (await exp()).trial.strikes;
await w.call('debugTrial', 'debugPressure', 60);
await tootHold(1300);
await wait(300);
e = await exp();
check(e.clouds > 0 && e.trial.pressure < 60 && e.trial.strikes === strikesBefore, 'a silent squeeze lets pressure out and leaves a cloud', { clouds: e.clouds, pressure: e.trial.pressure, strikes: e.trial.strikes });
for (const b of (await exp()).trial.books) {
  await place(b.x, b.z, 0);
  await w.act();
  await wait(900);
}
await w.until(() => w.menuOpen(), 'the library results', 15000);
await w.shot('10-library-results');
e = await exp();
check(e.trial.shelved === 2, 'both books shelved', e.trial);
await choose(w, 'Back to the fete');
await w.until(async () => (await exp()).mode === 'fete', 'out of the library');

// 8. Brass Band Bash: the rhythm check, then an eight-note chart in time.
await place(-8.3, -2.8, Math.PI);
await w.act();
await w.until(() => w.menuOpen(), 'the band card');
await w.call('debugTrial', 'debugShort');
await w.confirm();
await w.until(async () => (await exp()).trial?.phase === 'calibrate', 'the rhythm check', 12000);
for (let i = 0; i < 8; i++) {
  const t = (await exp()).trial;
  const next = Math.max(2, Math.ceil(t.beat + 0.3));
  await wait(((next - t.beat) * 60000) / 100 - 20);
  await quickToot();
  await wait(150);
}
await w.until(async () => (await exp()).trial?.phase === 'play', 'the song starts', 12000);
await w.shot('11-band');
{
  // Schedule every press from the chart against the wall clock (re-reading after each note is too slow headless).
  const t = (await exp()).trial;
  const beatMs = 60000 / t.bpm;
  const t0 = Date.now() - t.beat * beatMs;
  for (const n of t.chart as { beat: number; kind: string; len: number }[]) {
    if (n.kind === 'rest') continue;
    const at = t0 + n.beat * beatMs - 20;
    const ms = at - Date.now();
    if (ms > 0) await wait(ms);
    if (n.kind === 'hold') await tootHold(Math.min(1400, n.len * beatMs - 150));
    else await quickToot();
  }
}
await w.until(() => w.menuOpen(), 'the band results', 20000);
e = await exp();
const r = e.trial.result;
check(r.perfect + r.good >= 6, 'at least six notes in time', r);
await w.shot('12-band-results');
await choose(w, 'Back to the fete');
await w.until(async () => (await exp()).mode === 'fete', 'off the bandstand');

// 9. Picnic Panic (needs six golden beans): a real toot upwind, then a full clear posted to the board.
await w.call('debugBeans', 6);
await place(-15.4, 11.6, Math.PI);
await w.act();
await w.until(() => w.menuOpen(), 'the picnic card');
const started = Date.now();
await w.confirm();
await w.until(async () => (await exp()).trial?.phase === 'run', 'the picnic starts', 12000);
e = await exp();
const p0 = e.trial.people[0];
const wl = Math.hypot(e.trial.wind.x, e.trial.wind.z);
await place(p0.x - (e.trial.wind.x / wl) * 1.4, p0.z - (e.trial.wind.z / wl) * 1.4, Math.atan2(e.trial.wind.x, e.trial.wind.z));
await toot();
await wait(1800);
e = await exp();
check(e.trial.people[0].whiff > 0, 'a picnicker gets a whiff', e.trial.people[0]);
await w.shot('13-picnic');
await wait(Math.max(0, 15000 - (Date.now() - started)));
// Real clears take more than the board's 15 second floor: run the clock on first.
await w.call('debugTrial', 'debugFastForward', Math.max(0, 22 - (await exp()).trial.time));
for (let k = 0; k < 6 && (await exp()).trial?.left > 0; k++) {
  await w.call('debugTrial', 'debugStinkAll');
  await w.call('debugTrial', 'debugFastForward', 3);
  await wait(300);
}
await w.until(() => w.menuOpen(), 'the picnic results', 20000);
await w.shot('14-picnic-results');
e = await exp();
check(e.boards.picnic?.best !== null && e.boards.picnic?.rows > 0, 'the picnic time is on the board', e.boards);
await choose(w, 'Back to the fete');
await w.until(async () => (await exp()).mode === 'fete', 'back from the picnic');

// 10. The Toot-o-Matic: pick the squeaky duck with the device, close with Back.
await place(6.5, 10.4, Math.PI);
await w.act();
await w.until(() => w.menuOpen(), 'the Toot-o-Matic');
if (phone) await page.locator('.modal.in .btn', { hasText: 'Squeaky duck' }).first().tap();
else {
  await w.dir('right');
  await w.confirm();
}
await wait(300);
await w.shot('15-tootomatic');
e = await exp();
check(e.voice === 'duck', 'the squeaky duck voice', e.voice);
if (phone) await page.locator('.modal.in .btn', { hasText: 'Done' }).first().tap();
else await w.back();
await w.until(async () => !(await w.menuOpen()), 'the Toot-o-Matic closes');

// 11. Tap mode on the remote: a double tap is a big one.
if (remote) {
  await w.call('debugTapMode', true);
  await w.call('debugGive', 'beans');
  await place(0, 8, Math.PI);
  await w.call('debugResetMoves');
  await page.keyboard.press('Enter');
  await wait(90);
  await page.keyboard.press('Enter');
  await wait(1400);
  e = await exp();
  check(e.moves.maxY > 5, 'tap mode: a double tap fires a big one', e.moves);
  await w.call('debugTapMode', false);
}

// 12. Night, and the cost of every tier.
await place(0, 26, Math.PI);
await w.call('debugNight', 1);
await wait(800);
await w.shot('16-night');
await w.call('debugNight', null);
for (const q of ['low', 'medium', 'high'] as const) {
  await w.dbg('setQuality', q);
  await wait(1200);
  e = await exp();
  const st = await w.dbg('state');
  console.log(`tier ${q}: ${e.draws} draw calls, ${e.triangles} triangles, fps ${st.fps}, p75 ${st.p75.toFixed(1)} ms`);
  check(e.draws <= BUDGET[q].draws && e.triangles <= BUDGET[q].tris, `the ${q} tier fits its budget`, { draws: e.draws, tris: e.triangles });
  await w.shot(`17-tier-${q}`);
}
await w.dbg('setQuality', 'medium');

// 13. Leave through the garden gate.
await place(-2.1, 23.5, -Math.PI / 2);
check((await w.dbg('state')).prompt?.startsWith('Back to') || phone, 'the way out', (await w.dbg('state')).prompt);
await w.act();
await w.until(async () => (await w.dbg('state')).space === 'room', 'back in the room');
await w.done('Fart world playtest passed');
