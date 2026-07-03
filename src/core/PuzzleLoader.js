import Creature from 'entities/Creature';
import Gate from 'entities/Gate';
import Fountain from 'entities/Fountain';
import Wall from 'entities/Wall';
import Ramp from 'entities/Ramp';
import Floor from 'entities/Floor';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import ElevationGrid from 'core/ElevationGrid';
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

    return puzzleData;
  }

  static parse(puzzleData, entityManager, gameState) {
    // Clear existing entities
    entityManager.clear();

    // Store puzzle data in game state
    gameState.currentPuzzle = puzzleData;

    // Initialize musical clock with puzzle tempo
    const tempo = puzzleData.tempo || 120; // Default 120 BPM
    gameState.initMusicalClock(tempo);

    // Build elevation grid
    const elevationGrid = new ElevationGrid(puzzleData.gridSize);
    elevationGrid.applyFloors(puzzleData.floors || []);
    gameState.elevationGrid = elevationGrid;

    // Create floor with elevation data
    const floor = new Floor(puzzleData.gridSize, puzzleData.floors || []);
    entityManager.add(floor);

    // Generate perimeter walls just OUTSIDE the grid (rows/cols -1 and
    // gridSize), so every grid cell is playable — walls on edge cells used to
    // trap entities placed there.
    const { gridSize } = puzzleData;
    for (let i = -1; i <= gridSize; i += 1) {
      // Top edge (z = -1) and bottom edge (z = gridSize), including corners
      entityManager.add(new Wall({ x: i * WORLD_SCALE, y: 0, z: -1 * WORLD_SCALE }));
      entityManager.add(new Wall({ x: i * WORLD_SCALE, y: 0, z: gridSize * WORLD_SCALE }));
    }
    for (let i = 0; i < gridSize; i += 1) {
      // Left edge (x = -1) and right edge (x = gridSize)
      entityManager.add(new Wall({ x: -1 * WORLD_SCALE, y: 0, z: i * WORLD_SCALE }));
      entityManager.add(new Wall({ x: gridSize * WORLD_SCALE, y: 0, z: i * WORLD_SCALE }));
    }

    // Set player start position (scaled, with eye height above floor)
    gameState.player.position = {
      x: puzzleData.playerStart.x * WORLD_SCALE,
      y: puzzleData.playerStart.y * ELEVATION_HEIGHT + 1.8,
      z: puzzleData.playerStart.z * WORLD_SCALE,
    };
    gameState.player.elevation = puzzleData.playerStart.y;

    // Sync camera to player start position
    syncCameraToPlayer(gameState.player.position);

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
            });
            break;
          case 'fountain':
            entity = new Fountain(scaledPosition, {
              song: entityData.song,
            });
            break;
          case 'wall':
            entity = new Wall(scaledPosition);
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

    return puzzleData;
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
