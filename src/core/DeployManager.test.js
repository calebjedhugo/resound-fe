/**
 * DeployManager Tests — the deployable waystone gate.
 *
 * G cycles idle -> aiming (phantom two tiles ahead, free placement) ->
 * deployed (a real walk-on pad) -> idle (picked back up). Walking onto the
 * pad teleports the player to the ACTIVE waystone (the last one stepped
 * on), consumes the pad, and the arrival fires the waystone as usual
 * (it no longer wipes the tape: 2026-11-23). One way, one use; world state does not reset.
 */
import * as THREE from 'three';
import gameState from 'core/GameState';
import DeployManager from 'core/DeployManager';
import PortalManager from 'core/PortalManager';
import Waystone from 'entities/Waystone';
import { CLIP_PLANE_COUNT } from 'core/passContext';
import { WORLD_SCALE } from 'core/constants';
import portalA from '../__tests__/fixtures/puzzles/portal-a.json';
import portalB from '../__tests__/fixtures/puzzles/portal-b.json';
import deployBasic from '../__tests__/fixtures/puzzles/deploy-basic.json';

const take = (pitch) => ({ id: `held_${pitch}`, spec: { song: [{ pitch, length: '1/1' }] } });

// deploy-basic geometry (world units): spawn (21, 39), waystone (21, 33),
// wall cell (21, 15). Facing "north" (-z) is yaw 0.
const WAYSTONE = { x: 7 * WORLD_SCALE, y: 0, z: 11 * WORLD_SCALE };

/** Stand the player somewhere, facing -z unless told otherwise. */
function standAt(x, z, yaw = 0) {
  gameState.player.position = { x, y: 1.8, z };
  gameState.player.elevation = 0;
  gameState.camera.viewCenter = [yaw, 0];
}

/** Walk onto the waystone and let it fire (claims ACTIVE). */
async function activateWaystone() {
  standAt(WAYSTONE.x, WAYSTONE.z);
  await ctx.tick(20);
}

const padsInActiveArea = () => gameState.activeArea.entityManager.getByType('waystone-gate');

/** Minimal stand-in for the game's WebGLRenderer (rendering is mocked). */
function fakeRenderer() {
  return {
    clippingPlanes: [],
    renderCalls: [],
    setRenderTarget() {},
    render(scene, cam) {
      this.renderCalls.push({ scene, cam });
    },
    getDrawingBufferSize: (size) => size.set(800, 600),
  };
}

beforeEach(() => {
  ctx.loadPuzzle('deploy-basic');
  gameState.mode = 'PLAYING';
  DeployManager.reset();
});

afterEach(() => {
  DeployManager.reset();
  PortalManager.reset();
});

describe('DeployManager state machine', () => {
  it('G is silent while no waystone has ever been stepped on', () => {
    gameState.activeWaystone = null;
    standAt(21, 39);
    DeployManager.toggle();
    expect(DeployManager.state).toBe('idle');
  });

  it('G aims a phantom two tiles ahead of the player', async () => {
    await activateWaystone();
    standAt(30, 39); // facing -z, open floor two tiles ahead
    DeployManager.toggle();
    expect(DeployManager.state).toBe('aiming');
    expect(DeployManager._phantom.visible).toBe(true);
    expect(DeployManager._phantom.position.x).toBeCloseTo(30);
    expect(DeployManager._phantom.position.z).toBeCloseTo(39 - 2 * WORLD_SCALE);
  });

  it('the phantom follows the player frame by frame', async () => {
    await activateWaystone();
    standAt(21, 39);
    DeployManager.toggle();
    standAt(24, 36);
    DeployManager.update();
    expect(DeployManager._phantom.position.x).toBeCloseTo(24);
    expect(DeployManager._phantom.position.z).toBeCloseTo(36 - 2 * WORLD_SCALE);
  });

  it('second G deploys a pad at the phantom spot — NOT grid-quantized', async () => {
    await activateWaystone();
    standAt(31.4, 38.1); // off-center stance -> off-center pad
    DeployManager.toggle();
    DeployManager.toggle();
    expect(DeployManager.state).toBe('deployed');
    const [pad] = padsInActiveArea();
    expect(pad).toBeDefined();
    expect(pad.position.x).toBeCloseTo(31.4);
    expect(pad.position.z).toBeCloseTo(38.1 - 2 * WORLD_SCALE);
  });

  it('refuses to deploy onto a wall cell (stays aiming, phantom flags invalid)', async () => {
    await activateWaystone();
    standAt(21, 21); // two tiles north is the wall cell (21, 15)
    DeployManager.toggle();
    DeployManager.toggle();
    expect(DeployManager.state).toBe('aiming');
    expect(padsInActiveArea()).toHaveLength(0);
  });

  it('third G removes the deployed pad', async () => {
    await activateWaystone();
    standAt(30, 39);
    DeployManager.toggle();
    DeployManager.toggle();
    expect(padsInActiveArea()).toHaveLength(1);
    DeployManager.toggle();
    expect(DeployManager.state).toBe('idle');
    expect(padsInActiveArea()).toHaveLength(0);
  });
});

