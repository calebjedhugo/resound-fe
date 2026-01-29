/**
 * Puzzle Serialization
 *
 * Converts between EditorPuzzleModel (in-memory) and puzzle JSON (file format).
 *
 * Key differences between model and JSON format:
 *  - Model stores all entity-specific data in a flat `data` object
 *  - JSON format places fields differently per entity type:
 *    - Creature: song/interval/audibleRange/clapDisplacement inside `data`
 *    - Gate/Fountain: song at entity root
 *    - Ramp: direction at entity root
 *    - Wall: position only
 */
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';

/**
 * Serialize an EditorPuzzleModel into a puzzle JSON object.
 * @param {EditorPuzzleModel} model
 * @returns {object} Puzzle JSON conforming to schema
 */
export function serializePuzzle(model) {
  const metadata = model.getMetadata();
  const playerSpawn = model.getPlayerSpawn();
  const floors = model.getFloors();
  const entities = model.getEntities();

  const json = {
    id: metadata.id,
    name: metadata.name,
    difficulty: metadata.difficulty,
    gridSize: metadata.gridSize,
    tempo: metadata.tempo,
  };

  // Only include clapDisplacement if non-null
  if (metadata.clapDisplacement != null) {
    json.clapDisplacement = metadata.clapDisplacement;
  }

  json.playerStart = playerSpawn
    ? { x: playerSpawn.x, y: playerSpawn.y, z: playerSpawn.z }
    : { x: 0, y: 0, z: 0 };

  json.floors = floors.map((f) => ({
    elevation: f.elevation,
    x1: f.x1,
    z1: f.z1,
    x2: f.x2,
    z2: f.z2,
  }));

  json.entities = entities.map((entity) => serializeEntity(entity));

  return json;
}

/**
 * Serialize a single entity from model format to JSON format.
 * @param {object} entity - Model entity { id, type, x, y, z, data }
 * @returns {object} JSON entity
 */
function serializeEntity(entity) {
  const position = { x: entity.x, y: entity.y, z: entity.z };

  switch (entity.type) {
    case 'creature': {
      const data = {};
      if (entity.data.song) data.song = entity.data.song;
      if (entity.data.interval != null) data.interval = entity.data.interval;
      if (entity.data.audibleRange != null) data.audibleRange = entity.data.audibleRange;
      if (entity.data.clapDisplacement != null) {
        data.clapDisplacement = entity.data.clapDisplacement;
      }
      return { type: 'creature', position, data };
    }

    case 'gate':
      return {
        type: 'gate',
        position,
        song: entity.data.song || [],
      };

    case 'fountain':
      return {
        type: 'fountain',
        position,
        song: entity.data.song || [],
      };

    case 'ramp':
      return {
        type: 'ramp',
        position,
        direction: entity.data.direction,
      };

    case 'wall':
      return { type: 'wall', position };

    default:
      return { type: entity.type, position };
  }
}

/**
 * Deserialize a puzzle JSON object into an EditorPuzzleModel.
 * @param {object} json - Puzzle JSON conforming to schema
 * @returns {EditorPuzzleModel}
 */
export function deserializePuzzle(json) {
  const model = new EditorPuzzleModel();

  // Metadata
  model.setMetadata({
    id: json.id,
    name: json.name,
    difficulty: json.difficulty,
    tempo: json.tempo,
    gridSize: json.gridSize,
    clapDisplacement: json.clapDisplacement ?? null,
  });

  // Player spawn
  if (json.playerStart) {
    model.setPlayerSpawn(json.playerStart.x, json.playerStart.y, json.playerStart.z);
  }

  // Floors (optional, defaults to empty)
  const floors = json.floors || [];
  for (const floor of floors) {
    model.addFloor(floor.elevation, floor.x1, floor.z1, floor.x2, floor.z2);
  }

  // Entities
  const entities = json.entities || [];
  for (const entity of entities) {
    deserializeEntity(model, entity);
  }

  return model;
}

/**
 * Deserialize a single JSON entity and add it to the model.
 * Converts from JSON format (type-specific field placement) to model format
 * (all extra data in a flat `data` object).
 * @param {EditorPuzzleModel} model
 * @param {object} entity - JSON entity
 */
function deserializeEntity(model, entity) {
  const { x, y, z } = entity.position;

  switch (entity.type) {
    case 'creature':
      model.addEntity('creature', x, y, z, {
        song: entity.data.song,
        interval: entity.data.interval,
        audibleRange: entity.data.audibleRange,
        ...(entity.data.clapDisplacement != null
          ? { clapDisplacement: entity.data.clapDisplacement }
          : {}),
      });
      break;

    case 'gate':
      model.addEntity('gate', x, y, z, {
        song: entity.song,
      });
      break;

    case 'fountain':
      model.addEntity('fountain', x, y, z, {
        song: entity.song,
      });
      break;

    case 'ramp':
      model.addEntity('ramp', x, y, z, {
        direction: entity.direction,
      });
      break;

    case 'wall':
      model.addEntity('wall', x, y, z, {});
      break;

    default:
      model.addEntity(entity.type, x, y, z, {});
      break;
  }
}
