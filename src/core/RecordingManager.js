import showToast from 'ui/Toast';
import gameState from 'core/GameState';
import { quantizeToBeat, groupBy } from 'core/utils';

// Throttle the out-of-range warning (key repeat fires startRecording rapidly)
let lastRangeWarning = 0;

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
      const now = Date.now();
      if (now - lastRangeWarning > 2500) {
        lastRangeWarning = now;
        showToast('No creature close enough to record — move closer and press R', {
          type: 'error',
          duration: 3000,
        });
      }
      return;
    }

    // Set recording state
    gameState.recording.isRecording = true;
    gameState.recording.startTime = Date.now();
    gameState.recording.capturedNotes = [];
    // A recording carries as far as the loudest creature it was taken from
    gameState.recording.sourceRange = Math.max(
      ...creaturesInRange.map((creature) => creature.audibleRange || 0)
    );

    // Attach recording callbacks to all creatures in range, remembering
    // exactly which creatures we wrapped: stopRecording must restore THIS
    // list, not whoever is in range by then — a creature that wandered out
    // mid-recording would otherwise keep its wrapper forever, silently
    // feeding stale notes into every later recording.
    // NOTE: recording captures exactly what sounds between R-press and
    // R-release — starting and stopping at the right musical moment is part
    // of the puzzle (deliberately no auto-trim/auto-stop).
    this._wrappedCreatures = [...creaturesInRange];
    this._wrappedCreatures.forEach((creature) => {
      // Already wrapped (defensive: never stack wrappers)
      if (creature.instrument.savedNoteCallback) return;

      // Store original callback
      creature.instrument.savedNoteCallback = creature.instrument.noteCallback;

      // Chain our recording with the original callback
      creature.instrument.noteCallback = (note) => {
        // Capture for recording
        gameState.recording.capturedNotes.push(note);
        // Also call original callback (for ListeningManager)
        if (creature.instrument.savedNoteCallback) {
          creature.instrument.savedNoteCallback(note);
        }
      };
    });
  }

  /**
   * Stop recording and process captured notes
   * Stores result in active inventory slot
   */
  static stopRecording() {
    if (!gameState.recording.isRecording) return;

    // Restore original callbacks on the creatures we actually wrapped
    // (NOT the live in-range list — see startRecording)
    (this._wrappedCreatures || []).forEach((creature) => {
      if (!creature.instrument.savedNoteCallback) return;
      creature.instrument.noteCallback = creature.instrument.savedNoteCallback;
      delete creature.instrument.savedNoteCallback;
    });
    this._wrappedCreatures = [];

    // Process captured notes
    const processedData = this.processCapturedNotes();
    const { activeSlot } = gameState.player;

    if (processedData.length === 0) {
      // Keep whatever was in the slot rather than overwriting it with silence
      showToast('Nothing captured — record while the creature is singing', {
        type: 'error',
        duration: 4000,
      });
    } else {
      // Store in active inventory slot (overwrite if occupied)
      gameState.player.inventory[activeSlot] = {
        id: `recording_${Date.now()}`,
        data: processedData,
        recordedAt: Date.now(),
        tempo: gameState.musicalClock.tempo,
        sourceRange: gameState.recording.sourceRange,
      };
      showToast(`Recorded ${processedData.length} notes into slot ${activeSlot + 1}`, {
        type: 'success',
        duration: 3500,
      });
    }

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
    const { tempo } = gameState.musicalClock;

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
