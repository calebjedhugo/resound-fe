import * as THREE from 'three';
import { ABSORB_RANGE_PERCENTAGE } from 'core/constants';

/**
 * RangeIndicator
 *
 * Two nested translucent spheres around the selected creature that make its
 * reach legible in the editor, each with a ring at the creature's height
 * (the boundary reads at a glance from the overhead camera, over the dark
 * game look too):
 *   - audible range (outer, blue, fainter) = the creature's audibleRange:
 *     how far its song carries (gates hear it, other creatures feel it)
 *   - absorb reach  (inner, pale, denser)  = audibleRange ×
 *     ABSORB_RANGE_PERCENTAGE: how near the player must stand for the pole
 *     to take it (R / Square). In game the pole ALSO needs the creature in
 *     front (40°) and in sight (core/poleReach); the sphere shows distance.
 *
 * Audibility uses true 3D distance in-game (see core/utils.getDistance), so a
 * SPHERE is the accurate boundary — a flat disc would lie on elevated puzzles.
 *
 * Only creatures emit sound, so only creatures get spheres — a gate's own
 * audibleRange is a vestigial fallback (the emitter's range rules audibility).
 */

// Outer = audible (fainter, larger); inner = absorb reach (denser, half radius)
const AUDIBLE_COLOR = 0x66bbff;
const AUDIBLE_OPACITY = 0.06;
const ABSORB_COLOR = 0xe6ecff;
const ABSORB_OPACITY = 0.1;
// The ring at each sphere's equator: this much of the radius wide
const RING_WIDTH = 0.02;
const RING_OPACITY = 0.55;

export default class RangeIndicator {
  constructor(scene) {
    this._scene = scene;
    this._group = null;
    this._range = null; // audibleRange the shown spheres were built for
  }

  /**
   * Show the audible + absorb-reach spheres for `entity`, centred at `center`
   * (a world-space {x, y, z}, typically the creature mesh position). Replaces
   * any spheres already shown. EditorApp calls this on every model change
   * while a creature is selected (each song edit), so spheres of the same
   * range are only moved, not rebuilt.
   */
  show(entity, center) {
    const range = entity?.data?.audibleRange ?? 15;
    if (this._group && range === this._range && center) {
      this._group.position.set(center.x, center.y, center.z);
      return;
    }
    this.hide();
    if (!(range > 0) || !center) return;

    this._group = new THREE.Group();
    this._group.position.set(center.x, center.y, center.z);
    this._group.add(this._sphere(range, AUDIBLE_COLOR, AUDIBLE_OPACITY));
    this._group.add(this._sphere(range * ABSORB_RANGE_PERCENTAGE, ABSORB_COLOR, ABSORB_OPACITY));
    this._scene.add(this._group);
    this._range = range;
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
    const sphere = new THREE.Mesh(geo, mat);
    // Its boundary at the creature's height, flat: what the overhead view reads
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * (1 - RING_WIDTH), radius, 96),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: RING_OPACITY,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    sphere.add(ring);
    return sphere;
  }
}
