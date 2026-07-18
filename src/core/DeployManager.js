import gameState from 'core/GameState';
import HintMemory from 'core/HintMemory';
import CameraController from 'core/CameraController';
import PortalManager from 'core/PortalManager';
import CleansingTile from 'entities/CleansingTile';
import CleanserGatePad from 'entities/CleanserGatePad';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';

/**
 * DeployManager — the player's deployable cleanser gate.
 *
 * "G" cycles a three-state machine:
 *   idle     -> aiming:   a phantom cleanser floats two tiles ahead of the
 *                         player (free placement — walkable spots only, but
 *                         NOT grid-quantized), tracking their movement AND
 *                         their look (the effective camera heading, mouse
 *                         offset included)
 *   aiming   -> deployed: the phantom becomes a real CleanserGatePad
 *                         (refused in place if the spot is invalid)
 *   deployed -> idle:     the pad is picked back up ("g again to cancel")
 *
 * Walking onto the deployed pad teleports the player to the ACTIVE
 * cleanser (the gold tile — the last one stepped on) and consumes the pad.
 * One pad exists at a time, world-wide; it lives in the area it was placed
 * and dies with it if that area is pruned. Aiming requires an active
 * cleanser: the gate is "a remote opening of the drain you touched" — no
 * touched drain, no gate.
 *
 * A deployed pad is SEE-THROUGH like any other gate: a PortalView panel
 * stands on the pad (facing back at the deployer) showing the live view of
 * the active cleanser's cell and the room beyond. The destination area is
 * retained live (PortalManager.retainArea) while the pad exists, and the
 * view retargets if the player claims a different active cleanser.
 */

// Two tiles ahead of the player.
const DEPLOY_DISTANCE = 2 * WORLD_SCALE;

// Ghost + invalid-spot looks for the aiming phantom.
const PHANTOM_OPACITY = 0.45;
const INVALID_COLOR = 0xff5544;
const INVALID_EMISSIVE = 0x992211;

class DeployManager {
  constructor() {
    this._scene = null;
    this._state = 'idle'; // 'idle' | 'aiming' | 'deployed'
    this._phantom = null; // ghost mesh while aiming
    this._spot = null; // { x, y, z, valid } — the phantom's current target
    this._pad = null; // { area, id, entity, facing } while deployed
    this._view = null; // the pad's see-through PortalView (when renderable)
    this._viewKey = null; // what the current view was built against
    this._retainedId = null; // destination area pinned live for the view
  }

  /** @param {THREE.Scene} scene - the render scene (phantom lives here) */
  initialize(scene) {
    this._scene = scene;
  }

  get state() {
    return this._state;
  }

  /** The G key: idle -> aiming -> deployed -> idle. */
  toggle() {
    if (gameState.mode !== 'PLAYING' || !gameState.activeArea) return;
    if (this._state === 'idle') {
      // No active cleanser = nowhere to lead; the key stays silent.
      if (!gameState.activeCleanser) return;
      this._enterAiming();
    } else if (this._state === 'aiming') {
      this._deploy();
    } else {
      this._removePad();
    }
  }

  /** Per-frame (only while PLAYING and awake). */
  update() {
    if (this._state === 'aiming') {
      this._updatePhantom();
    } else if (this._state === 'deployed') {
      // Consumed by a walk-through, or its whole area was pruned — either
      // way the gate is gone; return to idle so G can start a fresh one.
      if (!this._pad || !this._pad.area.entityManager.get(this._pad.id)) {
        // A consumed pad completes the lesson (the player used the whole
        // verb); a pruned area does not.
        if (this._pad && this._pad.entity && this._pad.entity._consumed) {
          HintMemory.retire('deploy');
        }
        this._clearDeployment();
        return;
      }
      this._syncView();
    }
  }

  /**
   * Render the pad's see-through panel (call from the game's beforeRender,
   * alongside PortalManager.renderPortals).
   */
  renderPortal(renderer, camera) {
    if (!this._view || !this._pad) return;
    if (this._pad.area !== gameState.activeArea) return;
    this._view.render(renderer, camera);
  }

  /** Tear down (menu exit / new world entry). */
  reset() {
    this._removePhantom();
    this._clearDeployment();
  }

  /** Drop pad tracking, its view, and the destination retention. */
  _clearDeployment() {
    this._disposeView();
    if (this._retainedId) {
      PortalManager.releaseArea(this._retainedId);
      this._retainedId = null;
    }
    this._pad = null; // pad entities die with their areas
    this._state = 'idle';
  }

  /**
   * Keep the see-through view matched to the world: the destination is the
   * CURRENT active cleanser (stepping on a new one retargets the pad), its
   * area must be live, and a destination in the active area renders the
   * main scene. Any mismatch rebuilds the view; hidden whenever the pad
   * isn't in the player's area (its texture would be stale).
   */
  _syncView() {
    const target = gameState.activeCleanser;
    if (!target || !target.puzzleId) {
      this._disposeView();
      return;
    }
    // Retention follows the current destination
    if (this._retainedId !== target.puzzleId) {
      if (this._retainedId) PortalManager.releaseArea(this._retainedId);
      this._retainedId = target.puzzleId;
      PortalManager.retainArea(this._retainedId);
    }
    const destArea = PortalManager.getArea(target.puzzleId);
    const key =
      destArea &&
      `${target.puzzleId}:${target.position.x},${target.position.y},${target.position.z}:` +
        `${destArea === gameState.activeArea ? 'main' : 'own'}`;
    if (this._view && this._viewKey !== key) this._disposeView();
    if (!this._view && destArea) {
      const pad = this._pad.entity;
      this._view = PortalManager.createCleanserGateView(pad, target, this._pad.facing);
      this._viewKey = this._view ? key : null;
    }
    if (this._view) {
      this._view.setVisible(this._pad.area === gameState.activeArea);
    }
  }

