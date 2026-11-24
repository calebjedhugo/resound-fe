/**
 * A level built from floor tiles (puzzles/schema.md "Floor tiles"): the
 * floor is exactly the tiles the designer built — no implicit ground, no
 * perimeter walls — and its edge stops a mover the way a storey's cliff
 * edge does. Played through the game's own loader and the test harness.
 */
import PuzzleLoader from 'core/PuzzleLoader';
import gameState from 'core/GameState';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import { packTiles, cellsOfRects } from 'core/floorTiles';
import floorTilesBasic from '../__tests__/fixtures/puzzles/floor-tiles-basic.json';

const walls = () => gameState.activeArea.entities.filter((e) => e.type === 'wall');

describe('A level built from floor tiles', () => {
  it('loads without a grid size: its floor is only its tiles, negative cells too', () => {
    ctx.loadPuzzle('floor-tiles-basic');
    const grid = gameState.elevationGrid;

    expect(grid.getLevelsAt(-2, -2)).toEqual([0]);
    expect(grid.getLevelsAt(2, 2)).toEqual([0]);
    expect(grid.getLevelsAt(3, 0)).toEqual([]); // past the built floor
    expect(grid.getLevelsAt(0, -4)).toEqual([1]); // a raised tile, nothing under it
    expect(grid.inBounds(-2, 0)).toBe(true);
    expect(grid.inBounds(-3, 0)).toBe(false);
  });

  it('has only the walls its designer placed (no perimeter)', () => {
    ctx.loadPuzzle('floor-tiles-basic');
    expect(walls()).toHaveLength(1);
    expect(walls()[0].position).toMatchObject({ x: -2 * WORLD_SCALE, z: -2 * WORLD_SCALE });
  });

  it('draws its floor as one mesh over the tiles', () => {
    ctx.loadPuzzle('floor-tiles-basic');
    const floor = gameState.activeArea.entities.find((e) => e.type === 'floor');
    expect(floor.mesh.visible).toBe(true);
    expect(floor.mesh.geometry.attributes.position.array.length).toBeGreaterThan(0);
  });

  it('starts the player on the spawn tile', () => {
    ctx.loadPuzzle('floor-tiles-basic');
    const pos = ctx.getPlayerPosition();
    expect(pos.x).toBeCloseTo(0);
    expect(pos.z).toBeCloseTo(0);
    expect(pos.y).toBeCloseTo(1.8);
  });

  it("stops the player at the built floor's edge, as at a cliff", async () => {
    ctx.loadPuzzle('floor-tiles-basic');
    ctx.setPlayerPosition({ x: 2 * WORLD_SCALE, z: 0 });
    ctx.holdKey('d'); // east (+x), toward the edge
    await ctx.tick(2000);
    ctx.releaseKey('d');

    const pos = ctx.getPlayerPosition();
    expect(pos.x).toBeGreaterThan(2 * WORLD_SCALE); // it walked to the edge...
    expect(pos.x).toBeLessThan(2.5 * WORLD_SCALE); // ...and no further
    // Never onto a cell with no floor
    const cell = gameState.elevationGrid.worldToGrid(pos.x, pos.z);
    expect(gameState.elevationGrid.hasLevel(cell.x, cell.z, 0)).toBe(true);
    expect(pos.y).toBeCloseTo(1.8);
  });

  it('walks up a ramp onto a raised tile that has nothing under it', async () => {
    ctx.loadPuzzle('floor-tiles-basic');
    ctx.setPlayerPosition({ x: 0, z: -2 * WORLD_SCALE });
    ctx.holdKey('w'); // north, up the ramp at (0, -3)
    await ctx.tick(2500);
    ctx.releaseKey('w');

    const pos = ctx.getPlayerPosition();
    expect(pos.z).toBeLessThan(-3.5 * WORLD_SCALE); // on the raised tiles
    expect(pos.y).toBeCloseTo(ELEVATION_HEIGHT + 1.8);
    expect(pos.z).toBeGreaterThan(-5.5 * WORLD_SCALE); // and no further
  });

  it('rejects malformed tiles; an older file still needs its gridSize', () => {
    const base = { id: 't', name: 'T', difficulty: 1, playerStart: { x: 0, y: 0, z: 0 } };
    expect(() =>
      PuzzleLoader.validate({ ...base, entities: [], tiles: [{ elevation: 0, x1: 'a' }] })
    ).toThrow(/tiles/);
    expect(() => PuzzleLoader.validate({ ...base, entities: [] })).toThrow(/gridSize/);
    expect(() => PuzzleLoader.validate({ ...base, entities: [], tiles: [] })).not.toThrow();
  });

  it('an empty tile list loads (a new room with nothing built yet)', () => {
    const area = PuzzleLoader.buildArea(
      PuzzleLoader.validate({
        id: 'empty',
        name: 'Empty',
        difficulty: 1,
        playerStart: { x: 0, y: 0, z: 0 },
        tiles: [],
        entities: [],
      })
    );
    expect(area.elevationGrid.getLevelsAt(0, 0)).toEqual([]);
    expect(area.entities.filter((e) => e.type === 'wall')).toHaveLength(0);
    area.dispose();
  });
});

describe('Floor tiles on disk', () => {
  it('pack into rectangles per storey and unpack to the same cells', () => {
    const cells = cellsOfRects(floorTilesBasic.tiles);
    expect(cells).toHaveLength(25 + 2);
    expect(packTiles(cells)).toEqual(floorTilesBasic.tiles);
  });

  it('pack an L-shaped room into two rectangles', () => {
    const cells = cellsOfRects([
      { elevation: 0, x1: 0, z1: 0, x2: 3, z2: 0 },
      { elevation: 0, x1: 0, z1: 1, x2: 0, z2: 2 },
    ]);
    expect(packTiles(cells)).toEqual([
      { elevation: 0, x1: 0, z1: 0, x2: 3, z2: 0 },
      { elevation: 0, x1: 0, z1: 1, x2: 0, z2: 2 },
    ]);
  });
});
