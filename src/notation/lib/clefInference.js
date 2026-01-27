/**
 * Auto-detect clef from a notes array.
 *
 * Rules:
 * 1. If any note has a pitch: use median pitch to choose treble/bass
 *    - median >= C4 (diatonicPos 28) → treble
 *    - median < C4 → bass
 * 2. If no notes have pitch (all rests or percussion) → percussion
 */

import { getDiatonicPosition } from './notePositions';

const C4_DIATONIC = 28;

/**
 * Collect all diatonic positions from a notes array,
 * handling chords (nested arrays) and skipping rests/percussion.
 */
function collectPitchPositions(notes) {
  const positions = [];

  for (const element of notes) {
    if (Array.isArray(element)) {
      // Chord — include all pitched notes
      for (const note of element) {
        if (note.pitch) {
          positions.push(getDiatonicPosition(note.pitch));
        }
      }
    } else if (element.tuplet && element.notes) {
      // Tuplet wrapper — recurse into inner notes
      positions.push(...collectPitchPositions(element.notes));
    } else if (element.pitch) {
      positions.push(getDiatonicPosition(element.pitch));
    }
  }

  return positions;
}

/**
 * Calculate the median of a sorted numeric array.
 */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Infer the best clef for a notes array.
 * @param {Array} notes - Array of note objects, rest objects, chord arrays
 * @returns {string} "treble", "bass", or "percussion"
 */
export function inferClef(notes) {
  const positions = collectPitchPositions(notes);

  if (positions.length === 0) {
    return 'percussion';
  }

  const med = median(positions);
  return med >= C4_DIATONIC ? 'treble' : 'bass';
}
