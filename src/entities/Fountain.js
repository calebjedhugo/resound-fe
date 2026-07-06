import * as THREE from 'three';
import gameState from 'core/GameState';
import ListeningManager from 'core/ListeningManager';
import SongMatcher from 'core/SongMatcher';
import evaluatePhrases from 'core/phraseMatching';
import ProgressManager from 'core/ProgressManager';
import { Fountain as FountainInstrument } from 'resound-sound';
import { getDistance } from 'core/utils';
import NotationDisplay from 'ui/NotationDisplay';
import Entity from './Entity';

class Fountain extends Entity {
  // How long heard notes stay eligible for matching (must comfortably exceed
  // the longest target phrase at the slowest supported tempo)
  static CAPTURE_RETENTION_MS = 30000;

  constructor(position, data = {}) {
    super('fountain', position, data);

    // Validate required data — accept flat array or voices object
    const validArray = Array.isArray(data.song) && data.song.length > 0;
    const validVoices = data.song && !Array.isArray(data.song) && Array.isArray(data.song.voices);
    if (!validArray && !validVoices) {
      throw new Error('Fountain requires a song array');
    }

    this.requiredSong = data.song;
    // Meter/key drive the notation's measure barlines (see NotationDisplay).
    this.timeSignature = data.timeSignature;
    this.keySignature = data.keySignature;
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
    this._createNotationDisplay();

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

  _createNotationDisplay() {
    this.notationDisplay = new NotationDisplay({
      song: this.requiredSong,
      entityType: 'fountain',
      timeSignature: this.timeSignature,
      keySignature: this.keySignature,
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
   * Update fountain state - check for song match
   */
  update(deltaTime) {
    this._updateMismatchFlash();
    if (this.isActivated) return; // Already activated

    // Sliding window: forget notes older than the retention period. (A hard
    // periodic wipe used to split playbacks that straddled the boundary,
    // making slow-tempo solutions impossible.)
    const cutoff = Date.now() - Fountain.CAPTURE_RETENTION_MS;
    if (this.capturedNotes.length > 0 && this.capturedNotes[0].timestamp < cutoff) {
      this.capturedNotes = this.capturedNotes.filter((n) => n.timestamp >= cutoff);
      // Everything before the cutoff is now unknowable — matching must not
      // mistake forgotten notes for silence (a trimmed take once left a
      // cycle-aligned remnant that "matched" with phantom leading silence)
      this._trimHorizonMs = cutoff;
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
   * Activate the fountain (correct song was played)
   */
  async activate() {
    if (this.isActivated) return;

    this.isActivated = true;
    this.isComplete = true;

    // Hide notation
    if (this.notationDisplay) {
      this.notationDisplay.hide();
    }

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

    // Play the solution song with Fountain instrument (flatten voices format for playback)
    await this.instrument.play({
      data: SongMatcher.flattenSong(this.requiredSong),
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
    if (this.notationDisplay) {
      this.notationDisplay.dispose();
    }
    // Unregister from listening manager
    ListeningManager.unregisterListener(this);
    super.dispose();
  }
}

export default Fountain;
