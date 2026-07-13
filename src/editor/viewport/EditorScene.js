import * as THREE from 'three';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import { snapToGrid, gridToWorld } from 'editor/viewport/gridUtils';

export default class EditorScene {
  constructor(scene, model) {
    this._scene = scene;
    this._model = model;
    this._gridSize = model.getMetadata().gridSize;
    this._hoverMesh = null;
    this._activeElevation = 0;
    this._raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    this._groundPlane = null;
    this._gridHelper = null;
    // A cell is ALWAYS selected (keyboard cursor). The mouse and the arrow keys
    // both drive this one cell; the highlight mesh renders here every frame.
    this._cursorCell = this._centerCell();
    this._mouseMoved = false;

    this._createGrid();
    this._createAxes();
    this._createHoverMesh();
    this._setupMouseTracking();
  }

  _centerCell() {
    const c = Math.floor(this._gridSize / 2);
    return { x: c, z: c };
  }

  get activeElevation() {
    return this._activeElevation;
  }
  set activeElevation(val) {
    this._activeElevation = val;
  }

  _createGrid() {
    const size = this._gridSize * WORLD_SCALE;

    // Grid helper
    this._gridHelper = new THREE.GridHelper(size, this._gridSize, 0x4f8bc7, 0x285c88);
    this._gridHelper.position.set(size / 2, 0, size / 2);
    this._scene.add(this._gridHelper);

    // Base floor plane (for raycasting)
    const planeGeo = new THREE.PlaneGeometry(size, size);
    const planeMat = new THREE.MeshBasicMaterial({ visible: false });
    this._groundPlane = new THREE.Mesh(planeGeo, planeMat);
    this._groundPlane.rotation.x = -Math.PI / 2;
    this._groundPlane.position.set(size / 2, 0, size / 2);
    this._scene.add(this._groundPlane);
  }

  _createAxes() {
    // Axis indicator (small colored lines at origin)
    const axisHelper = new THREE.AxesHelper(WORLD_SCALE * 2);
    this._scene.add(axisHelper);
  }

  /**
   * Re-read the model's gridSize and redraw the grid + raycast plane. The grid
   * is built once at construction from whatever model was current then; loading
   * a different puzzle or editing the Grid Size field swaps the model without
   * touching the scene, so callers must invoke this to keep the drawn grid in
   * sync (otherwise entities render at cells beyond the stale grid).
   */
  syncGridSize() {
    const next = this._model.getMetadata().gridSize;
    if (next === this._gridSize && this._gridHelper && this._groundPlane) return false;
    this._gridSize = next;
    // Keep the cursor inside the (possibly smaller) grid.
    this._cursorCell = {
      x: Math.min(this._cursorCell.x, next - 1),
      z: Math.min(this._cursorCell.z, next - 1),
    };

    if (this._gridHelper) {
      this._scene.remove(this._gridHelper);
      this._gridHelper.geometry.dispose();
      this._gridHelper.material.dispose();
      this._gridHelper = null;
    }
    if (this._groundPlane) {
      this._scene.remove(this._groundPlane);
      this._groundPlane.geometry.dispose();
      this._groundPlane.material.dispose();
      this._groundPlane = null;
    }

    this._createGrid();
    return true;
  }

  _createHoverMesh() {
    const geo = new THREE.PlaneGeometry(WORLD_SCALE * 0.95, WORLD_SCALE * 0.95);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x44ff88,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    this._hoverMesh = new THREE.Mesh(geo, mat);
    this._hoverMesh.rotation.x = -Math.PI / 2;
    // The cursor is always shown — a cell is always selected.
    this._hoverMesh.visible = true;
    this._scene.add(this._hoverMesh);
  }

  _setupMouseTracking() {
    const container = document.getElementById('editor-viewport');
    // Moving the mouse retargets the cursor (resolved in updateHover, which has
    // the camera). Arrow keys move the cursor directly; because a stationary
    // mouse sets no _mouseMoved flag, the per-frame update never fights them.
    container.addEventListener('mousemove', (e) => {
      const rect = container.getBoundingClientRect();
      this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this._mouseMoved = true;
    });
  }

  updateHover(camera) {
    if (this._mouseMoved) {
      this._raycaster.setFromCamera(this._mouse, camera);
      const hits = this._raycaster.intersectObject(this._groundPlane);
      if (hits.length > 0) {
        const grid = snapToGrid(hits[0].point.x, hits[0].point.z, this._gridSize);
        if (grid) this._cursorCell = grid;
      }
      this._mouseMoved = false;
    }
    this._positionCursorMesh();
  }

  _positionCursorMesh() {
    const world = gridToWorld(this._cursorCell.x, this._cursorCell.z);
    const elevY = this._activeElevation * ELEVATION_HEIGHT;
    this._hoverMesh.position.set(world.x, elevY + 0.05, world.z);
  }

  update() {
    // Called each frame — placeholder for future per-frame updates
  }

  /** The currently selected cell — always a valid { x, z } (never null). */
  getHoveredGrid() {
    return { ...this._cursorCell };
  }

  /** Move the cursor by a grid delta, clamped to the grid bounds. */
  moveCursor(dx, dz) {
    const max = this._gridSize - 1;
    this._cursorCell = {
      x: Math.max(0, Math.min(max, this._cursorCell.x + dx)),
      z: Math.max(0, Math.min(max, this._cursorCell.z + dz)),
    };
    this._positionCursorMesh();
  }

  /** Reset the cursor to the middle of the grid (e.g. on loading a puzzle). */
  recenterCursor() {
    this._cursorCell = this._centerCell();
    this._positionCursorMesh();
  }

  /**
   * Project a grid cell (at the active elevation) to pixel coordinates within
   * the viewport container — used to anchor the keyboard-opened context menu.
   */
  cellToContainerXY(cell, camera) {
    const world = gridToWorld(cell.x, cell.z);
    const y = this._activeElevation * ELEVATION_HEIGHT;
    const ndc = new THREE.Vector3(world.x, y, world.z).project(camera);
    const container = document.getElementById('editor-viewport');
    const rect = container.getBoundingClientRect();
    return {
      x: (ndc.x * 0.5 + 0.5) * rect.width,
      y: (-ndc.y * 0.5 + 0.5) * rect.height,
    };
  }

  /**
   * Resolve the grid cell under a specific mouse event, and move the cursor to
   * it. Clicks use this rather than trusting the last mousemove: synthetic
   * clicks (and click-after-scroll) can land on a cell the pointer never
   * "moved" over. Returns null for a click outside the grid (so callers can
   * refuse the action) without disturbing the persistent cursor.
   */
  gridFromEvent(event, camera) {
    const container = document.getElementById('editor-viewport');
    const rect = container.getBoundingClientRect();
    this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, camera);
    const hits = this._raycaster.intersectObject(this._groundPlane);
    if (hits.length === 0) return null;
    const grid = snapToGrid(hits[0].point.x, hits[0].point.z, this._gridSize);
    if (grid) {
      this._cursorCell = grid;
      this._positionCursorMesh();
    }
    return grid;
  }
}
