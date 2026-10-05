// Ships a commit that passed qa.sh: push to main, wait until the live site
// serves it, smoke-test production, and roll back (git revert + push) if
// anything fails.
//
//   npx tsx scripts/autobuild/release.ts [roomId ...]
//
// Room ids are smoke-tested read-only after the deploy. Exit 0 = released,
// 2 = rolled back, 1 = refused to start.

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';

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
  // The full experience playtest on a temporary room, cleaned up afterwards.
  if (!run('vercel', ['env', 'pull', '/tmp/toyboxes-prod.env', '--environment', 'production', '--scope', 'randroid88s-projects', '--yes'])) return false;
  const env: Record<string, string> = {};
  for (const line of readFileSync('/tmp/toyboxes-prod.env', 'utf8').split('\n')) {
    const m = line.match(/^(KV_REST_API_URL|KV_REST_API_TOKEN)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2];
  }
  rmSync('/tmp/toyboxes-prod.env', { force: true });
  env.ADMIN_PASSWORD = readFileSync(`${process.env.HOME}/.config/toyboxes/admin.pass`, 'utf8').trim();
  run('npx', ['tsx', 'scripts/kvsnapshot.ts', 'save', '/tmp/toyboxes-release-keys.json'], env);
  const ok = run('npx', ['tsx', 'scripts/experiencetest.ts', '/tmp/toyboxes-release-exp', `${BASE}/`], env);
  run('npx', ['tsx', 'scripts/kvsnapshot.ts', 'clean', '/tmp/toyboxes-release-keys.json'], env);
  return ok;
}

console.log(`Releasing ${sha.slice(0, 7)}`);
sh('git push origin main');
if (!(await waitFor(sha))) {
  console.log('The deploy never went live; check Vercel. Nothing was rolled back.');
  process.exit(2);
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
await waitFor(back);
console.log(`ROLLED BACK to ${back.slice(0, 7)}`);
process.exit(2);
