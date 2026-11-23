import Waystone from 'entities/Waystone';
import gameState from 'core/GameState';
import PortalManager from 'core/PortalManager';
import PuzzleLoader from 'core/PuzzleLoader';
import { WORLD_SCALE } from 'core/constants';

// The Waystone: walking onto it makes it the ACTIVE waystone (the
// waystone gate's destination). As the cleanser it emptied the tape
// (2026-07-12); since 2026-11-23 it leaves the creatures held alone.
// Edge-triggered on entry; a tile in a neighbor area (simulating behind a
// doorway) never fires on the active player.
const ON_TILE = { x: 30, y: 1.8, z: 30 };
const OFF_TILE = { x: 0, y: 1.8, z: 0 };

const held = (pitch) => ({ id: `held_${pitch}`, spec: { song: [{ pitch, length: '1/1' }] } });

beforeEach(() => {
  gameState.reset();
});

describe('Waystone', () => {
  it('leaves the creatures the player holds alone when stepped on', () => {
    const tile = new Waystone({ x: 30, y: 0, z: 30 });
    const tape = [held('C4'), held('E4')];
    gameState.player.inventory = [...tape];
    gameState.player.activeSlot = 1;
    gameState.player.position = { ...OFF_TILE };
    gameState.player.elevation = 0;
    tile.update(0.016);

    gameState.player.position = { ...ON_TILE };
    tile.update(0.016); // stepped on
    gameState.player.position = { ...OFF_TILE };
    tile.update(0.016);
    gameState.player.position = { ...ON_TILE };
    tile.update(0.016); // and again

    expect(gameState.player.inventory).toEqual(tape);
    expect(gameState.player.activeSlot).toBe(1);
  });

  it('ignores the active player when the tile lives in a neighbor area', () => {
    const tile = new Waystone({ x: 30, y: 0, z: 30 });
    tile.area = { id: 'neighbor' };
    gameState.activeArea = { id: 'here' };
    gameState.player.inventory = [held('C4')];
    gameState.player.position = { ...ON_TILE };
    gameState.player.elevation = 0;

    tile.update(0.016);
    expect(gameState.player.inventory).toHaveLength(1);
  });

  it('stepping on a tile makes it the ACTIVE waystone and turns it gold', () => {
    const tile = new Waystone({ x: 30, y: 0, z: 30 });
    tile.area = { id: 'here' };
    gameState.activeArea = tile.area;
    gameState.player.position = { ...OFF_TILE };
    gameState.player.elevation = 0;

    tile.update(0.016);
    expect(gameState.activeWaystone).toBeNull();
    expect(tile.mesh.material.color.getHex()).toBe(Waystone.BASE_COLOR);

    gameState.player.position = { ...ON_TILE };
    tile.update(0.016);
    expect(gameState.activeWaystone).toEqual({
      puzzleId: 'here',
      position: { x: 30, y: 0, z: 30 },
    });
    expect(tile.mesh.material.color.getHex()).toBe(Waystone.ACTIVE_COLOR);
  });

  it('claiming a new active waystone reverts the previous one to cyan', () => {
    const area = { id: 'here' };
    const first = new Waystone({ x: 30, y: 0, z: 30 });
    const second = new Waystone({ x: 0, y: 0, z: 0 });
    first.area = area;
    second.area = area;
    gameState.activeArea = area;
    gameState.player.elevation = 0;

    gameState.player.position = { ...ON_TILE };
    first.update(0.016);
    second.update(0.016);
    expect(first.mesh.material.color.getHex()).toBe(Waystone.ACTIVE_COLOR);

    gameState.player.position = { ...OFF_TILE }; // OFF_TILE sits on `second`
    first.update(0.016);
    second.update(0.016); // second claims the active slot...
    first.update(0.016); // ...and first repaints on its next frame
    expect(second.mesh.material.color.getHex()).toBe(Waystone.ACTIVE_COLOR);
    expect(first.mesh.material.color.getHex()).toBe(Waystone.BASE_COLOR);
  });

  it('a rebuilt tile at the active position picks its gold back up (positional match)', () => {
    const area = { id: 'here' };
    gameState.activeArea = area;
    gameState.activeWaystone = { puzzleId: 'here', position: { x: 30, y: 0, z: 30 } };
    gameState.player.position = { ...OFF_TILE };
    gameState.player.elevation = 0;

    const rebuilt = new Waystone({ x: 30, y: 0, z: 30 });
    rebuilt.area = area;
    rebuilt.update(0.016);
    expect(rebuilt.mesh.material.color.getHex()).toBe(Waystone.ACTIVE_COLOR);
  });

  it('spikes the glow on a fresh step, then settles back toward the resting pulse', () => {
    const tile = new Waystone({ x: 30, y: 0, z: 30 });
    gameState.player.position = { ...ON_TILE };
    gameState.player.elevation = 0;

    tile.update(0.016); // enter — flash fires
    const flashed = tile.mesh.material.emissiveIntensity;
    expect(flashed).toBeGreaterThan(Waystone.PULSE_MAX);

    // Many frames later the flash has decayed below the flash peak
    for (let i = 0; i < 120; i += 1) tile.update(0.016);
    expect(tile.mesh.material.emissiveIntensity).toBeLessThan(flashed);
  });

  it("loads from a puzzle saved under its old name ('cleanser') and is claimed as a waystone", async () => {
    const puzzle = PuzzleLoader.validate({
      id: 'old-cleanser',
      name: 'Old Cleanser',
      difficulty: 1,
      gridSize: 8,
      playerStart: { x: 1, y: 0, z: 1 },
      entities: [{ type: 'cleanser', position: { x: 4, y: 0, z: 4 } }],
    });
    PortalManager.enterWorld(puzzle);
    const [tile] = gameState.activeArea.entityManager.getByType('waystone');
    expect(tile).toBeInstanceOf(Waystone);

    ctx.setPlayerPosition({ x: 4 * WORLD_SCALE, y: 1.8, z: 4 * WORLD_SCALE });
    await ctx.tick(16);
    expect(gameState.activeWaystone).toEqual({
      puzzleId: 'old-cleanser',
      position: { x: 4 * WORLD_SCALE, y: 0, z: 4 * WORLD_SCALE },
    });
  });
});
