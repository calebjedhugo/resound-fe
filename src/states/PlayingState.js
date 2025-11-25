import { syncCameraToPlayer } from 'resoundModules/playerControls/motion/motion';

class PlayingState {
  constructor(gameState, entityManager, motion) {
    this.gameState = gameState;
    this.entityManager = entityManager;
    this.motion = motion;
  }

  enter() {
    // Sync camera to player start position
    syncCameraToPlayer(this.gameState.player.position);
  }

  update(deltaTime) {
    // Update all entities
    if (this.entityManager) {
      this.entityManager.update(deltaTime);
    }
  }

  exit() {
    console.log('Exiting Playing State');
  }
}

export default PlayingState;
