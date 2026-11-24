/**
 * Audio built ahead, in idle time: the creatures' voices for every area as
 * it is built (core/AudioPrewarm). (The tape's piano was pre-rendered here
 * too until the tape stopped playing, 2026-11-23.) A voice is its theremin
 * wavetable (entities/CreatureVoice), shared by creatures of one warmth:
 * each test starts with none built.
 */
import { audioContextManager } from 'resound-sound';
import AudioPrewarm from 'core/AudioPrewarm';
import { forgetSharedAudio } from 'entities/CreatureVoice';
import gameState from 'core/GameState';
import PortalManager from 'core/PortalManager';
import StartGate from 'ui/StartGate';

describe('Building audio ahead', () => {
  const context = audioContextManager.getContext();

  beforeEach(() => forgetSharedAudio(context));

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.requestIdleCallback;
    delete window.cancelIdleCallback;
  });

  it('builds each creature voice before its first note while the world is held still', async () => {
    // The StartGate holds the world: time passes, nothing sings
    ctx.loadPuzzle('recording-basic');
    await jest.advanceTimersByTimeAsync(100);

    const waves = jest.spyOn(context, 'createPeriodicWave');
    await ctx.tick(16); // the creature sings its first note

    expect(ctx.getEmittedNotes().map((n) => n.pitch)).toEqual(['C4']);
    expect(waves).not.toHaveBeenCalled();
  });

  it('builds without waiting for idle time while the StartGate is up', async () => {
    // A machine that never goes idle: nothing would ever run in play
    window.requestIdleCallback = jest.fn(() => 1);
    window.cancelIdleCallback = jest.fn();
    const creature = ctx.addCreature({ song: [{ pitch: 'B5', length: '1/4' }] });
    const waves = jest.spyOn(context, 'createPeriodicWave');
    AudioPrewarm.warmArea({ entities: [creature] });
    await jest.advanceTimersByTimeAsync(200);
    expect(waves).not.toHaveBeenCalled();

    const gate = new StartGate();
    gate.show();
    await jest.advanceTimersByTimeAsync(200);
    expect(waves).toHaveBeenCalledTimes(1);
    gate.hide();
  });

  it("drops the old world's waiting creature voices when the world goes", async () => {
    // A machine that never goes idle: everything queued waits
    window.requestIdleCallback = jest.fn(() => 1);
    window.cancelIdleCallback = jest.fn();
    // Creatures the teardown leaves alive (the harness's sandbox), so only
    // the queue decides whose voice gets built
    const old = ctx.addCreature({ song: [{ pitch: 'D5', length: '1/4' }] });
    const next = ctx.addCreature({ song: [{ pitch: 'F5', length: '1/4' }] });
    const waves = jest.spyOn(context, 'createPeriodicWave');
    AudioPrewarm.warmArea({ entities: [old] });

    PortalManager.reset(); // leaving for the menu
    AudioPrewarm.warmArea({ entities: [next] }); // the next world's
    const gate = new StartGate();
    gate.show();
    await jest.advanceTimersByTimeAsync(200);
    gate.hide();

    expect(waves).toHaveBeenCalledTimes(1); // F5, for the next world's creature
  });
});

