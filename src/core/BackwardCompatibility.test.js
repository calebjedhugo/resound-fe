/**
 * Backward Compatibility Tests
 *
 * These tests verify that existing puzzles (which have no `floors` field
 * and all entities at y:0) load and behave identically with the elevation system.
 *
 * All tests should pass with zero code changes -- they verify Phases 1-5
 * introduced no regressions to pre-elevation behavior.
 */

describe('Backward compatibility', () => {
  it('puzzle with no floors defined loads with all-zero elevation grid', () => {
    ctx.loadPuzzle('recording-basic');

    // Elevation grid should exist (built by PuzzleLoader)
    // All cells should be elevation 0 since no floors field is defined
    const gridSize = 10; // recording-basic has gridSize 10
    for (let z = 0; z < gridSize; z += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        expect(ctx.getElevationAt(x, z)).toBe(0);
      }
    }

    // No ramps should be registered
    for (let z = 0; z < gridSize; z += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        expect(ctx.getRampAt(x, z)).toBeNull();
      }
    }
  });

  it('player starts at elevation 0 with Y=1.8 in puzzles without floors', () => {
    // recording-basic has playerStart: { x: 5, y: 0, z: 5 }
    ctx.loadPuzzle('recording-basic');

    expect(ctx.getPlayerElevation()).toBe(0);
    expect(ctx.getPlayerPosition().y).toBeCloseTo(1.8);
  });

  it('all entities in puzzles without floors have elevation 0', () => {
    // listening-gate-basic: player at (5,0,5), gate at (5,0,4)
    ctx.loadPuzzle('listening-gate-basic');

    const gates = ctx.getGates();
    expect(gates.length).toBeGreaterThan(0);
    // Gate world Y should be 0 (elevation 0 * ELEVATION_HEIGHT = 0)
    expect(gates[0].position.y).toBe(0);

    // recording-basic: creature at (5,0,4)
    ctx.loadPuzzle('recording-basic');

    const creatures = ctx.getCreatures();
    expect(creatures.length).toBeGreaterThan(0);
    // Creature world Y should be 0
    expect(creatures[0].position.y).toBe(0);
    // Creature elevation property should be 0
    expect(creatures[0].elevation).toBe(0);
  });

  it('creature movement works identically in flat puzzles', async () => {
    // Use real timers for movement tests (same approach as Creature.test.js)
    jest.useRealTimers();

    try {
      ctx.loadPuzzle('creature-consonance');

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalX = creature.position.x;

      // Play a consonant note (E4 = major 3rd above C4)
      ctx.startPlayerPlayback([{ pitch: 'E4', length: '1/1' }], 480);
      // Wait for instrument to start
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Run real-time updates
      const entityManager = ctx.getEntityManager();
      const steps = Math.ceil(800 / 16);
      for (let i = 0; i < steps; i += 1) {
        const dt = 16 / 1000;
        const clock = ctx.getMusicalClock();
        if (clock) clock.update(dt);
        entityManager.update(dt);
        await new Promise((resolve) => setTimeout(resolve, 16));
      }

      // Creature should have moved toward the player (lower X)
      expect(creature.position.x).toBeLessThan(originalX);
    } finally {
      ctx.stopPlayerPlayback();
      jest.useFakeTimers();
    }
  }, 10000);

  it('recording works identically in flat puzzles', async () => {
    ctx.loadPuzzle('recording-basic');
    await ctx.tick(16);

    // Start recording
    ctx.holdKey('r');

    // Advance 4 beats (creature sings at interval=4)
    await ctx.advanceBeats(4);

    // Stop recording
    ctx.releaseKey('r');

    // Song should be captured in inventory slot 0
    const recorded = ctx.getInventorySlot(0);
    expect(recorded).not.toBeNull();
    expect(recorded).toHaveLength(1);
    expect(recorded[0].pitch).toBe('C4');
  });

  it('gate activation works identically in flat puzzles', async () => {
    ctx.loadPuzzle('listening-gate-basic');
    await ctx.tick(16);

    // Set up inventory with the correct song
    ctx.setInventorySlot(0, [{ pitch: 'C4', length: '1/4' }]);
    ctx.setActiveSlot(0);

    // Verify gate starts closed
    const gates = ctx.getGates();
    expect(gates).toHaveLength(1);
    expect(ctx.isGateOpen(gates[0])).toBe(false);

    // Play the song
    ctx.pressKey('space');

    // Gates open AS the song is performed; check within the open window
    await ctx.advanceBeats(2);

    // Gate should now be open
    expect(ctx.isGateOpen(gates[0])).toBe(true);
  });
});
