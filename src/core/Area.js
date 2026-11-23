/**
 * Area — one puzzle's worth of live world (portal stage 3).
 *
 * Linked puzzles are one world made of areas: the ACTIVE area is the one the
 * player stands in; areas adjacent through linked gates are loaded and FULLY
 * LIVE (their creatures move, sing, and are audible through the doorway).
 * Everything that used to be "the" world state — the entity set, the
 * elevation grid, the scene content — lives on an Area so any number of
 * puzzles can simulate side by side without touching each other:
 *
 * - `group` holds the area's meshes. The active area's group sits in the
 *   main render scene; a neighbor's group sits in its own `scene`, which is
 *   drawn only through open doorways (core/PortalView).
 * - `entityManager` / `entities` are this area's entity set. Nothing outside
 *   the area iterates it by accident: `gameState.entities` delegates to the
 *   ACTIVE area only, and cross-area interactions (sound, forces) go through
 *   the doorway model in PortalManager.
 * - `elevationGrid` scopes collision/elevation to this area's floor plan.
 *
 * Areas are dumb containers: building one from puzzle JSON stays in
 * PuzzleLoader (which knows the schema), and cross-area behavior stays in
 * PortalManager (which knows the door graph).
 */
import * as THREE from 'three';
import EntityManager from 'entities/EntityManager';
import { AreaLight, createSky } from 'entities/EnvironmentLook';
import { wallHiddenBy } from 'core/portalMath';

// What a wall-hide spec slot holds while it hides nothing
const HIDE_NOTHING = { x: 0, z: 0, outX: 0, outZ: 0, latEye: 0 };

class Area {
  /**
   * @param {?object} puzzleData - validated puzzle JSON (null = empty
   *   sandbox area, used by the test harness before a puzzle loads)
   */
  constructor(puzzleData = null) {
    this.puzzle = puzzleData;
    this.id = puzzleData ? puzzleData.id : null;
    // Kept in sync by this.entityManager, its ONLY writer: per-frame memos
    // trust its version counter (core/entityListMemo)
    this.entities = [];

    // All of the area's world content. Reparented into the main scene while
    // this area is active; lives in this.scene otherwise so portal passes
    // can render the area live.
    this.group = new THREE.Group();

    // Self-contained render scene with the same lighting as the live world
    // (main.js) so the neighbor seen through a doorway reads identically.
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    this.scene.add(directionalLight);
    this.scene.add(this.group);
    // The sky (entities/EnvironmentLook) travels with the area's content:
    // the main view draws the active area's, a door pass the area beyond's
    this.group.add(createSky());
    // The creature light its floor and walls show (refreshed in update)
    this.light = new AreaLight();

    this.entityManager = new EntityManager(this.group, this);
    this.elevationGrid = null;

    // ONE InstancedMesh holding every wall (PuzzleLoader.buildArea): static
    // scenery drawn in a single call instead of one per wall. A door pass
    // hides its eye-side walls through it (hideWalls)
    this.staticWalls = null;
    this._wallHides = [HIDE_NOTHING, HIDE_NOTHING];

    // Materials many of this area's meshes share (its walls': flagged
    // userData.shared, so no single entity frees them) — freed with the area
    this.ownedMaterials = [];
  }

  /** Install the area's static-wall batch mesh (PuzzleLoader.buildArea). */
  setStaticWalls(batch) {
    this.staticWalls = batch;
    this.group.add(batch);
  }

  /**
   * Hide, for the door pass about to draw this area, the walls either
   * wall-hide spec covers (portalMath.wallHiddenBy; PortalView.wallHide);
   * `hideWalls(null, null)` shows them all again. The batch's vertex shader
   * leaves those instances out.
   * @param {?object} spec
   * @param {?object} [extra] - the door's approach panel's spec
   */
  hideWalls(spec, extra = null) {
    this._wallHides[0] = spec || HIDE_NOTHING;
    this._wallHides[1] = extra || HIDE_NOTHING;
    if (!this.staticWalls) return;
    const u = this.staticWalls.material.uniforms;
    writeHide(u.uHideA, u.uHideLatA, this._wallHides[0]);
    writeHide(u.uHideB, u.uHideLatB, this._wallHides[1]);
  }

  /** Is `wall` (one of this area's) left out of the pass drawing now? */
  isWallHidden(wall) {
    const { x, z } = wall.position;
    return this._wallHides.some((spec) => wallHiddenBy(spec, x, z));
  }

  /** Advance this area's simulation by one tick. */
  update(deltaTime) {
    this.entityManager.update(deltaTime);
    this.light.update(this.entities);
  }

  /** Tear down every entity (meshes, listeners, instruments). */
  dispose() {
    this.entityManager.clear();
    if (this.staticWalls) {
      this.group.remove(this.staticWalls);
      // Frees the instance buffers only — the geometry is Wall's shared
      // static; the material is in ownedMaterials (freed below)
      this.staticWalls.dispose();
      this.staticWalls = null;
    }
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedMaterials = [];
  }
}

/** A wall-hide spec into the wall material's uniforms. */
function writeHide(window, lat, spec) {
  const w = window.value;
  w[0] = spec.x;
  w[1] = spec.z;
  w[2] = spec.outX;
  w[3] = spec.outZ;
  lat.value = spec.latEye; // eslint-disable-line no-param-reassign
}

export default Area;
