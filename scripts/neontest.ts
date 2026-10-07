// Club Nova playtest: drives the real input on desktop, PHONE=1, PAD=1 and
// REMOTE=1 (arrows, OK and Back only) through the main loop. Arrival and the
// intro, the sound check, a party night (laser tag with a lock, beat shots,
// a bank shot, a deflect and a tag-out; a duel to a knockout; the dance off
// with holds, spotlight presses, a pause and Glow time), the podium, a crush
// and a feint in free play duels, a board result the server confirms, the
// wardrobe, song select with its preview, a press-nothing dance, draw calls
// per tier, and out through the portal.
//
//   TOYBOXES_BASE=http://localhost:5207/ npx tsx scripts/neontest.ts   (and PHONE=1, PAD=1, REMOTE=1)

import { openWorld, type World } from './lib/world';

const w: World = await openWorld({ kind: 'neon', areaId: 'neon-party', name: 'Neon space party', quality: 'low', time: 'night' });
const { page, device } = w;
const log = (...a: unknown[]) => console.log(`[${device}]`, ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const exp = async () => (await w.exp()) as any;
const game = async () => (await exp()).game as any;
const fail = (msg: string) => {
  throw new Error(`[${device}] ${msg}`);
};

// A TV remote: a Tizen browser, so the TV glyphs and Back key apply. Reload
// into the room with that user agent and walk back in.
const cdp = await page.context().newCDPSession(page);
if (device === 'remote') {
  await cdp.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/4.0 Chrome/85.0.4183.93 TV Safari/537.36' });
  await page.goto(new URL(`/?room=${w.roomId}`, process.env.TOYBOXES_BASE ?? 'http://localhost:5207/').toString());
  await page.waitForSelector('body.ready');
  await w.until(async () => (await w.dbg('state')).space === 'room', 'room after reload');
  await sleep(800);
  const door = (await w.dbg('spots')).areaDoors[0];
  await w.dbg('teleport', door.x, door.z + 0.3, Math.PI);
  await sleep(300);
  await page.keyboard.press('Enter');
  await w.until(async () => (await w.dbg('state')).space === 'area', 'enter the area');
  if (!(await page.evaluate(() => /Tizen/.test(navigator.userAgent)))) fail('No TV user agent');
}

async function padTap(i: number, ms = 350): Promise<void> {
  await page.evaluate((b) => ((window as any).__pad.buttons[b] = 1), i);
  await sleep(ms);
  await page.evaluate((b) => ((window as any).__pad.buttons[b] = 0), i);
  await sleep(160);
}

async function tvBack(): Promise<void> {
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 10009, nativeVirtualKeyCode: 10009, key: 'Unidentified', code: '' });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 10009, nativeVirtualKeyCode: 10009, key: 'Unidentified', code: '' });
  await sleep(200);
}

/** Pause in play: Escape, Start, the TV remote's Back key (10009) or the touch menu button. */
async function pause(): Promise<void> {
  if (device === 'remote') await tvBack();
  else if (device === 'pad') await padTap(9);
  else if (device === 'phone') await page.locator('.tbtn-menu').tap();
  else await page.keyboard.press('Escape');
  await sleep(200);
}

/** Leave the pause menu the way this device would. */
async function resume(): Promise<void> {
  if (device === 'remote') await tvBack();
  else if (device === 'pad') await padTap(1);
  else if (device === 'phone') await page.locator('.modal.in .btn', { hasText: 'Resume' }).tap();
  else await page.keyboard.press('Escape');
  await sleep(200);
}

/** Close a card: Back (Escape, B, the remote's Back) or a tap on its last button. */
async function closeCard(): Promise<void> {
  if (device === 'remote') await tvBack();
  else if (device === 'pad') await padTap(1);
  else if (device === 'phone') await page.locator('.modal.in .btn').last().tap();
  else await page.keyboard.press('Escape');
  await sleep(300);
}

/** OK on a card: Enter, A, OK or a tap on its primary button. */
async function ok(): Promise<void> {
  if (device === 'pad') {
    // The page reads the pad once a frame; a long software-rendered frame can
    // swallow a press, so press again while the same card is still up.
    await page.evaluate(() => document.querySelector('.modal.in')?.setAttribute('data-ok', '1'));
    for (let i = 0; i < 3; i++) {
      await padTap(0);
      await sleep(400);
      if (!(await page.evaluate(() => !!document.querySelector('.modal.in[data-ok]')))) break;
    }
  } else await w.confirm();
}

