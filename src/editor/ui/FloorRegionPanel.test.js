/**
 * @jest-environment jsdom
 */

/**
 * FloorRegionPanel — the floor slabs in the viewport track the model's floor
 * list through every refresh (undo/redo and loads refresh unconditionally),
 * and a refresh that changes no floor leaves the slabs alone.
 */
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import UndoManager from 'editor/model/UndoManager';
import FloorRegionPanel from 'editor/ui/FloorRegionPanel';

// The shared three mock, plus the HSL setter the slabs colour themselves with
jest.mock('three', () => {
  const three = jest.requireActual('three');
  class Color extends three.Color {
    setHSL() {
      return this;
    }
  }
  return { ...three, Color };
});

describe('FloorRegionPanel floor slabs', () => {
  let undoManager;
  let scene;
  let panel;

  /** The slabs in the scene, as the floors they draw (centre + elevation). */
  const slabs = () =>
    scene.children.map((m) => ({ x: m.position.x, y: m.position.y, z: m.position.z }));

  beforeEach(() => {
    undoManager = new UndoManager(new EditorPuzzleModel());
    const children = [];
    scene = {
      children,
      add: (obj) => children.push(obj),
      remove: (obj) => children.splice(children.indexOf(obj), 1),
    };
    const container = document.createElement('div');
    panel = new FloorRegionPanel(container, undoManager, { _scene: scene, activeElevation: 0 });
  });

  it('follows the floor list through undo and redo', () => {
    undoManager.addFloor(1, 0, 0, 1, 1);
    undoManager.addFloor(2, 4, 4, 4, 4);
    panel.refresh();
    const both = slabs();
    expect(both).toHaveLength(2);

    undoManager.undo();
    panel.refresh();
    expect(slabs()).toEqual([both[0]]);

    undoManager.redo();
    panel.refresh();
    expect(slabs()).toEqual(both);
  });

  it('keeps the slab meshes when a refresh changes no floor', () => {
    undoManager.addFloor(1, 0, 0, 1, 1);
    panel.refresh();
    const [slab] = scene.children;

    undoManager.setMetadata({ tempo: 90 }); // an unrelated edit, then its undo
    undoManager.undo();
    panel.refresh();

    expect(scene.children).toHaveLength(1);
    expect(scene.children[0]).toBe(slab);
  });
});
