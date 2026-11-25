import * as THREE from 'three';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import { gridToWorld } from 'editor/viewport/gridUtils';
import ENTITY_COLORS from 'editor/viewport/entityColors';
import { createEntityGeometry, Y_OFFSETS } from 'editor/viewport/entityGeometry';
import { isValidGateId, nextGateId, usedGateIds } from 'editor/util/gateIds';
import { addGhostDither, setMaterialGhost } from 'entities/CutawayLook';

// Entity types _createMesh knows how to place (player spawn is separate).
const PLACEABLE_TYPES = ['creature', 'gate', 'fountain', 'wall', 'ramp', 'waystone'];

// Sensible starting data for a freshly-placed entity, so a new creature is
// immediately usable and the properties panel reflects what is actually stored
// (previously the panel showed a default of 15 while the model held nothing).
function defaultData(type) {
  switch (type) {
    case 'creature':
      return { song: [], interval: 8, audibleRange: 15 };
    case 'gate':
      // gateId is assigned in placeEntity (needs the model for uniqueness)
      return { song: [], facing: 'north' };
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
    // The schematic meshes are drawn only in the schematic look; in the game
    // look (GameLookLayer draws the level) they stay as invisible pick
    // targets: three raycasts a mesh whose material is hidden.
    this._drawn = true;
  }

  /**
   * Draw the schematic meshes ('schematic') or keep them only as pick
   * targets ('game').
   * @param {'game'|'schematic'} look
   */
  setLook(look) {
    this._drawn = look === 'schematic';
    this._entityMeshes.forEach((mesh) => this._applyDrawn(mesh));
    if (this._playerSpawnMesh) this._applyDrawn(this._playerSpawnMesh);
  }

  _applyDrawn(mesh) {
    // eslint-disable-next-line no-param-reassign
    mesh.material.visible = this._drawn;
  }

  /**
   * Ghost the schematic meshes the cutaway cuts (editor/viewport/Cutaway):
   * drawn as a screen door in the schematic look. Before every frame drawn.
   * @param {{ghosts: function(object): boolean}} cutaway
   */
  applyCut(cutaway) {
    for (const entity of this._undoManager.getEntities()) {
      const mesh = this._entityMeshes.get(entity.id);
      if (mesh) setMaterialGhost(mesh.material, cutaway.ghosts(entity));
    }
    const spawn = this._undoManager.getPlayerSpawn();
    if (this._playerSpawnMesh && spawn) {
      setMaterialGhost(
        this._playerSpawnMesh.material,
        cutaway.ghosts({ type: 'player', ...spawn })
      );
    }
  }

  /**
   * The meshes a click or a pointer can pick: every entity's, less those
   * `isGhost` says are ghosts (a click goes through a ghost to what is
   * inside it).
   * @param {function(object): boolean} [isGhost] - of an entity
   * @returns {THREE.Mesh[]}
   */
  getPickableMeshes(isGhost = () => false) {
    const meshes = [];
    this._entityMeshes.forEach((mesh, id) => {
      if (!isGhost(this._undoManager.getEntity(id))) meshes.push(mesh);
    });
    return meshes;
  }

  placeEntity(type, gridX, gridZ, elevation, data = {}) {
    // One thing per tile — except a waystone, which may share a cell with the
    // player spawn (spawning on a waystone is legal) and with a gate (a
    // waystone under a doorway).
    if (this._isCellOccupied(gridX, elevation, gridZ, type)) return null;

    if (type === 'player') {
      return this._placePlayerSpawn(gridX, gridZ, elevation);
    }

    const entityData = { ...defaultData(type), ...data };
    // Gates carry a stable, puzzle-unique id so other puzzles can link to them
    if (type === 'gate' && !isValidGateId(entityData.gateId)) {
      entityData.gateId = nextGateId(usedGateIds(this._undoManager.getEntities()));
    }
    // Anything placed brings its floor tile: one undo step for both
    const id = this._withFloor(gridX, elevation, gridZ, () =>
      this._undoManager.addEntity(type, gridX, elevation, gridZ, entityData)
    );
    this._createMesh(id, type, gridX, gridZ, elevation, entityData);
    return id;
  }

  /**
   * Run a placement or move onto cell (x, y, z) as ONE undo step, building
   * the floor tile there first when the cell has none (the floor is only
   * what the designer builds; nothing stands on air). A wall's top is floor
   * already: nothing is stacked on it.
   */
  _withFloor(x, y, z, fn) {
    const um = this._undoManager;
    if (!um.hasFloor || um.hasFloor(x, y, z)) return fn();
    const run = () => {
      um.addTiles([{ x, y, z }]);
      return fn();
    };
    return um.batch ? um.batch(run) : run();
  }

  /**
   * Move an already-placed entity to a new grid cell, updating both the model
   * and its existing mesh (so selection highlighting survives the move). A
   * cell with no floor gets its tile in the same undo step.
   */
  setEntityPosition(id, gridX, gridZ, elevation) {
    this._withFloor(gridX, elevation, gridZ, () =>
      this._undoManager.updateEntity(id, { x: gridX, y: elevation, z: gridZ })
    );
    const mesh = this._entityMeshes.get(id);
    if (!mesh) return;
    const world = gridToWorld(gridX, gridZ);
    const offset = (Y_OFFSETS[mesh.userData?.type] || 0) * WORLD_SCALE;
    mesh.position.set(world.x, elevation * ELEVATION_HEIGHT + offset, world.z);
  }

  /**
   * True if cell (x,y,z) already holds something that blocks placing `type`
   * there. A waystone shares a cell with the player spawn AND with a gate
   * (a waystone under a doorway is legal); everything else is
   * one-per-tile.
   */
  _isCellOccupied(x, y, z, type = null) {
    const entities = this._undoManager.getEntitiesAt(x, y, z);
    const spawn = this._undoManager.getPlayerSpawn();
    const spawnHere = Boolean(spawn && spawn.x === x && spawn.y === y && spawn.z === z);
    // A waystone is blocked only by a non-gate entity (spawn never blocks it).
    if (type === 'waystone') return entities.some((e) => e.type !== 'gate');
    // A gate tolerates a waystone but nothing else (incl. the spawn).
    if (type === 'gate') return spawnHere || entities.some((e) => e.type !== 'waystone');
    if (type === 'player') return entities.some((e) => e.type !== 'waystone');
    if (entities.length > 0) return true;
    return spawnHere;
  }

  _placePlayerSpawn(gridX, gridZ, elevation) {
    this._withFloor(gridX, elevation, gridZ, () =>
      this._undoManager.setPlayerSpawn(gridX, elevation, gridZ)
    );
    this._createPlayerSpawnMesh(gridX, gridZ, elevation);
    return null; // No entity id for player spawn
  }

  // Builds just the spawn marker mesh (no model mutation), so view-only
  // rebuilds don't touch the model / undo stack / autosave.
  _createPlayerSpawnMesh(gridX, gridZ, elevation) {
    // Remove old spawn mesh
    if (this._playerSpawnMesh) this._disposeMesh(this._playerSpawnMesh);

    // Spawn marker: cone pointing down
    const geo = createEntityGeometry('player');
    const mat = addGhostDither(new THREE.MeshStandardMaterial({ color: ENTITY_COLORS.player }));
    const mesh = new THREE.Mesh(geo, mat);
    this._placeSpawnMesh(mesh, gridX, gridZ, elevation);
    mesh.rotation.x = Math.PI; // Point downward
    this._applyDrawn(mesh);
    this._scene.add(mesh);
    this._playerSpawnMesh = mesh;
    mesh.userData = { type: 'player' };
  }

  _placeSpawnMesh(mesh, gridX, gridZ, elevation) {
    const world = gridToWorld(gridX, gridZ);
    mesh.position.set(
      world.x,
      elevation * ELEVATION_HEIGHT + WORLD_SCALE * Y_OFFSETS.player,
      world.z
    );
  }

  _createMesh(id, type, gridX, gridZ, elevation, data) {
    if (!PLACEABLE_TYPES.includes(type)) return;

    const geo = createEntityGeometry(type);
    // Ghosted by the cutaway in the schematic look (applyCut)
    const mat = addGhostDither(new THREE.MeshStandardMaterial({ color: ENTITY_COLORS[type] }));
    const mesh = new THREE.Mesh(geo, mat);
    this._fitMesh(mesh, { id, type, x: gridX, y: elevation, z: gridZ, data });
    this._applyDrawn(mesh);
    this._scene.add(mesh);
    this._entityMeshes.set(id, mesh);
  }

  /**
   * Set everything about an entity's mesh except its geometry and material
   * (those follow from the type alone): transform, ids and the emissive state
   * a fresh mesh starts with. Mesh creation and rebuildFromModel's reuse both
   * go through here, so a reused mesh ends exactly where a new one would.
   */
  _fitMesh(mesh, { id, type, x, y, z, data }) {
    const world = gridToWorld(x, z);
    mesh.rotation.x = 0;
    mesh.rotation.y = 0;
    mesh.rotation.z = 0;
    if (type === 'ramp') {
      // Rotate based on direction (default: north)
      this._applyRampRotation(mesh, (data && data.direction) || 'north');
    }

    mesh.position.set(world.x, y * ELEVATION_HEIGHT + WORLD_SCALE * Y_OFFSETS[type], world.z);
    mesh.userData = { entityId: id, type };

    if (type === 'gate') this._applyLinkBadge(mesh, Boolean(data && data.link));
    else mesh.material.emissive.setHex(0x000000); // unlit, as a new material starts
  }

  /** Re-read a gate's link state from the model and restyle its mesh. */
  refreshLinkBadge(id) {
    const mesh = this._entityMeshes.get(id);
    const entity = this._undoManager.getEntity(id);
    if (!mesh || !entity || entity.type !== 'gate') return;
    this._applyLinkBadge(mesh, Boolean(entity.data && entity.data.link));
  }

  // Linked gates (portals to another puzzle) glow violet so they read at a
  // glance in the viewport; unlinked gates keep the flat entity color.
  _applyLinkBadge(mesh, isLinked) {
    if (isLinked) {
      mesh.material.emissive.setHex(0x7733ff);
      mesh.material.emissiveIntensity = 0.6;
    } else {
      mesh.material.emissive.setHex(0x000000);
      mesh.material.emissiveIntensity = 0;
    }
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

  /** Clear the player spawn (model + marker mesh). */
  clearPlayerSpawn() {
    this._undoManager.clearPlayerSpawn();
    if (this._playerSpawnMesh) {
      this._disposeMesh(this._playerSpawnMesh);
      this._playerSpawnMesh = null;
    }
  }

  removeEntityById(id) {
    this._undoManager.removeEntity(id);
    const mesh = this._entityMeshes.get(id);
    if (mesh) {
      this._disposeMesh(mesh);
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

  _disposeMesh(mesh) {
    this._scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }

  /**
   * Bring the meshes in line with the model (after undo/redo or import). An
   * entity that kept its id and type keeps its mesh, refitted as a fresh one
   * would be; only added, removed or retyped entities create or free GPU
   * resources. (Freeing and re-making every mesh cost ~1.6 ms CPU per undo
   * for a 104-entity puzzle, before re-uploading it all on the next frame.)
   */
  rebuildFromModel() {
    const entities = this._undoManager.getEntities();
    const kept = new Map();
    for (const e of entities) {
      const mesh = this._entityMeshes.get(e.id);
      if (mesh && mesh.userData.type === e.type) kept.set(e.id, mesh);
    }
    this._entityMeshes.forEach((mesh, id) => {
      if (kept.get(id) !== mesh) this._disposeMesh(mesh);
    });

    // Re-filled in model order, like a full rebuild (getAllMeshes order)
    this._entityMeshes.clear();
    entities.forEach((e) => {
      const mesh = kept.get(e.id);
      if (mesh) {
        this._fitMesh(mesh, e);
        this._entityMeshes.set(e.id, mesh);
      } else {
        this._createMesh(e.id, e.type, e.x, e.z, e.y, e.data);
      }
    });

    const spawn = this._undoManager.getPlayerSpawn();
    if (spawn && this._playerSpawnMesh) {
      this._placeSpawnMesh(this._playerSpawnMesh, spawn.x, spawn.z, spawn.y);
    } else if (spawn) {
      this._createPlayerSpawnMesh(spawn.x, spawn.z, spawn.y);
    } else if (this._playerSpawnMesh) {
      this._disposeMesh(this._playerSpawnMesh);
      this._playerSpawnMesh = null;
    }
  }
}
