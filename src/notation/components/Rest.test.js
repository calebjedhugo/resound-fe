/** @jest-environment jsdom */

import { createRest } from 'notation/components/Rest';

describe('Rest', () => {
  describe('createRest', () => {
    it('returns a group with class "rest rest-whole" for 1/1', () => {
      const el = createRest({ length: '1/1', x: 0 });
      expect(el.tagName).toBe('g');
      expect(el.getAttribute('class')).toBe('rest rest-whole');
    });

    it('returns a group with class "rest rest-half" for 1/2', () => {
      const el = createRest({ length: '1/2', x: 0 });
      expect(el.getAttribute('class')).toBe('rest rest-half');
    });

    it('returns a group with class "rest rest-quarter" for 1/4', () => {
      const el = createRest({ length: '1/4', x: 0 });
      expect(el.getAttribute('class')).toBe('rest rest-quarter');
    });

    it('returns a group with class "rest rest-eighth" for 1/8', () => {
      const el = createRest({ length: '1/8', x: 0 });
      expect(el.getAttribute('class')).toBe('rest rest-eighth');
    });

    it('returns a group with class "rest rest-16th" for 1/16', () => {
      const el = createRest({ length: '1/16', x: 0 });
      expect(el.getAttribute('class')).toBe('rest rest-16th');
    });

    it('applies x translation via transform', () => {
      const el = createRest({ length: '1/4', x: 100 });
      expect(el.getAttribute('transform')).toContain('100');
    });

    it('whole rest renders a filled rectangle hanging from staff line 2', () => {
      const el = createRest({ length: '1/1', x: 0 });
      const rect = el.querySelector('rect');
      expect(rect).not.toBeNull();
      expect(rect.getAttribute('class')).toBe('rest-symbol');
    });

    it('half rest renders a filled rectangle', () => {
      const el = createRest({ length: '1/2', x: 0 });
      const rect = el.querySelector('rect');
      expect(rect).not.toBeNull();
      expect(rect.getAttribute('class')).toBe('rest-symbol');
    });

    it('quarter rest renders a path element', () => {
      const el = createRest({ length: '1/4', x: 0 });
      const path = el.querySelector('path');
      expect(path).not.toBeNull();
      expect(path.getAttribute('class')).toBe('rest-symbol');
    });

    it('eighth rest renders a path element', () => {
      const el = createRest({ length: '1/8', x: 0 });
      const path = el.querySelector('path');
      expect(path).not.toBeNull();
      expect(path.getAttribute('class')).toBe('rest-symbol');
    });

    it('16th rest renders a path element', () => {
      const el = createRest({ length: '1/16', x: 0 });
      const path = el.querySelector('path');
      expect(path).not.toBeNull();
      expect(path.getAttribute('class')).toBe('rest-symbol');
    });

    it('contains children for all supported rest types', () => {
      const lengths = ['1/1', '1/2', '1/4', '1/8', '1/16'];
      for (const length of lengths) {
        const el = createRest({ length, x: 0 });
        expect(el.children.length).toBeGreaterThan(0);
      }
    });
  });
});
