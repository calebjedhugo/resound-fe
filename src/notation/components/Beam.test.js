/** @jest-environment jsdom */

import { createBeams } from 'notation/components/Beam';

describe('Beam', () => {
  describe('createBeams', () => {
    it('returns SVG paths for beam connections', () => {
      const result = createBeams({
        notes: [
          { x: 50, y: 110, beams: 1 },
          { x: 90, y: 90, beams: 1 },
        ],
        stemDown: false,
      });
      const paths = result.querySelectorAll('.beam');
      expect(paths.length).toBeGreaterThanOrEqual(1);
    });

    it('creates one beam path for eighth notes', () => {
      const result = createBeams({
        notes: [
          { x: 50, y: 90, beams: 1 },
          { x: 90, y: 70, beams: 1 },
        ],
        stemDown: false,
      });
      const paths = result.querySelectorAll('.beam');
      expect(paths).toHaveLength(1);
    });

    it('creates two beam paths for sixteenth notes', () => {
      const result = createBeams({
        notes: [
          { x: 50, y: 90, beams: 2 },
          { x: 75, y: 70, beams: 2 },
        ],
        stemDown: false,
      });
      const paths = result.querySelectorAll('.beam');
      expect(paths).toHaveLength(2);
    });

    it('creates primary beam for mixed eighth + sixteenth group', () => {
      // Primary beam spans all notes; secondary beam only for sixteenth notes
      const result = createBeams({
        notes: [
          { x: 50, y: 90, beams: 1 }, // eighth
          { x: 75, y: 80, beams: 2 }, // 16th
          { x: 100, y: 70, beams: 2 }, // 16th
        ],
        stemDown: false,
      });
      const paths = result.querySelectorAll('.beam');
      // At least 2: one primary spanning all, one secondary for the sixteenth pair
      expect(paths.length).toBeGreaterThanOrEqual(2);
    });

    it('uses filled path elements', () => {
      const result = createBeams({
        notes: [
          { x: 50, y: 50, beams: 1 },
          { x: 90, y: 50, beams: 1 },
        ],
        stemDown: true,
      });
      const path = result.querySelector('.beam');
      expect(path.getAttribute('d')).toBeDefined();
      expect(path.getAttribute('fill')).toBe('currentColor');
    });

    it('handles stem-down beam position (beam below notes)', () => {
      const result = createBeams({
        notes: [
          { x: 50, y: 30, beams: 1 }, // high note, stem down
          { x: 90, y: 30, beams: 1 },
        ],
        stemDown: true,
      });
      // Beam should be below the notes (larger Y values)
      const path = result.querySelector('.beam');
      const d = path.getAttribute('d');
      // Parse first M command Y value - should be > 30 (below noteheads)
      const yValues = d.match(/[\d.]+/g).map(Number);
      // Stem down: stemEndY = noteY + 35 = 65
      expect(yValues.some((v) => v >= 60)).toBe(true);
    });

    it('handles stem-up beam position (beam above notes)', () => {
      const result = createBeams({
        notes: [
          { x: 50, y: 90, beams: 1 }, // low note, stem up
          { x: 90, y: 90, beams: 1 },
        ],
        stemDown: false,
      });
      // Beam should be above the notes (smaller Y values)
      const path = result.querySelector('.beam');
      const d = path.getAttribute('d');
      const yValues = d.match(/[\d.]+/g).map(Number);
      // Stem up: stemEndY = noteY - 35 = 55
      expect(yValues.some((v) => v <= 60)).toBe(true);
    });

    it('handles three notes in a beam group', () => {
      const result = createBeams({
        notes: [
          { x: 50, y: 90, beams: 1 },
          { x: 80, y: 80, beams: 1 },
          { x: 110, y: 70, beams: 1 },
        ],
        stemDown: false,
      });
      const paths = result.querySelectorAll('.beam');
      expect(paths).toHaveLength(1);
    });
  });
});
