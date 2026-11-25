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
import ElevationSelector, { MAX_STOREY, MIN_STOREY } from 'editor/ui/ElevationSelector';
import TileSlabs from 'editor/viewport/TileSlabs';
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
import { loadLook, saveLook, loadSharp, saveSharp } from 'editor/io/lookPreference';
import SongAudition from 'editor/audio/SongAudition';
import { editorRequest } from 'core/playLink';
import PlayPreview from 'editor/play/PlayPreview';
import { ELEVATION_HEIGHT, WORLD_SCALE } from 'core/constants';
import InputDevice from 'core/InputDevice';
import EditorGamepad from 'editor/input/EditorGamepad';
import PadFocus from 'editor/input/PadFocus';
import PadLegend from 'editor/ui/PadLegend';
import { orbit, zoom, pan, glideToward } from 'editor/viewport/cameraMoves';
import { gridToWorld, levelBounds, levelCenterCell, snapToGrid } from 'editor/viewport/gridUtils';

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
// A click whose pointer moved more than this many pixels since mousedown is a
// drag (camera rotate/pan), not a selection.
const CLICK_DRAG_PX = 4;
// The game look's CALM motion (the sky's drift, the creatures' bob and
// wobble, the waystones' breathing, the gates' shimmer: all seconds-long) is
// drawn at this rate; lightning, a lit creature and anything the user does
// draw every frame (EditorApp._requestLookFrame).
export const CALM_FRAME_MS = 1000 / 30;
// A vsync this close to CALM_FRAME_MS after the last frame is on time
// (vsync timestamps jitter; a 120 Hz display lands on 33.3 ms too)
const CALM_SLACK_MS = 4;

