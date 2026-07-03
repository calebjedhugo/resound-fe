import { MusicalClock } from 'resound-sound';

class GameState {
  constructor() {
    this.mode = 'MENU'; // MENU, PLAYING, PAUSED
    this.currentPuzzle = null;

    // Musical timing (set when puzzle loads)
    this.musicalClock = null;

    // State machine reference (set during initialization)
    this.stateMachine = null;

    this.player = {
      position: { x: 0, y: 1.8, z: 0 },
      rotation: { x: 0, y: 0 },
      elevation: 0,
      inventory: [null, null, null, null, null], // 5 slots
      activeSlot: 0, // Currently selected slot (0-4)
      maxInventorySize: 5,
    };

    this.elevationGrid = null;

    this.input = {
      keys: {
        forward: false,
        backward: false,
        latLeft: false,
        latRight: false,
        running: false,
        lookLeft: false,
        lookRight: false,
        lookUp: false,
        lookDown: false,
      },
      mouseLookEnabled: true,
      // Discrete key taps queue guaranteed minimum steps here (accessibility:
      // input that can't hold keys still moves/turns). Consumed by the frame
      // loop; ignored while the matching key is actually held.
      impulses: {
        forward: 0,
        backward: 0,
        latLeft: 0,
        latRight: 0,
        lookLeft: 0,
        lookRight: 0,
        lookUp: 0,
        lookDown: 0,
      },
      mouse: {
        // Starts at screen center (zero look offset) — [0,0] would aim the
        // camera at the sky until the first real mousemove arrives.
        position: [window.innerWidth / 2, window.innerHeight / 2],
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

    // Harmony detection log (for debug UI)
    this.harmonyLog = [];
  }

  reset() {
    this.currentPuzzle = null;
    this.musicalClock = null;
    this.player.position = { x: 0, y: 1.8, z: 0 };
    this.player.rotation = { x: 0, y: 0 };
    this.player.elevation = 0;
    this.player.inventory = [null, null, null, null, null];
    this.player.activeSlot = 0;
    this.elevationGrid = null;
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
