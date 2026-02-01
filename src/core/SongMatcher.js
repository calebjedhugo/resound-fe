/**
 * SongMatcher - Utilities for comparing songs for exact matches
 */
class SongMatcher {
  /**
   * Flatten a multi-voice song into a sequential note/chord array.
   * Notes from different voices at the same beat position become chords.
   * Flat-array input passes through unchanged.
   * @param {Array|Object} song - Flat array or { voices: [...] } object
   * @returns {Array} Flat array of notes and chords
   */
  static flattenSong(song) {
    if (!song) return [];
    if (Array.isArray(song)) return song;
    if (!song.voices || song.voices.length === 0) return [];

    // Collect (beatPosition, note) pairs from all voices
    const entries = [];
    for (const voice of song.voices) {
      let beat = 0;
      for (const note of voice.notes || []) {
        entries.push({ beat, note });
        const [num, den] = note.length.split('/').map(Number);
        beat += num / den;
      }
    }

    if (entries.length === 0) return [];

    // Sort by beat position
    entries.sort((a, b) => a.beat - b.beat);

    // Group notes at same beat into chords
    const result = [];
    let i = 0;
    while (i < entries.length) {
      const currentBeat = entries[i].beat;
      const group = [entries[i].note];
      i += 1;
      while (i < entries.length && Math.abs(entries[i].beat - currentBeat) < 1e-10) {
        group.push(entries[i].note);
        i += 1;
      }
      if (group.length === 1) {
        result.push(group[0]);
      } else {
        result.push(group);
      }
    }

    return result;
  }

  /**
   * Compare two songs for exact match (quantized)
   * @param {Array} capturedSong - Captured/recorded song data
   * @param {Array|Object} requiredSong - Required song data (flat array or voices format)
   * @returns {boolean} True if songs match exactly
   */
  static songsMatch(capturedSong, requiredSong) {
    if (!capturedSong || !requiredSong) {
      return false;
    }

    const flatRequired = this.flattenSong(requiredSong);

    // Must have same number of notes/chords
    if (capturedSong.length !== flatRequired.length) {
      return false;
    }

    // Compare each note/chord
    for (let i = 0; i < capturedSong.length; i += 1) {
      const captured = capturedSong[i];
      const required = flatRequired[i];

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
