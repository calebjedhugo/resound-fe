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
/* eslint-enable import/first */

function setupEditorDOM() {
  document.body.innerHTML = `
    <div id="editor-root">
      <div id="editor-sidebar"><h2>Editor</h2></div>
      <div id="editor-viewport" style="width:800px;height:600px;"></div>
      <div id="toolbar-panel"></div>
      <div id="puzzle-panel"></div>
      <div id="world-panel"></div>
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
      const cases = { p: 'player', g: 'gate', w: 'wall', r: 'ramp', l: 'cleanser' };
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
