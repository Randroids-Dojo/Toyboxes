// Little Puffington's music as data for the kit sequencer. The village march
// is played by the band on the bandstand (and heard muffled across town),
// the trials have their own tunes.

import type { Song, Track } from '../../audio/music';

const bars = (...b: string[]) => b.join(' ');

// Oom (tuba on 1 and 3) and pah (chords on 2 and 4), in eighths.
const oom = (root: string, fifth: string) => `${root} . . . ${fifth} . . .`;
const pah = (ch: string) => `. . ${ch} . . . ${ch} .`;

const BB = '[D4 F4 Bb4]';
const EB = '[Eb4 G4 Bb4]';
const F7 = '[Eb4 F4 A4]';
const AB = '[Eb4 Ab4 C5]';
const BB7 = '[D4 F4 Ab4]';

const marchA: Track[] = [
  { voice: 'square', every: 2, gain: 0.32, layer: 'melody', pan: 0.15, pattern: bars('F4 Bb4 D5 Bb4 F5 - D5 -', 'Eb5 - G5 - Eb5 Bb4 G4 -', 'F4 A4 C5 Eb5 D5 - C5 -', 'Bb4 - D5 - Bb4 - . .', 'F4 Bb4 D5 Bb4 F5 - D5 -', 'Eb5 G5 Bb5 G5 Eb5 - C5 -', 'D5 C5 Bb4 A4 C5 - A4 -', 'Bb4 - F4 - Bb4 - . .') },
  { voice: 'brass', every: 4, gain: 0.22, layer: 'counter', pan: -0.2, pattern: bars('D4 F4 Bb4 F4', 'Eb4 G4 Bb4 G4', 'F4 A4 C5 A4', 'Bb4 F4 D4 .', 'D4 F4 Bb4 F4', 'G4 Bb4 Eb5 Bb4', 'F4 Eb4 D4 C4', 'D4 . Bb3 .') },
  { voice: 'tuba', every: 2, gain: 0.7, layer: 'tuba', pattern: bars(oom('Bb1', 'F2'), oom('Eb2', 'Bb1'), oom('F1', 'C2'), oom('Bb1', 'F2'), oom('Bb1', 'F2'), oom('Eb2', 'Bb1'), oom('F1', 'C2'), oom('Bb1', 'F1')) },
  { voice: 'brass', every: 2, gain: 0.14, layer: 'pah', pattern: bars(pah(BB), pah(EB), pah(F7), pah(BB), pah(BB), pah(EB), pah(F7), pah(BB)) },
  { voice: 'kick', pattern: 'x.......x.......', gain: 0.55, layer: 'drums' },
  { voice: 'snare', pattern: '....x.......x...', gain: 0.32, layer: 'drums' },
  { voice: 'hat', pattern: '..x...x...x...x.', gain: 0.12, layer: 'drums' },
  { voice: 'crash', pattern: 'x' + '.'.repeat(127), gain: 0.18, layer: 'drums' },
  { voice: 'bell', every: 4, gain: 0.08, layer: 'glock', pattern: bars('F5 . D6 .', '. G5 . Bb5', 'A5 . C6 .', 'Bb5 . . .', 'F5 . D6 .', '. G5 . Eb6', 'D6 C6 A5 .', 'Bb5 . . .') },
];

const marchB: Track[] = [
  { voice: 'square', every: 2, gain: 0.32, layer: 'melody', pan: 0.15, pattern: bars('G5 - F5 Eb5 Bb4 - G4 -', 'Ab4 C5 Eb5 C5 Ab5 - - .', 'F5 - D5 Bb4 Ab4 - F4 -', 'Eb5 - G5 - Eb5 - . .', 'G5 - F5 Eb5 Bb4 - G4 -', 'C5 Eb5 Ab5 Eb5 C5 - Ab4 -', 'Bb4 D5 F5 D5 Ab5 - F5 -', 'Eb5 - Bb4 - Eb5 - . .') },
  { voice: 'brass', every: 4, gain: 0.22, layer: 'counter', pan: -0.2, pattern: bars('Eb4 G4 Bb4 G4', 'C4 Eb4 Ab4 Eb4', 'D4 F4 Ab4 F4', 'Eb4 Bb3 G3 .', 'Eb4 G4 Bb4 G4', 'Ab3 C4 Eb4 C4', 'F4 D4 Bb3 D4', 'Eb4 . Eb3 .') },
  { voice: 'tuba', every: 2, gain: 0.7, layer: 'tuba', pattern: bars(oom('Eb2', 'Bb1'), oom('Ab1', 'Eb2'), oom('Bb1', 'F2'), oom('Eb2', 'Bb1'), oom('Eb2', 'Bb1'), oom('Ab1', 'Eb2'), oom('Bb1', 'F2'), oom('Eb2', 'Bb1')) },
  { voice: 'brass', every: 2, gain: 0.14, layer: 'pah', pattern: bars(pah(EB), pah(AB), pah(BB7), pah(EB), pah(EB), pah(AB), pah(BB7), pah(EB)) },
  { voice: 'kick', pattern: 'x.......x.......', gain: 0.55, layer: 'drums' },
  { voice: 'snare', pattern: '....x.......x.x.', gain: 0.3, layer: 'drums' },
  { voice: 'hat', pattern: '..x...x...x...x.', gain: 0.12, layer: 'drums' },
  { voice: 'bell', every: 4, gain: 0.08, layer: 'glock', pattern: bars('G5 . Eb6 .', 'C6 . Ab5 .', 'F5 . D6 .', 'Eb6 . . .') },
];

