/**
 * Playback Manager Integration Tests
 *
 * These tests validate the playback system by:
 * 1. Setting up inventory slots with recorded songs
 * 2. Simulating spacebar press to trigger playback
 * 3. Advancing time to allow notes to be emitted
 * 4. Asserting on emitted notes via ListeningManager
 *
 * Note: Tests are async because tick() uses jest.runAllTimersAsync()
 * to properly handle async instrument playback.
 */

describe('Playing recorded songs', () => {
  describe('playing from inventory slots', () => {
    it('plays a single-note song from the active slot', async () => {
      ctx.loadPuzzle('playback-basic');
      await ctx.tick(16);

      // Set up inventory with a single note
      const song = [{ pitch: 'C4', length: '1/4' }];
      ctx.setInventorySlot(0, song);
      ctx.setActiveSlot(0);

      // Clear any emitted notes from setup
      ctx.clearEmittedNotes();

      // Press space to play
      ctx.pressKey('space');

      // Advance time to allow note to play (1/4 note at 120 BPM = 500ms)
      await ctx.advanceBeats(1);

      // Assert: note was emitted
      const emitted = ctx.getEmittedNotes();
      expect(emitted.length).toBeGreaterThanOrEqual(1);
      expect(emitted[0].pitch).toBe('C4');
    });

    it('plays a multi-note song in sequence', async () => {
      ctx.loadPuzzle('playback-multi-note');
      await ctx.tick(16);

      // Set up inventory with 3 notes
      const song = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ];
      ctx.setInventorySlot(0, song);
      ctx.setActiveSlot(0);

      ctx.clearEmittedNotes();

      // Press space to play
      ctx.pressKey('space');

      // Advance time to allow all notes to play (3 beats at 120 BPM)
      await ctx.advanceBeats(3);

      // Assert: all notes were emitted in order
      const emitted = ctx.getEmittedNotes();
      expect(emitted.length).toBeGreaterThanOrEqual(3);
      expect(emitted[0].pitch).toBe('C4');
      expect(emitted[1].pitch).toBe('E4');
      expect(emitted[2].pitch).toBe('G4');
    });

    it('plays from a non-default inventory slot', async () => {
      ctx.loadPuzzle('playback-basic');
      await ctx.tick(16);

      // Set up song in slot 3
      const song = [{ pitch: 'G4', length: '1/4' }];
      ctx.setInventorySlot(3, song);
      ctx.setActiveSlot(3);

      ctx.clearEmittedNotes();

      // Press space to play
      ctx.pressKey('space');
      await ctx.advanceBeats(1);

      // Assert: note from slot 3 was emitted
      const emitted = ctx.getEmittedNotes();
      expect(emitted.length).toBeGreaterThanOrEqual(1);
      expect(emitted[0].pitch).toBe('G4');
    });

    it('plays chords (multiple notes on same beat)', async () => {
      ctx.loadPuzzle('playback-basic');
      await ctx.tick(16);

      // Set up inventory with a chord (C major)
      const song = [
        [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
        ],
      ];
      ctx.setInventorySlot(0, song);
      ctx.setActiveSlot(0);

      ctx.clearEmittedNotes();

      // Press space to play
      ctx.pressKey('space');
      await ctx.advanceBeats(1);

      // Assert: all chord notes were emitted
      const emitted = ctx.getEmittedNotes();
      expect(emitted.length).toBeGreaterThanOrEqual(3);
      const pitches = emitted.map((n) => n.pitch);
      expect(pitches).toContain('C4');
      expect(pitches).toContain('E4');
      expect(pitches).toContain('G4');
    });
  });

  describe('handling empty slots', () => {
    it('handles playing an empty slot gracefully', async () => {
      ctx.loadPuzzle('playback-basic');
      await ctx.tick(16);

      // Ensure slot 0 is empty
      ctx.setInventorySlot(0, null);
      ctx.setActiveSlot(0);

      ctx.clearEmittedNotes();

      // Press space - should not throw
      expect(() => ctx.pressKey('space')).not.toThrow();
      await ctx.advanceBeats(1);

      // Assert: no notes were emitted
      const emitted = ctx.getEmittedNotes();
      expect(emitted).toHaveLength(0);
    });

    it('does not play from wrong slot when active slot is empty', async () => {
      ctx.loadPuzzle('playback-basic');
      await ctx.tick(16);

      // Set up song in slot 1, but active is slot 0 (empty)
      const song = [{ pitch: 'C4', length: '1/4' }];
      ctx.setInventorySlot(1, song);
      ctx.setInventorySlot(0, null);
      ctx.setActiveSlot(0);

      ctx.clearEmittedNotes();

      // Press space to play from empty slot 0
      ctx.pressKey('space');
      await ctx.advanceBeats(1);

      // Assert: no notes emitted since slot 0 is empty
      const emitted = ctx.getEmittedNotes();
      expect(emitted).toHaveLength(0);
    });
  });

  describe('playback state', () => {
    it('prevents overlapping playback when already playing', async () => {
      ctx.loadPuzzle('playback-basic');
      await ctx.tick(16);

      // Use a longer song to ensure playback is still active when second press occurs
      const song = [
        { pitch: 'C4', length: '1/1' }, // Whole note = 4 beats
        { pitch: 'E4', length: '1/1' },
        { pitch: 'G4', length: '1/1' },
      ];
      ctx.setInventorySlot(0, song);
      ctx.setActiveSlot(0);

      ctx.clearEmittedNotes();

      // Start first playback
      ctx.pressKey('space');

      // Try to start second playback immediately
      ctx.pressKey('space');

      // Wait for everything to complete (12 beats total)
      await ctx.advanceBeats(13);

      // Assert: only one playback occurred (3 notes, not 6)
      const emitted = ctx.getEmittedNotes();
      expect(emitted).toHaveLength(3);
    });
  });

  describe('beat tolerance', () => {
    it('starts playback immediately when within beat tolerance', async () => {
      ctx.loadPuzzle('playback-basic');
      await ctx.tick(16);

      const song = [{ pitch: 'C4', length: '1/4' }];
      ctx.setInventorySlot(0, song);
      ctx.setActiveSlot(0);

      // Advance to exactly on a beat boundary
      await ctx.advanceBeats(1);

      ctx.clearEmittedNotes();

      // Press space right on the beat (within 50ms tolerance)
      ctx.pressKey('space');

      // Advance just a bit - note should play immediately
      await ctx.tick(100);

      // Assert: note was emitted quickly
      const emitted = ctx.getEmittedNotes();
      expect(emitted.length).toBeGreaterThanOrEqual(1);
      expect(emitted[0].pitch).toBe('C4');
    });

    it('waits for next beat when outside beat tolerance', async () => {
      ctx.loadPuzzle('playback-basic');
      await ctx.tick(16);

      const song = [{ pitch: 'C4', length: '1/4' }];
      ctx.setInventorySlot(0, song);
      ctx.setActiveSlot(0);

      // At 120 BPM, 1 beat = 500ms
      // Advance to middle of a beat (250ms into beat)
      // This is outside the 50ms tolerance from the start of a beat
      await ctx.advanceMs(250);

      ctx.clearEmittedNotes();

      // Press space mid-beat - playback should wait for next beat
      ctx.pressKey('space');

      // Note will be scheduled after startDelay (time until next beat = ~250ms)
      // Then the note plays. Total wait: ~250ms before first note

      // Wait for everything to settle
      await ctx.advanceMs(500);

      // Assert: note was eventually emitted
      const emitted = ctx.getEmittedNotes();
      expect(emitted.length).toBeGreaterThanOrEqual(1);
      expect(emitted[0].pitch).toBe('C4');
    });
  });

  describe('note emission timing', () => {
    it('emits notes at correct beat intervals', async () => {
      ctx.loadPuzzle('playback-basic');
      await ctx.tick(16);

      // Song with quarter notes (1 beat each at 120 BPM = 500ms)
      const song = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ];
      ctx.setInventorySlot(0, song);
      ctx.setActiveSlot(0);

      // Advance to a beat boundary
      await ctx.advanceBeats(1);
      ctx.clearEmittedNotes();

      // Start playback
      ctx.pressKey('space');

      // Wait for first note
      await ctx.tick(100);
      const afterFirst = ctx.getEmittedNotes();
      expect(afterFirst.length).toBeGreaterThanOrEqual(1);
      expect(afterFirst[0].pitch).toBe('C4');

      // Wait for second note (should be 1 beat = 500ms later)
      await ctx.advanceBeats(1);
      const afterSecond = ctx.getEmittedNotes();
      expect(afterSecond.length).toBeGreaterThanOrEqual(2);
      expect(afterSecond[1].pitch).toBe('E4');
    });

    it('handles different note lengths correctly', async () => {
      ctx.loadPuzzle('playback-basic');
      await ctx.tick(16);

      // Song with mixed note lengths
      const song = [
        { pitch: 'C4', length: '1/2' }, // Half note = 2 beats
        { pitch: 'E4', length: '1/4' }, // Quarter note = 1 beat
      ];
      ctx.setInventorySlot(0, song);
      ctx.setActiveSlot(0);

      await ctx.advanceBeats(1);
      ctx.clearEmittedNotes();

      // Start playback
      ctx.pressKey('space');

      // Wait for all notes to play (total 3 beats)
      await ctx.advanceBeats(3);

      // Assert: both notes were emitted
      const emitted = ctx.getEmittedNotes();
      expect(emitted.length).toBeGreaterThanOrEqual(2);
      expect(emitted[0].pitch).toBe('C4');
      expect(emitted[1].pitch).toBe('E4');
    });
  });
});
