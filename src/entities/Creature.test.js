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
    testCtx.startPlayerPlayback([{ pitch, length: '1/1' }], 480);
    // Wait for instrument to start
    // eslint-disable-next-line no-promise-executor-return
    await new Promise((resolve) => setTimeout(resolve, 20));
  };

  beforeEach(() => {
    // Switch to real timers for movement tests
    jest.useRealTimers();
    // Reset playback state using test context API
    ctx.resetPlaybackState();
  });

  afterEach(() => {
    // Stop any playback and reset state using test context API
    ctx.stopPlayerPlayback();
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
 * Wall-sliding collision response (core/SlideResolver): a creature pushed into
 * a wall at an angle must slide ALONG the wall, not stop dead. A creature
 * pushed straight into a wall must still stop.
 */
describe('Creature wall sliding', () => {
  // Drive the loop while KEEPING the player continuously "singing": one whole
  // note lasts ~500ms at 480 BPM, so re-trigger playback every ~400ms so the
  // creature feels a sustained force (long enough to reach a wall and slide).
  const pullContinuously = async (testCtx, pitch, durationMs, stepMs = 16) => {
    const steps = Math.ceil(durationMs / stepMs);
    const entityManager = testCtx.getEntityManager();
    const retriggerEvery = Math.round(400 / stepMs);
    for (let i = 0; i < steps; i += 1) {
      if (i % retriggerEvery === 0) {
        testCtx.startPlayerPlayback([{ pitch, length: '1/1' }], 480);
      }
      const dt = stepMs / 1000;
      const clock = testCtx.getMusicalClock();
      if (clock) clock.update(dt);
      entityManager.update(dt);
      // eslint-disable-next-line no-promise-executor-return
      await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
  };

  beforeEach(() => {
    jest.useRealTimers();
    ctx.resetPlaybackState();
  });

  afterEach(() => {
    ctx.stopPlayerPlayback();
    jest.useFakeTimers();
  });

  // Wall row spans grid z=6 (world z=18, south face z=19.5). Creature (C4) starts
  // just south of it at world (30, 21); pressed on that face it sits at z~20.4.
  it('slides along a wall when pushed into it diagonally', async () => {
    ctx.loadPuzzle('creature-wall-slide');
    const creature = ctx.getCreatures()[0];
    const startX = creature.position.x; // 30
    // Player NORTHEAST of the creature and BEYOND the wall: attraction (major 3rd)
    // pulls it north (into the wall) AND east (along it).
    ctx.setPlayerPosition({ x: 15 * 3, y: 0, z: 3 * 3 }); // world (45, 9)

    await pullContinuously(ctx, 'E4', 6000); // E4 is consonant with C4 => attraction

    // Slid EAST along the wall: the wall-parallel (x) axis advanced well past
    // start even though the wall-normal (north/z) axis was blocked the whole time.
    expect(creature.position.x).toBeGreaterThan(startX + 3);
    // ...while the blocked axis never penetrated the wall (south face z=19.5),
    // yet did reach it (a non-sliding creature would be stuck near its start z).
    expect(creature.position.z).toBeGreaterThan(19.5);
    expect(creature.position.z).toBeLessThan(23);
  }, 15000);

  it('stops dead when pushed straight into a wall (no false slide)', async () => {
    ctx.loadPuzzle('creature-wall-slide');
    const creature = ctx.getCreatures()[0];
    const startX = creature.position.x; // 30
    // Player DIRECTLY north of the creature: attraction is purely north, into the
    // wall, with no wall-parallel component to slide on.
    ctx.setPlayerPosition({ x: 10 * 3, y: 0, z: 3 * 3 }); // world (30, 9), same x as creature

    await pullContinuously(ctx, 'E4', 6000);

    // No lateral drift, and it did not cross the wall
    expect(Math.abs(creature.position.x - startX)).toBeLessThan(0.5);
    expect(creature.position.z).toBeGreaterThan(19.5);
    expect(creature.position.z).toBeLessThan(23);
  }, 15000);
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
    // Reset playback state using test context API
    ctx.resetPlaybackState();
  });

  afterEach(() => {
    // Stop any playback and reset state using test context API
    ctx.stopPlayerPlayback();
    jest.useFakeTimers();
  });

  it('creatures move toward each other when singing consonant intervals', async () => {
    ctx.loadPuzzle('creature-two-creatures-harmony');

    // Puzzle has two creatures: grid x=5 -> world x=15, grid x=15 -> world x=45
    // WORLD_SCALE = 3, so grid positions are multiplied by 3
    const creatures = ctx.getCreatures();
    const leftCreature = creatures.find((c) => c.position.x < 30);
    const rightCreature = creatures.find((c) => c.position.x > 30);

    const originalLeftX = leftCreature.position.x;
    const originalRightX = rightCreature.position.x;

    // Both creatures sing at beat 0 with whole notes (1000ms at 480 BPM)
    // C4 + E4 = major 3rd = consonant = attraction toward each other
    await realTimeUpdate(ctx, 400);

    // Left creature should move right (toward other creature)
    // Right creature should move left (toward other creature)
    expect(leftCreature.position.x).toBeGreaterThan(originalLeftX);
    expect(rightCreature.position.x).toBeLessThan(originalRightX);
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
  it('creature is not recordable when player is outside audible range', async () => {
    // Creature at grid (5,0,0) -> world (15,0,0), audibleRange=10
    // Player at (0,0,0) -> distance = 15, which is > audibleRange
    ctx.loadPuzzle('creature-audible-range');
    await ctx.tick(16);

    // Initially player is out of audible range (distance 15 > range 10)
    // Verify through recording behavior - attempt to record and verify nothing captured
    ctx.holdKey('r');
    await ctx.advanceBeats(5); // Wait for creature to sing (interval=4)
    ctx.releaseKey('r');

    // Should not have recorded anything because player is out of range
    const recorded = ctx.getInventorySlot(0);
    expect(recorded).toBeNull();
  });

  it('player can record creature when within recording range', async () => {
    ctx.loadPuzzle('creature-audible-range');

    // Move player closer to creature (creature at world x=15)
    // Recording range = audibleRange * 0.5 = 5
    // Move player to distance 4 (within recording range)
    ctx.setPlayerPosition({ x: 11, y: 0, z: 0 });
    await ctx.tick(16);

    // Verify recordability through actual recording behavior
    ctx.holdKey('r');
    await ctx.advanceBeats(5); // Wait for creature to sing (interval=4)
    ctx.releaseKey('r');

    // Should have recorded the creature's song
    const recorded = ctx.getInventorySlot(0);
    expect(recorded).not.toBeNull();
    expect(recorded[0].pitch).toBe('C4');
  });

  it('can record creature song when within recording range', async () => {
    ctx.loadPuzzle('creature-audible-range');

    // Move player within recording range
    ctx.setPlayerPosition({ x: 11, y: 0, z: 0 });
    await ctx.tick(16);

    // Start recording and wait for creature to sing
    ctx.holdKey('r');
    await ctx.advanceBeats(5); // Wait for creature to sing (interval=4)
    ctx.releaseKey('r');

    // Should have recorded the creature's song
    const recorded = ctx.getInventorySlot(0);
    expect(recorded).not.toBeNull();
    expect(recorded[0].pitch).toBe('C4');
  });

  it('cannot record creature when outside recording range but inside audible range', async () => {
    ctx.loadPuzzle('creature-audible-range');

    // Recording range = 5, audible range = 10
    // Move player to distance 7 (inside audible, outside recording)
    ctx.setPlayerPosition({ x: 8, y: 0, z: 0 });
    await ctx.tick(16);

    // Try to record - should not capture anything
    ctx.holdKey('r');
    await ctx.advanceBeats(5);
    ctx.releaseKey('r');

    // Should not have recorded anything
    const recorded = ctx.getInventorySlot(0);
    expect(recorded).toBeNull();
  });
});

/**
 * Creature elevation behavior tests
 *
 * Phase 5: Creatures track elevation, traverse ramps, are blocked by
 * elevation boundaries, and 3D distance affects audio naturally.
 */
/* eslint-disable import/first -- section header for the suite below; imports
   are hoisted by babel-jest so the placement is cosmetic */
import { ELEVATION_HEIGHT, WORLD_SCALE } from 'core/constants';
import { getDistance, getDistanceVolume } from 'core/utils';
/* eslint-enable import/first */

describe('Creature elevation behavior', () => {
  describe('elevation tracking', () => {
    it('creature spawned at elevation 1 has correct Y position', () => {
      ctx.loadPuzzle('elevation-basic');
      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      // Creature at grid (7,6), y=1 -> position.y = 1 * ELEVATION_HEIGHT = 3.0
      expect(creature.position.y).toBe(ELEVATION_HEIGHT);
      expect(creature.elevation).toBe(1);
    });

    it('creature mesh Y reflects elevation', () => {
      ctx.loadPuzzle('elevation-basic');
      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      // mesh.position.y = position.y + size = 3.0 + 0.9 = 3.9
      expect(creature.mesh.position.y).toBeCloseTo(ELEVATION_HEIGHT + creature.size, 1);
    });
  });

  describe('movement with elevation', () => {
    // Real-timer helpers (same pattern as existing movement tests)
    const realTimeUpdate = async (testCtx, durationMs, stepMs = 16) => {
      const steps = Math.ceil(durationMs / stepMs);
      const entityManager = testCtx.getEntityManager();

      for (let i = 0; i < steps; i += 1) {
        const dt = stepMs / 1000;
        const clock = testCtx.getMusicalClock();
        if (clock) clock.update(dt);
        entityManager.update(dt);
        // eslint-disable-next-line no-promise-executor-return
        await new Promise((resolve) => setTimeout(resolve, stepMs));
      }
    };

    const startPlayerPlayback = async (testCtx, pitch) => {
      testCtx.startPlayerPlayback([{ pitch, length: '1/1' }], 480);
      // eslint-disable-next-line no-promise-executor-return
      await new Promise((resolve) => setTimeout(resolve, 20));
    };

    beforeEach(() => {
      jest.useRealTimers();
      ctx.resetPlaybackState();
    });

    afterEach(() => {
      ctx.stopPlayerPlayback();
      jest.useFakeTimers();
    });

    it('creature pushed by consonant force traverses a ramp to a higher floor', async () => {
      ctx.loadPuzzle('creature-elevation-ramp');
      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      // Creature starts on the ramp cell (grid 7,9) at elevation 0
      expect(creature.elevation).toBe(0);

      // Play E4 - consonant with C4 (major 3rd) = attraction toward player (north)
      // Player is at grid (7,5) on elevation 1, north of the ramp
      await startPlayerPlayback(ctx, 'E4');
      await realTimeUpdate(ctx, 6000);

      // Creature should have moved north along the ramp, increasing elevation
      // Force-based movement accumulates slowly; verify creature climbed the ramp
      expect(creature.elevation).toBeGreaterThan(0);
      expect(creature.position.y).toBeGreaterThan(0);
      expect(creature.position.z).toBeLessThan(27); // Moved north from ramp center
    }, 15000);

    it('creature Y position updates as it moves along a ramp', async () => {
      ctx.loadPuzzle('creature-elevation-ramp');
      const creature = ctx.getCreatures()[0];
      // Creature starts at y=0 from puzzle data, but is on the ramp cell (grid 7,9)
      expect(creature.position.y).toBe(0);

      // A single entity update should cause Y to update from getFloorY (ramp interpolation)
      await startPlayerPlayback(ctx, 'E4');
      await realTimeUpdate(ctx, 50);

      // Y should now reflect the ramp position (between 0 and ELEVATION_HEIGHT)
      expect(creature.position.y).toBeGreaterThan(0);
    }, 10000);

    it('creature is blocked by elevation change without a ramp', async () => {
      ctx.loadPuzzle('creature-elevation-blocked');
      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      // Creature at grid (5,9) -> world (15, 0, 27), elevation 0
      // Elevated floor starts at grid z=8 (elevation 1), no ramp at x=5

      // Play E4 - consonant = attraction toward player (north)
      await startPlayerPlayback(ctx, 'E4');
      await realTimeUpdate(ctx, 800);

      // Creature should NOT have crossed onto elevation 1
      expect(creature.elevation).toBe(0);
    }, 10000);

    it('creature velocity resets to zero when blocked by elevation boundary', async () => {
      ctx.loadPuzzle('creature-elevation-blocked');
      const creature = ctx.getCreatures()[0];

      // Push creature toward boundary
      await startPlayerPlayback(ctx, 'E4');
      await realTimeUpdate(ctx, 600);

      // Stop playback so no new forces are applied
      ctx.stopPlayerPlayback();

      // Run a few more frames - with no forces and velocity zeroed on block, speed decays
      await realTimeUpdate(ctx, 100);

      const speed = Math.sqrt(creature.velocity.x ** 2 + creature.velocity.z ** 2);
      expect(speed).toBeLessThan(0.5);
      expect(creature.elevation).toBe(0);
    }, 10000);
  });

  describe('cross-elevation audio', () => {
    it('creature on elevation 1 is quieter to player on elevation 0 than same-floor creature', () => {
      ctx.loadPuzzle('elevation-basic');
      const creature = ctx.getCreatures()[0]; // elevation 1, position.y = 3.0

      // Move player closer so creature is within audibleRange (15)
      // Creature at world (21, 3.0, 18). Player at elevation 0.
      ctx.setPlayerPosition({ x: 21, y: 1.8, z: 28 });
      const playerPos = ctx.getPlayerPosition();

      // 3D distance includes Y component from elevation difference
      const dist3D = getDistance(creature.position, playerPos);

      // XZ-only distance (what it would be without any Y component)
      const distXZ = Math.sqrt(
        (creature.position.x - playerPos.x) ** 2 + (creature.position.z - playerPos.z) ** 2
      );

      // 3D distance exceeds XZ distance because Y difference adds to it
      expect(dist3D).toBeGreaterThan(distXZ);

      // Volume from 3D distance is lower than from XZ-only distance
      expect(getDistanceVolume(dist3D, creature.audibleRange)).toBeLessThan(
        getDistanceVolume(distXZ, creature.audibleRange)
      );
    });

    it('creature beyond audibleRange (including Y distance) is silent', async () => {
      ctx.loadPuzzle('elevation-ramp'); // Has elevation grid

      // Add creature at elevation 1 with small audibleRange
      const creature = ctx.addCreature({
        position: { x: 7 * WORLD_SCALE, y: ELEVATION_HEIGHT, z: 6 * WORLD_SCALE },
        song: [{ pitch: 'C4', length: '1/4' }],
        interval: 4,
        audibleRange: 4,
      });

      // Position player so XZ distance < 4 but 3D distance > 4
      // Creature at (21, 3.0, 18). Player Y = 1.8 at elevation 0.
      // Y diff = 1.2. Need XZ dist where sqrt(xz^2 + 1.44) > 4, so xz^2 > 14.56, xz > 3.81
      // Set player at (21, 1.8, 14.1) -> XZ dist = 3.9
      // 3D dist = sqrt(3.9^2 + 1.2^2) = sqrt(15.21 + 1.44) = sqrt(16.65) ≈ 4.08 > 4
      ctx.setPlayerPosition({ x: 21, y: 1.8, z: 14.1 });

      await ctx.tick(16);

      // Verify 3D distance exceeds audible range
      const dist = getDistance(creature.position, ctx.getPlayerPosition());
      expect(dist).toBeGreaterThan(creature.audibleRange);

      // Creature should not be recordable (too far in 3D)
      expect(creature.isRecordable).toBe(false);
    });
  });
});
