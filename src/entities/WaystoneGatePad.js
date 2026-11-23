import * as THREE from 'three';
import gameState from 'core/GameState';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import Entity from 'entities/Entity';

/**
 * WaystoneGatePad — the deployed half of the player's waystone gate
 * (core/DeployManager): a walk-through gate, placed anywhere walkable,
 * that teleports the player to the world's ACTIVE waystone (the gold
 * tile — the last one they stepped on) and disappears. One way, one use:
 * the gate closes behind you, and arrival lands you ON the active
 * waystone, which fires as usual (it claims the tile again). World state — moved
 * creatures, opened gates — does NOT reset; that persistence is what
 * makes the gate a puzzle piece and not just an escape hatch.
 *
 * The pad looks like any other open gate — a box of see-through portal
 * panels (DeployManager builds one PortalView per face on this entity's
 * mesh anchor) showing the destination live, gold waystone included — whose
 * seam along the outline leans GOLD (entities/EntityLook: PortalManager
 * gives its panels the tint).
 * The mesh is an anchor at gate-box-center height so the panels parent
 * exactly like a real gate's. Position is free-form, not grid-quantized, so the
 * trigger is a disc of floor rather than a cell.
 */
class WaystoneGatePad extends Entity {
  // Planar reach of the walk-through trigger — inside the panel box
  // (inset DOORWAY_OFFSET ~1.51), so the crossing commits before the
  // camera could ever pierce a panel.
  static TRIGGER_RADIUS = 1.25;

  constructor(position, data = {}) {
    super('waystone-gate', position, data);
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

  /** Walking in: consume the gate and travel to the active waystone. */
  _consume() {
    if (this._consumed) return;
    this._consumed = true;
    // The gate is gone the moment it fires, whatever the teleport does —
    // it closes behind you.
    if (this.area) this.area.entityManager.remove(this.id);
    const target = gameState.activeWaystone;
    if (target && gameState.world && gameState.world.teleportToWaystone) {
      gameState.world.teleportToWaystone(target);
    }
  }

  /**
   * Is the player inside the gate (same level, within its trigger disc)?
   * Mirrors Waystone: only meaningful in the player's own active area.
   */
  _playerInside() {
    if (this.area && this.area !== gameState.activeArea) return false;
    const { position, elevation } = gameState.player;
    if (Math.round(this.position.y / ELEVATION_HEIGHT) !== elevation) return false;
    const dx = position.x - this.position.x;
    const dz = position.z - this.position.z;
    return dx * dx + dz * dz <= WaystoneGatePad.TRIGGER_RADIUS ** 2;
  }
}

export default WaystoneGatePad;
