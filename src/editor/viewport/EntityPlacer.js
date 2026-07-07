import * as THREE from 'three';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import { gridToWorld } from 'editor/viewport/gridUtils';
import ENTITY_COLORS from 'editor/viewport/entityColors';

// Vertical offset (in WORLD_SCALE units) that sits each mesh on its floor.
// Shared by mesh creation and repositioning so they can't drift apart.
const Y_OFFSETS = {
  creature: 0.35,
  gate: 0.75,
  fountain: 0.25,
  wall: 0.5,
  ramp: 0.25,
};

// Sensible starting data for a freshly-placed entity, so a new creature is
// immediately usable and the properties panel reflects what is actually stored
// (previously the panel showed a default of 15 while the model held nothing).
function defaultData(type) {
  switch (type) {
    case 'creature':
      return { song: [], interval: 8, audibleRange: 15 };
    case 'gate':
    case 'fountain':
      return { song: [] };
    case 'ramp':
      return { direction: 'north' };
    default:
      return {};
  }
}

export default class EntityPlacer {
  constructor(scene, undoManager) {
    this._scene = scene;
    this._undoManager = undoManager;
    this._entityMeshes = new Map(); // entityId -> THREE.Mesh
    this._playerSpawnMesh = null;
  }

  placeEntity(type, gridX, gridZ, elevation, data = {}) {
    // One thing per tile: refuse to stack onto an occupied cell.
    if (this._isCellOccupied(gridX, elevation, gridZ)) return null;

    if (type === 'player') {
      return this._placePlayerSpawn(gridX, gridZ, elevation);
    }

    const entityData = { ...defaultData(type), ...data };
    const id = this._undoManager.addEntity(type, gridX, elevation, gridZ, entityData);
    this._createMesh(id, type, gridX, gridZ, elevation, entityData);
    return id;
  }

  /**
   * Move an already-placed entity to a new grid cell, updating both the model
   * and its existing mesh (so selection highlighting survives the move).
   */
  setEntityPosition(id, gridX, gridZ, elevation) {
    this._undoManager.updateEntity(id, { x: gridX, y: elevation, z: gridZ });
    const mesh = this._entityMeshes.get(id);
    if (!mesh) return;
    const world = gridToWorld(gridX, gridZ);
    const offset = (Y_OFFSETS[mesh.userData?.type] || 0) * WORLD_SCALE;
    mesh.position.set(world.x, elevation * ELEVATION_HEIGHT + offset, world.z);
  }

  /** True if an entity or the player spawn already occupies cell (x,y,z). */
  _isCellOccupied(x, y, z) {
    if (this._undoManager.getEntitiesAt(x, y, z).length > 0) return true;
    const spawn = this._undoManager.getPlayerSpawn();
    return Boolean(spawn && spawn.x === x && spawn.y === y && spawn.z === z);
  }

  _placePlayerSpawn(gridX, gridZ, elevation) {
    this._undoManager.setPlayerSpawn(gridX, elevation, gridZ);
    this._createPlayerSpawnMesh(gridX, gridZ, elevation);
    return null; // No entity id for player spawn
  }

  // Builds just the spawn marker mesh (no model mutation), so view-only
  // rebuilds don't touch the model / undo stack / autosave.
  _createPlayerSpawnMesh(gridX, gridZ, elevation) {
    // Remove old spawn mesh
    if (this._playerSpawnMesh) {
      this._scene.remove(this._playerSpawnMesh);
      this._playerSpawnMesh.geometry.dispose();
      this._playerSpawnMesh.material.dispose();
    }

    const world = gridToWorld(gridX, gridZ);
    const y = elevation * ELEVATION_HEIGHT;

    // Spawn marker: cone pointing down
    const geo = new THREE.ConeGeometry(WORLD_SCALE * 0.3, WORLD_SCALE * 0.6, 8);
    const mat = new THREE.MeshStandardMaterial({ color: ENTITY_COLORS.player });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(world.x, y + WORLD_SCALE * 0.6, world.z);
    mesh.rotation.x = Math.PI; // Point downward
    this._scene.add(mesh);
    this._playerSpawnMesh = mesh;
    mesh.userData = { type: 'player' };
  }

