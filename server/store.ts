// Key-value storage behind the API.
//
// Production uses the shared Upstash Redis store attached to the Vercel project.
// Tests and local `npm run dev` use an in-memory store with the same semantics,
// so the claim race, compare-and-set and rate limits behave identically.
//
// Values are JSON strings. Every key is prefixed by `keyPrefix()` so the shared
// store stays tidy and preview deployments never touch production rooms.

import { Redis } from '@upstash/redis';

export interface Store {
  get<T>(key: string): Promise<T | null>;
  mget<T>(keys: string[]): Promise<(T | null)[]>;
  set(key: string, value: unknown, opts?: { nx?: boolean; ex?: number }): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  /** Increment a counter, starting its expiry window on the first hit. */
  incr(key: string, windowSec?: number): Promise<number>;
  ttl(key: string): Promise<number>;
  /**
   * Replace a JSON object only if its `rev` field still equals `expectedRev`
   * (a missing key counts as rev 0). Returns the stored value on conflict.
   */
  cas<T extends { rev: number }>(key: string, expectedRev: number, value: T): Promise<{ ok: true } | { ok: false; current: T | null }>;
  zadd(key: string, score: number, member: string): Promise<void>;
  zrem(key: string, member: string): Promise<void>;
  /** Members by descending score. */
  zrevrange(key: string, start: number, stop: number): Promise<string[]>;
  /** Members by ascending score. */
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zcard(key: string): Promise<number>;
  /** Push to the head of a list and trim it to `max` entries. */
  lpush(key: string, value: unknown, max: number): Promise<void>;
  lrange<T>(key: string, start: number, stop: number): Promise<T[]>;
}

export function keyPrefix(): string {
  const env = process.env.VERCEL_ENV;
  if (env === 'production') return 'toyboxes:v1:';
  return `toyboxes:${env || 'dev'}:v1:`;
}

// ---------------------------------------------------------------------------
// Upstash

const CAS_SCRIPT = `
local cur = redis.call('GET', KEYS[1])
local rev = 0
if cur then
  local ok, obj = pcall(cjson.decode, cur)
  if ok and type(obj) == 'table' and obj.rev then rev = tonumber(obj.rev) end
end
if rev ~= tonumber(ARGV[1]) then
  if cur then return {0, cur} end
  return {0, ''}
end
redis.call('SET', KEYS[1], ARGV[2])
return {1, ''}
`;

function parse<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export class UpstashStore implements Store {
  constructor(private readonly r: Redis, private readonly prefix: string) {}

  private k(key: string): string {
    return this.prefix + key;
  }

  async get<T>(key: string): Promise<T | null> {
    return parse<T>(await this.r.get<string>(this.k(key)));
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    const raw = await this.r.mget<(string | null)[]>(...keys.map((k) => this.k(k)));
    return raw.map((v) => parse<T>(v));
  }

  async set(key: string, value: unknown, opts: { nx?: boolean; ex?: number } = {}): Promise<boolean> {
    const body = JSON.stringify(value);
    let res: unknown;
    if (opts.nx && opts.ex) res = await this.r.set(this.k(key), body, { nx: true, ex: opts.ex });
    else if (opts.nx) res = await this.r.set(this.k(key), body, { nx: true });
    else if (opts.ex) res = await this.r.set(this.k(key), body, { ex: opts.ex });
    else res = await this.r.set(this.k(key), body);
    return res === 'OK';
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.r.del(...keys.map((k) => this.k(k)));
  }

  async incr(key: string, windowSec?: number): Promise<number> {
    const n = await this.r.incr(this.k(key));
    if (windowSec && n === 1) await this.r.expire(this.k(key), windowSec);
    return n;
  }

  async ttl(key: string): Promise<number> {
    return this.r.ttl(this.k(key));
  }

  async cas<T extends { rev: number }>(key: string, expectedRev: number, value: T): Promise<{ ok: true } | { ok: false; current: T | null }> {
    const res = (await this.r.eval(CAS_SCRIPT, [this.k(key)], [String(expectedRev), JSON.stringify(value)])) as [number, string];
    if (Number(res[0]) === 1) return { ok: true };
    return { ok: false, current: parse<T>(res[1]) };
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    await this.r.zadd(this.k(key), { score, member });
  }

  async zrem(key: string, member: string): Promise<void> {
    await this.r.zrem(this.k(key), member);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.r.zrange<string[]>(this.k(key), start, stop, { rev: true });
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.r.zrange<string[]>(this.k(key), start, stop);
  }

  async zcard(key: string): Promise<number> {
    return this.r.zcard(this.k(key));
  }

  async lpush(key: string, value: unknown, max: number): Promise<void> {
    const k = this.k(key);
    await this.r.lpush(k, JSON.stringify(value));
    await this.r.ltrim(k, 0, max - 1);
  }

  async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const raw = await this.r.lrange<string>(this.k(key), start, stop);
    return raw.map((v) => parse<T>(v)).filter((v): v is NonNullable<typeof v> => v !== null) as T[];
  }
}

