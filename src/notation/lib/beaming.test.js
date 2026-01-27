import { computeBeamGroups } from 'notation/lib/beaming';

describe('beaming', () => {
  describe('computeBeamGroups', () => {
    it('returns empty array when timeSignature is null (unmetered)', () => {
      const notes = [
        { pitch: 'C4', length: '1/8' },
        { pitch: 'D4', length: '1/8' },
      ];
      expect(computeBeamGroups(notes, null)).toEqual([]);
    });

    it('returns empty array for empty notes', () => {
      expect(computeBeamGroups([], [4, 4])).toEqual([]);
    });

    it('groups two consecutive eighth notes in the same beat', () => {
      const notes = [
        { pitch: 'C4', length: '1/8' },
        { pitch: 'D4', length: '1/8' },
      ];
      const groups = computeBeamGroups(notes, [4, 4]);
      expect(groups).toEqual([[0, 1]]);
    });

    it('does not group quarter notes (not beamable)', () => {
      const notes = [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
      ];
      expect(computeBeamGroups(notes, [4, 4])).toEqual([]);
    });

    it('does not create a group from a single eighth note', () => {
      const notes = [
        { pitch: 'C4', length: '1/8' },
        { pitch: 'D4', length: '1/4' },
      ];
      expect(computeBeamGroups(notes, [4, 4])).toEqual([]);
    });

    it('breaks beams at beat boundaries', () => {
      // In 4/4, each beat = 1 quarter note
      // Two eighths in beat 1, two eighths in beat 2
      const notes = [
        { pitch: 'C4', length: '1/8' }, // beat 0, 0.5 beats
        { pitch: 'D4', length: '1/8' }, // beat 0, 0.5 beats → end of beat 0
        { pitch: 'E4', length: '1/8' }, // beat 1
        { pitch: 'F4', length: '1/8' }, // beat 1
      ];
      const groups = computeBeamGroups(notes, [4, 4]);
      expect(groups).toEqual([
        [0, 1],
        [2, 3],
      ]);
    });

    it('rests break beam groups', () => {
      const notes = [
        { pitch: 'C4', length: '1/8' },
        { length: '1/8' }, // rest
        { pitch: 'E4', length: '1/8' },
        { pitch: 'F4', length: '1/8' },
      ];
      const groups = computeBeamGroups(notes, [4, 4]);
      // First eighth is alone (rest breaks it), last two could group if in same beat
      // C4=0.5 beats, rest=0.5 beats (end of beat 0), E4 starts at beat 1, F4 at beat 1.5
      // E4 and F4 are in beat 1 together
      expect(groups).toEqual([[2, 3]]);
    });

    it('limits beam groups to 4 notes maximum', () => {
      // Five 16th notes in one beat (0.25 each, total 1.25 — exceeds beat)
      // Actually let me make it 5 in 2 beats: first 4 form one group, 5th is alone
      const notes = [
        { pitch: 'C4', length: '1/16' }, // 0.25
        { pitch: 'D4', length: '1/16' }, // 0.25
        { pitch: 'E4', length: '1/16' }, // 0.25
        { pitch: 'F4', length: '1/16' }, // 0.25 → total 1.0 = end of beat 0
        { pitch: 'G4', length: '1/16' }, // beat 1
        { pitch: 'A4', length: '1/16' }, // beat 1
      ];
      const groups = computeBeamGroups(notes, [4, 4]);
      expect(groups).toEqual([
        [0, 1, 2, 3],
        [4, 5],
      ]);
    });

    it('splits when exceeding 4 notes within same beat', () => {
      // Use 2/2 time: beat = half note = 2 quarter-note-beats
      // 5 eighth notes all within the same beat
      const notes = [
        { pitch: 'C4', length: '1/8' },
        { pitch: 'D4', length: '1/8' },
        { pitch: 'E4', length: '1/8' },
        { pitch: 'F4', length: '1/8' },
        { pitch: 'G4', length: '1/8' },
      ];
      // 5 eighths = 2.5 beats. In 2/2, beat = 2 beats.
      // All 5 start within beat 0 (starts at 0, 0.5, 1.0, 1.5, 2.0)
      // 5th note starts at 2.0 which is beat 1
      // So first 4 in beat 0, 5th in beat 1
      const groups = computeBeamGroups(notes, [2, 2]);
      expect(groups).toEqual([[0, 1, 2, 3]]);
    });

    it('groups 16th notes', () => {
      const notes = [
        { pitch: 'C4', length: '1/16' },
        { pitch: 'D4', length: '1/16' },
        { pitch: 'E4', length: '1/16' },
        { pitch: 'F4', length: '1/16' },
      ];
      const groups = computeBeamGroups(notes, [4, 4]);
      expect(groups).toEqual([[0, 1, 2, 3]]);
    });

    it('handles mixed beamable and non-beamable notes', () => {
      const notes = [
        { pitch: 'C4', length: '1/8' },
        { pitch: 'D4', length: '1/8' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'F4', length: '1/8' },
        { pitch: 'G4', length: '1/8' },
      ];
      // Beat 0: C4(0-0.5), D4(0.5-1.0) → group [0,1]
      // Beat 1: E4(1.0-2.0) quarter → not beamable
      // Beat 2: F4(2.0-2.5), G4(2.5-3.0) → group [3,4]
      const groups = computeBeamGroups(notes, [4, 4]);
      expect(groups).toEqual([
        [0, 1],
        [3, 4],
      ]);
    });

    it('handles compound time (6/8)', () => {
      // 6/8 has compound beats of dotted quarter (1.5 quarter-note-beats)
      const notes = [
        { pitch: 'C4', length: '1/8' }, // 0
        { pitch: 'D4', length: '1/8' }, // 0.5
        { pitch: 'E4', length: '1/8' }, // 1.0 (still in beat 0, which spans 0-1.5)
        { pitch: 'F4', length: '1/8' }, // 1.5 (beat 1)
        { pitch: 'G4', length: '1/8' }, // 2.0
        { pitch: 'A4', length: '1/8' }, // 2.5
      ];
      const groups = computeBeamGroups(notes, [6, 8]);
      expect(groups).toEqual([
        [0, 1, 2],
        [3, 4, 5],
      ]);
    });

    it('does not group half notes or longer', () => {
      const notes = [
        { pitch: 'C4', length: '1/2' },
        { pitch: 'D4', length: '1/1' },
      ];
      expect(computeBeamGroups(notes, [4, 4])).toEqual([]);
    });

    it('handles dotted eighth notes in beat calculation', () => {
      // Dotted eighth = 0.75 beats
      const notes = [
        { pitch: 'C4', length: '1/8', dotted: true }, // 0.75 beats
        { pitch: 'D4', length: '1/16' }, // 0.25 beats
      ];
      // Both in beat 0 (0 to 1.0), total = 1.0
      const groups = computeBeamGroups(notes, [4, 4]);
      expect(groups).toEqual([[0, 1]]);
    });

    it('skips chords (arrays) without crashing', () => {
      const notes = [
        { pitch: 'C4', length: '1/8' },
        [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
        ],
        { pitch: 'D4', length: '1/8' },
      ];
      // C4 is alone before chord, D4 is alone after
      const groups = computeBeamGroups(notes, [4, 4]);
      expect(groups).toEqual([]);
    });
  });
});
