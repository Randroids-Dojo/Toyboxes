// Admin API access for the autobuild scripts. Reads the password from
// ADMIN_PASSWORD or ~/.config/toyboxes/admin.pass; never prints it.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const BASE = process.env.TOYBOXES_URL ?? 'https://toyboxes.games';

function password(): string {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  return readFileSync(join(homedir(), '.config/toyboxes/admin.pass'), 'utf8').trim();
}

let cookie = '';

async function login(): Promise<void> {
  const r = await fetch(`${BASE}/api/admin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-toyboxes-admin': '1' }, body: JSON.stringify({ action: 'login', password: password() }) });
  if (!r.ok) throw new Error(`Admin sign-in failed (${r.status})`);
  cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
}

export async function admin<T = any>(method: 'GET' | 'POST', query: string, body?: unknown): Promise<T> {
  if (!cookie) await login();
  const r = await fetch(`${BASE}/api/admin${query}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-toyboxes-admin': '1', cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${query || (body as { action?: string })?.action}: ${r.status} ${JSON.stringify(json)}`);
  return json as T;
}
