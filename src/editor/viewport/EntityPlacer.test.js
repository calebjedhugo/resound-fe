/**
 * EntityPlacer Tests
 *
 * Tests entity placement logic through public API.
 * Uses real EditorPuzzleModel and UndoManager; mocks only Three.js scene.
 *
 * WORLD_SCALE = 3, ELEVATION_HEIGHT = 3.0
 * gridToWorld(gx, gz) => { x: gx*3 + 1.5, z: gz*3 + 1.5 }
 */
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import UndoManager from 'editor/model/UndoManager';
import EntityPlacer from 'editor/viewport/EntityPlacer';

function createMockScene() {
  const children = [];
  return {
    children,
    add(obj) {
      children.push(obj);
    },
    remove(obj) {
      const idx = children.indexOf(obj);
      if (idx > -1) children.splice(idx, 1);
    },
  };
}

describe('EntityPlacer', () => {
  let model;
  let undoManager;
  let scene;
  let placer;

  beforeEach(() => {
    model = new EditorPuzzleModel();
    undoManager = new UndoManager(model);
    scene = createMockScene();
    placer = new EntityPlacer(scene, undoManager);
  });

  it('places a creature entity at the correct grid position and elevation in the model', () => {
    const gridX = 3;
    const gridZ = 5;
    const elevation = 2;

    const id = placer.placeEntity('creature', gridX, gridZ, elevation);

    const entity = undoManager.getEntity(id);
    expect(entity).toBeDefined();
    expect(entity.type).toBe('creature');
    expect(entity.x).toBe(3);
    expect(entity.y).toBe(2); // elevation stored as y
    expect(entity.z).toBe(5);
  });

  it('places a player spawn by calling setPlayerSpawn with correct coordinates', () => {
    const gridX = 4;
    const gridZ = 7;
    const elevation = 1;

    placer.placeEntity('player', gridX, gridZ, elevation);

    const spawn = undoManager.getPlayerSpawn();
    expect(spawn).toEqual({ x: 4, y: 1, z: 7 });
  });

  it('replaces the previous player spawn when a second one is placed', () => {
    placer.placeEntity('player', 1, 2, 0);
    placer.placeEntity('player', 8, 9, 3);

    const spawn = undoManager.getPlayerSpawn();
    expect(spawn).toEqual({ x: 8, y: 3, z: 9 });
  });

  it('creates entity mesh at the correct world position', () => {
    const gridX = 2;
    const gridZ = 4;
    const elevation = 1;

    const id = placer.placeEntity('creature', gridX, gridZ, elevation);

    const mesh = placer.getMeshById(id);
    expect(mesh).not.toBeNull();
    // gridToWorld(2, 4) => { x: 2*3+1.5=7.5, z: 4*3+1.5=13.5 }
    // y = elevation * ELEVATION_HEIGHT + sphere offset = 1*3.0 + 3*0.35 = 4.05
    expect(mesh.position.x).toBe(7.5);
    expect(mesh.position.z).toBe(13.5);
    // Creature sphere sits at elevation*ELEVATION_HEIGHT + WORLD_SCALE*0.35
    expect(mesh.position.y).toBeCloseTo(3.0 + 3 * 0.35);
  });

  it('adds N wall entities to the model when painting N cells', () => {
    const cells = [
      { gridX: 0, gridZ: 0 },
      { gridX: 1, gridZ: 0 },
      { gridX: 2, gridZ: 0 },
      { gridX: 3, gridZ: 0 },
    ];
    const elevation = 0;

    const ids = cells.map((c) => placer.placeEntity('wall', c.gridX, c.gridZ, elevation));

    const entities = undoManager.getEntities();
    const walls = entities.filter((e) => e.type === 'wall');
    expect(walls).toHaveLength(4);
    // Verify each wall is at the expected grid position
    ids.forEach((id, i) => {
      const entity = undoManager.getEntity(id);
      expect(entity.x).toBe(cells[i].gridX);
      expect(entity.z).toBe(cells[i].gridZ);
    });
  });

  it('rebuildFromModel is view-only: it does not mutate the model or fire onChange', () => {
    // A player spawn is the tricky case: rebuilding its mesh must not
    // re-run setPlayerSpawn (which would trigger autosave on every reload).
    placer.placeEntity('player', 4, 7, 1);
    placer.placeEntity('creature', 2, 3, 0);

    const onChange = jest.fn();
    undoManager.setOnChange(onChange);

    placer.rebuildFromModel();

    expect(onChange).not.toHaveBeenCalled();
    expect(undoManager.getPlayerSpawn()).toEqual({ x: 4, y: 1, z: 7 });
  });

  it('removes the entity from the model when removeEntityById is called', () => {
    const id = placer.placeEntity('creature', 5, 5, 0);
    expect(undoManager.getEntity(id)).toBeDefined();

    placer.removeEntityById(id);

    expect(undoManager.getEntity(id)).toBeUndefined();
    expect(placer.getMeshById(id)).toBeNull();
  });
});
