/**
 * StaffInteraction Tests
 *
 * Tests the pure-logic module for resolving staff coordinates to pitches
 * and calculating barline positions. Uses the notation system's coordinate
 * space where pitchToStaffY('B4', 'treble') = 50 and each diatonic step = 10px.
 */
import {
  yToPitch,
  pitchToY,
  snapToStaffPosition,
  calculateBarlines,
  createNoteFromClick,
} from 'editor/ui/StaffInteraction';
import { pitchToStaffY } from 'resound-notation/lib/notePositions';
import SongModel from 'editor/model/SongModel';

describe('StaffInteraction', () => {
  // -- yToPitch ---------------------------------------------------------------

  describe('yToPitch', () => {
    it('resolves middle of staff (B4) to B4', () => {
      // B4 in treble: pitchToStaffY('B4', 'treble') = (39 - 34) * 10 = 50
      expect(yToPitch(50)).toBe('B4');
    });

    it('resolves top staff line (F5) to F5', () => {
      // F5 in treble: pitchToStaffY('F5', 'treble') = (39 - 38) * 10 = 10
      expect(yToPitch(10)).toBe('F5');
    });

    it('resolves bottom staff line (E4) to E4', () => {
      // E4 in treble: pitchToStaffY('E4', 'treble') = (39 - 30) * 10 = 90
      expect(yToPitch(90)).toBe('E4');
    });

    it('snaps to nearest pitch when Y is between positions', () => {
      // Y = 53 is closer to B4 (y=50) than to A4 (y=60)
      expect(yToPitch(53)).toBe('B4');

      // Y = 57 is closer to A4 (y=60) than to B4 (y=50)
      expect(yToPitch(57)).toBe('A4');

      // Y = 55 rounds to 60 (A4) due to Math.round on 39 - 5.5 = 33.5 -> 34 = B4
      // Actually: diatonicPos = Math.round(39 - 55/10) = Math.round(39 - 5.5) = Math.round(33.5) = 34 -> B4
      // Math.round(33.5) rounds to 34 in JS (rounds half to even... actually JS rounds 0.5 up)
      expect(yToPitch(55)).toBe('B4');
    });

    it('clamps to valid range for extreme Y values', () => {
      // Very negative Y (far above staff) should clamp to the highest allowed pitch
      const highPitch = yToPitch(-100);
      // maxPos = (39-1) + 6 = 44 -> octave 6, noteIndex 2 -> E6
      expect(highPitch).toBe('E6');

      // Very large Y (far below staff) should clamp to the lowest allowed pitch
      const lowPitch = yToPitch(300);
      // minPos = (39-8) - 6 = 25 -> octave 3, noteIndex 4 -> G3
      expect(lowPitch).toBe('G3');
    });
  });

  // -- pitchToY ---------------------------------------------------------------

  describe('pitchToY', () => {
    it('returns the same value as pitchToStaffY for known pitches', () => {
      const pitches = ['F5', 'E5', 'D5', 'C5', 'B4', 'A4', 'G4', 'F4', 'E4'];
      pitches.forEach((pitch) => {
        expect(pitchToY(pitch)).toBe(pitchToStaffY(pitch, 'treble'));
      });
    });

    it('matches the notation system coordinate space', () => {
      expect(pitchToY('F5')).toBe(10); // Top line
      expect(pitchToY('D5')).toBe(30); // Second line
      expect(pitchToY('B4')).toBe(50); // Middle line
      expect(pitchToY('G4')).toBe(70); // Fourth line
      expect(pitchToY('E4')).toBe(90); // Bottom line
    });
  });

  // -- snapToStaffPosition ----------------------------------------------------

  describe('snapToStaffPosition', () => {
    it('snaps to nearest diatonic position in notation coordinates', () => {
      // Positions are on a 10px grid
      expect(snapToStaffPosition(53)).toBe(50); // Snaps to B4 position
      expect(snapToStaffPosition(57)).toBe(60); // Snaps to A4 position
      expect(snapToStaffPosition(45)).toBe(50); // Snaps to B4 position
      expect(snapToStaffPosition(10)).toBe(10); // Already on grid (F5)
      expect(snapToStaffPosition(0)).toBe(0); // On grid
    });
  });

  // -- calculateBarlines ------------------------------------------------------

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

    it('places barlines correctly for mixed durations', () => {
      const notes = [
        { pitch: 'C4', length: '1/2' }, // half note = 0.5
        { pitch: 'D4', length: '1/4' }, // quarter = 0.25, total 0.75
        { pitch: 'E4', length: '1/4' }, // quarter = 0.25, total 1.0 -> barline
        { pitch: 'F4', length: '1/4' }, // quarter = 0.25, total 0.25
      ];

      const barlines = calculateBarlines(notes);

      // Barline after the 3rd note (accumulated 1.0 whole note = one 4/4 measure)
      expect(barlines).toEqual([3]);
    });
  });

  // -- createNoteFromClick ----------------------------------------------------

  describe('createNoteFromClick', () => {
    it('creates a note with correct pitch and length from staff click', () => {
      // Click at Y = 50 (B4) with active length '1/4'
      const note = createNoteFromClick(50, '1/4');
      expect(note).toEqual({ pitch: 'B4', length: '1/4' });
    });

    it('integrates with SongModel correctly', () => {
      const model = new SongModel();
      const clickY = 50; // B4 in notation coordinate space
      const activeLength = '1/4';

      const note = createNoteFromClick(clickY, activeLength);
      model.appendNote(note.pitch, note.length);

      const notes = model.toSongArray();
      expect(notes).toEqual([{ pitch: 'B4', length: '1/4' }]);
    });
  });
});
