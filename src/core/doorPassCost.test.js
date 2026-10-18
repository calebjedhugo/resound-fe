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
  /** Steady frames after a door's opening frame (before any face goes stale) */
  const steadyWrites = (renderer, panel) =>
    renderer.passes.filter((pass) => pass.frame > 1 && pass.panel === panel).length;
  const drawSteady = (renderer, eye) => {
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

    expect(steadyWrites(renderer, panelOf(door('b1'), 'south'))).toBeGreaterThan(0);
    for (const [id, facing] of [
      ['c1', 'north'],
      ['c1', 'east'],
      ['c2', 'north'],
      ['c2', 'west'],
    ]) {
      expect(steadyWrites(renderer, panelOf(door(id), facing))).toBe(0);
    }
  });

  it("a big panel's part off screen shows nothing: what lies behind it is not swept", () => {
    // D1 shows through the east side of A1's panel
    const sweptWith = (u) => {
      const door = enter(...DOOR_A, ...D);
      const renderer = createRecordingRenderer();
      drawSteady(renderer, eyeAt(5 * WORLD_SCALE, 17 * WORLD_SCALE, cutting(panelDistance(2), u)));
      return steadyWrites(renderer, panelOf(door('d1'), 'south'));
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

    expect(steadyWrites(renderer, panelOf(door('d1'), 'south'))).toBeGreaterThan(0);
  });

  it('a door at the edge of a view is swept: its cell may lie outside, a panel reaching in', () => {
    // From far off, A2's view narrows to a sliver: D1's cell center lies
    // beyond its edge, the west end of D1's south panel within it. (The
    // screen's edge at A1's east edge: no side panel of A1 on screen)
    const door = enter(...DOOR_A, ...D);
    const renderer = createRecordingRenderer();
    drawSteady(renderer, eyeAt(5 * WORLD_SCALE, 25 * WORLD_SCALE, cutting(panelDistance(10), 1)));

    expect(steadyWrites(renderer, panelOf(door('d1'), 'south'))).toBeGreaterThan(0);
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

    expect(steadyWrites(renderer, panelOf(door('k1'), 'south'))).toBeGreaterThan(0);
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
