/**
 * What each door pass costs (core/PortalManager + core/PortalView): a pass
 * draws at the size its panel shows on screen, a small panel re-renders one
 * frame in three — never while a creature shows through it — and the mirror
 * sweep spends its passes on what the screen can show.
 *
 * Rendering is mocked: a recording renderer stands in for three's, logging
 * every pass (frame, target, size) and the panel it drew. Eyes carry a pose
 * (quaternion, fov, aspect) like the real player camera, so passes cull and
 * size as in play.
 */
import gameState from 'core/GameState';
import PortalManager from 'core/PortalManager';
import { WORLD_SCALE } from 'core/constants';
import portalB from '../__tests__/fixtures/puzzles/portal-b.json';
import portalLiveB from '../__tests__/fixtures/puzzles/portal-live-b.json';

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

// The recording renderer's drawing buffer, and the half-res cap on targets
const SCREEN = { width: 800, height: 600 };
const CAP = { width: SCREEN.width / 2, height: SCREEN.height / 2 };
const FOV = 75;
// Pixels per world unit at depth 1, vertically (aspect 4:3 makes it the
// same horizontally)
const FOCAL = SCREEN.height / 2 / Math.tan((FOV / 2) * (Math.PI / 180));

const LOOK_NORTH = { x: 0, y: 0, z: 0, w: 1 }; // three cameras look down -z
const LOOK_SOUTH = { x: 0, y: 1, z: 0, w: 0 };

/** A posed eye, like the player camera. */
const eyeAt = (x, z, quaternion = LOOK_NORTH) => ({
  position: { x, y: 1.8, z },
  quaternion,
  fov: FOV,
  aspect: SCREEN.width / SCREEN.height,
});

function allPanels() {
  return gameState.activeArea.entities
    .filter((e) => e.type === 'gate' && e.mesh)
    .flatMap((gate) => gate.mesh.children.filter((child) => child._isPortalSurface));
}

/**
 * A stand-in for the game's WebGLRenderer that records every pass, and the
 * panel each one drew (the panel whose picture is the target it wrote, once
 * the pass hands it over).
 */
function createRecordingRenderer() {
  let target = null;
  let pending = null; // the last pass, until its panel shows its target
  return {
    clippingPlanes: [],
    frame: 0,
    passes: [], // { frame, target, width, height, panel }
    setRenderTarget(next) {
      target = next;
    },
    render() {
      this.settle();
      if (!target) return;
      pending = { frame: this.frame, target, width: target.width, height: target.height };
      this.passes.push(pending);
    },
    settle() {
      if (!pending) return;
      pending.panel = allPanels().find((panel) => panel.material.map === pending.target.texture);
      pending = null;
    },
    getDrawingBufferSize: (size) => size.set(SCREEN.width, SCREEN.height),
    /** Passes of frame `frame` that drew `panel`. */
    writesOf(panel, frame = this.frame) {
      return this.passes.filter((pass) => pass.frame === frame && pass.panel === panel);
    },
    /** The pass that drew the picture `panel` shows. */
    shownBy(panel) {
      for (let i = this.passes.length - 1; i >= 0; i -= 1) {
        if (this.passes[i].panel === panel) return this.passes[i];
      }
      return null;
    },
  };
}

/** One frame of door passes for `eye`. */
function drawFrame(renderer, eye) {
  renderer.frame += 1;
  PortalManager.renderPortals(renderer, eye);
  renderer.settle();
}

/** The panel of `gate` on its `facing` side (the surface sits opposite). */
function panelOf(gate, facing) {
  const out = { north: { z: 1 }, south: { z: -1 }, east: { x: -1 }, west: { x: 1 } }[facing];
  return gate.mesh.children.find(
    (child) =>
      child._isPortalSurface &&
      Math.sign(Math.round(child.position.x * 10)) === (out.x || 0) &&
      Math.sign(Math.round(child.position.z * 10)) === (out.z || 0)
  );
}

/** On-screen height (px) of a 3-unit panel `depth` units straight ahead. */
const panelPixels = (depth) => (WORLD_SCALE * FOCAL) / depth;

// portal-a's door: grid (5, 2) -> world (15, 0, 6). Its SOUTH face's panel
// sits on the cell's far (north) plane, z = 6 - 1.49.
const DOOR = { x: 5 * WORLD_SCALE, z: 2 * WORLD_SCALE };
const SOUTH_PANEL_Z = DOOR.z - (WORLD_SCALE / 2 - 0.01);

async function openPortalA(neighbor = { 'portal-b': portalB }, id = 'portal-a') {
  installFetchMock(neighbor);
  ctx.loadPuzzle(id);
  await jest.runAllTimersAsync(); // the neighbor loads
  const [door] = ctx.getGates();
  door.open();
  return door;
}

