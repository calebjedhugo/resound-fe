import * as THREE from 'three';
import Entity from './Entity';

class Creature extends Entity {
  constructor(position, data = {}) {
    super('creature', position, data);
    this.song = data.song || { notes: ['C4'], rhythm: ['1/4'] };
    this.createMesh();
  }

  createMesh() {
    // Simple sphere creature - human-sized
    const geometry = new THREE.SphereGeometry(0.9, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      roughness: 0.5,
      metalness: 0.2,
      emissive: 0x003300, // Slight glow
      emissiveIntensity: 0.2,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.position.x, this.position.y + 0.9, this.position.z);
  }

  // eslint-disable-next-line class-methods-use-this
  update(deltaTime) {
    // Will add movement and sound behavior in Phase 3
  }
}

export default Creature;
