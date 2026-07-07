import * as THREE from 'three';
import { CLAP_VISUAL_FADE_DURATION } from 'core/constants';

/**
 * ClapVisual - Manages visual feedback for clapping
 * Shows an expanding circle at clap range
 */
class ClapVisual {
  constructor(scene) {
    this.scene = scene;
    this.activeFeedback = []; // Track active visual effects
  }

  /**
   * Show clap visual feedback
   * @param {Object} position - {x, y, z} center position
   * @param {number} range - Radius of the circle
   */
  show(position, range) {
    // Create a circle geometry on the ground plane
    const geometry = new THREE.RingGeometry(
      range * 0.9, // Inner radius (slightly smaller for ring effect)
      range, // Outer radius
      64 // Segments (smooth circle)
    );

    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    });

    const circle = new THREE.Mesh(geometry, material);

    // Position on the ground, rotate to be horizontal
    circle.position.set(position.x, 0.1, position.z); // Slightly above ground to prevent z-fighting
    circle.rotation.x = -Math.PI / 2; // Rotate to lie flat

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
        // Fade complete - remove from scene
        this.scene.remove(feedback.mesh);
        feedback.mesh.geometry.dispose();
        feedback.mesh.material.dispose();
        return false; // Remove from array
      }

      // Fade out opacity
      feedback.mesh.material.opacity = 0.6 * (1 - progress);

      return true; // Keep in array
    });
  }

  /**
   * Clear all active feedback (e.g., when exiting puzzle)
   */
  clear() {
    this.activeFeedback.forEach((feedback) => {
      this.scene.remove(feedback.mesh);
      feedback.mesh.geometry.dispose();
      feedback.mesh.material.dispose();
    });
    this.activeFeedback = [];
  }
}

export default ClapVisual;
