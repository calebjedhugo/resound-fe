import { Random } from 'resound-sound';
import gameState from 'core/GameState';
import ListeningManager from 'core/ListeningManager';
import HarmonyAnalyzer from 'core/HarmonyAnalyzer';
import PlaybackManager from 'core/PlaybackManager';
import SongMatcher from 'core/SongMatcher';
import resolveSlide from 'core/SlideResolver';
import { messiaenColourCached, midiOf, registerLuminosity } from 'core/messiaenColour';
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
import CreatureLook from 'entities/CreatureLook';

// A note counts as sounding this long (beats) past its notated end, so the
// frame or two between one note's end and the next onset's callback (the
// instrument runs on timers, the clock on frames) never reads as silence.
const NOTE_END_GRACE_BEATS = 0.08;

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

    // What the last full movement pass left (updateMovement's at-rest
    // shortcut); not valid until there has been one
    this._rest = { valid: false, x: 0, y: 0, z: 0, elevation: 0, grid: null };

    // Track current note being sung (for harmony analysis)
    this.currentNote = null;

    // Own notes sounding right now, for the look: {midi, endBeat}
    // (musical-clock beats). Onset = the instrument's noteCallback; end =
    // onset beat + notated length, or the instrument stopping.
    this.soundingNotes = [];

    // Per-frame scratch for the look's harmony (reused — the look runs every
    // frame for every creature): own sounding MIDI notes then heard ones, and
    // the one heard-note visitor (bound once, not a closure per frame)
    this._chord = [];
    this._hearInto = null;
    this._hearVisitor = (note, sourcePosition, sourceSize, extraDistance = 0) => {
      if (extraDistance + getDistance(this.position, sourcePosition) > this.audibleRange) return;
      this._hearInto.push(midiOf(note.pitch));
    };

    // Create unique instrument for this creature
    this.instrument = new Random(this.id);
    this.instrument.sourcePosition = this.position; // Set source position for listening

    // Set up note callback to emit to ListeningManager (for gates/fountains/creatures)
    this.instrument.noteCallback = (noteEvent) => {
      // Track current note for harmony analysis
      this.currentNote = noteEvent;

      // The look lights up (and flares) on every onset
      this.noteOn(noteEvent);

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
   * Mesh-only creature look (no entity, no instrument, no listeners): the
   * silent ball-lightning bubble, floating over `position`.
   * @param {{x:number, y:number, z:number}} position - base world position
   * @param {number} size - radius in world units
   * @returns {object} the look's root THREE.Group
   */
  static buildBodyMesh(position, size) {
    const look = new CreatureLook(size);
    look.place(position);
    return look.object;
  }

  createMesh() {
    this.look = new CreatureLook(this.size);
    this.mesh = this.look.object;
    this.placeMesh();
  }

  /**
   * Put the rendered creature over its physics position. The visual FLOATS
   * (CreatureLook adds the hover + bob); physics, collision and elevation
   * never see the offset. Every mesh placement goes through here.
   */
  placeMesh() {
    if (this.look) this.look.place(this.position);
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

    // Distance to player: sound takes the SHORTEST path — direct within the
    // player's own area, and/or through a doorway: player->gate +
    // partner-gate->creature (+ leak while the door is closed), minimized
    // over the doors reaching this creature's area. An in-level teleport
    // door is a shortcut: a creature far across the map is right there
    // through the open doorway.
    const inActiveArea = !this.area || this.area === gameState.activeArea;
    const direct = inActiveArea ? getDistance(this.position, gameState.player.position) : Infinity;
    const viaDoors =
      gameState.world?.effectiveDistanceToPlayer(this.area, this.position) ?? Infinity;
    const distance = Math.min(direct, viaDoors);

    // Update volume based on distance (inverse square law)
    if (distance <= this.audibleRange) {
      const volume = getDistanceVolume(distance, this.audibleRange);
      this.instrument.updateVolume(volume);

      // Check if in recording range. Recording takes real proximity, never a
      // doorway: a creature audible through a door (neighbor area OR an
      // in-level teleport) must be approached on its own side to record.
      this.isRecordable = inActiveArea && direct <= this.recordingRange;
    } else {
      // Too far - silence
      this.instrument.updateVolume(0);
      this.isRecordable = false;
    }

    // Update creatures in range for recording UI
    this.updateRecordingState();

    // Visual "now singing" cue (audio has no visual equivalent otherwise)
    this.updateLook(deltaTime);

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
   * A note of ours began (instrument noteCallback): remember when it ends in
   * musical-clock beats, and flare the look.
   * @param {{pitch:string, length:string}} noteEvent
   */
  noteOn(noteEvent) {
    const beat = gameState.musicalClock ? gameState.musicalClock.getCurrentBeat() : 0;
    this.soundingNotes.push({
      midi: midiOf(noteEvent.pitch),
      endBeat: beat + SongMatcher.lengthToBeats(noteEvent.length),
    });
    if (this.look) this.look.noteOn();
  }

  /**
   * MIDI numbers of every OTHER note this creature can hear right now —
   * the harmony-force audibility rule exactly (forEachSoundSource: same
   * sources, doorway routing included, within the creature's OWN
   * audibleRange). No contact-distance cut: that is a force-stability rule,
   * not hearing.
   * @returns {number[]}
   */
  heardNotes() {
    return this._collectHeardNotes([]);
  }

  /** heardNotes, appended to `out` (no garbage on the per-frame path). */
  _collectHeardNotes(out) {
    this._hearInto = out;
    this.forEachSoundSource(this._hearVisitor);
    this._hearInto = null;
    return out;
  }

  /**
   * Ball-lightning look: lit while any of our notes sounds (flaring on each
   * onset), a bubble when silent, coloured by the harmony around us
   * (Messiaen — core/messiaenColour). Visual only. Runs every frame for
   * every creature, so it reuses its arrays instead of allocating.
   */
  updateLook(deltaTime) {
    if (!this.look) return;

    // Drop notes that have ended (musical clock), or all of them once the
    // instrument has stopped (song over, clap, dispose) — filtered in place
    const notes = this.soundingNotes;
    if (!this.instrument.playbackState.isPlaying) {
      notes.length = 0;
    } else if (notes.length > 0) {
      const beat = gameState.musicalClock.getCurrentBeat();
      let kept = 0;
      for (let i = 0; i < notes.length; i += 1) {
        if (beat < notes[i].endBeat + NOTE_END_GRACE_BEATS) {
          notes[kept] = notes[i];
          kept += 1;
        }
      }
      notes.length = kept;
    }

    const sounding = notes.length > 0;
    let harmony = null;
    let luminosity = null; // silent: the look keeps its last
    if (sounding) {
      // Own notes first, then heard: the order messiaenColour ranks
      // reflections in (memoized — the same harmony is a cache hit)
      const chord = this._chord;
      chord.length = 0;
      for (let i = 0; i < notes.length; i += 1) chord.push(notes[i].midi);
      this._collectHeardNotes(chord);
      harmony = messiaenColourCached(chord);
      luminosity = registerLuminosity(chord);
    }
    this.look.update(deltaTime, sounding, harmony, luminosity);
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
    // Stop current song immediately (its notes stop sounding with it)
    this.stopSong();
    this.soundingNotes.length = 0;

    // Convert displacement from whole-note fraction to quarter-note beats
    // (MusicalClock counts in quarter notes, so multiply by 4)
    const displacementInBeats = displacement * 4;
    this.nextSingBeat += displacementInBeats;

    // Visual feedback - a brief white flash
    if (this.look) this.look.flash();
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

    this.forEachSoundSource(addForceFromSource);
  }

  /**
   * Visit every OTHER sound source sounding right now, as it reaches this
   * creature — the ONE source model shared by harmony forces and the look's
   * colour. Range is NOT checked here (callers apply this.audibleRange).
   * visit(note, sourcePosition, sourceSize, extraDistance): for a source in
   * ANOTHER area, sourcePosition is the doorway on OUR side (sound comes
   * through it) and extraDistance carries the source->partner-gate leg
   * (+ closed-door leak); same-area sources pass no extraDistance.
   * @param {function} visit
   */
  forEachSoundSource(visit) {
    // Check our own area's entities for active sound sources (an indexed
    // loop: this runs several times per frame per singing creature)
    const localEntities = this.area ? this.area.entities : gameState.entities;
    for (let i = 0; i < localEntities.length; i += 1) {
      const entity = localEntities[i];
      // Skip self; skip anything without a playing instrument and a current
      // note. Use the entity's size if available, otherwise the default.
      if (
        entity.id !== this.id &&
        entity.instrument &&
        entity.instrument.playbackState.isPlaying &&
        entity.currentNote
      ) {
        visit(entity.currentNote, entity.position, entity.size || DEFAULT_CREATURE_SIZE);
      }
    }

    // Also check player's playback — direct only when the player is in OUR
    // area; otherwise the player is heard through a doorway (below)
    const playerInstrument = PlaybackManager.getPlayerInstrument();
    const playerHere = !this.area || this.area === gameState.activeArea;

    if (playerHere && playerInstrument.playbackState.isPlaying && playerInstrument.currentNote) {
      visit(playerInstrument.currentNote, gameState.player.position, PLAYER_SIZE);
    }

    // Sources sounding in ADJACENT areas pull/push through the doorway: the
    // force aims at the door on our side, and the far-side leg (+ leak while
    // closed) attenuates eligibility via extraDistance.
    if (this.area && gameState.world) {
      for (const seamSource of gameState.world.seamSourcesFor(this.area)) {
        visit(seamSource.note, seamSource.doorPosition, seamSource.size, seamSource.extraDistance);
      }
    }
  }

  /**
   * Update creature movement based on accumulated forces
   * @param {number} deltaTime - Time elapsed in seconds
   */
  updateMovement(deltaTime) {
    const elevationGrid = this.area ? this.area.elevationGrid : gameState.elevationGrid;

    // At rest, a pass changes nothing: with no force and no velocity the
    // move is zero, so collision can only zero a velocity that is already
    // zero, and the floor height and layer it re-derives at an unchanged spot
    // are exactly the ones the last pass derived there (a fixed point). So
    // skip the collision and floor work and keep only the writes (see
    // _isAtRest for "unchanged"). Every creature rests until something first
    // moves it; one that has COASTED never does again (its decaying velocity
    // sticks at ~1.5e-323 instead of reaching 0) unless a block zeroes it.
    if (this._isAtRest(elevationGrid)) {
      // A full pass leaves +0 even from a -0
      this.velocity.x = 0;
      this.velocity.z = 0;
      this.placeMesh();
      this.instrument.sourcePosition = this.position;
      return;
    }

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

    // Update mesh position (the visual floats above this — see placeMesh)
    this.placeMesh();

    // Update instrument source position for audio
    this.instrument.sourcePosition = this.position;

    this._rememberRest(elevationGrid);

    // Forces are cleared at the start of calculateForces(), not here
  }

  /**
   * Would a movement pass now change nothing? True with no force, no
   * velocity, and the position, floor height, layer and grid all EXACTLY
   * (bit for bit) as the last full pass left them — so anything else that
   * moved or re-layered the creature since (a teleport, a test) gets a full
   * pass that re-floors it.
   * @param {?ElevationGrid} elevationGrid - the grid this pass would use
   * @returns {boolean}
   */
  _isAtRest(elevationGrid) {
    const rest = this._rest;
    return (
      rest.valid &&
      this.forces.length === 0 &&
      this.velocity.x === 0 &&
      this.velocity.z === 0 &&
      Object.is(this.position.x, rest.x) &&
      Object.is(this.position.z, rest.z) &&
      Object.is(this.position.y, rest.y) &&
      Object.is(this.elevation, rest.elevation) &&
      elevationGrid === rest.grid
    );
  }

  /** Record what this full movement pass left, for _isAtRest. */
  _rememberRest(elevationGrid) {
    const rest = this._rest;
    const { x, y, z } = this.position;
    // A -0 coordinate is the one thing a zero move can still rewrite (to
    // +0, whenever nothing blocks it), so it never counts as rest
    rest.valid = !Object.is(x, -0) && !Object.is(z, -0);
    rest.x = x;
    rest.y = y;
    rest.z = z;
    rest.elevation = this.elevation;
    rest.grid = elevationGrid;
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

    // The look's geometry and materials are shared (userData.shared), so
    // Entity.dispose skips them; this only unhooks its uniform binding
    if (this.look) this.look.dispose();
    super.dispose();
  }
}

export default Creature;
