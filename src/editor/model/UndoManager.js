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

    for (const method of READ_METHODS) {
      this[method] = (...args) => this._model[method](...args);
    }

    for (const method of MUTATION_METHODS) {
      this[method] = (...args) => {
        this._undoStack.push(this._saveState());
        this._redoStack.length = 0;
        return this._model[method](...args);
      };
    }
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
  }

  redo() {
    if (!this.canRedo()) return;
    this._undoStack.push(this._saveState());
    const snapshot = this._redoStack.pop();
    this._restoreState(snapshot);
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
