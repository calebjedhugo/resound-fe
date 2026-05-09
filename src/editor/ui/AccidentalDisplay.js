/**
 * AccidentalDisplay
 *
 * Pure function that determines whether to display an accidental for a note
 * based on the key signature and in-measure memory of previously displayed
 * accidentals. Follows standard music notation rules:
 *
 * 1. Key signature sets the baseline (e.g., F# in G major is default)
 * 2. If a note matches the current "active" accidental, no display needed
 * 3. If it differs, display the accidental and update the memory
 * 4. Memory resets at barlines (caller clears the map)
 */

import { parsePitch } from 'resound-notation/lib/notePositions';

/**
 * Determine whether to display an accidental for a note.
 * @param {string} pitch - e.g. 'F#4'
 * @param {Map} activeAccidentals - current measure state: Map of "noteLetter+octave" -> current accidental ('#', 'b', or '')
 * @param {Object} keyInfo - from getKeySignature(), e.g. { type: 'sharp', accidentals: ['F'], count: 1 }
 * @returns {{ display: boolean, type: string|null }} - type is 'sharp', 'flat', or 'natural'
 */
export function resolveAccidentalDisplay(pitch, activeAccidentals, keyInfo) {
  const { noteName, accidental, octave } = parsePitch(pitch);

  const key = `${noteName}${octave}`;

  // Determine what accidental is "active" for this pitch
  let activeAcc;
  if (activeAccidentals.has(key)) {
    activeAcc = activeAccidentals.get(key);
  } else if (keyInfo.accidentals.includes(noteName)) {
    // Derive from key signature: this note letter is in the key sig accidentals
    activeAcc = keyInfo.type === 'sharp' ? '#' : 'b';
  } else {
    activeAcc = '';
  }

  // Compare note's accidental to active
  if (accidental === activeAcc) {
    return { display: false, type: null };
  }

  // Need to display - update the map
  activeAccidentals.set(key, accidental);

  // Determine display type
  let type;
  if (accidental === '#') type = 'sharp';
  else if (accidental === 'b') type = 'flat';
  else type = 'natural'; // '' means natural sign needed (cancelling active accidental)

  return { display: true, type };
}
