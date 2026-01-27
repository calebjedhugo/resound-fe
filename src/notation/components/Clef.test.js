/** @jest-environment jsdom */

import { createClef } from 'notation/components/Clef';

describe('Clef', () => {
  describe('createClef', () => {
    it('returns a group element with class "clef clef-treble" for treble clef', () => {
      const el = createClef('treble');
      expect(el.tagName).toBe('g');
      expect(el.getAttribute('class')).toBe('clef clef-treble');
    });

    it('returns a group element with class "clef clef-bass" for bass clef', () => {
      const el = createClef('bass');
      expect(el.getAttribute('class')).toBe('clef clef-bass');
    });

    it('returns a group element with class "clef clef-percussion" for percussion clef', () => {
      const el = createClef('percussion');
      expect(el.getAttribute('class')).toBe('clef clef-percussion');
    });

    it('contains a path element for treble clef', () => {
      const el = createClef('treble');
      const path = el.querySelector('path');
      expect(path).not.toBeNull();
      expect(path.getAttribute('d')).toBeTruthy();
    });

    it('contains a path element for bass clef', () => {
      const el = createClef('bass');
      const path = el.querySelector('path');
      expect(path).not.toBeNull();
      expect(path.getAttribute('d')).toBeTruthy();
    });

    it('contains elements for percussion clef', () => {
      const el = createClef('percussion');
      expect(el.children.length).toBeGreaterThan(0);
    });

    it('throws for unknown clef type', () => {
      expect(() => createClef('unknown')).toThrow();
    });
  });
});
