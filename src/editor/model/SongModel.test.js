/**
 * SongModel Tests
 *
 * Tests the pure-logic measure-aware song editing model.
 * No UI or browser dependencies.
 */
import SongModel from 'editor/model/SongModel';

describe('SongModel', () => {
  let model;

  beforeEach(() => {
    model = new SongModel();
  });

  // ── Insertion & Removal ──────────────────────────────────────────────

  describe('insertNote', () => {
    it('inserts at index 0 and pushes existing notes forward', () => {
      model.appendNote('D4', '1/4');
      model.appendNote('E4', '1/4');

      model.moveCursor('left');
      model.moveCursor('left');
      model.insertNote('C4', '1/4');

      const notes = model.toSongArray();
      expect(notes).toEqual([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ]);
    });

    it('inserts in the middle of a song at the cursor position', () => {
      model.appendNote('C4', '1/4');
      model.appendNote('E4', '1/4');

      // Cursor is at 2 (end). Move left once to position 1.
      model.moveCursor('left');
      model.insertNote('D4', '1/4');

      const notes = model.toSongArray();
      expect(notes).toEqual([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ]);
    });
  });

  describe('appendNote', () => {
    it('adds a note to the end and moves cursor to the new note', () => {
      model.appendNote('C4', '1/4');
      model.appendNote('D4', '1/4');
      model.appendNote('E4', '1/4');

      const notes = model.toSongArray();
      expect(notes).toEqual([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ]);
      expect(model.cursorPosition).toBe(3);
    });
  });

  describe('removeNote', () => {
    it('removes the entry and shifts remaining notes', () => {
      model.appendNote('C4', '1/4');
      model.appendNote('D4', '1/4');
      model.appendNote('E4', '1/4');

      model.removeNote(1);

      const notes = model.toSongArray();
      expect(notes).toEqual([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ]);
    });

    it('is a no-op on an empty song', () => {
      expect(() => model.removeNote(0)).not.toThrow();
      expect(model.toSongArray()).toEqual([]);
    });
  });

  // ── Chords ───────────────────────────────────────────────────────────

  describe('makeChord', () => {
    it('converts a single note into a chord array with both pitches', () => {
      model.appendNote('C4', '1/4');

      model.makeChord(0, 'E4', '1/4');

      const notes = model.toSongArray();
      expect(notes[0]).toEqual([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ]);
    });

    it('adds another pitch to an existing chord', () => {
      model.appendNote('C4', '1/4');
      model.makeChord(0, 'E4', '1/4');
      model.makeChord(0, 'G4', '1/4');

      const notes = model.toSongArray();
      expect(notes[0]).toEqual([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ]);
    });
  });

  // ── Transposition ────────────────────────────────────────────────────

  describe('transposeUp', () => {
    it('transposes C4 to C#4', () => {
      model.appendNote('C4', '1/4');

      model.transposeUp(0);

      expect(model.toSongArray()[0].pitch).toBe('C#4');
    });

    it('transposes E4 to F4 (no accidental needed)', () => {
      model.appendNote('E4', '1/4');

      model.transposeUp(0);

      expect(model.toSongArray()[0].pitch).toBe('F4');
    });

    it('transposes B4 to C5 (octave crossing)', () => {
      model.appendNote('B4', '1/4');

      model.transposeUp(0);

      expect(model.toSongArray()[0].pitch).toBe('C5');
    });
  });

  describe('transposeDown', () => {
    it('transposes C4 to B3 (octave crossing)', () => {
      model.appendNote('C4', '1/4');

      model.transposeDown(0);

      expect(model.toSongArray()[0].pitch).toBe('B3');
    });

    it('transposes Db4 to C4', () => {
      model.appendNote('Db4', '1/4');

      model.transposeDown(0);

      expect(model.toSongArray()[0].pitch).toBe('C4');
    });
  });

  // ── Duration ─────────────────────────────────────────────────────────

  describe('setDuration', () => {
    it("changes a note's length", () => {
      model.appendNote('C4', '1/4');

      model.setDuration(0, '1/8');

      expect(model.toSongArray()[0].length).toBe('1/8');
    });
  });

  describe('toggleDot', () => {
    it('converts a quarter note (1/4) to a dotted quarter (3/8)', () => {
      model.appendNote('C4', '1/4');

      model.toggleDot(0);

      expect(model.toSongArray()[0].length).toBe('3/8');
    });

    it('converts a dotted quarter (3/8) back to a quarter note (1/4)', () => {
      model.appendNote('C4', '3/8');

      model.toggleDot(0);

      expect(model.toSongArray()[0].length).toBe('1/4');
    });
  });

  // ── Measures ─────────────────────────────────────────────────────────

  describe('getMeasures', () => {
    it('groups four quarter notes into one measure in 4/4', () => {
      model.appendNote('C4', '1/4');
      model.appendNote('D4', '1/4');
      model.appendNote('E4', '1/4');
      model.appendNote('F4', '1/4');

      const measures = model.getMeasures();

      expect(measures.length).toBe(1);
      expect(measures[0].length).toBe(4);
    });

    it('splits five quarter notes into two measures in 4/4', () => {
      model.appendNote('C4', '1/4');
      model.appendNote('D4', '1/4');
      model.appendNote('E4', '1/4');
      model.appendNote('F4', '1/4');
      model.appendNote('G4', '1/4');

      const measures = model.getMeasures();

      expect(measures.length).toBe(2);
      expect(measures[0].length).toBe(4);
      expect(measures[1].length).toBe(1);
    });
  });

  describe('getRemainingBeats', () => {
    it('returns correct value mid-measure', () => {
      model.appendNote('C4', '1/4');
      model.appendNote('D4', '1/4');

      // Cursor is at 2 (after two quarter notes = 0.5 whole notes used).
      // Measure capacity in 4/4 = 1.0 whole notes.
      // Remaining = 0.5 whole notes = 2 quarter-note beats.
      expect(model.getRemainingBeats()).toBe(2);
    });
  });

  describe('advanceCursor', () => {
    it('moves cursor forward past the last note', () => {
      model.appendNote('C4', '1/4');
      model.appendNote('D4', '1/4');

      // Cursor starts at 2 (end). Move back to 0.
      model.moveCursor('left');
      model.moveCursor('left');
      expect(model.cursorPosition).toBe(0);

      model.advanceCursor();
      expect(model.cursorPosition).toBe(1);

      model.advanceCursor();
      expect(model.cursorPosition).toBe(2);

      // Already at end; should still increment (past end)
      model.advanceCursor();
      expect(model.cursorPosition).toBe(2); // capped at notes.length
    });
  });

  // ── Cursor ───────────────────────────────────────────────────────────

  describe('moveCursor', () => {
    it('left decrements cursor position', () => {
      model.appendNote('C4', '1/4');
      model.appendNote('D4', '1/4');
      // Cursor is at 2 (end)

      model.moveCursor('left');
      expect(model.cursorPosition).toBe(1);
    });

    it('right increments cursor position', () => {
      model.appendNote('C4', '1/4');
      model.appendNote('D4', '1/4');
      // Cursor at 2 (end). Move to 0 first.
      model.moveCursor('left');
      model.moveCursor('left');
      expect(model.cursorPosition).toBe(0);

      model.moveCursor('right');
      expect(model.cursorPosition).toBe(1);
    });

    it('left at position 0 stays at 0', () => {
      model.appendNote('C4', '1/4');
      model.moveCursor('left'); // now at 0

      model.moveCursor('left');
      expect(model.cursorPosition).toBe(0);
    });

    it('right past end stays at notes.length', () => {
      model.appendNote('C4', '1/4');
      // Cursor is at 1 (end = notes.length)

      model.moveCursor('right');
      expect(model.cursorPosition).toBe(1);
    });
  });

  // ── Accidentals ───────────────────────────────────────────────────────

  describe('setAccidental', () => {
    it('adds sharp to a natural note', () => {
      model.appendNote('F4', '1/4');
      model.setAccidental(0, '#');
      expect(model.toSongArray()[0].pitch).toBe('F#4');
    });

    it('adds flat to a natural note', () => {
      model.appendNote('B4', '1/4');
      model.setAccidental(0, 'b');
      expect(model.toSongArray()[0].pitch).toBe('Bb4');
    });

    it('removes accidental from a sharp note', () => {
      model.appendNote('F#4', '1/4');
      model.setAccidental(0, '');
      expect(model.toSongArray()[0].pitch).toBe('F4');
    });

    it('removes accidental from a flat note', () => {
      model.appendNote('Bb4', '1/4');
      model.setAccidental(0, '');
      expect(model.toSongArray()[0].pitch).toBe('B4');
    });

    it('replaces sharp with flat', () => {
      model.appendNote('F#4', '1/4');
      model.setAccidental(0, 'b');
      expect(model.toSongArray()[0].pitch).toBe('Fb4');
    });

    it('replaces flat with sharp', () => {
      model.appendNote('Bb4', '1/4');
      model.setAccidental(0, '#');
      expect(model.toSongArray()[0].pitch).toBe('B#4');
    });

    it('no-ops on out-of-range index', () => {
      model.appendNote('C4', '1/4');
      model.setAccidental(5, '#');
      expect(model.toSongArray()[0].pitch).toBe('C4');
    });

    it('applies accidental to all notes in a chord', () => {
      model.appendNote('C4', '1/4');
      model.makeChord(0, 'E4', '1/4');
      model.setAccidental(0, '#');
      const chord = model.toSongArray()[0];
      expect(chord[0].pitch).toBe('C#4');
      expect(chord[1].pitch).toBe('E#4');
    });

    it('preserves octave number when changing accidental', () => {
      model.appendNote('G5', '1/4');
      model.setAccidental(0, 'b');
      expect(model.toSongArray()[0].pitch).toBe('Gb5');
    });

    it('does not normalize flats to sharps (preserves spelling)', () => {
      model.appendNote('E4', '1/4');
      model.setAccidental(0, 'b');
      // Eb4 should stay Eb4, not be converted to D#4
      expect(model.toSongArray()[0].pitch).toBe('Eb4');
    });
  });

  // ── Rests ─────────────────────────────────────────────────────────────

  describe('insertRest', () => {
    it('inserts a rest object without a pitch property at cursor position', () => {
      model.appendNote('C4', '1/4');
      model._cursorPosition = 0;
      model.insertRest('1/4');
      const notes = model.toSongArray();
      expect(notes[0]).toEqual({ length: '1/4' });
      expect(notes[0].pitch).toBeUndefined();
    });

    it('rest has the specified length', () => {
      model.insertRest('1/8');
      expect(model.toSongArray()[0].length).toBe('1/8');
    });

    it('cursor stays at the inserted position', () => {
      model.insertRest('1/4');
      expect(model._cursorPosition).toBe(0);
    });
  });

  describe('appendRest', () => {
    it('appends a rest at the end of the notes array', () => {
      model.appendNote('C4', '1/4');
      model.appendRest('1/2');
      const notes = model.toSongArray();
      expect(notes[1]).toEqual({ length: '1/2' });
    });

    it('advances the cursor past the rest', () => {
      model.appendRest('1/4');
      expect(model._cursorPosition).toBe(1);
    });
  });

  describe('rest guards on existing methods', () => {
    it('transposeUp no-ops on a rest entry', () => {
      model.appendRest('1/4');
      model.transposeUp(0);
      expect(model.toSongArray()[0]).toEqual({ length: '1/4' });
    });

    it('transposeDown no-ops on a rest entry', () => {
      model.appendRest('1/4');
      model.transposeDown(0);
      expect(model.toSongArray()[0]).toEqual({ length: '1/4' });
    });

    it('setAccidental no-ops on a rest entry', () => {
      model.appendRest('1/4');
      model.setAccidental(0, '#');
      expect(model.toSongArray()[0]).toEqual({ length: '1/4' });
    });

    it('makeChord no-ops when target index is a rest', () => {
      model.appendRest('1/4');
      model.makeChord(0, 'C4', '1/4');
      // Should still be a rest, not converted to chord
      expect(model.toSongArray()[0]).toEqual({ length: '1/4' });
    });

    it('setDuration works on a rest entry', () => {
      model.appendRest('1/4');
      model.setDuration(0, '1/8');
      expect(model.toSongArray()[0]).toEqual({ length: '1/8' });
    });

    it('toggleDot works on a rest entry', () => {
      model.appendRest('1/4');
      model.toggleDot(0);
      expect(model.toSongArray()[0]).toEqual({ length: '3/8' });
    });

    it('removeNote works on a rest entry', () => {
      model.appendRest('1/4');
      model.removeNote(0);
      expect(model.toSongArray()).toEqual([]);
    });
  });

  describe('isRest', () => {
    it('returns true for a rest object', () => {
      expect(SongModel.isRest({ length: '1/4' })).toBe(true);
    });

    it('returns false for a pitched note', () => {
      expect(SongModel.isRest({ pitch: 'C4', length: '1/4' })).toBe(false);
    });

    it('returns false for a chord array', () => {
      expect(SongModel.isRest([{ pitch: 'C4', length: '1/4' }])).toBe(false);
    });
  });

  // ── Serialization ────────────────────────────────────────────────────

  describe('fromSongArray / toSongArray', () => {
    it('round-trips a note array correctly', () => {
      const original = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/8' },
        [
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
        ],
        { pitch: 'F4', length: '1/2' },
      ];

      model.fromSongArray(original);

      expect(model.toSongArray()).toEqual(original);
      expect(model.cursorPosition).toBe(0);
    });
  });
});
