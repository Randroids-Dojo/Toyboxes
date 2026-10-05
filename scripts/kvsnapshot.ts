// Records or cleans up Toyboxes keys in the live store, so scripted
// playtests against production leave nothing behind.
//
//   npx tsx scripts/kvsnapshot.ts save <file>    list current toyboxes:v1:* keys
//   npx tsx scripts/kvsnapshot.ts clean <file>   delete keys that were not in the list
//
// Needs KV_REST_API_URL and KV_REST_API_TOKEN in the environment.

import { readFileSync, writeFileSync } from 'node:fs';
import { Redis } from '@upstash/redis';

const [mode, file] = process.argv.slice(2);
const r = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });

async function keys(): Promise<string[]> {
  const out: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await r.scan(cursor, { match: 'toyboxes:v1:*', count: 1000 });
    out.push(...batch);
    cursor = String(next);
  } while (cursor !== '0');
  return out;
}

const now = await keys();
if (mode === 'save') {
  writeFileSync(file, JSON.stringify(now));
  console.log(`saved ${now.length} keys`);
} else if (mode === 'clean') {
  const before = new Set(JSON.parse(readFileSync(file, 'utf8')) as string[]);
  const added = now.filter((k) => !before.has(k));
  // Shared sorted sets existed before only if someone else used them; drop test members by removing the whole key when it is new.
  if (added.length) await r.del(...added);
  console.log(`removed ${added.length} keys added during the run`);
} else {
  console.log('usage: save|clean <file>');
}
