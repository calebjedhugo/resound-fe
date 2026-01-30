/**
 * PropertyPanel Logic Tests
 *
 * Tests that property updates through the panel correctly
 * persist via UndoManager to the underlying model.
 * DOM rendering is not tested (manual verification).
 */
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import UndoManager from 'editor/model/UndoManager';

describe('PropertyPanel logic', () => {
  let model, undoManager;

  beforeEach(() => {
    model = new EditorPuzzleModel();
    undoManager = new UndoManager(model);
  });

  it('updating creature properties persists through the model', () => {
    const id = undoManager.addEntity('creature', 5, 0, 5, {
      song: [],
      interval: 8,
      audibleRange: 15,
    });
    undoManager.updateEntity(id, { data: { song: [], interval: 4, audibleRange: 20 } });
    const entity = undoManager.getEntity(id);
    expect(entity.data.interval).toBe(4);
    expect(entity.data.audibleRange).toBe(20);
  });

  it('ramp direction change updates the entity', () => {
    const id = undoManager.addEntity('ramp', 5, 0, 5, { direction: 'north' });
    undoManager.updateEntity(id, { data: { direction: 'south' } });
    const entity = undoManager.getEntity(id);
    expect(entity.data.direction).toBe('south');
  });

  it('metadata changes update the model', () => {
    undoManager.setMetadata({ name: 'Test Puzzle', tempo: 140 });
    const meta = undoManager.getMetadata();
    expect(meta.name).toBe('Test Puzzle');
    expect(meta.tempo).toBe(140);
  });

  it('deleting an entity removes it from the model', () => {
    const id = undoManager.addEntity('creature', 3, 0, 3, { song: [] });

    undoManager.removeEntity(id);

    expect(undoManager.getEntity(id)).toBeUndefined();
  });

  it('getEntity returns undefined after deletion', () => {
    const id = undoManager.addEntity('gate', 2, 0, 2, { song: 'C4' });
    expect(undoManager.getEntity(id)).toBeDefined();

    undoManager.removeEntity(id);

    expect(undoManager.getEntity(id)).toBeUndefined();
    expect(undoManager.getEntities().find((e) => e.id === id)).toBeUndefined();
  });

  it('deletion is undoable (undo restores the entity)', () => {
    const id = undoManager.addEntity('creature', 5, 0, 5, {
      song: [],
      interval: 8,
      audibleRange: 15,
    });

    undoManager.removeEntity(id);
    expect(undoManager.getEntity(id)).toBeUndefined();

    undoManager.undo();

    const restored = undoManager.getEntity(id);
    expect(restored).toBeDefined();
    expect(restored.type).toBe('creature');
    expect(restored.data.interval).toBe(8);
  });
});
