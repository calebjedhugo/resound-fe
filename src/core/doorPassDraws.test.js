/**
 * What each door pass draws (core/PortalView, core/sceneMatrices.scenePieces):
 * a pass leaves out the pieces of its scene it cannot draw, and draws
 * exactly what three would have drawn walking the whole scene — in the same
 * order — less only draws its clip planes would have discarded entirely.
 *
 * Rendering is three's own: the REAL WebGLRenderer (its traversal, frustum
 * culling, sorting and draw calls) over a stub GL context. The scenario
 * runs twice, each on a fresh copy of the game, once with passes walking
 * the whole scene (PortalView.cullPieces off), and the two runs' draws
 * compare pass by pass.
 */
import { createGLStub } from '../__tests__/helpers/glStub';

// The real three, for this file's own copies of the game (loadGame)
jest.mock('three', () => jest.requireActual('three/src/Three.js'));

let THREE;
let PortalManager;
let PortalView;
let gameState;
let beginFrame;
let updateSceneMatrices;
let renderMainView;
let WORLD_SCALE;

/**
 * A fresh copy of the game's modules with the real three (the shared test
 * setup loaded them with the three mock): a world as at boot, its frame
 * counters at zero.
 */
async function loadGame() {
  delete window.__THREE__; // three warns about a second copy
  await jest.isolateModulesAsync(async () => {
    THREE = await import('three');
    PortalManager = (await import('core/PortalManager')).default;
    PortalView = (await import('core/PortalView')).default;
    gameState = (await import('core/GameState')).default;
    ({ beginFrame, updateSceneMatrices } = await import('core/sceneMatrices'));
    ({ renderMainView } = await import('core/passContext'));
    ({ WORLD_SCALE } = await import('core/constants'));
  });
}

const SCREEN = { width: 640, height: 480 };

// Where a wall's far-off child turns up mid-frame (grid x, z)
const FAR_SPOTS = [
  [3, 9],
  [9, 15],
  [12, 4],
  [16, 10],
  [6, 17],
  [13, 13],
  [7, 5],
];

const gate = (id, x, y, z, link) => ({
  type: 'gate',
  id,
  facing: 'north',
  link,
  position: { x, y, z },
  song: [{ pitch: 'C4', length: '1/4' }],
});
const creature = (x, z, y = 0) => ({
  type: 'creature',
  position: { x, y, z },
  data: { song: [{ pitch: 'E4', length: '1/4' }], interval: 64, audibleRange: 10 },
});
const same = (gateId) => ({ puzzleId: 'pass-draws', gateId });

// Same-area doors all over a room with a raised platform, walls, creatures
// and a fountain, and one door into a neighbour area
const WORLD = {
  id: 'pass-draws',
  name: 'Pass draws',
  difficulty: 1,
  gridSize: 20,
  tempo: 120,
  playerStart: { x: 10, y: 0, z: 18 },
  floors: [{ elevation: 1, x1: 2, z1: 2, x2: 6, z2: 6 }],
  entities: [
    gate('a1', 5, 0, 14, same('a2')),
    gate('a2', 14, 0, 4, same('a1')),
    gate('b1', 12, 0, 10, same('b2')),
    gate('b2', 3, 1, 3, same('b1')),
    gate('c1', 16, 0, 15, same('c2')),
    gate('c2', 8, 0, 7, same('c1')),
    gate('d1', 10, 0, 13, { puzzleId: 'pass-draws-next', gateId: 'd2' }),
    { type: 'ramp', position: { x: 4, y: 0, z: 7 }, direction: 'north' },
    ...[6, 7, 8].map((x) => ({ type: 'wall', position: { x, y: 0, z: 11 } })),
    { type: 'wall', position: { x: 15, y: 0, z: 4 } },
    {
      type: 'fountain',
      position: { x: 12, y: 0, z: 16 },
      song: [{ pitch: 'G4', length: '1/4' }],
    },
    creature(14, 2),
    creature(8, 4),
    creature(16, 12),
    creature(4, 4, 1),
  ],
};
const NEXT = {
  id: 'pass-draws-next',
  name: 'Pass draws next door',
  difficulty: 1,
  gridSize: 10,
  tempo: 120,
  playerStart: { x: 1, y: 0, z: 1 },
  entities: [
    gate('d2', 5, 0, 7, { puzzleId: 'pass-draws', gateId: 'd1' }),
    creature(5, 5),
    { type: 'wall', position: { x: 3, y: 0, z: 4 } },
  ],
};

