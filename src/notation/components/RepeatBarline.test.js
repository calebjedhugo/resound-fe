/** @jest-environment jsdom */

import { createNotationContext } from 'notation/__tests__/helpers/testUtils';

describe('repeat and navigation rendering', () => {
  let ctx;

  beforeEach(() => {
    ctx = createNotationContext();
  });

  afterEach(() => {
    ctx.destroy();
  });

  describe('repeat barlines', () => {
    it('renders a repeat-start barline with thick line and dots', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { barline: 'repeat-start' },
          { pitch: 'C4', length: '1/4' },
          { pitch: 'D4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'F4', length: '1/4' },
          { barline: 'repeat-end' },
        ],
      });

      const repeatStart = ctx.container.querySelector('.barline-repeat-start');
      expect(repeatStart).not.toBeNull();
      expect(repeatStart.querySelectorAll('.barline-dot')).toHaveLength(2);
      expect(repeatStart.querySelector('.barline-thick')).not.toBeNull();
      expect(repeatStart.querySelector('.barline-thin')).not.toBeNull();
    });

    it('renders a repeat-end barline with dots', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { barline: 'repeat-start' },
          { pitch: 'C4', length: '1/1' },
          { barline: 'repeat-end' },
        ],
      });

      const repeatEnd = ctx.container.querySelector('.barline-repeat-end');
      expect(repeatEnd).not.toBeNull();
      expect(repeatEnd.querySelectorAll('.barline-dot')).toHaveLength(2);
    });

    it('renders a repeat-both barline with dots on both sides', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { barline: 'repeat-start' },
          { pitch: 'C4', length: '1/1' },
          { barline: 'repeat-both' },
          { pitch: 'D4', length: '1/1' },
          { barline: 'repeat-end' },
        ],
      });

      const repeatBoth = ctx.container.querySelector('.barline-repeat-both');
      expect(repeatBoth).not.toBeNull();
      expect(repeatBoth.querySelectorAll('.barline-dot')).toHaveLength(4);
    });

    it('renders a final barline without dots', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [{ pitch: 'C4', length: '1/1' }, { barline: 'final' }],
      });

      const finalBar = ctx.container.querySelector('.barline-final');
      expect(finalBar).not.toBeNull();
      expect(finalBar.querySelectorAll('.barline-dot')).toHaveLength(0);
      expect(finalBar.querySelector('.barline-thick')).not.toBeNull();
      expect(finalBar.querySelector('.barline-thin')).not.toBeNull();
    });

    it('does not count repeat barlines as notes', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { barline: 'repeat-start' },
          { pitch: 'C4', length: '1/4' },
          { pitch: 'D4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'F4', length: '1/4' },
          { barline: 'repeat-end' },
        ],
      });

      expect(ctx.getNotes()).toHaveLength(4);
    });
  });

  describe('volta endings', () => {
    it('renders a closed bracket for the first ending', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { barline: 'repeat-start' },
          { pitch: 'C4', length: '1/1' },
          { ending: { number: 1, type: 'start' } },
          { pitch: 'D4', length: '1/1' },
          { ending: { number: 1, type: 'stop' } },
          { barline: 'repeat-end' },
          { ending: { number: 2, type: 'start' } },
          { pitch: 'E4', length: '1/1' },
        ],
      });

      const ending1 = ctx.container.querySelector('.ending-1');
      expect(ending1).not.toBeNull();
      expect(ending1.querySelector('.ending-number').textContent).toBe('1.');
      // First ending bracket is closed (no open class)
      expect(ending1.querySelector('.ending-bracket-open')).toBeNull();
    });

    it('renders an open bracket for the last ending', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { barline: 'repeat-start' },
          { pitch: 'C4', length: '1/1' },
          { ending: { number: 1, type: 'start' } },
          { pitch: 'D4', length: '1/1' },
          { ending: { number: 1, type: 'stop' } },
          { barline: 'repeat-end' },
          { ending: { number: 2, type: 'start' } },
          { pitch: 'E4', length: '1/1' },
        ],
      });

      const ending2 = ctx.container.querySelector('.ending-2');
      expect(ending2).not.toBeNull();
      expect(ending2.querySelector('.ending-number').textContent).toBe('2.');
      expect(ending2.querySelector('.ending-bracket-open')).not.toBeNull();
    });

    it('does not count ending markers as notes', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { barline: 'repeat-start' },
          { pitch: 'C4', length: '1/1' },
          { ending: { number: 1, type: 'start' } },
          { pitch: 'D4', length: '1/1' },
          { ending: { number: 1, type: 'stop' } },
          { barline: 'repeat-end' },
          { ending: { number: 2, type: 'start' } },
          { pitch: 'E4', length: '1/1' },
        ],
      });

      expect(ctx.getNotes()).toHaveLength(3);
    });
  });

  describe('navigation markers', () => {
    it('renders a segno symbol above the staff', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [{ navigation: 'segno' }, { pitch: 'C4', length: '1/1' }, { navigation: 'ds' }],
      });

      const segno = ctx.container.querySelector('.navigation-segno');
      expect(segno).not.toBeNull();
      expect(segno.querySelector('.navigation-symbol')).not.toBeNull();
    });

    it('renders a coda symbol above the staff', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/1' },
          { navigation: 'to-coda' },
          { pitch: 'D4', length: '1/1' },
          { navigation: 'dc-al-coda' },
          { navigation: 'coda' },
          { pitch: 'E4', length: '1/1' },
        ],
      });

      const coda = ctx.container.querySelector('.navigation-coda');
      expect(coda).not.toBeNull();
      expect(coda.querySelector('.navigation-symbol')).not.toBeNull();
    });

    it('renders D.S. al Coda as italic text', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { navigation: 'segno' },
          { pitch: 'C4', length: '1/1' },
          { navigation: 'to-coda' },
          { pitch: 'D4', length: '1/1' },
          { navigation: 'ds-al-coda' },
          { navigation: 'coda' },
          { pitch: 'E4', length: '1/1' },
        ],
      });

      const dsAlCoda = ctx.container.querySelector('.navigation-ds-al-coda');
      expect(dsAlCoda).not.toBeNull();
      const text = dsAlCoda.querySelector('text');
      expect(text.textContent).toContain('D.S. al Coda');
      expect(text.getAttribute('font-style')).toBe('italic');
    });

    it('renders Fine as italic text', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/1' },
          { navigation: 'fine' },
          { pitch: 'D4', length: '1/1' },
          { navigation: 'dc-al-fine' },
        ],
      });

      const fine = ctx.container.querySelector('.navigation-fine');
      expect(fine).not.toBeNull();
      const text = fine.querySelector('text');
      expect(text.textContent).toBe('Fine');
    });

    it('renders D.C. as italic text', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [{ pitch: 'C4', length: '1/1' }, { navigation: 'dc' }],
      });

      const dc = ctx.container.querySelector('.navigation-dc');
      expect(dc).not.toBeNull();
      const text = dc.querySelector('text');
      expect(text.textContent).toBe('D.C.');
    });

    it('does not count navigation markers as notes', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [{ navigation: 'segno' }, { pitch: 'C4', length: '1/1' }, { navigation: 'ds' }],
      });

      expect(ctx.getNotes()).toHaveLength(1);
    });
  });

  describe('complex repeat structures', () => {
    it('renders D.S. al Coda with endings correctly', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/1' },
          { navigation: 'segno' },
          { barline: 'repeat-start' },
          { pitch: 'D4', length: '1/1' },
          { ending: { number: 1, type: 'start' } },
          { pitch: 'E4', length: '1/1' },
          { ending: { number: 1, type: 'stop' } },
          { barline: 'repeat-end' },
          { ending: { number: 2, type: 'start' } },
          { pitch: 'F4', length: '1/2' },
          { pitch: 'G4', length: '1/2' },
          { navigation: 'to-coda' },
          { pitch: 'A4', length: '1/1' },
          { navigation: 'ds-al-coda' },
          { navigation: 'coda' },
          { pitch: 'C5', length: '1/1' },
          { barline: 'final' },
        ],
      });

      expect(ctx.container.querySelector('.navigation-segno')).not.toBeNull();
      expect(ctx.container.querySelector('.barline-repeat-start')).not.toBeNull();
      expect(ctx.container.querySelector('.barline-repeat-end')).not.toBeNull();
      expect(ctx.container.querySelector('.ending-1')).not.toBeNull();
      expect(ctx.container.querySelector('.ending-2')).not.toBeNull();
      expect(ctx.container.querySelector('.navigation-to-coda')).not.toBeNull();
      expect(ctx.container.querySelector('.navigation-ds-al-coda')).not.toBeNull();
      expect(ctx.container.querySelector('.navigation-coda')).not.toBeNull();
      expect(ctx.container.querySelector('.barline-final')).not.toBeNull();
    });

    it('preserves correct note count with all marker types', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/1' },
          { navigation: 'segno' },
          { barline: 'repeat-start' },
          { pitch: 'D4', length: '1/1' },
          { ending: { number: 1, type: 'start' } },
          { pitch: 'E4', length: '1/1' },
          { ending: { number: 1, type: 'stop' } },
          { barline: 'repeat-end' },
          { ending: { number: 2, type: 'start' } },
          { pitch: 'F4', length: '1/1' },
          { navigation: 'ds-al-coda' },
          { navigation: 'coda' },
          { pitch: 'C5', length: '1/1' },
          { barline: 'final' },
        ],
      });

      // 5 actual notes: C4, D4, E4, F4, C5
      expect(ctx.getNotes()).toHaveLength(5);
    });
  });
});
