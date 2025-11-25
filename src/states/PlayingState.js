import { syncCameraToPlayer } from 'resoundModules/playerControls/motion/motion';
import { randomInstrument } from 'createEventListeners';

class PlayingState {
  constructor(gameState, entityManager, motion) {
    this.gameState = gameState;
    this.entityManager = entityManager;
    this.motion = motion;
  }

  enter() {
    // Sync camera to player start position
    syncCameraToPlayer(this.gameState.player.position);

    // Resume music if it was paused
    if (randomInstrument.playbackState.isPaused) {
      randomInstrument.resume();
    }
  }

  update(deltaTime) {
    // Update all entities
    if (this.entityManager) {
      this.entityManager.update(deltaTime);
    }
  }

  exit() {
    // Pause any playing music when leaving play state
    randomInstrument.pause();
  }
}

export default PlayingState;
