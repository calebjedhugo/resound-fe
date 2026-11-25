/**
 * Cutaway — the editor's see-inside view (designer, 2026-11-25: "We also
 * need to be able to see things inside of containers"). One view toggle,
 * three modes (X, the Options menu, L2 + Share; remembered per browser,
 * io/lookPreference):
 *
 * - 'full': everything drawn whole (the editor before this).
 * - 'storey': the STOREY CUT — every storey above the active one is a ghost
 *   (floors, walls, entities: a faint screen door with pale edges); the
 *   active storey and below draw solid (a wall's top, floor one storey up,
 *   stays with its wall).
 * - 'cutaway' (default): that, and on the active storey the walls and gates
 *   on the camera's side of the CURSOR are ghosts too, following the orbit
 *   (entities/CutawayLook `cellGhosted` has the rule).
 *
 * Each frame the editor draws, `update` works out the cut from the active
 * storey, the cursor and the camera and writes it into the shared uniforms
 * the game's floor and wall shaders read (CutawayLook CUT_UNIFORMS); the
 * looks' entities are told one by one (`ghosts`: GameLookLayer.applyCut,
 * EntityPlacer.applyCut). Picking asks `ghosts` too, so a click goes
 * through a ghost to what is inside. While `suspended` (Play: the game is
 * always drawn whole) the cut is off.
 */
import { gridToWorld } from 'editor/viewport/gridUtils';
import { CUT_VIEWS, loadCut, saveCut } from 'editor/io/lookPreference';
import { OVERHEAD_DISTANCE, clearCut, entityGhosted, setCut } from 'entities/CutawayLook';

// The readout's name for each mode (the bottom-left HUD, the toasts)
export const CUT_LABELS = {
  full: 'Full view',
  storey: 'Storey cut',
  cutaway: 'Cutaway',
};

const OFF = { mode: 0, storey: 0, centre: { x: 0, z: 0 }, view: { x: 0, z: 0 } };

export default class Cutaway {
  constructor() {
    this._mode = loadCut();
    this._suspended = false;
    this._state = OFF;
  }

  /** 'full' | 'storey' | 'cutaway' */
  get mode() {
    return this._mode;
  }

  get label() {
    return CUT_LABELS[this._mode];
  }

  /** @param {'full'|'storey'|'cutaway'} mode - remembered for the next visit */
  setMode(mode) {
    if (!CUT_VIEWS.includes(mode)) return;
    this._mode = mode;
    saveCut(mode);
  }

  /** The next mode: full → storey cut → cutaway → full. */
  cycle() {
    const next = CUT_VIEWS[(CUT_VIEWS.indexOf(this._mode) + 1) % CUT_VIEWS.length];
    this.setMode(next);
    return next;
  }

  /** Play: everything whole until `resume`. */
  suspend() {
    this._suspended = true;
    this._state = OFF;
    clearCut();
  }

  resume() {
    this._suspended = false;
  }

  get suspended() {
    return this._suspended;
  }

  /**
   * Work out the cut for this frame and hand it to every material.
   * @param {{storey: number, cursor: {x: number, z: number}, camera: {position}}} view
   * @returns {object} the cut ({mode, storey, centre, view})
   */
  update({ storey, cursor, camera }) {
    if (this._suspended) return this._state;
    const mode = CUT_VIEWS.indexOf(this._mode);
    // The horizontal direction from the cursor toward the eye (none when
    // the camera is overhead: nothing stands between them)
    const at = gridToWorld(cursor.x, cursor.z);
    const dx = camera.position.x - at.x;
    const dz = camera.position.z - at.z;
    const length = Math.hypot(dx, dz);
    const view = length > OVERHEAD_DISTANCE ? { x: dx / length, z: dz / length } : { x: 0, z: 0 };
    this._state = { mode, storey, centre: { x: cursor.x, z: cursor.z }, view };
    setCut(this._state);
    return this._state;
  }

  /** The cut of the last update. */
  get state() {
    return this._state;
  }

  /**
   * Whether an entity ({type, x, y, z}; the spawn as type 'player') is a
   * ghost under the last update's cut: drawn faint, and never picked.
   */
  ghosts(entity) {
    return entityGhosted(entity, this._state);
  }
}
