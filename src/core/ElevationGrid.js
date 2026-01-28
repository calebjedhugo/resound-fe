import { WORLD_SCALE } from 'core/constants';

class ElevationGrid {
  constructor(gridSize) {
    this.gridSize = gridSize;
    this.grid = Array.from({ length: gridSize }, () => new Array(gridSize).fill(0));
    this.ramps = Array.from({ length: gridSize }, () => new Array(gridSize).fill(null));
  }

  applyFloors(floors) {
    for (const floor of floors) {
      for (let z = floor.z1; z <= floor.z2; z++) {
        for (let x = floor.x1; x <= floor.x2; x++) {
          if (floor.elevation > this.grid[z][x]) {
            this.grid[z][x] = floor.elevation;
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
