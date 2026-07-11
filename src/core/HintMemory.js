/**
 * HintMemory - which contextual key hints are ACTIVE, and which the player
 * has performed THIS VISIT.
 *
 * Hints are driven by the PUZZLE (ruled 2026-07-11, superseding the
 * permanent localStorage retirement): a puzzle declares what it teaches
 * (`teaches: ["move", "record", ...]` in its JSON — see puzzles/schema.md)
 * and those hints are live in that puzzle regardless of what the player has
 * ever done before. A hint retires when the player performs its action, but
 * only for the CURRENT VISIT: re-entering the puzzle (world entry or a
 * doorway crossing back in) re-arms its hints. A puzzle with no `teaches`
 * field keeps EVERY hint eligible (dev/legacy levels teach on every visit).
 */
class HintMemory {
  static _teaches = null; // null = every hint eligible

  static _performed = new Set();

  /**
   * A puzzle visit begins: activate ITS hints, forget this-visit history.
   * Called on world entry and on every doorway crossing.
   * @param {?string[]} teaches - the puzzle's `teaches` list (undefined/null
   *   = all hints eligible)
   */
  static arm(teaches) {
    this._teaches = Array.isArray(teaches) ? teaches.slice() : null;
    this._performed = new Set();
  }

  static isRetired(hintId) {
    if (this._teaches && !this._teaches.includes(hintId)) return true;
    return this._performed.has(hintId);
  }

  static retire(hintId) {
    this._performed.add(hintId);
  }

  static reset() {
    this._teaches = null;
    this._performed = new Set();
  }
}

export default HintMemory;
