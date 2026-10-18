/** @jest-environment jsdom */
/**
 * Neighbor areas build in IDLE TIME (PuzzleLoader.buildAreaWhenIdle, from
 * PortalManager's neighbor loads): the staves their gates show are engraved
 * a few per idle slice, then the area assembles — and goes live — in one
 * slice of its own. jsdom so the staves really engrave (resound-notation
 * renders into the DOM).
 *
 * requestIdleCallback is a browser API, so tests that step slice by slice
 * stand it in with a queue they drain by hand, choosing how much idle time
 * each slice gets. Without it the game falls back to timer slices. jsdom
 * can't load an SVG as an image or draw on a canvas either: those stand-ins
 * let a staff's texture arrive as in a browser.
 */
import { NotationRenderer } from 'resound-notation/NotationRenderer';
import gameState from 'core/GameState';
import ListeningManager from 'core/ListeningManager';
import PortalManager from 'core/PortalManager';
import { WORLD_SCALE } from 'core/constants';
import portalLiveB from '../__tests__/fixtures/puzzles/portal-live-b.json';

// portal-live-b (a door back + one creature) with three more gates, each
// showing a staff nothing else in the world shows
const plainGate = (pitch, x) => ({
  type: 'gate',
  position: { x, y: 0, z: 2 },
  song: [{ pitch, length: '1/2' }],
});
const neighbor = {
  ...portalLiveB,
  entities: [...portalLiveB.entities, plainGate('E5', 1), plainGate('F5', 2), plainGate('G5', 3)],
};

function installFetchMock() {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(JSON.stringify(neighbor))) })
  );
}

let idleQueue = [];
function installIdleCallbacks() {
  idleQueue = [];
  global.requestIdleCallback = jest.fn((callback) => {
    idleQueue.push(callback);
  });
}

/** Let every pending promise chain run (no timers, no idle callbacks). */
async function settle() {
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
}

/** Run the next idle callback with `timeRemaining` ms of idle time. */
async function runIdleSlice(timeRemaining = 0) {
  const callback = idleQueue.shift();
  callback({ didTimeout: timeRemaining === 0, timeRemaining: () => timeRemaining });
  await settle();
}

/**
 * Run idle slices until no area build has one left. AudioPrewarm's own run
 * re-queues until a period has room for its next job, so a queue drained
 * with no idle time to spare need never empty (the afterEach finishes it).
 */
async function runBuildSlices() {
  while (idleQueue.some((callback) => callback.name === 'slice')) await runIdleSlice(0);
}

const neighborArea = () => PortalManager.getArea('portal-live-b');
const neighborListeners = () =>
  ListeningManager.listeners.filter((entity) => entity.area && entity.area.id === 'portal-live-b');

