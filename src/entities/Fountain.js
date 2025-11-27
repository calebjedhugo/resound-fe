import * as THREE from 'three';
import gameState from 'core/GameState';
import ListeningManager from 'core/ListeningManager';
import SongMatcher from 'core/SongMatcher';
import ProgressManager from 'core/ProgressManager';
import FountainInstrument from 'audio/instruments/Fountain';
import { getDistance } from 'core/utils';
import Entity from './Entity';

class Fountain extends Entity {
  constructor(position, data = {}) {
    super('fountain', position, data);

    // Validate required data
    if (!data.song || !Array.isArray(data.song) || data.song.length === 0) {
      throw new Error('Fountain requires a song array');
    }

    this.requiredSong = data.song;
    this.audibleRange = data.audibleRange || 15; // Same as creatures by default
    this.isComplete = false;
    this.isActivated = false; // Once activated, no repeat

    // Listening state
    this.capturedNotes = [];
    this.listeningStartTime = Date.now();

    // Fountain instrument for playing solution song
    this.instrument = new FountainInstrument(this.id);
    this.instrument.sourcePosition = this.position;

    // Set up note callback to emit to ListeningManager (for gates/fountains)
    this.instrument.noteCallback = (noteEvent) => {
      ListeningManager.emitNote(noteEvent);
    };

    this.createMesh();

    // Register with ListeningManager
    ListeningManager.registerListener(this);
  }

  createMesh() {
    // Landmark-sized fountain
    const geometry = new THREE.CylinderGeometry(1.5, 1.5, 2.5, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0x0088ff,
      roughness: 0.3,
      metalness: 0.4,
      emissive: 0x001144,
      emissiveIntensity: 0.4,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.position.x, this.position.y + 1.25, this.position.z);
  }

  /**
   * Callback for when a note is played (from ListeningManager)
   * @param {Object} noteEvent - { pitch, length, timestamp, source, sourcePosition }
   */
  onNoteCaptured(noteEvent) {
    if (this.isActivated) return; // Already activated, ignore

    // Check if note source is within audible range
    const distance = getDistance(this.position, noteEvent.sourcePosition);
    if (distance > this.audibleRange) return; // Too far, ignore

    // Capture the note
    this.capturedNotes.push(noteEvent);
  }

  /**
   * Update fountain state - check for song match
   */
  update(deltaTime) {
    if (this.isActivated) return; // Already activated

    // Check if we have captured notes to process
    if (this.capturedNotes.length === 0) return;

    // Process captured notes and check for match
    const processedSong = ListeningManager.processCapturedNotes(
      this.capturedNotes,
      this.listeningStartTime,
      gameState.musicalClock?.tempo || 120
    );

    if (SongMatcher.songsMatch(processedSong, this.requiredSong)) {
      this.activate();
    }

    // Clear old captured notes periodically to prevent memory buildup
    const now = Date.now();
    if (now - this.listeningStartTime > 10000) {
      // Clear every 10 seconds
      this.capturedNotes = [];
      this.listeningStartTime = now;
    }
  }

  /**
   * Activate the fountain (correct song was played)
   */
  async activate() {
    if (this.isActivated) return;

    this.isActivated = true;
    this.isComplete = true;
    console.log(`Fountain at ${this.position.x}, ${this.position.z} activated! Puzzle complete!`);

    // Update visual appearance
    this.mesh.material.color.setHex(0x00ffff); // Cyan when activated
    this.mesh.material.emissive.setHex(0x004444);
    this.mesh.material.emissiveIntensity = 1.0; // Bright glow
    this.mesh.material.needsUpdate = true; // Force material update

    // Mute all other sounds so fountain plays alone
    const savedVolumes = new Map();
    gameState.entities.forEach((entity) => {
      if (entity.instrument && entity.id !== this.id) {
        savedVolumes.set(entity.id, entity.instrument.volume);
        entity.instrument.updateVolume(0);
      }
    });

    // Play the solution song with Fountain instrument
    await this.instrument.play({
      data: this.requiredSong,
      tempo: gameState.musicalClock?.tempo || 120,
      basis: 4,
    });

    // Restore creature volumes
    savedVolumes.forEach((volume, entityId) => {
      const entity = gameState.entities.find((e) => e.id === entityId);
      if (entity && entity.instrument) {
        entity.instrument.updateVolume(volume);
      }
    });

    // Mark puzzle as complete
    if (gameState.currentPuzzle) {
      ProgressManager.markPuzzleComplete(gameState.currentPuzzle.id);

      // Pause game using state machine
      if (gameState.stateMachine) {
        gameState.stateMachine.setState('PAUSED');
      }
    }
  }

  dispose() {
    // Unregister from listening manager
    ListeningManager.unregisterListener(this);
    super.dispose();
  }
}

export default Fountain;
