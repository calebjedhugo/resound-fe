import gameState from 'core/GameState';
import { TAPE_SLOT_CAP } from 'core/constants';

/**
 * Tape - the dynamic slot strip (ruled 2026-07-11; delete verb retired
 * 2026-07-12).
 *
 * The inventory is a growable TAPE of takes, not a fixed key ring:
 *   - the game boots with ONE slot; ArrowRight moves the cursor, and pressed
 *     on a FILLED last slot it appends a fresh empty one (progressive
 *     disclosure — new slots exist only once the previous one is filled)
 *   - R records into the cursor slot, in place (re-recording a middle slot
 *     is how a wrong note gets fixed without rebuilding the tape)
 *   - Space performs the WHOLE tape, concatenated (PlaybackManager)
 *
 * There is no per-slot delete. Clearing the whole tape is a place in the
 * world instead: a CleansingTile (see entities/CleansingTile.js) empties it
 * when the player walks over it, so "reset my recordings" always reads as a
 * safe, deliberate act rather than a scary key that might strand you.
 */
class Tape {
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

  /**
   * Empty the whole tape back to a single blank slot with the cursor at the
   * start. Fired by a CleansingTile when the player steps onto it. RecordingUI
   * mirrors the shrink on its next frame (syncSlotCount).
   */
  static clear() {
    const { player } = gameState;
    player.inventory = [null];
    player.activeSlot = 0;
  }
}

export default Tape;