function installFetchMock(next = NEXT) {
  global.fetch = jest.fn((url) => {
    const data = url === '/puzzles/pass-draws-next.json' ? next : null;
    if (data) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(structuredClone(data)) });
    }
    return Promise.resolve({ ok: false, statusText: 'Not Found' });
  });
}

/** Seeded Math.random: both runs of a scenario build the same world. */
function seedRandom() {
  let a = 7;
  jest.spyOn(Math, 'random').mockImplementation(() => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  });
}

// What a draw is, the same in both runs: kind, and where (world matrix)
const describe3 = (object, geometry, material, group) => {
  const e = object.matrixWorld.elements;
  const at = [e[12], e[13], e[14]].map((v) => v.toFixed(3)).join(',');
  return `${object.type}/${geometry.type}/${material.type}@${at}${group ? `#${group.start}` : ''}`;
};

/**
 * Would this draw's every fragment be discarded — its object wholly past
 * one of the pass's clip planes (three's own bounding sphere), and its
 * material one that clips? (The main view binds no-op planes.)
 */
function whollyClipped(renderer, object, geometry, material) {
  if (!renderer.getRenderTarget()) return false;
  if (material.isShaderMaterial && !material.clipping) return false;
  const sphere = object.isSprite
    ? new THREE.Sphere(new THREE.Vector3(), 0.7071067811865476)
    : (object.boundingSphere || geometry.boundingSphere).clone();
  sphere.applyMatrix4(object.matrixWorld);
  return renderer.clippingPlanes.some(
    (plane) => plane.distanceToPoint(sphere.center) < -sphere.radius
  );
}

/**
 * The real renderer, recording every pass and the draws three makes in it.
 * `beforePass(scene)`, when set, runs before each pass.
 */
function createRecordingRenderer() {
  const { canvas, gl } = createGLStub(SCREEN.width, SCREEN.height);
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
  renderer.debug.checkShaderErrors = false;
  renderer.setSize(SCREEN.width, SCREEN.height, false);
  const passes = [];
  const recording = { renderer, passes, beforePass: null };
  let current = null;
  const render = renderer.render.bind(renderer);
  renderer.render = (scene, camera) => {
    if (recording.beforePass) recording.beforePass(scene);
    const { x, y, z } = camera.position;
    current = { from: [x, y, z].map((v) => v.toFixed(4)).join(','), draws: [] };
    passes.push(current);
    render(scene, camera);
    current = null;
  };
  const draw = renderer.renderBufferDirect.bind(renderer);
  renderer.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
    current.draws.push({
      what: describe3(object, geometry, material, group),
      clipped: whollyClipped(renderer, object, geometry, material),
    });
    draw(camera, scene, geometry, material, object, group);
  };
  return recording;
}

/**
 * Staff planes show only once their engraving arrives (none without a DOM):
 * give every one a texture, fitted to a tall staff as an engraving's aspect
 * fits it, so passes draw them as in play.
 */
function engraveStaves(root) {
  const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  root.traverse((object) => {
    if (object._isNotationMesh) {
      object.material.map = texture;
      object._notationOpacity = 1;
      object.scale.set(1, 1.6, 1);
    }
  });
}

/**
 * The scenario: enter the world, open the doors (one a few frames in, so
 * its panels are born mid-frame), and look around from eyes all over the
 * room, a creature moving between frames and, between two passes of some
 * frames, a piece no pass can draw (far below the floor) gaining a child up
 * in the room (gone again by the next frame).
 * @returns {object[]} every pass of every frame, in order
 */