describe('Neighbor areas build in idle time', () => {
  let renderSpy;
  const originalImage = global.Image;

  beforeEach(() => {
    renderSpy = jest.spyOn(NotationRenderer.prototype, 'render');
    installFetchMock();
    URL.createObjectURL = () => 'blob:staff';
    URL.revokeObjectURL = () => {};
    global.Image = class {
      set src(url) {
        setTimeout(() => this.onload(), 0);
      }
    };
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ clearRect() {}, drawImage() {} });
  });

  afterEach(async () => {
    PortalManager.reset();
    // A browser always runs a queued idle callback (at worst on its timeout):
    // let any build still pending see the world is gone and let go. Slices
    // get real idle time so AudioPrewarm (which re-queues until a period has
    // room for its next job) can finish its own queue too.
    while (idleQueue.length > 0) await runIdleSlice(50);
    jest.runAllTimers(); // pending image loads land on the stand-ins
    jest.restoreAllMocks();
    global.Image = originalImage;
    delete URL.createObjectURL;
    delete URL.revokeObjectURL;
    delete global.fetch;
    delete global.requestIdleCallback;
  });

  it('with no idle time to spare, each slice engraves at most one staff', async () => {
    installIdleCallbacks();
    ctx.loadPuzzle('portal-live-a');
    await settle();
    renderSpy.mockClear(); // the active area's own staff

    const engravedPerSlice = [];
    while (!neighborArea()) {
      const before = renderSpy.mock.calls.length;
      await runIdleSlice(0);
      engravedPerSlice.push(renderSpy.mock.calls.length - before);
    }

    // door-b shows door-a's staff (already engraved): 3 new staves, then
    // the slice that assembles the area engraves nothing
    expect(engravedPerSlice).toEqual([0, 1, 1, 1, 0]);
  });

  it('with idle time to spare, one slice engraves several staves', async () => {
    installIdleCallbacks();
    ctx.loadPuzzle('portal-live-a');
    await settle();

    let slices = 0;
    while (!neighborArea()) {
      await runIdleSlice(50);
      slices += 1;
    }

    expect(slices).toBe(2); // every staff, then the assembly
  });

  it('nothing of a neighbor exists until the slice that builds it, which also makes it live', async () => {
    installIdleCallbacks();
    ctx.loadPuzzle('portal-live-a');
    await settle();

    // Every engraving slice: no area, no entity hearing notes, no door view
    await runIdleSlice(0);
    await runIdleSlice(0);
    await runIdleSlice(0);
    await runIdleSlice(0);
    expect(neighborArea()).toBeNull();
    expect(neighborListeners()).toHaveLength(0);
    expect(PortalManager._createView(ctx.getGates()[0])).toBeUndefined();

    // The assembling slice: complete and registered before anything else
    // runs; no build slice is left (the new area's audio warm-ups queue
    // AudioPrewarm's own idle run)
    await runIdleSlice(0);
    expect(idleQueue.filter((callback) => callback.name === 'slice')).toHaveLength(0);
    expect(neighborArea().entityManager.getByType('gate')).toHaveLength(4);
    expect(neighborListeners()).toHaveLength(5); // 4 gates + the creature
  });

  it('a neighbor built across several frames keeps the ONE world clock', async () => {
    // Its creature reads the clock when the area goes live — like an area
    // built in one go — so it never owes a song from before it existed
    installIdleCallbacks();
    ctx.loadPuzzle('portal-live-a');
    await settle();
    for (let staff = 0; staff < 4; staff += 1) {
      await ctx.tick(350); // frames pass between slices
      await runIdleSlice(0);
    }
    await ctx.tick(350);
    const beat = gameState.musicalClock.getCurrentBeat();
    expect(beat).toBeGreaterThan(1);
    expect(beat % 1).toBeGreaterThan(0.1); // mid-beat: a song owed would sound at once
    expect(beat % 1).toBeLessThan(0.9);

    await runIdleSlice(0); // the assembly
    expect(neighborArea()).not.toBeNull();
    const notesBefore = ctx.getEmittedNotes().length;
    await ctx.tick(16);

    // Its first song waits for the world's next beat
    const sung = ctx.getEmittedNotes().slice(notesBefore);
    expect(sung.filter((note) => note.pitch === 'D4')).toHaveLength(0);
  });

  it('a world torn down mid-build never gets the neighbor, and holds none of its staves', async () => {
    installIdleCallbacks();
    ctx.loadPuzzle('portal-live-a');
    await settle();
    await runIdleSlice(0);
    await runIdleSlice(0); // E5 engraved

    PortalManager.reset();
    await runBuildSlices();

    expect(neighborArea()).toBeNull();
    expect(neighborListeners()).toHaveLength(0);
    // The abandoned build let go of E5: the next gate showing it engraves anew
    renderSpy.mockClear();
    ctx.loadPuzzle('portal-live-a'); // a new world; its neighbor builds again
    await settle();
    while (!neighborArea()) await runIdleSlice(50);
    expect(renderSpy.mock.calls.map(([input]) => input.voices[0].notes[0].pitch)).toContain('E5');
  });

  it('crossing into a neighbor still building builds it on the spot; the idle build stands down', async () => {
    installIdleCallbacks();
    ctx.loadPuzzle('portal-live-a');
    await settle();
    await runIdleSlice(0); // part-way through the staves
    const [door] = ctx.getGates();
    door.open();

    gameState.player.position = { x: 5 * WORLD_SCALE, y: 1.8, z: 2 * WORLD_SCALE + 1 };
    PortalManager.update();
    await settle();
    expect(gameState.currentPuzzle.id).toBe('portal-live-b');
    const crossedInto = neighborArea();

    await runBuildSlices();

    expect(neighborArea()).toBe(crossedInto);
    expect(neighborListeners().filter((entity) => entity.type === 'creature')).toHaveLength(1);
  });

  it('without requestIdleCallback (Safari), neighbors still load, on timer slices', async () => {
    ctx.loadPuzzle('portal-live-a');
    expect(neighborArea()).toBeNull();

    await jest.runAllTimersAsync();

    expect(neighborArea().entityManager.getByType('gate')).toHaveLength(4);
  });
});
