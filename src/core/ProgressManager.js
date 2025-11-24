class ProgressManager {
  static KEY = 'resound-progress';

  static load() {
    try {
      const data = localStorage.getItem(this.KEY);
      if (!data) {
        return { completedPuzzles: [] };
      }
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading progress:', error);
      return { completedPuzzles: [] };
    }
  }

  static save(progress) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(progress));
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  }

  static markComplete(puzzleId) {
    const progress = this.load();
    if (!progress.completedPuzzles.includes(puzzleId)) {
      progress.completedPuzzles.push(puzzleId);
      this.save(progress);
    }
  }

  static isComplete(puzzleId) {
    const progress = this.load();
    return progress.completedPuzzles.includes(puzzleId);
  }

  static reset() {
    localStorage.removeItem(this.KEY);
  }

  static getCompletedCount() {
    const progress = this.load();
    return progress.completedPuzzles.length;
  }
}

export default ProgressManager;
