import * as THREE from 'three';
import Entity from './Entity';

class Wall extends Entity {
  constructor(position, data = {}) {
    super('wall', position, data);
    this.createMesh();
  }

  createMesh() {
    // Simple cube wall for now - will improve in Phase 3
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x808080 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.position.x, this.position.y + 1, this.position.z);
  }

  update(deltaTime) {
    // Walls don't update
  }
}

export default Wall;
