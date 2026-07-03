/**
 * Integration test utilities
 * Provides createTestContext() - loads real puzzles and runs the actual game loop
 */

import gameState from 'core/GameState';
import EntityManager from 'entities/EntityManager';
import ListeningManager from 'core/ListeningManager';
import RecordingManager from 'core/RecordingManager';
import PlaybackManager from 'core/PlaybackManager';
import ClapManager from 'core/ClapManager';
import PuzzleLoader from 'core/PuzzleLoader';
import { getFloorY, getEffectiveElevation, canTraverse } from 'core/ElevationMovement';
import Creature from 'entities/Creature';
import Gate from 'entities/Gate';
import Fountain from 'entities/Fountain';
import { MockScene } from './mocks';

// Import test puzzle fixtures
import recordingBasic from '../fixtures/puzzles/recording-basic.json';
import recordingMultiNote from '../fixtures/puzzles/recording-multi-note.json';
import recordingOutOfRange from '../fixtures/puzzles/recording-out-of-range.json';
import recordingTwoCreatures from '../fixtures/puzzles/recording-two-creatures.json';
import recordingChord from '../fixtures/puzzles/recording-chord.json';
import recordingLongInterval from '../fixtures/puzzles/recording-long-interval.json';
import clapBasic from '../fixtures/puzzles/clap-basic.json';
import clapOutOfRange from '../fixtures/puzzles/clap-out-of-range.json';
import clapCustomDisplacement from '../fixtures/puzzles/clap-custom-displacement.json';
import clapPerCreatureDisplacement from '../fixtures/puzzles/clap-per-creature-displacement.json';
import clapTwoCreatures from '../fixtures/puzzles/clap-two-creatures.json';
import playbackBasic from '../fixtures/puzzles/playback-basic.json';
import playbackMultiNote from '../fixtures/puzzles/playback-multi-note.json';
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

// Puzzle fixture registry
const TEST_PUZZLES = {
  'recording-basic': recordingBasic,
  'recording-multi-note': recordingMultiNote,
  'recording-out-of-range': recordingOutOfRange,
  'recording-two-creatures': recordingTwoCreatures,
  'recording-chord': recordingChord,
  'recording-long-interval': recordingLongInterval,
  'clap-basic': clapBasic,
  'clap-out-of-range': clapOutOfRange,
  'clap-custom-displacement': clapCustomDisplacement,
  'clap-per-creature-displacement': clapPerCreatureDisplacement,
  'clap-two-creatures': clapTwoCreatures,
  'playback-basic': playbackBasic,
  'playback-multi-note': playbackMultiNote,
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
};

/**
 * Create an integration test context
 * @param {Object} options - { tempo: number }
 */
