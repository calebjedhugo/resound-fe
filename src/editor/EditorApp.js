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
import ElevationSelector from 'editor/ui/ElevationSelector';
import FloorRegionPanel from 'editor/ui/FloorRegionPanel';
import EntityToolbar from 'editor/ui/EntityToolbar';
import PropertyPanel from 'editor/ui/PropertyPanel';
import MetadataPanel from 'editor/ui/MetadataPanel';
import ValidationPanel from 'editor/ui/ValidationPanel';
import PuzzlePicker from 'editor/ui/PuzzlePicker';
import WorldOverview from 'editor/ui/WorldOverview';
import EditorToolbar from 'editor/ui/EditorToolbar';
import ContextMenu from 'editor/ui/ContextMenu';
import SongEditorModal from 'editor/ui/SongEditorModal';
import { saveSession, loadSession, clearSession } from 'editor/io/sessionPersistence';
import { savePuzzleToRepo, listRepoPuzzles, loadRepoPuzzle } from 'editor/io/repoPersistence';
import {
  createLink,
  clearLink,
  parseLinkTarget,
  releaseLinkBeforeDelete,
} from 'editor/io/portalLinks';
import { importPuzzle } from 'editor/io/importPuzzle';
import { availableElevations } from 'editor/util/elevations';

// Entity types that carry a song (Edit Song menu item, dbl-click to edit).
const SONG_ENTITY_TYPES = ['creature', 'gate', 'fountain'];
// Single-key placement at the cursor cell (fountain is parked — no key).
const PLACE_KEYS = {
  p: 'player',
  c: 'creature',
  g: 'gate',
  w: 'wall',
  r: 'ramp',
  l: 'cleanser',
};
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
    this._validationTimer = null;
    this._autoSaveTimer = null;
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
    this.songEditorModal = new SongEditorModal(
      document.getElementById('editor-root'),
      this.undoManager
    );
    this.contextMenu = new ContextMenu(document.getElementById('editor-viewport'));
    this.propertyPanel = new PropertyPanel(
      document.getElementById('property-panel'),
      this.undoManager,
      this.entityPlacer,
      () => {
        this._deleteSelectedEntity();
      },
      (entityId) => {
        this.songEditorModal.open(entityId);
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
      (entityId) => this.songEditorModal.open(entityId)
    );
    this.toolbar = new EditorToolbar(document.getElementById('toolbar-panel'), {
      onUndo: () => this._undo(),
      onRedo: () => this._redo(),
      canUndo: () => this.undoManager.canUndo(),
      canRedo: () => this.undoManager.canRedo(),
      onTest: () => this._testInGame(),
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
      () => this._newPuzzle() // after delete: drop to a fresh, unsaved puzzle
    );
    this.worldOverview = new WorldOverview(document.getElementById('world-panel'), {
      onOpenPuzzle: (id) => this.puzzlePicker.open(id),
      getCurrentPuzzleId: () => this.undoManager.getMetadata().id,
    });
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
      this._syncGridToScene();
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
      this._requestFrame();
    };

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
    this._requestFrame(); // initial render
    window.addEventListener('resize', () => this._onResize());
  }

  /** True if a cell already holds an entity or the player spawn (one per tile). */
  _isCellOccupied(x, y, z) {
    if (this.undoManager.getEntitiesAt(x, y, z).length > 0) return true;
    const spawn = this.undoManager.getPlayerSpawn();
    return Boolean(spawn && spawn.x === x && spawn.y === y && spawn.z === z);
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
    this._hudEl.textContent = [pickText, toolText, cellText].filter(Boolean).join(' · ');
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
        this.selectionManager.select(sourceEntityId);
        this.propertyPanel.show(sourceEntityId);
        if (warnings.length > 0) this._showToast(warnings.join(' • '));
        else this._showToast('Gates linked (both sides)', 'success');
      })
      .catch((err) => this._showToast(err.message));
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
    this._autoSaveTimer = setTimeout(() => {
      saveSession(this.undoManager);
      this._saveToRepo();
    }, 500);
  }

  async _saveToRepo() {
    const { id, name } = this.undoManager.getMetadata();
    if (!id) {
      // No name yet -> nothing to write. Keep the prompt visible.
      this.toolbar.setStatus('unnamed');
      this.puzzlePicker.setSelected('', name);
      return;
    }
    this.toolbar.setStatus('saving');
    try {
      const written = await savePuzzleToRepo(this.undoManager);
      if (written) {
        this._puzzleCommitted = true;
        // A newly-created id won't be in the dropdown yet; refresh to add it.
        if (!this.puzzlePicker.hasLevel(id)) {
          await this.puzzlePicker.refresh(id);
        }
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

  async _restoreSession() {
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
   * Show the audible/recordable range spheres for the selected creature (and
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
    this.undoManager.replaceModel(importedModel);
    this._syncGridToScene();
    this.editorScene.recenterCursor();
    this.entityPlacer.rebuildFromModel();
    this.floorRegionPanel.refresh();
    this.elevationSelector.refresh();
    this.metadataPanel.refresh();
    this.selectionManager.deselect();
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
    clearSession();
    this._puzzleCommitted = false;
    this._applyRestoredModel(new EditorPuzzleModel());
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
    this.toolbar.refresh();
  }

  /** Open the current puzzle in the game (new tab) via the ?puzzle= deep link. */
  _testInGame() {
    const { id } = this.undoManager.getMetadata();
    if (!id || !this._puzzleCommitted) {
      this.toolbar.setStatus('unnamed');
      return;
    }
    window.open(`/?puzzle=${encodeURIComponent(id)}`, '_blank', 'noopener');
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
        this.songEditorModal.open(entityId);
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
        action: () => this.songEditorModal.open(entityId),
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
      if (this._isCellOccupied(tx, elevation, tz)) {
        this._showToast('That cell is already occupied');
        return;
      }
      this.entityPlacer.setEntityPosition(entityId, tx, tz, elevation);
      this.editorScene.moveCursor(delta.dx, delta.dz);
      this.selectionManager.select(entityId);
      this.propertyPanel.show(entityId);
      return;
    }

    const spawn = this.undoManager.getPlayerSpawn();
    if (spawn && spawn.x === cell.x && spawn.y === elevation && spawn.z === cell.z) {
      if (this._isCellOccupied(tx, elevation, tz)) {
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
      if (this._isCellOccupied(cell.x, targetElev, cell.z)) {
        this._showToast('That cell is already occupied');
        return;
      }
      this.entityPlacer.setEntityPosition(entityId, cell.x, cell.z, targetElev);
      this.elevationSelector.step(dir); // follow the entity to its new storey
      this.selectionManager.select(entityId);
      this.propertyPanel.show(entityId);
      return;
    }

    const spawn = this.undoManager.getPlayerSpawn();
    if (spawn && spawn.x === cell.x && spawn.y === current && spawn.z === cell.z) {
      if (this._isCellOccupied(cell.x, targetElev, cell.z)) {
        this._showToast('That cell is already occupied');
        return;
      }
      this.entityPlacer.placeEntity('player', cell.x, cell.z, targetElev);
      this.elevationSelector.step(dir);
    }
  }

  /** Letter key: place an entity of `type` at the cursor cell (refuse if full). */
  _placeAtCursor(type) {
    const cell = this.editorScene.getHoveredGrid();
    const elevation = this.editorScene.activeElevation;
    if (this._isCellOccupied(cell.x, elevation, cell.z)) {
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
    document.addEventListener('keydown', (e) => {
      // Modals take precedence — they own the keyboard while open (each closes
      // itself on Escape). An open context menu owns arrows/Enter/Escape too.
      if (this.songEditorModal && this.songEditorModal.isOpen) return;
      if (this.worldOverview && this.worldOverview.isOpen) return;
      if (this.contextMenu && this.contextMenu.isOpen) return;

      const { key } = e;

      // Undo / redo work regardless of focus (before the text-field guard).
      if ((e.metaKey || e.ctrlKey) && key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this._redo();
        else this._undo();
        return;
      }

      // Escape cancels the active mode (works even from a focused field).
      if (key === 'Escape') {
        this.floorRegionPanel.cancelPlacing();
        this.entityToolbar.deselect();
        this._cancelLinkPick('Teleport cancelled');
        this.selectionManager.deselect();
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
        else this.elevationSelector.step(dir);
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
          this._openContextMenuAtCursor();
          return;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          this._deleteAtCursor();
          return;
        default:
          break;
      }

      const placeType = PLACE_KEYS[key.toLowerCase()];
      if (placeType) {
        e.preventDefault();
        this._placeAtCursor(placeType);
      }
    });
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
      this._frameId = requestAnimationFrame(() => this._renderFrame());
    }
  }

  _renderFrame() {
    this._frameId = null;
    if (!this._dirty) return;
    this._dirty = false;
    this.controls.update(); // may emit 'change' (damping) → schedules the next frame
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
    this.controls.addEventListener('change', invalidate);
    document.addEventListener('keydown', invalidate);
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
    if (this._invalidateRender) {
      this.controls.removeEventListener?.('change', this._invalidateRender);
      document.removeEventListener('keydown', this._invalidateRender);
      document.removeEventListener('pointerdown', this._invalidateRender);
      document.removeEventListener('pointerup', this._invalidateRender);
      document.removeEventListener('wheel', this._invalidateRender);
    }
    clearTimeout(this._validationTimer);
    clearTimeout(this._autoSaveTimer);
    clearTimeout(this._toastTimer);
    this.songEditorModal.dispose();
    this.worldOverview.dispose();
    this.contextMenu.dispose();
    this.ghostPreview.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
