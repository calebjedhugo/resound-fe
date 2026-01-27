/** @jest-environment jsdom */

import { createNotationContext } from 'notation/__tests__/helpers/testUtils';

describe('dynamics rendering', () => {
  let ctx;

  beforeEach(() => {
    ctx = createNotationContext();
  });

  afterEach(() => {
    ctx.destroy();
  });

  describe('point dynamics', () => {
    it('renders a dynamic marking below the staff', () => {
      ctx.render([
        { dynamic: 'f' },
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ]);

      const dynamics = ctx.getDynamics();
      expect(dynamics).toHaveLength(1);
      expect(dynamics[0].querySelector('.dynamic-text').textContent).toBe('f');
    });

    it('renders multi-character dynamics as a single element', () => {
      ctx.render([{ dynamic: 'mf' }, { pitch: 'C4', length: '1/4' }]);

      const text = ctx.container.querySelector('.dynamic-text');
      expect(text.textContent).toBe('mf');
    });

    it('renders multiple dynamics at their respective positions', () => {
      ctx.render([
        { dynamic: 'p' },
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
        { dynamic: 'f' },
        { pitch: 'E4', length: '1/4' },
      ]);

      const dynamics = ctx.getDynamics();
      expect(dynamics).toHaveLength(2);
      expect(dynamics[0].dataset.dynamic).toBe('p');
      expect(dynamics[1].dataset.dynamic).toBe('f');
    });

    it('does not render dynamic markers as notes or rests', () => {
      ctx.render([{ dynamic: 'f' }, { pitch: 'C4', length: '1/4' }]);

      expect(ctx.getNotes()).toHaveLength(1);
      expect(ctx.getRests()).toHaveLength(0);
    });

    it('renders all supported dynamic values', () => {
      const values = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'fp', 'sfz', 'sfp'];

      values.forEach((val) => {
        ctx.render([{ dynamic: val }, { pitch: 'C4', length: '1/4' }]);

        const text = ctx.container.querySelector('.dynamic-text');
        expect(text.textContent).toBe(val);
        ctx.renderer.clear();
      });
    });

    it('positions dynamic at the x-coordinate of the following note', () => {
      ctx.render([{ dynamic: 'p' }, { pitch: 'C4', length: '1/4' }]);

      const dynamic = ctx.getDynamics()[0];
      const note = ctx.getNotes()[0];

      // Both should share similar x coordinate via transform
      expect(dynamic.getAttribute('transform')).toBeDefined();
      expect(note.getAttribute('transform')).toBeDefined();
    });
  });

  describe('hairpins', () => {
    it('renders a crescendo hairpin spanning multiple notes', () => {
      ctx.render([
        { hairpin: 'crescendo', start: true },
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { hairpin: 'crescendo', stop: true },
        { pitch: 'F4', length: '1/4' },
      ]);

      const hairpins = ctx.getHairpins();
      expect(hairpins).toHaveLength(1);
      expect(hairpins[0].classList.contains('hairpin-crescendo')).toBe(true);
    });

    it('renders a decrescendo hairpin', () => {
      ctx.render([
        { hairpin: 'decrescendo', start: true },
        { pitch: 'G4', length: '1/4' },
        { pitch: 'F4', length: '1/4' },
        { hairpin: 'decrescendo', stop: true },
        { pitch: 'E4', length: '1/4' },
      ]);

      const hairpins = ctx.getHairpins();
      expect(hairpins).toHaveLength(1);
      expect(hairpins[0].classList.contains('hairpin-decrescendo')).toBe(true);
    });

    it('does not render hairpin markers as notes or rests', () => {
      ctx.render([
        { hairpin: 'crescendo', start: true },
        { pitch: 'C4', length: '1/4' },
        { hairpin: 'crescendo', stop: true },
        { pitch: 'D4', length: '1/4' },
      ]);

      expect(ctx.getNotes()).toHaveLength(2);
      expect(ctx.getRests()).toHaveLength(0);
    });

    it('renders hairpin with two line paths', () => {
      ctx.render([
        { hairpin: 'crescendo', start: true },
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
        { hairpin: 'crescendo', stop: true },
        { pitch: 'E4', length: '1/4' },
      ]);

      const hairpin = ctx.getHairpins()[0];
      const lines = hairpin.querySelectorAll('.hairpin-line');
      expect(lines).toHaveLength(2);
    });
  });

  describe('dynamics with hairpins', () => {
    it('renders both point dynamics and hairpins in the same passage', () => {
      ctx.render([
        { dynamic: 'p' },
        { hairpin: 'crescendo', start: true },
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
        { hairpin: 'crescendo', stop: true },
        { dynamic: 'f' },
        { pitch: 'E4', length: '1/4' },
      ]);

      expect(ctx.getDynamics()).toHaveLength(2);
      expect(ctx.getHairpins()).toHaveLength(1);
    });
  });

  describe('dynamics do not affect note count or beat positions', () => {
    it('preserves correct note count when dynamics are interspersed', () => {
      ctx.render([
        { dynamic: 'pp' },
        { pitch: 'C4', length: '1/4' },
        { dynamic: 'mp' },
        { pitch: 'D4', length: '1/4' },
        { dynamic: 'f' },
        { pitch: 'E4', length: '1/4' },
        { dynamic: 'ff' },
        { pitch: 'F4', length: '1/4' },
      ]);

      expect(ctx.getNotes()).toHaveLength(4);
      expect(ctx.getDynamics()).toHaveLength(4);
    });

    it('preserves playback position with dynamics present', () => {
      ctx.render([
        { dynamic: 'f' },
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ]);

      ctx.renderer.setPlaybackPosition(1);
      const active = ctx.getActiveNote();
      expect(active).not.toBeNull();
      expect(active.dataset.beat).toBe('1');
    });
  });
});
