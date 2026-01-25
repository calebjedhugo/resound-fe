/**
 * HarmonyAnalyzer Integration Tests
 *
 * These tests validate how harmony analysis affects creature behavior.
 * HarmonyAnalyzer determines whether creatures move toward (consonant),
 * away (dissonant), or stay still (perfect/none) based on harmonic intervals.
 *
 * Tests use the standard test context API with fake timers.
 */

describe('Creature reaction to harmonic intervals', () => {
  /**
   * Helper to set up player playback of a specific pitch
   * Uses the test context API instead of direct PlaybackManager manipulation
   */
  const setupPlayerSong = (pitch) => {
    // Create a song with the specified pitch at 480 BPM (whole note = 500ms)
    const song = [{ pitch, length: '1/1' }];
    ctx.setInventorySlot(0, song);
    ctx.setActiveSlot(0);
  };

  describe('creature does not react when notes do not overlap in time', () => {
    it('creature stays still when player plays after creature finishes singing', async () => {
      // creature-singing-timing has interval=8, so creature sings at beat 0,
      // then rests until beat 8. At 480 BPM, a quarter note is 125ms.
      ctx.loadPuzzle('creature-singing-timing');

      // Advance past the creature's first song (D4 quarter note at 480 BPM = 125ms)
      await ctx.advanceBeats(2);

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      // Now play a dissonant note (minor 2nd: D4 vs D#4)
      // Creature should NOT react since it's not currently singing
      setupPlayerSong('D#4');
      ctx.holdKey('space');
      await ctx.advanceBeats(4);

      // Creature should not have moved
      expect(creature.position.x).toBeCloseTo(originalX, 1);
    });
  });

  describe('creature reacts based on interval quality', () => {
    it('creature moves toward player when hearing major third (consonant)', async () => {
      ctx.loadPuzzle('creature-consonance');

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      // Creature sings C4, player plays E4 = major 3rd = consonant = attraction
      setupPlayerSong('E4');
      ctx.holdKey('space');
      await ctx.advanceBeats(4);

      expect(creature.position.x).toBeLessThan(originalX);
    });

    it('creature moves away from player when hearing minor second (dissonant)', async () => {
      ctx.loadPuzzle('creature-dissonance');

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      // Creature sings C4, player plays C#4 = minor 2nd = dissonant = repulsion
      setupPlayerSong('C#4');
      ctx.holdKey('space');
      await ctx.advanceBeats(4);

      expect(creature.position.x).toBeGreaterThan(originalX);
    });

    it('creature stays still when hearing perfect fifth', async () => {
      ctx.loadPuzzle('creature-perfect-interval');

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      // Creature sings C4, player plays G4 = perfect 5th = no movement
      setupPlayerSong('G4');
      ctx.holdKey('space');
      await ctx.advanceBeats(4);

      expect(creature.position.x).toBeCloseTo(originalX, 1);
    });

    it('creature stays still when hearing unison', async () => {
      ctx.loadPuzzle('creature-perfect-interval');

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      // Creature sings C4, player plays C4 = unison = no movement
      setupPlayerSong('C4');
      ctx.holdKey('space');
      await ctx.advanceBeats(4);

      expect(creature.position.x).toBeCloseTo(originalX, 1);
    });

    it('creature stays still when hearing octave', async () => {
      ctx.loadPuzzle('creature-perfect-interval');

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      // Creature sings C4, player plays C5 = octave = no movement
      setupPlayerSong('C5');
      ctx.holdKey('space');
      await ctx.advanceBeats(4);

      expect(creature.position.x).toBeCloseTo(originalX, 1);
    });
  });

  describe('creatures react to each other based on harmony', () => {
    it('two creatures singing consonant interval move toward each other', async () => {
      // Two creatures: one sings C4, one sings E4 (major 3rd = consonant)
      ctx.loadPuzzle('creature-two-creatures-harmony');

      const creatures = ctx.getCreatures();
      const creatureC4 = creatures.find((c) => c.data.song[0].pitch === 'C4');
      const creatureE4 = creatures.find((c) => c.data.song[0].pitch === 'E4');

      const originalC4X = creatureC4.position.x;
      const originalE4X = creatureE4.position.x;

      // Both creatures sing at beat 0 with whole notes
      // C4 + E4 = major 3rd = consonant = attraction toward each other
      await ctx.advanceBeats(4);

      // Both creatures should move toward each other
      expect(creatureC4.position.x).toBeGreaterThan(originalC4X);
      expect(creatureE4.position.x).toBeLessThan(originalE4X);
    });
  });
});
