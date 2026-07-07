class EntityManager {
  /**
   * @param {THREE.Scene|THREE.Group} scene - container the entity meshes go in
   * @param {?Area} area - the area this manager belongs to (portal stage 3:
   *   every entity set is area-scoped; `gameState.entities` delegates to the
   *   ACTIVE area's list)
   */
  constructor(scene, area = null) {
    this.scene = scene;
    this.area = area;
    this.entities = new Map(); // id -> entity
  }

  add(entity) {
    this.entities.set(entity.id, entity);
    if (entity.mesh) {
      this.scene.add(entity.mesh);
    }

    // Scope the entity to its area: simulation code (forces, collision,
    // listening) must interact with this entity through its own area only
    entity.area = this.area;
    if (this.area) {
      this.area.entities.push(entity);
    }

    return entity;
  }

  remove(entityId) {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    // Remove from scene
    if (entity.mesh) {
      this.scene.remove(entity.mesh);
    }

    // Dispose resources
    entity.dispose();

    // Remove from map
    this.entities.delete(entityId);

    if (this.area) {
      const index = this.area.entities.indexOf(entity);
      if (index !== -1) {
        this.area.entities.splice(index, 1);
      }
    }
  }

  get(entityId) {
    return this.entities.get(entityId);
  }

  getByType(type) {
    const results = [];
    this.entities.forEach((entity) => {
      if (entity.type === type) {
        results.push(entity);
      }
    });
    return results;
  }

  getAll() {
    return Array.from(this.entities.values());
  }

  update(deltaTime) {
    this.entities.forEach((entity) => {
      if (entity.active && entity.update) {
        entity.update(deltaTime);
      }
    });
  }

  clear() {
    // Remove and dispose all entities
    this.entities.forEach((entity) => {
      if (entity.mesh) {
        this.scene.remove(entity.mesh);
      }
      entity.dispose();
    });
    this.entities.clear();

    if (this.area) {
      this.area.entities.length = 0;
    }
  }
}

export default EntityManager;
