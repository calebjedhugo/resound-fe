import * as THREE from 'three';
import gameState from 'core/GameState';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import Entity from 'entities/Entity';

/**
 * CleanserGatePad — the deployed half of the player's cleanser gate
 * (core/DeployManager): a walk-through gate, placed anywhere walkable,
 * that teleports the player to the world's ACTIVE cleanser (the gold
 * tile — the last one they stepped on) and disappears. One way, one use:
 * the gate closes behind you, and arrival lands you ON the active
 * cleanser, which fires as usual (tape wipe). World state — moved
 * creatures, opened gates — does NOT reset; that persistence is what
 * makes the gate a puzzle piece and not just an escape hatch.
 *
 * The pad draws NO geometry of its own: it looks like any other
 * activated gate — a box of see-through portal panels (DeployManager
 * builds one PortalView per face on this entity's mesh anchor) showing
 * the destination live, gold cleanser included. The mesh is an empty
 * anchor at gate-box-center height so the panels parent exactly like a
 * real gate's. Position is free-form, not grid-quantized, so the
 * trigger is a disc of floor rather than a cell.
 */
class CleanserGatePad extends Entity {
  // Planar reach of the walk-through trigger — inside the panel box
  // (inset DOORWAY_OFFSET ~1.51), so the crossing commits before the
  // camera could ever pierce a panel.
  static TRIGGER_RADIUS = 1.25;

  constructor(position, data = {}) {
    super('cleanser-gate', position, data);
    this._wasPlayerInside = false;
    this._consumed = false;
    this.createMesh();
  }

  createMesh() {
    // An invisible anchor at the same height a gate BOX centers on, so
    // PortalView surfaces (parented here by DeployManager) land exactly
    // where a real gate's do.
    this.mesh = new THREE.Group();
    this.mesh.position.set(this.position.x, this.position.y + WORLD_SCALE / 2, this.position.z);
  }

  update() {
    const inside = this._playerInside();
    if (inside && !this._wasPlayerInside) this._consume();
    this._wasPlayerInside = inside;
  }

  /** Walking in: consume the gate and travel to the active cleanser. */
  _consume() {
    if (this._consumed) return;
    this._consumed = true;
    // The gate is gone the moment it fires, whatever the teleport does —
    // it closes behind you.
    if (this.area) this.area.entityManager.remove(this.id);
    const target = gameState.activeCleanser;
    if (target && gameState.world && gameState.world.teleportToCleanser) {
      gameState.world.teleportToCleanser(target);
    }
  }

  /**
   * Is the player inside the gate (same level, within its trigger disc)?
   * Mirrors CleansingTile: only meaningful in the player's own active area.
   */
  _playerInside() {
    if (this.area && this.area !== gameState.activeArea) return false;
    const { position, elevation } = gameState.player;
    if (Math.round(this.position.y / ELEVATION_HEIGHT) !== elevation) return false;
    const dx = position.x - this.position.x;
    const dz = position.z - this.position.z;
    return dx * dx + dz * dz <= CleanserGatePad.TRIGGER_RADIUS ** 2;
  }
}

export default CleanserGatePad;
