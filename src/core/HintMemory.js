/**
 * HintMemory - remembers which contextual key hints the player has retired.
 *
 * A hint retires the first time the player performs its action; retirement is
 * permanent across sessions (the world taught you once). Resetting progress
 * should also reset hints so a fresh player gets the full onboarding.
 */
class HintMemory {
  static KEY = 'resound-hints';

  static load() {
    try {
      const data = localStorage.getItem(this.KEY);
      if (!data) {
        return { retired: [] };
      }
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading hint memory:', error);
      return { retired: [] };
    }
  }

  static save(memory) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(memory));
    } catch (error) {
      console.error('Error saving hint memory:', error);
    }
  }

  static isRetired(hintId) {
    return this.load().retired.includes(hintId);
  }

  static retire(hintId) {
    const memory = this.load();
    if (!memory.retired.includes(hintId)) {
      memory.retired.push(hintId);
      this.save(memory);
    }
  }

  static reset() {
    localStorage.removeItem(this.KEY);
  }
}

export default HintMemory;
