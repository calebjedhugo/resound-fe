/**
 * Tie resolver.
 * Scans a note sequence and produces tie pair data.
 * Pure data logic — no SVG or DOM dependencies.
 */

/**
 * Extract notes with tie properties from an element (note or chord).
 * @param {Object|Array} element
 * @returns {Array<{pitch: string, tie: string}>}
 */
function getTiedNotes(element) {
  if (Array.isArray(element)) {
    return element.filter((n) => n.tie && n.pitch);
  }
  if (element.tie && element.pitch) {
    return [element];
  }
  return [];
}

/**
 * Get all pitches present in an element (note or chord).
 * @param {Object|Array} element
 * @returns {Set<string>}
 */
function getPitches(element) {
  if (Array.isArray(element)) {
    return new Set(element.filter((n) => n.pitch).map((n) => n.pitch));
  }
  if (element.pitch) {
    return new Set([element.pitch]);
  }
  return new Set();
}

/**
 * Resolve tie connections from a flat note sequence.
 * Returns an array of { startIndex, endIndex, pitch } objects.
 *
 * For chords, indices refer to the chord's position in the sequence,
 * and pitch identifies which note within the chord is tied.
 *
 * @param {Array} notes - Array of note objects or chord arrays
 * @returns {Array<{startIndex: number, endIndex: number, pitch: string}>}
 */
export function resolveTies(notes) {
  const pairs = [];
  // Map of pitch → startIndex for open ties
  const openTies = new Map();

  for (let i = 0; i < notes.length; i++) {
    const element = notes[i];
    const tiedNotes = getTiedNotes(element);
    const elementPitches = getPitches(element);

    // First, cancel any open ties whose pitch is not present in this element
    // (ties must connect consecutive elements)
    for (const [pitch] of openTies) {
      if (!elementPitches.has(pitch)) {
        openTies.delete(pitch);
      }
    }

    // Process tie properties
    for (const note of tiedNotes) {
      const { pitch, tie } = note;

      if (tie === 'stop' || tie === 'continue') {
        // Close open tie if one exists for this pitch
        if (openTies.has(pitch)) {
          pairs.push({
            startIndex: openTies.get(pitch),
            endIndex: i,
            pitch,
          });
          openTies.delete(pitch);
        }
      }

      if (tie === 'start' || tie === 'continue') {
        // Open a new tie for this pitch
        openTies.set(pitch, i);
      }
    }

    // Cancel open ties for pitches in this element that don't have a tie property
    // (a non-tied note of the same pitch breaks the chain)
    if (!Array.isArray(element)) {
      if (element.pitch && !element.tie && openTies.has(element.pitch)) {
        openTies.delete(element.pitch);
      }
    } else {
      for (const note of element) {
        if (note.pitch && !note.tie && openTies.has(note.pitch)) {
          openTies.delete(note.pitch);
        }
      }
    }
  }

  return pairs;
}
