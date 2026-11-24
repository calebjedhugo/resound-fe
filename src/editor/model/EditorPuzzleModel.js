/**
 * EditorPuzzleModel
 *
 * In-memory representation of a puzzle being edited.
 * All editor operations go through this model.
 *
 * The floor is TILES: the cells the designer built, per storey (y), anywhere
 * (negative cells too). No implicit ground, no perimeter: an older level
 * (no `tiles` in its file) is opened as tiles + explicit walls
 * (serialization.deserializePuzzle).
 */
import { tileKey } from 'core/floorTiles';

const DEFAULT_METADATA = {
  id: '',
  name: '',
  difficulty: 1,
  tempo: 120,
  keySignature: 'C',
  timeSignature: [4, 4],
  // Key-hint verbs this puzzle teaches (see puzzles/schema.md). null =
  // field absent (all hints eligible in-game). The editor has no UI for it;
  // it must survive the open→save round trip untouched.
  teaches: null,
};

export default class EditorPuzzleModel {
  constructor() {
    this._metadata = { ...DEFAULT_METADATA };
    this._playerSpawn = null;
    this._tiles = new Set(); // tileKey(x, y, z) per built floor cell
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

  // -- Floor tiles --

  /**
   * Build floor at each cell ({x, y, z}, y the storey) that has none.
   * @returns {number} how many were new
   */
  addTiles(cells) {
    let added = 0;
    for (const { x, y, z } of cells) {
      const key = tileKey(x, y, z);
      if (!this._tiles.has(key)) {
        this._tiles.add(key);
        added += 1;
      }
    }
    return added;
  }

  removeTile(x, y, z) {
    return this._tiles.delete(tileKey(x, y, z));
  }

  hasTile(x, y, z) {
    return this._tiles.has(tileKey(x, y, z));
  }

  /** Every floor tile, {x, y, z}, sorted by storey, z, x. */
  getTiles() {
    return [...this._tiles]
      .map((key) => {
        const [x, y, z] = key.split(',').map(Number);
        return { x, y, z };
      })
      .sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  }

  get tileCount() {
    return this._tiles.size;
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
