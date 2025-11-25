// Note frequency mapping (A4 = 440 Hz)
const noteFrequencies = {
  'C/2': 65.41,
  'C#/2': 69.3,
  'Db/2': 69.3,
  'D/2': 73.42,
  'D#/2': 77.78,
  'Eb/2': 77.78,
  'E/2': 82.41,
  'F/2': 87.31,
  'F#/2': 92.5,
  'Gb/2': 92.5,
  'G/2': 98.0,
  'G#/2': 103.83,
  'Ab/2': 103.83,
  'A/2': 110.0,
  'A#/2': 116.54,
  'Bb/2': 116.54,
  'B/2': 123.47,
  'C/3': 130.81,
  'C#/3': 138.59,
  'Db/3': 138.59,
  'D/3': 146.83,
  'D#/3': 155.56,
  'Eb/3': 155.56,
  'E/3': 164.81,
  'F/3': 174.61,
  'F#/3': 185.0,
  'Gb/3': 185.0,
  'G/3': 196.0,
  'G#/3': 207.65,
  'Ab/3': 207.65,
  'A/3': 220.0,
  'A#/3': 233.08,
  'Bb/3': 233.08,
  'B/3': 246.94,
  'C/4': 261.626,
  'C#/4': 277.18,
  'Db/4': 277.18,
  'D/4': 293.66,
  'D#/4': 311.13,
  'Eb/4': 311.13,
  'E/4': 329.63,
  'F/4': 349.23,
  'F#/4': 369.99,
  'Gb/4': 369.99,
  'G/4': 392,
  'G#/4': 415.3,
  'Ab/4': 415.3,
  'A/4': 440,
  'A#/4': 466.16,
  'Bb/4': 466.16,
  'B/4': 493.88,
  'C/5': 523.252,
  'C#/5': 554.37,
  'Db/5': 554.37,
  'D/5': 587.33,
  'D#/5': 622.25,
  'Eb/5': 622.25,
  'E/5': 659.25,
  'F/5': 698.46,
  'F#/5': 739.99,
  'Gb/5': 739.99,
  'G/5': 783.99,
  'G#/5': 830.61,
  'Ab/5': 830.61,
  'A/5': 880.0,
  'A#/5': 932.33,
  'Bb/5': 932.33,
  'B/5': 987.77,
};

/**
 * Convert note name to frequency in Hz
 * @param {string|number} pitch - Note name (e.g., 'C4', 'C#4') or frequency number
 * @returns {number} Frequency in Hz
 */
export function getFrequency(pitch) {
  if (typeof pitch === 'number') return pitch;
  if (noteFrequencies[pitch]) return noteFrequencies[pitch];

  // Try simple conversion for notes like C4, D4, etc.
  const match = pitch.match(/^([A-G][#b]?)(\d)$/);
  if (match) {
    const [, note, octave] = match;
    const key = `${note}/${octave}`;
    if (noteFrequencies[key]) return noteFrequencies[key];
  }

  console.warn(`Unknown pitch: ${pitch}, using A4 (440 Hz)`);
  return 440;
}