describe('Aiming answers the CAMERA, not just the body', () => {
  afterEach(() => {
    // The mouse state lives on the gameState singleton — restore it so the
    // far-left offset never leaks into later tests.
    const [cx, cy] = gameState.input.mouse.screenCenter;
    gameState.input.mouse.position = [cx, cy];
    gameState.input.mouse.centered = true;
  });

  it('the live mouse-look offset swings the phantom with the view', async () => {
    await activateWaystone();
    standAt(30, 39); // viewCenter yaw 0 (facing -z): straight-ahead spot is (30, 33)
    // Mouse pushed to the far left edge: effective yaw swings ~+90° -> aim -x
    gameState.input.mouseLookEnabled = true;
    const [, cy] = gameState.input.mouse.screenCenter;
    gameState.input.mouse.position = [0, cy];
    gameState.input.mouse.centered = false;

    DeployManager.toggle();

    // The phantom left the straight-ahead spot and swung toward -x
    expect(DeployManager._phantom.position.x).toBeLessThan(27);
    expect(DeployManager._phantom.position.z).toBeGreaterThan(36);
  });
});

describe('ONE aiming phantom for the session', () => {
  // A phantom built for each aim (and freed on deploy) cost the frame G was
  // pressed on a geometry upload and a shader-program derivation, every aim
  let scene;
  beforeEach(() => {
    scene = new THREE.Scene();
    DeployManager.initialize(scene);
  });

  /** Everything three draws the phantom with. */
  const lookOf = ({ material }) => ({
    color: material.color.getHex(),
    emissive: material.emissive.getHex(),
    emissiveIntensity: material.emissiveIntensity,
    opacity: material.opacity,
    transparent: material.transparent,
  });

  it('every aim shows the same phantom, never freed, hidden between aims', async () => {
    await activateWaystone();
    standAt(30, 39);
    DeployManager.toggle(); // aim
    expect(scene.children).toHaveLength(1); // the scene holds the phantom alone
    const [phantom] = scene.children;
    const { geometry, material } = phantom;
    const freed = [jest.spyOn(geometry, 'dispose'), jest.spyOn(material, 'dispose')];
    const { version } = material;

    DeployManager.toggle(); // deploy
    expect(phantom.visible).toBe(false); // not drawn while there is nothing to aim
    DeployManager.toggle(); // pick the gate back up
    standAt(24, 36);
    DeployManager.toggle(); // aim again, from elsewhere

    expect(scene.children).toEqual([phantom]);
    expect(phantom.geometry).toBe(geometry);
    expect(phantom.material).toBe(material);
    expect(material.version).toBe(version); // its program is derived once
    for (const spy of freed) expect(spy).not.toHaveBeenCalled();
    // Shown at once at the new spot, never where the last aim left it
    expect(phantom.visible).toBe(true);
    expect(phantom.position.x).toBeCloseTo(24);
    expect(phantom.position.z).toBeCloseTo(36 - 2 * WORLD_SCALE);

    DeployManager.reset(); // a world entry mid-aim
    expect(phantom.visible).toBe(false);
  });

  it('an aim after one that ended red looks exactly like a fresh aim', async () => {
    await activateWaystone();
    standAt(30, 39);
    DeployManager.toggle();
    const [phantom] = scene.children;
    const fresh = lookOf(phantom);
    expect(fresh).toMatchObject({
      color: Waystone.BASE_COLOR,
      emissive: Waystone.BASE_EMISSIVE,
      transparent: true,
    });
    standAt(21, 21); // two tiles north is the wall cell: red
    DeployManager.update();
    expect(lookOf(phantom)).not.toEqual(fresh);

    DeployManager.reset(); // the aim ends while red
    standAt(30, 39);
    DeployManager.toggle();

    expect(scene.children).toEqual([phantom]);
    expect(lookOf(phantom)).toEqual(fresh);
  });
});

