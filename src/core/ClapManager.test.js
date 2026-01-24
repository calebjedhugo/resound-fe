/**
 * Clap Manager Integration Tests
 *
 * These tests validate the clapping mechanic by:
 * 1. Loading test puzzles with creatures
 * 2. Simulating the C key press to clap
 * 3. Verifying creatures' next sing time is displaced
 * 4. Verifying range and displacement configuration work correctly
 */

import ClapManager from './ClapManager';
import { CLAP_RANGE, DEFAULT_CLAP_DISPLACEMENT } from './constants';

describe('Clapping to displace creature timing', () => {
  describe('affecting nearby creatures', () => {
    it('displaces creature next sing time when clapping', async () => {
      // Load puzzle: player at (0,0,0), creature at grid (0,0,1) -> world (0,0,3)
      // CLAP_RANGE = 7.5, distance = 3, so creature is in range
      ctx.loadPuzzle('clap-basic');
      await ctx.tick(16);

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalNextSingBeat = creature.nextSingBeat;

      // Clap (C key)
      ctx.pressKey('c');
      // At 120 BPM, displacement grid of 0.25 beats = 125ms, so advance 200ms to hit boundary
      await ctx.tick(200);

      // Assert: creature's next sing time was displaced
      // Default displacement = 0.0625 whole notes = 0.25 quarter-note beats
      const expectedDisplacement = DEFAULT_CLAP_DISPLACEMENT * 4;
      expect(creature.nextSingBeat).toBeCloseTo(originalNextSingBeat + expectedDisplacement, 2);
    });

    it('affects multiple creatures in range', async () => {
      // Load puzzle: two creatures both within range
      ctx.loadPuzzle('clap-two-creatures');
      await ctx.tick(16);

      const creatures = ctx.getCreatures();
      const originalBeats = creatures.map((c) => c.nextSingBeat);

      // Clap
      ctx.pressKey('c');
      await ctx.tick(200);

      // Assert: both creatures displaced
      const expectedDisplacement = DEFAULT_CLAP_DISPLACEMENT * 4;
      creatures.forEach((creature, i) => {
        expect(creature.nextSingBeat).toBeCloseTo(originalBeats[i] + expectedDisplacement, 2);
      });
    });

    it('does not affect creatures outside clap range', async () => {
      // Load puzzle: creature at grid (0,0,3) -> world (0,0,9)
      // CLAP_RANGE = 7.5, distance = 9, so creature is out of range
      ctx.loadPuzzle('clap-out-of-range');
      await ctx.tick(16);

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalNextSingBeat = creature.nextSingBeat;

      // Clap
      ctx.pressKey('c');
      await ctx.tick(100);

      // Assert: creature's next sing time unchanged
      expect(creature.nextSingBeat).toBe(originalNextSingBeat);
    });
  });

  describe('displacement configuration', () => {
    it('uses puzzle-level clapDisplacement when specified', async () => {
      // Load puzzle with clapDisplacement: 0.25 (1/4 whole note = 1 beat)
      ctx.loadPuzzle('clap-custom-displacement');
      await ctx.tick(16);

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalNextSingBeat = creature.nextSingBeat;

      // Clap - puzzle has clapDisplacement: 0.25, grid = 0.25*4 = 1 beat = 500ms at 120 BPM
      ctx.pressKey('c');
      await ctx.tick(600);

      // Assert: displacement is 0.25 * 4 = 1 beat
      expect(creature.nextSingBeat).toBeCloseTo(originalNextSingBeat + 1.0, 2);
    });

    it('uses per-creature clapDisplacement override when specified', async () => {
      // Load puzzle: puzzle default = 0.125, creature1 override = 0.5, creature2 uses default
      ctx.loadPuzzle('clap-per-creature-displacement');
      await ctx.tick(16);

      const creatures = ctx.getCreatures();
      // Find creature with C4 (has override) and E4 (uses puzzle default)
      const creatureWithOverride = creatures.find((c) => c.data.song[0].pitch === 'C4');
      const creatureWithDefault = creatures.find((c) => c.data.song[0].pitch === 'E4');

      const originalOverride = creatureWithOverride.nextSingBeat;
      const originalDefault = creatureWithDefault.nextSingBeat;

      // Clap - puzzle has clapDisplacement: 0.125, grid = 0.125*4 = 0.5 beats = 250ms at 120 BPM
      ctx.pressKey('c');
      await ctx.tick(300);

      // Assert: creature with override displaced by 0.5 * 4 = 2 beats
      expect(creatureWithOverride.nextSingBeat).toBeCloseTo(originalOverride + 2.0, 2);

      // Assert: creature with puzzle default displaced by 0.125 * 4 = 0.5 beats
      expect(creatureWithDefault.nextSingBeat).toBeCloseTo(originalDefault + 0.5, 2);
    });
  });

  describe('parseDisplacement', () => {
    it('parses numeric displacement values', () => {
      expect(ClapManager.parseDisplacement(0.25)).toBe(0.25);
      expect(ClapManager.parseDisplacement(0.0625)).toBe(0.0625);
      expect(ClapManager.parseDisplacement(1)).toBe(1);
    });

    it('parses string fraction format', () => {
      expect(ClapManager.parseDisplacement('1/4')).toBe(0.25);
      expect(ClapManager.parseDisplacement('1/8')).toBe(0.125);
      expect(ClapManager.parseDisplacement('1/16')).toBe(0.0625);
      expect(ClapManager.parseDisplacement('3/8')).toBe(0.375);
    });

    it('returns default for invalid formats', () => {
      expect(ClapManager.parseDisplacement('invalid')).toBe(DEFAULT_CLAP_DISPLACEMENT);
      expect(ClapManager.parseDisplacement(null)).toBe(DEFAULT_CLAP_DISPLACEMENT);
      expect(ClapManager.parseDisplacement(undefined)).toBe(DEFAULT_CLAP_DISPLACEMENT);
    });
  });

  describe('clap quantization', () => {
    it('quantizes clap to displacement grid boundary', async () => {
      ctx.loadPuzzle('clap-basic');
      await ctx.tick(16);

      // Advance to a non-grid position (e.g., beat 0.1)
      await ctx.advanceBeats(0.1);

      const currentBeat = ctx.getCurrentBeat();
      expect(currentBeat).toBeGreaterThan(0);

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalNextSingBeat = creature.nextSingBeat;

      // Request clap (will be quantized)
      ctx.pressKey('c');

      // Advance enough to hit the next grid boundary and execute
      await ctx.tick(200);

      // Assert: clap executed and displaced creature
      const expectedDisplacement = DEFAULT_CLAP_DISPLACEMENT * 4;
      expect(creature.nextSingBeat).toBeCloseTo(originalNextSingBeat + expectedDisplacement, 2);
    });

    it('ignores duplicate clap requests while one is pending', async () => {
      ctx.loadPuzzle('clap-basic');
      await ctx.tick(16);

      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const originalNextSingBeat = creature.nextSingBeat;

      // Request multiple claps rapidly
      ctx.pressKey('c');
      ctx.pressKey('c');
      ctx.pressKey('c');
      await ctx.tick(200);

      // Assert: only one displacement occurred
      const expectedDisplacement = DEFAULT_CLAP_DISPLACEMENT * 4;
      expect(creature.nextSingBeat).toBeCloseTo(originalNextSingBeat + expectedDisplacement, 2);
    });
  });

  describe('visual feedback', () => {
    it('triggers visual callback when clapping', async () => {
      ctx.loadPuzzle('clap-basic');
      await ctx.tick(16);

      let callbackCalled = false;
      let callbackPosition = null;
      let callbackRange = null;

      ClapManager.setVisualCallback((position, range) => {
        callbackCalled = true;
        callbackPosition = position;
        callbackRange = range;
      });

      // Clap
      ctx.pressKey('c');
      await ctx.tick(200);

      // Assert: callback was triggered with correct args
      expect(callbackCalled).toBe(true);
      expect(callbackPosition).toEqual(ctx.getPlayerPosition());
      expect(callbackRange).toBe(CLAP_RANGE);

      // Clean up
      ClapManager.setVisualCallback(null);
    });
  });

  describe('state management', () => {
    it('resets state when reset() is called', async () => {
      ctx.loadPuzzle('clap-basic');
      await ctx.tick(16);

      // Request a clap but don't let it execute
      ClapManager.requestClap();
      expect(ClapManager.pendingClap).toBe(true);

      // Reset
      ClapManager.reset();

      // Assert: state cleared
      expect(ClapManager.pendingClap).toBe(false);
      expect(ClapManager.targetBeat).toBe(-1);
    });
  });
});
