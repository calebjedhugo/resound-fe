/**
 * Beam grouping logic.
 * Groups notes into beam groups based on time signature and beat boundaries.
 * Pure data module — no DOM.
 */

import { getDurationInfo, fractionToBeats } from 'notation/lib/durationSymbols';

const MAX_GROUP_SIZE = 4;

/**
 * Compute the beat length in quarter-note-beats for a time signature.
 * Detects compound time (6/8, 9/8, 12/8, 3/8) and uses compound beats.
 */
function getBeatLength(timeSignature) {
  const [beats, beatValue] = timeSignature;
  const baseBeatLength = 4 / beatValue;

  // Compound time: numerator divisible by 3, beat value is 8 or smaller
  if (beats % 3 === 0 && beatValue >= 8) {
    return baseBeatLength * 3;
  }
  return baseBeatLength;
}

/**
 * Get the beat duration for a note element, accounting for dotted flag.
 */
function getElementBeats(element) {
  if (!element.length) return 0;
  let beats = fractionToBeats(element.length);
  if (element.dotted) beats *= 1.5;
  return beats;
}

/**
 * Group notes into beam groups based on time signature and beat boundaries.
 *
 * Rules:
 * - Beam 8th notes and smaller within the same beat
 * - Break beams at beat boundaries
 * - Max 4 notes per beam group
 * - Rests break beams
 * - Unmetered mode (null timeSignature) = no beaming
 *
 * @param {Array} notes - Array of note/rest/chord elements
 * @param {[number, number]|null} timeSignature
 * @returns {Array<Array<number>>} Array of beam groups (each is array of indices)
 */
export function computeBeamGroups(notes, timeSignature) {
  if (!timeSignature) return [];
  if (notes.length === 0) return [];

  const beatLength = getBeatLength(timeSignature);

  // First pass: annotate elements with metadata
  const annotated = [];
  let currentBeat = 0;

  for (let i = 0; i < notes.length; i++) {
    const element = notes[i];

    if (Array.isArray(element)) {
      // Chord — not beamable yet, but advance beat
      const length = element[0]?.length;
      if (length) {
        let beats = fractionToBeats(length);
        if (element[0].dotted) beats *= 1.5;
        currentBeat += beats;
      }
      annotated.push({ index: i, beamable: false });
      continue;
    }

    const isRest = !element.pitch;
    const beats = getElementBeats(element);

    let beamable = false;
    let beatGroup = -1;

    if (!isRest && element.length) {
      const info = getDurationInfo(element.length);
      beamable = info.beams >= 1;
      beatGroup = Math.floor((currentBeat + 0.001) / beatLength);
    }

    annotated.push({ index: i, beamable, beatGroup });
    currentBeat += beats;
  }

  // Second pass: group consecutive beamable notes in the same beat
  const groups = [];
  let currentGroup = [];
  let currentGroupBeat = -1;

  for (const el of annotated) {
    if (el.beamable) {
      if (el.beatGroup !== currentGroupBeat) {
        // New beat — flush current group
        if (currentGroup.length >= 2) {
          groups.push(currentGroup.map((e) => e.index));
        }
        currentGroup = [el];
        currentGroupBeat = el.beatGroup;
      } else if (currentGroup.length >= MAX_GROUP_SIZE) {
        // Same beat but group full — flush and start sub-group
        groups.push(currentGroup.map((e) => e.index));
        currentGroup = [el];
      } else {
        currentGroup.push(el);
      }
    } else {
      // Not beamable — flush
      if (currentGroup.length >= 2) {
        groups.push(currentGroup.map((e) => e.index));
      }
      currentGroup = [];
      currentGroupBeat = -1;
    }
  }

  // Flush final group
  if (currentGroup.length >= 2) {
    groups.push(currentGroup.map((e) => e.index));
  }

  return groups;
}
