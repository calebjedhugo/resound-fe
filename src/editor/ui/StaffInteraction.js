/**
 * StaffInteraction
 *
 * Pure-logic module for resolving staff coordinates to pitches and
 * calculating barline positions. No DOM or browser dependencies.
 *
 * Delegates pitch/Y mapping to the notation system's coordinate space
 * (pitchToStaffY, CLEF_CONSTANTS from notation/lib/notePositions).
 */

import { pitchToStaffY, CLEF_CONSTANTS } from 'resound-notation/lib/notePositions';

const NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/**
 * Convert a Y coordinate in notation space to the nearest diatonic pitch.
 * Reverses the formula: y = (clefConstant - diatonicPos) * 10
 *
 * @param {number} y - Y coordinate in notation coordinate space
 * @param {string} clef - Clef name (default 'treble')
 * @returns {string} Pitch string, e.g. 'B4'
 */
export function yToPitch(y, clef = 'treble') {
  const constant = CLEF_CONSTANTS[clef];
  // diatonicPos = constant - y / 10
  const diatonicPos = Math.round(constant - y / 10);

  // Clamp to reasonable range: 3 ledger lines above and below staff.
  // Staff spans from constant-1 (top line) down to constant-8 (bottom line).
  // 3 ledger lines = 6 additional diatonic positions in each direction.
  const topLinePos = constant - 1;
  const bottomLinePos = constant - 8;
  const maxPos = topLinePos + 6; // 3 ledger lines above top line
  const minPos = bottomLinePos - 6; // 3 ledger lines below bottom line
  const clampedPos = Math.max(minPos, Math.min(maxPos, diatonicPos));

  const octave = Math.floor(clampedPos / 7);
  const noteIndex = clampedPos - octave * 7;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/**
 * Convert a pitch string to a Y coordinate in notation space.
 * Thin wrapper around pitchToStaffY.
 *
 * @param {string} pitch - Pitch string, e.g. 'B4'
 * @param {string} clef - Clef name (default 'treble')
 * @returns {number} Y coordinate in notation coordinate space
 */
export function pitchToY(pitch, clef = 'treble') {
  return pitchToStaffY(pitch, clef);
}

/**
 * Snap a Y coordinate to the nearest diatonic position in notation space.
 * Positions are on a 10px grid (each diatonic step = 10px).
 *
 * @param {number} y - Y coordinate in notation coordinate space
 * @returns {number} Snapped Y coordinate
 */
export function snapToStaffPosition(y) {
  return Math.round(y / 10) * 10;
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
 * @param {number} y - Y coordinate of the click in notation coordinate space
 * @param {string} activeLength - Duration string, e.g. '1/4'
 * @param {string} clef - Clef name (default 'treble')
 * @returns {{ pitch: string, length: string }}
 */
export function createNoteFromClick(y, activeLength, clef = 'treble') {
  const pitch = yToPitch(y, clef);
  return { pitch, length: activeLength };
}
