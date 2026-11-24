/**
 * UndoManager Tests
 *
 * Tests undo/redo functionality wrapping EditorPuzzleModel.
 * UndoManager snapshots model state before each mutation,
 * allowing full undo/redo traversal of edit history.
 */
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import UndoManager, { MAX_UNDO_STEPS } from 'editor/model/UndoManager';

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

  describe('floor tiles participate in undo', () => {
    it('a range of tiles built in one call is one step', () => {
      undoManager.addTiles([
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ]);
      undoManager.undo();
      expect(undoManager.getTiles()).toEqual([]);
      undoManager.redo();
      expect(undoManager.getTiles()).toHaveLength(2);
    });

    it('a removed tile comes back on undo', () => {
      undoManager.addTiles([{ x: 2, y: 1, z: -2 }]);
      undoManager.removeTile(2, 1, -2);
      expect(undoManager.hasTile(2, 1, -2)).toBe(false);
      undoManager.undo();
      expect(undoManager.hasTile(2, 1, -2)).toBe(true);
    });
  });

  describe('batch', () => {
    it('records its mutations as ONE undo step, firing one change', () => {
      const onChange = jest.fn();
      undoManager.setOnChange(onChange);
      const id = undoManager.batch(() => {
        undoManager.addTiles([{ x: 3, y: 0, z: 3 }]);
        return undoManager.addEntity('wall', 3, 0, 3, {});
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(undoManager.getEntity(id)).toBeDefined();
      undoManager.undo();
      expect(undoManager.getEntity(id)).toBeUndefined();
      expect(undoManager.getTiles()).toEqual([]);
      expect(undoManager.canUndo()).toBe(false);
    });

    it('records nothing when nothing changed', () => {
      undoManager.batch(() => {});
      expect(undoManager.canUndo()).toBe(false);
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
      undoManager.addTiles([{ x: 5, y: 0, z: 5 }]);
      const id = undoManager.addEntity('creature', 5, 0, 5, { song: ['C4'] });

      expect(undoManager.getMetadata().name).toBe('Test');
      expect(undoManager.getPlayerSpawn()).toEqual({ x: 1, y: 2, z: 3 });
      expect(undoManager.getTiles()).toEqual([{ x: 5, y: 0, z: 5 }]);
      expect(undoManager.getEntities().length).toBe(1);
      expect(undoManager.getEntity(id).type).toBe('creature');
      expect(undoManager.getEntitiesAt(5, 0, 5).length).toBe(1);
      expect(undoManager.hasTile(5, 0, 5)).toBe(true);
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

  describe('setOnChange', () => {
    it('fires the callback after every mutation', () => {
      const onChange = jest.fn();
      undoManager.setOnChange(onChange);

      undoManager.addEntity('creature', 0, 0, 0, {});
      undoManager.setMetadata({ name: 'X' });
      undoManager.setPlayerSpawn(1, 0, 1);

      expect(onChange).toHaveBeenCalledTimes(3);
    });

    it('fires the callback on undo and redo', () => {
      undoManager.addEntity('creature', 0, 0, 0, {});

      const onChange = jest.fn();
      undoManager.setOnChange(onChange);

      undoManager.undo();
      undoManager.redo();

      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('does not fire on no-op undo/redo', () => {
      const onChange = jest.fn();
      undoManager.setOnChange(onChange);

      undoManager.undo(); // nothing to undo
      undoManager.redo(); // nothing to redo

      expect(onChange).not.toHaveBeenCalled();
    });

    it('still returns the mutation result when a callback is registered', () => {
      undoManager.setOnChange(jest.fn());

      const id = undoManager.addEntity('creature', 0, 0, 0, {});

      expect(typeof id).toBe('number');
    });
  });

  describe('bounded history', () => {
    const undoAll = () => {
      let steps = 0;
      while (undoManager.canUndo()) {
        undoManager.undo();
        steps += 1;
      }
      return steps;
    };

    it(`keeps the newest ${MAX_UNDO_STEPS} steps, dropping the oldest`, () => {
      const extra = 7;
      for (let tempo = 1; tempo <= MAX_UNDO_STEPS + extra; tempo += 1) {
        undoManager.setMetadata({ tempo });
      }

      expect(undoAll()).toBe(MAX_UNDO_STEPS);
      // The oldest steps went; the earliest state left is just after them
      expect(undoManager.getMetadata().tempo).toBe(extra);
    });

    it('redoes every kept step back to the newest state', () => {
      for (let tempo = 1; tempo <= MAX_UNDO_STEPS + 3; tempo += 1) {
        undoManager.setMetadata({ tempo });
      }
      undoAll();

      let steps = 0;
      while (undoManager.canRedo()) {
        undoManager.redo();
        steps += 1;
      }

      expect(steps).toBe(MAX_UNDO_STEPS);
      expect(undoManager.getMetadata().tempo).toBe(MAX_UNDO_STEPS + 3);
    });
  });
});
