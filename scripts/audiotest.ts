// Music under touch: every world's music must keep ahead of the speakers while
// a phone player taps away. Chrome holds back page timers for about 100 ms
// after every touch starts, and a phone is slower than this Mac, so each world
// is tapped (its touch buttons and the open screen) for a while with the CPU
// slowed down, and the sequencer's health is checked: nothing heard late or
// skipped, no long wait between its wakeups, and a safe lead on the speakers.
// First, audio is stopped the way iOS stops it after a call or another app,
// and one tap must bring it back.
//
//   TOYBOXES_BASE=http://localhost:5207/ npx tsx scripts/audiotest.ts
//   WORLDS=fart,neon for a subset, THROTTLE=4 (CPU slowdown), SECONDS=10 per world.

import { grandPrixTrack } from '../src/shared/circuits';
import { openWorld } from './lib/world';

interface Health {
  playing: string | null;
  audio: string;
  steps: number;
  late: number;
  dropped: number;
  minLeadMs: number;
  maxGapMs: number;
  maxGapAt: number;
  clock: 'worker' | 'timer' | null;
}

const WORLDS = [
  { kind: 'fart', areaId: 'puff-challenge', name: 'Fart simulator' },
  { kind: 'kart', areaId: 'kart-track', name: 'Kart track', experience: { track: grandPrixTrack(), laps: 3 } },
  { kind: 'casino', areaId: 'casino', name: 'Casino' },
  { kind: 'neon', areaId: 'neon-party', name: 'Neon space party' },
  { kind: 'galaxy', areaId: 'black-hole-galaxy', name: 'Black hole galaxy' },
];
const only = process.env.WORLDS?.split(',');
const THROTTLE = Number(process.env.THROTTLE ?? 4);
const SECONDS = Number(process.env.SECONDS ?? 10);
// The longest a wakeup may wait. The worker clock ticks every 25 ms and a
// slow frame can hold it back once in a while; a page timer would wait 100 ms
// or more after every touch, which the clock check below rules out.
const MAX_GAP_MS = 150;
// The least lead a step may have on the speakers (the sequencer aims for 250 ms).
const MIN_LEAD_MS = 100;
// Sources started during the taps and still playing: a runaway voice shows up here.
const MAX_LIVE_SOURCES = 160;

