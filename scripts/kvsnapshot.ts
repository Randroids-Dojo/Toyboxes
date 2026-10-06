// Cleanup only a dedicated test namespace. Legacy production snapshots
// cannot prove ownership and are deliberately unsupported.
//   npx tsx scripts/kvsnapshot.ts clean toyboxes:test-<32 hex run id>:
// The test must use that unique namespace for every key it writes.
import { Redis } from '@upstash/redis';
import { cleanOwnedTestKeys, ownedTestPrefix } from './autobuild/safety';

const [mode, prefix = ''] = process.argv.slice(2);
if (mode !== 'clean') throw new Error('Only isolated test-prefix cleanup is supported');
ownedTestPrefix(prefix); // Reject legacy snapshot files before contacting Redis.
const redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });
const count = await cleanOwnedTestKeys(redis, prefix);
console.log(`Removed ${count} keys owned by this isolated test run`);
