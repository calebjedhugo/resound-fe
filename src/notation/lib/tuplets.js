/**
 * Tuplet duration math utilities.
 */

import { fractionToBeats } from 'notation/lib/durationSymbols';

/**
 * Calculate effective duration of a note within a tuplet (in beats).
 * @param {string} faceLength - Written length (e.g., "1/8")
 * @param {boolean} dotted - Whether the note is dotted
 * @param {number[]} tupletRatio - [actual, normal]
 * @returns {number} Effective duration in beats
 */
export function getTupletNoteDuration(faceLength, dotted, tupletRatio) {
  const [actual, normal] = tupletRatio;
  let faceBeats = fractionToBeats(faceLength);
  if (dotted) faceBeats *= 1.5;
  return faceBeats * (normal / actual);
}

/**
 * Calculate total duration of a tuplet group in beats.
 * @param {Object} tupletObj - The tuplet wrapper object
 * @returns {number} Total duration in beats
 */
export function getTupletGroupBeats(tupletObj) {
  const ratio = tupletObj.tuplet;
  let total = 0;
  for (const el of tupletObj.notes) {
    if (Array.isArray(el)) {
      // Chord: use first note's length
      const length = el[0].length;
      const dotted = el[0].dotted || false;
      total += getTupletNoteDuration(length, dotted, ratio);
    } else if (el.length) {
      total += getTupletNoteDuration(el.length, el.dotted || false, ratio);
    }
  }
  return total;
}
