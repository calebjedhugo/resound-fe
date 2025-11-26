/**
 * SongMatcher - Utilities for comparing songs for exact matches
 */
class SongMatcher {
  /**
   * Compare two songs for exact match (quantized)
   * @param {Array} capturedSong - Captured/recorded song data
   * @param {Array} requiredSong - Required song data (standard format)
   * @returns {boolean} True if songs match exactly
   */
  static songsMatch(capturedSong, requiredSong) {
    if (!capturedSong || !requiredSong) {
      return false;
    }

    // Must have same number of notes/chords
    if (capturedSong.length !== requiredSong.length) {
      return false;
    }

    // Compare each note/chord
    for (let i = 0; i < capturedSong.length; i += 1) {
      const captured = capturedSong[i];
      const required = requiredSong[i];

      // Both are chords (arrays)
      if (Array.isArray(captured) && Array.isArray(required)) {
        if (!this.chordsMatch(captured, required)) {
          return false;
        }
      }
      // Both are single notes
      else if (!Array.isArray(captured) && !Array.isArray(required)) {
        if (!this.notesMatch(captured, required)) {
          return false;
        }
      }
      // One is chord, one is note - no match
      else {
        return false;
      }
    }

    return true;
  }

  /**
   * Compare two single notes
   * @param {Object} note1 - { pitch, length }
   * @param {Object} note2 - { pitch, length }
   * @returns {boolean} True if notes match
   */
  static notesMatch(note1, note2) {
    return note1.pitch === note2.pitch && note1.length === note2.length;
  }

  /**
   * Compare two chords (arrays of notes)
   * @param {Array} chord1 - Array of notes
   * @param {Array} chord2 - Array of notes
   * @returns {boolean} True if chords match
   */
  static chordsMatch(chord1, chord2) {
    // Must have same number of notes
    if (chord1.length !== chord2.length) {
      return false;
    }

    // Sort both chords by pitch for comparison (order doesn't matter in a chord)
    const sorted1 = [...chord1].sort((a, b) => a.pitch.localeCompare(b.pitch));
    const sorted2 = [...chord2].sort((a, b) => a.pitch.localeCompare(b.pitch));

    // Compare each note
    for (let i = 0; i < sorted1.length; i += 1) {
      if (!this.notesMatch(sorted1[i], sorted2[i])) {
        return false;
      }
    }

    return true;
  }
}

export default SongMatcher;