/** Interact: E, A, OK or the touch Action button (held long enough for a slow software renderer). */
async function act(): Promise<void> {
  if (device === 'pad') await padTap(0);
  else await w.act();
}

/** Clock offset between this process and the page's performance.now(). */
async function clockOffset(): Promise<number> {
  let best = Infinity;
  let off = 0;
  for (let i = 0; i < 3; i++) {
    const a = performance.now();
    const p = await page.evaluate(() => performance.now());
    const b = performance.now();
    if (b - a < best) {
      best = b - a;
      off = p - (a + b) / 2;
    }
  }
  return off;
}

const TAP = { x: 195, y: 520 };

/** A rhythm press (and release) on this device at a page time. */
async function pressAt(off: number, at: number, until?: number): Promise<void> {
  await sleep(at - off - performance.now() - 2);
  if (device === 'phone') await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: TAP.x, y: TAP.y, id: 11 }] });
  else if (device === 'pad') await page.evaluate(() => ((window as any).__pad.buttons[0] = 1));
  else await page.keyboard.down(device === 'remote' ? 'Enter' : 'Space');
  if (until !== undefined) await sleep(until - off - performance.now());
  else await sleep(device === 'pad' ? 70 : 30);
  if (device === 'phone') await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  else if (device === 'pad') await page.evaluate(() => ((window as any).__pad.buttons[0] = 0));
  else await page.keyboard.up(device === 'remote' ? 'Enter' : 'Space');
}

/** Waits for a card and presses its primary button. */
async function confirmCard(what: string, ms = 20000): Promise<void> {
  await w.until(() => w.menuOpen(), what, ms);
  await sleep(500);
  await ok();
  await sleep(300);
}

// ---- 1. Arrival: the flyover (OK skips it) and the intro card.

await w.until(async () => (await exp()).intro === true || (await w.menuOpen()), 'flyover or intro', 8000);
await w.shot('01-arrival-flyover');
if ((await exp()).intro) await act();
await w.until(() => w.menuOpen(), 'intro card', 8000);
await w.shot('02-intro-card');
await ok();
await sleep(500);
await w.shot('03-arrival');
const st0 = await w.dbg('state');
await w.walk('up', 700);
const st1 = await w.dbg('state');
if (Math.hypot(st1.x - st0.x, st1.z - st0.z) < 0.5) fail('Walking did not move the player');
log('arrival, intro and walking ok');

// ---- 2. Party night 1 from the star pad, with the sound check first.

await w.dbg('teleport', 0, 10.2, Math.PI);
await sleep(400);
if (!/party night/i.test((await w.dbg('state')).prompt ?? '')) fail(`Star pad prompt missing: ${(await w.dbg('state')).prompt}`);
await act();
await confirmCard('night select');
await w.until(() => w.menuOpen(), 'sound check offer', 8000);
await w.shot('04-sound-check-offer');
await ok();
await w.until(async () => (await exp()).mode === 'sync', 'sound check');
{
  const off = await clockOffset();
  const beats: number[] = (await game()).beats;
  for (let b = 4; b < 12; b++) {
    await pressAt(off, beats[b] + 25);
    if (b === 6) await w.shot('05-sound-check');
  }
  await pressAt(off, beats[12], beats[14] + 300);
}
await w.until(async () => (await exp()).mode !== 'sync', 'sound check done', 12000);
const sync = (await exp()).sync;
if (!sync.checked || sync.offset < -20 || sync.offset > 120) fail(`Sound check offset off: ${JSON.stringify(sync)}`);
log('sound check ok', sync.offset, 'ms, easy holds', sync.easyHolds);

// Orbit's lineup card.
await w.until(() => w.menuOpen(), 'lineup', 10000);
await w.shot('06-lineup');
await ok();

// ---- 3. Laser tag: practice target, then the match.

