/**
 * SongMatcher Tests
 *
 * These tests validate the SongMatcher utility class which compares songs
 * for exact matches. It handles both single notes and chords (arrays of notes).
 */

import SongMatcher from 'core/SongMatcher';

describe('SongMatcher', () => {
  describe('songsMatch with null/undefined inputs', () => {
    it('returns false when capturedSong is null', () => {
      const requiredSong = [{ pitch: 'C4', length: '1/4' }];
      expect(SongMatcher.songsMatch(null, requiredSong)).toBe(false);
    });

    it('returns false when requiredSong is null', () => {
      const capturedSong = [{ pitch: 'C4', length: '1/4' }];
      expect(SongMatcher.songsMatch(capturedSong, null)).toBe(false);
    });

    it('returns false when capturedSong is undefined', () => {
      const requiredSong = [{ pitch: 'C4', length: '1/4' }];
      expect(SongMatcher.songsMatch(undefined, requiredSong)).toBe(false);
    });

    it('returns false when requiredSong is undefined', () => {
      const capturedSong = [{ pitch: 'C4', length: '1/4' }];
      expect(SongMatcher.songsMatch(capturedSong, undefined)).toBe(false);
    });

    it('returns false when both songs are null', () => {
      expect(SongMatcher.songsMatch(null, null)).toBe(false);
    });
  });

  describe('songsMatch with chords', () => {
    it('returns true when matching chords in same order', () => {
      const song1 = [
        [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
        ],
      ];
      const song2 = [
        [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
        ],
      ];
      expect(SongMatcher.songsMatch(song1, song2)).toBe(true);
    });

    it('returns true when matching chords in different order (order irrelevant in chords)', () => {
      const song1 = [
        [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
        ],
      ];
      const song2 = [
        [
          { pitch: 'E4', length: '1/4' },
          { pitch: 'C4', length: '1/4' },
        ],
      ];
      expect(SongMatcher.songsMatch(song1, song2)).toBe(true);
    });

    it('returns false when chord pitches do not match', () => {
      const song1 = [
        [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
        ],
      ];
      const song2 = [
        [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
        ],
      ];
      expect(SongMatcher.songsMatch(song1, song2)).toBe(false);
    });

    it('returns false when chord lengths do not match', () => {
      const song1 = [
        [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
        ],
      ];
      const song2 = [
        [
          { pitch: 'C4', length: '1/8' },
          { pitch: 'E4', length: '1/4' },
        ],
      ];
      expect(SongMatcher.songsMatch(song1, song2)).toBe(false);
    });

    it('returns true when song has mix of notes and matching chords', () => {
      const song1 = [
        { pitch: 'C4', length: '1/4' },
        [
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
        ],
        { pitch: 'B4', length: '1/4' },
      ];
      const song2 = [
        { pitch: 'C4', length: '1/4' },
        [
          { pitch: 'G4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
        ],
        { pitch: 'B4', length: '1/4' },
      ];
      expect(SongMatcher.songsMatch(song1, song2)).toBe(true);
    });
  });

  describe('songsMatch with type mismatches', () => {
    it('returns false when captured has chord but required has single note', () => {
      const capturedSong = [
        [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
        ],
      ];
      const requiredSong = [{ pitch: 'C4', length: '1/4' }];
      expect(SongMatcher.songsMatch(capturedSong, requiredSong)).toBe(false);
    });

    it('returns false when captured has single note but required has chord', () => {
      const capturedSong = [{ pitch: 'C4', length: '1/4' }];
      const requiredSong = [
        [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
        ],
      ];
      expect(SongMatcher.songsMatch(capturedSong, requiredSong)).toBe(false);
    });

    it('returns false when type mismatch occurs mid-song', () => {
      const capturedSong = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ];
      const requiredSong = [
        { pitch: 'C4', length: '1/4' },
        [
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
        ],
      ];
      expect(SongMatcher.songsMatch(capturedSong, requiredSong)).toBe(false);
    });
  });

  describe('chordsMatch', () => {
    it('returns false when chords have different number of notes', () => {
      const chord1 = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ];
      const chord2 = [{ pitch: 'C4', length: '1/4' }];
      expect(SongMatcher.chordsMatch(chord1, chord2)).toBe(false);
    });

    it('returns true for matching single-note chords', () => {
      const chord1 = [{ pitch: 'C4', length: '1/4' }];
      const chord2 = [{ pitch: 'C4', length: '1/4' }];
      expect(SongMatcher.chordsMatch(chord1, chord2)).toBe(true);
    });

    it('returns true for matching two-note chords', () => {
      const chord1 = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ];
      const chord2 = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ];
      expect(SongMatcher.chordsMatch(chord1, chord2)).toBe(true);
    });

    it('returns true for matching chords regardless of note order', () => {
      const chord1 = [
        { pitch: 'G4', length: '1/4' },
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ];
      const chord2 = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ];
      expect(SongMatcher.chordsMatch(chord1, chord2)).toBe(true);
    });

    it('returns false when a note in the chord has different pitch', () => {
      const chord1 = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ];
      const chord2 = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'F4', length: '1/4' },
      ];
      expect(SongMatcher.chordsMatch(chord1, chord2)).toBe(false);
    });

    it('returns false when a note in the chord has different length', () => {
      const chord1 = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ];
      const chord2 = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/2' },
      ];
      expect(SongMatcher.chordsMatch(chord1, chord2)).toBe(false);
    });

    it('returns true for matching four-note chords with scrambled order', () => {
      const chord1 = [
        { pitch: 'B4', length: '1/4' },
        { pitch: 'C4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ];
      const chord2 = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
        { pitch: 'B4', length: '1/4' },
      ];
      expect(SongMatcher.chordsMatch(chord1, chord2)).toBe(true);
    });
  });

  describe('notesMatch', () => {
    it('returns true when pitch and length match exactly', () => {
      const note1 = { pitch: 'C4', length: '1/4' };
      const note2 = { pitch: 'C4', length: '1/4' };
      expect(SongMatcher.notesMatch(note1, note2)).toBe(true);
    });

    it('returns false when pitch differs', () => {
      const note1 = { pitch: 'C4', length: '1/4' };
      const note2 = { pitch: 'D4', length: '1/4' };
      expect(SongMatcher.notesMatch(note1, note2)).toBe(false);
    });

    it('returns false when length differs', () => {
      const note1 = { pitch: 'C4', length: '1/4' };
      const note2 = { pitch: 'C4', length: '1/8' };
      expect(SongMatcher.notesMatch(note1, note2)).toBe(false);
    });
  });
});
