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
 * A deployed gate looks like any other ACTIVATED gate: a box of
 * see-through portal panels — one PortalView per cardinal face, each
 * showing the live view of the active cleanser's cell and the room
 * beyond (the gold tile is visible THROUGH the gate, so the pad draws no
 * cleanser disc of its own). Each panel self-culls to the eye's side,
 * exactly like a door's window box. The destination area is retained
 * live (PortalManager.retainArea) while the gate exists, and the views
 * retarget if the player claims a different active cleanser.
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
    this._pad = null; // { area, id, entity } while deployed
    this._views = []; // the gate's see-through panels (one per face)
    this._viewKey = null; // what the current panels were built against
    this._viewTarget = null; // the active cleanser the panels point at
    this._retainedId = null; // destination area pinned live for the views
    // Visual clone of the destination cleanser tile under the gate — the
    // panel aperture can only paint past the window plane, so the tile in
    // the arrival cell would clip to a crescent; the mirror IS the "seen
    // through the gate" tile (same doctrine as door tile mirrors).
    this._tileMirror = null;
    this._tileMirrorGroup = null;
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
   * Render the gate's see-through panels (call from the game's
   * beforeRender, BEFORE PortalManager.renderPortals). Each panel skips
   * itself unless the eye is on its outward side and it's in view — the
   * same self-culling a door's window box does.
   *
   * Doors seen THROUGH the gate must themselves be see-through, and the
   * player's own door pass can't provide that: the gate's mapped eye
   * looks at faces the player camera may never see. So door views render
   * an extra pass here for the MAPPED eye (the pad->cleanser mapping is a
   * pure translation, shared by all four faces) before the panels sample
   * them. A destination in the ACTIVE area reuses the regular door pass
   * (re-run afterwards for the player's real eye — each surface shows its
   * last completed write); a NEIGHBOR destination gets its own doors
   * rendered via renderAreaPortals and hidden again after sampling, so
   * their mapped-eye textures never smear into other sightlines.
   */
  renderPortal(renderer, camera) {
    if (this._views.length === 0 || !this._pad) return;
    if (this._pad.area !== gameState.activeArea) return;
    let neighborDest = null;
    if (this._viewTarget) {
      const padPos = this._pad.entity.position;
      const t = this._viewTarget.position;
      const eye = {
        position: {
          x: camera.position.x + (t.x - padPos.x),
          y: camera.position.y + (t.y - padPos.y),
          z: camera.position.z + (t.z - padPos.z),
        },
      };
      const destArea = PortalManager.getArea(this._viewTarget.puzzleId);
      if (destArea && destArea !== gameState.activeArea) {
        neighborDest = destArea;
        PortalManager.renderAreaPortals(destArea, renderer, eye);
      } else {
        PortalManager.renderPortals(renderer, eye);
      }
    }
    // Track which faces actually drew; a face the eye never renders still
    // shows in door mirrors and must not freeze in time — refresh the
    // stalest one per frame (same doctrine as PortalManager's door faces).
    this._padFrame = (this._padFrame || 0) + 1;
    for (const view of this._views) {
      if (view.render(renderer, camera)) view._padFresh = this._padFrame;
    }
    const stale = this._views
      .filter((v) => this._padFrame - (v._padFresh || 0) > 15)
      .sort((a, b) => (a._padFresh || 0) - (b._padFresh || 0));
    if (stale.length > 0) {
      PortalManager.warmView(stale[0], renderer);
      stale[0]._padFresh = this._padFrame;
    }
    if (neighborDest) PortalManager.hideAreaPortals(neighborDest);
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
   * Keep the see-through panels matched to the world: the destination is
   * the CURRENT active cleanser (stepping on a new one retargets the
   * gate), its area must be live, and a destination in the active area
   * renders the main scene. Any mismatch rebuilds all four panels; hidden
   * whenever the gate isn't in the player's area (textures would be stale).
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
    if (this._views.length > 0 && this._viewKey !== key) this._disposeView();
    if (this._views.length === 0 && destArea) {
      // A box of windows, like any other activated gate: one panel per
      // cardinal face, each mapped so walking in from that side continues
      // seamlessly at the cleanser.
      this._views = PortalManager.createCleanserGateViews(this._pad.entity, target);
      this._viewKey = this._views.length > 0 ? key : null;
      this._viewTarget = this._views.length > 0 ? target : null;
      this._buildTileMirror(destArea, target);
    }
    const visible = this._pad.area === gameState.activeArea;
    for (const view of this._views) view.setVisible(visible);
  }

  /**
   * The destination cleanser, visible AT the gate: a clone of the real
   * tile's mesh (shared material — gold and pulse stay in sync, the
   * destination is live) sitting under the gate. The panel aperture only
   * paints past the window plane, so without this the tile in the arrival
   * cell clips to a far crescent (same fix as PortalManager's door tile
   * mirrors: the two cells are one place).
   */
  _buildTileMirror(destArea, target) {
    const tile = destArea.entityManager
      .getByType('cleanser')
      .find(
        (c) =>
          Math.abs(c.position.x - target.position.x) < 0.01 &&
          Math.abs(c.position.y - target.position.y) < 0.01 &&
          Math.abs(c.position.z - target.position.z) < 0.01
      );
    if (!tile || !tile.mesh) return;
    const padPos = this._pad.entity.position;
    const mirror = tile.mesh.clone(); // shares geometry + material
    const lift = tile.mesh.position.y - tile.position.y;
    mirror.position.set(padPos.x, padPos.y + lift, padPos.z);
    mirror._isCleanserMirror = true; // tag for tests/debugging
    this._pad.area.group.add(mirror);
    this._tileMirror = mirror;
    this._tileMirrorGroup = this._pad.area.group;
  }

  _disposeView() {
    for (const view of this._views) view.dispose();
    this._views = [];
    this._viewKey = null;
    this._viewTarget = null;
    if (this._tileMirror) {
      this._tileMirrorGroup.remove(this._tileMirror);
      this._tileMirror = null;
      this._tileMirrorGroup = null;
    }
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
    this._pad = { area, id: pad.id, entity: pad };
    this._removePhantom();
    this._state = 'deployed';
    // The hint stays: the remaining lesson is "g again to cancel" — it
    // retires when the gate is removed (or used). See _removePad / update.
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
