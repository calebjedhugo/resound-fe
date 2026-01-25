/**
 * HarmonyAnalyzer Tests
 *
 * These tests cover the HarmonyAnalyzer utility class which analyzes
 * harmonic relationships between notes for creature behavior.
 *
 * Tests cover:
 * - Invalid pitch notation handling
 * - Note overlap detection with musical clock
 * - Full harmony analysis between sound sources
 */

import HarmonyAnalyzer from 'core/HarmonyAnalyzer';
import { HARMONY_TIMING_SUBDIVISION } from 'core/constants';
import MusicalClock from 'audio/lib/MusicalClock';

describe('HarmonyAnalyzer', () => {
  describe('pitchToMidi', () => {
    it('converts standard pitches correctly', () => {
      expect(HarmonyAnalyzer.pitchToMidi('C4')).toBe(60);
      expect(HarmonyAnalyzer.pitchToMidi('A4')).toBe(69);
      expect(HarmonyAnalyzer.pitchToMidi('C5')).toBe(72);
    });

    it('handles sharps correctly', () => {
      expect(HarmonyAnalyzer.pitchToMidi('C#4')).toBe(61);
      expect(HarmonyAnalyzer.pitchToMidi('F#4')).toBe(66);
    });

    it('handles flats correctly', () => {
      expect(HarmonyAnalyzer.pitchToMidi('Db4')).toBe(61);
      expect(HarmonyAnalyzer.pitchToMidi('Bb4')).toBe(70);
    });

    it('returns middle C (60) for invalid pitch notation', () => {
      // Spy on console.error to verify it is called
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(HarmonyAnalyzer.pitchToMidi('invalid')).toBe(60);
      expect(consoleSpy).toHaveBeenCalledWith('Invalid pitch notation: invalid');

      expect(HarmonyAnalyzer.pitchToMidi('X4')).toBe(60);
      expect(consoleSpy).toHaveBeenCalledWith('Invalid pitch notation: X4');

      expect(HarmonyAnalyzer.pitchToMidi('C')).toBe(60);
      expect(consoleSpy).toHaveBeenCalledWith('Invalid pitch notation: C');

      expect(HarmonyAnalyzer.pitchToMidi('')).toBe(60);
      expect(consoleSpy).toHaveBeenCalledWith('Invalid pitch notation: ');

      consoleSpy.mockRestore();
    });
  });

  describe('notesOverlap', () => {
    // Create a real MusicalClock for testing
    // At 120 BPM: 500ms per beat, so msToBeats(500) = 1 beat
    const createClock = (tempo = 120) => new MusicalClock(tempo);

    it('returns false when musicalClock is null', () => {
      const note1 = { pitch: 'C4', timestamp: 1000 };
      const note2 = { pitch: 'E4', timestamp: 1000 };

      expect(HarmonyAnalyzer.notesOverlap(note1, note2, null)).toBe(false);
    });

    it('returns false when musicalClock is undefined', () => {
      const note1 = { pitch: 'C4', timestamp: 1000 };
      const note2 = { pitch: 'E4', timestamp: 1000 };

      expect(HarmonyAnalyzer.notesOverlap(note1, note2, undefined)).toBe(false);
    });

    it('returns true when notes occur at the same timestamp', () => {
      const clock = createClock(120); // 120 BPM = 500ms per beat
      const note1 = { pitch: 'C4', timestamp: 1000 };
      const note2 = { pitch: 'E4', timestamp: 1000 };

      expect(HarmonyAnalyzer.notesOverlap(note1, note2, clock)).toBe(true);
    });

    it('returns true when notes are within the same subdivision', () => {
      const clock = createClock(120); // 120 BPM = 500ms per beat
      // Subdivision threshold = 1/16 beat = 0.0625 beats
      // At 500ms per beat, 0.0625 beats = 31.25ms

      const note1 = { pitch: 'C4', timestamp: 1000 };
      const note2 = { pitch: 'E4', timestamp: 1020 }; // 20ms apart = 0.04 beats

      expect(HarmonyAnalyzer.notesOverlap(note1, note2, clock)).toBe(true);
    });

    it('returns false when notes are in different subdivisions', () => {
      const clock = createClock(120); // 120 BPM = 500ms per beat
      // Subdivision threshold = 1/16 beat = 0.0625 beats
      // At 500ms per beat, 0.0625 beats = 31.25ms

      const note1 = { pitch: 'C4', timestamp: 1000 };
      const note2 = { pitch: 'E4', timestamp: 1100 }; // 100ms apart = 0.2 beats

      expect(HarmonyAnalyzer.notesOverlap(note1, note2, clock)).toBe(false);
    });

    it('considers subdivision threshold based on HARMONY_TIMING_SUBDIVISION constant', () => {
      // The threshold is 1/HARMONY_TIMING_SUBDIVISION = 1/16 = 0.0625 beats
      const clock = createClock(120); // 120 BPM = 500ms per beat
      const expectedThreshold = 1 / HARMONY_TIMING_SUBDIVISION;

      // Just under threshold (should overlap)
      const beatDiffUnder = expectedThreshold - 0.01;
      const msUnder = beatDiffUnder * 500;
      const note1 = { pitch: 'C4', timestamp: 1000 };
      const note2 = { pitch: 'E4', timestamp: 1000 + msUnder };
      expect(HarmonyAnalyzer.notesOverlap(note1, note2, clock)).toBe(true);

      // Just over threshold (should not overlap)
      const beatDiffOver = expectedThreshold + 0.01;
      const msOver = beatDiffOver * 500;
      const note3 = { pitch: 'G4', timestamp: 1000 + msOver };
      expect(HarmonyAnalyzer.notesOverlap(note1, note3, clock)).toBe(false);
    });
  });

  describe('analyzeHarmony', () => {
    // Use a real MusicalClock at 120 BPM
    // At 120 BPM: 500ms per beat, threshold is 0.0625 beats = 31.25ms
    const createClock = () => new MusicalClock(120);

    it('returns "none" when notes do not overlap in time', () => {
      const clock = createClock();
      // Notes 100ms apart = 0.2 beats, well beyond 0.0625 beat threshold
      const source1 = { pitch: 'C4', timestamp: 0 };
      const source2 = { pitch: 'E4', timestamp: 100 };

      expect(HarmonyAnalyzer.analyzeHarmony(source1, source2, clock)).toBe('none');
    });

    it('returns "consonant" when consonant intervals dominate', () => {
      const clock = createClock();
      // Same timestamp = overlapping
      const source1 = { pitch: 'C4', timestamp: 0 };
      const source2 = { pitch: 'E4', timestamp: 0 }; // Major 3rd = consonant

      expect(HarmonyAnalyzer.analyzeHarmony(source1, source2, clock)).toBe('consonant');
    });

    it('returns "dissonant" when dissonant intervals dominate', () => {
      const clock = createClock();
      const source1 = { pitch: 'C4', timestamp: 0 };
      const source2 = { pitch: 'C#4', timestamp: 0 }; // Minor 2nd = dissonant

      expect(HarmonyAnalyzer.analyzeHarmony(source1, source2, clock)).toBe('dissonant');
    });

    it('returns "perfect" when all intervals are perfect', () => {
      const clock = createClock();
      const source1 = { pitch: 'C4', timestamp: 0 };
      const source2 = { pitch: 'G4', timestamp: 0 }; // Perfect 5th

      expect(HarmonyAnalyzer.analyzeHarmony(source1, source2, clock)).toBe('perfect');
    });

    it('returns "perfect" when consonant and dissonant counts are tied', () => {
      const clock = createClock();
      // Use arrays to create a tie
      const source1 = [
        { pitch: 'C4', timestamp: 0 },
        { pitch: 'D4', timestamp: 0 },
      ];
      const source2 = [
        { pitch: 'E4', timestamp: 0 }, // C4-E4 = major 3rd (consonant), D4-E4 = major 2nd (dissonant)
      ];

      // C4-E4 = 4 semitones = consonant
      // D4-E4 = 2 semitones = dissonant
      // Tie = 'perfect'
      expect(HarmonyAnalyzer.analyzeHarmony(source1, source2, clock)).toBe('perfect');
    });

    it('accepts single notes as objects (not arrays)', () => {
      const clock = createClock();
      const source1 = { pitch: 'C4', timestamp: 0 };
      const source2 = { pitch: 'A4', timestamp: 0 }; // Major 6th = consonant

      expect(HarmonyAnalyzer.analyzeHarmony(source1, source2, clock)).toBe('consonant');
    });

    it('accepts arrays of notes', () => {
      const clock = createClock();
      const source1 = [{ pitch: 'C4', timestamp: 0 }];
      const source2 = [{ pitch: 'Ab4', timestamp: 0 }]; // Minor 6th = consonant

      expect(HarmonyAnalyzer.analyzeHarmony(source1, source2, clock)).toBe('consonant');
    });

    it('analyzes all intervals between multi-note sources', () => {
      const clock = createClock();
      // Source 1: C4, E4 (C major chord partial)
      // Source 2: G4
      // Intervals: C4-G4 = P5 (perfect), E4-G4 = m3 (consonant)
      // 1 consonant > 0 dissonant = consonant
      const source1 = [
        { pitch: 'C4', timestamp: 0 },
        { pitch: 'E4', timestamp: 0 },
      ];
      const source2 = [{ pitch: 'G4', timestamp: 0 }];

      expect(HarmonyAnalyzer.analyzeHarmony(source1, source2, clock)).toBe('consonant');
    });

    it('determines majority when multiple intervals exist', () => {
      const clock = createClock();
      // Create a scenario with more dissonant than consonant intervals
      // Source 1: C4
      // Source 2: C#4, D4, F#4 (all dissonant against C4)
      // C4-C#4 = m2 (dissonant)
      // C4-D4 = M2 (dissonant)
      // C4-F#4 = tritone (dissonant)
      // 3 dissonant > 0 consonant = dissonant
      const source1 = [{ pitch: 'C4', timestamp: 0 }];
      const source2 = [
        { pitch: 'C#4', timestamp: 0 },
        { pitch: 'D4', timestamp: 0 },
        { pitch: 'F#4', timestamp: 0 },
      ];

      expect(HarmonyAnalyzer.analyzeHarmony(source1, source2, clock)).toBe('dissonant');
    });

    it('determines majority with mixed consonant and dissonant', () => {
      const clock = createClock();
      // Source 1: C4
      // Source 2: E4, F4, A4
      // C4-E4 = M3 (consonant)
      // C4-F4 = P4 (perfect)
      // C4-A4 = M6 (consonant)
      // 2 consonant, 0 dissonant, 1 perfect = consonant wins
      const source1 = [{ pitch: 'C4', timestamp: 0 }];
      const source2 = [
        { pitch: 'E4', timestamp: 0 },
        { pitch: 'F4', timestamp: 0 },
        { pitch: 'A4', timestamp: 0 },
      ];

      expect(HarmonyAnalyzer.analyzeHarmony(source1, source2, clock)).toBe('consonant');
    });

    it('uses first note of each source for timing check', () => {
      const clock = createClock();
      // Notes are in arrays but only first notes' timestamps are used
      const source1 = [
        { pitch: 'C4', timestamp: 0 },
        { pitch: 'E4', timestamp: 5000 }, // This timestamp is ignored for overlap check
      ];
      const source2 = [
        { pitch: 'G4', timestamp: 0 },
        { pitch: 'B4', timestamp: 5000 }, // This timestamp is ignored for overlap check
      ];

      // Since first notes overlap (both at timestamp 0), harmony is analyzed
      // C4-G4 = P5 (perfect), C4-B4 = M7 (dissonant)
      // E4-G4 = m3 (consonant), E4-B4 = P5 (perfect)
      // 1 consonant, 1 dissonant, 2 perfect = tie = 'perfect'
      expect(HarmonyAnalyzer.analyzeHarmony(source1, source2, clock)).toBe('perfect');
    });
  });
});
