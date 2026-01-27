/** @jest-environment jsdom */

import { createNotationContext } from 'notation/__tests__/helpers/testUtils';

describe('articulations', () => {
  let ctx;

  beforeEach(() => {
    ctx = createNotationContext();
  });

  afterEach(() => {
    ctx.destroy();
  });

  describe('single articulations', () => {
    it('renders a staccato dot on a note', () => {
      ctx.render([{ pitch: 'C5', length: '1/4', articulation: 'staccato' }]);

      const staccato = ctx.container.querySelectorAll('.articulation-staccato');
      expect(staccato).toHaveLength(1);
    });

    it('renders each supported articulation type', () => {
      const types = [
        'staccato',
        'staccatissimo',
        'accent',
        'marcato',
        'tenuto',
        'fermata',
        'portato',
      ];

      types.forEach((type) => {
        ctx.render([{ pitch: 'C5', length: '1/4', articulation: type }]);

        const mark = ctx.container.querySelector(`.articulation-${type}`);
        expect(mark).not.toBeNull();
        ctx.renderer.clear();
      });
    });

    it('wraps articulations in an .articulations container', () => {
      ctx.render([{ pitch: 'C5', length: '1/4', articulation: 'staccato' }]);

      const note = ctx.container.querySelector('.note');
      const container = note.querySelector('.articulations');
      expect(container).not.toBeNull();
    });
  });

  describe('placement side', () => {
    it('places articulation below notehead when stem is up (note below middle line)', () => {
      ctx.render([{ pitch: 'C4', length: '1/4', articulation: 'staccato' }]);

      const note = ctx.container.querySelector('.note');
      const artic = note.querySelector('.articulation-staccato');
      expect(artic).not.toBeNull();
      // Staccato should have a positive Y transform (below notehead)
      const transform = artic.getAttribute('transform');
      const yMatch = transform.match(/translate\(0,\s*([\d.]+)\)/);
      expect(yMatch).not.toBeNull();
      expect(parseFloat(yMatch[1])).toBeGreaterThan(0);
    });

    it('places articulation above notehead when stem is down (note above middle line)', () => {
      ctx.render([{ pitch: 'B4', length: '1/4', articulation: 'staccato' }]);

      const note = ctx.container.querySelector('.note');
      const artic = note.querySelector('.articulation-staccato');
      expect(artic).not.toBeNull();
      // Staccato should have a negative Y transform (above notehead)
      const transform = artic.getAttribute('transform');
      const yMatch = transform.match(/translate\(0,\s*(-[\d.]+)\)/);
      expect(yMatch).not.toBeNull();
      expect(parseFloat(yMatch[1])).toBeLessThan(0);
    });

    it('always places fermata above the staff', () => {
      // Even when stem is up (note below middle line), fermata goes above
      ctx.render([{ pitch: 'C4', length: '1/4', articulation: 'fermata' }]);

      const fermata = ctx.container.querySelector('.articulation-fermata');
      expect(fermata).not.toBeNull();
      const transform = fermata.getAttribute('transform');
      const yMatch = transform.match(/translate\(0,\s*(-[\d.]+)\)/);
      expect(yMatch).not.toBeNull();
      expect(parseFloat(yMatch[1])).toBeLessThan(0);
    });
  });

  describe('multiple articulations', () => {
    it('renders multiple articulations from an array', () => {
      ctx.render([{ pitch: 'C5', length: '1/4', articulation: ['accent', 'staccato'] }]);

      expect(ctx.container.querySelectorAll('.articulation')).toHaveLength(2);
      expect(ctx.container.querySelector('.articulation-accent')).not.toBeNull();
      expect(ctx.container.querySelector('.articulation-staccato')).not.toBeNull();
    });

    it('stacks articulations in correct order (staccato closest to notehead)', () => {
      ctx.render([{ pitch: 'C5', length: '1/4', articulation: ['accent', 'staccato'] }]);

      const articulations = ctx.container.querySelectorAll('.articulation');
      // Staccato (priority 1) should be first (closest to notehead)
      expect(articulations[0].classList.contains('articulation-staccato')).toBe(true);
      // Accent (priority 2) should be second (further from notehead)
      expect(articulations[1].classList.contains('articulation-accent')).toBe(true);
    });
  });

  describe('articulations on chords', () => {
    it('renders articulation on a chord', () => {
      ctx.render([
        [
          { pitch: 'C4', length: '1/4', articulation: 'staccato' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
        ],
      ]);

      expect(ctx.container.querySelectorAll('.articulation-staccato')).toHaveLength(1);
    });
  });

  describe('articulations on rests', () => {
    it('renders fermata on a rest', () => {
      ctx.render([{ length: '1/4', articulation: 'fermata' }]);

      expect(ctx.container.querySelector('.articulation-fermata')).not.toBeNull();
    });

    it('ignores non-fermata articulations on rests', () => {
      ctx.render([{ length: '1/4', articulation: 'staccato' }]);

      expect(ctx.container.querySelector('.articulation-staccato')).toBeNull();
    });
  });

  describe('articulations do not affect note count', () => {
    it('renders the correct number of notes with articulations', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4', articulation: 'staccato' },
        { pitch: 'D4', length: '1/4', articulation: 'accent' },
        { pitch: 'E4', length: '1/4' },
      ]);

      expect(ctx.getNotes()).toHaveLength(3);
      expect(ctx.getArticulations()).toHaveLength(2);
    });
  });
});
