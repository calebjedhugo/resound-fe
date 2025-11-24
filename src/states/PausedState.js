class PausedState {
  constructor(gameState, pauseMenu) {
    this.gameState = gameState;
    this.pauseMenu = pauseMenu;
  }

  enter() {
    console.log('Entering Paused State');
    if (this.pauseMenu) {
      this.pauseMenu.show();
    }
  }

  update(deltaTime) {
    // Game is paused, no updates
  }

  render() {
    // Pause menu rendering is handled by DOM
  }

  exit() {
    console.log('Exiting Paused State');
    if (this.pauseMenu) {
      this.pauseMenu.hide();
    }
  }
}

export default PausedState;
