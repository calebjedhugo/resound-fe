import { Clap } from 'resound-sound';
import { CLAP_RANGE, DEFAULT_CLAP_DISPLACEMENT } from './constants';
import { getDistance } from './utils';
import gameState from './GameState';

/**
 * ClapManager - Handles player clapping to displace creature timing
 */
class ClapManager {
  static clapInstrument = new Clap('player-clap');
  static pendingClap = false; // Track if a clap is pending (waiting for quantization)
  static targetBeat = -1; // The beat boundary we're waiting for (quantized to displacement grid)
  static clapVisualCallback = null; // Callback for visual feedback

  /**
   * Set up clap instrument with player position for spatialization
   */
  static initialize() {
    // Set player position for spatialized clap sound
    this.clapInstrument.sourcePosition = gameState.player.position;
  }

  /**
   * Request a clap (will be quantized to displacement grid)
   */
  static requestClap() {
    if (!gameState.musicalClock) {
      console.warn('No musical clock initialized');
      return;
    }

    // If already pending, ignore
    if (this.pendingClap) {
      return;
    }

    // Get displacement from puzzle (fraction of whole note)
    const displacement = this.parseDisplacement(
      gameState.currentPuzzle?.clapDisplacement || DEFAULT_CLAP_DISPLACEMENT
    );

    // Convert to beat grid size (displacement * 4 = beats)
    const gridSizeInBeats = displacement * 4;

    // Capture target beat now (quantized to displacement grid)
    const currentBeat = gameState.musicalClock.getCurrentBeat();
    const gridPosition = currentBeat / gridSizeInBeats;
    const nextGridLine = Math.ceil(gridPosition);
    this.targetBeat = nextGridLine * gridSizeInBeats;

    // Mark clap as pending
    this.pendingClap = true;
  }

  /**
   * Update clap state (called every frame from game loop)
   * Handles quantization and execution of pending claps
   */
  static update() {
    if (!this.pendingClap || !gameState.musicalClock) {
      return;
    }

    const currentBeat = gameState.musicalClock.getCurrentBeat();

    // Check if we've reached the target beat boundary
    // Use small tolerance (1% of a 16th note = 0.0025 beats)
    if (currentBeat >= this.targetBeat - 0.0025) {
      this.executeClap();
      this.pendingClap = false;
    }
  }

  /**
   * Execute the clap (affects creatures, plays sound, triggers visual)
   * @private
   */
  static executeClap() {
    const { player, entities, currentPuzzle } = gameState;

    // Update clap instrument position
    this.clapInstrument.sourcePosition = player.position;

    // Play clap sound
    this.clapInstrument.clap();

    // Get default displacement from puzzle, or use system default
    const defaultDisplacement = this.parseDisplacement(
      currentPuzzle?.clapDisplacement || DEFAULT_CLAP_DISPLACEMENT
    );

    // Find creatures in clap range and apply displacement
    let affectedCount = 0;
    entities.forEach((entity) => {
      if (entity.type !== 'creature') return;

      const distance = getDistance(player.position, entity.position);
      if (distance <= CLAP_RANGE) {
        // Get displacement for this creature (creature override or puzzle default)
        const displacement = this.parseDisplacement(
          entity.data?.clapDisplacement ||
            currentPuzzle?.clapDisplacement ||
            DEFAULT_CLAP_DISPLACEMENT
        );

        // Tell creature to handle the clap
        if (entity.handleClap) {
          entity.handleClap(displacement);
          affectedCount++;
        }
      }
    });

    // Trigger visual feedback
    if (this.clapVisualCallback) {
      this.clapVisualCallback(player.position, CLAP_RANGE);
    }

    console.log(`Clap affected ${affectedCount} creature(s)`);
  }

  /**
   * Parse displacement from string format to beats
   * @param {string|number} displacement - Either a fraction string ("1/8") or number (0.125)
   * @returns {number} Displacement in beats
   */
  static parseDisplacement(displacement) {
    if (typeof displacement === 'number') {
      return displacement;
    }

    if (typeof displacement === 'string') {
      // Parse fraction format "1/8" -> 0.125
      const parts = displacement.split('/');
      if (parts.length === 2) {
        const numerator = parseFloat(parts[0]);
        const denominator = parseFloat(parts[1]);
        return numerator / denominator;
      }
    }

    console.warn(`Invalid displacement format: ${displacement}, using default`);
    return DEFAULT_CLAP_DISPLACEMENT;
  }

  /**
   * Set callback for visual feedback
   * @param {Function} callback - Function(position, range) to trigger visual
   */
  static setVisualCallback(callback) {
    this.clapVisualCallback = callback;
  }

  /**
   * Reset state (called when loading new puzzle)
   */
  static reset() {
    this.pendingClap = false;
    this.targetBeat = -1;
  }
}

export default ClapManager;
