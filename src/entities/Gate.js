import * as THREE from 'three';
import ListeningManager from 'core/ListeningManager';
import { evaluatePhrasesCached, TOL_BEATS } from 'core/phraseMatching';
import SongMatcher from 'core/SongMatcher';
import { soundingBeats } from 'core/noteBeats';
import gameState from 'core/GameState';
import { getDistance } from 'core/utils';
import { WORLD_SCALE, ELEVATION_HEIGHT, PLAYER_COLLISION_RADIUS } from 'core/constants';
import { midiOf } from 'core/messiaenColour';
import NotationDisplay from 'ui/NotationDisplay';
import Entity from 'entities/Entity';
import { bindAreaLight, createGateMaterial } from 'entities/EntityLook';

// Every gate is the same box: it fills its 3x3 cell when closed. ONE
// geometry serves every gate in every area, flagged `userData.shared` so
// Entity.dispose leaves it alone; each gate keeps its OWN material (its
// fade, charge, red and open frame are its own: entities/EntityLook).
const GATE_GEOMETRY = new THREE.BoxGeometry(3, 3, 3);
GATE_GEOMETRY.userData.shared = true;

class Gate extends Entity {
  // How long heard notes stay eligible for matching (must comfortably exceed
  // the longest target phrase at the slowest supported tempo)
  static CAPTURE_RETENTION_MS = 30000;

  // How near a rebuilt creature must stand to where an opener was saved to
  // be that opener again (world units: positions are restored exactly)
  static OPENER_MATCH_DISTANCE = 0.05;

  // While a correct performance is underway, the closed shell FADES from
  // opaque to FULLY transparent in step with the song's own progress — a
  // literal preview of the open state being earned, whose rate depends on
  // the song's length (designer's call, 2026-07-10). The shell reaches
  // full transparency as the song ends and the gate opens moments later
  // (after the trailing-silence beat). A wrong note snaps it back to solid.
  // This recovery rate governs only the snap-back / lapse easing.
  static FADE_RECOVER_RATE_PER_S = 4;

  // Wrong-note LOCKOUT (ruled 2026-07-16): a mismatch voids the attempt AND
  // deafens the gate for this long — notes played during the lockout are not
  // heard at all. So a correct song can never ride in behind wrong notes:
  // the target must START clean (trailing extras remain fine, since a
  // completion fires the moment the target's own span elapses). The red
  // flash decays over exactly this window — wordless "wait" feedback that
  // ends when the gate is listening again.
  static MISMATCH_LOCKOUT_MS = 1500;

  // No note is longer than this (a whole note at the slowest tempo the
  // game plays, with room): older heard notes have stopped sounding
  static LONGEST_NOTE_MS = 8000;

  constructor(position, data = {}) {
    super('gate', position, data);

    // Validate required data — accept flat array or voices object
    const validArray = Array.isArray(data.song) && data.song.length > 0;
    const validVoices = data.song && !Array.isArray(data.song) && Array.isArray(data.song.voices);
    if (!validArray && !validVoices) {
      throw new Error('Gate requires a song array');
    }

    this.requiredSong = data.song;
    // The song's total span in beats drives the listening fade: the shell
    // reaches full transparency exactly as the performance completes.
    this._songBeats = SongMatcher.targetTimeline(data.song).totalBeats || 4;
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
    // A permanently-open face (see puzzles/schema.md "Gate Links"): passable
    // forever, never closes — the unlocked side of a one-way door, or an
    // escape hatch. Its partner face can still be song-locked.
    this.alwaysOpen = Boolean(data.alwaysOpen);
    this.isOpen = this.alwaysOpen;
    // Arriving through this gate ends the demo: the crossing callback shows
    // the "thanks for playing" overlay (see puzzles/schema.md "Gate Links").
    this.ending = Boolean(data.ending);
    // The creatures whose song opened it (the last completed take): while
    // every one of them is still in range, it doesn't close behind the
    // player (isHeldOpen). Saved as places, not creatures, by saveState
    // (a rebuilt creature is a new object) and found again by _openersNow.
    this._openers = [];
    this._openerPlaces = null;
    this._inProgress = false;
    this._fade = 0;
    this._wasPlayerInside = false;
    this._lockoutUntilMs = 0;
    // How many times this gate has opened (the storm strikes on each:
    // entities/EnvironmentLook), and the area whose creatures light it
    this.openings = 0;
    this._litBy = null;

    // Listening state
    this.capturedNotes = [];
    this.listeningStartTime = Date.now();

    this.createMesh();
    this._createNotationDisplay();
    if (this.alwaysOpen) this._applyLook();

    // Register with ListeningManager
    ListeningManager.registerListener(this);
  }

