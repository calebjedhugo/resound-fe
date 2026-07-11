import HintMemory from 'core/HintMemory';

// Hints are puzzle-driven (ruled 2026-07-11): the puzzle's `teaches` list
// activates hints for the visit; performing an action retires its hint for
// THIS VISIT ONLY — re-entering the puzzle re-arms everything.
describe('HintMemory', () => {
  beforeEach(() => {
    HintMemory.reset();
  });

  it('a hint the puzzle teaches is live until performed', () => {
    HintMemory.arm(['move', 'record']);
    expect(HintMemory.isRetired('move')).toBe(false);
    expect(HintMemory.isRetired('record')).toBe(false);
  });

  it('a hint the puzzle does NOT teach never shows', () => {
    HintMemory.arm(['move']);
    expect(HintMemory.isRetired('record')).toBe(true);
    expect(HintMemory.isRetired('clap')).toBe(true);
  });

  it('performing the action retires the hint for the current visit', () => {
    HintMemory.arm(['move', 'record']);
    HintMemory.retire('move');
    expect(HintMemory.isRetired('move')).toBe(true);
    expect(HintMemory.isRetired('record')).toBe(false);
  });

  it('re-entering a puzzle re-arms its hints (retirement is per-visit, not forever)', () => {
    HintMemory.arm(['move']);
    HintMemory.retire('move');
    expect(HintMemory.isRetired('move')).toBe(true);

    HintMemory.arm(['move']); // a fresh visit to a puzzle teaching move
    expect(HintMemory.isRetired('move')).toBe(false);
  });

  it('a puzzle with no teaches list keeps every hint eligible (dev/legacy levels)', () => {
    HintMemory.arm(undefined);
    expect(HintMemory.isRetired('move')).toBe(false);
    expect(HintMemory.isRetired('clap')).toBe(false);
    HintMemory.retire('clap');
    expect(HintMemory.isRetired('clap')).toBe(true);
  });

  it('nothing persists across sessions (no browser storage)', () => {
    HintMemory.arm(['move']);
    HintMemory.retire('move');
    expect(localStorage.getItem('resound-hints')).toBeNull();
  });
});
