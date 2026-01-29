import gameState from './GameState';
import { ELEVATION_HEIGHT, ELEVATION_COLLISION_THRESHOLD } from './constants';

/**
 * CollisionDetector - Handles collision detection between entities
 */
class CollisionDetector {
  /**
   * Get the elevation level for a world position using the elevation grid and ramps.
   * @param {Object} position - World position {x, y, z}
   * @returns {number} Elevation level (integer on flat floors, fractional on ramps)
   */
  static getElevationForPosition(position) {
    if (!gameState.elevationGrid) return 0;
    const grid = gameState.elevationGrid.worldToGrid(position.x, position.z);
    const ramp = gameState.elevationGrid.getRamp(grid.x, grid.z);
    if (ramp) {
      const rampY = ramp.getYAtPosition(position.x, position.z);
      if (rampY !== null) return rampY / ELEVATION_HEIGHT;
    }
    return gameState.elevationGrid.getElevation(grid.x, grid.z);
  }

  /**
   * Check if a circular entity (player/creature) collides with any blocking entities
   * @param {Object} position - Position to check {x, y, z}
   * @param {number} radius - Radius of the entity
   * @param {string} ignoreId - Entity ID to ignore (self)
   * @returns {boolean} True if collision detected
   */
  static checkCollision(position, radius, ignoreId = null) {
    const positionElevation = this.getElevationForPosition(position);

    // Check against all entities
    for (const entity of gameState.entities) {
      // Skip self
      if (entity.id === ignoreId) continue;

      // Skip entities at different elevations
      const entityElevation = this.getElevationForPosition(entity.position);
      if (Math.abs(positionElevation - entityElevation) > ELEVATION_COLLISION_THRESHOLD) continue;

      // Check collision based on entity type
      if (entity.type === 'wall') {
        if (this.checkCircleBoxCollision(position, radius, entity.position, 1.5)) {
          return true;
        }
      } else if (entity.type === 'gate') {
        // Only collide with closed gates
        if (!entity.isActivated) {
          if (this.checkCircleBoxCollision(position, radius, entity.position, 1.5)) {
            return true;
          }
        }
      } else if (entity.type === 'creature') {
        // Creature-creature collision (circle-circle)
        const creatureRadius = entity.size || 0.9;
        if (this.checkCircleCircleCollision(position, radius, entity.position, creatureRadius)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check collision between a circle and a box
   * @param {Object} circlePos - Circle position {x, y, z}
   * @param {number} circleRadius - Circle radius
   * @param {Object} boxPos - Box center position {x, y, z}
   * @param {number} boxHalfSize - Half the box size (box is 3x3, so halfSize = 1.5)
   * @returns {boolean} True if collision
   */
  static checkCircleBoxCollision(circlePos, circleRadius, boxPos, boxHalfSize) {
    // Find closest point on box to circle (in 2D x-z plane)
    const closestX = Math.max(
      boxPos.x - boxHalfSize,
      Math.min(circlePos.x, boxPos.x + boxHalfSize)
    );
    const closestZ = Math.max(
      boxPos.z - boxHalfSize,
      Math.min(circlePos.z, boxPos.z + boxHalfSize)
    );

    // Calculate distance from circle center to closest point
    const distanceX = circlePos.x - closestX;
    const distanceZ = circlePos.z - closestZ;
    const distanceSquared = distanceX * distanceX + distanceZ * distanceZ;

    // Collision if distance is less than circle radius
    return distanceSquared < circleRadius * circleRadius;
  }

  /**
   * Check collision between two circles
   * @param {Object} pos1 - First circle position {x, y, z}
   * @param {number} radius1 - First circle radius
   * @param {Object} pos2 - Second circle position {x, y, z}
   * @param {number} radius2 - Second circle radius
   * @returns {boolean} True if collision
   */
  static checkCircleCircleCollision(pos1, radius1, pos2, radius2) {
    const dx = pos1.x - pos2.x;
    const dz = pos1.z - pos2.z;
    const distanceSquared = dx * dx + dz * dz;
    const minDistance = radius1 + radius2;

    return distanceSquared < minDistance * minDistance;
  }
}

export default CollisionDetector;
