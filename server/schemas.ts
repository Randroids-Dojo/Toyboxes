// Request validation for the API.

import { z } from 'zod';
import {
  MAX_AREAS,
  MAX_PAGE_TEXT,
  MAX_PROPS,
  MAX_SKETCH_POINTS,
  MAX_STROKES,
  PROP_KINDS,
  ROOM,
  SKETCH_COLORS,
  SKETCH_WIDTHS,
  SLOT_COUNT,
  TRIM_COLORS,
  WALL_COLORS,
  FLOOR_COLORS,
  isSafeUrl,
} from '../src/shared/model.js';

export const browserId = z.string().regex(/^[a-zA-Z0-9_-]{16,64}$/, 'bad browser id');
export const roomId = z.string().regex(/^[a-zA-Z0-9_-]{6,32}$/, 'bad room id');
export const pageId = z.string().regex(/^[a-zA-Z0-9_-]{6,32}$/, 'bad page id');
export const pin = z.string().regex(/^\d{4}$/, 'PIN must be four digits');
export const name = z.string().min(1).max(64);
export const rev = z.number().int().min(0).max(1e9);
export const slot = z.number().int().min(0).max(SLOT_COUNT - 1);

const coord = z.number().finite().min(-50).max(50);

export const theme = z.object({
  wall: z.number().int().min(0).max(WALL_COLORS.length - 1),
  floor: z.number().int().min(0).max(FLOOR_COLORS.length - 1),
  trim: z.number().int().min(0).max(TRIM_COLORS.length - 1),
});

export const prop = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,24}$/),
  kind: z.enum(PROP_KINDS as [string, ...string[]]).transform((k) => k as (typeof PROP_KINDS)[number]),
  x: z.number().finite().min(-ROOM.halfW).max(ROOM.halfW),
  z: z.number().finite().min(-ROOM.halfD).max(ROOM.halfD),
  rot: z.number().finite().min(-100).max(100),
});

export const layout = z.array(prop).max(MAX_PROPS);

export const stroke = z.object({
  c: z.number().int().min(0).max(SKETCH_COLORS.length - 1),
  w: z.number().int().min(0).max(SKETCH_WIDTHS.length - 1),
  p: z
    .array(z.number().int().min(0).max(1000))
    .min(2)
    .max(MAX_SKETCH_POINTS * 2)
    .refine((a) => a.length % 2 === 0, 'points must be x,y pairs'),
});

export const sketch = z
  .array(stroke)
  .max(MAX_STROKES)
  .refine((s) => s.reduce((n, st) => n + st.p.length / 2, 0) <= MAX_SKETCH_POINTS, 'sketch is too detailed');

export const pageText = z
  .string()
  .max(MAX_PAGE_TEXT)
  .refine((t) => t.trim().length > 0, 'Write a few words describing the idea');

const url = z.string().max(400).refine(isSafeUrl, 'URL must be https or a site path');

export const exhibit = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,24}$/),
  title: z.string().trim().min(1).max(40),
  blurb: z.string().max(140),
  url,
  area: z.string().regex(/^(main|[a-zA-Z0-9_-]{1,24})$/),
  x: coord,
  z: coord,
  rot: z.number().finite().min(-100).max(100),
  color: z.number().int().min(0).max(TRIM_COLORS.length - 1),
  pages: z.array(pageId).max(MAX_STROKES),
  published: z.boolean(),
});

export const experience = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('kart'), track: z.array(z.number().finite()).min(40).max(2000), laps: z.number().int().min(1).max(9) }),
  z.object({ kind: z.literal('casino') }),
]);

export const area = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,24}$/),
  name: z.string().trim().min(1).max(30),
  theme,
  props: layout,
  published: z.boolean(),
  experience: experience.nullable().optional(),
  pages: z.array(pageId).max(60).optional(),
});

export const content = z.object({
  rev,
  areas: z.array(area).max(MAX_AREAS),
  exhibits: z.array(exhibit).max(24),
});
