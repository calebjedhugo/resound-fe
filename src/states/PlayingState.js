import { syncCameraToPlayer } from 'resoundModules/playerControls/motion/motion';

class PlayingState {
  constructor(gameState, entityManager, motion) {
    this.gameState = gameState;
    this.entityManager = entityManager;
    this.motion = motion;
  }

  enter() {
    console.log('Entering Playing State');
    // Sync camera to player start position
    syncCameraToPlayer(this.gameState.player.position);
  }

  update(deltaTime) {
    // Update all entities
    if (this.entityManager) {
      this.entityManager.update(deltaTime);
    }
  }

  render() {
    // 3D rendering is handled by motion.js for now
  }

  exit() {
    console.log('Exiting Playing State');
  }
}

export default PlayingState;
