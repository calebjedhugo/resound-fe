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

  /**
   * Free the GPU resources of this entity's WHOLE mesh tree — a Group root
   * (Floor) or child meshes (Ramp's marker posts) used to leak on every
   * area unload. Resources shared beyond this entity (a module-level
   * geometry/material used by every instance) set `userData.shared = true`
   * and are skipped. Textures stay with their owners (NotationDisplay,
   * PortalView), which free them in their own dispose.
   */
  dispose() {
    if (!this.mesh) return;
    const owned = (resource) => resource && !(resource.userData && resource.userData.shared);
    const freed = new Set();
    const free = (resource) => {
      if (!owned(resource) || freed.has(resource)) return;
      freed.add(resource);
      resource.dispose();
    };
    // Walks `children` by hand rather than Object3D.traverse so it also
    // runs on the test harness's minimal THREE mock
    const visit = (object) => {
      free(object.geometry);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(free);
      (object.children || []).forEach(visit);
    };
    visit(this.mesh);
  }
}

export default Entity;