afterEach(() => {
  PortalManager.reset();
  delete global.fetch;
});

describe('A door pass draws at the size its panel shows on screen', () => {
  it('a distant panel gets a small target, never smaller than its pixels on screen', async () => {
    const door = await openPortalA();
    const renderer = createRecordingRenderer();
    const eye = eyeAt(DOOR.x, 9 * WORLD_SCALE); // 7 cells south, looking at the door

    drawFrame(renderer, eye);

    const shown = renderer.shownBy(panelOf(door, 'south'));
    const onScreen = panelPixels(eye.position.z - SOUTH_PANEL_Z);
    expect(shown.height).toBeGreaterThanOrEqual(onScreen);
    expect(shown.width).toBeGreaterThanOrEqual(onScreen);
    expect(shown.height).toBeLessThan(CAP.height); // not the old half-res target
  });

  it('a panel filling the screen keeps the half-res target', async () => {
    const door = await openPortalA();
    const renderer = createRecordingRenderer();

    drawFrame(renderer, eyeAt(DOOR.x, DOOR.z + WORLD_SCALE / 2 + 0.1)); // at the threshold

    const shown = renderer.shownBy(panelOf(door, 'south'));
    expect([shown.width, shown.height]).toEqual([CAP.width, CAP.height]);
  });

  it('walking up to a door, the target grows on the very pass the panel needs it', async () => {
    const door = await openPortalA();
    const renderer = createRecordingRenderer();
    const eye = eyeAt(DOOR.x, 9 * WORLD_SCALE); // ONE camera, like the player's

    for (let z = 9 * WORLD_SCALE; z > DOOR.z + WORLD_SCALE / 2 + 0.1; z -= 0.1) {
      eye.position.z = z;
      drawFrame(renderer, eye);
      const shown = renderer.shownBy(panelOf(door, 'south'));
      const onScreen = Math.min(CAP.height, panelPixels(z - SOUTH_PANEL_Z));
      expect(shown.height).toBeGreaterThanOrEqual(onScreen);
    }
  });

  it('stepping back, a target shrinks only after a run of passes asking for less', async () => {
    const door = await openPortalA();
    const renderer = createRecordingRenderer();
    drawFrame(renderer, eyeAt(DOOR.x, DOOR.z + WORLD_SCALE / 2 + 0.1));
    drawFrame(renderer, eyeAt(DOOR.x, DOOR.z + WORLD_SCALE / 2 + 0.1)); // both buffers big
    const panel = panelOf(door, 'south');

    // Far away: a small panel — but no reallocation on the first pass
    const far = eyeAt(DOOR.x, 9 * WORLD_SCALE);
    drawFrame(renderer, far);
    expect(renderer.shownBy(panel).height).toBe(CAP.height);

    for (let i = 0; i < 120; i += 1) drawFrame(renderer, far);
    expect(renderer.shownBy(panel).height).toBeLessThan(CAP.height);
  });
});

