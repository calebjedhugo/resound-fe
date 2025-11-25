import { getFrequency } from '../lib/noteFrequencies';
import { getDuration } from '../lib/duration';
import audioContextManager from '../lib/AudioContextManager';
import { applyEnvelope } from '../lib/Envelope';

/**
 * Random instrument with randomized timbre
 * Generates interesting, tonal sounds with consistent timbre
 */
class Random {
  constructor() {
    this.context = audioContextManager.getContext();

    // Randomize timbre ONCE (stays constant for this instance)
    this.waveform = this.randomWaveform();
    this.filterCutoff = this.randomFilterCutoff();
    this.envelope = this.randomEnvelope();
    this.harmonics = this.randomHarmonics();
  }

  /**
   * Random waveform selection (weighted toward smoother sounds)
   */
  randomWaveform() {
    const waveforms = ['sine', 'sine', 'triangle', 'triangle', 'sawtooth', 'square'];
    return waveforms[Math.floor(Math.random() * waveforms.length)];
  }

  /**
   * Random filter cutoff (500-5000 Hz for brightness variation)
   */
  randomFilterCutoff() {
    return 500 + Math.random() * 4500;
  }

  /**
   * Random ADSR envelope
   */
  randomEnvelope() {
    return {
      attack: 0.01 + Math.random() * 0.09, // 10-100ms
      decay: 0.05 + Math.random() * 0.15, // 50-200ms
      sustain: 0.3 + Math.random() * 0.4, // 0.3-0.7
      release: 0.05 + Math.random() * 0.25, // 50-300ms
    };
  }

  /**
   * Random harmonics (1-3 overtones at low volume)
   */
  randomHarmonics() {
    const count = 1 + Math.floor(Math.random() * 3); // 1-3 harmonics
    const harmonics = [];
    for (let i = 0; i < count; i++) {
      harmonics.push({
        multiple: 2 + i, // 2x, 3x, 4x fundamental
        volume: 0.1 + Math.random() * 0.2, // 0.1-0.3
      });
    }
    return harmonics;
  }

  /**
   * Play sequence of notes/chords
   * @param {Object} params
   * @param {Array} params.data - Array of notes or chords
   * @param {number} params.tempo - BPM
   * @param {number} params.basis - Beat note (4 = quarter note)
   */
  async play({ data = [], tempo = 120, basis = 4 }) {
    for (const element of data) {
      if (Array.isArray(element)) {
        // CHORD: Play multiple notes simultaneously
        await this.playChord(element, tempo, basis);
      } else {
        // SINGLE NOTE: Play one note
        await this.playNote(element, tempo, basis);
      }
    }
  }

  /**
   * Play a single note
   */
  async playNote(note, tempo, basis) {
    const duration = getDuration(note.length, tempo, basis);

    // Check for REST
    if (!note.pitch || note.pitch === undefined || note.pitch === null) {
      await this.sleep(duration);
      return;
    }

    // Create and play note
    this.startNote(note.pitch, duration);
    await this.sleep(duration);
  }

  /**
   * Play multiple notes simultaneously (chord)
   * Waits for SHORTEST note, then continues (allows bass sustain)
   */
  async playChord(notes, tempo, basis) {
    const durations = notes.map((note) => getDuration(note.length, tempo, basis));
    const shortestDuration = Math.min(...durations);

    // Start all notes (they clean themselves up)
    notes.forEach((note, i) => {
      if (note.pitch && note.pitch !== undefined && note.pitch !== null) {
        this.startNote(note.pitch, durations[i]);
      }
    });

    // Wait for shortest note, then continue
    await this.sleep(shortestDuration);
  }

  /**
   * Start a note (creates oscillator + harmonics + filter + envelope)
   * Note cleans itself up after duration
   */
  startNote(pitch, duration) {
    const frequency = getFrequency(pitch);
    const currentTime = this.context.currentTime;

    // Create gain node for this note
    const gainNode = this.context.createGain();
    gainNode.connect(this.context.destination);

    // Apply ADSR envelope
    applyEnvelope(gainNode, currentTime, this.envelope, duration);

    // Create fundamental oscillator
    const oscillator = this.context.createOscillator();
    oscillator.type = this.waveform;
    oscillator.frequency.setValueAtTime(frequency, currentTime);

    // Optional: Add filter for brightness
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.filterCutoff, currentTime);
    oscillator.connect(filter);
    filter.connect(gainNode);

    // Start fundamental
    oscillator.start(currentTime);
    oscillator.stop(currentTime + duration / 1000);

    // Add harmonics for richness
    this.harmonics.forEach(({ multiple, volume }) => {
      const harmonic = this.context.createOscillator();
      harmonic.type = 'sine'; // Harmonics always sine
      harmonic.frequency.setValueAtTime(frequency * multiple, currentTime);

      const harmonicGain = this.context.createGain();
      harmonicGain.gain.setValueAtTime(volume, currentTime);

      harmonic.connect(harmonicGain);
      harmonicGain.connect(gainNode);

      harmonic.start(currentTime);
      harmonic.stop(currentTime + duration / 1000);
    });
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default Random;
