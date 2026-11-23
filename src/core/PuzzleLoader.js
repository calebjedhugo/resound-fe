import Creature from 'entities/Creature';
import Gate from 'entities/Gate';
import Fountain from 'entities/Fountain';
import Wall from 'entities/Wall';
import Ramp from 'entities/Ramp';
import Floor from 'entities/Floor';
import Waystone from 'entities/Waystone';
import { WORLD_SCALE, ELEVATION_HEIGHT, entityTypeOf } from 'core/constants';
import Area from 'core/Area';
import AudioPrewarm from 'core/AudioPrewarm';
import WorldMemory from 'core/WorldMemory';
import ElevationGrid from 'core/ElevationGrid';
import runInIdleSlices from 'core/idleSlices';
import { spawnEye } from 'core/playerView';
import NotationDisplay from 'ui/NotationDisplay';
import { syncCameraToPlayer } from 'resoundModules/playerControls/motion/motion';

// Puzzle files fetched for the current world: id -> promise of the validated
// JSON. A world loads the same files again and again — every crossing loads
// the new neighbors, usually areas pruned a few crossings back — and a
// crossing can race a neighbor load still in flight; both now share one
// request. Cleared at every world entry (clearCache, main.js startPuzzle):
// the editor saves puzzles through /api/puzzles while a game tab stays
// open, and a new world must start from the files as they are now.
const fetched = new Map();

class PuzzleLoader {
  /**
   * Fetch and validate a puzzle file, once per world (see `fetched`). Each
   * call resolves to its OWN copy, as a fresh fetch did: areas built from
   * the same file never share data. A failed load is not remembered.
   * @returns {Promise<object>} validated puzzle JSON
   */
  static load(puzzleId) {
    let pending = fetched.get(puzzleId);
    if (!pending) {
      pending = this._fetch(puzzleId);
      fetched.set(puzzleId, pending);
      pending.catch(() => {
        if (fetched.get(puzzleId) === pending) fetched.delete(puzzleId);
      });
    }
    return pending.then((data) => JSON.parse(JSON.stringify(data)));
  }

  /** Forget every fetched puzzle file (a new world re-reads them). */
  static clearCache() {
    fetched.clear();
  }

