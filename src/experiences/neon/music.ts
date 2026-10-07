// Club Nova's soundtrack as sequencer data: six original songs built from a
// shared arrangement (intro, verse, build, drop, break, outro) and a palette
// of chords, bass, hooks and drums per song. Section lengths come from the
// shared song timing (src/shared/neon/songs.ts) so charts line up exactly.

import type { Song, Track } from '../../audio/music';
import { SONGS, type SongId, type SongMeta } from '../../shared/neon/songs';

interface Palette {
  /** Four chords, one per bar. */
  chords: string;
  /** Bass for four bars (eighths). */
  bass: string;
  /** Hook for four bars (eighths), the lead in drops. */
  hook: string;
  /** Sixteenth arpeggio for one bar per chord (four bars). */
  arp: string;
  /** Extra lead that joins in Glow time (eighths, four bars). */
  glow: string;
  kick?: string;
  hats?: string;
  clap?: string;
  bassVoice?: Track['voice'];
  hookVoice?: Track['voice'];
  padVoice?: Track['voice'];
  arpVoice?: Track['voice'];
  swing?: number;
  space?: number;
}

const FOUR = 'x...x...x...x...';
const OFFHAT = '..x...x...x...x.';
const HATS16 = 'xoxoxoxoxoxoxoxo';
const CLAP = '....x.......x...';
const ROLL = '....x.......x...x...x...x...x...x.x.x.x.x.x.x.x.xxxxxxxxxxxxxxxx';
const FILL = '................................................x.x.x.x.xxxxxxxx';

function tracksFor(kind: string, p: Palette): Track[] {
  const pad: Track = { voice: p.padVoice ?? 'pad', pattern: p.chords, every: 16, gain: 0.5, octave: 3 };
  const bass: Track = { voice: p.bassVoice ?? 'bass', pattern: p.bass, every: 2, gain: 0.85 };
  const kick: Track = { voice: 'kick', pattern: p.kick ?? FOUR };
  const clap: Track = { voice: 'clap', pattern: p.clap ?? CLAP, gain: 0.8 };
  const hat: Track = { voice: 'hat', pattern: p.hats ?? HATS16, gain: 0.7, pan: 0.2 };
  const open: Track = { voice: 'openhat', pattern: OFFHAT, gain: 0.7, pan: -0.15 };
  const arp: Track = { voice: p.arpVoice ?? 'pluck', pattern: p.arp, gain: 0.55, pan: -0.25 };
  const hook: Track = { voice: p.hookVoice ?? 'lead', pattern: p.hook, every: 2, gain: 0.5, pan: 0.1 };
  const glow: Track = { voice: 'bell', pattern: p.glow, every: 2, gain: 0.45, layer: 'glow', pan: 0.3 };
  const crash: Track = { voice: 'crash', pattern: 'x' + '.'.repeat(63), gain: 0.7 };
  const shaker: Track = { voice: 'shaker', pattern: 'x.xxx.xxx.xxx.xx', gain: 0.5 };
  if (kind === 'intro') return [{ ...pad, gain: 0.42 }, { ...hat, gain: 0.45 }, { voice: 'kick', pattern: 'x...............x...x...x...x...' }, { ...arp, gain: 0.35 }];
  if (kind === 'verse') return [kick, clap, hat, bass, { ...pad, gain: 0.38 }, arp, glow];
  if (kind === 'build') return [{ voice: 'snare', pattern: ROLL, gain: 0.6 }, { ...kick, pattern: 'x...x...x...x...x...x...x...x...x...x...x...x...x.x.x.x.x.x.x.x.' }, bass, pad, { ...arp, gain: 0.6 }, glow];
  if (kind === 'drop') return [kick, clap, hat, open, bass, pad, hook, arp, crash, glow, { voice: 'tom', pattern: FILL, gain: 0.5 }];
  if (kind === 'break') return [{ ...pad, gain: 0.55 }, shaker, { voice: 'rim', pattern: '....x.......x...', gain: 0.6 }, { ...bass, gain: 0.5 }, glow];
  if (kind === 'outro') return [kick, { ...hat, gain: 0.5 }, { ...pad, gain: 0.5 }, { ...hook, gain: 0.35 }, crash];
  if (kind === 'tail') return [{ ...pad, pattern: p.chords.split(' ')[0], every: 32, gain: 0.45 }, { voice: 'crash', pattern: 'x' + '.'.repeat(31), gain: 0.6 }];
  // Loop songs: a, b, c.
  if (kind === 'a') return [kick, hat, bass, { ...pad, gain: 0.4 }, arp, glow];
  if (kind === 'b') return [kick, clap, hat, open, bass, pad, hook, glow];
  return [kick, clap, hat, open, bass, pad, arp, { ...hook, gain: 0.4 }, glow];
}

