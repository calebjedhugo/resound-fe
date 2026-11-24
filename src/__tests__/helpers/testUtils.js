/**
 * Integration test utilities
 * Provides createTestContext() - loads real puzzles and runs the actual game loop
 */

import gameState from 'core/GameState';
import Area from 'core/Area';
import ListeningManager from 'core/ListeningManager';
import { Random } from 'resound-sound';
import AbsorbManager from 'core/AbsorbManager';
import Tape from 'core/Tape';
import PortalManager from 'core/PortalManager';
import PuzzleLoader from 'core/PuzzleLoader';
import { getFloorY, getEffectiveElevation } from 'core/ElevationMovement';
import resolveSlide from 'core/SlideResolver';
import { PLAYER_COLLISION_RADIUS, PLAYER_SIZE } from 'core/constants';
import Creature from 'entities/Creature';
import Entity from 'entities/Entity';
import Gate from 'entities/Gate';
import Fountain from 'entities/Fountain';
import { MockScene } from './mocks';

// Import test puzzle fixtures
import recordingBasic from '../fixtures/puzzles/recording-basic.json';
import recordingOutOfRange from '../fixtures/puzzles/recording-out-of-range.json';
import recordingTwoCreatures from '../fixtures/puzzles/recording-two-creatures.json';
import recordingChord from '../fixtures/puzzles/recording-chord.json';
import recordingLongInterval from '../fixtures/puzzles/recording-long-interval.json';
import playbackBasic from '../fixtures/puzzles/playback-basic.json';
import listeningGateBasic from '../fixtures/puzzles/listening-gate-basic.json';
import listeningFountainBasic from '../fixtures/puzzles/listening-fountain-basic.json';
import listeningGateOutOfRange from '../fixtures/puzzles/listening-gate-out-of-range.json';
import listeningGateWrongSong from '../fixtures/puzzles/listening-gate-wrong-song.json';
import listeningGateMultiNote from '../fixtures/puzzles/listening-gate-multi-note.json';
import listeningFountainMultiNote from '../fixtures/puzzles/listening-fountain-multi-note.json';
import creatureMovementBasic from '../fixtures/puzzles/creature-movement-basic.json';
import creatureConsonance from '../fixtures/puzzles/creature-consonance.json';
import creatureDissonance from '../fixtures/puzzles/creature-dissonance.json';
import creaturePerfectInterval from '../fixtures/puzzles/creature-perfect-interval.json';
import creatureAudibleRange from '../fixtures/puzzles/creature-audible-range.json';
import creatureSingingTiming from '../fixtures/puzzles/creature-singing-timing.json';
import creatureTwoCreaturesHarmony from '../fixtures/puzzles/creature-two-creatures-harmony.json';
import parseWallBasic from '../fixtures/puzzles/parse-wall-basic.json';
import parseRampBasic from '../fixtures/puzzles/parse-ramp-basic.json';
import parseUnknownEntity from '../fixtures/puzzles/parse-unknown-entity.json';
import elevationBasic from '../fixtures/puzzles/elevation-basic.json';
import elevationRamp from '../fixtures/puzzles/elevation-ramp.json';
import creatureElevationRamp from '../fixtures/puzzles/creature-elevation-ramp.json';
import creatureElevationBlocked from '../fixtures/puzzles/creature-elevation-blocked.json';
import creatureWallSlide from '../fixtures/puzzles/creature-wall-slide.json';
import portalA from '../fixtures/puzzles/portal-a.json';
import portalB from '../fixtures/puzzles/portal-b.json';
import portalLiveA from '../fixtures/puzzles/portal-live-a.json';
import portalLiveB from '../fixtures/puzzles/portal-live-b.json';
import portalSelf from '../fixtures/puzzles/portal-self.json';
import portalSelfWalled from '../fixtures/puzzles/portal-self-walled.json';
import portalSelfAdjacent from '../fixtures/puzzles/portal-self-adjacent.json';
import portalOneway from '../fixtures/puzzles/portal-oneway.json';
import portalWallsA from '../fixtures/puzzles/portal-walls-a.json';
import portalWallsB from '../fixtures/puzzles/portal-walls-b.json';
import deployBasic from '../fixtures/puzzles/deploy-basic.json';
import portalTwoPairs from '../fixtures/puzzles/portal-two-pairs.json';

