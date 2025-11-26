import { getDuration } from '../lib/duration';
import audioContextManager from '../lib/AudioContextManager';

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Base class for all instruments
 * Handles playback state, pause/resume, and oscillator tracking
 */
class Instrument {
  constructor(id = null) {
    this.id = id; // Identifier for this instrument (e.g., creature ID)
    this.context = audioContextManager.getContext();

    // Track all active oscillators so we can stop them
    this.activeOscillators = new Set();

    // Playback state for pause/resume functionality
    this.playbackState = {
      isPlaying: false,
      isPaused: false,
      shouldStop: false, // Flag to interrupt play loop
      currentData: null, // Song data array
      currentIndex: 0, // Which note/chord we're on
      tempo: 120,
      basis: 4,
    };

    // Note callback for real-time note events (recording, listening, etc.)
    this.noteCallback = null;

    // Current volume multiplier (for distance-based volume)
    this.volumeMultiplier = 1.0;

    // Source position for spatial audio and listening
    this.sourcePosition = null;
  }

  /**
   * Play sequence of notes/chords
   * Supports pause/resume by tracking position
   * Supports optional offset property on notes for timing adjustments
   * @param {Object} params
   * @param {Array} params.data - Array of notes or chords (each can have optional offset in ms)
   * @param {number} params.tempo - BPM
   * @param {number} params.basis - Beat note (4 = quarter note)
   */
  async play({ data = [], tempo = 120, basis = 4 }) {
    // If already playing, ignore
    if (this.playbackState.isPlaying) return;

    // Store playback parameters
    this.playbackState.currentData = data;
    this.playbackState.tempo = tempo;
    this.playbackState.basis = basis;
    this.playbackState.isPlaying = true;
    this.playbackState.isPaused = false;
    this.playbackState.shouldStop = false;

    // Start from beginning (or resume from saved position if resuming)
    const startIndex = this.playbackState.currentIndex;

    // Pre-compute play schedule based on offsets
    const playSchedule = [];
    let naturalTime = 0; // Natural position based on cumulative durations

    for (let i = 0; i < data.length; i += 1) {
      const element = data[i];
      const offset = this.getElementOffset(element);
      const duration = this.getElementDuration(element, tempo, basis);

      playSchedule.push({
        element,
        playTime: naturalTime + offset, // Actual play time = natural + offset
        duration,
      });

      naturalTime += duration; // Advance natural time by duration
    }

    // Execute play schedule
    let elapsedTime = 0;

    for (let i = startIndex; i < playSchedule.length; i += 1) {
      // Check if we should stop (pause was called)
      if (this.playbackState.shouldStop) {
        this.playbackState.currentIndex = i; // Save position
        this.playbackState.isPlaying = false;
        this.playbackState.isPaused = true;
        this.playbackState.shouldStop = false;
        return;
      }

      const { element, playTime } = playSchedule[i];

      // Sleep until it's time to play this note
      const waitTime = playTime - elapsedTime;
      if (waitTime > 0) {
        await sleep(waitTime);
      }

      // Update elapsed time to scheduled play time
      elapsedTime = playTime;

      // Play the note/chord (without sleeping)
      if (Array.isArray(element)) {
        // CHORD: Play multiple notes simultaneously
        this.playChordImmediate(element, tempo, basis);
      } else {
        // SINGLE NOTE: Play one note
        this.playNoteImmediate(element, tempo, basis);
      }
    }

    // Finished playing - reset state
    this.playbackState.isPlaying = false;
    this.playbackState.isPaused = false;
    this.playbackState.currentIndex = 0;
    this.playbackState.currentData = null;
  }

  /**
   * Get offset from a note or chord element
   * @param {Object|Array} element - Note or chord
   * @returns {number} Offset in milliseconds
   */
  // eslint-disable-next-line class-methods-use-this
  getElementOffset(element) {
    if (Array.isArray(element)) {
      // Chord - use offset from first note
      return element[0]?.offset || 0;
    }
    // Single note
    return element.offset || 0;
  }

  /**
   * Get duration of a note or chord element
   * @param {Object|Array} element - Note or chord
   * @param {number} tempo - BPM
   * @param {number} basis - Beat note
   * @returns {number} Duration in milliseconds
   */
  // eslint-disable-next-line class-methods-use-this
  getElementDuration(element, tempo, basis) {
    if (Array.isArray(element)) {
      // Chord - return shortest duration
      const durations = element.map((note) => getDuration(note.length, tempo, basis));
      return Math.min(...durations);
    }
    // Single note
    return getDuration(element.length, tempo, basis);
  }

  /**
   * Play a single note immediately (without sleeping)
   * @param {Object} note - Note data
   * @param {number} tempo - BPM
   * @param {number} basis - Beat note (4 = quarter note)
   */
  playNoteImmediate(note, tempo, basis) {
    const duration = getDuration(note.length, tempo, basis);

    // Check for REST
    if (!note.pitch || note.pitch === undefined || note.pitch === null) {
      return;
    }

    // Emit note event to callback (for recording, listening, etc.)
    if (this.noteCallback) {
      const noteEvent = {
        pitch: note.pitch,
        length: note.length,
        timestamp: Date.now(),
        source: this.id,
        sourcePosition: this.sourcePosition,
      };
      this.noteCallback(noteEvent);
    }

    // Create and play note (Web Audio schedules it)
    this.startNote(note.pitch, duration);
  }