await w.until(async () => (await game())?.phase === 'practice', 'tag practice', 20000);
await w.shot('07-tag-practice');
for (let i = 0; i < 30 && (await game())?.phase === 'practice'; i++) {
  await act();
  await sleep(250);
}
await w.until(async () => (await game())?.phase === 'play', 'tag match', 15000);
// Lock and fire, on the beat now and then.
let tags = (await game()).player.tags;
for (let i = 0; i < 40 && (await game()).player.tags < tags + 2; i++) {
  const g = await game();
  if (!g.lock) {
    // Face the nearest enemy and walk a little toward it.
    const e = g.bots.filter((b: any) => b.team === 'magenta' && b.out <= 0).sort((a: any, b: any) => Math.hypot(a.x - g.player.x, a.z - g.player.z) - Math.hypot(b.x - g.player.x, b.z - g.player.z))[0];
    if (e) await w.dbg('teleport', g.player.x, g.player.z, Math.atan2(e.x - g.player.x, e.z - g.player.z));
    await sleep(200);
  }
  await act();
  await sleep(180);
}
if ((await game()).player.tags < tags + 2) fail('Could not land two tags');
await w.shot('08-tag-fight');
tags = (await game()).player.tags;
// A bank shot off a mirror.
if (!(await w.call('debugGame', 'debugSetup', 'bank'))) fail('No bank shot setup found');
await w.until(async () => !!(await game()).lock?.bank, 'bank lock', 4000);
await w.shot('09-tag-bank');
const logBefore = (await game()).log;
for (let i = 0; i < 12 && (await game()).player.tags <= tags; i++) {
  await act();
  await sleep(330);
}
if ((await game()).player.tags <= tags) fail('The bank shot did not tag');
await w.call('debugGame', 'debugThaw');
log('tags and a bank shot ok', (await game()).log - logBefore, 'log events');
// A deflect: OK swings the blade when a bolt is about to land.
const reflectsBefore = (await game()).reflects;
await w.call('debugGame', 'debugSetup', 'deflect');
await w.until(async () => (await game()).canDeflect, 'deflect window', 3000);
await act();
await sleep(150);
await w.shot('10-tag-deflect');
await sleep(250);
if ((await game()).reflects <= reflectsBefore) fail('The deflect did not send the bolt back');
// Tagged out, then glowing back in at base.
await w.call('debugGame', 'debugSetup', 'out');
await w.until(async () => (await game()).player.out > 0, 'tagged out', 4000);
await w.shot('11-tag-out');
await w.until(async () => (await game()).player.out <= 0, 'respawn', 8000);
log('deflect, tag-out and respawn ok');
await w.call('debugEnd');
await w.until(() => w.menuOpen(), 'tag results', 15000);
await w.shot('12-tag-results');
await ok();

// ---- 4. The duel: a knockout against Sprocket (first time: the drill).

await w.until(async () => (await exp()).mode === 'duel', 'duel', 20000);
async function playDuel(stopWhen: (g: any) => boolean = () => false): Promise<any> {
  const off = await clockOffset();
  const done = new Set<string>();
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    const g = await game();
    if (!g || (g.phase !== 'bout' && g.phase !== 'drill') || stopWhen(g)) return g;
    const e = g.next.find((x: any) => !done.has(`${g.phase}${x.i}`));
    if (!e) {
      await sleep(40);
      continue;
    }
    const wait = e.at - off - performance.now();
    if (wait > 400) {
      await sleep(Math.min(250, wait - 300));
      continue;
    }
    done.add(`${g.phase}${e.i}`);
    if (e.kind === 'feint') continue;
    await pressAt(off, e.at, e.kind === 'crush' ? e.endAt : undefined);
  }
  return game();
}
await sleep(1500);
await w.shot('13-duel');
const duelEnd = await playDuel();
if (duelEnd.outcome !== 'ko') fail(`Duel did not end in a knockout: ${JSON.stringify(duelEnd)}`);
await w.until(() => w.menuOpen(), 'duel results', 15000);
await w.shot('14-duel-results');
await ok();

// ---- 5. The dance off: Nova Lights, pressing on the due times.

