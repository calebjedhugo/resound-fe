/** @jest-environment jsdom */

import { createSharedBarLine } from 'notation/components/SharedBarLine';

describe('SharedBarLine', () => {
  describe('createSharedBarLine', () => {
    it('returns a group with class "shared-bar-line"', () => {
      const group = createSharedBarLine({ x: 100, topY: 10, bottomY: 290 });
      expect(group.tagName).toBe('g');
      expect(group.getAttribute('class')).toBe('shared-bar-line');
    });

    it('contains a vertical line', () => {
      const group = createSharedBarLine({ x: 100, topY: 10, bottomY: 290 });
      const line = group.querySelector('line');
      expect(line).not.toBeNull();
    });

    it('spans from topY to bottomY', () => {
      const group = createSharedBarLine({ x: 100, topY: 20, bottomY: 280 });
      const line = group.querySelector('line');
      expect(line.getAttribute('y1')).toBe('20');
      expect(line.getAttribute('y2')).toBe('280');
    });

    it('positions the line at the given x coordinate', () => {
      const group = createSharedBarLine({ x: 150, topY: 10, bottomY: 290 });
      const line = group.querySelector('line');
      expect(line.getAttribute('x1')).toBe('150');
      expect(line.getAttribute('x2')).toBe('150');
    });

    it('works with different x values', () => {
      const group = createSharedBarLine({ x: 250, topY: 0, bottomY: 300 });
      const line = group.querySelector('line');
      expect(line.getAttribute('x1')).toBe('250');
      expect(line.getAttribute('x2')).toBe('250');
    });

    it('has stroke attributes', () => {
      const group = createSharedBarLine({ x: 100, topY: 10, bottomY: 290 });
      const line = group.querySelector('line');
      expect(line.getAttribute('stroke')).toBe('currentColor');
    });
  });
});
