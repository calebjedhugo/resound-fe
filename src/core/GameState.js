import MusicalClock from './MusicalClock';

class GameState {
  constructor() {
    this.mode = 'MENU'; // MENU, PLAYING, PAUSED
    this.currentPuzzle = null;

    // Musical timing (set when puzzle loads)
    this.musicalClock = null;

    this.player = {
      position: { x: 0, y: 1.8, z: 0 },
      rotation: { x: 0, y: 0 },
      inventory: [null, null, null, null, null], // 5 slots
      activeSlot: 0, // Currently selected slot (0-4)
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

    // Recording state
    this.recording = {
      isRecording: false,
      creaturesInRange: [],
      startTime: null,
      capturedNotes: [],
    };
  }

  reset() {
    this.currentPuzzle = null;
    this.musicalClock = null;
    this.player.position = { x: 0, y: 1.8, z: 0 };
    this.player.rotation = { x: 0, y: 0 };
    this.player.inventory = [null, null, null, null, null];
    this.player.activeSlot = 0;
    this.entities = [];
    this.recording = {
      isRecording: false,
      creaturesInRange: [],
      startTime: null,
      capturedNotes: [],
    };
  }

  /**
   * Initialize musical clock with tempo
   * @param {number} tempo - Tempo in BPM
   */
  initMusicalClock(tempo) {
    this.musicalClock = new MusicalClock(tempo);
  }

  updateScreenCenter() {
    this.input.mouse.screenCenter = [window.innerWidth / 2, window.innerHeight / 2];
  }
}

const gameState = new GameState();

export default gameState;
