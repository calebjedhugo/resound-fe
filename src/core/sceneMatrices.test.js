/**
 * World matrices update once a frame per scene (core/sceneMatrices), not once
 * per pass: every pass of a frame — door passes and the main view alike —
 * draws a scene whose matrices are already this frame's, and nothing a pass
 * draws has moved since (a door's panels born mid-frame included).
 *
 * Rendering is mocked: a recording renderer stands in for three's. The
 * three mock records, at each updateMatrixWorld, the local transform every
 * world matrix was derived from (`matrixWorldFrom`).
 */
import * as THREE from 'three';
import PortalManager from 'core/PortalManager';
import { beginFrame, updateSceneMatrices } from 'core/sceneMatrices';
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

const transformOf = (object) => {
  const { position: p, rotation: r, scale: s } = object;
  return `${p.x},${p.y},${p.z}|${r.x},${r.y},${r.z}|${s.x},${s.y},${s.z}`;
};

/** Every object a draw of `node` shows (invisible subtrees skip). */
function drawnObjects(node, found = []) {
  for (const child of node.children || []) {
    if (child.visible !== false) {
      found.push(child);
      drawnObjects(child, found);
    }
  }
  return found;
}

/**
 * A stand-in for the game's WebGLRenderer. At each pass it records whether
 * three would re-derive the scene's matrices itself (auto-update still on),
 * how many times the scene's matrices were updated so far this frame, and
 * any drawn object that moved since.
 */
function createRecordingRenderer() {
  return {
    clippingPlanes: [],
    passes: [], // { scene, autoUpdate, updatesThisFrame, panels }
    moved: [], // drawn objects whose world matrix is out of date
    updates: new Map(), // scene -> updateMatrixWorld calls this frame
    setRenderTarget() {},
    render(scene) {
      const drawn = drawnObjects(scene);
      this.passes.push({
        scene,
        autoUpdate: scene.matrixWorldAutoUpdate,
        updatesThisFrame: this.updates.get(scene) || 0,
        panels: drawn.filter((object) => object._isPortalSurface).length,
      });
      this.moved.push(...drawn.filter((object) => object.matrixWorldFrom !== transformOf(object)));
    },
    getDrawingBufferSize: (size) => size.set(800, 600),
    /** Count each updateMatrixWorld of `scene`, per frame. */
    watch(scene) {
      const update = scene.updateMatrixWorld.bind(scene);
      scene.updateMatrixWorld = () => {
        this.updates.set(scene, (this.updates.get(scene) || 0) + 1);
        update();
      };
    },
  };
}

let mainScene;

/** One game frame, as main.js render() draws it. */
function drawFrame(renderer, camera) {
  renderer.updates.clear();
  beginFrame();
  updateSceneMatrices(mainScene);
  PortalManager.renderPortals(renderer, camera);
  renderer.setRenderTarget(null);
  renderer.render(mainScene, camera); // the main view
}

beforeEach(() => {
  // The world's render scene, before any puzzle parents its area into it
  mainScene = new THREE.Scene();
  PortalManager.initialize(mainScene);
});

afterEach(() => {
  PortalManager.reset();
  delete global.fetch;
});

describe('World matrices update once a frame, not once a pass', () => {
  it("updates each scene once, before its first pass: a neighbour's scene and the main view", async () => {
    installFetchMock({ 'portal-b': portalB });
    ctx.loadPuzzle('portal-a');
    await jest.runAllTimersAsync(); // the neighbor loads
    const [door] = ctx.getGates();
    door.open();
    const renderer = createRecordingRenderer();
    renderer.watch(mainScene);
    renderer.watch(PortalManager.getArea('portal-b').scene);
    const camera = { position: { x: 5 * WORLD_SCALE, y: 1.8, z: 1 * WORLD_SCALE } };

    for (let frame = 0; frame < 3; frame += 1) drawFrame(renderer, camera);

    const scenes = new Set(renderer.passes.map((pass) => pass.scene));
    expect(scenes).toEqual(new Set([mainScene, PortalManager.getArea('portal-b').scene]));
    for (const pass of renderer.passes) {
      expect(pass.autoUpdate).toBe(false); // three never redoes it inside a pass
      expect(pass.updatesThisFrame).toBe(1);
    }
  });

  it('updates the main scene once a frame however many in-area door passes draw it', () => {
    installFetchMock({});
    ctx.loadPuzzle('portal-two-pairs');
    for (const gate of ctx.getGates()) gate.open();
    const renderer = createRecordingRenderer();
    renderer.watch(mainScene);
    const camera = { position: { x: 5 * WORLD_SCALE, y: 1.8, z: 7 * WORLD_SCALE } };

    for (let frame = 0; frame < 3; frame += 1) drawFrame(renderer, camera);

    expect(renderer.passes.length).toBeGreaterThan(3 * 2); // several passes a frame
    for (const pass of renderer.passes) {
      expect(pass.scene).toBe(mainScene);
      expect(pass.autoUpdate).toBe(false);
      expect(pass.updatesThisFrame).toBe(1);
    }
  });

  it('draws nothing that moved since the update — panels born mid-frame (a door opening) included', () => {
    installFetchMock({});
    ctx.loadPuzzle('portal-two-pairs');
    const renderer = createRecordingRenderer();
    const camera = { position: { x: 5 * WORLD_SCALE, y: 1.8, z: 7 * WORLD_SCALE } };
    drawFrame(renderer, camera); // every door closed: no panels yet

    // The doors open between frames; their panels are born inside the next
    // frame's door passes, after the frame's matrix update
    for (const gate of ctx.getGates()) gate.open();
    for (let frame = 0; frame < 3; frame += 1) drawFrame(renderer, camera);

    expect(renderer.passes.some((pass) => pass.panels > 0)).toBe(true);
    expect(renderer.moved).toEqual([]);
  });
});
