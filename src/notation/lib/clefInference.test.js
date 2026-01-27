import { inferClef } from './clefInference';

describe('clefInference', () => {
  describe('inferClef', () => {
    describe('pitched notes', () => {
      it('returns treble when median pitch is C4', () => {
        const notes = [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
        ];

        expect(inferClef(notes)).toBe('treble');
      });

      it('returns treble when median pitch is above C4', () => {
        const notes = [
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
          { pitch: 'C5', length: '1/4' },
        ];

        expect(inferClef(notes)).toBe('treble');
      });

      it('returns bass when median pitch is below C4', () => {
        const notes = [
          { pitch: 'C3', length: '1/4' },
          { pitch: 'E3', length: '1/4' },
          { pitch: 'G3', length: '1/4' },
        ];

        expect(inferClef(notes)).toBe('bass');
      });

      it('returns treble for a single high note', () => {
        expect(inferClef([{ pitch: 'A5', length: '1/4' }])).toBe('treble');
      });

      it('returns bass for a single low note', () => {
        expect(inferClef([{ pitch: 'A2', length: '1/4' }])).toBe('bass');
      });

      it('uses median (not mean) - outliers do not dominate', () => {
        // Three notes: B2, C4, C4 — median is C4 → treble
        const notes = [
          { pitch: 'B2', length: '1/4' },
          { pitch: 'C4', length: '1/4' },
          { pitch: 'C4', length: '1/4' },
        ];

        expect(inferClef(notes)).toBe('treble');
      });

      it('handles even number of notes (averages two middle values)', () => {
        // B3 (pos=27), C4 (pos=28) — average = 27.5, < 28 → bass
        const notes = [
          { pitch: 'B3', length: '1/4' },
          { pitch: 'C4', length: '1/4' },
        ];

        expect(inferClef(notes)).toBe('bass');
      });
    });

    describe('rests and mixed content', () => {
      it('ignores rests when calculating median', () => {
        const notes = [
          { pitch: 'E4', length: '1/4' },
          { length: '1/4' }, // rest
          { pitch: 'G4', length: '1/4' },
          { length: '1/4' }, // rest
        ];

        expect(inferClef(notes)).toBe('treble');
      });

      it('ignores rests among low notes', () => {
        const notes = [
          { pitch: 'E2', length: '1/4' },
          { length: '1/4' }, // rest
          { pitch: 'G2', length: '1/4' },
        ];

        expect(inferClef(notes)).toBe('bass');
      });
    });

    describe('chords', () => {
      it('includes all pitches from chord arrays in median calculation', () => {
        // Chord with C4, E4, G4 — all >= C4 → treble
        const notes = [
          [
            { pitch: 'C4', length: '1/4' },
            { pitch: 'E4', length: '1/4' },
            { pitch: 'G4', length: '1/4' },
          ],
        ];

        expect(inferClef(notes)).toBe('treble');
      });
    });

    describe('percussion and unpitched', () => {
      it('returns percussion when all notes use position (no pitch)', () => {
        const notes = [
          { position: 1, length: '1/4' },
          { position: 5, length: '1/4' },
          { position: 9, length: '1/4' },
        ];

        expect(inferClef(notes)).toBe('percussion');
      });

      it('returns percussion when all elements are rests', () => {
        const notes = [{ length: '1/4' }, { length: '1/4' }];

        expect(inferClef(notes)).toBe('percussion');
      });

      it('returns percussion for empty notes array', () => {
        expect(inferClef([])).toBe('percussion');
      });
    });
  });
});
