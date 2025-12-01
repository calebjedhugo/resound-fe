import * as THREE from 'three';
import Random from 'audio/instruments/Random';
import gameState from 'core/GameState';
import ListeningManager from 'core/ListeningManager';
import HarmonyAnalyzer from 'core/HarmonyAnalyzer';
import PlaybackManager from 'core/PlaybackManager';
import CollisionDetector from 'core/CollisionDetector';
import { getDistance, getDistanceVolume } from 'core/utils';
import {
  RECORDING_RANGE_PERCENTAGE,
  DEFAULT_CREATURE_MAX_SPEED,
  DEFAULT_CREATURE_SIZE,
  PLAYER_SIZE,
  CREATURE_DECELERATION,
  ATTRACTION_FORCE_STRENGTH,
  REPULSION_FORCE_STRENGTH,
} from 'core/constants';
import Entity from './Entity';

class Creature extends Entity {
  constructor(position, data = {}) {
    super('creature', position, data);

    // Validate required data
    if (!data.song || !Array.isArray(data.song) || data.song.length === 0) {
      throw new Error('Creature requires a song array');
    }

    // Song data
    this.song = data.song;
    this.interval = data.interval || 8; // Quarter notes between songs
    this.audibleRange = data.audibleRange || 15; // World units
    this.recordingRange = this.audibleRange * RECORDING_RANGE_PERCENTAGE;

    // Physical properties
    this.size = data.size || DEFAULT_CREATURE_SIZE; // Radius in world units

    // Movement properties
    this.maxSpeed = data.maxSpeed || DEFAULT_CREATURE_MAX_SPEED;
    this.velocity = { x: 0, z: 0 };
    this.forces = []; // Accumulated forces from sound sources

    // Track current note being sung (for harmony analysis)
    this.currentNote = null;

    // Create unique instrument for this creature
    this.instrument = new Random(this.id);
    this.instrument.sourcePosition = this.position; // Set source position for listening

    // Set up note callback to emit to ListeningManager (for gates/fountains/creatures)
    this.instrument.noteCallback = (noteEvent) => {
      // Track current note for harmony analysis
      this.currentNote = noteEvent;

      // Emit to listening manager
      ListeningManager.emitNote(noteEvent);
    };

    // Singing timing (based on musical clock beats)
    // Initialize to next beat boundary to prevent drift
    const currentBeat = gameState.musicalClock?.getCurrentBeat() || 0;
    this.nextSingBeat = Math.ceil(currentBeat); // Next integer beat

    // Recording state
    this.isRecordable = false; // Is player in recording range?

    this.createMesh();

    // Register as listener for harmony-based movement
    ListeningManager.registerListener(this);
  }

  createMesh() {
    // Simple sphere creature
    const geometry = new THREE.SphereGeometry(this.size, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      roughness: 0.5,
      metalness: 0.2,
      emissive: 0x003300, // Slight glow
      emissiveIntensity: 0.2,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.position.x, this.position.y + this.size, this.position.z);
  }

  update(deltaTime) {
    // Skip if no musical clock initialized
    if (!gameState.musicalClock) return;

    const currentBeat = gameState.musicalClock.getCurrentBeat();

    // Check if it's time to sing (deterministic based on musical time)
    if (currentBeat >= this.nextSingBeat && !this.instrument.playbackState.isPlaying) {
      this.sing();
      // Maintain schedule to prevent drift
      this.nextSingBeat += this.interval;
    }

    // Calculate distance to player
    const distance = getDistance(this.position, gameState.player.position);

    // Update volume based on distance (inverse square law)
    if (distance <= this.audibleRange) {
      const volume = getDistanceVolume(distance, this.audibleRange);
      this.instrument.updateVolume(volume);

      // Check if in recording range
      this.isRecordable = distance <= this.recordingRange;
    } else {
      // Too far - silence
      this.instrument.updateVolume(0);
      this.isRecordable = false;
    }

    // Update creatures in range for recording UI
    this.updateRecordingState();

    // Calculate forces from nearby playing sources (continuous while harmonies exist)
    this.calculateForces();

    // Apply force-based movement
    this.updateMovement(deltaTime);
  }

  /**
   * Creature sings its song
   */
  sing() {
    if (!gameState.musicalClock) return;

    this.instrument.play({
      data: this.song,
      tempo: gameState.musicalClock.tempo,
      basis: 4,
    });
  }

  /**
   * Update recording state in game state
   */
  updateRecordingState() {
    const { creaturesInRange } = gameState.recording;

    if (this.isRecordable) {
      // Add to recording range if not already there
      if (!creaturesInRange.includes(this)) {
        creaturesInRange.push(this);
      }
    } else {
      // Remove from recording range
      const index = creaturesInRange.indexOf(this);
      if (index !== -1) {
        creaturesInRange.splice(index, 1);
      }
    }
  }

  /**
   * Callback when a note is played nearby (from ListeningManager)
   * Used only for logging/debug - force calculation happens in calculateForces()
   * @param {Object} noteEvent - { pitch, length, timestamp, source, sourcePosition }
   */
  onNoteCaptured(noteEvent) {
    // Ignore own notes
    if (noteEvent.source === this.id) return;

    // Only log if we're currently singing and can react
    if (!this.currentNote || !this.instrument.playbackState.isPlaying) return;

    // Check if source is within audible range
    const distance = getDistance(this.position, noteEvent.sourcePosition);
    if (distance > this.audibleRange) return;

    // Calculate harmony for logging
    const interval = HarmonyAnalyzer.calculateInterval(this.currentNote.pitch, noteEvent.pitch);
    const harmony = HarmonyAnalyzer.classifyInterval(interval);

    // Log player-creature harmonies to gameState for DebugUI
    if (noteEvent.source === 'player') {
      const harmonyEvent = {
        creature: this.id,
        creaturePitch: this.currentNote.pitch,
        playerPitch: noteEvent.pitch,
        harmony,
        interval,
        timestamp: Date.now(),
      };
      gameState.harmonyLog.push(harmonyEvent);
      // Keep only last 5 harmonies
      if (gameState.harmonyLog.length > 5) {
        gameState.harmonyLog.shift();
      }
    }
  }