/** "Puffington March": the village tune, an oompah march in B flat. */
export const PUFFINGTON_MARCH: Song = {
  name: 'puffington-march',
  bpm: 104,
  space: 0.45,
  gain: 0.8,
  order: ['a', 'a', 'b', 'a'],
  sections: [
    { name: 'a', bars: 8, tracks: marchA },
    { name: 'b', bars: 8, tracks: marchB },
  ],
};

/** A fast galop for Rocket Rings. */
export const RINGS_GALOP: Song = {
  name: 'rings-galop',
  bpm: 152,
  space: 0.3,
  gain: 0.75,
  sections: [
    {
      name: 'a',
      bars: 8,
      tracks: [
        { voice: 'square', every: 2, gain: 0.28, pattern: bars('C5 E5 G5 E5 C6 - G5 -', 'A5 F5 C5 F5 A5 - F5 -', 'G5 E5 C5 E5 G5 - E5 -', 'D5 F5 B4 D5 G4 - . .', 'C5 E5 G5 E5 C6 - G5 -', 'A5 C6 A5 F5 D5 - F5 -', 'E5 G5 E5 C5 D5 - B4 -', 'C5 - G4 - C5 - . .') },
        { voice: 'tuba', every: 2, gain: 0.6, pattern: bars(oom('C2', 'G1'), oom('F1', 'C2'), oom('C2', 'G1'), oom('G1', 'D2'), oom('C2', 'G1'), oom('D2', 'A1'), oom('G1', 'D2'), oom('C2', 'G1')) },
        { voice: 'brass', every: 2, gain: 0.13, pattern: bars(pah('[E4 G4 C5]'), pah('[F4 A4 C5]'), pah('[E4 G4 C5]'), pah('[D4 F4 B4]'), pah('[E4 G4 C5]'), pah('[D4 F4 A4]'), pah('[D4 G4 B4]'), pah('[E4 G4 C5]')) },
        { voice: 'kick', pattern: 'x...x...x...x...', gain: 0.5 },
        { voice: 'snare', pattern: '..x...x...x...x.', gain: 0.28 },
        { voice: 'hat', pattern: 'xxxxxxxxxxxxxxxx', gain: 0.07 },
      ],
    },
  ],
};

/** A tiptoe pizzicato for the library, with a tension layer. */
export const LIBRARY_TIPTOE: Song = {
  name: 'library-tiptoe',
  bpm: 84,
  space: 0.55,
  gain: 0.7,
  off: ['tension'],
  sections: [
    {
      name: 'a',
      bars: 4,
      tracks: [
        { voice: 'pluck', every: 2, gain: 0.3, pattern: bars('D4 . F4 . A4 . F4 .', 'E4 . G4 . Bb4 . G4 .', 'D4 . F4 . A4 . D5 .', 'C#5 . A4 . E4 . A4 .') },
        { voice: 'bass', every: 4, gain: 0.32, pattern: bars('D2 A1 D2 F2', 'C2 G1 C2 E2', 'Bb1 F2 Bb1 D2', 'A1 E2 A1 C#2') },
        { voice: 'rim', pattern: 'x...x...x...x...', gain: 0.12 },
        { voice: 'pad', every: 16, gain: 0.12, layer: 'tension', pattern: 'Dm Gm Bb A7' },
        { voice: 'kick', pattern: 'x..x............', gain: 0.35, layer: 'tension' },
      ],
    },
  ],
};

/** A breezy waltz for Picnic Panic (patterns of 12 steps make three beats). */
export const PICNIC_WALTZ: Song = {
  name: 'picnic-waltz',
  bpm: 132,
  space: 0.4,
  gain: 0.7,
  sections: [
    {
      name: 'a',
      bars: 12,
      tracks: [
        { voice: 'organ', every: 4, gain: 0.22, pattern: bars('E5 - G5', 'C6 - G5', 'F5 - A5', 'C6 - A5', 'D5 - F5', 'B5 - G5', 'C6 - -', 'G5 - -', 'E5 - G5', 'C6 - E6', 'D6 - B5', 'C6 - -', 'A5 - C6', 'F5 - A5', 'G5 F5 D5', 'C5 - -') },
        { voice: 'bass', every: 4, gain: 0.4, pattern: bars('C3 . .', 'C3 . .', 'F2 . .', 'F2 . .', 'G2 . .', 'G2 . .', 'C3 . .', 'C3 . .') },
        { voice: 'piano', every: 4, gain: 0.12, pattern: bars('. [E4 G4] [E4 G4]', '. [E4 G4] [E4 G4]', '. [F4 A4] [F4 A4]', '. [F4 A4] [F4 A4]', '. [F4 B4] [F4 B4]', '. [F4 B4] [F4 B4]', '. [E4 G4] [E4 G4]', '. [E4 G4] [E4 G4]') },
        { voice: 'shaker', pattern: 'x...x...x...', gain: 0.1 },
      ],
    },
  ],
};
