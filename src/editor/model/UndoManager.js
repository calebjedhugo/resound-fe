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

const MUTATION_METHODS = [
  'setMetadata',
  'setPlayerSpawn',
  'clearPlayerSpawn',
  'addFloor',
  'removeFloor',
  'addEntity',
  'updateEntity',
  'removeEntity',
];

const READ_METHODS = [
  'getMetadata',
  'getPlayerSpawn',
  'getFloors',
  'getEntities',
  'getEntity',
  'getEntitiesAt',
  'getFloorElevation',
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

    for (const method of MUTATION_METHODS) {
      this[method] = (...args) => {
        this._undoStack.push(this._saveState());
        this._redoStack.length = 0;
        const result = this._model[method](...args);
        this._emitChange();
        return result;
      };
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
      floors: this._model._floors.map((f) => ({ ...f })),
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
    this._model._floors = source.getFloors();
    this._model._entities = source.getEntities();
    this._model._nextEntityId = Math.max(...source.getEntities().map((e) => e.id), 0) + 1;
  }

  _restoreState(snapshot) {
    this._model._metadata = { ...snapshot.metadata };
    this._model._playerSpawn = snapshot.playerSpawn ? { ...snapshot.playerSpawn } : null;
    this._model._floors = snapshot.floors.map((f) => ({ ...f }));
    this._model._entities = snapshot.entities.map((e) => ({
      ...e,
      data: { ...e.data },
    }));
    this._model._nextEntityId = snapshot.nextEntityId;
  }
}
