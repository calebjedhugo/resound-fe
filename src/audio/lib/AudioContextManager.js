/**
 * Singleton Web Audio Context manager
 * Handles browser compatibility and audio unlocking
 */
class AudioContextManager {
  constructor() {
    this.context = null;
    this.unlocked = false;
  }

  getContext() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContext();
      this.unlockAudio();
    }
    return this.context;
  }

  unlockAudio() {
    if (this.unlocked) return;

    // Create silent buffer to unlock audio on iOS/Safari
    const buffer = this.context.createBuffer(1, 1, 22050);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    source.start(0);

    this.unlocked = true;
  }

  getCurrentTime() {
    return this.getContext().currentTime;
  }
}

// Export singleton instance
const audioContextManager = new AudioContextManager();
export default audioContextManager;
