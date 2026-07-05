import { WORLD_SCALE } from 'core/constants';

class ElevationGrid {
  constructor(gridSize) {
    this.gridSize = gridSize;
    // Top surface per cell (highest floor) — used for spawning/rendering
    this.grid = Array.from({ length: gridSize }, () => new Array(gridSize).fill(0));
    // Walkable LEVELS per cell. Ground (0) is implicit everywhere, so a cell
    // under an E1 floor is [0, 1]: walkable both underneath and on top.
    this.levels = Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => [0])
    );
    this.ramps = Array.from({ length: gridSize }, () => new Array(gridSize).fill(null));
  }

  applyFloors(floors) {
    for (const floor of floors) {
      for (let z = floor.z1; z <= floor.z2; z += 1) {
        for (let x = floor.x1; x <= floor.x2; x += 1) {
          if (floor.elevation > this.grid[z][x]) {
            this.grid[z][x] = floor.elevation;
          }
          if (!this.levels[z][x].includes(floor.elevation)) {
            this.levels[z][x].push(floor.elevation);
            this.levels[z][x].sort((a, b) => a - b);
          }
        }
      }
    }
  }

  registerRamp(gridX, gridZ, ramp) {
    this.ramps[gridZ][gridX] = ramp;
  }

  getElevation(gridX, gridZ) {
    if (gridX < 0 || gridX >= this.gridSize || gridZ < 0 || gridZ >= this.gridSize) {
      return 0;
    }
    return this.grid[gridZ][gridX];
  }

  /** All walkable levels at a cell (ground floor is implicit everywhere). */
  getLevelsAt(gridX, gridZ) {
    if (gridX < 0 || gridX >= this.gridSize || gridZ < 0 || gridZ >= this.gridSize) {
      return [0];
    }
    return this.levels[gridZ][gridX];
  }

  hasLevel(gridX, gridZ, level) {
    return this.getLevelsAt(gridX, gridZ).includes(level);
  }

  /** The walkable level at a cell closest to a reference level (ties: lower). */
  nearestLevel(gridX, gridZ, reference) {
    const levels = this.getLevelsAt(gridX, gridZ);
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
    if (gridX < 0 || gridX >= this.gridSize || gridZ < 0 || gridZ >= this.gridSize) {
      return null;
    }
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
