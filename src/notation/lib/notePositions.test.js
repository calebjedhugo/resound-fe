import { parsePitch, getDiatonicPosition, pitchToStaffY, CLEF_CONSTANTS } from './notePositions';

describe('notePositions', () => {
  describe('parsePitch', () => {
    it('parses a simple pitch like C4', () => {
      const result = parsePitch('C4');

      expect(result.noteName).toBe('C');
      expect(result.accidental).toBe('');
      expect(result.octave).toBe(4);
      expect(result.noteIndex).toBe(0);
    });

    it('parses a sharp pitch like F#5', () => {
      const result = parsePitch('F#5');

      expect(result.noteName).toBe('F');
      expect(result.accidental).toBe('#');
      expect(result.octave).toBe(5);
      expect(result.noteIndex).toBe(3);
    });

    it('parses a flat pitch like Bb3', () => {
      const result = parsePitch('Bb3');

      expect(result.noteName).toBe('B');
      expect(result.accidental).toBe('b');
      expect(result.octave).toBe(3);
      expect(result.noteIndex).toBe(6);
    });

    it('parses the lowest note A0', () => {
      const result = parsePitch('A0');

      expect(result.noteName).toBe('A');
      expect(result.octave).toBe(0);
      expect(result.noteIndex).toBe(5);
    });

    it('parses the highest note C8', () => {
      const result = parsePitch('C8');

      expect(result.noteName).toBe('C');
      expect(result.octave).toBe(8);
      expect(result.noteIndex).toBe(0);
    });
  });

  describe('getDiatonicPosition', () => {
    it('returns 28 for C4 (octave*7 + noteIndex)', () => {
      expect(getDiatonicPosition('C4')).toBe(28);
    });

    it('returns 30 for E4', () => {
      expect(getDiatonicPosition('E4')).toBe(30);
    });

    it('returns 34 for B4', () => {
      expect(getDiatonicPosition('B4')).toBe(34);
    });

    it('returns 38 for F5', () => {
      expect(getDiatonicPosition('F5')).toBe(38);
    });

    it('treats sharps and flats as same diatonic position (C#4 = C4)', () => {
      expect(getDiatonicPosition('C#4')).toBe(getDiatonicPosition('C4'));
    });

    it('treats Db4 same diatonic position as D4', () => {
      expect(getDiatonicPosition('Db4')).toBe(getDiatonicPosition('D4'));
    });
  });

  describe('pitchToStaffY', () => {
    describe('treble clef (constant = 39)', () => {
      it('places C4 at y=110 (1 ledger line below)', () => {
        expect(pitchToStaffY('C4', 'treble')).toBe(110);
      });

      it('places E4 at y=90 (bottom line)', () => {
        expect(pitchToStaffY('E4', 'treble')).toBe(90);
      });

      it('places B4 at y=50 (middle line)', () => {
        expect(pitchToStaffY('B4', 'treble')).toBe(50);
      });

      it('places F5 at y=10 (top line)', () => {
        expect(pitchToStaffY('F5', 'treble')).toBe(10);
      });

      it('places G5 at y=0 (space above top line)', () => {
        expect(pitchToStaffY('G5', 'treble')).toBe(0);
      });

      it('places A5 at y=-10 (1 ledger line above)', () => {
        expect(pitchToStaffY('A5', 'treble')).toBe(-10);
      });
    });

    describe('bass clef (constant = 27)', () => {
      it('places G2 at y=90 (bottom line)', () => {
        // diatonicPos = 2*7 + 4 = 18, y = (27-18)*10 = 90
        expect(pitchToStaffY('G2', 'bass')).toBe(90);
      });

      it('places D3 at y=50 (middle line)', () => {
        // diatonicPos = 3*7 + 1 = 22, y = (27-22)*10 = 50
        expect(pitchToStaffY('D3', 'bass')).toBe(50);
      });

      it('places A3 at y=10 (top line)', () => {
        // diatonicPos = 3*7 + 5 = 26, y = (27-26)*10 = 10
        expect(pitchToStaffY('A3', 'bass')).toBe(10);
      });

      it('places C4 at y=-10 (1 ledger line above)', () => {
        // diatonicPos = 28, y = (27-28)*10 = -10
        expect(pitchToStaffY('C4', 'bass')).toBe(-10);
      });
    });

    describe('alto clef (constant = 33)', () => {
      it('places C4 at y=50 (middle line)', () => {
        // diatonicPos = 28, y = (33-28)*10 = 50
        expect(pitchToStaffY('C4', 'alto')).toBe(50);
      });
    });

    describe('tenor clef (constant = 31)', () => {
      it('places C4 at y=30 (4th line from bottom)', () => {
        // diatonicPos = 28, y = (31-28)*10 = 30
        expect(pitchToStaffY('C4', 'tenor')).toBe(30);
      });
    });

    it('accidentals do not affect Y position (C#4 same as C4)', () => {
      expect(pitchToStaffY('C#4', 'treble')).toBe(pitchToStaffY('C4', 'treble'));
    });
  });

  describe('CLEF_CONSTANTS', () => {
    it('has treble = 39', () => {
      expect(CLEF_CONSTANTS.treble).toBe(39);
    });

    it('has bass = 27', () => {
      expect(CLEF_CONSTANTS.bass).toBe(27);
    });

    it('has alto = 33', () => {
      expect(CLEF_CONSTANTS.alto).toBe(33);
    });

    it('has tenor = 31', () => {
      expect(CLEF_CONSTANTS.tenor).toBe(31);
    });
  });
});
