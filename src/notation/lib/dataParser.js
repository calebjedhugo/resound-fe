/**
 * Normalizes any input format (Level 1/2/3) to canonical multi-voice structure.
 *
 * Canonical output:
 * {
 *   markers: [...],      // optional
 *   staffGroups: [...],   // staff grouping info (e.g., brace for grand staff)
 *   voices: [{
 *     id: string,
 *     clef: string | undefined,
 *     keySignature: string,
 *     timeSignature: [number, number] | null,
 *     notes: Array
 *   }]
 * }
 */
export function parseNoteData(input) {
  // Level 1: plain array of notes
  if (Array.isArray(input)) {
    return {
      staffGroups: [],
      voices: [
        {
          id: '0',
          keySignature: 'C',
          timeSignature: null,
          notes: input,
        },
      ],
    };
  }

  // Level 3: multi-voice (has voices array)
  if (input.voices) {
    const topKeySignature = input.keySignature || 'C';
    const topTimeSignature = input.timeSignature !== undefined ? input.timeSignature : null;

    const result = {
      staffGroups: input.staffGroups || [],
      voices: input.voices.map((voice, index) => ({
        id: voice.id !== undefined ? voice.id : String(index),
        clef: voice.clef,
        keySignature: voice.keySignature !== undefined ? voice.keySignature : topKeySignature,
        timeSignature: voice.timeSignature !== undefined ? voice.timeSignature : topTimeSignature,
        notes: voice.notes,
      })),
    };

    if (input.markers) {
      result.markers = input.markers;
    }

    return result;
  }

  // Level 2: single voice with metadata
  const voice = {
    id: '0',
    keySignature: input.keySignature || 'C',
    timeSignature: input.timeSignature !== undefined ? input.timeSignature : null,
    notes: input.notes,
  };

  if (input.clef) {
    voice.clef = input.clef;
  }

  return { staffGroups: [], voices: [voice] };
}