async function play(cullPieces) {
  await loadGame();
  PortalView.cullPieces = cullPieces;
  seedRandom();
  installFetchMock();
  const mainScene = new THREE.Scene();
  mainScene.add(new THREE.AmbientLight(0xffffff, 0.6));
  PortalManager.initialize(mainScene);
  PortalManager.enterWorld(structuredClone(WORLD));
  await jest.runAllTimersAsync(); // the neighbour builds
  const area = gameState.activeArea;
  // Odd pieces: a shader that ignores clip planes, behind the doors' clips
  // from most eyes, and a mesh three never frustum-culls
  const unclipped = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.ShaderMaterial({ vertexShader: 'void main() {}', fragmentShader: 'void main() {}' })
  );
  unclipped.position.set(10 * WORLD_SCALE, 1, 9 * WORLD_SCALE);
  area.group.add(unclipped);
  const uncullable = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  uncullable.position.set(2 * WORLD_SCALE, 1, 17 * WORLD_SCALE);
  uncullable.frustumCulled = false;
  area.group.add(uncullable);
  // ...and a scaled one: a rug whose sphere is its geometry's, six times over
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(9 * WORLD_SCALE, 0.05, 15 * WORLD_SCALE);
  rug.scale.set(6, 6, 1);
  area.group.add(rug);
  engraveStaves(mainScene);
  engraveStaves(PortalManager.getArea('pass-draws-next').scene);

  const recording = createRecordingRenderer();
  const { renderer, passes } = recording;
  const camera = new THREE.PerspectiveCamera(75, SCREEN.width / SCREEN.height, 0.1, 500);
  const gates = area.entities.filter((e) => e.type === 'gate');
  for (const g of gates) if (g.gateId !== 'c1' && g.gateId !== 'c2') g.open();
  const roamer = area.entities.find((e) => e.type === 'creature');
  const anchor = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  anchor.position.set(10 * WORLD_SCALE, -1000, 10 * WORLD_SCALE);
  area.group.add(anchor);
  const frames = [];
  const eyes = [];
  for (const [x, z] of [
    [10, 18],
    [5, 16],
    [14, 6],
    [12, 12],
    [17, 17],
    [9, 9],
    [3, 15],
  ]) {
    for (let turn = 0; turn < 8; turn += 1) eyes.push({ x, z, yaw: (turn * Math.PI) / 4 });
  }
  eyes.forEach((eye, i) => {
    if (i === 3) for (const g of gates) g.open(); // c1/c2's panels: born mid-frame
    roamer.mesh.position.x += 0.4; // pieces measured where they are now
    camera.position.set(eye.x * WORLD_SCALE, 1.8, eye.z * WORLD_SCALE);
    camera.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), eye.yaw);
    gameState.player.position = { x: camera.position.x, y: 1.8, z: camera.position.z };
    const first = passes.length;
    anchor.clear();
    if (i % 4 === 1) {
      // Mid-frame, once the frame's first passes over the room have
      // measured it (sceneMatrices.scenePieces)
      const [x, z] = FAR_SPOTS[i % FAR_SPOTS.length];
      let roomPasses = 0;
      recording.beforePass = (scene) => {
        if (scene === mainScene) roomPasses += 1;
        if (roomPasses < 3) return;
        const far = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
        far.position.set((x - 10) * WORLD_SCALE, 1001.5, (z - 10) * WORLD_SCALE);
        anchor.add(far);
        far.updateMatrixWorld(); // added mid-frame (sceneMatrices)
        recording.beforePass = null;
      };
    }
    beginFrame();
    updateSceneMatrices(mainScene);
    PortalManager.renderPortals(renderer, camera);
    renderer.setRenderTarget(null);
    renderMainView(renderer, mainScene, camera);
    frames.push(passes.slice(first));
  });
  PortalManager.reset();
  return frames;
}

afterEach(() => {
  PortalView.cullPieces = true;
  PortalManager.reset();
  delete global.fetch;
  jest.restoreAllMocks();
});

describe('A door pass draws what walking the whole scene drew', () => {
  it('the same draws in the same order, less only those its clip planes discard', async () => {
    const whole = await play(false);
    const culled = await play(true);

    expect(culled.map((frame) => frame.map((pass) => pass.from))).toEqual(
      whole.map((frame) => frame.map((pass) => pass.from))
    );
    let left = 0;
    whole.forEach((frame, f) =>
      frame.forEach((pass, p) => {
        const kept = culled[f][p].draws.map((d) => d.what);
        // Walk the whole pass's draws: each is drawn next, or one its clip
        // planes discard entirely
        let next = 0;
        for (const { what, clipped } of pass.draws) {
          if (kept[next] === what) next += 1;
          else {
            expect({ what, clipped }).toEqual({ what, clipped: true });
            left += 1;
          }
        }
        expect(kept.slice(next)).toEqual([]);
      })
    );
    // ...and passes do leave such draws out
    expect(left).toBeGreaterThan(0);
  });
});

