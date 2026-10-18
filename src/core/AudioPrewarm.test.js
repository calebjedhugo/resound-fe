/**
 * Audio built ahead, in idle time: the tape's piano notes and the creatures'
 * voices for every area as it is built (core/AudioPrewarm).
 *
 * The test harness has no OfflineAudioContext, so the Piano could never
 * pre-render; these tests supply one that "renders" silence instantly.
 */
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
    // A machine with idle time to spare
    window.requestIdleCallback = (callback) =>
      setTimeout(() => callback({ timeRemaining: () => 50 }), 16);
    ctx.loadPuzzle('recording-two-creatures'); // creatures singing C4 and G4
    await ctx.tick(100); // idle time

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

  it('starts a piano render only in an idle period with room for it', async () => {
    // A fresh copy that has measured nothing yet (renders above cost no
    // fake time, which would make any idle period big enough)
    let freshPrewarm;
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      freshPrewarm = require('core/AudioPrewarm').default;
    });
    let idleMs = 5; // less than a render's first-guess cost
    window.requestIdleCallback = (callback) =>
      setTimeout(() => callback({ timeRemaining: () => idleMs }), 16);
    const creature = ctx.addCreature({ song: [{ pitch: 'A5', length: '1/4' }] });
    const before = MockOfflineAudioContext.renders;

    freshPrewarm.warmArea({ entities: [creature] });
    await jest.advanceTimersByTimeAsync(200);
    expect(MockOfflineAudioContext.renders).toBe(before);

    idleMs = 50;
    await jest.advanceTimersByTimeAsync(200);
    expect(MockOfflineAudioContext.renders).toBe(before + 1);
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
  // creature voice's wavetable, and a piano render's graph (charged as the
  // render starts, the moment that build ends)
  const VOICE_MS = 3;
  const RENDER_MS = 13;
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

  it('keeps a render for idle time with room after a pitch a strike rendered first', async () => {
    const { prewarm, piano } = fresh();
    grantIdle([], 50);
    prewarm.warmArea({ entities: [creatureSinging(['C4'])] }); // teaches it a render's cost
    await jest.advanceTimersByTimeAsync(100);
    expect(renders).toHaveLength(1);

    piano.startNote('E4', 300); // struck live before the prewarm got to it: it renders now
    // A neighbor queues E4 and G4; one roomy idle period, then only crumbs
    grantIdle([20], 1);
    prewarm.warmArea({ entities: [creatureSinging(['E4', 'G4'])] });
    await jest.advanceTimersByTimeAsync(300);

    const prewarmed = renders.filter(({ room }) => room !== null);
    expect(prewarmed).toHaveLength(2); // C4, then G4: E4 cost it nothing
    prewarmed.forEach(({ room }) => expect(room).toBeGreaterThanOrEqual(RENDER_MS));
  });

  it("waits out the piano's full render pool for idle time with room, never building outside it", async () => {
    const { prewarm, piano } = fresh();
    grantIdle([], 50);
    prewarm.warmArea({ entities: [creatureSinging(['C4'])] });
    await jest.advanceTimersByTimeAsync(100);

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
