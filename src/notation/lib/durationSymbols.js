/**
 * Duration/length utilities.
 * Maps fraction strings to note type names, visual properties, and beat values.
 */

export const VALID_LENGTHS = ['1/1', '1/2', '1/4', '1/8', '1/16', '1/32'];

const DURATION_MAP = {
  '1/1': {
    name: 'whole',
    cssClass: 'note-whole',
    hasStem: false,
    filledHead: false,
    flags: 0,
    beams: 0,
    spacing: 80,
  },
  '1/2': {
    name: 'half',
    cssClass: 'note-half',
    hasStem: true,
    filledHead: false,
    flags: 0,
    beams: 0,
    spacing: 60,
  },
  '1/4': {
    name: 'quarter',
    cssClass: 'note-quarter',
    hasStem: true,
    filledHead: true,
    flags: 0,
    beams: 0,
    spacing: 40,
  },
  '1/8': {
    name: 'eighth',
    cssClass: 'note-eighth',
    hasStem: true,
    filledHead: true,
    flags: 1,
    beams: 1,
    spacing: 30,
  },
  '1/16': {
    name: '16th',
    cssClass: 'note-16th',
    hasStem: true,
    filledHead: true,
    flags: 2,
    beams: 2,
    spacing: 25,
  },
  '1/32': {
    name: '32nd',
    cssClass: 'note-32nd',
    hasStem: true,
    filledHead: true,
    flags: 3,
    beams: 3,
    spacing: 20,
  },
};

const FRACTION_REGEX = /^(\d+)\/(\d+)$/;

/**
 * Parse a fraction string into numerator and denominator.
 * @param {string} lengthString - e.g. "1/4"
 * @returns {{ numerator: number, denominator: number }}
 */
export function parseFraction(lengthString) {
  const match = lengthString.match(FRACTION_REGEX);
  if (!match) {
    throw new Error(`Invalid fraction: "${lengthString}"`);
  }
  return {
    numerator: parseInt(match[1], 10),
    denominator: parseInt(match[2], 10),
  };
}

/**
 * Convert a fraction string to beat count (quarter note = 1 beat).
 * @param {string} lengthString - e.g. "1/4"
 * @returns {number}
 */
export function fractionToBeats(lengthString) {
  const { numerator, denominator } = parseFraction(lengthString);
  return (numerator / denominator) * 4;
}

/**
 * Get visual/rendering properties for a note duration.
 * @param {string} lengthString - e.g. "1/4"
 * @returns {{ name, cssClass, hasStem, filledHead, flags, beams, spacing }}
 */
export function getDurationInfo(lengthString) {
  const info = DURATION_MAP[lengthString];
  if (!info) {
    throw new Error(`Unrecognized note length: "${lengthString}"`);
  }
  return { ...info };
}
