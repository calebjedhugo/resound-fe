/**
 * DeployManager Tests — the deployable cleanser gate.
 *
 * G cycles idle -> aiming (phantom two tiles ahead, free placement) ->
 * deployed (a real walk-on pad) -> idle (picked back up). Walking onto the
 * pad teleports the player to the ACTIVE cleanser (the last one stepped
 * on), consumes the pad, and the arrival fires the cleanser as usual
 * (tape wipe). One way, one use; world state does not reset.
 */
import gameState from 'core/GameState';
import DeployManager from 'core/DeployManager';
import PortalManager from 'core/PortalManager';
import { WORLD_SCALE } from 'core/constants';
import portalA from '../__tests__/fixtures/puzzles/portal-a.json';
import portalB from '../__tests__/fixtures/puzzles/portal-b.json';

const take = (pitch) => ({ id: `take_${pitch}`, data: [{ pitch, length: '1/1' }] });

// deploy-basic geometry (world units): spawn (21, 39), cleanser (21, 33),
// wall cell (21, 15). Facing "north" (-z) is yaw 0.
const CLEANSER = { x: 7 * WORLD_SCALE, y: 0, z: 11 * WORLD_SCALE };

/** Stand the player somewhere, facing -z unless told otherwise. */
function standAt(x, z, yaw = 0) {
  gameState.player.position = { x, y: 1.8, z };
  gameState.player.elevation = 0;
  gameState.camera.viewCenter = [yaw, 0];
}

/** Walk onto the cleanser and let it fire (claims ACTIVE + wipes). */
async function activateCleanser() {
  standAt(CLEANSER.x, CLEANSER.z);
  await ctx.tick(20);
}