const failures: string[] = [];
for (const spec of WORLDS.filter((s) => !only || only.includes(s.kind))) {
  const w = await openWorld({ ...spec, device: 'phone', quality: 'medium', gpu: true, out: `/tmp/toyboxes-audio-${spec.kind}` });
  const { page } = w;
  // Through the arrival: close cards as they open until the world's music plays.
  const closeCards = async () => {
    if (await w.menuOpen()) await w.confirm();
  };
  await w.until(async () => {
    await closeCards();
    return !!(await w.dbg<Health>('music')).playing;
  }, `${spec.kind} music starts`, 30000);
  await page.waitForTimeout(1500);
  await closeCards();

  // Stopped like iOS after a call: one tap on the open screen brings it back.
  const vp = page.viewportSize()!;
  await w.dbg('interruptAudio');
  await page.waitForTimeout(300);
  const stopped = (await w.dbg<Health>('music')).audio;
  await page.touchscreen.tap(vp.width * 0.6, vp.height * 0.3);
  await page.waitForTimeout(600);
  const back = (await w.dbg<Health>('music')).audio;
  if (stopped === 'running' || back !== 'running') failures.push(`${spec.kind}: audio was ${stopped} after the interruption and ${back} after a tap`);

  // Count sources that start from here on and are still playing, and keep
  // the long frames (with the scripts in them) to explain a stall.
  await page.evaluate(() => {
    const frames: unknown[] = ((window as any).__frames = []);
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as any[])
        frames.push({ start: e.startTime, end: e.startTime + e.duration, scripts: e.scripts.filter((s: any) => s.duration >= 8).map((s: any) => `${Math.round(s.duration)} ms ${s.invokerType} ${s.invoker} ${(s.sourceURL || '').replace(/^.*\/src\//, 'src/').replace(/\?.*$/, '')}:${s.sourceCharPosition} ${s.sourceFunctionName}`) });
    }).observe({ type: 'long-animation-frame' });
    const a = ((window as any).__sources = { live: 0, peak: 0 });
    const P = (window as any).AudioScheduledSourceNode.prototype;
    const start = P.start;
    P.start = function (...args: unknown[]) {
      a.live++;
      a.peak = Math.max(a.peak, a.live);
      this.addEventListener('ended', () => a.live--, { once: true });
      return start.apply(this, args);
    };
  });
  const cdp = await page.context().newCDPSession(page);
  const buttons = [];
  for (const sel of ['.tbtn-jump', '.tbtn-kick']) {
    const box = await page.locator(sel).boundingBox().catch(() => null);
    if (box && (await page.locator(sel).isVisible())) buttons.push(box);
  }
  // The open screen above the buttons: a touch there only looks around.
  const targets = [...buttons, { x: vp.width * 0.6, y: vp.height * 0.3, width: 2, height: 2 }];
  await w.dbg('music', true);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  const end = Date.now() + SECONDS * 1000;
  let taps = 0;
  while (Date.now() < end) {
    for (const b of targets) {
      const pt = [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 4 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
      await page.waitForTimeout(50);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(150);
      taps++;
    }
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const h = await w.dbg<Health>('music');
  const sources = await page.evaluate(() => (window as any).__sources as { live: number; peak: number });
  await w.shot('after-taps');
  const line = `${spec.kind}: audio ${stopped} then ${back} after a tap; ${taps} taps, ${h.playing}, ${h.steps} steps on the ${h.clock} clock, ${h.late} late, ${h.dropped} skipped, lead at least ${Math.round(h.minLeadMs)} ms, longest wait ${Math.round(h.maxGapMs)} ms, ${sources.peak} sources at once`;
  console.log(line);
  const bad: string[] = [];
  if (!h.playing) bad.push('the music stopped');
  if (h.clock !== 'worker') bad.push(`the sequencer ran on the ${h.clock} clock`);
  if (h.steps < SECONDS * 4) bad.push(`only ${h.steps} steps scheduled`);
  if (h.late) bad.push(`${h.late} steps heard late`);
  if (h.dropped) bad.push(`${h.dropped} steps skipped`);
  if (h.maxGapMs > MAX_GAP_MS) bad.push(`a ${Math.round(h.maxGapMs)} ms wait between wakeups (limit ${MAX_GAP_MS})`);
  if (h.minLeadMs < MIN_LEAD_MS) bad.push(`a lead of only ${Math.round(h.minLeadMs)} ms (limit ${MIN_LEAD_MS})`);
  if (sources.peak > MAX_LIVE_SOURCES) bad.push(`${sources.peak} sources at once (limit ${MAX_LIVE_SOURCES})`);
  if (w.errors.length) bad.push(`page errors: ${w.errors.join(' | ')}`);
  if (bad.length) {
    failures.push(`${spec.kind}: ${bad.join('; ')}`);
    // What the page was doing during the longest wait.
    const during = await page.evaluate((at) => ((window as any).__frames as { start: number; end: number; scripts: string[] }[]).filter((f) => f.end >= at - 400 && f.start <= at), h.maxGapAt);
    for (const f of during) console.log(`  long frame ${Math.round(f.end - f.start)} ms ending ${Math.round(h.maxGapAt - f.end)} ms before the wakeup: ${f.scripts.join(' | ') || 'no script over 8 ms'}`);
  }
  await w.browser.close();
}

if (failures.length) {
  console.log(`ERRORS\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`Music kept ahead in every world under touch at ${THROTTLE}x CPU slowdown`);
