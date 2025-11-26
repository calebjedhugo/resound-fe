import ListeningManager from 'core/ListeningManager';
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

    // Recording callback for real-time capture
    this.recordingCallback = null;

    // Current volume multiplier (for distance-based volume)
    this.volumeMultiplier = 1.0;

    // Source position for spatial audio and listening
    this.sourcePosition = null;
  }

  /**
   * Play sequence of notes/chords
   * Supports pause/resume by tracking position
   * @param {Object} params
   * @param {Array} params.data - Array of notes or chords
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

    // Play through the data array
    for (let i = startIndex; i < data.length; i += 1) {
      // Check if we should stop (pause was called)
      if (this.playbackState.shouldStop) {
        this.playbackState.currentIndex = i; // Save position
        this.playbackState.isPlaying = false;
        this.playbackState.isPaused = true;
        this.playbackState.shouldStop = false;
        return;
      }

      const element = data[i];

      if (Array.isArray(element)) {
        // CHORD: Play multiple notes simultaneously
        await this.playChord(element, tempo, basis);
      } else {
        // SINGLE NOTE: Play one note
        await this.playNote(element, tempo, basis);
      }
    }

    // Finished playing - reset state
    this.playbackState.isPlaying = false;
    this.playbackState.isPaused = false;
    this.playbackState.currentIndex = 0;
    this.playbackState.currentData = null;
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

    const noteEvent = {
      pitch: note.pitch,
      length: note.length,
      timestamp: Date.now(),
      source: this.id,
      sourcePosition: this.sourcePosition,
    };

    // Emit to recording callback if recording
    if (this.recordingCallback) {
      this.recordingCallback(noteEvent);
    }

    // Emit to listening manager (for gates/fountains)
    ListeningManager.emitNote(noteEvent);

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

    // Emit notes to recording callback and listening manager
    notes.forEach((note) => {
      if (note.pitch && note.pitch !== undefined && note.pitch !== null) {
        const noteEvent = {
          pitch: note.pitch,
          length: note.length,
          timestamp: Date.now(),
          source: this.id,
          sourcePosition: this.sourcePosition,
        };

        // Emit to recording callback if recording
        if (this.recordingCallback) {
          this.recordingCallback(noteEvent);
        }

        // Emit to listening manager (for gates/fountains)
        ListeningManager.emitNote(noteEvent);
      }
    });

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
