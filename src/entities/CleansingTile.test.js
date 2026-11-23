import CleansingTile from 'entities/CleansingTile';
import gameState from 'core/GameState';

// The CleansingTile: walking onto it makes it the ACTIVE cleanser (the
// cleanser gate's destination). It used to empty the tape (2026-07-12);
// since the tape holds creatures (2026-11-23) it leaves the inventory alone
// (interim ruling). Edge-triggered on entry; a tile in a neighbor area
// (simulating behind a doorway) never fires on the active player.
const ON_TILE = { x: 30, y: 1.8, z: 30 };
const OFF_TILE = { x: 0, y: 1.8, z: 0 };

const held = (pitch) => ({ id: `held_${pitch}`, spec: { song: [{ pitch, length: '1/1' }] } });

beforeEach(() => {
  gameState.reset();
});

describe('CleansingTile', () => {
  it('leaves the creatures the player holds alone when stepped on', () => {
    const tile = new CleansingTile({ x: 30, y: 0, z: 30 });
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
    const tile = new CleansingTile({ x: 30, y: 0, z: 30 });
    tile.area = { id: 'neighbor' };
    gameState.activeArea = { id: 'here' };
    gameState.player.inventory = [held('C4')];
    gameState.player.position = { ...ON_TILE };
    gameState.player.elevation = 0;

    tile.update(0.016);
    expect(gameState.player.inventory).toHaveLength(1);
  });

  it('stepping on a tile makes it the ACTIVE cleanser and turns it gold', () => {
    const tile = new CleansingTile({ x: 30, y: 0, z: 30 });
    tile.area = { id: 'here' };
    gameState.activeArea = tile.area;
    gameState.player.position = { ...OFF_TILE };
    gameState.player.elevation = 0;

    tile.update(0.016);
    expect(gameState.activeCleanser).toBeNull();
    expect(tile.mesh.material.color.getHex()).toBe(CleansingTile.BASE_COLOR);

    gameState.player.position = { ...ON_TILE };
    tile.update(0.016);
    expect(gameState.activeCleanser).toEqual({
      puzzleId: 'here',
      position: { x: 30, y: 0, z: 30 },
    });
    expect(tile.mesh.material.color.getHex()).toBe(CleansingTile.ACTIVE_COLOR);
  });

  it('claiming a new active cleanser reverts the previous one to cyan', () => {
    const area = { id: 'here' };
    const first = new CleansingTile({ x: 30, y: 0, z: 30 });
    const second = new CleansingTile({ x: 0, y: 0, z: 0 });
    first.area = area;
    second.area = area;
    gameState.activeArea = area;
    gameState.player.elevation = 0;

    gameState.player.position = { ...ON_TILE };
    first.update(0.016);
    second.update(0.016);
    expect(first.mesh.material.color.getHex()).toBe(CleansingTile.ACTIVE_COLOR);

    gameState.player.position = { ...OFF_TILE }; // OFF_TILE sits on `second`
    first.update(0.016);
    second.update(0.016); // second claims the active slot...
    first.update(0.016); // ...and first repaints on its next frame
    expect(second.mesh.material.color.getHex()).toBe(CleansingTile.ACTIVE_COLOR);
    expect(first.mesh.material.color.getHex()).toBe(CleansingTile.BASE_COLOR);
  });

  it('a rebuilt tile at the active position picks its gold back up (positional match)', () => {
    const area = { id: 'here' };
    gameState.activeArea = area;
    gameState.activeCleanser = { puzzleId: 'here', position: { x: 30, y: 0, z: 30 } };
    gameState.player.position = { ...OFF_TILE };
    gameState.player.elevation = 0;

    const rebuilt = new CleansingTile({ x: 30, y: 0, z: 30 });
    rebuilt.area = area;
    rebuilt.update(0.016);
    expect(rebuilt.mesh.material.color.getHex()).toBe(CleansingTile.ACTIVE_COLOR);
  });

  it('spikes the glow on a fresh step, then settles back toward the resting pulse', () => {
    const tile = new CleansingTile({ x: 30, y: 0, z: 30 });
    gameState.player.position = { ...ON_TILE };
    gameState.player.elevation = 0;

    tile.update(0.016); // enter — flash fires
    const flashed = tile.mesh.material.emissiveIntensity;
    expect(flashed).toBeGreaterThan(CleansingTile.PULSE_MAX);

    // Many frames later the flash has decayed below the flash peak
    for (let i = 0; i < 120; i += 1) tile.update(0.016);
    expect(tile.mesh.material.emissiveIntensity).toBeLessThan(flashed);
  });
});
