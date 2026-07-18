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

class Area {
  /**
   * @param {?object} puzzleData - validated puzzle JSON (null = empty
   *   sandbox area, used by the test harness before a puzzle loads)
   */
  constructor(puzzleData = null) {
    this.puzzle = puzzleData;
    this.id = puzzleData ? puzzleData.id : null;
    this.entities = []; // kept in sync by this.entityManager

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

    this.entityManager = new EntityManager(this.group, this);
    this.elevationGrid = null;

    // ONE InstancedMesh holding every batched wall (PuzzleLoader.buildArea):
    // static scenery drawn in a single call instead of one per wall
    this.staticWalls = null;
  }

  /** Install the area's static-wall batch mesh (PuzzleLoader.buildArea). */
  setStaticWalls(batch) {
    this.staticWalls = batch;
    this.group.add(batch);
  }

  /** Advance this area's simulation by one tick. */
  update(deltaTime) {
    this.entityManager.update(deltaTime);
  }

  /** Tear down every entity (meshes, listeners, instruments). */
  dispose() {
    this.entityManager.clear();
    if (this.staticWalls) {
      this.group.remove(this.staticWalls);
      // Frees the instance buffers only — the geometry/material are Wall's
      // shared statics, still in use by every other area's walls
      this.staticWalls.dispose();
      this.staticWalls = null;
    }
  }
}

export default Area;
