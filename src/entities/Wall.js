import * as THREE from 'three';
import Entity from './Entity';

class Wall extends Entity {
  constructor(position, data = {}) {
    super('wall', position, data);
    this.createMesh();
  }

  createMesh() {
    // Wall fills entire grid cell (3x3 world units) - 2.5 units tall (taller than 1.8 player)
    const geometry = new THREE.BoxGeometry(3, 2.5, 3);
    const material = new THREE.MeshStandardMaterial({
      color: 0x808080,
      roughness: 0.9,
      metalness: 0.1,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.position.x, this.position.y + 1.25, this.position.z);
  }
}

export default Wall;
