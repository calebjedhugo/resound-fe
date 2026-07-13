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

    this._createGrid();
    this._createAxes();
    this._createHoverMesh();
    this._setupMouseTracking();
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
    this._hoverMesh.visible = false;
    this._scene.add(this._hoverMesh);
  }

  _setupMouseTracking() {
    const container = document.getElementById('editor-viewport');
    container.addEventListener('mousemove', (e) => {
      const rect = container.getBoundingClientRect();
      this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    });
    container.addEventListener('mouseleave', () => {
      this._hoverMesh.visible = false;
    });
  }

  updateHover(camera) {
    this._raycaster.setFromCamera(this._mouse, camera);
    const hits = this._raycaster.intersectObject(this._groundPlane);
    if (hits.length > 0) {
      const { point } = hits[0];
      const grid = snapToGrid(point.x, point.z, this._gridSize);
      if (grid) {
        const world = gridToWorld(grid.x, grid.z);
        const elevY = this._activeElevation * ELEVATION_HEIGHT;
        this._hoverMesh.position.set(world.x, elevY + 0.05, world.z);
        this._hoverMesh.visible = true;
      } else {
        this._hoverMesh.visible = false;
      }
    } else {
      this._hoverMesh.visible = false;
    }
  }

  update() {
    // Called each frame — placeholder for future per-frame updates
  }

  getHoveredGrid() {
    // Returns the current hovered grid cell or null
    if (!this._hoverMesh.visible) return null;
    return snapToGrid(this._hoverMesh.position.x, this._hoverMesh.position.z, this._gridSize);
  }

  /**
   * Resolve the grid cell under a specific mouse event, refreshing the hover
   * state first. Clicks must use this rather than trusting the last mousemove:
   * synthetic/automated clicks (and click-after-scroll) can land on a cell the
   * pointer never "moved" over, which used to place entities at a stale cell.
   */
  gridFromEvent(event, camera) {
    const container = document.getElementById('editor-viewport');
    const rect = container.getBoundingClientRect();
    this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.updateHover(camera);
    return this.getHoveredGrid();
  }
}
