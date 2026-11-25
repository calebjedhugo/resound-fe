/**
 * Two creatures singing a two-voice gate song together (the shape of the
 * designer's control-test-2: each creature sings one voice, interval 8 on a
 * 16-beat song, so each sings back to back). Through the game's own paths:
 * the creatures' schedule (Creature.update / sing), the pole's release
 * (AbsorbManager), the gate's listening and judging (ListeningManager, Gate,
 * phraseMatching).
 *
 * Frames are driven here rather than with ctx.tick: tick flushes every
 * pending timer at its end, which plays a creature's whole song at once.
 * Each frame lets the instruments' timers run up to the frame's time FIRST,
 * then updates the clock and the world (a browser runs the timers that came
 * due before the next animation frame), at ~60 fps as rAF delivers it
 * (17, 17, 16, 17 ms: a cycle that doesn't divide a loop, so a song's end
 * lands anywhere inside a frame). And as a browser's timers do, every timer
 * fires a little late (TIMER_LATE_MS): an instrument's notes are a chain of
 * timers, so a song ends later than written.
 */
import gameState from 'core/GameState';
import PortalManager from 'core/PortalManager';
import AbsorbManager from 'core/AbsorbManager';
import SongMatcher from 'core/SongMatcher';
import Creature from 'entities/Creature';
import { TEST_PUZZLES } from '../__tests__/helpers/testUtils';

const MS_PER_BEAT = 500; // 120 bpm
const SONG_BEATS = 16;
const LOOP_MS = SONG_BEATS * MS_PER_BEAT;
const FRAME_PATTERN = [17, 17, 16, 17];
const TIMER_LATE_MS = 2;

const fixture = TEST_PUZZLES['two-voice-gate'];
const [TREBLE, BASS] = fixture.entities
  .filter((e) => e.type === 'creature')
  .map((e) => e.data.song);
const GATE_SONG = fixture.entities.find((e) => e.type === 'gate').song;
const specOf = (song) => ({ song, interval: 8, audibleRange: 15, size: 0.9, maxSpeed: 8 });

let frameIndex = 0;
async function frame() {
  const ms = FRAME_PATTERN[frameIndex % FRAME_PATTERN.length];
  frameIndex += 1;
  await jest.advanceTimersByTimeAsync(ms);
  const dt = ms / 1000;
  gameState.musicalClock.update(dt);
  PortalManager.updateAreas(dt);
  PortalManager.update();
  AbsorbManager.update(dt);
}

/** Frames until `done()` (checked after each) or `maxMs` pass. */
async function framesUntil(done, maxMs) {
  const end = Date.now() + maxMs;
  while (!done() && Date.now() < end) {
    // eslint-disable-next-line no-await-in-loop
    await frame();
  }
}

const runFor = (ms) => framesUntil(() => false, ms);

/** A creature's heard notes, in the order sung. */
const notesOf = (creature) => ctx.getEmittedNotes().filter((n) => n.source === creature.id);

/** Each loop's notes: [[note, ...], ...] (no ties in these songs). */
const loopsOf = (creature) => {
  const notes = notesOf(creature);
  const loops = [];
  for (let i = 0; i < notes.length; i += creature.song.length) {
    loops.push(notes.slice(i, i + creature.song.length));
  }
  return loops;
};

/** Each note's beat offset within its song. */
const offsetsOf = (song) => {
  let beat = 0;
  return song.map((note) => {
    const at = beat;
    beat += SongMatcher.lengthToBeats(note.length, note.dotted);
    return at;
  });
};

/** Count every completion the gate judges (Gate.update opens on each). */
const countCompletions = (gate) => {
  const at = [];
  const original = gate.open.bind(gate);
  jest.spyOn(gate, 'open').mockImplementation(() => {
    at.push(Date.now());
    return original();
  });
  return at;
};

/** Every timer from now on fires TIMER_LATE_MS late (the browser's lateness). */
let restoreTimers = null;
function lateTimers() {
  const original = global.setTimeout;
  global.setTimeout = (fn, delay, ...args) =>
    original(fn, delay > 0 ? delay + TIMER_LATE_MS : delay, ...args);
  restoreTimers = () => {
    global.setTimeout = original;
  };
}