  _disposeView() {
    if (!this._view) return;
    this._view.dispose();
    this._view = null;
    this._viewKey = null;
  }

  _enterAiming() {
    this._phantom = CleansingTile.buildTileMesh({ x: 0, y: 0, z: 0 });
    this._phantom.material.opacity = PHANTOM_OPACITY;
    if (this._scene) this._scene.add(this._phantom);
    this._state = 'aiming';
    this._updatePhantom();
  }

  /** Track the spot two tiles ahead of the player, tinting by validity. */
  _updatePhantom() {
    this._spot = this._aimSpot();
    if (!this._phantom) return;
    if (!this._spot) {
      this._phantom.visible = false;
      return;
    }
    this._phantom.visible = true;
    this._phantom.position.set(this._spot.x, this._spot.y + 0.08, this._spot.z);
    this._phantom.material.color.setHex(
      this._spot.valid ? CleansingTile.BASE_COLOR : INVALID_COLOR
    );
    this._phantom.material.emissive.setHex(
      this._spot.valid ? CleansingTile.BASE_EMISSIVE : INVALID_EMISSIVE
    );
  }

  /**
   * Where the phantom sits: DEPLOY_DISTANCE along the camera heading,
   * dropped onto the nearest walkable level of that cell (reached from the
   * player's own layer). Invalid over walls, gates, fountains, cleansers,
   * ramps, or off-grid.
   */
  _aimSpot() {
    const area = gameState.activeArea;
    if (!area || !area.elevationGrid) return null;
    const { position, elevation } = gameState.player;
    // The EFFECTIVE camera heading — viewCenter plus the live mouse-look
    // offset — so the phantom answers the camera, not just the body.
    const [yaw] = CameraController.getView(gameState);
    const x = position.x - Math.sin(yaw) * DEPLOY_DISTANCE;
    const z = position.z - Math.cos(yaw) * DEPLOY_DISTANCE;

    const grid = area.elevationGrid.worldToGrid(x, z);
    const { gridSize } = area.elevationGrid;
    if (grid.x < 0 || grid.x >= gridSize || grid.z < 0 || grid.z >= gridSize) {
      return { x, y: 0, z, valid: false };
    }
    const level = area.elevationGrid.nearestLevel(grid.x, grid.z, elevation);
    const y = level * ELEVATION_HEIGHT;

    const onRamp = Boolean(area.elevationGrid.getRamp(grid.x, grid.z));
    const cellX = grid.x * WORLD_SCALE;
    const cellZ = grid.z * WORLD_SCALE;
    const blocked = area.entities.some(
      (e) =>
        (e.type === 'wall' ||
          e.type === 'gate' ||
          e.type === 'fountain' ||
          e.type === 'cleanser') &&
        Math.abs(e.position.x - cellX) < WORLD_SCALE / 2 &&
        Math.abs(e.position.z - cellZ) < WORLD_SCALE / 2 &&
        Math.abs(e.position.y - y) < ELEVATION_HEIGHT / 2
    );
    return { x, y, z, valid: !onRamp && !blocked };
  }

  /** Make the phantom real. Refused (silently, red) on an invalid spot. */
  _deploy() {
    if (!this._spot || !this._spot.valid) return;
    const area = gameState.activeArea;
    const pad = new CleanserGatePad({ x: this._spot.x, y: this._spot.y, z: this._spot.z });
    area.entityManager.add(pad);
    // The see-through panel faces back at the deployer: cardinal direction
    // of the player from the pad, dominant axis.
    const dx = gameState.player.position.x - this._spot.x;
    const dz = gameState.player.position.z - this._spot.z;
    let facing;
    if (Math.abs(dx) > Math.abs(dz)) facing = dx > 0 ? 'east' : 'west';
    else facing = dz > 0 ? 'south' : 'north';
    this._pad = { area, id: pad.id, entity: pad, facing };
    this._removePhantom();
    this._state = 'deployed';
    // The hint stays: the remaining lesson is "g again to cancel" — it
    // retires when the pad is removed (or used). See _removePad / update.
    this._syncView();
  }

  _removePad() {
    if (this._pad && this._pad.area.entityManager.get(this._pad.id)) {
      this._pad.area.entityManager.remove(this._pad.id);
      // Cancelling a deployed gate is the last step of the lesson
      // ("g again to cancel", interim ruling 2026-07-18).
      HintMemory.retire('deploy');
    }
    this._clearDeployment();
  }

  _removePhantom() {
    if (!this._phantom) return;
    if (this._scene) this._scene.remove(this._phantom);
    this._phantom.geometry.dispose();
    this._phantom.material.dispose();
    this._phantom = null;
    this._spot = null;
  }
}

// Singleton (mirrors ClapManager / ListeningManager / PortalManager)
const deployManager = new DeployManager();
export default deployManager;
