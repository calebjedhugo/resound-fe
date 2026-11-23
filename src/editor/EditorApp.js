import * as THREE from 'three';
// eslint-disable-next-line import/extensions -- three's ESM subpath requires the .js extension
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import UndoManager from 'editor/model/UndoManager';
import EditorScene from 'editor/viewport/EditorScene';
import EntityPlacer from 'editor/viewport/EntityPlacer';
import SelectionManager from 'editor/viewport/SelectionManager';
import EntityDragger from 'editor/viewport/EntityDragger';
import GhostPreview from 'editor/viewport/GhostPreview';
import RangeIndicator from 'editor/viewport/RangeIndicator';
import GameLookLayer from 'editor/viewport/GameLookLayer';
import ElevationSelector from 'editor/ui/ElevationSelector';
import FloorRegionPanel from 'editor/ui/FloorRegionPanel';
import EntityToolbar from 'editor/ui/EntityToolbar';
import PropertyPanel from 'editor/ui/PropertyPanel';
import MetadataPanel from 'editor/ui/MetadataPanel';
import ValidationPanel from 'editor/ui/ValidationPanel';
import PuzzlePicker from 'editor/ui/PuzzlePicker';
import WorldOverview from 'editor/ui/WorldOverview';
import EditorToolbar from 'editor/ui/EditorToolbar';
import GitPanel from 'editor/ui/GitPanel';
import ContextMenu from 'editor/ui/ContextMenu';
import SongEditorModal from 'editor/ui/SongEditorModal';
import { saveSession, loadSession, clearSession } from 'editor/io/sessionPersistence';
import {
  savePuzzleToRepo,
  listRepoPuzzles,
  loadRepoPuzzle,
  onRepoWrite,
} from 'editor/io/repoPersistence';
import { gitCommit, gitPull, gitPush, gitRevert, gitUnrevert } from 'editor/io/gitControls';
import {
  createLink,
  clearLink,
  parseLinkTarget,
  releaseLinkBeforeDelete,
} from 'editor/io/portalLinks';
import { importPuzzle } from 'editor/io/importPuzzle';
import { loadLook, saveLook } from 'editor/io/lookPreference';
import SongAudition from 'editor/audio/SongAudition';
import { serializePuzzle } from 'editor/model/serialization';
import { playUrl, editorRequest, PLAY_WINDOW_NAME, BACK_TO_EDITOR_MESSAGE } from 'core/editorLink';
import { availableElevations } from 'editor/util/elevations';
import { ELEVATION_HEIGHT } from 'core/constants';

// Entity types that carry a song (Edit Song menu item, dbl-click to edit).
const SONG_ENTITY_TYPES = ['creature', 'gate', 'fountain'];
// Single-key placement at the cursor cell (fountain is parked — no key).
const PLACE_KEYS = {
  p: 'player',
  c: 'creature',
  g: 'gate',
  w: 'wall',
  r: 'ramp',
  l: 'waystone',
};
// Where a same-tab Play leaves the undo history for the editor's return
const HISTORY_KEY = 'resound-editor-history';
// A click whose pointer moved more than this many pixels since mousedown is a
// drag (camera rotate/pan), not a selection.
const CLICK_DRAG_PX = 4;

export default class EditorApp {
  constructor() {
    this.model = new EditorPuzzleModel();
    this.undoManager = new UndoManager(this.model);
    this.scene = null;
    this.renderer = null;
    this.camera = null;
    this.controls = null;
    this._frameId = null; // pending on-demand render frame
    this._dirty = false;
    // One-shot flag: set after a git revert so the next Cmd-Z restores the
    // reverted puzzle edits (git stash pop) instead of doing a model undo.
    // Any model mutation clears it (see the setOnChange hook).
    this._pendingUnrevert = false;
    this._floorDraft = null; // { anchor: {x,z}, elevation } while sizing a new floor
    this._validationTimer = null;
    this._autoSaveTimer = null;
    this._repoSaves = new Set(); // autosave writes still in flight
    // { edited } while git rewrites the puzzle files under the open model:
    // autosave is held, not scheduled (see _rewriteFilesWithGit); else null
    this._autoSaveHold = null;
    // Bumped each time a load replaces the model: a save that lands under a
    // newer generation was written for a puzzle that is no longer open.
    this._modelGeneration = 0;
    // True once the current puzzle exists on disk. While false (a brand-new
    // puzzle), the id is derived live from the name; once true it is locked so
    // renaming never forks the file.
    this._puzzleCommitted = false;
    // Entity id of the gate awaiting its teleport partner (context menu
    // "Teleport" is a two-click flow); null = not picking
    this._linkPickSourceId = null;
  }

