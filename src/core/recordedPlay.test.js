/**
 * Recorded play of real levels (fixtures/listening/heard-streams.json: every
 * note the gates and fountains of The Star, the jam, the awakening, the lure,
 * test-004 and elevation-demo heard while their creatures sang and right and
 * wrong takes were played), fed to a real Gate or Fountain as it was heard.
 * What each did — every take it completed, every wrong note it flashed —
 * must be what the matcher before 2026-11-24 did with the same notes
 * (fixtures/listening/heard-stream-outcomes.json), and when: no later than
 * the frames it takes a take's window to close on the take's own first onset
 * rather than on a grid line (the matcher no longer snaps onsets to a 16th
 * grid on the listener's clock).
 *
 * The one difference, ruled in: a gate consumes a completed TAKE, not
 * everything heard (Gate._consumeTake), so a take that starts as another
 * ends counts too (EXTRA_TAKES).
 */
import gameState from 'core/GameState';
import Gate from 'entities/Gate';
import Fountain from 'entities/Fountain';
import heardStreams from '../__tests__/fixtures/listening/heard-streams.json';
import recorded from '../__tests__/fixtures/listening/heard-stream-outcomes.json';

const EPOCH = 1760000000000;
const FRAME_MS = 16;
// A completion or flash may land this much earlier or later than it did:
// a window now closes on the take's first onset (up to half a sixteenth
// either side of the old grid line), checked frame by frame
const SHIFT_MS = 100;

// Takes the old consumption ate: a C4 whole note that began a frame after
// the previous one's window closed (elevation-demo's creature and the
// player's take overlapping)
const EXTRA_TAKES = { 'elev-wrong:elevation-demo:gate': ['T10032'] };

/** Feed a stream to a fresh listener of its kind, frame by frame; what it did. */
function replay(stream) {
  const isFountain = /fountain/.test(stream.id);
  const position = { x: 0, y: 0, z: 0 };
  jest.setSystemTime(EPOCH);
  const listener = isFountain
    ? new Fountain(position, { song: stream.song })
    : new Gate(position, { song: stream.song });
  listener.listeningStartTime = EPOCH;
  const events = [];
  const opens = jest.spyOn(listener, isFountain ? 'activate' : 'open');
  let completions = 0;
  let glow = 0;

  const notes = stream.notes
    .map(([pitch, length, ms]) => ({ pitch, length, ms }))
    .sort((a, b) => a.ms - b.ms);
  const tempoAt = (ms) => {
    let tempo = stream.calls[0][7];
    stream.calls.forEach((call) => {
      if (call[0] <= ms) [, , , , , , , tempo] = call;
    });
    return tempo;
  };
  const endMs = notes[notes.length - 1].ms + 6000;
  let next = 0;
  for (let ms = 0; ms <= endMs; ms += FRAME_MS) {
    const tempo = tempoAt(ms);
    if (gameState.musicalClock.tempo !== tempo) gameState.initMusicalClock(tempo);
    jest.setSystemTime(EPOCH + ms);
    while (next < notes.length && notes[next].ms <= ms) {
      const { pitch, length, ms: at } = notes[next];
      listener.onNoteCaptured({
        pitch,
        length,
        timestamp: EPOCH + at,
        sourcePosition: position,
        sourceRange: 15,
      });
      next += 1;
    }
    listener.update(FRAME_MS / 1000);
    if (opens.mock.calls.length > completions) {
      completions = opens.mock.calls.length;
      events.push(`T${ms}`);
      if (isFountain) break; // a fountain latches
    }
    if (!isFountain) {
      if (listener.lockoutGlow > glow + 0.5) events.push(`M${ms}`);
      glow = listener.lockoutGlow;
    }
  }
  listener.dispose();
  return events;
}

const kindAndMs = (event) => [event[0], Number(event.slice(1))];

describe('Recorded play of real levels, fed to real gates and fountains', () => {
  beforeAll(() => gameState.initMusicalClock(120));

  it('every take completes and every wrong note flashes as before, within a frame or few', () => {
    const differences = [];
    heardStreams.forEach((stream) => {
      const extra = EXTRA_TAKES[stream.id] || [];
      const was = recorded.outcomes[stream.id].split(' ').filter(Boolean);
      const heard = replay(stream);
      const now = heard.filter((event) => !extra.includes(event));
      const missing = extra.filter((event) => !heard.includes(event));
      if (missing.length) differences.push({ stream: stream.id, missingExtra: missing });
      const length = Math.max(was.length, now.length);
      for (let i = 0; i < length; i += 1) {
        const [wasKind, wasMs] = was[i] ? kindAndMs(was[i]) : [];
        const [nowKind, nowMs] = now[i] ? kindAndMs(now[i]) : [];
        if (wasKind !== nowKind || Math.abs(nowMs - wasMs) > SHIFT_MS) {
          differences.push({ stream: stream.id, i, was: was[i], now: now[i] });
          break;
        }
      }
    });
    expect(differences).toEqual([]);
  });
});
