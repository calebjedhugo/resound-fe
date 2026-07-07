import * as THREE from 'three';
import { Random } from 'resound-sound';
import gameState from 'core/GameState';
import ListeningManager from 'core/ListeningManager';
import HarmonyAnalyzer from 'core/HarmonyAnalyzer';
import PlaybackManager from 'core/PlaybackManager';
import resolveSlide from 'core/SlideResolver';
import { getDistance, getDistanceVolume } from 'core/utils';
import {
  RECORDING_RANGE_PERCENTAGE,
  DEFAULT_CREATURE_MAX_SPEED,
  DEFAULT_CREATURE_SIZE,
  PLAYER_SIZE,
  CREATURE_DECELERATION,
  CREATURE_PHYSICS_PASSES,
  ATTRACTION_FORCE_STRENGTH,
  REPULSION_FORCE_STRENGTH,
  ELEVATION_HEIGHT,
} from 'core/constants';
import { getFloorY, getEffectiveElevation } from 'core/ElevationMovement';
import Entity from 'entities/Entity';

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

    // Elevation tracking (derived from initial Y position)
    this.elevation = Math.round(this.position.y / ELEVATION_HEIGHT);

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

      // Sound carries as far as its source's audible range
      noteEvent.sourceRange = this.audibleRange;

      // Tag the emitting area so seam routing applies the doorway model
      noteEvent.sourceArea = this.area;

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

  /**
   * Mesh-only creature look (no entity, no instrument, no listeners).
   * @param {{x:number, y:number, z:number}} position - base world position
   * @param {number} size - radius in world units
   */
  static buildBodyMesh(position, size) {
    // Simple sphere creature
    const geometry = new THREE.SphereGeometry(size, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      roughness: 0.5,
      metalness: 0.2,
      emissive: 0x003300, // Slight glow
      emissiveIntensity: 0.2,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, position.y + size, position.z);
    return mesh;
  }

  createMesh() {
    this.mesh = Creature.buildBodyMesh(this.position, this.size);
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

    // Distance to player: direct within the player's own area; from a
    // neighbor area, sound reaches the player only through the doorway —
    // effective distance = player->gate + partner-gate->creature (+ leak
    // while the door is closed), minimized over the doors joining the areas.
    const inActiveArea = !this.area || this.area === gameState.activeArea;
    const distance = inActiveArea
      ? getDistance(this.position, gameState.player.position)
      : gameState.world?.effectiveDistanceToPlayer(this.area, this.position) ?? Infinity;

    // Update volume based on distance (inverse square law)
    if (distance <= this.audibleRange) {
      const volume = getDistanceVolume(distance, this.audibleRange);
      this.instrument.updateVolume(volume);

      // Check if in recording range. Recording is strictly per-area: a
      // neighbor creature is audible through the doorway but can only be
      // recorded from inside its own area.
      this.isRecordable = inActiveArea && distance <= this.recordingRange;
    } else {
      // Too far - silence
      this.instrument.updateVolume(0);
      this.isRecordable = false;
    }

    // Update creatures in range for recording UI
    this.updateRecordingState();

    // Visual "now singing" cue (audio has no visual equivalent otherwise)
    this.updateSingingVisual(deltaTime);

    // Force-based movement: CREATURE_PHYSICS_PASSES full-deltaTime passes,
    // recomputing forces between passes (a source's pull changes as the
    // creature moves). The playtested feel is tuned to this exact cadence.
    for (let pass = 0; pass < CREATURE_PHYSICS_PASSES; pass += 1) {
      // Forces from nearby playing sources (continuous while harmonies exist)
      this.calculateForces();
      this.updateMovement(deltaTime);
    }
  }

  /**
   * Pulse glow + scale while the creature is singing so the melody
   * is noticeable without sound.
   */
  updateSingingVisual(deltaTime) {
    if (!this.mesh || !this.mesh.material) return;

    const singing = this.instrument.playbackState.isPlaying;
    if (singing) {
      this.singingPhase = (this.singingPhase || 0) + deltaTime * 12;
      const pulse = 0.5 + 0.5 * Math.sin(this.singingPhase);
      this.mesh.material.emissiveIntensity = 0.2 + pulse * 1.0;
      const scale = 1 + 0.08 * pulse;
      this.mesh.scale.set(scale, scale, scale);
    } else if (this.singingPhase) {
      this.singingPhase = 0;
      this.mesh.material.emissiveIntensity = 0.2;
      this.mesh.scale.set(1, 1, 1);
    }
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
   * Stop current song (if playing)
   */
  stopSong() {
    if (this.instrument) {
      this.instrument.stop();
    }
  }

  /**
   * Handle being clapped - stop current song and displace timing
   * @param {number} displacement - Displacement as fraction of whole note (e.g., 0.0625 = 1/16)
   */
  handleClap(displacement) {
    // Stop current song immediately
    this.stopSong();

    // Convert displacement from whole-note fraction to quarter-note beats
    // (MusicalClock counts in quarter notes, so multiply by 4)
    const displacementInBeats = displacement * 4;
    this.nextSingBeat += displacementInBeats;

    // Visual feedback - make creature flash or glow
    if (this.mesh && this.mesh.material) {
      const originalEmissive = this.mesh.material.emissive.getHex();
      this.mesh.material.emissive.setHex(0xffffff); // Flash white

      // Fade back to original after 100ms
      setTimeout(() => {
        if (this.mesh && this.mesh.material) {
          this.mesh.material.emissive.setHex(originalEmissive);
        }
      }, 100);
    }
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

    // Check if source is within audible range (doorway-crossing notes carry
    // their source->partner-gate leg as extraDistance)
    const distance =
      (noteEvent.extraDistance || 0) + getDistance(this.position, noteEvent.sourcePosition);
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

    // Helper to add force from a source. For a source in ANOTHER area,
    // sourcePosition is the doorway on OUR side (the pull/push aims at the
    // door — sound comes through it) and extraDistance carries the
    // source->partner-gate leg (+ closed-door leak) for the range check.
    const addForceFromSource = (sourceNote, sourcePosition, sourceSize, extraDistance = 0) => {
      // Check if within audible range
      const distance = extraDistance + getDistance(this.position, sourcePosition);
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

    // Check our own area's entities for active sound sources
    const localEntities = this.area ? this.area.entities : gameState.entities;
    localEntities.forEach((entity) => {
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

    // Also check player's playback — direct only when the player is in OUR
    // area; otherwise the player is heard through a doorway (below)
    const playerInstrument = PlaybackManager.getPlayerInstrument();
    const playerHere = !this.area || this.area === gameState.activeArea;

    if (playerHere && playerInstrument.playbackState.isPlaying && playerInstrument.currentNote) {
      addForceFromSource(playerInstrument.currentNote, gameState.player.position, PLAYER_SIZE);
    }

    // Sources sounding in ADJACENT areas pull/push through the doorway: the
    // force aims at the door on our side, and the far-side leg (+ leak while
    // closed) attenuates eligibility via extraDistance.
    if (this.area && gameState.world) {
      for (const seamSource of gameState.world.seamSourcesFor(this.area)) {
        addForceFromSource(
          seamSource.note,
          seamSource.doorPosition,
          seamSource.size,
          seamSource.extraDistance
        );
      }
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

    // Resolve the move with elevation-aware, axis-separated collision response
    // (wall/cliff sliding): a creature pushed into a surface at an angle slides
    // ALONG it instead of stopping dead. See core/SlideResolver. Collision is
    // strictly area-local: this creature moves against ITS OWN area's grid
    // and entities (a neighbor's walls can never block it).
    const elevationGrid = this.area ? this.area.elevationGrid : gameState.elevationGrid;
    const resolved = resolveSlide(
      { x: oldX, z: oldZ },
      { x: newX, z: newZ },
      {
        radius: this.size,
        ignoreId: this.id,
        priorLevel: this.elevation,
        grid: elevationGrid || null,
        y: this.position.y,
        area: this.area || null,
      }
    );
    this.position.x = resolved.x;
    this.position.z = resolved.z;
    if (resolved.blockedX) this.velocity.x = 0;
    if (resolved.blockedZ) this.velocity.z = 0;

    // Update Y position and elevation from elevation grid (stay on our own
    // layer in cells walkable at several levels)
    if (elevationGrid) {
      this.position.y = getFloorY(this.position.x, this.position.z, elevationGrid, this.elevation);
      const currentGrid = elevationGrid.worldToGrid(this.position.x, this.position.z);
      this.elevation = getEffectiveElevation(
        this.position.x,
        this.position.z,
        currentGrid,
        elevationGrid,
        this.elevation
      );
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
