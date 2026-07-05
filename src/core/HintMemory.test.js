import HintMemory from 'core/HintMemory';

describe('HintMemory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports a hint as not retired before the player performs its action', () => {
    expect(HintMemory.isRetired('record')).toBe(false);
  });

  it('retires a hint permanently once performed', () => {
    HintMemory.retire('record');
    expect(HintMemory.isRetired('record')).toBe(true);

    // Persisted, not just in-memory: a fresh load sees the retirement
    const stored = JSON.parse(localStorage.getItem('resound-hints'));
    expect(stored.retired).toContain('record');
  });

  it('retiring twice stores the hint only once', () => {
    HintMemory.retire('move');
    HintMemory.retire('move');
    const stored = JSON.parse(localStorage.getItem('resound-hints'));
    expect(stored.retired).toEqual(['move']);
  });

  it('tracks hints independently', () => {
    HintMemory.retire('move');
    expect(HintMemory.isRetired('move')).toBe(true);
    expect(HintMemory.isRetired('playback')).toBe(false);
  });

  it('survives corrupted storage by starting fresh', () => {
    localStorage.setItem('resound-hints', 'not json {{{');
    expect(HintMemory.isRetired('move')).toBe(false);
    HintMemory.retire('move');
    expect(HintMemory.isRetired('move')).toBe(true);
  });

  it('reset clears all retirements (fresh player gets full onboarding)', () => {
    HintMemory.retire('move');
    HintMemory.retire('record');
    HintMemory.reset();
    expect(HintMemory.isRetired('move')).toBe(false);
    expect(HintMemory.isRetired('record')).toBe(false);
  });
});
