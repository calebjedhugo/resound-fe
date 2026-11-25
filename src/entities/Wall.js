import * as THREE from 'three';
import { WORLD_SCALE, ELEVATION_HEIGHT, WALL_HEIGHT } from 'core/constants';
import Entity from 'entities/Entity';
import { createWallMaterial } from 'entities/EnvironmentLook';

// Every wall is the same box. ONE geometry serves every wall in every area,
// flagged `userData.shared` so Entity.dispose leaves it alone. In the game
// every wall of an area draws as an instance of ONE InstancedMesh
// (PuzzleLoader.buildArea), with that area's own wall material
// (Wall.createBatchMaterial: lit by the area's creatures, and told by each
// door pass which walls to leave out — Area.hideWalls). The look is
// entities/EnvironmentLook's. One storey tall: its top is the storey
// above's floor height (a tile-built level walks on it).
const WALL_GEOMETRY = new THREE.BoxGeometry(WORLD_SCALE, WALL_HEIGHT, WORLD_SCALE);
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

// Wall fills entire grid cell (3x3 world units), one storey tall (3, as a
// gate; well over the 1.8 eye); the mesh sits half its height above the
// entity's floor y.
const WALL_MESH_Y_OFFSET = WALL_HEIGHT / 2;

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

/**
 * Where an OLDER level's perimeter walls stand (world units; a level with
 * no `tiles`): a ring just OUTSIDE the grid, rows/columns -1 and gridSize,
 * corners included (DESIGN.md "World / editor"). A tile-built level has
 * only the walls its designer placed.
 * @param {number} gridSize
 * @returns {{x:number, y:number, z:number}[]}
 */
function perimeterPositions(gridSize) {
  const positions = [];
  for (let i = -1; i <= gridSize; i += 1) {
    // Top edge (z = -1) and bottom edge (z = gridSize), including corners
    positions.push({ x: i * WORLD_SCALE, y: 0, z: -1 * WORLD_SCALE });
    positions.push({ x: i * WORLD_SCALE, y: 0, z: gridSize * WORLD_SCALE });
  }
  for (let i = 0; i < gridSize; i += 1) {
    // Left edge (x = -1) and right edge (x = gridSize)
    positions.push({ x: -1 * WORLD_SCALE, y: 0, z: i * WORLD_SCALE });
    positions.push({ x: gridSize * WORLD_SCALE, y: 0, z: i * WORLD_SCALE });
  }
  return positions;
}

/**
 * Every wall at `positions` (world units, each its floor point) as ONE
 * InstancedMesh drawn with `material` (Wall.createBatchMaterial): the game's
 * per-area wall batch (PuzzleLoader.buildArea), and the editor's. The walls
 * join into one solid: each instance's sides against a neighbouring wall
 * (same storey), its bottom, and its top under a wall stacked on it are
 * left out (`aSideHide`, `aTopHide`: the wall shader collapses them), so no
 * seam shows between blocks; a column of stacked walls shades as one face
 * (`aStack`: its foot dark at the bottom, its rim only at the top). With `floorTops` (a tile-built level: the Floor
 * draws every wall top as walkable floor, with its edge lines) the tops and
 * the rims are left out too. The batch has its OWN geometry (the instance
 * attributes live on it): `userData.ownsGeometry`, freed with the batch.
 * @param {{x:number, y:number, z:number}[]} positions
 * @param {THREE.Material} material
 * @param {{floorTops?: boolean}} [options]
 * @returns {THREE.InstancedMesh}
 */
function buildBatch(positions, material, { floorTops = false } = {}) {
  const cell = (p, dx = 0, dy = 0, dz = 0) =>
    `${Math.round(p.x / WORLD_SCALE) + dx},${Math.round(p.y / ELEVATION_HEIGHT) + dy},${
      Math.round(p.z / WORLD_SCALE) + dz
    }`;
  const at = new Set(positions.map((p) => cell(p)));
  const sides = new Float32Array(positions.length * 4);
  const tops = new Float32Array(positions.length * 2);
  const stacks = new Float32Array(positions.length * 2);
  positions.forEach((p, i) => {
    // Its column: the walls straight under and over it (one solid face)
    let below = 0;
    while (at.has(cell(p, 0, -(below + 1), 0))) below += 1;
    let above = 0;
    while (at.has(cell(p, 0, above + 1, 0))) above += 1;
    stacks[i * 2] = below;
    stacks[i * 2 + 1] = below + 1 + above;
    sides[i * 4] = at.has(cell(p, 1, 0, 0)) ? 1 : 0;
    sides[i * 4 + 1] = at.has(cell(p, -1, 0, 0)) ? 1 : 0;
    sides[i * 4 + 2] = at.has(cell(p, 0, 0, 1)) ? 1 : 0;
    sides[i * 4 + 3] = at.has(cell(p, 0, 0, -1)) ? 1 : 0;
    tops[i * 2] = floorTops || at.has(cell(p, 0, 1, 0)) ? 1 : 0;
    tops[i * 2 + 1] = floorTops ? 1 : 0;
  });
  const geometry = WALL_GEOMETRY.clone();
  geometry.userData.shared = false; // this batch's own: freed with it
  geometry.setAttribute('aSideHide', new THREE.InstancedBufferAttribute(sides, 4));
  geometry.setAttribute('aTopHide', new THREE.InstancedBufferAttribute(tops, 2));
  geometry.setAttribute('aStack', new THREE.InstancedBufferAttribute(stacks, 2));
  const batch = new THREE.InstancedMesh(geometry, material, positions.length);
  batch.userData.ownsGeometry = true;
  const matrix = new THREE.Matrix4();
  positions.forEach((p, i) => {
    batch.setMatrixAt(i, matrix.makeTranslation(p.x, p.y + WALL_MESH_Y_OFFSET, p.z));
  });
  // three frustum-culls an InstancedMesh by object.boundingSphere; the
  // instances span the whole area, not just the template box.
  batch.computeBoundingSphere();
  return batch;
}

Wall.GEOMETRY = WALL_GEOMETRY;
Wall.perimeterPositions = perimeterPositions;
Wall.buildBatch = buildBatch;
Wall.createBatchMaterial = createBatchMaterial;
Wall.MESH_Y_OFFSET = WALL_MESH_Y_OFFSET;

export default Wall;