const padsInActiveArea = () => gameState.activeArea.entityManager.getByType('cleanser-gate');

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
  it('G is silent while no cleanser has ever been stepped on', () => {
    gameState.activeCleanser = null;
    standAt(21, 39);
    DeployManager.toggle();
    expect(DeployManager.state).toBe('idle');
  });

  it('G aims a phantom two tiles ahead of the player', async () => {
    await activateCleanser();
    standAt(30, 39); // facing -z, open floor two tiles ahead
    DeployManager.toggle();
    expect(DeployManager.state).toBe('aiming');
    expect(DeployManager._phantom.visible).toBe(true);
    expect(DeployManager._phantom.position.x).toBeCloseTo(30);
    expect(DeployManager._phantom.position.z).toBeCloseTo(39 - 2 * WORLD_SCALE);
  });

  it('the phantom follows the player frame by frame', async () => {
    await activateCleanser();
    standAt(21, 39);
    DeployManager.toggle();
    standAt(24, 36);
    DeployManager.update();
    expect(DeployManager._phantom.position.x).toBeCloseTo(24);
    expect(DeployManager._phantom.position.z).toBeCloseTo(36 - 2 * WORLD_SCALE);
  });

  it('second G deploys a pad at the phantom spot — NOT grid-quantized', async () => {
    await activateCleanser();
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
    await activateCleanser();
    standAt(21, 21); // two tiles north is the wall cell (21, 15)
    DeployManager.toggle();
    DeployManager.toggle();
    expect(DeployManager.state).toBe('aiming');
    expect(padsInActiveArea()).toHaveLength(0);
  });

  it('third G removes the deployed pad', async () => {
    await activateCleanser();
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
    await activateCleanser();
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

describe('The G hint teaches the whole cycle ("g again to cancel")', () => {
  it('deploying does NOT retire the hint; removing the pad does', async () => {
    const HintMemory = (await import('core/HintMemory')).default;
    HintMemory.reset();
    await activateCleanser();
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
    await activateCleanser();
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
  it('deploying stands a full window box on the gate — one panel per face, no cleanser disc', async () => {
    await activateCleanser();
    standAt(30, 39); // facing -z: gate at (30, 33)
    DeployManager.toggle();
    DeployManager.toggle();
    DeployManager.update();

    const [pad] = padsInActiveArea();
    const surfaces = pad.mesh.children.filter((child) => child._isPortalSurface);
    expect(surfaces).toHaveLength(4);
    for (const surface of surfaces) expect(surface.visible).toBe(true);
    // The anchor sits at gate-box-center height, like a real gate mesh —
    // panels land exactly where a door's do (local y 0).
    expect(pad.mesh.position.y).toBeCloseTo(WORLD_SCALE / 2);
    expect(surfaces[0].position.y).toBeCloseTo(0);
    // No disc: the anchor holds nothing but the panels
    expect(pad.mesh.children).toHaveLength(4);
  });

  it('renders the destination through the face the eye is on (panels self-cull)', async () => {
    await activateCleanser();
    standAt(30, 39);
    DeployManager.toggle();
    DeployManager.toggle();
    DeployManager.update();

    const renderer = {
      clippingPlanes: [],
      renderCalls: [],
      setRenderTarget() {},
      render(scene, cam) {
        this.renderCalls.push({ scene, cam });
      },
      getDrawingBufferSize: (size) => size.set(800, 600),
    };
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

  it('shows the destination cleanser AT the gate (mirror tile, shared material)', async () => {
    await activateCleanser();
    standAt(30, 39);
    DeployManager.toggle();
    DeployManager.toggle();
    DeployManager.update();

    // The panel aperture clips a floor tile in the arrival cell to a
    // crescent, so the tile is mirrored under the gate instead — cloned
    // from the real tile, material shared so the gold glow stays in sync.
    const mirror = gameState.activeArea.group.children.find((child) => child._isCleanserMirror);
    expect(mirror).toBeDefined();
    expect(mirror.position.x).toBeCloseTo(30);
    expect(mirror.position.z).toBeCloseTo(39 - 2 * WORLD_SCALE);
    const [tile] = gameState.activeArea.entityManager.getByType('cleanser');
    expect(mirror.material).toBe(tile.mesh.material);

    DeployManager.toggle(); // remove
    expect(gameState.activeArea.group.children.some((child) => child._isCleanserMirror)).toBe(
      false
    );
  });

  it('pre-renders door views for the MAPPED eye so doors through the gate are see-through', async () => {
    await activateCleanser();
    standAt(30, 39); // gate at (30, 33); cleanser at (21, 33): offset (-9, 0, 0)
    DeployManager.toggle();
    DeployManager.toggle();
    DeployManager.update();

    const spy = jest.spyOn(PortalManager, 'renderPortals');
    const renderer = {
      clippingPlanes: [],
      setRenderTarget() {},
      render() {},
      getDrawingBufferSize: (size) => size.set(800, 600),
    };
    DeployManager.renderPortal(renderer, { position: { x: 30, y: 1.8, z: 39 } });
    expect(spy).toHaveBeenCalledTimes(1);
    const eye = spy.mock.calls[0][1];
    expect(eye.position.x).toBeCloseTo(30 - 9);
    expect(eye.position.y).toBeCloseTo(1.8);
    expect(eye.position.z).toBeCloseTo(39);
    spy.mockRestore();
  });

  it('removing the gate disposes the panels and releases the retained area', async () => {
    await activateCleanser();
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

describe('Walking through the deployed cleanser gate', () => {
  it('teleports to the active cleanser, wipes the tape, and consumes the pad', async () => {
    await activateCleanser();
    standAt(30, 39);
    DeployManager.toggle();
    DeployManager.toggle();
    const [pad] = padsInActiveArea();

    // Record something en route, then step onto the pad
    gameState.player.inventory = [take('C4')];
    standAt(pad.position.x, pad.position.z);
    await ctx.tick(20);
    DeployManager.update();

    // Arrived ON the active cleanser; the landing fired it (wipe)
    expect(gameState.player.position.x).toBeCloseTo(CLEANSER.x);
    expect(gameState.player.position.z).toBeCloseTo(CLEANSER.z);
    expect(gameState.player.inventory).toEqual([null]);
    // One use: the gate closed behind the player
    expect(padsInActiveArea()).toHaveLength(0);
    expect(DeployManager.state).toBe('idle');
  });

  it('world state does NOT reset on the jump (an open gate stays open)', async () => {
    await activateCleanser();
    // Fake a changed world: drop a pretend flag on the area
    const area = gameState.activeArea;
    area.entityManager.getByType('cleanser')[0]._worldMark = 'kept';

    standAt(30, 39);
    DeployManager.toggle();
    DeployManager.toggle();
    const [pad] = padsInActiveArea();
    standAt(pad.position.x, pad.position.z);
    await ctx.tick(20);

    // Same live area object, same entities — nothing rebuilt
    expect(gameState.activeArea).toBe(area);
    expect(area.entityManager.getByType('cleanser')[0]._worldMark).toBe('kept');
  });
});

describe('Cross-area travel (the cleanser gate can go anywhere)', () => {
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
    const ok = await PortalManager.teleportToCleanser(target);

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

    const ok = await PortalManager.teleportToCleanser({
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
    // Active cleanser lives in the NEIGHBOR (portal-b); deploy in portal-a
    gameState.activeCleanser = { puzzleId: 'portal-b', position: { x: 6, y: 0, z: 6 } };
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
    // The neighbor door got real faces built for the mapped eye
    expect(PortalManager._views.get(doorB)).toBeTruthy();
    areaSpy.mockRestore();
    hideSpy.mockRestore();
  });

  it('stays put when the destination cannot be loaded', async () => {
    installFetchMock({ 'portal-b': portalB });
    ctx.loadPuzzle('portal-a');
    await jest.runAllTimersAsync();
    const before = gameState.activeArea;

    const ok = await PortalManager.teleportToCleanser({
      puzzleId: 'no-such-puzzle',
      position: { x: 0, y: 0, z: 0 },
    });

    expect(ok).toBe(false);
    expect(gameState.activeArea).toBe(before);
  });
});
