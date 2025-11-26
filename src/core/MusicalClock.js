/**
 * MusicalClock - Global musical time tracker
 * Tracks time in beats (quarter notes) for deterministic creature timing
 */
class MusicalClock {
  constructor(tempo) {
    this.tempo = tempo; // Beats per minute (BPM)
    this.currentBeat = 0; // Current position in beats (quarter notes)
    this.beatsPerSecond = tempo / 60;
  }

  /**
   * Update the musical clock
   * @param {number} deltaTime - Time elapsed in seconds
   */
  update(deltaTime) {
    this.currentBeat += deltaTime * this.beatsPerSecond;
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
}

export default MusicalClock;
