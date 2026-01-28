/**
 * ElevationMovement tests
 * Tests player Y tracking, ramp traversal, elevation boundary blocking, and helper functions
 */

import { getFloorY, getEffectiveElevation, canTraverse } from 'core/ElevationMovement';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import gameState from 'core/GameState';
import ElevationGrid from 'core/ElevationGrid';
import Ramp from 'entities/Ramp';

describe('Player elevation movement', () => {
  describe('walking on flat elevated floors', () => {
    it('player on elevation 0 has Y position equal to eye height (1.8)', () => {
      ctx.loadPuzzle('elevation-ramp');

      // Player starts at grid (7, 13), elevation 0
      const pos = ctx.getPlayerPosition();
      expect(pos.y).toBeCloseTo(1.8);
    });

    it('player on elevation 1 has Y position equal to ELEVATION_HEIGHT + 1.8', async () => {
      ctx.loadPuzzle('elevation-ramp');

      // Place player on elevation 1 cell (grid 7, 6)
      ctx.setPlayerPosition({ x: 7 * WORLD_SCALE, z: 6 * WORLD_SCALE });

      // Tick to sync Y position from elevation
      await ctx.tick(16);

      const pos = ctx.getPlayerPosition();
      expect(pos.y).toBeCloseTo(ELEVATION_HEIGHT + 1.8);
    });
  });

  describe('walking on ramps', () => {
    it('player Y increases smoothly while walking north on a north-facing ramp', async () => {
      ctx.loadPuzzle('elevation-ramp');

      // Place player near south (low) end of ramp at grid (7, 9)
      // Ramp center: world (21, 27). Low end at +Z.
      ctx.setPlayerPosition({ x: 7 * WORLD_SCALE, z: 9 * WORLD_SCALE + 1 });
      await ctx.tick(16); // sync Y

      const startY = ctx.getPlayerPosition().y;

      // Walk north (forward = -Z), moving up the ramp
      ctx.holdKey('w');
      await ctx.tick(200);
      ctx.releaseKey('w');

      const endY = ctx.getPlayerPosition().y;
      expect(endY).toBeGreaterThan(startY);
    });

    it('player Y decreases smoothly while walking south on a north-facing ramp', async () => {
      ctx.loadPuzzle('elevation-ramp');

      // Place player near north (high) end of ramp
      ctx.setPlayerPosition({ x: 7 * WORLD_SCALE, z: 9 * WORLD_SCALE - 1 });
      await ctx.tick(16);

      const startY = ctx.getPlayerPosition().y;

      // Walk south (backward = +Z), moving down the ramp
      ctx.holdKey('s');
      await ctx.tick(200);
      ctx.releaseKey('s');

      const endY = ctx.getPlayerPosition().y;
      expect(endY).toBeLessThan(startY);
    });

    it('player elevation updates to 1 after fully traversing a ramp from elevation 0', async () => {
      ctx.loadPuzzle('elevation-ramp');

      // Place player at south (low) end of ramp
      const rampZ = 9 * WORLD_SCALE;
      ctx.setPlayerPosition({
        x: 7 * WORLD_SCALE,
        z: rampZ + WORLD_SCALE / 2 - 0.1,
      });
      await ctx.tick(16);

      expect(ctx.getPlayerElevation()).toBeCloseTo(0, 0);

      // Walk north through the entire ramp onto the elevation 1 floor
      // Distance ~3 units at 4 units/sec = ~750ms, use 1500ms for safety
      ctx.holdKey('w');
      await ctx.tick(1500);
      ctx.releaseKey('w');

      expect(ctx.getPlayerElevation()).toBe(1);
    });
  });

  describe('elevation boundary blocking', () => {
    it('player cannot walk from elevation 0 onto elevation 1 without a ramp', async () => {
      ctx.loadPuzzle('elevation-ramp');

      // Place player at grid (5, 9) - elevation 0, no ramp at this cell
      ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 9 * WORLD_SCALE });
      await ctx.tick(16);

      // Try to walk north into elevation 1 area (grid 5, 8)
      ctx.holdKey('w');
      await ctx.tick(500);
      ctx.releaseKey('w');

      // Player should still be on elevation 0
      expect(ctx.getPlayerElevation()).toBe(0);
      // Player's grid cell should still be elevation 0
      const pos = ctx.getPlayerPosition();
      const grid = gameState.elevationGrid.worldToGrid(pos.x, pos.z);
      expect(gameState.elevationGrid.getElevation(grid.x, grid.z)).toBe(0);
    });

    it('player cannot walk off elevation 1 onto elevation 0 without a ramp', async () => {
      ctx.loadPuzzle('elevation-ramp');

      // Place player on elevation 1 cell (grid 5, 7)
      ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 7 * WORLD_SCALE });
      await ctx.tick(16);

      expect(ctx.getPlayerElevation()).toBe(1);

      // Try to walk south into elevation 0 area (grid 5, 9)
      ctx.holdKey('s');
      await ctx.tick(500);
      ctx.releaseKey('s');

      // Player should still be on elevation 1
      expect(ctx.getPlayerElevation()).toBe(1);
      const pos = ctx.getPlayerPosition();
      const grid = gameState.elevationGrid.worldToGrid(pos.x, pos.z);
      expect(gameState.elevationGrid.getElevation(grid.x, grid.z)).toBe(1);
    });

    it('player CAN walk from elevation 0 onto a ramp cell', async () => {
      ctx.loadPuzzle('elevation-ramp');

      // Place player at grid (7, 10) - elevation 0, south of ramp
      ctx.setPlayerPosition({ x: 7 * WORLD_SCALE, z: 10 * WORLD_SCALE });
      await ctx.tick(16);

      expect(ctx.getPlayerElevation()).toBe(0);

      // Walk north onto ramp at grid (7, 9)
      ctx.holdKey('w');
      await ctx.tick(1000);
      ctx.releaseKey('w');

      // Player should now be on or past the ramp cell
      const pos = ctx.getPlayerPosition();
      expect(pos.z).toBeLessThan(10 * WORLD_SCALE);
    });

    it('player CAN walk from a ramp cell onto elevation 1 floor', async () => {
      ctx.loadPuzzle('elevation-ramp');

      // Place player on the ramp near the high end
      ctx.setPlayerPosition({
        x: 7 * WORLD_SCALE,
        z: 9 * WORLD_SCALE - WORLD_SCALE / 2 + 0.3,
      });
      await ctx.tick(16);

      // Walk north onto elevation 1 floor (grid 7, 8)
      ctx.holdKey('w');
      await ctx.tick(500);
      ctx.releaseKey('w');

      // Player should now be on elevation 1
      expect(ctx.getPlayerElevation()).toBe(1);
    });
  });

  describe('canTraverse', () => {
    it('allows movement between cells at the same elevation', () => {
      const grid = new ElevationGrid(10);
      const from = { x: 3, z: 3 };
      const to = { x: 4, z: 3 };

      expect(canTraverse(from, to, 0, 0, grid)).toBe(true);
    });

    it('allows movement when a ramp connects the two elevations', () => {
      const grid = new ElevationGrid(10);
      grid.applyFloors([{ elevation: 1, x1: 5, z1: 0, x2: 9, z2: 9 }]);
      const ramp = new Ramp(
        { x: 4 * WORLD_SCALE, y: 0, z: 5 * WORLD_SCALE },
        { direction: 'east' }
      );
      grid.registerRamp(4, 5, ramp);

      // From ramp cell (floor elev 0) to floor elev 1
      const from = { x: 4, z: 5 };
      const to = { x: 5, z: 5 };
      expect(canTraverse(from, to, 0, 1, grid)).toBe(true);
    });

    it('blocks movement between cells differing by 1 elevation with no ramp', () => {
      const grid = new ElevationGrid(10);
      grid.applyFloors([{ elevation: 1, x1: 5, z1: 5, x2: 9, z2: 9 }]);

      const from = { x: 4, z: 5 };
      const to = { x: 5, z: 5 };
      expect(canTraverse(from, to, 0, 1, grid)).toBe(false);
    });

    it('blocks movement between cells differing by more than 1 elevation', () => {
      const grid = new ElevationGrid(10);
      grid.applyFloors([{ elevation: 2, x1: 5, z1: 5, x2: 9, z2: 9 }]);

      const from = { x: 4, z: 5 };
      const to = { x: 5, z: 5 };
      expect(canTraverse(from, to, 0, 2, grid)).toBe(false);
    });
  });

  describe('getFloorY', () => {
    it('returns 0 for elevation 0 cells', () => {
      const grid = new ElevationGrid(10);
      const y = getFloorY(0, 0, grid);
      expect(y).toBe(0);
    });

    it('returns ELEVATION_HEIGHT for elevation 1 cells', () => {
      const grid = new ElevationGrid(10);
      grid.applyFloors([{ elevation: 1, x1: 3, z1: 3, x2: 5, z2: 5 }]);

      const y = getFloorY(4 * WORLD_SCALE, 4 * WORLD_SCALE, grid);
      expect(y).toBe(ELEVATION_HEIGHT);
    });

    it('delegates to ramp.getYAtPosition when on a ramp cell', () => {
      const grid = new ElevationGrid(10);
      const ramp = new Ramp(
        { x: 5 * WORLD_SCALE, y: 0, z: 5 * WORLD_SCALE },
        { direction: 'north' }
      );
      grid.registerRamp(5, 5, ramp);

      // At center of ramp, should return midpoint Y
      const y = getFloorY(5 * WORLD_SCALE, 5 * WORLD_SCALE, grid);
      expect(y).toBeCloseTo(ELEVATION_HEIGHT / 2);
    });
  });
});
