/**
 * Anchored rhythm matching tests
 *
 * Design rulings under test (DESIGN.md, 2026-07-11): the gate must hear its
 * song EXACTLY, and how that happens does not matter — a target embedded in
 * a longer performance matches, sounds before/after the window are ignored,
 * and completion fires the moment the target's span elapses. What fails:
 * rotated takes, prefixes, and any foreign note INSIDE the aligned window
 * (in-window exclusivity is the jam mechanic). Rests in the target are
 * matchable as required silence; polyphonic targets keep their rhythm.
 */
import gameState from 'core/GameState';
import SongMatcher from 'core/SongMatcher';
import evaluatePhrases from 'core/phraseMatching';

const TEMPO = 120; // 500ms per beat
const MS_PER_BEAT = 60000 / TEMPO;

const TARGET = [
  { pitch: 'B4', length: '1/4' },
  { pitch: 'C#5', length: '1/4' },
  { pitch: 'G#4', length: '1/4' },
];

/**
 * Build a listener whose capturedNotes place note events at the given beat
 * offsets, with "now" a given number of beats after the listening epoch.
 */
function makeListener({ notes, nowBeats, requiredSong = TARGET }) {
  const listeningStartTime = Date.now() - nowBeats * MS_PER_BEAT;
  return {
    requiredSong,
    listeningStartTime,
    capturedNotes: notes.map(([beat, pitch, length = '1/4']) => ({
      pitch,
      length,
      timestamp: listeningStartTime + beat * MS_PER_BEAT,
    })),
  };
}

beforeAll(() => {
  gameState.initMusicalClock(TEMPO);
});

