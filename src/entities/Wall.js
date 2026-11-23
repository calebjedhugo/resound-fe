import * as THREE from 'three';
import Entity from 'entities/Entity';
import { createWallMaterial } from 'entities/EnvironmentLook';

// Every wall is the same box. ONE geometry serves every wall in every area,
// flagged `userData.shared` so Entity.dispose leaves it alone. In the game
// every wall of an area draws as an instance of ONE InstancedMesh
// (PuzzleLoader.buildArea), with that area's own wall material
// (Wall.createBatchMaterial: lit by the area's creatures, and told by each
// door pass which walls to leave out — Area.hideWalls). The look is
// entities/EnvironmentLook's.
const WALL_GEOMETRY = new THREE.BoxGeometry(3, 2.5, 3);
WALL_GEOMETRY.userData.shared = true;

/**
 * The material one area's wall batch draws with, lit by that area's
 * creatures. Whoever creates it disposes it (Area.dispose).
 * @param {import('entities/EnvironmentLook').AreaLight} light
 * @returns {THREE.Material}
 */
function createBatchMaterial(light) {
  const material = createWallMaterial(light);
  material.userData.shared = true;
  return material;
}

// For a wall built outside any area with its own mesh (tests, tools)
const DEFAULT_MATERIAL = createWallMaterial();
DEFAULT_MATERIAL.userData.shared = true;

// Wall fills entire grid cell (3x3 world units) - 2.5 units tall (taller than
// 1.8 player); the mesh sits half its height above the entity's floor y.
const WALL_MESH_Y_OFFSET = 1.25;

class Wall extends Entity {
  /**
   * @param {{x,y,z}} position
   * @param {object} [data]
   * @param {boolean} [data.batched] - true when this wall renders as an
   *   instance of its area's wall batch (PuzzleLoader.buildArea) instead of
   *   its own mesh: `mesh` stays null (collision, elevation and the editor
   *   use the entity's data, never its mesh)
   */
  constructor(position, data = {}) {
    super('wall', position, data);
    if (!data.batched) this.createMesh();
  }

  createMesh() {
    this.mesh = new THREE.Mesh(WALL_GEOMETRY, DEFAULT_MATERIAL);
    this.mesh.position.set(this.position.x, this.position.y + WALL_MESH_Y_OFFSET, this.position.z);
  }
}

Wall.GEOMETRY = WALL_GEOMETRY;
Wall.createBatchMaterial = createBatchMaterial;
Wall.MESH_Y_OFFSET = WALL_MESH_Y_OFFSET;

export default Wall;
