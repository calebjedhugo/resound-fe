/**
 * WorldMemory — the world remembers everything that happened in it, across
 * area pruning (ruled 2026-11-23; it grew out of the pole's CreatureRegistry).
 *
 * The world keeps only the active area and its neighbours live; any other
 * area is PRUNED (PortalManager._afterActiveChange) and built again from its
 * puzzle JSON on the next visit (PuzzleLoader.buildArea). Without a memory a
 * revisit would reset it: lured creatures back where they began, opened
 * doors locked, a fountain dry again. So, per puzzle id:
 *  - STATE: what each of the puzzle's own entities (by its index in the
 *    puzzle's `entities`) had become when its area was pruned — whatever its
 *    `saveState()` returns (a creature: where it stands, its layer, its
 *    drift, its voice and the phase it sings on; a gate: open, a close
 *    pending, its openings, its last completion; a fountain: activated).
 *    buildArea hands it back to the entity it builds (`restoreState`; a
 *    creature is built from it).
 *  - ABSORBED: the puzzle's own creatures the pole has taken. buildArea
 *    skips them — a creature in a slot never also stands where it began.
 *  - RELEASED: creatures the pole let out here, each a record of the same
 *    shape as a creature's saved state (its spec, where it stands...).
 *    buildArea builds them again.
 * A creature taken again from where it was released is forgotten there. A
 * new world (PortalManager.reset) remembers nothing.
 *
 * A creature's song stays in time across a prune: it is rebuilt singing on
 * the phase it had (Creature `phase`: its next sing beat comes from the ONE
 * world clock, never from the moment of the rebuild).
 *
 * The waystone the player last stood on is remembered by place, world-wide
 * (gameState.activeWaystone), so it needs nothing here. What the memory
 * costs: a snapshot reads each entity of the area once; a rebuild looks each
 * up once (measured 2026-11-23: see DESIGN.md).
 */
let nextKey = 1;
const states = new Map(); // puzzleId -> Map<entity index, saved state>
const absorbed = new Map(); // puzzleId -> Set<entity index>
const released = new Map(); // puzzleId -> Map<key, saved state>

const WorldMemory = {
  /**
   * An entity of `puzzleId` built from its JSON: remember where it came from.
   * @param {Entity} entity
   * @param {string} puzzleId
   * @param {number} index - its index in the puzzle's `entities`
   */
  tagOrigin(entity, puzzleId, index) {
    entity.origin = { puzzleId, index };
  },

  /**
   * What the puzzle's entity at `index` had become when its area was last
   * pruned, or null (never pruned: it starts as its JSON says).
   * @returns {?object}
   */
  stateOf(puzzleId, index) {
    const here = states.get(puzzleId);
    return (here && here.get(index)) || null;
  },

  /** Is the puzzle's creature at `index` in a slot (or out somewhere else)? */
  isAbsorbed(puzzleId, index) {
    const taken = absorbed.get(puzzleId);
    return Boolean(taken && taken.has(index));
  },

  /**
   * The pole took `creature`: it must not come back where it was.
   * @param {Creature} creature
   */
  absorb(creature) {
    if (creature.origin) {
      const { puzzleId, index } = creature.origin;
      if (!absorbed.has(puzzleId)) absorbed.set(puzzleId, new Set());
      absorbed.get(puzzleId).add(index);
      const here = states.get(puzzleId);
      if (here) here.delete(index);
    }
    if (creature.releasedAs) {
      const { puzzleId, key } = creature.releasedAs;
      const here = released.get(puzzleId);
      if (here) here.delete(key);
      creature.releasedAs = null;
    }
  },

  /**
   * The pole let `creature` out in `puzzleId`: it lives there from now on,
   * across prunes.
   * @param {Creature} creature
   * @param {string} puzzleId
   */
  release(creature, puzzleId) {
    if (!puzzleId) return;
    const key = nextKey;
    nextKey += 1;
    if (!released.has(puzzleId)) released.set(puzzleId, new Map());
    released.get(puzzleId).set(key, creature.saveState());
    creature.releasedAs = { puzzleId, key };
  },

  /**
   * The creatures released in `puzzleId`, for its build: each `{key, state}`.
   * @param {string} puzzleId
   * @returns {Array<{key: number, state: object}>}
   */
  releasedIn(puzzleId) {
    const here = released.get(puzzleId);
    if (!here) return [];
    return [...here].map(([key, state]) => ({ key, state }));
  },

  /**
   * A built released creature answers to its record again (buildArea).
   * @param {Creature} creature
   * @param {string} puzzleId
   * @param {number} key
   */
  tagReleased(creature, puzzleId, key) {
    creature.releasedAs = { puzzleId, key };
  },

  /**
   * An area is about to be pruned: remember what each of its entities has
   * become (see the header). A creature on the pole is the pole's (its
   * absorb is already remembered; one being let out keeps its release
   * record).
   * @param {Area} area
   */
  snapshot(area) {
    if (!area || !area.entities) return;
    for (const entity of area.entities) {
      if (typeof entity.saveState === 'function' && !entity.held) {
        if (entity.releasedAs) {
          const here = released.get(entity.releasedAs.puzzleId);
          if (here && here.has(entity.releasedAs.key)) {
            here.set(entity.releasedAs.key, entity.saveState());
          }
        } else if (entity.origin && entity.origin.puzzleId === area.id) {
          const { puzzleId, index } = entity.origin;
          if (!states.has(puzzleId)) states.set(puzzleId, new Map());
          states.get(puzzleId).set(index, entity.saveState());
        }
      }
    }
  },

  /** A new world: nothing has happened yet. */
  reset() {
    states.clear();
    absorbed.clear();
    released.clear();
  },
};

export default WorldMemory;
