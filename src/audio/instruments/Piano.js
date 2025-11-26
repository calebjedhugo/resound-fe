import { getFrequency } from '../lib/noteFrequencies';
import { applyEnvelope } from '../lib/Envelope';
import Instrument from './Instrument';

/**
 * Piano instrument with rich, realistic tone
 * Uses multiple detuned oscillators, harmonics, and piano-like envelope
 */
class Piano extends Instrument {
  constructor(id = 'piano', recordingCallback = null) {
    super(id, recordingCallback);

    // Piano characteristics
    this.envelope = {
      attack: 0.002, // Very fast attack (hammer strike)
      decay: 0.15, // Moderate decay
      sustain: 0.3, // Lower sustain (piano naturally decays)
      release: 0.2, // Gentle release
    };

    // Harmonics for warmth (octave, fifth, and higher overtones)
    this.harmonics = [
      { multiple: 2, volume: 0.15 }, // Octave
      { multiple: 3, volume: 0.1 }, // Fifth
      { multiple: 4, volume: 0.05 }, // Two octaves
      { multiple: 5, volume: 0.03 }, // Major third above two octaves
    ];

    // Detuning for chorus effect (in cents)
    this.detune = [-8, 0, 8]; // Three oscillators slightly detuned
  }

  /**
   * Start a note with rich piano tone
   */
  startNote(pitch, duration) {
    const frequency = getFrequency(pitch);
    const { currentTime } = this.context;

    // Volume control (distance-based)
    const volumeGain = this.context.createGain();
    volumeGain.gain.value = this.volumeMultiplier;
    volumeGain.connect(this.context.destination);

    // Envelope gain node (ADSR)
    const envelopeGain = this.context.createGain();
    envelopeGain.connect(volumeGain);

    // Apply ADSR envelope
    applyEnvelope(envelopeGain, currentTime, this.envelope, duration);

    // Lowpass filter for warmth
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, currentTime); // Softer, warmer tone
    filter.connect(envelopeGain);

    // Create multiple detuned oscillators (chorus effect)
    this.detune.forEach((cents) => {
      const oscillator = this.context.createOscillator();
      oscillator.type = 'triangle'; // Triangle wave for piano-like tone
      oscillator.frequency.setValueAtTime(frequency, currentTime);
      oscillator.detune.setValueAtTime(cents, currentTime);

      // Slight pitch envelope for hammer strike realism
      const pitchBend = 5; // cents
      oscillator.detune.setValueAtTime(cents + pitchBend, currentTime);
      oscillator.detune.linearRampToValueAtTime(cents, currentTime + 0.05);

      oscillator.connect(filter);
      oscillator.start(currentTime);
      oscillator.stop(currentTime + duration / 1000);

      this.trackOscillator(oscillator, volumeGain, duration);
    });

    // Add harmonics for richness
    this.harmonics.forEach(({ multiple, volume }) => {
      const harmonic = this.context.createOscillator();
      harmonic.type = 'sine'; // Pure sine waves for harmonics
      harmonic.frequency.setValueAtTime(frequency * multiple, currentTime);

      const harmonicGain = this.context.createGain();
      harmonicGain.gain.setValueAtTime(volume, currentTime);

      harmonic.connect(harmonicGain);
      harmonicGain.connect(filter);

      harmonic.start(currentTime);
      harmonic.stop(currentTime + duration / 1000);

      this.trackOscillator(harmonic, volumeGain, duration);
    });
  }
}

export default Piano;
