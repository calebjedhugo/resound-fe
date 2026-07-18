import * as THREE from 'three';
import WebGL from 'isWebGLAvailable';
import motion, {
  camera,
  renderer,
  syncCameraToPlayer,
} from 'resoundModules/playerControls/motion/motion';

import gameState from 'core/GameState';
import GameLoop from 'core/GameLoop';
import StateMachine from 'core/StateMachine';
import PuzzleLoader from 'core/PuzzleLoader';
import ProgressManager from 'core/ProgressManager';

import MainMenu from 'ui/MainMenu';
import showToast from 'ui/Toast';
import StartGate from 'ui/StartGate';
import KeyHints from 'ui/KeyHints';
import CameraModeBadge from 'ui/CameraModeBadge';
import PauseMenu from 'ui/PauseMenu';
import RecordingUI from 'ui/RecordingUI';
import EndingOverlay from 'ui/EndingOverlay';
import DebugUI from 'ui/DebugUI';
import ClapVisual from 'ui/ClapVisual';
import ClapManager from 'core/ClapManager';
import PlaybackManager from 'core/PlaybackManager';
import ListeningManager from 'core/ListeningManager';
import PortalManager from 'core/PortalManager';
import DeployManager from 'core/DeployManager';
import HintMemory from 'core/HintMemory';
import MenuState from 'states/MenuState';
import PlayingState from 'states/PlayingState';
import PausedState from 'states/PausedState';
import createEventListeners from 'createEventListeners';

// Three.js scene
const scene = new THREE.Scene();

// Add lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(50, 100, 50);
scene.add(directionalLight);

// UI
let mainMenu = null;
let pauseMenu = null;
const recordingUI = new RecordingUI();
const debugUI = new DebugUI();
const clapVisual = new ClapVisual(scene);
const startGate = new StartGate();
const keyHints = new KeyHints(scene);
const cameraModeBadge = new CameraModeBadge();
const endingOverlay = new EndingOverlay();

// Set up clap visual callback
ClapManager.setVisualCallback((position, range) => {
  clapVisual.show(position, range);
});

// The world orchestrator: owns the active area + live neighbor areas; the
// active area's content group is parented into this render scene.
// Arriving through an `ending: true` gate (the finale portal back into
// area I) rolls the demo's closing card. Every crossing activates the
// destination puzzle's `teaches` list; hints already performed this
// session stay retired (each lesson happens once).
PortalManager.initialize(scene, (puzzle, arrivalGate) => {
  HintMemory.arm(puzzle && puzzle.teaches);
  keyHints.hideAll();
  if (arrivalGate && arrivalGate.ending) endingOverlay.show();
});

// The deployable cleanser gate's aiming phantom renders in the main scene
DeployManager.initialize(scene);

// State machine
const stateMachine = new StateMachine(gameState);
gameState.stateMachine = stateMachine;

// Game functions
async function startPuzzle(puzzleId) {
  try {
    const puzzleData = await PuzzleLoader.load(puzzleId);
    PortalManager.enterWorld(puzzleData);
    DeployManager.reset(); // fresh world: no phantom, no deployed gate
    stateMachine.setState('PLAYING');
    // A world entry is a fresh playthrough: forget performed hints (doorway
    // crossings within it don't — each lesson happens once per playthrough).
    HintMemory.reset();
    HintMemory.arm(puzzleData.teaches);
    keyHints.hideAll();
    startGate.show();
  } catch (error) {
    console.error('Failed to load puzzle:', error);
    // A partial build may have created areas/state — clean up before returning to menu
    PortalManager.reset();
    gameState.reset();
    showToast(`Couldn't load puzzle "${puzzleId}": ${error.message}`, {
      type: 'error',
      duration: 9000,
    });
  }
}

function pauseGame() {
  if (gameState.mode === 'PLAYING') {
    stateMachine.setState('PAUSED');
  }
}

function resumeGame() {
  if (gameState.mode === 'PAUSED') {
    stateMachine.setState('PLAYING');
  }
}

function exitToMenu() {
  PortalManager.reset();
  DeployManager.reset();
  gameState.reset();
  clapVisual.clear();
  ClapManager.reset();
  PlaybackManager.reset();
  startGate.hide();
  endingOverlay.hide();
  keyHints.hideAll();
  cameraModeBadge.update(gameState);
  stateMachine.setState('MENU');
}

async function nextPuzzle() {
  // Get puzzle list
  const puzzles = await PuzzleLoader.loadPuzzleList();

  // Find next unsolved puzzle
  const nextUnsolved = ProgressManager.getNextUnsolvedPuzzle(puzzles);

  if (nextUnsolved) {
    // Clear current puzzle (startPuzzle rebuilds the world from scratch)
    PortalManager.reset();
    gameState.reset();

    // Start next puzzle
    await startPuzzle(nextUnsolved.id);
  } else {
    // All puzzles complete - return to menu
    exitToMenu();
  }
}

