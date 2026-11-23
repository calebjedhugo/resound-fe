import * as THREE from 'three';
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
import InventoryUI from 'ui/InventoryUI';
import EndingOverlay from 'ui/EndingOverlay';
import DebugUI from 'ui/DebugUI';
import NotationDisplay from 'ui/NotationDisplay';
import AbsorbManager from 'core/AbsorbManager';
import ListeningManager from 'core/ListeningManager';
import PortalManager from 'core/PortalManager';
import DeployManager from 'core/DeployManager';
import Gamepad from 'core/Gamepad';
import InputDevice from 'core/InputDevice';
import ShaderPrewarm from 'core/ShaderPrewarm';
import { beginFrame, updateSceneMatrices } from 'core/sceneMatrices';
import HintMemory from 'core/HintMemory';
import MenuState from 'states/MenuState';
import PlayingState from 'states/PlayingState';
import PausedState from 'states/PausedState';
import createEventListeners from 'createEventListeners';
import Creature from 'entities/Creature';
import Gate from 'entities/Gate';
import Fountain from 'entities/Fountain';
import Waystone from 'entities/Waystone';
import WaystoneGatePad from 'entities/WaystoneGatePad';
import {
  calmStorm,
  tickEnvironment,
  environmentClock,
  setEnvironmentClock,
} from 'entities/EnvironmentLook';
import { audioContextManager } from 'resound-sound';
import {
  playRequest,
  backToEditor,
  editorFrame,
  tellEditor,
  isFromEditor,
  PREVIEW_WAITING,
  PREVIEW_LANDED,
  PREVIEW_READY,
  PREVIEW_FAILED,
  PREVIEW_GO,
} from 'core/playLink';

// Three.js scene
const scene = new THREE.Scene();

// Add lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(50, 100, 50);
scene.add(directionalLight);

// What the page was asked to play (a deep link: ?puzzle=<id>), and whether
// it plays inside the editor's Play (core/playLink): an iframe over the
// editor, which glides its camera down to the spawn while this loads, then
// fades over to this game's first frame
const launch = playRequest(window.location.search);
const inEditor = launch.fromEditor && editorFrame() !== null;
// Back to Editor was chosen: the world holds still until the editor lets go
let handedBack = false;

// UI
let mainMenu = null;
let pauseMenu = null;
const inventoryUI = new InventoryUI();
const debugUI = new DebugUI();
const startGate = new StartGate();
const keyHints = new KeyHints(scene);
const cameraModeBadge = new CameraModeBadge();
const endingOverlay = new EndingOverlay();

// The world orchestrator: owns the active area + live neighbor areas; the
// active area's content group is parented into this render scene.
// Arriving through an `ending: true` gate (the finale portal back into
// area I) rolls the demo's closing card. Every crossing activates the
// destination puzzle's `teaches` list; hints already performed this
// session stay retired (each lesson happens once).
PortalManager.initialize(scene, (puzzle, arrivalGate) => {
  // A pole action under way completes at once: its creature belongs to the
  // area the player just left
  AbsorbManager.finishNow();
  HintMemory.arm(puzzle && puzzle.teaches);
  keyHints.hideAll();
  if (arrivalGate && arrivalGate.ending) endingOverlay.show();
});

// The deployable waystone gate's aiming phantom renders in the main scene
DeployManager.initialize(scene);

// The pole draws in a scene of its own, lit like this one (main view only)
AbsorbManager.initialize(scene);

