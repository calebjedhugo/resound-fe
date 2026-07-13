import * as THREE from 'three';
import { RECORDING_RANGE_PERCENTAGE } from 'core/constants';

/**
 * RangeIndicator
 *
 * Two nested translucent spheres around the selected creature that make its
 * reach legible in the editor:
 *   - audible range   (outer, fainter) = creature's audibleRange
 *   - recordable range (inner, denser) = audibleRange × RECORDING_RANGE_PERCENTAGE
 *
 * Audibility uses true 3D distance in-game (see core/utils.getDistance), so a
 * SPHERE is the accurate boundary — a flat disc would lie on elevated puzzles.
 * Light blue reads as an "audio field" and stays distinct from the green cursor
 * highlight and green ramps.
 *
 * Only creatures emit sound, so only creatures get spheres — a gate's own
 * audibleRange is a vestigial fallback (the emitter's range rules audibility).
 */

// Outer = audible (fainter, larger); inner = recordable (denser, half radius).
const AUDIBLE_COLOR = 0x66bbff;
const AUDIBLE_OPACITY = 0.06;
const RECORD_COLOR = 0x2f9bff;
const RECORD_OPACITY = 0.13;

export default class RangeIndicator {
  constructor(scene) {
    this._scene = scene;
    this._group = null;
  }

  /**
   * Show the audible + recordable spheres for `entity`, centred at `center`
   * (a world-space {x, y, z}, typically the creature mesh position). Replaces
   * any spheres already shown.
   */
  show(entity, center) {
    this.hide();
    const range = entity?.data?.audibleRange ?? 15;
    if (!(range > 0) || !center) return;

    this._group = new THREE.Group();
    this._group.position.set(center.x, center.y, center.z);
    this._group.add(this._sphere(range, AUDIBLE_COLOR, AUDIBLE_OPACITY));
    this._group.add(this._sphere(range * RECORDING_RANGE_PERCENTAGE, RECORD_COLOR, RECORD_OPACITY));
    this._scene.add(this._group);
  }

  /** Remove the spheres (and free their GPU resources). */
  hide() {
    if (!this._group) return;
    this._scene.remove(this._group);
    this._group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    this._group = null;
  }

  _sphere(radius, color, opacity) {
    const geo = new THREE.SphereGeometry(radius, 24, 16);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false, // don't occlude entities inside; let the two blend
      side: THREE.DoubleSide, // visible from inside the sphere too
    });
    return new THREE.Mesh(geo, mat);
  }
}