await w.until(async () => (await exp()).mode === 'dance', 'dance', 20000);
{
  let off = await clockOffset();
  const done = new Set<number>();
  const slotsDone = new Set<number>();
  let paused = false;
  let lastPhase = '';
  let judgedAtPause = 0;
  let shots = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    const g = await game();
    if (!g || (g.phase !== 'play' && g.phase !== 'drill')) break;
    if (g.phase !== lastPhase) {
      lastPhase = g.phase;
      done.clear();
    }
    if (g.phase === 'drill' && !g.next.length) {
      await sleep(60);
      continue;
    }
    // Pause once mid-song with Back, then resume.
    if (!paused && g.phase === 'play' && g.judged > 40) {
      paused = true;
      judgedAtPause = g.judged;
      await pause();
      await w.until(() => w.menuOpen(), 'pause menu', 4000);
      await w.shot('16-dance-paused');
      const t1 = (await game()).t;
      await sleep(1200);
      if (Math.abs((await game()).t - t1) > 0.01) fail('The song kept going under the pause menu');
      await resume();
      await w.until(async () => !(await w.menuOpen()), 'resume', 4000);
      await w.until(async () => !(await game()).paused && (await game()).countIn <= 0, 'count-in', 6000);
      if ((await game()).judged < judgedAtPause) fail('Notes were re-judged after the pause');
      off = await clockOffset();
      continue;
    }
    // Spotlight slots: press on every other eighth.
    const slot = g.slots.find((s: any, i: number) => !slotsDone.has(Math.round(s.t * 1000)) && i % 2 === 0);
    const n = g.next.find((x: any) => !done.has(x.i));
    const nextAt = Math.min(n ? n.at : Infinity, slot ? slot.at : Infinity);
    const wait = nextAt - off - performance.now();
    if (!Number.isFinite(nextAt) || wait > 400) {
      await sleep(Number.isFinite(nextAt) ? Math.min(250, wait - 300) : 60);
      continue;
    }
    if (slot && slot.at <= (n ? n.at : Infinity)) {
      slotsDone.add(Math.round(slot.t * 1000));
      for (const s of g.slots) if (Math.abs(s.t - slot.t) < 0.3) slotsDone.add(Math.round(s.t * 1000));
      await pressAt(off, slot.at);
      continue;
    }
    done.add(n.i);
    await pressAt(off, n.at, n.kind === 'hold' ? n.endAt : undefined);
    if (done.size === 30 && !shots++) await w.shot('15-dance');
    if ((await game()).glow && shots === 1) {
      shots++;
      await w.shot('17-dance-glow');
    }
  }
  const g = await game();
  const c = g.counts;
  const good = (c.P + c.G) / Math.max(1, c.P + c.G + c.O + c.M);
  log('dance', JSON.stringify({ counts: c, holds: g.holds, spot: g.spot, glows: g.glows, good: good.toFixed(2) }));
  if (good < 0.85) fail(`Only ${(good * 100).toFixed(0)}% Perfect or Great`);
  if (!g.holds.kept) fail('No hold was kept');
  if (!g.spot.F) fail('No spotlight press landed on the grid');
  if (!g.glows) fail('Glow time never came');
}
await w.until(async () => (await game())?.phase === 'cards', 'judges cards', 30000);
await sleep(2200);
await w.shot('18-judges-cards');
await confirmCard('dance results', 15000);
// The night podium.
await w.until(() => w.menuOpen(), 'podium card', 30000);
await sleep(1500);
await w.shot('19-night-podium');
const afterNight = await exp();
if (afterNight.nights < 1) fail('The night did not count as finished');
// "Done" is the last button: arrow (or d-pad) over to it, or tap it.
if (device === 'phone') await page.locator('.modal.in .btn').last().tap();
else {
  if (device === 'pad') await padTap(15);
  else await page.keyboard.press('ArrowRight');
  await ok();
}
await w.until(async () => !(await w.menuOpen()), 'podium closed', 6000);
log('party night ok', afterNight.stars, 'stars');

// ---- 6. Free play duels: hold a crush (Brick), read a feint (Mirage), then a board result.

