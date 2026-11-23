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
    passes: [], // { target, eye, shown: the panels the pass drew }
    unwrittenSamples: [],
    setRenderTarget(next) {
      target = next;
    },
    render(scene, cam) {
      const shown = visiblePanels(scene);
      for (const panel of shown) {
        if (!written.has(panel.material.map)) this.unwrittenSamples.push(panel);
      }
      const { x, y, z } = cam.position;
      this.passes.push({ target, eye: { x, y, z }, shown });
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

  it("writes each new face ONCE, all in its door's opening frame: the eye's own passes, plus a warm-up for each face they skip", async () => {
    installFetchMock({ 'portal-b': portalB });
    ctx.loadPuzzle('portal-a');
    await jest.runAllTimersAsync();
    const [door] = ctx.getGates();
    door.open();
    const renderer = createRecordingRenderer();

    // North of the door: the approach panel and both (near edge-on) side
    // panels are the eye's own; the far face, which nothing can show yet,
    // is warmed up beside them
    PortalManager.renderPortals(renderer, {
      position: { x: 5 * WORLD_SCALE, y: 1.8, z: 1 * WORLD_SCALE },
    });

    expect(renderer.passes).toHaveLength(4);
    const targets = renderer.passes.map((pass) => pass.target);
    expect(new Set(targets).size).toBe(4); // no face drawn twice
    expect(panelsOf(door).every((panel) => panel.visible)).toBe(true);
  });
});

describe('Every face of a door is written in the frame it opens', () => {
  // Same-area doors facing north. Looking north into A1 from (5, 10) shows
  // the view north out of A2: B1 straight ahead — behind the eye itself.
  // B2 looks out at the north wall: nothing shows B's other faces.
  const gate = (id, x, z, partner) => ({
    type: 'gate',
    id,
    facing: 'north',
    link: { puzzleId: 'first-writes', gateId: partner },
    position: { x, y: 0, z },
    song: [{ pitch: 'C4', length: '1/4' }],
  });
  const eye = {
    position: { x: 5 * WORLD_SCALE, y: 1.8, z: 10 * WORLD_SCALE },
    quaternion: { x: 0, y: 0, z: 0, w: 1 }, // looking north
    fov: 75,
    aspect: 4 / 3,
  };
  const faceOf = (g, facing) => {
    const out = { north: { z: 1 }, south: { z: -1 }, east: { x: -1 }, west: { x: 1 } }[facing];
    return panelsOf(g).find(
      (panel) =>
        Math.sign(Math.round(panel.position.x * 10)) === (out.x || 0) &&
        Math.sign(Math.round(panel.position.z * 10)) === (out.z || 0)
    );
  };

  /** A's doors open and written; B's opening frame drawn. */
  function openB() {
    installFetchMock({});
    PortalManager.enterWorld({
      id: 'first-writes',
      name: 'First writes',
      difficulty: 1,
      gridSize: 30,
      tempo: 120,
      playerStart: { x: 5, y: 0, z: 29 },
      entities: [
        gate('a1', 5, 8, 'a2'),
        gate('a2', 15, 25, 'a1'),
        gate('b1', 15, 22, 'b2'),
        gate('b2', 28, 1, 'b1'),
      ],
    });
    const byId = (id) => ctx.getGates().find((g) => g.gateId === id);
    byId('a1').open();
    byId('a2').open();
    const renderer = createRecordingRenderer();
    drawFrame(renderer, eye);
    byId('b1').open();
    byId('b2').open();
    renderer.passes.length = 0;
    drawFrame(renderer, eye);
    return { renderer, byId };
  }

  it('a face a door view shows is written before that view draws it', () => {
    const { renderer, byId } = openB();

    // A1's south face: the pass whose picture it shows
    const a1 = faceOf(byId('a1'), 'south').material.map;
    const pass = renderer.passes.find((p) => p.target && p.target.texture === a1);
    expect(pass.shown).toContain(faceOf(byId('b1'), 'south'));
    expect(renderer.unwrittenSamples).toEqual([]);
  });

  it('so is every face nothing shows yet: none waits for a later frame', () => {
    const { renderer, byId } = openB();
    // Through A1, B1's south face shows (and its sides, obliquely through
    // the cell); its north face and all of B2's show nowhere yet
    const unseen = [faceOf(byId('b1'), 'north'), ...panelsOf(byId('b2'))];
    for (const panel of unseen) expect(panel.visible).toBe(true);
    expect(renderer.unwrittenSamples).toEqual([]);
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
    await PortalManager.teleportToWaystone({
      puzzleId: 'portal-b',
      position: { x: 6, y: 0, z: 6 },
    });
    drawFrame(renderer, { position: { x: 5 * WORLD_SCALE, y: 1.8, z: 9 * WORLD_SCALE } });
    expect(visiblePanels(areaA.scene)).toEqual([]);

    // Back home: the same panels, shown again, and no warm-up to pay
    await PortalManager.teleportToWaystone({
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
    await PortalManager.teleportToWaystone({
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

  it('an area the world moves on from is let go, its doors and all', async () => {
    installFetchMock({ 'portal-b': portalB, 'deploy-basic': deployBasic });
    const visit = async () => {
      ctx.loadPuzzle('portal-a');
      await jest.runAllTimersAsync();
      const [door] = ctx.getGates();
      door.open();
      // One frame north of the door: every face of it drawn
      drawFrame(createRecordingRenderer(), {
        position: { x: 5 * WORLD_SCALE, y: 1.8, z: 1 * WORLD_SCALE },
      });
      return new WeakRef(gameState.activeArea);
    };
    const left = await visit();

    // Far from both portal areas: they unload, and the world goes on
    await PortalManager.teleportToWaystone({
      puzzleId: 'deploy-basic',
      position: { x: 7 * WORLD_SCALE, y: 0, z: 11 * WORLD_SCALE },
    });
    drawFrame(createRecordingRenderer(), { position: { ...gameState.player.position } });

    expect(await collected(left)).toBe(true);
  });
});
