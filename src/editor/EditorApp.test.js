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
      updateMatrixWorld: jest.fn(),
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
    target: { set: jest.fn() },
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
    setFloorDraft: jest.fn(),
    clearFloorDraft: jest.fn(),
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
import { loadSession } from 'editor/io/sessionPersistence';
import { deserializePuzzle } from 'editor/model/serialization';
import { createLink } from 'editor/io/portalLinks';
import { savePuzzleJsonToRepo } from 'editor/io/repoPersistence';
/* eslint-enable import/first */

function setupEditorDOM() {
  document.body.innerHTML = `
    <div id="editor-root">
      <div id="editor-sidebar"><h2>Editor</h2></div>
      <div id="editor-viewport" style="width:800px;height:600px;"></div>
      <div id="toolbar-panel"></div>
      <div id="puzzle-panel"></div>
      <div id="world-panel"></div>
      <div id="git-panel"></div>
      <div id="elevation-panel"></div>
      <div id="floor-panel"></div>
      <div id="entity-toolbar"></div>
      <div id="property-panel"></div>
      <div id="metadata-panel"></div>
      <div id="validation-panel"></div>
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

  describe('layer navigation (Option+Arrow)', () => {
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

    // Give the puzzle a second storey (elevation 1) so there's a layer to reach.
    function addUpperStorey() {
      app.undoManager.addFloor(1, 0, 0, 20, 20);
      app.elevationSelector.refresh();
    }

    it('Option+Up/Down moves between existing storeys', () => {
      addUpperStorey();
      expect(app.editorScene.activeElevation).toBe(0);
      optionPress('ArrowUp');
      expect(app.editorScene.activeElevation).toBe(1);
      optionPress('ArrowDown');
      expect(app.editorScene.activeElevation).toBe(0);
    });

    it('Option+Up from a single-storey puzzle arms draft-floor mode on the empty layer', () => {
      optionPress('ArrowUp');
      expect(app.editorScene.activeElevation).toBe(1);
      expect(app._floorDraft).not.toBeNull();
    });

    it('Shift+Option+Up moves the entity up a layer and follows it', () => {
      addUpperStorey();
      const id = app.undoManager.addEntity('wall', 7, 0, 7, {}); // cursor (7,7), elev 0
      optionPress('ArrowUp', true);
      expect(app.entityPlacer.setEntityPosition).toHaveBeenCalledWith(id, 7, 7, 1);
      expect(app.editorScene.activeElevation).toBe(1); // active layer follows
    });

    it('refuses a layer move onto an occupied cell', () => {
      addUpperStorey();
      app.undoManager.addEntity('wall', 7, 0, 7, {}); // the mover
      app.undoManager.addEntity('wall', 7, 1, 7, {}); // blocks the target layer
      optionPress('ArrowUp', true);
      expect(app.entityPlacer.setEntityPosition).not.toHaveBeenCalled();
    });
  });

  describe('draft-floor creation (Option+Arrow into an empty layer)', () => {
    const press = (key, opts = {}) =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts })
      );
    const optionUp = () => press('ArrowUp', { altKey: true });
    const optionDown = () => press('ArrowDown', { altKey: true });

    it('arms draft-floor mode, anchored at the cursor, without creating anything', () => {
      optionUp(); // E0 → empty E1
      expect(app.editorScene.activeElevation).toBe(1);
      expect(app._floorDraft).toEqual({ anchor: { x: 7, z: 7 }, elevation: 1 });
      expect(app.editorScene.setFloorDraft).toHaveBeenCalled();
      expect(app.undoManager.getFloors()).toHaveLength(0);
    });

    it('creates a floor from the anchor→cursor rectangle on Enter', () => {
      optionUp();
      press('Enter'); // cursor (7,7) == anchor → 1×1 floor at E1
      expect(app.undoManager.getFloors()).toContainEqual({
        elevation: 1,
        x1: 7,
        z1: 7,
        x2: 7,
        z2: 7,
      });
      expect(app._floorDraft).toBeNull();
    });

    it('climbs through empty layers, skipping them and retargeting the draft', () => {
      optionUp(); // empty E1
      optionUp(); // empty E2 — E1 skipped
      expect(app.editorScene.activeElevation).toBe(2);
      expect(app._floorDraft.elevation).toBe(2);
      expect(app.undoManager.getFloors()).toHaveLength(0);
    });

    it('cancels the draft on Escape without creating a floor', () => {
      optionUp();
      press('Escape');
      expect(app._floorDraft).toBeNull();
      expect(app.editorScene.clearFloorDraft).toHaveBeenCalled();
      expect(app.undoManager.getFloors()).toHaveLength(0);
    });

    it('navigates normally (no draft) onto a layer that already has a floor', () => {
      app.undoManager.addFloor(1, 0, 0, 5, 5);
      app.elevationSelector.refresh();
      optionUp(); // E0 → E1 (has a floor)
      expect(app.editorScene.activeElevation).toBe(1);
      expect(app._floorDraft).toBeNull();
    });

    it('drops out of draft mode when descending to the ground', () => {
      optionUp(); // empty E1, draft armed
      optionDown(); // back to E0
      expect(app.editorScene.activeElevation).toBe(0);
      expect(app._floorDraft).toBeNull();
    });
  });

  // The `f` key arms a floor draft at the current elevation — same size-with-
  // arrows / Enter-to-commit flow as climbing onto an empty layer, but reachable
  // even on a storey that already carries a floor elsewhere.
  describe('floor draft via the F key', () => {
    const press = (key, opts = {}) =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts })
      );

    it('does nothing on the ground (floors sit above E0)', () => {
      app.editorScene.activeElevation = 0;
      press('f');
      expect(app._floorDraft).toBeNull();
      expect(app.editorScene.setFloorDraft).not.toHaveBeenCalled();
    });

    it('arms a draft anchored at the cursor on an empty upper cell', () => {
      app.editorScene.activeElevation = 1;
      press('f');
      expect(app._floorDraft).toEqual({ anchor: { x: 7, z: 7 }, elevation: 1 });
      expect(app.editorScene.setFloorDraft).toHaveBeenCalled();
      expect(app.undoManager.getFloors()).toHaveLength(0);
    });

    it('refuses when the cursor cell already carries a floor', () => {
      app.undoManager.addFloor(1, 7, 7, 7, 7); // under the cursor (7,7)
      app.editorScene.activeElevation = 1;
      press('f');
      expect(app._floorDraft).toBeNull();
    });

    it('starts a SECOND region on a storey that already has a floor elsewhere', () => {
      app.undoManager.addFloor(1, 0, 0, 2, 2); // a floor NOT under the cursor
      app.editorScene.activeElevation = 1;
      press('f');
      expect(app._floorDraft).toEqual({ anchor: { x: 7, z: 7 }, elevation: 1 });
    });

    it('commits the drafted region on Enter (F → Enter creates a floor)', () => {
      app.editorScene.activeElevation = 1;
      press('f');
      press('Enter'); // cursor (7,7) == anchor → 1×1 floor at E1
      expect(app.undoManager.getFloors()).toContainEqual({
        elevation: 1,
        x1: 7,
        z1: 7,
        x2: 7,
        z2: 7,
      });
      expect(app._floorDraft).toBeNull();
    });

    it('capital F works too, and is ignored while typing in a field', () => {
      app.editorScene.activeElevation = 1;
      press('F');
      expect(app._floorDraft).not.toBeNull();

      app._exitFloorDraft();
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
      expect(app._floorDraft).toBeNull();
      input.remove();
    });
  });

  // Delete on an otherwise-empty cell removes the WHOLE floor region under the
  // cursor (floors are rectangles — no per-tile holes), guarded so an elevated
  // entity is never left floating.
  describe('Delete removes a floor region', () => {
    const press = (key) =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      );

    it('removes the region the cursor sits in when the cell is empty', () => {
      app.undoManager.addFloor(1, 5, 5, 9, 9); // covers the cursor (7,7)
      app.editorScene.activeElevation = 1;
      press('Delete');
      expect(app.undoManager.getFloors()).toHaveLength(0);
    });

    it('refuses while an entity rests anywhere on the region', () => {
      app.undoManager.addFloor(1, 5, 5, 9, 9);
      app.undoManager.addEntity('creature', 5, 1, 5, {}); // on the region, not the cursor cell
      app.editorScene.activeElevation = 1;
      const toast = jest.spyOn(app, '_showToast');
      press('Delete'); // cursor (7,7) holds no entity → falls through to floor delete
      expect(app.undoManager.getFloors()).toHaveLength(1);
      expect(toast).toHaveBeenCalled();
    });

    it('deletes the entity first when one is under the cursor, keeping the floor', async () => {
      app.undoManager.addFloor(1, 7, 7, 7, 7);
      const id = app.undoManager.addEntity('wall', 7, 1, 7, {}); // on the cursor cell
      app.editorScene.activeElevation = 1;
      press('Delete');
      await Promise.resolve();
      await Promise.resolve();
      expect(app.entityPlacer.removeEntityById).toHaveBeenCalledWith(id);
      expect(app.undoManager.getFloors()).toHaveLength(1); // floor untouched this press
    });

    it('is a no-op on the ground where there is no floor data', () => {
      app.editorScene.activeElevation = 0;
      expect(() => press('Delete')).not.toThrow();
      expect(app.undoManager.getFloors()).toHaveLength(0);
    });

    it('removes only the region at the active elevation when regions stack', () => {
      app.undoManager.addFloor(1, 5, 5, 9, 9); // E1 under the cursor
      app.undoManager.addFloor(2, 5, 5, 9, 9); // E2 stacked on top
      app.editorScene.activeElevation = 2;
      press('Delete');
      expect(app.undoManager.getFloors()).toEqual([{ elevation: 1, x1: 5, z1: 5, x2: 9, z2: 9 }]);
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

    it('says why when there is no song under the cursor', () => {
      press('a');
      expect(document.querySelector('.viewport-toast').textContent).toMatch(/creature or gate/);
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

    press('ArrowUp', { altKey: true }); // onto the empty E1: draft-floor mode
    flushFrames();
    expect(hud.textContent).toContain('Draft floor E1');
  });
});
