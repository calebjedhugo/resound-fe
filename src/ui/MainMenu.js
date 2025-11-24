import Menu from './Menu';

class MainMenu extends Menu {
  constructor(puzzles, onSelectPuzzle, progressManager) {
    super('main-menu');
    this.puzzles = puzzles;
    this.onSelectPuzzle = onSelectPuzzle;
    this.progressManager = progressManager;
  }

  render() {
    this.clear();

    // Title
    const title = document.createElement('h1');
    title.className = 'menu-title';
    title.textContent = 'Resound';
    this.element.appendChild(title);

    // Subtitle
    const subtitle = document.createElement('p');
    subtitle.className = 'menu-subtitle';
    subtitle.textContent = 'A Musical Puzzle Game';
    this.element.appendChild(subtitle);

    // Puzzle list container
    const puzzleContainer = document.createElement('div');
    puzzleContainer.className = 'puzzle-container';

    // Group puzzles by difficulty
    const difficultyLabels = {
      1: 'Easy',
      2: 'Medium',
      3: 'Hard',
    };

    const groupedPuzzles = {};
    this.puzzles.forEach((puzzle) => {
      const diff = puzzle.difficulty;
      if (!groupedPuzzles[diff]) {
        groupedPuzzles[diff] = [];
      }
      groupedPuzzles[diff].push(puzzle);
    });

    // Render each difficulty group
    [1, 2, 3].forEach((difficulty) => {
      const puzzles = groupedPuzzles[difficulty];
      if (!puzzles || puzzles.length === 0) return;

      const difficultySection = document.createElement('div');
      difficultySection.className = 'difficulty-section';

      const difficultyHeader = document.createElement('h2');
      difficultyHeader.className = 'difficulty-header';
      difficultyHeader.textContent = difficultyLabels[difficulty];
      difficultySection.appendChild(difficultyHeader);

      puzzles.forEach((puzzle) => {
        const puzzleItem = this.createPuzzleItem(puzzle);
        difficultySection.appendChild(puzzleItem);
      });

      puzzleContainer.appendChild(difficultySection);
    });

    this.element.appendChild(puzzleContainer);
  }

  createPuzzleItem(puzzle) {
    const item = document.createElement('div');
    item.className = 'puzzle-item';

    const name = document.createElement('span');
    name.className = 'puzzle-name';
    name.textContent = puzzle.name;

    const isComplete = this.progressManager && this.progressManager.isComplete(puzzle.id);
    if (isComplete) {
      const checkmark = document.createElement('span');
      checkmark.className = 'checkmark';
      checkmark.textContent = '✓';
      item.appendChild(checkmark);
    }

    item.appendChild(name);

    item.addEventListener('click', () => {
      if (this.onSelectPuzzle) {
        this.onSelectPuzzle(puzzle.id);
      }
    });

    return item;
  }

  setPuzzles(puzzles) {
    this.puzzles = puzzles;
    if (this.visible) {
      this.render();
    }
  }
}

export default MainMenu;
