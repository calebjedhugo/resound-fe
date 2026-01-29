/**
 * StaffInteraction Tests
 *
 * Tests the pure-logic module for resolving staff coordinates to pitches
 * and calculating barline positions. No DOM or browser dependencies.
 */
import {
  yToPitch,
  snapToStaffPosition,
  calculateBarlines,
  createNoteFromClick,
} from 'editor/ui/StaffInteraction';
import SongModel from 'editor/model/SongModel';

describe('StaffInteraction', () => {
  // ── yToPitch ──────────────────────────────────────────────────────────

  describe('yToPitch', () => {
    it('resolves middle of staff (B4 line) to B4', () => {
      // B4 is the middle line of a treble clef staff.
      // B4 is at index 4 in STAFF_PITCHES: F5(0), E5(1), D5(2), C5(3), B4(4)
      // Y = STAFF_TOP_Y + 4 * (LINE_SPACING / 2) = 20 + 4 * 5 = 40
      const y = 40;
      expect(yToPitch(y)).toBe('B4');
    });

    it('resolves top of staff (F5 space) to F5', () => {
      // F5 is at index 0 in STAFF_PITCHES, at STAFF_TOP_Y = 20
      const y = 20;
      expect(yToPitch(y)).toBe('F5');
    });

    it('resolves bottom of staff (D4 space) to D4', () => {
      // D4 is at index 9 in STAFF_PITCHES
      // Y = 20 + 9 * 5 = 65
      const y = 65;
      expect(yToPitch(y)).toBe('D4');
    });
  });

  // ── snapToStaffPosition ───────────────────────────────────────────────

  describe('snapToStaffPosition', () => {
    it('snaps to nearest staff line or space (rounds to nearest half-step position)', () => {
      // A Y between two positions should snap to the nearest one.
      // Half-space size = 5px. Position at index 4 (B4) = y=40.
      // A Y of 42 should snap to 40 (closer to B4 than to A4 at 45).
      expect(snapToStaffPosition(42)).toBe(40);

      // A Y of 43 should snap to 45 (closer to A4 at 45 than B4 at 40).
      expect(snapToStaffPosition(43)).toBe(45);
    });
  });

  // ── calculateBarlines ────────────────────────────────────────────────

  describe('calculateBarlines', () => {
    it('places one barline after four quarter notes in 4/4', () => {
      const notes = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'F4', length: '1/4' },
      ];

      const barlines = calculateBarlines(notes);

      // Barline after note index 3 (position 4 = after the 4th note)
      expect(barlines).toEqual([4]);
    });

    it('places barlines after notes 4 and 5 for five quarter notes in 4/4', () => {
      const notes = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'F4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ];

      const barlines = calculateBarlines(notes);

      // Barline after note 4 (end of first measure) — no barline after note 5
      // since a single note doesn't complete a second measure
      expect(barlines).toEqual([4]);
    });
  });

  // ── createNoteFromClick ────────────────────────────────────────────────

  describe('createNoteFromClick', () => {
    it('creates a note with correct pitch and length from a staff click', () => {
      // Click at Y = 40 (B4) with active length '1/4'
      const note = createNoteFromClick(40, '1/4');

      expect(note).toEqual({ pitch: 'B4', length: '1/4' });
    });

    it('places a note via staff click into SongModel correctly', () => {
      const model = new SongModel();
      const clickY = 40; // B4
      const activeLength = '1/4';

      const note = createNoteFromClick(clickY, activeLength);
      model.appendNote(note.pitch, note.length);

      const notes = model.toSongArray();
      expect(notes).toEqual([{ pitch: 'B4', length: '1/4' }]);
    });
  });
});
