/**
 * What each door pass costs (core/PortalManager + core/PortalView): a pass
 * draws at the size its panel shows on screen, a small panel re-renders one
 * frame in three — never while a creature shows through it — the mirror
 * sweep spends its passes on what the screen can show, and the stale rotor
 * works only while some door panel is drawn.
 *
 * Rendering is mocked: a recording renderer stands in for three's, logging
 * every pass (frame, target, size, eye) and the panel it drew. Eyes carry a pose
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
    passes: [], // { frame, target, width, height, from, panel }
    setRenderTarget(next) {
      target = next;
    },
    render(scene, camera) {
      this.settle();
      if (!target) return;
      const { x, y, z } = camera.position; // where the pass drew from
      pending = {
        frame: this.frame,
        target,
        width: target.width,
        height: target.height,
        from: { x, y, z },
      };
      this.passes.push(pending);
    },
    settle() {
      if (!pending) return;
      pending.panel = allPanels().find((panel) => panel.material.map === pending.target.texture);
      pending = null;
    },
    // The drawing buffer (a resize changes it)
    screen: { ...SCREEN },
    getDrawingBufferSize(size) {
      return size.set(this.screen.width, this.screen.height);
    },
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
    /** The pass that drew the picture `panel` showed while `pass` ran. */
    shownDuring(panel, pass) {
      for (let i = this.passes.indexOf(pass) - 1; i >= 0; i -= 1) {
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

/** The power of two at or above `texels` (a target's size along an axis). */
const powerOfTwo = (texels) => 2 ** Math.ceil(Math.log2(texels));

describe('A door pass draws at the size its panel shows on screen', () => {
  it('a distant panel gets a small target, twice its pixels on screen (so as sharp as half-res)', async () => {
    const door = await openPortalA();
    const renderer = createRecordingRenderer();
    const eye = eyeAt(DOOR.x, 9 * WORLD_SCALE); // 7 cells south, looking at the door

    drawFrame(renderer, eye);

    const shown = renderer.shownBy(panelOf(door, 'south'));
    const onScreen = panelPixels(eye.position.z - SOUTH_PANEL_Z);
    expect(shown.height).toBeGreaterThanOrEqual(2 * onScreen);
    expect(shown.width).toBeGreaterThanOrEqual(2 * onScreen);
    expect(shown.height).toBe(powerOfTwo(2 * onScreen)); // no more than that
    expect(shown.height).toBeLessThan(CAP.height); // not the old half-res target
  });

  it("a face's straight-on warm-up draws at half the pixels that stand-in eye sees", async () => {
    // The NORTH face: from the south it is never the eye's own, so what it
    // shows is a straight-on eye's (1.5 cells north of the gate, at the
    // player's lens), drawn for other doors' passes to sample — where it
    // shows far smaller than that eye sees it
    const door = await openPortalA();
    const renderer = createRecordingRenderer();
    const eye = eyeAt(DOOR.x, 9 * WORLD_SCALE);
    for (let i = 0; i < 3; i += 1) drawFrame(renderer, eye); // its first write

    const shown = renderer.shownBy(panelOf(door, 'north'));
    const northPanelZ = DOOR.z + (WORLD_SCALE / 2 - 0.01);
    const half = panelPixels(northPanelZ - (DOOR.z - 1.5 * WORLD_SCALE)) / 2;
    expect([shown.width, shown.height]).toEqual([powerOfTwo(half), powerOfTwo(half)]);
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
      const wanted = Math.min(CAP.height, 2 * panelPixels(z - SOUTH_PANEL_Z));
      expect(shown.height).toBeGreaterThanOrEqual(wanted);
    }
  });

  it('a screen resized under a still eye refits the next pass to it', async () => {
    const door = await openPortalA();
    const renderer = createRecordingRenderer();
    const eye = eyeAt(DOOR.x, 9 * WORLD_SCALE);
    drawFrame(renderer, eye);
    drawFrame(renderer, eye);
    const panel = panelOf(door, 'south');

    // Twice the pixels, the eye where it was
    renderer.screen = { width: 2 * SCREEN.width, height: 2 * SCREEN.height };
    drawFrame(renderer, eye);

    const onScreen = 2 * panelPixels(eye.position.z - SOUTH_PANEL_Z);
    expect(renderer.shownBy(panel).height).toBeGreaterThanOrEqual(2 * onScreen);
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
    // Just short of where the panel needs more than 128 texels: 64 on screen
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
      2 * panelPixels(crossing - 0.1 - SOUTH_PANEL_Z)
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

  /**
   * P1 seen from far down its own line (under 1% of the screen): looking
   * north into it shows the view north out of P2 — P1 itself, so P1's
   * picture holds a copy of the one it showed before. `expectCopyFresh`
   * checks the copy P1 shows now was drawn for the eye where it stands, as
   * recently as two draws a beat apart leave it.
   */
  function enterOwnDoor() {
    const gate = (id, z, partner) => ({
      type: 'gate',
      id,
      facing: 'north',
      link: { puzzleId: 'own-door', gateId: partner },
      position: { x: 5, y: 0, z },
      song: [{ pitch: 'C4', length: '1/4' }],
    });
    installFetchMock({});
    PortalManager.enterWorld({
      id: 'own-door',
      name: 'Own door',
      difficulty: 1,
      gridSize: 30,
      tempo: 120,
      playerStart: { x: 5, y: 0, z: 24 },
      entities: [gate('p1', 5, 'p2'), gate('p2', 28, 'p1')],
    });
    const gates = gameState.activeArea.entities.filter((e) => e.type === 'gate');
    for (const g of gates) g.open();
    const [p1, p2] = ['p1', 'p2'].map((id) => gates.find((g) => g.gateId === id));
    const renderer = createRecordingRenderer();
    const eye = eyeAt(5 * WORLD_SCALE, 24 * WORLD_SCALE);
    for (let i = 0; i < 10; i += 1) drawFrame(renderer, eye);
    const panel = panelOf(p1, 'south');
    const { SMALL_PANEL_EVERY, SMALL_PANEL_DRIFT } = PortalManager.constructor;
    const expectCopyFresh = () => {
      const copied = renderer.shownDuring(panel, renderer.shownBy(panel));
      const from = {
        x: eye.position.x + p2.position.x - p1.position.x,
        z: eye.position.z + p2.position.z - p1.position.z,
      };
      expect(Math.abs(copied.from.x - from.x) + Math.abs(copied.from.z - from.z)).toBeLessThan(
        SMALL_PANEL_DRIFT
      );
      expect(renderer.frame - copied.frame).toBeLessThan(2 * SMALL_PANEL_EVERY);
    };
    return { renderer, eye, expectCopyFresh };
  }

  it('showing its own door, back on screen its copy is this eye’s from the second frame', () => {
    const { renderer, eye, expectCopyFresh } = enterOwnDoor();
    const EVERY = PortalManager.constructor.SMALL_PANEL_EVERY;

    // Away long enough that its copy is an old picture (or the stale
    // rotor's straight-on one), for 20, 21 and 22 frames: back on every
    // beat. The first frame back can only copy that
    for (let away = 20; away < 20 + EVERY; away += 1) {
      eye.quaternion = LOOK_SOUTH;
      for (let i = 0; i < away; i += 1) drawFrame(renderer, eye);
      eye.quaternion = LOOK_NORTH;
      drawFrame(renderer, eye);
      for (let i = 0; i < 2 * EVERY; i += 1) {
        drawFrame(renderer, eye);
        expectCopyFresh();
      }
    }
  });

  it('showing its own door, after a jump of the eye its copy is from the new spot by the second frame', () => {
    const { renderer, eye, expectCopyFresh } = enterOwnDoor();
    const EVERY = PortalManager.constructor.SMALL_PANEL_EVERY;

    // A unit sideways and back, every 2 * EVERY + 1 frames: every beat
    for (let jump = 1; jump <= EVERY; jump += 1) {
      eye.position.x += jump % 2 ? 1 : -1;
      drawFrame(renderer, eye);
      for (let i = 0; i < 2 * EVERY; i += 1) {
        drawFrame(renderer, eye);
        expectCopyFresh();
      }
    }
  });
});

describe('A pass runs only for a panel the eye can see now', () => {
  /** Passes of the last frame that drew any of `door`'s panels. */
  const doorWrites = (renderer, door) =>
    ['north', 'south', 'east', 'west'].flatMap((f) => renderer.writesOf(panelOf(door, f)));

  it('turning away where it stands, the eye draws none of its panels', async () => {
    const door = await openPortalA();
    const renderer = createRecordingRenderer();
    const eye = eyeAt(DOOR.x, DOOR.z + 2 * WORLD_SCALE);
    drawFrame(renderer, eye);
    drawFrame(renderer, eye);
    expect(doorWrites(renderer, door).length).toBeGreaterThan(0);

    eye.quaternion = LOOK_SOUTH;
    drawFrame(renderer, eye);

    expect(doorWrites(renderer, door)).toEqual([]);
  });

  it('a narrower view (the window resized) leaves out a panel it no longer holds', async () => {
    // The door 35° to the right of the eye's view, 15 units off: inside a
    // 4:3 view, outside a 1:2 one
    const door = await openPortalA();
    const renderer = createRecordingRenderer();
    const bearing = (35 * Math.PI) / 180;
    const eye = eyeAt(DOOR.x - 15 * Math.sin(bearing), SOUTH_PANEL_Z + 15 * Math.cos(bearing));
    drawFrame(renderer, eye);
    drawFrame(renderer, eye);
    expect(doorWrites(renderer, door).length).toBeGreaterThan(0);

    eye.aspect = 0.5;
    drawFrame(renderer, eye);

    expect(doorWrites(renderer, door)).toEqual([]);
  });
});

describe('The stale rotor works only while a door panel is drawn', () => {
  it('with every door off screen, no pass runs at all', async () => {
    await openPortalA();
    const renderer = createRecordingRenderer();
    const away = eyeAt(DOOR.x, 9 * WORLD_SCALE, LOOK_SOUTH); // the door at the back
    drawFrame(renderer, away); // the door's first frame writes every face
    const opened = renderer.passes.length;

    for (let i = 0; i < PortalManager.constructor.STALE_MAX_FRAMES * 2; i += 1) {
      drawFrame(renderer, away);
    }

    expect(renderer.passes.length).toBe(opened);
  });

  it('a door back in view brings the rotor back: a face no eye draws refreshes', async () => {
    const door = await openPortalA();
    const renderer = createRecordingRenderer();
    const z = 9 * WORLD_SCALE;
    drawFrame(renderer, eyeAt(DOOR.x, z, LOOK_SOUTH));
    for (let i = 0; i < PortalManager.constructor.STALE_MAX_FRAMES * 2; i += 1) {
      drawFrame(renderer, eyeAt(DOOR.x, z, LOOK_SOUTH));
    }

    // The NORTH face can only be seen through other panels from here
    const north = panelOf(door, 'north');
    drawFrame(renderer, eyeAt(DOOR.x, z));
    let refreshedWithin = null;
    for (let i = 0; i < 4 && refreshedWithin === null; i += 1) {
      if (renderer.writesOf(north).length > 0) refreshedWithin = i;
      else drawFrame(renderer, eyeAt(DOOR.x, z));
    }
    expect(refreshedWithin).not.toBeNull();
  });
});

describe('The mirror sweep spends its passes on what the screen can show', () => {
  // A same-area world built for the cap: looking north into S1 shows the
  // room north of S2, where V1 stands straight ahead and W1 further off
  // (smaller on screen); X1's faces are also in reach of the mapped eye but
  // far off to its side — off screen. X and W are listed first, so a sweep
  // picking by discovery order would spend its one pass on one of them.
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
      gate('w1', 12, 3, 'w2'),
      gate('w2', 0, 14, 'w1'),
      gate('v1', 10, 4, 'v2'),
      gate('v2', 13, 13, 'v1'),
    ],
  };
  const originalCap = PortalManager.constructor.MIRROR_MAX_PASSES;

  afterEach(() => {
    PortalManager.constructor.MIRROR_MAX_PASSES = originalCap;
  });

  it('the cap keeps the face biggest on screen, wherever the walk found it', () => {
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
    expect(renderer.writesOf(panelOf(byId('w1'), 'south'))).toHaveLength(1);
    expect(renderer.writesOf(panelOf(byId('x1'), 'north'))).toHaveLength(1);
  });

  it('back in view after a pause, the rotor serves faces the cap left out first', () => {
    installFetchMock({});
    PortalManager.enterWorld(world);
    const gates = gameState.activeArea.entities.filter((e) => e.type === 'gate');
    for (const g of gates) g.open();
    PortalManager.constructor.MIRROR_MAX_PASSES = 1;
    const renderer = createRecordingRenderer();
    const eye = eyeAt(3 * WORLD_SCALE, 9 * WORLD_SCALE);
    drawFrame(renderer, eye);
    // Look straight up long enough for every face to go stale, rotor idle
    eye.quaternion = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };
    for (let i = 0; i < PortalManager.constructor.STALE_MAX_FRAMES * 2; i += 1) {
      drawFrame(renderer, eye);
    }

    eye.quaternion = LOOK_NORTH;
    drawFrame(renderer, eye);

    // Every face is equally stale. The player's eye redraws S1's faces and
    // the sweep's one pass goes to V1's south face. Of the faces the sweep
    // could see but had no room for (W1's, and V1's edge-on sides), W1's
    // south face shows biggest: the rotor's two refreshes go to those —
    // not to S1's north face, first in line by age alone
    const byId = (id) => gates.find((g) => g.gateId === id);
    const drawn = gates.flatMap((g) =>
      ['north', 'south', 'east', 'west']
        .filter((f) => renderer.writesOf(panelOf(g, f)).length > 0)
        .map((f) => `${g.gateId}.${f}`)
    );
    const rotor = drawn.filter((face) => !face.startsWith('s1.') && face !== 'v1.south');
    expect(drawn).toContain('v1.south');
    expect(rotor).toHaveLength(2);
    expect(rotor).toContain('w1.south');
    for (const face of rotor) expect(['w1', 'v1']).toContain(face.split('.')[0]);
    expect(renderer.writesOf(panelOf(byId('s1'), 'north'))).toHaveLength(0);
  });
});

