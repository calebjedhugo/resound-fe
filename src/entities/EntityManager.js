import gameState from 'core/GameState';

class EntityManager {
  constructor(scene) {
    this.scene = scene;
    this.entities = new Map(); // id -> entity
  }

  add(entity) {
    this.entities.set(entity.id, entity);
    if (entity.mesh) {
      this.scene.add(entity.mesh);
    }

    // Sync with gameState.entities for game logic access
    gameState.entities.push(entity);

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

    // Sync with gameState.entities
    const index = gameState.entities.indexOf(entity);
    if (index !== -1) {
      gameState.entities.splice(index, 1);
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

    // Sync with gameState.entities
    gameState.entities = [];
  }
}

export default EntityManager;
