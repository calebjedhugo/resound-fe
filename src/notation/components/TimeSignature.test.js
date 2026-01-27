/** @jest-environment jsdom */

import { createTimeSignature } from 'notation/components/TimeSignature';

describe('TimeSignature', () => {
  describe('createTimeSignature', () => {
    it('returns a group with class "time-signature"', () => {
      const group = createTimeSignature([4, 4]);
      expect(group.getAttribute('class')).toBe('time-signature');
    });

    it('renders a numerator text element', () => {
      const group = createTimeSignature([4, 4]);
      const numerator = group.querySelector('.time-numerator');
      expect(numerator).not.toBeNull();
      expect(numerator.textContent).toBe('4');
    });

    it('renders a denominator text element', () => {
      const group = createTimeSignature([4, 4]);
      const denominator = group.querySelector('.time-denominator');
      expect(denominator).not.toBeNull();
      expect(denominator.textContent).toBe('4');
    });

    it('renders 3/4 time correctly', () => {
      const group = createTimeSignature([3, 4]);
      expect(group.querySelector('.time-numerator').textContent).toBe('3');
      expect(group.querySelector('.time-denominator').textContent).toBe('4');
    });

    it('renders 6/8 time correctly', () => {
      const group = createTimeSignature([6, 8]);
      expect(group.querySelector('.time-numerator').textContent).toBe('6');
      expect(group.querySelector('.time-denominator').textContent).toBe('8');
    });

    it('vertically centers numerator in upper staff half', () => {
      const group = createTimeSignature([4, 4]);
      const numerator = group.querySelector('.time-numerator');
      const y = parseFloat(numerator.getAttribute('y'));
      // Upper half center: midpoint of y=10 and y=50 = 30
      expect(y).toBe(30);
    });

    it('vertically centers denominator in lower staff half', () => {
      const group = createTimeSignature([4, 4]);
      const denominator = group.querySelector('.time-denominator');
      const y = parseFloat(denominator.getAttribute('y'));
      // Lower half center: midpoint of y=50 and y=90 = 70
      expect(y).toBe(70);
    });

    it('horizontally centers text within the signature width', () => {
      const group = createTimeSignature([4, 4]);
      const numerator = group.querySelector('.time-numerator');
      const denominator = group.querySelector('.time-denominator');
      // Both should be at the same X (centered)
      expect(numerator.getAttribute('text-anchor')).toBe('middle');
      expect(denominator.getAttribute('text-anchor')).toBe('middle');
    });
  });
});
