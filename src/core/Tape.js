import gameState from 'core/GameState';
import HintMemory from 'core/HintMemory';
import { TAPE_SLOT_CAP, TAPE_DELETE_HOLD_MS } from 'core/constants';

/**
 * Tape - the dynamic slot strip (ruled 2026-07-11).
 *
 * The inventory is a growable TAPE of takes, not a fixed key ring:
 *   - the game boots with ONE slot; ArrowRight moves the cursor, and pressed
 *     on a FILLED last slot it appends a fresh empty one (progressive
 *     disclosure — new slots exist only once the previous one is filled)
 *   - R records into the cursor slot, in place (re-recording a middle slot
 *     is how a wrong note gets fixed without rebuilding the tape)
 *   - Space performs the WHOLE tape, concatenated (PlaybackManager)
 *   - holding the delete key removes the cursor slot: it fades over
 *     TAPE_DELETE_HOLD_MS and is permanently gone when the fade completes;
 *     releasing early cancels, and the key must be released before another
 *     delete can begin
 *
 * Deletion state lives on gameState.player.tapeDelete ({index, startedAt} or
 * null) so the UI can render the fade; `update()` (called every frame from
 * the main loop) completes holds that have run their course.
 */
class Tape {
  // The delete key is still physically down after a completed delete —
  // require a release before arming another one.
  static _deleteLatched = false;

  /** Move the cursor left (no wraparound — the tape has a beginning). */
  static left() {
    const { player } = gameState;
    player.activeSlot = Math.max(0, player.activeSlot - 1);
  }

  /**
   * Move the cursor right. On the last slot: append a fresh empty slot IF
   * the last one is filled (and the cap allows) — this is the only way the
   * tape grows.
   */
  static right() {
    const { player } = gameState;
    const last = player.inventory.length - 1;
    if (player.activeSlot < last) {
      player.activeSlot += 1;
      return;
    }
    if (player.inventory[last] && player.inventory.length < TAPE_SLOT_CAP) {
      player.inventory.push(null);
      player.activeSlot = player.inventory.length - 1;
    }
  }

  /** The delete key went down: arm a hold on the cursor slot. */
  static deleteDown() {
    const { player } = gameState;
    if (this._deleteLatched || player.tapeDelete) return;
    player.tapeDelete = { index: player.activeSlot, startedAt: Date.now() };
  }

  /** The delete key came up: cancel an unfinished hold, release the latch. */
  static deleteUp() {
    gameState.player.tapeDelete = null;
    this._deleteLatched = false;
  }

  /**
   * Per-frame: complete a delete hold that has fully faded. The slot is
   * spliced out (the remaining slots close ranks); a tape never shrinks to
   * nothing — deleting the sole slot leaves one empty slot.
   */
  static update() {
    const { player } = gameState;
    const hold = player.tapeDelete;
    if (!hold) return;
    if (Date.now() - hold.startedAt < TAPE_DELETE_HOLD_MS) return;

    if (hold.index < player.inventory.length) {
      player.inventory.splice(hold.index, 1);
    }
    if (player.inventory.length === 0) player.inventory.push(null);
    player.activeSlot = Math.min(player.activeSlot, player.inventory.length - 1);
    player.tapeDelete = null;
    this._deleteLatched = true;
    HintMemory.retire('delete');
  }

  /** Fade progress of the pending delete (0..1), or 0 when idle. */
  static deleteProgress() {
    const hold = gameState.player.tapeDelete;
    if (!hold) return 0;
    return Math.min(1, (Date.now() - hold.startedAt) / TAPE_DELETE_HOLD_MS);
  }

  /** Reset transient state (level change / new context). */
  static reset() {
    gameState.player.tapeDelete = null;
    this._deleteLatched = false;
  }
}

export default Tape;
