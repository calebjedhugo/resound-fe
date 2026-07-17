/**
 * HintMemory - which contextual key hints are ACTIVE, and which the player
 * has already performed.
 *
 * Hints are driven by the PUZZLE (ruled 2026-07-11, superseding the
 * permanent localStorage retirement): a puzzle declares what it teaches
 * (`teaches: ["move", "record", ...]` in its JSON — see puzzles/schema.md)
 * and only those hints are live there. A hint retires the first time the
 * player performs its action, and STAYS retired for the whole session
 * (ruled 2026-07-16, superseding per-visit re-arming): each lesson happens
 * once — re-entering a puzzle does not re-show hints the player has already
 * acted on. A page reload starts a fresh session (no browser storage). A
 * puzzle with no `teaches` field keeps EVERY hint eligible (dev/legacy
 * levels).
 */
class HintMemory {
  static _teaches = null; // null = every hint eligible

  static _performed = new Set();

  /**
   * A puzzle visit begins: activate ITS hints. Performed-hint history is
   * session-wide and survives this. Called on world entry and on every
   * doorway crossing.
   * @param {?string[]} teaches - the puzzle's `teaches` list (undefined/null
   *   = all hints eligible)
   */
  static arm(teaches) {
    this._teaches = Array.isArray(teaches) ? teaches.slice() : null;
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