beforeEach(() => {
  frameIndex = 0;
  gameState.mode = 'PLAYING';
  lateTimers();
});
afterEach(() => {
  restoreTimers();
  gameState.mode = 'MENU';
});

describe('Two creatures singing a two-voice gate song, back to back', () => {
  let gate;
  let treble;
  let bass;
  let beatZeroMs;

  beforeEach(() => {
    ctx.loadPuzzle('two-voice-gate');
    [gate] = ctx.getGates();
    [treble, bass] = ctx.getCreatures();
    // The clock reads beat 0 now: beat b falls at beatZeroMs + b * 500
    beatZeroMs = Date.now() - gameState.musicalClock.getCurrentBeat() * MS_PER_BEAT;
  });

  it('every loop of both voices stays on the beat grid (no drift loop to loop)', async () => {
    await runFor(12 * LOOP_MS + 200);

    const misses = [];
    [treble, bass].forEach((creature) => {
      const offsets = offsetsOf(creature.song);
      const loops = loopsOf(creature);
      expect(loops.length).toBeGreaterThanOrEqual(12);
      loops.slice(0, 12).forEach((loop, k) => {
        loop.forEach((note, j) => {
          const due = beatZeroMs + (k * SONG_BEATS + offsets[j]) * MS_PER_BEAT;
          const off = note.timestamp - due;
          // A loop's first note sounds on the first frame at or past its
          // beat once the loop before has ended (late by that loop's own
          // timers); the rest are drawn back onto the grid, late only by
          // this loop's timers so far. Never by the loops before: no drift
          const limit = 20 + TIMER_LATE_MS * (j === 0 ? creature.song.length + 1 : j);
          if (off < -2 || off > limit) misses.push({ voice: creature.song[0].pitch, k, j, off });
        });
      });
    });
    expect(misses).toEqual([]);
  });

  it('the gate counts EVERY loop: a completion does not eat the next take', async () => {
    const completions = countCompletions(gate);
    await runFor(8 * LOOP_MS + 200);

    expect(completions.length).toBe(8);
    completions.forEach((ms, k) => {
      // Each completes as its own window closes: 16 beats after its downbeat
      expect(ms - (beatZeroMs + (k + 1) * LOOP_MS)).toBeLessThan(60);
    });
  });

  it('the door stays held through back-to-back loops: walking out never closes it', async () => {
    await framesUntil(() => gate.isOpen, 2 * LOOP_MS);
    expect(gate.isOpen).toBe(true);

    const lapses = [];
    const until = Date.now() + 4 * LOOP_MS;
    while (Date.now() < until) {
      // eslint-disable-next-line no-await-in-loop
      await frame();
      if (!gate.isHeldByPerformance()) lapses.push(Date.now() - beatZeroMs);
    }
    expect(lapses).toEqual([]);

    // Through the door and out the far side, mid-loop: it stays open
    ctx.setPlayerPosition({ x: gate.position.x, z: gate.position.z });
    await frame();
    ctx.setPlayerPosition({ x: gate.position.x, z: gate.position.z + 6 });
    await frame();
    await runFor(LOOP_MS);
    expect(gate.isOpen).toBe(true);
  });

  it('a continuous singer taken and rebuilt from its spec sings on its old beat', async () => {
    // Two and a half loops in: its next song starts on beat 48
    await runFor(2.5 * LOOP_MS);
    const spec = treble.toSpec();
    const area = gameState.activeArea;
    treble.hold();
    area.entityManager.remove(treble.id);
    const rebuilt = new Creature({ ...treble.position }, spec);
    area.entityManager.add(rebuilt);

    await runFor(LOOP_MS);
    const [first] = notesOf(rebuilt);
    expect(first).toBeDefined();
    const beat = (first.timestamp - beatZeroMs) / MS_PER_BEAT;
    expect(beat).toBeGreaterThanOrEqual(48 - 0.01);
    expect(beat).toBeLessThan(48 + 0.05);
  });
});

