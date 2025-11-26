import audioContextManager from 'audio/lib/AudioContextManager';

// Metronome volume (0.0 to 1.0)
const METRONOME_VOLUME = 0.5;

/**
 * Metronome - Plays a click on every beat for debugging timing
 */
class Metronome {
  constructor() {
    this.context = audioContextManager.getContext();
    this.lastBeatClicked = -1;
    this.enabled = true;
  }

  /**
   * Update metronome - play click on beat boundaries
   * @param {number} currentBeat - Current beat from musical clock
   */
  update(currentBeat) {
    if (!this.enabled) return;

    const currentBeatFloor = Math.floor(currentBeat);

    // Check if we've crossed a beat boundary
    if (currentBeatFloor > this.lastBeatClicked) {
      this.click();
      this.lastBeatClicked = currentBeatFloor;
    }
  }

  /**
   * Play a click sound
   */
  click() {
    const { currentTime } = this.context;

    // Create oscillator for click
    const oscillator = this.context.createOscillator();
    const gainNode = this.context.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.context.destination);

    // High-pitched short click
    oscillator.frequency.value = 1000; // 1kHz
    gainNode.gain.value = METRONOME_VOLUME;

    // Very short envelope
    gainNode.gain.setValueAtTime(METRONOME_VOLUME, currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.05);

    oscillator.start(currentTime);
    oscillator.stop(currentTime + 0.05);
  }

  /**
   * Toggle metronome on/off
   */
  toggle() {
    this.enabled = !this.enabled;
  }

  /**
   * Enable metronome
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable metronome
   */
  disable() {
    this.enabled = false;
  }

  /**
   * Reset metronome state
   */
  reset() {
    this.lastBeatClicked = -1;
  }
}

export default Metronome;
