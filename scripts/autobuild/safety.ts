// Release and local-playtest guards, without production writes.
export async function confirmVersion(target: string, read: () => Promise<string>): Promise<boolean> {
  return (await read()) === target;
}

/** Runs git with these arguments and returns trimmed stdout; throws on a non-zero exit. */
export type Git = (...args: string[]) => string;

/**
 * The commit a release can roll back to: the version production serves now,
 * if the release descends from it. Null when production is unreadable or
 * serves something this checkout cannot build on.
 */
export function rollbackBase(live: string, head: string, git: Git): string | null {
  if (!/^[0-9a-f]{40}$/.test(live)) return null;
  try {
    git('merge-base', '--is-ancestor', live, head);
    return live;
  } catch {
    return null;
  }
}

/**
 * Restores the tree production served before the release as one new commit
 * and returns its sha. Covers any number of shipped commits, merges
 * included, where a revert of the last commit alone would not.
 */
export function rollBackTo(before: string, git: Git): string {
  const shipped = git('log', '--format=%h %s', `${before}..HEAD`);
  git('read-tree', '--reset', '-u', before);
  const why = `Production smoke failed after releasing the commits below, so this puts back the files production served at ${before.slice(0, 7)}.`;
  git('commit', '--allow-empty', '-q', '-m', `Roll back to ${before.slice(0, 7)}`, '-m', `${why}\n\nRolled back:\n${shipped}`);
  return git('rev-parse', 'HEAD');
}

export function requireLocalPlaytest(base: string): void {
  const url = new URL(base);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Mutating experience playtests are restricted to a local memory server');
  }
  if (process.env.KV_REST_API_URL || process.env.KV_REST_API_TOKEN || process.env.VERCEL) {
    throw new Error('Mutating playtests require a local memory server without KV credentials');
  }
}

export function ownedTestPrefix(prefix: string): string {
  // A fresh random run id creates a separate key namespace. Production and
  // shared indexes/counters are never eligible for cleanup.
  if (!/^toyboxes:test-[a-f0-9]{32}:$/.test(prefix)) {
    throw new Error('Cleanup requires an isolated test prefix with a 128-bit run id');
  }
  return prefix;
}

interface CleanupStore {
  scan(cursor: string, options: { match: string; count: number }): Promise<[string | number, string[]]>;
  del(...keys: string[]): Promise<unknown>;
}

export async function cleanOwnedTestKeys(store: CleanupStore, prefix: string): Promise<number> {
  const owned = ownedTestPrefix(prefix);
  const keys = new Set<string>();
  let cursor = '0';
  for (let pass = 0; pass < 1000; pass++) {
    const [next, batch] = await store.scan(cursor, { match: `${owned}*`, count: 1000 });
    for (const key of batch) {
      if (!key.startsWith(owned)) throw new Error('Cleanup returned a key outside this test run');
      keys.add(key);
    }
    cursor = String(next);
    if (cursor === '0') {
      for (const key of keys) await store.del(key);
      return keys.size;
    }
  }
  throw new Error('Cleanup scan exceeded its bound; nothing deleted');
}