  _createMesh(id, type, gridX, gridZ, elevation, data) {
    const world = gridToWorld(gridX, gridZ);
    const y = elevation * ELEVATION_HEIGHT;
    let geo, mat, mesh;

    switch (type) {
      case 'creature':
        geo = new THREE.SphereGeometry(WORLD_SCALE * 0.35, 16, 12);
        mat = new THREE.MeshStandardMaterial({ color: ENTITY_COLORS.creature });
        mesh = new THREE.Mesh(geo, mat);
        break;
      case 'gate':
        geo = new THREE.BoxGeometry(WORLD_SCALE * 0.8, WORLD_SCALE * 1.5, WORLD_SCALE * 0.3);
        mat = new THREE.MeshStandardMaterial({ color: ENTITY_COLORS.gate });
        mesh = new THREE.Mesh(geo, mat);
        break;
      case 'fountain':
        geo = new THREE.CylinderGeometry(
          WORLD_SCALE * 0.4,
          WORLD_SCALE * 0.4,
          WORLD_SCALE * 0.5,
          16
        );
        mat = new THREE.MeshStandardMaterial({ color: ENTITY_COLORS.fountain });
        mesh = new THREE.Mesh(geo, mat);
        break;
      case 'wall':
        geo = new THREE.BoxGeometry(WORLD_SCALE * 0.95, WORLD_SCALE, WORLD_SCALE * 0.95);
        mat = new THREE.MeshStandardMaterial({ color: ENTITY_COLORS.wall });
        mesh = new THREE.Mesh(geo, mat);
        break;
      case 'ramp': {
        geo = new THREE.BoxGeometry(WORLD_SCALE * 0.9, WORLD_SCALE * 0.5, WORLD_SCALE * 0.9);
        mat = new THREE.MeshStandardMaterial({ color: ENTITY_COLORS.ramp });
        mesh = new THREE.Mesh(geo, mat);
        // Rotate based on direction (default: north)
        this._applyRampRotation(mesh, (data && data.direction) || 'north');
        break;
      }
      default:
        return;
    }

    mesh.position.set(world.x, y + WORLD_SCALE * Y_OFFSETS[type], world.z);
    mesh.userData = { entityId: id, type };
    this._scene.add(mesh);
    this._entityMeshes.set(id, mesh);
  }

  _applyRampRotation(mesh, direction) {
    // Tilt the mesh to look like a ramp
    switch (direction) {
      case 'north':
        mesh.rotation.x = -0.3;
        break;
      case 'south':
        mesh.rotation.x = 0.3;
        break;
      case 'east':
        mesh.rotation.z = 0.3;
        break;
      case 'west':
        mesh.rotation.z = -0.3;
        break;
    }
  }

  removeEntityById(id) {
    this._undoManager.removeEntity(id);
    const mesh = this._entityMeshes.get(id);
    if (mesh) {
      this._scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      this._entityMeshes.delete(id);
    }
  }

  getMeshById(id) {
    return this._entityMeshes.get(id) || null;
  }

  getAllMeshes() {
    return Array.from(this._entityMeshes.values());
  }

  // Used by selection manager to find entity id from raycasted mesh
  getEntityIdFromMesh(mesh) {
    return mesh.userData?.entityId ?? null;
  }

  // Rebuild all meshes from model state (used after undo/redo or import)
  rebuildFromModel() {
    // Clear existing meshes
    this._entityMeshes.forEach((mesh) => {
      this._scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    this._entityMeshes.clear();

    if (this._playerSpawnMesh) {
      this._scene.remove(this._playerSpawnMesh);
      this._playerSpawnMesh.geometry.dispose();
      this._playerSpawnMesh.material.dispose();
      this._playerSpawnMesh = null;
    }

    // Rebuild from model
    const entities = this._undoManager.getEntities();
    entities.forEach((e) => {
      this._createMesh(e.id, e.type, e.x, e.z, e.y, e.data);
    });

    const spawn = this._undoManager.getPlayerSpawn();
    if (spawn) {
      this._createPlayerSpawnMesh(spawn.x, spawn.z, spawn.y);
    }
  }
}