// Staff textures go to the GPU in idle time, not in the frame of the first
// pass that shows them (a door into a neighbour built after the start gate)
NotationDisplay.uploadInIdleTime(renderer);

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
    AbsorbManager.reset(); // fresh world: the pole in hand
    PortalManager.enterWorld(puzzleData);
    DeployManager.reset(); // fresh world: no phantom, no deployed gate
    calmStorm(); // ...and a calm sky: nothing of the last world's storm
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
  AbsorbManager.reset();
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
  // Handed back to the editor: the last frame stays as the player left it
  if (handedBack) return;
  // The controller first: its buttons go out as their keys, and its sticks
  // feed this frame's motion and look (render) while the world is awake, or
  // step through the menu that's open
  Gamepad.poll(
    gameState.mode === 'PLAYING' && !startGate.visible,
    gameState.mode !== 'PLAYING' && !startGate.visible
  );
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
    // The pole's action, after the creatures it holds have updated
    AbsorbManager.update(deltaTime);
    DeployManager.update();
    // The sky: its drift, its lightning, and its answer to a gate being solved
    tickEnvironment(deltaTime, PortalManager.getActiveArea());
    inventoryUI.update();
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
  // scene renders. The deployed waystone gate goes FIRST: it pre-renders
  // door views for its own mapped eye (so doors inside its panels are
  // see-through), then the regular door pass re-renders them for the
  // player's real eye — each surface shows its last completed write.
  motion(scene, (webglRenderer, playerCamera) => {
    // World matrices update once a frame per scene, not once a pass
    // (core/sceneMatrices): the main scene's here, before anything draws it
    beginFrame();
    updateSceneMatrices(scene);
    // While the start gate holds the world still, compile the shader
    // programs the first note / first open door would otherwise compile
    // mid-game (neighbors are warmed as they finish loading)
    if (startGate.visible) ShaderPrewarm.run(webglRenderer, scene, portalScenes());
    DeployManager.renderPortal(webglRenderer, playerCamera);
    PortalManager.renderPortals(webglRenderer, playerCamera);
  });
  // The pole, over the main view only (never a door pass)
  AbsorbManager.render(renderer, camera);
}

const gameLoop = new GameLoop(update, render);

/** Where the player's eye is and how it looks, in game coordinates. */
function currentPose() {
  return {
    position: camera.position.toArray(),
    quaternion: camera.quaternion.toArray(),
    fov: camera.fov,
  };
}

/** Resolves on the next animation frame (after that frame's render). */
function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

// The editor's Play waits at most this long for the staves to engrave before
// the game is shown anyway (one that never loads must not hold it forever)
const STAFF_WAIT_MS = 3000;

/**
 * In the editor's Play: once every staff has its texture and frames of the
 * world at the spawn have been drawn and painted, tell the editor, which
 * fades over to this frame and says GO.
 */
async function announceReady() {
  const deadline = performance.now() + STAFF_WAIT_MS;
  while (NotationDisplay.engravingsPending() > 0 && performance.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await nextFrame();
  }
  await nextFrame();
  await nextFrame();
  await afterNextPaint();
  tellEditor({ type: PREVIEW_READY, puzzleId: launch.puzzleId, pose: currentPose() });
}

/**
 * The editor's GO: the game is on screen. It takes the keyboard and the
 * controller, and the veiled start gate lifts (core/playLink).
 */
function goFromEditor() {
  window.focus();
  Gamepad.setActive(true);
  startGate.reveal();
}

/**
 * Back to Editor (the pause menu's entry, Cmd/Ctrl+Enter). Inside the
 * editor's Play: the world holds still with no menu over it, the sound fades
 * out, the pad goes back to the editor, and the editor is told where the
 * player stands (it fades in at that view, then glides home). In a tab of
 * its own: the editor loads here, on the level.
 */
async function leaveForEditor() {
  if (!inEditor) {
    backToEditor(launch.puzzleId);
    return;
  }
  if (handedBack) return;
  handedBack = true;
  Gamepad.setActive(false);
  // The library's master gain only: the player's sound setting stays
  audioContextManager.setMuted(true);
  if (pauseMenu) pauseMenu.hide();
  keyHints.hideAll();
  const report = {
    areaId: gameState.currentPuzzle ? gameState.currentPuzzle.id : null,
    pose: currentPose(),
    sky: environmentClock(), // the editor fades in under the same clouds
  };
  await afterNextPaint(); // the menu gone from the frame the editor fades from
  backToEditor(launch.puzzleId, report);
}

