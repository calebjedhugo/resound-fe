/**
 * TileSlabs — the floor tiles in the SCHEMATIC look. The same geometry the
 * game's Floor draws (entities/Floor `buildTileGeometry`: every tile a slab
 * of the game's thickness, its top at its storey, a side face and a pale
 * edge line wherever its side is exposed — the same at every storey), in
 * flat schematic colours: each storey its own hue (subfloors too), the
 * edge lines pale. The game look draws the floor itself (GameLookLayer
 * builds the game's Floor), so these show only while the schematic look
 * does. The cutaway ghosts them as it does the game's floor, per tile, from
 * the geometry's owners (`aCut`) and the shared cut uniforms
 * (entities/CutawayLook addGhostDither).
 */
import * as THREE from 'three';
import { ELEVATION_HEIGHT } from 'core/constants';
import Floor, { buildTileGeometry } from 'entities/Floor';
import { addGhostDither } from 'entities/CutawayLook';
import { GAME_OFFSET } from 'editor/viewport/gridUtils';

const EDGE_COLOR = new THREE.Color(0xe8e2cf);

/** The schematic colour of a storey (a hue step per storey, either way of 0). */
export function storeyColor(storey, out = new THREE.Color()) {
  return out.setHSL((((storey * 0.15) % 1) + 1) % 1, 0.4, 0.35);
}

export default class TileSlabs {
  constructor(scene) {
    this._scene = scene;
    this._mesh = null;
    this._key = null;
    this._visible = true;
    this._material = addGhostDither(new THREE.MeshStandardMaterial({ vertexColors: true }), {
      perVertex: true,
    });
  }

  /**
   * Draw these tiles (rebuilt only when they, or the walls and ramps that
   * close an edge, changed).
   * @param {{x: number, y: number, z: number}[]} tiles
   * @param {object} [options] - ramps / walls ({x, y, z[, direction]}, grid units)
   */
  sync(tiles, { ramps = [], walls = [] } = {}) {
    const key = JSON.stringify([tiles, ramps, walls]);
    if (key === this._key) return;
    this._key = key;
    this._clear();
    if (tiles.length === 0) return;
    const geometry = buildTileGeometry(tiles, { ramps, walls });
    geometry.setAttribute('color', TileSlabs._colors(geometry));
    const mesh = new THREE.Mesh(geometry, this._material);
    // The game centres a cell at x * WORLD_SCALE, the editor half a cell on
    mesh.position.set(GAME_OFFSET, 0, GAME_OFFSET);
    mesh.visible = this._visible;
    this._scene.add(mesh);
    this._mesh = mesh;
  }

  /** Per vertex: its storey's colour, or pale on an edge line. */
  static _colors(geometry) {
    const positions = geometry.attributes.position.array;
    const edges = geometry.attributes.aEdge.array;
    const colors = new Float32Array(positions.length);
    const color = new THREE.Color();
    for (let i = 0; i < edges.length; i += 1) {
      if (edges[i] > 0.5) {
        color.copy(EDGE_COLOR);
      } else {
        // A slab's vertices lie from its top down to its thickness below
        const y = positions[i * 3 + 1] + Floor.SLAB_THICKNESS / 2;
        storeyColor(Math.round(y / ELEVATION_HEIGHT), color);
      }
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    return new THREE.Float32BufferAttribute(colors, 3);
  }

  /** Shown in the schematic look only. */
  setVisible(visible) {
    this._visible = visible;
    if (this._mesh) this._mesh.visible = visible;
  }

  /** What is drawn now (tests). */
  get mesh() {
    return this._mesh;
  }

  _clear() {
    if (!this._mesh) return;
    this._scene.remove(this._mesh);
    this._mesh.geometry.dispose();
    this._mesh = null;
  }

  dispose() {
    this._clear();
    this._material.dispose();
  }
}