  /**
   * Play multiple notes simultaneously (chord) immediately (without sleeping)
   * @param {Array} notes - Array of note objects
   * @param {number} tempo - BPM
   * @param {number} basis - Beat note (4 = quarter note)
   */
  playChordImmediate(notes, tempo, basis) {
    const durations = notes.map((note) => getDuration(note.length, tempo, basis));

    // Emit note events to callback (for recording, listening, etc.)
    if (this.noteCallback) {
      notes.forEach((note) => {
        if (note.pitch && note.pitch !== undefined && note.pitch !== null) {
          const noteEvent = {
            pitch: note.pitch,
            length: note.length,
            timestamp: Date.now(),
            source: this.id,
            sourcePosition: this.sourcePosition,
          };
          this.noteCallback(noteEvent);
        }
      });
    }

    // Start all notes (Web Audio schedules them)
    notes.forEach((note, i) => {
      if (note.pitch && note.pitch !== undefined && note.pitch !== null) {
        this.startNote(note.pitch, durations[i]);
      }
    });
  }

  /**
   * Pause playback
   * Stops after current note finishes, saves position
   */
  pause() {
    if (!this.playbackState.isPlaying) return;

    // Set flag to stop play loop
    this.playbackState.shouldStop = true;

    // Fade out all active oscillators quickly
    this.stopAll(0.05); // 50ms fade
  }

  /**
   * Resume playback from paused position
   */
  async resume() {
    if (!this.playbackState.isPaused) return;

    // Continue playing from saved position
    await this.play({
      data: this.playbackState.currentData,
      tempo: this.playbackState.tempo,
      basis: this.playbackState.basis,
    });
  }

  /**
   * Stop playback completely and reset
   */
  stop() {
    this.playbackState.shouldStop = true;
    this.playbackState.isPlaying = false;
    this.playbackState.isPaused = false;
    this.playbackState.currentIndex = 0;
    this.playbackState.currentData = null;

    // Stop all oscillators with quick fade
    this.stopAll(0.05);
  }

  /**
   * Emergency stop all active oscillators
   * @param {number} fadeTime - Fade out time in seconds (default 0.01)
   */
  stopAll(fadeTime = 0.01) {
    const { currentTime } = this.context;

    this.activeOscillators.forEach((oscillatorData) => {
      const { oscillator, gainNode } = oscillatorData;

      try {
        // Fade out to prevent clicks
        gainNode.gain.cancelScheduledValues(currentTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime);
        gainNode.gain.linearRampToValueAtTime(0, currentTime + fadeTime);

        // Stop oscillator after fade
        oscillator.stop(currentTime + fadeTime);
      } catch (e) {
        // Oscillator might already be stopped
      }
    });

    // Clear the set
    this.activeOscillators.clear();
  }

  /**
   * Play a single note
   */
  async playNote(note, tempo, basis) {
    const duration = getDuration(note.length, tempo, basis);

    // Check for REST
    if (!note.pitch || note.pitch === undefined || note.pitch === null) {
      await sleep(duration);
      return;
    }

    // Emit note event to callback (for recording, listening, etc.)
    if (this.noteCallback) {
      const noteEvent = {
        pitch: note.pitch,
        length: note.length,
        timestamp: Date.now(),
        source: this.id,
        sourcePosition: this.sourcePosition,
      };
      this.noteCallback(noteEvent);
    }

    // Create and play note
    this.startNote(note.pitch, duration);
    await sleep(duration);
  }

  /**
   * Play multiple notes simultaneously (chord)
   * Waits for SHORTEST note, then continues (allows bass sustain)
   */
  async playChord(notes, tempo, basis) {
    const durations = notes.map((note) => getDuration(note.length, tempo, basis));
    const shortestDuration = Math.min(...durations);

    // Emit note events to callback (for recording, listening, etc.)
    if (this.noteCallback) {
      notes.forEach((note) => {
        if (note.pitch && note.pitch !== undefined && note.pitch !== null) {
          const noteEvent = {
            pitch: note.pitch,
            length: note.length,
            timestamp: Date.now(),
            source: this.id,
            sourcePosition: this.sourcePosition,
          };
          this.noteCallback(noteEvent);
        }
      });
    }

    // Start all notes (they clean themselves up)
    notes.forEach((note, i) => {
      if (note.pitch && note.pitch !== undefined && note.pitch !== null) {
        this.startNote(note.pitch, durations[i]);
      }
    });

    // Wait for shortest note, then continue
    await sleep(shortestDuration);
  }

  /**
   * Update volume for all active oscillators (for distance-based volume)
   * Call this every frame from creature update()
   * @param {number} volumeMultiplier - Volume multiplier (0.0 to 1.0)
   */
  updateVolume(volumeMultiplier) {
    this.volumeMultiplier = volumeMultiplier;

    const { currentTime } = this.context;

    this.activeOscillators.forEach((oscillatorData) => {
      const { gainNode } = oscillatorData;

      try {
        // Smooth ramp to prevent clicks (10ms transition)
        gainNode.gain.setTargetAtTime(volumeMultiplier, currentTime, 0.01);
      } catch (e) {
        // Gain node might be disconnected
      }
    });
  }

  /**
   * Start a note (creates oscillator with instrument's timbre)
   * MUST be implemented by subclass
   * @param {string|number} pitch - Note pitch (e.g., 'C4') or frequency
   * @param {number} duration - Duration in milliseconds
   */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  startNote(pitch, duration) {
    throw new Error('startNote() must be implemented by subclass');
  }

  /**
   * Helper to track an oscillator so it can be stopped later
   * Call this from subclass startNote() implementation
   * @param {OscillatorNode} oscillator
   * @param {GainNode} gainNode
   * @param {number} duration - Duration in milliseconds
   */
  trackOscillator(oscillator, gainNode, duration) {
    const oscillatorData = { oscillator, gainNode };

    // Add to active set
    this.activeOscillators.add(oscillatorData);

    // Auto-remove after duration
    setTimeout(() => {
      this.activeOscillators.delete(oscillatorData);
    }, duration);
  }
}

export default Instrument;