/**
 * A TEST SINGER: a sound source standing where the player stands, singing a
 * song once (ctx.startSinging). The player sang the tape until 2026-11-23;
 * tests of what a heard song does — gates and fountains judging it, the
 * harmony forces and colour it gives creatures, the storm's answer — still
 * need a source they control, so it takes the tape's place: it sounds from
 * the player's position in the player's area, carrying `range`, and every
 * listener hears it as it heard any source (ListeningManager, the area's
 * entities for the forces, doorways). Test-only: nothing in the game sings
 * for the player.
 */
class TestSinger extends Entity {
  constructor(range) {
    super('singer', null);
    this.size = PLAYER_SIZE;
    this.range = range;
    this.currentNote = null;
    this.instrument = new Random('singer');
    this.instrument.noteCallback = (noteEvent) => {
      this.currentNote = noteEvent;
      noteEvent.sourceRange = this.range;
      noteEvent.sourceArea = this.area || gameState.activeArea;
      ListeningManager.emitNote(noteEvent);
    };
  }

  // Always where the player is (the player's position object is replaced
  // by moves and teleports)
  get position() {
    return gameState.player.position;
  }

  // eslint-disable-next-line class-methods-use-this
  set position(_) {
    // Entity's constructor assigns one; the player's is the singer's
  }

  update() {
    this.instrument.sourcePosition = gameState.player.position;
  }

  sing(song, tempo) {
    this.instrument.sourcePosition = gameState.player.position;
    this.instrument.play({ data: song, tempo, basis: 4 });
  }

  stop() {
    this.currentNote = null;
    this.instrument.stop();
  }

  dispose() {
    this.instrument.dispose();
  }
}

// Puzzle fixture registry
const TEST_PUZZLES = {
  'recording-basic': recordingBasic,
  'recording-out-of-range': recordingOutOfRange,
  'recording-two-creatures': recordingTwoCreatures,
  'recording-chord': recordingChord,
  'recording-long-interval': recordingLongInterval,
  'playback-basic': playbackBasic,
  'listening-gate-basic': listeningGateBasic,
  'listening-fountain-basic': listeningFountainBasic,
  'listening-gate-out-of-range': listeningGateOutOfRange,
  'listening-gate-wrong-song': listeningGateWrongSong,
  'listening-gate-multi-note': listeningGateMultiNote,
  'listening-fountain-multi-note': listeningFountainMultiNote,
  'creature-movement-basic': creatureMovementBasic,
  'creature-consonance': creatureConsonance,
  'creature-dissonance': creatureDissonance,
  'creature-perfect-interval': creaturePerfectInterval,
  'creature-audible-range': creatureAudibleRange,
  'creature-singing-timing': creatureSingingTiming,
  'creature-two-creatures-harmony': creatureTwoCreaturesHarmony,
  'parse-wall-basic': parseWallBasic,
  'parse-ramp-basic': parseRampBasic,
  'parse-unknown-entity': parseUnknownEntity,
  'elevation-basic': elevationBasic,
  'elevation-ramp': elevationRamp,
  'creature-elevation-ramp': creatureElevationRamp,
  'creature-elevation-blocked': creatureElevationBlocked,
  'creature-wall-slide': creatureWallSlide,
  'portal-a': portalA,
  'portal-b': portalB,
  'portal-live-a': portalLiveA,
  'portal-live-b': portalLiveB,
  'portal-self': portalSelf,
  'portal-self-walled': portalSelfWalled,
  'portal-self-adjacent': portalSelfAdjacent,
  'portal-oneway': portalOneway,
  'portal-walls-a': portalWallsA,
  'portal-walls-b': portalWallsB,
  'deploy-basic': deployBasic,
  'portal-two-pairs': portalTwoPairs,
};

/**
 * Create an integration test context
 * @param {Object} options - { tempo: number }
 */
