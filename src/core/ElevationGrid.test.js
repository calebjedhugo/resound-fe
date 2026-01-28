/**
 * ElevationGrid tests
 * Tests elevation data lookup, floor region application, ramp registration, and coordinate conversion
 */

import ElevationGrid from 'core/ElevationGrid';
import { WORLD_SCALE } from 'core/constants';
import gameState from 'core/GameState';

describe('ElevationGrid', () => {
  describe('default state', () => {
    it('returns elevation 0 for all cells in an empty grid', () => {
      const grid = new ElevationGrid(10);

      expect(grid.getElevation(0, 0)).toBe(0);
      expect(grid.getElevation(5, 5)).toBe(0);
      expect(grid.getElevation(9, 9)).toBe(0);
    });

    it('returns elevation 0 for out-of-bounds coordinates', () => {
      const grid = new ElevationGrid(10);

      expect(grid.getElevation(-1, 0)).toBe(0);
      expect(grid.getElevation(0, -1)).toBe(0);
      expect(grid.getElevation(10, 0)).toBe(0);
      expect(grid.getElevation(0, 10)).toBe(0);
      expect(grid.getElevation(100, 100)).toBe(0);
    });
  });

  describe('applying floor regions', () => {
    it('sets elevation for cells within a floor region', () => {
      const grid = new ElevationGrid(10);
      grid.applyFloors([{ elevation: 1, x1: 2, z1: 2, x2: 5, z2: 5 }]);

      expect(grid.getElevation(2, 2)).toBe(1);
      expect(grid.getElevation(3, 3)).toBe(1);
      expect(grid.getElevation(5, 5)).toBe(1);
    });

    it('leaves cells outside floor regions at elevation 0', () => {
      const grid = new ElevationGrid(10);
      grid.applyFloors([{ elevation: 1, x1: 2, z1: 2, x2: 5, z2: 5 }]);

      expect(grid.getElevation(0, 0)).toBe(0);
      expect(grid.getElevation(1, 1)).toBe(0);
      expect(grid.getElevation(6, 6)).toBe(0);
      expect(grid.getElevation(9, 9)).toBe(0);
    });

    it('uses highest elevation when regions overlap', () => {
      const grid = new ElevationGrid(10);
      grid.applyFloors([
        { elevation: 1, x1: 2, z1: 2, x2: 7, z2: 7 },
        { elevation: 2, x1: 4, z1: 4, x2: 6, z2: 6 },
      ]);

      // Overlap region should be elevation 2
      expect(grid.getElevation(5, 5)).toBe(2);
      // Outer region should be elevation 1
      expect(grid.getElevation(2, 2)).toBe(1);
      // Outside both should be 0
      expect(grid.getElevation(0, 0)).toBe(0);
    });

    it('handles multiple non-overlapping regions at different elevations', () => {
      const grid = new ElevationGrid(15);
      grid.applyFloors([
        { elevation: 1, x1: 0, z1: 0, x2: 3, z2: 3 },
        { elevation: 2, x1: 10, z1: 10, x2: 14, z2: 14 },
      ]);

      expect(grid.getElevation(1, 1)).toBe(1);
      expect(grid.getElevation(12, 12)).toBe(2);
      expect(grid.getElevation(7, 7)).toBe(0);
    });
  });

  describe('ramp registration', () => {
    it('returns null for cells with no ramp', () => {
      const grid = new ElevationGrid(10);

      expect(grid.getRamp(0, 0)).toBeNull();
      expect(grid.getRamp(5, 5)).toBeNull();
    });

    it('returns the registered ramp entity at a cell', () => {
      const grid = new ElevationGrid(10);
      const fakeRamp = { type: 'ramp', direction: 'north' };

      grid.registerRamp(3, 4, fakeRamp);

      expect(grid.getRamp(3, 4)).toBe(fakeRamp);
      // Other cells still null
      expect(grid.getRamp(0, 0)).toBeNull();
    });
  });

  describe('worldToGrid conversion', () => {
    it('converts world coordinates to grid coordinates using WORLD_SCALE', () => {
      const grid = new ElevationGrid(10);

      // Grid cell 3 is at world position 3 * WORLD_SCALE = 9
      const result = grid.worldToGrid(3 * WORLD_SCALE, 5 * WORLD_SCALE);
      expect(result).toEqual({ x: 3, z: 5 });
    });

    it('rounds to nearest grid cell', () => {
      const grid = new ElevationGrid(10);

      // 10.0 / 3 = 3.33 -> rounds to 3
      const result1 = grid.worldToGrid(10.0, 10.0);
      expect(result1).toEqual({ x: 3, z: 3 });

      // 8.0 / 3 = 2.67 -> rounds to 3
      const result2 = grid.worldToGrid(8.0, 8.0);
      expect(result2).toEqual({ x: 3, z: 3 });

      // 4.0 / 3 = 1.33 -> rounds to 1
      const result3 = grid.worldToGrid(4.0, 4.0);
      expect(result3).toEqual({ x: 1, z: 1 });
    });
  });

  describe('ramp registration via PuzzleLoader', () => {
    it('registers ramp entities in the elevation grid during puzzle parse', () => {
      // elevation-ramp has a ramp at grid position (7, 9)
      ctx.loadPuzzle('elevation-ramp');

      const ramp = ctx.getRampAt(7, 9);
      expect(ramp).not.toBeNull();
      expect(ramp.direction).toBe('north');
    });

    it('getRamp returns the correct ramp after loading a puzzle with ramps', () => {
      ctx.loadPuzzle('elevation-ramp');

      // Ramp is at grid (7, 9), other cells should be null
      expect(ctx.getRampAt(7, 9)).not.toBeNull();
      expect(ctx.getRampAt(0, 0)).toBeNull();
      expect(ctx.getRampAt(7, 6)).toBeNull();

      // Verify the ramp has expected properties
      const ramp = ctx.getRampAt(7, 9);
      expect(ramp.type).toBe('ramp');
    });
  });
});
