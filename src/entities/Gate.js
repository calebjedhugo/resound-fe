import * as THREE from 'three';
import ListeningManager from 'core/ListeningManager';
import evaluatePhrases from 'core/phraseMatching';
import gameState from 'core/GameState';
import { getDistance } from 'core/utils';
import NotationDisplay from 'ui/NotationDisplay';
import Entity from './Entity';

class Gate extends Entity {
  // How long heard notes stay eligible for matching (must comfortably exceed
  // the longest target phrase at the slowest supported tempo)
  static CAPTURE_RETENTION_MS = 30000;

  // How long a matched performance holds the gate open, in beats. Gates are
  // play-to-pass: they never latch — each crossing needs the song performed
  // again, and the notation stays displayed forever. Generous enough to walk
  // through after performing from a step or two away.
  static OPEN_GRACE_BEATS = 10;

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
    this._openUntil = 0;

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
    // A sound carries as far as its source's audible range (fall back to our
    // own range for sources that don't declare one)
    const distance = getDistance(this.position, noteEvent.sourcePosition);
    if (distance > (noteEvent.sourceRange ?? this.audibleRange)) return; // Too far, ignore

    // Capture the note
    this.capturedNotes.push(noteEvent);
  }

  /**
   * Update gate state - check for song match, close when the grace expires
   */
  update(deltaTime) {
    this._updateMismatchFlash();

    // While open, don't evaluate anything: the gate is already passable, and a
    // wrong phrase heard during the grace must not flash (and thereby repaint)
    // an open gate — the flash would snapshot the OPEN green material and
    // later restore it onto a closed gate. Just run out the grace, then close.
    if (this.isOpen) {
      if (Date.now() > this._openUntil) this.close();
      return;
    }

    // Sliding window: forget notes older than the retention period. (A hard
    // periodic wipe used to split playbacks that straddled the boundary,
    // making slow-tempo solutions impossible.)
    const cutoff = Date.now() - Gate.CAPTURE_RETENTION_MS;
    if (this.capturedNotes.length > 0 && this.capturedNotes[0].timestamp < cutoff) {
      this.capturedNotes = this.capturedNotes.filter((n) => n.timestamp >= cutoff);
      // Everything before the cutoff is now unknowable — matching must not
      // mistake forgotten notes for silence (a trimmed take once left a
      // cycle-aligned remnant that "matched" with phantom leading silence)
      this._trimHorizonMs = cutoff;
    }

    if (this.capturedNotes.length > 0) {
      // Segment everything heard into silence-delimited phrases; a COMPLETED
      // phrase must equal the target exactly (rotated/over-long takes fail;
      // stale earlier sounds are their own phrases and don't interfere).
      const result = evaluatePhrases(this);
      if (result === true) {
        this.open();
      } else if (result === 'mismatch') {
        this._flashMismatch();
      }
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
      if (this.mesh && this.mesh.material && !this.isOpen) {
        this.mesh.material.emissive.setHex(this._savedEmissive);
        this.mesh.material.emissiveIntensity = this._savedEmissiveIntensity;
      }
    }
  }

  /**
   * A correct performance was heard: hold the gate open for the grace
   * window. Gates are play-to-pass — they never latch, and the notation
   * stays displayed so the song remains part of the world.
   */
  open() {
    const tempo = gameState.musicalClock ? gameState.musicalClock.tempo : 120;
    this._openUntil = Date.now() + Gate.OPEN_GRACE_BEATS * (60000 / tempo);

    // The next opening needs a FRESH performance: drop everything heard so
    // far and mark it unknowable, or the same phrase would re-match every
    // frame and the gate would never close.
    this.capturedNotes = [];
    this._trimHorizonMs = Date.now();

    if (this.isOpen) return; // Already open — the window just got extended

    this.isOpen = true;
    this.mesh.material.color.setHex(0x00ff00); // Green when open
    this.mesh.material.emissive.setHex(0x003300);
    this.mesh.material.emissiveIntensity = 0.5;
    this.mesh.material.transparent = true;
    this.mesh.material.opacity = 0.3; // Semi-transparent when open
    this.mesh.material.needsUpdate = true;
  }

  /** Grace expired: solid again. */
  close() {
    this.isOpen = false;
    this._openUntil = 0;
    // A fresh crossing needs a fresh performance: drop notes heard during the
    // open window and cancel any pending mismatch flash so it can't repaint
    // the now-closed gate.
    this.capturedNotes = [];
    this._trimHorizonMs = Date.now();
    this._mismatchFlashUntil = null;
    this.mesh.material.color.setHex(0xffaa00);
    this.mesh.material.emissive.setHex(0x331100);
    this.mesh.material.emissiveIntensity = 0.3;
    this.mesh.material.transparent = false;
    this.mesh.material.opacity = 1;
    this.mesh.material.needsUpdate = true;
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