  init() {
    this._setupRenderer();
    this._setupCamera();
    this._setupControls();
    this.editorScene = new EditorScene(this.scene, this.undoManager);
    this.elevationSelector = new ElevationSelector(
      document.getElementById('elevation-panel'),
      this.editorScene,
      this.undoManager
    );
    this.floorRegionPanel = new FloorRegionPanel(
      document.getElementById('floor-panel'),
      this.undoManager,
      this.editorScene,
      () => this.elevationSelector.refresh(),
      (message, kind) => this._showToast(message, kind)
    );
    this.entityPlacer = new EntityPlacer(this.scene, this.undoManager);
    // The level as the game draws it (the default look), or the coloured
    // schematic primitives: V / the toolbar's look button, remembered
    this.gameLook = new GameLookLayer(this.scene);
    this._look = loadLook();
    this.ghostPreview = new GhostPreview(this.scene);
    this.selectionManager = new SelectionManager(this.camera, this.entityPlacer);
    this.entityToolbar = new EntityToolbar(
      document.getElementById('entity-toolbar'),
      (toolType) => {
        // When a tool is selected, deselect any selected entity
        if (toolType) this.selectionManager.deselect();
        this.ghostPreview.setEntityType(toolType);
      }
    );
    // A song heard in the editor (the song editor's Play, or A's quick
    // audition) lights its creature in the game look, note by note
    const previewNote = (entityId, pitch, seconds) => {
      this.gameLook.noteOn(entityId, pitch, seconds);
      this._requestFrame();
    };
    const previewStop = (entityId) => this.gameLook.silence(entityId);
    this.songEditorModal = new SongEditorModal(
      document.getElementById('editor-root'),
      this.undoManager,
      { onNote: previewNote, onStop: previewStop }
    );
    this.audition = new SongAudition({ onNote: previewNote, onStop: previewStop });
    this.contextMenu = new ContextMenu(document.getElementById('editor-viewport'));
    this.propertyPanel = new PropertyPanel(
      document.getElementById('property-panel'),
      this.undoManager,
      this.entityPlacer,
      () => {
        this._deleteSelectedEntity();
      },
      (entityId) => {
        this.openSongEditor(entityId);
      },
      (message, kind) => this._showToast(message, kind)
    );
    this.metadataPanel = new MetadataPanel(
      document.getElementById('metadata-panel'),
      this.undoManager,
      this.editorScene,
      () => this._puzzleCommitted
    );
    this.validationPanel = new ValidationPanel(
      document.getElementById('validation-panel'),
      this.undoManager,
      (entityId) => {
        if (entityId) this.selectionManager.select(entityId);
      },
      (entityId) => this.openSongEditor(entityId)
    );
    this.toolbar = new EditorToolbar(document.getElementById('toolbar-panel'), {
      onUndo: () => this._undo(),
      onRedo: () => this._redo(),
      canUndo: () => this.undoManager.canUndo(),
      canRedo: () => this.undoManager.canRedo(),
      onPlay: () => this.play(),
      onToggleLook: () => this.toggleLook(),
    });
    this.puzzlePicker = new PuzzlePicker(
      document.getElementById('puzzle-panel'),
      (importedModel) => {
        // Load an existing repo level: replace model state without writing
        // it straight back to disk (it already matches the file we read).
        this._puzzleCommitted = true;
        this._applyRestoredModel(importedModel);
        this.puzzlePicker.setSelected(importedModel.getMetadata().id);
        this.toolbar.setStatus('saved');
      },
      () => this._newPuzzle(),
      () => {
        // After delete: drop to a fresh, unsaved puzzle. An edit made while
        // the delete was out must not write the deleted file back.
        this._cancelAutoSave();
        this._newPuzzle();
      },
      // Before the picker reads a level or deletes a file, the open puzzle's
      // last edit lands: a reload reads it back, a delete comes after it.
      () => this._settleAutoSave()
    );
    this.worldOverview = new WorldOverview(document.getElementById('world-panel'), {
      onOpenPuzzle: (id) => this.puzzlePicker.open(id),
      getCurrentPuzzleId: () => this.undoManager.getMetadata().id,
    });
    this.gitPanel = new GitPanel(document.getElementById('git-panel'), {
      onCommit: (message) => this._gitCommit(message),
      onPull: () => this._gitPull(),
      onPush: () => this._gitPush(),
      onRevert: () => this._gitRevert(),
    });
    // Git status changes when a puzzle file does, so re-read it once each
    // write lands (autosave, a link partner's file, a delete) — never per
    // edit, which spawned git on every keystroke and read the tree before
    // the autosave had written it.
    this._stopGitRefresh = onRepoWrite(() => this.gitPanel.refresh());
    this.entityDragger = new EntityDragger(
      this.scene,
      this.camera,
      this.undoManager,
      this.entityPlacer,
      this.selectionManager
    );
    this.entityDragger.groundPlane = this.editorScene._groundPlane;

    // Central hook: every model mutation (metadata, properties, songs,
    // placement, undo/redo) validates and autosaves to the repo. Loading
    // a level replaces the model directly and bypasses this, so it does
    // not immediately write back.
    this.undoManager.setOnChange(() => {
      // A real edit lands: the pending "Cmd-Z restores the revert" one-shot no
      // longer applies (autosave has re-diverged the file from HEAD anyway),
      // nor does the git panel's "⌘Z to restore".
      if (this._pendingUnrevert) {
        this._pendingUnrevert = false;
        this.gitPanel.clearNote();
      }
      this._syncGridToScene();
      this._syncGameLook();
      this._refreshRangeIndicator();
      this._requestFrame();
      this._scheduleValidation();
      this._scheduleAutoSave();
      this.toolbar.refresh();
      const { id } = this.undoManager.getMetadata();
      this.toolbar.setStatus(id ? 'dirty' : 'unnamed');
    });

    // Wire selection changes to property panel
    this.rangeIndicator = new RangeIndicator(this.scene);
    this.selectionManager.onSelectionChange = (entityId) => {
      if (entityId !== null) {
        this.propertyPanel.show(entityId);
        // The selection inspector lives mid-sidebar; pull it into view so a
        // selection made in the viewport isn't hidden below the fold.
        const panel = document.getElementById('property-panel');
        if (panel && panel.scrollIntoView) {
          panel.scrollIntoView({ block: 'nearest' });
        }
      } else {
        this.propertyPanel.hide();
      }
      this._refreshRangeIndicator();
      this._outlineSelection();
      this._requestFrame();
    };

    this._applyLook();

    // Restore saved session (auto-restore on load)
    this._restoreSession();

    this._setupViewportHud();
    this._setupViewportClick();
    // Mouse entity-dragging is DISABLED: entity movement is keyboard-only now
    // (Shift+Arrow), so a drag always drives the camera — rotate, or pan while
    // Shift is held (OrbitControls' built-in modifier). The _setupDrag method
    // is kept, dormant, for possible revival.
    // this._setupDrag();
    this._setupKeyboard();
    this._setupRenderInvalidation();
    this._onMessage = (event) => this._onBackFromGame(event);
    window.addEventListener('message', this._onMessage);
    this._requestFrame(); // initial render
    window.addEventListener('resize', () => this._onResize());
  }

  /**
   * True if a cell already holds something that blocks placing/moving `type`
   * there. One per tile — except a waystone, which may share a cell with the
   * player spawn (spawning on a waystone is legal) and with a gate (a
   * waystone under a doorway).
   */
  _isCellOccupied(x, y, z, type = null) {
    const entities = this.undoManager.getEntitiesAt(x, y, z);
    const spawn = this.undoManager.getPlayerSpawn();
    const spawnHere = Boolean(spawn && spawn.x === x && spawn.y === y && spawn.z === z);
    // A waystone is blocked only by a non-gate entity (spawn never blocks it).
    if (type === 'waystone') return entities.some((e) => e.type !== 'gate');
    // A gate tolerates a waystone but nothing else (incl. the spawn).
    if (type === 'gate') return spawnHere || entities.some((e) => e.type !== 'waystone');
    if (type === 'player') return entities.some((e) => e.type !== 'waystone');
    if (entities.length > 0) return true;
    return spawnHere;
  }

  /** Create the viewport overlay: a live hover-cell readout + a transient toast. */
  _setupViewportHud() {
    const container = document.getElementById('editor-viewport');
    this._hudEl = document.createElement('div');
    this._hudEl.className = 'viewport-hud';
    container.appendChild(this._hudEl);

    this._toastEl = document.createElement('div');
    this._toastEl.className = 'viewport-toast';
    container.appendChild(this._toastEl);
  }

  _updateHud() {
    if (!this._hudEl) return;
    const grid = this.editorScene.getHoveredGrid();
    const cellText = grid
      ? `Cell (${grid.x}, ${grid.z}) · E${this.editorScene.activeElevation}`
      : '';
    const tool = this.entityToolbar ? this.entityToolbar.activeTool : null;
    const toolText = tool ? `Placing ${tool} — click a tile (Esc cancels)` : '';
    const pickText =
      this._linkPickSourceId !== null ? 'Teleport: click another gate to link (Esc cancels)' : '';
    const draftText = this._floorDraft
      ? `Draft floor E${this._floorDraft.elevation} — arrows size it, Enter creates, Esc cancels`
      : '';
    const text = [pickText, draftText, toolText, cellText].filter(Boolean).join(' · ');
    // Runs every frame (a camera fling is ~60): rewriting the same text would
    // still replace the text node and re-lay the HUD out each time.
    if (this._hudEl.textContent !== text) this._hudEl.textContent = text;
  }

  /** Briefly show a message in the viewport (e.g. why a placement was refused). */
  _showToast(message, kind = 'error') {
    if (!this._toastEl) return;
    this._toastEl.textContent = message;
    this._toastEl.classList.toggle('success', kind === 'success');
    this._toastEl.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(
      () => {
        this._toastEl.classList.remove('visible');
      },
      kind === 'error' ? 4200 : 2600
    );
  }

  // --- Gate linking (context-menu flows) ---------------------------------

  /** Enter teleport-pick mode: the next clicked gate becomes the partner. */
  _startLinkPick(sourceEntityId) {
    this.entityToolbar.deselect(); // placement and picking can't coexist
    this._linkPickSourceId = sourceEntityId;
    this._showToast('Click another gate to link it (Esc cancels)', 'success');
  }

  _cancelLinkPick(message) {
    if (this._linkPickSourceId === null) return;
    this._linkPickSourceId = null;
    if (message) this._showToast(message);
  }

  /** Viewport click while in teleport-pick mode. */
  _handleLinkPickClick(e) {
    const sourceId = this._linkPickSourceId;
    const targetId = this._entityIdAtEvent(e);
    const target = targetId !== null ? this.undoManager.getEntity(targetId) : null;
    if (!target || target.type !== 'gate') {
      this._cancelLinkPick('Teleport cancelled — that was not a gate');
      return;
    }
    if (targetId === sourceId) {
      this._showToast("A gate can't link to itself — pick a different gate");
      return; // stay in pick mode
    }
    this._linkPickSourceId = null;
    const { id: puzzleId } = this.undoManager.getMetadata();
    this._linkGateTo(sourceId, { puzzleId, gateId: target.data.gateId });
  }