export default class EditorApp {
  constructor() {
    this.model = new EditorPuzzleModel();
    this.undoManager = new UndoManager(this.model);
    this.scene = null;
    this.renderer = null;
    this.camera = null;
    this.controls = null;
    this._frameId = null; // pending on-demand render frame
    this._lookCalm = false; // the pending frame is only the game look's calm motion
    this._dirty = false;
    // One-shot flag: set after a git revert so the next Cmd-Z restores the
    // reverted puzzle edits (git stash pop) instead of doing a model undo.
    // Any model mutation clears it (see the setOnChange hook).
    this._pendingUnrevert = false;
    // The floor range being built while ✕ / Enter is held on a cell with no
    // floor: { anchor: {x,z}, elevation }; else null (confirmDown/confirmUp)
    this._floorRange = null;
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
    this._sharp = loadSharp();
    this._setupRenderer();
    this._setupCamera();
    this._setupControls();
    this.editorScene = new EditorScene(this.scene, this.undoManager);
    this.elevationSelector = new ElevationSelector(
      document.getElementById('elevation-panel'),
      this.editorScene,
      this.undoManager
    );
    // The floor tiles in the schematic look (the game look draws its own)
    this.tileSlabs = new TileSlabs(this.scene);
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
    const previewStop = (entityId) => {
      this.gameLook.silence(entityId);
      this._requestFrame(); // its fade starts now, every frame
    };
    this.songEditorModal = new SongEditorModal(
      document.getElementById('editor-root'),
      this.undoManager,
      {
        onNote: previewNote,
        onStop: previewStop,
        // However it closes, the view goes back to where it was before the
        // modal framed the entity
        onClose: () => this._restoreViewBeforeSong(),
      }
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
      onGame: () => this.openGame(),
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
      this._syncTileSlabs();
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
    this._setupGamepad();
    // Play: the level in the game, in this tab (editor/play/PlayPreview)
    const app = this;
    this.preview = new PlayPreview({
      camera: this.camera,
      // Read when used: sharp rendering builds both again (setSharp)
      get renderer() {
        return app.renderer;
      },
      get controls() {
        return app.controls;
      },
      requestFrame: () => this._requestFrame(),
      suspend: () => this._standAside(),
      resume: () => this._comeBack(),
      toast: (message) => this._showToast(message),
      fitView: () => this._onResize(),
    });
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
    const storey = this.editorScene.activeElevation;
    const bare = grid && !this.undoManager.hasTile(grid.x, storey, grid.z);
    const cellText = grid
      ? `Cell (${grid.x}, ${grid.z}) · E${storey}${bare ? ' · no floor (✕ / Enter builds it)' : ''}`
      : '';
    const tool = this.entityToolbar ? this.entityToolbar.activeTool : null;
    const toolText = tool
      ? `Placing ${tool} — Enter (or ✕) places it at the cursor; Esc cancels`
      : '';
    const pickText =
      this._linkPickSourceId !== null ? 'Teleport: click another gate to link (Esc cancels)' : '';
    const draftText = this._floorRange
      ? `Building floor E${this._floorRange.elevation} — move to size it, let go to build, Esc cancels`
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
    if (requested && (await this._openRequestedPuzzle(requested))) return;
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
    this.editorScene.recenterCursor();
    this.entityPlacer.rebuildFromModel();
    this._syncTileSlabs();
    this._cancelFloorRange();
    this.elevationSelector.syncTo(0);
    this.metadataPanel.refresh();
    this.selectionManager.deselect();
    this._syncGameLook();
    this.resetCamera();
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

  /** The schematic look's floor slabs follow the tiles (and the walls and ramps closing an edge). */
  _syncTileSlabs() {
    const walls = [];
    const ramps = [];
    for (const e of this.undoManager.getEntities()) {
      if (e.type === 'wall') walls.push({ x: e.x, y: e.y, z: e.z });
      else if (e.type === 'ramp') {
        ramps.push({ x: e.x, y: e.y, z: e.z, direction: (e.data && e.data.direction) || 'north' });
      }
    }
    this.tileSlabs.sync(this.undoManager.getTiles(), { walls, ramps });
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
    this._syncTileSlabs();
    this.elevationSelector.refresh();
    this.metadataPanel.refresh();
    this.entityPlacer.rebuildFromModel();
    this.selectionManager.deselect();
    this._syncGameLook();
    this.toolbar.refresh();
  }

  // --- The controller (editor/input/EditorGamepad) ------------------------

  _setupGamepad() {
    // The sidebar and the world map, stepped through with the d-pad
    this.panelFocus = new PadFocus(() => document.getElementById('editor-sidebar'));
    this.mapFocus = new PadFocus(() =>
      this.worldOverview.isOpen ? document.querySelector('.world-modal') : null
    );
    this._panelMode = false;
    // Which device is in hand: the legend shows the pad's glyphs, or hides
    InputDevice.initialize();
    this.padLegend = new PadLegend(document.body);
    this._stopDeviceWatch = InputDevice.onChange(() => this.onPadChange());
    this.gamepad = new EditorGamepad(this);
    this.gamepad.start();
  }

  /** What the controller is driving now: song, menu, map, panel or viewport. */
  padContext() {
    if (this.songEditorModal.isOpen) {
      return this.songEditorModal.panelOpen ? 'song-options' : 'song';
    }
    if (this.contextMenu.isOpen) return 'menu';
    if (this.worldOverview.isOpen) return 'map';
    if (this._panelMode) return 'panel';
    return 'viewport';
  }

  /** Keep the controller legend in step with the device, context and modifiers. */
  onPadChange() {
    if (!this.padLegend) return;
    const mods = this.gamepad ? this.gamepad.modifiers : {};
    this.padLegend.update(InputDevice.family, this.padContext(), mods);
  }

  /**
   * Press one of the editor's keys for the controller: a synthetic keydown
   * (marked fromGamepad, as the game's Gamepad sends) to the same listeners
   * the keyboard reaches, so the two can't drift apart.
   * @param {string} key
   * @param {{shiftKey?: boolean, altKey?: boolean, ctrlKey?: boolean}} [mods]
   */
  pressKey(key, mods = {}) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
    event.fromGamepad = true;
    document.dispatchEvent(event);
  }

  /** L1 / R1: the previous / next type to place (Cross places it). */
  cyclePalette(step) {
    const tool = this.entityToolbar.cycle(step);
    const name = tool === 'player' ? 'player spawn' : tool;
    this._showToast(`Placing: ${name}`, 'success');
    this._requestFrame();
  }

  /**
   * Cross pressed (the pad): on a cell with no floor at the active storey,
   * start building floor there (held and moved: a range; let go builds it);
   * else on an empty cell place the chosen type; on an entity select it,
   * and on the selected one open its menu.
   */
  padConfirm() {
    if (this._startFloorRangeAtCursor()) return;
    const cell = this.editorScene.getHoveredGrid();
    const entityId = this._entityIdAtCell(cell);
    const tool = this.entityToolbar.activeTool;
    if (
      entityId === null ||
      (tool === 'waystone' &&
        !this._isCellOccupied(cell.x, this.editorScene.activeElevation, cell.z, tool))
    ) {
      if (tool) this._placeAtCursor(tool);
      else this._showToast('Choose what to place with L1 / R1, then ✕ places it');
      return;
    }
    if (this.selectionManager.selectedId === entityId) this._openContextMenuAtCursor();
    else this._selectAndShow(entityId);
  }

  /** Cross let go (the pad): a floor range being built is built. */
  padConfirmEnd() {
    this._commitFloorRange();
  }

  /** The pad went with Cross held: the floor range is called off. */
  cancelFloorRange() {
    this._cancelFloorRange();
  }

  /** Triangle: the song editor for what is under the cursor (else the selection). */
  padSongEditor() {
    const atCursor = this._entityIdAtCell(this.editorScene.getHoveredGrid());
    const id = atCursor !== null ? atCursor : this.selectionManager.selectedId;
    const entity = id !== null ? this.undoManager.getEntity(id) : null;
    if (!entity || !SONG_ENTITY_TYPES.includes(entity.type)) {
      this._showToast('Put the cursor on a creature or gate to edit its song');
      return;
    }
    this.selectionManager.select(id);
    this.openSongEditor(id);
  }

  /** L2 + Triangle: hear the song under the cursor (A). */
  padAudition() {
    this._auditionAtCursor();
  }

  /** Options: the editor's menu — Play, puzzles, undo, the look… */
  openEditorMenu() {
    const atCursor = this._entityIdAtCell(this.editorScene.getHoveredGrid());
    const songId = [atCursor, this.selectionManager.selectedId].find((id) => {
      const entity = id !== null && id !== undefined ? this.undoManager.getEntity(id) : null;
      return entity && SONG_ENTITY_TYPES.includes(entity.type);
    });
    const items = [{ label: 'Play this level', action: () => this.play() }];
    if (songId !== undefined) {
      items.push({ label: 'Edit song', action: () => this.openSongEditor(songId) });
      items.push({
        label: this.audition.playingId === songId ? 'Stop song' : 'Play song',
        action: () => this.auditionSong(songId),
      });
    }
    items.push(
      { label: 'Properties (sidebar)', action: () => this.togglePanelFocus(true) },
      { label: 'Open puzzle…', action: () => this.openPuzzlePicker() },
      { label: 'World map', action: () => this.worldOverview.open() },
      { label: 'Undo', action: () => this._undo(), disabled: !this.undoManager.canUndo() },
      { label: 'Redo', action: () => this._redo(), disabled: !this.undoManager.canRedo() },
      {
        label: this._look === 'game' ? 'Schematic look' : 'Game look',
        action: () => this.toggleLook(),
      },
      {
        label: this._sharp ? 'Sharp rendering: on' : 'Sharp rendering: off',
        action: () => this.toggleSharp(),
      },
      { label: 'Game mode (main menu)', action: () => this.openGame() }
    );
    const container = document.getElementById('editor-viewport');
    const x = Math.max(0, container.clientWidth / 2 - 90);
    const y = Math.max(0, container.clientHeight / 2 - 140);
    this.controls.enabled = false;
    this.contextMenu.show(x, y, items);
    const checkHidden = () => {
      if (!this.contextMenu.isOpen) this.controls.enabled = true;
      else requestAnimationFrame(checkHidden);
    };
    requestAnimationFrame(checkHidden);
  }

  /**
   * The touchpad: the controller's focus into the sidebar (the selection's
   * properties first) or back to the level.
   * @param {boolean} [on] - default: the other way from now
   * @param {string|Element} [target] - the control to land on
   */
  togglePanelFocus(on = !this._panelMode, target = null) {
    this._panelMode = on;
    if (on) {
      const first =
        target ||
        (this.selectionManager.selectedId !== null
          ? '#property-panel input, #property-panel select, #property-panel button'
          : null);
      this.panelFocus.enter(first);
    } else {
      this.panelFocus.leave();
    }
    this.onPadChange();
  }

  /** The puzzle dropdown, focused for the controller (←/→ choose, ✕ opens). */
  openPuzzlePicker() {
    this.togglePanelFocus(true, '.puzzle-select');
  }

  /** The camera glides to keep the controller's cursor well inside the view. */
  followCursor() {
    const cell = this.editorScene.getHoveredGrid();
    const container = document.getElementById('editor-viewport');
    const { x, y } = this.editorScene.cellToContainerXY(cell, this.camera);
    const w = container.clientWidth;
    const h = container.clientHeight;
    const inside = x > w * 0.22 && x < w * 0.78 && y > h * 0.2 && y < h * 0.8;
    if (!inside) this.centerCameraOnCursor();
  }

  /** L2 + R3: glide the camera to centre on the cursor. */
  centerCameraOnCursor() {
    const cell = this.editorScene.getHoveredGrid();
    const world = gridToWorld(cell.x, cell.z);
    this._glideTo = {
      x: world.x,
      y: this.editorScene.activeElevation * ELEVATION_HEIGHT,
      z: world.z,
    };
    this._requestFrame();
  }

  /** L2 + L3: the camera back to where it starts, over the whole level. */
  resetCamera() {
    const { x, z } = this._levelCenterWorld();
    this._glideTo = null;
    this.controls.target.set(x, 0, z);
    this.camera.position.set(x + 30, 40, z + 30);
    this.controls.update();
    this._requestFrame();
  }

  /** The middle of what is built, in editor world units (x, z). */
  _levelCenterWorld() {
    const box = levelBounds(this.undoManager);
    if (!box) {
      const cell = levelCenterCell(this.undoManager);
      return gridToWorld(cell.x, cell.z);
    }
    return {
      x: ((box.x1 + box.x2 + 1) / 2) * WORLD_SCALE,
      z: ((box.z1 + box.z2 + 1) / 2) * WORLD_SCALE,
    };
  }

  /** Right stick: orbit (radians round, radians of tilt). */
  orbitCamera(azimuth, polar) {
    orbit(this.camera, this.controls, azimuth, polar);
    this.controls.update();
    this._requestFrame();
  }

  /** R3 / L3 (click or hold): nearer (factor < 1) or further. */
  zoomCamera(factor) {
    zoom(this.camera, this.controls, factor);
    this.controls.update();
    this._requestFrame();
  }

  /**
   * The left stick: slide the view, in shares of the camera's distance. The
   * cursor rides along on the cell at the middle of the view (the cell the
   * line of sight through the orbit centre meets at the active storey), so
   * what ✕ does is what the view is centred on — anywhere, any storey.
   */
  panCamera(rightShare, forwardShare) {
    const { position } = this.camera;
    const { target } = this.controls;
    const distance = Math.hypot(
      position.x - target.x,
      position.y - target.y,
      position.z - target.z
    );
    this._glideTo = null;
    pan(this.camera, this.controls, rightShare * distance, forwardShare * distance);
    this.controls.update();
    const cell = this.viewCentreCell();
    const at = this.editorScene.getHoveredGrid();
    if (cell.x !== at.x || cell.z !== at.z) this.editorScene.setCursor(cell);
    this._requestFrame();
  }

  /**
   * The cell at the middle of the view: where the line from the camera
   * through the orbit centre crosses the active storey's floor height (the
   * orbit centre's own cell when that line never reaches it).
   * @returns {{x: number, z: number}}
   */
  viewCentreCell() {
    const { position } = this.camera;
    const { target } = this.controls;
    const floorY = this.editorScene.activeElevation * ELEVATION_HEIGHT;
    let { x, z } = target;
    const dy = target.y - position.y;
    if (Math.abs(dy) > 1e-6) {
      const t = (floorY - position.y) / dy;
      // Ahead of the camera and not off toward the horizon (the orbit never
      // tilts that flat; a storey above the camera is never reached)
      if (t > 0 && t < 20) {
        x = position.x + (target.x - position.x) * t;
        z = position.z + (target.z - position.z) * t;
      }
    }
    return snapToGrid(x, z);
  }

  // --- Songs: the song editor and quick audition --------------------------

  /**
   * Open an entity's song in the song editor (docked at the bottom), with
   * the camera moved so the entity shows in the viewport above it — its
   * creature lights there as Play sounds its song.
   */
  openSongEditor(entityId) {
    this.audition.stop();
    // The view (and cursor) before the modal framed the entity, put back
    // when it closes; a second song opened over the first keeps the first's
    const before = this.songEditorModal.isOpen ? this._viewBeforeSong : this._captureView();
    this.songEditorModal.open(entityId);
    this._viewBeforeSong = before;
    this._frameAboveEditor(entityId);
  }

  /** The camera (position, orientation, lens, orbit centre) and the cursor now. */
  _captureView() {
    const { camera, controls } = this;
    return {
      position: camera.position.clone(),
      quaternion: camera.quaternion && camera.quaternion.clone ? camera.quaternion.clone() : null,
      fov: camera.fov,
      zoom: camera.zoom,
      target: controls.target.clone(),
      cursor: this.editorScene.getHoveredGrid(),
      elevation: this.editorScene.activeElevation,
    };
  }

  /** The song editor closed: the view and the cursor back as they were when it opened. */
  _restoreViewBeforeSong() {
    const view = this._viewBeforeSong;
    this._viewBeforeSong = null;
    if (!view) return;
    const { camera, controls } = this;
    this._glideTo = null;
    camera.position.copy(view.position);
    if (view.quaternion && camera.quaternion) camera.quaternion.copy(view.quaternion);
    controls.target.copy(view.target);
    if (view.fov !== undefined && camera.fov !== view.fov) {
      camera.fov = view.fov;
      camera.zoom = view.zoom;
      if (camera.updateProjectionMatrix) camera.updateProjectionMatrix();
    }
    if (this.editorScene.activeElevation === view.elevation) {
      this.editorScene.setCursor(view.cursor);
    }
    controls.update();
    this._requestFrame();
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
   * Move the camera (keeping its angle and distance) so the entity shows in
   * the middle of the band of viewport left above the docked song editor.
   */
  _frameAboveEditor(entityId) {
    const mesh = this.entityPlacer.getMeshById(entityId);
    const container = document.getElementById('editor-viewport');
    const modal = document.querySelector('.song-modal');
    if (!mesh || !mesh.position || !mesh.position.clone || !container || !modal) return;
    const rect = container.getBoundingClientRect();
    if (!(rect.height > 0)) return;
    // Centre the entity first, then slide the view until it sits mid-band
    glideToward(this.camera, this.controls, mesh.position, 1);
    this.controls.update();
    const bandMiddle = (Math.max(modal.getBoundingClientRect().top, rect.top + 40) - rect.top) / 2;
    const { position } = this.camera;
    const { target } = this.controls;
    const distance = Math.hypot(
      position.x - target.x,
      position.y - target.y,
      position.z - target.z
    );
    for (let i = 0; i < 4; i += 1) {
      this.camera.updateMatrixWorld();
      const projected = mesh.position.clone().project(this.camera);
      const y = (-projected.y * 0.5 + 0.5) * rect.height;
      // Screen pixels to ground units, roughly (refined by the next pass)
      const perPixel = (distance * 1.6) / rect.height;
      pan(this.camera, this.controls, 0, (bandMiddle - y) * perPixel);
      this.controls.update();
    }
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
    this.tileSlabs.setVisible(!game);
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
   * Save the level and play it here (editor/play/PlayPreview): the camera
   * glides down to the player's eye at the spawn, the game takes over from
   * that frame, and its pause menu's Back to Editor (Cmd/Ctrl+Enter) glides
   * back to this view with everything as it was.
   * @returns {Promise<boolean>} whether the game was started
   */
  /**
   * Game mode (the dev app's switch): the last edit lands, then the game's
   * own page loads in this window — its main menu, every level. The game's
   * menus lead back here (dev builds).
   * @param {Location} [loc]
   */
  async openGame(loc = window.location) {
    if (this.preview && this.preview.active) return;
    await this._settleAutoSave();
    loc.assign('/');
  }

  async play() {
    if (this.preview && this.preview.active) return false;
    const { id } = this.undoManager.getMetadata();
    if (!id) {
      this._showToast('Name the puzzle to play it — its name gives it the file the game loads');
      this.metadataPanel.expand();
      return false;
    }
    const spawn = this.undoManager.getPlayerSpawn();
    if (!spawn) {
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
    return this.preview.start({ puzzleId: id, playerStart: { ...spawn } });
  }

  /**
   * Play begins: the editor stands aside. Its keys and controller go quiet
   * (the game has them), a song being heard stops, the camera answers no
   * mouse, and only the level as the game draws it stays in the view — the
   * game look even from the schematic one, none of the editor's marks.
   * What it was is kept for _comeBack.
   */
  _standAside() {
    this._aside = {
      look: this._look,
      focus: document.activeElement,
      controlsEnabled: this.controls.enabled,
      hidden: [],
    };
    this.gamepad.stop();
    this.audition.stop();
    this.songEditorModal.stopPlayback();
    this.controls.enabled = false;
    if (this._look !== 'game') {
      this._look = 'game';
      this._applyLook();
    }
    this.gameLook.setCuesVisible(false);
    for (const child of this.scene.children || []) {
      if (child !== this.gameLook.root && !child.isLight && child.visible !== false) {
        child.visible = false;
        this._aside.hidden.push(child);
      }
    }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  /** Back from Play: everything as it was before it (selection, panels, look, focus). */
  _comeBack() {
    const aside = this._aside;
    this._aside = null;
    if (!aside) return;
    aside.hidden.forEach((child) => {
      child.visible = true; // eslint-disable-line no-param-reassign
    });
    this.gameLook.setCuesVisible(true);
    if (aside.look !== this._look) {
      this._look = aside.look;
      this._applyLook();
    }
    this.controls.enabled = aside.controlsEnabled;
    this.gamepad.start();
    if (aside.focus && aside.focus.focus && document.contains(aside.focus)) aside.focus.focus();
    this.onPadChange();
    this._requestFrame();
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
    this.renderer = this._createRenderer();
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
    // Isometric-ish angle looking at the level's middle (a new level: the origin)
    const { x, z } = this._levelCenterWorld();
    this.camera.position.set(x + 30, 40, z + 30);
    this.camera.lookAt(x, 0, z);
  }

  /**
   * The viewport's renderer. By default it renders as the game does: 1x,
   * no antialiasing. SHARP (`setSharp`, the Options menu; remembered) is the
   * screen's pixel ratio with antialiasing: crisper, about 2.5x the GPU work
   * per frame on a 2x screen.
   */
  _createRenderer() {
    const container = document.getElementById('editor-viewport');
    const renderer = new THREE.WebGLRenderer({ antialias: this._sharp });
    renderer.setPixelRatio(this._sharp ? window.devicePixelRatio : 1);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x0a0a1a);
    return renderer;
  }

  _setupControls() {
    const { x, z } = this._levelCenterWorld();
    this._createControls({ x, y: 0, z });
  }

  /** Orbit controls on the canvas, orbiting `target`. */
  _createControls(target) {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(target.x, target.y, target.z);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.update();
  }

  /** Whether the viewport renders sharp (screen pixel ratio + antialiasing). */
  get sharp() {
    return this._sharp;
  }

  /** Sharp rendering on / off (the Options menu), remembered. */
  toggleSharp() {
    this.setSharp(!this._sharp);
  }

  /**
   * Render sharp (the screen's pixel ratio, antialiased) or as the game does
   * (1x, no antialiasing: the default). Antialiasing is fixed when a WebGL
   * context is made, so the renderer is built again on a new canvas, and the
   * orbit controls with it (they listen on the canvas); the scene, camera
   * and orbit target stay, and the scene's GPU resources upload again to the
   * new context on its first frame. Not while Play is under way.
   * @param {boolean} sharp
   */
  setSharp(sharp) {
    const on = Boolean(sharp);
    if (on === this._sharp || (this.preview && this.preview.active)) return;
    this._sharp = on;
    saveSharp(on);
    const old = this.renderer;
    this.renderer = this._createRenderer();
    old.domElement.replaceWith(this.renderer.domElement);
    old.dispose();
    if (old.forceContextLoss) old.forceContextLoss(); // free its GPU memory now

    const { target, enabled } = this.controls;
    this.controls.removeEventListener('change', this._invalidateRender);
    this.controls.dispose();
    this._createControls(target);
    this.controls.enabled = enabled;
    this.controls.addEventListener('change', this._invalidateRender);

    this._showToast(on ? 'Sharp rendering' : 'Rendering as the game does', 'success');
    this._requestFrame();
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

      // A click on a cell with no floor (at the active storey) builds its
      // tile, as ✕ / Enter does
      if (this._cellIsBare(grid)) {
        this.undoManager.addTiles([{ x: grid.x, y: this.editorScene.activeElevation, z: grid.z }]);
        this.selectionManager.deselect();
        return;
      }

      // Otherwise a plain click only SELECTS the tile: the cursor is now on
      // it. Select any entity there so the property panel reflects it. Entity
      // PLACEMENT is keyboard/pad only (letter keys, ✕ / Enter).
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
   * Refused if the target is occupied. A target with no floor gets its tile
   * built in the same step (EntityPlacer: anything placed brings its floor).
   */
  _moveEntityAtCursor(delta) {
    const cell = this.editorScene.getHoveredGrid();
    const elevation = this.editorScene.activeElevation;
    const tx = cell.x + delta.dx;
    const tz = cell.z + delta.dz;

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
   * Shift+Option+Up/Down: carry the entity (or player spawn) on the cursor
   * cell a storey up/down, and follow it there (the active storey switches
   * so it stays under the cursor). A cell with no floor there gets its tile
   * in the same step. Refused past the deepest subfloor / the top storey or
   * onto an occupied cell.
   */
  _moveEntityLayer(dir) {
    const cell = this.editorScene.getHoveredGrid();
    const current = this.editorScene.activeElevation;
    const targetElev = current + dir;
    if (targetElev < MIN_STOREY || targetElev > MAX_STOREY) return; // no storey that way

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
  static get MAX_STOREY() {
    return MAX_STOREY;
  }

  /**
   * Option+Up/Down: the active storey up / down by one (below the ground
   * too: subfloors, down to MIN_STOREY), built on or not
   * (✕ / Enter on a cell with no floor there builds it). A floor range being
   * built is called off.
   */
  _navigateLayer(dir) {
    const target = this.editorScene.activeElevation + dir;
    if (target < MIN_STOREY || target > MAX_STOREY) return;
    this._cancelFloorRange();
    this.elevationSelector.syncTo(target);
    this._requestFrame();
  }

  // --- Building floor (✕ / Enter on a cell with no floor) ------------------

  /** Nothing stands on the cell at the active storey and it has no floor. */
  _cellIsBare(cell) {
    const y = this.editorScene.activeElevation;
    if (this.undoManager.hasTile(cell.x, y, cell.z)) return false;
    if (this._entityIdAtCell(cell) !== null) return false;
    const spawn = this.undoManager.getPlayerSpawn();
    return !(spawn && spawn.x === cell.x && spawn.y === y && spawn.z === cell.z);
  }

  /**
   * ✕ / Enter pressed on a cell with no floor: start building floor there —
   * a rectangle from this cell to wherever the cursor is when it is let go
   * (shown while held). True if it started (the press is used up).
   */
  _startFloorRangeAtCursor() {
    if (this._floorRange) return true; // already holding one (a key repeat)
    const cell = this.editorScene.getHoveredGrid();
    if (!this._cellIsBare(cell)) return false;
    const elevation = this.editorScene.activeElevation;
    this._floorRange = { anchor: { x: cell.x, z: cell.z }, elevation };
    this.editorScene.setFloorRange(this._floorRange.anchor, elevation);
    this._requestFrame();
    return true;
  }

  /**
   * ✕ / Enter let go: build floor on every cell of the range that has none,
   * as ONE undo step.
   */
  _commitFloorRange() {
    const range = this._floorRange;
    if (!range) return;
    this._cancelFloorRange();
    const cursor = this.editorScene.getHoveredGrid();
    const cells = [];
    const x1 = Math.min(range.anchor.x, cursor.x);
    const x2 = Math.max(range.anchor.x, cursor.x);
    const z1 = Math.min(range.anchor.z, cursor.z);
    const z2 = Math.max(range.anchor.z, cursor.z);
    for (let z = z1; z <= z2; z += 1) {
      for (let x = x1; x <= x2; x += 1) {
        if (!this.undoManager.hasTile(x, range.elevation, z)) {
          cells.push({ x, y: range.elevation, z });
        }
      }
    }
    if (cells.length > 0) this.undoManager.addTiles(cells);
    this._requestFrame();
  }

  /** Call off a floor range being built (Esc, a storey change, a load). */
  _cancelFloorRange() {
    if (!this._floorRange) return;
    this._floorRange = null;
    this.editorScene.clearFloorRange();
    this._requestFrame();
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

  /**
   * Delete / □: remove whatever occupies the cursor cell — the entity, else
   * the player spawn, else the floor tile itself. So twice on an entity
   * takes the entity, then its floor.
   */
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
    if (this.undoManager.hasTile(cell.x, elevation, cell.z)) {
      this.undoManager.removeTile(cell.x, elevation, cell.z);
      this._requestFrame();
    }
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

      this.entityDragger.updateDrag(mouseX, mouseY, undefined, this.editorScene.activeElevation);
    });

    const endDrag = () => {
      if (this.entityDragger.isDragging) {
        this.entityDragger.endDrag(undefined, this.editorScene.activeElevation);
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
      // Play under way: the game has the keys (Esc while gliding in calls it off)
      if (this.preview && this.preview.active) {
        if (e.key === 'Escape') this.preview.cancel();
        return;
      }
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
        this.entityToolbar.deselect();
        this._cancelLinkPick('Teleport cancelled');
        this.selectionManager.deselect();
        this._cancelFloorRange();
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
          // Held on a cell with no floor: builds floor (a range, sized with
          // the arrows, built on keyup). A repeat of a held Enter does nothing
          if (e.repeat || this._startFloorRangeAtCursor()) return;
          if (
            this.entityToolbar.activeTool &&
            this._entityIdAtCell(this.editorScene.getHoveredGrid()) === null
          ) {
            // A chosen tool on an empty cell: place it (the tool buttons'
            // place-at-cursor; a click only ever selects)
            this._placeAtCursor(this.entityToolbar.activeTool);
          } else this._openContextMenuAtCursor();
          return;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          this._deleteAtCursor();
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
    // Enter let go: a floor range being built is built (wherever focus is)
    this._onKeyUp = (e) => {
      if (e.key === 'Enter') this._commitFloorRange();
    };
    document.addEventListener('keyup', this._onKeyUp);
    // Focus leaving the window loses the keyup: call the range off
    this._onBlur = () => this._cancelFloorRange();
    window.addEventListener('blur', this._onBlur);
  }

  /**
   * On-demand rendering. The editor scene is static while idle, so instead of a
   * 60fps loop we render only when something changes. Every invalidation
   * schedules ONE frame; `controls.update()` re-invalidates while damping is
   * still settling, so a camera fling animates and then stops. Idle → no
   * frames, no CPU (was rendering the whole scene 60×/sec for nothing).
   */
  _requestFrame() {
    this._lookCalm = false; // anything but the calm look draws on the next frame
    this._dirty = true;
    if (this._frameId == null) {
      this._frameId = requestAnimationFrame((now) => this._renderFrame(now));
    }
  }

  /**
   * The game look asks for its next frame: the next one while something on
   * it moves quickly (`gameLook.lively`: lightning, a lit or fading
   * creature), else the first one CALM_FRAME_MS after the last drawn. Its
   * slow drifts look the same at that rate (each frame still advances them
   * by the real time since the last), and drawing them 60 times a second
   * kept the GPU and the fan busy whenever the editor sat in the game look,
   * the song editor open or not (2026-11-24). The frames between are
   * skipped (`_lookCalm`, checked in `_renderFrame`). Anything that asks for
   * a frame some other way (input, camera damping, a glide, an edit) still
   * draws on the next one: `_requestFrame` clears the calm.
   */
  _requestLookFrame() {
    if (this._frameId != null) return; // asked for already: drawn next frame
    this._requestFrame();
    this._lookCalm = !this.gameLook.lively;
  }

  _renderFrame(now = 0) {
    this._frameId = null;
    if (!this._dirty) return;
    // A calm frame not due yet waits for a later vsync (rAF's timestamps are
    // vsync times: at 60 Hz this draws every other one). A timer to wake for
    // it instead missed or beat its vsync whenever the GPU delayed frames
    if (
      this._lookCalm &&
      this._lastFrameAt != null &&
      !(this.preview && this.preview.active) &&
      now - this._lastFrameAt < CALM_FRAME_MS - CALM_SLACK_MS
    ) {
      this._frameId = requestAnimationFrame((t) => this._renderFrame(t));
      return;
    }
    this._lookCalm = false;
    this._dirty = false;
    const dt = this._lastFrameAt == null ? 0 : (now - this._lastFrameAt) / 1000;
    this._lastFrameAt = now;
    // Play: the preview places the camera (no orbit, no cursor, no HUD), and
    // while the game is on screen the editor draws nothing
    if (this.preview && this.preview.active) {
      const { draw, more, still } = this.preview.frame(now);
      if (!draw) return;
      if (more || this.gameLook.animates) this._requestFrame();
      if (!still) this.gameLook.update(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.controls.update(); // may emit 'change' (damping) → schedules the next frame
    // The game look moves on its own (the sky, the creatures' wobble, a
    // previewed song): while it shows, every frame asks for the next (calm
    // motion at CALM_FRAME_MS: _requestLookFrame)
    if (this._look === 'game' && this.gameLook.animates) {
      this.gameLook.update(dt);
      this._requestLookFrame();
    }
    // The camera gliding after the controller's cursor (followCursor)
    if (this._glideTo) {
      const left = glideToward(this.camera, this.controls, this._glideTo, 0.2);
      if (left < 0.05) this._glideTo = null;
      this.controls.update();
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
    if (this.preview && this.preview.active) {
      this.preview.onResize();
      this._requestFrame();
      return;
    }
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
    if (this.preview) this.preview.dispose();
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    if (this.gamepad) this.gamepad.stop();
    if (this._stopDeviceWatch) this._stopDeviceWatch();
    if (this.padLegend) this.padLegend.dispose();
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
    this.tileSlabs.dispose();
    this.gameLook.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
