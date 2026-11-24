import { WORLD_SCALE } from 'core/constants';

/**
 * Convert world coordinates to grid coordinates (integer x, z). Any point
 * has a cell (negative ones too); with a `gridSize`, a point outside
 * [0, gridSize-1] is null (an older level's bounds).
 */
export function snapToGrid(worldX, worldZ, gridSize) {
  const gx = Math.floor(worldX / WORLD_SCALE);
  const gz = Math.floor(worldZ / WORLD_SCALE);
  if (gridSize !== undefined && (gx < 0 || gz < 0 || gx >= gridSize || gz >= gridSize)) {
    return null;
  }
  return { x: gx, z: gz };
}

/**
 * The cell in the middle of what a level has built (its floor tiles), else
 * of its entities and spawn; the origin cell in an empty level.
 * @param {object} model - EditorPuzzleModel / UndoManager
 * @returns {{x: number, z: number}}
 */
export function levelCenterCell(model) {
  const box = levelBounds(model);
  if (!box) return { x: 0, z: 0 };
  return { x: Math.floor((box.x1 + box.x2) / 2), z: Math.floor((box.z1 + box.z2) / 2) };
}

/**
 * The cells a level spans ({x1, z1, x2, z2}, inclusive): its floor tiles,
 * else its entities and spawn; null when it has nothing.
 * @param {object} model
 * @returns {?{x1: number, z1: number, x2: number, z2: number}}
 */
export function levelBounds(model) {
  let cells = model.getTiles ? model.getTiles() : [];
  if (cells.length === 0) {
    cells = model.getEntities ? model.getEntities() : [];
    const spawn = model.getPlayerSpawn ? model.getPlayerSpawn() : null;
    if (spawn) cells = [...cells, spawn];
  }
  if (cells.length === 0) return null;
  const box = { x1: Infinity, z1: Infinity, x2: -Infinity, z2: -Infinity };
  for (const c of cells) {
    box.x1 = Math.min(box.x1, c.x);
    box.z1 = Math.min(box.z1, c.z);
    box.x2 = Math.max(box.x2, c.x);
    box.z2 = Math.max(box.z2, c.z);
  }
  return box;
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
