import * as THREE from 'three';
import ListeningManager from 'core/ListeningManager';
import evaluatePhrases from 'core/phraseMatching';
import gameState from 'core/GameState';
import { getDistance } from 'core/utils';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import NotationDisplay from 'ui/NotationDisplay';
import Entity from 'entities/Entity';

class Gate extends Entity {
  // How long heard notes stay eligible for matching (must comfortably exceed
  // the longest target phrase at the slowest supported tempo)
  static CAPTURE_RETENTION_MS = 30000;

  // How long the gate lingers open after a correct performance STOPS sounding,
  // in beats — a short step-through grace. Gates are play-to-pass: they open
  // AS the song is performed (not after) and hold while it keeps sounding;
  // this grace only covers the moment between the last note and stepping
  // through. They never latch, and the notation stays displayed forever.
  static OPEN_GRACE_BEATS = 3;

  constructor(position, data = {}) {
    super('gate', position, data);

    // Validate required data — accept flat array or voices object
    const validArray = Array.isArray(data.song) && data.song.length > 0;
    const validVoices = data.song && !Array.isArray(data.song) && Array.isArray(data.song.voices);
    if (!validArray && !validVoices) {
      throw new Error('Gate requires a song array');
    }

    this.requiredSong = data.song;
    // Meter/key drive the notation's measure barlines (see NotationDisplay).
    this.timeSignature = data.timeSignature;
    this.keySignature = data.keySignature;
    // Portal identity (see puzzles/schema.md "Gate Links"): a linked gate is
    // a door into another puzzle. PortalManager watches these.
    this.gateId = data.id || null;
    this.facing = data.facing || 'north';
    this.link = data.link || null;
    this.gridPosition = data.gridPosition || null;
    this.audibleRange = data.audibleRange || 15; // Same as creatures by default
    this.isOpen = false;
    this.occupiedOvertime = false;
    this._openUntil = 0;

    // Listening state
    this.capturedNotes = [];
    this.listeningStartTime = Date.now();

    this.createMesh();
    this._createNotationDisplay();

    // Register with ListeningManager
    ListeningManager.registerListener(this);
  }

