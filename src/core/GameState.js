class GameState {
  constructor() {
    this.mode = 'MENU'; // MENU, PLAYING, PAUSED
    this.currentPuzzle = null;

    this.player = {
      position: { x: 0, y: 1.8, z: 0 },
      rotation: { x: 0, y: 0 },
      inventory: [],
      maxInventorySize: 5,
    };

    this.input = {
      keys: {
        forward: false,
        backward: false,
        latLeft: false,
        latRight: false,
        running: false,
      },
      mouse: {
        position: [0, 0],
        centered: true,
        screenCenter: [window.innerWidth / 2, window.innerHeight / 2],
      },
    };

    this.camera = {
      viewCenter: [0, 0], // Accumulated camera rotation
    };

    this.entities = [];
  }

  reset() {
    this.currentPuzzle = null;
    this.player.position = { x: 0, y: 1.8, z: 0 };
    this.player.rotation = { x: 0, y: 0 };
    this.player.inventory = [];
    this.entities = [];
  }

  updateScreenCenter() {
    this.input.mouse.screenCenter = [window.innerWidth / 2, window.innerHeight / 2];
  }
}

const gameState = new GameState();

export default gameState;