// Keyboard handler for pause and metronome
function handleKeyDown(event) {
  if (handedBack) return;
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

  // Inside the editor's Play the gate stays unseen (the editor shows its own
  // view until this game's first frame is ready) and the pad stays the
  // editor's until GO. Cmd/Ctrl+Enter goes back, start gate or not.
  // The world is built only once the editor's camera has landed at the eye
  // (PREVIEW_LANDED): the frame shares the editor's main thread, and the
  // build and first frame would stutter the glide.
  let editorLanded = Promise.resolve();
  if (inEditor) {
    startGate.veil();
    Gamepad.setActive(false);
    editorLanded = new Promise((resolve) => {
      window.addEventListener('message', (event) => {
        if (isFromEditor(event, PREVIEW_LANDED)) {
          // The editor's sky, so the first frame shows its clouds
          if (event.data.sky) setEnvironmentClock(event.data.sky);
          resolve();
        } else if (isFromEditor(event, PREVIEW_GO)) goFromEditor();
      });
    });
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.code === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          leaveForEditor();
        }
      },
      true
    );
    tellEditor({ type: PREVIEW_WAITING, puzzleId: launch.puzzleId });
  }

  // A deep link — the editor's Play (?puzzle=<id>&from=editor,
  // core/playLink) or a plain ?puzzle=<id> — fetches its puzzle alongside
  // the manifest instead of after it. It is entered only if the manifest
  // lists it; startPuzzle reports a failed load.
  const { puzzleId: requestedPuzzle, fromEditor } = launch;
  const requestedLoad = requestedPuzzle ? PuzzleLoader.load(requestedPuzzle) : null;
  if (requestedLoad) requestedLoad.catch(() => {});

  // Load puzzle list
  const puzzles = await PuzzleLoader.loadPuzzleList();

  // Create menus
  mainMenu = new MainMenu(puzzles, startPuzzle, ProgressManager);
  // Launched from the editor: its pause menu leads back there, on the level
  // the editor played
  const onBackToEditor = fromEditor ? leaveForEditor : null;
  pauseMenu = new PauseMenu(resumeGame, exitToMenu, nextPuzzle, onBackToEditor);

  // Register states
  stateMachine.registerState('MENU', new MenuState(gameState, mainMenu));
  stateMachine.registerState('PLAYING', new PlayingState(gameState));
  stateMachine.registerState('PAUSED', new PausedState(gameState, pauseMenu));

  // Deep link (the editor's Play): ?puzzle=<id> jumps straight in, at the
  // puzzle's player spawn, the start gate up (audio needs a gesture).
  // Checked (and awaited) first so the menu never flashes while a puzzle loads.
  const listed = Boolean(requestedPuzzle) && puzzles.some((p) => p.id === requestedPuzzle);
  if (listed) {
    await editorLanded;
    await startPuzzle(requestedPuzzle, requestedLoad);
  }
  if (inEditor && gameState.mode !== 'PLAYING') {
    // The editor's level, or nothing: it says why and takes its view back
    tellEditor({
      type: PREVIEW_FAILED,
      puzzleId: requestedPuzzle,
      message: listed
        ? `Couldn't load "${requestedPuzzle}"`
        : `"${requestedPuzzle}" isn't in the manifest`,
    });
    return;
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
  Gamepad.initialize();
  InputDevice.initialize();

  // Start game loop
  gameLoop.start();

  if (inEditor) announceReady();
}

// Dev-only introspection handle (used by tests/tooling; not part of the game)
if (import.meta.env.DEV) {
  window.__resoundDebug = {
    gameState,
    scene,
    AbsorbManager,
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
    // Run the pole's absorb/release animations `factor` times slower (1 =
    // normal), so frames mid-animation can be screenshotted.
    // Usage: window.__resoundDebug.setPoleSlowmo(10)
    setPoleSlowmo(factor = 1) {
      return AbsorbManager.setSlowmo(factor);
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
          [Waystone.prototype, 'update', 'entity.waystone'],
          [WaystoneGatePad.prototype, 'update', 'entity.waystoneGatePad'],
          [PortalManager, '_mirrorDoorPairs', 'areas.mirrorDoorPairs'],
          [PortalManager, '_updateTempoGradient', 'areas.tempoGradient'],
          [PortalManager, 'update', 'update.crossing'],
          [DeployManager, 'update', 'update.deploy'],
          [AbsorbManager, 'update', 'update.pole'],
          [inventoryUI, 'update', 'update.inventoryUI'],
          [keyHints, 'update', 'update.keyHints'],
          [debugUI, 'update', 'update.debugUI'],
          [cameraModeBadge, 'update', 'update.cameraBadge'],
          [ShaderPrewarm, 'run', 'render.prewarm'],
          [DeployManager, 'renderPortal', 'render.waystoneGate'],
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
    DeployManager,
    PuzzleLoader,
    ShaderPrewarm,
    // resound-sound's context and master output (a check that a page is muted)
    audioContextManager,
  };
}

// Start the game
initializeGame().catch((error) => {
  console.error('Failed to initialize game:', error);
});
