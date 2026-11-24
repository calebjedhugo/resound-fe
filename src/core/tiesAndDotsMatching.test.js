/**
 * Ties and double dots in the game's song matching (the designer,
 * 2026-11-24): a gate hears its song as it SOUNDS — a tied pair is ONE held
 * note, never two strikes; a dot lasts x1.5, a double dot (`dotted: 2`)
 * x1.75. Through the public matching API (SongMatcher, evaluatePhrases), as
 * phraseMatching.test does.
 */
import gameState from 'core/GameState';
import SongMatcher from 'core/SongMatcher';
import evaluatePhrases from 'core/phraseMatching';

const TEMPO = 120;
const MS_PER_BEAT = 60000 / TEMPO;

const q = (pitch, extra = {}) => ({ pitch, length: '1/4', ...extra });

/** A listener that heard `events` ([beat, noteEventFields]) and is `nowBeats` in. */
function listener(requiredSong, events, nowBeats) {
  const listeningStartTime = Date.now() - nowBeats * MS_PER_BEAT;
  return {
    requiredSong,
    listeningStartTime,
    capturedNotes: events.map(([beat, fields]) => ({
      ...fields,
      timestamp: listeningStartTime + beat * MS_PER_BEAT,
    })),
  };
}

beforeAll(() => {
  gameState.initMusicalClock(TEMPO);
});

describe('the target timeline', () => {
  it('a tied pair is one onset holding both values', () => {
    const t = SongMatcher.targetTimeline([
      q('G4', { tie: 'start' }),
      q('G4', { tie: 'stop' }),
      q('A4'),
    ]);
    expect(t.onsets.map((o) => o.beat)).toEqual([0, 2]);
    expect(t.onsets[0].notes[0].durationBeats).toBe(2);
    expect(t.totalBeats).toBe(3);
  });

  it('a chain (start, continue, stop) holds all three', () => {
    const t = SongMatcher.targetTimeline([
      q('G4', { tie: 'start' }),
      q('G4', { tie: 'continue' }),
      { pitch: 'G4', length: '1/2', tie: 'stop' },
    ]);
    expect(t.onsets).toHaveLength(1);
    expect(t.onsets[0].notes[0].durationBeats).toBe(4);
  });

  it('ties per note in a chord: the tied tone holds, the others strike', () => {
    const t = SongMatcher.targetTimeline([
      [q('C4', { tie: 'start' }), q('E4')],
      [q('C4', { tie: 'stop' }), q('G4')],
    ]);
    expect(t.onsets).toHaveLength(2);
    expect(t.onsets[0].notes.map((n) => [n.pitch, n.durationBeats])).toEqual([
      ['C4', 2],
      ['E4', 1],
    ]);
    expect(t.onsets[1].notes.map((n) => [n.pitch, n.durationBeats])).toEqual([['G4', 1]]);
  });

  it('a tie into an entry without its pitch, or across a rest, ends there', () => {
    const t = SongMatcher.targetTimeline([
      q('C4', { tie: 'start' }),
      { length: '1/4' },
      q('C4', { tie: 'stop' }), // nothing to continue: struck
    ]);
    expect(t.onsets.map((o) => [o.beat, o.notes[0].durationBeats])).toEqual([
      [0, 1],
      [2, 1],
    ]);
  });

  it('dots: one x1.5, two (dotted: 2) x1.75', () => {
    const t = SongMatcher.targetTimeline([
      { pitch: 'G4', length: '1/2', dotted: 2 },
      { pitch: 'A4', length: '1/8' },
      q('B4', { dotted: true }),
      { pitch: 'C5', length: '1/8' },
    ]);
    expect(t.onsets.map((o) => o.beat)).toEqual([0, 3.5, 4, 5.5]);
    expect(t.onsets[0].notes[0].durationBeats).toBe(3.5);
    expect(t.totalBeats).toBe(6);
  });

  it('voices format counts dots when it lines voices up (flattenSong)', () => {
    const flat = SongMatcher.flattenSong({
      voices: [
        {
          notes: [
            { pitch: 'C5', length: '1/4', dotted: 2 },
            { pitch: 'D5', length: '1/16' },
          ],
        },
        {
          notes: [
            { pitch: 'C3', length: '1/4', dotted: true },
            { pitch: 'E3', length: '1/8' },
          ],
        },
      ],
    });
    // C5|C3 at 0, E3 at 1.5, D5 at 1.75: nothing lines up after the first
    expect(flat.map((e) => (Array.isArray(e) ? e.map((n) => n.pitch) : e.pitch))).toEqual([
      ['C5', 'C3'],
      'E3',
      'D5',
    ]);
  });
});

