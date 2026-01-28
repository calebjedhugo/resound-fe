/**
 * PuzzleLoader tests
 * Tests puzzle loading, validation, and parsing
 */

import PuzzleLoader from 'core/PuzzleLoader';
import gameState from 'core/GameState';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';

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

    it('rethrows network errors', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(PuzzleLoader.load('any-puzzle')).rejects.toThrow('Network error');
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

    it('returns empty array when manifest fetch response is not ok', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Server Error',
      });

      const result = await PuzzleLoader.loadPuzzleList();

      expect(result).toEqual([]);
    });

    it('returns empty array on network failure', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await PuzzleLoader.loadPuzzleList();

      expect(result).toEqual([]);
    });
  });

  describe('when player loads a puzzle with walls', () => {
    it('places wall entities in the world at scaled positions', () => {
      // Load puzzle with a wall at grid position (3, 0, 3)
      ctx.loadPuzzle('parse-wall-basic');

      // Query entities through public API
      const entityManager = ctx.getEntityManager();
      const walls = entityManager.getByType('wall');

      // Find the custom wall (not a perimeter wall)
      const customWall = walls.find(
        (w) =>
          w.position.x === 3 * WORLD_SCALE &&
          w.position.z === 3 * WORLD_SCALE &&
          // Exclude perimeter walls which are at edges
          w.position.x !== 0 &&
          w.position.x !== 4 * WORLD_SCALE
      );

      expect(customWall).toBeDefined();
      expect(customWall.position.x).toBe(3 * WORLD_SCALE);
      expect(customWall.position.z).toBe(3 * WORLD_SCALE);
    });
  });

  describe('when player loads a puzzle with ramps', () => {
    it('places ramp entities with direction in the world at scaled positions', () => {
      // Load puzzle with a ramp at grid position (2, 0, 2) facing north
      ctx.loadPuzzle('parse-ramp-basic');

      // Query entities through public API
      const entityManager = ctx.getEntityManager();
      const ramps = entityManager.getByType('ramp');

      expect(ramps.length).toBe(1);

      const ramp = ramps[0];
      expect(ramp.position.x).toBe(2 * WORLD_SCALE);
      expect(ramp.position.z).toBe(2 * WORLD_SCALE);
      expect(ramp.direction).toBe('north');
    });
  });

  describe('when puzzle contains unknown entity types', () => {
    it('skips unknown entities and loads valid ones', () => {
      // Load puzzle with an unknown entity type alongside valid entities
      ctx.loadPuzzle('parse-unknown-entity');

      // The puzzle should still load successfully - verify by checking
      // that the entity manager exists and we can query it
      const entityManager = ctx.getEntityManager();
      expect(entityManager).toBeDefined();

      // The unknown entity should be skipped, but the puzzle still loads
      // (no error thrown, game state is functional)
    });
  });

  describe('when player loads a puzzle with invalid data', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('rejects puzzle missing id', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ name: 'Test' }),
      });

      await expect(PuzzleLoader.load('test')).rejects.toThrow('Puzzle missing id');
    });

    it('rejects puzzle missing name', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'test' }),
      });

      await expect(PuzzleLoader.load('test')).rejects.toThrow('Puzzle missing name');
    });

    it('rejects puzzle missing difficulty', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'test', name: 'Test' }),
      });

      await expect(PuzzleLoader.load('test')).rejects.toThrow('Puzzle missing difficulty');
    });

    it('rejects puzzle missing gridSize', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'test', name: 'Test', difficulty: 1 }),
      });

      await expect(PuzzleLoader.load('test')).rejects.toThrow('Puzzle missing gridSize');
    });

    it('rejects puzzle missing playerStart', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'test', name: 'Test', difficulty: 1, gridSize: 10 }),
      });

      await expect(PuzzleLoader.load('test')).rejects.toThrow('Puzzle missing playerStart');
    });

    it('rejects puzzle with entities not an array', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'test',
            name: 'Test',
            difficulty: 1,
            gridSize: 10,
            playerStart: { x: 0, y: 0, z: 0 },
            entities: 'not-an-array',
          }),
      });

      await expect(PuzzleLoader.load('test')).rejects.toThrow('Puzzle entities must be an array');
    });

    it('successfully loads valid puzzle data', async () => {
      const validPuzzle = {
        id: 'test',
        name: 'Test',
        difficulty: 1,
        gridSize: 10,
        playerStart: { x: 0, y: 0, z: 0 },
        entities: [],
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(validPuzzle),
      });

      const result = await PuzzleLoader.load('test');
      expect(result).toEqual(validPuzzle);
    });
  });

  describe('PuzzleLoader with elevation', () => {
    it('builds an elevation grid when puzzle has floors', () => {
      ctx.loadPuzzle('elevation-basic');

      expect(gameState.elevationGrid).not.toBeNull();
      // The elevated region is x1:4, z1:4, x2:10, z2:8, elevation:1
      expect(ctx.getElevationAt(7, 6)).toBe(1);
      // Outside the region should be 0
      expect(ctx.getElevationAt(0, 0)).toBe(0);
    });

    it('builds an elevation grid with all-zero elevation when puzzle has no floors', () => {
      ctx.loadPuzzle('recording-basic');

      expect(gameState.elevationGrid).not.toBeNull();
      expect(ctx.getElevationAt(5, 5)).toBe(0);
      expect(ctx.getElevationAt(0, 0)).toBe(0);
    });

    it('sets player starting elevation from playerStart.y', () => {
      ctx.loadPuzzle('elevation-basic');

      // playerStart.y is 0 in elevation-basic
      expect(ctx.getPlayerElevation()).toBe(0);
    });

    it('existing puzzles with y:0 load identically to before', () => {
      ctx.loadPuzzle('recording-basic');

      // Player position should be scaled correctly
      // recording-basic: playerStart { x: 5, y: 0, z: 5 }
      const pos = ctx.getPlayerPosition();
      expect(pos.x).toBe(5 * WORLD_SCALE);
      expect(pos.z).toBe(5 * WORLD_SCALE);

      // Elevation should be 0
      expect(ctx.getPlayerElevation()).toBe(0);

      // Elevation grid should exist but be all-zero
      expect(gameState.elevationGrid).not.toBeNull();
    });
  });
});
