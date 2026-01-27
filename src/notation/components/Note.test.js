/** @jest-environment jsdom */

import { createNote } from './Note';

describe('Note', () => {
  describe('createNote', () => {
    it('returns a <g> element with note class and duration class', () => {
      const g = createNote({ pitch: 'C4', length: '1/4', x: 100, clef: 'treble' });
      expect(g.tagName).toBe('g');
      expect(g.classList.contains('note')).toBe(true);
      expect(g.classList.contains('note-quarter')).toBe(true);
    });

    it('positions the group via transform translate', () => {
      const g = createNote({ pitch: 'B4', length: '1/4', x: 100, clef: 'treble' });
      // B4 treble: y = (39-34)*10 = 50
      expect(g.getAttribute('transform')).toBe('translate(100, 50)');
    });

    it('uses the correct Y for different pitches', () => {
      const g = createNote({ pitch: 'E4', length: '1/4', x: 50, clef: 'treble' });
      // E4 treble: diatonic = 4*7+2=30, y = (39-30)*10 = 90
      expect(g.getAttribute('transform')).toBe('translate(50, 90)');
    });

    it('uses bass clef Y positions', () => {
      const g = createNote({ pitch: 'D3', length: '1/4', x: 50, clef: 'bass' });
      // D3 bass: diatonic = 3*7+1=22, y = (27-22)*10 = 50
      expect(g.getAttribute('transform')).toBe('translate(50, 50)');
    });
  });

  describe('note head', () => {
    it('renders a filled ellipse for quarter notes', () => {
      const g = createNote({ pitch: 'C4', length: '1/4', x: 0, clef: 'treble' });
      const head = g.querySelector('.note-head');
      expect(head).not.toBeNull();
      expect(head.tagName).toBe('ellipse');
      expect(head.getAttribute('fill')).not.toBe('none');
    });

    it('renders an open ellipse for half notes', () => {
      const g = createNote({ pitch: 'C4', length: '1/2', x: 0, clef: 'treble' });
      const head = g.querySelector('.note-head');
      expect(head.getAttribute('fill')).toBe('none');
    });

    it('renders an open ellipse for whole notes', () => {
      const g = createNote({ pitch: 'C4', length: '1/1', x: 0, clef: 'treble' });
      const head = g.querySelector('.note-head');
      expect(head.getAttribute('fill')).toBe('none');
    });

    it('renders a filled ellipse for eighth notes', () => {
      const g = createNote({ pitch: 'C4', length: '1/8', x: 0, clef: 'treble' });
      const head = g.querySelector('.note-head');
      expect(head.getAttribute('fill')).not.toBe('none');
    });
  });

  describe('stems', () => {
    it('renders a stem for quarter notes', () => {
      const g = createNote({ pitch: 'C4', length: '1/4', x: 0, clef: 'treble' });
      const stem = g.querySelector('.note-stem');
      expect(stem).not.toBeNull();
      expect(stem.tagName).toBe('line');
    });

    it('does not render a stem for whole notes', () => {
      const g = createNote({ pitch: 'C4', length: '1/1', x: 0, clef: 'treble' });
      const stem = g.querySelector('.note-stem');
      expect(stem).toBeNull();
    });

    it('renders stem down for notes on or above the middle line', () => {
      // B4 treble → y=50 (middle line) → stem down
      const g = createNote({ pitch: 'B4', length: '1/4', x: 0, clef: 'treble' });
      const stem = g.querySelector('.note-stem');
      // Stem down: goes from head toward positive Y
      const y1 = Number(stem.getAttribute('y1'));
      const y2 = Number(stem.getAttribute('y2'));
      expect(y2).toBeGreaterThan(y1);
    });

    it('renders stem down for notes above the middle line', () => {
      // F5 treble → y=10 (top line) → stem down
      const g = createNote({ pitch: 'F5', length: '1/4', x: 0, clef: 'treble' });
      const stem = g.querySelector('.note-stem');
      const y1 = Number(stem.getAttribute('y1'));
      const y2 = Number(stem.getAttribute('y2'));
      expect(y2).toBeGreaterThan(y1);
    });

    it('renders stem up for notes below the middle line', () => {
      // E4 treble → y=90 (bottom line) → stem up
      const g = createNote({ pitch: 'E4', length: '1/4', x: 0, clef: 'treble' });
      const stem = g.querySelector('.note-stem');
      // Stem up: goes from head toward negative Y
      const y1 = Number(stem.getAttribute('y1'));
      const y2 = Number(stem.getAttribute('y2'));
      expect(y2).toBeLessThan(y1);
    });

    it('positions stem on left side when down, right side when up', () => {
      // Stem down (above middle): left side of head → negative x
      const gDown = createNote({ pitch: 'F5', length: '1/4', x: 0, clef: 'treble' });
      const stemDown = gDown.querySelector('.note-stem');
      expect(Number(stemDown.getAttribute('x1'))).toBeLessThan(0);

      // Stem up (below middle): right side of head → positive x
      const gUp = createNote({ pitch: 'E4', length: '1/4', x: 0, clef: 'treble' });
      const stemUp = gUp.querySelector('.note-stem');
      expect(Number(stemUp.getAttribute('x1'))).toBeGreaterThan(0);
    });
  });

  describe('flags', () => {
    it('renders a flag for eighth notes', () => {
      const g = createNote({ pitch: 'C4', length: '1/8', x: 0, clef: 'treble' });
      const flag = g.querySelector('.note-flag');
      expect(flag).not.toBeNull();
    });

    it('renders flags for 16th notes', () => {
      const g = createNote({ pitch: 'C4', length: '1/16', x: 0, clef: 'treble' });
      const flags = g.querySelectorAll('.note-flag');
      expect(flags).toHaveLength(2);
    });

    it('does not render flags for quarter notes', () => {
      const g = createNote({ pitch: 'C4', length: '1/4', x: 0, clef: 'treble' });
      const flag = g.querySelector('.note-flag');
      expect(flag).toBeNull();
    });

    it('does not render flags for half notes', () => {
      const g = createNote({ pitch: 'C4', length: '1/2', x: 0, clef: 'treble' });
      const flag = g.querySelector('.note-flag');
      expect(flag).toBeNull();
    });
  });

  describe('beamed flag', () => {
    it('suppresses flags when beamed is true', () => {
      const g = createNote({ pitch: 'C4', length: '1/8', x: 0, clef: 'treble', beamed: true });
      const flag = g.querySelector('.note-flag');
      expect(flag).toBeNull();
    });

    it('still renders stem when beamed', () => {
      const g = createNote({ pitch: 'C4', length: '1/8', x: 0, clef: 'treble', beamed: true });
      expect(g.querySelector('.note-stem')).not.toBeNull();
    });

    it('still renders note head when beamed', () => {
      const g = createNote({ pitch: 'C4', length: '1/8', x: 0, clef: 'treble', beamed: true });
      expect(g.querySelector('.note-head')).not.toBeNull();
    });
  });

  describe('stemDown override', () => {
    it('forces stem down when stemDown is true', () => {
      // E4 is at y=90 (below middle line), normally stem up
      const g = createNote({ pitch: 'E4', length: '1/4', x: 0, clef: 'treble', stemDown: true });
      const stem = g.querySelector('.note-stem');
      const y2 = Number(stem.getAttribute('y2'));
      expect(y2).toBeGreaterThan(0); // positive = downward
    });

    it('forces stem up when stemDown is false', () => {
      // B4 is at y=50 (middle line), normally stem down
      const g = createNote({ pitch: 'B4', length: '1/4', x: 0, clef: 'treble', stemDown: false });
      const stem = g.querySelector('.note-stem');
      const y2 = Number(stem.getAttribute('y2'));
      expect(y2).toBeLessThan(0); // negative = upward
    });

    it('uses auto direction when stemDown is undefined', () => {
      // B4 at y=50 → auto stem down
      const g = createNote({ pitch: 'B4', length: '1/4', x: 0, clef: 'treble' });
      const stem = g.querySelector('.note-stem');
      const y2 = Number(stem.getAttribute('y2'));
      expect(y2).toBeGreaterThan(0); // auto: down for y<=50
    });
  });

  describe('duration class variations', () => {
    it('uses note-half class for half notes', () => {
      const g = createNote({ pitch: 'C4', length: '1/2', x: 0, clef: 'treble' });
      expect(g.classList.contains('note-half')).toBe(true);
    });

    it('uses note-whole class for whole notes', () => {
      const g = createNote({ pitch: 'C4', length: '1/1', x: 0, clef: 'treble' });
      expect(g.classList.contains('note-whole')).toBe(true);
    });

    it('uses note-eighth class for eighth notes', () => {
      const g = createNote({ pitch: 'C4', length: '1/8', x: 0, clef: 'treble' });
      expect(g.classList.contains('note-eighth')).toBe(true);
    });
  });
});
