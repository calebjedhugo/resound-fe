import { getFrequency } from '../lib/noteFrequencies';
import { applyEnvelope } from '../lib/Envelope';
import Instrument from './Instrument';

/**
 * Random waveform selection (weighted toward smoother sounds)
 */
function generateRandomWaveform() {
  const waveforms = ['sine', 'sine', 'triangle', 'triangle', 'sawtooth', 'square'];
  return waveforms[Math.floor(Math.random() * waveforms.length)];
}

/**
 * Random filter cutoff (500-5000 Hz for brightness variation)
 */
function generateRandomFilterCutoff() {
  return 500 + Math.random() * 4500;
}

/**
 * Random ADSR envelope
 */
function generateRandomEnvelope() {
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
function generateRandomHarmonics() {
  const count = 1 + Math.floor(Math.random() * 3); // 1-3 harmonics
  const harmonics = [];
  for (let i = 0; i < count; i += 1) {
    harmonics.push({
      multiple: 2 + i, // 2x, 3x, 4x fundamental
      volume: 0.1 + Math.random() * 0.2, // 0.1-0.3
    });
  }
  return harmonics;
}

/**
 * Random instrument with randomized timbre
 * Generates interesting, tonal sounds with consistent timbre
 */
class Random extends Instrument {
  constructor() {
    super();

    // Randomize timbre ONCE (stays constant for this instance)
    this.waveform = generateRandomWaveform();
    this.filterCutoff = generateRandomFilterCutoff();
    this.envelope = generateRandomEnvelope();
    this.harmonics = generateRandomHarmonics();
  }

  /**
   * Start a note (creates oscillator + harmonics + filter + envelope)
   * Note cleans itself up after duration
   */
  startNote(pitch, duration) {
    const frequency = getFrequency(pitch);
    const { currentTime } = this.context;

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

    // Track this oscillator so it can be stopped during pause
    this.trackOscillator(oscillator, gainNode, duration);

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

      // Track harmonic oscillators too
      this.trackOscillator(harmonic, harmonicGain, duration);
    });
  }
}

export default Random;
