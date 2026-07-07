import { syncCameraToPlayer } from 'resoundModules/playerControls/motion/motion';
import { randomInstrument } from 'createEventListeners';
import ClapManager from 'core/ClapManager';

class PlayingState {
  /**
   * @param {GameState} gameState
   */
  constructor(gameState) {
    this.gameState = gameState;
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

  update() {
    // Update clap manager (handles quantization)
    ClapManager.update();
    // Areas/entities are NOT updated here: main.js's update() drives the
    // world exactly once per frame, gated on the start gate (the world must
    // hold still while the gate is up).
  }

  exit() {
    // Pause any playing music when leaving play state
    randomInstrument.pause();
  }
}

export default PlayingState;
