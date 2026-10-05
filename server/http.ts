// Minimal request/response plumbing shared by the Vercel functions.

import { z } from 'zod';
import { getStore } from './store.js';

export interface Req {
  method?: string;
  url?: string;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}

export interface Res {
  status(code: number): Res;
  json(body: unknown): Res;
  setHeader(name: string, value: string | string[]): unknown;
  end(): unknown;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function clientIp(req: Req): string {
  const fwd = first(req.headers['x-forwarded-for']) ?? '';
  return fwd.split(',')[0].trim() || first(req.headers['x-real-ip']) || 'unknown';
}

export function header(req: Req, name: string): string | undefined {
  return first(req.headers[name.toLowerCase()]);
}

export function parseBody<T>(req: Req, schema: z.ZodType<T>): T {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      throw new ApiError(400, 'bad_json', 'Request body is not JSON');
    }
  }
  const r = schema.safeParse(body ?? {});
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new ApiError(400, 'invalid', `${issue.path.join('.') || 'body'}: ${issue.message}`);
  }
  return r.data;
}

export function parseQuery<T>(req: Req, schema: z.ZodType<T>): T {
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.query ?? {})) flat[k] = first(v);
  const r = schema.safeParse(flat);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new ApiError(400, 'invalid', `${issue.path.join('.')}: ${issue.message}`);
  }
  return r.data;
}

/**
 * Fixed-window limit. Throws 429 once `max` hits land inside `windowSec`.
 * `peek` checks without counting, for limits that only count failures.
 */
export async function limit(key: string, max: number, windowSec: number, message: string, peek = false): Promise<void> {
  const store = getStore();
  let n: number;
  if (peek) n = ((await store.get<number>(`rl:${key}`)) ?? 0) + 1;
  else n = await store.incr(`rl:${key}`, windowSec);
  if (n > max) {
    const ttl = await store.ttl(`rl:${key}`);
    throw new ApiError(429, 'rate_limited', message, { retryAfter: Math.max(1, ttl) });
  }
}

export async function countFailure(key: string, windowSec: number): Promise<number> {
  return getStore().incr(`rl:${key}`, windowSec);
}

export async function clearFailures(key: string): Promise<void> {
  await getStore().del(`rl:${key}`);
}

type Handler = (req: Req, res: Res) => Promise<unknown>;

/** Wraps a handler with JSON errors and no-store caching. */
export function route(methods: Record<string, Handler>) {
  return async function handler(req: Req, res: Res): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    const fn = methods[req.method ?? 'GET'];
    if (!fn) {
      res.setHeader('Allow', Object.keys(methods).join(', '));
      res.status(405).json({ error: 'Method not allowed', code: 'method' });
      return;
    }
    try {
      const out = await fn(req, res);
      if (out !== undefined) res.status(200).json(out);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429 && typeof err.extra.retryAfter === 'number') res.setHeader('Retry-After', String(err.extra.retryAfter));
        res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
        return;
      }
      console.error('api error', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Something went wrong on our side', code: 'server' });
    }
  };
}
