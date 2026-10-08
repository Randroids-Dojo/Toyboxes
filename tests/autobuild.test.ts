import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allRoomQueue } from '../scripts/autobuild/coverage';
import { cleanOwnedTestKeys, confirmVersion, requireLocalPlaytest, rollbackBase, rollBackTo, type Git } from '../scripts/autobuild/safety';
import { SLOT_COUNT } from '../src/shared/model';

const prefix = `toyboxes:test-${'a'.repeat(32)}:`;
describe('automatic build prerequisites', () => {
  it('cleans only this run while preserving concurrent visitor and other-run keys', async () => {
    const visitor = 'toyboxes:v1:room:new-visitor';
    const otherRun = `toyboxes:test-${'b'.repeat(32)}:room:other`;
    const values = new Set([`${prefix}room:test`, visitor, otherRun, 'toyboxes:v1:rl:shared']);
    const deleted: string[] = [];
    const count = await cleanOwnedTestKeys({
      async scan(cursor, options) {
        expect(options.match).toBe(`${prefix}*`);
        if (cursor === '0') {
          values.add('toyboxes:v1:page:concurrent-visitor');
          return ['1', [`${prefix}room:test`]];
        }
        return ['0', [`${prefix}room:test`]];
      },
      async del(key) { deleted.push(key); return values.delete(key); },
    }, prefix);
    expect(count).toBe(1);
    expect(deleted).toEqual([`${prefix}room:test`]);
    expect([...values].sort()).toEqual([visitor, otherRun, 'toyboxes:v1:rl:shared', 'toyboxes:v1:page:concurrent-visitor'].sort());
  });
  it('refuses legacy snapshots and production prefixes before scan or deletion', async () => {
    const store = { async scan(): Promise<[string, string[]]> { throw new Error('must not scan'); }, async del() { throw new Error('must not delete'); } };
    for (const unsafe of ['toyboxes:v1:', '/tmp/toyboxes-release-keys.json', 'toyboxes:test-short:']) {
      await expect(cleanOwnedTestKeys(store, unsafe)).rejects.toThrow('isolated test prefix');
    }
  });
  it('rejects foreign keys before deleting even the owned batch', async () => {
    const deleted: string[] = [];
    await expect(cleanOwnedTestKeys({ async scan() { return ['0', [`${prefix}room:test`, 'toyboxes:v1:room:visitor']]; }, async del(key) { deleted.push(key); } }, prefix)).rejects.toThrow('outside this test run');
    expect(deleted).toEqual([]);
  });
  it('does not accept a rollback whose observed production version differs', async () => {
    expect(await confirmVersion('rollback-sha', async () => 'failed-sha')).toBe(false);
    expect(await confirmVersion('rollback-sha', async () => '')).toBe(false);
    expect(await confirmVersion('rollback-sha', async () => 'rollback-sha')).toBe(true);
    const release = readFileSync(new URL('../scripts/autobuild/release.ts', import.meta.url), 'utf8');
    expect(release).toContain('!(await confirmVersion(back, live))');
    expect(release).not.toContain('kvsnapshot');
    expect(release).not.toContain('experiencetest.ts');
  });
  it('rolls a release of many commits and a merge back to the version that was live', () => {
    const dir = mkdtempSync(join(tmpdir(), 'toyboxes-rollback-'));
    const git: Git = (...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const commit = (file: string, text: string, message: string) => { writeFileSync(join(dir, file), text); git('add', '-A'); git('commit', '-q', '-m', message); return git('rev-parse', 'HEAD'); };
    try {
      git('init', '-q', '-b', 'main');
      commit('a.txt', 'one', 'Start');
      const live = commit('b.txt', 'live', 'What production serves');
      git('checkout', '-q', '-b', 'world');
      commit('world.txt', 'new world', 'Add a world');
      git('checkout', '-q', 'main');
      commit('a.txt', 'two', 'Change a');
      git('merge', '-q', '--no-ff', '-m', 'Merge the world', 'world');
      const head = commit('b.txt', 'broken', 'Break b');
      expect(rollbackBase(live, head, git)).toBe(live);
      expect(rollbackBase(head, live, git)).toBeNull();
      expect(rollbackBase('', head, git)).toBeNull();
      expect(rollbackBase('0'.repeat(40), head, git)).toBeNull();
      const back = rollBackTo(live, git);
      expect(back).not.toBe(head);
      expect(git('rev-parse', `${back}^`)).toBe(head);
      expect(git('diff', '--stat', live, back)).toBe('');
      expect(git('status', '--porcelain')).toBe('');
      expect(git('log', '-1', '--format=%B')).toContain('Merge the world');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('prevents mutating experience playtests against production', () => {
    expect(() => requireLocalPlaytest('https://toyboxes.games/')).toThrow('local memory server');
    expect(() => requireLocalPlaytest('https://localhost.attacker.example/')).toThrow('local memory server');
    expect(() => requireLocalPlaytest('http://localhost:5207/')).not.toThrow();
  });
  function slots() { return Array.from({ length: SLOT_COUNT }, (_, slot) => ({ slot, roomId: slot < 2 ? `room${slot}` : null })); }
  function detail(id: string, count = 160) {
    return { room: { id, slot: Number(id.slice(4)), status: 'active', ownerName: 'Test' }, pages: Array.from({ length: count }, (_, n) => ({ id: `${id}-p${n}`, n, rev: 1, status: 'requested', seen: false, updatedAt: count - n })) };
  }
  it('traverses every active room beyond the recent feed limit and sorts oldest first', async () => {
    const read: string[] = [];
    const queue = await allRoomQueue(async () => slots(), async id => { read.push(id); return detail(id); });
    expect(read).toEqual(['room0', 'room1']);
    expect(queue.pagesRead).toBe(320);
    expect(queue.todo).toHaveLength(320);
    expect(queue.todo[0].updatedAt).toBe(1);
    expect(queue.todo.at(-1)?.updatedAt).toBe(160);
  });
  it('rejects partial slot coverage and changing membership', async () => {
    await expect(allRoomQueue(async () => slots().slice(1), async id => detail(id))).rejects.toThrow('Incomplete world');
    let reads = 0;
    await expect(allRoomQueue(async () => { const s = slots(); if (reads++) s[0].roomId = null; return s; }, async id => detail(id))).rejects.toThrow('membership changed');
  });
  it('fails explicitly rather than processing a bounded partial queue', async () => {
    await expect(allRoomQueue(async () => slots(), async id => detail(id, 10001))).rejects.toThrow('exceeded 10000');
  });
});
