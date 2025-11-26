import Piano from 'audio/instruments/Piano';
import { PLAYBACK_BEAT_TOLERANCE } from './constants';
import ListeningManager from './ListeningManager';
import gameState from './GameState';

/**
 * PlaybackManager - Handles playback of recorded songs from inventory
 */
class PlaybackManager {
  static playerInstrument = new Piano('player');
  static isPlaying = false;

  // Set up note callback to emit to ListeningManager
  static {
    this.playerInstrument.noteCallback = (noteEvent) => {
      ListeningManager.emitNote(noteEvent);
    };
  }

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

    // Calculate quantized start timing
    const { musicalClock } = gameState;
    const timeSinceLastBeat = musicalClock.getTimeSinceLastBeat();

    let startDelay = 0;
    let noteOffset = 0;

    if (timeSinceLastBeat < PLAYBACK_BEAT_TOLERANCE) {
      // Within tolerance - start immediately, snap subsequent notes to grid
      startDelay = 0;
      noteOffset = -timeSinceLastBeat; // Negative offset to catch up to grid
    } else {
      // Outside tolerance - wait for next beat
      startDelay = musicalClock.getTimeUntilNextBeat();
      noteOffset = 0; // Already on grid after waiting
    }

    // Clone song data and inject offsets for quantization
    const quantizedData = this.injectOffsets(recording.data, noteOffset);

    // Play the recorded song with quantized timing
    this.playSong(quantizedData, recording.tempo, startDelay);
  }

  /**
   * Deep clone song data and inject offsets for beat quantization
   * @param {Array} songData - Original song data
   * @param {number} offset - Offset to apply to all notes after the first (in ms)
   * @returns {Array} Cloned song data with offsets
   */
  static injectOffsets(songData, offset) {
    return songData.map((element, index) => {
      // First note: no offset (plays immediately at natural time)
      // Other notes: apply offset to snap to grid
      const noteOffset = index === 0 ? 0 : offset;

      if (Array.isArray(element)) {
        // Chord - clone and add offset to each note
        return element.map((note) => ({
          ...note,
          offset: noteOffset,
        }));
      }
      // Single note - clone and add offset
      return {
        ...element,
        offset: noteOffset,
      };
    });
  }

  /**
   * Play a song (array of notes/chords)
   * @param {Array} songData - Array of notes or chords
   * @param {number} tempo - Tempo in BPM
   * @param {number} startDelay - Milliseconds to wait before starting (default 0)
   */
  static playSong(songData, tempo, startDelay = 0) {
    if (songData.length === 0) {
      console.warn('Empty song data');
      return;
    }

    this.isPlaying = true;

    // Wait for startDelay, then begin playback
    setTimeout(() => {
      // Play the song (offsets already injected into songData)
      this.playerInstrument.play({
        data: songData,
        tempo,
        basis: 4,
      });
    }, startDelay);

    // Calculate total duration to reset isPlaying flag
    const totalDuration = this.calculateSongDuration(songData, tempo);
    setTimeout(() => {
      this.isPlaying = false;
    }, startDelay + totalDuration);
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
