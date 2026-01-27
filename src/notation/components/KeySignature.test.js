/** @jest-environment jsdom */

import { createKeySignature, KEY_SIG_POSITIONS } from 'notation/components/KeySignature';

describe('KeySignature', () => {
  describe('createKeySignature', () => {
    it('returns null for key of C (no accidentals)', () => {
      const result = createKeySignature('C', 'treble');
      expect(result).toBeNull();
    });

    it('returns a group with class "key-signature"', () => {
      const group = createKeySignature('G', 'treble');
      expect(group.getAttribute('class')).toBe('key-signature');
    });

    it('renders one sharp for key of G', () => {
      const group = createKeySignature('G', 'treble');
      const accidentals = group.querySelectorAll('.accidental');
      expect(accidentals).toHaveLength(1);
      expect(accidentals[0].classList.contains('sharp')).toBe(true);
    });

    it('renders two sharps for key of D', () => {
      const group = createKeySignature('D', 'treble');
      const accidentals = group.querySelectorAll('.accidental');
      expect(accidentals).toHaveLength(2);
    });

    it('renders one flat for key of F', () => {
      const group = createKeySignature('F', 'treble');
      const accidentals = group.querySelectorAll('.accidental');
      expect(accidentals).toHaveLength(1);
      expect(accidentals[0].classList.contains('flat')).toBe(true);
    });

    it('renders three flats for key of Eb', () => {
      const group = createKeySignature('Eb', 'treble');
      const accidentals = group.querySelectorAll('.accidental');
      expect(accidentals).toHaveLength(3);
    });

    it('spaces accidentals 10px apart horizontally', () => {
      const group = createKeySignature('D', 'treble');
      const accidentals = group.querySelectorAll('.accidental');

      const x0 = parseFloat(
        accidentals[0].getAttribute('transform').match(/translate\(([^,]+)/)[1]
      );
      const x1 = parseFloat(
        accidentals[1].getAttribute('transform').match(/translate\(([^,]+)/)[1]
      );
      expect(x1 - x0).toBe(10);
    });

    it('positions sharps at correct Y for treble clef', () => {
      // G major = 1 sharp (F#). In treble clef, F#5 is at y=10 (top line)
      const group = createKeySignature('G', 'treble');
      const accidental = group.querySelector('.accidental');
      const transform = accidental.getAttribute('transform');
      const y = parseFloat(transform.match(/translate\([^,]+,\s*([^)]+)\)/)[1]);
      expect(y).toBe(10); // F5 top line in treble
    });

    it('positions flats at correct Y for treble clef', () => {
      // F major = 1 flat (Bb). In treble clef, B4 is at y=50 (middle line)
      const group = createKeySignature('F', 'treble');
      const accidental = group.querySelector('.accidental');
      const transform = accidental.getAttribute('transform');
      const y = parseFloat(transform.match(/translate\([^,]+,\s*([^)]+)\)/)[1]);
      expect(y).toBe(50); // B4 middle line in treble
    });

    it('positions sharps at correct Y for bass clef', () => {
      // G major = 1 sharp (F#). In bass clef, F3 is at y=30
      const group = createKeySignature('G', 'bass');
      const accidental = group.querySelector('.accidental');
      const transform = accidental.getAttribute('transform');
      const y = parseFloat(transform.match(/translate\([^,]+,\s*([^)]+)\)/)[1]);
      expect(y).toBe(30); // F3 in bass clef
    });

    it('positions flats at correct Y for bass clef', () => {
      // F major = 1 flat (Bb). In bass clef, B2 is at y=70
      const group = createKeySignature('F', 'bass');
      const accidental = group.querySelector('.accidental');
      const transform = accidental.getAttribute('transform');
      const y = parseFloat(transform.match(/translate\([^,]+,\s*([^)]+)\)/)[1]);
      expect(y).toBe(70); // B2 in bass clef
    });

    it('renders all 7 sharps for C# major', () => {
      const group = createKeySignature('C#', 'treble');
      const accidentals = group.querySelectorAll('.accidental');
      expect(accidentals).toHaveLength(7);
    });

    it('renders all 7 flats for Cb major', () => {
      const group = createKeySignature('Cb', 'treble');
      const accidentals = group.querySelectorAll('.accidental');
      expect(accidentals).toHaveLength(7);
    });

    it('throws for invalid key signature', () => {
      expect(() => createKeySignature('X', 'treble')).toThrow();
    });
  });

  describe('KEY_SIG_POSITIONS', () => {
    it('has positions for treble and bass clefs', () => {
      expect(KEY_SIG_POSITIONS.treble).toBeDefined();
      expect(KEY_SIG_POSITIONS.bass).toBeDefined();
    });

    it('has sharp and flat arrays for each clef', () => {
      expect(KEY_SIG_POSITIONS.treble.sharp).toHaveLength(7);
      expect(KEY_SIG_POSITIONS.treble.flat).toHaveLength(7);
      expect(KEY_SIG_POSITIONS.bass.sharp).toHaveLength(7);
      expect(KEY_SIG_POSITIONS.bass.flat).toHaveLength(7);
    });
  });
});
