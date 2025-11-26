import * as THREE from 'three';
import Random from 'audio/instruments/Random';
import gameState from 'core/GameState';
import ListeningManager from 'core/ListeningManager';
import { getDistance, getDistanceVolume } from 'core/utils';
import { RECORDING_RANGE_PERCENTAGE } from 'core/constants';
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

    // Create unique instrument for this creature
    this.instrument = new Random(this.id);
    this.instrument.sourcePosition = this.position; // Set source position for listening

    // Set up note callback to emit to ListeningManager (for gates/fountains)
    this.instrument.noteCallback = (noteEvent) => {
      ListeningManager.emitNote(noteEvent);
    };

    // Singing timing (based on musical clock beats)
    // Initialize to next beat boundary to prevent drift
    const currentBeat = gameState.musicalClock?.getCurrentBeat() || 0;
    this.nextSingBeat = Math.ceil(currentBeat); // Next integer beat

    // Recording state
    this.isRecordable = false; // Is player in recording range?

    this.createMesh();
  }

  createMesh() {
    // Simple sphere creature - human-sized
    const geometry = new THREE.SphereGeometry(0.9, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      roughness: 0.5,
      metalness: 0.2,
      emissive: 0x003300, // Slight glow
      emissiveIntensity: 0.2,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.position.x, this.position.y + 0.9, this.position.z);
  }

  update() {
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

    super.dispose();
  }
}

export default Creature;
