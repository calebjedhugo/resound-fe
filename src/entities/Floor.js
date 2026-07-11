import * as THREE from 'three';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import Entity from 'entities/Entity';

class Floor extends Entity {
  constructor(gridSize, floors = []) {
    // Center of the grid's true footprint: cell CENTERS run
    // 0..(gridSize-1)*WORLD_SCALE, so the footprint spans -1.5 to
    // gridSize*3 - 1.5. (Centering on gridSize/2 left a half-cell bare
    // strip along the north/west edges — a black wedge at every edge-row
    // doorway, and a sliver of void along north/west walls.)
    const center = ((gridSize - 1) / 2) * WORLD_SCALE;
    super('floor', { x: center, y: 0, z: center });
    this.gridSize = gridSize;
    this.floors = floors;
    this.meshGroup = new THREE.Group();
    this.mesh = this.meshGroup;
    this.createMeshes();
  }

  createMeshes() {
    // Base floor at elevation 0 (full grid)
    const worldSize = this.gridSize * WORLD_SCALE;
    this.meshGroup.add(
      this.createFloorPlane(worldSize, worldSize, this.position.x, 0, this.position.z)
    );

    // Elevated floor regions: thin SLABS, not planes, so they're visible
    // from below (players can walk underneath them) and show edge faces.
    for (const floor of this.floors) {
      const width = (floor.x2 - floor.x1 + 1) * WORLD_SCALE;
      const depth = (floor.z2 - floor.z1 + 1) * WORLD_SCALE;
      const centerX = ((floor.x1 + floor.x2) / 2) * WORLD_SCALE;
      const centerZ = ((floor.z1 + floor.z2) / 2) * WORLD_SCALE;
      const floorY = floor.elevation * ELEVATION_HEIGHT;

      this.meshGroup.add(this.createFloorSlab(width, depth, centerX, floorY, centerZ));
    }
  }

  createFloorPlane(width, depth, centerX, y, centerZ) {
    const geometry = new THREE.PlaneGeometry(width, depth);
    const material = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.8,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(centerX, y, centerZ);
    return mesh;
  }

  /** Elevated storey: a slab whose TOP surface sits at the walk height. */
  createFloorSlab(width, depth, centerX, topY, centerZ) {
    const thickness = 0.4;
    const geometry = new THREE.BoxGeometry(width, thickness, depth);
    const material = new THREE.MeshStandardMaterial({
      color: 0x9a805e, // slightly lighter than the ground so storeys read
      roughness: 0.8,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(centerX, topY - thickness / 2, centerZ);
    return mesh;
  }
}

export default Floor;
