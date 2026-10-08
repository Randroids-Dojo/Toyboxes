// Ships a commit that passed qa.sh: push to main, wait until the live site
// serves it, smoke-test production, and roll back (git revert + push) if
// anything fails.
//
//   npx tsx scripts/autobuild/release.ts [roomId ...]
//
// Room ids are smoke-tested read-only after the deploy. Exit 0 = released,
// 2 = verified rollback, 3 = deployment or rollback unverified, 1 = refused.

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { confirmVersion } from './safety';

const BASE = 'https://toyboxes.games';
const rooms = process.argv.slice(2);
const sh = (cmd: string) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const sha = sh('git rev-parse HEAD');
if (sh('git branch --show-current') !== 'main') throw new Error('Release from main only');
if (sh('git status --porcelain')) throw new Error('Commit everything first');
const passed = existsSync('/tmp/toyboxes-qa-pass') ? readFileSync('/tmp/toyboxes-qa-pass', 'utf8').trim() : '';
if (passed !== sha) {
  console.log(`QA has not passed for ${sha.slice(0, 7)}; run scripts/autobuild/qa.sh`);
  process.exit(1);
}

async function live(): Promise<string> {
  try {
    const r = await fetch(`${BASE}/version.json`, { cache: 'no-store' });
    return ((await r.json()) as { version: string }).version;
  } catch {
    return '';
  }
}

async function waitFor(target: string, minutes = 12): Promise<boolean> {
  const end = Date.now() + minutes * 60_000;
  while (Date.now() < end) {
    if ((await live()) === target) return true;
    await new Promise((r) => setTimeout(r, 15_000));
  }
  return false;
}

function run(cmd: string, args: string[], env: Record<string, string> = {}): boolean {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  return r.status === 0;
}

function smoke(): boolean {
  if (!run('npx', ['tsx', 'scripts/autobuild/prodsmoke.ts', ...rooms])) return false;
  // The complete mutating experience suite runs against local memory in QA.
  // Production smoke only reads existing rooms. No store snapshots or cleanup.
  return true;
}

console.log(`Releasing ${sha.slice(0, 7)}`);
sh('git push origin main');
if (!(await waitFor(sha))) {
  console.log('The deploy never went live; check Vercel. Nothing was rolled back.');
  process.exit(3);
}
console.log('Live. Smoke testing production.');
if (smoke()) {
  console.log(`RELEASED ${sha}`);
  process.exit(0);
}
console.log('Production smoke failed. Rolling back.');
sh(`git revert --no-edit ${sha}`);
sh('git push origin main');
const back = sh('git rev-parse HEAD');
if (!(await waitFor(back)) || !(await confirmVersion(back, live))) {
  console.log(`ROLLBACK UNVERIFIED for ${back.slice(0, 7)}; check Vercel`);
  process.exit(3);
}
console.log(`ROLLED BACK to ${back.slice(0, 7)}`);
process.exit(2);
