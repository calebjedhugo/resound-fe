import { quantizeToBeat, groupBy } from 'core/utils';
import gameState from 'core/GameState';

/**
 * ListeningManager - Global system for entities to listen to all sound sources
 * Gates and Fountains use this to capture notes from creatures and player
 *
 * Portal stage 3: listeners and sources are area-tagged (entity.area, note
 * event sourceArea). Same-area sound is delivered directly, exactly as
 * before. Sound crossing an area seam is delivered ONLY through the doorway
 * model: the seam router (installed by PortalManager) rewrites the event so
 * it appears to come from the door, with the source->partner-gate leg (plus
 * a leak penalty while the door is closed) carried as `extraDistance` —
 * listeners add it to their range checks. No router or no area info means
 * no seams exist (single-area world, unit tests): everything is one area.
 */
class ListeningManager {
  static listeners = []; // Entities that are listening

  // (noteEvent, sourceArea, listenerArea, listener) => transformed event |
  // null. Installed by PortalManager; null result = the areas share no
  // doorway (or the sound can't make the trip), so the listener hears
  // nothing. The listener rides along so a door face can hear through its
  // OWN pair with no leak (one door, two ears).
  static seamRouter = null;

  /**
   * Register an entity as a listener
   * @param {Object} entity - Entity with position, audibleRange, and onNoteCaptured callback
   */
  static registerListener(entity) {
    if (!this.listeners.includes(entity)) {
      this.listeners.push(entity);
    }
  }

  /**
   * Unregister an entity as a listener
   * @param {Object} entity - Entity to remove
   */
  static unregisterListener(entity) {
    this.listeners = this.listeners.filter((listener) => listener !== entity);
  }

  /**
   * Emit a note event (called by instruments when playing)
   * @param {Object} noteEvent - { pitch, length, timestamp, source, sourcePosition }
   */
  static emitNote(noteEvent) {
    const sourceArea = noteEvent.sourceArea || gameState.activeArea;
    this.listeners.forEach((listener) => {
      if (!listener.onNoteCaptured) return;

      const listenerArea = listener.area || gameState.activeArea;
      if (listenerArea === sourceArea || !this.seamRouter) {
        // Same area (or a world with no seams): direct delivery
        listener.onNoteCaptured(noteEvent);
        return;
      }

      // Listener-aware routing: a linked pair is ONE door with two ears, so
      // the router waives the leak (and the local leg) when the listener is
      // itself a face of the door the sound crosses.
      const throughDoor = this.seamRouter(noteEvent, sourceArea, listenerArea, listener);
      if (throughDoor) {
        listener.onNoteCaptured(throughDoor);
      }
    });
  }

  /**
   * Quantize captured notes to the 16th-note grid and group simultaneous
   * notes, keeping beat positions (needed for phrase segmentation).
   * @param {Array} capturedNotes - Array of note events
   * @param {number} startTime - When listening started
   * @param {number} tempo - Tempo in BPM
   * @returns {Array<{beat: number, notes: Array}>} sorted by beat
   */
  static groupNotesByBeat(capturedNotes, startTime, tempo) {
    if (capturedNotes.length === 0) return [];

    const quantized = capturedNotes.map((note) => ({
      ...note,
      beat: quantizeToBeat(note.timestamp, startTime, tempo, 16),
    }));
    const grouped = groupBy(quantized, 'beat');
    return Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b)
      .map((beat) => ({ beat, notes: grouped[beat] }));
  }

  /**
   * Process captured notes into song format (quantize and group)
   * @param {Array} capturedNotes - Array of note events
   * @param {number} startTime - When listening started
   * @param {number} tempo - Tempo in BPM
   * @returns {Array} Processed song data
   */
  static processCapturedNotes(capturedNotes, startTime, tempo) {
    return this.groupNotesByBeat(capturedNotes, startTime, tempo).map(({ notes }) => {
      if (notes.length === 1) {
        return { pitch: notes[0].pitch, length: notes[0].length };
      }
      return notes.map((note) => ({ pitch: note.pitch, length: note.length }));
    });
  }

  /**
   * Clear all listeners
   */
  static clear() {
    this.listeners = [];
  }
}

export default ListeningManager;
