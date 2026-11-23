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

// The game centres a cell at x * WORLD_SCALE; the editor at half a cell
// more (gridToWorld). Game coordinates are these much less on x and z.
export const GAME_OFFSET = WORLD_SCALE / 2;

/** A game-coordinate point in the editor's coordinates (y is the same). */
export function gameToEditor({ x, y, z }) {
  return { x: x + GAME_OFFSET, y, z: z + GAME_OFFSET };
}
