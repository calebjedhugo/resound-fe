import * as THREE from 'three';
import Entity from './Entity';

class Ramp extends Entity {
  constructor(position, data = {}) {
    super('ramp', position, data);
    this.direction = data.direction || 'north'; // north, south, east, west
    this.createMesh();
  }

  createMesh() {
    // Simple sloped box ramp for now - will improve in Phase 3
    const geometry = new THREE.BoxGeometry(2, 0.5, 2);
    const material = new THREE.MeshBasicMaterial({ color: 0x88ff88 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.position.x, this.position.y + 0.25, this.position.z);

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
