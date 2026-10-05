// PIN hashing, signed tokens and browser keys.

import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

function scrypt(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(secret, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export interface PinRecord {
  salt: string;
  hash: string;
  /** Bumped on every PIN change so older edit tokens stop working. */
  epoch: number;
  setAt: number;
  setBy: 'owner' | 'admin';
}

export function secret(): string {
  const s = process.env.TOYBOXES_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.VERCEL) throw new Error('TOYBOXES_SECRET is not configured');
  return 'local-dev-secret-not-for-production';
}

export async function hashPin(pin: string, epoch: number, setBy: PinRecord['setBy']): Promise<PinRecord> {
  const salt = randomBytes(16);
  const hash = await scrypt(`toyboxes-pin:${pin}`, salt);
  return { salt: salt.toString('base64'), hash: hash.toString('base64'), epoch, setAt: Date.now(), setBy };
}

export async function verifyPin(pin: string, rec: PinRecord): Promise<boolean> {
  const hash = await scrypt(`toyboxes-pin:${pin}`, Buffer.from(rec.salt, 'base64'));
  const want = Buffer.from(rec.hash, 'base64');
  return want.length === hash.length && timingSafeEqual(want, hash);
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

function mac(data: string, purpose: string): Buffer {
  return createHmac('sha256', `${purpose}:${secret()}`).update(data).digest();
}

/** `<base64url(json)>.<base64url(hmac)>`, bound to a purpose so tokens cannot be swapped. */
export function signToken(payload: object, purpose: string): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${b64url(mac(body, purpose))}`;
}

export function verifyToken<T>(token: string | undefined | null, purpose: string): T | null {
  if (!token || typeof token !== 'string' || token.length > 2000) return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1), 'base64url');
  const want = mac(body, purpose);
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

/** Stable, non-reversible key for an anonymous browser id. */
export function browserKey(browserId: string): string {
  return mac(browserId, 'browser').toString('base64url').slice(0, 24);
}

export function newId(bytes = 9): string {
  return randomBytes(bytes).toString('base64url');
}

/** Constant-time string comparison for the admin password. */
export function safeEqual(a: string, b: string): boolean {
  const ha = mac(a, 'compare');
  const hb = mac(b, 'compare');
  return timingSafeEqual(ha, hb);
}
