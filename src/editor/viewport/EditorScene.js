import * as THREE from 'three';
import { WORLD_SCALE } from 'core/constants';
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

    this._createGrid();
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
    const gridHelper = new THREE.GridHelper(size, this._gridSize, 0x0f3460, 0x0a2040);
    gridHelper.position.set(size / 2, 0, size / 2);
    this._scene.add(gridHelper);

    // Base floor plane (for raycasting)
    const planeGeo = new THREE.PlaneGeometry(size, size);
    const planeMat = new THREE.MeshBasicMaterial({ visible: false });
    this._groundPlane = new THREE.Mesh(planeGeo, planeMat);
    this._groundPlane.rotation.x = -Math.PI / 2;
    this._groundPlane.position.set(size / 2, 0, size / 2);
    this._scene.add(this._groundPlane);

    // Axis indicator (small colored lines at origin)
    const axisHelper = new THREE.AxesHelper(WORLD_SCALE * 2);
    this._scene.add(axisHelper);
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
      const point = hits[0].point;
      const grid = snapToGrid(point.x, point.z, this._gridSize);
      if (grid) {
        const world = gridToWorld(grid.x, grid.z);
        const elevY = this._activeElevation * 3.0; // ELEVATION_HEIGHT
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
}
