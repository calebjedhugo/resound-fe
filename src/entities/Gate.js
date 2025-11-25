import * as THREE from 'three';
import Entity from './Entity';

class Gate extends Entity {
  constructor(position, data = {}) {
    super('gate', position, data);
    this.song = data.song || { notes: ['C4', 'E4', 'G4'], rhythm: ['1/1', '1/1', '1/1'] };
    this.isOpen = false;
    this.createMesh();
  }

  createMesh() {
    // Doorway-sized gate
    const geometry = new THREE.BoxGeometry(1.5, 3, 0.3);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      roughness: 0.4,
      metalness: 0.6,
      emissive: 0x331100,
      emissiveIntensity: 0.3,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.position.x, this.position.y + 1.5, this.position.z);
  }

  update(deltaTime) {
    // Will add chord detection and opening animation in Phase 3
  }

  open() {
    this.isOpen = true;
    // Animation will be added in Phase 3
  }
}

export default Gate;
