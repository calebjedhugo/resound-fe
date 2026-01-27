/**
 * Key signature data.
 * Maps key names to their accidentals (sharps or flats).
 */

export const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
export const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

// Key → { type, count } for sharps
const SHARP_KEYS = {
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  'F#': 6,
  'C#': 7,
};

// Key → { type, count } for flats
const FLAT_KEYS = {
  F: 1,
  Bb: 2,
  Eb: 3,
  Ab: 4,
  Db: 5,
  Gb: 6,
  Cb: 7,
};

/**
 * Get the key signature info for a key name.
 * @param {string} key - e.g. "C", "G", "Bb", "F#"
 * @returns {{ type: 'sharp'|'flat'|'none', accidentals: string[], count: number }}
 */
export function getKeySignature(key) {
  if (key === 'C') {
    return { type: 'none', accidentals: [], count: 0 };
  }

  if (key in SHARP_KEYS) {
    const count = SHARP_KEYS[key];
    return {
      type: 'sharp',
      accidentals: SHARP_ORDER.slice(0, count),
      count,
    };
  }

  if (key in FLAT_KEYS) {
    const count = FLAT_KEYS[key];
    return {
      type: 'flat',
      accidentals: FLAT_ORDER.slice(0, count),
      count,
    };
  }

  throw new Error(`Invalid key signature: "${key}"`);
}

/**
 * Check if a key string is a valid key signature.
 * @param {string} key
 * @returns {boolean}
 */
export function isValidKeySignature(key) {
  return key === 'C' || key in SHARP_KEYS || key in FLAT_KEYS;
}
