/**
 * Ramp elevation calculation tests
 * Tests getYAtPosition for all four directions, bounds checking, and elevation derivation
 */

import Ramp from 'entities/Ramp';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';

// Helper: create a ramp at a grid position with a given direction and elevation
function createRamp(gridX, gridZ, direction, elevation = 0) {
  return new Ramp(
    {
      x: gridX * WORLD_SCALE,
      y: elevation * ELEVATION_HEIGHT,
      z: gridZ * WORLD_SCALE,
    },
    { direction }
  );
}

describe('Ramp elevation calculation', () => {
  describe('getYAtPosition', () => {
    it('returns null for positions outside the ramp bounds', () => {
      const ramp = createRamp(5, 6, 'north');
      const cx = 5 * WORLD_SCALE; // 15
      const cz = 6 * WORLD_SCALE; // 18
      const hw = WORLD_SCALE / 2; // 1.5

      // Too far east
      expect(ramp.getYAtPosition(cx + hw + 1, cz)).toBeNull();
      // Too far west
      expect(ramp.getYAtPosition(cx - hw - 1, cz)).toBeNull();
      // Too far south
      expect(ramp.getYAtPosition(cx, cz + hw + 1)).toBeNull();
      // Too far north
      expect(ramp.getYAtPosition(cx, cz - hw - 1)).toBeNull();
    });

    it('returns base elevation Y at the low end of a north-facing ramp', () => {
      // North: high end = -Z, low end = +Z
      const ramp = createRamp(5, 6, 'north');
      const cx = 5 * WORLD_SCALE;
      const cz = 6 * WORLD_SCALE;
      const hw = WORLD_SCALE / 2;

      // Low end is at south edge (+Z max)
      const y = ramp.getYAtPosition(cx, cz + hw);
      expect(y).toBeCloseTo(0);
    });

    it('returns base + ELEVATION_HEIGHT at the high end of a north-facing ramp', () => {
      const ramp = createRamp(5, 6, 'north');
      const cx = 5 * WORLD_SCALE;
      const cz = 6 * WORLD_SCALE;
      const hw = WORLD_SCALE / 2;

      // High end is at north edge (-Z min)
      const y = ramp.getYAtPosition(cx, cz - hw);
      expect(y).toBeCloseTo(ELEVATION_HEIGHT);
    });

    it('returns interpolated Y at the midpoint of a north-facing ramp', () => {
      const ramp = createRamp(5, 6, 'north');
      const cx = 5 * WORLD_SCALE;
      const cz = 6 * WORLD_SCALE;

      // Center of ramp = midpoint of slope
      const y = ramp.getYAtPosition(cx, cz);
      expect(y).toBeCloseTo(ELEVATION_HEIGHT / 2);
    });

    it('returns base elevation Y at the low end of a south-facing ramp', () => {
      // South: high end = +Z, low end = -Z
      const ramp = createRamp(5, 6, 'south');
      const cx = 5 * WORLD_SCALE;
      const cz = 6 * WORLD_SCALE;
      const hw = WORLD_SCALE / 2;

      // Low end is at north edge (-Z min)
      const y = ramp.getYAtPosition(cx, cz - hw);
      expect(y).toBeCloseTo(0);
    });

    it('returns base + ELEVATION_HEIGHT at the high end of a south-facing ramp', () => {
      const ramp = createRamp(5, 6, 'south');
      const cx = 5 * WORLD_SCALE;
      const cz = 6 * WORLD_SCALE;
      const hw = WORLD_SCALE / 2;

      // High end is at south edge (+Z max)
      const y = ramp.getYAtPosition(cx, cz + hw);
      expect(y).toBeCloseTo(ELEVATION_HEIGHT);
    });

    it('returns base elevation Y at the low end of an east-facing ramp', () => {
      // East: high end = +X, low end = -X
      const ramp = createRamp(5, 6, 'east');
      const cx = 5 * WORLD_SCALE;
      const cz = 6 * WORLD_SCALE;
      const hw = WORLD_SCALE / 2;

      // Low end is at west edge (-X min)
      const y = ramp.getYAtPosition(cx - hw, cz);
      expect(y).toBeCloseTo(0);
    });

    it('returns base + ELEVATION_HEIGHT at the high end of an east-facing ramp', () => {
      const ramp = createRamp(5, 6, 'east');
      const cx = 5 * WORLD_SCALE;
      const cz = 6 * WORLD_SCALE;
      const hw = WORLD_SCALE / 2;

      // High end is at east edge (+X max)
      const y = ramp.getYAtPosition(cx + hw, cz);
      expect(y).toBeCloseTo(ELEVATION_HEIGHT);
    });

    it('returns base elevation Y at the low end of a west-facing ramp', () => {
      // West: high end = -X, low end = +X
      const ramp = createRamp(5, 6, 'west');
      const cx = 5 * WORLD_SCALE;
      const cz = 6 * WORLD_SCALE;
      const hw = WORLD_SCALE / 2;

      // Low end is at east edge (+X max)
      const y = ramp.getYAtPosition(cx + hw, cz);
      expect(y).toBeCloseTo(0);
    });

    it('returns base + ELEVATION_HEIGHT at the high end of a west-facing ramp', () => {
      const ramp = createRamp(5, 6, 'west');
      const cx = 5 * WORLD_SCALE;
      const cz = 6 * WORLD_SCALE;
      const hw = WORLD_SCALE / 2;

      // High end is at west edge (-X min)
      const y = ramp.getYAtPosition(cx - hw, cz);
      expect(y).toBeCloseTo(ELEVATION_HEIGHT);
    });

    it('clamps progress to 0-1 range at ramp edges', () => {
      const ramp = createRamp(5, 6, 'north');
      const cx = 5 * WORLD_SCALE;
      const cz = 6 * WORLD_SCALE;
      const hw = WORLD_SCALE / 2;

      // At exact low edge: progress should be clamped to 0
      const yLow = ramp.getYAtPosition(cx, cz + hw);
      expect(yLow).toBeCloseTo(0);

      // At exact high edge: progress should be clamped to 1
      const yHigh = ramp.getYAtPosition(cx, cz - hw);
      expect(yHigh).toBeCloseTo(ELEVATION_HEIGHT);

      // Values should never go below 0 or above ELEVATION_HEIGHT for elevation-0 ramp
      expect(yLow).toBeGreaterThanOrEqual(0);
      expect(yHigh).toBeLessThanOrEqual(ELEVATION_HEIGHT);
    });

    it('works for ramps at elevation > 0', () => {
      // Ramp at elevation 1 connects elevation 1 to elevation 2
      const ramp = createRamp(5, 6, 'north', 1);
      const cx = 5 * WORLD_SCALE;
      const cz = 6 * WORLD_SCALE;
      const hw = WORLD_SCALE / 2;
      const baseY = 1 * ELEVATION_HEIGHT; // 3.0

      expect(ramp.elevation).toBe(1);

      // Low end: baseY
      const yLow = ramp.getYAtPosition(cx, cz + hw);
      expect(yLow).toBeCloseTo(baseY);

      // High end: baseY + ELEVATION_HEIGHT
      const yHigh = ramp.getYAtPosition(cx, cz - hw);
      expect(yHigh).toBeCloseTo(baseY + ELEVATION_HEIGHT);

      // Midpoint
      const yMid = ramp.getYAtPosition(cx, cz);
      expect(yMid).toBeCloseTo(baseY + ELEVATION_HEIGHT / 2);
    });
  });
});
