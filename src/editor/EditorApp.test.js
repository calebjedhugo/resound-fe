/**
 * @jest-environment jsdom
 */

/**
 * EditorApp Wiring Tests
 *
 * Tests the integration wiring in EditorApp: context menu on entities,
 * PropertyPanel "Edit Song" callback, and keyboard isolation when the
 * song editor modal is open.
 *
 * Three.js and viewport modules are mocked since they require WebGL.
 */

/* eslint-disable no-unused-vars */

// -- Mock Three.js and viewport modules that require WebGL --

const mockMesh = {
  material: { color: { getHex: () => 0xffffff }, emissive: { set: jest.fn() } },
  userData: {},
};

const mockIntersectObjects = jest.fn().mockReturnValue([]);

jest.mock('three', () => {
  const mockScene = { add: jest.fn() };
  return {
    Scene: jest.fn(() => mockScene),
    WebGLRenderer: jest.fn(() => ({
      setPixelRatio: jest.fn(),
      setSize: jest.fn(),
      setClearColor: jest.fn(),
      render: jest.fn(),
      dispose: jest.fn(),
      get domElement() {
        return global.document.createElement('canvas');
      },
    })),
    PerspectiveCamera: jest.fn(() => ({
      position: { set: jest.fn() },
      lookAt: jest.fn(),
      aspect: 1,
      updateProjectionMatrix: jest.fn(),
    })),
    AmbientLight: jest.fn(() => ({})),
    DirectionalLight: jest.fn(() => ({ position: { set: jest.fn() } })),
    Raycaster: jest.fn(() => ({
      setFromCamera: jest.fn(),
      intersectObjects: mockIntersectObjects,
    })),
    Vector2: jest.fn((x, y) => ({ x, y })),
    Color: jest.fn(),
  };
});

jest.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: jest.fn(() => ({
    target: { set: jest.fn() },
    enableDamping: false,
    dampingFactor: 0,
    enabled: true,
    update: jest.fn(),
    dispose: jest.fn(),
  })),
}));

jest.mock('editor/viewport/EditorScene', () =>
  jest.fn(() => ({
    getHoveredGrid: jest.fn(),
    updateHover: jest.fn(),
    update: jest.fn(),
    activeElevation: 0,
    _groundPlane: null,
  }))
);

jest.mock('editor/viewport/EntityPlacer', () =>
  jest.fn(() => ({
    getAllMeshes: jest.fn().mockReturnValue([]),
    getMeshById: jest.fn().mockReturnValue(mockMesh),
    getEntityIdFromMesh: jest.fn().mockReturnValue(null),
    rebuildFromModel: jest.fn(),
    placeEntity: jest.fn(),
    removeEntityById: jest.fn(),
  }))
);

jest.mock('editor/viewport/EntityDragger', () =>
  jest.fn(() => ({
    isDragging: false,
    groundPlane: null,
    startDrag: jest.fn(),
    updateDrag: jest.fn(),
    endDrag: jest.fn(),
  }))
);

jest.mock('editor/viewport/GhostPreview', () =>
  jest.fn(() => ({
    setEntityType: jest.fn(),
    update: jest.fn(),
    dispose: jest.fn(),
  }))
);

jest.mock('editor/io/sessionPersistence', () => ({
  saveSession: jest.fn(),
  loadSession: jest.fn().mockReturnValue(null),
  clearSession: jest.fn(),
}));

import EditorApp from 'editor/EditorApp';

function setupEditorDOM() {
  document.body.innerHTML = `
    <div id="editor-root">
      <div id="editor-sidebar"><h2>Editor</h2></div>
      <div id="editor-viewport" style="width:800px;height:600px;"></div>
      <div id="elevation-panel"></div>
      <div id="entity-toolbar"></div>
      <div id="property-panel"></div>
      <div id="metadata-panel"></div>
      <div id="validation-panel"></div>
      <div id="import-panel"></div>
      <div id="export-panel"></div>
    </div>
  `;
}

