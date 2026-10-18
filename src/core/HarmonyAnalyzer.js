/**
 * HarmonyAnalyzer - Analyzes harmonic relationships between notes
 * Used for creature behavior (follow consonant sounds, flee dissonant sounds)
 */
class HarmonyAnalyzer {
  /**
   * Convert pitch notation to MIDI number
   * @param {string} pitch - E.g., "C4", "A#5", "Bb3"
   * @returns {number} MIDI number (C4 = 60)
   */
  static pitchToMidi(pitch) {
    const noteMap = {
      C: 0,
      'C#': 1,
      Db: 1,
      D: 2,
      'D#': 3,
      Eb: 3,
      E: 4,
      F: 5,
      'F#': 6,
      Gb: 6,
      G: 7,
      'G#': 8,
      Ab: 8,
      A: 9,
      'A#': 10,
      Bb: 10,
      B: 11,
    };

    // Extract note name and octave
    const match = pitch.match(/^([A-G][#b]?)(\d+)$/);
    if (!match) {
      console.error(`Invalid pitch notation: ${pitch}`);
      return 60; // Default to middle C
    }

    const [, noteName, octave] = match;
    const noteValue = noteMap[noteName];
    const octaveValue = parseInt(octave, 10);

    return noteValue + (octaveValue + 1) * 12;
  }

  /**
   * Calculate interval between two pitches in semitones
   * Reduces to octave equivalent (0-11)
   * @param {string} pitch1 - First pitch
   * @param {string} pitch2 - Second pitch
   * @returns {number} Interval in semitones (0-11)
   */
  static calculateInterval(pitch1, pitch2) {
    const midi1 = this.pitchToMidi(pitch1);
    const midi2 = this.pitchToMidi(pitch2);
    const interval = Math.abs(midi1 - midi2);

    // Reduce to octave equivalent (0-11)
    return interval % 12;
  }

  /**
   * Classify interval as perfect, consonant, or dissonant
   * @param {number} semitones - Interval in semitones (0-11)
   * @returns {'perfect' | 'consonant' | 'dissonant'}
   */
  static classifyInterval(semitones) {
    // Perfect intervals: Unison (0), Perfect 4th (5), Perfect 5th (7)
    if (semitones === 0 || semitones === 5 || semitones === 7) {
      return 'perfect';
    }

    // Consonant intervals: Minor 3rd (3), Major 3rd (4), Minor 6th (8), Major 6th (9)
    if (semitones === 3 || semitones === 4 || semitones === 8 || semitones === 9) {
      return 'consonant';
    }

    // Dissonant intervals: Minor 2nd (1), Major 2nd (2), Tritone (6), Minor 7th (10), Major 7th (11)
    return 'dissonant';
  }
}

export default HarmonyAnalyzer;
