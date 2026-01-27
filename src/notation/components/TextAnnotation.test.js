/** @jest-environment jsdom */

import { createNotationContext } from 'notation/__tests__/helpers/testUtils';

describe('text annotation rendering', () => {
  let ctx;

  beforeEach(() => {
    ctx = createNotationContext();
  });

  afterEach(() => {
    ctx.destroy();
  });

  describe('tempo markings', () => {
    it('renders a full tempo marking with text and metronome', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { tempo: { bpm: 120, beat: '1/4', text: 'Allegro' } },
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
          { pitch: 'C5', length: '1/4' },
        ],
      });

      const tempos = ctx.getTempoMarkings();
      expect(tempos).toHaveLength(1);
      expect(tempos[0].textContent).toContain('Allegro');
      expect(tempos[0].textContent).toContain('120');
    });

    it('renders metronome-only marking without text label', () => {
      ctx.render({
        notes: [{ tempo: { bpm: 80, beat: '1/4' } }, { pitch: 'C4', length: '1/2' }],
      });

      const tempos = ctx.getTempoMarkings();
      expect(tempos).toHaveLength(1);
      expect(tempos[0].querySelector('.tempo-metronome')).not.toBeNull();
      expect(tempos[0].querySelector('.tempo-text')).toBeNull();
    });

    it('renders text-only marking without metronome number', () => {
      ctx.render({
        notes: [{ tempo: { text: 'Andante' } }, { pitch: 'C4', length: '1/2' }],
      });

      const tempos = ctx.getTempoMarkings();
      expect(tempos[0].querySelector('.tempo-text')).not.toBeNull();
      expect(tempos[0].querySelector('.tempo-metronome')).toBeNull();
    });

    it('renders multiple tempo markings at different positions', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { tempo: { bpm: 120, beat: '1/4', text: 'Allegro' } },
          { pitch: 'C4', length: '1/4' },
          { pitch: 'D4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'F4', length: '1/4' },
          { tempo: { bpm: 140, beat: '1/4', text: 'Vivace' } },
          { pitch: 'G4', length: '1/4' },
          { pitch: 'A4', length: '1/4' },
          { pitch: 'B4', length: '1/4' },
          { pitch: 'C5', length: '1/4' },
        ],
      });

      const tempos = ctx.getTempoMarkings();
      expect(tempos).toHaveLength(2);
      expect(tempos[1].textContent).toContain('Vivace');
    });

    it('does not count tempo markers as notes', () => {
      ctx.render({
        notes: [
          { tempo: { bpm: 120, beat: '1/4', text: 'Allegro' } },
          { pitch: 'C4', length: '1/4' },
        ],
      });

      expect(ctx.getNotes()).toHaveLength(1);
    });
  });

  describe('gradual tempo changes', () => {
    it('renders ritardando as italic text with rit. abbreviation', () => {
      ctx.render({
        notes: [
          { pitch: 'C4', length: '1/4' },
          { tempoChange: 'ritardando' },
          { pitch: 'D4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
        ],
      });

      const changes = ctx.getTempoChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].classList.contains('tempo-change-rit')).toBe(true);
      expect(changes[0].textContent).toContain('rit.');
    });

    it('renders accelerando as italic text with accel. abbreviation', () => {
      ctx.render({
        notes: [
          { pitch: 'C4', length: '1/4' },
          { tempoChange: 'accelerando' },
          { pitch: 'D4', length: '1/8' },
          { pitch: 'E4', length: '1/8' },
        ],
      });

      const changes = ctx.getTempoChanges();
      expect(changes[0].classList.contains('tempo-change-accel')).toBe(true);
      expect(changes[0].textContent).toContain('accel.');
    });

    it('renders a tempo without dashes', () => {
      ctx.render({
        notes: [
          { tempoChange: 'ritardando' },
          { pitch: 'C4', length: '1/4' },
          { tempoChange: 'a-tempo' },
          { pitch: 'D4', length: '1/4' },
        ],
      });

      const changes = ctx.getTempoChanges();
      const aTempo = [...changes].find((el) => el.classList.contains('tempo-change-a-tempo'));
      expect(aTempo).toBeDefined();
      expect(aTempo.textContent).toContain('a tempo');
      expect(aTempo.querySelector('.tempo-change-dashes')).toBeNull();
    });

    it('does not count tempo change markers as notes', () => {
      ctx.render({
        notes: [
          { pitch: 'C4', length: '1/4' },
          { tempoChange: 'ritardando' },
          { pitch: 'D4', length: '1/4' },
        ],
      });

      expect(ctx.getNotes()).toHaveLength(2);
    });
  });

  describe('expression text', () => {
    it('renders expression as italic text', () => {
      ctx.render({
        notes: [
          { expression: 'dolce' },
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
        ],
      });

      const expressions = ctx.getExpressionTexts();
      expect(expressions).toHaveLength(1);
      expect(expressions[0].textContent).toContain('dolce');
    });

    it('renders the text in italic style', () => {
      ctx.render({
        notes: [{ expression: 'cantabile' }, { pitch: 'C4', length: '1/4' }],
      });

      const expr = ctx.getExpressionTexts()[0];
      const text = expr.querySelector('text');
      expect(text.getAttribute('font-style')).toBe('italic');
    });

    it('does not count expression markers as notes', () => {
      ctx.render({
        notes: [{ expression: 'dolce' }, { pitch: 'C4', length: '1/4' }],
      });

      expect(ctx.getNotes()).toHaveLength(1);
    });
  });

  describe('rehearsal marks', () => {
    it('renders a boxed letter above the staff', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { rehearsal: 'A' },
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
          { pitch: 'C5', length: '1/4' },
        ],
      });

      const marks = ctx.getRehearsalMarks();
      expect(marks).toHaveLength(1);
      expect(marks[0].textContent).toContain('A');
      expect(marks[0].querySelector('.rehearsal-box')).not.toBeNull();
    });

    it('renders number rehearsal marks', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { rehearsal: '1' },
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
          { pitch: 'C5', length: '1/4' },
        ],
      });

      const marks = ctx.getRehearsalMarks();
      expect(marks[0].textContent).toContain('1');
    });

    it('renders bold text with large font size', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [{ rehearsal: 'B' }, { pitch: 'C4', length: '1/1' }],
      });

      const mark = ctx.getRehearsalMarks()[0];
      const text = mark.querySelector('text');
      expect(text.getAttribute('font-weight')).toBe('bold');
      expect(text.getAttribute('font-size')).toBe('18');
    });

    it('does not count rehearsal markers as notes', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [{ rehearsal: 'A' }, { pitch: 'C4', length: '1/1' }],
      });

      expect(ctx.getNotes()).toHaveLength(1);
    });
  });

  describe('lyrics', () => {
    it('renders lyrics below each note that has a lyric property', () => {
      ctx.render({
        notes: [
          { pitch: 'C4', length: '1/4', lyric: 'Hel-' },
          { pitch: 'D4', length: '1/4', lyric: 'lo' },
          { pitch: 'E4', length: '1/2', lyric: 'world' },
        ],
      });

      const lyrics = ctx.getLyrics();
      expect(lyrics).toHaveLength(3);
      expect(lyrics[0].textContent).toContain('Hel-');
      expect(lyrics[1].textContent).toContain('lo');
      expect(lyrics[2].textContent).toContain('world');
    });

    it('does not render lyric elements for notes without lyrics', () => {
      ctx.render({
        notes: [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'D4', length: '1/4' },
        ],
      });

      const lyrics = ctx.getLyrics();
      expect(lyrics).toHaveLength(0);
    });

    it('renders melisma underscore when syllable spans multiple notes', () => {
      ctx.render({
        notes: [
          { pitch: 'C4', length: '1/4', lyric: 'love' },
          { pitch: 'D4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'F4', length: '1/4', lyric: 'you' },
        ],
      });

      const melismas = ctx.container.querySelectorAll('.lyric-melisma');
      expect(melismas.length).toBeGreaterThan(0);
    });

    it('preserves note count with lyrics present', () => {
      ctx.render({
        notes: [
          { pitch: 'C4', length: '1/4', lyric: 'one' },
          { pitch: 'D4', length: '1/4', lyric: 'two' },
          { pitch: 'E4', length: '1/4' },
        ],
      });

      expect(ctx.getNotes()).toHaveLength(3);
    });
  });

  describe('combined annotations', () => {
    it('renders multiple annotation types simultaneously', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { rehearsal: 'A' },
          { tempo: { bpm: 120, beat: '1/4', text: 'Allegro' } },
          { expression: 'dolce' },
          { pitch: 'C4', length: '1/4', lyric: 'La' },
          { pitch: 'D4', length: '1/4', lyric: 'la' },
          { pitch: 'E4', length: '1/4', lyric: 'la' },
          { pitch: 'F4', length: '1/4' },
        ],
      });

      expect(ctx.getRehearsalMarks()).toHaveLength(1);
      expect(ctx.getTempoMarkings()).toHaveLength(1);
      expect(ctx.getExpressionTexts()).toHaveLength(1);
      expect(ctx.getLyrics()).toHaveLength(3);
      expect(ctx.getNotes()).toHaveLength(4);
    });
  });
});
