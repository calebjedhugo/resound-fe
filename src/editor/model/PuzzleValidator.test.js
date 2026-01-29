/**
 * PuzzleValidator Tests
 *
 * Tests the validation logic for puzzles being edited.
 * validatePuzzle(model) returns { errors: string[], warnings: string[] }
 */
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import { validatePuzzle } from 'editor/model/PuzzleValidator';

describe('PuzzleValidator', () => {
  let model;

  beforeEach(() => {
    model = new EditorPuzzleModel();
  });

  // -- Error tests --

  describe('errors', () => {
    it('reports error when no player spawn is defined', () => {
      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /player spawn/i.test(e))).toBe(true);
    });

    it('reports error when entity is outside grid bounds (x >= gridSize)', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('wall', 15, 0, 5, {});

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /outside grid/i.test(e) || /bounds/i.test(e))).toBe(true);
    });

    it('reports error when entity is outside grid bounds (x < 0)', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('wall', -1, 0, 5, {});

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /outside grid/i.test(e) || /bounds/i.test(e))).toBe(true);
    });

    it('reports error when entity is at elevation with no floor region', () => {
      model.setPlayerSpawn(5, 0, 5);
      // Entity at y=1 but no floor at elevation 1 covers cell (5, 5)
      model.addEntity('wall', 5, 1, 5, {});

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /elevation/i.test(e) || /floor/i.test(e))).toBe(true);
    });

    it('does not report elevation error for entities at y=0 (base floor)', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('wall', 5, 0, 5, {});

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /elevation/i.test(e) && /floor/i.test(e))).toBe(false);
    });

    it('reports error when creature has no song', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('creature', 7, 0, 7, { interval: 8, audibleRange: 15 });

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /creature/i.test(e) && /song/i.test(e))).toBe(true);
    });

    it('reports error when gate has no song', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('gate', 7, 0, 7, {});

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /gate/i.test(e) && /song/i.test(e))).toBe(true);
    });

    it('reports error when fountain has no song', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('fountain', 7, 0, 7, {});

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /fountain/i.test(e) && /song/i.test(e))).toBe(true);
    });

    it('reports error when song contains invalid pitch values', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('creature', 7, 0, 7, {
        song: [{ pitch: 'X4', length: '1/4' }],
        interval: 8,
        audibleRange: 15,
      });

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /pitch/i.test(e))).toBe(true);
    });

    it('reports error when song contains invalid length values', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('creature', 7, 0, 7, {
        song: [{ pitch: 'C4', length: 'quarter' }],
        interval: 8,
        audibleRange: 15,
      });

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /length/i.test(e))).toBe(true);
    });

    it('reports error when duplicate non-wall entities occupy same position', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('creature', 7, 0, 7, {
        song: [{ pitch: 'C4', length: '1/4' }],
        interval: 8,
        audibleRange: 15,
      });
      model.addEntity('gate', 7, 0, 7, {
        song: [{ pitch: 'C4', length: '1/4' }],
      });

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /duplicate/i.test(e) || /same position/i.test(e))).toBe(true);
    });

    it('does not report duplicate error when two walls share same position', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('wall', 7, 0, 7, {});
      model.addEntity('wall', 7, 0, 7, {});

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /duplicate/i.test(e) || /same position/i.test(e))).toBe(false);
    });
  });

  // -- Warning tests --

  describe('warnings', () => {
    it('warns when no fountain is defined', () => {
      model.setPlayerSpawn(5, 0, 5);

      const { warnings } = validatePuzzle(model);

      expect(warnings.some((w) => /fountain/i.test(w))).toBe(true);
    });

    it('warns when gate has no adjacent walls', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('gate', 7, 0, 7, {
        song: [{ pitch: 'C4', length: '1/4' }],
      });

      const { warnings } = validatePuzzle(model);

      expect(warnings.some((w) => /gate/i.test(w) && /wall/i.test(w))).toBe(true);
    });

    it('does not warn about adjacent walls when gate has adjacent wall', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('gate', 7, 0, 7, {
        song: [{ pitch: 'C4', length: '1/4' }],
      });
      // Wall at (8, 0, 7) is one cell east of gate at (7, 0, 7)
      model.addEntity('wall', 8, 0, 7, {});

      const { warnings } = validatePuzzle(model);

      expect(warnings.some((w) => /gate/i.test(w) && /wall/i.test(w))).toBe(false);
    });

    it('warns when creature audibleRange does not reach any gate or fountain', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('creature', 0, 0, 0, {
        song: [{ pitch: 'C4', length: '1/4' }],
        interval: 8,
        audibleRange: 1,
      });
      model.addEntity('gate', 14, 0, 14, {
        song: [{ pitch: 'C4', length: '1/4' }],
      });
      model.addEntity('wall', 14, 0, 13, {}); // wall adjacent to gate
      model.addEntity('fountain', 14, 0, 14, {
        song: [{ pitch: 'C4', length: '1/4' }],
      });

      const { warnings } = validatePuzzle(model);

      expect(warnings.some((w) => /creature/i.test(w) && /range/i.test(w))).toBe(true);
    });

    it('does not warn about range when creature audibleRange reaches a gate', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('creature', 7, 0, 7, {
        song: [{ pitch: 'C4', length: '1/4' }],
        interval: 8,
        audibleRange: 30,
      });
      model.addEntity('gate', 8, 0, 8, {
        song: [{ pitch: 'C4', length: '1/4' }],
      });
      model.addEntity('wall', 8, 0, 7, {}); // wall adjacent to gate

      const { warnings } = validatePuzzle(model);

      expect(warnings.some((w) => /creature/i.test(w) && /range/i.test(w))).toBe(false);
    });

    it('warns when ramp has no floor region at upper elevation', () => {
      model.setPlayerSpawn(5, 0, 5);
      // Ramp at y=0, upper elevation is y+1=1. No floor at elevation 1 covers (5, 5).
      model.addEntity('ramp', 5, 0, 5, { direction: 'north' });

      const { warnings } = validatePuzzle(model);

      expect(warnings.some((w) => /ramp/i.test(w) && /upper/i.test(w))).toBe(true);
    });

    it('does not warn when ramp at y=0 has floor at upper elevation', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addFloor(1, 4, 4, 6, 6); // floor at elevation 1 covers cell (5, 5)
      model.addEntity('ramp', 5, 0, 5, { direction: 'north' });

      const { warnings } = validatePuzzle(model);

      expect(warnings.some((w) => /ramp/i.test(w) && /upper/i.test(w))).toBe(false);
    });

    it('warns when ramp has no floor region at lower elevation (y > 0)', () => {
      model.setPlayerSpawn(5, 0, 5);
      // Ramp at y=2, lower elevation is y=2. Need floor at elevation 2 covering (5, 5).
      // Add floor at elevation 3 for upper, but no floor at elevation 2.
      model.addFloor(3, 4, 4, 6, 6); // upper floor exists
      model.addEntity('ramp', 5, 2, 5, { direction: 'north' });

      const { warnings } = validatePuzzle(model);

      expect(warnings.some((w) => /ramp/i.test(w) && /lower/i.test(w))).toBe(true);
    });
  });

  // -- General tests --

  describe('general', () => {
    it('returns zero errors and zero warnings for a valid puzzle', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('creature', 7, 0, 7, {
        song: [{ pitch: 'C4', length: '1/4' }],
        interval: 8,
        audibleRange: 30,
      });
      model.addEntity('gate', 8, 0, 8, {
        song: [{ pitch: 'C4', length: '1/4' }],
      });
      model.addEntity('wall', 8, 0, 7, {}); // wall adjacent to gate
      model.addEntity('fountain', 9, 0, 9, {
        song: [{ pitch: 'C4', length: '1/4' }],
      });

      const { errors, warnings } = validatePuzzle(model);

      expect(errors).toEqual([]);
      expect(warnings).toEqual([]);
    });

    it('reports multiple errors on the same puzzle', () => {
      // No player spawn, creature without song, entity out of bounds
      model.addEntity('creature', 20, 0, 0, { interval: 8, audibleRange: 15 });

      const { errors } = validatePuzzle(model);

      expect(errors.length).toBeGreaterThanOrEqual(2);
    });

    it('keeps warnings and errors in separate arrays', () => {
      // No player spawn (error) and no fountain (warning)
      const result = validatePuzzle(model);

      // Should have at least one error (no player spawn)
      expect(result.errors.some((e) => /player spawn/i.test(e))).toBe(true);
      // Should have at least one warning (no fountain)
      expect(result.warnings.some((w) => /fountain/i.test(w))).toBe(true);

      // Errors should not appear in warnings and vice versa
      expect(result.warnings.some((w) => /player spawn/i.test(w))).toBe(false);
      expect(result.errors.some((e) => e === result.warnings[0])).toBe(false);
    });
  });
});
