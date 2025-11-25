import * as THREE from 'three';
import Entity from './Entity';

class Wall extends Entity {
  constructor(position, data = {}) {
    super('wall', position, data);
    this.createMesh();
  }

  createMesh() {
    // Simple cube wall - 2.5 units tall (taller than 1.8 player)
    const geometry = new THREE.BoxGeometry(1, 2.5, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0x808080,
      roughness: 0.9,
      metalness: 0.1,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.position.x, this.position.y + 1.25, this.position.z);
  }

  update(deltaTime) {
    // Walls don't update
  }
}

export default Wall;
