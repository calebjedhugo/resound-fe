/**
 * FloorRegionPanel
 *
 * UI for adding and managing floor regions. Uses a two-corner
 * click-to-define workflow on the grid: click first corner, then
 * click second corner to define a rectangular floor region at the
 * active elevation level.
 *
 * Renders floor regions as semi-transparent 3D boxes in the scene,
 * colored by elevation level (HSL hue rotation).
 */
import * as THREE from 'three';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import { maxFloorElevation } from 'editor/util/elevations';

export default class FloorRegionPanel {
  constructor(container, undoManager, editorScene, onFloorsChanged, notify) {
    this._container = container;
    this._undoManager = undoManager;
    this._editorScene = editorScene;
    this._onFloorsChanged = onFloorsChanged || (() => {});
    this._notify = notify || (() => {});
    this._isPlacing = false;
    this._firstCorner = null;
    this._previewMesh = null;
    this._floorMeshes = [];
    // Elevation the *next* region is placed on. Defaults to the current storey;
    // can go one above the highest floor to start a new upper storey.
    this._targetElevation = editorScene.activeElevation || 0;
    this._render();
  }

  /** Highest elevation a new region may target: one above the current top. */
  _maxTarget() {
    return maxFloorElevation(this._undoManager.getFloors()) + 1;
  }

  _render() {
    this._container.innerHTML = '';
    // Keep the target within [0, top + 1] as floors come and go.
    this._targetElevation = Math.max(0, Math.min(this._targetElevation, this._maxTarget()));

    const wrapper = document.createElement('div');
    wrapper.className = 'panel-section';

    const label = document.createElement('label');
    label.textContent = 'Floor Regions';
    label.className = 'panel-label';
    wrapper.appendChild(label);

    // New-region elevation stepper (this is how a new upper storey is created).
    const elevRow = document.createElement('div');
    elevRow.className = 'floor-elev-row';
    const elevLabel = document.createElement('span');
    elevLabel.className = 'floor-elev-label';
    elevLabel.textContent = 'Add next region on floor';
    elevLabel.title = 'The elevation the next floor region you draw will be placed on';
    elevRow.appendChild(elevLabel);

    const downBtn = document.createElement('button');
    downBtn.className = 'elevation-btn floor-elev-btn';
    downBtn.textContent = '-';
    downBtn.disabled = this._targetElevation <= 0;
    downBtn.onclick = () => this._changeTarget(-1);
    elevRow.appendChild(downBtn);

    const elevValue = document.createElement('span');
    elevValue.className = 'floor-elev-value';
    elevValue.textContent = this._targetElevation;
    elevRow.appendChild(elevValue);

    const upBtn = document.createElement('button');
    upBtn.className = 'elevation-btn floor-elev-btn';
    upBtn.textContent = '+';
    upBtn.disabled = this._targetElevation >= this._maxTarget();
    upBtn.onclick = () => this._changeTarget(1);
    elevRow.appendChild(upBtn);

    wrapper.appendChild(elevRow);

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add Floor Region';
    addBtn.className = 'editor-btn';
    addBtn.onclick = () => this._startPlacing();
    wrapper.appendChild(addBtn);
    this._addBtn = addBtn;

    this._listEl = document.createElement('div');
    this._listEl.className = 'floor-list';
    wrapper.appendChild(this._listEl);

    this._container.appendChild(wrapper);
    this._refreshList();
  }

  _changeTarget(delta) {
    const next = this._targetElevation + delta;
    if (next < 0 || next > this._maxTarget()) return;
    this._targetElevation = next;
    this._render();
  }

  _startPlacing() {
    this._isPlacing = true;
    this._firstCorner = null;
    this._addBtn.textContent = 'Click first corner...';
    this._addBtn.disabled = true;
  }

