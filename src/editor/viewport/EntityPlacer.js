import * as THREE from 'three';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import { gridToWorld } from 'editor/viewport/gridUtils';
import ENTITY_COLORS from 'editor/viewport/entityColors';
import { createEntityGeometry, Y_OFFSETS } from 'editor/viewport/entityGeometry';

// Entity types _createMesh knows how to place (player spawn is separate).
const PLACEABLE_TYPES = ['creature', 'gate', 'fountain', 'wall', 'ramp'];

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
    const geo = createEntityGeometry('player');
    const mat = new THREE.MeshStandardMaterial({ color: ENTITY_COLORS.player });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(world.x, y + WORLD_SCALE * Y_OFFSETS.player, world.z);
    mesh.rotation.x = Math.PI; // Point downward
    this._scene.add(mesh);
    this._playerSpawnMesh = mesh;
    mesh.userData = { type: 'player' };
  }

  _createMesh(id, type, gridX, gridZ, elevation, data) {
    if (!PLACEABLE_TYPES.includes(type)) return;

    const world = gridToWorld(gridX, gridZ);
    const y = elevation * ELEVATION_HEIGHT;

    const geo = createEntityGeometry(type);
    const mat = new THREE.MeshStandardMaterial({ color: ENTITY_COLORS[type] });
    const mesh = new THREE.Mesh(geo, mat);

    if (type === 'ramp') {
      // Rotate based on direction (default: north)
      this._applyRampRotation(mesh, (data && data.direction) || 'north');
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
      default:
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