describe('The G hint teaches the whole cycle ("g again to cancel")', () => {
  it('deploying does NOT retire the hint; removing the pad does', async () => {
    const HintMemory = (await import('core/HintMemory')).default;
    HintMemory.reset();
    await activateWaystone();
    standAt(30, 39);
    DeployManager.toggle();
    DeployManager.toggle(); // deployed
    expect(HintMemory.isRetired('deploy')).toBe(false);
    DeployManager.toggle(); // removed — full cycle performed
    expect(HintMemory.isRetired('deploy')).toBe(true);
  });

  it('walking through the pad also completes the lesson', async () => {
    const HintMemory = (await import('core/HintMemory')).default;
    HintMemory.reset();
    await activateWaystone();
    standAt(30, 39);
    DeployManager.toggle();
    DeployManager.toggle();
    const [pad] = padsInActiveArea();
    standAt(pad.position.x, pad.position.z);
    await ctx.tick(20);
    DeployManager.update();
    expect(HintMemory.isRetired('deploy')).toBe(true);
  });
});

describe('The deployed gate is SEE-THROUGH (a box of portal panels, like any open door)', () => {
  it('deploying stands a full window box on the gate — one panel per face, no waystone disc', async () => {
    await activateWaystone();
    standAt(30, 39); // facing -z: gate at (30, 33)
    DeployManager.toggle();
    DeployManager.toggle();
    DeployManager.update();

    const [pad] = padsInActiveArea();
    const surfaces = pad.mesh.children.filter((child) => child._isPortalSurface);
    expect(surfaces).toHaveLength(4);
    // Each panel shows from its first pass on — the gate's first frame
    // writes all four — and never before (an unwritten panel reads black)
    for (const surface of surfaces) expect(surface.visible).toBe(false);
    DeployManager.renderPortal(fakeRenderer(), { position: { x: 30, y: 1.8, z: 39 } });
    for (const surface of surfaces) expect(surface.visible).toBe(true);
    // The anchor sits at gate-box-center height, like a real gate mesh —
    // panels land exactly where a door's do (local y 0).
    expect(pad.mesh.position.y).toBeCloseTo(WORLD_SCALE / 2);
    expect(surfaces[0].position.y).toBeCloseTo(0);
    // No disc: the anchor holds the panels, nothing else
    expect(pad.mesh.children).toEqual(surfaces);
  });

  it('renders the destination through the face the eye is on (panels self-cull)', async () => {
    await activateWaystone();
    standAt(30, 39);
    DeployManager.toggle();
    DeployManager.toggle();
    DeployManager.update();

    const renderer = fakeRenderer();
    // The gate's first frame writes every panel (the far one by warm-up)
    DeployManager.renderPortal(renderer, { position: { x: 30, y: 1.8, z: 39 } });
    renderer.renderCalls.length = 0;
    // Approach panel + the two (near edge-on) side panels — exactly a
    // door's window box (windows sit on the FAR plane of the cell, so the
    // approach eye is on the outward side of the sides too)
    DeployManager.renderPortal(renderer, { position: { x: 30, y: 1.8, z: 39 } });
    expect(renderer.renderCalls).toHaveLength(3);
    // From a corner, the two faces toward the eye render
    renderer.renderCalls.length = 0;
    DeployManager.renderPortal(renderer, { position: { x: 36, y: 1.8, z: 39 } });
    expect(renderer.renderCalls).toHaveLength(2);
  });

  it('every pad pass draws in the pass context every scene draw shares', async () => {
    // three keys shader programs by clip-plane COUNT and output colour
    // space: a pad pass in any other context than the door passes and the
    // main view around it would re-derive the program of every material
    // they share, at every switch (core/passContext)
    await activateWaystone();
    standAt(30, 39);
    DeployManager.toggle();
    DeployManager.toggle();
    DeployManager.update();

    const passes = [];
    let target = null;
    const renderer = {
      clippingPlanes: [],
      setRenderTarget(next) {
        target = next;
      },
      render() {
        passes.push({ planes: this.clippingPlanes.length, target });
      },
      getDrawingBufferSize: (size) => size.set(800, 600),
    };
    DeployManager.renderPortal(renderer, { position: { x: 30, y: 1.8, z: 39 } }); // approach
    DeployManager.renderPortal(renderer, { position: { x: 36, y: 1.8, z: 39 } }); // corner

    expect(passes.length).toBeGreaterThan(0);
    for (const pass of passes) {
      expect(pass.planes).toBe(CLIP_PLANE_COUNT);
      // a scene target: renders in the canvas colour space (passContext)
      expect(pass.target.isXRRenderTarget).toBe(true);
      expect(pass.target.texture.colorSpace).toBe(THREE.SRGBColorSpace);
    }
    expect(renderer.clippingPlanes).toHaveLength(0); // restored after the passes
    expect(target).toBeNull();
  });

  it('shows the destination waystone AT the gate (mirror tile, shared material)', async () => {
    await activateWaystone();
    standAt(30, 39);
    DeployManager.toggle();
    DeployManager.toggle();
    DeployManager.update();

    // The panel aperture clips a floor tile in the arrival cell to a
    // crescent, so the tile is mirrored under the gate instead — cloned
    // from the real tile, material shared so the gold glow stays in sync.
    const mirror = gameState.activeArea.group.children.find((child) => child._isWaystoneMirror);
    expect(mirror).toBeDefined();
    expect(mirror.position.x).toBeCloseTo(30);
    expect(mirror.position.z).toBeCloseTo(39 - 2 * WORLD_SCALE);
    const [tile] = gameState.activeArea.entityManager.getByType('waystone');
    expect(mirror.material).toBe(tile.mesh.material);

    DeployManager.toggle(); // remove
    expect(gameState.activeArea.group.children.some((child) => child._isWaystoneMirror)).toBe(
      false
    );
  });

  it('pre-renders door views for the MAPPED eye so doors through the gate are see-through', async () => {
    await activateWaystone();
    standAt(30, 39); // gate at (30, 33); waystone at (21, 33): offset (-9, 0, 0)
    DeployManager.toggle();
    DeployManager.toggle();
    DeployManager.update();

    const spy = jest.spyOn(PortalManager, 'renderPortalsFor');
    DeployManager.renderPortal(fakeRenderer(), { position: { x: 30, y: 1.8, z: 39 } });
    expect(spy).toHaveBeenCalledTimes(1);
    const eye = spy.mock.calls[0][1];
    expect(eye.position.x).toBeCloseTo(30 - 9);
    expect(eye.position.y).toBeCloseTo(1.8);
    expect(eye.position.z).toBeCloseTo(39);
    spy.mockRestore();
  });

  it('removing the gate disposes the panels and releases the retained area', async () => {
    await activateWaystone();
    standAt(30, 39);
    DeployManager.toggle();
    DeployManager.toggle();
    DeployManager.update();
    expect(DeployManager._views).toHaveLength(4);
    expect(PortalManager._retained.has('deploy-basic')).toBe(true);

    DeployManager.toggle(); // remove
    expect(DeployManager._views).toHaveLength(0);
    expect(PortalManager._retained.has('deploy-basic')).toBe(false);
  });
});

