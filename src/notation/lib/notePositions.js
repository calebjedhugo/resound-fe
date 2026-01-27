/**
 * Pitch-to-staff-position mapping.
 * Converts pitch strings (e.g. "C4", "F#5") to diatonic positions and Y coordinates.
 *
 * Uses diatonic (not chromatic) positioning — accidentals do not affect position.
 */

const NOTE_INDICES = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

const PITCH_REGEX = /^([A-G])(#|b)?(\d)$/;

/**
 * Reference constant per clef: the diatonic position of the note at y=0
 * (the space above the top staff line).
 */
export const CLEF_CONSTANTS = {
  treble: 39, // G5 = 5*7 + 4
  bass: 27, // B3 = 3*7 + 6
  alto: 33, // A4 = 4*7 + 5
  tenor: 31, // F4 = 4*7 + 3
};

/**
 * Parse a scientific pitch string into its components.
 * @param {string} pitchString - e.g. "C4", "F#5", "Bb3"
 * @returns {{ noteName: string, accidental: string, octave: number, noteIndex: number }}
 */
export function parsePitch(pitchString) {
  const match = pitchString.match(PITCH_REGEX);
  if (!match) {
    throw new Error(`Invalid pitch: "${pitchString}"`);
  }

  const noteName = match[1];
  const accidental = match[2] || '';
  const octave = parseInt(match[3], 10);

  return {
    noteName,
    accidental,
    octave,
    noteIndex: NOTE_INDICES[noteName],
  };
}

/**
 * Get the diatonic position for a pitch string.
 * diatonicPos = octave * 7 + noteIndex
 *
 * Accidentals (sharps/flats) do not affect diatonic position.
 * @param {string} pitchString
 * @returns {number}
 */
export function getDiatonicPosition(pitchString) {
  const { octave, noteIndex } = parsePitch(pitchString);
  return octave * 7 + noteIndex;
}

/**
 * Convert a pitch string to a Y coordinate on the staff.
 * y = (clefConstant - diatonicPos) * 10
 *
 * @param {string} pitchString
 * @param {string} clef - "treble", "bass", "alto", or "tenor"
 * @returns {number} Y coordinate in pixels
 */
export function pitchToStaffY(pitchString, clef) {
  const constant = CLEF_CONSTANTS[clef];
  if (constant === undefined) {
    throw new Error(`Unknown clef: "${clef}"`);
  }
  const diatonicPos = getDiatonicPosition(pitchString);
  return (constant - diatonicPos) * 10;
}
