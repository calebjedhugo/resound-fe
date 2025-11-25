/**
 * Utility functions for game logic
 */

/**
 * Calculate 3D distance between two positions
 * @param {Object} pos1 - Position {x, y, z}
 * @param {Object} pos2 - Position {x, y, z}
 * @returns {number} Distance in world units
 */
export function getDistance(pos1, pos2) {
  const dx = pos2.x - pos1.x;
  const dy = pos2.y - pos1.y;
  const dz = pos2.z - pos1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate volume based on distance using inverse square law
 * @param {number} distance - Distance from source
 * @param {number} maxDistance - Maximum audible distance
 * @returns {number} Volume multiplier (0.0 to 1.0)
 */
export function getDistanceVolume(distance, maxDistance) {
  if (distance > maxDistance) return 0;

  // Inverse square law with smoothing
  const normalizedDistance = distance / maxDistance;
  return 1 / (1 + normalizedDistance * normalizedDistance);
}

/**
 * Quantize a timestamp to nearest beat subdivision
 * @param {number} timestamp - Timestamp in milliseconds
 * @param {number} startTime - Recording start time in milliseconds
 * @param {number} tempo - Tempo in BPM
 * @param {number} subdivision - Beat subdivision (16 = 16th notes)
 * @returns {number} Quantized beat position
 */
export function quantizeToBeat(timestamp, startTime, tempo, subdivision = 16) {
  const msPerBeat = (60 / tempo) * 1000;
  const elapsed = timestamp - startTime;
  const beat = elapsed / msPerBeat;

  // Quantize to nearest subdivision
  const subdivisions = subdivision / 4; // 16th notes = 4 subdivisions per beat
  return Math.round(beat * subdivisions) / subdivisions;
}

/**
 * Group an array of objects by a key
 * @param {Array} array - Array to group
 * @param {string} key - Key to group by
 * @returns {Object} Grouped object
 */
export function groupBy(array, key) {
  return array.reduce((result, item) => {
    const groupKey = item[key];
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {});
}
