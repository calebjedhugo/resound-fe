/**
 * Gate id helpers
 *
 * Gates carry a STABLE id (`data.gateId`, serialized as the gate's root `id`)
 * so other puzzles can reference them in cross-puzzle links
 * (`link: { puzzleId, gateId }`). Ids are unique within a puzzle,
 * auto-assigned on placement/import, and renameable in the property panel.
 */

const GATE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Doorway plane orientations (which face of the gate cell is the door). */
export const GATE_FACINGS = ['north', 'south', 'east', 'west'];

/** True if `id` is a usable gate id (non-empty slug, same charset as puzzle ids). */
export function isValidGateId(id) {
  return typeof id === 'string' && GATE_ID_PATTERN.test(id);
}

/** The set of gate ids already used by the given model entities. */
export function usedGateIds(entities) {
  const ids = new Set();
  for (const e of entities) {
    if (e.type === 'gate' && e.data && isValidGateId(e.data.gateId)) {
      ids.add(e.data.gateId);
    }
  }
  return ids;
}

/**
 * First free `gate-N` id not present in `used` (a Set or array of ids).
 * @param {Set<string>|string[]} used
 * @returns {string}
 */
export function nextGateId(used) {
  const taken = used instanceof Set ? used : new Set(used);
  let n = 1;
  while (taken.has(`gate-${n}`)) n += 1;
  return `gate-${n}`;
}
