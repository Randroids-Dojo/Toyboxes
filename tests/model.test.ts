import { describe, expect, it } from 'vitest';
import { EMPTY_CONTENT, cleanName, contentProblem, layoutProblem, placementProblem, publishedContent, type PropPlacement, type RoomContent } from '../src/shared/model';

const main = { kind: 'main' as const, exhibits: [] };

describe('names', () => {
  it('keeps letters, digits and simple punctuation', () => {
    expect(cleanName('  Cris  ')).toBe('Cris');
    expect(cleanName('Zoë-2')).toBe('Zoë-2');
    expect(cleanName('a')).toBeNull();
    expect(cleanName('<script>')).toBe('script');
    expect(cleanName('x'.repeat(40))).toHaveLength(16);
  });
});

describe('layouts', () => {
  it('the starter layout every new room gets is valid', () => {
    const starter: PropPlacement[] = [
      { id: 'ball1', kind: 'ball', x: 0, z: -1, rot: 0 },
      { id: 'goal1', kind: 'goal', x: 0, z: -3.0, rot: 0 },
    ];
    expect(layoutProblem(starter, main)).toBeNull();
  });

  it('keeps the doorway, back doors and furniture clear', () => {
    expect(placementProblem({ kind: 'crate', x: 0, z: 4 }, main)).toMatch(/doorway/);
    expect(placementProblem({ kind: 'crate', x: 4, z: -5.2 }, main)).toMatch(/back doors/);
    expect(placementProblem({ kind: 'crate', x: -5.2, z: 1.2 }, main)).toMatch(/sketchbook/);
    expect(placementProblem({ kind: 'crate', x: 5.2, z: 1.2 }, main)).toMatch(/toy chest/);
    expect(placementProblem({ kind: 'crate', x: 6.8, z: 0 }, main)).toMatch(/wall/);
    // Inner areas have no lectern or back doors.
    expect(placementProblem({ kind: 'crate', x: 4, z: -5.2 }, { kind: 'area', exhibits: [] })).toBeNull();
  });

  it('uses the real footprint, so a turned goal fits where a square one would not', () => {
    // Facing the side wall, the 3.2 m goal is only 1.2 m deep across the room.
    expect(placementProblem({ kind: 'goal', x: 5.6, z: -2, rot: -Math.PI / 2 }, { kind: 'area', exhibits: [] })).toBeNull();
    expect(placementProblem({ kind: 'goal', x: 5.6, z: -2, rot: 0 }, { kind: 'area', exhibits: [] })).toMatch(/wall/);
  });

  it('stops toys overlapping and counts limits', () => {
    const a: PropPlacement = { id: 'a', kind: 'crate', x: 2, z: 0, rot: 0 };
    expect(placementProblem({ kind: 'crate', x: 2.5, z: 0 }, main, [a])).toMatch(/another toy/);
    expect(placementProblem({ kind: 'crate', x: 3.2, z: 0 }, main, [a])).toBeNull();
    const four = Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, kind: 'ball' as const, x: -3 + i * 1.5, z: 0, rot: 0 }));
    expect(layoutProblem(four, main)).toMatch(/At most 3/);
  });
});

describe('content', () => {
  const content: RoomContent = {
    rev: 1,
    areas: [
      { id: 'a1', name: 'Pitch', theme: { wall: 0, floor: 0, trim: 0 }, props: [], published: true },
      { id: 'a2', name: 'Secret', theme: { wall: 0, floor: 0, trim: 0 }, props: [], published: false },
    ],
    exhibits: [
      { id: 'e1', title: 'One', blurb: '', url: 'https://example.com', area: 'main', x: 3, z: -2, rot: 0, color: 0, pages: [], published: true },
      { id: 'e2', title: 'Two', blurb: '', url: '/games/two/', area: 'a2', x: 0, z: 0, rot: 0, color: 0, pages: [], published: true },
      { id: 'e3', title: 'Three', blurb: '', url: '/games/three/', area: 'main', x: -3, z: -2, rot: 0, color: 0, pages: [], published: false },
    ],
  };

  it('publishes only published items in published spaces', () => {
    const pub = publishedContent(content);
    expect(pub.areas.map((a) => a.id)).toEqual(['a1']);
    expect(pub.exhibits.map((e) => e.id)).toEqual(['e1']);
    expect(publishedContent(EMPTY_CONTENT).exhibits).toEqual([]);
  });

  it('rejects unsafe links and blocked doorways', () => {
    expect(contentProblem(content)).toBeNull();
    expect(contentProblem({ ...content, exhibits: [{ ...content.exhibits[0], url: 'javascript:alert(1)' }] })).toMatch(/link/);
    expect(contentProblem({ ...content, exhibits: [{ ...content.exhibits[0], x: 0, z: 4.5 }] })).toMatch(/doorway/);
  });
});
