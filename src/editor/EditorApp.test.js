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
  const mockScene = { add: jest.fn(), children: [] };
  // The test helper's vectors (moduleNameMapper maps 'three' to it)
  const { Vector3, Quaternion } = jest.requireActual('three');
  return {
    Scene: jest.fn(() => mockScene),
    WebGLRenderer: jest.fn(() => ({
      setPixelRatio: jest.fn(),
      setSize: jest.fn(),
      setClearColor: jest.fn(),
      render: jest.fn(),
      dispose: jest.fn(),
      domElement: global.document.createElement('canvas'),
    })),
    PerspectiveCamera: jest.fn((fov, aspect, near, far) => ({
      position: new Vector3(),
      quaternion: new Quaternion(),
      fov,
      near,
      far,
      lookAt: jest.fn(),
      aspect: 1,
      updateProjectionMatrix: jest.fn(),
      updateMatrixWorld: jest.fn(),
      setViewOffset(fullWidth, fullHeight, offsetX, offsetY, width, height) {
        this.view = { enabled: true, fullWidth, fullHeight, offsetX, offsetY, width, height };
      },
      clearViewOffset() {
        if (this.view) this.view.enabled = false;
      },
      // Identity orientation: camera right = +X, forward (into screen) = -Z, so
      // Right→+x, Left→-x, Up→-z, Down→+z (see _cursorDeltaForArrow).
      matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
    })),
    AmbientLight: jest.fn(() => ({})),
    DirectionalLight: jest.fn(() => ({ position: { set: jest.fn() } })),
    Raycaster: jest.fn(() => ({
      setFromCamera: jest.fn(),
      intersectObjects: mockIntersectObjects,
    })),
    Vector2: jest.fn((x, y) => ({ x, y })),
    Color: jest.fn(() => ({ setHSL: jest.fn().mockReturnThis() })),
    // Used by FloorRegionPanel (real) when it rebuilds floor-region meshes.
    BoxGeometry: jest.fn(() => ({ dispose: jest.fn() })),
    MeshStandardMaterial: jest.fn(() => ({ dispose: jest.fn() })),
    Mesh: jest.fn(() => ({
      position: { set: jest.fn() },
      geometry: { dispose: jest.fn() },
      material: { dispose: jest.fn() },
    })),
  };
});

jest.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: jest.fn(() => ({
    target: new (jest.requireActual('three').Vector3)(),
    enableDamping: false,
    dampingFactor: 0,
    enabled: true,
    update: jest.fn(),
    dispose: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })),
}));

jest.mock('editor/viewport/EditorScene', () =>
  jest.fn(() => ({
    getHoveredGrid: jest.fn(() => ({ x: 7, z: 7 })),
    gridFromEvent: jest.fn(),
    updateHover: jest.fn(),
    update: jest.fn(),
    syncGridSize: jest.fn(),
    moveCursor: jest.fn(),
    recenterCursor: jest.fn(),
    cellToContainerXY: jest.fn(() => ({ x: 0, y: 0 })),
    setFloorRange: jest.fn(),
    clearFloorRange: jest.fn(),
    setCursor: jest.fn(),
    activeElevation: 0,
    _groundPlane: null,
    _scene: { add: jest.fn(), remove: jest.fn() },
  }))
);

jest.mock('editor/viewport/EntityPlacer', () =>
  jest.fn(() => ({
    getAllMeshes: jest.fn().mockReturnValue([]),
    getMeshById: jest.fn().mockReturnValue(mockMesh),
    getEntityIdFromMesh: jest.fn().mockReturnValue(null),
    rebuildFromModel: jest.fn(),
    placeEntity: jest.fn(),
    setEntityPosition: jest.fn(),
    removeEntityById: jest.fn(),
    clearPlayerSpawn: jest.fn(),
    refreshLinkBadge: jest.fn(),
    setLook: jest.fn(),
  }))
);

