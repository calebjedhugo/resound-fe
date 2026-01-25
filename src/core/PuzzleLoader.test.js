/**
 * PuzzleLoader tests
 * Tests puzzle loading, validation, and parsing
 */

import PuzzleLoader from 'core/PuzzleLoader';
import EntityManager from 'entities/EntityManager';
import { MockScene } from '../__tests__/helpers/mocks';
import { WORLD_SCALE } from 'core/constants';

describe('PuzzleLoader', () => {
  describe('load()', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('fetches and returns validated puzzle data', async () => {
      const puzzleData = {
        id: 'test-puzzle',
        name: 'Test Puzzle',
        difficulty: 1,
        gridSize: 10,
        playerStart: { x: 5, y: 0, z: 5 },
        entities: [],
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(puzzleData),
      });

      const result = await PuzzleLoader.load('test-puzzle');

      expect(global.fetch).toHaveBeenCalledWith('/puzzles/test-puzzle.json');
      expect(result).toEqual(puzzleData);
    });

    it('throws error when fetch response is not ok', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });

      await expect(PuzzleLoader.load('missing-puzzle')).rejects.toThrow(
        'Failed to load puzzle missing-puzzle: Not Found'
      );
    });

    it('logs and rethrows error when fetch fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const networkError = new Error('Network error');
      global.fetch.mockRejectedValueOnce(networkError);

      await expect(PuzzleLoader.load('any-puzzle')).rejects.toThrow('Network error');
      expect(consoleSpy).toHaveBeenCalledWith('Error loading puzzle:', networkError);

      consoleSpy.mockRestore();
    });
  });

  describe('loadPuzzleList()', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('fetches and returns puzzle list from manifest', async () => {
      const manifestData = {
        puzzles: [
          { id: 'puzzle-1', name: 'Puzzle 1' },
          { id: 'puzzle-2', name: 'Puzzle 2' },
        ],
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(manifestData),
      });

      const result = await PuzzleLoader.loadPuzzleList();

      expect(global.fetch).toHaveBeenCalledWith('/puzzles/manifest.json');
      expect(result).toEqual(manifestData.puzzles);
    });

    it('returns empty array and logs error when manifest fetch response is not ok', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      global.fetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Server Error',
      });

      const result = await PuzzleLoader.loadPuzzleList();

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error loading puzzle list:',
        expect.objectContaining({ message: 'Failed to load puzzle manifest: Server Error' })
      );

      consoleSpy.mockRestore();
    });

    it('returns empty array and logs error on network failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const networkError = new Error('Network error');
      global.fetch.mockRejectedValueOnce(networkError);

      const result = await PuzzleLoader.loadPuzzleList();

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith('Error loading puzzle list:', networkError);

      consoleSpy.mockRestore();
    });
  });

  describe('parse() - wall and ramp entities', () => {
    // These tests create a standalone EntityManager to test parse() in isolation
    // without relying on the global ctx and puzzle loading

    let mockScene;
    let entityManager;
    let mockGameState;

    beforeEach(() => {
      mockScene = new MockScene();
      entityManager = new EntityManager(mockScene);
      mockGameState = {
        currentPuzzle: null,
        initMusicalClock: jest.fn(),
        player: {
          position: { x: 0, y: 0, z: 0 },
        },
      };
    });

    it('creates wall entities at scaled positions', () => {
      const puzzleData = {
        id: 'wall-test',
        name: 'Wall Test',
        difficulty: 1,
        gridSize: 5,
        playerStart: { x: 2, y: 0, z: 2 },
        tempo: 120,
        entities: [
          {
            type: 'wall',
            position: { x: 3, y: 0, z: 3 },
          },
        ],
      };

      PuzzleLoader.parse(puzzleData, entityManager, mockGameState);

      // Get all walls (includes perimeter walls + the one we added)
      const walls = entityManager.getByType('wall');

      // Should have perimeter walls (4 * gridSize = 20) plus 1 custom wall
      // Note: perimeter uses full gridSize, so 5*4=20 perimeter walls + 1 custom = 21
      expect(walls.length).toBeGreaterThanOrEqual(21);

      // Find our custom wall at scaled position (3*3=9, 0, 3*3=9)
      const customWall = walls.find(
        (w) =>
          w.position.x === 3 * WORLD_SCALE &&
          w.position.z === 3 * WORLD_SCALE &&
          // Exclude perimeter walls which are at edges (0 or (gridSize-1)*WORLD_SCALE)
          w.position.x !== 0 &&
          w.position.x !== (puzzleData.gridSize - 1) * WORLD_SCALE
      );
      expect(customWall).toBeDefined();
    });

    it('creates ramp entities with direction at scaled positions', () => {
      const puzzleData = {
        id: 'ramp-test',
        name: 'Ramp Test',
        difficulty: 1,
        gridSize: 5,
        playerStart: { x: 2, y: 0, z: 2 },
        tempo: 120,
        entities: [
          {
            type: 'ramp',
            position: { x: 2, y: 0, z: 2 },
            direction: 'north',
          },
        ],
      };

      PuzzleLoader.parse(puzzleData, entityManager, mockGameState);

      const ramps = entityManager.getByType('ramp');
      expect(ramps.length).toBe(1);

      const ramp = ramps[0];
      expect(ramp.position.x).toBe(2 * WORLD_SCALE);
      expect(ramp.position.z).toBe(2 * WORLD_SCALE);
      expect(ramp.direction).toBe('north');
    });

    it('logs warning for unknown entity types', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const puzzleData = {
        id: 'unknown-test',
        name: 'Unknown Test',
        difficulty: 1,
        gridSize: 5,
        playerStart: { x: 2, y: 0, z: 2 },
        tempo: 120,
        entities: [
          {
            type: 'unknown-entity',
            position: { x: 1, y: 0, z: 1 },
          },
        ],
      };

      PuzzleLoader.parse(puzzleData, entityManager, mockGameState);

      expect(consoleSpy).toHaveBeenCalledWith('Unknown entity type: unknown-entity');

      consoleSpy.mockRestore();
    });
  });

  describe('validate()', () => {
    it('throws error when puzzle is missing id', () => {
      expect(() => PuzzleLoader.validate({ name: 'Test' })).toThrow('Puzzle missing id');
    });

    it('throws error when puzzle is missing name', () => {
      expect(() => PuzzleLoader.validate({ id: 'test' })).toThrow('Puzzle missing name');
    });

    it('throws error when puzzle is missing difficulty', () => {
      expect(() => PuzzleLoader.validate({ id: 'test', name: 'Test' })).toThrow(
        'Puzzle missing difficulty'
      );
    });

    it('throws error when puzzle is missing gridSize', () => {
      expect(() => PuzzleLoader.validate({ id: 'test', name: 'Test', difficulty: 1 })).toThrow(
        'Puzzle missing gridSize'
      );
    });

    it('throws error when puzzle is missing playerStart', () => {
      expect(() =>
        PuzzleLoader.validate({ id: 'test', name: 'Test', difficulty: 1, gridSize: 10 })
      ).toThrow('Puzzle missing playerStart');
    });

    it('throws error when entities is not an array', () => {
      expect(() =>
        PuzzleLoader.validate({
          id: 'test',
          name: 'Test',
          difficulty: 1,
          gridSize: 10,
          playerStart: { x: 0, y: 0, z: 0 },
          entities: 'not-an-array',
        })
      ).toThrow('Puzzle entities must be an array');
    });

    it('returns valid puzzle data', () => {
      const puzzleData = {
        id: 'test',
        name: 'Test',
        difficulty: 1,
        gridSize: 10,
        playerStart: { x: 0, y: 0, z: 0 },
        entities: [],
      };
      expect(PuzzleLoader.validate(puzzleData)).toEqual(puzzleData);
    });
  });
});
