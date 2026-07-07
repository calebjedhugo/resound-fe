/**
 * @jest-environment jsdom
 */

/**
 * PropertyPanel Tests
 *
 * Tests that property updates through the panel correctly
 * persist via UndoManager to the underlying model.
 * Also tests Edit Song button rendering and callback behavior.
 */
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import UndoManager from 'editor/model/UndoManager';
import PropertyPanel from 'editor/ui/PropertyPanel';

describe('PropertyPanel logic', () => {
  let model;
  let undoManager;

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

describe('PropertyPanel Edit Song button', () => {
  let model;
  let undoManager;
  let container;
  let panel;

  beforeEach(() => {
    model = new EditorPuzzleModel();
    undoManager = new UndoManager(model);
    container = document.createElement('div');
    container.id = 'property-panel';
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (panel) {
      panel.hide();
    }
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('renders an Edit Song button for creature entities', () => {
    const onEditSong = jest.fn();
    panel = new PropertyPanel(container, undoManager, {}, null, onEditSong);
    const id = undoManager.addEntity('creature', 5, 0, 3, {
      song: [],
      interval: 8,
      audibleRange: 15,
    });

    panel.show(id);

    const editBtn = container.querySelector('.edit-song-btn');
    expect(editBtn).not.toBeNull();
    expect(editBtn.textContent).toBe('Edit Song...');
  });

  it('renders an Edit Song button for gate entities', () => {
    const onEditSong = jest.fn();
    panel = new PropertyPanel(container, undoManager, {}, null, onEditSong);
    const id = undoManager.addEntity('gate', 5, 0, 3, { song: [] });

    panel.show(id);

    const editBtn = container.querySelector('.edit-song-btn');
    expect(editBtn).not.toBeNull();
    expect(editBtn.textContent).toBe('Edit Song...');
  });

  it('renders an Edit Song button for fountain entities', () => {
    const onEditSong = jest.fn();
    panel = new PropertyPanel(container, undoManager, {}, null, onEditSong);
    const id = undoManager.addEntity('fountain', 5, 0, 3, { song: [] });

    panel.show(id);

    const editBtn = container.querySelector('.edit-song-btn');
    expect(editBtn).not.toBeNull();
    expect(editBtn.textContent).toBe('Edit Song...');
  });

  it('does not render an Edit Song button for wall entities', () => {
    const onEditSong = jest.fn();
    panel = new PropertyPanel(container, undoManager, {}, null, onEditSong);
    const id = undoManager.addEntity('wall', 5, 0, 3, {});

    panel.show(id);

    const editBtn = container.querySelector('.edit-song-btn');
    expect(editBtn).toBeNull();
  });

  it('does not render an Edit Song button for ramp entities', () => {
    const onEditSong = jest.fn();
    panel = new PropertyPanel(container, undoManager, {}, null, onEditSong);
    const id = undoManager.addEntity('ramp', 5, 0, 3, { direction: 'north' });

    panel.show(id);

    const editBtn = container.querySelector('.edit-song-btn');
    expect(editBtn).toBeNull();
  });

  it('calls onEditSong callback with entity ID when Edit Song button is clicked', () => {
    const onEditSong = jest.fn();
    panel = new PropertyPanel(container, undoManager, {}, null, onEditSong);
    const id = undoManager.addEntity('creature', 5, 0, 3, {
      song: [],
      interval: 8,
      audibleRange: 15,
    });

    panel.show(id);

    const editBtn = container.querySelector('.edit-song-btn');
    editBtn.click();

    expect(onEditSong).toHaveBeenCalledTimes(1);
    expect(onEditSong).toHaveBeenCalledWith(id);
  });
});
