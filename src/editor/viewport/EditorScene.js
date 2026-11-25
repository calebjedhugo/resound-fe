import * as THREE from 'three';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import { snapToGrid, gridToWorld, levelCenterCell } from 'editor/viewport/gridUtils';
import { createOutlineBox, createOutlineMaterial } from 'editor/viewport/outlineBox';

// Lift the cursor highlight above the floor slab (0.2 thick, centred on the
// storey height, so its top is +0.1) so it is never hidden under a platform.
const CURSOR_LIFT = 0.15;
// The grid lines sit this far over their storey's floor, so they never
// z-fight the game look's floor (its top is exactly at the storey height)
const GRID_LIFT = 0.03;
const CURSOR_COLOR = 0x44ff88;
// The drawn grid: this many cells across, centred near the cursor (it
// follows the cursor, a cell at a time, so the level has no edge)
const GRID_CELLS = 80;
// The raycast plane is this wide: clicks land anywhere in view
const PICK_PLANE_SIZE = 20000;

export default class EditorScene {
  constructor(scene, model) {
    this._scene = scene;
    this._model = model;
    this._hoverMesh = null;
    this._activeElevation = 0;
    this._raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    this._groundPlane = null;
    this._gridHelper = null;
    // A cell is ALWAYS selected (the cursor). It is driven ONLY by the arrow
    // keys and by clicking a tile — never by mouse hover. The highlight mesh
    // renders at the cursor every frame. There is no grid edge: the floor is
    // only what the designer builds, anywhere (negative cells too).
    this._cursorCell = this._centerCell();
    // The floor range being built while ✕ / Enter is held: { anchor: {x,z},
    // elevation } (a rectangle from the anchor to the cursor); else null
    this._floorRange = null;

    this._createGrid();
    this._createAxes();
    this._createHoverMesh();
    this._createFloorRangeMesh();
    this._createWallRangeMesh();
  }

  /** The middle of what is built (the origin cell in an empty level). */
  _centerCell() {
    return levelCenterCell(this._model);
  }

  get activeElevation() {
    return this._activeElevation;
  }
  set activeElevation(val) {
    this._activeElevation = val;
    // The grid, raycast plane, and cursor all live on the active storey.
    this._positionGrid();
    this._positionCursorMesh();
  }

  _createGrid() {
    const size = GRID_CELLS * WORLD_SCALE;
    // Grid helper: lines on cell edges, moved under the cursor (_positionGrid)
    this._gridHelper = new THREE.GridHelper(size, GRID_CELLS, 0x4f8bc7, 0x285c88);
    this._scene.add(this._gridHelper);

    // The plane clicks land on (for raycasting), wide enough to reach the
    // horizon, at the active storey
    const planeGeo = new THREE.PlaneGeometry(PICK_PLANE_SIZE, PICK_PLANE_SIZE);
    const planeMat = new THREE.MeshBasicMaterial({ visible: false });
    this._groundPlane = new THREE.Mesh(planeGeo, planeMat);
    this._groundPlane.rotation.x = -Math.PI / 2;
    this._scene.add(this._groundPlane);

    this._positionGrid();
  }

  _createAxes() {
    // Axis indicator (small colored lines at origin)
    const axisHelper = new THREE.AxesHelper(WORLD_SCALE * 2);
    this._scene.add(axisHelper);
  }