  /**
   * Mesh-only closed-gate look (no entity, no listeners): a slab of dark
   * glass with pale edges (entities/EntityLook).
   * @param {{x:number, y:number, z:number}} position - base world position
   */
  static buildClosedMesh(position) {
    const mesh = new THREE.Mesh(GATE_GEOMETRY, createGateMaterial());
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
    // Deaf during the wrong-note lockout: the note isn't captured at all, so
    // a correct song started inside the window can only ever land as a tail
    // (which mismatches and re-locks). See MISMATCH_LOCKOUT_MS.
    if (Date.now() < this._lockoutUntilMs) return;

    // A sound carries as far as its source's audible range (fall back to our
    // own range for sources that don't declare one). Sound from another area
    // arrives via the doorway: sourcePosition is the door on OUR side and
    // extraDistance is the source->partner-gate leg (+ closed-door leak) —
    // this is how a song can be completed by singing on both sides of a door.
    // One door, two ears (ruled 2026-07-11): a SAME-AREA pair shares its
    // heard-note state — the note also counts from the partner face, with no
    // leak between the faces. (Cross-area pairs get the same treatment in
    // PortalManager's seam router.)
    if (!this._reaches(noteEvent)) return; // Too far, ignore

    // Capture the note
    this.capturedNotes.push(noteEvent);
  }

  /**
   * A completed take is consumed so its notes don't re-open the gate every
   * frame — the TAKE, and nothing heard after it: a take that starts as this
   * one ends (a creature singing back to back, its next downbeat landing on
   * this window's last frame) still counts. Its own notes go, so they can't
   * corrupt that next window either; history before them is forgotten
   * (core/phraseMatching's trim horizon), what follows them stays judgeable.
   * @param {?{lastNoteMs: number}} take - phraseMatching's `_completedTake`
   */
  _consumeTake(take) {
    const now = Date.now();
    const lastNoteMs = take && Number.isFinite(take.lastNoteMs) ? take.lastNoteMs : now;
    const tempo = gameState.musicalClock ? gameState.musicalClock.tempo : 120;
    const tolMs = TOL_BEATS * (60000 / tempo);
    this.capturedNotes = this.capturedNotes.filter((n) => n.timestamp > lastNoteMs);
    // An anchor after the take's last note is judgeable (it must lie past
    // the horizon by the tolerance), nothing at or before it
    this._trimHorizonMs = Math.max(this._trimHorizonMs ?? -Infinity, lastNoteMs - tolMs);
    this._lastJudgedStartBeat = undefined;
  }

  /** The other face of an in-level (same-puzzle) door pair, or null. */
  _sameAreaPartner() {
    if (!this.link || !this.area || this.link.puzzleId !== this.area.id) return null;
    return (
      this.area.entityManager
        .getByType('gate')
        .find((g) => g !== this && g.gateId === this.link.gateId) || null
    );
  }

