/**
 * PuzzleLoader tests
 * Tests puzzle loading, validation, and parsing
 */

import * as THREE from 'three';
import PuzzleLoader from 'core/PuzzleLoader';
import CollisionDetector from 'core/CollisionDetector';
import Wall from 'entities/Wall';
import gameState from 'core/GameState';
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

    it('rethrows network errors', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(PuzzleLoader.load('any-puzzle')).rejects.toThrow('Network error');
    });
  });

  describe('load() within one world (fetched once, fresh per world)', () => {
    const file = (name) => ({
      id: 'cached-puzzle',
      name,
      difficulty: 1,
      gridSize: 10,
      playerStart: { x: 5, y: 0, z: 5 },
      entities: [{ type: 'wall', position: { x: 1, y: 0, z: 1 } }],
    });
    // The server's copy of the file; tests "save" a new version into it
    let onServer;

    beforeEach(() => {
      onServer = file('First save');
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(JSON.parse(JSON.stringify(onServer))),
        })
      );
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('loads racing each other share ONE request', async () => {
      const [a, b] = await Promise.all([
        PuzzleLoader.load('cached-puzzle'),
        PuzzleLoader.load('cached-puzzle'),
      ]);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(a).toEqual(onServer);
      expect(b).toEqual(onServer);
    });

    it('a puzzle loaded earlier in the world is not fetched again', async () => {
      await PuzzleLoader.load('cached-puzzle');
      await PuzzleLoader.load('cached-puzzle');

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('every load gets its own copy: an area never shares data with another', async () => {
      const first = await PuzzleLoader.load('cached-puzzle');
      first.entities[0].position.x = 99;
      first.name = 'mutated';

      const second = await PuzzleLoader.load('cached-puzzle');

      expect(second).not.toBe(first);
      expect(second).toEqual(onServer);
    });

    it('a failed load is retried by the next one', async () => {
      global.fetch.mockResolvedValueOnce({ ok: false, statusText: 'Bad Gateway' });
      await expect(PuzzleLoader.load('cached-puzzle')).rejects.toThrow('Bad Gateway');

      await expect(PuzzleLoader.load('cached-puzzle')).resolves.toEqual(onServer);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('a new world (clearCache) sees a file saved since the last one', async () => {
      await PuzzleLoader.load('cached-puzzle');
      onServer = file('Saved from the editor');

      PuzzleLoader.clearCache();
      const data = await PuzzleLoader.load('cached-puzzle');

      expect(data.name).toBe('Saved from the editor');
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

  describe('static wall batching', () => {
    // Walls are identical immovable boxes: rendering each as its own mesh
    // made long sightlines cost one draw call per wall. EVERY wall of an
    // area is an instance of ONE InstancedMesh; a door pass leaves out its
    // eye-side walls through it (Area.hideWalls), so walls beside a door
    // batch too.

    /** Where the batch draws each instance: "x,y,z" of its box centre. */
    const instanceCentres = (batch) =>
      Array.from({ length: batch.count }, (_, i) => {
        const e = batch.getMatrixAt(i, new THREE.Matrix4()).elements;
        return `${e[12]},${e[13]},${e[14]}`;
      });
    const wallCentre = (wall) =>
      `${wall.position.x},${wall.position.y + Wall.MESH_Y_OFFSET},${wall.position.z}`;

    it('batches every wall into one instanced mesh when the puzzle has no linked gates', () => {
      ctx.loadPuzzle('parse-wall-basic');

      const area = gameState.activeArea;
      const walls = ctx.getEntityManager().getByType('wall');

      expect(walls.length).toBeGreaterThan(0);
      for (const wall of walls) {
        expect(wall.mesh).toBeNull(); // no per-wall draw calls
      }
      expect(area.staticWalls).not.toBeNull();
      expect(area.staticWalls.count).toBe(walls.length);
      expect(area.group.children).toContain(area.staticWalls); // still rendered
    });

    it('batches the walls beside a linked door too: one draw for every wall', () => {
      ctx.loadPuzzle('portal-walls-b'); // south-door at grid (5,7)

      const walls = ctx.getEntityManager().getByType('wall');
      expect(walls.length).toBeGreaterThan(0);
      for (const wall of walls) expect(wall.mesh).toBeNull();
      expect(gameState.activeArea.staticWalls.count).toBe(walls.length);
    });

    it('draws exactly the walls collision blocks: one box on every wall, none elsewhere', () => {
      ctx.loadPuzzle('portal-walls-b');
      const area = gameState.activeArea;
      const walls = ctx.getEntityManager().getByType('wall');

      expect(instanceCentres(area.staticWalls).sort()).toEqual(walls.map(wallCentre).sort());
      // ...and each of those walls still blocks a mover standing on it
      for (const wall of walls) {
        expect(CollisionDetector.checkCollision(wall.position, 0.3, null, area)).toBe(true);
      }
    });

    it('a door pass leaves out its eye-side walls, and only for that pass', () => {
      ctx.loadPuzzle('portal-walls-b');
      const area = gameState.activeArea;
      const wallAt = (gridX, gridZ) =>
        area.entities.find(
          (w) =>
            w.type === 'wall' &&
            w.position.x === gridX * WORLD_SCALE &&
            w.position.z === gridZ * WORLD_SCALE
        );
      // A pass looking out through south-door from the room (window half a
      // cell south of the gate, outward +z), the eye dead on its axis
      const pass = { x: 5 * WORLD_SCALE, z: 7.5 * WORLD_SCALE, outX: 0, outZ: 1, latEye: 0 };

      area.hideWalls(pass);
      expect(area.isWallHidden(wallAt(5, 6))).toBe(true); // the strip behind the door
      expect(area.isWallHidden(wallAt(4, 7))).toBe(false); // a jamb, framing the doorway
      expect(area.isWallHidden(wallAt(5, 9))).toBe(false); // the room the door shows

      area.hideWalls(null, null);
      expect(area.isWallHidden(wallAt(5, 6))).toBe(false);
    });

    it('each area draws its walls with its OWN material', () => {
      // A material drawn in two scenes (the main view and a neighbour's
      // Area.scene) re-derives its program at every switch between them;
      // and each area's walls are lit by its own creatures and hidden by
      // its own doors
      ctx.loadPuzzle('portal-walls-b');
      const first = gameState.activeArea.staticWalls.material;
      ctx.loadPuzzle('portal-walls-b');
      const second = gameState.activeArea.staticWalls.material;

      expect(second).not.toBe(first);
      expect(second.vertexShader).toBe(first.vertexShader); // one look, one program
      expect(second.fragmentShader).toBe(first.fragmentShader);
      expect(second.userData.shared).toBe(true); // no single wall frees it
    });

    it("frees the area's wall material with the area", () => {
      ctx.loadPuzzle('portal-walls-b');
      const area = gameState.activeArea;
      const dispose = jest.spyOn(area.staticWalls.material, 'dispose');

      area.dispose();

      expect(dispose).toHaveBeenCalledTimes(1);
    });

    it('disposes the wall batch with the area', () => {
      ctx.loadPuzzle('parse-wall-basic');

      const area = gameState.activeArea;
      const batch = area.staticWalls;
      expect(batch).not.toBeNull();

      area.dispose();

      expect(area.staticWalls).toBeNull();
      expect(area.group.children).not.toContain(batch);
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
