let entityIdCounter = 0;

const generateId = () => {
  entityIdCounter += 1;
  return `entity_${entityIdCounter}`;
};

class Entity {
  constructor(type, position, data = {}) {
    this.id = generateId();
    this.type = type; // 'creature', 'gate', 'wall', 'fountain', 'ramp'
    this.position = position; // {x, y, z}
    this.mesh = null; // Three.js mesh
    this.data = data; // Entity-specific data
    this.active = true;
  }

  update(deltaTime) {
    // Override in subclasses
  }

  render() {
    // Override in subclasses if needed
    // Most rendering is automatic via Three.js
  }

  dispose() {
    // Cleanup Three.js resources
    if (this.mesh) {
      if (this.mesh.geometry) {
        this.mesh.geometry.dispose();
      }
      if (this.mesh.material) {
        if (Array.isArray(this.mesh.material)) {
          this.mesh.material.forEach((mat) => mat.dispose());
        } else {
          this.mesh.material.dispose();
        }
      }
    }
  }
}

export default Entity;
