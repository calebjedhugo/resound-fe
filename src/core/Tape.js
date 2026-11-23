import gameState from 'core/GameState';
import { TAPE_SLOT_CAP } from 'core/constants';

/**
 * Tape - the dynamic slot strip (ruled 2026-07-11; since 2026-11-23 each slot
 * holds one absorbed CREATURE, core/AbsorbManager).
 *
 * The inventory is a growable strip, not a fixed key ring:
 *   - the game boots with ONE slot; ArrowRight moves the cursor, and pressed
 *     on a FILLED last slot it appends a fresh empty one (progressive
 *     disclosure — new slots exist only once the previous one is filled)
 *   - R absorbs a creature into the cursor slot; with a creature already
 *     there, into a NEW slot appended at the end (the cursor follows it), so
 *     an absorb never overwrites one
 *   - Space releases the cursor slot's creature, emptying the slot
 *
 * There is no delete: a slot empties only by releasing its creature.
 */
class Tape {
  /** Move the cursor left (no wraparound — the tape has a beginning). */
  static left() {
    const { player } = gameState;
    player.activeSlot = Math.max(0, player.activeSlot - 1);
  }

  /**
   * Move the cursor right. On the last slot: append a fresh empty slot IF
   * the last one is filled (and the cap allows).
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
   * The slot a creature absorbed now goes into: the cursor slot if it is
   * empty, else a new slot at the end of the strip, the cursor moved onto
   * it ("if there is already a creature in the slot, simply make a new
   * one" — the designer, 2026-11-23; an empty LAST slot, grown by ArrowRight,
   * is that new slot already). -1 when the strip is full (TAPE_SLOT_CAP) and
   * the cursor slot taken. Only an absorb that is going ahead calls this:
   * it may grow the strip.
   * @returns {number}
   */
  static slotForAbsorb() {
    const { player } = gameState;
    if (!player.inventory[player.activeSlot]) return player.activeSlot;
    const last = player.inventory.length - 1;
    if (player.inventory[last]) {
      if (player.inventory.length >= TAPE_SLOT_CAP) return -1;
      player.inventory.push(null);
    }
    player.activeSlot = player.inventory.length - 1;
    return player.activeSlot;
  }

  /** Could an absorb go ahead now (slotForAbsorb would not be -1)? */
  static hasRoom() {
    const { inventory, activeSlot } = gameState.player;
    return (
      !inventory[activeSlot] || !inventory[inventory.length - 1] || inventory.length < TAPE_SLOT_CAP
    );
  }
}

export default Tape;
