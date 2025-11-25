import Creature from 'entities/Creature';
import Gate from 'entities/Gate';
import Fountain from 'entities/Fountain';
import Wall from 'entities/Wall';
import Ramp from 'entities/Ramp';
import Floor from 'entities/Floor';
import { WORLD_SCALE } from 'core/constants';
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

    // Initialize musical clock with puzzle tempo
    const tempo = puzzleData.tempo || 120; // Default 120 BPM
    gameState.initMusicalClock(tempo);

    // Create floor first (based on puzzle grid size)
    const floor = new Floor(puzzleData.gridSize);
    entityManager.add(floor);

    // Set player start position (scaled)
    gameState.player.position = {
      x: puzzleData.playerStart.x * WORLD_SCALE,
      y: puzzleData.playerStart.y * WORLD_SCALE,
      z: puzzleData.playerStart.z * WORLD_SCALE,
    };

    // Sync camera to player start position
    syncCameraToPlayer(gameState.player.position);

    // Create entities
    puzzleData.entities.forEach((entityData) => {
      let entity = null;

      // Scale the position from grid coordinates to world coordinates
      const scaledPosition = {
        x: entityData.position.x * WORLD_SCALE,
        y: entityData.position.y * WORLD_SCALE,
        z: entityData.position.z * WORLD_SCALE,
      };

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
          break;
        default:
          console.warn(`Unknown entity type: ${entityData.type}`);
      }

      if (entity) {
        entityManager.add(entity);
      }
    });

    return puzzleData;
  }

  static async loadPuzzleList() {
    // For now, return a hardcoded list
    // In the future, this could fetch from a server or read a manifest file
    return [{ id: 'test-001', name: 'Test Puzzle', difficulty: 1 }];
  }
}

export default PuzzleLoader;
