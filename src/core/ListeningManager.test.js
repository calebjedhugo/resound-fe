/**
 * ListeningManager Integration Tests
 *
 * These tests validate that Gates and Fountains correctly recognize songs by:
 * 1. Loading test puzzles with gates/fountains that have required songs
 * 2. Setting up inventory with songs to play back
 * 3. Pressing space to trigger playback
 * 4. Verifying gates open / fountains activate when correct song is played nearby
 *
 * Note: Tests are async because tick() uses jest.runAllTimersAsync()
 * to properly handle async instrument playback.
 */

describe('Gates and Fountains recognizing songs', () => {
  describe('gates opening with correct song', () => {
    it('opens gate when correct single-note song is played nearby', async () => {
      // Load puzzle: player at grid (5,0,5), gate at grid (5,0,4)
      // Gate requires song: [{ pitch: 'C4', length: '1/4' }]
      ctx.loadPuzzle('listening-gate-basic');
      await ctx.tick(16);

      // Set up inventory with the correct song
      ctx.setInventorySlot(0, [{ pitch: 'C4', length: '1/4' }]);
      ctx.setActiveSlot(0);

      // Verify gate is initially closed
      const gates = ctx.getGates();
      expect(gates).toHaveLength(1);
      expect(ctx.isGateOpen(gates[0])).toBe(false);

      // Play the song (space key triggers playback)
      ctx.pressKey('space');

      // Gates open AS the song is performed; check within the open window
      // (the song sounds, then a short step-through grace).
      await ctx.advanceBeats(2);

      // Assert: gate should now be open
      expect(ctx.isGateOpen(gates[0])).toBe(true);
    });

    it('opens gate when correct multi-note song is played', async () => {
      ctx.loadPuzzle('listening-gate-multi-note');
      await ctx.tick(16);

      // Set up inventory with the correct 3-note song
      ctx.setInventorySlot(0, [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ]);
      ctx.setActiveSlot(0);

      const gates = ctx.getGates();
      expect(ctx.isGateOpen(gates[0])).toBe(false);

      // Play the song
      ctx.pressKey('space');
      // Multi-note gates commit only on the COMPLETED song: a correct
      // prefix must NOT crack the door open mid-performance...
      await ctx.advanceBeats(2);
      expect(ctx.isGateOpen(gates[0])).toBe(false);

      // ...but once the full song and its trailing silence land, it opens
      // (and the step-through grace holds it).
      await ctx.advanceBeats(3);
      expect(ctx.isGateOpen(gates[0])).toBe(true);
    });

    it('does not open gate when wrong song is played', async () => {
      // Gate requires: [{ pitch: 'E4', length: '1/4' }, { pitch: 'G4', length: '1/4' }]
      ctx.loadPuzzle('listening-gate-wrong-song');
      await ctx.tick(16);

      // Set up inventory with a different song
      ctx.setInventorySlot(0, [{ pitch: 'C4', length: '1/4' }]);
      ctx.setActiveSlot(0);

      const gates = ctx.getGates();
      expect(ctx.isGateOpen(gates[0])).toBe(false);

      // Play the wrong song
      ctx.pressKey('space');
      await ctx.advanceBeats(8);

      // Assert: gate should still be closed
      expect(ctx.isGateOpen(gates[0])).toBe(false);
    });

    it('does not open gate when player is out of audible range', async () => {
      // Player at (0,0,0), gate at (8,0,8) with audibleRange=5
      // Distance > audibleRange, so notes won't reach gate
      ctx.loadPuzzle('listening-gate-out-of-range');
      await ctx.tick(16);

      // Set up inventory with correct song
      ctx.setInventorySlot(0, [{ pitch: 'C4', length: '1/4' }]);
      ctx.setActiveSlot(0);

      const gates = ctx.getGates();
      expect(ctx.isGateOpen(gates[0])).toBe(false);

      // Play the song from out of range
      ctx.pressKey('space');
      await ctx.advanceBeats(8);

      // Assert: gate should still be closed (player too far)
      expect(ctx.isGateOpen(gates[0])).toBe(false);
    });

    it('opens gate when player moves into range and plays', async () => {
      ctx.loadPuzzle('listening-gate-out-of-range');
      await ctx.tick(16);

      // Set up inventory with correct song
      ctx.setInventorySlot(0, [{ pitch: 'C4', length: '1/4' }]);
      ctx.setActiveSlot(0);

      const gates = ctx.getGates();

      // Move player close to gate (gate is at grid (8,0,8) -> world (24,0,24))
      ctx.setPlayerPosition({ x: 24, y: 0, z: 24 });
      await ctx.tick(16);

      // Play the song from close range
      ctx.pressKey('space');
      await ctx.advanceBeats(2);

      // Assert: gate should now be open (within the play-to-pass window)
      expect(ctx.isGateOpen(gates[0])).toBe(true);
    });

    it('gate LATCHES open (no timer) and closes when the player walks through', async () => {
      ctx.loadPuzzle('listening-gate-basic');
      await ctx.tick(16);

      ctx.setInventorySlot(0, [{ pitch: 'C4', length: '1/4' }]);
      ctx.setActiveSlot(0);

      const gates = ctx.getGates();

      // Open the gate with a correct performance
      ctx.pressKey('space');
      await ctx.advanceBeats(2);

      expect(ctx.isGateOpen(gates[0])).toBe(true);

      // No timer: it stays open for as long as nobody crosses (ruled
      // 2026-07-10 — close on exit, not on a grace)
      await ctx.advanceBeats(12);
      expect(ctx.isGateOpen(gates[0])).toBe(true);

      // Walking through consumes the opening: into the cell (grid 5,4 ->
      // world 15,12), then fully clear on the far side
      ctx.setPlayerPosition({ x: 15, z: 12 });
      await ctx.tick(32);
      expect(ctx.isGateOpen(gates[0])).toBe(true); // never closes on an occupant
      ctx.setPlayerPosition({ x: 15, z: 6 });
      await ctx.tick(32);
      expect(ctx.isGateOpen(gates[0])).toBe(false);
    });

    it('gate reopens for a fresh performance after a crossing consumed it', async () => {
      ctx.loadPuzzle('listening-gate-basic');
      await ctx.tick(16);

      ctx.setInventorySlot(0, [{ pitch: 'C4', length: '1/4' }]);
      ctx.setActiveSlot(0);

      const gates = ctx.getGates();

      ctx.pressKey('space');
      await ctx.advanceBeats(2);
      expect(ctx.isGateOpen(gates[0])).toBe(true);

      // Outwait the just-completed hold (a fresh completion keeps the door
      // open through an immediate crossing), then walk through: consumed
      await ctx.advanceBeats(4);
      ctx.setPlayerPosition({ x: 15, z: 12 });
      await ctx.tick(32);
      ctx.setPlayerPosition({ x: 15, z: 6 });
      await ctx.tick(32);
      expect(ctx.isGateOpen(gates[0])).toBe(false);

      // Play it again — the gate answers every correct performance. (Let a
      // beat pass first: closing trims heard history, and a phrase whose
      // leading-silence margin reaches into the trimmed region is
      // unjudgeable by design. Then completion + trailing silence opens it.)
      await ctx.advanceBeats(2);
      ctx.pressKey('space');
      await ctx.advanceBeats(4);
      expect(ctx.isGateOpen(gates[0])).toBe(true);
    });
  });

  describe('fountains activating with correct song', () => {
    it('activates fountain when correct single-note song is played nearby', async () => {
      ctx.loadPuzzle('listening-fountain-basic');
      await ctx.tick(16);

      ctx.setInventorySlot(0, [{ pitch: 'C4', length: '1/4' }]);
      ctx.setActiveSlot(0);

      const fountains = ctx.getFountains();
      expect(fountains).toHaveLength(1);
      expect(ctx.isFountainActive(fountains[0])).toBe(false);

      // Play the song
      ctx.pressKey('space');
      await ctx.advanceBeats(8);

      // Assert: fountain should be activated
      expect(ctx.isFountainActive(fountains[0])).toBe(true);
    });

    it('activates fountain when correct multi-note song is played', async () => {
      ctx.loadPuzzle('listening-fountain-multi-note');
      await ctx.tick(16);

      ctx.setInventorySlot(0, [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ]);
      ctx.setActiveSlot(0);

      const fountains = ctx.getFountains();
      expect(ctx.isFountainActive(fountains[0])).toBe(false);

      ctx.pressKey('space');
      // 3 notes x 1/4 = 3 beats, plus extra for playback and one more tick to process
      await ctx.advanceBeats(8);
      await ctx.tick(16);

      expect(ctx.isFountainActive(fountains[0])).toBe(true);
    });

    it('does not activate fountain with wrong song', async () => {
      ctx.loadPuzzle('listening-fountain-basic');
      await ctx.tick(16);

      // Fountain requires C4, but we play E4
      ctx.setInventorySlot(0, [{ pitch: 'E4', length: '1/4' }]);
      ctx.setActiveSlot(0);

      const fountains = ctx.getFountains();

      ctx.pressKey('space');
      await ctx.advanceBeats(8);

      // Fountain should NOT be activated
      expect(ctx.isFountainActive(fountains[0])).toBe(false);
    });

    it('does not activate fountain with wrong note length', async () => {
      ctx.loadPuzzle('listening-fountain-basic');
      await ctx.tick(16);

      // Fountain requires C4 1/4, but we play C4 1/8
      ctx.setInventorySlot(0, [{ pitch: 'C4', length: '1/8' }]);
      ctx.setActiveSlot(0);

      const fountains = ctx.getFountains();

      ctx.pressKey('space');
      await ctx.advanceBeats(8);

      // Fountain should NOT be activated (length mismatch)
      expect(ctx.isFountainActive(fountains[0])).toBe(false);
    });

    it('fountain stays activated permanently', async () => {
      ctx.loadPuzzle('listening-fountain-basic');
      await ctx.tick(16);

      ctx.setInventorySlot(0, [{ pitch: 'C4', length: '1/4' }]);
      ctx.setActiveSlot(0);

      const fountains = ctx.getFountains();

      ctx.pressKey('space');
      await ctx.advanceBeats(8);

      expect(ctx.isFountainActive(fountains[0])).toBe(true);

      // Advance more time
      await ctx.advanceBeats(10);

      // Fountain should still be activated
      expect(ctx.isFountainActive(fountains[0])).toBe(true);
    });
  });

  describe('range requirements for listening', () => {
    it('respects gate audibleRange setting', async () => {
      // Gate has audibleRange=5, player starts far away at (0,0,0)
      ctx.loadPuzzle('listening-gate-out-of-range');
      await ctx.tick(16);

      ctx.setInventorySlot(0, [{ pitch: 'C4', length: '1/4' }]);
      ctx.setActiveSlot(0);

      const gates = ctx.getGates();

      // Gate at grid (8,0,8) -> world (24,0,24), player at (0,0,0)
      // Distance = sqrt(24^2 + 24^2) = ~34, audibleRange = 5
      // So notes should NOT reach gate

      ctx.pressKey('space');
      await ctx.advanceBeats(8);

      expect(ctx.isGateOpen(gates[0])).toBe(false);
    });

    it('opens gate when player is exactly at audible range boundary', async () => {
      ctx.loadPuzzle('listening-gate-out-of-range');
      await ctx.tick(16);

      ctx.setInventorySlot(0, [{ pitch: 'C4', length: '1/4' }]);
      ctx.setActiveSlot(0);

      const gates = ctx.getGates();
      // Gate at grid (8,0,8) -> world (24,0,24), audibleRange=5
      // Move player to exactly 5 units away
      ctx.setPlayerPosition({ x: 24, y: 0, z: 19 }); // 5 units in z direction
      await ctx.tick(16);

      ctx.pressKey('space');
      await ctx.advanceBeats(2);

      // Should be within range (boundary inclusive)
      expect(ctx.isGateOpen(gates[0])).toBe(true);
    });
  });

  describe('note emission and capture', () => {
    it('emits notes through ListeningManager when playing', async () => {
      ctx.loadPuzzle('listening-gate-basic');
      await ctx.tick(16);

      ctx.setInventorySlot(0, [{ pitch: 'C4', length: '1/4' }]);
      ctx.setActiveSlot(0);

      ctx.clearEmittedNotes();

      ctx.pressKey('space');
      await ctx.advanceBeats(8);

      // Check that notes were emitted
      const notes = ctx.getEmittedNotes();
      expect(notes.length).toBeGreaterThan(0);
      expect(notes[0].pitch).toBe('C4');
    });

    it('gate captures multiple notes from multi-note song', async () => {
      ctx.loadPuzzle('listening-gate-multi-note');
      await ctx.tick(16);

      ctx.setInventorySlot(0, [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ]);
      ctx.setActiveSlot(0);

      ctx.clearEmittedNotes();

      ctx.pressKey('space');
      await ctx.advanceBeats(8);

      // All 3 notes should have been emitted
      const notes = ctx.getEmittedNotes();
      expect(notes.length).toBe(3);
      expect(notes[0].pitch).toBe('C4');
      expect(notes[1].pitch).toBe('E4');
      expect(notes[2].pitch).toBe('G4');
    });
  });

  describe('song matching requirements', () => {
    it('requires exact pitch match', async () => {
      ctx.loadPuzzle('listening-gate-basic');
      await ctx.tick(16);

      // Gate requires C4, we play C#4
      ctx.setInventorySlot(0, [{ pitch: 'C#4', length: '1/4' }]);
      ctx.setActiveSlot(0);

      const gates = ctx.getGates();

      ctx.pressKey('space');
      await ctx.advanceBeats(8);

      expect(ctx.isGateOpen(gates[0])).toBe(false);
    });

    it('requires exact length match', async () => {
      ctx.loadPuzzle('listening-gate-basic');
      await ctx.tick(16);

      // Gate requires C4 1/4, we play C4 1/2
      ctx.setInventorySlot(0, [{ pitch: 'C4', length: '1/2' }]);
      ctx.setActiveSlot(0);

      const gates = ctx.getGates();

      ctx.pressKey('space');
      await ctx.advanceBeats(8);

      expect(ctx.isGateOpen(gates[0])).toBe(false);
    });

    it('requires correct note count', async () => {
      ctx.loadPuzzle('listening-gate-multi-note');
      await ctx.tick(16);

      // Gate requires 3 notes (C4, E4, G4), we only play 2
      ctx.setInventorySlot(0, [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ]);
      ctx.setActiveSlot(0);

      const gates = ctx.getGates();

      ctx.pressKey('space');
      await ctx.advanceBeats(5);

      expect(ctx.isGateOpen(gates[0])).toBe(false);
    });

    it('requires correct note order', async () => {
      ctx.loadPuzzle('listening-gate-multi-note');
      await ctx.tick(16);

      // Gate requires C4, E4, G4 - we play in reverse order
      ctx.setInventorySlot(0, [
        { pitch: 'G4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'C4', length: '1/4' },
      ]);
      ctx.setActiveSlot(0);

      const gates = ctx.getGates();

      ctx.pressKey('space');
      await ctx.advanceBeats(8);

      expect(ctx.isGateOpen(gates[0])).toBe(false);
    });
  });

  describe('tape playback (all slots, concatenated)', () => {
    it('opens a door whose song occurs ANYWHERE in the tape (ruled 2026-07-11)', async () => {
      ctx.loadPuzzle('listening-gate-basic');
      await ctx.tick(16);

      // A foreign note in slot 0, the door's song in slot 2: the whole tape
      // plays on Space, and the door hears its song exactly — the E4 before
      // it is sequential surplus and none of the door's business.
      ctx.setInventorySlot(0, [{ pitch: 'E4', length: '1/4' }]);
      ctx.setInventorySlot(2, [{ pitch: 'C4', length: '1/4' }]);
      ctx.setActiveSlot(2);

      const gates = ctx.getGates();

      ctx.pressKey('space');
      await ctx.advanceBeats(3);

      expect(ctx.isGateOpen(gates[0])).toBe(true);
    });

    it('does not open when the tape merely contains the right pitches at the wrong spacing', async () => {
      // Gate wants [C4 1/4]. The tape holds a half-note C4 — the pitch
      // occurs but the duration is wrong, so no window ever aligns.
      ctx.loadPuzzle('listening-gate-basic');
      await ctx.tick(16);

      ctx.setInventorySlot(0, [{ pitch: 'C4', length: '1/2' }]);
      ctx.setActiveSlot(0);

      const gates = ctx.getGates();

      ctx.pressKey('space');
      await ctx.advanceBeats(4);

      expect(ctx.isGateOpen(gates[0])).toBe(false);
    });
  });
});
