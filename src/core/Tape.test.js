/**
 * Tape tests — the dynamic slot strip (ruled 2026-07-11).
 *
 * Behaviors under test: the tape boots with one slot and grows only via
 * ArrowRight on a FILLED last slot (progressive disclosure, capped);
 * hold-to-delete removes the cursor slot after TAPE_DELETE_HOLD_MS,
 * releasing early cancels, the key must be released between deletes, and
 * the tape never shrinks to nothing.
 */
import gameState from 'core/GameState';
import Tape from 'core/Tape';
import { TAPE_SLOT_CAP, TAPE_DELETE_HOLD_MS } from 'core/constants';

const take = (pitch) => ({
  id: `take_${pitch}_${Math.random()}`,
  data: [{ pitch, length: '1/1' }],
  tempo: 100,
  sourceRange: 8,
});

beforeEach(() => {
  jest.useFakeTimers();
  gameState.reset();
  Tape.reset();
});

afterEach(() => {
  jest.useRealTimers();
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

describe('hold-to-delete', () => {
  it('completes after the hold duration: slot removed, others close ranks', () => {
    gameState.player.inventory = [take('C4'), take('E4'), take('G4')];
    gameState.player.activeSlot = 1;

    Tape.deleteDown();
    expect(gameState.player.tapeDelete).toEqual({ index: 1, startedAt: expect.any(Number) });

    jest.advanceTimersByTime(TAPE_DELETE_HOLD_MS + 50);
    Tape.update();

    expect(gameState.player.inventory.map((s) => s && s.data[0].pitch)).toEqual(['C4', 'G4']);
    expect(gameState.player.tapeDelete).toBeNull();
  });

  it('releasing before the fade completes cancels the delete', () => {
    gameState.player.inventory = [take('C4')];
    Tape.deleteDown();
    jest.advanceTimersByTime(TAPE_DELETE_HOLD_MS / 2);
    Tape.update();
    Tape.deleteUp();
    jest.advanceTimersByTime(TAPE_DELETE_HOLD_MS);
    Tape.update();
    expect(gameState.player.inventory[0].data[0].pitch).toBe('C4');
  });

  it('requires a key release between deletes (latch)', () => {
    gameState.player.inventory = [take('C4'), take('E4')];
    gameState.player.activeSlot = 0;

    Tape.deleteDown();
    jest.advanceTimersByTime(TAPE_DELETE_HOLD_MS + 50);
    Tape.update();
    expect(gameState.player.inventory).toHaveLength(1);

    // Key is still held — a second delete must not arm
    Tape.deleteDown();
    expect(gameState.player.tapeDelete).toBeNull();
    jest.advanceTimersByTime(TAPE_DELETE_HOLD_MS + 50);
    Tape.update();
    expect(gameState.player.inventory).toHaveLength(1);

    // After releasing, deleting works again
    Tape.deleteUp();
    Tape.deleteDown();
    jest.advanceTimersByTime(TAPE_DELETE_HOLD_MS + 50);
    Tape.update();
    expect(gameState.player.inventory).toEqual([null]); // never shrinks to nothing
  });

  it('deleting the sole slot leaves one empty slot', () => {
    gameState.player.inventory = [take('C4')];
    Tape.deleteDown();
    jest.advanceTimersByTime(TAPE_DELETE_HOLD_MS + 50);
    Tape.update();
    expect(gameState.player.inventory).toEqual([null]);
    expect(gameState.player.activeSlot).toBe(0);
  });

  it('clamps the cursor when the last slot is deleted', () => {
    gameState.player.inventory = [take('C4'), take('E4')];
    gameState.player.activeSlot = 1;
    Tape.deleteDown();
    jest.advanceTimersByTime(TAPE_DELETE_HOLD_MS + 50);
    Tape.update();
    expect(gameState.player.activeSlot).toBe(0);
  });

  it('reports fade progress for the UI', () => {
    gameState.player.inventory = [take('C4')];
    expect(Tape.deleteProgress()).toBe(0);
    Tape.deleteDown();
    jest.advanceTimersByTime(TAPE_DELETE_HOLD_MS / 2);
    expect(Tape.deleteProgress()).toBeCloseTo(0.5, 1);
  });
});