describe('Releasing the second voice on the first one’s downbeat', () => {
  it('after several loops, the release lands on that downbeat and the gate opens on that loop', async () => {
    ctx.loadPuzzle('two-voice-gate-empty');
    const [gate] = ctx.getGates();
    const completions = countCompletions(gate);
    ctx.face(-Math.PI / 2); // east: the release spot is beside the gate

    // The treble voice out on beat 4
    await framesUntil(() => gameState.musicalClock.getCurrentBeat() >= 3.5, 4000);
    ctx.setInventorySlot(0, specOf(TREBLE));
    ctx.pressKey('space');
    await framesUntil(() => !AbsorbManager.busy, 4000);
    const [first] = ctx.getCreatures();

    // Eight loops later, the moment its ninth downbeat sounds, the bass
    // voice is let out (the player presses on the downbeat they hear)
    const downbeats = () => loopsOf(first).length;
    await framesUntil(() => downbeats() >= 9, 10 * LOOP_MS);
    expect(downbeats()).toBe(9);
    const downbeatMs = loopsOf(first)[8][0].timestamp;
    ctx.setInventorySlot(0, specOf(BASS));
    ctx.face(Math.PI / 2); // west: an open spot, still beside the gate
    expect(ctx.pressKey('space')).toBeUndefined();
    const second = ctx.getCreatures().find((c) => c !== first);
    expect(second).toBeDefined();

    await runFor(LOOP_MS + 300);
    const [bassFirst] = notesOf(second);
    // Its first note joins the treble's downbeat (a frame later at most)...
    expect(bassFirst.timestamp - downbeatMs).toBeGreaterThanOrEqual(0);
    expect(bassFirst.timestamp - downbeatMs).toBeLessThan(40);
    // ...and that very loop opens the gate as its window closes
    expect(gate.isOpen).toBe(true);
    expect(completions.length).toBeGreaterThanOrEqual(1);
    expect(completions[0] - (downbeatMs + LOOP_MS)).toBeLessThan(60);
  });
});

describe('A two-voice gate hearing one source sing both voices (pins)', () => {
  // The whole two-voice song as one source plays it: its voices lined up
  // into chords (a chord lasts its shortest note; longer notes sound on)
  const FLAT = SongMatcher.flattenSong(GATE_SONG);

  it('a chord heard from two sources at the same instant matches the chord onset', async () => {
    ctx.loadPuzzle('two-voice-gate-empty');
    const [gate] = ctx.getGates();
    const completions = countCompletions(gate);
    const { onsets, totalBeats } = SongMatcher.targetTimeline(GATE_SONG);
    const t0 = Date.now();
    const left = { x: gate.position.x - 3, y: 0, z: gate.position.z - 3 };
    const right = { x: gate.position.x + 3, y: 0, z: gate.position.z - 3 };
    onsets.forEach((onset) => {
      onset.notes.forEach((note, i) => {
        gate.onNoteCaptured({
          pitch: note.pitch,
          length: note.length,
          timestamp: t0 + onset.beat * MS_PER_BEAT,
          sourcePosition: i === 0 ? left : right,
          sourceRange: 15,
        });
      });
    });
    await runFor(totalBeats * MS_PER_BEAT + 100);
    expect(completions.length).toBe(1);
  });

  it('a rotated take (the song heard from its middle) does not open; the next full take does', async () => {
    ctx.loadPuzzle('two-voice-gate-empty');
    const [gate] = ctx.getGates();
    const completions = countCompletions(gate);
    ctx.setPlayerPosition({ x: gate.position.x, z: gate.position.z - 6 });
    const startMs = Date.now();
    ctx.startSinging([...FLAT.slice(5), ...FLAT], 120);

    // The tail (beats 5-16 of the song) is no take; the full one opens
    // the moment its window closes: 11 + 16 beats after the start
    await runFor(26.5 * MS_PER_BEAT);
    expect(completions.length).toBe(0);
    await runFor(1 * MS_PER_BEAT);
    expect(completions.length).toBe(1);
    expect(completions[0] - (startMs + 27 * MS_PER_BEAT)).toBeLessThan(60);
  });
});
