/**
 * TileSlabs — the floor tiles in the SCHEMATIC look: one thin box per
 * built cell, coloured by storey (HSL hue steps), all one InstancedMesh.
 * The game look draws the floor itself (GameLookLayer builds the game's
 * Floor), so these show only while the schematic look does.
 */
import * as THREE from 'three';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import { gridToWorld } from 'editor/viewport/gridUtils';

const SLAB_HEIGHT = 0.2;

export default class TileSlabs {
  constructor(scene) {
    this._scene = scene;
    this._mesh = null;
    this._key = null;
    this._visible = true;
    this._geometry = new THREE.BoxGeometry(WORLD_SCALE * 0.98, SLAB_HEIGHT, WORLD_SCALE * 0.98);
    this._material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
    });
  }

  /**
   * Draw these tiles (rebuilt only when they changed).
   * @param {{x: number, y: number, z: number}[]} tiles
   */
  sync(tiles) {
    const key = tiles.map((t) => `${t.x},${t.y},${t.z}`).join(';');
    if (key === this._key) return;
    this._key = key;
    this._clear();
    if (tiles.length === 0) return;
    const mesh = new THREE.InstancedMesh(this._geometry, this._material, tiles.length);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    tiles.forEach((t, i) => {
      const world = gridToWorld(t.x, t.z);
      mesh.setMatrixAt(i, matrix.makeTranslation(world.x, t.y * ELEVATION_HEIGHT, world.z));
      mesh.setColorAt(i, color.setHSL((t.y * 0.15) % 1, 0.4, 0.35));
    });
    mesh.computeBoundingSphere();
    mesh.visible = this._visible;
    this._scene.add(mesh);
    this._mesh = mesh;
  }

  /** Shown in the schematic look only. */
  setVisible(visible) {
    this._visible = visible;
    if (this._mesh) this._mesh.visible = visible;
  }

  _clear() {
    if (!this._mesh) return;
    this._scene.remove(this._mesh);
    if (this._mesh.dispose) this._mesh.dispose();
    this._mesh = null;
  }

  dispose() {
    this._clear();
    this._geometry.dispose();
    this._material.dispose();
  }
}
