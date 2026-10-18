/**
 * Audio built ahead, in idle time: the tape's piano notes and the creatures'
 * voices for every area as it is built (core/AudioPrewarm).
 *
 * The test harness has no OfflineAudioContext, so the Piano could never
 * pre-render; these tests supply one that "renders" silence instantly.
 */
import { audioContextManager } from 'resound-sound';
import AudioPrewarm from 'core/AudioPrewarm';
import PlaybackManager from 'core/PlaybackManager';
import PortalManager from 'core/PortalManager';
import StartGate from 'ui/StartGate';

class MockOfflineAudioContext extends global.AudioContext {
  constructor(channels, length, sampleRate) {
    super();
    this.length = length;
    this.sampleRate = sampleRate;
  }

  startRendering() {
    MockOfflineAudioContext.renders += 1;
    return Promise.resolve(this.createBuffer(1, this.length, this.sampleRate));
  }
}
MockOfflineAudioContext.renders = 0;

describe('Building audio ahead', () => {
  const piano = PlaybackManager.getPlayerInstrument();

  beforeAll(() => {
    global.OfflineAudioContext = MockOfflineAudioContext;
  });

  afterAll(() => {
    delete global.OfflineAudioContext;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.requestIdleCallback;
    delete window.cancelIdleCallback;
  });

  it("renders the tape's piano notes for every pitch an area's creatures sing", async () => {
    // The world loads behind the StartGate, as in the game (main.js)
    const gate = new StartGate();
    gate.show();
    ctx.loadPuzzle('recording-two-creatures'); // creatures singing C4 and G4
    await jest.advanceTimersByTimeAsync(100);
    gate.hide();

    const live = jest.spyOn(piano, 'playLiveNote');
    const sampled = jest.spyOn(piano, 'playSampledNote');
    ctx.setInventorySlot(0, [
      { pitch: 'C4', length: '1/4' },
      { pitch: 'G4', length: '1/4' },
    ]);
    ctx.setActiveSlot(0);
    ctx.pressKey('space');
    await ctx.advanceBeats(3);

    // Each first strike plays from a buffer: nothing renders live mid-game
    expect(sampled).toHaveBeenCalledTimes(2);
    expect(live).not.toHaveBeenCalled();
  });

  it('builds each creature voice before its first note while the world is held still', async () => {
    // The StartGate holds the world: time passes, nothing sings
    ctx.loadPuzzle('recording-basic');
    await jest.advanceTimersByTimeAsync(100);

    const waves = jest.spyOn(piano.context, 'createPeriodicWave');
    await ctx.tick(16); // the creature sings its first note

    expect(ctx.getEmittedNotes().map((n) => n.pitch)).toEqual(['C4']);
    expect(waves).not.toHaveBeenCalled();
  });

  it('builds without waiting for idle time while the StartGate is up', async () => {
    // A machine that never goes idle: nothing would ever run in play
    window.requestIdleCallback = jest.fn(() => 1);
    window.cancelIdleCallback = jest.fn();
    const creature = ctx.addCreature({ song: [{ pitch: 'B5', length: '1/4' }] });
    const before = MockOfflineAudioContext.renders;
    AudioPrewarm.warmArea({ entities: [creature] });
    await jest.advanceTimersByTimeAsync(200);
    expect(MockOfflineAudioContext.renders).toBe(before);

    const gate = new StartGate();
    gate.show();
    await jest.advanceTimersByTimeAsync(200);
    expect(MockOfflineAudioContext.renders).toBe(before + 1);
    gate.hide();
  });

  it("drops the old world's waiting creature voices when the world goes, and keeps the piano's", async () => {
    // A machine that never goes idle: everything queued waits
    window.requestIdleCallback = jest.fn(() => 1);
    window.cancelIdleCallback = jest.fn();
    // Creatures the teardown leaves alive (the harness's sandbox), so only
    // the queue decides whose voice gets built
    const old = ctx.addCreature({ song: [{ pitch: 'D5', length: '1/4' }] });
    const next = ctx.addCreature({ song: [{ pitch: 'F5', length: '1/4' }] });
    const waves = jest.spyOn(piano.context, 'createPeriodicWave');
    const before = MockOfflineAudioContext.renders;
    AudioPrewarm.warmArea({ entities: [old] });

    PortalManager.reset(); // leaving for the menu
    AudioPrewarm.warmArea({ entities: [next] }); // the next world's
    const gate = new StartGate();
    gate.show();
    await jest.advanceTimersByTimeAsync(200);
    gate.hide();

    expect(waves).toHaveBeenCalledTimes(1); // F5, for the next world's creature
    expect(MockOfflineAudioContext.renders).toBe(before + 2); // D5 and F5 on the piano
  });
});

