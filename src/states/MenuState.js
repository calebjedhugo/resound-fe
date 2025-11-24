class MenuState {
  constructor(gameState, mainMenu) {
    this.gameState = gameState;
    this.mainMenu = mainMenu;
  }

  enter() {
    console.log('Entering Menu State');
    if (this.mainMenu) {
      this.mainMenu.show();
    }
  }

  update(deltaTime) {
    // Menu doesn't need updates for now
  }

  render() {
    // Menu rendering is handled by DOM
  }

  exit() {
    console.log('Exiting Menu State');
    if (this.mainMenu) {
      this.mainMenu.hide();
    }
  }
}

export default MenuState;
