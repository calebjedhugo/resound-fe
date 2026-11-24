/**
 * staffCoords — reverse coordinate mapping for the interactive editor.
 *
 * The renderer's forward map (pitchToStaffY) places a pitch on the staff.
 * The editor needs the inverse: a click at a staff-local Y resolves to the
 * nearest diatonic pitch. No DOM dependencies — the caller converts screen
 * coordinates into staff-local space (via the SVG CTM) before calling here.
 */

import { CLEF_CONSTANTS } from 'resound-notation/lib/notePositions';
import { getKeySignature } from 'resound-notation/lib/keySignatures';

const NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

// How far past the staff a pitch can go: 3 ledger lines above and below
const LEDGER_STEPS = 6;

/** Diatonic position (C0 = 0, one per letter) of a pitch, or NaN. */
export function diatonicPosition(pitch) {
  const m = /^([A-G])[#b]?(-?\d+)$/.exec(pitch || '');
  return m ? Number(m[2]) * 7 + NOTE_NAMES.indexOf(m[1]) : NaN;
}

/** The pitch (letter + octave, no accidental) at a diatonic position. */
function pitchAt(pos) {
  const octave = Math.floor(pos / 7);
  return `${NOTE_NAMES[pos - octave * 7]}${octave}`;
}

/** The staff positions a clef reaches: [lowest, highest] diatonic. */
function staffRange(clef) {
  const constant = CLEF_CONSTANTS[clef] ?? CLEF_CONSTANTS.treble;
  return [constant - 8 - LEDGER_STEPS, constant - 1 + LEDGER_STEPS];
}

/** A pitch's staff position (letter + octave), its accidental dropped. */
export function staffPitch(pitch) {
  const pos = diatonicPosition(pitch);
  return Number.isNaN(pos) ? null : pitchAt(pos);
}

/**
 * The staff position `steps` lines/spaces above `pitch` (below: negative),
 * kept within the clef's reach.
 */
export function stepStaffPitch(pitch, steps, clef = 'treble') {
  const [low, high] = staffRange(clef);
  const pos = diatonicPosition(pitch);
  const from = Number.isNaN(pos) ? (low + high) / 2 : pos;
  return pitchAt(Math.max(low, Math.min(high, from + steps)));
}

/** A staff position within the clef's reach (clamped onto it). */
export function clampStaffPitch(pitch, clef = 'treble') {
  return stepStaffPitch(pitch, 0, clef);
}

/** The staff's middle line in a clef (B4 treble, D3 bass). */
export function middleLinePitch(clef = 'treble') {
  const constant = CLEF_CONSTANTS[clef] ?? CLEF_CONSTANTS.treble;
  return pitchAt(constant - 5);
}

/**
 * The pitch a staff position means in a key: its letter with the key
 * signature's sharp or flat ('F4' in D -> 'F#4').
 */
export function keyPitch(position, key = 'C') {
  const m = /^([A-G])(-?\d+)$/.exec(position || '');
  if (!m) return position;
  let sig;
  try {
    sig = getKeySignature(key);
  } catch {
    return position;
  }
  if (!sig.accidentals.includes(m[1])) return position;
  return `${m[1]}${sig.type === 'sharp' ? '#' : 'b'}${m[2]}`;
}

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
  // Clamp to the clef's reach: 3 ledger lines above and below the staff.
  const [minPos, maxPos] = staffRange(clef);
  return pitchAt(Math.max(minPos, Math.min(maxPos, diatonicPos)));
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