  /**
   * Update gate state (ruled 2026-07-10, superseding play-to-pass grace):
   * a gate opens when its song has been performed TO COMPLETION, LATCHES
   * open with no timer, and closes only when the player walks through it —
   * and then only once a creature that opened it is out of range
   * (isHeldOpen, ruled 2026-11-25: a door with its singers beside it stays
   * open behind you, however long they rest between songs). While closed, a
   * correct performance in progress FADES the shell toward transparency
   * (wordless "it hears you" — previewing the open state); a wrong note
   * snaps it back to solid with the red flash.
   */
  update(deltaTime) {
    // Lit by its own area's singing creatures (known once it is placed)
    if (this.area && this._litBy !== this.area && this.mesh) {
      this._litBy = this.area;
      bindAreaLight(this.mesh.material, this.area.light);
    }
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
    // (Re-judged only when the verdict could have changed.)
    const result = this.capturedNotes.length > 0 ? evaluatePhrasesCached(this) : false;

    this._inProgress = result === 'in-progress';
    if (result === true) {
      this._openers = this._creaturesOf(this._completedTake);
      this._openerPlaces = null;
      this._consumeTake(this._completedTake);
      // A close waiting behind the player STAYS waiting: what decides it is
      // whether these openers are in range (a parked singer re-completes
      // every loop — clearing it here kept a door open forever after the
      // singer walked off, 2026-11-25)
      this.open();
    } else if (result === 'mismatch') {
      // A wrong note snaps the gate back to solid (then the red flash lands)
      this._fade = 0;
      this._inProgressSinceMs = null;
      // ...and voids the attempt: everything heard is dropped and the gate
      // goes deaf for the lockout window (see MISMATCH_LOCKOUT_MS).
      this.capturedNotes = [];
      this._trimHorizonMs = Date.now();
      this._lastJudgedStartBeat = undefined;
      this._lockoutUntilMs = Date.now() + Gate.MISMATCH_LOCKOUT_MS;
      this._applyLook();
      this._flashMismatch();
    }

    this._updateFade(deltaTime);

    // Close-on-exit for PLAIN (unlinked) gates: the player walking out of
    // the cell consumes the opening — unless the creatures that opened it
    // are all still in range, in which case the close is DEFERRED until any
    // of them is not (ruled 2026-11-25). Linked doors are consumed by
    // PortalManager when the player
    // steps out of the DESTINATION face (the origin face "exiting" is just
    // the teleport, and a refused commit must not consume anything).
    if (!this.link) {
      const inside = this._playerInside();
      if (this._wasPlayerInside && !inside && this.isOpen) {
        if (this.isHeldOpen()) this._closePending = true;
        else this.close();
      }
      this._wasPlayerInside = inside;
    }

    // A consumed-but-held door closes as soon as nothing holds it anymore
    // (and nobody is standing in it).
    if (this._closePending && this.isOpen) {
      if (!this.isHeldOpen() && !this._playerInside()) this.close();
    }
  }

  /**
   * Does it stay open behind the player? Ruled 2026-11-25: "So long as the
   * creatures used to open the gate are still in range of the gate, the
   * gate does not close behind the player." True while EVERY creature that
   * sang the take that opened it is still in the world, singing (not taken
   * by the pole), and near enough to be heard here (_hears: the hearing
   * rule, a door included). A gate opened by nothing (open() called
   * directly) holds nothing. While an opener's area isn't loaded (pruned,
   * not yet rebuilt) it can't be judged: held, nothing changes.
   */
  isHeldOpen() {
    const openers = this._openersNow();
    if (openers === null) return true;
    return openers.length > 0 && openers.every((c) => this._hears(c));
  }

  /** The live creatures among the sources of a completed take. */
  // eslint-disable-next-line class-methods-use-this
  _creaturesOf(take) {
    const ids = take && take.sources;
    if (!ids || ids.size === 0) return [];
    return ListeningManager.listeners.filter((e) => e.type === 'creature' && ids.has(e.id));
  }

