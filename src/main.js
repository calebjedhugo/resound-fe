import * as THREE from 'three';
import WebGL from 'isWebGLAvailable';
import motion from 'resoundModules/playerControls/motion/motion';
import createEventListeners from './createEventListeners';

import gameState from 'core/GameState';
import GameLoop from 'core/GameLoop';
import StateMachine from 'core/StateMachine';
import EntityManager from 'entities/EntityManager';
import PuzzleLoader from 'core/PuzzleLoader';
import ProgressManager from 'core/ProgressManager';

import MainMenu from 'ui/MainMenu';
import PauseMenu from 'ui/PauseMenu';
import MenuState from 'states/MenuState';
import PlayingState from 'states/PlayingState';
import PausedState from 'states/PausedState';

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

// Menus
let mainMenu = null;
let pauseMenu = null;

// State machine
const stateMachine = new StateMachine(gameState);

// Game functions
async function startPuzzle(puzzleId) {
  try {
    console.log(`Loading puzzle: ${puzzleId}`);
    const puzzleData = await PuzzleLoader.load(puzzleId);
    PuzzleLoader.parse(puzzleData, entityManager, gameState);
    gameState.currentPuzzle = puzzleData;
    stateMachine.setState('PLAYING');
  } catch (error) {
    console.error('Failed to load puzzle:', error);
    alert(`Failed to load puzzle: ${error.message}`);
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
  stateMachine.setState('MENU');
}

// Game loop callbacks
function update(deltaTime) {
  stateMachine.update(deltaTime);
  if (gameState.mode === 'PLAYING') {
    entityManager.update(deltaTime);
  }
}

function render() {
  stateMachine.render();
  motion(scene);
}

// Keyboard handler for pause
function handleKeyDown(event) {
  if (event.code === 'Escape') {
    if (gameState.mode === 'PLAYING') {
      pauseGame();
    } else if (gameState.mode === 'PAUSED') {
      resumeGame();
    }
  }
}

// Initialize game
async function initializeGame() {
  // Load puzzle list
  const puzzles = await PuzzleLoader.loadPuzzleList();

  // Create menus
  mainMenu = new MainMenu(puzzles, startPuzzle, ProgressManager);
  pauseMenu = new PauseMenu(resumeGame, exitToMenu);

  // Register states
  stateMachine.registerState('MENU', new MenuState(gameState, mainMenu));
  stateMachine.registerState('PLAYING', new PlayingState(gameState, entityManager, motion));
  stateMachine.registerState('PAUSED', new PausedState(gameState, pauseMenu));

  // Start in menu state
  stateMachine.setState('MENU');

  // Setup event listeners
  createEventListeners();
  window.addEventListener('keydown', handleKeyDown);

  // Start game loop
  const gameLoop = new GameLoop(update, render);
  gameLoop.start();

  console.log('Resound initialized');
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
