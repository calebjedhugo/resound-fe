import * as THREE from 'three';
import WebGL from 'isWebGLAvailable';
import motion, { camera, syncCameraToPlayer } from 'resoundModules/playerControls/motion/motion';

import gameState from 'core/GameState';
import GameLoop from 'core/GameLoop';
import StateMachine from 'core/StateMachine';
import EntityManager from 'entities/EntityManager';
import PuzzleLoader from 'core/PuzzleLoader';
import ProgressManager from 'core/ProgressManager';

import MainMenu from 'ui/MainMenu';
import showToast from 'ui/Toast';
import StartGate from 'ui/StartGate';
import KeyHints from 'ui/KeyHints';
import CameraModeBadge from 'ui/CameraModeBadge';
import PauseMenu from 'ui/PauseMenu';
import RecordingUI from 'ui/RecordingUI';
import DebugUI from 'ui/DebugUI';
import ClapVisual from 'ui/ClapVisual';
import ClapManager from 'core/ClapManager';
import PlaybackManager from 'core/PlaybackManager';
import ListeningManager from 'core/ListeningManager';
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

// Entity manager
const entityManager = new EntityManager(scene);

// UI
let mainMenu = null;
let pauseMenu = null;
const recordingUI = new RecordingUI();
const debugUI = new DebugUI();
const clapVisual = new ClapVisual(scene);
const startGate = new StartGate();
const keyHints = new KeyHints(scene);
const cameraModeBadge = new CameraModeBadge();

// Set up clap visual callback
ClapManager.setVisualCallback((position, range) => {
  clapVisual.show(position, range);
});

// State machine
const stateMachine = new StateMachine(gameState);
gameState.stateMachine = stateMachine;

// Game functions
async function startPuzzle(puzzleId) {
  try {
    const puzzleData = await PuzzleLoader.load(puzzleId);
    PuzzleLoader.parse(puzzleData, entityManager, gameState);
    gameState.currentPuzzle = puzzleData;
    stateMachine.setState('PLAYING');
    keyHints.hideAll();
    startGate.show();
  } catch (error) {
    console.error('Failed to load puzzle:', error);
    // A partial parse may have added entities/state — clean up before returning to menu
    gameState.reset();
    entityManager.clear();
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
  gameState.reset();
  entityManager.clear();
  clapVisual.clear();
  ClapManager.reset();
  startGate.hide();
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
    // Clear current puzzle
    gameState.reset();
    entityManager.clear();

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
    entityManager.update(deltaTime);
    clapVisual.update();
    recordingUI.update();
    keyHints.update(deltaTime);
    debugUI.update();
  }
  cameraModeBadge.update(gameState);
}

function render() {
  stateMachine.render();
  motion(scene);
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
  stateMachine.registerState('PLAYING', new PlayingState(gameState, entityManager));
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
    entityManager,
    PlaybackManager,
    ListeningManager,
    camera,
    syncCameraToPlayer,
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
