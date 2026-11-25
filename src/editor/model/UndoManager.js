/**
 * UndoManager
 *
 * Wraps an EditorPuzzleModel and provides undo/redo by snapshotting
 * model state before each mutation. On undo, the previous snapshot
 * is restored. On redo, the next snapshot is restored.
 *
 * Uses state snapshots rather than command pattern because the model
 * is small and snapshot/restore is simpler and more reliable.
 */

// History depth. A snapshot copies every entity: 14 KB for the largest
// puzzle (poc-two-keys, 104 entities; measured 2026-10-17), so the unbounded
// history grew ~1 MB per 70 edits for the whole session. 500 steps is far
// more than anyone undoes through (a song note is 1-3 edits) and caps undo +
// redo together at ~7 MB. The oldest step goes first.
export const MAX_UNDO_STEPS = 500;

const MUTATION_METHODS = [
  'setMetadata',
  'setPlayerSpawn',
  'clearPlayerSpawn',
  'addTiles',
  'removeTile',
  'addEntity',
  'updateEntity',
  'removeEntity',
];

const READ_METHODS = [
  'getMetadata',
  'getPlayerSpawn',
  'getTiles',
  'hasTile',
  'hasFloor',
  'isWallTop',
  'getEntities',
  'getEntity',
  'getEntitiesAt',
];

export default class UndoManager {
  constructor(model) {
    this._model = model;
    this._undoStack = [];
    this._redoStack = [];
    this._onChange = null;

    for (const method of READ_METHODS) {
      this[method] = (...args) => this._model[method](...args);
    }

    // While batch() runs: the one snapshot it took (its mutations record
    // no step of their own, and fire no change until it ends)
    this._batch = null;

    for (const method of MUTATION_METHODS) {
      this[method] = (...args) => {
        if (this._batch) {
          this._batch.changed = true;
          return this._model[method](...args);
        }
        this._pushUndo(this._saveState());
        const result = this._model[method](...args);
        this._emitChange();
        return result;
      };
    }
  }

  _pushUndo(snapshot) {
    this._undoStack.push(snapshot);
    if (this._undoStack.length > MAX_UNDO_STEPS) this._undoStack.shift();
    this._redoStack.length = 0;
  }

  /**
   * Run several mutations as ONE undo step (an entity placed with the floor
   * tile it brings). One change fires at the end, if anything changed;
   * nested batches join the outer one.
   * @param {() => any} fn
   * @returns {any} what fn returns
   */
  batch(fn) {
    if (this._batch) return fn();
    const batch = { before: this._saveState(), changed: false };
    this._batch = batch;
    try {
      return fn();
    } finally {
      this._batch = null;
      if (batch.changed) {
        this._pushUndo(batch.before);
        this._emitChange();
      }
    }
  }

  /**
   * Register a callback fired after every model mutation (including
   * undo/redo). Used to trigger autosave/validation centrally rather
   * than wiring each panel. Direct model replacement (loading a level)
   * bypasses the mutation wrappers and does not fire this.
   * @param {() => void} fn
   */
  setOnChange(fn) {
    this._onChange = fn;
  }

  _emitChange() {
    if (this._onChange) this._onChange();
  }

  canUndo() {
    return this._undoStack.length > 0;
  }

  canRedo() {
    return this._redoStack.length > 0;
  }

  undo() {
    if (!this.canUndo()) return;
    this._redoStack.push(this._saveState());
    const snapshot = this._undoStack.pop();
    this._restoreState(snapshot);
    this._emitChange();
  }

  redo() {
    if (!this.canRedo()) return;
    this._undoStack.push(this._saveState());
    const snapshot = this._redoStack.pop();
    this._restoreState(snapshot);
    this._emitChange();
  }

  _saveState() {
    return {
      metadata: { ...this._model._metadata },
      playerSpawn: this._model._playerSpawn ? { ...this._model._playerSpawn } : null,
      tiles: new Set(this._model._tiles),
      entities: this._model._entities.map((e) => ({
        ...e,
        data: { ...e.data },
      })),
      nextEntityId: this._model._nextEntityId,
    };
  }

  /**
   * Replace the wrapped model's contents wholesale (loading a level or
   * restoring a session). Intentionally bypasses the mutation wrappers:
   * no undo entry is recorded and onChange does not fire, so opening a
   * puzzle never autosaves it back.
   * @param {EditorPuzzleModel} source - model whose contents to copy in
   */
  replaceModel(source) {
    this._model._metadata = { ...source.getMetadata() };
    this._model._playerSpawn = source.getPlayerSpawn();
    this._model._tiles = new Set();
    this._model.addTiles(source.getTiles());
    this._model._entities = source.getEntities();
    this._model._nextEntityId = Math.max(...source.getEntities().map((e) => e.id), 0) + 1;
  }

  _restoreState(snapshot) {
    this._model._metadata = { ...snapshot.metadata };
    this._model._playerSpawn = snapshot.playerSpawn ? { ...snapshot.playerSpawn } : null;
    this._model._tiles = new Set(snapshot.tiles);
    this._model._entities = snapshot.entities.map((e) => ({
      ...e,
      data: { ...e.data },
    }));
    this._model._nextEntityId = snapshot.nextEntityId;
  }
}
