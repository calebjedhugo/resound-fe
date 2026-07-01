import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import UndoManager from 'editor/model/UndoManager';
import EditorScene from 'editor/viewport/EditorScene';
import EntityPlacer from 'editor/viewport/EntityPlacer';
import SelectionManager from 'editor/viewport/SelectionManager';
import EntityDragger from 'editor/viewport/EntityDragger';
import GhostPreview from 'editor/viewport/GhostPreview';
import ElevationSelector from 'editor/ui/ElevationSelector';
import FloorRegionPanel from 'editor/ui/FloorRegionPanel';
import EntityToolbar from 'editor/ui/EntityToolbar';
import PropertyPanel from 'editor/ui/PropertyPanel';
import MetadataPanel from 'editor/ui/MetadataPanel';
import ValidationPanel from 'editor/ui/ValidationPanel';
import LevelPicker from 'editor/ui/LevelPicker';
import ExportPanel from 'editor/ui/ExportPanel';
import ContextMenu from 'editor/ui/ContextMenu';
import SongEditorModal from 'editor/ui/SongEditorModal';
import { saveSession, loadSession, clearSession } from 'editor/io/sessionPersistence';
import { savePuzzleToRepo } from 'editor/io/repoPersistence';

export default class EditorApp {
  constructor() {
    this.model = new EditorPuzzleModel();
    this.undoManager = new UndoManager(this.model);
    this.scene = null;
    this.renderer = null;
    this.camera = null;
    this.controls = null;
    this._animationId = null;
    this._validationTimer = null;
    this._autoSaveTimer = null;
  }

