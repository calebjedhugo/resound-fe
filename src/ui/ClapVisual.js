import * as THREE from 'three';
import { CLAP_VISUAL_FADE_DURATION } from 'core/constants';

const RING_OPACITY = 0.6;

/**
 * ClapVisual - Manages visual feedback for clapping
 * Shows an expanding circle at clap range
 *
 * Rings are RECYCLED, never disposed: disposing a faded ring's material
 * released its shader program (nothing else draws with that program), so
 * every clap recompiled it (~4 ms, measured 2026-10-17). A faded ring
 * leaves the scene and waits for the next clap; rings of one radius share
 * one geometry (every clap reaches CLAP_RANGE, so in practice there is
 * one). Each ring keeps its own material — overlapping rings fade
 * independently.
 */
class ClapVisual {
  constructor(scene) {
    this.scene = scene;
    this.activeFeedback = []; // Track active visual effects
    this._idleRings = []; // faded rings, ready for the next clap
    this._geometries = new Map(); // ring radius -> its geometry
  }

  /**
   * Show clap visual feedback
   * @param {Object} position - {x, y, z} center position
   * @param {number} range - Radius of the circle
   */
  show(position, range) {
    const geometry = this._ringGeometry(range);
    const circle = this._idleRings.pop() || ClapVisual._createRing(geometry);
    circle.geometry = geometry;
    circle.material.opacity = RING_OPACITY;

    // Position on the ground (rings lie flat: see _createRing)
    circle.position.set(position.x, 0.1, position.z); // Slightly above ground to prevent z-fighting

    // Add to scene
    this.scene.add(circle);

    // Track this feedback with creation time
    const feedback = {
      mesh: circle,
      startTime: performance.now(),
      duration: CLAP_VISUAL_FADE_DURATION * 1000, // Convert to ms
    };

    this.activeFeedback.push(feedback);
  }

  /**
   * Update active visual effects (fade out over time)
   */
  update() {
    if (this.activeFeedback.length === 0) return;
    const currentTime = performance.now();

    // Update each active feedback
    this.activeFeedback = this.activeFeedback.filter((feedback) => {
      const elapsed = currentTime - feedback.startTime;
      const progress = elapsed / feedback.duration;

      if (progress >= 1) {
        // Fade complete - remove from scene, keep for the next clap
        this._retire(feedback.mesh);
        return false; // Remove from array
      }

      // Fade out opacity
      feedback.mesh.material.opacity = RING_OPACITY * (1 - progress);

      return true; // Keep in array
    });
  }

  /**
   * Clear all active feedback (e.g., when exiting puzzle)
   */
  clear() {
    this.activeFeedback.forEach((feedback) => this._retire(feedback.mesh));
    this.activeFeedback = [];
  }

  _retire(circle) {
    this.scene.remove(circle);
    this._idleRings.push(circle);
  }

  /** The (shared) ring geometry for a clap of this radius. */
  _ringGeometry(range) {
    let geometry = this._geometries.get(range);
    if (!geometry) {
      geometry = new THREE.RingGeometry(
        range * 0.9, // Inner radius (slightly smaller for ring effect)
        range, // Outer radius
        64 // Segments (smooth circle)
      );
      this._geometries.set(range, geometry);
    }
    return geometry;
  }

  /** A ring mesh lying flat, with a material of its own (it fades alone). */
  static _createRing(geometry) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: RING_OPACITY,
    });
    const circle = new THREE.Mesh(geometry, material);
    circle.rotation.x = -Math.PI / 2; // Rotate to lie flat
    return circle;
  }
}

export default ClapVisual;
