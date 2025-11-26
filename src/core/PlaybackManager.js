import Piano from 'audio/instruments/Piano';
import gameState from './GameState';

/**
 * PlaybackManager - Handles playback of recorded songs from inventory
 */
class PlaybackManager {
  static playerInstrument = new Piano('player');

  static isPlaying = false;

  /**
   * Play the song from the active inventory slot
   */
  static playActiveSlot() {
    const { activeSlot, inventory, position } = gameState.player;
    const recording = inventory[activeSlot];

    if (!recording || !recording.data) {
      console.warn('No recording in active slot');
      return;
    }

    if (this.isPlaying) {
      console.warn('Already playing a recording');
      return;
    }

    // Set player position for listening
    this.playerInstrument.sourcePosition = position;

    // Play the recorded song
    this.playSong(recording.data, recording.tempo);
  }

  /**
   * Play a song (array of notes/chords)
   * @param {Array} songData - Array of notes or chords
   * @param {number} tempo - Tempo in BPM
   */
  static playSong(songData, tempo) {
    if (songData.length === 0) {
      console.warn('Empty song data');
      return;
    }

    this.isPlaying = true;

    // Use the Instrument.play() method
    this.playerInstrument.play({
      data: songData,
      tempo,
      basis: 4,
    });

    // Calculate total duration to reset isPlaying flag
    const totalDuration = this.calculateSongDuration(songData, tempo);
    setTimeout(() => {
      this.isPlaying = false;
    }, totalDuration);
  }

  /**
   * Calculate total duration of a song in milliseconds
   * @param {Array} songData - Array of notes or chords
   * @param {number} tempo - Tempo in BPM
   * @returns {number} Duration in milliseconds
   */
  static calculateSongDuration(songData, tempo) {
    const msPerBeat = (60 / tempo) * 1000;
    let totalBeats = 0;

    songData.forEach((item) => {
      // Get length from first note (all notes in chord have same length)
      const length = Array.isArray(item) ? item[0].length : item.length;
      const beats = this.lengthToBeats(length);
      totalBeats += beats;
    });

    return totalBeats * msPerBeat;
  }

  /**
   * Convert note length string to beats
   * @param {string} length - Note length (e.g., "1/4", "1/2")
   * @returns {number} Number of quarter note beats
   */
  static lengthToBeats(length) {
    const [numerator, denominator] = length.split('/').map(Number);
    return numerator / (denominator / 4); // Convert to quarter note beats
  }

  /**
   * Check if playback is active
   * @returns {boolean}
   */
  static getIsPlaying() {
    return this.isPlaying;
  }

  /**
   * Get the player instrument (for volume updates based on distance)
   * @returns {Piano}
   */
  static getPlayerInstrument() {
    return this.playerInstrument;
  }
}

export default PlaybackManager;
