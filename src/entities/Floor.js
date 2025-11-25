import * as THREE from 'three';
import { WORLD_SCALE } from 'core/constants';
import Entity from './Entity';

class Floor extends Entity {
  constructor(gridSize) {
    // Calculate center position based on grid size
    const center = (gridSize / 2) * WORLD_SCALE;
    super('floor', { x: center, y: 0, z: center });
    this.gridSize = gridSize;
    this.createMesh();
  }

  createMesh() {
    const worldSize = this.gridSize * WORLD_SCALE;
    const geometry = new THREE.PlaneGeometry(worldSize, worldSize, this.gridSize, this.gridSize);
    const material = new THREE.MeshStandardMaterial({
      color: 0x8b7355, // Earthy brown
      roughness: 0.8,
      metalness: 0.1,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);
  }
}

export default Floor;
