/**
 * staffCoords — reverse coordinate mapping for the interactive editor.
 *
 * The renderer's forward map (pitchToStaffY) places a pitch on the staff.
 * The editor needs the inverse: a click at a staff-local Y resolves to the
 * nearest diatonic pitch. No DOM dependencies — the caller converts screen
 * coordinates into staff-local space (via the SVG CTM) before calling here.
 */

import { CLEF_CONSTANTS } from 'resound-notation/lib/notePositions';

const NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/**
 * Convert a Y coordinate in staff space to the nearest diatonic pitch.
 * Reverses the renderer formula: y = (clefConstant - diatonicPos) * 10.
 *
 * @param {number} y - Y coordinate in staff coordinate space
 * @param {string} clef - Clef name (default 'treble')
 * @returns {string} Pitch string, e.g. 'B4'
 */
export function yToPitch(y, clef = 'treble') {
  const constant = CLEF_CONSTANTS[clef] ?? CLEF_CONSTANTS.treble;
  const diatonicPos = Math.round(constant - y / 10);

  // Clamp to a reasonable range: 3 ledger lines above and below the staff.
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
 * Build a note object from a staff click Y and the active duration.
 * @param {number} y - Y coordinate of the click in staff coordinate space
 * @param {string} activeLength - Duration string, e.g. '1/4'
 * @param {string} clef - Clef name (default 'treble')
 * @returns {{ pitch: string, length: string }}
 */
export function createNoteFromClick(y, activeLength, clef = 'treble') {
  return { pitch: yToPitch(y, clef), length: activeLength };
}
