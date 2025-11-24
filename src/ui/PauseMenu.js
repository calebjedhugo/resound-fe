import Menu from './Menu';

class PauseMenu extends Menu {
  constructor(onContinue, onExit) {
    super('pause-menu');
    this.onContinue = onContinue;
    this.onExit = onExit;
  }

  render() {
    this.clear();

    // Title
    const title = document.createElement('h1');
    title.className = 'menu-title';
    title.textContent = 'Paused';
    this.element.appendChild(title);

    // Button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'button-container';

    // Continue button
    const continueButton = document.createElement('button');
    continueButton.className = 'menu-button';
    continueButton.textContent = 'Continue';
    continueButton.addEventListener('click', () => {
      if (this.onContinue) {
        this.onContinue();
      }
    });
    buttonContainer.appendChild(continueButton);

    // Exit button
    const exitButton = document.createElement('button');
    exitButton.className = 'menu-button';
    exitButton.textContent = 'Exit to Menu';
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