describe('What building ahead costs a frame in play', () => {
  // Main-thread ms a creature voice's wavetable costs, on a clock nothing
  // else moves
  const VOICE_MS = 3;
  const TIMER_SLICE_MS = 8; // AudioPrewarm's slice without requestIdleCallback

  let clock;
  let waves; // the creatures' voice builds

  // Creatures of six different warmths: six wavetables to build
  const WARMTHS = [0.7, 0.8, 0.9, 1, 1.1, 1.2];

  /** A fresh AudioPrewarm: nothing measured yet. */
  function fresh() {
    let prewarm;
    jest.isolateModules(() => {
      prewarm = require('core/AudioPrewarm').default; // eslint-disable-line global-require
    });
    return { prewarm };
  }

  function creatureSinging(pitches, warmth = 1) {
    return ctx.addCreature({
      song: pitches.map((pitch) => ({ pitch, length: '1/4' })),
      voice: { warmth, vibratoRate: 5.5, vibratoDepth: 11, attack: 0.026, glide: 0.009, spark: 1 },
    });
  }

  beforeEach(() => {
    forgetSharedAudio(audioContextManager.getContext());
    clock = 0;
    jest.spyOn(performance, 'now').mockImplementation(() => clock);
    // The context every creature sings on
    const context = audioContextManager.getContext();
    const createPeriodicWave = context.createPeriodicWave.bind(context);
    waves = jest.spyOn(context, 'createPeriodicWave').mockImplementation((...args) => {
      clock += VOICE_MS;
      return createPeriodicWave(...args);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.requestIdleCallback;
    delete window.cancelIdleCallback;
  });

  it('runs no more than a slice of work per timer task without requestIdleCallback', async () => {
    const { prewarm } = fresh();
    const creatures = WARMTHS.map((warmth) => creatureSinging(['C4', 'E4'], warmth));

    prewarm.warmArea({ entities: creatures }); // a neighbor loading mid-play
    const spent = [];
    for (let slice = 0; slice < 10; slice += 1) {
      const before = clock;
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(50); // one timer slice
      spent.push(clock - before);
    }

    expect(Math.max(...spent)).toBeLessThanOrEqual(TIMER_SLICE_MS);
    expect(waves).toHaveBeenCalledTimes(6); // every voice, a slice at a time
  });

  it('builds nothing flat out once the StartGate drops', async () => {
    const { prewarm } = fresh();
    window.requestIdleCallback = jest.fn(() => 1); // a machine that never goes idle
    window.cancelIdleCallback = jest.fn();
    const creature = creatureSinging(['C5', 'D5']);

    prewarm.hold(true); // the gate is up as the area is built
    prewarm.warmArea({ entities: [creature] });
    prewarm.hold(false); // and woken before its first job ran
    await jest.advanceTimersByTimeAsync(200);

    expect(waves).not.toHaveBeenCalled();
  });
});

/**
 * Each creature's next song is built ahead (CreatureVoice.prepare: the
 * lines it will start), so the moment a note starts builds no audio node. A
 * world's creatures share their onsets: The Star's start 10-11 at once.
 */
describe("Building each creature's next song ahead", () => {
  // A line's nodes among those counted: its oscillator and vibrato LFO,
  // the vibrato depth, envelope and crackle gate gains, its noise source
  const BUILT_PER_LINE = 6;

  // Two creatures singing one note together every 8 beats: each song
  // starts a fresh line (the last one has stopped by then)
  function twoCreatures() {
    return ['C4', 'G4'].map((pitch) =>
      ctx.addCreature({ song: [{ pitch, length: '1/4' }], interval: 8 })
    );
  }

  /**
   * Count the audio nodes built as these creatures' notes start (inside
   * their instruments' startNote) apart from those built at any other time,
   * and when (on the mocked clock) each was built and each note started;
   * `inCallback` wraps an idle callback to record the most any one built.
   */
  function watchNodeBuilds(creatures) {
    const built = { atOnset: 0, ahead: 0, oscillatorsAhead: 0, mostInOneCallback: 0 };
    built.aheadAt = [];
    built.onsetsAt = [];
    let starting = false;
    const context = audioContextManager.getContext();
    ['createOscillator', 'createGain', 'createBufferSource'].forEach((method) => {
      const create = context[method].bind(context);
      jest.spyOn(context, method).mockImplementation((...args) => {
        if (starting) built.atOnset += 1;
        else {
          built.ahead += 1;
          built.aheadAt.push(performance.now());
        }
        if (!starting && method === 'createOscillator') built.oscillatorsAhead += 1;
        return create(...args);
      });
    });
    creatures.forEach(({ instrument }) => {
      const startNote = instrument.startNote.bind(instrument);
      jest.spyOn(instrument, 'startNote').mockImplementation((...args) => {
        built.onsetsAt.push(performance.now());
        starting = true;
        try {
          return startNote(...args);
        } finally {
          starting = false;
        }
      });
    });
    built.inCallback = (callback) => (deadline) => {
      const before = built.ahead;
      callback(deadline);
      built.mostInOneCallback = Math.max(built.mostInOneCallback, built.ahead - before);
    };
    return built;
  }

  /**
   * This test's machine: its requestIdleCallback (none: Safari's timer
   * slices). The prewarm is one module for the whole file, and an earlier
   * test's machine can have left its run waiting on an idle callback that
   * never comes; the world running again (no StartGate) schedules it afresh.
   */
  function onMachine(requestIdleCallback) {
    window.cancelIdleCallback = (handle) => clearTimeout(handle);
    if (requestIdleCallback) window.requestIdleCallback = requestIdleCallback;
    else delete window.requestIdleCallback;
    AudioPrewarm.hold(false);
    if (!requestIdleCallback) delete window.cancelIdleCallback;
  }

  /** Idle periods with room to spare, 16 ms apart. */
  function grantIdleTime() {
    onMachine((callback) => setTimeout(() => callback({ timeRemaining: () => 50 }), 16));
  }

  const sungBy = (creature) => ctx.getEmittedNotes().filter((note) => note.source === creature.id);

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.requestIdleCallback;
    delete window.cancelIdleCallback;
  });

  it('starts every song on lines built ahead in idle time', async () => {
    grantIdleTime();
    // Each sings its first song the moment it is built (in the game the
    // StartGate holds the world still while that one is built)
    const creatures = twoCreatures();
    await ctx.advanceBeats(2);
    const built = watchNodeBuilds(creatures);
    const before = ctx.getEmittedNotes().length;

    await ctx.advanceBeats(24);

    expect(ctx.getEmittedNotes().length - before).toBe(6); // three songs each
    expect(built.atOnset).toBe(0);
    expect(built.ahead).toBeGreaterThanOrEqual(6 * BUILT_PER_LINE);
  });

  it('plays a whole song on one line: its later notes build nothing', async () => {
    grantIdleTime();
    const creature = ctx.addCreature({
      song: ['C4', 'E4', 'G4', 'C5'].map((pitch) => ({ pitch, length: '1/8' })),
      interval: 8,
    });
    await ctx.advanceBeats(8);
    const built = watchNodeBuilds([creature]);

    await ctx.advanceBeats(8); // one song

    expect(built.onsetsAt).toHaveLength(4);
    expect(built.atOnset).toBe(0);
    expect(built.ahead).toBe(BUILT_PER_LINE); // the next song's one line
  });

  it('builds every note of a song ahead, the ones its play loop starts on timers too', async () => {
    grantIdleTime();
    ctx.loadPuzzle('recording-basic');
    const creature = ctx.addCreature({
      song: [
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
        ],
      ],
      interval: 8,
    });
    await ctx.advanceBeats(4);
    const built = watchNodeBuilds([creature]);
    ctx.clearEmittedNotes();

    await ctx.advanceBeats(16);

    expect(sungBy(creature).map((note) => note.pitch)).toEqual(
      ['C4', 'E4', 'C4', 'G4', 'C4', 'E4', 'C4', 'G4'] // two songs
    );
    expect(built.atOnset).toBe(0);
  });

  it('builds a song by its deadline on a machine with no idle time, one song per task', async () => {
    let built = { inCallback: (callback) => callback };
    // No idle period ever comes: a callback runs only when its timeout is up
    onMachine((callback, options) =>
      options
        ? setTimeout(() => built.inCallback(callback)({ timeRemaining: () => 0 }), options.timeout)
        : -1
    );
    const creatures = twoCreatures(); // two songs that start together
    await ctx.advanceBeats(2);
    built = watchNodeBuilds(creatures);
    const before = ctx.getEmittedNotes().length;

    await ctx.advanceBeats(24);

    expect(ctx.getEmittedNotes().length - before).toBe(6);
    expect(built.atOnset).toBe(0);
    // Each creature's next song in a task of its own, never both in one
    expect(built.mostInOneCallback).toBe(BUILT_PER_LINE);
    // And frames before the song: a frame late, it would have to race it
    built.onsetsAt.forEach((onset) => {
      const lastBuild = Math.max(...built.aheadAt.filter((at) => at <= onset));
      expect(onset - lastBuild).toBeGreaterThanOrEqual(50);
    });
  });

  it('builds songs ahead in timer slices without requestIdleCallback', async () => {
    onMachine(null);
    ctx.loadPuzzle('recording-two-creatures');
    await ctx.advanceBeats(2);
    const built = watchNodeBuilds(ctx.getCreatures());
    ctx.clearEmittedNotes();

    await ctx.advanceBeats(12);

    expect(ctx.getEmittedNotes()).toHaveLength(6);
    expect(built.atOnset).toBe(0);
  });

  it("builds each creature's first song behind the StartGate", async () => {
    onMachine(jest.fn(() => 1)); // no idle time to speak of
    const gate = new StartGate();
    gate.show(); // up while the world loads
    ctx.loadPuzzle('recording-two-creatures');
    await jest.advanceTimersByTimeAsync(200); // held: jobs run flat out
    gate.hide();
    const built = watchNodeBuilds(ctx.getCreatures());

    await ctx.tick(16); // both sing their first song

    expect(ctx.getEmittedNotes()).toHaveLength(2);
    expect(built.atOnset).toBe(0);
  });

  it('a creature let out of the pole has its voice and first song built at the press: its first note builds nothing', async () => {
    onMachine(jest.fn(() => 1)); // no idle time to speak of
    ctx.loadPuzzle('playback-basic');
    gameState.mode = 'PLAYING';
    gameState.camera.viewCenter = [-Math.PI / 2, 0]; // east: open floor
    ctx.setInventorySlot(0, {
      song: [
        { pitch: 'A4', length: '1/8' },
        [
          { pitch: 'C5', length: '1/8' },
          { pitch: 'E5', length: '1/8' },
        ],
      ],
      interval: 8,
      audibleRange: 10,
      size: 0.9,
      maxSpeed: 8,
    });
    await ctx.advanceBeats(1.5);

    ctx.pressKey('space'); // its first note on beat 2
    const [creature] = ctx.getCreatures();
    const built = watchNodeBuilds([creature]);
    await ctx.advanceBeats(1);
    gameState.mode = 'MENU';

    expect(sungBy(creature)).toHaveLength(3);
    expect(built.atOnset).toBe(0);
  });

  it("drops the old world's waiting songs when the world goes", async () => {
    // A machine whose idle callbacks never come: everything queued waits
    onMachine(jest.fn(() => 1));
    // A creature the teardown leaves alive (the harness's sandbox), so only
    // the queue decides whether its next song gets built
    const creature = ctx.addCreature({ song: [{ pitch: 'D5', length: '1/4' }], interval: 8 });
    await ctx.tick(16); // it sings its first song...
    await jest.advanceTimersByTimeAsync(1000); // ...and asks for its next
    const built = watchNodeBuilds([creature]);

    PortalManager.reset(); // leaving for the menu
    const gate = new StartGate();
    gate.show(); // the next world's gate: whatever is queued runs flat out
    await jest.advanceTimersByTimeAsync(200);
    gate.hide();

    expect(built.ahead).toBe(0);
  });
});
