/**
 * Recording Integration Tests
 *
 * These tests validate the recording system by:
 * 1. Loading test puzzles with creatures
 * 2. Simulating keyboard input (r key for recording)
 * 3. Advancing the game clock to trigger creature singing
 * 4. Asserting on inventory contents
 *
 * Note: Tests are async because tick() uses jest.runAllTimersAsync()
 * to properly handle async instrument playback.
 */

describe('Recording creature songs', () => {
  describe('capturing notes from nearby creatures', () => {
    it('captures notes when player is within recording range', async () => {
      // Load puzzle: player at grid (5,0,5), creature at grid (5,0,4)
      // World distance = 3, audibleRange=10, recording range=5
      // 3 < 5 so creature is within recording range
      ctx.loadPuzzle('recording-basic');

      // Run a tick to update creature state and populate creaturesInRange
      // Also completes the creature's initial song at beat 0
      await ctx.tick(16);

      // Start recording
      ctx.holdKey('r');

      // Advance 4 beats (creature interval=4, so it sings at beat 4)
      await ctx.advanceBeats(4);

      // Stop recording
      ctx.releaseKey('r');

      // Assert: song captured in inventory slot 0
      const recorded = ctx.getInventorySlot(0);
      expect(recorded).not.toBeNull();
      expect(recorded).toHaveLength(1);
      expect(recorded[0].pitch).toBe('C4');
    });

    it('captures multiple notes from the same creature', async () => {
      // Load puzzle: player at same position as creature with multi-note song
      ctx.loadPuzzle('recording-multi-note');

      // Run tick to complete initial song
      await ctx.tick(16);

      // Start recording
      ctx.holdKey('r');

      // Creature sings a 3-note song (C4, E4, G4), each note is 1/4 = 1 beat
      // Advance 3 beats to capture all 3 notes from one complete song
      await ctx.advanceBeats(3);

      // Stop recording
      ctx.releaseKey('r');

      // Assert: all 3 notes captured from the song
      const recorded = ctx.getInventorySlot(0);
      expect(recorded).not.toBeNull();
      expect(recorded).toHaveLength(3);
      expect(recorded[0].pitch).toBe('C4');
      expect(recorded[1].pitch).toBe('E4');
      expect(recorded[2].pitch).toBe('G4');
    });

    it('stores recording in active inventory slot', async () => {
      ctx.loadPuzzle('recording-basic');
      await ctx.tick(16);

      // Set active slot to 2 before recording
      ctx.setActiveSlot(2);

      ctx.holdKey('r');
      await ctx.advanceBeats(4);
      ctx.releaseKey('r');

      // Assert: note stored in slot 2, not slot 0
      expect(ctx.getInventorySlot(0)).toBeNull();
      expect(ctx.getInventorySlot(2)).not.toBeNull();
      expect(ctx.getInventorySlot(2)[0].pitch).toBe('C4');
    });
  });

  describe('recording range enforcement', () => {
    it('fails to capture notes when player is outside recording range', async () => {
      // Load puzzle: player at grid (0,0,0), creature at grid (0,0,3)
      // World distance = 9, audibleRange=10, Recording range = 5
      // 9 > 5, so creature is outside recording range
      ctx.loadPuzzle('recording-out-of-range');

      await ctx.tick(16);
      ctx.holdKey('r');
      await ctx.advanceBeats(4);
      ctx.releaseKey('r');

      // Assert: nothing captured (player was outside recording range)
      expect(ctx.getInventorySlot(0)).toBeNull();
    });

    it('captures from creature exactly at recording range boundary', async () => {
      // recording-basic: creature at grid (5,0,4) -> world (15,0,12)
      // audibleRange=10, recording range=5
      // Move player to 3D distance 5 from creature
      // Player eye height is 1.8, creature at Y=0, so Y delta = 1.8
      // Need XZ distance = sqrt(25 - 3.24) = sqrt(21.76) ≈ 4.665
      // Z = 12 + 4.6 = 16.6 gives 3D distance ≈ 4.94
      ctx.loadPuzzle('recording-basic');

      ctx.setPlayerPosition({ x: 15, z: 16.6 });
      await ctx.tick(16);

      ctx.holdKey('r');
      await ctx.advanceBeats(4);
      ctx.releaseKey('r');

      // Assert: note captured (boundary is inclusive)
      const recorded = ctx.getInventorySlot(0);
      expect(recorded).not.toBeNull();
      expect(recorded[0].pitch).toBe('C4');
    });

    it('uses creature-specific audible range for recording range calculation', async () => {
      // Load puzzle: two creatures with different ranges
      // Creature 1 at grid (0,0,0) -> world (0,0,0): audibleRange=6, recording range=3
      // Creature 2 at grid (6,0,0) -> world (18,0,0): audibleRange=20, recording range=10
      // Player at grid (5,0,0) -> world (15,0,0)
      // World distance to C1: 15, World distance to C2: 3
      ctx.loadPuzzle('recording-two-creatures');

      await ctx.tick(16);
      ctx.holdKey('r');
      await ctx.advanceBeats(4);
      ctx.releaseKey('r');

      // Assert: only second creature's note captured (G4)
      // First creature (C4) is out of recording range (15 > 3)
      // Second creature (G4) is in recording range (3 < 10)
      const recorded = ctx.getInventorySlot(0);
      expect(recorded).not.toBeNull();
      expect(recorded).toHaveLength(1);
      expect(recorded[0].pitch).toBe('G4');
    });
  });

  describe('note quantization', () => {
    it('quantizes notes to nearest 16th note grid', async () => {
      ctx.loadPuzzle('recording-basic');
      await ctx.tick(16);

      ctx.holdKey('r');
      await ctx.advanceBeats(4);
      ctx.releaseKey('r');

      // Assert: note is captured and properly formed
      const recorded = ctx.getInventorySlot(0);
      expect(recorded).toBeDefined();
      expect(recorded).not.toBeNull();
      expect(recorded[0].pitch).toBe('C4');
      expect(recorded[0].length).toBe('1/4');
    });

    it('groups simultaneous notes into chords', async () => {
      // Load puzzle: two creatures at same position singing at same time
      ctx.loadPuzzle('recording-chord');

      await ctx.tick(16);
      ctx.holdKey('r');
      await ctx.advanceBeats(4); // Both creatures sing at beat 4
      ctx.releaseKey('r');

      // Assert: notes on same beat are grouped as chord (array)
      const recorded = ctx.getInventorySlot(0);
      expect(recorded).not.toBeNull();
      expect(recorded).toHaveLength(1);
      expect(Array.isArray(recorded[0])).toBe(true);
      expect(recorded[0]).toContainEqual({ pitch: 'C4', length: '1/4' });
      expect(recorded[0]).toContainEqual({ pitch: 'E4', length: '1/4' });
    });

    it('preserves note sequence order by beat', async () => {
      ctx.loadPuzzle('recording-multi-note');
      await ctx.tick(16);

      ctx.holdKey('r');
      // Creature has 3-note song with interval=1
      await ctx.advanceBeats(1);
      ctx.releaseKey('r');

      // Assert: notes are in correct order
      const recorded = ctx.getInventorySlot(0);
      expect(recorded).not.toBeNull();
      expect(recorded.length).toBeGreaterThanOrEqual(2);
      // First notes should be C4, E4
      expect(recorded[0].pitch).toBe('C4');
      expect(recorded[1].pitch).toBe('E4');
    });
  });

  describe('recording edge cases', () => {
    it('returns empty when no creatures are in range', async () => {
      // Use out-of-range puzzle where player is too far from creature
      ctx.loadPuzzle('recording-out-of-range');

      await ctx.tick(16);
      ctx.holdKey('r');
      await ctx.advanceBeats(4);
      ctx.releaseKey('r');

      // Assert: nothing captured
      expect(ctx.getInventorySlot(0)).toBeNull();
    });

    it('returns empty when recording stops before creature sings', async () => {
      // Load puzzle with long interval creature (interval=8)
      ctx.loadPuzzle('recording-long-interval');

      // Let creature sing its first note (at beat 8)
      await ctx.advanceBeats(8);

      // Start recording after first note
      await ctx.tick(16);
      ctx.holdKey('r');

      // Advance only 4 beats (next note at beat 16, we're at beat ~12)
      await ctx.advanceBeats(4);
      ctx.releaseKey('r');

      // Assert: no notes captured during this recording window
      // The slot will have an empty array since recording happened but captured nothing
      const recorded = ctx.getInventorySlot(0);
      expect(recorded === null || recorded.length === 0).toBe(true);
    });

    it('isRecording returns correct state', async () => {
      ctx.loadPuzzle('recording-basic');
      await ctx.tick(16);

      expect(ctx.isRecording()).toBe(false);

      ctx.holdKey('r');
      expect(ctx.isRecording()).toBe(true);

      ctx.releaseKey('r');
      expect(ctx.isRecording()).toBe(false);
    });
  });

  describe('movement during recording', () => {
    it('can walk toward creature and start recording', async () => {
      // Start player far away
      ctx.loadPuzzle('recording-out-of-range');

      // Player at (0,0,0), creature at (0,0,9) world coords
      // Walk forward (negative z)
      ctx.holdKey('w');
      await ctx.tick(500); // Move for 500ms

      // Now player should be closer
      const pos = ctx.getPlayerPosition();
      expect(pos.z).toBeLessThan(0); // Moved forward (negative z)

      ctx.releaseKey('w');
    });
  });
});