describe('A neighbour is on the GPU before a door into it opens', () => {
  it("the door's opening frame draws nothing of the neighbour for the first time", async () => {
    await loadGame();
    seedRandom();
    // ...with a fountain in D1's view, and a piece a warm-up step: some
    // warm-up draws pass over a staff plane facing away from them
    installFetchMock({
      ...NEXT,
      entities: [
        ...NEXT.entities,
        {
          type: 'fountain',
          position: { x: 5, y: 0, z: 2 },
          song: [{ pitch: 'G4', length: '1/4' }],
        },
      ],
    });
    PortalManager.constructor.WARM_PIECES_PER_STEP = 1;
    const mainScene = new THREE.Scene();
    mainScene.add(new THREE.AmbientLight(0xffffff, 0.6));
    PortalManager.initialize(mainScene);
    PortalManager.enterWorld(structuredClone(WORLD));
    await jest.runAllTimersAsync(); // the neighbour builds
    engraveStaves(mainScene);
    engraveStaves(PortalManager.getArea('pass-draws-next').scene);
    const { renderer } = createRecordingRenderer();
    // What three draws for the first time (its buffers, vertex arrays and
    // material state are made on that draw)
    const drawn = new WeakSet();
    let firstDraws = [];
    const draw = renderer.renderBufferDirect.bind(renderer);
    renderer.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
      if (!drawn.has(object)) {
        drawn.add(object);
        firstDraws.push(object);
      }
      draw(camera, scene, geometry, material, object, group);
    };
    // Three cells south of D1, looking north into it
    const camera = new THREE.PerspectiveCamera(75, SCREEN.width / SCREEN.height, 0.1, 500);
    camera.position.set(10 * WORLD_SCALE, 1.8, 16 * WORLD_SCALE);
    gameState.player.position = { x: camera.position.x, y: 1.8, z: camera.position.z };
    const frame = () => {
      beginFrame();
      updateSceneMatrices(mainScene);
      PortalManager.renderPortals(renderer, camera);
      renderer.setRenderTarget(null);
      renderMainView(renderer, mainScene, camera);
    };
    frame(); // every door shut
    await jest.runAllTimersAsync(); // idle time

    gameState.activeArea.entities.find((e) => e.gateId === 'd1').open();
    firstDraws = [];
    frame();

    expect(firstDraws.length).toBeGreaterThan(0); // the door's own panels
    const neighbours = firstDraws.filter((object) => !object._isPortalSurface);
    expect(neighbours.map((object) => `${object.type}/${object.geometry.type}`)).toEqual([]);
  });

  it('a neighbour the world lets go of first is never drawn (its freed buffers stay freed)', async () => {
    await loadGame();
    seedRandom();
    installFetchMock();
    const mainScene = new THREE.Scene();
    PortalManager.initialize(mainScene);
    PortalManager.enterWorld(structuredClone(WORLD));
    await jest.runAllTimersAsync(); // the neighbour builds
    const neighbour = PortalManager.getArea('pass-draws-next');
    const { renderer, passes } = createRecordingRenderer();
    const camera = new THREE.PerspectiveCamera(75, SCREEN.width / SCREEN.height, 0.1, 500);
    beginFrame();
    PortalManager.renderPortals(renderer, camera); // its warm-up is due

    PortalManager.reset(); // back to the menu: the neighbour is freed
    const drawnBefore = passes.length;
    const scenesDrawn = [];
    const render = renderer.render.bind(renderer);
    renderer.render = (scene, eye) => {
      scenesDrawn.push(scene);
      render(scene, eye);
    };
    await jest.runAllTimersAsync(); // idle time

    expect(scenesDrawn).not.toContain(neighbour.scene);
    expect(passes.length).toBe(drawnBefore);
  });
});