describe('Walking through the deployed waystone gate', () => {
  it('teleports to the active waystone, keeps the creatures held, and consumes the pad', async () => {
    await activateWaystone();
    standAt(30, 39);
    DeployManager.toggle();
    DeployManager.toggle();
    const [pad] = padsInActiveArea();

    // Holding a creature, step onto the pad
    const held = take('C4');
    gameState.player.inventory = [held];
    standAt(pad.position.x, pad.position.z);
    await ctx.tick(20);
    DeployManager.update();

    // Arrived ON the active waystone; the landing fires it, which no longer
    // empties the tape (it holds creatures: interim ruling 2026-11-23)
    expect(gameState.player.position.x).toBeCloseTo(WAYSTONE.x);
    expect(gameState.player.position.z).toBeCloseTo(WAYSTONE.z);
    expect(gameState.player.inventory).toEqual([held]);
    // One use: the gate closed behind the player
    expect(padsInActiveArea()).toHaveLength(0);
    expect(DeployManager.state).toBe('idle');
  });

  it('world state does NOT reset on the jump (an open gate stays open)', async () => {
    await activateWaystone();
    // Fake a changed world: drop a pretend flag on the area
    const area = gameState.activeArea;
    area.entityManager.getByType('waystone')[0]._worldMark = 'kept';

    standAt(30, 39);
    DeployManager.toggle();
    DeployManager.toggle();
    const [pad] = padsInActiveArea();
    standAt(pad.position.x, pad.position.z);
    await ctx.tick(20);

    // Same live area object, same entities — nothing rebuilt
    expect(gameState.activeArea).toBe(area);
    expect(area.entityManager.getByType('waystone')[0]._worldMark).toBe('kept');
  });
});

