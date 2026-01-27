/**
 * Key signature renderer.
 * Creates SVG group with accidental symbols at standard staff positions.
 */

import { createGroup } from 'notation/lib/svgHelpers';
import { createAccidental } from 'notation/components/Accidental';
import { getKeySignature } from 'notation/lib/keySignatures';
import { pitchToStaffY } from 'notation/lib/notePositions';

/**
 * Standard pitch placements for key signature accidentals per clef.
 * Each array has 7 entries matching SHARP_ORDER or FLAT_ORDER.
 */
export const KEY_SIG_POSITIONS = {
  treble: {
    sharp: ['F5', 'C5', 'G5', 'D5', 'A4', 'E5', 'B4'],
    flat: ['B4', 'E5', 'A4', 'D5', 'G4', 'C5', 'F4'],
  },
  bass: {
    sharp: ['F3', 'C3', 'G3', 'D3', 'A2', 'E3', 'B2'],
    flat: ['B2', 'E3', 'A2', 'D3', 'G2', 'C3', 'F2'],
  },
  alto: {
    sharp: ['F4', 'C4', 'G4', 'D4', 'A3', 'E4', 'B3'],
    flat: ['B3', 'E4', 'A3', 'D4', 'G3', 'C4', 'F3'],
  },
  tenor: {
    sharp: ['F3', 'C4', 'G3', 'D4', 'A3', 'E4', 'B3'],
    flat: ['B3', 'E3', 'A3', 'D3', 'G3', 'C3', 'F3'],
  },
};

const ACCIDENTAL_SPACING = 10;

/**
 * Create an SVG group representing a key signature.
 * Returns null if the key has no accidentals (key of C).
 *
 * @param {string} key - Key name (e.g. "G", "Bb", "C")
 * @param {string} clef - Clef type for positioning
 * @returns {SVGGElement|null}
 */
export function createKeySignature(key, clef) {
  const keyInfo = getKeySignature(key);

  if (keyInfo.count === 0) {
    return null;
  }

  const positions = KEY_SIG_POSITIONS[clef];
  if (!positions) {
    throw new Error(`Unsupported clef for key signature: "${clef}"`);
  }

  const pitchList = positions[keyInfo.type];
  const group = createGroup('key-signature');

  for (let i = 0; i < keyInfo.count; i++) {
    const x = i * ACCIDENTAL_SPACING;
    const y = pitchToStaffY(pitchList[i], clef);

    const accGroup = createAccidental(keyInfo.type);
    accGroup.setAttribute('transform', `translate(${x}, ${y})`);
    group.appendChild(accGroup);
  }

  return group;
}
