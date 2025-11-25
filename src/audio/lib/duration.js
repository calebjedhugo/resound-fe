/**
 * Convert rhythm notation to milliseconds
 * @param {string} fraction - Rhythm as fraction (e.g., '1/4', '1/8')
 * @param {number} tempo - Beats per minute
 * @param {number} basis - What note gets the beat (4 = quarter note)
 * @returns {number} Duration in milliseconds
 */
export function getDuration(fraction = '1/4', tempo = 100, basis = 4) {
  const [numerator, denominator] = fraction.split('/').map(Number);
  if (!numerator || !denominator) {
    throw new Error(`Invalid fraction format: ${fraction}`);
  }
  return ((numerator * basis) / denominator) * (60 / tempo) * 1000;
}
