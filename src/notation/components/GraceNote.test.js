/** @jest-environment jsdom */

import { createNotationContext } from 'notation/__tests__/helpers/testUtils';

describe('grace note rendering', () => {
  let ctx;

  beforeEach(() => {
    ctx = createNotationContext();
  });

  afterEach(() => {
    ctx.destroy();
  });

  describe('single acciaccatura', () => {
    it('renders a grace note before the main note', () => {
      ctx.render([{ pitch: 'D4', length: '1/4', grace: { pitch: 'C4', type: 'acciaccatura' } }]);

      const graceNotes = ctx.getGraceNotes();
      expect(graceNotes).toHaveLength(1);
      expect(graceNotes[0].classList.contains('grace-note-acciaccatura')).toBe(true);
    });

    it('renders a slash on acciaccatura grace notes', () => {
      ctx.render([{ pitch: 'D4', length: '1/4', grace: { pitch: 'C4', type: 'acciaccatura' } }]);

      const slash = ctx.container.querySelector('.grace-slash');
      expect(slash).not.toBeNull();
    });

    it('defaults to acciaccatura when type is omitted', () => {
      ctx.render([{ pitch: 'D4', length: '1/4', grace: { pitch: 'C4' } }]);

      const graceNote = ctx.container.querySelector('.grace-note-acciaccatura');
      expect(graceNote).not.toBeNull();
    });
  });

  describe('single appoggiatura', () => {
    it('renders appoggiatura without a slash', () => {
      ctx.render([{ pitch: 'D4', length: '1/4', grace: { pitch: 'C4', type: 'appoggiatura' } }]);

      const graceNote = ctx.container.querySelector('.grace-note-appoggiatura');
      expect(graceNote).not.toBeNull();

      const slash = ctx.container.querySelector('.grace-slash');
      expect(slash).toBeNull();
    });
  });

  describe('multiple grace notes (run)', () => {
    it('renders multiple grace notes', () => {
      ctx.render([
        {
          pitch: 'D4',
          length: '1/4',
          grace: [
            { pitch: 'A3', type: 'acciaccatura' },
            { pitch: 'B3', type: 'acciaccatura' },
            { pitch: 'C4', type: 'acciaccatura' },
          ],
        },
      ]);

      const graceNotes = ctx.getGraceNotes();
      expect(graceNotes).toHaveLength(3);
    });

    it('wraps multiple grace notes in a grace-note-group container', () => {
      ctx.render([
        {
          pitch: 'D4',
          length: '1/4',
          grace: [
            { pitch: 'A3', type: 'acciaccatura' },
            { pitch: 'B3', type: 'acciaccatura' },
          ],
        },
      ]);

      const group = ctx.container.querySelector('.grace-note-group');
      expect(group).not.toBeNull();
    });
  });

  describe('slur rendering', () => {
    it('draws a slur from grace note to main note', () => {
      ctx.render([{ pitch: 'D4', length: '1/4', grace: { pitch: 'C4', type: 'acciaccatura' } }]);

      const slur = ctx.container.querySelector('.grace-slur');
      expect(slur).not.toBeNull();
    });
  });

  describe('grace note on chord', () => {
    it('renders grace note before a chord', () => {
      ctx.render([
        [
          { pitch: 'C4', length: '1/4', grace: { pitch: 'B3', type: 'acciaccatura' } },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
        ],
      ]);

      const graceNotes = ctx.getGraceNotes();
      expect(graceNotes).toHaveLength(1);
    });
  });

  describe('grace notes do not affect note count or beat positions', () => {
    it('renders the correct number of main notes', () => {
      ctx.render([
        { pitch: 'D4', length: '1/4', grace: { pitch: 'C4', type: 'acciaccatura' } },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'F4', length: '1/4' },
      ]);

      expect(ctx.getNotes()).toHaveLength(3);
      expect(ctx.getGraceNotes()).toHaveLength(1);
    });

    it('preserves playback position with grace notes present', () => {
      ctx.render([
        { pitch: 'D4', length: '1/4', grace: { pitch: 'C4', type: 'acciaccatura' } },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'F4', length: '1/4' },
      ]);

      ctx.renderer.setPlaybackPosition(1);
      const active = ctx.getActiveNote();
      expect(active).not.toBeNull();
      expect(active.dataset.beat).toBe('1');
    });
  });

  describe('grace note rendering at 60% scale', () => {
    it('renders grace notes with scale(0.6) transform', () => {
      ctx.render([{ pitch: 'D4', length: '1/4', grace: { pitch: 'C4', type: 'acciaccatura' } }]);

      const graceNote = ctx.getGraceNotes()[0];
      const transform = graceNote.getAttribute('transform');
      expect(transform).toContain('scale(0.6)');
    });
  });
});
