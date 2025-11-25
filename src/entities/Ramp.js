import * as THREE from 'three';
import Entity from './Entity';

class Ramp extends Entity {
  constructor(position, data = {}) {
    super('ramp', position, data);
    this.direction = data.direction || 'north'; // north, south, east, west
    this.createMesh();
  }

  createMesh() {
    // Grid-cell-sized ramp (3 units to fill 1 grid cell at 3x scale)
    const geometry = new THREE.BoxGeometry(3, 1, 3);
    const material = new THREE.MeshStandardMaterial({
      color: 0x88ff88,
      roughness: 0.8,
      metalness: 0.1,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.position.x, this.position.y + 0.5, this.position.z);

    // Rotate based on direction
    const rotations = {
      north: 0,
      south: Math.PI,
      east: Math.PI / 2,
      west: -Math.PI / 2,
    };
    this.mesh.rotation.y = rotations[this.direction] || 0;
  }

  update(deltaTime) {
    // Ramps don't update
  }
}

export default Ramp;
