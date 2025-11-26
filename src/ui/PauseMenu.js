import Menu from './Menu';
import gameState from 'core/GameState';
import ProgressManager from 'core/ProgressManager';

class PauseMenu extends Menu {
  constructor(onContinue, onExit, onNextPuzzle) {
    super('pause-menu');
    this.onContinue = onContinue;
    this.onExit = onExit;
    this.onNextPuzzle = onNextPuzzle;
  }

  render() {
    this.clear();

    // Check if current puzzle is complete
    const isPuzzleComplete =
      gameState.currentPuzzle && ProgressManager.isComplete(gameState.currentPuzzle.id);

    // Title
    const title = document.createElement('h1');
    title.className = 'menu-title';
    title.textContent = isPuzzleComplete ? 'Puzzle Complete!' : 'Paused';
    this.element.appendChild(title);

    // Button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'button-container';

    // Continue button
    const continueButton = document.createElement('button');
    continueButton.className = 'menu-button';
    continueButton.textContent = 'Resume';
    continueButton.addEventListener('click', () => {
      if (this.onContinue) {
        this.onContinue();
      }
    });
    buttonContainer.appendChild(continueButton);

    // Next Puzzle button (only if puzzle is complete)
    if (isPuzzleComplete) {
      const nextButton = document.createElement('button');
      nextButton.className = 'menu-button';
      nextButton.textContent = 'Next Puzzle';
      nextButton.addEventListener('click', () => {
        if (this.onNextPuzzle) {
          this.onNextPuzzle();
        }
      });
      buttonContainer.appendChild(nextButton);
    }

    // Exit button
    const exitButton = document.createElement('button');
    exitButton.className = 'menu-button';
    exitButton.textContent = 'Main Menu';
    exitButton.addEventListener('click', () => {
      if (this.onExit) {
        this.onExit();
      }
    });
    buttonContainer.appendChild(exitButton);

    this.element.appendChild(buttonContainer);
  }
}

export default PauseMenu;
