// Temporary basic Piano class - will be improved in Phase 2
// Based on resound-sound package

const noteFrequencies = {
  'C/4': 261.626,
  'C#/4': 277.18,
  'Db/4': 277.18,
  'D/4': 293.66,
  'D#/4': 311.13,
  'Eb/4': 311.13,
  'E/4': 329.63,
  'F/4': 349.23,
  'F#/4': 369.99,
  'G/4': 392,
  'Ab/4': 415.3,
  'A/4': 440,
  'Bb/4': 466.16,
  'B/4': 493.88,
  'C/5': 523.252,
};

const getDuration = (fraction = '1/4', tempo = 100, basis = 4) => {
  const [numerator, denominator] = fraction.split('/').map(Number);
  if (!numerator || !denominator) {
    throw new Error(`Invalid fraction format: ${fraction}`);
  }
  return ((numerator * basis) / denominator) * (60 / tempo) * 1000;
};

const getFrequency = (pitch) => {
  if (typeof pitch === 'number') return pitch;
  if (noteFrequencies[pitch]) return noteFrequencies[pitch];

  // Simple conversion for notes like C4, D4, etc.
  const match = pitch.match(/^([A-G][#b]?)(\d)$/);
  if (match) {
    const [, note, octave] = match;
    const key = `${note}/${octave}`;
    if (noteFrequencies[key]) return noteFrequencies[key];
  }

  console.warn(`Unknown pitch: ${pitch}, using A4`);
  return 440;
};

class Piano {
  constructor() {
    this.audioContext = null;
    this.initAudioContext();
  }

  initAudioContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContext();
  }

  async play({ data = [], tempo = 120, basis = 4 }) {
    if (!this.audioContext) {
      this.initAudioContext();
    }

    for (let i = 0; i < data.length; i++) {
      await new Promise((resolve) => {
        const { pitch = 'A4', length = '1/4' } = data[i];
        const duration = getDuration(length, tempo, basis);
        const frequency = getFrequency(pitch);

        // Create oscillator and gain node
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';

        // Simple envelope
        const now = this.audioContext.currentTime;
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.02); // Attack
        gainNode.gain.linearRampToValueAtTime(0.2, now + 0.05); // Decay
        gainNode.gain.linearRampToValueAtTime(0, now + duration / 1000); // Release

        oscillator.start(now);
        oscillator.stop(now + duration / 1000);

        setTimeout(resolve, duration);
      });
    }
  }
}

export default Piano;
