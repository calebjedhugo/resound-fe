import * as THREE from 'three';
import gameState from 'core/GameState';
import ListeningManager from 'core/ListeningManager';
import SongMatcher from 'core/SongMatcher';
import { getDistance } from 'core/utils';
import Entity from './Entity';

class Gate extends Entity {
  constructor(position, data = {}) {
    super('gate', position, data);

    // Validate required data
    if (!data.song || !Array.isArray(data.song) || data.song.length === 0) {
      throw new Error('Gate requires a song array');
    }

    this.requiredSong = data.song;
    this.audibleRange = data.audibleRange || 15; // Same as creatures by default
    this.isOpen = false;
    this.isActivated = false; // Once activated, stays open permanently

    // Listening state
    this.capturedNotes = [];
    this.listeningStartTime = Date.now();

    this.createMesh();

    // Register with ListeningManager
    ListeningManager.registerListener(this);
  }

  createMesh() {
    // Gate fills entire grid cell (3x3 world units) when closed
    const geometry = new THREE.BoxGeometry(3, 3, 3);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      roughness: 0.4,
      metalness: 0.6,
      emissive: 0x331100,
      emissiveIntensity: 0.3,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.position.x, this.position.y + 1.5, this.position.z);
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
   * Update gate state - check for song match
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
   * Activate the gate (correct song was played)
   */
  activate() {
    if (this.isActivated) return;

    this.isActivated = true;
    this.isOpen = true;
    console.log(`Gate at ${this.position.x}, ${this.position.z} activated!`);

    // Update visual appearance
    this.mesh.material.color.setHex(0x00ff00); // Green when open
    this.mesh.material.emissive.setHex(0x003300);
    this.mesh.material.emissiveIntensity = 0.5;
    this.mesh.material.transparent = true;
    this.mesh.material.opacity = 0.3; // Semi-transparent when open
    this.mesh.material.needsUpdate = true; // Force material update
  }

  dispose() {
    // Unregister from listening manager
    ListeningManager.unregisterListener(this);
    super.dispose();
  }
}

export default Gate;
