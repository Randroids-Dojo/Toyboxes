// Lists sketchbook pages that are new or edited since the creator last
// looked, with full text, what changed, and each drawing rendered to a PNG.
//
//   npx tsx scripts/autobuild/queue.ts [outDir]
//
// Prints "nothing new" and exits 0 when the queue is empty. Otherwise
// writes <outDir>/queue.json and the images, and prints a summary.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { admin } from './client';

const out = process.argv[2] ?? '/tmp/toyboxes-autobuild';
mkdirSync(out, { recursive: true });

const COLORS = ['#2b2340', '#e8574a', '#4aa3df', '#3fb68b', '#f4b740', '#8a6bd1'];
const WIDTHS = [3, 7, 14];

interface FeedItem { roomId: string; pageId: string; slot: number; ownerName: string; roomStatus: string; n: number; rev: number; status: string; seen: boolean; removed: boolean }

const feed = (await admin<{ feed: FeedItem[] }>('GET', '?view=feed')).feed;
const todo = feed.filter((f) => !f.seen && !f.removed && f.roomStatus === 'active');
if (!todo.length) {
  console.log('nothing new');
  process.exit(0);
}

const rooms = new Map<string, any>();
for (const f of todo) if (!rooms.has(f.roomId)) rooms.set(f.roomId, await admin('GET', `?view=room&id=${encodeURIComponent(f.roomId)}`));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
const items = [];
for (const f of todo) {
  const d = rooms.get(f.roomId);
  const p = d.pages.find((x: { id: string }) => x.id === f.pageId);
  const prev = p.history?.[0] ?? null;
  const image = join(out, `room${f.slot + 1}-page${p.n}-rev${p.rev}.png`);
  await page.setContent('<canvas id=c width=600 height=600></canvas>');
  await page.evaluate(
    ([sketch, colors, widths]) => {
      const c = document.getElementById('c') as HTMLCanvasElement;
      const g = c.getContext('2d')!;
      g.fillStyle = '#fffdf7';
      g.fillRect(0, 0, 600, 600);
      g.lineCap = g.lineJoin = 'round';
      for (const s of sketch as { c: number; w: number; p: number[] }[]) {
        g.strokeStyle = (colors as string[])[s.c];
        g.lineWidth = (widths as number[])[s.w] * 1.2;
        g.beginPath();
        for (let i = 0; i < s.p.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, s.p[i] * 0.6, s.p[i + 1] * 0.6);
        g.stroke();
      }
    },
    [p.sketch, COLORS, WIDTHS] as const,
  );
  await page.screenshot({ path: image });
  items.push({
    roomId: f.roomId,
    slot: f.slot + 1,
    owner: f.ownerName,
    pageId: p.id,
    page: p.n,
    rev: p.rev,
    status: p.status,
    kind: p.rev > 1 ? 'edited' : 'new',
    text: p.text,
    previousText: prev?.text ?? null,
    strokes: p.sketch.length,
    image,
    roomAreas: d.content.areas.map((a: { id: string; name: string; experience?: { kind: string } | null; pages?: string[] }) => ({ id: a.id, name: a.name, kind: a.experience?.kind ?? 'room', pages: a.pages ?? [] })),
    roomExhibits: d.content.exhibits.length,
  });
}
await browser.close();
writeFileSync(join(out, 'queue.json'), JSON.stringify(items, null, 2));
for (const it of items) {
  console.log(`\n== Room ${it.slot} (${it.owner}) page ${it.page} rev ${it.rev} [${it.kind}, ${it.status}] ${it.image}`);
  console.log(it.text);
  if (it.previousText !== null && it.previousText !== it.text) console.log(`-- before: ${it.previousText}`);
  console.log(`-- room has: ${it.roomAreas.map((a: { name: string; kind: string }) => `${a.name} (${a.kind})`).join(', ') || 'no areas'}`);
}
console.log(`\n${items.length} page(s) to handle; details in ${join(out, 'queue.json')}`);
