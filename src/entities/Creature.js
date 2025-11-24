import * as THREE from 'three';
import Entity from './Entity';

class Creature extends Entity {
  constructor(position, data = {}) {
    super('creature', position, data);
    this.song = data.song || { notes: ['C4'], rhythm: ['1/4'] };
    this.createMesh();
  }

  createMesh() {
    // Simple sphere creature for now - will improve in Phase 3 with dynamic visuals
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.position.x, this.position.y + 0.5, this.position.z);
  }

  update(deltaTime) {
    // Will add movement and sound behavior in Phase 3
  }
}

export default Creature;