  static async _fetch(puzzleId) {
    try {
      const response = await fetch(`/puzzles/${puzzleId}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load puzzle ${puzzleId}: ${response.statusText}`);
      }
      const data = await response.json();
      return this.validate(data);
    } catch (error) {
      console.error('Error loading puzzle:', error);
      throw error;
    }
  }

  static validate(puzzleData) {
    // Basic validation
    if (!puzzleData.id) throw new Error('Puzzle missing id');
    if (!puzzleData.name) throw new Error('Puzzle missing name');
    if (!puzzleData.difficulty) throw new Error('Puzzle missing difficulty');
    if (!puzzleData.gridSize) throw new Error('Puzzle missing gridSize');
    if (!puzzleData.playerStart) throw new Error('Puzzle missing playerStart');
    if (!Array.isArray(puzzleData.entities)) throw new Error('Puzzle entities must be an array');
    if (
      puzzleData.teaches !== undefined &&
      (!Array.isArray(puzzleData.teaches) || puzzleData.teaches.some((t) => typeof t !== 'string'))
    ) {
      throw new Error('Puzzle teaches must be an array of hint ids');
    }

    return this.normalize(puzzleData);
  }

  /**
   * Give every entity its type's current name, in place (an old `cleanser`
   * is a `waystone`: constants ENTITY_TYPE_ALIASES), so nothing past the
   * loader ever sees a retired name. Idempotent.
   * @returns {object} puzzleData
   */
  static normalize(puzzleData) {
    for (const entity of puzzleData.entities || []) {
      entity.type = entityTypeOf(entity.type);
    }
    return puzzleData;
  }

  /**
   * World-space positions of the auto-generated perimeter walls: rows/cols
   * -1 and gridSize, just OUTSIDE the grid so every grid cell is playable
   * (walls on edge cells used to trap entities placed there). Shared with
   * the portal view so a neighbor seen through a doorway has its walls.
   */
  static perimeterWallPositions(gridSize) {
    return Wall.perimeterPositions(gridSize);
  }

  /**
   * Build a fully-populated LIVE Area from validated puzzle JSON (portal
   * stage 3). No global side effects: the caller (PortalManager, which owns
   * the set of loaded areas) decides whether this area is the player's or a
   * neighbor simulating behind a doorway. Player placement is separate —
   * see placePlayerAtStart.
   * @returns {Area}
   */
  static buildArea(puzzleData) {
    this.normalize(puzzleData);
    const area = new Area(puzzleData);
    const { entityManager } = area;

    // Build elevation grid
    const elevationGrid = new ElevationGrid(puzzleData.gridSize);
    elevationGrid.applyFloors(puzzleData.floors || []);
    area.elevationGrid = elevationGrid;

    // The whole floor (ground, raised storeys, their cliff edges) is one
    // mesh, lit by the area's creatures. A cliff edge is any storey edge
    // you can't walk on past: not where storeys meet, nor a ramp's ends,
    // nor a wall's foot
    const ramps = puzzleData.entities
      .filter((e) => e.type === 'ramp')
      .map((e) => ({ ...e.position, direction: e.direction || 'north' }));
    const walls = puzzleData.entities.filter((e) => e.type === 'wall').map((e) => e.position);
    const floor = new Floor(puzzleData.gridSize, puzzleData.floors || [], {
      light: area.light,
      elevationGrid,
      ramps,
      walls,
    });
    entityManager.add(floor);

    // Static-wall batching: an area's walls are identical immovable boxes,
    // but each one as its own THREE.Mesh made long sightlines submit
    // hundreds of draw calls (387 walls ≈ 11.7ms/frame in poc-return,
    // multiplied by every open portal pass — profiled 2026-07-16). So EVERY
    // wall is an instance of ONE InstancedMesh, added to the group below; a
    // door pass hides its eye-side walls per instance (Area.hideWalls).
    // Walls near doors used to stay meshes of their own for that: 74 of The
    // Star's 106, ~110 draws a frame with every door open (2026-11-22).
    const wallPositions = [];
    const addWall = (position) => {
      entityManager.add(new Wall(position, { batched: true }));
      wallPositions.push(position);
    };

    for (const position of this.perimeterWallPositions(puzzleData.gridSize)) {
      addWall(position);
    }

    // Create entities
    puzzleData.entities.forEach((entityData, index) => {
      let entity = null;

      // Scale the position from grid coordinates to world coordinates
      const scaledPosition = {
        x: entityData.position.x * WORLD_SCALE,
        y: entityData.position.y * ELEVATION_HEIGHT,
        z: entityData.position.z * WORLD_SCALE,
      };

      // What it had become when this area was last pruned (core/WorldMemory)
      const saved = WorldMemory.stateOf(puzzleData.id, index);

      try {
        switch (entityData.type) {
          case 'creature':
            // One the pole has taken stays taken; one remembered is built
            // where it stood, singing on its own phase, in its own voice
            if (!WorldMemory.isAbsorbed(puzzleData.id, index)) {
              entity = saved
                ? new Creature({ ...saved.position }, { ...entityData.data, ...saved.spec })
                : new Creature(scaledPosition, entityData.data || {});
            }
            break;
          case 'gate':
            entity = new Gate(scaledPosition, {
              song: entityData.song,
              timeSignature: puzzleData.timeSignature,
              keySignature: puzzleData.keySignature,
              // Portal identity: stable id, doorway facing, and (optionally)
              // the cross-puzzle link this gate is a door to
              id: entityData.id,
              facing: entityData.facing,
              link: entityData.link,
              // Permanently-open face (one-way doors / escape hatches)
              alwaysOpen: entityData.alwaysOpen,
              // Arrival here ends the demo (thanks-for-playing overlay)
              ending: entityData.ending,
              gridPosition: entityData.position,
            });
            break;
          case 'fountain':
            entity = new Fountain(scaledPosition, {
              song: entityData.song,
              timeSignature: puzzleData.timeSignature,
              keySignature: puzzleData.keySignature,
            });
            break;
          case 'wall':
            addWall(scaledPosition);
            break;
          case 'waystone':
            entity = new Waystone(scaledPosition, entityData.data || {});
            break;
          case 'ramp':
            entity = new Ramp(scaledPosition, {
              direction: entityData.direction,
            });
            elevationGrid.registerRamp(entityData.position.x, entityData.position.z, entity);
            break;
          default:
            console.warn(`Unknown entity type: ${entityData.type}`);
        }
      } catch (error) {
        const { x, z } = entityData.position;
        throw new Error(`${entityData.type} at (${x}, ${z}): ${error.message}`);
      }

      if (entity) {
        WorldMemory.tagOrigin(entity, puzzleData.id, index);
        if (saved && typeof entity.restoreState === 'function') entity.restoreState(saved);
        entityManager.add(entity);
      }
    });

    // ...and every creature the pole let out here lives here again, where it
    // stood when the area was last pruned
    for (const { key, state } of WorldMemory.releasedIn(puzzleData.id)) {
      const creature = new Creature({ ...state.position }, state.spec);
      creature.restoreState(state);
      WorldMemory.tagReleased(creature, puzzleData.id, key);
      entityManager.add(creature);
    }

    if (wallPositions.length > 0) {
      // This area's own wall material: lit by its creatures, hidden per
      // pass by its doors (and freed with it: Area.dispose)
      const material = Wall.createBatchMaterial(area.light);
      area.ownedMaterials.push(material);
      area.setStaticWalls(Wall.buildBatch(wallPositions, material));
    }

    // Its creatures' voices, built in idle time
    AudioPrewarm.warmArea(area);

    return area;
  }

  /**
   * buildArea for an area not needed this instant (a neighbor loading
   * behind a doorway), without one long task: The Star took 23-29 ms in
   * one go, 26 of it engraving staves (measured 2026-10-17). First every
   * staff its gates and fountains show is engraved in idle slices
   * (NotationDisplay.prepare — shared, so a staff another area already
   * shows costs nothing), then the area assembles in ONE short idle task.
   * Assembly stays atomic on purpose: entities register with
   * ListeningManager and read the world clock as they are constructed, so
   * a half-built area would already hear notes and keep time. The promise
   * resolves inside that same task, so a caller registering the area in
   * `then` has it fully live before the next frame — never partially.
   * @param {object} puzzleData - validated puzzle JSON
   * @param {() => boolean} [stillWanted] - checked before every slice; once
   *   false the build stops (the world moved on) and resolves null
   * @returns {Promise<?Area>}
   */
  static async buildAreaWhenIdle(puzzleData, stillWanted = () => true) {
    const releases = [];
    try {
      // Exactly the staves buildArea's gates and fountains will ask for
      const engraveSteps = puzzleData.entities
        .filter((e) => (e.type === 'gate' || e.type === 'fountain') && e.song)
        .map((e) => () => {
          releases.push(
            NotationDisplay.prepare({
              song: e.song,
              timeSignature: puzzleData.timeSignature,
              keySignature: puzzleData.keySignature,
            })
          );
        });
      if (!(await runInIdleSlices(engraveSteps, stillWanted))) return null;

      let area = null;
      const assemble = () => {
        area = this.buildArea(puzzleData);
      };
      return (await runInIdleSlices([assemble], stillWanted)) ? area : null;
    } finally {
      // The area's own displays hold its staves now (or nobody needs them)
      for (const release of releases) release();
    }
  }

  /**
   * Put the player at a puzzle's start position (scaled, with eye height
   * above floor) and sync the camera. Used on world entry — doorway
   * crossings place the player at the partner gate instead.
   */
  static placePlayerAtStart(puzzleData, gameState) {
    // The eye at the spawn (core/playerView: the editor's Play glides onto it)
    gameState.player.position = spawnEye(puzzleData.playerStart);
    gameState.player.elevation = puzzleData.playerStart.y;
    syncCameraToPlayer(gameState.player.position);
  }

  static async loadPuzzleList() {
    try {
      const response = await fetch('/puzzles/manifest.json');
      if (!response.ok) {
        throw new Error(`Failed to load puzzle manifest: ${response.statusText}`);
      }
      const data = await response.json();
      return data.puzzles;
    } catch (error) {
      console.error('Error loading puzzle list:', error);
      // Fallback to empty list
      return [];
    }
  }
}

export default PuzzleLoader;
