import { describe, expect, it } from 'vitest';
import { chordNotes, noteNumber, parsePattern, songProblem, type Song } from '../src/audio/music';

describe('music patterns', () => {
  it('reads note and chord names', () => {
    expect(noteNumber('A4')).toBe(69);
    expect(noteNumber('C4')).toBe(60);
    expect(noteNumber('Eb3')).toBe(51);
    expect(noteNumber('F#2')).toBe(42);
    expect(noteNumber('H2')).toBeNull();
    expect(chordNotes('Cm7', 3)).toEqual([48, 51, 55, 58]);
    expect(chordNotes('Fmaj7', 3)).toEqual([53, 57, 60, 64]);
    expect(chordNotes('G', 2)).toEqual([43, 47, 50]);
    expect(chordNotes('Xm')).toBeNull();
  });

  it('turns drum strings and note tokens into steps', () => {
    const kick = parsePattern({ voice: 'kick', pattern: 'x...X...o...x...' });
    expect(kick).toHaveLength(16);
    expect(kick[0]).toMatchObject({ notes: [0], accent: 1 });
    expect(kick[4]?.accent).toBeGreaterThan(1);
    expect(kick[8]?.accent).toBeLessThan(1);
    expect(kick[1]).toBeNull();
    const bass = parsePattern({ voice: 'bass', pattern: 'C2 - - . Eb2 . [C3 E3 G3] -' });
    expect(bass[0]).toMatchObject({ notes: [36], hold: 3 });
    expect(bass[4]).toMatchObject({ notes: [39], hold: 1 });
    expect(bass[6]).toMatchObject({ notes: [48, 52, 55], hold: 2 });
    const pads = parsePattern({ voice: 'pad', pattern: 'Cm7 Ab', every: 16, octave: 3 });
    expect(pads).toHaveLength(32);
    expect(pads[16]?.notes).toEqual([56, 60, 63]);
    expect(pads[0]?.hold).toBe(16);
  });

  it('checks songs', () => {
    const song: Song = { name: 't', bpm: 120, sections: [{ name: 'a', bars: 2, tracks: [{ voice: 'kick', pattern: 'x...' }] }], order: ['a'] };
    expect(songProblem(song)).toBeNull();
    expect(songProblem({ ...song, bpm: 500 })).not.toBeNull();
    expect(songProblem({ ...song, order: ['b'] })).not.toBeNull();
    expect(songProblem({ ...song, sections: [{ name: 'a', bars: 1, tracks: [{ voice: 'bass', pattern: 'C2 Q9' }] }] })).not.toBeNull();
  });
});
