/**
 * EntityDragger
 *
 * Handles drag-to-move for selected entities in the editor viewport.
 * Raycasts against the ground plane to find the target grid cell,
 * then snaps the entity mesh and updates the model on drop.
 */
import * as THREE from 'three';
import { ELEVATION_HEIGHT } from 'core/constants';
import { snapToGrid, gridToWorld } from 'editor/viewport/gridUtils';

export default class EntityDragger {
  constructor(scene, camera, undoManager, entityPlacer, selectionManager) {
    this._scene = scene;
    this._camera = camera;
    this._undoManager = undoManager;
    this._entityPlacer = entityPlacer;
    this._selectionManager = selectionManager;
    this._isDragging = false;
    this._dragEntityId = null;
    this._groundPlane = null; // Set from EditorScene
    this._raycaster = new THREE.Raycaster();
  }

  set groundPlane(plane) {
    this._groundPlane = plane;
  }

  startDrag(entityId) {
    if (!entityId) return;
    this._isDragging = true;
    this._dragEntityId = entityId;
  }

  updateDrag(mouseX, mouseY, gridSize, activeElevation) {
    if (!this._isDragging || !this._dragEntityId) return;

    // Use raycaster to find position on ground plane
    const mouse = new THREE.Vector2(mouseX, mouseY);
    this._raycaster.setFromCamera(mouse, this._camera);

    if (!this._groundPlane) return;
    const hits = this._raycaster.intersectObject(this._groundPlane);
    if (hits.length === 0) return;

    const { point } = hits[0];
    const grid = snapToGrid(point.x, point.z, gridSize);
    if (!grid) return;

    const world = gridToWorld(grid.x, grid.z);

    // Update mesh position (keep vertical position based on entity type)
    const mesh = this._entityPlacer.getMeshById(this._dragEntityId);
    if (mesh) {
      // Preserve y offset (height above ground depends on entity type)
      const currentY = mesh.position.y;
      const entity = this._undoManager.getEntity(this._dragEntityId);
      const oldElevY = (entity ? entity.y : 0) * ELEVATION_HEIGHT;
      const newElevY = activeElevation * ELEVATION_HEIGHT;
      const yOffset = currentY - oldElevY;
      mesh.position.x = world.x;
      mesh.position.y = newElevY + yOffset;
      mesh.position.z = world.z;
    }
  }

  endDrag(gridSize, activeElevation) {
    if (!this._isDragging || !this._dragEntityId) return;
    this._isDragging = false;

    // Get final mesh position and update model
    const mesh = this._entityPlacer.getMeshById(this._dragEntityId);
    if (mesh) {
      const grid = snapToGrid(mesh.position.x, mesh.position.z, gridSize);
      if (grid) {
        this._undoManager.updateEntity(this._dragEntityId, {
          x: grid.x,
          y: activeElevation,
          z: grid.z,
        });
      }
    }

    this._dragEntityId = null;
  }

  get isDragging() {
    return this._isDragging;
  }
}