  handleGridClick(gridX, gridZ) {
    if (!this._isPlacing) return false;

    if (!this._firstCorner) {
      this._firstCorner = { x: gridX, z: gridZ };
      this._addBtn.textContent = 'Click second corner...';
      return true;
    }

    // Second corner -- define the floor region
    const x1 = Math.min(this._firstCorner.x, gridX);
    const z1 = Math.min(this._firstCorner.z, gridZ);
    const x2 = Math.max(this._firstCorner.x, gridX);
    const z2 = Math.max(this._firstCorner.z, gridZ);
    const elevation = this._targetElevation;

    // Floors can't stack: the ground storey already covers the whole grid,
    // and higher regions may not overlap an existing region at their level.
    if (elevation === 0) {
      this._notify('Ground floor already covers the whole grid — use E1+ for raised floors');
      this.cancelPlacing();
      return true;
    }
    const overlap = this._undoManager
      .getFloors()
      .find(
        (f) => f.elevation === elevation && x1 <= f.x2 && x2 >= f.x1 && z1 <= f.z2 && z2 >= f.z1
      );
    if (overlap) {
      this._notify(
        `Overlaps the E${elevation} floor (${overlap.x1},${overlap.z1})–(${overlap.x2},${overlap.z2}) — floors can't stack`
      );
      this.cancelPlacing();
      return true;
    }

    this._undoManager.addFloor(elevation, x1, z1, x2, z2);
    this._notify(`Floor added at E${elevation}: (${x1},${z1})–(${x2},${z2})`, 'success');
    this._isPlacing = false;
    this._firstCorner = null;
    this._addBtn.textContent = '+ Add Floor Region';
    this._addBtn.disabled = false;
    this._render();
    this._renderFloors();
    this._onFloorsChanged();
    return true;
  }

  cancelPlacing() {
    this._isPlacing = false;
    this._firstCorner = null;
    this._addBtn.textContent = '+ Add Floor Region';
    this._addBtn.disabled = false;
  }

  get isPlacing() {
    return this._isPlacing;
  }

  _refreshList() {
    this._listEl.innerHTML = '';
    const floors = this._undoManager.getFloors();
    floors.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'floor-row';

      const info = document.createElement('span');
      info.textContent = `E${f.elevation}: (${f.x1},${f.z1}) to (${f.x2},${f.z2})`;

      const delBtn = document.createElement('button');
      delBtn.textContent = 'X';
      delBtn.className = 'delete-btn';
      delBtn.onclick = () => {
        this._undoManager.removeFloor(i);
        this._render();
        this._renderFloors();
        this._onFloorsChanged();
      };

      row.appendChild(info);
      row.appendChild(delBtn);
      this._listEl.appendChild(row);
    });
  }

  _renderFloors() {
    // Clear old meshes
    this._floorMeshes.forEach((m) => {
      this._editorScene._scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    this._floorMeshes = [];

    const floors = this._undoManager.getFloors();

    floors.forEach((f) => {
      const width = (f.x2 - f.x1 + 1) * WORLD_SCALE;
      const depth = (f.z2 - f.z1 + 1) * WORLD_SCALE;
      const geo = new THREE.BoxGeometry(width, 0.2, depth);

      // Color by elevation level
      const hue = (f.elevation * 0.15) % 1;
      const color = new THREE.Color().setHSL(hue, 0.4, 0.35);
      const mat = new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.7,
      });

      const mesh = new THREE.Mesh(geo, mat);
      const centerX = (f.x1 + (f.x2 - f.x1 + 1) / 2) * WORLD_SCALE;
      const centerZ = (f.z1 + (f.z2 - f.z1 + 1) / 2) * WORLD_SCALE;
      const y = f.elevation * ELEVATION_HEIGHT;
      mesh.position.set(centerX, y, centerZ);
      this._editorScene._scene.add(mesh);
      this._floorMeshes.push(mesh);
    });
  }

  // Call this to refresh the view after floors change (add/remove/undo/load)
  refresh() {
    this._render();
    this._renderFloors();
  }
}
