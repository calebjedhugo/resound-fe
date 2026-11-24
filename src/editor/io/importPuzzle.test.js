/**
 * importPuzzle Tests
 *
 * Tests for importing puzzle JSON into an EditorPuzzleModel with validation.
 */
import { importPuzzle } from 'editor/io/importPuzzle';

// Embedded fixture: test-001.json
const TEST_001_JSON = {
  id: 'test-001',
  name: 'First Steps',
  difficulty: 1,
  gridSize: 15,
  tempo: 120,
  clapDisplacement: 0.25,
  playerStart: { x: 10, y: 0, z: 13 },
  entities: [
    {
      type: 'creature',
      position: { x: 8, y: 0, z: 8 },
      data: {
        song: [{ pitch: 'C4', length: '1/1' }],
        interval: 8,
        audibleRange: 15,
      },
    },
    {
      type: 'fountain',
      position: { x: 8, y: 0, z: 2 },
      song: [{ pitch: 'C4', length: '1/1' }],
    },
  ],
};

// Embedded fixture: elevation-demo.json
const ELEVATION_DEMO_JSON = {
  id: 'elevation-demo',
  name: 'Elevated Harmony',
  difficulty: 2,
  gridSize: 15,
  tempo: 120,
  playerStart: { x: 7, y: 0, z: 13 },
  floors: [{ elevation: 1, x1: 3, z1: 3, x2: 11, z2: 7 }],
  entities: [
    {
      type: 'creature',
      position: { x: 7, y: 1, z: 5 },
      data: {
        song: [{ pitch: 'C4', length: '1/1' }],
        interval: 8,
        audibleRange: 15,
      },
    },
    {
      type: 'ramp',
      position: { x: 7, y: 0, z: 8 },
      direction: 'north',
    },
    { type: 'wall', position: { x: 2, y: 1, z: 3 } },
    { type: 'wall', position: { x: 3, y: 1, z: 3 } },
    { type: 'wall', position: { x: 4, y: 1, z: 3 } },
    { type: 'wall', position: { x: 5, y: 1, z: 3 } },
    {
      type: 'gate',
      position: { x: 6, y: 1, z: 3 },
      song: [{ pitch: 'C4', length: '1/1' }],
    },
    {
      type: 'fountain',
      position: { x: 7, y: 1, z: 4 },
      song: [{ pitch: 'C4', length: '1/1' }],
    },
  ],
};

describe('importPuzzle', () => {
  it('imports test-001.json producing a valid model with correct entity count and metadata', () => {
    const { model, errors, warnings } = importPuzzle(TEST_001_JSON);

    const meta = model.getMetadata();
    expect(meta.id).toBe('test-001');
    expect(meta.name).toBe('First Steps');
    expect(meta.difficulty).toBe(1);
    expect(meta.tempo).toBe(120);

    expect(model.getPlayerSpawn()).toEqual({ x: 10, y: 0, z: 13 });
    // Its 2 entities, then its perimeter walls (an older file: 4 x 15 + 4)
    expect(model.getEntities().length).toBe(2 + 64);

    expect(Array.isArray(errors)).toBe(true);
    expect(Array.isArray(warnings)).toBe(true);
  });

  it('imports elevation-demo.json producing correct model with floors, entities, and metadata', () => {
    const { model, errors, warnings } = importPuzzle(ELEVATION_DEMO_JSON);

    const meta = model.getMetadata();
    expect(meta.id).toBe('elevation-demo');
    expect(meta.name).toBe('Elevated Harmony');
    expect(meta.difficulty).toBe(2);

    expect(model.getPlayerSpawn()).toEqual({ x: 7, y: 0, z: 13 });

    // The raised region's cells are tiles at E1
    expect(model.getTiles().filter((t) => t.y === 1)).toHaveLength(9 * 5);

    const entities = model.getEntities().filter((e) => !(e.type === 'wall' && e.y === 0));
    expect(entities.length).toBe(8);

    // Only its one wall off the raised region (2, 1, 3) stands on no floor
    expect(errors.filter((e) => /no floor/.test(e))).toEqual([
      expect.stringMatching(/wall .* at \(2, 3\) E1/),
    ]);
    expect(Array.isArray(errors)).toBe(true);
    expect(Array.isArray(warnings)).toBe(true);
  });

  it('imported model keeps every entity of the source file (plus an older file perimeter walls)', () => {
    const { model: model1 } = importPuzzle(TEST_001_JSON);
    expect(model1.getEntities().length).toBe(TEST_001_JSON.entities.length + 64);

    const tileBuilt = {
      ...TEST_001_JSON,
      gridSize: undefined,
      tiles: [{ elevation: 0, x1: 0, z1: 0, x2: 14, z2: 14 }],
    };
    const { model: model2 } = importPuzzle(tileBuilt);
    expect(model2.getEntities().length).toBe(TEST_001_JSON.entities.length);
    expect(model2.getTiles()).toHaveLength(15 * 15);
  });
});
