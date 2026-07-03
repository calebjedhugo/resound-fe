import * as THREE from 'three';
import ListeningManager from 'core/ListeningManager';
import evaluatePhrases from 'core/phraseMatching';
import { getDistance } from 'core/utils';
import NotationDisplay from 'ui/NotationDisplay';
import Entity from './Entity';

class Gate extends Entity {
  // How long heard notes stay eligible for matching (must comfortably exceed
  // the longest target phrase at the slowest supported tempo)
  static CAPTURE_RETENTION_MS = 30000;

  constructor(position, data = {}) {
    super('gate', position, data);

    // Validate required data — accept flat array or voices object
    const validArray = Array.isArray(data.song) && data.song.length > 0;
    const validVoices = data.song && !Array.isArray(data.song) && Array.isArray(data.song.voices);
    if (!validArray && !validVoices) {
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
    this._createNotationDisplay();

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

  _createNotationDisplay() {
    this.notationDisplay = new NotationDisplay({
      song: this.requiredSong,
      entityType: 'gate',
    });
    for (const noteMesh of this.notationDisplay.meshes) {
      this.mesh.add(noteMesh);
    }
  }

  /**
   * Callback for when a note is played (from ListeningManager)
   * @param {Object} noteEvent - { pitch, length, timestamp, source, sourcePosition }
   */
  onNoteCaptured(noteEvent) {
    if (this.isActivated) return; // Already activated, ignore

    // A sound carries as far as its source's audible range (fall back to our
    // own range for sources that don't declare one)
    const distance = getDistance(this.position, noteEvent.sourcePosition);
    if (distance > (noteEvent.sourceRange ?? this.audibleRange)) return; // Too far, ignore

    // Capture the note
    this.capturedNotes.push(noteEvent);
  }

  /**
   * Update gate state - check for song match
   */
  update(deltaTime) {
    this._updateMismatchFlash();
    if (this.isActivated) return; // Already activated

    // Sliding window: forget notes older than the retention period. (A hard
    // periodic wipe used to split playbacks that straddled the boundary,
    // making slow-tempo solutions impossible.)
    const cutoff = Date.now() - Gate.CAPTURE_RETENTION_MS;
    if (this.capturedNotes.length > 0 && this.capturedNotes[0].timestamp < cutoff) {
      this.capturedNotes = this.capturedNotes.filter((n) => n.timestamp >= cutoff);
    }

    // Check if we have captured notes to process
    if (this.capturedNotes.length === 0) return;

    // Segment everything heard into silence-delimited phrases; a COMPLETED
    // phrase must equal the target exactly (rotated/over-long takes fail;
    // stale earlier sounds are their own phrases and don't interfere).
    const result = evaluatePhrases(this);
    if (result === true) {
      this.activate();
    } else if (result === 'mismatch') {
      this._flashMismatch();
    }
  }

  /** Brief red pulse when a completed phrase failed to match (wordless feedback). */
  _flashMismatch() {
    if (!this.mesh || !this.mesh.material) return;
    if (!this._mismatchFlashUntil) {
      this._savedEmissive = this.mesh.material.emissive.getHex();
      this._savedEmissiveIntensity = this.mesh.material.emissiveIntensity;
    }
    this._mismatchFlashUntil = Date.now() + 600;
    this.mesh.material.emissive.setHex(0xaa1111);
    this.mesh.material.emissiveIntensity = 1.0;
  }

  _updateMismatchFlash() {
    if (!this._mismatchFlashUntil) return;
    if (Date.now() > this._mismatchFlashUntil) {
      this._mismatchFlashUntil = null;
      if (this.mesh && this.mesh.material && !this.isActivated) {
        this.mesh.material.emissive.setHex(this._savedEmissive);
        this.mesh.material.emissiveIntensity = this._savedEmissiveIntensity;
      }
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

    // Hide notation
    if (this.notationDisplay) {
      this.notationDisplay.hide();
    }

    // Update visual appearance
    this.mesh.material.color.setHex(0x00ff00); // Green when open
    this.mesh.material.emissive.setHex(0x003300);
    this.mesh.material.emissiveIntensity = 0.5;
    this.mesh.material.transparent = true;
    this.mesh.material.opacity = 0.3; // Semi-transparent when open
    this.mesh.material.needsUpdate = true; // Force material update
  }

  dispose() {
    if (this.notationDisplay) {
      this.notationDisplay.dispose();
    }
    // Unregister from listening manager
    ListeningManager.unregisterListener(this);
    super.dispose();
  }
}

export default Gate;
