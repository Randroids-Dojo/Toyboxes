// Browser-only memory: nickname, anonymous browser id, settings, return spot
// and unsaved sketchbook drafts. Shared rooms live on the server, never here.

import type { Stroke } from '../shared/model';

const NS = 'toyboxes.';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(NS + key);
  } catch {
    // Storage can be unavailable in private modes. Nothing to clean up then.
  }
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 26);
}

export interface Identity {
  browserId: string;
  name: string | null;
}

export function identity(): Identity {
  const cur = read<Identity>('identity');
  if (cur && typeof cur.browserId === 'string' && cur.browserId.length >= 16) return cur;
  const fresh: Identity = { browserId: randomId(), name: null };
  write('identity', fresh);
  return fresh;
}

export function setName(name: string): void {
  write('identity', { ...identity(), name });
}

/** A room this browser claimed or unlocked, used to offer rename propagation. */
export interface MyRoom {
  roomId: string;
  slot: number;
}

export function myRoom(): MyRoom | null {
  return read<MyRoom>('myRoom');
}

export function setMyRoom(r: MyRoom | null): void {
  if (r) write('myRoom', r);
  else remove('myRoom');
}

export type Quality = 'auto' | 'low' | 'medium' | 'high';
export type TimeMode = 'cycle' | 'day' | 'sunset' | 'night';

export interface Settings {
  volume: number;
  lookSpeed: number;
  invertY: boolean;
  autoCamera: boolean;
  quality: Quality;
  reduceMotion: boolean;
  time: TimeMode;
  touchControls: 'auto' | 'show' | 'hide';
  largeText: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.7,
  lookSpeed: 1,
  invertY: false,
  autoCamera: true,
  quality: 'auto',
  reduceMotion: false,
  time: 'cycle',
  touchControls: 'auto',
  largeText: false,
};

export function settings(): Settings {
  return { ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>('settings') ?? {}) };
}

export function saveSettings(s: Settings): void {
  write('settings', s);
}

/** Where to put the player back after visiting an arcade or a published game. */
export interface ReturnSpot {
  space: 'hub' | 'room' | 'area';
  roomId?: string;
  areaId?: string;
  x: number;
  z: number;
  yaw: number;
  at: number;
}

export function returnSpot(): ReturnSpot | null {
  const r = read<ReturnSpot>('return');
  if (!r || Date.now() - r.at > 6 * 3600 * 1000) return null;
  return r;
}

export function setReturnSpot(r: ReturnSpot | null): void {
  if (r) write('return', r);
  else remove('return');
}

export interface Draft {
  text: string;
  sketch: Stroke[];
  /** Server rev the draft started from; 0 for a new page. */
  baseRev: number;
  at: number;
}

export function draft(roomId: string, pageId: string): Draft | null {
  return read<Draft>(`draft.${roomId}.${pageId}`);
}

export function saveDraft(roomId: string, pageId: string, d: Draft): void {
  write(`draft.${roomId}.${pageId}`, d);
}

export function clearDraft(roomId: string, pageId: string): void {
  remove(`draft.${roomId}.${pageId}`);
}

export function seenHint(id: string): boolean {
  return !!read<boolean>(`hint.${id}`);
}

export function markHint(id: string): void {
  write(`hint.${id}`, true);
}
