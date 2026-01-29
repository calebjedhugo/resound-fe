import { WORLD_SCALE } from 'core/constants';

/**
 * Convert world coordinates to grid coordinates (integer x, z).
 * Returns null if the position is outside the grid bounds [0, gridSize-1].
 */
export function snapToGrid(worldX, worldZ, gridSize) {
  const gx = Math.floor(worldX / WORLD_SCALE);
  const gz = Math.floor(worldZ / WORLD_SCALE);
  if (gx < 0 || gz < 0 || gx >= gridSize || gz >= gridSize) return null;
  return { x: gx, z: gz };
}

/**
 * Convert grid coordinates to the world-space center point of that cell.
 */
export function gridToWorld(gridX, gridZ) {
  return {
    x: gridX * WORLD_SCALE + WORLD_SCALE / 2,
    z: gridZ * WORLD_SCALE + WORLD_SCALE / 2,
  };
}
