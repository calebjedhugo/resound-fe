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

  describe('flattenSong', () => {
    it('passes through a flat array unchanged', () => {
      const song = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ];
      expect(SongMatcher.flattenSong(song)).toEqual(song);
    });

    it('returns empty array for null input', () => {
      expect(SongMatcher.flattenSong(null)).toEqual([]);
    });

    it('returns empty array for undefined input', () => {
      expect(SongMatcher.flattenSong(undefined)).toEqual([]);
    });

    it('returns empty array when all voices have empty notes', () => {
      const song = {
        voices: [
          { id: 'treble', notes: [] },
          { id: 'bass', notes: [] },
        ],
      };
      expect(SongMatcher.flattenSong(song)).toEqual([]);
    });

    it('creates a chord from notes at the same beat position', () => {
      const song = {
        voices: [
          { id: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
          { id: 'bass', notes: [{ pitch: 'C3', length: '1/4' }] },
        ],
      };
      const result = SongMatcher.flattenSong(song);
      expect(result).toHaveLength(1);
      expect(Array.isArray(result[0])).toBe(true);
      expect(result[0]).toHaveLength(2);
    });

    it('keeps notes at different beat positions as separate entries', () => {
      const song = {
        voices: [
          {
            id: 'treble',
            notes: [
              { pitch: 'C5', length: '1/4' },
              { pitch: 'E5', length: '1/4' },
            ],
          },
          { id: 'bass', notes: [{ pitch: 'C3', length: '1/2' }] },
        ],
      };
      const result = SongMatcher.flattenSong(song);
      // Beat 0: C5 + C3 → chord
      // Beat 0.25: E5 → single note
      expect(result).toHaveLength(2);
      expect(Array.isArray(result[0])).toBe(true); // chord at beat 0
      expect(Array.isArray(result[1])).toBe(false); // single note at beat 0.25
    });

    it('preserves note length in flattened output', () => {
      const song = {
        voices: [{ id: 'treble', notes: [{ pitch: 'C5', length: '1/2' }] }],
      };
      const result = SongMatcher.flattenSong(song);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ pitch: 'C5', length: '1/2' });
    });

    it('merges three simultaneous notes into a three-note chord', () => {
      const song = {
        voices: [
          { id: 'soprano', notes: [{ pitch: 'E5', length: '1/4' }] },
          { id: 'alto', notes: [{ pitch: 'C5', length: '1/4' }] },
          { id: 'bass', notes: [{ pitch: 'C3', length: '1/4' }] },
        ],
      };
      const result = SongMatcher.flattenSong(song);
      expect(result).toHaveLength(1);
      expect(Array.isArray(result[0])).toBe(true);
      expect(result[0]).toHaveLength(3);
    });
  });

  describe('songsMatch with voices format', () => {
    it('matches when requiredSong uses voices format', () => {
      const required = {
        voices: [
          { id: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
          { id: 'bass', notes: [{ pitch: 'C3', length: '1/4' }] },
        ],
      };
      // Flattened: beat 0 has C5 + C3 → chord
      const captured = [
        [
          { pitch: 'C3', length: '1/4' },
          { pitch: 'C5', length: '1/4' },
        ],
      ];
      expect(SongMatcher.songsMatch(captured, required)).toBe(true);
    });

    it('does not match when captured differs from flattened voices', () => {
      const required = {
        voices: [
          { id: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
          { id: 'bass', notes: [{ pitch: 'C3', length: '1/4' }] },
        ],
      };
      const captured = [{ pitch: 'C5', length: '1/4' }];
      expect(SongMatcher.songsMatch(captured, required)).toBe(false);
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