// The game look builds the game's shaders: a stand-in that only records
jest.mock('editor/viewport/GameLookLayer', () =>
  jest.fn(() => ({
    visible: true,
    animates: false,
    sync: jest.fn(),
    update: jest.fn(),
    setSelected: jest.fn(),
    noteOn: jest.fn(),
    silence: jest.fn(),
    lookOf: jest.fn(() => null),
    setCuesVisible: jest.fn(),
    root: {},
    dispose: jest.fn(),
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

// The schematic look's floor tiles (instanced boxes: no WebGL here)
jest.mock('editor/viewport/TileSlabs', () =>
  jest.fn(() => ({ sync: jest.fn(), setVisible: jest.fn(), dispose: jest.fn() }))
);

jest.mock('editor/viewport/GhostPreview', () =>
  jest.fn(() => ({
    setEntityType: jest.fn(),
    update: jest.fn(),
    dispose: jest.fn(),
  }))
);

jest.mock('editor/viewport/RangeIndicator', () =>
  jest.fn(() => ({
    show: jest.fn(),
    hide: jest.fn(),
  }))
);

jest.mock('editor/io/sessionPersistence', () => ({
  saveSession: jest.fn(),
  loadSession: jest.fn().mockReturnValue(null),
  clearSession: jest.fn(),
}));

/* eslint-disable import/first -- these imports must stay BELOW the mock consts:
   the jest.mock factories above reference them when the first import loads */
import EditorApp from 'editor/EditorApp';
import { ELEVATION_HEIGHT, WORLD_SCALE } from 'core/constants';
import { loadSession } from 'editor/io/sessionPersistence';
import { deserializePuzzle } from 'editor/model/serialization';
import { createLink } from 'editor/io/portalLinks';
import { savePuzzleJsonToRepo } from 'editor/io/repoPersistence';
/* eslint-enable import/first */

function setupEditorDOM() {
  document.body.innerHTML = `
    <div id="editor-root">
      <div id="editor-sidebar">
        <h2>Editor</h2>
        <div id="toolbar-panel"></div>
        <div id="puzzle-panel"></div>
        <div id="world-panel"></div>
        <div id="git-panel"></div>
        <div id="elevation-panel"></div>
        <div id="entity-toolbar"></div>
        <div id="property-panel"></div>
        <div id="metadata-panel"></div>
        <div id="validation-panel"></div>
      </div>
      <div id="editor-viewport" style="width:800px;height:600px;"></div>
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

  describe('session restore is disk-authoritative', () => {
    afterEach(() => {
      delete global.fetch;
    });

    function mockRepo(manifestPuzzles, diskJson) {
      global.fetch = jest.fn((url) => {
        if (url.includes('manifest.json')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ puzzles: manifestPuzzles }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(diskJson) });
      });
    }

    it('restores the on-disk copy when the saved level exists in the repo', async () => {
      // Stale localStorage snapshot says tempo 144...
      loadSession.mockReturnValueOnce(
        deserializePuzzle({
          id: 'test-x',
          name: 'X',
          difficulty: 1,
          gridSize: 15,
          tempo: 144,
          playerStart: { x: 0, y: 0, z: 0 },
          entities: [],
        })
      );
      // ...but the repo file (authoritative) says 120.
      mockRepo([{ id: 'test-x', name: 'X', difficulty: 1 }], {
        id: 'test-x',
        name: 'X',
        difficulty: 1,
        gridSize: 15,
        tempo: 120,
        playerStart: { x: 0, y: 0, z: 0 },
        entities: [],
      });

      await app._restoreSession();

      expect(app.undoManager.getMetadata().tempo).toBe(120);
    });

    it('falls back to the saved snapshot when the level is not in the repo', async () => {
      loadSession.mockReturnValueOnce(
        deserializePuzzle({
          id: 'unsaved',
          name: 'U',
          difficulty: 1,
          gridSize: 15,
          tempo: 144,
          playerStart: { x: 0, y: 0, z: 0 },
          entities: [],
        })
      );
      mockRepo([], null);

      await app._restoreSession();

      expect(app.undoManager.getMetadata().tempo).toBe(144);
    });
  });

  describe('gate link context-menu flows', () => {
    let idA;
    let idB;

    const container = () => document.getElementById('editor-viewport');
    const linkOf = (id) => app.undoManager.getEntity(id).data.link;
    const toastText = () => container().querySelector('.viewport-toast').textContent;

    /** Point the mocked viewport raycast at an entity (or at nothing). */
    function aimRaycastAt(id) {
      if (id === null) {
        mockIntersectObjects.mockReturnValue([]);
        app.entityPlacer.getEntityIdFromMesh.mockReturnValue(null);
        return;
      }
      const hitMesh = { userData: { entityId: id } };
      app.entityPlacer.getAllMeshes.mockReturnValue([hitMesh]);
      app.entityPlacer.getEntityIdFromMesh.mockReturnValue(id);
      mockIntersectObjects.mockReturnValue([{ object: hitMesh }]);
    }

    function rightClickOn(id) {
      aimRaycastAt(id);
      container().dispatchEvent(
        new MouseEvent('contextmenu', { clientX: 100, clientY: 100, bubbles: true })
      );
    }

    /** Click the menu item whose label starts with the given text. */
    function clickMenuItem(labelPrefix) {
      const item = [...container().querySelectorAll('.context-menu-item')].find((btn) =>
        btn.textContent.startsWith(labelPrefix)
      );
      expect(item).toBeDefined();
      item.click(); // a real bubbling DOM click, like the user's
    }

    function viewportClick() {
      container().dispatchEvent(
        new MouseEvent('click', { clientX: 200, clientY: 200, bubbles: true })
      );
    }

    /** Let the createLink/clearLink promise chains settle (no timers involved). */
    async function flushAsync() {
      for (let i = 0; i < 10; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
      }
    }

    beforeEach(() => {
      // PropertyPanel.show on a gate lists link targets from the manifest;
      // serve an empty one so no error toast overwrites the ones we assert
      global.fetch = jest.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ puzzles: [] }) })
      );
      // Links need a puzzle id, and each gate a stable gateId (normally
      // assigned by EntityPlacer.placeEntity, which is mocked here)
      app.undoManager.setMetadata({ id: 'test-puzzle', name: 'Test Puzzle' });
      idA = app.undoManager.addEntity('gate', 5, 0, 3, { song: [], gateId: 'gate-1' });
      idB = app.undoManager.addEntity('gate', 8, 0, 3, { song: [], gateId: 'gate-2' });
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('the two-click Teleport flow links both gates', async () => {
      rightClickOn(idA);
      // Aim the raycast at NOTHING for the menu click itself: if the menu
      // click bubbled into the viewport click handler (the stopPropagation
      // regression), pick mode would instantly cancel as "not a gate"
      aimRaycastAt(null);
      clickMenuItem('Teleport:');

      aimRaycastAt(idB);
      viewportClick();
      await flushAsync();

      expect(linkOf(idA)).toEqual({ puzzleId: 'test-puzzle', gateId: 'gate-2' });
      expect(linkOf(idB)).toEqual({ puzzleId: 'test-puzzle', gateId: 'gate-1' });
      expect(toastText()).toBe('Gates linked (both sides)');
    });

    it('menu item clicks never bubble into the viewport click handler', () => {
      const viewportClickSpy = jest.fn();
      container().addEventListener('click', viewportClickSpy);
      app.contextMenu.show(10, 10, [{ label: 'Do something', action: jest.fn() }]);

      container().querySelector('.context-menu-item').click();

      expect(viewportClickSpy).not.toHaveBeenCalled();
      container().removeEventListener('click', viewportClickSpy);
    });

    it('Esc cancels teleport-pick mode: the next gate click just selects, no link', async () => {
      rightClickOn(idA);
      aimRaycastAt(null);
      clickMenuItem('Teleport:');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(toastText()).toBe('Teleport cancelled');

      aimRaycastAt(idB);
      viewportClick();
      await flushAsync();

      expect(linkOf(idA)).toBeUndefined();
      expect(linkOf(idB)).toBeUndefined();
    });

    it('picking something that is not a gate cancels the teleport', async () => {
      const idWall = app.undoManager.addEntity('wall', 2, 0, 2, {});
      rightClickOn(idA);
      aimRaycastAt(null);
      clickMenuItem('Teleport:');

      aimRaycastAt(idWall);
      viewportClick();
      expect(toastText()).toBe('Teleport cancelled — that was not a gate');

      // Pick mode is gone: a later gate click no longer links
      aimRaycastAt(idB);
      viewportClick();
      await flushAsync();
      expect(linkOf(idA)).toBeUndefined();
    });

    it('picking the source gate itself stays in pick mode until a partner is chosen', async () => {
      rightClickOn(idA);
      aimRaycastAt(null);
      clickMenuItem('Teleport:');

      aimRaycastAt(idA);
      viewportClick();
      expect(toastText()).toBe("A gate can't link to itself — pick a different gate");

      aimRaycastAt(idB);
      viewportClick();
      await flushAsync();
      expect(linkOf(idA)).toEqual({ puzzleId: 'test-puzzle', gateId: 'gate-2' });
    });

    it('"Link by id…" with a gate id links both sides of the pair', async () => {
      jest.spyOn(window, 'prompt').mockReturnValue('gate-2');

      rightClickOn(idA);
      clickMenuItem('Link by id');
      await flushAsync();

      expect(linkOf(idA)).toEqual({ puzzleId: 'test-puzzle', gateId: 'gate-2' });
      expect(linkOf(idB)).toEqual({ puzzleId: 'test-puzzle', gateId: 'gate-1' });
      expect(toastText()).toBe('Gates linked (both sides)');
    });

    it('"Link by id…" cancelled at the prompt changes nothing', async () => {
      jest.spyOn(window, 'prompt').mockReturnValue(null);

      rightClickOn(idA);
      clickMenuItem('Link by id');
      await flushAsync();

      expect(linkOf(idA)).toBeUndefined();
      expect(linkOf(idB)).toBeUndefined();
    });

    it('"Link by id…" rejects malformed input with a toast, links nothing', async () => {
      jest.spyOn(window, 'prompt').mockReturnValue('not//a//valid//target');

      rightClickOn(idA);
      clickMenuItem('Link by id');
      await flushAsync();

      expect(toastText()).toBe('Enter a gate id ("gate-2") or puzzle/gate ("the-lure/gate-1")');
      expect(linkOf(idA)).toBeUndefined();
    });

    it('"Link by id…" toasts when the target gate does not exist', async () => {
      jest.spyOn(window, 'prompt').mockReturnValue('gate-9');

      rightClickOn(idA);
      clickMenuItem('Link by id');
      await flushAsync();

      expect(toastText()).toBe('Gate "gate-9" not found in this puzzle');
      expect(linkOf(idA)).toBeUndefined();
    });

    it('declining the song-replace confirm cancels the link and keeps both songs', async () => {
      const songA = [{ pitch: 'C4', length: '1/4' }];
      const songB = [{ pitch: 'D4', length: '1/4' }];
      app.undoManager.updateEntity(idA, { data: { song: songA, gateId: 'gate-1' } });
      app.undoManager.updateEntity(idB, { data: { song: songB, gateId: 'gate-2' } });
      jest.spyOn(window, 'prompt').mockReturnValue('gate-2');
      jest.spyOn(window, 'confirm').mockReturnValue(false);

      rightClickOn(idA);
      clickMenuItem('Link by id');
      await flushAsync();

      expect(toastText()).toBe('Teleport cancelled — kept both songs');
      expect(linkOf(idA)).toBeUndefined();
      expect(linkOf(idB)).toBeUndefined();
      expect(app.undoManager.getEntity(idA).data.song).toEqual(songA);
      expect(app.undoManager.getEntity(idB).data.song).toEqual(songB);
    });

    it('a linked gate shows its link in the menu, and Clear Link clears both sides', async () => {
      await createLink(app.undoManager, idA, 'test-puzzle', 'gate-2');

      rightClickOn(idA);
      const labels = [...container().querySelectorAll('.context-menu-item')].map(
        (btn) => btn.textContent
      );
      expect(labels).toContain('Linked → test-puzzle/gate-2');

      clickMenuItem('Clear Link');
      await flushAsync();

      expect(linkOf(idA)).toBeUndefined();
      expect(linkOf(idB)).toBeUndefined();
      expect(toastText()).toBe('Link cleared (both sides)');
    });

    it('an unlinked gate offers no Clear Link item', () => {
      rightClickOn(idA);

      const labels = [...container().querySelectorAll('.context-menu-item')].map(
        (btn) => btn.textContent
      );
      expect(labels).not.toContain('Clear Link');
      expect(labels.some((l) => l.startsWith('Teleport:'))).toBe(true);
      expect(labels.some((l) => l.startsWith('Link by id'))).toBe(true);
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

    it('suppresses editor keyboard shortcuts when the world overview is open', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ puzzles: [] }) })
      );
      await app.worldOverview.open();

      const undoSpy = jest.spyOn(app.undoManager, 'undo');
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })
      );

      expect(undoSpy).not.toHaveBeenCalled();
      delete global.fetch;
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

  describe('keyboard grid navigation', () => {
    // The mocked EditorScene reports a cursor at (7, 7) and records moveCursor.
    const press = (key) =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      );

    it('moves the cursor with the arrow keys (identity camera)', () => {
      const move = app.editorScene.moveCursor;
      press('ArrowRight');
      expect(move).toHaveBeenLastCalledWith(1, 0);
      press('ArrowLeft');
      expect(move).toHaveBeenLastCalledWith(-1, 0);
      press('ArrowUp');
      expect(move).toHaveBeenLastCalledWith(0, -1);
      press('ArrowDown');
      expect(move).toHaveBeenLastCalledWith(0, 1);
    });

    it('remaps the arrow keys to the grid orientation as the camera orbits', () => {
      // Rotate the camera 90° about Y: screen-right → +Z, into-screen → +X.
      app.camera.matrixWorld.elements = [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1];
      const move = app.editorScene.moveCursor;
      move.mockClear();
      press('ArrowRight');
      expect(move).toHaveBeenLastCalledWith(0, 1); // now +z
      press('ArrowUp');
      expect(move).toHaveBeenLastCalledWith(1, 0); // now +x
    });

    it('places an entity at the cursor cell on its letter key', () => {
      press('c');
      // placeEntity(type, gridX, gridZ, elevation) — cursor (7,7) at elevation 0
      expect(app.entityPlacer.placeEntity).toHaveBeenCalledWith('creature', 7, 7, 0);
    });

    it('maps each placement key to the right entity type', () => {
      const cases = { p: 'player', g: 'gate', w: 'wall', r: 'ramp', l: 'waystone' };
      Object.entries(cases).forEach(([key, type]) => {
        app.entityPlacer.placeEntity.mockClear();
        press(key);
        expect(app.entityPlacer.placeEntity).toHaveBeenCalledWith(type, 7, 7, 0);
      });
    });

    it('refuses placement on an occupied cell', () => {
      app.undoManager.addEntity('wall', 7, 0, 7, {}); // occupy the cursor cell
      app.entityPlacer.placeEntity.mockClear();
      press('c');
      expect(app.entityPlacer.placeEntity).not.toHaveBeenCalled();
    });

    it('allows a waystone on the player spawn cell (the one sharing exception)', () => {
      app.undoManager.setPlayerSpawn(7, 0, 7);
      app.entityPlacer.placeEntity.mockClear();
      press('l');
      expect(app.entityPlacer.placeEntity).toHaveBeenCalledWith('waystone', 7, 7, 0);
    });

    it('allows the player spawn on a waystone tile', () => {
      app.undoManager.addEntity('waystone', 7, 0, 7, {});
      app.entityPlacer.placeEntity.mockClear();
      press('p');
      expect(app.entityPlacer.placeEntity).toHaveBeenCalledWith('player', 7, 7, 0);
    });

    it('allows a waystone on a gate cell (waystone under a doorway)', () => {
      app.undoManager.addEntity('gate', 7, 0, 7, {});
      app.entityPlacer.placeEntity.mockClear();
      press('l');
      expect(app.entityPlacer.placeEntity).toHaveBeenCalledWith('waystone', 7, 7, 0);
    });

    it('allows a gate on a waystone tile', () => {
      app.undoManager.addEntity('waystone', 7, 0, 7, {});
      app.entityPlacer.placeEntity.mockClear();
      press('g');
      expect(app.entityPlacer.placeEntity).toHaveBeenCalledWith('gate', 7, 7, 0);
    });

    it('still refuses a non-waystone entity on the spawn cell', () => {
      app.undoManager.setPlayerSpawn(7, 0, 7);
      app.entityPlacer.placeEntity.mockClear();
      press('c');
      expect(app.entityPlacer.placeEntity).not.toHaveBeenCalled();
    });

    it('does not navigate or place while typing in a field', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
      expect(app.editorScene.moveCursor).not.toHaveBeenCalled();
      expect(app.entityPlacer.placeEntity).not.toHaveBeenCalled();
      input.remove();
    });

    it('opens the context menu for the entity under the cursor on Enter', () => {
      app.undoManager.addEntity('creature', 7, 0, 7, { song: [] });
      press('Enter');
      expect(document.querySelector('.context-menu')).not.toBeNull();
    });

    it('routes keys to the menu, not the grid, while the menu is open', () => {
      app.undoManager.addEntity('creature', 7, 0, 7, { song: [] });
      press('Enter'); // opens the menu
      app.editorScene.moveCursor.mockClear();
      press('ArrowDown'); // the menu owns this now
      expect(app.editorScene.moveCursor).not.toHaveBeenCalled();
    });

    it('deletes the entity under the cursor on Delete', async () => {
      const id = app.undoManager.addEntity('wall', 7, 0, 7, {});
      press('Delete');
      // _deleteSelectedEntity awaits a link-release (a no-op microtask for a
      // wall); flush the microtask queue so the removal lands. (Global fake
      // timers rule out setTimeout-based flushing here.)
      await Promise.resolve();
      await Promise.resolve();
      expect(app.entityPlacer.removeEntityById).toHaveBeenCalledWith(id);
    });

    it('clears the player spawn when Delete lands on the spawn cell', () => {
      app.undoManager.setPlayerSpawn(7, 0, 7);
      press('Delete');
      expect(app.entityPlacer.clearPlayerSpawn).toHaveBeenCalled();
    });

    // Shift+Arrow moves the entity on the cursor cell (cursor mocked at 7,7;
    // identity camera → ArrowRight is +x, so the target is (8, 7)).
    const shiftPress = (key) =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key, shiftKey: true, bubbles: true, cancelable: true })
      );

    it('moves the entity on the cursor cell with Shift+Arrow', () => {
      const id = app.undoManager.addEntity('wall', 7, 0, 7, {});
      shiftPress('ArrowRight');
      // setEntityPosition(id, gridX, gridZ, elevation)
      expect(app.entityPlacer.setEntityPosition).toHaveBeenCalledWith(id, 8, 7, 0);
    });

    it('refuses a Shift+Arrow move onto an occupied cell', () => {
      app.undoManager.addEntity('wall', 7, 0, 7, {}); // the mover
      app.undoManager.addEntity('wall', 8, 0, 7, {}); // blocks the target
      shiftPress('ArrowRight');
      expect(app.entityPlacer.setEntityPosition).not.toHaveBeenCalled();
    });

    it('relocates the player spawn with Shift+Arrow', () => {
      app.undoManager.setPlayerSpawn(7, 0, 7);
      shiftPress('ArrowRight');
      expect(app.entityPlacer.placeEntity).toHaveBeenCalledWith('player', 8, 7, 0);
    });

    it('Shift+Arrow may park the spawn on a waystone tile', () => {
      app.undoManager.addEntity('waystone', 8, 0, 7, {});
      app.undoManager.setPlayerSpawn(7, 0, 7);
      app.entityPlacer.placeEntity.mockClear();
      shiftPress('ArrowRight');
      expect(app.entityPlacer.placeEntity).toHaveBeenCalledWith('player', 8, 7, 0);
    });
  });

  describe('storeys (Option+Arrow)', () => {
    const optionPress = (key, shift = false) =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key,
          altKey: true,
          shiftKey: shift,
          bubbles: true,
          cancelable: true,
        })
      );

    it('Option+Up/Down steps the storey, built on or not, below the ground too', () => {
      expect(app.editorScene.activeElevation).toBe(0);
      optionPress('ArrowUp');
      optionPress('ArrowUp');
      expect(app.editorScene.activeElevation).toBe(2);
      optionPress('ArrowDown');
      optionPress('ArrowDown');
      optionPress('ArrowDown');
      expect(app.editorScene.activeElevation).toBe(-1); // a subfloor
      expect(app.undoManager.getTiles()).toEqual([]); // stepping builds nothing
    });

    it('stops at the deepest subfloor and the top storey (-9 .. 9)', () => {
      for (let i = 0; i < 12; i += 1) optionPress('ArrowDown');
      expect(app.editorScene.activeElevation).toBe(-9);
      expect(app.elevationSelector.value).toBe(-9);
      for (let i = 0; i < 25; i += 1) optionPress('ArrowUp');
      expect(app.editorScene.activeElevation).toBe(9);
    });

    it('builds floor on a subfloor, and carries an entity down onto it (its tile comes too)', () => {
      optionPress('ArrowDown');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
      expect(app.undoManager.getTiles()).toEqual([{ x: 7, y: -1, z: 7 }]);

      optionPress('ArrowUp');
      const id = app.undoManager.addEntity('wall', 7, 0, 7, {});
      optionPress('ArrowDown', true);
      expect(app.entityPlacer.setEntityPosition).toHaveBeenCalledWith(id, 7, 7, -1);
      expect(app.editorScene.activeElevation).toBe(-1);
    });

    it('the sidebar control steps below the ground too', () => {
      const down = () => document.querySelectorAll('#elevation-panel .elevation-btn')[0];
      down().click();
      down().click();
      expect(app.editorScene.activeElevation).toBe(-2);
      expect(document.querySelector('#elevation-panel .elevation-display').textContent).toBe('-2');
    });

    it('Shift+Option+Up carries the entity up a storey and follows it', () => {
      const id = app.undoManager.addEntity('wall', 7, 0, 7, {}); // cursor (7,7), elev 0
      optionPress('ArrowUp', true);
      expect(app.entityPlacer.setEntityPosition).toHaveBeenCalledWith(id, 7, 7, 1);
      expect(app.editorScene.activeElevation).toBe(1); // active layer follows
    });

    it('refuses a carry onto an occupied cell', () => {
      app.undoManager.addEntity('wall', 7, 0, 7, {}); // the mover
      app.undoManager.addEntity('wall', 7, 1, 7, {}); // blocks the target layer
      optionPress('ArrowUp', true);
      expect(app.entityPlacer.setEntityPosition).not.toHaveBeenCalled();
    });
  });

  // ✕ / Enter on a cell with no floor builds it: a tap one tile, held and
  // moved a rectangle, built when let go (one undo step)
  describe('building floor', () => {
    const key = (type, k, opts = {}) =>
      document.dispatchEvent(
        new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true, ...opts })
      );
    const cursorAt = (x, z) => app.editorScene.getHoveredGrid.mockReturnValue({ x, z });

    it('a new puzzle has no floor and no walls at all', () => {
      expect(app.undoManager.getTiles()).toEqual([]);
      expect(app.undoManager.getEntities()).toEqual([]);
    });

    it('Enter on a cell with no floor builds its tile when let go', () => {
      key('keydown', 'Enter');
      expect(app.editorScene.setFloorRange).toHaveBeenCalledWith({ x: 7, z: 7 }, 0);
      expect(app.undoManager.getTiles()).toEqual([]); // not yet: still held
      key('keyup', 'Enter');
      expect(app.undoManager.getTiles()).toEqual([{ x: 7, y: 0, z: 7 }]);
      expect(app.editorScene.clearFloorRange).toHaveBeenCalled();
      expect(document.querySelector('.context-menu')).toBeNull();
    });

    it('held while the cursor moves, it builds the rectangle, as ONE undo step', () => {
      app.undoManager.addTiles([{ x: 8, y: 0, z: 6 }]); // already built: kept
      key('keydown', 'Enter');
      key('keydown', 'Enter', { repeat: true }); // the held key repeating
      cursorAt(9, 5); // the arrows took the cursor here
      key('keyup', 'Enter');
      const tiles = app.undoManager.getTiles();
      expect(tiles).toHaveLength(3 * 3);
      expect(tiles).toContainEqual({ x: 9, y: 0, z: 5 });
      app._undo();
      expect(app.undoManager.getTiles()).toEqual([{ x: 8, y: 0, z: 6 }]);
    });

    it('builds on the active storey', () => {
      app.editorScene.activeElevation = 2;
      key('keydown', 'Enter');
      key('keyup', 'Enter');
      expect(app.undoManager.getTiles()).toEqual([{ x: 7, y: 2, z: 7 }]);
    });

    it('Escape calls a held range off, building nothing', () => {
      key('keydown', 'Enter');
      key('keydown', 'Escape');
      key('keyup', 'Enter');
      expect(app.undoManager.getTiles()).toEqual([]);
    });

    it('on built floor, Enter places the chosen type as before (and builds nothing)', () => {
      app.undoManager.addTiles([{ x: 7, y: 0, z: 7 }]);
      app.entityToolbar.cycle(1); // the player spawn
      app.entityToolbar.cycle(1); // the creature
      key('keydown', 'Enter');
      key('keyup', 'Enter');
      expect(app.entityPlacer.placeEntity).toHaveBeenCalledWith('creature', 7, 7, 0);
      expect(app.undoManager.getTiles()).toHaveLength(1);
    });

    it('a click on a cell with no floor builds it; a click on floor only selects', () => {
      const container = document.getElementById('editor-viewport');
      app.editorScene.gridFromEvent.mockReturnValue({ x: -3, z: 4 });
      container.click();
      expect(app.undoManager.getTiles()).toEqual([{ x: -3, y: 0, z: 4 }]);
      container.click(); // now floor: nothing more is built
      expect(app.undoManager.getTiles()).toHaveLength(1);
    });

    it('the cursor goes anywhere: no grid edge, negative cells too', () => {
      cursorAt(-12, 40);
      key('keydown', 'Enter');
      key('keyup', 'Enter');
      expect(app.undoManager.hasTile(-12, 0, 40)).toBe(true);
    });

    it('the F key no longer does anything', () => {
      key('keydown', 'f');
      expect(app.editorScene.setFloorRange).not.toHaveBeenCalled();
      expect(app.undoManager.canUndo()).toBe(false);
    });
  });

  // □ / Delete: the entity first, then (bare floor) the floor tile under it
  describe('Delete removes the entity, then its floor', () => {
    const press = (key) =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      );

    it('on bare floor, deletes that one tile', () => {
      app.undoManager.addTiles([
        { x: 7, y: 0, z: 7 },
        { x: 8, y: 0, z: 7 },
      ]);
      press('Delete');
      expect(app.undoManager.getTiles()).toEqual([{ x: 8, y: 0, z: 7 }]);
    });

    it('twice on an entity: the entity, then its floor', async () => {
      app.undoManager.addTiles([{ x: 7, y: 0, z: 7 }]);
      const id = app.undoManager.addEntity('wall', 7, 0, 7, {});
      // The mocked placer only records: remove it from the model as the real one does
      app.entityPlacer.removeEntityById.mockImplementation((eid) =>
        app.undoManager.removeEntity(eid)
      );
      press('Delete');
      await Promise.resolve();
      await Promise.resolve();
      expect(app.undoManager.getEntity(id)).toBeUndefined();
      expect(app.undoManager.hasTile(7, 0, 7)).toBe(true); // the floor stays this press

      press('Delete');
      expect(app.undoManager.hasTile(7, 0, 7)).toBe(false);
    });

    it('only the active storey: the floor below an upper tile stays', () => {
      app.undoManager.addTiles([
        { x: 7, y: 0, z: 7 },
        { x: 7, y: 1, z: 7 },
      ]);
      app.editorScene.activeElevation = 1;
      press('Delete');
      expect(app.undoManager.getTiles()).toEqual([{ x: 7, y: 0, z: 7 }]);
    });

    it('is a no-op where nothing is built', () => {
      expect(() => press('Delete')).not.toThrow();
      expect(app.undoManager.canUndo()).toBe(false);
    });
  });

  describe('range indicator', () => {
    it('shows range spheres for a selected creature and hides them otherwise', () => {
      const cId = app.undoManager.addEntity('creature', 5, 0, 5, { audibleRange: 12 });
      const wId = app.undoManager.addEntity('wall', 6, 0, 6, {});
      const ri = app.rangeIndicator;
      ri.show.mockClear();
      ri.hide.mockClear();

      app.selectionManager.select(cId);
      expect(ri.show).toHaveBeenCalled();

      app.selectionManager.select(wId);
      expect(ri.hide).toHaveBeenCalled();
    });

    const shiftArrowRight = () =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })
      );

    it('moves a selected creature’s spheres with it on Shift+Arrow, never rebuilding them', () => {
      const id = app.undoManager.addEntity('creature', 7, 0, 7, { audibleRange: 12 }); // under the cursor
      app.selectionManager.select(id);
      const ri = app.rangeIndicator;
      ri.show.mockClear();
      ri.hide.mockClear();

      shiftArrowRight();

      expect(app.entityPlacer.setEntityPosition).toHaveBeenCalledWith(id, 8, 7, 0);
      expect(ri.hide).not.toHaveBeenCalled(); // hiding frees them
      expect(ri.show).toHaveBeenLastCalledWith(app.undoManager.getEntity(id), mockMesh.position);
    });

    it('keeps the moved entity selected, its panel shown and scrolled into view once', () => {
      const id = app.undoManager.addEntity('creature', 7, 0, 7, { audibleRange: 12 });
      app.selectionManager.select(id);
      const panel = document.getElementById('property-panel');
      panel.scrollIntoView = jest.fn(); // jsdom has none

      shiftArrowRight();

      expect(app.selectionManager.selectedId).toBe(id);
      expect(panel.textContent).toContain('Creature Properties');
      expect(panel.scrollIntoView).toHaveBeenCalledTimes(1);
      expect(panel.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    });

    it('deselects an entity re-selected after its mesh is gone', () => {
      const id = app.undoManager.addEntity('creature', 7, 0, 7, { audibleRange: 12 });
      app.selectionManager.select(id);
      app.rangeIndicator.hide.mockClear();
      app.entityPlacer.getMeshById.mockReturnValue(null); // its mesh is gone

      app.selectionManager.select(id);

      expect(app.selectionManager.selectedId).toBeNull();
      expect(document.getElementById('property-panel').textContent).toBe('');
      expect(app.rangeIndicator.hide).toHaveBeenCalled();
    });
  });

  describe('the game look and the schematic look', () => {
    beforeAll(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    const press = (key) =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      );

    it('starts in the game look: the schematic meshes are pick targets only', () => {
      expect(app.look).toBe('game');
      expect(app.gameLook.visible).toBe(true);
      expect(app.entityPlacer.setLook).toHaveBeenLastCalledWith('game');
    });

    it('V switches to the schematic look and back', () => {
      press('v');
      expect(app.look).toBe('schematic');
      expect(app.gameLook.visible).toBe(false);
      expect(app.entityPlacer.setLook).toHaveBeenLastCalledWith('schematic');

      press('v');
      expect(app.look).toBe('game');
      expect(app.gameLook.visible).toBe(true);
    });

    it('the toolbar look button switches it too', () => {
      document.querySelector('.toolbar-look').click();
      expect(app.look).toBe('schematic');
    });

    it('is remembered: the next visit opens in the look last chosen', () => {
      press('v');
      app.dispose();
      setupEditorDOM();
      app = new EditorApp();
      app.init();

      expect(app.look).toBe('schematic');
      expect(app.gameLook.visible).toBe(false);
    });

    it('builds nothing in the schematic look, and catches up when the game look returns', () => {
      press('v');
      app.gameLook.sync.mockClear();
      app.undoManager.addEntity('wall', 1, 0, 1, {});
      expect(app.gameLook.sync).not.toHaveBeenCalled();

      press('v');
      expect(app.gameLook.sync).toHaveBeenCalledWith(app.undoManager);
    });
  });

  describe('hearing a song from the viewport (A)', () => {
    const press = (key) =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      );

    it('plays the song of the creature under the cursor, lighting it note by note', async () => {
      // The mocked scene's cursor is at (7, 7)
      const id = app.undoManager.addEntity('creature', 7, 0, 7, {
        song: [
          { pitch: 'E4', length: '1/2' },
          { pitch: 'G4', length: '1/4' },
        ],
      });
      press('a');

      expect(app.audition.playingId).toBe(id);
      // 120 bpm: a half note sounds 1 s
      expect(app.gameLook.noteOn).toHaveBeenCalledWith(id, 'E4', 1);
      await jest.advanceTimersByTimeAsync(1000);
      expect(app.gameLook.noteOn).toHaveBeenLastCalledWith(id, 'G4', 0.5);
    });

    it('A again stops it, and the creature goes dark', () => {
      const id = app.undoManager.addEntity('creature', 7, 0, 7, {
        song: [{ pitch: 'E4', length: '1/1' }],
      });
      press('a');
      press('a');

      expect(app.audition.playingId).toBeNull();
      expect(app.gameLook.silence).toHaveBeenCalledWith(id);
    });

    it("the song editor's Play lights the creature too, and Stop puts it out", async () => {
      const id = app.undoManager.addEntity('creature', 7, 0, 7, {
        song: [{ pitch: 'E4', length: '1/2' }],
      });
      app.openSongEditor(id);
      const button = (label) =>
        [...document.querySelectorAll('.song-modal button')].find((b) => b.textContent === label);

      button('Play').click();
      await jest.advanceTimersByTimeAsync(0);
      expect(app.gameLook.noteOn).toHaveBeenCalledWith(id, 'E4', 1);

      button('Stop').click();
      expect(app.gameLook.silence).toHaveBeenCalledWith(id);
    });

    it('closing the song editor (Done, Esc, ○) puts the camera and cursor back where they were', () => {
      const xyz = ({ x, y, z }) => [x, y, z];
      const id = app.undoManager.addEntity('gate', 7, 0, 7, { song: [] });
      app.camera.position.set(12, 40, 52);
      app.controls.target.set(12, 0, 22);
      app.editorScene.getHoveredGrid.mockReturnValue({ x: 3, z: -5 });
      const closes = [
        () => document.querySelector('.song-done-btn').click(),
        () =>
          document
            .querySelector('.song-modal-backdrop')
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
        () => app.songEditorModal.padAction('close'),
      ];
      closes.forEach((close) => {
        app.openSongEditor(id);
        // Whatever moved the view while it was open (its framing of the gate)
        app.camera.position.set(400, 90, -300);
        app.controls.target.set(400, 0, -330);
        app.editorScene.setCursor.mockClear();
        close();
        expect(app.songEditorModal.isOpen).toBe(false);
        expect(xyz(app.camera.position)).toEqual([12, 40, 52]);
        expect(xyz(app.controls.target)).toEqual([12, 0, 22]);
        expect(app.editorScene.setCursor).toHaveBeenCalledWith({ x: 3, z: -5 });
      });
      // A second song opened over the first: closing goes back to before the first
      app.openSongEditor(id);
      app.camera.position.set(400, 90, -300);
      const other = app.undoManager.addEntity('gate', 8, 0, 7, { song: [] });
      app.openSongEditor(other);
      app.songEditorModal.close();
      expect(xyz(app.camera.position)).toEqual([12, 40, 52]);
    });

    it('says why when there is no song under the cursor', () => {
      press('a');
      expect(document.querySelector('.viewport-toast').textContent).toMatch(/creature or gate/);
    });
  });

  describe('building with a controller (a DualShock 4)', () => {
    // A pad as Chrome reports a DualShock 4, at rest
    let pad;
    const B = { cross: 0, circle: 1, square: 2, triangle: 3, l1: 4, r1: 5, l2: 6, r2: 7 };
    Object.assign(B, {
      share: 8,
      options: 9,
      l3: 10,
      r3: 11,
      up: 12,
      down: 13,
      left: 14,
      right: 15,
    });
    B.touchpad = 17;

    beforeEach(() => {
      pad = {
        id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })),
      };
      Object.defineProperty(navigator, 'getGamepads', {
        value: () => [pad],
        configurable: true,
      });
      app.gamepad.start();
    });

    afterEach(() => {
      delete navigator.getGamepads;
    });

    const poll = () => app.gamepad.poll();
    const tap = (button) => {
      pad.buttons[B[button]].pressed = true;
      poll();
      pad.buttons[B[button]].pressed = false;
      poll();
    };
    const hold = (button) => {
      pad.buttons[B[button]].pressed = true;
      pad.buttons[B[button]].value = 1;
      poll();
    };
    const letGo = (button) => {
      pad.buttons[B[button]].pressed = false;
      pad.buttons[B[button]].value = 0;
      poll();
    };

    it('the d-pad steps the cursor, and repeats while held', () => {
      const move = app.editorScene.moveCursor;
      hold('right');
      expect(move).toHaveBeenCalledTimes(1);
      expect(move).toHaveBeenLastCalledWith(1, 0);

      jest.advanceTimersByTime(290);
      poll();
      expect(move).toHaveBeenCalledTimes(1); // not yet: a held key's delay
      jest.advanceTimersByTime(20);
      poll();
      jest.advanceTimersByTime(100);
      poll();
      expect(move).toHaveBeenCalledTimes(3);
      letGo('right');
    });

    it('the left stick pans the camera, the cursor riding on the cell at the middle of the view', () => {
      const pan = jest.spyOn(app, 'panCamera');
      const { setCursor } = app.editorScene;
      pad.axes[0] = 1; // pushed right
      poll();
      jest.advanceTimersByTime(16);
      poll();
      expect(pan).toHaveBeenCalled();
      expect(pan.mock.calls.at(-1)[0]).toBeGreaterThan(0);
      // The orbit centre sits on the storey-0 floor: its cell is the middle's
      const { target } = app.controls;
      expect(setCursor).toHaveBeenLastCalledWith({
        x: Math.floor(target.x / WORLD_SCALE),
        z: Math.floor(target.z / WORLD_SCALE),
      });
      pad.axes[0] = 0;
      poll();
    });

    it('the middle of the view is found anywhere: negative cells, any storey', () => {
      app.controls.target.set(-41, 0, -63);
      app.camera.position.set(-41, 40, -33); // looking down toward -z
      app.editorScene.activeElevation = 0;
      expect(app.viewCentreCell()).toEqual({
        x: Math.floor(-41 / WORLD_SCALE),
        z: Math.floor(-63 / WORLD_SCALE),
      });
      // Storey 4: the line of sight meets its floor nearer the camera
      app.editorScene.activeElevation = 4;
      const floorY = 4 * ELEVATION_HEIGHT;
      const t = (floorY - 40) / (0 - 40);
      expect(app.viewCentreCell()).toEqual({
        x: Math.floor(-41 / WORLD_SCALE),
        z: Math.floor((-33 + (-63 + 33) * t) / WORLD_SCALE),
      });
      // A subfloor (storey -9): further along the same line
      app.editorScene.activeElevation = -9;
      const deep = (-9 * ELEVATION_HEIGHT - 40) / -40;
      expect(app.viewCentreCell().z).toBe(Math.floor((-33 + (-63 + 33) * deep) / WORLD_SCALE));
      app.editorScene.activeElevation = 0;
    });

    it('the right stick orbits inverted on both axes', () => {
      const orbitSpy = jest.spyOn(app, 'orbitCamera');
      pad.axes[2] = 1; // right
      pad.axes[3] = -1; // up
      poll();
      jest.advanceTimersByTime(16);
      poll();
      const [azimuth, polar] = orbitSpy.mock.calls.at(-1);
      expect(azimuth).toBeLessThan(0);
      expect(polar).toBeLessThan(0); // readStick's y is up: pushed up gives +y, inverted
      pad.axes[2] = 0;
      pad.axes[3] = 0;
      poll();
    });

    it('R3 zooms in and L3 out, a step a click and on while held; under L2 they centre / reset', () => {
      const zoomSpy = jest.spyOn(app, 'zoomCamera');
      tap('r3');
      expect(zoomSpy).toHaveBeenLastCalledWith(0.8);
      tap('l3');
      expect(zoomSpy).toHaveBeenLastCalledWith(1.25);

      zoomSpy.mockClear();
      hold('r3');
      for (let t = 0; t < 400; t += 16) {
        jest.advanceTimersByTime(16);
        poll();
      }
      expect(zoomSpy.mock.calls.length).toBeGreaterThan(2);
      expect(zoomSpy.mock.calls.at(-1)[0]).toBeLessThan(1);
      letGo('r3');

      const centre = jest.spyOn(app, 'centerCameraOnCursor');
      const reset = jest.spyOn(app, 'resetCamera');
      zoomSpy.mockClear();
      hold('l2');
      tap('r3');
      tap('l3');
      letGo('l2');
      expect(centre).toHaveBeenCalledTimes(1);
      expect(reset).toHaveBeenCalledTimes(1);
      expect(zoomSpy).not.toHaveBeenCalled();
    });

    it('L1 / R1 choose what to place, and Cross places it at the cursor (on built floor)', () => {
      app.undoManager.addTiles([{ x: 7, y: 0, z: 7 }]);
      tap('r1');
      expect(app.entityToolbar.activeTool).toBe('player');
      tap('r1');
      expect(app.entityToolbar.activeTool).toBe('creature');
      tap('l1');
      tap('l1');
      expect(app.entityToolbar.activeTool).toBe('waystone'); // wraps round

      tap('r1'); // back to the player spawn
      tap('r1'); // the creature
      tap('cross');
      expect(app.entityPlacer.placeEntity).toHaveBeenLastCalledWith('creature', 7, 7, 0);
    });

    it('Cross on an entity selects it, again opens its menu, which the d-pad and Cross play', () => {
      const id = app.undoManager.addEntity('creature', 7, 0, 7, {
        song: [{ pitch: 'E4', length: '1/4' }],
      });
      tap('cross');
      expect(app.selectionManager.selectedId).toBe(id);

      tap('cross');
      expect(app.padContext()).toBe('menu');
      const menu = document.querySelector('.context-menu');
      expect(menu.textContent).toContain('Edit Song');

      tap('cross'); // its first item: Edit Song
      expect(app.songEditorModal.isOpen).toBe(true);
    });

    it('Circle closes a menu without choosing', () => {
      app.undoManager.addEntity('creature', 7, 0, 7, { song: [{ pitch: 'E4', length: '1/4' }] });
      tap('cross');
      tap('cross');
      tap('circle');
      expect(app.contextMenu.isOpen).toBe(false);
      expect(app.songEditorModal.isOpen).toBe(false);
    });

    it('Square deletes what is under the cursor', () => {
      const id = app.undoManager.addEntity('wall', 7, 0, 7, {});
      tap('square');
      expect(app.entityPlacer.removeEntityById).not.toHaveBeenCalled(); // releases links first
      return Promise.resolve().then(() => {
        expect(app.entityPlacer.removeEntityById).toHaveBeenCalledWith(id);
      });
    });

    it('R2 held carries the entity under the cursor with the d-pad (Shift+arrows)', () => {
      const id = app.undoManager.addEntity('wall', 7, 0, 7, {});
      hold('r2');
      tap('right');
      letGo('r2');
      expect(app.entityPlacer.setEntityPosition).toHaveBeenCalledWith(id, 8, 7, 0);
    });

    it('L2 held: d-pad left / right undo and redo', () => {
      app.undoManager.addEntity('wall', 2, 0, 2, {});
      hold('l2');
      tap('left');
      expect(app.undoManager.getEntities()).toHaveLength(0);
      tap('right');
      expect(app.undoManager.getEntities()).toHaveLength(1);
      letGo('l2');
    });

    it('L2 held: d-pad up climbs a storey; there Cross builds floor', () => {
      hold('l2');
      tap('up');
      letGo('l2');
      expect(app.editorScene.activeElevation).toBe(1);
      tap('cross');
      expect(app.undoManager.getTiles()).toEqual([{ x: 7, y: 1, z: 7 }]);
    });

    it('Cross on a cell with no floor builds it; held and moved, a range, let go as one step', () => {
      hold('cross');
      expect(app.undoManager.getTiles()).toEqual([]);
      app.editorScene.getHoveredGrid.mockReturnValue({ x: 5, z: 8 });
      letGo('cross');
      expect(app.undoManager.getTiles()).toHaveLength(3 * 2);
      expect(app.undoManager.hasTile(5, 0, 8)).toBe(true);
      hold('l2');
      tap('left'); // undo
      letGo('l2');
      expect(app.undoManager.getTiles()).toEqual([]);
    });

    it('Square deletes the entity, and again the floor under it; L2 + Square does nothing now', async () => {
      app.undoManager.addTiles([{ x: 7, y: 0, z: 7 }]);
      hold('l2');
      tap('square');
      letGo('l2');
      expect(app.undoManager.hasTile(7, 0, 7)).toBe(true);
      tap('square');
      expect(app.undoManager.hasTile(7, 0, 7)).toBe(false);
    });

    it('Share switches the look', () => {
      tap('share');
      expect(app.look).toBe('schematic');
      tap('share');
      expect(app.look).toBe('game');
    });

    it('Options opens the editor menu, Play first', () => {
      tap('options');
      const items = [...document.querySelectorAll('.context-menu-item')].map((b) => b.textContent);
      expect(items[0]).toBe('Play this level');
      expect(items).toEqual(expect.arrayContaining(['Open puzzle…', 'Undo', 'Redo']));
    });

    it('Game mode (Options menu or toolbar) lands the last edit, then loads the game', async () => {
      tap('options');
      expect(
        [...document.querySelectorAll('.context-menu-item')].map((b) => b.textContent)
      ).toContain('Game mode (main menu)');
      tap('circle');

      const settle = jest.spyOn(app, '_settleAutoSave');
      const loc = { assign: jest.fn() };
      await app.openGame(loc);
      expect(settle).toHaveBeenCalled();
      expect(loc.assign).toHaveBeenCalledWith('/');

      const toolbarGame = document.querySelector('.toolbar-game');
      expect(toolbarGame.textContent).toBe('Game');
    });

    it('Triangle opens the song under the cursor; there the pad writes notes, and Circle closes it', () => {
      const id = app.undoManager.addEntity('creature', 7, 0, 7, {
        song: [{ pitch: 'C4', length: '1/4' }],
      });
      tap('triangle');
      expect(app.padContext()).toBe('song');
      const song = () => app.undoManager.getEntity(id).data.song;

      tap('cross'); // the edit cursor opens at the end, on C4: C4 off -> a rest
      expect(song()).toEqual([{ length: '1/4' }]);
      tap('l2'); // L2 / R2 alone do nothing
      tap('r2');
      expect(song()).toEqual([{ length: '1/4' }]);

      hold('r2');
      expect(app.padLegend.shown).toBe('song+r2');
      tap('cross'); // R2 + Cross: a rest of the chosen duration
      letGo('r2');
      expect(song()).toHaveLength(2);

      tap('up'); // the pitch cursor a step up: D4
      tap('cross'); // the rest takes it
      expect(song()[1]).toEqual({ pitch: 'D4', length: '1/4' });
      hold('l2');
      tap('up'); // L2 + up: sharper
      letGo('l2');
      expect(song()[1].pitch).toBe('D#4');

      tap('l3'); // undo
      expect(song()[1].pitch).toBe('D4');
      tap('r3'); // redo
      expect(song()[1].pitch).toBe('D#4');

      tap('square'); // the note -> a rest
      tap('square'); // the rest -> gone
      expect(song()).toEqual([{ length: '1/4' }]);

      tap('options');
      expect(app.padContext()).toBe('song-options');
      tap('circle'); // back to the staff, the editor stays
      expect(app.padContext()).toBe('song');

      tap('circle');
      expect(app.songEditorModal.isOpen).toBe(false);
    });

    it("the touchpad steps into the sidebar: the selection's fields, values on left / right", () => {
      const id = app.undoManager.addEntity('creature', 7, 0, 7, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });
      app.selectionManager.select(id);
      tap('touchpad');
      expect(app.padContext()).toBe('panel');
      // The first field of the creature's properties: X
      expect(document.activeElement.closest('#property-panel')).not.toBeNull();

      // Down to Interval (X, Z, Interval), then step it up
      tap('down');
      tap('down');
      tap('right');
      expect(app.undoManager.getEntity(id).data.interval).toBe(9);

      tap('circle');
      expect(app.padContext()).toBe('viewport');
    });

    it('a dropdown steps with left / right and opens only the one Cross confirms', () => {
      tap('touchpad');
      app.togglePanelFocus(true, '.puzzle-select');
      const select = document.querySelector('.puzzle-select');
      const changed = jest.fn();
      select.addEventListener('change', changed);
      select.innerHTML = '<option value="a">A</option><option value="b">B</option>';
      tap('right');
      expect(select.value).toBe('b');
      expect(changed).not.toHaveBeenCalled();
      tap('cross');
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it('a dropdown stepped but not confirmed shows what it holds again when the focus leaves', () => {
      tap('touchpad');
      app.togglePanelFocus(true, '.puzzle-select');
      const select = document.querySelector('.puzzle-select');
      select.innerHTML = '<option value="a">A</option><option value="b">B</option>';
      tap('right');
      tap('circle');
      expect(select.value).toBe('a');
    });

    it("shows a legend of the pad's buttons once the pad is in hand, its L2 layer while L2 is held", () => {
      expect(document.querySelector('.pad-legend').hidden).toBe(true);
      tap('circle');
      const legend = document.querySelector('.pad-legend');
      expect(legend.hidden).toBe(false);
      expect(legend.dataset.mapping).toBe('viewport');
      expect(legend.querySelector('[data-glyph="Cross"]')).not.toBeNull();

      hold('l2');
      expect(legend.dataset.mapping).toBe('viewport+l2');
      letGo('l2');
      expect(legend.dataset.mapping).toBe('viewport');
    });

    it('the legend steps aside when a real key is pressed', () => {
      tap('circle');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(document.querySelector('.pad-legend').hidden).toBe(true);
    });
  });

  describe('viewport click vs drag', () => {
    const container = () => document.getElementById('editor-viewport');
    const down = (x, y) =>
      container().dispatchEvent(
        new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true })
      );
    const click = (x, y) =>
      container().dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));

    it('ignores a click that ended a drag (camera rotate/pan)', () => {
      const gridSpy = app.editorScene.gridFromEvent;
      gridSpy.mockClear();
      down(100, 100);
      click(140, 100); // moved 40px → a drag, not a selection
      expect(gridSpy).not.toHaveBeenCalled();
    });

    it('selects on a click that did not move (a full click)', () => {
      const gridSpy = app.editorScene.gridFromEvent;
      gridSpy.mockClear();
      down(100, 100);
      click(101, 100); // within threshold → a real click
      expect(gridSpy).toHaveBeenCalled();
    });

    it('treats a programmatic .click() (no mousedown) as a selection', () => {
      const gridSpy = app.editorScene.gridFromEvent;
      gridSpy.mockClear();
      container().dispatchEvent(
        new MouseEvent('click', { clientX: 100, clientY: 100, bubbles: true })
      );
      expect(gridSpy).toHaveBeenCalled();
    });
  });
});

describe('EditorApp git status follows the autosave', () => {
  let app;
  let changedFiles; // puzzle files the fake dev server has written (uncommitted)
  let statusReads;

  /** A dev server that dirties a puzzle file on each POST and reports it in git status. */
  function fakeDevServer(url, opts = {}) {
    const reply = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    if (url === '/api/git/status') {
      statusReads += 1;
      return reply({
        ok: true,
        branch: 'main',
        changedCount: changedFiles.size,
        files: [...changedFiles],
        ahead: 0,
        behind: 0,
        hasUpstream: false,
      });
    }
    if (url.startsWith('/api/puzzles/') && opts.method === 'POST') {
      changedFiles.add(url);
      return reply({ ok: true });
    }
    return reply({ puzzles: [] }); // manifest: nothing saved yet
  }

  const commitButton = () =>
    [...document.querySelectorAll('#git-panel button')].find((b) => b.textContent === 'Commit');

  beforeEach(async () => {
    setupEditorDOM();
    changedFiles = new Set();
    statusReads = 0;
    global.fetch = jest.fn(fakeDevServer);
    jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    app = new EditorApp();
    app.init();
    await jest.advanceTimersByTimeAsync(0); // the panel's first read: a clean tree
  });

  afterEach(() => {
    app.dispose();
    app = null;
    document.body.innerHTML = '';
    delete global.fetch;
    jest.restoreAllMocks();
  });

  it('enables Commit once the first edit on a clean tree has been saved', async () => {
    expect(commitButton().disabled).toBe(true);

    app.undoManager.setMetadata({ id: 'first-edit', name: 'First Edit' });
    await jest.advanceTimersByTimeAsync(600); // past the autosave debounce

    expect(changedFiles.size).toBe(1);
    expect(commitButton().disabled).toBe(false);
  });

  it('reads git status once per save, not once per edit', async () => {
    const readsBefore = statusReads;

    app.undoManager.setMetadata({ id: 'burst', name: 'Burst' });
    for (let tempo = 100; tempo < 110; tempo += 1) app.undoManager.setMetadata({ tempo });
    await jest.advanceTimersByTimeAsync(600);

    expect(statusReads - readsBefore).toBe(1);
  });
});

describe('EditorApp writes each edit to its own puzzle', () => {
  let app;
  let head; // the puzzle files as committed: what a revert puts back
  let disk; // puzzle id -> its file, as the fake dev server holds it
  let stash; // the files a revert stashed: what ⌘Z (unrevert) puts back
  let log; // file writes and git actions, in the order the server got them
  let releaseDelete = null; // set while a delete's reply is held back
  let releaseGit = null; // set while a git action's reply is held back

  const puzzle = (id) => ({
    id,
    name: id.toUpperCase(),
    difficulty: 1,
    gridSize: 15,
    tempo: 120,
    playerStart: { x: 0, y: 0, z: 0 },
    entities: [],
  });
  const copy = (json) => JSON.parse(JSON.stringify(json));
  const reply = (body) => ({ ok: true, json: () => Promise.resolve(body) });

  /**
   * The dev server: static puzzle files, the puzzle writer, git. With
   * `holdDeletes`, a delete takes effect at once but its reply waits for
   * `releaseDelete()` (the editor is still awaiting it); `holdGit` does the
   * same for a git action and `releaseGit()`.
   */
  function fakeDevServer({ holdDeletes = false, holdGit = false } = {}) {
    return async (url, { method = 'GET', body } = {}) => {
      if (url === '/puzzles/manifest.json') {
        const puzzles = Object.values(disk).map(({ id, name, difficulty }) => ({
          id,
          name,
          difficulty,
        }));
        return reply({ puzzles });
      }
      const file = url.match(/^\/puzzles\/(.+)\.json$/);
      if (file) {
        return disk[file[1]] ? reply(copy(disk[file[1]])) : { ok: false, statusText: 'Not Found' };
      }
      const [, id] = url.match(/^\/api\/puzzles\/(.+)$/) || [];
      if (id && method === 'POST') {
        log.push(`write ${id}`);
        disk[id] = JSON.parse(body);
        return reply({ ok: true });
      }
      if (id && method === 'DELETE') {
        log.push(`delete ${id}`);
        delete disk[id];
        if (!holdDeletes) return reply({ ok: true });
        return new Promise((resolve) => {
          releaseDelete = () => resolve(reply({ ok: true }));
        });
      }
      if (url === '/api/git/status') {
        return reply({ ok: true, branch: 'main', changedCount: 1, files: [], ahead: 0 });
      }
      const action = url.replace('/api/git/', '');
      log.push(`git ${action}`);
      let nothing = false;
      if (action === 'revert') {
        nothing = JSON.stringify(disk) === JSON.stringify(head);
        if (!nothing) [stash, disk] = [disk, copy(head)];
      }
      if (action === 'unrevert') disk = stash;
      if (!holdGit) return reply({ ok: true, nothing });
      return new Promise((resolve) => {
        releaseGit = () => resolve(reply({ ok: true, nothing }));
      });
    };
  }

  /** Choose an entry in the puzzle dropdown, as the user does. */
  function choose(value) {
    const select = document.querySelector('.puzzle-select');
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }

  const gitButton = (label) =>
    [...document.querySelectorAll('#git-panel button')].find((b) => b.textContent === label);
  const gitStatusText = () => document.querySelector('#git-panel .git-status').textContent;
  const pressCmdZ = () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true }));

  async function openEditorOn(id, server = fakeDevServer()) {
    global.fetch = jest.fn(server);
    app = new EditorApp();
    app.init();
    await jest.advanceTimersByTimeAsync(0); // the picker's list and the git panel's status
    await app.puzzlePicker.open(id);
  }

  beforeEach(() => {
    setupEditorDOM();
    head = { a: puzzle('a'), b: puzzle('b') };
    disk = copy(head);
    stash = null;
    log = [];
    releaseDelete = null;
    releaseGit = null;
    jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  });

  afterEach(() => {
    app.dispose();
    app = null;
    document.body.innerHTML = '';
    delete global.fetch;
    jest.restoreAllMocks();
  });

  describe('Play: the level in the game, in this tab', () => {
    const { origin } = window.location;
    let frames; // animation-frame callbacks waiting to run
    let clock; // the frames' timestamps (ms)
    let gamePosts; // what the editor told the game

    /** Let `ms` of animation frames run, 16 ms apart. */
    function runFrames(ms) {
      const end = clock + ms;
      while (clock < end) {
        clock += 16;
        const now = clock;
        frames.splice(0).forEach((callback) => callback(now));
      }
    }

    const game = () => app.preview.frameElement;
    /** The game in the iframe says something to the editor. */
    const fromGame = (data, source = game().contentWindow) =>
      window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
    const told = (type) => gamePosts.filter((m) => m.type === type);
    const toast = () => document.querySelector('.viewport-toast').textContent;
    const cameraAt = () => ({
      position: app.camera.position.clone(),
      quaternion: { ...app.camera.quaternion },
      fov: app.camera.fov,
    });
    // The game's eye at the editor's spawn (2, 0, 3), in game coordinates
    const SPAWN_POSE = { position: [6, 1.8, 9], quaternion: [0, 0, 0, 1], fov: 75 };

    /** Open level `a` with its spawn at (2, 0, 3), the camera somewhere of its own, and Play. */
    async function startPlay(setUp = async () => {}) {
      await openEditorOn('a');
      // The viewport beside a 280 px sidebar (jsdom lays nothing out)
      document.getElementById('editor-viewport').getBoundingClientRect = () => ({
        left: 280,
        top: 0,
        width: window.innerWidth - 280,
        height: window.innerHeight,
      });
      await setUp();
      app.undoManager.setPlayerSpawn(2, 0, 3);
      app.camera.position.set(52.5, 40, 52.5);
      app.camera.quaternion.set(-0.34, 0.36, 0.14, 0.86);
      app.controls.target.set(22.5, 0, 22.5);
      const home = cameraAt();
      const started = await app.play();
      gamePosts = [];
      jest.spyOn(game().contentWindow, 'postMessage').mockImplementation((m) => gamePosts.push(m));
      return { started, home };
    }

    /** The game loads, says it is waiting, the glide lands, and the game is ready. */
    async function untilPlaying() {
      fromGame({ type: 'resound:preview-waiting' });
      runFrames(1100);
      fromGame({ type: 'resound:preview-ready', pose: SPAWN_POSE });
      runFrames(32);
      jest.advanceTimersByTime(200); // the cross-fade
    }

    /** Back to Editor, and the fade and the glide home run out. */
    function backToEditor(report) {
      fromGame({ type: 'resound:back-to-editor', puzzleId: 'a', ...report });
      runFrames(32);
      jest.advanceTimersByTime(200);
      runFrames(1200);
    }

    beforeEach(() => {
      frames = [];
      clock = 0;
      window.requestAnimationFrame.mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
    });

    afterEach(() => {
      window.history.replaceState(null, '', '/');
    });

    it('saves the last edit, then loads the game on the level, unseen, in a frame over the editor', async () => {
      const { started } = await startPlay();

      expect(started).toBe(true);
      expect(disk.a.playerStart).toEqual({ x: 2, y: 0, z: 3 });
      expect(log).toEqual(['write a']);
      expect(game().getAttribute('src')).toBe('/?puzzle=a&from=editor');
      expect(game().allow).toContain('autoplay');
      expect(game().classList.contains('shown')).toBe(false);
      expect(app.preview.state).toBe('entering');
    });

    it('Cmd/Ctrl+Enter plays too', async () => {
      await openEditorOn('a');
      app.undoManager.setPlayerSpawn(2, 0, 3);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }));
      await jest.advanceTimersByTimeAsync(600);

      expect(game().getAttribute('src')).toBe('/?puzzle=a&from=editor');
    });

    it("won't play a puzzle with no name yet, and says why", async () => {
      await openEditorOn('a');
      app._newPuzzle();
      app.undoManager.setPlayerSpawn(2, 0, 3);

      expect(await app.play()).toBe(false);
      expect(document.querySelector('iframe')).toBeNull();
      expect(toast()).toMatch(/Name the puzzle/);
    });

    it("won't play a level with no player spawn, and says why", async () => {
      await openEditorOn('a');
      app.undoManager.clearPlayerSpawn();

      expect(await app.play()).toBe(false);
      expect(document.querySelector('iframe')).toBeNull();
      expect(toast()).toMatch(/player spawn/);
    });

    it("the camera glides down to the player's eye at the spawn, with the game's heading and lens", async () => {
      const { home } = await startPlay();
      fromGame({ type: 'resound:preview-waiting' });

      runFrames(500);
      const halfway = cameraAt();
      expect(halfway.position.y).toBeLessThan(home.position.y);
      expect(halfway.position.y).toBeGreaterThan(1.8);
      expect(document.getElementById('editor-sidebar').style.transform).toMatch(/translateX\(-/);

      runFrames(600);
      // The editor's cells sit half a cell over the game's: (2, 3) is at 7.5, 10.5
      expect(cameraAt()).toEqual({
        position: expect.objectContaining({ x: 7.5, y: 1.8, z: 10.5 }),
        quaternion: { x: 0, y: 0, z: 0, w: 1 },
        fov: 75,
      });
      expect(app.camera.near).toBe(0.1);
      expect(app.camera.far).toBe(500);
      // With the sidebar gone, the view is the whole window, as the game's
      expect(app.camera.aspect).toBeCloseTo(window.innerWidth / window.innerHeight);
      expect(app.preview.landed).toBe(true);
    });

    it('a frame that comes late (the game loading on the same thread) pauses the glide, never jumps it', async () => {
      await startPlay();
      fromGame({ type: 'resound:preview-waiting' });
      runFrames(208);
      const before = app.camera.position.y;
      clock += 300; // one frame 300 ms late
      frames.splice(0).forEach((callback) => callback(clock));
      const step = before - app.camera.position.y;
      runFrames(16);
      const nextStep = before - step - app.camera.position.y;

      expect(step).toBeLessThan(nextStep * 2.5); // two frames' worth at most, not twenty
      runFrames(500);
      expect(app.preview.landed).toBe(false); // the glide still has its full second
      runFrames(400);
      expect(app.preview.landed).toBe(true);
    });

    it("the glide waits for the game's code to load, so the load never pauses it", async () => {
      const { home } = await startPlay();
      runFrames(400);
      // Not moved, no sidebar slide, no ring for a usual load
      expect(cameraAt().position).toEqual(home.position);
      expect(document.getElementById('editor-sidebar').style.transform).toBe('');
      expect(document.querySelector('.play-loading').hidden).toBe(true);

      fromGame({ type: 'resound:preview-waiting' });
      runFrames(500);
      expect(cameraAt().position.y).toBeLessThan(home.position.y);
      runFrames(600);
      expect(app.preview.landed).toBe(true);
    });

    it('a game whose code is slow to load: a ring after a moment, and the glide goes anyway after 2 s', async () => {
      const { home } = await startPlay();
      runFrames(700);
      expect(document.querySelector('.play-loading').hidden).toBe(false);
      expect(cameraAt().position).toEqual(home.position);

      runFrames(1400);
      expect(cameraAt().position.y).toBeLessThan(home.position.y);
    });

    it('the game builds its world only once the camera has landed (holding still)', async () => {
      await startPlay();
      fromGame({ type: 'resound:preview-waiting' });
      runFrames(500);
      expect(told('resound:preview-landed')).toEqual([]);

      runFrames(600);
      expect(told('resound:preview-landed')).toHaveLength(1);
      expect(told('resound:preview-landed')[0].sky).toEqual({
        env: expect.any(Number),
        deck: expect.any(Number),
      });
    });

    it('a game ready before the camera lands waits for it, then fades in and takes over', async () => {
      await startPlay();
      fromGame({ type: 'resound:preview-waiting' });
      runFrames(400);
      fromGame({ type: 'resound:preview-ready', pose: SPAWN_POSE });
      runFrames(200);
      expect(game().classList.contains('shown')).toBe(false); // still gliding

      runFrames(500);
      expect(game().classList.contains('shown')).toBe(true); // the cross-fade
      expect(app.preview.state).toBe('entering');

      jest.advanceTimersByTime(150);
      expect(app.preview.state).toBe('playing');
      expect(told('resound:preview-go')).toHaveLength(1);
      expect(game().classList.contains('playing')).toBe(true); // it takes the pointer
    });

    it('a game slower than the glide: the camera holds at the eye with a loading ring until it is ready', async () => {
      await startPlay();
      fromGame({ type: 'resound:preview-waiting' });
      runFrames(1500);

      expect(app.preview.landed).toBe(true);
      expect(document.querySelector('.play-loading').hidden).toBe(false);
      expect(game().classList.contains('shown')).toBe(false);

      fromGame({ type: 'resound:preview-ready', pose: SPAWN_POSE });
      runFrames(32);
      expect(document.querySelector('.play-loading').hidden).toBe(true);
      expect(game().classList.contains('shown')).toBe(true);
      jest.advanceTimersByTime(150);
      expect(app.preview.state).toBe('playing');
    });

    it("a game whose first frame isn't quite where the camera landed: it settles onto the game's eye first", async () => {
      await startPlay();
      fromGame({ type: 'resound:preview-waiting' });
      runFrames(1100);
      fromGame({
        type: 'resound:preview-ready',
        pose: { position: [6, 2.4, 9], quaternion: [0, 0, 0, 1], fov: 75 },
      });
      runFrames(32);
      expect(game().classList.contains('shown')).toBe(false);

      runFrames(400);
      expect(app.camera.position.y).toBe(2.4);
      expect(game().classList.contains('shown')).toBe(true);
    });

    it("the editor's keys and controller stand aside while the game plays", async () => {
      const pad = {
        id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })),
      };
      Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
      try {
        await startPlay();
        await untilPlaying();
        const entities = app.undoManager.getEntities().length;
        app.undoManager.addEntity('wall', 7, 0, 7); // under the cursor: Delete would take it
        app.entityPlacer.placeEntity.mockClear();

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        pad.buttons[15].pressed = true; // d-pad right: the cursor would step
        runFrames(100);

        expect(app.entityPlacer.placeEntity).not.toHaveBeenCalled();
        expect(app.undoManager.getEntities()).toHaveLength(entities + 1);
        expect(app.editorScene.moveCursor).not.toHaveBeenCalled();
        expect(app.preview.state).toBe('playing');
      } finally {
        delete navigator.getGamepads;
      }
    });

    it('while playing the editor draws nothing (the game is the view)', async () => {
      await startPlay();
      await untilPlaying();
      app.renderer.render.mockClear();

      app._requestFrame();
      runFrames(100);

      expect(app.renderer.render).not.toHaveBeenCalled();
    });

    it("Back to Editor in the level: the editor fades in at the player's view, the game goes, and the camera glides home exactly", async () => {
      const { home } = await startPlay();
      await untilPlaying();
      const frame = game();

      fromGame({
        type: 'resound:back-to-editor',
        puzzleId: 'a',
        areaId: 'a',
        pose: { position: [12, 1.8, 18], quaternion: [0, 0.25, 0, 0.9682458365518543], fov: 75 },
      });
      runFrames(16);
      // The player's view, in the editor's coordinates, under the fading game
      expect(app.camera.position).toEqual(expect.objectContaining({ x: 13.5, y: 1.8, z: 19.5 }));
      expect(app.camera.quaternion.y).toBe(0.25);
      expect(frame.classList.contains('shown')).toBe(false);
      expect(frame.isConnected).toBe(true);

      jest.advanceTimersByTime(150);
      expect(frame.isConnected).toBe(false); // torn down: a fresh game every Play
      expect(document.querySelector('iframe')).toBeNull();

      runFrames(1200);
      expect(app.preview.state).toBe('idle');
      expect(cameraAt()).toEqual(home);
      expect(app.camera.view.enabled).toBe(false);
      expect(app.controls.target).toEqual(expect.objectContaining({ x: 22.5, y: 0, z: 22.5 }));
      expect(document.getElementById('editor-sidebar').style.transform).toBe('');
      expect(document.querySelector('.play-shield')).toBeNull();
    });

    it('Back from another level the player walked into: the glide home starts from the spawn', async () => {
      await startPlay();
      await untilPlaying();

      fromGame({
        type: 'resound:back-to-editor',
        puzzleId: 'a',
        areaId: 'b',
        pose: { position: [30, 4.8, 3], quaternion: [0, 0.7, 0, 0.71], fov: 75 },
      });
      runFrames(16);

      expect(app.camera.position).toEqual(expect.objectContaining({ x: 7.5, y: 1.8, z: 10.5 }));
      const { x, y, z, w } = app.camera.quaternion;
      [x, y, z, w - 1].forEach((component) => expect(component).toBeCloseTo(0));
    });

    it('back home, the editor is as it was: selection, look, keys and controller', async () => {
      let id;
      const pad = {
        id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })),
      };
      Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
      try {
        await startPlay(async () => {
          id = app.undoManager.addEntity('creature', 5, 0, 5, { song: [] });
          app.selectionManager.select(id);
          app.setLook('schematic');
          await jest.advanceTimersByTimeAsync(600);
        });
        expect(app.look).toBe('game'); // the game's look for the way in
        await untilPlaying();

        pad.buttons[15].pressed = true; // held through the return (d-pad right)
        backToEditor({ areaId: 'a', pose: SPAWN_POSE });

        expect(app.preview.state).toBe('idle');
        expect(app.selectionManager.selectedId).toBe(id);
        expect(app.look).toBe('schematic');
        runFrames(100);
        expect(app.editorScene.moveCursor).not.toHaveBeenCalled(); // held: no press
        pad.buttons[15].pressed = false;
        runFrames(32);
        pad.buttons[15].pressed = true;
        runFrames(32);
        expect(app.editorScene.moveCursor).toHaveBeenCalledWith(1, 0); // pressed again: a press

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
        expect(app.entityPlacer.placeEntity).toHaveBeenCalledWith('wall', 7, 7, 0);
      } finally {
        delete navigator.getGamepads;
      }
    });

    it('Esc while gliding in calls it off: no game, the camera goes home', async () => {
      const { home } = await startPlay();
      runFrames(300);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(document.querySelector('iframe')).toBeNull();
      runFrames(1200);

      expect(app.preview.state).toBe('idle');
      expect(cameraAt()).toEqual(home);
    });

    it("a level the game can't play: it says why and the camera goes home", async () => {
      const { home } = await startPlay();
      fromGame({ type: 'resound:preview-failed', message: '"a" isn\'t in the manifest' });
      runFrames(1200);

      expect(toast()).toMatch(/isn't in the manifest/);
      expect(app.preview.state).toBe('idle');
      expect(cameraAt()).toEqual(home);
    });

    it('hears only its own game: a message from any other window changes nothing', async () => {
      await startPlay();
      runFrames(1100);

      fromGame({ type: 'resound:preview-ready', pose: SPAWN_POSE }, window);
      runFrames(100);

      expect(app.preview.gameReady).toBe(false);
      expect(game().classList.contains('shown')).toBe(false);
    });

    it('a second Play while one is under way does nothing', async () => {
      await startPlay();
      expect(await app.play()).toBe(false);
      expect(document.querySelectorAll('iframe')).toHaveLength(1);
    });
  });

  it('writes an edit made just before opening another puzzle to its own file', async () => {
    await openEditorOn('a');

    app.undoManager.setMetadata({ tempo: 99 });
    choose('b'); // inside the autosave's half second
    await jest.advanceTimersByTimeAsync(1000);

    expect(app.undoManager.getMetadata().id).toBe('b');
    expect(disk.a.tempo).toBe(99);
    expect(log).toEqual(['write a']); // the opened puzzle's file is left as it was
  });

  it('reads the last edit back when the open puzzle is opened again (world map)', async () => {
    await openEditorOn('a');

    app.undoManager.setMetadata({ tempo: 99 });
    await app.puzzlePicker.open('a'); // what clicking its own node on the world map does
    await jest.advanceTimersByTimeAsync(1000);

    expect(app.undoManager.getMetadata().tempo).toBe(99);
    expect(disk.a.tempo).toBe(99);
  });

  it('writes an edit made just before "+ New puzzle"', async () => {
    await openEditorOn('a');

    app.undoManager.setMetadata({ tempo: 99 });
    choose('__new__');
    await jest.advanceTimersByTimeAsync(1000);

    expect(disk.a.tempo).toBe(99);
    expect(app.undoManager.getMetadata().id).toBe('');
  });

  it('leaves a new puzzle new when the last puzzle’s save lands after it opened', async () => {
    await openEditorOn('a');
    app.undoManager.setMetadata({ tempo: 99 });
    choose('__new__'); // a's last save is still on its way
    await jest.advanceTimersByTimeAsync(1000);

    // The picker and the status line still speak for the new puzzle...
    expect(document.querySelector('.puzzle-select').selectedOptions[0].textContent).toBe(
      'Untitled (unsaved)'
    );
    expect(document.querySelector('#toolbar-panel .save-status').textContent).toBe(
      'Add a name to save'
    );
    // ...and its id still follows its name (a's save did not lock it).
    const nameInput = document.querySelector('#metadata-panel .prop-input');
    nameInput.value = 'Fresh Start';
    nameInput.dispatchEvent(new Event('change'));
    await jest.advanceTimersByTimeAsync(1000);
    expect(disk['fresh-start']).toMatchObject({ name: 'Fresh Start' });
  });

  it.each([['Commit'], ['Pull'], ['Revert']])(
    '%s waits for the last edit to be written, and nothing is written after it',
    async (label) => {
      await openEditorOn('a');
      document.querySelector('.git-message').value = 'Slower';

      app.undoManager.setMetadata({ tempo: 99 });
      gitButton(label).click();
      await jest.advanceTimersByTimeAsync(1000);

      expect(log).toEqual(['write a', `git ${label.toLowerCase()}`]);
    }
  );

  it.each([
    ['fires while git runs', 1000],
    ['is still pending when git is done', 100],
  ])('Revert reverts an edit made while it runs too (its autosave %s)', async (_, msAfterEdit) => {
    await openEditorOn('a', fakeDevServer({ holdGit: true }));
    app.undoManager.setMetadata({ tempo: 99 });
    gitButton('Revert').click();
    await jest.advanceTimersByTimeAsync(0);
    expect(log).toEqual(['write a', 'git revert']); // the stash is taken; its reply is out

    app.undoManager.setMetadata({ tempo: 98 });
    await jest.advanceTimersByTimeAsync(msAfterEdit);
    releaseGit();
    await jest.advanceTimersByTimeAsync(1000);

    expect(log).toEqual(['write a', 'git revert']); // nothing re-dirties the reverted file
    expect(disk.a).toEqual(head.a);
    expect(app.undoManager.getMetadata().tempo).toBe(120);
    expect(gitStatusText()).toBe('Reverted — ⌘Z to restore');
  });

  it('saves an edit made while a Revert that found nothing to revert ran', async () => {
    await openEditorOn('a', fakeDevServer({ holdGit: true }));
    gitButton('Revert').click();
    await jest.advanceTimersByTimeAsync(0);

    app.undoManager.setMetadata({ tempo: 98 });
    releaseGit();
    await jest.advanceTimersByTimeAsync(1000);

    expect(log).toEqual(['git revert', 'write a']);
    expect(disk.a.tempo).toBe(98);
  });

  it('⌘Z after Revert restores the edits; an edit made while it runs is not written over them', async () => {
    await openEditorOn('a', fakeDevServer({ holdGit: true }));
    app.undoManager.setMetadata({ tempo: 99 });
    gitButton('Revert').click();
    await jest.advanceTimersByTimeAsync(0);
    releaseGit();
    await jest.advanceTimersByTimeAsync(1000);

    pressCmdZ();
    await jest.advanceTimersByTimeAsync(0);
    expect(log).toEqual(['write a', 'git revert', 'git unrevert']); // its reply is out
    app.undoManager.setMetadata({ tempo: 98 });
    await jest.advanceTimersByTimeAsync(1000);
    releaseGit();
    await jest.advanceTimersByTimeAsync(1000);

    expect(log).toEqual(['write a', 'git revert', 'git unrevert']);
    expect(disk.a.tempo).toBe(99);
    expect(app.undoManager.getMetadata().tempo).toBe(99);
    expect(gitStatusText()).toBe('Restored reverted edits');
  });

  it.each([
    ['Commit', 'Committed'],
    ['Revert', 'Reverted — ⌘Z to restore'],
  ])('%s’s result stays up through a later write git sees no change from', async (label, text) => {
    await openEditorOn('a');
    document.querySelector('.git-message').value = 'Slower';
    app.undoManager.setMetadata({ tempo: 99 });
    gitButton(label).click();
    await jest.advanceTimersByTimeAsync(1000);
    expect(gitStatusText()).toBe(text);

    await savePuzzleJsonToRepo(copy(disk.b)); // e.g. a link partner's file, rewritten as it was
    await jest.advanceTimersByTimeAsync(1000);

    expect(gitStatusText()).toBe(text);
  });

  it('takes down "⌘Z to restore" once an edit retires the restore', async () => {
    await openEditorOn('a');
    app.undoManager.setMetadata({ tempo: 99 });
    gitButton('Revert').click();
    await jest.advanceTimersByTimeAsync(1000);

    app.undoManager.setMetadata({ tempo: 98 });
    await jest.advanceTimersByTimeAsync(1000); // its save lands; git reads as it did

    expect(gitStatusText()).toBe('main · 1 puzzle file changed');
    pressCmdZ(); // a model undo now, not a restore
    await jest.advanceTimersByTimeAsync(1000);
    expect(log).not.toContain('git unrevert');
  });

  it('keeps a just-edited puzzle deleted: nothing writes it back', async () => {
    await openEditorOn('a', fakeDevServer({ holdDeletes: true }));
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    app.undoManager.setMetadata({ tempo: 99 });
    document.querySelector('.puzzle-delete-btn').click();
    await jest.advanceTimersByTimeAsync(1000); // past the autosave's half second
    app.undoManager.setMetadata({ tempo: 98 }); // an edit while the delete is out
    releaseDelete();
    await jest.advanceTimersByTimeAsync(1000);

    expect(disk.a).toBeUndefined();
    expect(log[log.length - 1]).toBe('delete a');
  });
});

describe('EditorApp per-input work', () => {
  let app;
  let frames; // animation-frame callbacks waiting to run

  /** Run animation frames until none are pending (a frame may ask for another). */
  function flushFrames() {
    for (let i = 0; i < 10 && frames.length > 0; i += 1) {
      frames.splice(0).forEach((callback) => callback(0));
    }
  }

  const press = (key, init = {}) =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    );

  beforeEach(() => {
    setupEditorDOM();
    frames = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    app = new EditorApp();
    app.init();
    flushFrames();
    app.renderer.render.mockClear();
  });

  afterEach(() => {
    app.dispose();
    app = null;
    document.body.innerHTML = '';
    delete global.fetch;
    jest.restoreAllMocks();
  });

  it('builds the property panel once per keyboard move', () => {
    // An unlinked gate's panel lists link targets from the manifest
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ puzzles: [] }) })
    );
    app.undoManager.addEntity('gate', 7, 0, 7, { song: [], gateId: 'gate-1' }); // under the cursor

    press('ArrowRight', { shiftKey: true });

    const manifestReads = fetch.mock.calls.filter(([url]) => url.includes('manifest.json'));
    expect(manifestReads).toHaveLength(1);
    expect(document.querySelector('#property-panel').textContent).toContain('Gate Properties');
  });

  it("doesn't redraw the viewport for keys typed into the song editor", () => {
    const id = app.undoManager.addEntity('creature', 5, 0, 3, {
      song: [{ pitch: 'C4', length: '1/4' }],
      interval: 8,
      audibleRange: 15,
    });
    app.songEditorModal.open(id);
    flushFrames();
    app.renderer.render.mockClear();
    const staff = document.querySelector('.notation-staff');
    const type = (key) =>
      staff.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

    ['ArrowLeft', 'ArrowRight', 'Shift'].forEach(type);
    flushFrames();
    expect(app.renderer.render).not.toHaveBeenCalled();

    type('5'); // an edit: the model changed, so the viewport redraws once
    flushFrames();
    expect(app.renderer.render).toHaveBeenCalledTimes(1);
  });

  it('still redraws the viewport for grid keys', () => {
    press('ArrowRight'); // moves the cursor highlight
    flushFrames();
    expect(app.renderer.render).toHaveBeenCalledTimes(1);
  });

  it('keeps the HUD text node through frames that change nothing, and updates it when they do', () => {
    const hud = document.querySelector('.viewport-hud');
    const textNode = hud.firstChild;

    document.dispatchEvent(new Event('pointerdown')); // a frame with nothing new to say
    flushFrames();
    expect(app.renderer.render).toHaveBeenCalledTimes(1);
    expect(hud.firstChild).toBe(textNode);

    press('ArrowUp', { altKey: true }); // onto the empty E1
    flushFrames();
    expect(hud.textContent).toContain('E1 · no floor');
    press('Enter'); // held: building floor there
    flushFrames();
    expect(hud.textContent).toContain('Building floor E1');
  });
});