// ---------------------------------------------------------------------------
// In memory (tests and local dev)

interface Entry {
  value: unknown;
  expires: number;
}

export class MemoryStore implements Store {
  private data = new Map<string, Entry>();
  /** Lets tests advance time without sleeping. */
  now: () => number = () => Date.now();

  private live(key: string): Entry | undefined {
    const e = this.data.get(key);
    if (!e) return undefined;
    if (e.expires && e.expires <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return e;
  }

  private tick(): Promise<void> {
    // Yield like a network call so concurrent requests interleave in tests.
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  async get<T>(key: string): Promise<T | null> {
    await this.tick();
    const e = this.live(key);
    return e ? (JSON.parse(e.value as string) as T) : null;
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    await this.tick();
    return keys.map((k) => {
      const e = this.live(k);
      return e ? (JSON.parse(e.value as string) as T) : null;
    });
  }

  async set(key: string, value: unknown, opts: { nx?: boolean; ex?: number } = {}): Promise<boolean> {
    await this.tick();
    if (opts.nx && this.live(key)) return false;
    this.data.set(key, { value: JSON.stringify(value), expires: opts.ex ? this.now() + opts.ex * 1000 : 0 });
    return true;
  }

  async del(...keys: string[]): Promise<void> {
    await this.tick();
    for (const k of keys) this.data.delete(k);
  }

  async incr(key: string, windowSec?: number): Promise<number> {
    await this.tick();
    const e = this.live(key);
    const n = (e ? Number(JSON.parse(e.value as string)) : 0) + 1;
    this.data.set(key, { value: JSON.stringify(n), expires: e ? e.expires : windowSec ? this.now() + windowSec * 1000 : 0 });
    return n;
  }

  async ttl(key: string): Promise<number> {
    await this.tick();
    const e = this.live(key);
    if (!e) return -2;
    if (!e.expires) return -1;
    return Math.ceil((e.expires - this.now()) / 1000);
  }

  async cas<T extends { rev: number }>(key: string, expectedRev: number, value: T): Promise<{ ok: true } | { ok: false; current: T | null }> {
    await this.tick();
    const e = this.live(key);
    const cur = e ? (JSON.parse(e.value as string) as T) : null;
    const rev = cur?.rev ?? 0;
    if (rev !== expectedRev) return { ok: false, current: cur };
    this.data.set(key, { value: JSON.stringify(value), expires: 0 });
    return { ok: true };
  }

  private zset(key: string): Map<string, number> {
    const e = this.live(key);
    if (e) return e.value as Map<string, number>;
    const m = new Map<string, number>();
    this.data.set(key, { value: m, expires: 0 });
    return m;
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    await this.tick();
    this.zset(key).set(member, score);
  }

  async zrem(key: string, member: string): Promise<void> {
    await this.tick();
    this.zset(key).delete(member);
  }

  private sorted(key: string, desc: boolean): string[] {
    const arr = [...this.zset(key).entries()].sort((a, b) => (a[1] - b[1]) || (a[0] < b[0] ? -1 : 1));
    if (desc) arr.reverse();
    return arr.map(([m]) => m);
  }

  private slice<T>(arr: T[], start: number, stop: number): T[] {
    const end = stop < 0 ? arr.length + stop + 1 : stop + 1;
    return arr.slice(start, end);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    await this.tick();
    return this.slice(this.sorted(key, true), start, stop);
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    await this.tick();
    return this.slice(this.sorted(key, false), start, stop);
  }

  async zcard(key: string): Promise<number> {
    await this.tick();
    return this.zset(key).size;
  }

  async lpush(key: string, value: unknown, max: number): Promise<void> {
    await this.tick();
    const e = this.live(key);
    const list = e ? (e.value as string[]) : [];
    list.unshift(JSON.stringify(value));
    list.length = Math.min(list.length, max);
    this.data.set(key, { value: list, expires: 0 });
  }

  async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    await this.tick();
    const e = this.live(key);
    const list = e ? (e.value as string[]) : [];
    return this.slice(list, start, stop).map((v) => JSON.parse(v) as T);
  }
}

// ---------------------------------------------------------------------------

let store: Store | null = null;

export function getStore(): Store {
  if (store) return store;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    store = new UpstashStore(new Redis({ url, token, automaticDeserialization: false }), keyPrefix());
  } else if (process.env.VERCEL) {
    throw new Error('Storage is not configured');
  } else {
    store = new MemoryStore();
  }
  return store;
}

/** Tests swap in a fresh store. */
export function setStore(s: Store | null): void {
  store = s;
}