  /** Context menu "Link by id…": gate-2 (this puzzle) or puzzle-id/gate-id. */
  _linkById(sourceEntityId) {
    // eslint-disable-next-line no-alert -- dev-tool input; a typed id is the point of this flow
    const input = window.prompt('Link to gate id ("gate-2") or puzzle/gate ("the-lure/gate-1"):');
    if (input === null || input.trim() === '') return;
    try {
      const target = parseLinkTarget(input, this.undoManager.getMetadata().id);
      this._linkGateTo(sourceEntityId, target);
    } catch (err) {
      this._showToast(err.message);
    }
  }

  /**
   * Shared tail of every context-menu link flow: create the link (unifying
   * the pair's song — replacing a real song asks first), then refresh UI.
   */
  _linkGateTo(sourceEntityId, { puzzleId, gateId }) {
    createLink(this.undoManager, sourceEntityId, puzzleId, gateId, {
      confirmSongReplace: () =>
        // eslint-disable-next-line no-alert -- dev-tool confirm before deleting an authored song
        window.confirm(
          `Both gates have songs. Linking replaces "${gateId}"'s song with this gate's ` +
            '(linked gates are one door and share one song). Continue?'
        ),
    })
      .then(({ warnings, cancelled }) => {
        if (cancelled) {
          this._showToast('Teleport cancelled — kept both songs');
          return;
        }
        this._refreshGateLinkBadges();
        this._selectAndShow(sourceEntityId);
        if (warnings.length > 0) this._showToast(warnings.join(' • '));
        else this._showToast('Gates linked (both sides)', 'success');
      })
      .catch((err) => this._showToast(err.message));
  }

  /**
   * Select an entity and show its (possibly just-changed) properties. A
   * successful select() already shows them via onSelectionChange, so the
   * panel is built here only when the selection didn't take — one build per
   * keyboard move, not two (an unlinked gate's build fetches the manifest).
   */
  _selectAndShow(entityId) {
    this.selectionManager.select(entityId);
    if (this.selectionManager.selectedId !== entityId) this.propertyPanel.show(entityId);
  }

  /** Re-sync every gate's violet linked-badge with the model. */
  _refreshGateLinkBadges() {
    for (const entity of this.undoManager.getEntities()) {
      if (entity.type === 'gate') this.entityPlacer.refreshLinkBadge(entity.id);
    }
  }

  /**
   * Delete the selected entity. A linked gate first releases its partner's
   * back-link (best effort — the far side of a portal must not dangle);
   * local deletion proceeds even if that cleanup fails.
   */
  async _deleteSelectedEntity() {
    const id = this.selectionManager.selectedId;
    if (id === null) return;
    try {
      await releaseLinkBeforeDelete(this.undoManager, id);
    } catch (err) {
      this._showToast(`Couldn't clear the far side of the link: ${err.message}`);
    }
    this.selectionManager.deleteSelected();
  }

  _scheduleValidation() {
    clearTimeout(this._validationTimer);
    this._validationTimer = setTimeout(() => {
      this.validationPanel.refresh();
    }, 300);
  }

  _scheduleAutoSave() {
    clearTimeout(this._autoSaveTimer);
    this._autoSaveTimer = null;
    if (this._autoSaveHold) {
      this._autoSaveHold.edited = true;
      return;
    }
    this._autoSaveTimer = setTimeout(() => this._autoSave(), 500);
  }

  /** The debounced autosave: snapshot the session and write the puzzle file. */
  _autoSave() {
    this._autoSaveTimer = null;
    saveSession(this.undoManager);
    const save = this._saveToRepo();
    this._repoSaves.add(save);
    save.finally(() => this._repoSaves.delete(save));
  }

  /**
   * Run a pending autosave NOW, before something replaces the model it is
   * for. Left to its timer it writes whatever model is open by then — the
   * newly opened puzzle, reformatting its file — and this one's last edit is
   * never written. The model is serialized before this returns (the write
   * itself lands later), so the caller may replace it at once.
   */
  _flushAutoSave() {
    if (this._autoSaveTimer === null) return;
    clearTimeout(this._autoSaveTimer);
    this._autoSave();
  }

  /** Drop a pending autosave unwritten (its puzzle's file was just deleted). */
  _cancelAutoSave() {
    clearTimeout(this._autoSaveTimer);
    this._autoSaveTimer = null;
  }

  /**
   * Flush the pending autosave and wait until every autosave write has
   * landed, so what runs next reads or rewrites the files as the editor last
   * left them (git; the picker reading a puzzle back or deleting one).
   */
  async _settleAutoSave() {
    this._flushAutoSave();
    await Promise.all(this._repoSaves);
  }

  async _saveToRepo() {
    const { id, name } = this.undoManager.getMetadata();
    if (!id) {
      // No name yet -> nothing to write. Keep the prompt visible.
      this.toolbar.setStatus('unnamed');
      this.puzzlePicker.setSelected('', name);
      return;
    }
    const generation = this._modelGeneration;
    // A save flushed as its model was replaced lands for a puzzle that is no
    // longer open: the id lock, the picker's selection and the status line
    // are the open puzzle's by then (its file still joins the list).
    const stillOpen = () => generation === this._modelGeneration;
    this.toolbar.setStatus('saving');
    try {
      const written = await savePuzzleToRepo(this.undoManager);
      if (written && stillOpen()) this._puzzleCommitted = true;
      // A newly-created id won't be in the dropdown yet; refresh to add it.
      if (written && !this.puzzlePicker.hasLevel(id)) await this.puzzlePicker.refresh();
      if (!stillOpen()) {
        this._selectOpenPuzzleInPicker();
        return;
      }
      if (written) {
        this.puzzlePicker.setSelected(id);
        this.toolbar.setStatus('saved');
      } else {
        this.toolbar.setStatus('unnamed');
      }
    } catch (err) {
      console.warn('Repo save failed:', err);
      this.toolbar.setStatus('error', err.message);
    }
  }

  /** Point the picker at the open puzzle: its entry, or an "(unsaved)" one. */
  _selectOpenPuzzleInPicker() {
    const { id, name } = this.undoManager.getMetadata();
    this.puzzlePicker.setSelected(id || '', name);
  }

  async _restoreSession() {
    // Opened on a level (the game's Back to Editor): that level, from disk
    const requested = editorRequest(window.location.search);
    if (requested && (await this._openRequestedPuzzle(requested))) {
      this._restoreHistory();
      return;
    }
    const restored = loadSession();
    if (!restored) return;

    // Disk is authoritative: autosave keeps public/puzzles/<id>.json current,
    // so if the last-open level exists in the repo, restore its on-disk copy
    // rather than the (possibly stale) localStorage snapshot. Fall back to the
    // snapshot for a not-yet-saved puzzle (no id, or id not in the manifest).
    const { id } = restored.getMetadata();
    if (id) {
      try {
        const puzzles = await listRepoPuzzles();
        if (puzzles.some((p) => p.id === id)) {
          const json = await loadRepoPuzzle(id);
          this._puzzleCommitted = true;
          this._applyRestoredModel(importPuzzle(json).model);
          await this.puzzlePicker.refresh(id);
          this.toolbar.setStatus('saved');
          this._restoreHistory();
          return;
        }
      } catch (err) {
        console.warn('Falling back to saved session:', err);
      }
    }
    // Not on disk: a snapshot of a not-yet-saved puzzle.
    this._puzzleCommitted = false;
    this._applyRestoredModel(restored);
  }

  /** Open a level named in the editor's URL; false if the repo doesn't list it. */
  async _openRequestedPuzzle(id) {
    try {
      const puzzles = await listRepoPuzzles();
      if (!puzzles.some((p) => p.id === id)) return false;
      const json = await loadRepoPuzzle(id);
      this._puzzleCommitted = true;
      this._applyRestoredModel(importPuzzle(json).model);
      await this.puzzlePicker.refresh(id);
      this.toolbar.setStatus('saved');
      // A reload restores the session as usual
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      return true;
    } catch (err) {
      console.warn(`Couldn't open "${id}":`, err);
      return false;
    }
  }

