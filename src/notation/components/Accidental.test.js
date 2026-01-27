/** @jest-environment jsdom */

import { createAccidental } from 'notation/components/Accidental';

describe('Accidental', () => {
  describe('createAccidental', () => {
    it('returns a group with class "accidental sharp" for sharp', () => {
      const el = createAccidental('sharp');
      expect(el.tagName).toBe('g');
      expect(el.getAttribute('class')).toBe('accidental sharp');
    });

    it('returns a group with class "accidental flat" for flat', () => {
      const el = createAccidental('flat');
      expect(el.getAttribute('class')).toBe('accidental flat');
    });

    it('returns a group with class "accidental natural" for natural', () => {
      const el = createAccidental('natural');
      expect(el.getAttribute('class')).toBe('accidental natural');
    });

    it('contains a text or path element for each accidental type', () => {
      for (const type of ['sharp', 'flat', 'natural']) {
        const el = createAccidental(type);
        expect(el.children.length).toBeGreaterThan(0);
      }
    });

    it('sharp symbol contains the sharp character or a path', () => {
      const el = createAccidental('sharp');
      const text = el.querySelector('text');
      const path = el.querySelector('path');
      expect(text || path).not.toBeNull();
    });

    it('flat symbol contains the flat character or a path', () => {
      const el = createAccidental('flat');
      const text = el.querySelector('text');
      const path = el.querySelector('path');
      expect(text || path).not.toBeNull();
    });

    it('natural symbol contains the natural character or a path', () => {
      const el = createAccidental('natural');
      const text = el.querySelector('text');
      const path = el.querySelector('path');
      expect(text || path).not.toBeNull();
    });

    it('throws for unknown accidental type', () => {
      expect(() => createAccidental('double-sharp')).toThrow();
    });
  });
});
