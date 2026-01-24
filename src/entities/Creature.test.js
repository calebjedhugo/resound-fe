/**
 * Creature Integration Tests
 *
 * These tests validate creature behaviors by:
 * 1. Loading test puzzles with creatures
 * 2. Playing recorded songs to create harmony/dissonance
 * 3. Verifying creature movement based on consonance/dissonance
 * 4. Testing audible range and singing timing
 *
 * Note: Tests are async because tick() uses jest.runAllTimersAsync()
 * to properly handle async instrument playback.
 */

import HarmonyAnalyzer from 'core/HarmonyAnalyzer';
import PlaybackManager from 'core/PlaybackManager';

/**
 * Creature movement tests using real timers
 *
 * WHY REAL TIMERS: Movement requires detecting simultaneous playback - both
 * the creature AND player must have active notes at the same moment. With fake
 * timers, jest.runAllTimersAsync() resolves all pending setTimeout callbacks
 * at once, causing notes to start and end before the entity update loop runs.
 * It's difficult to orchestrate both instruments into an "actively playing"
 * state during the same update cycle.
 *
 * With real timers, small delays in realTimeUpdate() let instrument callbacks
 * fire naturally between entity updates, creating genuine note overlap.
 *
 * These tests use high BPM (480) for faster execution - a whole note is 500ms.
 */
