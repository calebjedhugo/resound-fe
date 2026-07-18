import gameState from 'core/GameState';
import { ELEVATION_HEIGHT } from 'core/constants';
import Entity from 'entities/Entity';
import CleansingTile from 'entities/CleansingTile';

/**
 * CleanserGatePad — the deployed half of the player's cleanser gate
 * (core/DeployManager): a walk-on pad, placed anywhere walkable, that
 * teleports the player to the world's ACTIVE cleanser (the gold tile —
 * the last one they stepped on) and disappears. One way, one use: the
 * gate closes behind you, and arrival lands you ON the active cleanser,
 * which fires as usual (tape wipe). World state — moved creatures, opened
 * gates — does NOT reset; that persistence is what makes the pad a puzzle
 * piece and not just an escape hatch.
 *
 * Looks like a cleanser (it IS one end of a cleanser pair); position is
 * free-form, not grid-quantized, so the trigger is the disc itself rather
 * than a cell.
 */
class CleanserGatePad extends Entity {
  // Planar reach of the walk-on trigger: the disc's own radius.
  static TRIGGER_RADIUS = 1.25;

  constructor(position, data = {}) {
    super('cleanser-gate', position, data);
    this._wasPlayerInside = false;
    this._consumed = false;
    this._pulse = 0;
    this.createMesh();
  }

  createMesh() {
    this.mesh = CleansingTile.buildTileMesh(this.position);
  }

  update(deltaTime) {
    const dt = deltaTime || 0.016;
    // Same breathing glow as a cleanser — it speaks the same visual language.
    this._pulse = (this._pulse + dt / CleansingTile.PULSE_PERIOD_S) % 1;
    if (this.mesh && this.mesh.material) {
      const { PULSE_MIN, PULSE_MAX } = CleansingTile;
      this.mesh.material.emissiveIntensity =
        PULSE_MIN + (PULSE_MAX - PULSE_MIN) * (0.5 - 0.5 * Math.cos(this._pulse * Math.PI * 2));
    }

    const inside = this._playerInside();
    if (inside && !this._wasPlayerInside) this._consume();
    this._wasPlayerInside = inside;
  }

  /** Walking on: consume the pad and travel to the active cleanser. */
  _consume() {
    if (this._consumed) return;
    this._consumed = true;
    // The pad is gone the moment it fires, whatever the teleport does —
    // the gate closes behind you.
    if (this.area) this.area.entityManager.remove(this.id);
    const target = gameState.activeCleanser;
    if (target && gameState.world && gameState.world.teleportToCleanser) {
      gameState.world.teleportToCleanser(target);
    }
  }

  /**
   * Is the player standing on the disc (same level, within its radius)?
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
