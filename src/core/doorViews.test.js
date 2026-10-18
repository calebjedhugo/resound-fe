/**
 * Door views over their lifetime (core/PortalManager + core/PortalView):
 * the frame a door opens, crossings, and — under both — the guarantee that
 * no pass ever samples a panel nothing has drawn yet (it would read BLACK).
 * A world left behind goes with every view of it.
 *
 * Rendering is mocked: a recording renderer stands in for three's, logging
 * every pass (its target and eye) and, at each pass, every doorway panel the
 * drawn scene shows.
 */
import { setImmediate as realSetImmediate } from 'timers';
import v8 from 'v8';
import vm from 'vm';
import gameState from 'core/GameState';
import PortalManager from 'core/PortalManager';
import { WORLD_SCALE } from 'core/constants';
import portalA from '../__tests__/fixtures/puzzles/portal-a.json';
import portalB from '../__tests__/fixtures/puzzles/portal-b.json';
import deployBasic from '../__tests__/fixtures/puzzles/deploy-basic.json';

/** Serve /puzzles/<id>.json from the fixtures the tests link to. */
function installFetchMock(puzzles) {
  global.fetch = jest.fn((url) => {
    const match = url.match(/^\/puzzles\/([a-zA-Z0-9_-]+)\.json$/);
    const data = match && puzzles[match[1]];
    if (data) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(JSON.parse(JSON.stringify(data))),
      });
    }
    return Promise.resolve({ ok: false, statusText: 'Not Found' });
  });
}

/** Every doorway panel a draw of `node` shows (invisible subtrees skip). */
function visiblePanels(node, found = []) {
  for (const child of node.children || []) {
    if (child.visible !== false) {
      if (child._isPortalSurface) found.push(child);
      visiblePanels(child, found);
    }
  }
  return found;
}

/** The doorway panels hanging on a gate, visible or not. */
const panelsOf = (gate) => gate.mesh.children.filter((child) => child._isPortalSurface);

/**
 * A stand-in for the game's WebGLRenderer that records every pass and, at
 * each one, any visible panel showing a buffer no pass has written.
 */
function createRecordingRenderer() {
  const written = new Set();
  let target = null;
  return {
    clippingPlanes: [],
    passes: [], // { target, eye }
    unwrittenSamples: [],
    setRenderTarget(next) {
      target = next;
    },
    render(scene, cam) {
      for (const panel of visiblePanels(scene)) {
        if (!written.has(panel.material.map)) this.unwrittenSamples.push(panel);
      }
      const { x, y, z } = cam.position;
      this.passes.push({ target, eye: { x, y, z } });
      if (target) written.add(target.texture);
    },
    getDrawingBufferSize: (size) => size.set(800, 600),
    /** The eye of the last pass that wrote the buffer `panel` shows. */
    eyeShownBy(panel) {
      for (let i = this.passes.length - 1; i >= 0; i -= 1) {
        const { target: drawn, eye } = this.passes[i];
        if (drawn && drawn.texture === panel.material.map) return eye;
      }
      return null;
    },
  };
}

/** One game frame's draws: the door passes, then the main view. */
function drawFrame(renderer, camera) {
  PortalManager.renderPortals(renderer, camera);
  renderer.setRenderTarget(null);
  renderer.render({ children: [gameState.activeArea.group] }, camera); // the main view
}

/** Put the player at a world spot and let PortalManager react (crossing). */
async function stepTo(x, z) {
  gameState.player.position = { x, y: 1.8, z };
  gameState.player.elevation = 0;
  PortalManager.update();
  await jest.runAllTimersAsync();
}

afterEach(() => {
  PortalManager.reset();
  delete global.fetch;
});

