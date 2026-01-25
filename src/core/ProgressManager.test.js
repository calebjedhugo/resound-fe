import ProgressManager from 'core/ProgressManager';

describe('ProgressManager', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('load', () => {
    it('returns empty progress when localStorage is empty', () => {
      const progress = ProgressManager.load();
      expect(progress).toEqual({ completedPuzzles: [] });
    });

    it('returns parsed progress from localStorage', () => {
      localStorage.setItem(
        'resound-progress',
        JSON.stringify({ completedPuzzles: ['puzzle-1', 'puzzle-2'] })
      );

      const progress = ProgressManager.load();
      expect(progress.completedPuzzles).toEqual(['puzzle-1', 'puzzle-2']);
    });

    it('returns empty progress when localStorage contains invalid JSON', () => {
      localStorage.setItem('resound-progress', 'invalid json {{{');

      const progress = ProgressManager.load();

      expect(progress).toEqual({ completedPuzzles: [] });
    });
  });

  describe('save', () => {
    it('saves progress to localStorage', () => {
      ProgressManager.save({ completedPuzzles: ['puzzle-1'] });

      const stored = JSON.parse(localStorage.getItem('resound-progress'));
      expect(stored.completedPuzzles).toEqual(['puzzle-1']);
    });

    it('handles localStorage errors gracefully', () => {
      const originalSetItem = localStorage.setItem.bind(localStorage);
      localStorage.setItem = jest.fn(() => {
        throw new Error('QuotaExceededError');
      });

      // Should not throw when localStorage fails
      expect(() => {
        ProgressManager.save({ completedPuzzles: ['puzzle-1'] });
      }).not.toThrow();

      localStorage.setItem = originalSetItem;
    });
  });

  describe('markComplete', () => {
    it('adds puzzle to completed list', () => {
      ProgressManager.markComplete('puzzle-1');

      const progress = ProgressManager.load();
      expect(progress.completedPuzzles).toContain('puzzle-1');
    });

    it('does not add duplicate puzzle', () => {
      ProgressManager.markComplete('puzzle-1');
      ProgressManager.markComplete('puzzle-1');

      const progress = ProgressManager.load();
      expect(progress.completedPuzzles).toEqual(['puzzle-1']);
    });
  });

  describe('markPuzzleComplete', () => {
    it('is an alias for markComplete', () => {
      ProgressManager.markPuzzleComplete('puzzle-1');

      const progress = ProgressManager.load();
      expect(progress.completedPuzzles).toContain('puzzle-1');
    });
  });

  describe('isComplete', () => {
    it('returns true for completed puzzle', () => {
      ProgressManager.markComplete('puzzle-1');
      expect(ProgressManager.isComplete('puzzle-1')).toBe(true);
    });

    it('returns false for uncompleted puzzle', () => {
      expect(ProgressManager.isComplete('puzzle-1')).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears all progress from localStorage', () => {
      ProgressManager.markComplete('puzzle-1');
      ProgressManager.markComplete('puzzle-2');

      ProgressManager.reset();

      const progress = ProgressManager.load();
      expect(progress.completedPuzzles).toEqual([]);
    });
  });

  describe('getCompletedCount', () => {
    it('returns 0 when no puzzles completed', () => {
      expect(ProgressManager.getCompletedCount()).toBe(0);
    });

    it('returns correct count of completed puzzles', () => {
      ProgressManager.markComplete('puzzle-1');
      ProgressManager.markComplete('puzzle-2');
      ProgressManager.markComplete('puzzle-3');

      expect(ProgressManager.getCompletedCount()).toBe(3);
    });
  });

  describe('getNextUnsolvedPuzzle', () => {
    const puzzles = [
      { id: 'puzzle-1', name: 'First' },
      { id: 'puzzle-2', name: 'Second' },
      { id: 'puzzle-3', name: 'Third' },
    ];

    it('returns first puzzle when none completed', () => {
      const next = ProgressManager.getNextUnsolvedPuzzle(puzzles);
      expect(next).toEqual({ id: 'puzzle-1', name: 'First' });
    });

    it('returns next unsolved puzzle after some completed', () => {
      ProgressManager.markComplete('puzzle-1');

      const next = ProgressManager.getNextUnsolvedPuzzle(puzzles);
      expect(next).toEqual({ id: 'puzzle-2', name: 'Second' });
    });

    it('returns null when all puzzles completed', () => {
      ProgressManager.markComplete('puzzle-1');
      ProgressManager.markComplete('puzzle-2');
      ProgressManager.markComplete('puzzle-3');

      const next = ProgressManager.getNextUnsolvedPuzzle(puzzles);
      expect(next).toBeNull();
    });

    it('returns null for empty puzzle list', () => {
      const next = ProgressManager.getNextUnsolvedPuzzle([]);
      expect(next).toBeNull();
    });
  });
});
