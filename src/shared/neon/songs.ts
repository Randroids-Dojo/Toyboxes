// Club Nova's songs as timing data: tempo, sections and the one tempo change.
// The sounds live in src/experiences/neon/music.ts; this file is shared with
// the server so charts and duel scripts can be scored there too.

export type SongId = 'hello' | 'lights' | 'comet' | 'glitter' | 'heart' | 'supernova';

export interface SongSection {
  name: string;
  bars: number;
}

export interface SongMeta {
  id: SongId;
  name: string;
  bpm: number;
  /** Section play order (names may repeat). */
  order: SongSection[];
  /** A tempo change at the start of this bar. */
  change?: { bar: number; bpm: number };
}

const s = (name: string, bars: number): SongSection => ({ name, bars });

export const SONGS: Record<SongId, SongMeta> = {
  hello: { id: 'hello', name: 'Hello Nova', bpm: 100, order: [s('a', 8), s('b', 8)] },
  lights: {
    id: 'lights',
    name: 'Nova Lights',
    bpm: 110,
    order: [s('intro', 4), s('verse', 8), s('build', 4), s('drop', 8), s('break', 4), s('drop2', 8), s('outro', 4)],
  },
  comet: { id: 'comet', name: 'Comet Chase', bpm: 124, order: [s('intro', 4), s('a', 8), s('b', 8), s('c', 8)] },
  glitter: {
    id: 'glitter',
    name: 'Glitter Gravity',
    bpm: 118,
    order: [s('intro', 4), s('verse', 8), s('build', 4), s('drop', 8), s('break', 4), s('verse2', 8), s('build2', 4), s('drop2', 8), s('outro', 4)],
  },
  heart: {
    id: 'heart',
    name: 'Neon Heart',
    bpm: 128,
    order: [s('intro', 4), s('verse', 8), s('build', 4), s('drop', 8), s('break', 4), s('verse2', 8), s('build2', 4), s('drop2', 8), s('outro', 4)],
  },
  supernova: {
    id: 'supernova',
    name: 'Supernova',
    bpm: 132,
    order: [s('intro', 4), s('verse', 8), s('build', 4), s('drop', 8), s('break', 4), s('build2', 4), s('drop2', 8), s('drop3', 8), s('outro', 4)],
    change: { bar: 28, bpm: 140 },
  },
};

export function totalBars(song: SongMeta): number {
  return song.order.reduce((n, sec) => n + sec.bars, 0);
}

/** Seconds from the song's first beat to `beat`, through the tempo change. */
export function beatToSec(song: SongMeta, beat: number): number {
  const c = song.change;
  if (!c || beat <= c.bar * 4) return (beat * 60) / song.bpm;
  return (c.bar * 4 * 60) / song.bpm + ((beat - c.bar * 4) * 60) / c.bpm;
}

export function secToBeat(song: SongMeta, sec: number): number {
  const c = song.change;
  const edge = c ? (c.bar * 4 * 60) / song.bpm : Infinity;
  if (!c || sec <= edge) return (sec * song.bpm) / 60;
  return c.bar * 4 + ((sec - edge) * c.bpm) / 60;
}

/** Tempo at a beat. */
export function bpmAt(song: SongMeta, beat: number): number {
  return song.change && beat >= song.change.bar * 4 ? song.change.bpm : song.bpm;
}

/** Length in seconds. */
export function songSeconds(song: SongMeta): number {
  return beatToSec(song, totalBars(song) * 4);
}

/** The section playing at a bar, with the bar it starts on. */
export function sectionAt(song: SongMeta, bar: number): { section: SongSection; index: number; start: number } | null {
  let start = 0;
  for (let i = 0; i < song.order.length; i++) {
    const sec = song.order[i];
    if (bar < start + sec.bars) return { section: sec, index: i, start };
    start += sec.bars;
  }
  return null;
}