describe('The frame a door opens', () => {
  /**
   * Draw the opening frame and the steady one after it from the same eye:
   * every panel the eye looks into must already show, on the opening frame,
   * the picture it shows from then on — its own perspective.
   */
  function expectOpeningFrameFromThisEye(renderer, camera) {
    drawFrame(renderer, camera);
    const panels = visiblePanels({ children: gameState.activeArea.group.children });
    const opening = new Map(panels.map((panel) => [panel, renderer.eyeShownBy(panel)]));

    const before = renderer.passes.length;
    drawFrame(renderer, camera);
    const lookedInto = panels.filter((panel) =>
      renderer.passes
        .slice(before)
        .some((pass) => pass.target && pass.target.texture === panel.material.map)
    );

    expect(lookedInto.length).toBeGreaterThan(0);
    for (const panel of lookedInto) {
      expect(opening.get(panel)).toEqual(renderer.eyeShownBy(panel));
    }
  }

  it('shows each face the eye looks into from THAT eye at once (a door into another area)', async () => {
    installFetchMock({ 'portal-b': portalB });
    ctx.loadPuzzle('portal-a');
    await jest.runAllTimersAsync(); // the neighbor loads
    const [door] = ctx.getGates();
    door.open();

    // One cell north of the door, looking into it
    expectOpeningFrameFromThisEye(createRecordingRenderer(), {
      position: { x: 5 * WORLD_SCALE, y: 1.8, z: 1 * WORLD_SCALE },
    });
  });

  it('shows each face the eye looks into from THAT eye at once (an in-area teleport pair)', () => {
    installFetchMock({});
    ctx.loadPuzzle('portal-two-pairs');
    for (const gate of ctx.getGates()) gate.open();

    // South of pair1-a, looking into it (its view shows pair2-a)
    expectOpeningFrameFromThisEye(createRecordingRenderer(), {
      position: { x: 5 * WORLD_SCALE, y: 1.8, z: 7 * WORLD_SCALE },
    });
  });

  it('never samples a panel nothing has drawn — door passes and main view alike', () => {
    installFetchMock({});
    ctx.loadPuzzle('portal-two-pairs');
    for (const gate of ctx.getGates()) gate.open();
    const renderer = createRecordingRenderer();
    const camera = { position: { x: 5 * WORLD_SCALE, y: 1.8, z: 7 * WORLD_SCALE } };

    for (let i = 0; i < PortalManager.constructor.STALE_MAX_FRAMES + 2; i += 1) {
      drawFrame(renderer, camera);
    }

    expect(renderer.passes.length).toBeGreaterThan(0);
    expect(renderer.unwrittenSamples).toEqual([]);
  });

  it("writes each new face ONCE: the eye's own passes, plus a warm-up for each face they skip", async () => {
    installFetchMock({ 'portal-b': portalB });
    ctx.loadPuzzle('portal-a');
    await jest.runAllTimersAsync();
    const [door] = ctx.getGates();
    door.open();
    const renderer = createRecordingRenderer();

    // North of the door: the approach panel and both (near edge-on) side
    // panels are the eye's own; the far face can only be warmed up
    PortalManager.renderPortals(renderer, {
      position: { x: 5 * WORLD_SCALE, y: 1.8, z: 1 * WORLD_SCALE },
    });

    expect(renderer.passes).toHaveLength(4);
    const targets = renderer.passes.map((pass) => pass.target);
    expect(new Set(targets).size).toBe(4); // no face drawn twice
    expect(panelsOf(door).every((panel) => panel.visible)).toBe(true);
  });
});

