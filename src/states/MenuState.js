class MenuState {
  constructor(gameState, mainMenu) {
    this.gameState = gameState;
    this.mainMenu = mainMenu;
  }

  enter() {
    if (this.mainMenu) {
      this.mainMenu.show();
    }
  }

  exit() {
    if (this.mainMenu) {
      this.mainMenu.hide();
    }
  }
}

export default MenuState;