  /**
   * Redraw the viewport grid to match the model's current gridSize. Fires on
   * model load (replaceModel bypasses the mutation hook) and on any mutation
   * (covers a live Grid Size edit). The rebuild replaces the raycast plane, so
   * the dragger's cached reference must be re-pointed when it happens.
   */
  _syncGridToScene() {
    if (!this.editorScene) return;
    const rebuilt = this.editorScene.syncGridSize();
    if (rebuilt && this.entityDragger) {
      this.entityDragger.groundPlane = this.editorScene._groundPlane;
    }
  }

  /**
   * Show the audible-range / absorb-reach spheres for the selected creature (and
   * nothing otherwise). Called on selection changes and on every mutation, so
   * the spheres track the creature as it moves or its Audible Range is edited.
   */
  _refreshRangeIndicator() {
    if (!this.rangeIndicator) return;
    const id = this.selectionManager.selectedId;
    const entity = id !== null ? this.undoManager.getEntity(id) : null;
    const mesh = id !== null ? this.entityPlacer.getMeshById(id) : null;
    if (entity && entity.type === 'creature' && mesh) {
      this.rangeIndicator.show(entity, mesh.position);
    } else {
      this.rangeIndicator.hide();
    }
  }

  _applyRestoredModel(importedModel) {
    // Every path that replaces the model comes through here (picker, world
    // map, new puzzle, git reloads, session restore): the old model's
    // pending edit is written first, for the old model.
    this._flushAutoSave();
    this._modelGeneration += 1;
    this.undoManager.replaceModel(importedModel);
    this._syncGridToScene();
    this.editorScene.recenterCursor();
    this.entityPlacer.rebuildFromModel();
    this.floorRegionPanel.refresh();
    this.elevationSelector.refresh();
    this.metadataPanel.refresh();
    this.selectionManager.deselect();
    this._syncGameLook();
    if (this.toolbar) this.toolbar.refresh();
    const { id, name } = importedModel.getMetadata();
    if (this.puzzlePicker && !this._puzzleCommitted) {
      this.puzzlePicker.setSelected(id || '', name);
    }
    this._scheduleValidation();
    this._requestFrame(); // a fresh model rebuilt the scene — draw it
  }

  /** Create a brand-new, not-yet-saved puzzle after confirming any loss. */
  _newPuzzle() {
    const { id } = this.undoManager.getMetadata();
    // Only a not-yet-saved puzzle can lose work; saved ones are on disk already.
    if (!this._puzzleCommitted && !id && this.undoManager.canUndo()) {
      // eslint-disable-next-line no-alert
      const ok = window.confirm(
        'Start a new puzzle? The current puzzle has not been named/saved and will be discarded.'
      );
      if (!ok) return;
    }
    this._puzzleCommitted = false;
    this._applyRestoredModel(new EditorPuzzleModel());
    // After the old puzzle's pending edit was written (with its session
    // snapshot), or a reload would bring that puzzle back.
    clearSession();
    this.metadataPanel.expand();
    this.toolbar.setStatus('unnamed');
    // Focus the name field so the first thing you do is name it.
    const nameInput = document.querySelector('#metadata-panel .prop-input');
    if (nameInput) nameInput.focus();
  }

  /** Undo + refresh all UI that mirrors the model. */
  _undo() {
    this.undoManager.undo();
    this._afterUndoRedo();
  }

  /** Redo + refresh all UI that mirrors the model. */
  _redo() {
    this.undoManager.redo();
    this._afterUndoRedo();
  }

  _afterUndoRedo() {
    this.floorRegionPanel.refresh();
    this.elevationSelector.refresh();
    this.metadataPanel.refresh();
    this.entityPlacer.rebuildFromModel();
    this.selectionManager.deselect();
    this._syncGameLook();
    this.toolbar.refresh();
  }

  // --- Songs: the song editor and quick audition --------------------------

  /**
   * Open an entity's song in the song editor (docked at the bottom), with
   * the camera moved so the entity shows in the viewport above it — its
   * creature lights there as Play sounds its song.
   */
  openSongEditor(entityId) {
    this.audition.stop();
    this._frameAboveEditor(entityId);
    this.songEditorModal.open(entityId);
  }

  /**
   * Play (or stop) an entity's song from the viewport: A, the entity menu's
   * Play Song, the controller. Its creature lights note by note.
   * @returns {boolean} whether it is playing now
   */
  auditionSong(entityId) {
    const entity = this.undoManager.getEntity(entityId);
    if (!entity || !SONG_ENTITY_TYPES.includes(entity.type)) return false;
    const { song } = entity.data || {};
    const empty = !song || (Array.isArray(song) ? song.length === 0 : !song.voices);
    if (empty) {
      this._showToast('No song to play yet — Edit Song writes one');
      return false;
    }
    return this.audition.toggle(entityId, song, this.undoManager.getMetadata().tempo || 120);
  }

  /** A: audition the song of what stands under the cursor (else the selection). */
  _auditionAtCursor() {
    const atCursor = this._entityIdAtCell(this.editorScene.getHoveredGrid());
    const id = atCursor !== null ? atCursor : this.selectionManager.selectedId;
    const entity = id !== null ? this.undoManager.getEntity(id) : null;
    if (!entity || !SONG_ENTITY_TYPES.includes(entity.type)) {
      if (this.audition.playingId !== null) this.audition.stop();
      else this._showToast('Put the cursor on a creature or gate to hear its song');
      return;
    }
    this.auditionSong(id);
  }

  /**
   * Move the camera (keeping its angle) so the entity sits in the upper part
   * of the viewport, clear of the docked song editor.
   */
  _frameAboveEditor(entityId) {
    const mesh = this.entityPlacer.getMeshById(entityId);
    if (!mesh || !mesh.position || !this.camera.position.sub) return;
    const { target } = this.controls;
    const offset = this.camera.position.clone().sub(target);
    // Toward the camera along the ground: the entity then shows above centre
    const toward = offset.clone();
    toward.y = 0;
    if (toward.lengthSq() > 0) toward.normalize();
    const along = offset.length() * 0.28;
    target.set(
      mesh.position.x + toward.x * along,
      this.editorScene.activeElevation * ELEVATION_HEIGHT,
      mesh.position.z + toward.z * along
    );
    this.camera.position.copy(target).add(offset);
    this.controls.update();
    this._requestFrame();
  }

  // --- The viewport's look (game / schematic) ----------------------------

  /** Which look the viewport draws: 'game' (default) or 'schematic'. */
  get look() {
    return this._look;
  }

  /** Switch between the game look and the schematic look (V), remembered. */
  toggleLook() {
    this.setLook(this._look === 'game' ? 'schematic' : 'game');
  }

  /** @param {'game'|'schematic'} look */
  setLook(look) {
    if (look !== 'game' && look !== 'schematic') return;
    this._look = look;
    saveLook(look);
    this._applyLook();
    this._showToast(look === 'game' ? 'Game look (V)' : 'Schematic look (V)', 'success');
  }

  _applyLook() {
    const game = this._look === 'game';
    this.gameLook.visible = game;
    this.entityPlacer.setLook(this._look);
    this.floorRegionPanel.setSlabsVisible(!game);
    const viewport = document.getElementById('editor-viewport');
    if (viewport) viewport.classList.toggle('look-game', game);
    if (this.toolbar && this.toolbar.setLook) this.toolbar.setLook(this._look);
    this._syncGameLook();
    this._requestFrame();
  }

  /**
   * Rebuild what changed in the game look. Skipped in the schematic look:
   * switching back syncs it, so a long schematic session builds nothing.
   */
  _syncGameLook() {
    if (!this.gameLook || this._look !== 'game') return;
    this.gameLook.sync(this.undoManager);
    this._outlineSelection();
  }

  /** The game look's selection outline follows the selection. */
  _outlineSelection() {
    if (!this.gameLook || this._look !== 'game') return;
    const id = this.selectionManager ? this.selectionManager.selectedId : null;
    this.gameLook.setSelected(id, this.undoManager);
  }

  // --- Play: the level in the game -----------------------------------------

