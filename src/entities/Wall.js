import * as THREE from 'three';
import Entity from 'entities/Entity';

// Every wall is the same gray box. ONE geometry serves every wall in every
// area; the MATERIALS come per AREA (Wall.createMaterials — PuzzleLoader
// makes one set per area and Area.dispose frees it). three keys a material's
// shader program by the scene's lights state, and every scene (the main
// view, each neighbor's Area.scene) has its own: one wall material drawn in
// two scenes re-derived its program at every pass switch between them
// (measured 2026-10-16). Within an area the instanced batch gets its own
// material too, for the same reason (programs are keyed by "drawn
// instanced"). Shared resources outlive any one wall: flagged
// `userData.shared` so Entity.dispose leaves them alone.
const WALL_LOOK = { color: 0x808080, roughness: 0.9, metalness: 0.1 };
const WALL_GEOMETRY = new THREE.BoxGeometry(3, 2.5, 3);
WALL_GEOMETRY.userData.shared = true;

/**
 * A fresh pair of identical wall materials for one area: `single` for the
 * individual (hideable) walls, `batch` for its InstancedMesh. Flagged
 * shared; whoever creates them disposes them (Area.dispose).
 * @returns {{single: THREE.Material, batch: THREE.Material}}
 */
function createMaterials() {
  const make = () => {
    const material = new THREE.MeshStandardMaterial(WALL_LOOK);
    material.userData.shared = true;
    return material;
  };
  return { single: make(), batch: make() };
}

// For a wall built outside any area (tests, tools): one module-wide set
const DEFAULT_MATERIALS = createMaterials();

// Wall fills entire grid cell (3x3 world units) - 2.5 units tall (taller than
// 1.8 player); the mesh sits half its height above the entity's floor y.
const WALL_MESH_Y_OFFSET = 1.25;

class Wall extends Entity {
  /**
   * @param {{x,y,z}} position
   * @param {object} [data]
   * @param {boolean} [data.batched] - true when this wall renders as an
   *   instance of the area's static wall batch (PuzzleLoader.buildArea)
   *   instead of its own mesh. Batched walls have `mesh: null`, so portal
   *   render passes can never hide them individually — the loader keeps
   *   every wall a PortalView hide-set could touch individual.
   * @param {THREE.Material} [material] - its area's `single` wall material
   *   (Wall.createMaterials)
   */
  constructor(position, data = {}, material = DEFAULT_MATERIALS.single) {
    super('wall', position, data);
    if (!data.batched) this.createMesh(material);
  }

  createMesh(material) {
    this.mesh = new THREE.Mesh(WALL_GEOMETRY, material);
    this.mesh.position.set(this.position.x, this.position.y + WALL_MESH_Y_OFFSET, this.position.z);
  }
}

Wall.GEOMETRY = WALL_GEOMETRY;
Wall.createMaterials = createMaterials;
Wall.MESH_Y_OFFSET = WALL_MESH_Y_OFFSET;

export default Wall;
