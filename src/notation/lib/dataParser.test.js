import { parseNoteData } from './dataParser';

describe('dataParser', () => {
  describe('parseNoteData', () => {
    describe('Level 1: Simple array input', () => {
      it('wraps a plain note array into a single voice', () => {
        const input = [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
        ];

        const result = parseNoteData(input);

        expect(result.voices).toHaveLength(1);
        expect(result.voices[0].notes).toEqual(input);
      });

      it('applies default id, keySignature, and null timeSignature', () => {
        const input = [{ pitch: 'C4', length: '1/4' }];

        const result = parseNoteData(input);
        const voice = result.voices[0];

        expect(voice.id).toBe('0');
        expect(voice.keySignature).toBe('C');
        expect(voice.timeSignature).toBeNull();
      });

      it('does not set a clef (left for inference)', () => {
        const input = [{ pitch: 'C4', length: '1/4' }];

        const result = parseNoteData(input);

        expect(result.voices[0].clef).toBeUndefined();
      });

      it('defaults staffGroups to empty array', () => {
        const input = [{ pitch: 'C4', length: '1/4' }];

        const result = parseNoteData(input);

        expect(result.staffGroups).toEqual([]);
      });
    });

    describe('Level 2: Single voice with metadata', () => {
      it('wraps into a single voice preserving metadata', () => {
        const input = {
          clef: 'treble',
          keySignature: 'G',
          timeSignature: [4, 4],
          notes: [
            { pitch: 'C4', length: '1/4' },
            { pitch: 'E4', length: '1/4' },
          ],
        };

        const result = parseNoteData(input);

        expect(result.voices).toHaveLength(1);
        expect(result.voices[0].clef).toBe('treble');
        expect(result.voices[0].keySignature).toBe('G');
        expect(result.voices[0].timeSignature).toEqual([4, 4]);
        expect(result.voices[0].notes).toEqual(input.notes);
      });

      it('fills defaults for omitted metadata', () => {
        const input = {
          notes: [{ pitch: 'C4', length: '1/4' }],
        };

        const result = parseNoteData(input);
        const voice = result.voices[0];

        expect(voice.id).toBe('0');
        expect(voice.keySignature).toBe('C');
        expect(voice.timeSignature).toBeNull();
        expect(voice.clef).toBeUndefined();
      });

      it('defaults staffGroups to empty array', () => {
        const input = {
          notes: [{ pitch: 'C4', length: '1/4' }],
        };

        const result = parseNoteData(input);

        expect(result.staffGroups).toEqual([]);
      });
    });

    describe('Level 3: Multi-voice', () => {
      it('preserves each voice with its metadata', () => {
        const input = {
          voices: [
            {
              id: 'melody',
              clef: 'treble',
              notes: [{ pitch: 'C5', length: '1/4' }],
            },
            {
              id: 'bass',
              clef: 'bass',
              notes: [{ pitch: 'C3', length: '1/4' }],
            },
          ],
        };

        const result = parseNoteData(input);

        expect(result.voices).toHaveLength(2);
        expect(result.voices[0].id).toBe('melody');
        expect(result.voices[0].clef).toBe('treble');
        expect(result.voices[1].id).toBe('bass');
        expect(result.voices[1].clef).toBe('bass');
      });

      it('applies top-level defaults to voices that lack them', () => {
        const input = {
          keySignature: 'D',
          timeSignature: [3, 4],
          voices: [
            { clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
            { clef: 'bass', notes: [{ pitch: 'C3', length: '1/4' }] },
          ],
        };

        const result = parseNoteData(input);

        expect(result.voices[0].keySignature).toBe('D');
        expect(result.voices[0].timeSignature).toEqual([3, 4]);
        expect(result.voices[1].keySignature).toBe('D');
        expect(result.voices[1].timeSignature).toEqual([3, 4]);
      });

      it('voice-level overrides take precedence over top-level defaults', () => {
        const input = {
          keySignature: 'C',
          timeSignature: [4, 4],
          voices: [
            { clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
            {
              clef: 'treble',
              keySignature: 'G',
              timeSignature: [3, 4],
              notes: [{ pitch: 'C5', length: '1/4' }],
            },
          ],
        };

        const result = parseNoteData(input);

        expect(result.voices[0].keySignature).toBe('C');
        expect(result.voices[0].timeSignature).toEqual([4, 4]);
        expect(result.voices[1].keySignature).toBe('G');
        expect(result.voices[1].timeSignature).toEqual([3, 4]);
      });

      it('defaults voice id to string index when omitted', () => {
        const input = {
          voices: [
            { clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
            { clef: 'bass', notes: [{ pitch: 'C3', length: '1/4' }] },
          ],
        };

        const result = parseNoteData(input);

        expect(result.voices[0].id).toBe('0');
        expect(result.voices[1].id).toBe('1');
      });

      it('preserves top-level markers array', () => {
        const input = {
          markers: [{ position: 4, marker: { barline: 'repeat-start' } }],
          voices: [{ clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] }],
        };

        const result = parseNoteData(input);

        expect(result.markers).toEqual(input.markers);
      });

      it('propagates staffGroups from input to output', () => {
        const input = {
          voices: [
            { id: 'treble', clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
            { id: 'bass', clef: 'bass', notes: [{ pitch: 'C3', length: '1/4' }] },
          ],
          staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
        };

        const result = parseNoteData(input);

        expect(result.staffGroups).toEqual([{ type: 'brace', voiceIds: ['treble', 'bass'] }]);
      });

      it('defaults staffGroups to empty array when absent from Level 3 input', () => {
        const input = {
          voices: [{ id: 'melody', clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] }],
        };

        const result = parseNoteData(input);

        expect(result.staffGroups).toEqual([]);
      });
    });

    describe('note element passthrough', () => {
      it('preserves note objects with pitch', () => {
        const input = [{ pitch: 'F#5', length: '1/8' }];
        const result = parseNoteData(input);

        expect(result.voices[0].notes[0]).toEqual({
          pitch: 'F#5',
          length: '1/8',
        });
      });

      it('preserves rest objects (no pitch)', () => {
        const input = [{ length: '1/4' }];
        const result = parseNoteData(input);

        expect(result.voices[0].notes[0]).toEqual({ length: '1/4' });
      });

      it('preserves chord arrays', () => {
        const chord = [
          { pitch: 'C4', length: '1/2' },
          { pitch: 'E4', length: '1/2' },
          { pitch: 'G4', length: '1/2' },
        ];
        const input = [chord, { pitch: 'B4', length: '1/2' }];
        const result = parseNoteData(input);

        expect(Array.isArray(result.voices[0].notes[0])).toBe(true);
        expect(result.voices[0].notes[0]).toEqual(chord);
        expect(result.voices[0].notes).toHaveLength(2);
      });

      it('preserves percussion position notes', () => {
        const input = [{ position: 5, length: '1/4' }];
        const result = parseNoteData(input);

        expect(result.voices[0].notes[0]).toEqual({
          position: 5,
          length: '1/4',
        });
      });

      it('preserves dotted flag on notes', () => {
        const input = [{ pitch: 'C4', length: '1/4', dotted: true }];
        const result = parseNoteData(input);

        expect(result.voices[0].notes[0].dotted).toBe(true);
      });
    });
  });
});
