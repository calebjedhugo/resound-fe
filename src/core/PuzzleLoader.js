import * as THREE from 'three';
import Creature from 'entities/Creature';
import Gate from 'entities/Gate';
import Fountain from 'entities/Fountain';
import Wall from 'entities/Wall';
import Ramp from 'entities/Ramp';
import Floor from 'entities/Floor';
import CleansingTile from 'entities/CleansingTile';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import Area from 'core/Area';
import ElevationGrid from 'core/ElevationGrid';
import { inPortalHideBand } from 'core/portalMath';
import { syncCameraToPlayer } from 'resoundModules/playerControls/motion/motion';

class PuzzleLoader {
  static async load(puzzleId) {
    try {
      const response = await fetch(`/puzzles/${puzzleId}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load puzzle ${puzzleId}: ${response.statusText}`);
      }
      const data = await response.json();
      return this.validate(data);
    } catch (error) {
      console.error('Error loading puzzle:', error);
      throw error;
    }
  }

  static validate(puzzleData) {
    // Basic validation
    if (!puzzleData.id) throw new Error('Puzzle missing id');
    if (!puzzleData.name) throw new Error('Puzzle missing name');
    if (!puzzleData.difficulty) throw new Error('Puzzle missing difficulty');
    if (!puzzleData.gridSize) throw new Error('Puzzle missing gridSize');
    if (!puzzleData.playerStart) throw new Error('Puzzle missing playerStart');
    if (!Array.isArray(puzzleData.entities)) throw new Error('Puzzle entities must be an array');
    if (
      puzzleData.teaches !== undefined &&
      (!Array.isArray(puzzleData.teaches) || puzzleData.teaches.some((t) => typeof t !== 'string'))
    ) {
      throw new Error('Puzzle teaches must be an array of hint ids');
    }

    return puzzleData;
  }

  /**
   * World-space positions of the auto-generated perimeter walls: rows/cols
   * -1 and gridSize, just OUTSIDE the grid so every grid cell is playable
   * (walls on edge cells used to trap entities placed there). Shared with
   * the portal view so a neighbor seen through a doorway has its walls.
   */
  static perimeterWallPositions(gridSize) {
    const positions = [];
    for (let i = -1; i <= gridSize; i += 1) {
      // Top edge (z = -1) and bottom edge (z = gridSize), including corners
      positions.push({ x: i * WORLD_SCALE, y: 0, z: -1 * WORLD_SCALE });
      positions.push({ x: i * WORLD_SCALE, y: 0, z: gridSize * WORLD_SCALE });
    }
    for (let i = 0; i < gridSize; i += 1) {
      // Left edge (x = -1) and right edge (x = gridSize)
      positions.push({ x: -1 * WORLD_SCALE, y: 0, z: i * WORLD_SCALE });
      positions.push({ x: gridSize * WORLD_SCALE, y: 0, z: i * WORLD_SCALE });
    }
    return positions;
  }

  /**
   * Build a fully-populated LIVE Area from validated puzzle JSON (portal
   * stage 3). No global side effects: the caller (PortalManager, which owns
   * the set of loaded areas) decides whether this area is the player's or a
   * neighbor simulating behind a doorway. Player placement is separate —
   * see placePlayerAtStart.
   * @returns {Area}
   */
  static buildArea(puzzleData) {
    const area = new Area(puzzleData);
    const { entityManager } = area;

    // Build elevation grid
    const elevationGrid = new ElevationGrid(puzzleData.gridSize);
    elevationGrid.applyFloors(puzzleData.floors || []);
    area.elevationGrid = elevationGrid;

    // Create floor with elevation data
    const floor = new Floor(puzzleData.gridSize, puzzleData.floors || []);
    entityManager.add(floor);

    // Static-wall batching: an area's walls are identical immovable boxes,
    // but each one as its own THREE.Mesh made long sightlines submit
    // hundreds of draw calls (387 walls ≈ 11.7ms/frame in poc-return,
    // multiplied by every open portal pass — profiled 2026-07-16). Walls a
    // PortalView hide-set could ever need to toggle per pass (near a linked
    // gate — see inPortalHideBand) keep individual meshes; every other wall
    // becomes an instance of ONE InstancedMesh, added to the group below.
    const doorPositions = puzzleData.entities
      .filter((e) => e.type === 'gate' && e.link && e.link.puzzleId)
      .map((e) => ({ x: e.position.x * WORLD_SCALE, z: e.position.z * WORLD_SCALE }));
    const batchedWallPositions = [];
    const addWall = (position) => {
      if (doorPositions.some((g) => inPortalHideBand(position, g))) {
        entityManager.add(new Wall(position));
      } else {
        entityManager.add(new Wall(position, { batched: true }));
        batchedWallPositions.push(position);
      }
    };

    for (const position of this.perimeterWallPositions(puzzleData.gridSize)) {
      addWall(position);
    }

    // Create entities
    puzzleData.entities.forEach((entityData) => {
      let entity = null;

      // Scale the position from grid coordinates to world coordinates
      const scaledPosition = {
        x: entityData.position.x * WORLD_SCALE,
        y: entityData.position.y * ELEVATION_HEIGHT,
        z: entityData.position.z * WORLD_SCALE,
      };

      try {
        switch (entityData.type) {
          case 'creature':
            entity = new Creature(scaledPosition, entityData.data || {});
            break;
          case 'gate':
            entity = new Gate(scaledPosition, {
              song: entityData.song,
              timeSignature: puzzleData.timeSignature,
              keySignature: puzzleData.keySignature,
              // Portal identity: stable id, doorway facing, and (optionally)
              // the cross-puzzle link this gate is a door to
              id: entityData.id,
              facing: entityData.facing,
              link: entityData.link,
              // Permanently-open face (one-way doors / escape hatches)
              alwaysOpen: entityData.alwaysOpen,
              // Arrival here ends the demo (thanks-for-playing overlay)
              ending: entityData.ending,
              gridPosition: entityData.position,
            });
            break;
          case 'fountain':
            entity = new Fountain(scaledPosition, {
              song: entityData.song,
              timeSignature: puzzleData.timeSignature,
              keySignature: puzzleData.keySignature,
            });
            break;
          case 'wall':
            addWall(scaledPosition);
            break;
          case 'cleanser':
            entity = new CleansingTile(scaledPosition, entityData.data || {});
            break;
          case 'ramp':
            entity = new Ramp(scaledPosition, {
              direction: entityData.direction,
            });
            elevationGrid.registerRamp(entityData.position.x, entityData.position.z, entity);
            break;
          default:
            console.warn(`Unknown entity type: ${entityData.type}`);
        }
      } catch (error) {
        const { x, z } = entityData.position;
        throw new Error(`${entityData.type} at (${x}, ${z}): ${error.message}`);
      }

      if (entity) {
        entityManager.add(entity);
      }
    });

    if (batchedWallPositions.length > 0) {
      const batch = new THREE.InstancedMesh(
        Wall.GEOMETRY,
        Wall.MATERIAL,
        batchedWallPositions.length
      );
      const matrix = new THREE.Matrix4();
      batchedWallPositions.forEach((p, i) => {
        batch.setMatrixAt(i, matrix.makeTranslation(p.x, p.y + Wall.MESH_Y_OFFSET, p.z));
      });
      // three frustum-culls an InstancedMesh by object.boundingSphere; the
      // instances span the whole area, not just the template box.
      batch.computeBoundingSphere();
      area.setStaticWalls(batch);
    }

    return area;
  }

  /**
   * Put the player at a puzzle's start position (scaled, with eye height
   * above floor) and sync the camera. Used on world entry — doorway
   * crossings place the player at the partner gate instead.
   */
  static placePlayerAtStart(puzzleData, gameState) {
    gameState.player.position = {
      x: puzzleData.playerStart.x * WORLD_SCALE,
      y: puzzleData.playerStart.y * ELEVATION_HEIGHT + 1.8,
      z: puzzleData.playerStart.z * WORLD_SCALE,
    };
    gameState.player.elevation = puzzleData.playerStart.y;
    syncCameraToPlayer(gameState.player.position);
  }

  static async loadPuzzleList() {
    try {
      const response = await fetch('/puzzles/manifest.json');
      if (!response.ok) {
        throw new Error(`Failed to load puzzle manifest: ${response.statusText}`);
      }
      const data = await response.json();
      return data.puzzles;
    } catch (error) {
      console.error('Error loading puzzle list:', error);
      // Fallback to empty list
      return [];
    }
  }
}

export default PuzzleLoader;
