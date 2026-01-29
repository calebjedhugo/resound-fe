/**
 * Grid Utilities Tests
 *
 * Tests coordinate conversion between world space and grid space.
 * WORLD_SCALE = 3, so each grid cell spans 3 world units.
 */
import { snapToGrid, gridToWorld } from 'editor/viewport/gridUtils';

describe('gridUtils', () => {
  describe('snapToGrid', () => {
    it('maps world position in the first cell to grid (0, 0)', () => {
      const result = snapToGrid(1.5, 1.5, 15);
      expect(result).toEqual({ x: 0, z: 0 });
    });

    it('maps world position to the correct middle cell', () => {
      const result = snapToGrid(4.5, 7.5, 15);
      expect(result).toEqual({ x: 1, z: 2 });
    });

    it('maps world position at the last cell boundary', () => {
      const result = snapToGrid(44.5, 44.5, 15);
      expect(result).toEqual({ x: 14, z: 14 });
    });

    it('returns null for negative world coordinates', () => {
      const result = snapToGrid(-1, 5, 15);
      expect(result).toBeNull();
    });

    it('returns null for world coordinates beyond grid bounds', () => {
      // 45 / 3 = 15, which is >= gridSize (15)
      const result = snapToGrid(45, 5, 15);
      expect(result).toBeNull();
    });

    it('maps world position at the origin edge to grid (0, 0)', () => {
      const result = snapToGrid(0, 0, 15);
      expect(result).toEqual({ x: 0, z: 0 });
    });
  });

  describe('gridToWorld', () => {
    it('returns center of the first cell', () => {
      const result = gridToWorld(0, 0);
      expect(result).toEqual({ x: 1.5, z: 1.5 });
    });

    it('returns center of the middle cell for a 15-cell grid', () => {
      const result = gridToWorld(7, 7);
      expect(result).toEqual({ x: 22.5, z: 22.5 });
    });

    it('returns center of the last cell for a 15-cell grid', () => {
      const result = gridToWorld(14, 14);
      expect(result).toEqual({ x: 43.5, z: 43.5 });
    });
  });
});
