import { Piano } from 'resound-sound';
import flashSlot from 'ui/slotFlash';
import { PLAYBACK_LATE_GRACE_BEATS } from 'core/constants';
import ListeningManager from 'core/ListeningManager';
import { getDistance } from 'core/utils';
import gameState from 'core/GameState';

// How far playback carries when a recording doesn't declare a source range
const DEFAULT_PLAYBACK_RANGE = 15;

/**
 * PlaybackManager - Handles playback of recorded songs from inventory
 */
class PlaybackManager {
  static playerInstrument = new Piano('player');
  static isPlaying = false;
  static playbackSourceRange = DEFAULT_PLAYBACK_RANGE;

  // Wall-clock window of the last player playback, so the UI can attribute
  // judgment failures (red slot flash) to the player's own performance and
  // not to ambient creature noise.
  static lastPlaybackStartMs = 0;
  static lastPlaybackEndMs = 0;

  // Set up note callback to emit to ListeningManager and track current note
  static {
    this.playerInstrument.noteCallback = (noteEvent) => {
      // Track current note for harmony analysis
      this.playerInstrument.currentNote = noteEvent;

      // Playback carries as far as the creature it was recorded from
      noteEvent.sourceRange = this.playbackSourceRange;

      // The player always sounds from their own area; neighbor areas hear
      // this only through the doorway model (ListeningManager seam routing)
      noteEvent.sourceArea = gameState.activeArea;

      // Emit to listening manager
      ListeningManager.emitNote(noteEvent);
    };
  }

  /**
   * Play the TAPE: every filled slot in order, concatenated into one song.
   *
   * Takes are stored dense (notes and chords with lengths, no gaps — see
   * RecordingManager.processCapturedNotes), so concatenation is seamless:
   * each take's notes follow the previous take's exactly on the musical
   * grid. One Space = one performance of the whole tape; every door whose
   * song occurs cleanly within it opens (matching ruled 2026-07-11).
   *
   * Starts on the beat grid, with a tempo-relative late grace (a press just
   * after a beat snaps back onto it). A Space during a playback is ignored
   * — one performance at a time.
   */
  static playTape() {
    const takes = gameState.player.inventory.filter((s) => s && s.data && s.data.length > 0);

    if (takes.length === 0) {
      flashSlot('silent'); // nothing to play — wordless
      return;
    }
    if (this.isPlaying) return; // one performance at a time

    const recording = {
      data: takes.flatMap((t) => t.data),
      tempo: takes[0].tempo,
      // The performance carries as far as the loudest take it contains
      sourceRange: Math.max(...takes.map((t) => t.sourceRange || DEFAULT_PLAYBACK_RANGE)),
    };

    // Solo start: beat grid, grace expressed in beats so it scales with tempo
    const { musicalClock } = gameState;
    let startDelay = 0;
    let noteOffset = 0;
    if (musicalClock) {
      const sinceMs = musicalClock.getTimeSinceLastBeat();
      const graceMs = musicalClock.beatsToMs(PLAYBACK_LATE_GRACE_BEATS);
      if (sinceMs < graceMs) {
        // Just past a beat — start immediately, snap subsequent notes back
        noteOffset = -sinceMs;
      } else {
        startDelay = musicalClock.getTimeUntilNextBeat();
      }
    }

    this.playerInstrument.sourcePosition = gameState.player.position;
    this.playbackSourceRange = recording.sourceRange;
    const quantizedData = this.injectOffsets(recording.data, noteOffset);
    this.playSong(quantizedData, recording.tempo, startDelay);
  }

  /**
   * Reset playback state (level change / reset).
   */
  static reset() {
    this.isPlaying = false;
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
    this.lastPlaybackStartMs = Date.now() + startDelay;

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
    const pos = { ...gameState.player.position };
    const range = this.playbackSourceRange;
    setTimeout(() => {
      this.isPlaying = false;
      this.lastPlaybackEndMs = Date.now();

      // Wordless miss feedback, silent-flavor only: if NO locked target was
      // even in range, nothing will ever judge this performance — dim-flash
      // the slot now. Heard-but-wrong is reported at JUDGMENT time by the
      // red slot flash (RecordingUI watches lastPhraseResult), never here.
      if (this.playerInstrument.playbackState.isPlaying) return;
      const anyListener = gameState.entities.some(
        (e) =>
          ((e.type === 'fountain' && !e.isActivated) || (e.type === 'gate' && !e.isOpen)) &&
          getDistance(e.position, pos) <= range
      );
      if (!anyListener && gameState.mode === 'PLAYING') flashSlot('silent');
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