  init() {
    this._setupRenderer();
    this._setupCamera();
    this._setupControls();
    this.editorScene = new EditorScene(this.scene, this.undoManager);
    this.elevationSelector = new ElevationSelector(
      document.getElementById('elevation-panel'),
      this.editorScene
    );
    this.floorRegionPanel = new FloorRegionPanel(
      document.getElementById('elevation-panel'),
      this.undoManager,
      this.editorScene
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
        this.selectionManager.deleteSelected();
      },
      (entityId) => {
        this.songEditorModal.open(entityId);
      }
    );
    this.metadataPanel = new MetadataPanel(
      document.getElementById('metadata-panel'),
      this.undoManager,
      this.editorScene
    );
    this.validationPanel = new ValidationPanel(
      document.getElementById('validation-panel'),
      this.undoManager,
      (entityId) => {
        if (entityId) this.selectionManager.select(entityId);
      }
    );
    this.levelPicker = new LevelPicker(document.getElementById('import-panel'), (importedModel) => {
      // Load an existing repo level: replace model state without writing
      // it straight back to disk (it already matches the file we read).
      this._applyRestoredModel(importedModel);
      this.levelPicker.setSelected(importedModel.getMetadata().id);
    });
    this.exportPanel = new ExportPanel(document.getElementById('export-panel'), this.undoManager);
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
      this._scheduleValidation();
      this._scheduleAutoSave();
    });

    // Wire selection changes to property panel
    this.selectionManager.onSelectionChange = (entityId) => {
      if (entityId !== null) {
        this.propertyPanel.show(entityId);
      } else {
        this.propertyPanel.hide();
      }
    };

    // "New Puzzle" button at the top of the sidebar
    this._setupNewPuzzleButton();

    // Restore saved session (auto-restore on load)
    this._restoreSession();

    this._setupViewportClick();
    this._setupDrag();
    this._setupKeyboard();
    this._animate();
    window.addEventListener('resize', () => this._onResize());
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
    try {
      const written = await savePuzzleToRepo(this.undoManager);
      if (written) {
        // A newly-created id won't be in the dropdown yet; refresh to add it.
        const { id } = this.undoManager.getMetadata();
        if (!this.levelPicker.hasLevel(id)) this.levelPicker.refresh(id);
      }
    } catch (err) {
      console.warn('Repo save failed:', err);
    }
  }

  _restoreSession() {
    const restored = loadSession();
    if (restored) {
      this._applyRestoredModel(restored);
    }
  }

  _applyRestoredModel(importedModel) {
    this.undoManager._model._metadata = { ...importedModel.getMetadata() };
    this.undoManager._model._playerSpawn = importedModel.getPlayerSpawn();
    this.undoManager._model._floors = importedModel.getFloors();
    this.undoManager._model._entities = importedModel.getEntities();
    this.undoManager._model._nextEntityId =
      Math.max(...importedModel.getEntities().map((e) => e.id), 0) + 1;
    this.entityPlacer.rebuildFromModel();
    this.floorRegionPanel.refresh();
    this.metadataPanel.refresh();
    this.selectionManager.deselect();
    this._scheduleValidation();
  }

  _setupNewPuzzleButton() {
    const sidebar = document.getElementById('editor-sidebar');
    const btn = document.createElement('button');
    btn.className = 'editor-btn new-puzzle-btn';
    btn.textContent = 'New Puzzle';
    btn.addEventListener('click', () => {
      clearSession();
      const fresh = new EditorPuzzleModel();
      this._applyRestoredModel(fresh);
    });
    // Insert after the h2 heading, before the first panel
    const heading = sidebar.querySelector('h2');
    if (heading && heading.nextSibling) {
      sidebar.insertBefore(btn, heading.nextSibling);
    } else {
      sidebar.appendChild(btn);
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

  _setupViewportClick() {
    const container = document.getElementById('editor-viewport');
    container.addEventListener('click', (e) => {
      // Get hovered grid cell from EditorScene
      const grid = this.editorScene.getHoveredGrid();
      if (!grid) return;

      // Let floor region panel handle it first
      if (this.floorRegionPanel.handleGridClick(grid.x, grid.z)) {
        return;
      }

      // If entity toolbar has active tool, place entity at hovered grid cell
      const activeTool = this.entityToolbar.activeTool;
      if (activeTool) {
        this.entityPlacer.placeEntity(activeTool, grid.x, grid.z, this.editorScene.activeElevation);
        return;
      }

      // Otherwise, try selection via SelectionManager
      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.selectionManager.handleClick(mouseX, mouseY);
    });

    // Right-click context menu
    const SONG_ENTITY_TYPES = ['creature', 'gate', 'fountain'];
    container.addEventListener('contextmenu', (e) => {
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // Raycast to find entity under cursor
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), this.camera);
      const meshes = this.entityPlacer.getAllMeshes();
      const hits = raycaster.intersectObjects(meshes);

      if (hits.length > 0) {
        const hitMesh = hits[0].object;
        const entityId = this.entityPlacer.getEntityIdFromMesh(hitMesh);
        if (entityId !== null) {
          this.selectionManager.select(entityId);
          const entity = this.undoManager.getEntity(entityId);
          const items = [];

          if (entity && SONG_ENTITY_TYPES.includes(entity.type)) {
            items.push({
              label: 'Edit Song',
              action: () => this.songEditorModal.open(entityId),
            });
          }

          if (items.length > 0) {
            this.controls.enabled = false;
            this.contextMenu.show(e.clientX - rect.left, e.clientY - rect.top, items);
            // Re-enable controls after menu hides
            const checkHidden = () => {
              if (!container.querySelector('.context-menu')) {
                this.controls.enabled = true;
              } else {
                requestAnimationFrame(checkHidden);
              }
            };
            requestAnimationFrame(checkHidden);
          }
          return;
        }
      }

      this.contextMenu.hide();
    });
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

      const gridSize = this.undoManager.getMetadata().gridSize;
      this.entityDragger.updateDrag(mouseX, mouseY, gridSize, this.editorScene.activeElevation);
    });

    const endDrag = () => {
      if (this.entityDragger.isDragging) {
        const gridSize = this.undoManager.getMetadata().gridSize;
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
      // Skip editor keyboard handling while song editor modal is open
      if (this.songEditorModal && this.songEditorModal.isOpen) return;

      // Cmd+Z / Ctrl+Z = undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undoManager.undo();
        this.floorRegionPanel.refresh();
        this.metadataPanel.refresh();
        this.entityPlacer.rebuildFromModel();
        this.selectionManager.deselect();
      }
      // Cmd+Shift+Z / Ctrl+Shift+Z = redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        this.undoManager.redo();
        this.floorRegionPanel.refresh();
        this.metadataPanel.refresh();
        this.entityPlacer.rebuildFromModel();
        this.selectionManager.deselect();
      }
      // Escape cancels floor placement and deselects entity toolbar
      if (e.key === 'Escape') {
        this.floorRegionPanel.cancelPlacing();
        this.entityToolbar.deselect();
        this.selectionManager.deselect();
      }
      // Delete or Backspace deletes selected entity
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectionManager.selectedId !== null) {
          e.preventDefault();
          this.selectionManager.deleteSelected();
        }
      }
    });
  }

  _animate() {
    this._animationId = requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.editorScene.updateHover(this.camera);
    this.ghostPreview.update(this.editorScene.getHoveredGrid(), this.editorScene.activeElevation);
    this.editorScene.update();
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const container = document.getElementById('editor-viewport');
    const w = container.clientWidth;
    const h = container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    if (this._animationId) cancelAnimationFrame(this._animationId);
    clearTimeout(this._validationTimer);
    clearTimeout(this._autoSaveTimer);
    this.songEditorModal.dispose();
    this.contextMenu.dispose();
    this.ghostPreview.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