function createTestContext(options = {}) {
  const { tempo = 120 } = options;

  // Reset all state
  gameState.reset();
  ListeningManager.clear();
  ClapManager.reset();

  // Create mock scene and entity manager
  const mockScene = new MockScene();
  const entityManager = new EntityManager(mockScene);

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

      // Validate and parse the puzzle
      const validated = PuzzleLoader.validate(puzzleData);
      PuzzleLoader.parse(validated, entityManager, gameState);

      return validated;
    },

    /**
     * Get the entity manager
     */
    getEntityManager() {
      return entityManager;
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

        // Update clap manager
        ClapManager.update();

        // Update all entities
        entityManager.update(dt);

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

      // Handle key-up actions
      if (k === 'r' && RecordingManager.isRecording()) {
        RecordingManager.stopRecording();
      }
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
     * Handle key-down actions (recording, playback, etc.)
     */
    handleKeyAction(key, isDown) {
      if (!isDown) return;

      switch (key) {
        case 'r':
          if (!RecordingManager.isRecording()) {
            RecordingManager.startRecording();
          }
          break;
        case 'space':
          PlaybackManager.playActiveSlot();
          break;
        case 'c':
          ClapManager.requestClap();
          break;
        case 'arrowleft':
          gameState.player.activeSlot =
            (gameState.player.activeSlot - 1 + gameState.player.maxInventorySize) %
            gameState.player.maxInventorySize;
          break;
        case 'arrowright':
          gameState.player.activeSlot =
            (gameState.player.activeSlot + 1) % gameState.player.maxInventorySize;
          break;
        default:
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

      // Elevation check
      const elevationGrid = gameState.elevationGrid;
      if (elevationGrid) {
        const newX = gameState.player.position.x;
        const newZ = gameState.player.position.z;
        const oldGrid = elevationGrid.worldToGrid(oldX, oldZ);
        const newGrid = elevationGrid.worldToGrid(newX, newZ);

        // Check traversal when grid cell changes
        if (oldGrid.x !== newGrid.x || oldGrid.z !== newGrid.z) {
          const oldElev = getEffectiveElevation(oldX, oldZ, oldGrid, elevationGrid);
          const newElev = getEffectiveElevation(newX, newZ, newGrid, elevationGrid);

          if (!canTraverse(oldGrid, newGrid, oldElev, newElev, elevationGrid)) {
            gameState.player.position.x = oldX;
            gameState.player.position.z = oldZ;
          }
        }

        // Always update Y and elevation based on current position
        const currentX = gameState.player.position.x;
        const currentZ = gameState.player.position.z;
        const currentGrid = elevationGrid.worldToGrid(currentX, currentZ);
        gameState.player.elevation = getEffectiveElevation(
          currentX,
          currentZ,
          currentGrid,
          elevationGrid
        );
        gameState.player.position.y = getFloorY(currentX, currentZ, elevationGrid) + 1.8;
      }
    },

    // --- Player State ---

    /**
     * Get player position
     */
    getPlayerPosition() {
      return { ...gameState.player.position };
    },

    /**
     * Set player position directly (for test setup)
     */
    setPlayerPosition(pos) {
      gameState.player.position = {
        ...gameState.player.position,
        ...pos,
      };
    },

    // --- Inventory ---

    /**
     * Get recorded song from inventory slot
     */
    getInventorySlot(slot) {
      const item = gameState.player.inventory[slot];
      return item ? item.data : null;
    },

    /**
     * Set inventory slot directly (for test setup)
     */
    setInventorySlot(slot, song) {
      if (song) {
        gameState.player.inventory[slot] = {
          id: `test_${Date.now()}`,
          data: song,
          recordedAt: Date.now(),
          tempo: gameState.musicalClock?.tempo || 120,
        };
      } else {
        gameState.player.inventory[slot] = null;
      }
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
      });

      entityManager.add(creature);
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

      entityManager.add(gate);
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

      entityManager.add(fountain);
      return fountain;
    },

    /**
     * Start recording (for backwards compatibility)
     */
    startRecording() {
      RecordingManager.startRecording();
    },

    /**
     * Stop recording (for backwards compatibility)
     */
    stopRecording() {
      RecordingManager.stopRecording();
    },

    /**
     * Get all creatures
     */
    getCreatures() {
      return entityManager.getByType('creature');
    },

    /**
     * Get all gates
     */
    getGates() {
      return entityManager.getByType('gate');
    },

    /**
     * Get all fountains
     */
    getFountains() {
      return entityManager.getByType('fountain');
    },

    /**
     * Check if a gate is open
     */
    isGateOpen(gateOrId) {
      const gate = typeof gateOrId === 'string' ? entityManager.get(gateOrId) : gateOrId;
      return gate?.isActivated || false;
    },

    /**
     * Check if a fountain is active
     */
    isFountainActive(fountainOrId) {
      const fountain =
        typeof fountainOrId === 'string' ? entityManager.get(fountainOrId) : fountainOrId;
      return fountain?.isActivated || false;
    },

    // --- Playback ---

    /**
     * Start player playback for a song (for test setup)
     * @param {Object} song - Song object with data array
     * @param {number} tempo - Tempo in BPM (default: puzzle tempo)
     */
    startPlayerPlayback(song, tempo) {
      const playerInstrument = PlaybackManager.getPlayerInstrument();
      playerInstrument.sourcePosition = this.getPlayerPosition();
      playerInstrument.play({
        data: song.data || song,
        tempo: tempo || gameState.musicalClock?.tempo || 120,
        basis: 4,
      });
      PlaybackManager.isPlaying = true;
    },

    /**
     * Stop player playback and reset state
     */
    stopPlayerPlayback() {
      PlaybackManager.isPlaying = false;
      const playerInstrument = PlaybackManager.getPlayerInstrument();
      playerInstrument.currentNote = null;
      playerInstrument.stop?.();
    },

    /**
     * Reset playback state (for test cleanup)
     */
    resetPlaybackState() {
      PlaybackManager.isPlaying = false;
      const playerInstrument = PlaybackManager.getPlayerInstrument();
      playerInstrument.currentNote = null;
      playerInstrument.stop?.();
    },

    // --- Recording ---

    /**
     * Check if recording is active
     */
    isRecording() {
      return RecordingManager.isRecording();
    },

    /**
     * Get creatures currently in recording range
     */
    getCreaturesInRange() {
      return [...gameState.recording.creaturesInRange];
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
     * Query the elevation grid at a grid coordinate
     */
    getElevationAt(gridX, gridZ) {
      return gameState.elevationGrid?.getElevation(gridX, gridZ) ?? 0;
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
        inventory: gameState.player.inventory.map((item) => (item ? item.data : null)),
        activeSlot: gameState.player.activeSlot,
        isRecording: RecordingManager.isRecording(),
        creaturesInRange: gameState.recording.creaturesInRange.length,
        heldKeys: Array.from(heldKeys),
        creatures: entityManager.getByType('creature').map((c) => ({
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
      ListeningManager.clear();
      entityManager.clear();
      gameState.reset();
      heldKeys.clear();
      emittedNotes.length = 0;
    },
  };
}

export { createTestContext, TEST_PUZZLES };
