/** @jest-environment jsdom */

import { createTieArc } from 'notation/components/Tie';

describe('Tie', () => {
  describe('createTieArc', () => {
    it('returns an SVG path element with class "tie"', () => {
      const path = createTieArc({ x1: 100, y1: 50, x2: 180, y2: 50, direction: 'below' });
      expect(path.tagName).toBe('path');
      expect(path.getAttribute('class')).toBe('tie');
    });

    it('has a d attribute with a cubic bezier curve', () => {
      const path = createTieArc({ x1: 100, y1: 50, x2: 180, y2: 50, direction: 'below' });
      const d = path.getAttribute('d');
      expect(d).toMatch(/^M\s/);
      expect(d).toMatch(/C\s/);
    });

    it('uses fill none and stroke currentColor', () => {
      const path = createTieArc({ x1: 100, y1: 50, x2: 180, y2: 50, direction: 'below' });
      expect(path.getAttribute('fill')).toBe('none');
      expect(path.getAttribute('stroke')).toBe('currentColor');
    });

    it('curves downward (larger Y) when direction is "below"', () => {
      const path = createTieArc({ x1: 100, y1: 50, x2: 180, y2: 50, direction: 'below' });
      const d = path.getAttribute('d');
      // Parse the control point Y values from the cubic bezier
      // Format: M x1 y1 C cpx1 cpy1 cpx2 cpy2 x2 y2
      const nums = d.match(/[\d.]+/g).map(Number);
      // Control points (indices 2,3 and 4,5) should have Y > 50 (below)
      expect(nums[3]).toBeGreaterThan(50);
      expect(nums[5]).toBeGreaterThan(50);
    });

    it('curves upward (smaller Y) when direction is "above"', () => {
      const path = createTieArc({ x1: 100, y1: 50, x2: 180, y2: 50, direction: 'above' });
      const d = path.getAttribute('d');
      const nums = d.match(/[\d.]+/g).map(Number);
      // Control points should have Y < 50 (above)
      expect(nums[3]).toBeLessThan(50);
      expect(nums[5]).toBeLessThan(50);
    });

    it('scales arc height with horizontal distance', () => {
      const short = createTieArc({ x1: 100, y1: 50, x2: 130, y2: 50, direction: 'below' });
      const long = createTieArc({ x1: 100, y1: 50, x2: 300, y2: 50, direction: 'below' });
      const shortNums = short
        .getAttribute('d')
        .match(/[\d.]+/g)
        .map(Number);
      const longNums = long
        .getAttribute('d')
        .match(/[\d.]+/g)
        .map(Number);
      // Longer tie should have greater arc height (larger control point offset from Y)
      const shortArcHeight = shortNums[3] - 50;
      const longArcHeight = longNums[3] - 50;
      expect(longArcHeight).toBeGreaterThan(shortArcHeight);
    });

    it('handles notes at different Y positions', () => {
      const path = createTieArc({ x1: 100, y1: 40, x2: 180, y2: 60, direction: 'below' });
      const d = path.getAttribute('d');
      expect(d).toBeDefined();
      // Start and end Y should reflect the input positions (with offset)
      const nums = d.match(/[\d.]+/g).map(Number);
      expect(nums[0]).toBe(100); // start X
      expect(nums[6]).toBe(180); // end X
    });

    it('enforces minimum arc height', () => {
      // Very close notes — arc should still have minimum height
      const path = createTieArc({ x1: 100, y1: 50, x2: 110, y2: 50, direction: 'below' });
      const nums = path
        .getAttribute('d')
        .match(/[\d.]+/g)
        .map(Number);
      const arcHeight = nums[3] - 50;
      expect(arcHeight).toBeGreaterThanOrEqual(8);
    });
  });
});
