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
    // Landmark-sized fountain
    const geometry = new THREE.CylinderGeometry(1.5, 1.5, 2.5, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0x0088ff,
      roughness: 0.3,
      metalness: 0.4,
      emissive: 0x001144,
      emissiveIntensity: 0.4,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.position.x, this.position.y + 1.25, this.position.z);
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
