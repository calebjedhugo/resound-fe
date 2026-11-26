/**
 * ListeningManager Integration Tests
 *
 * These tests validate that Gates and Fountains correctly recognize songs by:
 * 1. Loading test puzzles with gates/fountains that have required songs
 * 2. Having a test singer at the player's position sing a song (the
 *    player's tape did until 2026-11-23; any source is heard alike)
 * 3. Verifying gates open / fountains activate when the correct song sounds nearby
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
      const song = [{ pitch: 'C4', length: '1/4' }];

      // Verify gate is initially closed
      const gates = ctx.getGates();
      expect(gates).toHaveLength(1);
      expect(ctx.isGateOpen(gates[0])).toBe(false);

      // A singer at the player's position sings it
      ctx.startSinging(song);

      // A gate opens on a completed loop of its song (and, sung once,
      // closes again when no next loop comes: entities/GateLoop.test)
      await ctx.advanceBeats(2);

      expect(gates[0].openings).toBe(1);
    });

    it('opens gate when correct multi-note song is played', async () => {
      ctx.loadPuzzle('listening-gate-multi-note');
      await ctx.tick(16);

      // Set up inventory with the correct 3-note song
      const song = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ];

      const gates = ctx.getGates();
      expect(ctx.isGateOpen(gates[0])).toBe(false);

      // Play the song
      ctx.startSinging(song);
      // Multi-note gates commit only on the COMPLETED song: a correct
      // prefix must NOT crack the door open mid-performance...
      await ctx.advanceBeats(2);
      expect(gates[0].openings).toBe(0);

      // ...but once the full song lands, it opens
      await ctx.advanceBeats(3);
      expect(gates[0].openings).toBe(1);
    });

    it('does not open gate when wrong song is played', async () => {
      // Gate requires: [{ pitch: 'E4', length: '1/4' }, { pitch: 'G4', length: '1/4' }]
      ctx.loadPuzzle('listening-gate-wrong-song');
      await ctx.tick(16);

      // Set up inventory with a different song
      const song = [{ pitch: 'C4', length: '1/4' }];

      const gates = ctx.getGates();
      expect(ctx.isGateOpen(gates[0])).toBe(false);

      // Play the wrong song
      ctx.startSinging(song);
      await ctx.advanceBeats(8);

      // Assert: gate should still be closed
      expect(gates[0].openings).toBe(0); // never opened (not just closed now)
    });

    it('does not open gate when player is out of audible range', async () => {
      // Player at (0,0,0), gate at (8,0,8) with audibleRange=5
      // Distance > audibleRange, so notes won't reach gate
      ctx.loadPuzzle('listening-gate-out-of-range');
      await ctx.tick(16);

      // Set up inventory with correct song
      const song = [{ pitch: 'C4', length: '1/4' }];

      const gates = ctx.getGates();
      expect(ctx.isGateOpen(gates[0])).toBe(false);

      // Play the song from out of range
      ctx.startSinging(song);
      await ctx.advanceBeats(8);

      // Assert: gate should still be closed (player too far)
      expect(gates[0].openings).toBe(0); // never opened (not just closed now)
    });

    it('opens gate when player moves into range and plays', async () => {
      ctx.loadPuzzle('listening-gate-out-of-range');
      await ctx.tick(16);

      // Set up inventory with correct song
      const song = [{ pitch: 'C4', length: '1/4' }];

      const gates = ctx.getGates();

      // Move player close to gate (gate is at grid (8,0,8) -> world (24,0,24))
      ctx.setPlayerPosition({ x: 24, y: 0, z: 24 });
      await ctx.tick(16);

      // Play the song from close range
      ctx.startSinging(song);
      await ctx.advanceBeats(2);

      // Assert: gate should now be open (within the play-to-pass window)
      expect(ctx.isGateOpen(gates[0])).toBe(true);
    });

    it('sung once, the gate opens and then closes: no next loop holds it', async () => {
      ctx.loadPuzzle('listening-gate-basic');
      await ctx.tick(16);

      const song = [{ pitch: 'C4', length: '1/4' }];
      const gates = ctx.getGates();

      // Opens on the completed song (2026-11-25: open while it loops)...
      ctx.startSinging(song);
      await ctx.advanceBeats(2);
      expect(gates[0].openings).toBe(1);
      // ...and with no next loop on time, it is closed again
      expect(ctx.isGateOpen(gates[0])).toBe(false);
    });

    it('opens again for every fresh performance', async () => {
      ctx.loadPuzzle('listening-gate-basic');
      await ctx.tick(16);

      const song = [{ pitch: 'C4', length: '1/4' }];
      const gates = ctx.getGates();

      ctx.startSinging(song);
      await ctx.advanceBeats(4);
      expect(gates[0].openings).toBe(1);
      expect(ctx.isGateOpen(gates[0])).toBe(false);

      // Play it again — the gate answers every correct performance. (Let a
      // beat pass first: closing trims heard history, and a phrase whose
      // leading-silence margin reaches into the trimmed region is
      // unjudgeable by design.)
      await ctx.advanceBeats(2);
      ctx.startSinging(song);
      await ctx.advanceBeats(4);
      expect(gates[0].openings).toBe(2);
    });
  });

  describe('fountains activating with correct song', () => {
    it('activates fountain when correct single-note song is played nearby', async () => {
      ctx.loadPuzzle('listening-fountain-basic');
      await ctx.tick(16);

      const song = [{ pitch: 'C4', length: '1/4' }];

      const fountains = ctx.getFountains();
      expect(fountains).toHaveLength(1);
      expect(ctx.isFountainActive(fountains[0])).toBe(false);

      // Play the song
      ctx.startSinging(song);
      await ctx.advanceBeats(8);

      // Assert: fountain should be activated
      expect(ctx.isFountainActive(fountains[0])).toBe(true);
    });

    it('activates fountain when correct multi-note song is played', async () => {
      ctx.loadPuzzle('listening-fountain-multi-note');
      await ctx.tick(16);

      const song = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ];

      const fountains = ctx.getFountains();
      expect(ctx.isFountainActive(fountains[0])).toBe(false);

      ctx.startSinging(song);
      // 3 notes x 1/4 = 3 beats, plus extra for playback and one more tick to process
      await ctx.advanceBeats(8);
      await ctx.tick(16);

      expect(ctx.isFountainActive(fountains[0])).toBe(true);
    });

    it('does not activate fountain with wrong song', async () => {
      ctx.loadPuzzle('listening-fountain-basic');
      await ctx.tick(16);

      // Fountain requires C4, but we play E4
      const song = [{ pitch: 'E4', length: '1/4' }];

      const fountains = ctx.getFountains();

      ctx.startSinging(song);
      await ctx.advanceBeats(8);

      // Fountain should NOT be activated
      expect(ctx.isFountainActive(fountains[0])).toBe(false);
    });

    it('does not activate fountain with wrong note length', async () => {
      ctx.loadPuzzle('listening-fountain-basic');
      await ctx.tick(16);

      // Fountain requires C4 1/4, but we play C4 1/8
      const song = [{ pitch: 'C4', length: '1/8' }];

      const fountains = ctx.getFountains();

      ctx.startSinging(song);
      await ctx.advanceBeats(8);

      // Fountain should NOT be activated (length mismatch)
      expect(ctx.isFountainActive(fountains[0])).toBe(false);
    });

    it('fountain stays activated permanently', async () => {
      ctx.loadPuzzle('listening-fountain-basic');
      await ctx.tick(16);

      const song = [{ pitch: 'C4', length: '1/4' }];

      const fountains = ctx.getFountains();

      ctx.startSinging(song);
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

      const song = [{ pitch: 'C4', length: '1/4' }];

      const gates = ctx.getGates();

      // Gate at grid (8,0,8) -> world (24,0,24), player at (0,0,0)
      // Distance = sqrt(24^2 + 24^2) = ~34, audibleRange = 5
      // So notes should NOT reach gate

      ctx.startSinging(song);
      await ctx.advanceBeats(8);

      expect(gates[0].openings).toBe(0); // never opened (not just closed now)
    });

    it('opens gate when player is exactly at audible range boundary', async () => {
      ctx.loadPuzzle('listening-gate-out-of-range');
      await ctx.tick(16);

      const song = [{ pitch: 'C4', length: '1/4' }];

      const gates = ctx.getGates();
      // Gate at grid (8,0,8) -> world (24,0,24), audibleRange=5
      // Move player to exactly 5 units away
      ctx.setPlayerPosition({ x: 24, y: 0, z: 19 }); // 5 units in z direction
      await ctx.tick(16);

      ctx.startSinging(song);
      await ctx.advanceBeats(2);

      // Should be within range (boundary inclusive)
      expect(gates[0].openings).toBe(1);
    });
  });

  describe('note emission and capture', () => {
    it('emits notes through ListeningManager when playing', async () => {
      ctx.loadPuzzle('listening-gate-basic');
      await ctx.tick(16);

      const song = [{ pitch: 'C4', length: '1/4' }];

      ctx.clearEmittedNotes();

      ctx.startSinging(song);
      await ctx.advanceBeats(8);

      // Check that notes were emitted
      const notes = ctx.getEmittedNotes();
      expect(notes.length).toBeGreaterThan(0);
      expect(notes[0].pitch).toBe('C4');
    });

    it('gate captures multiple notes from multi-note song', async () => {
      ctx.loadPuzzle('listening-gate-multi-note');
      await ctx.tick(16);

      const song = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ];

      ctx.clearEmittedNotes();

      ctx.startSinging(song);
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
      const song = [{ pitch: 'C#4', length: '1/4' }];

      const gates = ctx.getGates();

      ctx.startSinging(song);
      await ctx.advanceBeats(8);

      expect(gates[0].openings).toBe(0); // never opened (not just closed now)
    });

    it('requires exact length match', async () => {
      ctx.loadPuzzle('listening-gate-basic');
      await ctx.tick(16);

      // Gate requires C4 1/4, we play C4 1/2
      const song = [{ pitch: 'C4', length: '1/2' }];

      const gates = ctx.getGates();

      ctx.startSinging(song);
      await ctx.advanceBeats(8);

      expect(gates[0].openings).toBe(0); // never opened (not just closed now)
    });

    it('requires correct note count', async () => {
      ctx.loadPuzzle('listening-gate-multi-note');
      await ctx.tick(16);

      // Gate requires 3 notes (C4, E4, G4), we only play 2
      const song = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ];

      const gates = ctx.getGates();

      ctx.startSinging(song);
      await ctx.advanceBeats(5);

      expect(gates[0].openings).toBe(0); // never opened (not just closed now)
    });

    it('requires correct note order', async () => {
      ctx.loadPuzzle('listening-gate-multi-note');
      await ctx.tick(16);

      // Gate requires C4, E4, G4 - we play in reverse order
      const song = [
        { pitch: 'G4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'C4', length: '1/4' },
      ];

      const gates = ctx.getGates();

      ctx.startSinging(song);
      await ctx.advanceBeats(8);

      expect(gates[0].openings).toBe(0); // never opened (not just closed now)
    });
  });

  describe('a longer phrase around the song', () => {
    it('a foreign note BEFORE the song voids the attempt (wrong-note lockout, ruled 2026-07-16)', async () => {
      ctx.loadPuzzle('listening-gate-basic');
      await ctx.tick(16);

      // A foreign E4 first, then the door's C4: the E4 mismatches the
      // moment it lands and the lockout deafens the door through the C4
      // that follows — the target must START clean
      const song = [
        { pitch: 'E4', length: '1/4' },
        { pitch: 'C4', length: '1/4' },
      ];
      const gates = ctx.getGates();

      ctx.startSinging(song);
      await ctx.advanceBeats(3);

      expect(gates[0].openings).toBe(0); // never opened (not just closed now)
    });

    it('opens on the song at the START of a phrase — trailing surplus is still fine', async () => {
      ctx.loadPuzzle('listening-gate-basic');
      await ctx.tick(16);

      // The door's song leads; the E4 after it lands past the window
      // (completion fires the instant the target's span elapses)
      const song = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ];
      const gates = ctx.getGates();

      ctx.startSinging(song);
      await ctx.advanceBeats(3);

      expect(gates[0].openings).toBe(1);
    });

    it('does not open when the right pitch comes at the wrong length', async () => {
      // Gate wants [C4 1/4]: a half-note C4 has the pitch but the wrong
      // duration, so no window ever aligns
      ctx.loadPuzzle('listening-gate-basic');
      await ctx.tick(16);

      const song = [{ pitch: 'C4', length: '1/2' }];
      const gates = ctx.getGates();

      ctx.startSinging(song);
      await ctx.advanceBeats(4);

      expect(gates[0].openings).toBe(0); // never opened (not just closed now)
    });
  });
});
