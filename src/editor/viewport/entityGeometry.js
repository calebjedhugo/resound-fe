import * as THREE from 'three';
import { WORLD_SCALE } from 'core/constants';

/**
 * One entity type → one silhouette. Shared by the placed meshes
 * (EntityPlacer) and the translucent placement ghost (GhostPreview) so the
 * preview can't drift from what actually gets placed.
 */
export function createEntityGeometry(type) {
  switch (type) {
    case 'player':
      return new THREE.ConeGeometry(WORLD_SCALE * 0.3, WORLD_SCALE * 0.6, 8);
    case 'creature':
      return new THREE.SphereGeometry(WORLD_SCALE * 0.35, 16, 12);
    case 'gate':
      return new THREE.BoxGeometry(WORLD_SCALE * 0.8, WORLD_SCALE * 1.5, WORLD_SCALE * 0.3);
    case 'fountain':
      return new THREE.CylinderGeometry(
        WORLD_SCALE * 0.4,
        WORLD_SCALE * 0.4,
        WORLD_SCALE * 0.5,
        16
      );
    case 'wall':
      return new THREE.BoxGeometry(WORLD_SCALE * 0.95, WORLD_SCALE, WORLD_SCALE * 0.95);
    case 'ramp':
      return new THREE.BoxGeometry(WORLD_SCALE * 0.9, WORLD_SCALE * 0.5, WORLD_SCALE * 0.9);
    case 'cleanser':
      // A thin disc lying flush on the floor — mirrors CleansingTile's runtime
      // look (a flat cylinder), scaled to editor units.
      return new THREE.CylinderGeometry(
        WORLD_SCALE * 0.42,
        WORLD_SCALE * 0.42,
        WORLD_SCALE * 0.04,
        32
      );
    default:
      return new THREE.BoxGeometry(WORLD_SCALE, WORLD_SCALE, WORLD_SCALE);
  }
}

// Vertical offset (in WORLD_SCALE units) that sits each mesh on its floor.
// Shared by mesh creation, repositioning, and the ghost so they can't drift.
export const Y_OFFSETS = {
  player: 0.6,
  creature: 0.35,
  gate: 0.75,
  fountain: 0.25,
  wall: 0.5,
  ramp: 0.25,
  cleanser: 0.06,
};

export const DEFAULT_Y_OFFSET = 0.5;

export function getYOffset(type) {
  return Y_OFFSETS[type] ?? DEFAULT_Y_OFFSET;
}
