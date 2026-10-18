/**
 * Audio built ahead, in idle time: the tape's piano notes and the creatures'
 * voices for every area as it is built (core/AudioPrewarm).
 *
 * The test harness has no OfflineAudioContext, so the Piano could never
 * pre-render; these tests supply one that "renders" silence instantly.
 */
import AudioPrewarm from 'core/AudioPrewarm';
import PlaybackManager from 'core/PlaybackManager';
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
});
