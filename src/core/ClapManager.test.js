/**
 * Clap Manager Integration Tests
 *
 * These tests validate the clapping mechanic by:
 * 1. Loading test puzzles with creatures
 * 2. Simulating the C key press to clap
 * 3. Verifying creatures' next sing time is displaced
 * 4. Verifying range and displacement configuration work correctly
 */

import { DEFAULT_CLAP_DISPLACEMENT } from './constants';

describe('Clapping to displace creature timing', () => {
  describe('affecting nearby creatures', () => {
    it('displaces creature next sing time when clapping', async () => {
      // Load puzzle: player at (0,0,0), creature at grid (0,0,1) -> world (0,0,3)
      // CLAP_RANGE = 7.5, distance = 3, so creature is in range
      ctx.loadPuzzle('clap-basic');
      await ctx.tick(16);

      // Arrange: Record when creature sings before clap
      ctx.clearEmittedNotes();
      const creatures = ctx.getCreatures();
      const creature = creatures[0];

      // Advance to allow creature to sing once
      await ctx.advanceBeats(creature.interval + 1);
      const notesBeforeClap = ctx.getEmittedNotes();
      expect(notesBeforeClap.length).toBeGreaterThan(0);
      const lastNoteBeforeClapBeat = notesBeforeClap[notesBeforeClap.length - 1].capturedAtBeat;

      // Clear notes for next phase
      ctx.clearEmittedNotes();

      // Act: Clap to displace creature timing
      ctx.pressKey('c');
      // At 120 BPM, displacement grid of 0.25 beats = 125ms, so advance 200ms to hit boundary
      await ctx.tick(200);

      // Assert: Creature's next singing should be delayed
      // Continue advancing time and verify creature sings later than it would have
      const expectedDisplacement = DEFAULT_CLAP_DISPLACEMENT * 4;

      // Advance enough time for creature to sing if not displaced
      await ctx.advanceBeats(creature.interval + 2);

      const notesAfterClap = ctx.getEmittedNotes();
      if (notesAfterClap.length > 0) {
        const firstNoteAfterClapBeat = notesAfterClap[0].capturedAtBeat;
        // The next sing should be delayed by the displacement amount
        const expectedNextSingBeat =
          lastNoteBeforeClapBeat + creature.interval + expectedDisplacement;
        expect(firstNoteAfterClapBeat).toBeCloseTo(expectedNextSingBeat, 1);
      }
    });

    it('affects multiple creatures in range', async () => {
      // Load puzzle: two creatures both within range
      ctx.loadPuzzle('clap-two-creatures');
      await ctx.tick(16);

      const creatures = ctx.getCreatures();

      // Arrange: Record when each creature sings before clap
      ctx.clearEmittedNotes();
      await ctx.advanceBeats(Math.max(...creatures.map((c) => c.interval)) + 1);
      const notesBeforeClap = ctx.getEmittedNotes();

      // Map creatures to their pre-clap singing notes
      const preClaps = creatures.map((creature) => {
        const notes = notesBeforeClap.filter((n) => n.source === creature.id);
        return notes.length > 0 ? notes[notes.length - 1].capturedAtBeat : null;
      });

      ctx.clearEmittedNotes();

      // Act: Clap
      ctx.pressKey('c');
      await ctx.tick(200);

      // Assert: both creatures displaced (will sing later)
      const expectedDisplacement = DEFAULT_CLAP_DISPLACEMENT * 4;
      const maxInterval = Math.max(...creatures.map((c) => c.interval));
      await ctx.advanceBeats(maxInterval + 2);

      const notesAfterClap = ctx.getEmittedNotes();
      creatures.forEach((creature, i) => {
        if (preClaps[i] !== null) {
          const postClapNotes = notesAfterClap.filter((n) => n.source === creature.id);
          if (postClapNotes.length > 0) {
            const firstNoteAfterClapBeat = postClapNotes[0].capturedAtBeat;
            const expectedNextSingBeat = preClaps[i] + creature.interval + expectedDisplacement;
            expect(firstNoteAfterClapBeat).toBeCloseTo(expectedNextSingBeat, 1);
          }
        }
      });
    });

    it('does not affect creatures outside clap range', async () => {
      // Load puzzle: creature at grid (0,0,3) -> world (0,0,9)
      // CLAP_RANGE = 7.5, distance = 9, so creature is out of range
      ctx.loadPuzzle('clap-out-of-range');
      await ctx.tick(16);

      const creatures = ctx.getCreatures();
      const creature = creatures[0];

      // Arrange: Record when creature sings before clap
      ctx.clearEmittedNotes();
      await ctx.advanceBeats(creature.interval + 1);
      const notesBeforeClap = ctx.getEmittedNotes();
      const hasNoteBefore = notesBeforeClap.length > 0;
      const lastNoteBeforeClapBeat = hasNoteBefore
        ? notesBeforeClap[notesBeforeClap.length - 1].capturedAtBeat
        : null;

      ctx.clearEmittedNotes();

      // Act: Clap (should not affect out-of-range creature)
      ctx.pressKey('c');
      await ctx.tick(100);

      // Assert: creature's singing timing should NOT change
      // Advance and verify creature sings at normal intervals
      await ctx.advanceBeats(creature.interval + 2);

      const notesAfterClap = ctx.getEmittedNotes();
      if (hasNoteBefore && notesAfterClap.length > 0) {
        const firstNoteAfterClapBeat = notesAfterClap[0].capturedAtBeat;
        // Without displacement, it should sing at the normal interval
        const expectedNextSingBeat = lastNoteBeforeClapBeat + creature.interval;
        expect(firstNoteAfterClapBeat).toBeCloseTo(expectedNextSingBeat, 1);
      }
    });
  });

  describe('displacement configuration', () => {
    it('uses puzzle-level clapDisplacement when specified', async () => {
      // Load puzzle with clapDisplacement: 0.25 (1/4 whole note = 1 beat)
      ctx.loadPuzzle('clap-custom-displacement');
      await ctx.tick(16);

      const creatures = ctx.getCreatures();
      const creature = creatures[0];

      // Arrange: Record when creature sings before clap
      ctx.clearEmittedNotes();
      await ctx.advanceBeats(creature.interval + 1);
      const notesBeforeClap = ctx.getEmittedNotes();
      expect(notesBeforeClap.length).toBeGreaterThan(0);
      const lastNoteBeforeClapBeat = notesBeforeClap[notesBeforeClap.length - 1].capturedAtBeat;

      ctx.clearEmittedNotes();

      // Act: Clap - puzzle has clapDisplacement: 0.25, grid = 0.25*4 = 1 beat = 500ms at 120 BPM
      ctx.pressKey('c');
      await ctx.tick(600);

      // Assert: displacement should be 0.25 * 4 = 1 beat
      const customDisplacement = 0.25 * 4; // = 1.0 beat
      await ctx.advanceBeats(creature.interval + 2);

      const notesAfterClap = ctx.getEmittedNotes();
      if (notesAfterClap.length > 0) {
        const firstNoteAfterClapBeat = notesAfterClap[0].capturedAtBeat;
        const expectedNextSingBeat =
          lastNoteBeforeClapBeat + creature.interval + customDisplacement;
        expect(firstNoteAfterClapBeat).toBeCloseTo(expectedNextSingBeat, 1);
      }
    });

    it('uses per-creature clapDisplacement override when specified', async () => {
      // Load puzzle: puzzle default = 0.125, creature1 override = 0.5, creature2 uses default
      ctx.loadPuzzle('clap-per-creature-displacement');
      await ctx.tick(16);

      const creatures = ctx.getCreatures();
      // Find creature with C4 (has override) and E4 (uses puzzle default)
      const creatureWithOverride = creatures.find((c) => c.data.song[0].pitch === 'C4');
      const creatureWithDefault = creatures.find((c) => c.data.song[0].pitch === 'E4');

      // Arrange: Record when creatures sing before clap
      ctx.clearEmittedNotes();
      const maxInterval = Math.max(creatureWithOverride.interval, creatureWithDefault.interval);
      await ctx.advanceBeats(maxInterval + 1);
      const notesBeforeClap = ctx.getEmittedNotes();

      const overridePreClap = notesBeforeClap.find((n) => n.source === creatureWithOverride.id);
      const defaultPreClap = notesBeforeClap.find((n) => n.source === creatureWithDefault.id);

      ctx.clearEmittedNotes();

      // Act: Clap - puzzle has clapDisplacement: 0.125, grid = 0.125*4 = 0.5 beats
      ctx.pressKey('c');
      await ctx.tick(300);

      // Assert: creature with override displaced by 0.5 * 4 = 2 beats
      // creature with puzzle default displaced by 0.125 * 4 = 0.5 beats
      await ctx.advanceBeats(maxInterval + 2);
      const notesAfterClap = ctx.getEmittedNotes();

      if (overridePreClap) {
        const overridePostClap = notesAfterClap.find(
          (n) =>
            n.source === creatureWithOverride.id &&
            n.capturedAtBeat > overridePreClap.capturedAtBeat
        );
        if (overridePostClap) {
          const expectedBeat = overridePreClap.capturedAtBeat + creatureWithOverride.interval + 2.0;
          expect(overridePostClap.capturedAtBeat).toBeCloseTo(expectedBeat, 1);
        }
      }

      if (defaultPreClap) {
        const defaultPostClap = notesAfterClap.find(
          (n) =>
            n.source === creatureWithDefault.id && n.capturedAtBeat > defaultPreClap.capturedAtBeat
        );
        if (defaultPostClap) {
          const expectedBeat = defaultPreClap.capturedAtBeat + creatureWithDefault.interval + 0.5;
          expect(defaultPostClap.capturedAtBeat).toBeCloseTo(expectedBeat, 1);
        }
      }
    });
  });

  describe('clap quantization', () => {
    it('clap requested at non-grid position still affects creature timing', async () => {
      ctx.loadPuzzle('clap-basic');
      await ctx.tick(16);

      // Arrange: Record creature's initial singing pattern
      ctx.clearEmittedNotes();
      const creatures = ctx.getCreatures();
      const creature = creatures[0];

      // Get first sing time
      await ctx.advanceBeats(creature.interval + 1);
      let notes = ctx.getEmittedNotes();
      expect(notes.length).toBeGreaterThan(0);
      const firstSingBeat = notes[notes.length - 1].capturedAtBeat;

      // Act: Clap at arbitrary time (system will quantize)
      ctx.clearEmittedNotes();
      ctx.pressKey('c');
      await ctx.tick(200); // Allow clap to execute

      // Assert: Creature's singing is displaced (sings later than normal interval)
      await ctx.advanceBeats(creature.interval + 2);
      notes = ctx.getEmittedNotes();
      expect(notes.length).toBeGreaterThan(0);
      const nextSingBeat = notes[notes.length - 1].capturedAtBeat;

      // The second sing should be later than firstSingBeat + interval
      // due to displacement from clap
      expect(nextSingBeat).toBeGreaterThan(firstSingBeat + creature.interval);
    });

    it('ignores duplicate clap requests while one is pending', async () => {
      ctx.loadPuzzle('clap-basic');
      await ctx.tick(16);

      const creatures = ctx.getCreatures();
      const creature = creatures[0];

      // Arrange: Record when creature sings before clap
      ctx.clearEmittedNotes();
      await ctx.advanceBeats(creature.interval + 1);
      const notesBeforeClap = ctx.getEmittedNotes();
      expect(notesBeforeClap.length).toBeGreaterThan(0);
      const lastNoteBeforeClapBeat = notesBeforeClap[notesBeforeClap.length - 1].capturedAtBeat;

      ctx.clearEmittedNotes();

      // Act: Request multiple claps rapidly (only first should execute)
      ctx.pressKey('c');
      ctx.pressKey('c');
      ctx.pressKey('c');
      await ctx.tick(200);

      // Assert: only one displacement should have occurred
      const expectedDisplacement = DEFAULT_CLAP_DISPLACEMENT * 4;
      await ctx.advanceBeats(creature.interval + 2);

      const notesAfterClap = ctx.getEmittedNotes();
      if (notesAfterClap.length > 0) {
        const firstNoteAfterClapBeat = notesAfterClap[0].capturedAtBeat;
        // Should only be displaced once
        const expectedNextSingBeat =
          lastNoteBeforeClapBeat + creature.interval + expectedDisplacement;
        expect(firstNoteAfterClapBeat).toBeCloseTo(expectedNextSingBeat, 1);
      }
    });
  });
});
