/**
 * CreatureRegistry — which creatures the pole has moved, per puzzle, so an
 * area rebuilt from its JSON neither duplicates nor loses one (ruled
 * 2026-11-23, core/AbsorbManager).
 *
 * The world keeps only the active area and its neighbours live; any other
 * area is PRUNED and built again from its puzzle JSON on the next visit
 * (PortalManager._afterActiveChange). So, per puzzle id:
 *  - ABSORBED: the puzzle's own creatures (by their index in the puzzle's
 *    `entities`) the pole has taken. PuzzleLoader.buildArea skips them — a
 *    creature in a slot never also stands where the puzzle put it.
 *  - RELEASED: creatures the pole let out here, each a spec (Creature.toSpec)
 *    and a position. buildArea builds them again; a prune first snapshots
 *    where each one stands and the phase it sings on (snapshot).
 * A creature taken again from where it was released is forgotten there. A
 * new world (PortalManager.reset) starts with nothing moved.
 */
let nextKey = 1;
const absorbed = new Map(); // puzzleId -> Set<entity index>
const released = new Map(); // puzzleId -> Map<key, {spec, position}>

const CreatureRegistry = {
  /**
   * A creature of `puzzleId` built from its JSON: remember where it came
   * from, so taking it can be remembered.
   * @param {Creature} creature
   * @param {string} puzzleId
   * @param {number} index - its index in the puzzle's `entities`
   */
  tagOrigin(creature, puzzleId, index) {
    creature.origin = { puzzleId, index };
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
   * @param {object} spec - what built it (Creature.toSpec)
   */
  release(creature, puzzleId, spec) {
    if (!puzzleId) return;
    const key = nextKey;
    nextKey += 1;
    if (!released.has(puzzleId)) released.set(puzzleId, new Map());
    released.get(puzzleId).set(key, { spec, position: { ...creature.position } });
    creature.releasedAs = { puzzleId, key };
  },

  /**
   * The creatures released in `puzzleId`, for its build: each a record
   * {key, spec, position}.
   * @param {string} puzzleId
   * @returns {Array<{key: number, spec: object, position: object}>}
   */
  releasedIn(puzzleId) {
    const here = released.get(puzzleId);
    if (!here) return [];
    return [...here].map(([key, { spec, position }]) => ({ key, spec, position }));
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
   * An area is about to be pruned: remember where each creature released
   * there stands now, and its spec as it is (its phase).
   * @param {Area} area
   */
  snapshot(area) {
    if (!area || !area.entities) return;
    for (const entity of area.entities) {
      if (entity.type === 'creature' && entity.releasedAs && !entity.held) {
        const here = released.get(entity.releasedAs.puzzleId);
        const record = here && here.get(entity.releasedAs.key);
        if (record) {
          record.position = { ...entity.position };
          record.spec = entity.toSpec();
        }
      }
    }
  },

  /** A new world: nothing moved yet. */
  reset() {
    absorbed.clear();
    released.clear();
  },
};

export default CreatureRegistry;