describe('What building ahead costs a frame in play', () => {
  // Main-thread ms the audio work costs, on a clock nothing else moves: a
  // creature voice's wavetable, a piano render's graph (charged as the
  // render starts, the moment that build ends), and each of the 16
  // wavetables of the offline phase bank the session's first render builds
  // too (that render: 45 ms, as at 4x CPU)
  const VOICE_MS = 3;
  const RENDER_MS = 13;
  const BANK_WAVE_MS = 2;
  const TIMER_SLICE_MS = 8; // AudioPrewarm's slice without requestIdleCallback

  let clock;
  let idle; // the idle period running now, if any
  let renders; // { room }: the idle time left as each render's build began
  let heldRenders; // resolvers of renders still in flight, while held
  let waves; // the creatures' voice builds

  class ClockedOfflineAudioContext extends global.AudioContext {
    constructor(channels, length, sampleRate) {
      super();
      this.length = length;
      this.sampleRate = sampleRate;
    }

    createPeriodicWave(...args) {
      clock += BANK_WAVE_MS;
      return super.createPeriodicWave(...args);
    }

    startRendering() {
      renders.push({ room: idle ? idle.timeRemaining() : null });
      clock += RENDER_MS;
      const buffer = this.createBuffer(1, this.length, this.sampleRate);
      if (!heldRenders) return Promise.resolve(buffer);
      return new Promise((resolve) => {
        heldRenders.push(() => resolve(buffer));
      });
    }
  }

  /** A fresh AudioPrewarm and player Piano: nothing measured or cached yet. */
  function fresh() {
    let prewarm;
    let piano;
    jest.isolateModules(() => {
      /* eslint-disable global-require */
      prewarm = require('core/AudioPrewarm').default;
      piano = require('core/PlaybackManager').default.getPlayerInstrument();
      /* eslint-enable global-require */
    });
    return { prewarm, piano };
  }

  function creatureSinging(pitches) {
    return ctx.addCreature({ song: pitches.map((pitch) => ({ pitch, length: '1/4' })) });
  }

  /**
   * The session's first renders, behind the StartGate: the first builds the
   * phase bank too, so the next is what gives a render its price.
   */
  async function renderBehindGate(prewarm, pitches) {
    prewarm.hold(true);
    prewarm.warmArea({ entities: [creatureSinging(pitches)] });
    await jest.advanceTimersByTimeAsync(100);
    prewarm.hold(false);
  }

  /** Idle periods of these lengths (ms), then of `otherwise` from then on. */
  function grantIdle(periods, otherwise) {
    window.requestIdleCallback = (callback) =>
      setTimeout(() => {
        const room = periods.length > 0 ? periods.shift() : otherwise;
        const start = clock;
        idle = { timeRemaining: () => Math.max(0, start + room - clock) };
        try {
          callback(idle);
        } finally {
          idle = null;
        }
      }, 16);
    window.cancelIdleCallback = (handle) => clearTimeout(handle);
  }

  beforeEach(() => {
    clock = 0;
    idle = null;
    renders = [];
    heldRenders = null;
    jest.spyOn(performance, 'now').mockImplementation(() => clock);
    global.OfflineAudioContext = ClockedOfflineAudioContext;
    // The context every creature sings on
    const { context } = PlaybackManager.getPlayerInstrument();
    const createPeriodicWave = context.createPeriodicWave.bind(context);
    waves = jest.spyOn(context, 'createPeriodicWave').mockImplementation((...args) => {
      clock += VOICE_MS;
      return createPeriodicWave(...args);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.OfflineAudioContext;
    delete window.requestIdleCallback;
    delete window.cancelIdleCallback;
  });

  it('runs no more than a slice of work per timer task without requestIdleCallback', async () => {
    const { prewarm } = fresh();
    const creature = creatureSinging(['C4', 'D4', 'E4', 'F4', 'G4', 'A4']);

    prewarm.warmArea({ entities: [creature] }); // a neighbor loading mid-play
    const spent = [];
    for (let slice = 0; slice < 10; slice += 1) {
      const before = clock;
      // eslint-disable-next-line no-await-in-loop
      await jest.advanceTimersByTimeAsync(50); // one timer slice
      spent.push(clock - before);
    }

    expect(Math.max(...spent)).toBeLessThanOrEqual(TIMER_SLICE_MS);
    expect(waves).toHaveBeenCalledTimes(6); // every voice, a slice at a time
    // A piano render (13 ms) never fits a slice: it waits for the gate
    expect(renders).toHaveLength(0);
    prewarm.hold(true);
    await jest.advanceTimersByTimeAsync(100);
    expect(renders.length).toBeGreaterThan(0);
    await jest.advanceTimersByTimeAsync(1000);
    prewarm.hold(false);
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
    expect(renders).toHaveLength(0);
  });

  it("renders the session's first piano note, the phase bank's too, only behind the StartGate", async () => {
    const { prewarm } = fresh();
    grantIdle([], 50); // the longest idle periods a browser grants
    const idleRequests = jest.spyOn(window, 'requestIdleCallback');
    prewarm.warmArea({ entities: [creatureSinging(['C4', 'E4'])] }); // the gate woken at once
    await jest.advanceTimersByTimeAsync(500);
    expect(waves).toHaveBeenCalledTimes(2); // the voices, in idle time
    expect(renders).toHaveLength(0); // a render's price is unknown: no idle period has room
    const requested = idleRequests.mock.calls.length;
    await jest.advanceTimersByTimeAsync(500);
    expect(idleRequests).toHaveBeenCalledTimes(requested); // and asks for none to wait in

    prewarm.hold(true); // the next world's gate
    await jest.advanceTimersByTimeAsync(100);
    prewarm.hold(false);
    expect(renders).toEqual([{ room: null }, { room: null }]); // C4 (and the bank), E4

    // Later renders run in idle time with room for what the last one cost
    grantIdle([RENDER_MS - 1, RENDER_MS + 1], 1);
    prewarm.warmArea({ entities: [creatureSinging(['G4'])] }); // a neighbor
    await jest.advanceTimersByTimeAsync(300);
    expect(renders.slice(2)).toEqual([{ room: RENDER_MS + 1 }]);
  });

  it("starts the session's first piano render before anything else behind the StartGate", async () => {
    const { prewarm } = fresh();
    grantIdle([], 50);
    prewarm.hold(true);
    prewarm.warmArea({
      entities: [creatureSinging(['C4', 'E4']), creatureSinging(['G4']), creatureSinging(['A4'])],
    });
    await jest.advanceTimersToNextTimerAsync(); // one held job, then the gate is woken
    prewarm.hold(false);
    expect(renders).toEqual([{ room: null }]); // the render only the gate can run
    expect(waves).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(500);
    expect(waves).toHaveBeenCalledTimes(4); // the voices still come, in idle time
  });

  it('keeps a render for idle time with room after a pitch a strike rendered first', async () => {
    const { prewarm, piano } = fresh();
    await renderBehindGate(prewarm, ['C4', 'D4']); // teaches it a render's cost
    expect(renders).toHaveLength(2);

    piano.startNote('E4', 300); // struck live before the prewarm got to it: it renders now
    // A neighbor queues E4 and G4; one roomy idle period, then only crumbs
    grantIdle([20], 1);
    prewarm.warmArea({ entities: [creatureSinging(['E4', 'G4'])] });
    await jest.advanceTimersByTimeAsync(300);

    const prewarmed = renders.filter(({ room }) => room !== null);
    expect(prewarmed).toHaveLength(1); // G4: E4 cost it nothing
    prewarmed.forEach(({ room }) => expect(room).toBeGreaterThanOrEqual(RENDER_MS));
  });

  it("waits out the piano's full render pool for idle time with room, never building outside it", async () => {
    const { prewarm, piano } = fresh();
    await renderBehindGate(prewarm, ['C4', 'D4']);

    // Four strikes in play fill the pool with renders still in flight
    heldRenders = [];
    ['D5', 'E5', 'F5', 'G5'].forEach((pitch) => piano.startNote(pitch, 300));
    expect(piano.canRenderNow()).toBe(false);
    const struck = renders.length;

    grantIdle([20], 1);
    prewarm.warmArea({ entities: [creatureSinging(['A4', 'B4'])] });
    await jest.advanceTimersByTimeAsync(100);
    const release = heldRenders;
    heldRenders = null;
    release.forEach((resolve) => resolve()); // the strikes' renders finish
    await jest.advanceTimersByTimeAsync(300); // in crumbs of idle time
    expect(renders).toHaveLength(struck);

    grantIdle([], 20); // then roomy idle periods
    await jest.advanceTimersByTimeAsync(300);
    const prewarmed = renders.slice(struck);
    expect(prewarmed).toHaveLength(2); // A4 and B4
    prewarmed.forEach(({ room }) => expect(room).toBeGreaterThanOrEqual(RENDER_MS));
  });
});

/**
 * Each creature's next song is built ahead (Random.prepare: every note's
 * oscillator, onset source and envelope gain), so the moment a note starts
 * builds no audio node. A world's creatures share their onsets: built as
 * they start, The Star's 10-11 notes built 33 nodes in the one frame they
 * start in.
 */
describe("Building each creature's next song ahead", () => {
  const BUILT_PER_NOTE = 3; // its oscillator, onset source and envelope gain

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

  it('starts every song on notes built ahead in idle time', async () => {
    grantIdleTime();
    ctx.loadPuzzle('recording-two-creatures'); // C4 and G4, a song every 4 beats
    // Each sings its first song the moment it is built (in the game the
    // StartGate holds the world still while that one is built)
    await ctx.advanceBeats(2);
    const built = watchNodeBuilds(ctx.getCreatures());
    ctx.clearEmittedNotes();

    await ctx.advanceBeats(12);

    expect(ctx.getEmittedNotes()).toHaveLength(6); // three songs each
    expect(built.atOnset).toBe(0);
    expect(built.ahead).toBeGreaterThanOrEqual(6 * BUILT_PER_NOTE);
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
    ctx.loadPuzzle('recording-two-creatures'); // two songs that start together
    await ctx.advanceBeats(2);
    built = watchNodeBuilds(ctx.getCreatures());
    ctx.clearEmittedNotes();

    await ctx.advanceBeats(12);

    expect(ctx.getEmittedNotes()).toHaveLength(6);
    expect(built.atOnset).toBe(0);
    // Each creature's next song in a task of its own, never both in one
    expect(built.mostInOneCallback).toBe(BUILT_PER_NOTE);
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

  it("builds a clapped creature's next song again: the clap's stop let the built one go", async () => {
    grantIdleTime();
    ctx.loadPuzzle('clap-basic'); // a creature in clap range, singing every 4 beats
    await ctx.advanceBeats(2); // its first song over, its next one built
    const [creature] = ctx.getCreatures();
    const built = watchNodeBuilds([creature]);
    ctx.clearEmittedNotes();

    ctx.pressKey('c');
    await ctx.tick(200); // the clap lands on the next 16th
    expect(built.oscillatorsAhead).toBe(1); // built again, for the displaced song
    await ctx.advanceBeats(4);

    expect(sungBy(creature)).toHaveLength(1);
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