  /**
   * The openers as they are now: after a rebuild, the creatures standing at
   * the saved places (each in its own area); null while an opener's area
   * isn't loaded yet (it can't be judged — nothing changes). A saved place
   * with no creature there any more is an opener gone: an empty list.
   */
  _openersNow() {
    const { world } = gameState;
    // An opener whose area was pruned (a door's far side) is remembered
    // where it stood, like a rebuilt gate's: found again when that area is
    // rebuilt, not mistaken for one gone meanwhile
    if (
      !this._openerPlaces &&
      world &&
      world.getArea &&
      this._openers.some((c) => c.area && world.getArea(c.area.id) !== c.area)
    ) {
      this._openerPlaces = this._placesOf(this._openers);
    }
    if (!this._openerPlaces) return this._openers;
    const found = [];
    for (const place of this._openerPlaces) {
      const loaded = world && world.getArea ? world.getArea(place.areaId) : null;
      if (!loaded) return null;
      const creature = ListeningManager.listeners.find(
        (e) =>
          e.type === 'creature' &&
          e.area === loaded &&
          getDistance(e.position, place) < Gate.OPENER_MATCH_DISTANCE
      );
      if (!creature) return [];
      found.push(creature);
    }
    this._openers = found;
    this._openerPlaces = null;
    return found;
  }

  /**
   * Would a note `creature` sings reach this gate? Its own area: within the
   * creature's audible range of this face (or a same-area partner face);
   * another area: through the connecting door, as ListeningManager routes
   * it (none: no). Taken by the pole, or gone from the world: no.
   */
  _hears(creature) {
    if (creature.held || creature.silenced) return false;
    if (!ListeningManager.listeners.includes(creature)) return false;
    let event = {
      sourcePosition: creature.position,
      sourceRange: creature.audibleRange,
      sourceArea: creature.area,
    };
    const here = this.area || gameState.activeArea;
    if (creature.area && here && creature.area !== here) {
      if (!ListeningManager.seamRouter) return false;
      event = ListeningManager.seamRouter(event, creature.area, here, this);
      if (!event) return false;
    }
    return this._reaches(event);
  }

  /**
   * Is a sound within its range of this gate (or of a same-area partner
   * face: one door, two ears)? The rule every heard note goes by.
   */
  _reaches(noteEvent) {
    let distance =
      (noteEvent.extraDistance || 0) + getDistance(this.position, noteEvent.sourcePosition);
    const partner = this._sameAreaPartner();
    if (partner) {
      distance = Math.min(
        distance,
        (noteEvent.extraDistance || 0) + getDistance(partner.position, noteEvent.sourcePosition)
      );
    }
    return distance <= (noteEvent.sourceRange ?? this.audibleRange);
  }

  /**
   * How far a correct performance has come toward opening this gate, 0..1
   * (the shell's fade): 0 while nothing correct is under way, or once open.
   * The storm answers it (entities/EnvironmentLook).
   */
  get solveProgress() {
    return this.isOpen || !this._inProgress ? 0 : this._fade;
  }

  /**
   * The notes this gate hears sounding NOW (its own ear: what it captured,
   * by the source's range and through doors, still within its notated
   * length), as MIDI numbers pushed onto `out` — the harmony whose colour
   * the storm shows while the gate is being solved. Visual only.
   * @param {number[]} out
   * @returns {number[]} out
   */
  soundingHeardInto(out) {
    const now = Date.now();
    const msPerBeat = 60000 / (gameState.musicalClock ? gameState.musicalClock.tempo : 120);
    const notes = this.capturedNotes;
    // Newest last: walk back until notes are too old to still sound
    for (let i = notes.length - 1; i >= 0; i -= 1) {
      const note = notes[i];
      const age = now - note.timestamp;
      if (age > Gate.LONGEST_NOTE_MS) break;
      if (age >= 0 && age < soundingBeats(note) * msPerBeat) {
        const midi = midiOf(note.pitch);
        if (Number.isFinite(midi)) out.push(midi);
      }
    }
    return out;
  }