describe('Cross-area travel (the waystone gate can go anywhere)', () => {
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

  afterEach(() => {
    delete global.fetch;
  });

  it('jumps into a LOADED neighbor area and lands on the target position', async () => {
    installFetchMock({ 'portal-b': portalB });
    ctx.loadPuzzle('portal-a');
    await jest.runAllTimersAsync(); // portal-b loads as a live neighbor

    const target = { puzzleId: 'portal-b', position: { x: 6, y: 0, z: 6 } };
    const ok = await PortalManager.teleportToWaystone(target);

    expect(ok).toBe(true);
    expect(gameState.activeArea.id).toBe('portal-b');
    expect(gameState.player.position.x).toBeCloseTo(6);
    expect(gameState.player.position.z).toBeCloseTo(6);
    expect(gameState.player.elevation).toBe(0);
  });

  it('fetches and builds an UNLOADED destination area on demand', async () => {
    installFetchMock({ 'portal-b': portalB, 'portal-a': portalA });
    ctx.loadPuzzle('portal-a');
    await jest.runAllTimersAsync();
    // Force the destination out of memory (as if pruned long ago)
    const areaB = PortalManager._areas.get('portal-b');
    PortalManager._areas.delete('portal-b');
    if (areaB) areaB.dispose();

    const ok = await PortalManager.teleportToWaystone({
      puzzleId: 'portal-b',
      position: { x: 6, y: 0, z: 6 },
    });

    expect(ok).toBe(true);
    expect(gameState.activeArea.id).toBe('portal-b');
  });

  it("a NEIGHBOR destination's own open doors render for the mapped eye, then hide", async () => {
    installFetchMock({ 'portal-b': portalB });
    ctx.loadPuzzle('portal-a');
    await jest.runAllTimersAsync();
    gameState.mode = 'PLAYING';
    DeployManager.reset();
    // Active waystone lives in the NEIGHBOR (portal-b); deploy in portal-a
    gameState.activeWaystone = { puzzleId: 'portal-b', position: { x: 6, y: 0, z: 6 } };
    gameState.player.position = { x: 6, y: 1.8, z: 6 };
    gameState.player.elevation = 0;
    gameState.camera.viewCenter = [0, 0];
    DeployManager.toggle();
    DeployManager.toggle();
    DeployManager.update();
    expect(DeployManager._views.length).toBe(4);

    // Open portal-b's door so it has something to be see-through about
    const areaB = PortalManager._areas.get('portal-b');
    const doorB = areaB.entityManager.getByType('gate').find((g) => g.gateId === 'south-door');
    doorB.open();

    const areaSpy = jest.spyOn(PortalManager, 'renderAreaPortals');
    const hideSpy = jest.spyOn(PortalManager, 'hideAreaPortals');
    const renderer = {
      clippingPlanes: [],
      setRenderTarget() {},
      render() {},
      getDrawingBufferSize: (size) => size.set(800, 600),
    };
    DeployManager.renderPortal(renderer, { position: { x: 6, y: 1.8, z: 6 } });

    expect(areaSpy).toHaveBeenCalledWith(areaB, renderer, expect.anything());
    expect(hideSpy).toHaveBeenCalledWith(areaB);
    // The neighbor door got real faces built for the mapped eye — every one
    // written at once (no look-ahead into another area's doors)
    const faces = PortalManager._views.get(doorB);
    expect(faces).toBeTruthy();
    expect([...faces.values()].every((view) => view.written)).toBe(true);
    areaSpy.mockRestore();
    hideSpy.mockRestore();
  });

  it("a door beside the waystone's cell never paints its panel over the gate's view", async () => {
    // The Star -> poc-clap (playtest, 2026-10-18): the waystone one cell in
    // front of an open door, the eye a step from the gate. The mapped eye
    // then stands in that door's cell, and the door's panel facing it sits
    // inside the gate pass's one-cell clip overreach, square between the
    // eye and the window — the gate showed that panel, solid black.
    installFetchMock({ 'portal-b': portalB });
    ctx.loadPuzzle('portal-a');
    await jest.runAllTimersAsync();
    gameState.mode = 'PLAYING';
    DeployManager.reset();
    // portal-b's door stands at (15, 0, 21); the waystone one cell north
    gameState.activeWaystone = { puzzleId: 'portal-b', position: { x: 15, y: 0, z: 18 } };
    standAt(15, 3, Math.PI); // facing +z: the gate lands at (15, 0, 9)
    DeployManager.toggle();
    DeployManager.toggle();
    DeployManager.update();
    const areaB = PortalManager._areas.get('portal-b');
    const doorB = areaB.entityManager.getByType('gate').find((g) => g.gateId === 'south-door');
    doorB.open();

    const gateCameras = DeployManager._views.map((view) => view._camera);
    // The door's panel on its north plane (for an eye south of it)
    let doorPanel = null;
    const shownInGatePass = [];
    const renderer = {
      clippingPlanes: [],
      setRenderTarget() {},
      render(scene, cam) {
        if (gateCameras.includes(cam) && doorPanel) shownInGatePass.push(doorPanel.visible);
      },
      getDrawingBufferSize: (size) => size.set(800, 600),
    };
    // South of the gate, a step off its face: mapped to (15, 1.8, 20.7).
    // The approach panel looks straight past the door's panel; the side
    // panels (their eye beside their doorway's column) through it too
    const eye = { position: { x: 15, y: 1.8, z: 11.7 } };
    DeployManager.renderPortal(renderer, eye);
    doorPanel = doorB.mesh.children.find(
      (child) => child._isPortalSurface && child.position.z < -1
    );
    expect(doorPanel).toBeTruthy();

    for (let i = 0; i < 3; i += 1) DeployManager.renderPortal(renderer, eye);

    expect(shownInGatePass.length).toBeGreaterThanOrEqual(9); // three panels, three frames
    expect(shownInGatePass.every((shown) => !shown)).toBe(true);
  });

  it("a door between the mapped eye and the gate never paints into the gate's side panels", async () => {
    // The Star -> poc-jam (playtest, 2026-10-18): the waystone two cells in
    // front of an open door, the eye a few steps south of the gate. The
    // mapped eye then stands in that door's cell, the door's panel facing it
    // half a unit ahead, and the gate's side walls looked through it: solid
    // black. A side panel's pass must clip along the approach, like a door's.
    installFetchMock({ 'portal-b': portalB });
    ctx.loadPuzzle('portal-a');
    await jest.runAllTimersAsync();
    gameState.mode = 'PLAYING';
    DeployManager.reset();
    // portal-b's door stands at (15, 0, 21); the waystone two cells north
    gameState.activeWaystone = { puzzleId: 'portal-b', position: { x: 15, y: 0, z: 15 } };
    standAt(15, 3, Math.PI); // facing +z: the gate lands at (15, 0, 9)
    DeployManager.toggle();
    DeployManager.toggle();
    DeployManager.update();
    const areaB = PortalManager._areas.get('portal-b');
    const doorB = areaB.entityManager.getByType('gate').find((g) => g.gateId === 'south-door');
    doorB.open();

    const sideCameras = DeployManager._views
      .filter((view) => view.facing === 'east' || view.facing === 'west')
      .map((view) => view._camera);
    // The door's panel on its north plane (for an eye south of it)
    let doorPanel = null;
    const drawnInSidePass = [];
    const renderer = {
      clippingPlanes: [],
      setRenderTarget() {},
      render(scene, cam) {
        if (!sideCameras.includes(cam) || !doorPanel) return;
        // Drawn unless hidden or wholly past one of the pass's clip planes
        // (the panel: a cell-sized square across x and y)
        const x = doorB.mesh.position.x + doorPanel.position.x;
        const y = doorB.mesh.position.y + doorPanel.position.y;
        const z = doorB.mesh.position.z + doorPanel.position.z;
        const half = WORLD_SCALE / 2;
        const clipped = this.clippingPlanes.some(({ normal, constant }) =>
          [x - half, x + half].every((cx) =>
            [y - half, y + half].every(
              (cy) => normal.x * cx + normal.y * cy + normal.z * z + constant < 0
            )
          )
        );
        drawnInSidePass.push(doorPanel.visible && !clipped);
      },
      getDrawingBufferSize: (size) => size.set(800, 600),
    };
    // Five units south of the gate: mapped to (15, 1.8, 20), inside the
    // door's cell, its panel at z = 19.5
    const eye = { position: { x: 15, y: 1.8, z: 14 } };
    DeployManager.renderPortal(renderer, eye);
    doorPanel = doorB.mesh.children.find(
      (child) => child._isPortalSurface && child.position.z < -1
    );
    expect(doorPanel).toBeTruthy();

    for (let i = 0; i < 3; i += 1) DeployManager.renderPortal(renderer, eye);

    expect(drawnInSidePass.length).toBeGreaterThanOrEqual(6); // two panels, three frames
    expect(drawnInSidePass.every((drawn) => !drawn)).toBe(true);
  });

  it('stays put when the destination cannot be loaded', async () => {
    installFetchMock({ 'portal-b': portalB });
    ctx.loadPuzzle('portal-a');
    await jest.runAllTimersAsync();
    const before = gameState.activeArea;

    const ok = await PortalManager.teleportToWaystone({
      puzzleId: 'no-such-puzzle',
      position: { x: 0, y: 0, z: 0 },
    });

    expect(ok).toBe(false);
    expect(gameState.activeArea).toBe(before);
  });
});

