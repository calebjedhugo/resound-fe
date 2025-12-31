import { applyEnvelope } from '../lib/Envelope';
import Instrument from './Instrument';

/**
 * Clap instrument - realistic hand clap sound
 * Uses filtered white noise with sharp envelope to simulate hands clapping
 */
class Clap extends Instrument {
  constructor(id = 'clap', recordingCallback = null) {
    super(id, recordingCallback);

    // Clap characteristics - very short, percussive
    this.envelope = {
      attack: 0.001, // Instant attack (impact)
      decay: 0.05, // Very fast decay
      sustain: 0.0, // No sustain
      release: 0.1, // Short release
    };

    // Create noise buffer for clap sound (reusable)
    this.noiseBuffer = this.createNoiseBuffer();
  }

  /**
   * Create a buffer of white noise
   * @returns {AudioBuffer}
   */
  createNoiseBuffer() {
    const bufferSize = this.context.sampleRate * 0.2; // 200ms of noise
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);

    // Fill with white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1; // Random values between -1 and 1
    }

    return buffer;
  }

  /**
   * Start a clap sound
   * Note: pitch parameter ignored for claps (always same sound)
   */
  startNote(pitch, duration = 200) {
    const { currentTime } = this.context;

    // Volume control (distance-based if spatialized)
    const volumeGain = this.context.createGain();
    volumeGain.gain.value = this.volumeMultiplier;
    volumeGain.connect(this.context.destination);

    // Envelope gain node (ADSR)
    const envelopeGain = this.context.createGain();
    envelopeGain.connect(volumeGain);

    // Apply very short envelope for percussive sound
    applyEnvelope(envelopeGain, currentTime, this.envelope, duration);

    // Create noise source from buffer
    const noise = this.context.createBufferSource();
    noise.buffer = this.noiseBuffer;

    // Bandpass filter 1: Emphasize high-mid frequencies (1-2 kHz)
    const bandpass1 = this.context.createBiquadFilter();
    bandpass1.type = 'bandpass';
    bandpass1.frequency.setValueAtTime(1500, currentTime);
    bandpass1.Q.setValueAtTime(1.5, currentTime);

    // Bandpass filter 2: Add some upper harmonics (2-4 kHz)
    const bandpass2 = this.context.createBiquadFilter();
    bandpass2.type = 'bandpass';
    bandpass2.frequency.setValueAtTime(3000, currentTime);
    bandpass2.Q.setValueAtTime(2.0, currentTime);

    // Highpass filter: Remove rumble/low frequencies
    const highpass = this.context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(500, currentTime);

    // Create two noise paths for richer sound
    // Path 1: Main clap body (1-2 kHz)
    const noise1Gain = this.context.createGain();
    noise1Gain.gain.value = 0.7;
    noise.connect(highpass);
    highpass.connect(bandpass1);
    bandpass1.connect(noise1Gain);
    noise1Gain.connect(envelopeGain);

    // Path 2: High frequency sparkle (2-4 kHz)
    const noise2Gain = this.context.createGain();
    noise2Gain.gain.value = 0.3;
    highpass.connect(bandpass2);
    bandpass2.connect(noise2Gain);
    noise2Gain.connect(envelopeGain);

    // Start and stop the noise
    noise.start(currentTime);
    noise.stop(currentTime + duration / 1000);

    // Track for cleanup
    this.trackOscillator(noise, volumeGain, duration);
  }

  /**
   * Play a clap at the current time
   * Convenience method since claps don't have pitch
   */
  clap() {
    this.startNote('C4', 200); // Pitch ignored, 200ms duration
  }
}

export default Clap;