function kindOf(name: string): string {
  return name.replace(/\d+$/, '');
}

const PALETTES: Record<SongId, Palette> = {
  hello: {
    chords: 'Fmaj7 Em7 Dm7 Cmaj7',
    bass: 'F2 . F2 C3 . F2 A2 . E2 . E2 B2 . E2 G2 . D2 . D2 A2 . D2 F2 . C2 . C2 G2 . C2 E2 .',
    hook: 'A4 - C5 - . A4 G4 - E4 - . . G4 - . . F4 - A4 - . F4 E4 - D4 - . . E4 - . .',
    arp: 'F4 A4 C5 E5 A4 C5 E5 C5 E4 G4 B4 D5 G4 B4 D5 B4 D4 F4 A4 C5 F4 A4 C5 A4 C4 E4 G4 B4 E4 G4 B4 G4',
    glow: 'C6 . A5 . . . G5 . B5 . G5 . . . E5 . A5 . F5 . . . D5 . G5 . E5 . . . C5 .',
    kick: 'x.......x.......',
    hats: '..x...x...x...x.',
    clap: '....x.......x...',
    bassVoice: 'sub',
    hookVoice: 'piano',
    padVoice: 'strings',
    arpVoice: 'marimba',
    swing: 0.12,
    space: 0.5,
  },
  lights: {
    chords: 'Dm9 G9 Cmaj7 A7',
    bass: 'D2 D3 D2 D3 D2 D3 C3 D3 G1 G2 G1 G2 G1 G2 A2 B2 C2 C3 C2 C3 C2 C3 E3 C3 A1 A2 A1 A2 A1 A2 C#3 E3',
    hook: 'F4 - A4 C5 . A4 G4 F4 G4 - B4 D5 . B4 A4 G4 E4 - G4 B4 . C5 B4 G4 A4 - C#5 E5 . C#5 A4 G4',
    arp: 'D4 F4 A4 C5 E5 C5 A4 F4 D4 F4 A4 C5 E5 C5 A4 F4 G4 B4 D5 F5 A5 F5 D5 B4 G4 B4 D5 F5 A5 F5 D5 B4 C4 E4 G4 B4 D5 B4 G4 E4 C4 E4 G4 B4 D5 B4 G4 E4 A3 C#4 E4 G4 A4 G4 E4 C#4 A3 C#4 E4 G4 A4 G4 E4 C#4',
    glow: 'A5 . F5 . D5 . F5 . B5 . G5 . D5 . G5 . G5 . E5 . C5 . E5 . E5 . C#5 . A4 . C#5 .',
    hookVoice: 'lead',
    padVoice: 'pad',
  },
  comet: {
    chords: 'Am Fmaj7 C G',
    bass: 'A1 A2 A1 A2 A1 A2 A1 A2 F1 F2 F1 F2 F1 F2 F1 F2 C2 C3 C2 C3 C2 C3 C2 C3 G1 G2 G1 G2 G1 G2 B1 B2',
    hook: 'E5 - - D5 C5 - B4 - C5 - - A4 . . . . G5 - - E5 D5 - C5 - D5 - - B4 . . . .',
    arp: 'A3 C4 E4 A4 E4 C4 A3 C4 E4 A4 E4 C4 A3 C4 E4 A4 F3 A3 C4 F4 C4 A3 F3 A3 C4 F4 C4 A3 F3 A3 C4 F4 C4 E4 G4 C5 G4 E4 C4 E4 G4 C5 G4 E4 C4 E4 G4 C5 G3 B3 D4 G4 D4 B3 G3 B3 D4 G4 D4 B3 G3 B3 D4 G4',
    glow: 'A5 . . . E5 . . . F5 . . . C5 . . . G5 . . . E5 . . . D5 . . . B4 . . .',
    bassVoice: 'acid',
    hookVoice: 'square',
    arpVoice: 'pluck',
    space: 0.3,
  },
  glitter: {
    chords: 'Ebmaj7 Cm7 Abmaj7 Bb',
    bass: 'Eb2 Eb3 . Eb2 Bb2 Eb3 . G2 C2 C3 . C2 G2 C3 . Eb3 Ab1 Ab2 . Ab1 Eb2 Ab2 . C3 Bb1 Bb2 . Bb1 F2 Bb2 D3 F3',
    hook: 'G5 - Bb5 - G5 F5 Eb5 - . C5 Eb5 G5 - F5 Eb5 - C5 - Eb5 - F5 G5 Ab5 - G5 F5 - D5 - Bb4 . .',
    arp: 'Eb5 G5 Bb5 G5 Eb5 G5 Bb5 D6 Eb5 G5 Bb5 G5 Eb5 G5 Bb5 D6 C5 Eb5 G5 Eb5 C5 Eb5 G5 Bb5 C5 Eb5 G5 Eb5 C5 Eb5 G5 Bb5 Ab4 C5 Eb5 C5 Ab4 C5 Eb5 G5 Ab4 C5 Eb5 C5 Ab4 C5 Eb5 G5 Bb4 D5 F5 D5 Bb4 D5 F5 Bb5 Bb4 D5 F5 D5 Bb4 D5 F5 Bb5',
    glow: 'Bb5 . G5 . Eb6 . . . G5 . Eb5 . C6 . . . C6 . Ab5 . Eb6 . . . D6 . Bb5 . F6 . . .',
    hookVoice: 'glass',
    arpVoice: 'bell',
    space: 0.45,
  },
  heart: {
    chords: 'C#m7 Amaj7 E B',
    bass: 'C#2 . C#3 C#2 . C#2 B1 C#2 A1 . A2 A1 . A1 G#1 A1 E2 . E3 E2 . E2 D#2 E2 B1 . B2 B1 . B1 D#2 F#2',
    hook: 'E5 - D#5 - C#5 - B4 - C#5 - - - . . G#4 B4 E5 - D#5 - E5 - F#5 - D#5 - - - . . B4 .',
    arp: 'C#4 E4 G#4 B4 C#5 B4 G#4 E4 C#4 E4 G#4 B4 C#5 B4 G#4 E4 A3 C#4 E4 G#4 A4 G#4 E4 C#4 A3 C#4 E4 G#4 A4 G#4 E4 C#4 E4 G#4 B4 E5 G#5 E5 B4 G#4 E4 G#4 B4 E5 G#5 E5 B4 G#4 B3 D#4 F#4 B4 D#5 B4 F#4 D#4 B3 D#4 F#4 B4 D#5 B4 F#4 D#4',
    glow: 'G#5 . E5 . B5 . . . E5 . C#5 . A5 . . . B5 . G#5 . E6 . . . F#5 . D#5 . B5 . . .',
    hookVoice: 'choir',
    padVoice: 'strings',
    space: 0.4,
  },
  supernova: {
    chords: 'Fm Db Ab Eb',
    bass: 'F1 F2 F1 F2 F1 F2 F1 F2 Db2 Db3 Db2 Db3 Db2 Db3 Db2 Db3 Ab1 Ab2 Ab1 Ab2 Ab1 Ab2 Ab1 Ab2 Eb2 Eb3 Eb2 Eb3 Eb2 Eb3 G2 Bb2',
    hook: 'C5 Ab4 F4 Ab4 C5 - Db5 C5 Bb4 - Ab4 - F4 - Ab4 - C5 Eb5 Ab5 - G5 - Eb5 - Bb4 - Eb5 - G5 - Bb5 -',
    arp: 'F4 Ab4 C5 F5 C5 Ab4 F4 Ab4 C5 F5 C5 Ab4 F4 Ab4 C5 F5 Db4 F4 Ab4 Db5 Ab4 F4 Db4 F4 Ab4 Db5 Ab4 F4 Db4 F4 Ab4 Db5 Ab3 C4 Eb4 Ab4 Eb4 C4 Ab3 C4 Eb4 Ab4 Eb4 C4 Ab3 C4 Eb4 Ab4 Eb4 G4 Bb4 Eb5 Bb4 G4 Eb4 G4 Bb4 Eb5 Bb4 G4 Eb4 G4 Bb4 Eb5',
    glow: 'F6 . C6 . Ab5 . C6 . F6 . Db6 . Ab5 . Db6 . Eb6 . C6 . Ab5 . C6 . G6 . Eb6 . Bb5 . Eb6 .',
    bassVoice: 'acid',
    hookVoice: 'brass',
    arpVoice: 'pluck',
    space: 0.35,
  },
};

/** The music Song for one of Club Nova's songs. `tail` adds two ringing bars at the end (dances); loops repeat. */
export function songData(id: SongId, opts: { variant?: 'swing'; loop?: boolean } = {}): Song {
  const meta: SongMeta = SONGS[id];
  const p = { ...PALETTES[id] };
  if (opts.variant === 'swing') p.swing = 0.28;
  const names = meta.order.map((s) => s.name);
  const sections = meta.order.map((s) => ({ name: s.name, bars: s.bars, tracks: tracksFor(kindOf(s.name), p) }));
  const loop = opts.loop ?? (id === 'hello' || id === 'comet');
  if (!loop) sections.push({ name: 'tail', bars: 2, tracks: tracksFor('tail', p) });
  return {
    name: `nova-${id}${opts.variant ? `-${opts.variant}` : ''}${loop ? '' : '-cut'}`,
    bpm: meta.bpm,
    swing: p.swing,
    order: loop ? names : [...names, 'tail'],
    sections,
    space: p.space ?? 0.35,
    off: ['glow'],
  };
}
