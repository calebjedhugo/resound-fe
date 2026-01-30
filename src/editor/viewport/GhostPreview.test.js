/**
 * GhostPreview Tests
 *
 * Tests ghost preview mesh behavior: transparent entity preview
 * displayed on the hovered grid cell when an entity tool is active.
 *
 * Mocks only Three.js scene; uses real constants.
 * WORLD_SCALE = 3, ELEVATION_HEIGHT = 3.0
 * gridToWorld(gx, gz) => { x: gx*3 + 1.5, z: gz*3 + 1.5 }
 */
import GhostPreview from 'editor/viewport/GhostPreview';

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

describe('GhostPreview', () => {
  let scene;
  let ghost;

  beforeEach(() => {
    scene = createMockScene();
    ghost = new GhostPreview(scene);
  });

  afterEach(() => {
    ghost.dispose();
  });

  it('adds a mesh to the scene when setEntityType is called with a valid type', () => {
    ghost.setEntityType('creature');

    expect(scene.children).toHaveLength(1);
    expect(scene.children[0]).toBeDefined();
  });

  it('removes the mesh and disposes geometry/material when setEntityType(null) is called', () => {
    ghost.setEntityType('creature');
    const mesh = scene.children[0];
    const geoDispose = jest.spyOn(mesh.geometry, 'dispose');
    const matDispose = jest.spyOn(mesh.material, 'dispose');

    ghost.setEntityType(null);

    expect(scene.children).toHaveLength(0);
    expect(geoDispose).toHaveBeenCalled();
    expect(matDispose).toHaveBeenCalled();
  });

  it('disposes old mesh before creating new one when switching types', () => {
    ghost.setEntityType('creature');
    const oldMesh = scene.children[0];
    const oldGeoDispose = jest.spyOn(oldMesh.geometry, 'dispose');
    const oldMatDispose = jest.spyOn(oldMesh.material, 'dispose');

    ghost.setEntityType('gate');

    expect(oldGeoDispose).toHaveBeenCalled();
    expect(oldMatDispose).toHaveBeenCalled();
    expect(scene.children).toHaveLength(1);
    // New mesh should be different from old
    expect(scene.children[0]).not.toBe(oldMesh);
  });

  it('positions mesh at correct world coordinates when update is called', () => {
    ghost.setEntityType('creature');

    ghost.update({ x: 2, z: 4 }, 1);

    const mesh = scene.children[0];
    // gridToWorld(2, 4) => { x: 2*3+1.5=7.5, z: 4*3+1.5=13.5 }
    expect(mesh.position.x).toBe(7.5);
    expect(mesh.position.z).toBe(13.5);
    // y = elevation * ELEVATION_HEIGHT + entity-specific offset
    expect(mesh.position.y).toBeGreaterThan(0);
    expect(mesh.visible).toBe(true);
  });

  it('hides the mesh when update is called with null grid', () => {
    ghost.setEntityType('creature');
    ghost.update({ x: 0, z: 0 }, 0);
    expect(scene.children[0].visible).toBe(true);

    ghost.update(null, 0);

    expect(scene.children[0].visible).toBe(false);
  });

  it('uses material with opacity 0.4 and transparent true', () => {
    ghost.setEntityType('creature');

    const mesh = scene.children[0];
    expect(mesh.material.opacity).toBe(0.4);
    expect(mesh.material.transparent).toBe(true);
  });

  it('player ghost mesh has rotation.x equal to Math.PI', () => {
    ghost.setEntityType('player');

    const mesh = scene.children[0];
    expect(mesh.rotation.x).toBeCloseTo(Math.PI);
  });

  it('does not recreate mesh when setEntityType is called with the same type', () => {
    ghost.setEntityType('creature');
    const firstMesh = scene.children[0];

    ghost.setEntityType('creature');

    expect(scene.children[0]).toBe(firstMesh);
    expect(scene.children).toHaveLength(1);
  });

  it.each(['player', 'creature', 'gate', 'fountain', 'wall', 'ramp'])(
    'produces a mesh for entity type "%s"',
    (type) => {
      ghost.setEntityType(type);

      expect(scene.children).toHaveLength(1);
      expect(scene.children[0]).toBeDefined();
      expect(scene.children[0].geometry).toBeDefined();
      expect(scene.children[0].material).toBeDefined();
    }
  );
});
