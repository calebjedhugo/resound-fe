/**
 * @jest-environment jsdom
 */

/**
 * The cutaway in the schematic look and in picking: the schematic meshes
 * and slabs ghost by the same rule as the game look, and a click passes
 * through a ghost to what is inside the container (SelectionManager, over
 * the real EntityPlacer and model). The ray is stood in for: it meets the
 * meshes handed to it nearest the camera first, as three's does.
 */
import * as THREE from 'three';
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import UndoManager from 'editor/model/UndoManager';
import EntityPlacer from 'editor/viewport/EntityPlacer';
import SelectionManager from 'editor/viewport/SelectionManager';
import TileSlabs from 'editor/viewport/TileSlabs';
import Cutaway from 'editor/viewport/Cutaway';
import { CUT_UNIFORMS, clearCut } from 'entities/CutawayLook';
import { gridToWorld } from 'editor/viewport/gridUtils';

let undo;
let placer;
let cutaway;
let selection;
let ids;

/** The cut with the cursor at (2, 2) on the ground, the camera to the south. */
function lookFromSouth(view = 'cutaway') {
  const at = gridToWorld(2, 2);
  cutaway.setMode(view);
  cutaway.update({
    storey: 0,
    cursor: { x: 2, z: 2 },
    camera: { position: new THREE.Vector3(at.x, 30, at.z + 30) },
  });
  placer.applyCut(cutaway);
}

/** A click down the line x = 2: whatever of it the ray is handed, nearest (south) first. */
function clickDownTheMiddle() {
  jest.spyOn(THREE.Raycaster.prototype, 'intersectObjects').mockImplementation((objects) =>
    objects
      .filter((mesh) => {
        const entity = undo.getEntity(placer.getEntityIdFromMesh(mesh));
        return entity && entity.x === 2;
      })
      .sort((a, b) => b.position.z - a.position.z)
      .map((object) => ({ object }))
  );
  return selection.handleClick(0, 0);
}

beforeEach(() => {
  localStorage.clear();
  undo = new UndoManager(new EditorPuzzleModel());
  placer = new EntityPlacer(new THREE.Scene(), undo);
  placer.setLook('schematic');
  cutaway = new Cutaway();
  selection = new SelectionManager(new THREE.PerspectiveCamera(), placer);
  selection.isGhost = (entity) => cutaway.ghosts(entity);
  // A container: its south wall at z = 4, its north at z = 0, a creature
  // inside at (2, 2), another creature up on storey 1 over it
  ids = {
    south: placer.placeEntity('wall', 2, 4, 0),
    north: placer.placeEntity('wall', 2, 0, 0),
    inside: placer.placeEntity('creature', 2, 2, 0),
    above: placer.placeEntity('creature', 2, 3, 1),
  };
});

afterEach(() => {
  clearCut();
  localStorage.clear();
  jest.restoreAllMocks();
});

describe('picking passes through ghosts', () => {
  it('cutaway: a click goes through the ghost of the near wall (and the storey above) to what is inside', () => {
    lookFromSouth('cutaway');
    expect(clickDownTheMiddle()).toBe(true);
    expect(selection.selectedId).toBe(ids.inside);
  });

  it('storey cut: the near wall is solid again, and takes the click', () => {
    lookFromSouth('storey');
    clickDownTheMiddle();
    expect(selection.selectedId).toBe(ids.south);
  });

  it('full: the first thing on the ray takes it, the storey above included', () => {
    lookFromSouth('full');
    clickDownTheMiddle();
    expect(selection.selectedId).toBe(ids.south);
    // ...and with the near wall gone, the creature up above (nearer the camera)
    placer.removeEntityById(ids.south);
    jest.restoreAllMocks();
    clickDownTheMiddle();
    expect(selection.selectedId).toBe(ids.above);
  });

  it('the pickable meshes are every mesh but the ghosts', () => {
    lookFromSouth('cutaway');
    const picked = placer
      .getPickableMeshes((entity) => cutaway.ghosts(entity))
      .map((mesh) => placer.getEntityIdFromMesh(mesh));
    expect(picked.sort()).toEqual([ids.north, ids.inside].sort());
    expect(placer.getPickableMeshes()).toHaveLength(4);
  });
});

describe('the schematic look ghosts by the same rule', () => {
  const ghostOf = (id) => placer.getMeshById(id).material.userData.cutGhost.value;

  it('each primitive is told, and drawn whole again in the full view', () => {
    lookFromSouth('cutaway');
    expect(ghostOf(ids.south)).toBe(1);
    expect(ghostOf(ids.above)).toBe(1);
    expect(ghostOf(ids.north)).toBe(0);
    expect(ghostOf(ids.inside)).toBe(0);

    lookFromSouth('full');
    Object.values(ids).forEach((id) => expect(ghostOf(id)).toBe(0));
  });

  it("the slabs read the floor's owners and the shared cut in their own shader", () => {
    const slabs = new TileSlabs(new THREE.Scene());
    slabs.sync([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ]);
    expect(slabs.mesh.geometry.attributes.aCut).toBeDefined();
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main() {\n#include <clipping_planes_fragment>\n}',
    };
    slabs.mesh.material.onBeforeCompile(shader);
    expect(shader.uniforms.uCutMode).toBe(CUT_UNIFORMS.uCutMode);
    expect(shader.vertexShader).toContain('cutGhost(aCut.xy, aCut.z, aCut.w)');
    expect(shader.fragmentShader).toContain('discard');
    slabs.dispose();
  });
});