describe('A deployed gate is never pruned away (the world forgets nothing)', () => {
  const installFetchMock = (puzzles) => {
    global.fetch = jest.fn((url) => {
      const match = url.match(/^\/puzzles\/([a-zA-Z0-9_-]+)\.json$/);
      const data = match && puzzles[match[1]];
      return Promise.resolve(
        data
          ? { ok: true, json: () => Promise.resolve(JSON.parse(JSON.stringify(data))) }
          : { ok: false, statusText: 'Not Found' }
      );
    });
  };
  afterEach(() => {
    delete global.fetch;
  });

  /** A gate deployed here in deploy-basic, leading to a waystone in portal-b. */
  const deployTowardPortalB = () => {
    gameState.activeWaystone = { puzzleId: 'portal-b', position: { x: 6, y: 0, z: 6 } };
    standAt(30, 39);
    DeployManager.toggle(); // aim...
    DeployManager.toggle(); // ...and deploy
    DeployManager.update();
    expect(DeployManager.state).toBe('deployed');
  };

  it('its area stays live while it stands, however far the player goes', async () => {
    installFetchMock({ 'portal-a': portalA, 'portal-b': portalB });
    deployTowardPortalB();
    await jest.runAllTimersAsync();
    const [pad] = padsInActiveArea();

    // Away to portal-a: deploy-basic is linked to nothing there
    await PortalManager.teleportToWaystone({
      puzzleId: 'portal-a',
      position: { x: 6, y: 0, z: 6 },
    });
    await jest.runAllTimersAsync();
    DeployManager.update();

    const home = PortalManager.getArea('deploy-basic');
    expect(home).toBeTruthy();
    expect(home.entityManager.get(pad.id)).toBe(pad);
    expect(DeployManager.state).toBe('deployed');
  });

  it('picked back up, its area may prune again', async () => {
    installFetchMock({ 'portal-a': portalA, 'portal-b': portalB });
    deployTowardPortalB();
    await jest.runAllTimersAsync();
    await PortalManager.teleportToWaystone({
      puzzleId: 'portal-a',
      position: { x: 6, y: 0, z: 6 },
    });
    await jest.runAllTimersAsync();

    DeployManager._removePad();
    await PortalManager.teleportToWaystone({
      puzzleId: 'portal-b',
      position: { x: 6, y: 0, z: 6 },
    });

    expect(PortalManager.getArea('deploy-basic')).toBeFalsy();
  });
});