describe('EditorApp wiring', () => {
  let app;

  beforeEach(() => {
    setupEditorDOM();
    app = new EditorApp();
    // Suppress animation loop to avoid requestAnimationFrame buildup
    jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    app.init();
  });

  afterEach(() => {
    if (app) {
      app.dispose();
      app = null;
    }
    document.body.innerHTML = '';
    jest.restoreAllMocks();
    mockIntersectObjects.mockReturnValue([]);
  });

  describe('context menu', () => {
    function addEntityAndMockRaycast(type, entityData = {}) {
      const id = app.undoManager.addEntity(type, 5, 0, 3, entityData);
      const hitMesh = { userData: { entityId: id } };
      app.entityPlacer.getAllMeshes.mockReturnValue([hitMesh]);
      app.entityPlacer.getEntityIdFromMesh.mockReturnValue(id);
      mockIntersectObjects.mockReturnValue([{ object: hitMesh }]);
      return id;
    }

    function rightClick(container) {
      container.dispatchEvent(
        new MouseEvent('contextmenu', {
          clientX: 100,
          clientY: 100,
          bubbles: true,
        })
      );
    }

    it('shows Edit Song for a creature entity', () => {
      const container = document.getElementById('editor-viewport');
      addEntityAndMockRaycast('creature', { song: [], interval: 8, audibleRange: 15 });

      rightClick(container);

      const menu = container.querySelector('.context-menu');
      expect(menu).not.toBeNull();
      expect(menu.textContent).toContain('Edit Song');
    });

    it('shows Edit Song for a gate entity', () => {
      const container = document.getElementById('editor-viewport');
      addEntityAndMockRaycast('gate', { song: [] });

      rightClick(container);

      const menu = container.querySelector('.context-menu');
      expect(menu).not.toBeNull();
      expect(menu.textContent).toContain('Edit Song');
    });

    it('shows Edit Song for a fountain entity', () => {
      const container = document.getElementById('editor-viewport');
      addEntityAndMockRaycast('fountain', { song: [] });

      rightClick(container);

      const menu = container.querySelector('.context-menu');
      expect(menu).not.toBeNull();
      expect(menu.textContent).toContain('Edit Song');
    });

    it('does not show context menu for a wall entity', () => {
      const container = document.getElementById('editor-viewport');
      addEntityAndMockRaycast('wall', {});

      rightClick(container);

      const menu = container.querySelector('.context-menu');
      expect(menu).toBeNull();
    });

    it('does not show context menu when no entity is hit', () => {
      const container = document.getElementById('editor-viewport');
      mockIntersectObjects.mockReturnValue([]);

      rightClick(container);

      const menu = container.querySelector('.context-menu');
      expect(menu).toBeNull();
    });

    it('clicking Edit Song opens the song editor modal', () => {
      const container = document.getElementById('editor-viewport');
      addEntityAndMockRaycast('fountain', { song: [] });

      rightClick(container);

      const menuItem = container.querySelector('.context-menu-item');
      menuItem.click();

      expect(app.songEditorModal.isOpen).toBe(true);
    });
  });

  describe('PropertyPanel onEditSong callback', () => {
    it('opens the song editor modal when Edit Song button is clicked', () => {
      const id = app.undoManager.addEntity('fountain', 5, 0, 3, { song: [] });
      app.propertyPanel.show(id);

      const editBtn = document.querySelector('.edit-song-btn');
      expect(editBtn).not.toBeNull();

      editBtn.click();
      expect(app.songEditorModal.isOpen).toBe(true);
    });
  });

  describe('keyboard isolation', () => {
    it('suppresses editor keyboard shortcuts when song modal is open', () => {
      const id = app.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });
      app.songEditorModal.open(id);

      const undoSpy = jest.spyOn(app.undoManager, 'undo');
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })
      );

      expect(undoSpy).not.toHaveBeenCalled();
    });

    it('allows editor keyboard shortcuts when song modal is closed', () => {
      // Create an entity and make a change so there's something to undo
      app.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      const undoSpy = jest.spyOn(app.undoManager, 'undo');
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })
      );

      expect(undoSpy).toHaveBeenCalled();
    });
  });
});
