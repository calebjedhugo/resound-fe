/**
 * Apply ADSR envelope to a gain node
 * @param {GainNode} gainNode - Web Audio gain node
 * @param {number} currentTime - Audio context current time
 * @param {Object} envelope - ADSR parameters
 * @param {number} envelope.attack - Attack time in seconds
 * @param {number} envelope.decay - Decay time in seconds
 * @param {number} envelope.sustain - Sustain level (0-1)
 * @param {number} envelope.release - Release time in seconds
 * @param {number} duration - Total note duration in milliseconds
 */
export function applyEnvelope(gainNode, currentTime, envelope, duration) {
  const { attack, decay, sustain, release } = envelope;
  const { gain } = gainNode;
  const durationSeconds = duration / 1000;

  // Start at 0
  gain.setValueAtTime(0, currentTime);

  // Attack: ramp up to peak (1.0)
  gain.linearRampToValueAtTime(1.0, currentTime + attack);

  // Decay: ramp down to sustain level
  gain.linearRampToValueAtTime(sustain, currentTime + attack + decay);

  // Hold sustain level until release
  const releaseStartTime = currentTime + durationSeconds - release;
  gain.setValueAtTime(sustain, releaseStartTime);

  // Release: ramp down to 0
  gain.linearRampToValueAtTime(0, currentTime + durationSeconds);
}
