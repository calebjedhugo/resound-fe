import * as THREE from 'three';
import gameState from 'core/GameState';
import Tape from 'core/Tape';
import { WORLD_SCALE, ELEVATION_HEIGHT, PLAYER_COLLISION_RADIUS } from 'core/constants';
import Entity from 'entities/Entity';

/**
 * CleansingTile — a walkable floor tile that empties the player's tape when
 * they step onto it (ruled 2026-07-12, replacing the hold-to-delete verb).
 *
 * Clearing the tape used to be a scary per-slot delete: a playtester who knew
 * nothing about the game refused to use it for fear of stranding himself. The
 * tile turns "reset my recordings" into a place in the world — a gently
 * pulsing pad you walk over on purpose, so it always reads as safe. The clear
 * is edge-triggered on entry (standing on it doesn't repeatedly wipe; leaving
 * and re-entering does).
 *
 * Like a gate, the player's coordinates only mean anything in THEIR active
 * area, so a tile in a neighbor area simulating behind a doorway never fires.
 */
class CleansingTile extends Entity {
  // A gentle breathing pulse (seconds per full cycle) — the wordless "this
  // does something" affordance. Advanced by deltaTime, never Date.now.
  static PULSE_PERIOD_S = 2.6;

  // Emissive glow floor/ceiling for the resting pulse, and the bright spike a
  // fresh clear flashes to.
  static PULSE_MIN = 0.35;
  static PULSE_MAX = 0.9;
  static FLASH_INTENSITY = 2.2;
  static FLASH_DECAY_PER_S = 3.5;

  // Resting (cyan) look, and the gold look of the ACTIVE cleanser — the last
  // tile the player stepped on, where a deployed cleanser gate leads
  // (core/DeployManager). One tile is active at a time, world-wide.
  static BASE_COLOR = 0x66ddff;
  static BASE_EMISSIVE = 0x2299cc;
  static ACTIVE_COLOR = 0xffd97a;
  static ACTIVE_EMISSIVE = 0xbb7711;

  constructor(position, data = {}) {
    super('cleanser', position, data);
    this._pulse = 0;
    this._flash = 0;
    this._wasPlayerInside = false;
    this.createMesh();
  }

  /**
   * Mesh-only tile look (no entity). A thin disc lying flush on the floor,
   * glowing cyan-white.
   * @param {{x:number, y:number, z:number}} position - base world position
   */
  static buildTileMesh(position) {
    const geometry = new THREE.CylinderGeometry(1.25, 1.25, 0.12, 32);
    const material = new THREE.MeshStandardMaterial({
      color: CleansingTile.BASE_COLOR,
      roughness: 0.25,
      metalness: 0.2,
      emissive: CleansingTile.BASE_EMISSIVE,
      emissiveIntensity: CleansingTile.PULSE_MIN,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(geometry, material);
    // Sit just above the floor plane so it never z-fights with the floor.
    mesh.position.set(position.x, position.y + 0.08, position.z);
    return mesh;
  }

  createMesh() {
    this.mesh = CleansingTile.buildTileMesh(this.position);
  }

  /**
   * Per-frame: breathe the glow, decay any clear-flash, and clear the tape
   * when the player first steps onto the tile.
   */
  update(deltaTime) {
    const dt = deltaTime || 0.016;
    this._pulse = (this._pulse + dt / CleansingTile.PULSE_PERIOD_S) % 1;

    const inside = this._playerInside();
    if (inside && !this._wasPlayerInside) {
      Tape.clear();
      this._flash = 1; // spike the glow so the wipe reads as caused by the tile
      // Stepping on a cleanser makes it the ACTIVE one — the destination of
      // a deployed cleanser gate. Stored positionally so it survives the
      // entity being pruned and rebuilt with its area.
      gameState.activeCleanser = {
        puzzleId: this.area ? this.area.id : null,
        position: { x: this.position.x, y: this.position.y, z: this.position.z },
      };
    }
    this._wasPlayerInside = inside;

    if (this._flash > 0) {
      this._flash = Math.max(0, this._flash - CleansingTile.FLASH_DECAY_PER_S * dt);
    }
    this._applyLook();
  }

  /** Paint the current glow: breathing sine plus any decaying clear-flash. */
  _applyLook() {
    if (!this.mesh || !this.mesh.material) return;
    const { PULSE_MIN, PULSE_MAX, FLASH_INTENSITY } = CleansingTile;
    const breathe =
      PULSE_MIN + (PULSE_MAX - PULSE_MIN) * (0.5 - 0.5 * Math.cos(this._pulse * Math.PI * 2));
    const flash = this._flash * (FLASH_INTENSITY - PULSE_MAX);
    this.mesh.material.emissiveIntensity = breathe + flash;
    // Re-checked every frame (not just on claim) so the PREVIOUS active tile
    // reverts to cyan on its own, and a rebuilt area's tile picks its gold
    // back up — no registry to keep in sync.
    const active = this.isActiveCleanser();
    this.mesh.material.color.setHex(active ? CleansingTile.ACTIVE_COLOR : CleansingTile.BASE_COLOR);
    this.mesh.material.emissive.setHex(
      active ? CleansingTile.ACTIVE_EMISSIVE : CleansingTile.BASE_EMISSIVE
    );
  }

  /** Is THIS tile the world's active cleanser (positional match)? */
  isActiveCleanser() {
    const target = gameState.activeCleanser;
    if (!target) return false;
    if (this.area && target.puzzleId !== this.area.id) return false;
    return (
      Math.abs(target.position.x - this.position.x) < 0.01 &&
      Math.abs(target.position.y - this.position.y) < 0.01 &&
      Math.abs(target.position.z - this.position.z) < 0.01
    );
  }

  /**
   * Is the player standing on this tile (same level, within the cell)? Mirrors
   * Gate._playerInside: the player's coordinates only mean anything in THEIR
   * active area, so a tile in a neighbor area never triggers.
   */
  _playerInside() {
    if (this.area && this.area !== gameState.activeArea) return false;
    const { position, elevation } = gameState.player;
    const half = WORLD_SCALE / 2 + PLAYER_COLLISION_RADIUS;
    return (
      Math.round(this.position.y / ELEVATION_HEIGHT) === elevation &&
      Math.abs(position.x - this.position.x) < half &&
      Math.abs(position.z - this.position.z) < half
    );
  }
}

export default CleansingTile;
