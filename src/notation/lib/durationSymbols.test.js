import { parseFraction, fractionToBeats, getDurationInfo, VALID_LENGTHS } from './durationSymbols';

describe('durationSymbols', () => {
  describe('parseFraction', () => {
    it('parses "1/4" into numerator and denominator', () => {
      expect(parseFraction('1/4')).toEqual({ numerator: 1, denominator: 4 });
    });

    it('parses "1/1"', () => {
      expect(parseFraction('1/1')).toEqual({ numerator: 1, denominator: 1 });
    });

    it('parses "1/32"', () => {
      expect(parseFraction('1/32')).toEqual({ numerator: 1, denominator: 32 });
    });

    it('throws on invalid fraction string', () => {
      expect(() => parseFraction('quarter')).toThrow();
    });

    it('throws on non-integer values', () => {
      expect(() => parseFraction('1.5/4')).toThrow();
    });
  });

  describe('fractionToBeats', () => {
    it('returns 4 for a whole note "1/1"', () => {
      expect(fractionToBeats('1/1')).toBe(4);
    });

    it('returns 2 for a half note "1/2"', () => {
      expect(fractionToBeats('1/2')).toBe(2);
    });

    it('returns 1 for a quarter note "1/4"', () => {
      expect(fractionToBeats('1/4')).toBe(1);
    });

    it('returns 0.5 for an eighth note "1/8"', () => {
      expect(fractionToBeats('1/8')).toBe(0.5);
    });

    it('returns 0.25 for a sixteenth note "1/16"', () => {
      expect(fractionToBeats('1/16')).toBe(0.25);
    });

    it('returns 0.125 for a thirty-second note "1/32"', () => {
      expect(fractionToBeats('1/32')).toBe(0.125);
    });
  });

  describe('getDurationInfo', () => {
    it('returns whole note info for "1/1"', () => {
      const info = getDurationInfo('1/1');

      expect(info.name).toBe('whole');
      expect(info.cssClass).toBe('note-whole');
      expect(info.hasStem).toBe(false);
      expect(info.filledHead).toBe(false);
      expect(info.flags).toBe(0);
      expect(info.beams).toBe(0);
      expect(info.spacing).toBe(80);
    });

    it('returns half note info for "1/2"', () => {
      const info = getDurationInfo('1/2');

      expect(info.name).toBe('half');
      expect(info.cssClass).toBe('note-half');
      expect(info.hasStem).toBe(true);
      expect(info.filledHead).toBe(false);
      expect(info.flags).toBe(0);
      expect(info.beams).toBe(0);
      expect(info.spacing).toBe(60);
    });

    it('returns quarter note info for "1/4"', () => {
      const info = getDurationInfo('1/4');

      expect(info.name).toBe('quarter');
      expect(info.cssClass).toBe('note-quarter');
      expect(info.hasStem).toBe(true);
      expect(info.filledHead).toBe(true);
      expect(info.flags).toBe(0);
      expect(info.beams).toBe(0);
      expect(info.spacing).toBe(40);
    });

    it('returns eighth note info for "1/8"', () => {
      const info = getDurationInfo('1/8');

      expect(info.name).toBe('eighth');
      expect(info.cssClass).toBe('note-eighth');
      expect(info.hasStem).toBe(true);
      expect(info.filledHead).toBe(true);
      expect(info.flags).toBe(1);
      expect(info.beams).toBe(1);
      expect(info.spacing).toBe(30);
    });

    it('returns 16th note info for "1/16"', () => {
      const info = getDurationInfo('1/16');

      expect(info.name).toBe('16th');
      expect(info.cssClass).toBe('note-16th');
      expect(info.hasStem).toBe(true);
      expect(info.filledHead).toBe(true);
      expect(info.flags).toBe(2);
      expect(info.beams).toBe(2);
      expect(info.spacing).toBe(25);
    });

    it('returns 32nd note info for "1/32"', () => {
      const info = getDurationInfo('1/32');

      expect(info.name).toBe('32nd');
      expect(info.cssClass).toBe('note-32nd');
      expect(info.hasStem).toBe(true);
      expect(info.filledHead).toBe(true);
      expect(info.flags).toBe(3);
      expect(info.beams).toBe(3);
    });

    it('throws on unrecognized length', () => {
      expect(() => getDurationInfo('1/3')).toThrow();
    });
  });

  describe('VALID_LENGTHS', () => {
    it('contains all six standard note lengths', () => {
      expect(VALID_LENGTHS).toContain('1/1');
      expect(VALID_LENGTHS).toContain('1/2');
      expect(VALID_LENGTHS).toContain('1/4');
      expect(VALID_LENGTHS).toContain('1/8');
      expect(VALID_LENGTHS).toContain('1/16');
      expect(VALID_LENGTHS).toContain('1/32');
      expect(VALID_LENGTHS).toHaveLength(6);
    });
  });
});
