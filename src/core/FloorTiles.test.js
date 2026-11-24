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
import CollisionDetector from 'core/CollisionDetector';
import { lineOfSight } from 'core/poleReach';
import Floor, { buildTileGeometry } from 'entities/Floor';
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

describe('Storeys below the ground (subfloors)', () => {
  it('load as negative levels, with their ramps and walls', () => {
    ctx.loadPuzzle('floor-tiles-subfloor');
    const grid = gameState.elevationGrid;
    expect(grid.getLevelsAt(4, 0)).toEqual([-1]);
    expect(grid.getLevelsAt(5, 1)).toEqual([-1, 0]); // the pit, a tile of floor above it
    expect(grid.getRamp(3, 0).elevation).toBe(-1);
  });

  it('the player walks down the ramp into the subfloor, and its edge stops them', async () => {
    ctx.loadPuzzle('floor-tiles-subfloor');
    ctx.holdKey('d'); // east: across the room, down the ramp, along the pit
    await ctx.tick(6000);
    ctx.releaseKey('d');

    const pos = ctx.getPlayerPosition();
    expect(ctx.getPlayerElevation()).toBe(-1);
    expect(pos.y).toBeCloseTo(-ELEVATION_HEIGHT + 1.8);
    expect(pos.x).toBeGreaterThan(6 * WORLD_SCALE); // the pit's last cell...
    expect(pos.x).toBeLessThan(6.5 * WORLD_SCALE); // ...and no further
  });

  it('a subfloor entity is on its own (negative) layer for collision', () => {
    ctx.loadPuzzle('floor-tiles-subfloor');
    const wallCell = { x: 6 * WORLD_SCALE, y: -ELEVATION_HEIGHT, z: 1 * WORLD_SCALE };
    expect(CollisionDetector.getElevationForPosition(wallCell)).toBe(-1);
    expect(CollisionDetector.checkCollision(wallCell, 0.4)).toBe(true);
    // The same spot a storey up (over the pit) meets no wall
    expect(CollisionDetector.checkCollision({ ...wallCell, y: 0 }, 0.4)).toBe(false);

    const creature = gameState.activeArea.entities.find((e) => e.type === 'creature');
    expect(creature.elevation).toBe(-1);
  });

  it('the floor above a subfloor blocks the sight down into it; open air does not', () => {
    ctx.loadPuzzle('floor-tiles-subfloor');
    const area = gameState.activeArea;
    // Down through the floor tile over (5, 1)
    expect(lineOfSight(area, { x: 15, y: 1.8, z: 3 }, { x: 15, y: -2, z: 3 })).toBe(false);
    // Down over the open pit at (4, 0)
    expect(lineOfSight(area, { x: 12, y: 1.8, z: 0 }, { x: 12, y: -2, z: 0 })).toBe(true);
  });
});

describe('Floor edges are the same at every storey', () => {
  const trianglesOf = (geometry) => geometry.attributes.position.array.length / 9;
  // Every vertex of a side face (normal horizontal), as [y] per storey
  const sideHeights = (geometry) => {
    const pos = geometry.attributes.position.array;
    const nrm = geometry.attributes.normal.array;
    const edge = geometry.attributes.aEdge.array;
    const ys = [];
    for (let i = 0; i < edge.length; i += 1) {
      if (edge[i] < 0.5 && Math.abs(nrm[i * 3 + 1]) < 0.5) ys.push(pos[i * 3 + 1]);
    }
    return ys;
  };

  it('an exposed tile is the same slab with the same edge lines, below, on and above the ground', () => {
    const counts = [-2, -1, 0, 1, 3].map((y) => {
      const g = buildTileGeometry([{ x: 0, y, z: 0 }]);
      const ys = sideHeights(g);
      // Its sides run from its top down exactly the slab's thickness
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(Floor.SLAB_THICKNESS);
      expect(Math.max(...ys)).toBeCloseTo(y * ELEVATION_HEIGHT);
      return trianglesOf(g);
    });
    // top + bottom (4) + four sides (8) + four edge lines (16)
    expect(new Set(counts)).toEqual(new Set([28]));
  });

  it('a side beside a lower (or higher) floor is exposed: thickness and edge line, as at empty space', () => {
    const alone = trianglesOf(buildTileGeometry([{ x: 0, y: 1, z: 0 }]));
    const besideLower = buildTileGeometry([
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
    ]);
    // Two lone tiles' worth: the E1 tile's side toward the E0 one is exposed
    expect(trianglesOf(besideLower)).toBe(alone * 2);
    const besideSubfloor = buildTileGeometry([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: -1, z: 0 },
    ]);
    expect(trianglesOf(besideSubfloor)).toBe(alone * 2);
  });

  it('the game Floor draws exactly that geometry', () => {
    const tiles = cellsOfRects(floorTilesBasic.tiles);
    const floor = new Floor(0, [], { tiles });
    expect(floor.mesh.geometry.attributes.position.array).toEqual(
      buildTileGeometry(tiles).attributes.position.array
    );
  });
});