  /**
   * While the gate is CLOSED and a correct performance is underway, the
   * shell fades from opaque to FULLY transparent in step with the song's
   * progress (opacity = fraction of the song still to come) — previewing
   * the open state being earned. Anything else eases it back to solid.
   * Wordless mid-performance feedback (the door "hears you").
   */
  _updateFade(deltaTime) {
    if (!this.mesh || !this.mesh.material) return;
    if (!this.isOpen && this._inProgress) {
      const tempo = gameState.musicalClock ? gameState.musicalClock.tempo : 120;
      const songMs = this._songBeats * (60000 / tempo);
      // Resume from the CURRENT fade level rather than restarting at opaque:
      // if judgment ever drops in-progress for a frame mid-take (onset
      // boundaries, scheduling jitter), the shell must not snap solid and
      // re-fade — that reads as negative feedback during a correct take.
      if (!this._inProgressSinceMs) this._inProgressSinceMs = Date.now() - this._fade * songMs;
      const progress =
        songMs > 0 ? Math.min(1, (Date.now() - this._inProgressSinceMs) / songMs) : 1;
      if (progress !== this._fade) {
        this._fade = progress;
        this._paintShell(true, 1 - this._fade); // the edges charge with it
      }
      return;
    }
    this._inProgressSinceMs = null;
    if (!this.isOpen && this._fade > 0) {
      this._fade = Math.max(0, this._fade - Gate.FADE_RECOVER_RATE_PER_S * (deltaTime || 0.016));
      this._paintShell(this._fade > 0, 1 - this._fade);
    }
  }

  /**
   * Set the shell's transparency (and the charge its edges show: the fade
   * IS the song's progress). A shell faded all the way out is not drawn at
   * all — an open gate has NO slab (DESIGN.md) — while its children
   * (notation, door panels) still are: three skips a hidden material but
   * not the mesh's subtree. (An opacity-0 draw painted nothing yet cost a
   * draw call in every pass that saw it, and still wrote depth: a
   * translucent creature in an open gate's cell could vanish behind it.)
   * An open door's outline is its view panels' own seam
   * (entities/EntityLook createSeamMaterial), never the shell.
   * Opacity is a uniform; of these only `transparent` reaches the shader
   * program (three's OPAQUE define), so the program is re-derived only
   * when that flips — not every fade frame.
   */
  _paintShell(transparent, opacity) {
    const m = this.mesh.material;
    if (m.transparent !== transparent) {
      m.transparent = transparent;
      m.needsUpdate = true;
    }
    m.opacity = opacity;
    const u = m.uniforms;
    u.uOpacity.value = opacity;
    u.uProgress.value = this.isOpen ? 0 : this._fade;
    m.visible = !this.isOpen && (!transparent || opacity > 0);
  }

  /** The wrong note's red on the shell now, 0..1 (decaying over the lockout). */
  get lockoutGlow() {
    return this.mesh ? this.mesh.material.uniforms.uLockout.value : 0;
  }

  /**
   * Is the player standing inside this gate's cell (same level)? The
   * occupant includes their BODY: the check extends past the cell edge by
   * the player's collision radius, because closing while their body still
   * overlaps the box would wedge them against the newly solid face — the
   * door releases only once they are fully clear.
   */
  _playerInside() {
    // The player's coordinates only mean anything in THEIR area — a gate in
    // a neighbor area can never be occupied (coordinates are per-area)
    if (this.area && this.area !== gameState.activeArea) return false;
    const { position, elevation } = gameState.player;
    const half = WORLD_SCALE / 2 + PLAYER_COLLISION_RADIUS;
    return (
      Math.round(this.position.y / ELEVATION_HEIGHT) === elevation &&
      Math.abs(position.x - this.position.x) < half &&
      Math.abs(position.z - this.position.z) < half
    );
  }

  /**
   * Red pulse on a wrong note (wordless feedback). It spans the wrong-note
   * lockout, decaying as the window runs out, so the glow doubles as the
   * "gate is resetting — wait" signifier.
   */
  _flashMismatch() {
    if (!this.mesh || !this.mesh.material) return;
    this._mismatchFlashUntil = Date.now() + Gate.MISMATCH_LOCKOUT_MS;
    this.mesh.material.uniforms.uLockout.value = 1;
  }

