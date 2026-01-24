/**
 * Mock motion module for testing
 * The real motion.js creates THREE objects at import time, so we mock it
 */

import gameState from 'core/GameState';

// Mock camera position that syncs with gameState
const camera = {
  position: { x: 0, y: 1.8, z: 0 },
};

// Sync camera to player position
const syncCameraToPlayer = (position) => {
  camera.position.x = position.x;
  camera.position.z = position.z;
  camera.position.y = 1.8;
};

// Motion update - moves player based on input keys
const motion = () => {
  const speed = gameState.input.keys.running ? 0.134 : 0.067;

  if (gameState.input.keys.forward) {
    gameState.player.position.z -= speed;
  }
  if (gameState.input.keys.backward) {
    gameState.player.position.z += speed;
  }
  if (gameState.input.keys.latLeft) {
    gameState.player.position.x -= speed;
  }
  if (gameState.input.keys.latRight) {
    gameState.player.position.x += speed;
  }

  // Sync camera
  camera.position.x = gameState.player.position.x;
  camera.position.z = gameState.player.position.z;
};

export { camera, syncCameraToPlayer };
export default motion;