  _createHoverMesh() {
    const geo = new THREE.PlaneGeometry(WORLD_SCALE * 0.95, WORLD_SCALE * 0.95);
    const mat = new THREE.MeshBasicMaterial({
      color: CURSOR_COLOR,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    this._hoverMesh = new THREE.Mesh(geo, mat);
    this._hoverMesh.rotation.x = -Math.PI / 2;
    // The cursor is always shown — a cell is always selected.
    this._hoverMesh.visible = true;
    this._scene.add(this._hoverMesh);
    // ...and its frame, drawn over everything: the cell under a wall, a
    // gate's dark glass or a creature still shows where the cursor is
    this._cursorFrame = createOutlineBox({
      width: WORLD_SCALE * 0.95,
      height: 0,
      depth: WORLD_SCALE * 0.95,
      thickness: 0.1,
      material: createOutlineMaterial(CURSOR_COLOR, 0.9),
      edges: 'base',
    });
    this._scene.add(this._cursorFrame);
  }

  _positionCursorMesh() {
    if (!this._hoverMesh) return;
    const world = gridToWorld(this._cursorCell.x, this._cursorCell.z);
    const elevY = this._activeElevation * ELEVATION_HEIGHT;
    this._hoverMesh.position.set(world.x, elevY + CURSOR_LIFT, world.z);
    if (this._cursorFrame) this._cursorFrame.position.set(world.x, elevY + CURSOR_LIFT, world.z);
  }

  _createFloorRangeMesh() {
    // A unit plane scaled to the range rectangle each frame. Gold = "floor
    // about to be built" (distinct from the green cursor).
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffcc44,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this._floorRangeMesh = new THREE.Mesh(geo, mat);
    this._floorRangeMesh.rotation.x = -Math.PI / 2;
    this._floorRangeMesh.visible = false;
    this._scene.add(this._floorRangeMesh);
  }

  /** Show the floor range being built: a rectangle from `anchor` to the cursor. */
  setFloorRange(anchor, elevation) {
    this._floorRange = { anchor: { x: anchor.x, z: anchor.z }, elevation };
    this._positionFloorRange();
  }

  _createWallRangeMesh() {
    // A unit box scaled to the wall box being drawn (✕ held with Wall
    // chosen): its whole footprint and every storey it spans, translucent
    this._wallRange = null;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    this._wallRangeMesh = new THREE.Mesh(geo, mat);
    this._wallRangeMesh.visible = false;
    this._scene.add(this._wallRangeMesh);
  }

  /**
   * Show the wall box being drawn: the rectangle from `anchor` to the
   * cursor, from storey `from` to storey `to` (either way), walls one
   * storey tall each.
   */
  setWallRange(anchor, from, to) {
    this._wallRange = { anchor: { x: anchor.x, z: anchor.z }, from, to };
    this._positionWallRange();
  }

  clearWallRange() {
    this._wallRange = null;
    if (this._wallRangeMesh) this._wallRangeMesh.visible = false;
  }

  _positionWallRange() {
    if (!this._wallRange || !this._wallRangeMesh) return;
    const { anchor, from, to } = this._wallRange;
    const c = this._cursorCell;
    const x1 = Math.min(anchor.x, c.x);
    const x2 = Math.max(anchor.x, c.x);
    const z1 = Math.min(anchor.z, c.z);
    const z2 = Math.max(anchor.z, c.z);
    const low = Math.min(from, to);
    const storeys = Math.abs(to - from) + 1;
    const width = (x2 - x1 + 1) * WORLD_SCALE;
    const depth = (z2 - z1 + 1) * WORLD_SCALE;
    const height = storeys * ELEVATION_HEIGHT;
    this._wallRangeMesh.scale.set(width, height, depth);
    this._wallRangeMesh.position.set(
      (x1 + (x2 - x1 + 1) / 2) * WORLD_SCALE,
      low * ELEVATION_HEIGHT + height / 2,
      (z1 + (z2 - z1 + 1) / 2) * WORLD_SCALE
    );
    this._wallRangeMesh.visible = true;
  }

  clearFloorRange() {
    this._floorRange = null;
    if (this._floorRangeMesh) this._floorRangeMesh.visible = false;
  }

  _positionFloorRange() {
    if (!this._floorRange || !this._floorRangeMesh) return;
    const { anchor, elevation } = this._floorRange;
    const c = this._cursorCell;
    const x1 = Math.min(anchor.x, c.x);
    const x2 = Math.max(anchor.x, c.x);
    const z1 = Math.min(anchor.z, c.z);
    const z2 = Math.max(anchor.z, c.z);
    const width = (x2 - x1 + 1) * WORLD_SCALE;
    const depth = (z2 - z1 + 1) * WORLD_SCALE;
    const cx = (x1 + (x2 - x1 + 1) / 2) * WORLD_SCALE;
    const cz = (z1 + (z2 - z1 + 1) / 2) * WORLD_SCALE;
    const y = elevation * ELEVATION_HEIGHT + CURSOR_LIFT;
    this._floorRangeMesh.scale.set(width, depth, 1);
    this._floorRangeMesh.position.set(cx, y, cz);
    this._floorRangeMesh.visible = true;
  }

  /**
   * Pin the grid + raycast plane to the active storey's height, the grid
   * under the cursor (on a cell edge, so its lines stay on cell edges).
   */
  _positionGrid() {
    const y = this._activeElevation * ELEVATION_HEIGHT;
    if (this._gridHelper) {
      const step = 8; // re-centre every few cells, not every move
      const gx = Math.round(this._cursorCell.x / step) * step * WORLD_SCALE;
      const gz = Math.round(this._cursorCell.z / step) * step * WORLD_SCALE;
      this._gridHelper.position.set(gx, y + GRID_LIFT, gz);
    }
    if (this._groundPlane) this._groundPlane.position.set(0, y, 0);
  }

  update() {
    // Keep the cursor highlight (and any floor range being built) pinned to
    // the cursor every frame.
    this._positionCursorMesh();
    this._positionFloorRange();
    this._positionWallRange();
  }

  /** The currently selected cell — always a valid { x, z } (never null). */
  getHoveredGrid() {
    return { ...this._cursorCell };
  }

  /** Move the cursor by a grid delta (anywhere: the level has no edge). */
  moveCursor(dx, dz) {
    this._cursorCell = { x: this._cursorCell.x + dx, z: this._cursorCell.z + dz };
    this._positionCursorMesh();
    this._positionGrid();
  }

  /** Put the cursor on a cell. */
  setCursor(cell) {
    this._cursorCell = { x: cell.x, z: cell.z };
    this._positionCursorMesh();
    this._positionGrid();
  }

  /** Reset the cursor to the middle of what is built (e.g. on loading a puzzle). */
  recenterCursor() {
    this.setCursor(this._centerCell());
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
   * "moved" over. Returns null for a click that hits no ground (the sky)
   * without disturbing the persistent cursor.
   */
  gridFromEvent(event, camera) {
    const container = document.getElementById('editor-viewport');
    const rect = container.getBoundingClientRect();
    this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, camera);
    const hits = this._raycaster.intersectObject(this._groundPlane);
    if (hits.length === 0) return null;
    const grid = snapToGrid(hits[0].point.x, hits[0].point.z);
    this.setCursor(grid);
    return grid;
  }
}
