/**
 * Elevation helpers
 *
 * Elevation 0 is the implicit ground plane (always walkable), so it is always
 * an available storey. Higher storeys exist only where a floor region defines
 * a raised platform. These helpers derive the set of storeys the editor should
 * expose from the floor list.
 */

/**
 * Distinct storeys available to view/place on, ascending.
 * Always includes 0 (the implicit ground) plus every elevation that has a floor.
 * @param {Array<{elevation: number}>} floors
 * @returns {number[]}
 */
export function availableElevations(floors) {
  const set = new Set([0]);
  (floors || []).forEach((f) => set.add(f.elevation));
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * Highest elevation that currently has a floor (0 if there are none).
 * The next storey you can build is maxFloorElevation + 1.
 * @param {Array<{elevation: number}>} floors
 * @returns {number}
 */
export function maxFloorElevation(floors) {
  return (floors || []).reduce((max, f) => Math.max(max, f.elevation), 0);
}
