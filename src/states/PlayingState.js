import { syncCameraToPlayer } from 'resoundModules/playerControls/motion/motion';
import { randomInstrument } from 'createEventListeners';
import ClapManager from 'core/ClapManager';

class PlayingState {
  constructor(gameState, entityManager, motion) {
    this.gameState = gameState;
    this.entityManager = entityManager;
    this.motion = motion;
  }

  enter() {
    // Sync camera to player start position
    syncCameraToPlayer(this.gameState.player.position);

    // Initialize clap manager
    ClapManager.initialize();

    // Resume music if it was paused
    if (randomInstrument.playbackState.isPaused) {
      randomInstrument.resume();
    }
  }

  update(deltaTime) {
    // Update clap manager (handles quantization)
    ClapManager.update();

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
