/**
 * mergeVoices — a grand staff's voices onto one staff, nothing lost. A pure
 * function, so tested directly: the slicing edge cases (rests, doubled
 * pitches, a slice no single value can write) are hard to reach through
 * the modal.
 */
import mergeVoices from 'editor/model/mergeVoices';

describe('mergeVoices', () => {
  it('lines up equal rhythms as plain chords, low to high, rests where both rest', () => {
    expect(
      mergeVoices([
        [{ pitch: 'E5', length: '1/4' }, { length: '1/4' }],
        [{ pitch: 'C3', length: '1/4' }, { length: '1/4' }],
      ])
    ).toEqual([
      [
        { pitch: 'C3', length: '1/4' },
        { pitch: 'E5', length: '1/4' },
      ],
      { length: '1/4' },
    ]);
  });

  it('keeps a pitch both staves sound once, and a lone voice’s note as a note', () => {
    expect(
      mergeVoices([
        [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'D4', length: '1/4' },
        ],
        [{ pitch: 'C4', length: '1/4' }, { length: '1/4' }],
      ])
    ).toEqual([
      { pitch: 'C4', length: '1/4' },
      { pitch: 'D4', length: '1/4' },
    ]);
  });

  it('writes a slice no one value can as tied values (rests as rests)', () => {
    // A whole note against a dotted eighth + eighth: slices of 3/16, 1/8, 11/16
    const merged = mergeVoices([
      [{ pitch: 'G4', length: '1/1' }],
      [
        { pitch: 'C3', length: '1/8', dotted: true },
        { pitch: 'D3', length: '1/8' },
      ],
    ]);
    expect(merged).toEqual([
      [
        { pitch: 'C3', length: '1/8', dotted: true },
        { pitch: 'G4', length: '1/8', dotted: true, tie: 'start' },
      ],
      [
        { pitch: 'D3', length: '1/8' },
        { pitch: 'G4', length: '1/8', tie: 'continue' },
      ],
      { pitch: 'G4', length: '1/2', tie: 'continue' },
      { pitch: 'G4', length: '1/8', dotted: true, tie: 'stop' },
    ]);
  });

  it('carries a tie the voice already had', () => {
    expect(
      mergeVoices([
        [
          { pitch: 'A4', length: '1/4', tie: 'start' },
          { pitch: 'A4', length: '1/4', tie: 'stop' },
        ],
        [],
      ])
    ).toEqual([
      { pitch: 'A4', length: '1/4', tie: 'start' },
      { pitch: 'A4', length: '1/4', tie: 'stop' },
    ]);
  });
});
