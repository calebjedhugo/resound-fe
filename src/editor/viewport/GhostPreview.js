import * as THREE from 'three';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import { gridToWorld } from 'editor/viewport/gridUtils';
import ENTITY_COLORS from 'editor/viewport/entityColors';

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

    this._mesh.position.set(world.x, y + this._getYOffset(this._currentType), world.z);
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

    let geo;
    let mesh;

    switch (type) {
      case 'player':
        geo = new THREE.ConeGeometry(WORLD_SCALE * 0.3, WORLD_SCALE * 0.6, 8);
        mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = Math.PI;
        break;
      case 'creature':
        geo = new THREE.SphereGeometry(WORLD_SCALE * 0.35, 16, 12);
        mesh = new THREE.Mesh(geo, mat);
        break;
      case 'gate':
        geo = new THREE.BoxGeometry(WORLD_SCALE * 0.8, WORLD_SCALE * 1.5, WORLD_SCALE * 0.3);
        mesh = new THREE.Mesh(geo, mat);
        break;
      case 'fountain':
        geo = new THREE.CylinderGeometry(
          WORLD_SCALE * 0.4,
          WORLD_SCALE * 0.4,
          WORLD_SCALE * 0.5,
          16
        );
        mesh = new THREE.Mesh(geo, mat);
        break;
      case 'wall':
        geo = new THREE.BoxGeometry(WORLD_SCALE * 0.95, WORLD_SCALE, WORLD_SCALE * 0.95);
        mesh = new THREE.Mesh(geo, mat);
        break;
      case 'ramp':
        geo = new THREE.BoxGeometry(WORLD_SCALE * 0.9, WORLD_SCALE * 0.5, WORLD_SCALE * 0.9);
        mesh = new THREE.Mesh(geo, mat);
        break;
      default:
        geo = new THREE.BoxGeometry(WORLD_SCALE, WORLD_SCALE, WORLD_SCALE);
        mesh = new THREE.Mesh(geo, mat);
        break;
    }

    return mesh;
  }

  _getYOffset(type) {
    switch (type) {
      case 'player':
        return WORLD_SCALE * 0.6;
      case 'creature':
        return WORLD_SCALE * 0.35;
      case 'gate':
        return WORLD_SCALE * 0.75;
      case 'fountain':
        return WORLD_SCALE * 0.25;
      case 'wall':
        return WORLD_SCALE * 0.5;
      case 'ramp':
        return WORLD_SCALE * 0.25;
      default:
        return WORLD_SCALE * 0.5;
    }
  }
}
