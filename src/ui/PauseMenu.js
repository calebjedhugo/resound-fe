import gameState from 'core/GameState';
import Menu from 'ui/Menu';

class PauseMenu extends Menu {
  constructor(onContinue, onExit, onNextPuzzle) {
    super('pause-menu');
    this.onContinue = onContinue;
    this.onExit = onExit;
    this.onNextPuzzle = onNextPuzzle;
  }

  render() {
    this.clear();

    // Complete = every fountain in THIS session is activated. (Persistent
    // progress would title a fresh replay of an already-beaten puzzle
    // "Puzzle Complete!" the moment you pause.)
    const fountains = gameState.entities.filter((e) => e.type === 'fountain');
    const isPuzzleComplete = fountains.length > 0 && fountains.every((f) => f.isActivated);

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
