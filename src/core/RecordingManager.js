import gameState from './GameState';
import { quantizeToBeat, groupBy } from './utils';

/**
 * RecordingManager - Handles real-time recording of creature songs
 */
class RecordingManager {
  /**
   * Start recording from all creatures in range
   */
  static startRecording() {
    const { creaturesInRange } = gameState.recording;

    if (creaturesInRange.length === 0) {
      console.warn('No creatures in recording range');
      return;
    }

    // Set recording state
    gameState.recording.isRecording = true;
    gameState.recording.startTime = Date.now();
    gameState.recording.capturedNotes = [];

    // Attach recording callbacks to all creatures in range
    creaturesInRange.forEach((creature) => {
      creature.instrument.recordingCallback = (note) => {
        gameState.recording.capturedNotes.push(note);
      };
    });
  }

  /**
   * Stop recording and process captured notes
   * Stores result in active inventory slot
   */
  static stopRecording() {
    if (!gameState.recording.isRecording) return;

    // Clear recording callbacks
    const { creaturesInRange } = gameState.recording;
    creaturesInRange.forEach((creature) => {
      creature.instrument.recordingCallback = null;
    });

    // Process captured notes
    const processedData = this.processCapturedNotes();

    // Store in active inventory slot (overwrite if occupied)
    const { activeSlot } = gameState.player;
    gameState.player.inventory[activeSlot] = {
      id: `recording_${Date.now()}`,
      data: processedData,
      recordedAt: Date.now(),
      tempo: gameState.musicalClock.tempo,
    };

    // Reset recording state
    gameState.recording.isRecording = false;
    gameState.recording.startTime = null;
    gameState.recording.capturedNotes = [];
  }

  /**
   * Process captured notes: quantize, group by beat, merge into chords
   * @returns {Array} Processed song data
   */
  static processCapturedNotes() {
    const { capturedNotes, startTime } = gameState.recording;
    const tempo = gameState.musicalClock.tempo;

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
   * Check if recording is active
   * @returns {boolean}
   */
  static isRecording() {
    return gameState.recording.isRecording;
  }

  /**
   * Get count of creatures in recording range
   * @returns {number}
   */
  static getCreaturesInRangeCount() {
    return gameState.recording.creaturesInRange.length;
  }
}

export default RecordingManager;
