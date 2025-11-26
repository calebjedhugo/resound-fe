import { getFrequency } from '../lib/noteFrequencies';
import { applyEnvelope } from '../lib/Envelope';
import Instrument from './Instrument';

/**
 * Fountain instrument with magical, bell-like ethereal sound
 * Uses harmonic series, shimmer effect, and gentle envelope
 */
class Fountain extends Instrument {
  constructor(id = 'fountain', recordingCallback = null) {
    super(id, recordingCallback);

    // Ethereal envelope - gentle attack, long sustain, slow release
    this.envelope = {
      attack: 0.1, // Gentle, magical attack
      decay: 0.2, // Moderate decay
      sustain: 0.7, // High sustain for long, lingering notes
      release: 0.8, // Very slow release for magical fade
    };

    // Bell-like harmonic series (1x, 2x, 3x, 5x for bell tone)
    this.harmonics = [
      { multiple: 1, volume: 0.6 }, // Fundamental
      { multiple: 2, volume: 0.3 }, // Octave
      { multiple: 3, volume: 0.2 }, // Fifth above octave
      { multiple: 5, volume: 0.15 }, // Major third above two octaves
    ];

    // Detuning for shimmer effect (wider than piano for more sparkle)
    this.detune = [-12, -4, 4, 12]; // Four oscillators with shimmer
  }

  /**
   * Start a note with ethereal fountain tone
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

    // High-pass filter for sparkly, ethereal quality
    const filter = this.context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(200, currentTime); // Remove muddy lows
    filter.connect(envelopeGain);

    // Create bell-like harmonics with shimmer
    this.harmonics.forEach(({ multiple, volume }) => {
      this.detune.forEach((cents) => {
        const oscillator = this.context.createOscillator();
        oscillator.type = 'sine'; // Pure sine waves for clear, bell-like tone
        oscillator.frequency.setValueAtTime(frequency * multiple, currentTime);
        oscillator.detune.setValueAtTime(cents, currentTime);

        // Individual gain for this harmonic/detune combination
        const harmonicGain = this.context.createGain();
        harmonicGain.gain.setValueAtTime(volume / this.detune.length, currentTime);

        oscillator.connect(harmonicGain);
        harmonicGain.connect(filter);

        oscillator.start(currentTime);
        oscillator.stop(currentTime + duration / 1000);

        this.trackOscillator(oscillator, volumeGain, duration);
      });
    });
  }
}

export default Fountain;