describe('A crossing never rebuilds a door', () => {
  it('an in-area teleport keeps every view: same panels, no warm-ups', async () => {
    installFetchMock({});
    ctx.loadPuzzle('portal-two-pairs');
    const gates = ctx.getGates();
    for (const gate of gates) gate.open();
    const renderer = createRecordingRenderer();
    drawFrame(renderer, { position: { x: 5 * WORLD_SCALE, y: 1.8, z: 7 * WORLD_SCALE } });
    const panelsBefore = gates.map((gate) => panelsOf(gate));

    await stepTo(5 * WORLD_SCALE, 5 * WORLD_SCALE + 1); // into pair1-a: lands in pair1-b
    const arrivalEye = { position: { ...gameState.player.position } };
    let start = renderer.passes.length;
    drawFrame(renderer, arrivalEye);
    const crossingFrame = renderer.passes.length - start;
    start = renderer.passes.length;
    drawFrame(renderer, arrivalEye);
    const nextFrame = renderer.passes.length - start;

    expect(gates.map((gate) => panelsOf(gate))).toEqual(panelsBefore);
    expect(crossingFrame).toBe(nextFrame); // an ordinary frame: nothing to warm up
    expect(renderer.unwrittenSamples).toEqual([]);
  });

  it('a round trip finds the old area’s door as it left it, hidden while away', async () => {
    installFetchMock({ 'portal-a': portalA, 'portal-b': portalB });
    ctx.loadPuzzle('portal-a');
    await jest.runAllTimersAsync();
    const areaA = gameState.activeArea;
    const [door] = ctx.getGates();
    door.open();
    const renderer = createRecordingRenderer();
    const eyeNorth = { position: { x: 5 * WORLD_SCALE, y: 1.8, z: 1 * WORLD_SCALE } };
    drawFrame(renderer, eyeNorth);
    const panels = panelsOf(door);

    // Away in the neighbor: nothing draws the old area's door there, so a
    // pass through the neighbor's own door must never show it (frozen)
    await PortalManager.teleportToCleanser({
      puzzleId: 'portal-b',
      position: { x: 6, y: 0, z: 6 },
    });
    drawFrame(renderer, { position: { x: 5 * WORLD_SCALE, y: 1.8, z: 9 * WORLD_SCALE } });
    expect(visiblePanels(areaA.scene)).toEqual([]);

    // Back home: the same panels, shown again, and no warm-up to pay
    await PortalManager.teleportToCleanser({
      puzzleId: 'portal-a',
      position: { x: 15, y: 0, z: 3 },
    });
    let start = renderer.passes.length;
    drawFrame(renderer, eyeNorth);
    const returnFrame = renderer.passes.length - start;
    start = renderer.passes.length;
    drawFrame(renderer, eyeNorth);

    expect(panelsOf(door)).toEqual(panels);
    expect(panels.every((panel) => panel.visible)).toBe(true);
    expect(returnFrame).toBe(renderer.passes.length - start);
    expect(renderer.unwrittenSamples).toEqual([]);
  });

  it('a door whose area unloads loses its panels with it', async () => {
    installFetchMock({ 'portal-b': portalB, 'deploy-basic': deployBasic });
    ctx.loadPuzzle('portal-a');
    await jest.runAllTimersAsync();
    const [door] = ctx.getGates();
    door.open();
    drawFrame(createRecordingRenderer(), {
      position: { x: 5 * WORLD_SCALE, y: 1.8, z: 1 * WORLD_SCALE },
    });
    expect(panelsOf(door)).toHaveLength(4);

    // Far from both portal areas: they unload, and every view goes first
    await PortalManager.teleportToCleanser({
      puzzleId: 'deploy-basic',
      position: { x: 7 * WORLD_SCALE, y: 0, z: 11 * WORLD_SCALE },
    });

    expect(PortalManager.getArea('portal-a')).toBeNull();
    expect(panelsOf(door)).toEqual([]);
  });
});

describe('A world left behind', () => {
  // Node's own collector, for this file: a full collection on demand
  v8.setFlagsFromString('--expose-gc');
  const collectGarbage = vm.runInNewContext('gc');

  /** Is `ref`'s object gone after a full collection? */
  async function collected(ref) {
    // A WeakRef holds on to its object until the job that made it ends
    await new Promise((resolve) => {
      realSetImmediate(resolve);
    });
    collectGarbage();
    return ref.deref() === undefined;
  }

  /** A few frames in a world with its doors open: a weak hold on it. */
  function visitDoors() {
    installFetchMock({});
    ctx.loadPuzzle('portal-two-pairs');
    for (const gate of ctx.getGates()) gate.open();
    const renderer = createRecordingRenderer();
    for (let i = 0; i < 3; i += 1) {
      drawFrame(renderer, { position: { x: 5 * WORLD_SCALE, y: 1.8, z: 7 * WORLD_SCALE } });
    }
    return new WeakRef(gameState.activeArea);
  }

  it('is let go on the way out: nothing the door passes keep holds on to it', async () => {
    const left = visitDoors();

    PortalManager.reset(); // out to the menu

    expect(await collected(left)).toBe(true);
  });
});
