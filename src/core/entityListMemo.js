/**
 * memoizeOnEntityList — something derived from an entity list (an Area's
 * `entities`, kept by its EntityManager), cached per list and derived again
 * only when the list's CONTENTS change.
 *
 * Per-frame paths (collision queries, a creature listening) want a few
 * kinds of entity out of lists that are mostly walls. Filtering on every
 * call reads every entity's fields; checking the cache compares references
 * only (entry by entry, so an add, a remove, or one of each between two
 * calls is always seen).
 *
 * A derivation may rely only on what never changes about an entity once it
 * is in a list — its type, its instrument, the position of something that
 * never moves (a wall, a gate, a fountain) — and must leave anything that
 * changes (a gate's open state, a creature's position) to be read per use.
 *
 * @param {function(object[]): *} derive - from a copy of the list
 * @returns {function(object[]): *} entities -> the (cached) derivation
 */
export default function memoizeOnEntityList(derive) {
  const cache = new WeakMap(); // entity list -> { snapshot, value }
  return (entities) => {
    const entry = cache.get(entities);
    if (entry && sameEntries(entry.snapshot, entities)) return entry.value;
    const snapshot = entities.slice();
    const value = derive(snapshot);
    cache.set(entities, { snapshot, value });
    return value;
  };
}

function sameEntries(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