describe('The stale rotor hurries only for faces something may see', () => {
  // Same-area doors facing north: looking north into A1 shows the view
  // north out of A2, where B1 stands straight ahead; B2 looks out at the
  // north wall (nothing more to see). Grid coordinates.
  const gate = (id, x, z, partner) => ({
    type: 'gate',
    id,
    facing: 'north',
    link: { puzzleId: 'rotor-pace', gateId: partner },
    position: { x, y: 0, z },
    song: [{ pitch: 'C4', length: '1/4' }],
  });
  const WORLD = {
    id: 'rotor-pace',
    name: 'Rotor pace',
    difficulty: 1,
    gridSize: 30,
    tempo: 120,
    playerStart: { x: 5, y: 0, z: 29 },
    entities: [gate('a1', 5, 15, 'a2'), gate('a2', 15, 5, 'a1')].concat([
      gate('b1', 15, 2, 'b2'),
      gate('b2', 28, 1, 'b1'),
    ]),
  };
  const FACE_OUT = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
  const caps = ['MIRROR_MAX_DEPTH', 'MIRROR_MAX_FRONTIER', 'MIRROR_MAX_PASSES'];
  const originalCaps = caps.map((cap) => PortalManager.constructor[cap]);

  afterEach(() => {
    caps.forEach((cap, i) => {
      PortalManager.constructor[cap] = originalCaps[i];
    });
  });

  /**
   * Once every face but the eye's and the sweep's has gone stale: the rotor's
   * refreshes a frame (passes drawn from a face's straight-on eye, 1.5 cells
   * out at head height, carried through its door), and the oldest picture
   * any panel shows (frames)
   */
  const rotorPace = () => {
    installFetchMock({});
    PortalManager.enterWorld(WORLD);
    const gates = gameState.activeArea.entities.filter((e) => e.type === 'gate');
    for (const g of gates) g.open();
    const byId = (id) => gates.find((g) => g.gateId === id);
    const straightOn = gates.flatMap((g) => {
      const partner = byId(g.link.gateId);
      return Object.values(FACE_OUT).map(([x, z]) => ({
        x: partner.position.x + x * 1.5 * WORLD_SCALE,
        z: partner.position.z + z * 1.5 * WORLD_SCALE,
      }));
    });
    const renderer = createRecordingRenderer();
    const eye = eyeAt(5 * WORLD_SCALE, 17 * WORLD_SCALE);
    drawFrame(renderer, eye); // the doors' first frame writes every face
    const panels = gates.flatMap((g) => Object.keys(FACE_OUT).map((f) => panelOf(g, f)));
    let oldest = 0;
    for (let i = 1; i < 120; i += 1) {
      drawFrame(renderer, eye);
      if (i >= 60) {
        for (const panel of panels) {
          oldest = Math.max(oldest, renderer.frame - renderer.shownBy(panel).frame);
        }
      }
    }
    const rotor = renderer.passes.filter(
      (pass) =>
        pass.frame > 60 &&
        straightOn.some((at) => Math.abs(at.x - pass.from.x) + Math.abs(at.z - pass.from.z) < 1e-6)
    );
    return { pace: rotor.length / 60, oldest };
  };

  it('faces no sight reaches take turns: one every STALE_UNSEEN_EVERY frames', () => {
    const { pace, oldest } = rotorPace();
    expect(pace).toBeCloseTo(1 / PortalManager.constructor.STALE_UNSEEN_EVERY, 5);
    expect(oldest).toBeGreaterThan(PortalManager.constructor.STALE_MAX_FRAMES + 1);
  });

  it.each([
    ['depth', 'MIRROR_MAX_DEPTH', 1],
    ['frontier', 'MIRROR_MAX_FRONTIER', 0],
  ])(
    'a sweep stopped short of its chains (the %s cap) leaves none unseen: none grows old',
    (_, cap, value) => {
      PortalManager.constructor[cap] = value; // B1's view goes unwalked
      expect(rotorPace().oldest).toBeLessThanOrEqual(
        PortalManager.constructor.STALE_MAX_FRAMES + 1
      );
    }
  );

  it('a face the sweep sees but has no room for keeps the full pace', async () => {
    // Behind the eye, but straight ahead through A1 (out of A2): two doors
    // into another area, side by side — a sweep with room for one sees
    // both, and no chain goes on through them
    installFetchMock({
      'rotor-next': {
        id: 'rotor-next',
        name: 'Rotor next',
        difficulty: 1,
        gridSize: 10,
        tempo: 120,
        playerStart: { x: 1, y: 0, z: 9 },
        entities: [
          { ...gate('nb', 3, 5, 'b1'), link: { puzzleId: 'rotor-pace', gateId: 'b1' } },
          { ...gate('nd', 7, 5, 'd1'), link: { puzzleId: 'rotor-pace', gateId: 'd1' } },
        ],
      },
    });
    PortalManager.enterWorld({
      ...WORLD,
      entities: [
        gate('a1', 5, 8, 'a2'),
        gate('a2', 15, 25, 'a1'),
        { ...gate('b1', 15, 22, 'nb'), link: { puzzleId: 'rotor-next', gateId: 'nb' } },
        { ...gate('d1', 16, 23, 'nd'), link: { puzzleId: 'rotor-next', gateId: 'nd' } },
      ],
    });
    await jest.runAllTimersAsync(); // the neighbour loads
    const gates = gameState.activeArea.entities.filter((e) => e.type === 'gate');
    for (const g of gates) g.open();
    PortalManager.constructor.MIRROR_MAX_PASSES = 1;
    const renderer = createRecordingRenderer();
    const eye = eyeAt(5 * WORLD_SCALE, 10 * WORLD_SCALE);
    drawFrame(renderer, eye);
    const faces = gates
      .filter((g) => g.gateId === 'b1' || g.gateId === 'd1')
      .map((g) => panelOf(g, 'south'));

    let oldest = 0;
    for (let i = 1; i < 120; i += 1) {
      drawFrame(renderer, eye);
      for (const panel of faces) {
        if (i >= 60) oldest = Math.max(oldest, renderer.frame - renderer.shownBy(panel).frame);
      }
    }

    expect(oldest).toBeLessThanOrEqual(PortalManager.constructor.STALE_MAX_FRAMES + 1);
  });
});

