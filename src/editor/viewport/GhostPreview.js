import * as THREE from 'three';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import { gridToWorld } from 'editor/viewport/gridUtils';
import ENTITY_COLORS from 'editor/viewport/entityColors';
import { createEntityGeometry, getYOffset } from 'editor/viewport/entityGeometry';

export default class GhostPreview {
  constructor(scene) {
    this._scene = scene;
    this._mesh = null;
    this._currentType = null;
  }

  setEntityType(type) {
    if (type === this._currentType) return;

    this._disposeMesh();

    if (!type) {
      this._currentType = null;
      return;
    }

    this._currentType = type;
    this._mesh = this._createGhostMesh(type);
    this._mesh.visible = false;
    this._scene.add(this._mesh);
  }

  update(hoveredGrid, elevation) {
    if (!this._mesh) return;

    if (!hoveredGrid) {
      this._mesh.visible = false;
      return;
    }

    const world = gridToWorld(hoveredGrid.x, hoveredGrid.z);
    const y = elevation * ELEVATION_HEIGHT;

    this._mesh.position.set(world.x, y + WORLD_SCALE * getYOffset(this._currentType), world.z);
    this._mesh.visible = true;
  }

  dispose() {
    this._disposeMesh();
    this._currentType = null;
  }

  _disposeMesh() {
    if (this._mesh) {
      this._scene.remove(this._mesh);
      this._mesh.geometry.dispose();
      this._mesh.material.dispose();
      this._mesh = null;
    }
  }

  _createGhostMesh(type) {
    const mat = new THREE.MeshStandardMaterial({
      color: ENTITY_COLORS[type],
      opacity: 0.4,
      transparent: true,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(createEntityGeometry(type), mat);
    if (type === 'player') {
      mesh.rotation.x = Math.PI; // Spawn marker points down
    }
    return mesh;
  }
}
