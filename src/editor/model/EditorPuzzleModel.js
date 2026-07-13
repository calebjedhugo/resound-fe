/**
 * EditorPuzzleModel
 *
 * In-memory representation of a puzzle being edited.
 * All editor operations go through this model.
 */

const DEFAULT_METADATA = {
  id: '',
  name: '',
  difficulty: 1,
  tempo: 120,
  gridSize: 15,
  clapDisplacement: null,
  keySignature: 'C',
  timeSignature: [4, 4],
};

export default class EditorPuzzleModel {
  constructor() {
    this._metadata = { ...DEFAULT_METADATA };
    this._playerSpawn = null;
    this._floors = [];
    this._entities = [];
    this._nextEntityId = 1;
  }

  // -- Metadata --

  setMetadata(fields) {
    Object.assign(this._metadata, fields);
  }

  getMetadata() {
    return { ...this._metadata };
  }

  // -- Player Spawn --

  setPlayerSpawn(x, y, z) {
    this._playerSpawn = { x, y, z };
  }

  clearPlayerSpawn() {
    this._playerSpawn = null;
  }

  getPlayerSpawn() {
    return this._playerSpawn ? { ...this._playerSpawn } : null;
  }

  // -- Floors --

  addFloor(elevation, x1, z1, x2, z2) {
    const index = this._floors.length;
    this._floors.push({ elevation, x1, z1, x2, z2 });
    return index;
  }

  removeFloor(index) {
    if (index < 0 || index >= this._floors.length) return;
    this._floors.splice(index, 1);
  }

  getFloors() {
    return this._floors.map((f) => ({ ...f }));
  }

  getFloorElevation(x, z) {
    let highest = 0;
    for (const floor of this._floors) {
      if (x >= floor.x1 && x <= floor.x2 && z >= floor.z1 && z <= floor.z2) {
        if (floor.elevation > highest) {
          highest = floor.elevation;
        }
      }
    }
    return highest;
  }

  // -- Entities --

  addEntity(type, x, y, z, data) {
    const id = this._nextEntityId;
    this._nextEntityId += 1;
    this._entities.push({ id, type, x, y, z, data });
    return id;
  }

  updateEntity(id, changes) {
    const entity = this._entities.find((e) => e.id === id);
    if (!entity) return;
    Object.assign(entity, changes);
  }

  removeEntity(id) {
    const index = this._entities.findIndex((e) => e.id === id);
    if (index === -1) return;
    this._entities.splice(index, 1);
  }

  getEntity(id) {
    const entity = this._entities.find((e) => e.id === id);
    if (!entity) return undefined;
    return { ...entity };
  }

  getEntities() {
    return this._entities.map((e) => ({ ...e }));
  }

  getEntitiesAt(x, y, z) {
    return this._entities.filter((e) => e.x === x && e.y === y && e.z === z).map((e) => ({ ...e }));
  }
}
