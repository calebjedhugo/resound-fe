/**
 * @jest-environment jsdom
 */

/**
 * AccidentalDisplay Tests
 *
 * Tests the pure function resolveAccidentalDisplay which determines
 * whether to display an accidental for a note based on key signature
 * and in-measure memory.
 */
import { resolveAccidentalDisplay } from 'editor/ui/AccidentalDisplay';
import { getKeySignature } from 'notation/lib/keySignatures';

describe('resolveAccidentalDisplay', () => {
  // -- Key signature baseline -------------------------------------------

  describe('key signature baseline', () => {
    it('does not display accidental for F#4 in G major (matches key)', () => {
      const keyInfo = getKeySignature('G');
      const map = new Map();
      const result = resolveAccidentalDisplay('F#4', map, keyInfo);
      expect(result.display).toBe(false);
      expect(result.type).toBeNull();
    });

    it('displays natural for F4 in G major (contradicts key)', () => {
      const keyInfo = getKeySignature('G');
      const map = new Map();
      const result = resolveAccidentalDisplay('F4', map, keyInfo);
      expect(result.display).toBe(true);
      expect(result.type).toBe('natural');
    });

    it('displays sharp for C#4 in C major', () => {
      const keyInfo = getKeySignature('C');
      const map = new Map();
      const result = resolveAccidentalDisplay('C#4', map, keyInfo);
      expect(result.display).toBe(true);
      expect(result.type).toBe('sharp');
    });

    it('displays flat for Bb4 in C major', () => {
      const keyInfo = getKeySignature('C');
      const map = new Map();
      const result = resolveAccidentalDisplay('Bb4', map, keyInfo);
      expect(result.display).toBe(true);
      expect(result.type).toBe('flat');
    });

    it('does not display accidental for Bb4 in Bb major (matches key)', () => {
      const keyInfo = getKeySignature('Bb');
      const map = new Map();
      const result = resolveAccidentalDisplay('Bb4', map, keyInfo);
      expect(result.display).toBe(false);
      expect(result.type).toBeNull();
    });
  });

  // -- Within-measure memory -------------------------------------------

  describe('within-measure memory', () => {
    it('does not display for two consecutive F# in G major', () => {
      const keyInfo = getKeySignature('G');
      const map = new Map();

      const first = resolveAccidentalDisplay('F#4', map, keyInfo);
      const second = resolveAccidentalDisplay('F#4', map, keyInfo);

      expect(first.display).toBe(false);
      expect(second.display).toBe(false);
    });

    it('displays natural on first F-natural in G major, nothing on second', () => {
      const keyInfo = getKeySignature('G');
      const map = new Map();

      const first = resolveAccidentalDisplay('F4', map, keyInfo);
      const second = resolveAccidentalDisplay('F4', map, keyInfo);

      expect(first.display).toBe(true);
      expect(first.type).toBe('natural');
      expect(second.display).toBe(false);
    });

    it('displays natural then sharp for F-natural then F# in G major', () => {
      const keyInfo = getKeySignature('G');
      const map = new Map();

      const first = resolveAccidentalDisplay('F4', map, keyInfo);
      const second = resolveAccidentalDisplay('F#4', map, keyInfo);

      expect(first.display).toBe(true);
      expect(first.type).toBe('natural');
      expect(second.display).toBe(true);
      expect(second.type).toBe('sharp');
    });

    it('displays sharp then natural for C# then C-natural in C major', () => {
      const keyInfo = getKeySignature('C');
      const map = new Map();

      const first = resolveAccidentalDisplay('C#4', map, keyInfo);
      const second = resolveAccidentalDisplay('C4', map, keyInfo);

      expect(first.display).toBe(true);
      expect(first.type).toBe('sharp');
      expect(second.display).toBe(true);
      expect(second.type).toBe('natural');
    });
  });

  // -- Barline reset ---------------------------------------------------

  describe('barline reset', () => {
    it('re-applies key signature defaults after clearing the map', () => {
      const keyInfo = getKeySignature('G');
      const map = new Map();

      // F-natural in G major: displays natural
      resolveAccidentalDisplay('F4', map, keyInfo);

      // Simulate barline reset
      map.clear();

      // After barline, F-natural should display natural again (key sig restored)
      const result = resolveAccidentalDisplay('F4', map, keyInfo);
      expect(result.display).toBe(true);
      expect(result.type).toBe('natural');
    });

    it('key signature notes do not display after barline reset', () => {
      const keyInfo = getKeySignature('G');
      const map = new Map();

      // Use up some memory
      resolveAccidentalDisplay('F4', map, keyInfo);

      // Simulate barline reset
      map.clear();

      // F# should not display (matches key sig default)
      const result = resolveAccidentalDisplay('F#4', map, keyInfo);
      expect(result.display).toBe(false);
    });
  });

  // -- Chords (each note evaluated independently) ----------------------

  describe('chords', () => {
    it('evaluates each chord note independently against the map', () => {
      const keyInfo = getKeySignature('C');
      const map = new Map();

      // First chord note: C# displays sharp
      const note1 = resolveAccidentalDisplay('C#4', map, keyInfo);
      expect(note1.display).toBe(true);
      expect(note1.type).toBe('sharp');

      // Second chord note at same beat: E4 natural, no display needed
      const note2 = resolveAccidentalDisplay('E4', map, keyInfo);
      expect(note2.display).toBe(false);

      // Third chord note: G#4 displays sharp
      const note3 = resolveAccidentalDisplay('G#4', map, keyInfo);
      expect(note3.display).toBe(true);
      expect(note3.type).toBe('sharp');
    });

    it('all chord notes update the map after evaluation', () => {
      const keyInfo = getKeySignature('C');
      const map = new Map();

      // Build up chord accidentals
      resolveAccidentalDisplay('C#4', map, keyInfo);
      resolveAccidentalDisplay('E4', map, keyInfo);

      // Later note: C#4 again should not display (memory set by chord)
      const laterC = resolveAccidentalDisplay('C#4', map, keyInfo);
      expect(laterC.display).toBe(false);
    });
  });

  // -- Octave independence ---------------------------------------------

  describe('octave independence', () => {
    it('treats same note name in different octaves independently', () => {
      const keyInfo = getKeySignature('C');
      const map = new Map();

      // C#4 displays sharp
      const c4 = resolveAccidentalDisplay('C#4', map, keyInfo);
      expect(c4.display).toBe(true);

      // C#5 in a different octave also displays sharp (independent)
      const c5 = resolveAccidentalDisplay('C#5', map, keyInfo);
      expect(c5.display).toBe(true);
      expect(c5.type).toBe('sharp');
    });
  });
});