await w.call('debugSetNights', 3);
await w.call('debugDuel', 'brick', false);
let g = await playDuel((x) => x.crushes >= 1);
if (g.crushes < 1) fail(`The crush was not held: ${JSON.stringify(g)}`);
await w.shot('20-duel-crush');
await w.call('debugEnd');
await w.until(() => w.menuOpen(), 'brick results', 15000);
await closeCard();
await w.call('debugDuel', 'mirage', false);
g = await playDuel((x) => x.reads >= 1);
if (g.reads < 1 || g.whiffs > 0) fail(`The feint was not read: ${JSON.stringify(g)}`);
log('crush and feint ok');
await w.call('debugEnd');
await w.until(() => w.menuOpen(), 'mirage results', 15000);
await closeCard();
await w.call('debugDuel', 'sprocket', false);
g = await playDuel();
await w.until(() => w.menuOpen(), 'sprocket results', 15000);
await w.until(async () => !!(await exp()).board?.posted, 'board response', 10000);
const posted = (await exp()).board;
if (!posted.posted.ok || !posted.posted.rank) fail(`The board did not confirm: ${JSON.stringify(posted)}`);
await w.shot('21-board-confirmed');
log('board confirmed', JSON.stringify(posted));
await closeCard();

// ---- 7. The wardrobe: equip the pink blade with the arrows (or a tap).

await w.dbg('teleport', 26.5, -2.9, Math.PI);
await sleep(400);
await act();
await w.until(() => w.menuOpen(), 'wardrobe', 6000);
const bladeBefore = (await page.evaluate(() => (window as any).toyboxes.space.interior.save.data.equipped.blade)) as string;
if (device === 'phone') await page.locator('.modal.in .btn', { hasText: 'Pink blade' }).tap();
else {
  await page.evaluate(() => (document.querySelector('.modal.in .btn[data-id="cyan"]') as HTMLElement)?.focus());
  await w.dir('right');
  await ok();
}
await sleep(600);
await w.shot('22-wardrobe');
const bladeAfter = (await page.evaluate(() => (window as any).toyboxes.space.interior.save.data.equipped.blade)) as string;
if (bladeAfter === bladeBefore) fail('The wardrobe did not equip anything');
await closeCard();
log('wardrobe ok', bladeBefore, '->', bladeAfter);

// ---- 8. Song select with a preview loop, and a press-nothing dance (no fail).

await w.dbg('teleport', 0, -7.6, Math.PI);
await sleep(400);
await act();
await w.until(() => w.menuOpen(), 'song select', 6000);
await sleep(800);
await w.shot('23-song-select');
const preview = await page.evaluate(() => (window as any).toyboxes.space.interior.clock.song?.name ?? null);
const playing = await page.evaluate(async () => (await import('/src/audio/music.ts' as string)).music.playing);
if (!playing || !/nova-/.test(playing)) fail(`No preview playing: ${playing} ${preview}`);
await closeCard();
await sleep(400);
await w.call('debugDance', 'lights', 'easy');
await w.until(async () => (await game())?.judged > 10, 'notes going by', 30000);
const idle = await game();
if (idle.counts.M < 5 || idle.phase !== 'play') fail('Missing notes should count as misses and the song carries on');
await w.call('debugEnd');
await w.until(() => w.menuOpen(), 'idle results', 20000);
await w.shot('24-no-fail-results');
await closeCard();
log('song select, preview and no-fail ok');

// ---- 9. Draw calls and frame times per tier.

const perf: Record<string, unknown> = {};
for (const tier of ['low', 'medium', 'high'] as const) {
  await w.dbg('setQuality', tier);
  await w.dbg('teleport', 0, 9, Math.PI);
  await sleep(1500);
  const e = await exp();
  const s = await w.dbg('state');
  perf[tier] = { calls: e.calls, triangles: e.triangles, p75: s.p75 };
  const budget = { low: [90, 150_000], medium: [160, 400_000], high: [260, 900_000] }[tier];
  if (e.calls > budget[0] || e.triangles > budget[1]) fail(`${tier} over budget: ${e.calls} calls, ${e.triangles} triangles`);
}
await w.dbg('setQuality', 'low');
log('per tier', JSON.stringify(perf));

// ---- 10. Out through the portal.

await w.dbg('teleport', 0, 23.4, 0);
await sleep(1200);
for (let i = 0; i < 3 && (await w.dbg('state')).space === 'area'; i++) {
  await act();
  await sleep(1500);
}
await w.until(async () => (await w.dbg('state')).space === 'room', 'back in the room', 10000);
await w.shot('25-exit');
await w.done('Club Nova playtest passed');
