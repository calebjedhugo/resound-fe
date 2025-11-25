class PausedState {
  constructor(gameState, pauseMenu) {
    this.gameState = gameState;
    this.pauseMenu = pauseMenu;
  }

  enter() {
    if (this.pauseMenu) {
      this.pauseMenu.show();
    }
  }

  exit() {
    if (this.pauseMenu) {
      this.pauseMenu.hide();
    }
  }
}

export default PausedState;
