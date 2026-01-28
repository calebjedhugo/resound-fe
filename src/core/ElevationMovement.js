import { ELEVATION_HEIGHT } from 'core/constants';

/**
 * Get the world-space Y for the floor surface at a position.
 * Uses ramp.getYAtPosition when on a ramp cell, otherwise elevation * ELEVATION_HEIGHT.
 */
function getFloorY(worldX, worldZ, elevationGrid) {
  const gridCoord = elevationGrid.worldToGrid(worldX, worldZ);
  const ramp = elevationGrid.getRamp(gridCoord.x, gridCoord.z);

  if (ramp) {
    const rampY = ramp.getYAtPosition(worldX, worldZ);
    if (rampY !== null) {
      return rampY;
    }
  }

  return elevationGrid.getElevation(gridCoord.x, gridCoord.z) * ELEVATION_HEIGHT;
}

/**
 * Get the effective elevation level at a position, considering ramps (fractional on ramps).
 */
function getEffectiveElevation(worldX, worldZ, gridCoord, elevationGrid) {
  const ramp = elevationGrid.getRamp(gridCoord.x, gridCoord.z);

  if (ramp) {
    const rampY = ramp.getYAtPosition(worldX, worldZ);
    if (rampY !== null) {
      return rampY / ELEVATION_HEIGHT;
    }
  }

  return elevationGrid.getElevation(gridCoord.x, gridCoord.z);
}

/**
 * Determine if movement between two grid cells is allowed based on elevation and ramp presence.
 *
 * Allows: same elevation, or 1-level difference with ramp in either cell.
 * Blocks: >1 level difference, or 1-level difference with no ramp.
 */
function canTraverse(fromGrid, toGrid, fromElevation, toElevation, elevationGrid) {
  // Same grid cell - always allow
  if (fromGrid.x === toGrid.x && fromGrid.z === toGrid.z) {
    return true;
  }

  const fromFloor = elevationGrid.getElevation(fromGrid.x, fromGrid.z);
  const toFloor = elevationGrid.getElevation(toGrid.x, toGrid.z);

  // Same floor elevation - allow
  if (fromFloor === toFloor) {
    return true;
  }

  const diff = Math.abs(fromFloor - toFloor);

  // More than 1 level difference - block
  if (diff > 1) {
    return false;
  }

  // Exactly 1 level difference - need a ramp in either cell connecting these elevations
  const lowerElev = Math.min(fromFloor, toFloor);
  const fromRamp = elevationGrid.getRamp(fromGrid.x, fromGrid.z);
  const toRamp = elevationGrid.getRamp(toGrid.x, toGrid.z);

  if (fromRamp && fromRamp.elevation === lowerElev) return true;
  if (toRamp && toRamp.elevation === lowerElev) return true;

  return false;
}

export { getFloorY, getEffectiveElevation, canTraverse };
