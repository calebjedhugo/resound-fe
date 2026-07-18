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
