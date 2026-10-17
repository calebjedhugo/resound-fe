/**
 * Door views over their lifetime (core/PortalManager + core/PortalView):
 * the frame a door opens, and the guarantee that no pass ever samples a
 * panel nothing has drawn yet (it would read BLACK).
 *
 * Rendering is mocked: a recording renderer stands in for three's, logging
 * every pass (its target and eye) and, at each pass, every doorway panel the
 * drawn scene shows.
 */
import gameState from 'core/GameState';
import PortalManager from 'core/PortalManager';
import { WORLD_SCALE } from 'core/constants';
import portalB from '../__tests__/fixtures/puzzles/portal-b.json';

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
