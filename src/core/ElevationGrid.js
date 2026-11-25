import { WORLD_SCALE } from 'core/constants';
import { tileKey } from 'core/floorTiles';

const NO_LEVELS = Object.freeze([]);
const cellKey = (x, z) => `${x},${z}`;

class ElevationGrid {
  /**
   * An older level's grid: elevation 0 over the whole `gridSize` square,
   * raised `floors` added with applyFloors. For a level built from floor
   * tiles (core/floorTiles) use ElevationGrid.fromTiles: walkable only
   * where a tile is, anywhere, negative cells too.
   * @param {number} gridSize
   */
  constructor(gridSize) {
    this.gridSize = gridSize;
    this.sparse = false;
    // Walkable LEVELS per cell. Ground (0) is implicit everywhere, so a cell
    // under an E1 floor is [0, 1]: walkable both underneath and on top.
    this.levels = Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => [0])
    );
    this.ramps = Array.from({ length: gridSize }, () => new Array(gridSize).fill(null));
  }

  /**
   * A grid walkable exactly where the floor tiles are ({x, y, z}, y the
   * storey): no implicit ground. A cell with no tile has no level, so a
   * mover can't step onto it — the edge of the built floor stops you as a
   * storey's cliff edge does (canTraverse).
   * @param {{x: number, y: number, z: number}[]} cells
   * @returns {ElevationGrid}
   */
  static fromTiles(cells) {
    const grid = Object.create(ElevationGrid.prototype);
    grid.gridSize = 0;
    grid.sparse = true;
    grid._cells = new Map(); // "x,z" -> sorted levels
    grid._ramps = new Map(); // "x,z" -> ramp
    grid._tiles = new Set(); // "x,y,z"
    grid._wallTops = new Set(); // "x,y,z": levels that are a wall's top
    for (const cell of cells) grid._addLevel(cell.x, cell.z, cell.y);
    return grid;
  }

  _addLevel(x, z, level) {
    const key = cellKey(x, z);
    let levels = this._cells.get(key);
    if (!levels) {
      levels = [];
      this._cells.set(key, levels);
    }
    if (!levels.includes(level)) {
      levels.push(level);
      levels.sort((a, b) => a - b);
      this._tiles.add(tileKey(x, level, z));
    }
  }

  /**
   * A tile-built level's walls are floor on top (ruled 2026-11-24): a wall
   * at storey N ({x, y, z}, grid units) makes its cell walkable at N + 1,
   * with nothing below that but the wall. Older levels' walls stay
   * unwalkable (call this only on a grid made by fromTiles).
   * @param {{x: number, y: number, z: number}[]} walls
   */
  addWallTops(walls) {
    if (!this.sparse) return;
    for (const wall of walls) {
      this._addLevel(wall.x, wall.z, wall.y + 1);
      this._wallTops.add(tileKey(wall.x, wall.y + 1, wall.z));
    }
  }

  /** Is level `level` of a cell the top of a wall (not a built tile)? */
  isWallTop(gridX, level, gridZ) {
    return Boolean(this._wallTops) && this._wallTops.has(tileKey(gridX, level, gridZ));
  }

  applyFloors(floors) {
    for (const floor of floors) {
      for (let z = floor.z1; z <= floor.z2; z += 1) {
        for (let x = floor.x1; x <= floor.x2; x += 1) {
          if (this.sparse) {
            this._addLevel(x, z, floor.elevation);
          } else if (!this.levels[z][x].includes(floor.elevation)) {
            this.levels[z][x].push(floor.elevation);
            this.levels[z][x].sort((a, b) => a - b);
          }
        }
      }
    }
  }

  registerRamp(gridX, gridZ, ramp) {
    if (this.sparse) this._ramps.set(cellKey(gridX, gridZ), ramp);
    else if (this.inBounds(gridX, gridZ)) this.ramps[gridZ][gridX] = ramp;
  }

  /**
   * Whether a cell is part of the level at all: inside an older level's
   * grid square, or (built from tiles) carrying a tile at some storey.
   */
  inBounds(gridX, gridZ) {
    if (this.sparse) return this._cells.has(cellKey(gridX, gridZ));
    return gridX >= 0 && gridX < this.gridSize && gridZ >= 0 && gridZ < this.gridSize;
  }

  /**
   * All walkable levels at a cell (an older level's ground is implicit
   * everywhere; a tile-built level's cell has only its tiles' storeys, none
   * off the built floor).
   */
  getLevelsAt(gridX, gridZ) {
    if (this.sparse) return this._cells.get(cellKey(gridX, gridZ)) || NO_LEVELS;
    if (!this.inBounds(gridX, gridZ)) return [0];
    return this.levels[gridZ][gridX];
  }

  hasLevel(gridX, gridZ, level) {
    if (this.sparse) return this._tiles.has(tileKey(gridX, level, gridZ));
    return this.getLevelsAt(gridX, gridZ).includes(level);
  }

  /**
   * The walkable level at a cell closest to a reference level (ties: lower).
   * A cell with no floor at all answers the reference (rounded), else 0.
   */
  nearestLevel(gridX, gridZ, reference) {
    const levels = this.getLevelsAt(gridX, gridZ);
    if (levels.length === 0) {
      return Number.isFinite(reference) ? Math.round(reference) : 0;
    }
    if (reference === undefined || reference === Infinity) {
      return levels[levels.length - 1];
    }
    let best = levels[0];
    for (const level of levels) {
      if (Math.abs(level - reference) < Math.abs(best - reference)) {
        best = level;
      }
    }
    return best;
  }

  getRamp(gridX, gridZ) {
    if (this.sparse) return this._ramps.get(cellKey(gridX, gridZ)) || null;
    if (!this.inBounds(gridX, gridZ)) return null;
    return this.ramps[gridZ][gridX];
  }

  worldToGrid(worldX, worldZ) {
    return {
      x: Math.round(worldX / WORLD_SCALE),
      z: Math.round(worldZ / WORLD_SCALE),
    };
  }
}

export default ElevationGrid;
