/**
 * UndoManager Tests
 *
 * Tests undo/redo functionality wrapping EditorPuzzleModel.
 * UndoManager snapshots model state before each mutation,
 * allowing full undo/redo traversal of edit history.
 */
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import UndoManager from 'editor/model/UndoManager';

describe('UndoManager', () => {
  let model;
  let undoManager;

  beforeEach(() => {
    model = new EditorPuzzleModel();
    undoManager = new UndoManager(model);
  });

  describe('basic undo', () => {
    it('restores previous state after one mutation', () => {
      undoManager.addEntity('creature', 3, 0, 5, { song: ['C4'] });

      undoManager.undo();

      expect(undoManager.getEntities()).toEqual([]);
    });
  });

  describe('basic redo', () => {
    it('restores the mutated state after undo', () => {
      const id = undoManager.addEntity('creature', 3, 0, 5, { song: ['C4'] });

      undoManager.undo();
      undoManager.redo();

      const entity = undoManager.getEntity(id);
      expect(entity).toBeDefined();
      expect(entity.type).toBe('creature');
      expect(entity.x).toBe(3);
      expect(entity.data).toEqual({ song: ['C4'] });
    });
  });

  describe('redo stack cleared on new mutation', () => {
    it('clears redo stack when a new mutation follows undo', () => {
      undoManager.addEntity('creature', 0, 0, 0, {});
      undoManager.addEntity('gate', 1, 0, 1, {});

      undoManager.undo();
      expect(undoManager.canRedo()).toBe(true);

      undoManager.addEntity('fountain', 2, 0, 2, {});
      expect(undoManager.canRedo()).toBe(false);
    });
  });

  describe('multiple undos', () => {
    it('walks backward through the full history in order', () => {
      undoManager.addEntity('creature', 0, 0, 0, {});
      undoManager.addEntity('gate', 1, 0, 1, {});
      undoManager.addEntity('fountain', 2, 0, 2, {});

      expect(undoManager.getEntities().length).toBe(3);

      undoManager.undo();
      expect(undoManager.getEntities().length).toBe(2);
      expect(undoManager.getEntities().every((e) => e.type !== 'fountain')).toBe(true);

      undoManager.undo();
      expect(undoManager.getEntities().length).toBe(1);
      expect(undoManager.getEntities()[0].type).toBe('creature');

      undoManager.undo();
      expect(undoManager.getEntities()).toEqual([]);
    });
  });

  describe('multiple redos', () => {
    it('walks forward through the full history in order', () => {
      undoManager.addEntity('creature', 0, 0, 0, {});
      undoManager.addEntity('gate', 1, 0, 1, {});
      undoManager.addEntity('fountain', 2, 0, 2, {});

      undoManager.undo();
      undoManager.undo();
      undoManager.undo();
      expect(undoManager.getEntities()).toEqual([]);

      undoManager.redo();
      expect(undoManager.getEntities().length).toBe(1);
      expect(undoManager.getEntities()[0].type).toBe('creature');

      undoManager.redo();
      expect(undoManager.getEntities().length).toBe(2);

      undoManager.redo();
      expect(undoManager.getEntities().length).toBe(3);
    });
  });

  describe('undo with no history', () => {
    it('is a no-op on a fresh model', () => {
      expect(() => undoManager.undo()).not.toThrow();
      expect(undoManager.getEntities()).toEqual([]);
      expect(undoManager.getMetadata().name).toBe('');
    });
  });

  describe('redo with nothing to redo', () => {
    it('is a no-op when redo stack is empty', () => {
      undoManager.addEntity('creature', 0, 0, 0, {});

      expect(() => undoManager.redo()).not.toThrow();
      expect(undoManager.getEntities().length).toBe(1);
    });
  });

  describe('setMetadata participates in undo', () => {
    it('restores metadata to previous values on undo', () => {
      undoManager.setMetadata({ name: 'My Puzzle', tempo: 90 });

      undoManager.undo();

      const meta = undoManager.getMetadata();
      expect(meta.name).toBe('');
      expect(meta.tempo).toBe(120);
    });
  });

  describe('setPlayerSpawn participates in undo', () => {
    it('restores player spawn to previous value on undo', () => {
      undoManager.setPlayerSpawn(5, 1, 8);

      undoManager.undo();

      expect(undoManager.getPlayerSpawn()).toBeNull();
    });
  });

  describe('addFloor participates in undo', () => {
    it('removes the floor on undo', () => {
      undoManager.addFloor(2, 0, 0, 10, 10);

      undoManager.undo();

      expect(undoManager.getFloors()).toEqual([]);
    });
  });

  describe('removeFloor participates in undo', () => {
    it('restores the removed floor on undo', () => {
      undoManager.addFloor(2, 0, 0, 10, 10);

      undoManager.removeFloor(0);
      expect(undoManager.getFloors()).toEqual([]);

      undoManager.undo();
      expect(undoManager.getFloors().length).toBe(1);
      expect(undoManager.getFloors()[0]).toEqual({ elevation: 2, x1: 0, z1: 0, x2: 10, z2: 10 });
    });
  });

  describe('updateEntity participates in undo', () => {
    it('restores entity to pre-update state on undo', () => {
      const id = undoManager.addEntity('creature', 0, 0, 0, { song: ['C4'] });

      undoManager.updateEntity(id, { x: 5, data: { song: ['D4'] } });
      expect(undoManager.getEntity(id).x).toBe(5);
      expect(undoManager.getEntity(id).data).toEqual({ song: ['D4'] });

      undoManager.undo();
      expect(undoManager.getEntity(id).x).toBe(0);
      expect(undoManager.getEntity(id).data).toEqual({ song: ['C4'] });
    });
  });

  describe('removeEntity participates in undo', () => {
    it('restores the removed entity on undo', () => {
      const id = undoManager.addEntity('creature', 3, 0, 5, { song: ['C4'] });

      undoManager.removeEntity(id);
      expect(undoManager.getEntity(id)).toBeUndefined();

      undoManager.undo();
      const entity = undoManager.getEntity(id);
      expect(entity).toBeDefined();
      expect(entity.type).toBe('creature');
      expect(entity.x).toBe(3);
    });
  });

  describe('addEntity return value', () => {
    it('returns the entity id from the proxied call', () => {
      const id1 = undoManager.addEntity('creature', 0, 0, 0, {});
      const id2 = undoManager.addEntity('gate', 1, 0, 1, {});

      expect(typeof id1).toBe('number');
      expect(typeof id2).toBe('number');
      expect(id2).toBe(id1 + 1);
    });
  });

  describe('read methods pass through', () => {
    it('delegates all read methods to the underlying model', () => {
      undoManager.setMetadata({ name: 'Test' });
      undoManager.setPlayerSpawn(1, 2, 3);
      undoManager.addFloor(1, 0, 0, 10, 10);
      const id = undoManager.addEntity('creature', 5, 0, 5, { song: ['C4'] });

      expect(undoManager.getMetadata().name).toBe('Test');
      expect(undoManager.getPlayerSpawn()).toEqual({ x: 1, y: 2, z: 3 });
      expect(undoManager.getFloors().length).toBe(1);
      expect(undoManager.getEntities().length).toBe(1);
      expect(undoManager.getEntity(id).type).toBe('creature');
      expect(undoManager.getEntitiesAt(5, 0, 5).length).toBe(1);
      expect(undoManager.getFloorElevation(5, 5)).toBe(1);
    });
  });

  describe('canUndo', () => {
    it('returns false on fresh model, true after mutation', () => {
      expect(undoManager.canUndo()).toBe(false);

      undoManager.addEntity('creature', 0, 0, 0, {});

      expect(undoManager.canUndo()).toBe(true);
    });
  });

  describe('canRedo', () => {
    it('returns false initially, true after undo', () => {
      expect(undoManager.canRedo()).toBe(false);

      undoManager.addEntity('creature', 0, 0, 0, {});
      expect(undoManager.canRedo()).toBe(false);

      undoManager.undo();
      expect(undoManager.canRedo()).toBe(true);
    });
  });
});
