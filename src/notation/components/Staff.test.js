/** @jest-environment jsdom */

import { createStaffLines } from './Staff';

describe('Staff', () => {
  describe('createStaffLines', () => {
    it('returns a <g> element with class "staff-lines"', () => {
      const group = createStaffLines(800);
      expect(group.tagName).toBe('g');
      expect(group.getAttribute('class')).toBe('staff-lines');
    });

    it('renders exactly 5 staff lines', () => {
      const group = createStaffLines(800);
      const lines = group.querySelectorAll('line');
      expect(lines).toHaveLength(5);
    });

    it('gives each line the class "staff-line"', () => {
      const group = createStaffLines(800);
      const lines = group.querySelectorAll('.staff-line');
      expect(lines).toHaveLength(5);
    });

    it('spaces lines 20px apart spanning 80px total', () => {
      const group = createStaffLines(800);
      const lines = group.querySelectorAll('line');
      const yValues = Array.from(lines).map((l) => Number(l.getAttribute('y1')));
      expect(yValues).toEqual([0, 20, 40, 60, 80]);
    });

    it('draws horizontal lines (y1 equals y2)', () => {
      const group = createStaffLines(800);
      const lines = group.querySelectorAll('line');
      lines.forEach((line) => {
        expect(line.getAttribute('y1')).toBe(line.getAttribute('y2'));
      });
    });

    it('spans the full width from x=0 to the specified width', () => {
      const group = createStaffLines(600);
      const lines = group.querySelectorAll('line');
      lines.forEach((line) => {
        expect(line.getAttribute('x1')).toBe('0');
        expect(line.getAttribute('x2')).toBe('600');
      });
    });
  });
});