describe('The deployed gate draws only what can show, and never shows a blank panel', () => {
  // portal-a: its door (world 15, 0, 6) leads into portal-b. The gate goes
  // two tiles south of a player standing north of the door; the waystone it
  // leads to sits one cell east of the gate, so its mapped eye stays north
  // of the door like the player's (that door's south face is in nobody's
  // sightline: only the stale rotor ever refreshes it).
  const LOOK_NORTH = { x: 0, y: 0, z: 0, w: 1 }; // away from door and gate
  const LOOK_SOUTH = { x: 0, y: 1, z: 0, w: 0 };
  const posedEye = (quaternion) => ({
    position: { x: 15, y: 1.8, z: 3 },
    quaternion,
    fov: 75,
    aspect: 1,
  });

  function serveFixtures(puzzles) {
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

  /** Deploy south of the player in portal-a, leading to `target`. */
  async function deployInPortalA(target) {
    serveFixtures({ 'portal-b': portalB, 'deploy-basic': deployBasic });
    ctx.loadPuzzle('portal-a');
    gameState.mode = 'PLAYING';
    DeployManager.reset();
    gameState.activeWaystone = target;
    standAt(15, 3, Math.PI); // facing +z: the gate lands at (15, 0, 9)
    DeployManager.toggle();
    DeployManager.toggle();
    await jest.runAllTimersAsync(); // neighbors (and a retained destination) load
    DeployManager.update();
    const [door] = ctx.getGates();
    door.open();
    return door;
  }

  afterEach(() => {
    delete global.fetch;
  });

  it('a fresh gate never shows a panel before a pass has written it', async () => {
    await activateWaystone();
    standAt(30, 39);
    DeployManager.toggle();
    DeployManager.toggle();
    DeployManager.update();
    const [pad] = padsInActiveArea();
    const panels = pad.mesh.children.filter((child) => child._isPortalSurface);
    // Each pass draws the area the gate leads into — the one it stands in —
    // so every pad pass sees its sibling panels: none may show unwritten
    const written = new Set();
    let unwrittenSamples = 0;
    let target = null;
    const renderer = {
      clippingPlanes: [],
      setRenderTarget(next) {
        target = next;
      },
      render() {
        for (const panel of panels) {
          if (panel.visible && !written.has(panel.material.map)) unwrittenSamples += 1;
        }
        if (target) written.add(target.texture);
      },
      getDrawingBufferSize: (size) => size.set(800, 600),
    };

    DeployManager.renderPortal(renderer, { position: { x: 30, y: 1.8, z: 39 } });
    renderer.render(); // the main view

    expect(written.size).toBe(4);
    expect(unwrittenSamples).toBe(0);
  });

  it('with the gate out of view it costs no pass — not even the doors seen through it', async () => {
    await deployInPortalA({ puzzleId: 'portal-a', position: { x: 18, y: 0, z: 9 } });
    const renderer = fakeRenderer();
    DeployManager.renderPortal(renderer, posedEye(LOOK_NORTH)); // first frame: writes all four
    const doorPass = jest.spyOn(PortalManager, 'renderPortalsFor');
    renderer.renderCalls.length = 0;

    for (let i = 0; i < 10; i += 1) DeployManager.renderPortal(renderer, posedEye(LOOK_NORTH));

    expect(renderer.renderCalls).toHaveLength(0);
    expect(doorPass).not.toHaveBeenCalled();

    // Turning to it: the doors seen through it and its panels draw THIS frame
    DeployManager.renderPortal(renderer, posedEye(LOOK_SOUTH));
    expect(doorPass).toHaveBeenCalledTimes(1);
    expect(renderer.renderCalls.length).toBeGreaterThan(0);
    doorPass.mockRestore();
  });

  it('a face out of every sightline still refreshes once its window passes', async () => {
    await deployInPortalA({ puzzleId: 'portal-a', position: { x: 18, y: 0, z: 9 } });
    const renderer = fakeRenderer();
    const [pad] = padsInActiveArea();
    const panels = pad.mesh.children.filter((child) => child._isPortalSurface);
    DeployManager.renderPortal(renderer, posedEye(LOOK_NORTH));
    const shown = panels.map((panel) => panel.material.map);

    for (let i = 0; i < 20; i += 1) DeployManager.renderPortal(renderer, posedEye(LOOK_NORTH));

    // One face a frame, after 15 frames unseen: every face moved on
    expect(panels.filter((panel, i) => panel.material.map !== shown[i]).length).toBeGreaterThan(0);
  });

  it("freshness ages in REAL frames: the gate's mapped-eye door pass counts none", async () => {
    const door = await deployInPortalA({ puzzleId: 'portal-a', position: { x: 18, y: 0, z: 9 } });
    const renderer = fakeRenderer();
    const eye = { position: { x: 15, y: 1.8, z: 3 } };
    // The door's panel for a SOUTH approach sits on its north plane
    const farPanel = () =>
      door.mesh.children.find((child) => child._isPortalSurface && child.position.z < -1);

    const refreshedOn = [];
    let shown = null;
    for (let frame = 1; frame <= 48; frame += 1) {
      DeployManager.renderPortal(renderer, eye); // the gate's pre-pass, then...
      PortalManager.renderPortals(renderer, eye); // ...the player's door pass
      const { map } = farPanel().material;
      if (shown && map !== shown) refreshedOn.push(frame);
      shown = map;
    }

    // Nobody can see that face (no sight reaches it): the stale rotor
    // refreshes it on its first turn once it is STALE_MAX_FRAMES old —
    // counting one per frame, pre-pass or not
    const { STALE_MAX_FRAMES, STALE_UNSEEN_EVERY } = PortalManager.constructor;
    const turns = Math.ceil((STALE_MAX_FRAMES + 1) / STALE_UNSEEN_EVERY);
    expect(refreshedOn.length).toBeGreaterThan(1);
    for (let i = 1; i < refreshedOn.length; i += 1) {
      expect(refreshedOn[i] - refreshedOn[i - 1]).toBe(turns * STALE_UNSEEN_EVERY);
    }
  });

  it('a tile in ANOTHER area: its mirror keeps its own material and glows in step', async () => {
    // Different scenes light differently: one material drawn in both
    // re-derived its shader program at every switch (core/passContext)
    await deployInPortalA({ puzzleId: 'deploy-basic', position: WAYSTONE });
    const tile = PortalManager.getArea('deploy-basic').entityManager.getByType('waystone')[0];
    const mirror = gameState.activeArea.group.children.find((child) => child._isWaystoneMirror);
    expect(mirror).toBeDefined();
    expect(mirror.material).not.toBe(tile.mesh.material);

    await ctx.tick(400); // every area simulates: the tile breathes
    DeployManager.update();

    expect(mirror.material.emissiveIntensity).toBe(tile.mesh.material.emissiveIntensity);
    expect(mirror.material.color.getHex()).toBe(tile.mesh.material.color.getHex());
    expect(mirror.material.emissive.getHex()).toBe(tile.mesh.material.emissive.getHex());
    expect(mirror.material.emissive.getHex()).toBe(Waystone.ACTIVE_EMISSIVE); // the gold ring

    const freed = jest.spyOn(mirror.material, 'dispose');
    DeployManager.toggle(); // pick the gate back up
    expect(freed).toHaveBeenCalled();
  });
});
