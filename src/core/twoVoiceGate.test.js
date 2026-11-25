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

  it('a stalled frame janks but drops no note, and the voices come back onto the grid', async () => {
    // Run to just before the third loop's downbeat, then stall one frame
    // well past it: the downbeat comes 0.8 s (1.6 beats) late, more than
    // the first note (a quarter) can be drawn back by
    await runFor(2 * LOOP_MS - 100);
    await jest.advanceTimersByTimeAsync(900);
    gameState.musicalClock.update(0.9);
    AbsorbManager.update(0.9);
    await runFor(6 * LOOP_MS);

    [treble, bass].forEach((creature) => {
      const notes = notesOf(creature);
      // Every loop is sung whole: no loop sat out, no note dropped
      expect(notes.map((n) => n.pitch)).toEqual(
        Array.from(
          { length: notes.length },
          (_, i) => creature.song[i % creature.song.length].pitch
        )
      );
      const loops = loopsOf(creature);
      expect(loops.length).toBeGreaterThanOrEqual(7);
      // The stalled loop starts late...
      const due = (k) => beatZeroMs + k * SONG_BEATS * MS_PER_BEAT;
      expect(loops[2][0].timestamp - due(2)).toBeGreaterThan(500);
      // ...and a few loops on, every note is back on the grid
      const offsets = offsetsOf(creature.song);
      loops[6].forEach((note, j) => {
        const off = note.timestamp - (due(6) + offsets[j] * MS_PER_BEAT);
        expect(Math.abs(off)).toBeLessThan(20 + TIMER_LATE_MS * (creature.song.length + 1));
      });
    });
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
      if (!gate.isHeldOpen()) lapses.push(Date.now() - beatZeroMs);
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

describe('A one-element song sung back to back stays on the beat, loop after loop', () => {
  // poc-jam's B5 jammer: one whole note, interval 4 — its period IS the
  // song, so each song starts as the last one ends. Nothing in a one-note
  // song comes after the first note to draw back onto the grid: the
  // lateness has to come off the note itself, or each song ends as late as
  // it started and the next starts a frame later still
  const LOOPS = 48;
  const PERIOD = 4;
  // An onset sounds on the first frame at or past its beat, late by its own
  // timers so far; never by the loops before it
  const LIMIT_MS = 17 + 8 * TIMER_LATE_MS;

  /** Where each loop's first heard note lands against its beat (ms). */
  const driftOf = (creature, firstBeat, eventsPerLoop) => {
    const beatZeroMs = Date.now() - gameState.musicalClock.getCurrentBeat() * MS_PER_BEAT;
    return () => {
      const notes = notesOf(creature);
      const drift = [];
      for (let i = 0; i < notes.length; i += eventsPerLoop) {
        const k = i / eventsPerLoop;
        const loop = notes.slice(i, i + eventsPerLoop);
        // A chord's members are heard together
        loop.forEach((note) => expect(note.timestamp).toBe(loop[0].timestamp));
        drift.push(loop[0].timestamp - (beatZeroMs + (firstBeat + k * PERIOD) * MS_PER_BEAT));
      }
      return drift;
    };
  };

  /** A singer put down in the world now: it sings from the next whole beat. */
  const singer = (song) => {
    const creature = new Creature(
      { x: 2, y: 0, z: 2 },
      { song, interval: PERIOD, audibleRange: 8, size: 0.9, maxSpeed: 8 }
    );
    gameState.activeArea.entityManager.add(creature);
    return creature;
  };

  const expectOnTheGrid = (drift, label) => {
    expect(drift.length).toBeGreaterThanOrEqual(LOOPS);
    const worst = drift.slice(0, LOOPS).reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
    // eslint-disable-next-line no-console
    if (process.env.DRIFT_REPORT) console.log(label, 'worst drift ms', worst, 'loop 47', drift[47]);
    drift.slice(0, LOOPS).forEach((off, k) => {
      if (off < -2 || off > LIMIT_MS)
        throw new Error(`${label}: loop ${k} is ${off} ms off its beat`);
    });
  };

  beforeEach(() => {
    ctx.loadPuzzle('two-voice-gate-empty');
  });

  it('one note: every song starts on its beat', async () => {
    const firstBeat = Math.ceil(gameState.musicalClock.getCurrentBeat());
    const creature = singer([{ pitch: 'B5', length: '1/1' }]);
    expect(creature.period).toBe(PERIOD);
    const read = driftOf(creature, firstBeat, 1);
    await runFor((LOOPS + 0.5) * PERIOD * MS_PER_BEAT);
    expectOnTheGrid(read(), 'one note');
  });

  it('one chord: every song starts on its beat, its members together', async () => {
    const firstBeat = Math.ceil(gameState.musicalClock.getCurrentBeat());
    const creature = singer([
      [
        { pitch: 'B4', length: '1/1' },
        { pitch: 'D5', length: '1/1' },
      ],
    ]);
    const read = driftOf(creature, firstBeat, 2);
    await runFor((LOOPS + 0.5) * PERIOD * MS_PER_BEAT);
    expectOnTheGrid(read(), 'one chord');
  });

  it('one tied note (a song ending in a tie): on its beat, and held as one sound', async () => {
    const firstBeat = Math.ceil(gameState.musicalClock.getCurrentBeat());
    const creature = singer([
      { pitch: 'C5', length: '1/2', tie: 'start' },
      { pitch: 'C5', length: '1/2', tie: 'stop' },
    ]);
    const read = driftOf(creature, firstBeat, 1);
    await runFor((LOOPS + 0.5) * PERIOD * MS_PER_BEAT);
    const notes = notesOf(creature);
    // The tie is held: one onset a song, heard as the whole run (it sounds
    // that less the frame it started late by)
    notes.forEach((note) => {
      expect(note.tie).toBe('start');
      expect(note.durationBeats).toBeCloseTo(PERIOD, 6);
    });
    expectOnTheGrid(read(), 'one tied note');
  });

  it('one note, a stalled frame: no song dropped, its note keeps half its length, back on the grid two songs on', async () => {
    const firstBeat = Math.ceil(gameState.musicalClock.getCurrentBeat());
    const creature = singer([{ pitch: 'B5', length: '1/1' }]);
    const sounded = [];
    const startNote = creature.instrument.startNote.bind(creature.instrument);
    jest.spyOn(creature.instrument, 'startNote').mockImplementation((pitch, ms, ...rest) => {
      sounded.push(ms);
      return startNote(pitch, ms, ...rest);
    });
    const read = driftOf(creature, firstBeat, 1);
    // Up to just before the third song's beat, then one frame 1.5 s long:
    // that song starts 3 beats late, more than half its note can take back
    const beatMs = (b) => (b - gameState.musicalClock.getCurrentBeat()) * MS_PER_BEAT;
    await runFor(beatMs(firstBeat + 2 * PERIOD) - 30);
    await jest.advanceTimersByTimeAsync(1530);
    gameState.musicalClock.update(1.53);
    await runFor(6 * PERIOD * MS_PER_BEAT);

    const drift = read();
    expect(drift.length).toBeGreaterThanOrEqual(8); // every song sung
    expect(drift[2]).toBeGreaterThan(2.9 * MS_PER_BEAT); // the stalled one, late
    // It sounds half its whole note (2 beats), the next one 3 beats, ending
    // on the grid: from the song after, every one is on its beat
    expect(sounded[2]).toBeCloseTo(2 * MS_PER_BEAT, -1);
    expect(sounded[3]).toBeLessThan(4 * MS_PER_BEAT);
    sounded.forEach((ms) => expect(ms).toBeGreaterThanOrEqual(2 * MS_PER_BEAT - 1));
    drift.slice(4, 8).forEach((off) => {
      expect(off).toBeGreaterThanOrEqual(-2);
      expect(off).toBeLessThanOrEqual(LIMIT_MS);
    });
  });

  it('released a moment past a beat (the late grace): its songs stay on that beat', async () => {
    ctx.face(-Math.PI / 2);
    // Pressed 0.08 beat past beat 4: it sings on beat 4, at once
    await framesUntil(() => gameState.musicalClock.getCurrentBeat() >= 4.08, 4000);
    const pressBeat = gameState.musicalClock.getCurrentBeat();
    expect(pressBeat - 4).toBeLessThan(0.1);
    ctx.setInventorySlot(0, { ...specOf([{ pitch: 'B5', length: '1/1' }]), interval: PERIOD });
    ctx.pressKey('space');
    const [creature] = ctx.getCreatures();
    expect(creature.nextSingBeat).toBe(4);
    const read = driftOf(creature, 4, 1);
    await runFor((LOOPS + 0.5) * PERIOD * MS_PER_BEAT);
    const drift = read();
    // Its first song sounds at the press, late by the grace it was given...
    expect(drift[0]).toBeGreaterThan(0.07 * MS_PER_BEAT);
    // ...and every one after on its beat
    expectOnTheGrid([0, ...drift.slice(1)], 'released');
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