  /**
   * Save the level and open the game on it, at its player spawn (the menu
   * skipped, the start gate kept: core/editorLink). In the one game tab the
   * editor reuses (a second Play reloads it, no pile of tabs) — or, with no
   * user gesture to open a tab (a controller press) or a blocked popup, in
   * this tab, the undo history kept for the way back (the game's pause menu:
   * "Back to Editor").
   * @param {{sameTab?: boolean}} [options]
   * @returns {Promise<boolean>} whether the game was opened
   */
  async play({ sameTab = false } = {}) {
    const { id } = this.undoManager.getMetadata();
    if (!id) {
      this._showToast('Name the puzzle to play it — its name gives it the file the game loads');
      this.metadataPanel.expand();
      return false;
    }
    if (!this.undoManager.getPlayerSpawn()) {
      this._showToast('Place the player spawn first (P) — the game starts you there');
      return false;
    }
    // The game reads the file: the last edit lands first (a puzzle never
    // written yet is written now)
    if (!this._puzzleCommitted && this._autoSaveTimer === null) this._autoSave();
    await this._settleAutoSave();
    if (!this._puzzleCommitted) {
      this._showToast("Couldn't save the puzzle, so the game can't load it — see the save status");
      return false;
    }
    const url = playUrl(id);
    const activated = !navigator.userActivation || navigator.userActivation.isActive;
    if (!sameTab && activated) {
      const tab = window.open(url, PLAY_WINDOW_NAME);
      if (tab) {
        this._showToast('Playing in the game tab — pause there for Back to Editor', 'success');
        return true;
      }
    }
    this._leaveForGame(url);
    return true;
  }

  /** The game replaces the editor in this tab: keep the undo history for the return. */
  _leaveForGame(url) {
    try {
      sessionStorage.setItem(
        HISTORY_KEY,
        JSON.stringify({
          model: JSON.stringify(serializePuzzle(this.undoManager)),
          history: this.undoManager.exportHistory(),
        })
      );
    } catch {
      // Too big or blocked: the level is saved; only undo history is lost
    }
    saveSession(this.undoManager);
    window.location.assign(url);
  }