describe('A small panel re-renders one frame in three', () => {
  it('draws on one frame in three, showing a picture at most two frames old', async () => {
    const door = await openPortalA();
    const renderer = createRecordingRenderer();
    const far = eyeAt(DOOR.x, 9 * WORLD_SCALE); // well under 1% of the screen
    drawFrame(renderer, far); // the door's first frame writes every face
    const panel = panelOf(door, 'south');

    const drawnOn = [];
    for (let i = 0; i < 9; i += 1) {
      drawFrame(renderer, far);
      if (renderer.writesOf(panel).length > 0) drawnOn.push(renderer.frame);
      expect(renderer.frame - renderer.shownBy(panel).frame).toBeLessThanOrEqual(2);
    }
    expect(drawnOn).toHaveLength(3);
    expect(drawnOn[1] - drawnOn[0]).toBe(3);
  });

  it('a creature showing through it keeps it at full frame rate', async () => {
    // portal-live-b has a creature just beyond its door, in the view from
    // the south of portal-live-a's door
    const door = await openPortalA({ 'portal-live-b': portalLiveB }, 'portal-live-a');
    const renderer = createRecordingRenderer();
    const far = eyeAt(DOOR.x, 9 * WORLD_SCALE);
    drawFrame(renderer, far);
    const panel = panelOf(door, 'south');

    let framesDrawn = 0;
    for (let i = 0; i < 9; i += 1) {
      drawFrame(renderer, far);
      if (renderer.writesOf(panel).length > 0) framesDrawn += 1;
    }
    expect(framesDrawn).toBe(9);
  });

  it('a jump of the eye (a crossing) redraws it at once', async () => {
    const door = await openPortalA();
    const renderer = createRecordingRenderer();
    const eye = eyeAt(DOOR.x, 9 * WORLD_SCALE); // ONE camera, like the player's
    drawFrame(renderer, eye);
    const panel = panelOf(door, 'south');

    // Hop one unit sideways every frame: never the picture from the last spot
    for (let i = 1; i <= 6; i += 1) {
      eye.position.x = DOOR.x + (i % 2);
      drawFrame(renderer, eye);
      expect(renderer.writesOf(panel)).toHaveLength(1);
    }
  });

  it('outgrowing its picture between draws, it redraws at once', async () => {
    const door = await openPortalA();
    const renderer = createRecordingRenderer();
    // Just short of where the panel needs more than 64 texels
    const crossing = SOUTH_PANEL_Z + (WORLD_SCALE * FOCAL) / 64;
    const eye = eyeAt(DOOR.x, crossing + 0.05);
    drawFrame(renderer, eye);
    const panel = panelOf(door, 'south');
    // Settle into its rhythm: a frame it rests, then the frame it draws
    do drawFrame(renderer, eye);
    while (renderer.writesOf(panel).length > 0);
    do drawFrame(renderer, eye);
    while (renderer.writesOf(panel).length === 0);

    // The very next frame — a resting one — a small step closer
    eye.position.z = crossing - 0.1;
    drawFrame(renderer, eye);

    expect(renderer.writesOf(panel)).toHaveLength(1);
    expect(renderer.shownBy(panel).height).toBeGreaterThanOrEqual(
      panelPixels(crossing - 0.1 - SOUTH_PANEL_Z)
    );
  });

  it('back on screen after a look away, it redraws on the first frame', async () => {
    const door = await openPortalA();
    const renderer = createRecordingRenderer();
    const eye = eyeAt(DOOR.x, 9 * WORLD_SCALE);
    drawFrame(renderer, eye);
    const panel = panelOf(door, 'south');

    // Away for 3, 4 and 5 frames: whatever its beat, back means drawn
    for (let away = 3; away <= 5; away += 1) {
      eye.quaternion = LOOK_SOUTH;
      for (let i = 0; i < away; i += 1) drawFrame(renderer, eye);
      eye.quaternion = LOOK_NORTH;
      drawFrame(renderer, eye);
      expect(renderer.writesOf(panel)).toHaveLength(1);
    }
  });
});

describe('The mirror sweep spends its passes on what the screen can show', () => {
  // A same-area world built for the cap: looking north into S1 shows the
  // room north of S2, where V1 stands straight ahead; X1's faces are also
  // in reach of the mapped eye but far off to its side — off screen. X is
  // listed first, so a sweep picking by discovery order would spend its one
  // pass on X1.
  const gate = (id, x, z, partner) => ({
    type: 'gate',
    id,
    facing: 'north',
    link: { puzzleId: 'sweep-cap', gateId: partner },
    position: { x, y: 0, z },
    song: [{ pitch: 'C4', length: '1/4' }],
  });
  const world = {
    id: 'sweep-cap',
    name: 'Sweep cap',
    difficulty: 1,
    gridSize: 15,
    tempo: 120,
    playerStart: { x: 3, y: 0, z: 12 },
    entities: [
      gate('s1', 3, 7, 's2'),
      gate('s2', 10, 10, 's1'),
      gate('x1', 0, 12, 'x2'),
      gate('x2', 14, 14, 'x1'),
      gate('v1', 10, 4, 'v2'),
      gate('v2', 13, 13, 'v1'),
    ],
  };
  const originalCap = PortalManager.constructor.MIRROR_MAX_PASSES;

  afterEach(() => {
    PortalManager.constructor.MIRROR_MAX_PASSES = originalCap;
  });

  it('a face in sight through a door wins the cap over faces off screen', () => {
    installFetchMock({});
    PortalManager.enterWorld(world);
    const gates = gameState.activeArea.entities.filter((e) => e.type === 'gate');
    for (const g of gates) g.open();
    PortalManager.constructor.MIRROR_MAX_PASSES = 1;
    const renderer = createRecordingRenderer();
    const eye = eyeAt(3 * WORLD_SCALE, 9 * WORLD_SCALE); // south of S1, looking in

    drawFrame(renderer, eye);

    // The opening frame warms every face up once; the sweep's one pass is
    // the only second write
    const byId = (id) => gates.find((g) => g.gateId === id);
    expect(renderer.writesOf(panelOf(byId('v1'), 'south'))).toHaveLength(2);
    expect(renderer.writesOf(panelOf(byId('x1'), 'north'))).toHaveLength(1);
  });
});
