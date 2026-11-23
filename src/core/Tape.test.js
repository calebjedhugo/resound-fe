/**
 * Tape tests — the dynamic slot strip (ruled 2026-07-11; slots hold absorbed
 * creatures since 2026-11-23).
 *
 * Behaviors under test: the tape boots with one slot and grows via
 * ArrowRight on a FILLED last slot (progressive disclosure, capped). Where
 * an absorb lands (slotForAbsorb) is covered through the pole itself, in
 * AbsorbManager.test.
 */
import gameState from 'core/GameState';
import Tape from 'core/Tape';
import { TAPE_SLOT_CAP } from 'core/constants';

const take = (pitch) => ({
  id: `held_${pitch}_${Math.random()}`,
  spec: { song: [{ pitch, length: '1/1' }] },
});

beforeEach(() => {
  gameState.reset();
});

describe('cursor movement and growth', () => {
  it('boots with a single slot and a cursor on it', () => {
    expect(gameState.player.inventory).toEqual([null]);
    expect(gameState.player.activeSlot).toBe(0);
  });

  it('does not grow past an EMPTY last slot (progressive disclosure)', () => {
    Tape.right();
    expect(gameState.player.inventory).toHaveLength(1);
    expect(gameState.player.activeSlot).toBe(0);
  });

  it('grows by one when the last slot is filled and the cursor moves right', () => {
    gameState.player.inventory[0] = take('C4');
    Tape.right();
    expect(gameState.player.inventory).toHaveLength(2);
    expect(gameState.player.inventory[1]).toBeNull();
    expect(gameState.player.activeSlot).toBe(1);
  });

  it('moves within the tape without growing when not on the last slot', () => {
    gameState.player.inventory[0] = take('C4');
    Tape.right(); // grow to 2, cursor on 1
    Tape.left(); // back to 0
    expect(gameState.player.activeSlot).toBe(0);
    Tape.right(); // just moves — slot 1 already exists
    expect(gameState.player.inventory).toHaveLength(2);
    expect(gameState.player.activeSlot).toBe(1);
  });

  it('does not move left past the first slot', () => {
    Tape.left();
    expect(gameState.player.activeSlot).toBe(0);
  });

  it('respects the slot cap', () => {
    for (let i = 0; i < TAPE_SLOT_CAP + 5; i += 1) {
      gameState.player.inventory[gameState.player.activeSlot] = take('C4');
      Tape.right();
    }
    expect(gameState.player.inventory).toHaveLength(TAPE_SLOT_CAP);
  });
});