describe('songsMatch (the editor’s self-solve check): as it sounds', () => {
  it('a quarter tied to a quarter is the same song as a half note', () => {
    const tied = [q('G4', { tie: 'start' }), q('G4', { tie: 'stop' })];
    expect(SongMatcher.songsMatch(tied, [{ pitch: 'G4', length: '1/2' }])).toBe(true);
    expect(SongMatcher.songsMatch([q('G4'), q('G4')], [{ pitch: 'G4', length: '1/2' }])).toBe(
      false
    );
  });

  it('a double-dotted quarter is not a dotted one', () => {
    expect(SongMatcher.songsMatch([q('G4', { dotted: 2 })], [q('G4', { dotted: 2 })])).toBe(true);
    expect(SongMatcher.songsMatch([q('G4', { dotted: 2 })], [q('G4', { dotted: true })])).toBe(
      false
    );
  });
});

describe('a gate judging a tied / dotted song', () => {
  const TIED = [q('G4', { tie: 'start' }), q('G4', { tie: 'stop' }), q('A4')];

  it('matches ONE held note sounding both values (a source reporting durationBeats)', () => {
    const l = listener(
      TIED,
      [
        [0, { pitch: 'G4', length: '1/4', tie: 'start', durationBeats: 2 }],
        [2, { pitch: 'A4', length: '1/4' }],
      ],
      3.2
    );
    expect(evaluatePhrases(l)).toBe(true);
  });

  it('matches a half note: it sounds the same', () => {
    const l = listener(
      TIED,
      [
        [0, { pitch: 'G4', length: '1/2' }],
        [2, { pitch: 'A4', length: '1/4' }],
      ],
      3.2
    );
    expect(evaluatePhrases(l)).toBe(true);
  });

  it('two strikes are NOT a tied note', () => {
    const l = listener(
      TIED,
      [
        [0, { pitch: 'G4', length: '1/4' }],
        [1, { pitch: 'G4', length: '1/4' }],
        [2, { pitch: 'A4', length: '1/4' }],
      ],
      3.2
    );
    expect(evaluatePhrases(l)).not.toBe(true);
  });

  it('a reported tie continuation is a held note, not a strike', () => {
    const l = listener(
      TIED,
      [
        [0, { pitch: 'G4', length: '1/4', tie: 'start', durationBeats: 2 }],
        [1, { pitch: 'G4', length: '1/4', tie: 'stop' }],
        [2, { pitch: 'A4', length: '1/4' }],
      ],
      3.2
    );
    expect(evaluatePhrases(l)).toBe(true);
  });

  it('a chord with one tied tone matches its held tone and the struck ones', () => {
    const song = [
      [q('C4', { tie: 'start' }), q('E4')],
      [q('C4', { tie: 'stop' }), q('G4')],
    ];
    const heard = [
      [0, { pitch: 'C4', length: '1/2' }],
      [0, { pitch: 'E4', length: '1/4' }],
      [1, { pitch: 'G4', length: '1/4' }],
    ];
    expect(evaluatePhrases(listener(song, heard, 2.2))).toBe(true);
    // Struck again where it is held: no
    const restruck = [...heard, [1, { pitch: 'C4', length: '1/4' }]];
    expect(evaluatePhrases(listener(song, restruck, 2.2))).not.toBe(true);
  });

  it('a double-dotted note must sound 1.75 of its value', () => {
    const song = [
      { pitch: 'G4', length: '1/4', dotted: 2 },
      { pitch: 'A4', length: '1/16' },
    ];
    const at = (fields) => [
      [0, { pitch: 'G4', length: '1/4', ...fields }],
      [1.75, { pitch: 'A4', length: '1/16' }],
    ];
    expect(evaluatePhrases(listener(song, at({ dotted: 2 }), 2.5))).toBe(true);
    expect(evaluatePhrases(listener(song, at({ durationBeats: 1.75 }), 2.5))).toBe(true);
    expect(evaluatePhrases(listener(song, at({ dotted: true }), 2.5))).not.toBe(true);
  });
});
