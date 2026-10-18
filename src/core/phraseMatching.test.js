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
import ListeningManager from 'core/ListeningManager';
import evaluatePhrases, { evaluatePhrasesCached } from 'core/phraseMatching';
import heardStreams from '../__tests__/fixtures/listening/heard-streams.json';

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

  it('stays in-progress ACROSS an onset boundary while the due note may still land (no fade flicker)', () => {
    // Between one note's end and the next onset, the next note arrives a few
    // frames "late" (scheduling jitter within the matcher's own tolerance).
    // Judging those frames as not-in-progress snapped the gate shell opaque
    // mid-performance — read as negative feedback during a CORRECT take.
    const listener = makeListener({
      notes: [[0, 'B4']],
      nowBeats: 1.05, // the second onset (beat 1) is due but within tolerance
    });
    expect(evaluatePhrases(listener)).toBe('in-progress');
  });

  it('a conclusively missed due onset is a mismatch AT ONCE (ruled 2026-07-16)', () => {
    // The performance died — no waiting for the utterance to end: the flash
    // lands immediately (and a gate starts its lockout).
    const listener = makeListener({
      notes: [[0, 'B4']],
      nowBeats: 1.2, // past beat 1 + tolerance: the performance died
    });
    expect(evaluatePhrases(listener)).toBe('mismatch');
  });

  it('a WRONG note at the due onset fails immediately — the grace is only for silence', () => {
    const listener = makeListener({
      notes: [
        [0, 'B4'],
        [1, 'F4'],
      ],
      nowBeats: 1.05,
    });
    expect(evaluatePhrases(listener)).not.toBe('in-progress');
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

/**
 * Gates and fountains judge through evaluatePhrasesCached, which judges
 * afresh only when the verdict could have changed. Its verdict — and what
 * it writes on the listener — must be EXACTLY a fresh evaluatePhrases' at
 * every call. Each check feeds two twin listeners identically, one judged
 * afresh and one through the cache.
 */
describe('Judging only when the verdict can change (evaluatePhrasesCached)', () => {
  const EPOCH = 1760000000000;
  const VERDICTS = [false, true, 'in-progress', 'mismatch'];

  const twins = (requiredSong) =>
    [0, 1].map(() => ({ requiredSong, listeningStartTime: EPOCH, capturedNotes: [] }));

  /** Judge both twins now; a disagreement is reported, else the verdict. */
  const judgeTwins = ([fresh, cached], disagreements, where) => {
    const verdict = evaluatePhrases(fresh);
    const cachedVerdict = evaluatePhrasesCached(cached);
    if (
      cachedVerdict !== verdict ||
      !Object.is(cached._lastJudgedStartBeat, fresh._lastJudgedStartBeat) ||
      JSON.stringify(cached.lastPhraseResult) !== JSON.stringify(fresh.lastPhraseResult)
    ) {
      disagreements.push({ ...where, fresh: verdict, cached: cachedVerdict });
    }
    return verdict;
  };

  const setTempo = (tempo) => {
    if (gameState.musicalClock.tempo !== tempo) gameState.initMusicalClock(tempo);
  };

  /**
   * Recorded play (fixtures/listening/heard-streams.json): every judgment
   * the gates and fountains of real levels made while their creatures sang
   * and the player played right and wrong takes (The Star, the jam, the
   * awakening, the lure, test-004, elevation-demo), from the code before the
   * cache. Per listener: its song, every note it heard (`[pitch, length,
   * ms]`, in the order heard) and its calls, run-length coded:
   * `[ms, from, to, trimHorizonMs, lastJudgedBefore, verdict, lastJudgedAfter,
   * tempo, repeat]` — at `ms` it held notes[from..to), and the same call
   * repeated `repeat` times, 16 ms apart. Times count from its epoch.
   */
  it('agrees with a fresh judgment, and with the verdicts of recorded play', () => {
    const hear = (listener, notes, [, from, to, trim, judgedBefore]) => {
      // The heard list grows in place (onNoteCaptured) or is replaced (a
      // trim, a consumed take)
      const heard = notes.slice(from, to).map(([pitch, length, ms]) => ({
        pitch,
        length,
        timestamp: EPOCH + ms,
      }));
      const grows = listener.from === from && listener.capturedNotes.length <= heard.length;
      if (grows) listener.capturedNotes.push(...heard.slice(listener.capturedNotes.length));
      Object.assign(listener, {
        from,
        capturedNotes: grows ? listener.capturedNotes : heard,
        _trimHorizonMs: trim === null ? undefined : EPOCH + trim,
        _lastJudgedStartBeat: judgedBefore === null ? undefined : judgedBefore,
      });
    };

    const disagreements = [];
    let calls = 0;
    for (const stream of heardStreams) {
      const pair = twins(stream.song);
      for (const call of stream.calls) {
        const [ms, , , , , verdict, judgedAfter, tempo, repeat] = call;
        setTempo(tempo);
        for (let k = 0; k < repeat; k += 1) {
          const at = ms + 16 * k;
          jest.setSystemTime(EPOCH + at);
          pair.forEach((listener) => hear(listener, stream.notes, call));
          const where = { stream: stream.id, at };
          const fresh = judgeTwins(pair, disagreements, where);
          const recordedJudged = judgedAfter === null ? undefined : judgedAfter;
          if (
            fresh !== VERDICTS[verdict] ||
            !Object.is(pair[0]._lastJudgedStartBeat, recordedJudged)
          ) {
            disagreements.push({ ...where, fresh, recorded: VERDICTS[verdict] });
          }
          calls += 1;
        }
      }
    }
    expect(calls).toBe(16947);
    expect(disagreements).toEqual([]);
  });

  it('agrees with a fresh judgment over random streams: takes, strays, chords, trims, tempo changes', () => {
    // Small deterministic PRNG so failures reproduce
    let seed = 2026;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pick = (list) => list[Math.floor(random() * list.length)];
    const SONGS = [
      TARGET,
      [
        { pitch: 'C4', length: '1/8' },
        { pitch: 'C4', length: '1/8' },
        { pitch: 'G4', length: '1/2' },
      ],
      [{ pitch: 'E4', length: '1/4' }, { length: '1/4' }, { pitch: 'G4', length: '1/4' }],
      [
        [
          { pitch: 'C4', length: '1/2' },
          { pitch: 'E4', length: '1/2' },
        ],
        { pitch: 'G4', length: '1/4' },
      ],
      {
        voices: [
          {
            notes: [
              { pitch: 'C5', length: '1/4' },
              { pitch: 'D5', length: '1/4' },
            ],
          },
          { notes: [{ pitch: 'C3', length: '1/2' }] },
        ],
      },
      [{ pitch: 'A4', length: '1/1' }],
    ];
    const STRAYS = [
      { pitch: 'F#4', length: '1/4' },
      { pitch: 'B3', length: '1/8' },
      { pitch: 'C4', length: '1/2' },
    ];

    const disagreements = [];
    for (let stream = 0; stream < 120; stream += 1) {
      const song = pick(SONGS);
      const pair = twins(song);
      const { onsets } = SongMatcher.targetTimeline(song);
      let clockMs = 0;
      const pending = []; // sounds on their way: { at, note }
      setTempo(pick([90, 100, 120, 150]));
      const hear = (note, at) =>
        pair.forEach((listener) => listener.capturedNotes.push({ ...note, timestamp: EPOCH + at }));
      for (let frame = 0; frame < 400; frame += 1) {
        // Frames are mostly steady, sometimes late, rarely a hair BACK in time
        clockMs += pick([16, 16, 16, 16, 0, 33, 50, -3]);
        const ms = clockMs;
        jest.setSystemTime(EPOCH + ms);

        const roll = random();
        if (roll < 0.02) {
          // A take of the song: on time or a little off, sometimes with a
          // wrong or missing note
          const msPerBeat = 60000 / gameState.musicalClock.tempo;
          onsets.forEach((onset) => {
            const at = ms + onset.beat * msPerBeat + pick([0, 0, 0, 20, -20, 70]);
            const fate = random();
            if (fate < 0.08) return; // dropped
            const notes = fate < 0.16 ? [pick(STRAYS)] : onset.notes;
            notes.forEach((note) => pending.push({ at, note }));
          });
        } else if (roll < 0.04) {
          // A stray sound, sometimes two at once (a chord)
          pending.push({ at: ms, note: pick(STRAYS) });
          if (random() < 0.3) pending.push({ at: ms, note: pick(STRAYS) });
        } else if (roll < 0.045) {
          setTempo(pick([90, 100, 120, 150]));
        } else if (roll < 0.055) {
          // A trim: notes older than some cutoff are forgotten
          const cutoff = EPOCH + ms - Math.floor(random() * 6000);
          pair.forEach((listener) =>
            Object.assign(listener, {
              capturedNotes: listener.capturedNotes.filter((n) => n.timestamp >= cutoff),
              _trimHorizonMs: cutoff,
            })
          );
        } else if (roll < 0.065) {
          // Anything else a listener's owner may change, one at a time
          const otherSong = pick(SONGS);
          const change = pick([
            // a new heard list of the same length (its first sound swapped)
            (listener) => ({
              capturedNotes: listener.capturedNotes.map((n, i) => (i ? n : { ...n, pitch: 'D4' })),
            }),
            // the trim horizon alone, just past the first sound heard
            (listener) => ({
              _trimHorizonMs: (listener.capturedNotes[0]?.timestamp ?? EPOCH + ms) + 1,
            }),
            () => ({ _lastJudgedStartBeat: undefined }), // the last judged sound forgotten
            (listener) => ({ listeningStartTime: listener.listeningStartTime - 125 }), // epoch
            () => ({ requiredSong: otherSong }), // the song itself
          ]);
          pair.forEach((listener) => Object.assign(listener, change(listener)));
        }
        // Sounds arrive when due, stamped with their onset (so one that
        // arrives a little late is stamped in the past)
        const lateness = pick([0, 10]);
        pending
          .filter((p) => p.at <= ms + lateness)
          .forEach((p) => {
            pending.splice(pending.indexOf(p), 1);
            hear(p.note, p.at);
          });

        const verdict = judgeTwins(pair, disagreements, { stream, frame, ms });
        if ((verdict === true || verdict === 'mismatch') && random() < 0.5) {
          // A gate consumes the take (a fountain keeps what it heard)
          pair.forEach((listener) =>
            Object.assign(listener, {
              capturedNotes: [],
              _trimHorizonMs: EPOCH + ms,
              _lastJudgedStartBeat: undefined,
            })
          );
        }
      }
    }
    expect(disagreements).toEqual([]);
  });

  it('judges a wrong note again, writes included, once its judgment is forgotten', () => {
    const disagreements = [];
    const pair = twins(TARGET);
    pair.forEach((listener) =>
      listener.capturedNotes.push({ pitch: 'G#4', length: '1/4', timestamp: EPOCH })
    );
    const judgeAt = (ms) => {
      jest.setSystemTime(EPOCH + ms);
      return judgeTwins(pair, disagreements, { ms });
    };
    expect(judgeAt(200)).toBe('mismatch');
    expect(judgeAt(216)).toBe(false); // judged already

    pair.forEach((listener) => Object.assign(listener, { _lastJudgedStartBeat: undefined }));
    expect(judgeAt(232)).toBe('mismatch');
    expect(pair[1]._lastJudgedStartBeat).toBe(0);
    expect(disagreements).toEqual([]);
  });

  describe('what a held verdict costs', () => {
    let judgments;
    beforeEach(() => {
      judgments = jest.spyOn(ListeningManager, 'groupNotesByBeat');
    });
    afterEach(() => judgments.mockRestore());

    const judgeFrames = (listener, count, fromMs) => {
      const verdicts = [];
      for (let i = 0; i < count; i += 1) {
        jest.setSystemTime(EPOCH + fromMs + 16 * i);
        verdicts.push(evaluatePhrasesCached(listener));
      }
      return verdicts;
    };
    const heardAt = (pitch, beat) => ({
      pitch,
      length: '1/4',
      timestamp: EPOCH + beat * MS_PER_BEAT,
    });

    it('a wrong note is judged once, then not again until something new is heard', () => {
      const [listener] = twins(TARGET);
      listener.capturedNotes.push(heardAt('G#4', 0));
      expect(judgeFrames(listener, 30, 0)).toContain('mismatch'); // once its grace passes

      judgments.mockClear();
      expect(judgeFrames(listener, 120, 30 * 16)).toEqual(Array(120).fill(false));
      expect(judgments).not.toHaveBeenCalled();

      listener.capturedNotes.push(heardAt('B4', 2));
      judgeFrames(listener, 1, 150 * 16);
      expect(judgments).toHaveBeenCalledTimes(1);
    });

    it('a correct take is judged as its notes land and its onsets fall due, not every frame', () => {
      const [listener] = twins(TARGET); // three quarter notes: 1.5 s at 120 bpm
      const take = [heardAt('B4', 0), heardAt('C#5', 1), heardAt('G#4', 2)];
      const verdicts = [];
      for (let i = 0; i < 100; i += 1) {
        while (take.length && take[0].timestamp <= EPOCH + 16 * i) {
          listener.capturedNotes.push(take.shift());
        }
        verdicts.push(...judgeFrames(listener, 1, 16 * i));
      }
      expect(verdicts).toContain('in-progress');
      expect(verdicts[verdicts.length - 1]).toBe(true);
      // Notes landing, onsets falling due (and their graces), the window
      // closing: a handful of judgments, not one per frame
      expect(judgments.mock.calls.length).toBeLessThanOrEqual(12);
    });
  });
});
