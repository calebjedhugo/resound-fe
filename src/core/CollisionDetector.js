import gameState from 'core/GameState';
import {
  ELEVATION_HEIGHT,
  ELEVATION_COLLISION_THRESHOLD,
  PLAYER_COLLISION_RADIUS,
} from 'core/constants';

// Fountain collision radius — matches the radius-1.5 cylinder in Fountain.createMesh
const FOUNTAIN_COLLISION_RADIUS = 1.5;

/**
 * CollisionDetector - Handles collision detection between entities
 */
class CollisionDetector {
  /**
   * Get the elevation level for a world position using the elevation grid and ramps.
   * @param {Object} position - World position {x, y, z}
   * @param {?Area} area - the area whose grid applies (defaults to the
   *   player's/active area — every area simulates against its OWN floor plan)
   * @returns {number} Elevation level (integer on flat floors, fractional on ramps)
   */
  static getElevationForPosition(position, area = null) {
    const elevationGrid = area ? area.elevationGrid : gameState.elevationGrid;
    if (!elevationGrid) return 0;
    const grid = elevationGrid.worldToGrid(position.x, position.z);
    const ramp = elevationGrid.getRamp(grid.x, grid.z);
    if (ramp) {
      const rampY = ramp.getYAtPosition(position.x, position.z);
      if (rampY !== null) return rampY / ELEVATION_HEIGHT;
    }
    // Derive the layer from the position's actual height, not the cell's top
    // floor — an entity UNDER an elevated slab is on the ground layer
    return Math.max(0, Math.floor((position.y + 0.001) / ELEVATION_HEIGHT));
  }

  /**
   * Check if a circular entity (player/creature) collides with any blocking entities
   * @param {Object} position - Position to check {x, y, z}
   * @param {number} radius - Radius of the entity
   * @param {string} ignoreId - Entity ID to ignore (self)
   * @param {?Area} area - the mover's area: collision is strictly area-local
   *   (a neighbor's entities can never block a mover here). Defaults to the
   *   player's/active area.
   * @returns {boolean} True if collision detected
   */
  static checkCollision(position, radius, ignoreId = null, area = null) {
    const positionElevation = this.getElevationForPosition(position, area);
    const entities = area ? area.entities : gameState.entities;

    // Creatures collide with the PLAYER's body (symmetric with the player
    // colliding with creatures): a lured creature parks at contact distance
    // instead of entering the player's space — overlapping bodies wedge the
    // player unrecoverably, since every escape move still collides. Only
    // meaningful in the player's own area (coordinates are per-area), and
    // only for creature movers (the player reports ignoreId null).
    if (ignoreId !== null && (!area || area === gameState.activeArea)) {
      const sameLevel =
        Math.abs(positionElevation - (gameState.player.elevation || 0)) <=
        ELEVATION_COLLISION_THRESHOLD;
      if (
        sameLevel &&
        this.checkCircleCircleCollision(
          position,
          radius,
          gameState.player.position,
          PLAYER_COLLISION_RADIUS
        )
      ) {
        return true;
      }
    }

    // Check against all entities
    for (const entity of entities) {
      // Skip self
      if (entity.id === ignoreId) continue;

      // Skip entities at different elevations
      const entityElevation = this.getElevationForPosition(entity.position, area);
      if (Math.abs(positionElevation - entityElevation) > ELEVATION_COLLISION_THRESHOLD) continue;

      // Check collision based on entity type
      if (entity.type === 'wall') {
        if (this.checkCircleBoxCollision(position, radius, entity.position, 1.5)) {
          return true;
        }
      } else if (entity.type === 'gate') {
        // Only collide with closed gates. An open gate LATCHES open until
        // the player walks through (close-on-exit, ruled 2026-07-10), so a
        // door can never close around an occupant — no special occupant
        // handling needed.
        const solid = !entity.isOpen;
        if (solid) {
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
      } else if (entity.type === 'fountain') {
        // Fountains are solid landmarks — circle-circle against the basin
        // (matches the radius-1.5 cylinder mesh in Fountain.createMesh). Movers
        // (creatures lured toward it, or the player) bump the rim rather than
        // passing through; they still activate it from within audible range.
        if (
          this.checkCircleCircleCollision(
            position,
            radius,
            entity.position,
            FOUNTAIN_COLLISION_RADIUS
          )
        ) {
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
