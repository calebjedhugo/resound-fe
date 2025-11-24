import * as THREE from 'three';
import Entity from './Entity';

class Fountain extends Entity {
  constructor(position, data = {}) {
    super('fountain', position, data);
    this.song = data.song || { notes: ['C4', 'E4', 'G4'], rhythm: ['1/1', '1/1', '1/1'] };
    this.isComplete = false;
    this.createMesh();
  }

  createMesh() {
    // Simple cylinder fountain for now - will improve in Phase 3
    const geometry = new THREE.CylinderGeometry(1, 1, 2, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0x0088ff });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.position.x, this.position.y + 1, this.position.z);
  }

  update(deltaTime) {
    // Will add celebration animation and "singing along" in Phase 3
  }

  complete() {
    this.isComplete = true;
    // Celebration will be added in Phase 3
  }
}

export default Fountain;
