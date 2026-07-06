import { ELEVATION_HEIGHT } from 'core/constants';

/**
 * Get the world-space Y for the floor surface at a position.
 * Uses ramp.getYAtPosition when on a ramp cell, otherwise the cell's walkable
 * level nearest to `priorLevel` × ELEVATION_HEIGHT. Passing the mover's prior
 * level is what makes walking UNDERNEATH elevated floors work: a cell under an
 * E1 slab is walkable at 0 and 1, and the mover stays on its own layer.
 * Omitting priorLevel keeps the old top-surface behavior.
 */
function getFloorY(worldX, worldZ, elevationGrid, priorLevel) {
  const gridCoord = elevationGrid.worldToGrid(worldX, worldZ);
  const ramp = elevationGrid.getRamp(gridCoord.x, gridCoord.z);

  if (ramp) {
    const rampY = ramp.getYAtPosition(worldX, worldZ);
    if (rampY !== null) {
      return rampY;
    }
  }

  return elevationGrid.nearestLevel(gridCoord.x, gridCoord.z, priorLevel) * ELEVATION_HEIGHT;
}

/**
 * Get the effective elevation level at a position, considering ramps
 * (fractional on ramps). Like getFloorY, `priorLevel` selects the mover's
 * layer in cells that are walkable at several levels.
 */
function getEffectiveElevation(worldX, worldZ, gridCoord, elevationGrid, priorLevel) {
  const ramp = elevationGrid.getRamp(gridCoord.x, gridCoord.z);

  if (ramp) {
    const rampY = ramp.getYAtPosition(worldX, worldZ);
    if (rampY !== null) {
      return rampY / ELEVATION_HEIGHT;
    }
  }

  return elevationGrid.nearestLevel(gridCoord.x, gridCoord.z, priorLevel);
}

/**
 * Determine if movement between two grid cells is allowed.
 *
 * The mover stays on its current layer: movement is allowed when the target
 * cell is walkable at the mover's level (which includes the ground layer
 * UNDER elevated floors), or when a ramp connects the two levels. Stepping
 * off a higher layer onto a cell that lacks it (a cliff edge) is blocked.
 */
function canTraverse(fromGrid, toGrid, fromElevation, toElevation, elevationGrid) {
  // Same grid cell - always allow
  if (fromGrid.x === toGrid.x && fromGrid.z === toGrid.z) {
    return true;
  }

  const fromRamp = elevationGrid.getRamp(fromGrid.x, fromGrid.z);
  const toRamp = elevationGrid.getRamp(toGrid.x, toGrid.z);

  // LEAVING a ramp: a ramp joins its base level and base+1, so you can step to
  // any cell walkable at either — off the low end to ground, off the high end
  // onto the platform, or off the SIDES onto adjacent ground. Using the ramp's
  // fixed levels (not Math.round of the fractional mid-ramp elevation) avoids
  // an invisible-wall seam at ramp mid-height.
  if (fromRamp) {
    if (toRamp) return true; // ramp-to-ramp
    return (
      elevationGrid.hasLevel(toGrid.x, toGrid.z, fromRamp.elevation) ||
      elevationGrid.hasLevel(toGrid.x, toGrid.z, fromRamp.elevation + 1)
    );
  }

  const level = Math.round(fromElevation);

  // ENTERING a ramp cell from flat ground/platform: allowed from base or top
  if (toRamp) {
    return level === toRamp.elevation || level === toRamp.elevation + 1;
  }

  // Flat movement: the mover's level must be walkable in the target cell
  return elevationGrid.hasLevel(toGrid.x, toGrid.z, level);
}

export { getFloorY, getEffectiveElevation, canTraverse };
