import { getKeySignature, isValidKeySignature, SHARP_ORDER, FLAT_ORDER } from './keySignatures';

describe('keySignatures', () => {
  describe('SHARP_ORDER', () => {
    it('lists sharps in standard order: F C G D A E B', () => {
      expect(SHARP_ORDER).toEqual(['F', 'C', 'G', 'D', 'A', 'E', 'B']);
    });
  });

  describe('FLAT_ORDER', () => {
    it('lists flats in standard order: B E A D G C F', () => {
      expect(FLAT_ORDER).toEqual(['B', 'E', 'A', 'D', 'G', 'C', 'F']);
    });
  });

  describe('getKeySignature', () => {
    describe('no accidentals', () => {
      it('returns no accidentals for key of C', () => {
        const result = getKeySignature('C');

        expect(result.type).toBe('none');
        expect(result.accidentals).toEqual([]);
        expect(result.count).toBe(0);
      });
    });

    describe('sharp keys', () => {
      it('returns 1 sharp (F#) for G major', () => {
        const result = getKeySignature('G');

        expect(result.type).toBe('sharp');
        expect(result.accidentals).toEqual(['F']);
        expect(result.count).toBe(1);
      });

      it('returns 2 sharps (F#, C#) for D major', () => {
        const result = getKeySignature('D');

        expect(result.type).toBe('sharp');
        expect(result.accidentals).toEqual(['F', 'C']);
        expect(result.count).toBe(2);
      });

      it('returns 3 sharps for A major', () => {
        const result = getKeySignature('A');

        expect(result.type).toBe('sharp');
        expect(result.accidentals).toEqual(['F', 'C', 'G']);
        expect(result.count).toBe(3);
      });

      it('returns 4 sharps for E major', () => {
        const result = getKeySignature('E');

        expect(result.type).toBe('sharp');
        expect(result.accidentals).toEqual(['F', 'C', 'G', 'D']);
        expect(result.count).toBe(4);
      });

      it('returns 5 sharps for B major', () => {
        const result = getKeySignature('B');

        expect(result.type).toBe('sharp');
        expect(result.accidentals).toEqual(['F', 'C', 'G', 'D', 'A']);
        expect(result.count).toBe(5);
      });

      it('returns 6 sharps for F# major', () => {
        const result = getKeySignature('F#');

        expect(result.type).toBe('sharp');
        expect(result.accidentals).toEqual(['F', 'C', 'G', 'D', 'A', 'E']);
        expect(result.count).toBe(6);
      });

      it('returns 7 sharps for C# major', () => {
        const result = getKeySignature('C#');

        expect(result.type).toBe('sharp');
        expect(result.accidentals).toEqual(['F', 'C', 'G', 'D', 'A', 'E', 'B']);
        expect(result.count).toBe(7);
      });
    });

    describe('flat keys', () => {
      it('returns 1 flat (Bb) for F major', () => {
        const result = getKeySignature('F');

        expect(result.type).toBe('flat');
        expect(result.accidentals).toEqual(['B']);
        expect(result.count).toBe(1);
      });

      it('returns 2 flats (Bb, Eb) for Bb major', () => {
        const result = getKeySignature('Bb');

        expect(result.type).toBe('flat');
        expect(result.accidentals).toEqual(['B', 'E']);
        expect(result.count).toBe(2);
      });

      it('returns 3 flats for Eb major', () => {
        const result = getKeySignature('Eb');

        expect(result.type).toBe('flat');
        expect(result.accidentals).toEqual(['B', 'E', 'A']);
        expect(result.count).toBe(3);
      });

      it('returns 4 flats for Ab major', () => {
        const result = getKeySignature('Ab');

        expect(result.type).toBe('flat');
        expect(result.accidentals).toEqual(['B', 'E', 'A', 'D']);
        expect(result.count).toBe(4);
      });

      it('returns 5 flats for Db major', () => {
        const result = getKeySignature('Db');

        expect(result.type).toBe('flat');
        expect(result.accidentals).toEqual(['B', 'E', 'A', 'D', 'G']);
        expect(result.count).toBe(5);
      });

      it('returns 6 flats for Gb major', () => {
        const result = getKeySignature('Gb');

        expect(result.type).toBe('flat');
        expect(result.accidentals).toEqual(['B', 'E', 'A', 'D', 'G', 'C']);
        expect(result.count).toBe(6);
      });

      it('returns 7 flats for Cb major', () => {
        const result = getKeySignature('Cb');

        expect(result.type).toBe('flat');
        expect(result.accidentals).toEqual(['B', 'E', 'A', 'D', 'G', 'C', 'F']);
        expect(result.count).toBe(7);
      });
    });

    it('throws on invalid key', () => {
      expect(() => getKeySignature('X')).toThrow();
    });
  });

  describe('isValidKeySignature', () => {
    it('returns true for C', () => {
      expect(isValidKeySignature('C')).toBe(true);
    });

    it('returns true for all sharp keys', () => {
      expect(isValidKeySignature('G')).toBe(true);
      expect(isValidKeySignature('D')).toBe(true);
      expect(isValidKeySignature('A')).toBe(true);
      expect(isValidKeySignature('E')).toBe(true);
      expect(isValidKeySignature('B')).toBe(true);
      expect(isValidKeySignature('F#')).toBe(true);
      expect(isValidKeySignature('C#')).toBe(true);
    });

    it('returns true for all flat keys', () => {
      expect(isValidKeySignature('F')).toBe(true);
      expect(isValidKeySignature('Bb')).toBe(true);
      expect(isValidKeySignature('Eb')).toBe(true);
      expect(isValidKeySignature('Ab')).toBe(true);
      expect(isValidKeySignature('Db')).toBe(true);
      expect(isValidKeySignature('Gb')).toBe(true);
      expect(isValidKeySignature('Cb')).toBe(true);
    });

    it('returns false for invalid keys', () => {
      expect(isValidKeySignature('X')).toBe(false);
      expect(isValidKeySignature('H')).toBe(false);
      expect(isValidKeySignature('')).toBe(false);
    });
  });
});
