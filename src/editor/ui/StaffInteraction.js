/**
 * StaffInteraction
 *
 * Pure-logic module for resolving staff coordinates to pitches and
 * calculating barline positions. No DOM or browser dependencies.
 */

// Staff layout constants
const STAFF_TOP_Y = 20; // Y pixel of top line (F5)
const STAFF_LINE_SPACING = 10; // Pixels between staff lines
const STAFF_LINES = 5;

// Pitches from top of staff to bottom (treble clef, each line/space)
// F5, E5, D5, C5, B4, A4, G4, F4, E4, D4 (and ledger lines beyond)
const STAFF_PITCHES = ['F5', 'E5', 'D5', 'C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4', 'B3'];

/**
 * Convert a Y pixel coordinate to the nearest staff pitch.
 * Each half-space (line or space) is STAFF_LINE_SPACING / 2 = 5 pixels.
 * @param {number} y - Y coordinate in SVG viewBox space
 * @returns {string} Pitch string, e.g. 'B4'
 */
export function yToPitch(y) {
  const halfSpaceFromTop = Math.round((y - STAFF_TOP_Y) / (STAFF_LINE_SPACING / 2));
  const clampedIndex = Math.max(0, Math.min(halfSpaceFromTop, STAFF_PITCHES.length - 1));
  return STAFF_PITCHES[clampedIndex];
}

/**
 * Convert a pitch string to a Y pixel coordinate.
 * @param {string} pitch - Pitch string, e.g. 'B4'
 * @returns {number} Y coordinate in SVG viewBox space
 */
export function pitchToY(pitch) {
  const index = STAFF_PITCHES.indexOf(pitch);
  if (index === -1) return STAFF_TOP_Y; // fallback
  return STAFF_TOP_Y + index * (STAFF_LINE_SPACING / 2);
}

/**
 * Snap a Y coordinate to the nearest staff line or space.
 * @param {number} y - Y coordinate in SVG viewBox space
 * @returns {number} Snapped Y coordinate
 */
export function snapToStaffPosition(y) {
  const halfSpaceFromTop = Math.round((y - STAFF_TOP_Y) / (STAFF_LINE_SPACING / 2));
  return STAFF_TOP_Y + halfSpaceFromTop * (STAFF_LINE_SPACING / 2);
}

/**
 * Calculate barline positions based on note durations and time signature.
 * Returns an array of indices indicating where barlines should appear
 * (the index represents "after this many notes").
 *
 * @param {Array} notes - Array of note objects with { length } or chord arrays
 * @param {number[]} timeSignature - [numerator, denominator], e.g. [4, 4]
 * @returns {number[]} Array of barline positions (note indices after which barlines appear)
 */
export function calculateBarlines(notes, timeSignature = [4, 4]) {
  const [num, den] = timeSignature;
  const measureCapacity = num / den; // In whole notes: 4/4 = 1.0

  const barlines = [];
  let accumulated = 0;

  notes.forEach((note, i) => {
    const noteObj = Array.isArray(note) ? note[0] : note;
    const [n, d] = noteObj.length.split('/').map(Number);
    accumulated += n / d;

    if (Math.abs(accumulated - measureCapacity) < 1e-9 || accumulated >= measureCapacity) {
      barlines.push(i + 1); // Barline position is after this note index
      accumulated = accumulated - measureCapacity;
    }
  });

  return barlines;
}

/**
 * Create a note object from a staff click coordinate and active duration.
 * @param {number} y - Y coordinate of the click in SVG viewBox space
 * @param {string} activeLength - Duration string, e.g. '1/4'
 * @returns {{ pitch: string, length: string }}
 */
export function createNoteFromClick(y, activeLength) {
  const pitch = yToPitch(y);
  return { pitch, length: activeLength };
}

export { STAFF_TOP_Y, STAFF_LINE_SPACING, STAFF_LINES, STAFF_PITCHES };