function createTestContext(options = {}) {
  const { tempo = 120 } = options;

  // Reset all state (the world orchestrator owns/disposes any leftover areas;
  // each test is a fresh world, so puzzle files are fetched afresh too)
  PortalManager.reset();
  PuzzleLoader.clearCache();
  gameState.reset();
  ListeningManager.clear();
  AbsorbManager.reset();

  // The world's render scene (the active area's content group lives here)
  const mockScene = new MockScene();
  PortalManager.initialize(mockScene);

  // Sandbox area: lets tests add entities directly before (or without) a
  // loadPuzzle call. Replaced by the real active area when a puzzle loads.
  gameState.activeArea = new Area(null);

  // Initialize musical clock with default tempo
  gameState.initMusicalClock(tempo);

  // Track emitted notes
  const emittedNotes = [];
  const originalEmit = ListeningManager.emitNote.bind(ListeningManager);
  ListeningManager.emitNote = (noteEvent) => {
    emittedNotes.push({
      ...noteEvent,
      capturedAtBeat: gameState.musicalClock.getCurrentBeat(),
    });
    originalEmit(noteEvent);
  };

  // Input simulation state
  const heldKeys = new Set();

  // The test singer, while one sings (startSinging)
  let singer = null;

  // The player's area's entity manager (sandbox until a puzzle loads)
  const activeEntityManager = () =>
    gameState.activeArea ? gameState.activeArea.entityManager : null;

  // What the last full collision + floor pass left: processMovement's at-rest
  // shortcut, exactly motion.js's isAtRest
  const playerRest = { valid: false, x: 0, y: 0, z: 0, elevation: 0, grid: null };

  return {
    // --- Puzzle Loading ---

    /**
     * Load a test puzzle by ID
     * @param {string} puzzleId - ID from TEST_PUZZLES registry
     */
    loadPuzzle(puzzleId) {
      const puzzleData = TEST_PUZZLES[puzzleId];
      if (!puzzleData) {
        throw new Error(
          `Test puzzle not found: ${puzzleId}. Available: ${Object.keys(TEST_PUZZLES).join(', ')}`
        );
      }

      // Validate and enter the world at this puzzle (same path as the game,
      // whose world entry re-reads puzzle files: main.js startPuzzle)
      const validated = PuzzleLoader.validate(puzzleData);
      PuzzleLoader.clearCache();
      PortalManager.enterWorld(validated);

      return validated;
    },

    /**
     * Get the active area's entity manager
     */
    getEntityManager() {
      return gameState.activeArea ? gameState.activeArea.entityManager : null;
    },

    // --- Time Control ---

    /**
     * Advance time by running game ticks (ASYNC version)
     * Also advances Jest fake timers to trigger setTimeout-based instrument notes
     * Uses runAllTimersAsync() to properly handle async/await in instruments
     * @param {number} ms - Milliseconds to advance
     */
    async tick(ms) {
      const tickSize = 16; // ~60fps
      const ticks = Math.ceil(ms / tickSize);

      for (let i = 0; i < ticks; i += 1) {
        const dt = Math.min(tickSize, ms - i * tickSize) / 1000;

        // Update musical clock
        if (gameState.musicalClock) {
          gameState.musicalClock.update(dt);
        }

        // Process player movement based on held keys
        this.processMovement(dt);

        // Update every loaded area (the sandbox area is not registered with
        // the world orchestrator, so tick it directly)
        const active = gameState.activeArea;
        if (active && active !== PortalManager.getActiveArea()) {
          active.update(dt);
        }
        PortalManager.updateAreas(dt);

        // Doorway crossing check, exactly as the game loop runs it (main.js):
        // walking into/out of an open linked gate's cell is detected per frame
        PortalManager.update();

        // The pole's action, after the areas, as the game loop runs it
        AbsorbManager.update(dt);

        // Advance Jest fake timers to trigger instrument callbacks. Must be
        // the async variant: instruments schedule successive notes through
        // await/microtask chains, and the sync variant defers all of that to
        // the end of the advance — stamping later notes with bunched, wildly
        // late timestamps that break phrase (gap-aware) matching.
        // eslint-disable-next-line no-await-in-loop
        await jest.advanceTimersByTimeAsync(tickSize);
      }

      // Flush all pending timers and microtasks to complete async instrument playback
      await jest.runAllTimersAsync();
    },

    /**
     * Advance time by n beats (async)
     * @param {number} n - Number of beats
     */
    async advanceBeats(n) {
      if (!gameState.musicalClock) {
        throw new Error('Musical clock not initialized. Load a puzzle first.');
      }
      const ms = gameState.musicalClock.beatsToMs(n);
      await this.tick(ms);
    },

    /**
     * Get current beat
     */
    getCurrentBeat() {
      return gameState.musicalClock?.getCurrentBeat() || 0;
    },

    /**
     * Advance time by milliseconds (alias for tick)
     */
    async advanceMs(ms) {
      await this.tick(ms);
    },

    /**
     * Get the musical clock for direct access
     */
    getMusicalClock() {
      return gameState.musicalClock;
    },

    // --- Input Simulation ---

    /**
     * Press and hold a key
     * @param {string} key - Key name (w, a, s, d, r, space, c, shift)
     */
    holdKey(key) {
      const k = key.toLowerCase();
      heldKeys.add(k);
      this.updateInputState();
      this.handleKeyAction(k, true);
    },

    /**
     * Release a key
     * @param {string} key - Key name
     */
    releaseKey(key) {
      const k = key.toLowerCase();
      heldKeys.delete(k);
      this.updateInputState();
    },

    /**
     * Press and immediately release a key
     * @param {string} key - Key name
     */
    pressKey(key) {
      this.holdKey(key); // holdKey now calls handleKeyAction
      this.releaseKey(key);
    },

    /**
     * Update gameState.input based on held keys
     */
    updateInputState() {
      gameState.input.keys.forward = heldKeys.has('w');
      gameState.input.keys.backward = heldKeys.has('s');
      gameState.input.keys.latLeft = heldKeys.has('a');
      gameState.input.keys.latRight = heldKeys.has('d');
      gameState.input.keys.running = heldKeys.has('shift');
    },

    /**
     * Handle key-down actions (the pole, the tape cursor) as
     * createEventListeners does in play
     */
    handleKeyAction(key, isDown) {
      if (!isDown) return;

      switch (key) {
        case 'r':
          AbsorbManager.absorb();
          break;
        case 'space':
          AbsorbManager.release();
          break;
        case 'arrowleft':
          Tape.left();
          break;
        case 'arrowright':
          Tape.right();
          break;
        default:
      }
    },

    /**
     * Run the pole's action under way to its end (absorb or release)
     */
    async finishPole() {
      for (let i = 0; i < 200 && AbsorbManager.busy; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await this.tick(16);
      }
    },

    /**
     * Process player movement based on input state
     */
    processMovement(deltaTime) {
      const baseSpeed = 4; // units per second
      const speed = gameState.input.keys.running ? baseSpeed * 2 : baseSpeed;
      const movement = speed * deltaTime;

      const oldX = gameState.player.position.x;
      const oldZ = gameState.player.position.z;

      if (gameState.input.keys.forward) {
        gameState.player.position.z -= movement;
      }
      if (gameState.input.keys.backward) {
        gameState.player.position.z += movement;
      }
      if (gameState.input.keys.latLeft) {
        gameState.player.position.x -= movement;
      }
      if (gameState.input.keys.latRight) {
        gameState.player.position.x += movement;
      }

      // Resolve the move exactly as motion.js does: elevation-aware,
      // axis-separated collision response (wall/cliff sliding), skipped
      // while the player stands exactly where the last full pass left them
      // (its isAtRest). Kept in sync with
      // src/resoundModules/playerControls/motion/motion.js.
      const { elevationGrid } = gameState;
      const { position } = gameState.player;
      if (
        playerRest.valid &&
        Object.is(position.x, oldX) &&
        Object.is(position.z, oldZ) &&
        Object.is(oldX, playerRest.x) &&
        Object.is(oldZ, playerRest.z) &&
        Object.is(position.y, playerRest.y) &&
        Object.is(gameState.player.elevation, playerRest.elevation) &&
        elevationGrid === playerRest.grid
      ) {
        return;
      }
      const priorLevel = gameState.player.elevation;
      const resolved = resolveSlide(
        { x: oldX, z: oldZ },
        { x: gameState.player.position.x, z: gameState.player.position.z },
        {
          radius: PLAYER_COLLISION_RADIUS,
          ignoreId: null,
          priorLevel,
          grid: elevationGrid || null,
          y: gameState.player.position.y,
        }
      );
      gameState.player.position.x = resolved.x;
      gameState.player.position.z = resolved.z;

      // Re-derive Y + elevation from the resolved position.
      if (elevationGrid) {
        const currentX = gameState.player.position.x;
        const currentZ = gameState.player.position.z;
        const currentGrid = elevationGrid.worldToGrid(currentX, currentZ);
        gameState.player.elevation = getEffectiveElevation(
          currentX,
          currentZ,
          currentGrid,
          elevationGrid,
          priorLevel
        );
        gameState.player.position.y =
          getFloorY(currentX, currentZ, elevationGrid, priorLevel) + 1.8;
      }
      Object.assign(playerRest, {
        valid: true,
        x: gameState.player.position.x,
        y: gameState.player.position.y,
        z: gameState.player.position.z,
        elevation: gameState.player.elevation,
        grid: elevationGrid,
      });
    },

    // --- Player State ---

    /**
     * Get player position
     */
    getPlayerPosition() {
      return { ...gameState.player.position };
    },

    /**
     * Set player position directly (for test setup). A teleport lands on the
     * cell's TOP walkable surface (deterministic setup); this seeds
     * player.elevation so the next tick's walk-under layer tracking is
     * correct. Y is (re)derived by the movement tick, as before.
     */
    setPlayerPosition(pos) {
      gameState.player.position = {
        ...gameState.player.position,
        ...pos,
      };
      const grid = gameState.elevationGrid;
      if (grid) {
        const g = grid.worldToGrid(gameState.player.position.x, gameState.player.position.z);
        const levels = grid.getLevelsAt(g.x, g.z);
        gameState.player.elevation = levels[levels.length - 1];
      }
    },

    /**
     * Face a heading, the mouse at rest: yaw 0 looks north (-z), -PI/2
     * east (+x), PI/2 west, PI south
     * @param {number} yaw
     */
    face(yaw) {
      gameState.camera.viewCenter = [yaw, gameState.camera.viewCenter[1] || 0];
    },

    /** Face a point (horizontally), the mouse at rest. */
    faceToward(pos) {
      const { position } = gameState.player;
      this.face(Math.atan2(-(pos.x - position.x), -(pos.z - position.z)));
    },

    // --- Inventory ---

    /**
     * The creature spec a slot holds (Creature.toSpec), or null
     */
    getInventorySlot(slot) {
      const item = gameState.player.inventory[slot];
      return item ? item.spec : null;
    },

    /**
     * Put a creature spec straight into a slot (test setup; null empties
     * it). The tape is a dynamic array — grow it (with empty slots) to reach
     * the requested index.
     */
    setInventorySlot(slot, spec) {
      while (gameState.player.inventory.length <= slot) {
        gameState.player.inventory.push(null);
      }
      gameState.player.inventory[slot] = spec
        ? {
            id: `test_${slot}_${Math.random()}`,
            spec,
            colour: [1, 1, 1],
            css: 'rgb(255, 255, 255)',
          }
        : null;
    },

    /**
     * Get active inventory slot index
     */
    getActiveSlot() {
      return gameState.player.activeSlot;
    },

    /**
     * Set active inventory slot
     */
    setActiveSlot(slot) {
      gameState.player.activeSlot = slot;
    },

    // --- Entities ---

    /**
     * Add a creature directly (for backwards compatibility with old tests)
     * Prefer using loadPuzzle() for true integration tests
     */
    addCreature(config) {
      const position = {
        x: config.position?.x || 0,
        y: config.position?.y || 0,
        z: config.position?.z || 0,
      };

      const creature = new Creature(position, {
        song: config.song || [{ pitch: 'C4', length: '1/4' }],
        interval: config.interval || 4,
        audibleRange: config.audibleRange || 15,
        voice: config.voice,
      });

      activeEntityManager().add(creature);
      return creature;
    },

    /**
     * Add a gate directly (for backwards compatibility)
     */
    addGate(config) {
      const position = {
        x: config.position?.x || 0,
        y: config.position?.y || 0,
        z: config.position?.z || 0,
      };

      const gate = new Gate(position, {
        song: config.requiredSong || config.song || [],
      });

      activeEntityManager().add(gate);
      return gate;
    },

    /**
     * Add a fountain directly (for backwards compatibility)
     */
    addFountain(config) {
      const position = {
        x: config.position?.x || 0,
        y: config.position?.y || 0,
        z: config.position?.z || 0,
      };

      const fountain = new Fountain(position, {
        song: config.requiredSong || config.song || [],
      });

      activeEntityManager().add(fountain);
      return fountain;
    },

    /**
     * Get all creatures
     */
    getCreatures() {
      return activeEntityManager().getByType('creature');
    },

    /**
     * Get all gates
     */
    getGates() {
      return activeEntityManager().getByType('gate');
    },

    /**
     * Get all fountains
     */
    getFountains() {
      return activeEntityManager().getByType('fountain');
    },

    /**
     * Check if a gate is open
     */
    isGateOpen(gateOrId) {
      const gate = typeof gateOrId === 'string' ? activeEntityManager().get(gateOrId) : gateOrId;
      return gate?.isOpen || false;
    },

    /**
     * Check if a fountain is active
     */
    isFountainActive(fountainOrId) {
      const fountain =
        typeof fountainOrId === 'string' ? activeEntityManager().get(fountainOrId) : fountainOrId;
      return fountain?.isActivated || false;
    },

    // --- A test singer (the tape's stand-in: see TestSinger) ---

    /**
     * A source at the player's position sings `song` once
     * @param {Array} song - notes/chords
     * @param {number} [tempoBpm] - default: the world clock's tempo
     * @param {number} [range] - how far it carries (default 15)
     */
    startSinging(song, tempoBpm, range = 15) {
      this.stopSinging();
      const area = gameState.activeArea;
      singer = new TestSinger(range);
      area.entityManager.add(singer);
      singer.sing(song.data || song, tempoBpm || gameState.musicalClock?.tempo || 120);
      return singer;
    },

    /**
     * The test singer stops and leaves (nothing if none sings)
     */
    stopSinging() {
      if (!singer) return;
      singer.stop();
      if (singer.area && singer.area.entityManager.get(singer.id)) {
        singer.area.entityManager.remove(singer.id);
      }
      singer = null;
    },

    // --- The pole ---

    /**
     * Creatures the pole can reach now
     */
    getCreaturesInRange() {
      return [...gameState.absorb.inRange];
    },

    // --- Notes ---

    /**
     * Get all emitted notes since context creation
     */
    getEmittedNotes() {
      return [...emittedNotes];
    },

    /**
     * Clear emitted notes
     */
    clearEmittedNotes() {
      emittedNotes.length = 0;
    },

    // --- Elevation ---

    /**
     * Get player's current elevation level
     */
    getPlayerElevation() {
      return gameState.player.elevation;
    },

    /**
     * The top walkable level of a grid cell
     */
    getElevationAt(gridX, gridZ) {
      return gameState.elevationGrid?.nearestLevel(gridX, gridZ) ?? 0;
    },

    /**
     * Query the ramp grid at a grid coordinate
     */
    getRampAt(gridX, gridZ) {
      return gameState.elevationGrid?.getRamp(gridX, gridZ) ?? null;
    },

    // --- Debug ---

    /**
     * Get debug info
     */
    debug() {
      return {
        beat: gameState.musicalClock?.getCurrentBeat() || 0,
        playerPosition: { ...gameState.player.position },
        inventory: gameState.player.inventory.map((item) => (item ? item.spec.song : null)),
        activeSlot: gameState.player.activeSlot,
        pole: AbsorbManager.kind,
        creaturesInRange: gameState.absorb.inRange.length,
        heldKeys: Array.from(heldKeys),
        creatures: activeEntityManager()
          .getByType('creature')
          .map((c) => ({
            id: c.id,
            position: { ...c.position },
          })),
        emittedNotes: emittedNotes.length,
      };
    },

    // --- Cleanup ---

    /**
     * Clean up test context
     */
    cleanup() {
      ListeningManager.emitNote = originalEmit;
      this.stopSinging();
      AbsorbManager.reset();
      // Dispose the sandbox area (if still active) plus every world area
      const sandbox = gameState.activeArea;
      PortalManager.reset();
      if (sandbox && sandbox.id === null) {
        sandbox.dispose();
      }
      ListeningManager.clear();
      gameState.reset();
      heldKeys.clear();
      emittedNotes.length = 0;
    },
  };
}

export { createTestContext, TEST_PUZZLES };
