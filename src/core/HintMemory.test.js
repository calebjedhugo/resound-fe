import HintMemory from 'core/HintMemory';

// Hints are puzzle-driven (ruled 2026-07-11): the puzzle's `teaches` list
// activates hints there. Performing an action retires its hint for the rest
// of the PLAYTHROUGH (ruled 2026-07-16 — each lesson happens once; doorway
// crossings never re-arm it; a fresh world entry calls reset()).
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

  it('performing the action retires the hint', () => {
    HintMemory.arm(['move', 'record']);
    HintMemory.retire('move');
    expect(HintMemory.isRetired('move')).toBe(true);
    expect(HintMemory.isRetired('record')).toBe(false);
  });

  it('a performed hint STAYS retired across visits (each lesson happens once, ruled 2026-07-16)', () => {
    HintMemory.arm(['move']);
    HintMemory.retire('move');
    expect(HintMemory.isRetired('move')).toBe(true);

    HintMemory.arm(['move']); // crossing back into a puzzle that teaches move
    expect(HintMemory.isRetired('move')).toBe(true);
  });

  it('a fresh playthrough (reset) re-arms everything', () => {
    HintMemory.arm(['move']);
    HintMemory.retire('move');

    HintMemory.reset(); // world entry from the menu / deep link
    HintMemory.arm(['move']);
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
