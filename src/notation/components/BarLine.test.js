/** @jest-environment jsdom */

import { createBarLine } from 'notation/components/BarLine';

describe('BarLine', () => {
  describe('createBarLine', () => {
    it('returns a group with class "bar-line"', () => {
      const group = createBarLine(100);
      expect(group.getAttribute('class')).toBe('bar-line');
    });

    it('contains a vertical line', () => {
      const group = createBarLine(100);
      const line = group.querySelector('line');
      expect(line).not.toBeNull();
    });

    it('spans from top staff line (y=10) to bottom staff line (y=90)', () => {
      const group = createBarLine(100);
      const line = group.querySelector('line');
      expect(line.getAttribute('y1')).toBe('10');
      expect(line.getAttribute('y2')).toBe('90');
    });

    it('positions the line at the given x coordinate', () => {
      const group = createBarLine(150);
      const line = group.querySelector('line');
      expect(line.getAttribute('x1')).toBe('150');
      expect(line.getAttribute('x2')).toBe('150');
    });

    it('positions at different x values', () => {
      const group = createBarLine(250);
      const line = group.querySelector('line');
      expect(line.getAttribute('x1')).toBe('250');
    });
  });
});
