import { MusicalClock } from 'resound-sound';

// Stable empty list for "no area loaded" reads of gameState.entities
const NO_ENTITIES = Object.freeze([]);

class GameState {
  constructor() {
    this.mode = 'MENU'; // MENU, PLAYING, PAUSED

    // The area the player stands in. Linked puzzles are one world of many
    // live areas (core/Area); `currentPuzzle`/`entities`/`elevationGrid`
    // below delegate here, so player-scoped systems (UI, input, playback,
    // claps) always mean "the player's area" without knowing about areas.
    this.activeArea = null;

    // The world orchestrator (PortalManager registers itself here) — lets
    // area-scoped code reach cross-area services (doorway distances) without
    // importing the manager (avoids import cycles).
    this.world = null;

    // Musical timing — ONE clock for the whole world (all loaded areas).
    // Created on world entry, persists across doorway crossings; only its
    // tempo changes (see PortalManager's tempo gradient).
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

  // --- Active-area delegation -------------------------------------------
  // Player-scoped systems read the world through these; they always see the
  // player's own area. Simulation code running inside an area must use
  // `entity.area` instead — a neighbor's creatures never appear here.

  get currentPuzzle() {
    return this.activeArea ? this.activeArea.puzzle : null;
  }

  get entities() {
    return this.activeArea ? this.activeArea.entities : NO_ENTITIES;
  }

  get elevationGrid() {
    return this.activeArea ? this.activeArea.elevationGrid : null;
  }

  reset() {
    // Areas are owned/disposed by the world orchestrator (PortalManager);
    // dropping the pointer here just empties the delegated views above.
    this.activeArea = null;
    this.musicalClock = null;
    this.player.position = { x: 0, y: 1.8, z: 0 };
    this.player.rotation = { x: 0, y: 0 };
    this.player.elevation = 0;
    this.player.inventory = [null, null, null, null, null];
    this.player.activeSlot = 0;
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