describe('The mirror sweep draws only what a chain can show on screen', () => {
  // Same-area doors, every gate facing north: looking north into A1 shows
  // the view north out of A2 (and P1's north out of P2). Grid coordinates.
  const gate = (id, x, z, partner) => ({
    type: 'gate',
    id,
    facing: 'north',
    link: { puzzleId: 'sight-lines', gateId: partner },
    position: { x, y: 0, z },
    song: [{ pitch: 'C4', length: '1/4' }],
  });
  const enter = (...gates) => {
    installFetchMock({});
    PortalManager.enterWorld({
      id: 'sight-lines',
      name: 'Sight lines',
      difficulty: 1,
      gridSize: 30,
      tempo: 120,
      playerStart: { x: 5, y: 0, z: 29 },
      entities: gates,
    });
    const entities = gameState.activeArea.entities.filter((e) => e.type === 'gate');
    for (const g of entities) g.open();
    return (id) => entities.find((g) => g.gateId === id);
  };
  // A1 -> A2 (straight ahead of A2: B1; off to its north-east: D1)
  const DOOR_A = [gate('a1', 5, 15, 'a2'), gate('a2', 15, 5, 'a1')];
  const B = [gate('b1', 15, 2, 'b2'), gate('b2', 19, 19, 'b1')];
  const D = [gate('d1', 16, 1, 'd2'), gate('d2', 19, 10, 'd1')];
  // An eye on A1's (or P1's) axis, `cells` south of the door, sees its
  // panel this far ahead (the panel hugs the far side of the cell)
  const panelDistance = (cells) => cells * WORLD_SCALE + (WORLD_SCALE / 2 - 0.01);
  // Turned left (west) until the screen's right edge cuts a panel straight
  // ahead, `distance` away, at `u` of the way across: what lies behind the
  // rest of the panel is off screen
  const HALF_ACROSS = Math.atan(
    Math.tan((FOV / 2) * (Math.PI / 180)) * (SCREEN.width / SCREEN.height)
  );
  const turned = (yaw) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
  const cutYaw = (distance, u) => HALF_ACROSS - Math.atan((WORLD_SCALE * (u - 0.5)) / distance);
  const cutting = (distance, u) => turned(cutYaw(distance, u));
  /**
   * The sweep's passes for `door`'s `facing` panel in the steady frames after
   * the doors' opening ones (until every face has its first write): passes
   * not drawn from the face's straight-on eye (1.5 cells out, carried
   * through its door — a warm-up's or the stale rotor's)
   */
  const steadyWrites = (renderer, door, facing) => {
    const panel = panelOf(door, facing);
    const partner = gameState.activeArea.entities.find((e) => e.gateId === door.link.gateId);
    const out = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[facing];
    const straightOn = {
      x: partner.position.x + out[0] * 1.5 * WORLD_SCALE,
      z: partner.position.z + out[1] * 1.5 * WORLD_SCALE,
    };
    return renderer.passes.filter(
      (pass) =>
        pass.frame >= renderer.steadyFrom &&
        pass.panel === panel &&
        Math.abs(pass.from.x - straightOn.x) + Math.abs(pass.from.z - straightOn.z) > 1e-6
    ).length;
  };
  const drawSteady = (renderer, eye) => {
    // The opening frames, while a face waits for its first write
    do drawFrame(renderer, eye);
    while (allPanels().some((panel) => !panel.visible) && renderer.frame < 30);
    expect(allPanels().every((panel) => panel.visible)).toBe(true);
    // eslint-disable-next-line no-param-reassign
    renderer.steadyFrom = renderer.frame + 1;
    for (let i = 0; i < 10; i += 1) drawFrame(renderer, eye);
  };
  /**
   * Does the screen show `far`'s south panel through `near`'s, for `eye`
   * looking north turned `yaw` to the west, the door leading out at `exit`?
   * A plan view: every panel spans the eye's height, the floor is open.
   */
  const showsThrough = (eye, yaw, near, exit, far) => {
    const e = eye.position;
    const half = WORLD_SCALE / 2;
    const panelZ = (g) => g.position.z - (half - 0.01);
    const depth = e.z - panelZ(near);
    // The part of the near panel within the screen's sides...
    const left = Math.max(near.position.x - half, e.x - depth * Math.tan(HALF_ACROSS + yaw));
    const right = Math.min(near.position.x + half, e.x + depth * Math.tan(HALF_ACROSS - yaw));
    if (left >= right) return false;
    // ...carried through the door, then on to the far panel's plane
    const shift = exit.position.x - near.position.x;
    const scale = (e.z + exit.position.z - near.position.z - panelZ(far)) / depth;
    const reach = (x) => e.x + shift + (x - e.x) * scale;
    return reach(right) > far.position.x - half && reach(left) < far.position.x + half;
  };
  /**
   * Is `pass` (the picture a panel shows on `frame`) one drawn for `eye`
   * carried through the doors along `path` (each door's gate, then its
   * partner), as recently and as near as a small panel may keep it — not
   * the straight-on warm-up's?
   */
  const drawnThrough = (pass, eye, frame, ...path) => {
    let { x, z } = eye.position;
    for (let i = 0; i < path.length; i += 2) {
      x += path[i + 1].position.x - path[i].position.x;
      z += path[i + 1].position.z - path[i].position.z;
    }
    return (
      Boolean(pass) &&
      Math.abs(pass.from.x - x) + Math.abs(pass.from.z - z) <
        PortalManager.constructor.SMALL_PANEL_DRIFT &&
      frame - pass.frame <= PortalManager.constructor.SMALL_PANEL_EVERY
    );
  };

  it('a face no door shows on screen is never swept, however near a mapped eye it stands', () => {
    // A2's mapped eye stands past two faces each of C1 and C2 — behind it,
    // out of every sightline (and behind the player): such faces once
    // filled the cap every frame
    const door = enter(...DOOR_A, ...B, gate('c1', 10, 20, 'c2'), gate('c2', 20, 25, 'c1'));
    const renderer = createRecordingRenderer();
    drawSteady(renderer, eyeAt(5 * WORLD_SCALE, 17 * WORLD_SCALE));

    expect(steadyWrites(renderer, door('b1'), 'south')).toBeGreaterThan(0);
    for (const [id, facing] of [
      ['c1', 'north'],
      ['c1', 'east'],
      ['c2', 'north'],
      ['c2', 'west'],
    ]) {
      expect(steadyWrites(renderer, door(id), facing)).toBe(0);
    }
  });

  it("a big panel's part off screen shows nothing: what lies behind it is not swept", () => {
    // D1 shows through the east side of A1's panel
    const sweptWith = (u) => {
      const door = enter(...DOOR_A, ...D);
      const renderer = createRecordingRenderer();
      drawSteady(renderer, eyeAt(5 * WORLD_SCALE, 17 * WORLD_SCALE, cutting(panelDistance(2), u)));
      return steadyWrites(renderer, door('d1'), 'south');
    };

    expect(sweptWith(1)).toBeGreaterThan(0); // the whole panel on screen
    expect(sweptWith(0.25)).toBe(0); // its west quarter only
  });

  it("a small panel keeps its whole picture in sight: it outlives the eye's turn", () => {
    // From far off, its west edge alone on screen: A1's panel is under
    // SMALL_PANEL_SHARE of the screen, and keeps a picture two more frames
    // while the eye turns. D1 shows through its east side
    const door = enter(...DOOR_A, ...D);
    const renderer = createRecordingRenderer();
    const eye = eyeAt(5 * WORLD_SCALE, 25 * WORLD_SCALE, cutting(panelDistance(10), 0.05));
    drawSteady(renderer, eye);

    expect(steadyWrites(renderer, door('d1'), 'south')).toBeGreaterThan(0);
  });

  it('a door at the edge of a view is swept: its cell may lie outside, a panel reaching in', () => {
    // From far off, A2's view narrows to a sliver: D1's cell center lies
    // beyond its edge, the west end of D1's south panel within it. (The
    // screen's edge at A1's east edge: no side panel of A1 on screen)
    const door = enter(...DOOR_A, ...D);
    const renderer = createRecordingRenderer();
    drawSteady(renderer, eyeAt(5 * WORLD_SCALE, 25 * WORLD_SCALE, cutting(panelDistance(10), 1)));

    expect(steadyWrites(renderer, door('d1'), 'south')).toBeGreaterThan(0);
  });

  it('a door that shows itself in its own view keeps that whole view in sight', () => {
    // Looking north into P1 shows the view north out of P2 — P1 itself, far
    // down the line: P1's picture repeats inside P1, the part off screen
    // included. K1 shows only in that part
    const door = enter(
      gate('p1', 5, 5, 'p2'),
      gate('p2', 5, 15, 'p1'),
      gate('k1', 6, 4, 'k2'),
      gate('k2', 20, 20, 'k1')
    );
    const renderer = createRecordingRenderer();
    drawSteady(renderer, eyeAt(5 * WORLD_SCALE, 7 * WORLD_SCALE, cutting(panelDistance(2), 0.25)));

    expect(steadyWrites(renderer, door('k1'), 'south')).toBeGreaterThan(0);
  });

  it('running past a door, a door seen through it shows its own picture the frame it slides in', () => {
    // A1's panel is wholly on screen; D1, six times deeper beyond A2,
    // slides in past A1's east edge five times as fast as the eye runs.
    // What a panel shows was drawn the frame before
    const door = enter(
      gate('a1', 5, 25, 'a2'),
      gate('a2', 20, 25, 'a1'),
      gate('d1', 23, 15, 'd2'),
      gate('d2', 28, 28, 'd1')
    );
    const [a1, a2, d1, d2] = ['a1', 'a2', 'd1', 'd2'].map(door);
    const renderer = createRecordingRenderer();
    const eye = eyeAt(a1.position.x - 6, a1.position.z + 4.5);
    drawFrame(renderer, eye); // the doors' first frame writes every face
    const panel = panelOf(d1, 'south');

    let seen = 0;
    for (let i = 0; i < 60; i += 1) {
      eye.position.x += 0.134; // running east
      const shown = renderer.shownBy(panel); // as this frame's passes find it
      drawFrame(renderer, eye);
      if (showsThrough(eye, 0, a1, a2, d1)) {
        seen += 1;
        expect(drawnThrough(shown, eye, renderer.frame, a1, a2, d1, d2)).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('turning fast, a door seen through a door shows its own picture from the turn’s second frame', () => {
    // A mouse turn to the right, 0.13 a frame: D1 comes into view through
    // A1 on its second frame, further than the screen's slack reached on
    // the first. (A flick's first frame can't be foreseen.)
    const door = enter(...DOOR_A, ...D);
    const [a1, a2, d1, d2] = ['a1', 'a2', 'd1', 'd2'].map(door);
    const renderer = createRecordingRenderer();
    let yaw = cutYaw(panelDistance(2), 0.1);
    const eye = eyeAt(5 * WORLD_SCALE, 17 * WORLD_SCALE, turned(yaw));
    drawSteady(renderer, eye);
    const panel = panelOf(d1, 'south');

    let seen = 0;
    for (let i = 0; i < 6; i += 1) {
      if (i < 3) yaw -= 0.13;
      eye.quaternion = turned(yaw);
      const shown = renderer.shownBy(panel);
      drawFrame(renderer, eye);
      if (showsThrough(eye, yaw, a1, a2, d1)) {
        seen += 1;
        expect(drawnThrough(shown, eye, renderer.frame, a1, a2, d1, d2)).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('once a fast turn settles, what lies past the screen goes unswept again', () => {
    // Turned back left, fast, until A1's west quarter alone shows: D1 is
    // out of sight (see above)
    const door = enter(...DOOR_A, ...D);
    const renderer = createRecordingRenderer();
    const eye = eyeAt(5 * WORLD_SCALE, 17 * WORLD_SCALE, cutting(panelDistance(2), 1));
    drawSteady(renderer, eye);
    const from = cutYaw(panelDistance(2), 1);
    const to = cutYaw(panelDistance(2), 0.25);
    for (let i = 1; i <= 3; i += 1) {
      eye.quaternion = turned(from + ((to - from) * i) / 3);
      drawFrame(renderer, eye);
    }
    const turnEnd = renderer.frame;

    drawSteady(renderer, eye);

    const settled = renderer.passes.filter(
      (pass) => pass.frame > turnEnd + 3 && pass.panel === panelOf(door('d1'), 'south')
    );
    expect(settled).toEqual([]);
  });
});
