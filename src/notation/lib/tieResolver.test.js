import { resolveTies } from 'notation/lib/tieResolver';

describe('tieResolver', () => {
  describe('resolveTies', () => {
    it('returns empty array when no ties are present', () => {
      const result = resolveTies([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ]);
      expect(result).toEqual([]);
    });

    it('returns empty array for empty notes', () => {
      expect(resolveTies([])).toEqual([]);
    });

    it('resolves a simple start/stop tie pair', () => {
      const result = resolveTies([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'C4', length: '1/4', tie: 'stop' },
      ]);
      expect(result).toEqual([{ startIndex: 0, endIndex: 1, pitch: 'C4' }]);
    });

    it('resolves a three-note tie chain (start, continue, stop)', () => {
      const result = resolveTies([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'C4', length: '1/4', tie: 'continue' },
        { pitch: 'C4', length: '1/4', tie: 'stop' },
      ]);
      expect(result).toEqual([
        { startIndex: 0, endIndex: 1, pitch: 'C4' },
        { startIndex: 1, endIndex: 2, pitch: 'C4' },
      ]);
    });

    it('resolves a four-note tie chain', () => {
      const result = resolveTies([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'C4', length: '1/4', tie: 'continue' },
        { pitch: 'C4', length: '1/4', tie: 'continue' },
        { pitch: 'C4', length: '1/4', tie: 'stop' },
      ]);
      expect(result).toEqual([
        { startIndex: 0, endIndex: 1, pitch: 'C4' },
        { startIndex: 1, endIndex: 2, pitch: 'C4' },
        { startIndex: 2, endIndex: 3, pitch: 'C4' },
      ]);
    });

    it('ignores unresolved tie start at end of array', () => {
      const result = resolveTies([{ pitch: 'C4', length: '1/4', tie: 'start' }]);
      expect(result).toEqual([]);
    });

    it('ignores orphan tie stop with no preceding start', () => {
      const result = resolveTies([{ pitch: 'C4', length: '1/4', tie: 'stop' }]);
      expect(result).toEqual([]);
    });

    it('does not tie when pitches do not match', () => {
      const result = resolveTies([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'D4', length: '1/4', tie: 'stop' },
      ]);
      expect(result).toEqual([]);
    });

    it('does not tie across a rest', () => {
      const result = resolveTies([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { length: '1/4' },
        { pitch: 'C4', length: '1/4', tie: 'stop' },
      ]);
      expect(result).toEqual([]);
    });

    it('resolves ties within chord elements', () => {
      const result = resolveTies([
        [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'G4', length: '1/4', tie: 'start' },
        ],
        [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'G4', length: '1/4', tie: 'stop' },
        ],
      ]);
      expect(result).toEqual([{ startIndex: 0, endIndex: 1, pitch: 'G4' }]);
    });

    it('resolves multiple simultaneous ties in chords', () => {
      const result = resolveTies([
        [
          { pitch: 'C4', length: '1/4', tie: 'start' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4', tie: 'start' },
        ],
        [
          { pitch: 'C4', length: '1/4', tie: 'stop' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4', tie: 'stop' },
        ],
      ]);
      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ startIndex: 0, endIndex: 1, pitch: 'C4' });
      expect(result).toContainEqual({ startIndex: 0, endIndex: 1, pitch: 'G4' });
    });

    it('resolves a tie from chord to single note', () => {
      const result = resolveTies([
        [
          { pitch: 'C4', length: '1/4', tie: 'start' },
          { pitch: 'E4', length: '1/4' },
        ],
        { pitch: 'C4', length: '1/4', tie: 'stop' },
      ]);
      expect(result).toEqual([{ startIndex: 0, endIndex: 1, pitch: 'C4' }]);
    });

    it('resolves mixed tied notes among untied notes', () => {
      const result = resolveTies([
        { pitch: 'E4', length: '1/4' },
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'C4', length: '1/4', tie: 'stop' },
        { pitch: 'G4', length: '1/4' },
      ]);
      expect(result).toEqual([{ startIndex: 1, endIndex: 2, pitch: 'C4' }]);
    });

    it('resolves independent tie chains on different pitches in chords', () => {
      const result = resolveTies([
        [
          { pitch: 'C4', length: '1/4', tie: 'start' },
          { pitch: 'G4', length: '1/4', tie: 'start' },
        ],
        [
          { pitch: 'C4', length: '1/4', tie: 'continue' },
          { pitch: 'G4', length: '1/4', tie: 'stop' },
        ],
        [
          { pitch: 'C4', length: '1/4', tie: 'stop' },
          { pitch: 'G4', length: '1/4' },
        ],
      ]);
      expect(result).toHaveLength(3);
      expect(result).toContainEqual({ startIndex: 0, endIndex: 1, pitch: 'C4' });
      expect(result).toContainEqual({ startIndex: 0, endIndex: 1, pitch: 'G4' });
      expect(result).toContainEqual({ startIndex: 1, endIndex: 2, pitch: 'C4' });
    });

    it('cancels open tie when pitch does not match at next element', () => {
      const result = resolveTies([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'D4', length: '1/4' },
        { pitch: 'C4', length: '1/4', tie: 'stop' },
      ]);
      // The tie should be cancelled because D4 (no tie property, different pitch)
      // intervenes — ties must connect consecutive elements
      expect(result).toEqual([]);
    });
  });
});
