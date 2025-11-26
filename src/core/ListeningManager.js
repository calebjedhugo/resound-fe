import { quantizeToBeat, groupBy } from './utils';

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
   * Process captured notes into song format (quantize and group)
   * @param {Array} capturedNotes - Array of note events
   * @param {number} startTime - When listening started
   * @param {number} tempo - Tempo in BPM
   * @returns {Array} Processed song data
   */
  static processCapturedNotes(capturedNotes, startTime, tempo) {
    if (capturedNotes.length === 0) {
      return [];
    }

    // 1. Quantize each note to nearest 16th note beat
    const quantized = capturedNotes.map((note) => ({
      ...note,
      beat: quantizeToBeat(note.timestamp, startTime, tempo, 16),
    }));

    // 2. Group notes by beat (notes on same beat = chord)
    const grouped = groupBy(quantized, 'beat');

    // 3. Sort by beat
    const sortedBeats = Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b);

    // 4. Convert to song format
    const songData = [];
    sortedBeats.forEach((beat) => {
      const notesAtBeat = grouped[beat];

      if (notesAtBeat.length === 1) {
        // Single note
        songData.push({
          pitch: notesAtBeat[0].pitch,
          length: notesAtBeat[0].length,
        });
      } else {
        // Chord (multiple notes)
        songData.push(
          notesAtBeat.map((note) => ({
            pitch: note.pitch,
            length: note.length,
          }))
        );
      }
    });

    return songData;
  }

  /**
   * Clear all listeners
   */
  static clear() {
    this.listeners = [];
  }
}

export default ListeningManager;