describe('SongMatcher.targetTimeline', () => {
  it('walks a flat song into onsets at quarter-note beats', () => {
    const t = SongMatcher.targetTimeline(TARGET);
    expect(t.onsets.map((o) => o.beat)).toEqual([0, 1, 2]);
    expect(t.totalBeats).toBe(3);
  });

  it('rests advance the clock without emitting onsets', () => {
    const t = SongMatcher.targetTimeline([
      { pitch: 'B4', length: '1/4' },
      { length: '1/2' }, // rest, 2 beats
      { pitch: 'G#4', length: '1/4' },
    ]);
    expect(t.onsets.map((o) => o.beat)).toEqual([0, 3]);
    expect(t.totalBeats).toBe(4);
  });

  it('chord entries become one onset with multiple notes', () => {
    const t = SongMatcher.targetTimeline([
      [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ],
      { pitch: 'G4', length: '1/4' },
    ]);
    expect(t.onsets).toHaveLength(2);
    expect(t.onsets[0].notes.map((n) => n.pitch).sort()).toEqual(['C4', 'E4']);
  });

  it('voices are walked at their true positions (polyphony preserved)', () => {
    // Treble: two quarters; bass: one half note — simultaneous starts
    const t = SongMatcher.targetTimeline({
      voices: [
        {
          id: 'treble',
          notes: [
            { pitch: 'C5', length: '1/4' },
            { pitch: 'D5', length: '1/4' },
          ],
        },
        { id: 'bass', notes: [{ pitch: 'C3', length: '1/2' }] },
      ],
    });
    expect(t.onsets.map((o) => o.beat)).toEqual([0, 1]);
    expect(t.onsets[0].notes.map((n) => n.pitch).sort()).toEqual(['C3', 'C5']);
    expect(t.onsets[1].notes.map((n) => n.pitch)).toEqual(['D5']);
    expect(t.totalBeats).toBe(2);
  });

  it('a rest inside one voice offsets only that voice', () => {
    const t = SongMatcher.targetTimeline({
      voices: [
        { id: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
        {
          id: 'bass',
          notes: [{ length: '1/4' }, { pitch: 'C3', length: '1/4' }], // rest then note
        },
      ],
    });
    expect(t.onsets.map((o) => o.beat)).toEqual([0, 1]);
    expect(t.onsets[1].notes.map((n) => n.pitch)).toEqual(['C3']);
  });
});

describe('evaluatePhrases — exact anchored matching', () => {
  it('matches a clean take', () => {
    const listener = makeListener({
      notes: [
        [0, 'B4'],
        [1, 'C#5'],
        [2, 'G#4'],
      ],
      nowBeats: 5,
    });
    expect(evaluatePhrases(listener)).toBe(true);
  });

  it('completes the moment the last note ends — no trailing silence required', () => {
    const listener = makeListener({
      notes: [
        [0, 'B4'],
        [1, 'C#5'],
        [2, 'G#4'],
      ],
      nowBeats: 3.1, // just past the target's own span (3 beats)
    });
    expect(evaluatePhrases(listener)).toBe(true);
  });

  it('reports the take in-progress while its final note still sounds', () => {
    const listener = makeListener({
      notes: [
        [0, 'B4'],
        [1, 'C#5'],
        [2, 'G#4'],
      ],
      nowBeats: 2.5, // window not closed yet
    });
    expect(evaluatePhrases(listener)).toBe('in-progress');
  });

  it('reports a partial correct prefix as in-progress (gate opens on the first note)', () => {
    // Only the first note has sounded and the second is not yet due: a valid
    // start of the target, so a play-to-pass gate should open immediately.
    const listener = makeListener({
      notes: [[0, 'B4']],
      nowBeats: 0.5, // before the second onset at beat 1
    });
    expect(evaluatePhrases(listener)).toBe('in-progress');
  });

  it('rejects a rotated take', () => {
    const listener = makeListener({
      notes: [
        [0, 'C#5'],
        [1, 'G#4'],
        [2, 'B4'],
      ],
      nowBeats: 6,
    });
    expect(evaluatePhrases(listener)).toBe('mismatch');
  });

  it('matches an over-long take: the target occurred, the surplus is ignored (superseded 2026-07-11)', () => {
    const listener = makeListener({
      notes: [
        [0, 'B4'],
        [1, 'C#5'],
        [2, 'G#4'],
        [3, 'B4'],
        [4, 'C#5'],
        [5, 'G#4'],
      ],
      nowBeats: 9,
    });
    expect(evaluatePhrases(listener)).toBe(true);
  });

  it('ignores stale earlier sounds separated by silence', () => {
    const listener = makeListener({
      notes: [
        [0, 'D4'],
        [1, 'E4'],
        // 5 beats of silence
        [6, 'B4'],
        [7, 'C#5'],
        [8, 'G#4'],
      ],
      nowBeats: 11,
    });
    expect(evaluatePhrases(listener)).toBe(true);
  });

  it('matches a target embedded in a longer performance (notes right before AND after)', () => {
    // The tape model: the whole tape plays, and a door whose song occurs
    // cleanly anywhere within it opens. No leading or trailing margins.
    const listener = makeListener({
      notes: [
        [-1, 'D4'],
        [0, 'B4'],
        [1, 'C#5'],
        [2, 'G#4'],
        [3, 'E4'], // immediately after the window — sequential surplus
      ],
      nowBeats: 6,
    });
    expect(evaluatePhrases(listener)).toBe(true);
  });

  it('rejects a foreign note DURING the window (in-window exclusivity: the jam)', () => {
    const listener = makeListener({
      notes: [
        [0, 'B4'],
        [0.5, 'D4'], // sounds between the target's onsets
        [1, 'C#5'],
        [2, 'G#4'],
      ],
      nowBeats: 6,
    });
    expect(evaluatePhrases(listener)).toBe('mismatch');
  });

  it('rejects a foreign note colliding with a target onset (chord where a note is due)', () => {
    const listener = makeListener({
      notes: [
        [0, 'B4'],
        [1, 'C#5'],
        [1, 'D4'], // same grid slot as a due single note
        [2, 'G#4'],
      ],
      nowBeats: 6,
    });
    expect(evaluatePhrases(listener)).toBe('mismatch');
  });

  it('creature self-solve equivalence: its own pass is a matching performance', () => {
    // Same shape as the clean take — the source of the notes is irrelevant
    const listener = makeListener({
      notes: [
        [8, 'B4'],
        [9, 'C#5'],
        [10, 'G#4'],
      ],
      nowBeats: 14,
    });
    expect(evaluatePhrases(listener)).toBe(true);
  });

  it('reports each failed utterance once (marker advances)', () => {
    const listener = makeListener({
      notes: [
        [0, 'D4'],
        [1, 'E4'],
      ],
      nowBeats: 5,
    });
    expect(evaluatePhrases(listener)).toBe('mismatch');
    expect(listener.lastPhraseResult.noteCount).toBe(2);
    expect(evaluatePhrases(listener)).toBe(false); // same utterance, no re-fire
  });
});

describe('evaluatePhrases — trim horizon (forgotten notes are not silence)', () => {
  it('an anchor at or before the trim horizon is unjudgeable (a trimmed window could hide corruption)', () => {
    // Notes inside the aligned window that were trimmed away are unknowable
    // — a window whose anchor predates remembered history must never read
    // as clean. (Leading history no longer matters — margins are gone — but
    // the window itself must be fully remembered.)
    const listener = makeListener({
      notes: [
        [0, 'B4'],
        [1, 'C#5'],
        [2, 'G#4'],
      ],
      nowBeats: 6,
    });
    // Memory begins just AFTER the anchor — the window's start is unknowable
    listener._trimHorizonMs = listener.listeningStartTime + 0.2 * MS_PER_BEAT;
    expect(evaluatePhrases(listener)).not.toBe(true);
  });

  it('still matches when the trim horizon is comfortably in the past', () => {
    const listener = makeListener({
      notes: [
        [10, 'B4'],
        [11, 'C#5'],
        [12, 'G#4'],
      ],
      nowBeats: 16,
    });
    listener._trimHorizonMs = listener.listeningStartTime + 2 * MS_PER_BEAT;
    expect(evaluatePhrases(listener)).toBe(true);
  });
});

describe('evaluatePhrases — rests in the target', () => {
  const RESTED_TARGET = [
    { pitch: 'B4', length: '1/4' },
    { length: '1/2' }, // 2-beat rest
    { pitch: 'G#4', length: '1/4' },
  ];

  it('matches a performance that honors the rest', () => {
    const listener = makeListener({
      requiredSong: RESTED_TARGET,
      notes: [
        [0, 'B4'],
        [3, 'G#4'], // after the 2-beat rest
      ],
      nowBeats: 7,
    });
    expect(evaluatePhrases(listener)).toBe(true);
  });

  it('rejects a performance that ignores the rest (notes contiguous)', () => {
    const listener = makeListener({
      requiredSong: RESTED_TARGET,
      notes: [
        [0, 'B4'],
        [1, 'G#4'], // too early — the rest was not honored
      ],
      nowBeats: 7,
    });
    expect(evaluatePhrases(listener)).toBe('mismatch');
  });

  it('rejects a note sounding during the rest', () => {
    const listener = makeListener({
      requiredSong: RESTED_TARGET,
      notes: [
        [0, 'B4'],
        [2, 'D4'], // inside the rest
        [3, 'G#4'],
      ],
      nowBeats: 7,
    });
    expect(evaluatePhrases(listener)).toBe('mismatch');
  });

  it('does not flash a mismatch mid-performance during a long rest', () => {
    // Only the first note has sounded; the rest is still elapsing and the
    // performance could still complete — reported in-progress, never a miss.
    const listener = makeListener({
      requiredSong: RESTED_TARGET,
      notes: [[0, 'B4']],
      nowBeats: 2.5, // inside the rest window
    });
    expect(evaluatePhrases(listener)).toBe('in-progress');
  });
});

describe('evaluatePhrases — polyphonic targets', () => {
  const CHORD_TARGET = [
    [
      { pitch: 'C4', length: '1/4' },
      { pitch: 'E4', length: '1/4' },
    ],
    { pitch: 'G4', length: '1/4' },
  ];

  it('matches simultaneous captured notes against a chord onset', () => {
    const listener = makeListener({
      requiredSong: CHORD_TARGET,
      notes: [
        [0, 'C4'],
        [0, 'E4'],
        [1, 'G4'],
      ],
      nowBeats: 5,
    });
    expect(evaluatePhrases(listener)).toBe(true);
  });

  it('rejects when a chord member is missing', () => {
    const listener = makeListener({
      requiredSong: CHORD_TARGET,
      notes: [
        [0, 'C4'],
        [1, 'G4'],
      ],
      nowBeats: 5,
    });
    expect(evaluatePhrases(listener)).toBe('mismatch');
  });

  it('matches a two-voice target with independent rhythms', () => {
    const VOICES_TARGET = {
      voices: [
        {
          id: 'treble',
          notes: [
            { pitch: 'C5', length: '1/4' },
            { pitch: 'D5', length: '1/4' },
          ],
        },
        { id: 'bass', notes: [{ pitch: 'C3', length: '1/2' }] },
      ],
    };
    const listener = makeListener({
      requiredSong: VOICES_TARGET,
      notes: [
        [0, 'C5'],
        [0, 'C3', '1/2'],
        [1, 'D5'],
      ],
      nowBeats: 5,
    });
    expect(evaluatePhrases(listener)).toBe(true);
  });
});
