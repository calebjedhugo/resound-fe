import audioContextManager from './AudioContextManager';

// Metronome volume (0.0 to 1.0)
const METRONOME_VOLUME = 0.5;

/**
 * MusicalClock - Global musical time tracker with optional metronome
 * Tracks time in beats (quarter notes) for deterministic timing
 */
class MusicalClock {
  constructor(tempo) {
    this.tempo = tempo; // Beats per minute (BPM)
    this.currentBeat = 0; // Current position in beats (quarter notes)
    this.beatsPerSecond = tempo / 60;

    // Built-in metronome (off by default)
    this.metronomeEnabled = false;
    this.lastBeatClicked = -1;
    this.context = audioContextManager.getContext();
  }

  /**
   * Update the musical clock and metronome
   * @param {number} deltaTime - Time elapsed in seconds
   */
  update(deltaTime) {
    this.currentBeat += deltaTime * this.beatsPerSecond;

    // Handle metronome clicks
    if (this.metronomeEnabled) {
      const currentBeatFloor = Math.floor(this.currentBeat);
      if (currentBeatFloor > this.lastBeatClicked) {
        this.playMetronomeClick();
        this.lastBeatClicked = currentBeatFloor;
      }
    }
  }

  /**
   * Set a new tempo
   * @param {number} tempo - New tempo in BPM
   */
  setTempo(tempo) {
    this.tempo = tempo;
    this.beatsPerSecond = tempo / 60;
  }

  /**
   * Reset the clock to beat 0
   */
  reset() {
    this.currentBeat = 0;
    this.lastBeatClicked = -1;
  }

  /**
   * Get the current beat
   * @returns {number} Current beat (quarter notes)
   */
  getCurrentBeat() {
    return this.currentBeat;
  }

  /**
   * Convert beats to milliseconds based on current tempo
   * @param {number} beats - Number of beats
   * @returns {number} Milliseconds
   */
  beatsToMs(beats) {
    return (beats / this.beatsPerSecond) * 1000;
  }

  /**
   * Convert milliseconds to beats based on current tempo
   * @param {number} ms - Milliseconds
   * @returns {number} Number of beats
   */
  msToBeats(ms) {
    return (ms / 1000) * this.beatsPerSecond;
  }

  /**
   * Get time since the last beat in milliseconds
   * @returns {number} Milliseconds since last beat
   */
  getTimeSinceLastBeat() {
    const fractionalBeat = this.currentBeat % 1;
    const msPerBeat = (60 / this.tempo) * 1000;
    return fractionalBeat * msPerBeat;
  }

  /**
   * Get time until the next beat in milliseconds
   * @returns {number} Milliseconds until next beat
   */
  getTimeUntilNextBeat() {
    const fractionalBeat = this.currentBeat % 1;
    const msPerBeat = (60 / this.tempo) * 1000;
    return (1 - fractionalBeat) * msPerBeat;
  }

  /**
   * Toggle metronome on/off
   */
  toggleMetronome() {
    this.metronomeEnabled = !this.metronomeEnabled;
  }

  /**
   * Enable metronome
   */
  enableMetronome() {
    this.metronomeEnabled = true;
  }

  /**
   * Disable metronome
   */
  disableMetronome() {
    this.metronomeEnabled = false;
  }

  /**
   * Play a metronome click sound
   * @private
   */
  playMetronomeClick() {
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
}

export default MusicalClock;