  /**
   * Calculate forces from all nearby playing sources
   * Called every frame to continuously apply forces while harmonies exist
   */
  calculateForces() {
    // Clear forces from previous frame
    this.forces = [];

    // Only react if we're currently singing
    if (!this.currentNote || !this.instrument.playbackState.isPlaying) {
      return;
    }

    // Helper to add force from a source
    const addForceFromSource = (sourceNote, sourcePosition, sourceSize) => {
      // Check if within audible range
      const distance = getDistance(this.position, sourcePosition);
      if (distance > this.audibleRange) return;

      // Skip if too close (prevents numerical instability and represents physical contact)
      const minDistance = this.size + sourceSize;
      if (distance < minDistance) return;

      // Calculate harmony
      const interval = HarmonyAnalyzer.calculateInterval(this.currentNote.pitch, sourceNote.pitch);
      const harmony = HarmonyAnalyzer.classifyInterval(interval);

      // Add force based on harmony
      if (harmony === 'consonant') {
        // Attraction force toward the sound source
        const direction = {
          x: sourcePosition.x - this.position.x,
          z: sourcePosition.z - this.position.z,
        };
        const magnitude = Math.sqrt(direction.x ** 2 + direction.z ** 2);

        if (magnitude > 0) {
          this.forces.push({
            x: (direction.x / magnitude) * ATTRACTION_FORCE_STRENGTH,
            z: (direction.z / magnitude) * ATTRACTION_FORCE_STRENGTH,
          });
        }
      } else if (harmony === 'dissonant') {
        // Repulsion force away from the sound source
        const direction = {
          x: this.position.x - sourcePosition.x,
          z: this.position.z - sourcePosition.z,
        };
        const magnitude = Math.sqrt(direction.x ** 2 + direction.z ** 2);

        if (magnitude > 0) {
          this.forces.push({
            x: (direction.x / magnitude) * REPULSION_FORCE_STRENGTH,
            z: (direction.z / magnitude) * REPULSION_FORCE_STRENGTH,
          });
        }
      }
      // 'perfect' = no force added
    };

    // Check all entities for active sound sources
    gameState.entities.forEach((entity) => {
      // Skip self
      if (entity.id === this.id) return;

      // Skip if entity doesn't have an instrument or isn't playing
      if (!entity.instrument || !entity.instrument.playbackState.isPlaying) return;

      // Skip if no current note
      if (!entity.currentNote) return;

      // Use entity's size if available, otherwise use default
      const entitySize = entity.size || DEFAULT_CREATURE_SIZE;
      addForceFromSource(entity.currentNote, entity.position, entitySize);
    });

    // Also check player's playback
    const playerInstrument = PlaybackManager.getPlayerInstrument();

    if (playerInstrument.playbackState.isPlaying && playerInstrument.currentNote) {
      addForceFromSource(playerInstrument.currentNote, gameState.player.position, PLAYER_SIZE);
    }
  }

  /**
   * Update creature movement based on accumulated forces
   * @param {number} deltaTime - Time elapsed in seconds
   */
  updateMovement(deltaTime) {
    // Sum all forces
    const totalForce = this.forces.reduce(
      (sum, force) => ({
        x: sum.x + force.x,
        z: sum.z + force.z,
      }),
      { x: 0, z: 0 }
    );

    // Apply force to velocity
    this.velocity.x += totalForce.x * deltaTime;
    this.velocity.z += totalForce.z * deltaTime;

    // Apply deceleration
    this.velocity.x *= CREATURE_DECELERATION;
    this.velocity.z *= CREATURE_DECELERATION;

    // Clamp to max speed
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    if (speed > this.maxSpeed) {
      const scale = this.maxSpeed / speed;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    // Store old position for collision checking
    const oldX = this.position.x;
    const oldZ = this.position.z;

    // Calculate new position
    const newX = this.position.x + this.velocity.x * deltaTime;
    const newZ = this.position.z + this.velocity.z * deltaTime;

    // Check collision at new position
    const newPosition = { x: newX, y: this.position.y, z: newZ };
    if (!CollisionDetector.checkCollision(newPosition, this.size, this.id)) {
      // No collision - apply movement
      this.position.x = newX;
      this.position.z = newZ;
    } else {
      // Collision detected - stop movement
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    // Update mesh position
    this.mesh.position.set(this.position.x, this.position.y + this.size, this.position.z);

    // Update instrument source position for audio
    this.instrument.sourcePosition = this.position;

    // Forces are cleared at the start of calculateForces(), not here
  }

  dispose() {
    // Stop any playing sounds
    if (this.instrument) {
      this.instrument.stop();
    }

    // Remove from recording range
    const index = gameState.recording.creaturesInRange.indexOf(this);
    if (index !== -1) {
      gameState.recording.creaturesInRange.splice(index, 1);
    }

    // Unregister from listening manager
    ListeningManager.unregisterListener(this);

    super.dispose();
  }
}

export default Creature;