  _updateMismatchFlash() {
    if (!this._mismatchFlashUntil) return;
    const remaining = this._mismatchFlashUntil - Date.now();
    if (remaining > 0) {
      // Decay the red glow in step with the lockout running out.
      if (this.mesh && this.mesh.material) {
        this.mesh.material.uniforms.uLockout.value = remaining / Gate.MISMATCH_LOCKOUT_MS;
      }
      return;
    }
    this._mismatchFlashUntil = null;
    if (this.mesh && this.mesh.material) this.mesh.material.uniforms.uLockout.value = 0;
  }

  /**
   * Latch the gate open. No timer: an open gate stays open until the player
   * walks through it (close-on-exit in update) or close() is called.
   */
  open() {
    this._fade = 0;
    if (this.isOpen) return;
    this.isOpen = true;
    this.openings += 1;
    this._applyLook();
  }

  /**
   * The opening was consumed (the player walked through) or the level reset:
   * solid again, awaiting a fresh performance. A permanently-open face
   * (alwaysOpen) never closes.
   */
  close() {
    if (this.alwaysOpen) return;
    this.isOpen = false;
    this._closePending = false;
    // A fresh crossing needs a fresh performance: drop notes heard during the
    // open window and cancel any pending mismatch flash.
    this.capturedNotes = [];
    this._trimHorizonMs = Date.now();
    this._lastJudgedStartBeat = undefined;
    this._openers = [];
    this._openerPlaces = null;
    this._inProgress = false;
    this._fade = 0;
    this._inProgressSinceMs = null;
    this._mismatchFlashUntil = null;
    this._lockoutUntilMs = 0;
    this._applyLook();
  }

  /**
   * What it has become, for core/WorldMemory (its area is being pruned):
   * open or not, a close waiting on its openers, how often it has opened,
   * and where the creatures that opened it stand (what holds it open behind
   * the player; a rebuilt creature is a new object, found again there).
   * What it was hearing is not kept: a performance doesn't outlive its
   * listener's area.
   * @returns {{isOpen: boolean, closePending: boolean, openings: number, openers: Array}}
   */
  saveState() {
    const openers = this._openersNow();
    return {
      isOpen: this.isOpen,
      closePending: Boolean(this._closePending),
      openings: this.openings,
      openers: this._openerPlaces
        ? this._openerPlaces.map((p) => ({ ...p }))
        : this._placesOf(openers || []),
    };
  }

  /** Where creatures stand, each with its area's id (saveState, _openersNow). */
  // eslint-disable-next-line class-methods-use-this
  _placesOf(creatures) {
    return creatures
      .filter((c) => c.area)
      .map((c) => ({ areaId: c.area.id, x: c.position.x, y: c.position.y, z: c.position.z }));
  }

  /**
   * Built again from saveState: as it was left. No opening is counted (the
   * storm strikes only for a new one).
   * @param {object} state
   */
  restoreState(state) {
    this.isOpen = this.alwaysOpen || Boolean(state.isOpen);
    this._closePending = this.isOpen && Boolean(state.closePending);
    this.openings = state.openings || 0;
    this._openers = [];
    this._openerPlaces = Array.isArray(state.openers) ? state.openers.map((p) => ({ ...p })) : null;
    this._applyLook();
  }

  /** Paint the gate for its current open/closed state. */
  _applyLook() {
    if (this.isOpen) {
      // An open gate has NO slab — no tint (ruled 2026-07-11): transparency
      // is the game's vocabulary for "open", for linked doors and plain
      // gates alike (a door's panels melt into the world at its outline).
      // The notation stays; the red mismatch
      // flash only ever shows on the CLOSED look.
      this._paintShell(true, 0);
    } else {
      this._paintShell(false, 1);
    }
    // A fresh look carries no red: a wrong note flashes it AFTER (update)
    this.mesh.material.uniforms.uLockout.value = 0;
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

Gate.GEOMETRY = GATE_GEOMETRY;

export default Gate;
