/**
 * Serialization Tests
 *
 * Tests for converting between EditorPuzzleModel and puzzle JSON format.
 * Covers round-trip fidelity, entity-specific formats, and edge cases.
 */
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import { serializePuzzle, deserializePuzzle } from 'editor/model/serialization';

// Test fixture: elevation-demo.json content
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

// Test fixture: pre-elevation puzzle (no floors, all y=0)
const PRE_ELEVATION_JSON = {
  id: 'pre-elevation',
  name: 'Simple Song',
  difficulty: 1,
  gridSize: 15,
  tempo: 120,
  playerStart: { x: 7, y: 0, z: 13 },
  entities: [
    {
      type: 'creature',
      position: { x: 5, y: 0, z: 5 },
      data: {
        song: [{ pitch: 'E4', length: '1/4' }],
        interval: 4,
        audibleRange: 10,
      },
    },
    {
      type: 'gate',
      position: { x: 7, y: 0, z: 3 },
      song: [{ pitch: 'E4', length: '1/4' }],
    },
  ],
};

describe('Puzzle Serialization', () => {
  describe('round-trip', () => {
    it('serialize then deserialize produces equivalent model state', () => {
      const original = new EditorPuzzleModel();
      original.setMetadata({
        id: 'round-trip-test',
        name: 'Round Trip',
        difficulty: 2,
        tempo: 100,
      });
      original.setPlayerSpawn(5, 1, 10);
      original.addTiles([
        { x: 0, y: 1, z: 0 },
        { x: 1, y: 1, z: 0 },
        { x: -4, y: 0, z: -2 },
      ]);
      original.addEntity('creature', 3, 1, 5, {
        song: [{ pitch: 'C4', length: '1/4' }],
        interval: 4,
        audibleRange: 10,
      });
      original.addEntity('gate', 7, 0, 3, {
        song: [{ pitch: 'D4', length: '1/2' }],
        gateId: 'gate-1',
        facing: 'north',
      });
      original.addEntity('fountain', 8, 0, 4, {
        song: [{ pitch: 'E4', length: '1/1' }],
      });
      original.addEntity('wall', 2, 1, 6, {});
      original.addEntity('ramp', 5, 0, 8, { direction: 'north' });

      const json = serializePuzzle(original);
      const restored = deserializePuzzle(json);

      expect(restored.getMetadata()).toEqual(original.getMetadata());
      expect(restored.getPlayerSpawn()).toEqual(original.getPlayerSpawn());
      expect(restored.getTiles()).toEqual(original.getTiles());

      const originalEntities = original.getEntities();
      const restoredEntities = restored.getEntities();
      expect(restoredEntities.length).toBe(originalEntities.length);

      // Compare entities ignoring IDs (deserialized model assigns new IDs)
      for (let i = 0; i < originalEntities.length; i++) {
        expect(restoredEntities[i].type).toBe(originalEntities[i].type);
        expect(restoredEntities[i].x).toBe(originalEntities[i].x);
        expect(restoredEntities[i].y).toBe(originalEntities[i].y);
        expect(restoredEntities[i].z).toBe(originalEntities[i].z);
        expect(restoredEntities[i].data).toEqual(originalEntities[i].data);
      }
    });
  });

  describe('serialization', () => {
    it('outputs correct top-level structure', () => {
      const model = new EditorPuzzleModel();
      model.setMetadata({
        id: 'test-structure',
        name: 'Structure Test',
        difficulty: 3,
        tempo: 140,
      });
      model.setPlayerSpawn(7, 0, 13);
      // A 3x2 room at E0 and one raised tile: packed into rectangles
      model.addTiles([
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 1, y: 0, z: 1 },
        { x: 2, y: 0, z: 1 },
        { x: 5, y: 1, z: -3 },
      ]);
      model.addEntity('creature', 5, 0, 5, {
        song: [{ pitch: 'C4', length: '1/4' }],
        interval: 4,
        audibleRange: 10,
      });

      const json = serializePuzzle(model);

      expect(json.id).toBe('test-structure');
      expect(json.name).toBe('Structure Test');
      expect(json.difficulty).toBe(3);
      expect(json).not.toHaveProperty('gridSize');
      expect(json).not.toHaveProperty('floors');
      expect(json.tempo).toBe(140);
      expect(json.playerStart).toEqual({ x: 7, y: 0, z: 13 });
      expect(json.tiles).toEqual([
        { elevation: 0, x1: 0, z1: 0, x2: 2, z2: 1 },
        { elevation: 1, x1: 5, z1: -3, x2: 5, z2: -3 },
      ]);
      expect(Array.isArray(json.entities)).toBe(true);
      expect(json.entities.length).toBe(1);
    });

    it('serializes creature with song in data.song and interval/audibleRange in data', () => {
      const model = new EditorPuzzleModel();
      model.setMetadata({ id: 'creature-test' });
      model.setPlayerSpawn(0, 0, 0);
      model.addEntity('creature', 3, 1, 5, {
        song: [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
        ],
        interval: 8,
        audibleRange: 15,
      });

      const json = serializePuzzle(model);
      const creature = json.entities[0];

      expect(creature.type).toBe('creature');
      expect(creature.position).toEqual({ x: 3, y: 1, z: 5 });
      expect(creature.data).toBeDefined();
      expect(creature.data.song).toEqual([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ]);
      expect(creature.data.interval).toBe(8);
      expect(creature.data.audibleRange).toBe(15);
      // Should NOT have song at entity root
      expect(creature.song).toBeUndefined();
    });

    it('serializes gate with song at entity root, not in data', () => {
      const model = new EditorPuzzleModel();
      model.setMetadata({ id: 'gate-test' });
      model.setPlayerSpawn(0, 0, 0);
      model.addEntity('gate', 6, 1, 3, {
        song: [{ pitch: 'C4', length: '1/1' }],
      });

      const json = serializePuzzle(model);
      const gate = json.entities[0];

      expect(gate.type).toBe('gate');
      expect(gate.position).toEqual({ x: 6, y: 1, z: 3 });
      expect(gate.song).toEqual([{ pitch: 'C4', length: '1/1' }]);
      // Should NOT have data field
      expect(gate.data).toBeUndefined();
    });

    it('serializes fountain with song at entity root, not in data', () => {
      const model = new EditorPuzzleModel();
      model.setMetadata({ id: 'fountain-test' });
      model.setPlayerSpawn(0, 0, 0);
      model.addEntity('fountain', 7, 1, 4, {
        song: [{ pitch: 'E4', length: '1/2' }],
      });

      const json = serializePuzzle(model);
      const fountain = json.entities[0];

      expect(fountain.type).toBe('fountain');
      expect(fountain.position).toEqual({ x: 7, y: 1, z: 4 });
      expect(fountain.song).toEqual([{ pitch: 'E4', length: '1/2' }]);
      // Should NOT have data field
      expect(fountain.data).toBeUndefined();
    });

    it('serializes ramp with direction at entity root', () => {
      const model = new EditorPuzzleModel();
      model.setMetadata({ id: 'ramp-test' });
      model.setPlayerSpawn(0, 0, 0);
      model.addEntity('ramp', 7, 0, 8, { direction: 'north' });

      const json = serializePuzzle(model);
      const ramp = json.entities[0];

      expect(ramp.type).toBe('ramp');
      expect(ramp.position).toEqual({ x: 7, y: 0, z: 8 });
      expect(ramp.direction).toBe('north');
      // Should NOT have data field
      expect(ramp.data).toBeUndefined();
    });

    it('serializes wall with position only, no extra fields', () => {
      const model = new EditorPuzzleModel();
      model.setMetadata({ id: 'wall-test' });
      model.setPlayerSpawn(0, 0, 0);
      model.addEntity('wall', 2, 1, 3, {});

      const json = serializePuzzle(model);
      const wall = json.entities[0];

      expect(wall.type).toBe('wall');
      expect(wall.position).toEqual({ x: 2, y: 1, z: 3 });
      expect(wall.data).toBeUndefined();
      expect(wall.song).toBeUndefined();
      expect(wall.direction).toBeUndefined();
    });

    it('serializes waystone with position only, no extra fields', () => {
      const model = new EditorPuzzleModel();
      model.setMetadata({ id: 'waystone-test' });
      model.setPlayerSpawn(0, 0, 0);
      model.addEntity('waystone', 6, 0, 12, {});

      const json = serializePuzzle(model);
      const waystone = json.entities[0];

      expect(waystone.type).toBe('waystone');
      expect(waystone.position).toEqual({ x: 6, y: 0, z: 12 });
      expect(waystone.data).toBeUndefined();
      expect(waystone.song).toBeUndefined();
      expect(waystone.direction).toBeUndefined();
    });

    it('loads an old puzzle with clapDisplacement (puzzle and creature) and saves it without', () => {
      const model = deserializePuzzle({
        id: 'old-clap',
        name: 'Old Clap',
        difficulty: 1,
        gridSize: 15,
        tempo: 120,
        clapDisplacement: 0.25,
        playerStart: { x: 0, y: 0, z: 0 },
        entities: [
          {
            type: 'creature',
            position: { x: 3, y: 0, z: 5 },
            data: {
              song: [{ pitch: 'C4', length: '1/4' }],
              interval: 4,
              audibleRange: 10,
              clapDisplacement: 0.125,
            },
          },
        ],
      });

      const json = serializePuzzle(model);

      expect(Object.prototype.hasOwnProperty.call(json, 'clapDisplacement')).toBe(false);
      expect(json.entities[0].data).toEqual({
        song: [{ pitch: 'C4', length: '1/4' }],
        interval: 4,
        audibleRange: 10,
      });
    });

    it('serializes keySignature and timeSignature', () => {
      const model = new EditorPuzzleModel();
      model.setMetadata({
        id: 'key-time-test',
        name: 'Key Time Test',
        keySignature: 'Bb',
        timeSignature: [3, 4],
      });
      model.setPlayerSpawn(0, 0, 0);

      const json = serializePuzzle(model);

      expect(json.keySignature).toBe('Bb');
      expect(json.timeSignature).toEqual([3, 4]);
    });

    it('serializes default keySignature and timeSignature', () => {
      const model = new EditorPuzzleModel();
      model.setMetadata({ id: 'defaults-test', name: 'Defaults' });
      model.setPlayerSpawn(0, 0, 0);

      const json = serializePuzzle(model);

      expect(json.keySignature).toBe('C');
      expect(json.timeSignature).toEqual([4, 4]);
    });

    it('serializes null timeSignature for unmetered', () => {
      const model = new EditorPuzzleModel();
      model.setMetadata({
        id: 'unmetered-test',
        name: 'Unmetered',
        timeSignature: null,
      });
      model.setPlayerSpawn(0, 0, 0);

      const json = serializePuzzle(model);

      expect(json.timeSignature).toBeNull();
    });

    it('teaches round-trips: an empty list survives, an absent field stays absent', () => {
      // Empty array and absent mean different things in-game ([] = no hints,
      // absent = every hint eligible) — an editor save must not turn one
      // into the other. A 2026-07-16 save dropped the field entirely and
      // un-gated every hint on the hand-edited POC areas.
      const withTeaches = deserializePuzzle({
        id: 'teaches-test',
        name: 'Teaches',
        gridSize: 9,
        playerStart: { x: 0, y: 0, z: 0 },
        teaches: [],
        entities: [],
      });
      expect(serializePuzzle(withTeaches).teaches).toEqual([]);

      const withVerbs = deserializePuzzle({
        id: 'teaches-verbs',
        name: 'Teaches Verbs',
        gridSize: 9,
        playerStart: { x: 0, y: 0, z: 0 },
        teaches: ['slots'],
        entities: [],
      });
      expect(serializePuzzle(withVerbs).teaches).toEqual(['slots']);

      const without = deserializePuzzle({
        id: 'no-teaches',
        name: 'No Teaches',
        gridSize: 9,
        playerStart: { x: 0, y: 0, z: 0 },
        entities: [],
      });
      expect(serializePuzzle(without)).not.toHaveProperty('teaches');
    });
  });

  describe('deserialization', () => {
    it('reads a tile-built file as exactly its tiles: negative cells, no perimeter walls', () => {
      const model = deserializePuzzle({
        id: 'tiles',
        name: 'Tiles',
        difficulty: 1,
        tempo: 120,
        playerStart: { x: -2, y: 0, z: -1 },
        tiles: [
          { elevation: 0, x1: -2, z1: -1, x2: 0, z2: 0 },
          { elevation: 1, x1: 4, z1: 4, x2: 4, z2: 5 },
        ],
        entities: [{ type: 'wall', position: { x: 0, y: 0, z: 0 } }],
      });
      expect(model.getTiles()).toHaveLength(6 + 2);
      expect(model.hasTile(-2, 0, -1)).toBe(true);
      expect(model.hasTile(4, 1, 5)).toBe(true);
      expect(model.getEntities()).toHaveLength(1);
      // ...and writes back the same rectangles
      expect(serializePuzzle(model).tiles).toEqual([
        { elevation: 0, x1: -2, z1: -1, x2: 0, z2: 0 },
        { elevation: 1, x1: 4, z1: 4, x2: 4, z2: 5 },
      ]);
    });

    it('an older file saves in the new shape: tiles, its perimeter as walls, no gridSize', () => {
      const json = serializePuzzle(deserializePuzzle(PRE_ELEVATION_JSON));
      expect(json).not.toHaveProperty('gridSize');
      expect(json).not.toHaveProperty('floors');
      expect(json.tiles).toEqual([{ elevation: 0, x1: -1, z1: -1, x2: 15, z2: 15 }]);
      expect(json.entities.filter((e) => e.type === 'wall')).toHaveLength(64);
    });

    it('deserializes elevation-demo.json correctly', () => {
      const model = deserializePuzzle(ELEVATION_DEMO_JSON);

      // Verify metadata
      const meta = model.getMetadata();
      expect(meta.id).toBe('elevation-demo');
      expect(meta.name).toBe('Elevated Harmony');
      expect(meta.difficulty).toBe(2);
      expect(meta.tempo).toBe(120);

      // Verify player spawn
      expect(model.getPlayerSpawn()).toEqual({ x: 7, y: 0, z: 13 });

      // An older file (no tiles): its whole grid at E0 (and the ring its
      // perimeter walls stand on, -1..15), plus the raised region at E1
      const tiles = model.getTiles();
      expect(tiles.filter((t) => t.y === 0)).toHaveLength(17 * 17);
      expect(tiles.filter((t) => t.y === 1)).toHaveLength(9 * 5);
      expect(model.hasTile(-1, 0, -1)).toBe(true);
      expect(model.hasTile(15, 0, 15)).toBe(true);
      expect(model.hasTile(3, 1, 3) && model.hasTile(11, 1, 7)).toBe(true);
      expect(model.hasTile(12, 1, 7)).toBe(false);

      // Verify entity count and types: the file's 8, then its perimeter
      // walls as ordinary walls (4 x 15 + 4 corners)
      const entities = model.getEntities();
      expect(entities.length).toBe(8 + 64);

      const types = entities.map((e) => e.type);
      expect(types.filter((t) => t === 'creature').length).toBe(1);
      expect(types.filter((t) => t === 'ramp').length).toBe(1);
      expect(types.filter((t) => t === 'wall').length).toBe(4 + 64);
      expect(entities.some((e) => e.type === 'wall' && e.x === -1 && e.z === 7)).toBe(true);
      expect(types.filter((t) => t === 'gate').length).toBe(1);
      expect(types.filter((t) => t === 'fountain').length).toBe(1);

      // Verify creature data was properly mapped
      const creature = entities.find((e) => e.type === 'creature');
      expect(creature.x).toBe(7);
      expect(creature.y).toBe(1);
      expect(creature.z).toBe(5);
      expect(creature.data.song).toEqual([{ pitch: 'C4', length: '1/1' }]);
      expect(creature.data.interval).toBe(8);
      expect(creature.data.audibleRange).toBe(15);

      // Verify gate data was mapped from entity root song to data.song
      const gate = entities.find((e) => e.type === 'gate');
      expect(gate.x).toBe(6);
      expect(gate.y).toBe(1);
      expect(gate.z).toBe(3);
      expect(gate.data.song).toEqual([{ pitch: 'C4', length: '1/1' }]);

      // Verify fountain data was mapped from entity root song to data.song
      const fountain = entities.find((e) => e.type === 'fountain');
      expect(fountain.x).toBe(7);
      expect(fountain.y).toBe(1);
      expect(fountain.z).toBe(4);
      expect(fountain.data.song).toEqual([{ pitch: 'C4', length: '1/1' }]);

      // Verify ramp data was mapped from entity root direction to data.direction
      const ramp = entities.find((e) => e.type === 'ramp');
      expect(ramp.x).toBe(7);
      expect(ramp.y).toBe(0);
      expect(ramp.z).toBe(8);
      expect(ramp.data.direction).toBe('north');
    });

    it('deserializes pre-elevation puzzle with no floors correctly', () => {
      const model = deserializePuzzle(PRE_ELEVATION_JSON);

      // Verify metadata
      const meta = model.getMetadata();
      expect(meta.id).toBe('pre-elevation');
      expect(meta.name).toBe('Simple Song');

      // The whole 15x15 grid is floor (plus the perimeter ring)
      expect(model.getTiles()).toHaveLength(17 * 17);

      // Verify player spawn
      expect(model.getPlayerSpawn()).toEqual({ x: 7, y: 0, z: 13 });

      // Verify entities (the perimeter walls aside)
      const entities = model.getEntities().filter((e) => e.type !== 'wall');
      expect(entities.length).toBe(2);

      const creature = entities.find((e) => e.type === 'creature');
      expect(creature.x).toBe(5);
      expect(creature.y).toBe(0);
      expect(creature.z).toBe(5);
      expect(creature.data.song).toEqual([{ pitch: 'E4', length: '1/4' }]);

      const gate = entities.find((e) => e.type === 'gate');
      expect(gate.x).toBe(7);
      expect(gate.y).toBe(0);
      expect(gate.z).toBe(3);
      expect(gate.data.song).toEqual([{ pitch: 'E4', length: '1/4' }]);
    });

    it('deserializes a waystone (position-only, walkable tile) and round-trips it', () => {
      const json = {
        id: 'waystone-import',
        name: 'Waystone Import',
        difficulty: 1,
        tiles: [{ elevation: 0, x1: 6, z1: 12, x2: 6, z2: 12 }],
        tempo: 120,
        playerStart: { x: 0, y: 0, z: 0 },
        entities: [{ type: 'waystone', position: { x: 6, y: 0, z: 12 } }],
      };

      const model = deserializePuzzle(json);
      const entities = model.getEntities();
      expect(entities.length).toBe(1);

      const waystone = entities[0];
      expect(waystone.type).toBe('waystone');
      expect(waystone.x).toBe(6);
      expect(waystone.y).toBe(0);
      expect(waystone.z).toBe(12);
      expect(waystone.data).toEqual({});

      // Re-serializing preserves the waystone untouched.
      const reserialized = serializePuzzle(model);
      expect(reserialized.entities).toEqual([
        { type: 'waystone', position: { x: 6, y: 0, z: 12 } },
      ]);
    });

    it("loads a waystone saved under its old name ('cleanser') and saves it as a waystone", () => {
      const json = {
        id: 'old-cleanser',
        name: 'Old Cleanser',
        difficulty: 1,
        tiles: [],
        tempo: 120,
        playerStart: { x: 0, y: 0, z: 0 },
        entities: [{ type: 'cleanser', position: { x: 6, y: 0, z: 12 } }],
      };

      const model = deserializePuzzle(json);
      expect(model.getEntities().map((e) => e.type)).toEqual(['waystone']);
      expect(serializePuzzle(model).entities).toEqual([
        { type: 'waystone', position: { x: 6, y: 0, z: 12 } },
      ]);
    });

    it('provides defaults for missing optional fields', () => {
      const minimalJson = {
        id: 'minimal',
        name: 'Minimal',
        difficulty: 1,
        gridSize: 15,
        tempo: 120,
        playerStart: { x: 0, y: 0, z: 0 },
        entities: [],
      };

      const model = deserializePuzzle(minimalJson);

      expect(model.getMetadata().teaches).toBeNull();
      expect(model.getTiles()).toHaveLength(17 * 17); // an older file: its whole grid
    });

    it('deserializes keySignature and timeSignature', () => {
      const json = {
        id: 'key-time-import',
        name: 'Key Time Import',
        difficulty: 1,
        gridSize: 15,
        tempo: 120,
        keySignature: 'Eb',
        timeSignature: [6, 8],
        playerStart: { x: 0, y: 0, z: 0 },
        entities: [],
      };

      const model = deserializePuzzle(json);
      const meta = model.getMetadata();

      expect(meta.keySignature).toBe('Eb');
      expect(meta.timeSignature).toEqual([6, 8]);
    });

    it('falls back to C and [4,4] when keySignature and timeSignature are absent on import', () => {
      const json = {
        id: 'no-key-time',
        name: 'No Key Time',
        difficulty: 1,
        gridSize: 15,
        tempo: 120,
        playerStart: { x: 0, y: 0, z: 0 },
        entities: [],
      };

      const model = deserializePuzzle(json);
      const meta = model.getMetadata();

      expect(meta.keySignature).toBe('C');
      expect(meta.timeSignature).toEqual([4, 4]);
    });

    it('falls back to C for invalid keySignature on import', () => {
      const json = {
        id: 'bad-key',
        name: 'Bad Key',
        difficulty: 1,
        gridSize: 15,
        tempo: 120,
        keySignature: 'Z#',
        timeSignature: [4, 4],
        playerStart: { x: 0, y: 0, z: 0 },
        entities: [],
      };

      const model = deserializePuzzle(json);
      const meta = model.getMetadata();

      expect(meta.keySignature).toBe('C');
    });

    it('handles null timeSignature for unmetered mode', () => {
      const json = {
        id: 'unmetered',
        name: 'Unmetered',
        difficulty: 1,
        gridSize: 15,
        tempo: 120,
        keySignature: 'C',
        timeSignature: null,
        playerStart: { x: 0, y: 0, z: 0 },
        entities: [],
      };

      const model = deserializePuzzle(json);
      const meta = model.getMetadata();

      expect(meta.timeSignature).toBeNull();
    });

    it('falls back to [4,4] for invalid timeSignature on import', () => {
      const json = {
        id: 'bad-time',
        name: 'Bad Time',
        difficulty: 1,
        gridSize: 15,
        tempo: 120,
        timeSignature: 'invalid',
        playerStart: { x: 0, y: 0, z: 0 },
        entities: [],
      };

      const model = deserializePuzzle(json);
      const meta = model.getMetadata();

      expect(meta.timeSignature).toEqual([4, 4]);
    });
  });

  describe('gate identity + portal link serialization', () => {
    it('serializes gateId as root id, facing, and link at gate root', () => {
      const model = new EditorPuzzleModel();
      model.setMetadata({ id: 'portal-src' });
      model.setPlayerSpawn(0, 0, 0);
      model.addEntity('gate', 5, 0, 3, {
        song: [{ pitch: 'C4', length: '1/4' }],
        gateId: 'east-door',
        facing: 'east',
        link: { puzzleId: 'the-lure', gateId: 'west-door' },
      });

      const gate = serializePuzzle(model).entities[0];

      expect(gate.id).toBe('east-door');
      expect(gate.facing).toBe('east');
      expect(gate.link).toEqual({ puzzleId: 'the-lure', gateId: 'west-door' });
      expect(gate.data).toBeUndefined();
    });

    it('unlinked gate serializes with no link field', () => {
      const model = new EditorPuzzleModel();
      model.setMetadata({ id: 'no-link' });
      model.setPlayerSpawn(0, 0, 0);
      model.addEntity('gate', 5, 0, 3, {
        song: [],
        gateId: 'gate-1',
        facing: 'north',
      });

      const gate = serializePuzzle(model).entities[0];

      expect(gate.link).toBeUndefined();
    });

    it('deserializes id/facing/link into gate data', () => {
      const model = deserializePuzzle({
        id: 'portal-load',
        name: 'Portal Load',
        difficulty: 1,
        gridSize: 10,
        tempo: 120,
        playerStart: { x: 0, y: 0, z: 0 },
        entities: [
          {
            type: 'gate',
            position: { x: 5, y: 0, z: 3 },
            id: 'east-door',
            facing: 'east',
            link: { puzzleId: 'the-lure', gateId: 'west-door' },
            song: [{ pitch: 'C4', length: '1/4' }],
          },
        ],
      });

      const gate = model.getEntities()[0];

      expect(gate.data.gateId).toBe('east-door');
      expect(gate.data.facing).toBe('east');
      expect(gate.data.link).toEqual({ puzzleId: 'the-lure', gateId: 'west-door' });
    });

    it('auto-assigns unique gate ids and default facing to pre-portal gates', () => {
      const model = deserializePuzzle({
        id: 'legacy',
        name: 'Legacy',
        difficulty: 1,
        tiles: [],
        tempo: 120,
        playerStart: { x: 0, y: 0, z: 0 },
        entities: [
          { type: 'gate', position: { x: 1, y: 0, z: 1 }, song: [] },
          { type: 'gate', position: { x: 2, y: 0, z: 2 }, song: [], id: 'gate-1' },
          // Duplicate id: first occurrence keeps it, this one is reassigned
          { type: 'gate', position: { x: 3, y: 0, z: 3 }, song: [], id: 'gate-1' },
        ],
      });

      const ids = model.getEntities().map((e) => e.data.gateId);

      expect(new Set(ids).size).toBe(3);
      expect(ids[1]).toBe('gate-1');
      ids.forEach((id) => expect(id).toMatch(/^gate-\d+$/));
      model.getEntities().forEach((e) => expect(e.data.facing).toBe('north'));
    });

    it('invalid facing falls back to north on import', () => {
      const model = deserializePuzzle({
        id: 'bad-facing',
        name: 'Bad Facing',
        difficulty: 1,
        gridSize: 10,
        tempo: 120,
        playerStart: { x: 0, y: 0, z: 0 },
        entities: [
          { type: 'gate', position: { x: 1, y: 0, z: 1 }, song: [], id: 'g', facing: 'up' },
        ],
      });

      expect(model.getEntities()[0].data.facing).toBe('north');
    });

    it('gate id/facing/link round-trips through serialize + deserialize', () => {
      const original = new EditorPuzzleModel();
      original.setMetadata({ id: 'rt-link' });
      original.setPlayerSpawn(0, 0, 0);
      original.addEntity('gate', 5, 0, 3, {
        song: [{ pitch: 'C4', length: '1/4' }],
        gateId: 'east-door',
        facing: 'west',
        link: { puzzleId: 'other', gateId: 'their-door' },
      });

      const restored = deserializePuzzle(serializePuzzle(original));

      expect(restored.getEntities()[0].data).toEqual(original.getEntities()[0].data);
    });
  });

  describe('staffGroups serialization', () => {
    it('serializes gate staffGroups at entity root', () => {
      const model = new EditorPuzzleModel();
      model.setMetadata({ id: 'gate-staff-groups' });
      model.setPlayerSpawn(0, 0, 0);
      model.addEntity('gate', 5, 0, 3, {
        song: [],
        staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
      });

      const json = serializePuzzle(model);
      const gate = json.entities[0];

      expect(gate.staffGroups).toEqual([{ type: 'brace', voiceIds: ['treble', 'bass'] }]);
    });

    it('gate without staffGroups has no staffGroups field', () => {
      const model = new EditorPuzzleModel();
      model.setMetadata({ id: 'gate-no-groups' });
      model.setPlayerSpawn(0, 0, 0);
      model.addEntity('gate', 5, 0, 3, {
        song: [{ pitch: 'C4', length: '1/4' }],
      });

      const json = serializePuzzle(model);
      const gate = json.entities[0];

      expect(gate.staffGroups).toBeUndefined();
    });

    it('gate with staffGroups round-trips correctly', () => {
      const model = new EditorPuzzleModel();
      model.setMetadata({ id: 'gate-round-trip-sg' });
      model.setPlayerSpawn(0, 0, 0);
      model.addEntity('gate', 5, 0, 3, {
        song: {
          voices: [
            { id: 'treble', clef: 'treble', notes: [] },
            { id: 'bass', clef: 'bass', notes: [] },
          ],
          staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
        },
        staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
      });

      const json = serializePuzzle(model);
      const restored = deserializePuzzle(json);

      const gate = restored.getEntities().find((e) => e.type === 'gate');
      expect(gate.data.staffGroups).toEqual([{ type: 'brace', voiceIds: ['treble', 'bass'] }]);
      expect(gate.data.song.voices).toHaveLength(2);
    });

    it('fountain with staffGroups round-trips correctly', () => {
      const model = new EditorPuzzleModel();
      model.setMetadata({ id: 'fountain-round-trip-sg' });
      model.setPlayerSpawn(0, 0, 0);
      model.addEntity('fountain', 5, 0, 3, {
        song: {
          voices: [
            { id: 'treble', clef: 'treble', notes: [{ pitch: 'E5', length: '1/4' }] },
            { id: 'bass', clef: 'bass', notes: [{ pitch: 'E3', length: '1/4' }] },
          ],
          staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
        },
        staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
      });

      const json = serializePuzzle(model);
      const restored = deserializePuzzle(json);

      const fountain = restored.getEntities().find((e) => e.type === 'fountain');
      expect(fountain.data.staffGroups).toEqual([{ type: 'brace', voiceIds: ['treble', 'bass'] }]);
    });

    it('serializes voices+staffGroups song format for gates', () => {
      const model = new EditorPuzzleModel();
      model.setMetadata({ id: 'gate-voices-song' });
      model.setPlayerSpawn(0, 0, 0);
      model.addEntity('gate', 5, 0, 3, {
        song: {
          voices: [
            { id: 'treble', clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
            { id: 'bass', clef: 'bass', notes: [{ pitch: 'C3', length: '1/4' }] },
          ],
          staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
        },
      });

      const json = serializePuzzle(model);
      const gate = json.entities[0];

      expect(gate.song.voices).toHaveLength(2);
      expect(gate.song.staffGroups).toEqual([{ type: 'brace', voiceIds: ['treble', 'bass'] }]);
    });
  });
});