// Game loop callbacks
function update(deltaTime) {
  stateMachine.update(deltaTime);
  // The world holds still while the start gate is up: creatures don't sing
  // (a self-solving layout would otherwise complete silently before the
  // player ever sees the world) and the musical clock doesn't advance.
  if (gameState.mode === 'PLAYING' && !startGate.visible) {
    // Update musical clock (includes metronome)
    if (gameState.musicalClock) {
      gameState.musicalClock.update(deltaTime);
    }
    // Every loaded area simulates — the neighbor behind an open doorway is
    // exactly as alive as the one the player stands in
    PortalManager.updateAreas(deltaTime);
    // Crossing an open linked gate hands the world to the neighbor puzzle
    PortalManager.update();
    DeployManager.update();
    clapVisual.update();
    recordingUI.update();
    keyHints.update(deltaTime);
    debugUI.update();
  }
  cameraModeBadge.update(gameState);
}

function render() {
  stateMachine.render();
  // Open linked gates draw their see-through neighbor view first, so the
  // doorway texture is current when the main scene renders
  motion(scene, (webglRenderer, playerCamera) =>
    PortalManager.renderPortals(webglRenderer, playerCamera)
  );
}

// Keyboard handler for pause and metronome
function handleKeyDown(event) {
  if (event.code === 'Escape') {
    if (gameState.mode === 'PLAYING') {
      pauseGame();
    } else if (gameState.mode === 'PAUSED') {
      resumeGame();
    }
  }

  // Toggle debug info with F3
  if (event.code === 'F3' && gameState.mode === 'PLAYING') {
    const enabled = debugUI.toggle();
    showToast(`Debug info ${enabled ? 'on' : 'off'}`, { duration: 2000 });
  }

  // Toggle metronome with 'N' key (M is the mouse-look toggle)
  if (event.code === 'KeyN' && gameState.mode === 'PLAYING' && gameState.musicalClock) {
    gameState.musicalClock.toggleMetronome();
    showToast(`Metronome ${gameState.musicalClock.metronomeEnabled ? 'on' : 'off'}`, {
      duration: 2500,
    });
  }
}

// Initialize game
async function initializeGame() {
  // Load puzzle list
  const puzzles = await PuzzleLoader.loadPuzzleList();

  // Create menus
  mainMenu = new MainMenu(puzzles, startPuzzle, ProgressManager);
  pauseMenu = new PauseMenu(resumeGame, exitToMenu, nextPuzzle);

  // Register states
  stateMachine.registerState('MENU', new MenuState(gameState, mainMenu));
  stateMachine.registerState('PLAYING', new PlayingState(gameState));
  stateMachine.registerState('PAUSED', new PausedState(gameState, pauseMenu));

  // Deep link from the editor's "Test in game": ?puzzle=<id> jumps straight in.
  // Checked (and awaited) first so the menu never flashes while a puzzle loads.
  const requestedPuzzle = new URLSearchParams(window.location.search).get('puzzle');
  if (requestedPuzzle && puzzles.some((p) => p.id === requestedPuzzle)) {
    await startPuzzle(requestedPuzzle);
  }
  if (gameState.mode !== 'PLAYING' && puzzles.length > 0) {
    // No menu at boot: wake up in the world. The first manifest entry is the
    // intro level; the menu remains reachable through Esc → Exit to Menu.
    await startPuzzle(puzzles[0].id);
  }
  if (gameState.mode !== 'PLAYING') {
    // Nothing loadable (empty manifest or load failure) — fall back to menu.
    stateMachine.setState('MENU');
  }

  // Setup event listeners
  createEventListeners();
  window.addEventListener('keydown', handleKeyDown);

  // Start game loop
  const gameLoop = new GameLoop(update, render);
  gameLoop.start();
}

// Dev-only introspection handle (used by tests/tooling; not part of the game)
if (import.meta.env.DEV) {
  window.__resoundDebug = {
    gameState,
    scene,
    PlaybackManager,
    ListeningManager,
    PortalManager,
    camera,
    renderer,
    syncCameraToPlayer,
    // Re-enable the tap-impulse affordance (OFF by default): a quick key tap
    // then yields one guaranteed movement/look step, so scripted single-frame
    // taps register. Console-only, so a human player never triggers the
    // post-release lurch this causes. Returns the resulting state.
    // Usage: window.__resoundDebug.setTapImpulse(true)
    setTapImpulse(enabled = true) {
      gameState.input.tapImpulseEnabled = !!enabled;
      return gameState.input.tapImpulseEnabled;
    },
  };
}

// Start the game
if (WebGL.isWebGLAvailable()) {
  initializeGame().catch((error) => {
    console.error('Failed to initialize game:', error);
  });
} else {
  const warning = WebGL.getWebGLErrorMessage();
  document.body.appendChild(warning);
}
