import { quantizeToBeat, groupBy } from 'core/utils';

/**
 * ListeningManager - Global system for entities to listen to all sound sources
 * Gates and Fountains use this to capture notes from creatures and player
 */
class ListeningManager {
  static listeners = []; // Entities that are listening

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
    // Notify all listeners
    this.listeners.forEach((listener) => {
      if (listener.onNoteCaptured) {
        listener.onNoteCaptured(noteEvent);
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