  /**
   * Mesh-only closed-gate look (no entity, no listeners).
   * @param {{x:number, y:number, z:number}} position - base world position
   */
  static buildClosedMesh(position) {
    // Gate fills entire grid cell (3x3 world units) when closed
    const geometry = new THREE.BoxGeometry(3, 3, 3);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      roughness: 0.4,
      metalness: 0.6,
      emissive: 0x331100,
      emissiveIntensity: 0.3,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, position.y + 1.5, position.z);
    return mesh;
  }

  createMesh() {
    this.mesh = Gate.buildClosedMesh(this.position);
  }

  _createNotationDisplay() {
    this.notationDisplay = new NotationDisplay({
      song: this.requiredSong,
      entityType: 'gate',
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
    // A sound carries as far as its source's audible range (fall back to our
    // own range for sources that don't declare one). Sound from another area
    // arrives via the doorway: sourcePosition is the door on OUR side and
    // extraDistance is the source->partner-gate leg (+ closed-door leak) —
    // this is how a song can be completed by singing on both sides of a door.
    const distance =
      (noteEvent.extraDistance || 0) + getDistance(this.position, noteEvent.sourcePosition);
    if (distance > (noteEvent.sourceRange ?? this.audibleRange)) return; // Too far, ignore

    // Capture the note
    this.capturedNotes.push(noteEvent);
  }

  /**
   * Update gate state. Gates open AS their song is performed: a correct
   * in-progress performance holds the gate open, completion refreshes the
   * step-through grace, and the gate closes once no correct performance has
   * sounded for OPEN_GRACE_BEATS.
   */
  update(_deltaTime) {
    this._updateMismatchFlash();

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

    // Segment everything heard into silence-delimited phrases and compare
    // against the target: `true` = the whole song landed, 'in-progress' = a
    // correct performance is underway, 'mismatch' = a wrong utterance ended.
    const result = this.capturedNotes.length > 0 ? evaluatePhrases(this) : false;

    if (result === true || result === 'in-progress') {
      // A correct performance is sounding — hold the gate open as it plays.
      this._holdOpen();
      if (result === true) {
        // Whole song heard: consume it so the same notes don't re-open every
        // frame forever. The grace lets the player finish stepping through.
        this.capturedNotes = [];
        this._trimHorizonMs = Date.now();
        this._lastJudgedStartBeat = undefined;
      }
    } else if (result === 'mismatch') {
      this._flashMismatch();
    }

    if (this.isOpen && Date.now() > this._openUntil) {
      if (this._playerInside()) {
        // A door never closes on an occupant: it WAITS — solid from the
        // outside, see-through from within — until they step out. (Free
        // movement inside the doorway is part of the puzzle vocabulary.)
        this.setOccupiedOvertime(true);
      } else {
        this.close();
      }
    }
  }

  /** Is the player standing inside this gate's cell (same level)? */
  _playerInside() {
    // The player's coordinates only mean anything in THEIR area — a gate in
    // a neighbor area can never be occupied (coordinates are per-area)
    if (this.area && this.area !== gameState.activeArea) return false;
    const { position, elevation } = gameState.player;
    const half = WORLD_SCALE / 2;
    return (
      Math.round(this.position.y / ELEVATION_HEIGHT) === elevation &&
      Math.abs(position.x - this.position.x) < half &&
      Math.abs(position.z - this.position.z) < half
    );
  }

  /**
   * Occupied overtime: the grace lapsed while the player stood inside, so
   * the gate stays open FOR THEM but reads as closed to the world — solid
   * orange from outside (front-face culling keeps it invisible from
   * within), and CollisionDetector blocks every mover except the occupant.
   */
  setOccupiedOvertime(enabled) {
    if (this.occupiedOvertime === Boolean(enabled)) return;
    this.occupiedOvertime = Boolean(enabled);
    this._applyLook();
  }

  /** Brief red pulse when a completed phrase failed to match (wordless feedback). */
  _flashMismatch() {
    if (!this.mesh || !this.mesh.material) return;
    this._mismatchFlashUntil = Date.now() + 600;
    this.mesh.material.emissive.setHex(0xaa1111);
    this.mesh.material.emissiveIntensity = 1.0;
  }

  _updateMismatchFlash() {
    if (!this._mismatchFlashUntil) return;
    if (Date.now() <= this._mismatchFlashUntil) return;
    this._mismatchFlashUntil = null;
    // Restore the emissive that matches the CURRENT open/closed state — never
    // a snapshot, which could capture the wrong state if the gate flipped
    // open/closed while the flash was up (that once left a closed gate green).
    if (this.mesh && this.mesh.material) this._applyStateEmissive();
  }

  /**
   * Refresh the open window and, if not already open, open the gate. Called
   * every frame a correct performance is sounding, so the gate stays open
   * throughout the performance and for OPEN_GRACE_BEATS after it stops.
   */
  _holdOpen() {
    const tempo = gameState.musicalClock ? gameState.musicalClock.tempo : 120;
    this._openUntil = Date.now() + Gate.OPEN_GRACE_BEATS * (60000 / tempo);
    // Opened by a real performance (or open()): no longer a mirrored hold,
    // and a fresh grace ends any occupied overtime (properly open again)
    this._mirrorHeld = false;
    this.setOccupiedOvertime(false);
    if (this.isOpen) return;
    this.isOpen = true;
    this._applyLook();
  }

  /** Public alias: force the gate open for the grace (tests / scripting). */
  open() {
    this._holdOpen();
  }

  /**
   * A linked gate pair is ONE door with two faces: while the partner face is
   * held open by a performance, PortalManager holds this face open too.
   * Mirrored holds are tracked so they stop refreshing the moment the
   * partner's own performance lapses (each face then closes on its own
   * grace) — otherwise two faces would keep each other open forever.
   */
  holdOpenMirrored() {
    this._holdOpen();
    this._mirrorHeld = true;
  }

  /** Is this face open by its OWN performance (not a mirrored hold)? */
  isSelfOpen() {
    return this.isOpen && !this._mirrorHeld;
  }

  /** Grace expired (or reset): solid again, awaiting a fresh performance. */
  close() {
    this.isOpen = false;
    this._openUntil = 0;
    this._mirrorHeld = false;
    this.occupiedOvertime = false;
    // A fresh crossing needs a fresh performance: drop notes heard during the
    // open window and cancel any pending mismatch flash.
    this.capturedNotes = [];
    this._trimHorizonMs = Date.now();
    this._lastJudgedStartBeat = undefined;
    this._mismatchFlashUntil = null;
    this._applyLook();
  }

  /**
   * Linked-door look: while open, the gate box vanishes entirely — only the
   * doorway views (and the notation) show, so a working door never shows a
   * green shell from any angle. PortalManager enables this once the door's
   * see-through views are viable; unlinked gates and dangling links keep
   * the ordinary open-gate green.
   */
  setDoorLook(enabled) {
    if (this._doorLook === Boolean(enabled)) return;
    this._doorLook = Boolean(enabled);
    this._applyLook();
  }

  /** Paint the gate for its current open/closed state (color + transparency). */
  _applyLook() {
    const m = this.mesh.material;
    if (this.isOpen && !this.occupiedOvertime) {
      m.color.setHex(0x00ff00); // green + semi-transparent when open
      m.transparent = true;
      m.opacity = this._doorLook ? 0 : 0.3; // a working door has no shell
    } else {
      // Closed — or in occupied overtime, which LOOKS closed from outside
      // (front-face culling leaves the walls invisible from within)
      m.color.setHex(0xffaa00);
      m.transparent = false;
      m.opacity = 1;
    }
    this._applyStateEmissive();
    m.needsUpdate = true;
  }

  _applyStateEmissive() {
    const m = this.mesh.material;
    if (this.isOpen && !this.occupiedOvertime) {
      m.emissive.setHex(0x003300);
      m.emissiveIntensity = 0.5;
    } else {
      m.emissive.setHex(0x331100);
      m.emissiveIntensity = 0.3;
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

export default Gate;