  /**
   * Back from a same-tab Play: the undo history comes back if the level is
   * the one left (same file, unchanged).
   */
  _restoreHistory() {
    let stored = null;
    try {
      stored = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || 'null');
      sessionStorage.removeItem(HISTORY_KEY);
    } catch {
      return;
    }
    if (!stored || !stored.history) return;
    if (stored.model !== JSON.stringify(serializePuzzle(this.undoManager))) return;
    this.undoManager.importHistory(stored.history);
    this.toolbar.refresh();
  }

  /** A game tab this editor opened went "Back to Editor": show its level. */
  _onBackFromGame(event) {
    if (event.origin !== window.location.origin) return;
    const { data } = event;
    if (!data || data.type !== BACK_TO_EDITOR_MESSAGE) return;
    const { id } = this.undoManager.getMetadata();
    if (data.puzzleId && data.puzzleId !== id && this.puzzlePicker.hasLevel(data.puzzleId)) {
      this.puzzlePicker.open(data.puzzleId);
    }
    this._showToast('Back from the game', 'success');
  }

  // --- Git controls (dev-only; see ui/GitPanel.js + io/gitControls.js) ---
  // Each one that reads or rewrites the puzzle files waits for the last
  // edit's autosave to land first, so git works on the files as edited.

  /** Commit the staged puzzle files. Throws (surfaced by GitPanel) on failure. */
  async _gitCommit(message) {
    await this._settleAutoSave();
    const result = await gitCommit(message);
    return result.summary || 'Committed';
  }

  /** Pull (whole repo), then reload the open puzzle in case it changed. */
  async _gitPull() {
    await this._settleAutoSave();
    const result = await gitPull();
    await this._reloadCurrentPuzzleFromDisk();
    return result.summary || 'Pulled';
  }

  /** Push (whole repo). Reports git's actual result (ref update or no-op). */
  async _gitPush() {
    const result = await gitPush();
    return result.summary || 'Pushed';
  }

  /**
   * Discard uncommitted puzzle edits (stashed, so it's undoable), reload the
   * open puzzle from the reverted files, and arm the one-shot Cmd-Z restore.
   */
  async _gitRevert() {
    const reverted = await this._rewriteFilesWithGit(async () => !(await gitRevert()).nothing);
    if (!reverted) return 'Nothing to revert';
    this._pendingUnrevert = true;
    return 'Reverted — ⌘Z to restore';
  }

  /** Restore the last reverted puzzle edits (git stash pop) and reload. */
  async _gitUnrevert() {
    this._pendingUnrevert = false;
    try {
      await this._rewriteFilesWithGit(async () => {
        await gitUnrevert();
        return true;
      });
      if (this.gitPanel) await this.gitPanel.showResult('Restored reverted edits');
    } catch (err) {
      if (this.gitPanel) await this.gitPanel.showResult(err.message || String(err), true);
    }
  }

  /**
   * Run `op`, a git op that rewrites the puzzle files under the open model,
   * and reload the open puzzle from them if it resolves true (false: it
   * changed nothing). The last edit is written first, so git works on it (a
   * revert's stash holds it, or ⌘Z couldn't bring it back). Autosave is held
   * for any later edit until the reload: it is to the model git is
   * replacing, and written back it would undo git's change to the open
   * puzzle (re-dirty what a revert reverted, overwrite what ⌘Z restored) and
   * be read straight back by the reload. It goes with that model; if git
   * changed nothing, or failed, it is saved as usual.
   * @param {() => Promise<boolean>} op
   * @returns {Promise<boolean>} whether the files were rewritten
   */
  async _rewriteFilesWithGit(op) {
    const hold = { edited: false };
    this._autoSaveHold = hold;
    let rewritten = false;
    try {
      await this._settleAutoSave();
      rewritten = await op();
      if (rewritten) await this._reloadCurrentPuzzleFromDisk();
      return rewritten;
    } finally {
      this._autoSaveHold = null;
      if (hold.edited && !rewritten) this._scheduleAutoSave();
    }
  }

  /**
   * Re-read the open puzzle from disk after a git op changed the files.
   * Refreshes the picker's manifest list first (files may have appeared or
   * vanished); if the open puzzle's file is gone (e.g. a new puzzle reverted
   * away), drops to a fresh, unsaved puzzle.
   */
  async _reloadCurrentPuzzleFromDisk() {
    const { id } = this.undoManager.getMetadata();
    await this.puzzlePicker.refresh(id);
    if (id && this.puzzlePicker.hasLevel(id)) {
      await this.puzzlePicker.open(id);
    } else if (id) {
      this._puzzleCommitted = false;
      this._applyRestoredModel(new EditorPuzzleModel());
    }
  }

  _setupRenderer() {
    const container = document.getElementById('editor-viewport');
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setClearColor(0x0a0a1a);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(10, 20, 10);
    this.scene.add(directional);
  }

  _setupCamera() {
    const container = document.getElementById('editor-viewport');
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    // Isometric-ish angle looking at grid center
    const gridCenter = (this.model.getMetadata().gridSize * 3) / 2;
    this.camera.position.set(gridCenter + 30, 40, gridCenter + 30);
    this.camera.lookAt(gridCenter, 0, gridCenter);
  }

  _setupControls() {
    const gridCenter = (this.model.getMetadata().gridSize * 3) / 2;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(gridCenter, 0, gridCenter);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.update();
  }

  /** Raycast the viewport event position against entity meshes. */
  _entityIdAtEvent(e) {
    const container = document.getElementById('editor-viewport');
    const rect = container.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), this.camera);
    const hits = raycaster.intersectObjects(this.entityPlacer.getAllMeshes());
    if (hits.length === 0) return null;
    return this.entityPlacer.getEntityIdFromMesh(hits[0].object);
  }

  _setupViewportClick() {
    const container = document.getElementById('editor-viewport');

    // Track where the pointer went down so a drag-release (camera rotate/pan)
    // can be told apart from a real click. A programmatic .click() has no
    // preceding mousedown, so it always counts as a click.
    let pointerDownXY = null;
    container.addEventListener('mousedown', (e) => {
      pointerDownXY = { x: e.clientX, y: e.clientY };
    });

    container.addEventListener('click', (e) => {
      const dragged =
        pointerDownXY &&
        Math.hypot(e.clientX - pointerDownXY.x, e.clientY - pointerDownXY.y) > CLICK_DRAG_PX;
      pointerDownXY = null;
      // A drag that ends over the viewport still fires a click — ignore it so
      // rotating/panning never selects a tile.
      if (dragged) return;

      // Teleport pick mode: the next click chooses the link's target gate
      if (this._linkPickSourceId !== null) {
        this._handleLinkPickClick(e);
        return;
      }

      // Move the cursor to the clicked tile (mouse hover never moves it).
      const grid = this.editorScene.gridFromEvent(e, this.camera);
      if (!grid) return;

      // Floor-region placement is an explicit mode that still consumes clicks.
      if (this.floorRegionPanel.handleGridClick(grid.x, grid.z)) {
        return;
      }

      // A plain click only SELECTS the tile: the cursor is now on it. Select
      // any entity there so the property panel reflects it. Entity PLACEMENT is
      // keyboard-only now (letter keys) — a click never creates anything.
      const entityId = this._entityIdAtCell(grid);
      if (entityId !== null) this.selectionManager.select(entityId);
      else this.selectionManager.deselect();
    });

    // Double-click a creature/gate/fountain to open its song directly
    // (mouse-friendly alternative to the right-click menu).
    container.addEventListener('dblclick', (e) => {
      const entityId = this._entityIdAtEvent(e);
      if (entityId === null) return;
      const entity = this.undoManager.getEntity(entityId);
      if (entity && SONG_ENTITY_TYPES.includes(entity.type)) {
        this.selectionManager.select(entityId);
        this.openSongEditor(entityId);
      }
    });

    // Right-click context menu
    container.addEventListener('contextmenu', (e) => {
      e.preventDefault();

      const entityId = this._entityIdAtEvent(e);
      if (entityId === null) {
        this.contextMenu.hide();
        return;
      }
      const rect = container.getBoundingClientRect();
      this._openEntityContextMenu(entityId, e.clientX - rect.left, e.clientY - rect.top);
    });
  }

  /** Build the context-menu items for an entity (song editing + gate links). */
  _buildEntityContextItems(entityId, entity) {
    const items = [];
    if (entity && SONG_ENTITY_TYPES.includes(entity.type)) {
      items.push({
        label: 'Edit Song',
        action: () => this.openSongEditor(entityId),
      });
      items.push({
        label: this.audition.playingId === entityId ? 'Stop Song' : 'Play Song',
        action: () => this.auditionSong(entityId),
      });
    }

    // Gate linking (portals / in-level teleport doors)
    if (entity && entity.type === 'gate') {
      const { link } = entity.data;
      if (link) {
        items.push({ label: `Linked → ${link.puzzleId}/${link.gateId}`, disabled: true });
      }
      items.push({
        label: 'Teleport: click another gate…',
        action: () => this._startLinkPick(entityId),
      });
      items.push({
        label: 'Link by id…',
        action: () => this._linkById(entityId),
      });
      if (link) {
        items.push({
          label: 'Clear Link',
          action: () => {
            clearLink(this.undoManager, entityId)
              .then(() => {
                this._refreshGateLinkBadges();
                this.propertyPanel.show(entityId);
                this._showToast('Link cleared (both sides)', 'success');
              })
              .catch((err) => this._showToast(err.message));
          },
        });
      }
    }
    return items;
  }

  /**
   * Select the entity and open its context menu at the given container-pixel
   * position. Shared by right-click and the keyboard (Enter) path. Orbit
   * controls are disabled while the menu is up so arrow keys don't pan.
   */
  _openEntityContextMenu(entityId, px, py) {
    this.selectionManager.select(entityId);
    const entity = this.undoManager.getEntity(entityId);
    const items = this._buildEntityContextItems(entityId, entity);
    if (items.length === 0) return;

    this.controls.enabled = false;
    this.contextMenu.show(px, py, items);
    const checkHidden = () => {
      if (!this.contextMenu.isOpen) {
        this.controls.enabled = true;
      } else {
        requestAnimationFrame(checkHidden);
      }
    };
    requestAnimationFrame(checkHidden);
  }

  /** The id of the first entity on a cell at the active elevation, or null. */
  _entityIdAtCell(cell) {
    const elevation = this.editorScene.activeElevation;
    const ents = this.undoManager.getEntitiesAt(cell.x, elevation, cell.z);
    return ents.length > 0 ? ents[0].id : null;
  }

  /** Enter: open the context menu for whatever entity is under the cursor. */
  _openContextMenuAtCursor() {
    const cell = this.editorScene.getHoveredGrid();
    const entityId = this._entityIdAtCell(cell);
    if (entityId === null) return;
    const { x, y } = this.editorScene.cellToContainerXY(cell, this.camera);
    this._openEntityContextMenu(entityId, x, y);
  }

  /**
   * Grid-relative cursor step for an arrow key. The mapping follows the camera:
   * Up/Down move along whichever world axis reads as "into/out of the screen"
   * and Left/Right along the other, so the arrows always match how the grid
   * looks after orbiting. Right and forward are assigned COMPLEMENTARY axes so
   * that at a 45° view (where each is equally close to both axes) the cursor can
   * still reach every cell.
   */
  _cursorDeltaForArrow(key) {
    this.camera.updateMatrixWorld();
    const e = this.camera.matrixWorld.elements;
    const rightX = e[0]; // camera +X (screen right), projected to the ground
    const rightZ = e[2];
    const fwdX = -e[8]; // camera forward (into screen), projected to the ground
    const fwdZ = -e[10];

    let right;
    let forward;
    if (Math.abs(rightX) >= Math.abs(rightZ)) {
      right = { dx: Math.sign(rightX), dz: 0 };
      forward = { dx: 0, dz: Math.sign(fwdZ) };
    } else {
      right = { dx: 0, dz: Math.sign(rightZ) };
      forward = { dx: Math.sign(fwdX), dz: 0 };
    }

    switch (key) {
      case 'ArrowRight':
        return right;
      case 'ArrowLeft':
        return { dx: -right.dx || 0, dz: -right.dz || 0 };
      case 'ArrowUp':
        return forward;
      case 'ArrowDown':
        return { dx: -forward.dx || 0, dz: -forward.dz || 0 };
      default:
        return null;
    }
  }

  /**
   * Shift+Arrow: move the entity (or player spawn) on the cursor cell by one
   * cell in the arrow direction. The cursor follows so you can keep nudging.
   * Refused if the target is off-grid or already occupied.
   */
  _moveEntityAtCursor(delta) {
    const cell = this.editorScene.getHoveredGrid();
    const elevation = this.editorScene.activeElevation;
    const tx = cell.x + delta.dx;
    const tz = cell.z + delta.dz;
    const { gridSize } = this.undoManager.getMetadata();
    if (tx < 0 || tz < 0 || tx >= gridSize || tz >= gridSize) return;

    const entityId = this._entityIdAtCell(cell);
    if (entityId !== null) {
      const movingType = this.undoManager.getEntity(entityId).type;
      if (this._isCellOccupied(tx, elevation, tz, movingType)) {
        this._showToast('That cell is already occupied');
        return;
      }
      this.entityPlacer.setEntityPosition(entityId, tx, tz, elevation);
      this.editorScene.moveCursor(delta.dx, delta.dz);
      this._selectAndShow(entityId);
      return;
    }

    const spawn = this.undoManager.getPlayerSpawn();
    if (spawn && spawn.x === cell.x && spawn.y === elevation && spawn.z === cell.z) {
      if (this._isCellOccupied(tx, elevation, tz, 'player')) {
        this._showToast('That cell is already occupied');
        return;
      }
      // The spawn is a singleton; placing it again just relocates it.
      this.entityPlacer.placeEntity('player', tx, tz, elevation);
      this.editorScene.moveCursor(delta.dx, delta.dz);
    }
  }

  /**
   * Shift+Option+Up/Down: move the entity (or player spawn) on the cursor cell
   * to the next storey up/down, and follow it there (the active elevation
   * switches so it stays under the cursor). Refused if there is no storey that
   * way or the target cell is occupied.
   */
  _moveEntityLayer(dir) {
    const cell = this.editorScene.getHoveredGrid();
    const current = this.editorScene.activeElevation;
    const available = availableElevations(this.undoManager.getFloors());
    const targetIdx = available.indexOf(current) + dir;
    if (targetIdx < 0 || targetIdx >= available.length) return; // no storey that way
    const targetElev = available[targetIdx];

    const entityId = this._entityIdAtCell(cell); // at the current elevation
    if (entityId !== null) {
      const movingType = this.undoManager.getEntity(entityId).type;
      if (this._isCellOccupied(cell.x, targetElev, cell.z, movingType)) {
        this._showToast('That cell is already occupied');
        return;
      }
      this.entityPlacer.setEntityPosition(entityId, cell.x, cell.z, targetElev);
      this.elevationSelector.step(dir); // follow the entity to its new storey
      this._selectAndShow(entityId);
      return;
    }

    const spawn = this.undoManager.getPlayerSpawn();
    if (spawn && spawn.x === cell.x && spawn.y === current && spawn.z === cell.z) {
      if (this._isCellOccupied(cell.x, targetElev, cell.z, 'player')) {
        this._showToast('That cell is already occupied');
        return;
      }
      this.entityPlacer.placeEntity('player', cell.x, cell.z, targetElev);
      this.elevationSelector.step(dir);
    }
  }

  // Highest storey the keyboard may climb to (guards a runaway Option+Up hold).
  static get MAX_DRAFT_STOREY() {
    return 9;
  }

  /**
   * Option+Up/Down: move the active storey by one. Landing on a storey that
   * already has a floor (or the ground, E0) navigates there normally. Landing
   * on an EMPTY upper layer arms "draft-floor" mode — a highlighted rectangle
   * you size with the arrows and commit with Enter. Climbing further through
   * empty layers just retargets the draft, so you can skip layers.
   */
  _navigateLayer(dir) {
    const target = this.editorScene.activeElevation + dir;
    if (target < 0 || target > EditorApp.MAX_DRAFT_STOREY) return;

    const floors = this.undoManager.getFloors();
    const targetHasFloor = target === 0 || floors.some((f) => f.elevation === target);

    this.editorScene.activeElevation = target; // repositions the grid + cursor
    if (targetHasFloor) {
      this._exitFloorDraft();
      this.elevationSelector.syncTo(target);
    } else {
      this._enterOrAdvanceFloorDraft(target);
    }
    this._requestFrame();
  }

  /** Arm (or retarget) the draft-floor rectangle, anchored at the cursor. */
  _enterOrAdvanceFloorDraft(elevation) {
    if (!this._floorDraft) {
      const cursor = this.editorScene.getHoveredGrid();
      this._floorDraft = { anchor: { x: cursor.x, z: cursor.z }, elevation };
    } else {
      this._floorDraft.elevation = elevation;
    }
    this.editorScene.setFloorDraft(this._floorDraft.anchor, elevation);
  }

  /** Enter in draft mode: create the floor from the anchor→cursor rectangle. */
  _commitFloorDraft() {
    const { elevation, anchor } = this._floorDraft;
    const cursor = this.editorScene.getHoveredGrid();
    const x1 = Math.min(anchor.x, cursor.x);
    const z1 = Math.min(anchor.z, cursor.z);
    const x2 = Math.max(anchor.x, cursor.x);
    const z2 = Math.max(anchor.z, cursor.z);
    // Drafting only happens on empty layers, so overlap is not expected — guard
    // anyway (a blocked action deserves a toast).
    const overlap = this.undoManager
      .getFloors()
      .some(
        (f) => f.elevation === elevation && x1 <= f.x2 && x2 >= f.x1 && z1 <= f.z2 && z2 >= f.z1
      );
    if (overlap) {
      this._showToast('Overlaps an existing floor — floors can’t stack');
      return;
    }
    this.undoManager.addFloor(elevation, x1, z1, x2, z2);
    this.floorRegionPanel.refresh(); // rebuild floor meshes + sidebar list
    this.elevationSelector.syncTo(elevation); // this storey now exists
    this._exitFloorDraft();
  }

  _exitFloorDraft() {
    if (!this._floorDraft) return;
    this._floorDraft = null;
    this.editorScene.clearFloorDraft();
  }

  /** Letter key: place an entity of `type` at the cursor cell (refuse if full). */
  _placeAtCursor(type) {
    const cell = this.editorScene.getHoveredGrid();
    const elevation = this.editorScene.activeElevation;
    if (this._isCellOccupied(cell.x, elevation, cell.z, type)) {
      this._showToast('That cell is already occupied');
      return;
    }
    const id = this.entityPlacer.placeEntity(type, cell.x, cell.z, elevation);
    if (id !== null) this.selectionManager.select(id); // player spawn returns null
    // No toast: the placed entity is visible.
  }

  /** Delete/Backspace: remove whatever occupies the cursor cell. */
  _deleteAtCursor() {
    const cell = this.editorScene.getHoveredGrid();
    const elevation = this.editorScene.activeElevation;
    const entityId = this._entityIdAtCell(cell);
    if (entityId !== null) {
      this.selectionManager.select(entityId);
      this._deleteSelectedEntity();
      return;
    }
    const spawn = this.undoManager.getPlayerSpawn();
    if (spawn && spawn.x === cell.x && spawn.y === elevation && spawn.z === cell.z) {
      this.entityPlacer.clearPlayerSpawn(); // the marker disappears — no toast needed
      return;
    }
    // Nothing occupies the cell: fall through to removing the floor region here.
    this._deleteFloorAtCursor(cell, elevation);
  }

  /**
   * Delete on an otherwise-empty cell: remove the WHOLE floor region the cursor
   * sits in at the active elevation (floors are rectangles — no per-tile holes).
   * Refuses while any entity rests on the region, so an elevated creature/gate
   * never gets orphaned in mid-air.
   */
  _deleteFloorAtCursor(cell, elevation) {
    const floors = this.undoManager.getFloors();
    const index = floors.findIndex(
      (f) =>
        f.elevation === elevation &&
        cell.x >= f.x1 &&
        cell.x <= f.x2 &&
        cell.z >= f.z1 &&
        cell.z <= f.z2
    );
    if (index === -1) return; // no floor here (e.g. the implicit ground)
    if (this._floorHasEntities(floors[index])) {
      this._showToast('Clear entities off the floor first');
      return;
    }
    this.undoManager.removeFloor(index);
    this.floorRegionPanel.refresh(); // rebuild floor meshes + sidebar list
    this._requestFrame();
  }

  /** True when any entity rests ON the given floor region (its own elevation). */
  _floorHasEntities(floor) {
    return this.undoManager
      .getEntities()
      .some(
        (e) =>
          e.y === floor.elevation &&
          e.x >= floor.x1 &&
          e.x <= floor.x2 &&
          e.z >= floor.z1 &&
          e.z <= floor.z2
      );
  }

  /**
   * `f`: arm a floor draft at the active elevation (then arrows size it, Enter
   * commits — the same flow as climbing onto an empty layer). Only above the
   * ground and only on a cell that doesn't already carry a floor, so it can
   * start a SECOND region on a storey that already has one (which climbing to
   * an occupied layer can't reach).
   */
  _startFloorAtCursor() {
    const elevation = this.editorScene.activeElevation;
    if (elevation < 1) {
      this._showToast('Floors sit above the ground');
      return;
    }
    const cell = this.editorScene.getHoveredGrid();
    const onFloor = this.undoManager
      .getFloors()
      .some(
        (f) =>
          f.elevation === elevation &&
          cell.x >= f.x1 &&
          cell.x <= f.x2 &&
          cell.z >= f.z1 &&
          cell.z <= f.z2
      );
    if (onFloor) {
      this._showToast('There’s already a floor here');
      return;
    }
    this._enterOrAdvanceFloorDraft(elevation);
    this._requestFrame();
  }

  /** True when the key event targets a text field — never hijack typing. */
  // eslint-disable-next-line class-methods-use-this
  _isEditableTarget(e) {
    const t = e.target;
    if (!t) return false;
    const tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
  }

  _setupDrag() {
    const container = document.getElementById('editor-viewport');
    let dragStarted = false;

    container.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Left click only
      if (this.entityToolbar.activeTool) return; // Don't drag while placing
      if (this.selectionManager.selectedId === null) return;
      dragStarted = true;
    });

    container.addEventListener('mousemove', (e) => {
      if (!dragStarted) return;

      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (!this.entityDragger.isDragging) {
        // Start dragging on first move after mousedown
        this.entityDragger.startDrag(this.selectionManager.selectedId);
        this.controls.enabled = false; // Disable orbit while dragging
      }

      const { gridSize } = this.undoManager.getMetadata();
      this.entityDragger.updateDrag(mouseX, mouseY, gridSize, this.editorScene.activeElevation);
    });

    const endDrag = () => {
      if (this.entityDragger.isDragging) {
        const { gridSize } = this.undoManager.getMetadata();
        this.entityDragger.endDrag(gridSize, this.editorScene.activeElevation);
        this.controls.enabled = true; // Re-enable orbit
        // Refresh property panel with updated position
        if (this.selectionManager.selectedId !== null) {
          this.propertyPanel.show(this.selectionManager.selectedId);
        }
      }
      dragStarted = false;
    };

    container.addEventListener('mouseup', endDrag);
    container.addEventListener('mouseleave', endDrag);
  }

  _setupKeyboard() {
    this._onKeyDown = (e) => {
      // Modals take precedence — they own the keyboard while open (each closes
      // itself on Escape). An open context menu owns arrows/Enter/Escape too.
      if (this.songEditorModal && this.songEditorModal.isOpen) return;
      if (this.worldOverview && this.worldOverview.isOpen) return;
      if (this.contextMenu && this.contextMenu.isOpen) return;

      const { key } = e;

      // Undo / redo work regardless of focus (before the text-field guard).
      if ((e.metaKey || e.ctrlKey) && key.toLowerCase() === 'z') {
        e.preventDefault();
        // A just-performed git revert takes priority: plain Cmd-Z restores the
        // reverted puzzle edits (git stash pop) rather than a model undo.
        if (!e.shiftKey && this._pendingUnrevert) {
          this._gitUnrevert();
          return;
        }
        if (e.shiftKey) this._redo();
        else this._undo();
        return;
      }

      // Cmd/Ctrl+Enter plays the level in the game (from any field too).
      if ((e.metaKey || e.ctrlKey) && key === 'Enter') {
        e.preventDefault();
        this.play();
        return;
      }

      // Escape cancels the active mode (works even from a focused field).
      if (key === 'Escape') {
        this.floorRegionPanel.cancelPlacing();
        this.entityToolbar.deselect();
        this._cancelLinkPick('Teleport cancelled');
        this.selectionManager.deselect();
        this._exitFloorDraft();
        return;
      }

      // Everything below is grid navigation — never hijack typing.
      if (this._isEditableTarget(e)) return;

      // Option/Alt + Up/Down changes the active layer; add Shift to carry the
      // entity on the cursor cell up/down a layer with it.
      if (e.altKey && !e.metaKey && !e.ctrlKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
        e.preventDefault();
        const dir = key === 'ArrowUp' ? 1 : -1;
        if (e.shiftKey) this._moveEntityLayer(dir);
        else this._navigateLayer(dir);
        return;
      }

      // Let other modifier combos (browser/OS shortcuts) pass through — but
      // plain Shift stays live for Shift+Arrow entity moves below.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (key) {
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault();
          const delta = this._cursorDeltaForArrow(key);
          if (!delta) return;
          // Shift+Arrow moves the entity on the cursor cell; Arrow moves the cursor.
          if (e.shiftKey) this._moveEntityAtCursor(delta);
          else this.editorScene.moveCursor(delta.dx, delta.dz);
          return;
        }
        case 'Enter':
          e.preventDefault();
          if (this._floorDraft) this._commitFloorDraft();
          else this._openContextMenuAtCursor();
          return;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          this._deleteAtCursor();
          return;
        case 'f':
        case 'F':
          e.preventDefault();
          this._startFloorAtCursor();
          return;
        case 'v':
        case 'V':
          e.preventDefault();
          this.toggleLook();
          return;
        case 'a':
        case 'A':
          e.preventDefault();
          this._auditionAtCursor();
          return;
        default:
          break;
      }

      const placeType = PLACE_KEYS[key.toLowerCase()];
      if (placeType) {
        e.preventDefault();
        this._placeAtCursor(placeType);
      }
    };
    document.addEventListener('keydown', this._onKeyDown);
  }

  /**
   * On-demand rendering. The editor scene is static while idle, so instead of a
   * 60fps loop we render only when something changes. Every invalidation
   * schedules ONE frame; `controls.update()` re-invalidates while damping is
   * still settling, so a camera fling animates and then stops. Idle → no
   * frames, no CPU (was rendering the whole scene 60×/sec for nothing).
   */
  _requestFrame() {
    this._dirty = true;
    if (this._frameId == null) {
      this._frameId = requestAnimationFrame((now) => this._renderFrame(now));
    }
  }

  _renderFrame(now = 0) {
    this._frameId = null;
    if (!this._dirty) return;
    this._dirty = false;
    const dt = this._lastFrameAt == null ? 0 : (now - this._lastFrameAt) / 1000;
    this._lastFrameAt = now;
    this.controls.update(); // may emit 'change' (damping) → schedules the next frame
    // The game look moves on its own (the sky, the creatures' wobble, a
    // previewed song): while it shows, every frame asks for the next
    if (this._look === 'game' && this.gameLook.animates) {
      this.gameLook.update(dt);
      this._requestFrame();
    }
    this.editorScene.update();
    this.ghostPreview.update(this.editorScene.getHoveredGrid(), this.editorScene.activeElevation);
    this._updateHud();
    this.renderer.render(this.scene, this.camera);
  }

  /** Re-render on camera moves, any user input, and window resizes. Model and
   *  selection changes invalidate through their own hooks. */
  _setupRenderInvalidation() {
    const invalidate = () => this._requestFrame();
    this._invalidateRender = invalidate;
    // Keys typed into the song editor or the world map change nothing the
    // viewport draws (the editor's keyboard handler ignores them too; a song
    // edit still invalidates through the model hook), so they don't redraw it.
    this._invalidateOnKey = () => {
      if (this.songEditorModal.isOpen || this.worldOverview.isOpen) return;
      this._requestFrame();
    };
    this.controls.addEventListener('change', invalidate);
    document.addEventListener('keydown', this._invalidateOnKey);
    document.addEventListener('pointerdown', invalidate);
    document.addEventListener('pointerup', invalidate);
    document.addEventListener('wheel', invalidate, { passive: true });
  }

  _onResize() {
    const container = document.getElementById('editor-viewport');
    const w = container.clientWidth;
    const h = container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this._requestFrame();
  }

  dispose() {
    if (this._frameId) cancelAnimationFrame(this._frameId);
    document.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('message', this._onMessage);
    if (this._invalidateRender) {
      this.controls.removeEventListener?.('change', this._invalidateRender);
      document.removeEventListener('keydown', this._invalidateOnKey);
      document.removeEventListener('pointerdown', this._invalidateRender);
      document.removeEventListener('pointerup', this._invalidateRender);
      document.removeEventListener('wheel', this._invalidateRender);
    }
    clearTimeout(this._validationTimer);
    clearTimeout(this._autoSaveTimer);
    clearTimeout(this._toastTimer);
    if (this._stopGitRefresh) this._stopGitRefresh();
    this.songEditorModal.dispose();
    this.audition.dispose();
    this.worldOverview.dispose();
    this.contextMenu.dispose();
    this.ghostPreview.dispose();
    this.gameLook.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
