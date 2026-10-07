// The Grand Prix soundtrack, as data for the kit's sequencer. Each circuit
// has its own song with a 'final' section a semitone up with a counter
// melody for the last lap; the paddock has a lazy shuffle.

import type { Song, Track } from '../kit';
import type { HomeId } from '../../shared/kart/circuits';

/** The same tracks a semitone up, with an extra line on top: the final lap. */
function lift(tracks: Track[], extra: Track[]): Track[] {
  return [...tracks.map((t) => (['kick', 'snare', 'clap', 'hat', 'openhat', 'shaker', 'tom', 'rim', 'crash', 'snap'].includes(t.voice) ? t : { ...t, transpose: (t.transpose ?? 0) + 1 })), ...extra];
}

const PADDOCK: Song = {
  name: 'kart-paddock',
  bpm: 100,
  swing: 0.22,
  space: 0.35,
  gain: 0.75,
  sections: [
    {
      name: 'a',
      bars: 4,
      tracks: [
        { voice: 'kick', pattern: 'x.......x.......' },
        { voice: 'snare', pattern: '....x.......x..o', gain: 0.5 },
        { voice: 'hat', pattern: 'x.x.x.x.x.x.x.x.', gain: 0.35 },
        { voice: 'bass', pattern: 'F2 . A2 . C3 . A2 . Bb2 . D3 . F3 . D3 . C3 . E3 . G3 . E3 . F2 . C3 . F2 . C2 .', every: 2 },
        { voice: 'piano', pattern: 'Fmaj7 Bbmaj7 C7 F', every: 16, octave: 4, gain: 0.45 },
        { voice: 'lead', pattern: 'C5 - A4 - F4 - G4 A4 Bb4 - D5 - C5 - - - E5 - D5 - C5 - Bb4 - A4 - G4 - F4 - - -', every: 2, gain: 0.32, layer: 'whistle' },
      ],
    },
  ],
};

const BLOCKS_A: Track[] = [
  { voice: 'kick', pattern: 'x...x...x...x...' },
  { voice: 'clap', pattern: '....x.......x...', gain: 0.6 },
  { voice: 'hat', pattern: '..x...x...x...x.', gain: 0.35 },
  { voice: 'square', pattern: 'C2 C3 C2 C3 C2 C3 G2 B2 A1 A2 A1 A2 A1 A2 E2 G2 F1 F2 F1 F2 F1 F2 C2 E2 G1 G2 G1 G2 G1 G2 B1 D2', every: 2, gain: 0.5 },
  { voice: 'pluck', pattern: 'C Am F G', every: 16, octave: 4, gain: 0.35 },
  { voice: 'bell', pattern: 'E5 G5 C6 G5 E5 - D5 - C5 E5 A5 E5 C5 - B4 - A4 C5 F5 C5 A4 - G4 A4 B4 D5 G5 D5 B4 - G4 -', every: 2, gain: 0.4 },
];
const BLOCKS_B: Track[] = [
  { voice: 'kick', pattern: 'x...x...x...x...' },
  { voice: 'clap', pattern: '....x.......x...', gain: 0.6 },
  { voice: 'hat', pattern: 'x.x.x.x.x.x.x.x.', gain: 0.4 },
  { voice: 'square', pattern: 'F1 F2 F1 F2 G1 G2 G1 G2 E2 E3 E2 E3 A1 A2 A1 A2 F1 F2 F1 F2 G1 G2 G1 G2 C2 C3 C2 C3 C2 G2 C3 .', every: 2, gain: 0.5 },
  { voice: 'pluck', pattern: 'F G Em Am F G C C', every: 8, octave: 4, gain: 0.35 },
  { voice: 'bell', pattern: 'A5 - G5 - F5 - E5 - D5 E5 F5 - E5 - C5 - A4 - C5 - D5 - E5 - G5 - - - C6 - - -', every: 2, gain: 0.4 },
];

const BLOCK_TOWN: Song = {
  name: 'kart-blocktown',
  bpm: 150,
  space: 0.25,
  gain: 0.7,
  order: ['a', 'b'],
  sections: [
    { name: 'a', bars: 4, tracks: BLOCKS_A },
    { name: 'b', bars: 4, tracks: BLOCKS_B },
    { name: 'final', bars: 4, tracks: lift(BLOCKS_A, [{ voice: 'brass', pattern: 'C5 - - - E5 - - - A4 - - - C5 - - - F4 - - - A4 - - - G4 - B4 - D5 - - -', every: 2, gain: 0.3 }, { voice: 'openhat', pattern: '..x...x...x...x.', gain: 0.3 }]) },
  ],
};

