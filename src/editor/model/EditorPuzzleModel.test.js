/**
 * EditorPuzzleModel Tests
 *
 * Tests the in-memory puzzle model used by the editor.
 * All editor operations go through this model.
 */
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';

describe('EditorPuzzleModel', () => {
  let model;

  beforeEach(() => {
    model = new EditorPuzzleModel();
  });

  describe('addEntity / getEntity', () => {
    it('stores entity with correct position and type', () => {
      const id = model.addEntity('creature', 3, 1, 5, { song: ['C4'] });

      const entity = model.getEntity(id);
      expect(entity).toBeDefined();
      expect(entity.type).toBe('creature');
      expect(entity.x).toBe(3);
      expect(entity.y).toBe(1);
      expect(entity.z).toBe(5);
      expect(entity.data).toEqual({ song: ['C4'] });
    });

    it('returns a unique auto-incrementing id', () => {
      const id1 = model.addEntity('creature', 0, 0, 0, {});
      const id2 = model.addEntity('gate', 1, 0, 1, {});
      const id3 = model.addEntity('fountain', 2, 0, 2, {});

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id2).toBe(id1 + 1);
      expect(id3).toBe(id2 + 1);
    });
  });

  describe('removeEntity', () => {
    it('removes only the specified entity', () => {
      const id1 = model.addEntity('creature', 0, 0, 0, {});
      const id2 = model.addEntity('gate', 1, 0, 1, {});

      model.removeEntity(id1);

      expect(model.getEntity(id1)).toBeUndefined();
      expect(model.getEntity(id2)).toBeDefined();
    });

    it('is a no-op for non-existent entity id', () => {
      model.addEntity('creature', 0, 0, 0, {});

      expect(() => model.removeEntity(999)).not.toThrow();
      expect(model.getEntities().length).toBe(1);
    });
  });

  describe('getEntitiesAt', () => {
    it('returns entities matching the cell and elevation', () => {
      model.addEntity('creature', 3, 0, 5, {});
      model.addEntity('gate', 3, 0, 5, {});
      model.addEntity('fountain', 7, 0, 2, {});

      const result = model.getEntitiesAt(3, 0, 5);

      expect(result.length).toBe(2);
      expect(result.every((e) => e.x === 3 && e.y === 0 && e.z === 5)).toBe(true);
    });

    it('returns empty array for empty cell', () => {
      model.addEntity('creature', 3, 0, 5, {});

      const result = model.getEntitiesAt(10, 0, 10);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('getFloorElevation', () => {
    it('returns 0 for cells with no floor regions', () => {
      expect(model.getFloorElevation(5, 5)).toBe(0);
    });

    it('returns the floor elevation for a covered cell', () => {
      model.addFloor(2, 0, 0, 10, 10);

      expect(model.getFloorElevation(5, 5)).toBe(2);
    });

    it('returns highest elevation when floor regions overlap', () => {
      model.addFloor(1, 0, 0, 10, 10);
      model.addFloor(3, 3, 3, 7, 7);

      // Cell (5, 5) is covered by both floors; highest is 3
      expect(model.getFloorElevation(5, 5)).toBe(3);

      // Cell (1, 1) is only covered by the first floor; elevation is 1
      expect(model.getFloorElevation(1, 1)).toBe(1);
    });
  });

  describe('setPlayerSpawn / getPlayerSpawn', () => {
    it('replaces previous spawn (only one allowed)', () => {
      model.setPlayerSpawn(1, 0, 2);
      model.setPlayerSpawn(5, 1, 8);

      const spawn = model.getPlayerSpawn();
      expect(spawn).toEqual({ x: 5, y: 1, z: 8 });
    });

    it('returns null before any spawn is set', () => {
      expect(model.getPlayerSpawn()).toBeNull();
    });
  });

  describe('addFloor / removeFloor', () => {
    it('correctly manages the floors array', () => {
      const idx0 = model.addFloor(1, 0, 0, 5, 5);
      const idx1 = model.addFloor(2, 6, 6, 10, 10);

      expect(model.getFloors().length).toBe(2);
      expect(model.getFloors()[idx0]).toEqual({
        elevation: 1,
        x1: 0,
        z1: 0,
        x2: 5,
        z2: 5,
      });
      expect(model.getFloors()[idx1]).toEqual({
        elevation: 2,
        x1: 6,
        z1: 6,
        x2: 10,
        z2: 10,
      });

      model.removeFloor(idx0);

      expect(model.getFloors().length).toBe(1);
      expect(model.getFloors()[0]).toEqual({
        elevation: 2,
        x1: 6,
        z1: 6,
        x2: 10,
        z2: 10,
      });
    });

    it('removeFloor with invalid index is a no-op', () => {
      model.addFloor(1, 0, 0, 5, 5);

      expect(() => model.removeFloor(-1)).not.toThrow();
      expect(() => model.removeFloor(99)).not.toThrow();
      expect(model.getFloors().length).toBe(1);
    });
  });

  describe('setMetadata / getMetadata', () => {
    it('merges partial fields without overwriting unrelated fields', () => {
      model.setMetadata({ name: 'Test Puzzle', tempo: 90 });

      const meta = model.getMetadata();
      expect(meta.name).toBe('Test Puzzle');
      expect(meta.tempo).toBe(90);
      // Unrelated defaults remain intact
      expect(meta.difficulty).toBe(1);
      expect(meta.gridSize).toBe(15);
    });

    it('has correct default metadata values', () => {
      const meta = model.getMetadata();

      expect(meta).toEqual({
        id: '',
        name: '',
        difficulty: 1,
        tempo: 120,
        gridSize: 15,
        clapDisplacement: null,
      });
    });
  });

  describe('updateEntity', () => {
    it('merges changes into entity (position and data fields)', () => {
      const id = model.addEntity('creature', 0, 0, 0, { song: ['C4'], interval: 4 });

      model.updateEntity(id, { x: 5, data: { song: ['D4'], interval: 4 } });

      const entity = model.getEntity(id);
      expect(entity.x).toBe(5);
      expect(entity.y).toBe(0); // unchanged
      expect(entity.z).toBe(0); // unchanged
      expect(entity.type).toBe('creature'); // unchanged
      expect(entity.data).toEqual({ song: ['D4'], interval: 4 });
    });
  });

  describe('getEntity', () => {
    it('returns undefined for non-existent id', () => {
      expect(model.getEntity(999)).toBeUndefined();
    });
  });

  describe('getEntities', () => {
    it('returns all entities as an array', () => {
      model.addEntity('creature', 0, 0, 0, {});
      model.addEntity('gate', 1, 0, 1, {});

      const entities = model.getEntities();
      expect(Array.isArray(entities)).toBe(true);
      expect(entities.length).toBe(2);
    });
  });
});
