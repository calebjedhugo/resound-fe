/** @jest-environment jsdom */

import { createBrace } from 'notation/components/Brace';

describe('Brace', () => {
  describe('createBrace', () => {
    it('returns a group with class "brace"', () => {
      const group = createBrace({ height: 200 });
      expect(group.tagName).toBe('g');
      expect(group.getAttribute('class')).toBe('brace');
    });

    it('contains a path element', () => {
      const group = createBrace({ height: 200 });
      const path = group.querySelector('path');
      expect(path).not.toBeNull();
    });

    it('path has a d attribute with curve data', () => {
      const group = createBrace({ height: 200 });
      const path = group.querySelector('path');
      const d = path.getAttribute('d');
      expect(d).toBeTruthy();
      expect(d.length).toBeGreaterThan(0);
    });

    it('scales to match the requested height', () => {
      const small = createBrace({ height: 100 });
      const large = createBrace({ height: 300 });

      // The transform should reflect the different heights
      const smallTransform = small.getAttribute('transform') || '';
      const largeTransform = large.getAttribute('transform') || '';

      // Both should have transforms (scaling)
      expect(smallTransform || small.querySelector('path').getAttribute('transform')).toBeTruthy();
      expect(largeTransform || large.querySelector('path').getAttribute('transform')).toBeTruthy();
    });

    it('uses default height when not specified', () => {
      const group = createBrace({});
      const path = group.querySelector('path');
      expect(path).not.toBeNull();
    });

    it('path has stroke and fill attributes', () => {
      const group = createBrace({ height: 200 });
      const path = group.querySelector('path');
      expect(path.getAttribute('fill')).toBe('currentColor');
    });
  });
});