const PICNIC_A: Track[] = [
  { voice: 'kick', pattern: 'x.....x.x.......' },
  { voice: 'rim', pattern: '....x.......x...', gain: 0.6 },
  { voice: 'shaker', pattern: 'xoxoxoxoxoxoxoxo', gain: 0.35 },
  { voice: 'bass', pattern: 'G2 . . G2 B2 . D3 . C3 . . C3 E3 . G3 . D3 . . D3 F#3 . A3 . G2 . D3 . G2 . . .', every: 2, gain: 0.6 },
  { voice: 'pluck', pattern: '[G3 B3 D4] . [G3 B3 D4] [G3 B3 D4] . [G3 B3 D4] . [G3 B3 D4] [C4 E4 G4] . [C4 E4 G4] [C4 E4 G4] . [C4 E4 G4] . [C4 E4 G4] [D4 F#4 A4] . [D4 F#4 A4] [D4 F#4 A4] . [D4 F#4 A4] . [D4 F#4 A4] [G3 B3 D4] . [G3 B3 D4] [G3 B3 D4] . [G3 B3 D4] . .', every: 2, gain: 0.32 },
  { voice: 'lead', pattern: 'D5 - B4 - G4 A4 B4 - E5 - C5 - A4 - G4 - F#4 - A4 - D5 - C5 B4 A4 - G4 - - - - -', every: 2, gain: 0.3 },
];
const LEMONADE: Song = {
  name: 'kart-picnic',
  bpm: 140,
  space: 0.3,
  gain: 0.7,
  sections: [
    { name: 'a', bars: 4, tracks: PICNIC_A },
    { name: 'final', bars: 4, tracks: lift(PICNIC_A, [{ voice: 'marimba', pattern: 'G5 D5 B4 D5 G5 D5 B4 D5 E5 C5 G4 C5 E5 C5 G4 C5 F#5 D5 A4 D5 F#5 D5 A4 D5 G5 D5 B4 G4 D5 B4 G4 D4', every: 2, gain: 0.3 }]) },
  ],
};

const TIDE_A: Track[] = [
  { voice: 'kick', pattern: 'x.......x.x.....' },
  { voice: 'snare', pattern: '....x.......x...', gain: 0.6 },
  { voice: 'hat', pattern: 'x.xxx.xxx.xxx.xx', gain: 0.3 },
  { voice: 'tom', pattern: '..............xx', gain: 0.4 },
  { voice: 'bass', pattern: 'E2 E2 E2 E2 E2 E2 G2 A2 C2 C2 C2 C2 C2 C2 D2 E2 G2 G2 G2 G2 G2 G2 A2 B2 D2 D2 D2 D2 B1 B1 D2 D#2', every: 2, gain: 0.55 },
  { voice: 'acid', pattern: 'E4 - G4 B4 - A4 G4 - E4 - D4 E4 - - - - C5 - B4 A4 - G4 E4 - G4 - A4 B4 - - - -', every: 2, gain: 0.25 },
  { voice: 'marimba', pattern: 'Em C G D', every: 16, octave: 4, gain: 0.3 },
];
const TIDE: Song = {
  name: 'kart-cove',
  bpm: 132,
  space: 0.45,
  gain: 0.7,
  sections: [
    { name: 'a', bars: 4, tracks: TIDE_A },
    { name: 'final', bars: 4, tracks: lift(TIDE_A, [{ voice: 'brass', pattern: 'B4 - - - G4 - - - C5 - - - B4 - - - D5 - - - B4 - - - A4 - - - F#4 - - -', every: 2, gain: 0.28 }]) },
  ],
};

const NIGHT_A: Track[] = [
  { voice: 'kick', pattern: 'x...x...x...x...' },
  { voice: 'snare', pattern: '....x.......x...', gain: 0.55 },
  { voice: 'hat', pattern: '..x...x...x...x.', gain: 0.3 },
  { voice: 'sub', pattern: 'A1 A1 A2 A1 A1 A1 A2 A1 F1 F1 F2 F1 F1 F1 F2 F1 C2 C2 C3 C2 C2 C2 C3 C2 G1 G1 G2 G1 G1 G1 G2 G1', every: 2, gain: 0.55 },
  { voice: 'pad', pattern: 'Am F C G', every: 16, octave: 3, gain: 0.35 },
  { voice: 'glass', pattern: 'A5 E5 C5 E5 A5 E5 C5 E5 F5 C5 A4 C5 F5 C5 A4 C5 G5 E5 C5 E5 G5 E5 C5 E5 G5 D5 B4 D5 G5 D5 B4 D5', every: 2, gain: 0.25 },
];
const NIGHTLIGHT: Song = {
  name: 'kart-bedroom',
  bpm: 160,
  space: 0.55,
  gain: 0.7,
  sections: [
    { name: 'a', bars: 4, tracks: NIGHT_A },
    { name: 'final', bars: 4, tracks: lift(NIGHT_A, [{ voice: 'lead', pattern: 'E5 - - - C5 - - - A4 - C5 - E5 - - - F5 - - - E5 - - - D5 - - - B4 - - -', every: 2, gain: 0.26 }]) },
  ],
};

export const SONGS: Record<HomeId | 'paddock', Song> = {
  paddock: PADDOCK,
  blocktown: BLOCK_TOWN,
  sketch: BLOCK_TOWN,
  picnic: LEMONADE,
  cove: TIDE,
  bedroom: NIGHTLIGHT,
};

export const ALL_SONGS: Song[] = [PADDOCK, BLOCK_TOWN, LEMONADE, TIDE, NIGHTLIGHT];
