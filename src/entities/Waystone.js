import * as THREE from 'three';
import gameState from 'core/GameState';
import { WORLD_SCALE, ELEVATION_HEIGHT, PLAYER_COLLISION_RADIUS } from 'core/constants';
import Entity from 'entities/Entity';
import { WAYSTONE_GOLD, WAYSTONE_RING_MAP, createWaystoneGeometry } from 'entities/EntityLook';

/**
 * Waystone — a walkable floor tile that becomes the ACTIVE waystone (the
 * deployable waystone gate's destination, core/DeployManager) when the
 * player steps onto it, flashing as they do (edge-triggered on entry).
 *
 * It was the CLEANSER until 2026-11-23 (it emptied the tape; ruled
 * 2026-07-12). Since the tape holds creatures a wipe would delete them, so
 * it cleans nothing and is the WAYSTONE now (ruled 2026-11-23): only a place
 * the G gate leads back to. Puzzle JSON may still say `cleanser`
 * (constants ENTITY_TYPE_ALIASES).
 *
 * Like a gate, the player's coordinates only mean anything in THEIR active
 * area, so a tile in a neighbor area simulating behind a doorway never fires.
 */
class Waystone extends Entity {
  // A gentle breathing pulse (seconds per full cycle) — the wordless "this
  // does something" affordance. Advanced by deltaTime, never Date.now.
  static PULSE_PERIOD_S = 2.6;

  // Emissive glow floor/ceiling for the resting pulse, and the bright spike a
  // fresh clear flashes to.
  static PULSE_MIN = 0.6;
  static PULSE_MAX = 1.2;
  static FLASH_INTENSITY = 2.6;
  static FLASH_DECAY_PER_S = 3.5;

  // Resting look — dark glass, a pale ring — and the ACTIVE waystone's, its
  // ring burning gold: the last tile the player stepped on, where a
  // deployed waystone gate leads (core/DeployManager; its panels' seam
  // leans the same gold). One tile is active at a time, world-wide. Gold is
  // the one accent the world's entities keep (entities/EntityLook).
  static BASE_COLOR = 0x252a34;
  static BASE_EMISSIVE = 0xb4c2de;
  static ACTIVE_COLOR = 0x3a3121;
  static ACTIVE_EMISSIVE = WAYSTONE_GOLD;

  constructor(position, data = {}) {
    super('waystone', position, data);
    this._pulse = 0;
    this._flash = 0;
    this._wasPlayerInside = false;
    this._paintedActive = null; // gold/cyan as last painted (_applyLook)
    this.createMesh();
  }

  /**
   * Mesh-only tile look (no entity). A thin disc lying flush on the floor:
   * dark glass, its light a breathing ring (an emissive map, shared).
   * @param {{x:number, y:number, z:number}} position - base world position
   */
  static buildTileMesh(position) {
    const geometry = createWaystoneGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: Waystone.BASE_COLOR,
      roughness: 0.25,
      metalness: 0.2,
      emissive: Waystone.BASE_EMISSIVE,
      emissiveMap: WAYSTONE_RING_MAP,
      emissiveIntensity: Waystone.PULSE_MIN,
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geometry, material);
    // Sit just above the floor plane so it never z-fights with the floor.
    mesh.position.set(position.x, position.y + 0.08, position.z);
    return mesh;
  }

  createMesh() {
    this.mesh = Waystone.buildTileMesh(this.position);
  }

  /**
   * Per-frame: breathe the glow, decay any flash, and become the active
   * waystone when the player first steps onto the tile.
   */
  update(deltaTime) {
    const dt = deltaTime || 0.016;
    this._pulse = (this._pulse + dt / Waystone.PULSE_PERIOD_S) % 1;

    const inside = this._playerInside();
    if (inside && !this._wasPlayerInside) {
      this._flash = 1; // spike the glow: the step is what claimed the tile
      // Stepping on a waystone makes it the ACTIVE one — the destination of
      // a deployed waystone gate. Stored positionally so it survives the
      // entity being pruned and rebuilt with its area.
      gameState.activeWaystone = {
        puzzleId: this.area ? this.area.id : null,
        position: { x: this.position.x, y: this.position.y, z: this.position.z },
      };
    }
    this._wasPlayerInside = inside;

    if (this._flash > 0) {
      this._flash = Math.max(0, this._flash - Waystone.FLASH_DECAY_PER_S * dt);
    }
    this._applyLook();
  }

  /** Paint the current glow: breathing sine plus any decaying clear-flash. */
  _applyLook() {
    if (!this.mesh || !this.mesh.material) return;
    const { PULSE_MIN, PULSE_MAX, FLASH_INTENSITY } = Waystone;
    const breathe =
      PULSE_MIN + (PULSE_MAX - PULSE_MIN) * (0.5 - 0.5 * Math.cos(this._pulse * Math.PI * 2));
    const flash = this._flash * (FLASH_INTENSITY - PULSE_MAX);
    this.mesh.material.emissiveIntensity = breathe + flash;
    // Re-checked every frame (not just on claim) so the PREVIOUS active tile
    // reverts to cyan on its own, and a rebuilt area's tile picks its gold
    // back up — no registry to keep in sync. Painted only when it changes
    // (each setHex converts sRGB to linear: three Math.pow calls).
    const active = this.isActiveWaystone();
    if (active === this._paintedActive) return;
    this._paintedActive = active;
    this.mesh.material.color.setHex(active ? Waystone.ACTIVE_COLOR : Waystone.BASE_COLOR);
    this.mesh.material.emissive.setHex(active ? Waystone.ACTIVE_EMISSIVE : Waystone.BASE_EMISSIVE);
  }

  /** Is THIS tile the world's active waystone (positional match)? */
  isActiveWaystone() {
    const target = gameState.activeWaystone;
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

export default Waystone;
