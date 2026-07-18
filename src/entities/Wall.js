import * as THREE from 'three';
import Entity from 'entities/Entity';

// Every wall is the same gray box, so one geometry + one material are shared
// across all walls in all areas: individual jamb walls draw as thin instances
// of these, and PuzzleLoader's per-area InstancedMesh batch reuses them too.
// Shared resources outlive any one wall — see dispose() below.
const WALL_GEOMETRY = new THREE.BoxGeometry(3, 2.5, 3);
const WALL_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x808080,
  roughness: 0.9,
  metalness: 0.1,
});

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
   */
  constructor(position, data = {}) {
    super('wall', position, data);
    if (!data.batched) this.createMesh();
  }

  createMesh() {
    this.mesh = new THREE.Mesh(WALL_GEOMETRY, WALL_MATERIAL);
    this.mesh.position.set(this.position.x, this.position.y + WALL_MESH_Y_OFFSET, this.position.z);
  }

  // Entity.dispose would dispose the mesh's geometry/material — ours are the
  // module-wide shared ones, still in use by every other wall.
  // eslint-disable-next-line class-methods-use-this
  dispose() {}
}

Wall.GEOMETRY = WALL_GEOMETRY;
Wall.MATERIAL = WALL_MATERIAL;
Wall.MESH_Y_OFFSET = WALL_MESH_Y_OFFSET;

export default Wall;
