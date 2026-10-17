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
import ShaderPrewarm from 'core/ShaderPrewarm';
import HintMemory from 'core/HintMemory';
import MenuState from 'states/MenuState';
import PlayingState from 'states/PlayingState';
import PausedState from 'states/PausedState';
import createEventListeners from 'createEventListeners';
import Creature from 'entities/Creature';
import Gate from 'entities/Gate';
import Fountain from 'entities/Fountain';
import CleansingTile from 'entities/CleansingTile';
import CleanserGatePad from 'entities/CleanserGatePad';

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

/**
 * Resolves once the browser has painted what the DOM holds now: a timer
 * queued from the next frame's rAF runs after that frame's paint. Frames
 * stop on a hidden page, so a beat later it resolves regardless.
 */
function afterNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
    setTimeout(resolve, 100);
  });
}

// Game functions
/**
 * @param {string} puzzleId
 * @param {?Promise<object>} [pendingLoad] - the puzzle's load, if already
 *   under way (the boot fetches a deep-linked puzzle alongside the manifest)
 */
async function startPuzzle(puzzleId, pendingLoad = null) {
  // The scrim goes up before anything loads, and is painted before the
  // heavy part (the area build, then the first frame's shader prewarm) can
  // block the page: it used to appear only after all of it (60-150 ms)
  startGate.showLoading();
  const painted = afterNextPaint();
  try {
    // A world entry starts from the puzzle files as they are now (the editor
    // may have saved some since the last world loaded them)
    PuzzleLoader.clearCache();
    const [puzzleData] = await Promise.all([pendingLoad || PuzzleLoader.load(puzzleId), painted]);
    PortalManager.enterWorld(puzzleData);
    DeployManager.reset(); // fresh world: no phantom, no deployed gate
    stateMachine.setState('PLAYING');
    // A world entry is a fresh playthrough: forget performed hints (doorway
    // crossings within it don't — each lesson happens once per playthrough).
    HintMemory.reset();
    HintMemory.arm(puzzleData.teaches);
    keyHints.hideAll();
    startGate.show(); // the world exists: a key/click may wake it now
  } catch (error) {
    console.error('Failed to load puzzle:', error);
    // A partial build may have created areas/state — clean up before returning to menu
    PortalManager.reset();
    gameState.reset();
    startGate.hide();
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

// The scenes the first portal passes will draw: the main scene (same-area
// doors show it) and each loaded linked neighbor's own scene
function portalScenes() {
  const active = PortalManager.getActiveArea();
  if (!active) return [];
  const scenes = [{ key: active, scene }];
  for (const entity of active.entities) {
    const neighbor =
      entity.type === 'gate' && entity.link && PortalManager.getArea(entity.link.puzzleId);
    if (neighbor && neighbor !== active) scenes.push({ key: neighbor, scene: neighbor.scene });
  }
  return scenes;
}

function render() {
  stateMachine.render();
  // Open linked gates draw their see-through neighbor view before the main
  // scene renders. The deployed cleanser gate goes FIRST: it pre-renders
  // door views for its own mapped eye (so doors inside its panels are
  // see-through), then the regular door pass re-renders them for the
  // player's real eye — each surface shows its last completed write.
  motion(scene, (webglRenderer, playerCamera) => {
    // While the start gate holds the world still, compile the shader
    // programs the first note / first open door would otherwise compile
    // mid-game (neighbors are warmed as they finish loading)
    if (startGate.visible) ShaderPrewarm.run(webglRenderer, scene, portalScenes());
    DeployManager.renderPortal(webglRenderer, playerCamera);
    PortalManager.renderPortals(webglRenderer, playerCamera);
  });
}

const gameLoop = new GameLoop(update, render);

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
  // Up before the first fetch, so the boot paints the scrim, not a blank page
  startGate.showLoading();

  // A deep link from the editor's "Test in game" (?puzzle=<id>) fetches its
  // puzzle alongside the manifest instead of after it. It is entered only if
  // the manifest lists it; startPuzzle reports a failed load.
  const requestedPuzzle = new URLSearchParams(window.location.search).get('puzzle');
  const requestedLoad = requestedPuzzle ? PuzzleLoader.load(requestedPuzzle) : null;
  if (requestedLoad) requestedLoad.catch(() => {});

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
  if (requestedPuzzle && puzzles.some((p) => p.id === requestedPuzzle)) {
    await startPuzzle(requestedPuzzle, requestedLoad);
  }
  if (gameState.mode !== 'PLAYING' && puzzles.length > 0) {
    // No menu at boot: wake up in the world. The first manifest entry is the
    // intro level; the menu remains reachable through Esc → Exit to Menu.
    await startPuzzle(puzzles[0].id);
  }
  if (gameState.mode !== 'PLAYING') {
    // Nothing loadable (empty manifest or load failure) — fall back to menu.
    startGate.hide();
    stateMachine.setState('MENU');
  }

  // Setup event listeners
  createEventListeners();
  window.addEventListener('keydown', handleKeyDown);

  // Start game loop
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
    // Shader-program re-derivations per frame, by material type: three
    // re-runs getParameters + the program cache key (which calls
    // customProgramCacheKey once) whenever a material draws in a different
    // pass context than last time (core/passContext). Expect ~0 in steady
    // state. Usage: await window.__resoundDebug.countProgramDerivations(120)
    async countProgramDerivations(frames = 60) {
      const proto = THREE.Material.prototype;
      const original = proto.customProgramCacheKey;
      const byType = {};
      proto.customProgramCacheKey = function counted() {
        byType[this.type] = (byType[this.type] || 0) + 1;
        return original.call(this);
      };
      try {
        await new Promise((resolve) => {
          let left = frames;
          const tick = () => {
            left -= 1;
            if (left <= 0) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      } finally {
        proto.customProgramCacheKey = original;
      }
      const perFrame = {};
      let total = 0;
      for (const [type, count] of Object.entries(byType)) {
        perFrame[type] = count / frames;
        total += count;
      }
      return {
        perFrame: total / frames,
        byType: perFrame,
        programs: renderer.info.programs.length,
      };
    },
    // Per-phase CPU time over the next `frames` frames (core/FrameProfiler):
    // self/inclusive ms per wrapped call keyed by where it ran, plus frame
    // work/interval percentiles, draw calls over every pass, derivations,
    // GPU ms where the browser exposes timer queries, and the JS heap. Pass
    // extra [owner, method, label] targets to time anything else.
    // Usage: await window.__resoundDebug.profile(300)
    async profile(frames = 300, extraTargets = []) {
      const { default: profileFrames } = await import('core/FrameProfiler');
      const clock = gameState.musicalClock;
      return profileFrames({
        renderer,
        gameLoop,
        frames,
        targets: [
          [gameLoop, 'update', 'update'],
          [gameLoop, 'render', 'render'],
          [stateMachine, 'update', 'update.stateMachine'],
          [clock, 'update', 'update.clock'],
          [PortalManager, 'updateAreas', 'update.areas'],
          [Creature.prototype, 'update', 'entity.creature'],
          [Creature.prototype, 'updateLook', 'creature.look'],
          [Creature.prototype, 'updateMovement', 'creature.movement'],
          [Gate.prototype, 'update', 'entity.gate'],
          [Fountain.prototype, 'update', 'entity.fountain'],
          [CleansingTile.prototype, 'update', 'entity.cleanser'],
          [CleanserGatePad.prototype, 'update', 'entity.cleanserGatePad'],
          [PortalManager, '_mirrorDoorPairs', 'areas.mirrorDoorPairs'],
          [PortalManager, '_updateTempoGradient', 'areas.tempoGradient'],
          [PortalManager, 'update', 'update.crossing'],
          [DeployManager, 'update', 'update.deploy'],
          [clapVisual, 'update', 'update.clapVisual'],
          [recordingUI, 'update', 'update.recordingUI'],
          [keyHints, 'update', 'update.keyHints'],
          [debugUI, 'update', 'update.debugUI'],
          [cameraModeBadge, 'update', 'update.cameraBadge'],
          [ShaderPrewarm, 'run', 'render.prewarm'],
          [DeployManager, 'renderPortal', 'render.cleanserGate'],
          [PortalManager, 'renderPortals', 'render.doors'],
          [PortalManager, 'renderAreaPortals', 'render.areaDoors'],
          [PortalManager, '_renderExteriorViews', 'doors.playerFaces'],
          [PortalManager, '_flushWarmUps', 'doors.warmUps'],
          [PortalManager, '_mirrorSweep', 'doors.mirrorSweep'],
          [PortalManager, '_refreshStaleFaces', 'doors.staleRotor'],
          ...extraTargets,
        ],
      });
    },
    // Scripted scenarios: enter a puzzle (a fresh world, like the menu) and
    // drop the start gate once its shader prewarm has seen every linked
    // neighbor (bounded wait), as a player's would. Dropping it this way
    // skips the waking gesture, so audio stays suspended until a REAL
    // key/click (CDP input counts).
    async enter(puzzleId) {
      await startPuzzle(puzzleId);
      const neighborsLoaded = () =>
        PortalManager.getActiveArea()
          .entities.filter((e) => e.type === 'gate' && e.link)
          .every((gate) => PortalManager.getArea(gate.link.puzzleId));
      await new Promise((resolve) => {
        let framesLeft = 180;
        let settleFrames = 2; // the prewarm draws on the frames after a load
        const tick = () => {
          framesLeft -= 1;
          if (neighborsLoaded() || framesLeft <= 0) settleFrames -= 1;
          if (settleFrames < 0) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      startGate.hide();
      return gameState.currentPuzzle && gameState.currentPuzzle.id;
    },
    startGate,
    keyHints,
    clapVisual,
    DeployManager,
    ClapManager,
    PuzzleLoader,
    ShaderPrewarm,
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