describe('Creature movement from consonance/dissonance', () => {
  // Helper to run game loop updates with real timers
  const realTimeUpdate = async (testCtx, durationMs, stepMs = 16) => {
    const steps = Math.ceil(durationMs / stepMs);
    const entityManager = testCtx.getEntityManager();

    for (let i = 0; i < steps; i += 1) {
      const dt = stepMs / 1000;

      // Update musical clock
      const clock = testCtx.getMusicalClock();
      if (clock) {
        clock.update(dt);
      }

      // Update all entities
      entityManager.update(dt);

      // Small real delay to let instrument timers fire
      // eslint-disable-next-line no-promise-executor-return
      await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
  };

  // Helper to start player instrument playback (works with real timers)
  // Uses high BPM (480) and whole note for faster test execution
  const startPlayerPlayback = async (testCtx, pitch) => {
    const playerInstrument = PlaybackManager.getPlayerInstrument();
    playerInstrument.sourcePosition = testCtx.getPlayerPosition();
    playerInstrument.play({
      data: [{ pitch, length: '1/1' }],
      tempo: 480,
      basis: 4,
    });
    PlaybackManager.isPlaying = true;
    // Wait for instrument to start
    // eslint-disable-next-line no-promise-executor-return
    await new Promise((resolve) => setTimeout(resolve, 20));
  };

  beforeEach(() => {
    // Switch to real timers for movement tests
    jest.useRealTimers();
    // Reset PlaybackManager state
    PlaybackManager.isPlaying = false;
    PlaybackManager.playerInstrument.currentNote = null;
    // Stop any playing instruments
    PlaybackManager.playerInstrument.stop?.();
  });

  afterEach(() => {
    // Stop any playback and reset state
    PlaybackManager.isPlaying = false;
    PlaybackManager.playerInstrument.currentNote = null;
    PlaybackManager.playerInstrument.stop?.();
    // Restore fake timers for other tests
    jest.useFakeTimers();
  });

  describe('attraction from consonant intervals', () => {
    it('moves toward player when player plays consonant interval (major 3rd)', async () => {
      ctx.loadPuzzle('creature-consonance');

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      // Start playback immediately and run long enough to cover multiple singing cycles
      await startPlayerPlayback(ctx, 'E4');
      await realTimeUpdate(ctx, 800);

      expect(creature.position.x).toBeLessThan(originalX);
    }, 10000);

    it('moves toward player when player plays consonant interval (minor 3rd)', async () => {
      ctx.loadPuzzle('creature-consonance');

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      await startPlayerPlayback(ctx, 'Eb4');
      await realTimeUpdate(ctx, 800);

      expect(creature.position.x).toBeLessThan(originalX);
    }, 10000);

    it('moves toward player when player plays consonant interval (major 6th)', async () => {
      ctx.loadPuzzle('creature-consonance');

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      await startPlayerPlayback(ctx, 'A4');
      await realTimeUpdate(ctx, 800);

      expect(creature.position.x).toBeLessThan(originalX);
    }, 10000);
  });

  describe('repulsion from dissonant intervals', () => {
    it('moves away from player when player plays dissonant interval (minor 2nd)', async () => {
      ctx.loadPuzzle('creature-dissonance');

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      await startPlayerPlayback(ctx, 'C#4');
      await realTimeUpdate(ctx, 800);

      expect(creature.position.x).toBeGreaterThan(originalX);
    }, 10000);

    it('moves away from player when player plays dissonant interval (tritone)', async () => {
      ctx.loadPuzzle('creature-dissonance');

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      await startPlayerPlayback(ctx, 'F#4');
      await realTimeUpdate(ctx, 800);

      expect(creature.position.x).toBeGreaterThan(originalX);
    }, 10000);

    it('moves away from player when player plays dissonant interval (major 7th)', async () => {
      ctx.loadPuzzle('creature-dissonance');

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      await startPlayerPlayback(ctx, 'B4');
      await realTimeUpdate(ctx, 800);

      expect(creature.position.x).toBeGreaterThan(originalX);
    }, 10000);
  });

  describe('no movement from perfect intervals', () => {
    it('does not move when player plays unison (same pitch)', async () => {
      ctx.loadPuzzle('creature-perfect-interval');

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      await startPlayerPlayback(ctx, 'C4');
      await realTimeUpdate(ctx, 800);

      expect(creature.position.x).toBeCloseTo(originalX, 1);
    }, 10000);

    it('does not move when player plays octave', async () => {
      ctx.loadPuzzle('creature-perfect-interval');

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      await startPlayerPlayback(ctx, 'C5');
      await realTimeUpdate(ctx, 800);

      expect(creature.position.x).toBeCloseTo(originalX, 1);
    }, 10000);

    it('does not move when player plays perfect 5th', async () => {
      ctx.loadPuzzle('creature-perfect-interval');

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      await startPlayerPlayback(ctx, 'G4');
      await realTimeUpdate(ctx, 800);

      expect(creature.position.x).toBeCloseTo(originalX, 1);
    }, 10000);

    it('does not move when player plays perfect 4th', async () => {
      ctx.loadPuzzle('creature-perfect-interval');

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      await startPlayerPlayback(ctx, 'F4');
      await realTimeUpdate(ctx, 800);

      expect(creature.position.x).toBeCloseTo(originalX, 1);
    }, 10000);
  });

  describe('only reacting while singing', () => {
    it('does not move when creature is not singing', async () => {
      // Use singing-timing fixture: interval=8, so creature sings at beat 0, then not until beat 8
      // At 480 BPM, a quarter note is 125ms, 8 beats is 1000ms
      ctx.loadPuzzle('creature-singing-timing');

      // Advance past the first song (D4 quarter note = 125ms at 480 BPM)
      await realTimeUpdate(ctx, 200);

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      // Now creature is resting (not singing until beat 8)
      await startPlayerPlayback(ctx, 'C#4');
      await realTimeUpdate(ctx, 400);

      // Should not move since creature isn't singing
      expect(creature.position.x).toBeCloseTo(originalX, 1);
    }, 10000);

    it('moves when creature is actively singing', async () => {
      ctx.loadPuzzle('creature-dissonance');

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      // C#4 against C4 = minor 2nd = dissonant = repulsion
      await startPlayerPlayback(ctx, 'C#4');
      await realTimeUpdate(ctx, 800);

      expect(creature.position.x).toBeGreaterThan(originalX);
    }, 10000);
  });
});

/**
 * Creature-to-creature harmony tests using real timers
 */
describe('Creature-to-creature harmony', () => {
  // Helper to run game loop updates with real timers
  const realTimeUpdate = async (testCtx, durationMs, stepMs = 16) => {
    const steps = Math.ceil(durationMs / stepMs);
    const entityManager = testCtx.getEntityManager();

    for (let i = 0; i < steps; i += 1) {
      const dt = stepMs / 1000;

      const clock = testCtx.getMusicalClock();
      if (clock) {
        clock.update(dt);
      }

      entityManager.update(dt);
      // eslint-disable-next-line no-promise-executor-return
      await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
  };

  beforeEach(() => {
    jest.useRealTimers();
    PlaybackManager.isPlaying = false;
    PlaybackManager.playerInstrument.currentNote = null;
    PlaybackManager.playerInstrument.stop?.();
  });

  afterEach(() => {
    PlaybackManager.isPlaying = false;
    PlaybackManager.playerInstrument.currentNote = null;
    PlaybackManager.playerInstrument.stop?.();
    jest.useFakeTimers();
  });

  it('creatures react to each other when singing simultaneously', async () => {
    ctx.loadPuzzle('creature-two-creatures-harmony');

    const creatures = ctx.getCreatures();
    const creature1 = creatures.find((c) => c.data.song[0].pitch === 'C4');
    const creature2 = creatures.find((c) => c.data.song[0].pitch === 'E4');

    const original1X = creature1.position.x;
    const original2X = creature2.position.x;

    // Both creatures sing at beat 0 with half notes (1000ms)
    // C4 + E4 = major 3rd = consonant = attraction toward each other
    await realTimeUpdate(ctx, 400);

    // Creature1 (C4) should move toward creature2 (positive x)
    // Creature2 (E4) should move toward creature1 (negative x)
    expect(creature1.position.x).toBeGreaterThan(original1X);
    expect(creature2.position.x).toBeLessThan(original2X);
  }, 10000);
});

describe('Creature singing at correct intervals', () => {
  it('sings at the specified interval', async () => {
    // Load puzzle with interval=8
    ctx.loadPuzzle('creature-singing-timing');

    // Creature sings at beat 0 (nextSingBeat starts at 0)
    // Need to advance enough time for instrument to play and emit note
    await ctx.advanceBeats(1);

    const initialNotes = ctx.getEmittedNotes();
    // Filter for creature notes - exclude player notes (source !== 'player')
    const creatureNotes = initialNotes.filter((n) => n.source !== 'player');

    // Creature should have sung D4 at beat 0
    expect(creatureNotes.length).toBeGreaterThan(0);
    expect(creatureNotes.some((n) => n.pitch === 'D4')).toBe(true);

    // Clear and advance to next sing time (interval=8)
    ctx.clearEmittedNotes();
    await ctx.advanceBeats(8);

    // Assert: creature sang again (D4 note emitted at beat 8)
    const notes = ctx.getEmittedNotes();
    const laterCreatureNotes = notes.filter((n) => n.source !== 'player');
    expect(laterCreatureNotes.length).toBeGreaterThan(0);
    expect(laterCreatureNotes.some((n) => n.pitch === 'D4')).toBe(true);
  });

  it('sings repeatedly at interval boundaries', async () => {
    // Use singing-timing fixture: D4 quarter note, interval=8
    ctx.loadPuzzle('creature-singing-timing');

    // Capture first song at beat 0
    await ctx.advanceBeats(1);
    const firstNotes = ctx.getEmittedNotes();
    const firstD4 = firstNotes.filter((n) => n.source !== 'player' && n.pitch === 'D4');
    expect(firstD4.length).toBe(1);

    ctx.clearEmittedNotes();

    // Advance to beat 8 + 1 to capture second song
    await ctx.advanceBeats(8);
    const secondNotes = ctx.getEmittedNotes();
    const secondD4 = secondNotes.filter((n) => n.source !== 'player' && n.pitch === 'D4');
    expect(secondD4.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Creature audible range', () => {
  it('updates volume based on distance to player', async () => {
    // Creature at grid (5,0,0) -> world (15,0,0), audibleRange=10
    // Player at (0,0,0) -> distance = 15, which is > audibleRange
    ctx.loadPuzzle('creature-audible-range');
    await ctx.tick(16);

    const creatures = ctx.getCreatures();
    const creature = creatures[0];

    // Initially player is out of audible range (distance 15 > range 10)
    // The instrument uses volumeMultiplier, not volume
    expect(creature.instrument.volumeMultiplier).toBe(0);
  });

  it('player can hear creature when within audible range', async () => {
    ctx.loadPuzzle('creature-audible-range');

    // Move player closer to creature (creature at world x=15)
    ctx.setPlayerPosition({ x: 10, y: 0, z: 0 });
    await ctx.tick(16);

    const creatures = ctx.getCreatures();
    const creature = creatures[0];

    // Now distance is 5, which is < audibleRange 10
    expect(creature.instrument.volumeMultiplier).toBeGreaterThan(0);
  });

  it('sets isRecordable when player is within recording range', async () => {
    ctx.loadPuzzle('creature-audible-range');

    const creatures = ctx.getCreatures();
    const creature = creatures[0];

    // Recording range = audibleRange * 0.5 = 5
    // Move player to distance 4 (within recording range)
    ctx.setPlayerPosition({ x: 11, y: 0, z: 0 });
    await ctx.tick(16);

    expect(creature.isRecordable).toBe(true);
  });

  it('does not set isRecordable when outside recording range but inside audible range', async () => {
    ctx.loadPuzzle('creature-audible-range');

    const creatures = ctx.getCreatures();
    const creature = creatures[0];

    // Recording range = 5, audible range = 10
    // Move player to distance 7 (inside audible, outside recording)
    ctx.setPlayerPosition({ x: 8, y: 0, z: 0 });
    await ctx.tick(16);

    expect(creature.isRecordable).toBe(false);
    expect(creature.instrument.volumeMultiplier).toBeGreaterThan(0);
  });
});

describe('HarmonyAnalyzer interval classification', () => {
  // These are unit tests for the interval classification logic
  // to ensure our test assumptions are correct

  it('classifies unison as perfect', () => {
    const interval = HarmonyAnalyzer.calculateInterval('C4', 'C4');
    expect(HarmonyAnalyzer.classifyInterval(interval)).toBe('perfect');
  });

  it('classifies octave as perfect', () => {
    const interval = HarmonyAnalyzer.calculateInterval('C4', 'C5');
    expect(HarmonyAnalyzer.classifyInterval(interval)).toBe('perfect');
  });

  it('classifies perfect 5th as perfect', () => {
    const interval = HarmonyAnalyzer.calculateInterval('C4', 'G4');
    expect(HarmonyAnalyzer.classifyInterval(interval)).toBe('perfect');
  });

  it('classifies perfect 4th as perfect', () => {
    const interval = HarmonyAnalyzer.calculateInterval('C4', 'F4');
    expect(HarmonyAnalyzer.classifyInterval(interval)).toBe('perfect');
  });

  it('classifies major 3rd as consonant', () => {
    const interval = HarmonyAnalyzer.calculateInterval('C4', 'E4');
    expect(HarmonyAnalyzer.classifyInterval(interval)).toBe('consonant');
  });

  it('classifies minor 3rd as consonant', () => {
    const interval = HarmonyAnalyzer.calculateInterval('C4', 'Eb4');
    expect(HarmonyAnalyzer.classifyInterval(interval)).toBe('consonant');
  });

  it('classifies major 6th as consonant', () => {
    const interval = HarmonyAnalyzer.calculateInterval('C4', 'A4');
    expect(HarmonyAnalyzer.classifyInterval(interval)).toBe('consonant');
  });

  it('classifies minor 6th as consonant', () => {
    const interval = HarmonyAnalyzer.calculateInterval('C4', 'Ab4');
    expect(HarmonyAnalyzer.classifyInterval(interval)).toBe('consonant');
  });

  it('classifies minor 2nd as dissonant', () => {
    const interval = HarmonyAnalyzer.calculateInterval('C4', 'C#4');
    expect(HarmonyAnalyzer.classifyInterval(interval)).toBe('dissonant');
  });

  it('classifies major 2nd as dissonant', () => {
    const interval = HarmonyAnalyzer.calculateInterval('C4', 'D4');
    expect(HarmonyAnalyzer.classifyInterval(interval)).toBe('dissonant');
  });

  it('classifies tritone as dissonant', () => {
    const interval = HarmonyAnalyzer.calculateInterval('C4', 'F#4');
    expect(HarmonyAnalyzer.classifyInterval(interval)).toBe('dissonant');
  });

  it('classifies minor 7th as dissonant', () => {
    const interval = HarmonyAnalyzer.calculateInterval('C4', 'Bb4');
    expect(HarmonyAnalyzer.classifyInterval(interval)).toBe('dissonant');
  });

  it('classifies major 7th as dissonant', () => {
    const interval = HarmonyAnalyzer.calculateInterval('C4', 'B4');
    expect(HarmonyAnalyzer.classifyInterval(interval)).toBe('dissonant');
  });
});
