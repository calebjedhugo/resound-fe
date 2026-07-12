/**
 * PortalManager — the world orchestrator for cross-puzzle gate links.
 *
 * Linked puzzles are ONE WORLD made of live areas (core/Area). The player
 * stands in the ACTIVE area; every puzzle adjacent through a linked gate is
 * loaded as a FULLY LIVE neighbor — its creatures move, sing, and are
 * audible through the doorway (portal stage 3). This manager owns:
 *
 * - Area lifecycle: the active area plus link-depth-1 neighbors, loaded as
 *   live Areas the moment their JSON arrives, pruned when no longer
 *   adjacent. A puzzle may have several linked gates — any number of
 *   neighbors can be loaded at once.
 * - Crossing: stepping INTO an open linked gate's cell commits AT ONCE
 *   (ruled 2026-07-09): the active pointer swaps to the partner's area and
 *   the player stands in the partner's cell at the same offset — they are
 *   IN the new space, and every exit (including backing out the way they
 *   came) is plain walking against the destination's real geometry. No
 *   rebuild, so the neighbor keeps exactly the state seen through the
 *   doorway; recordings persist (one world), and the world CLOCK persists
 *   too (one clock).
 * - See-through rendering (stage 2): each open linked gate draws the LIVE
 *   neighbor scene through its doorway face (core/PortalView).
 * - The doorway sound model (stage 3): sound crosses a seam with effective
 *   distance = listener->gate + partner-gate->source, respecting the
 *   SOURCE's audible range; a CLOSED door leaks with an extra distance
 *   penalty (CLOSED_DOOR_LEAK_DISTANCE). Transmission is symmetric. Routing
 *   is installed into ListeningManager; creature harmony forces pull/push
 *   toward the doorway via seamSourcesFor.
 * - One door, two faces: a linked gate pair shares its song and its open
 *   state — while one face is held open by a performance, the partner face
 *   is held open too (Gate.holdOpenMirrored). Both faces hear both areas
 *   (via the seam), so a song can be completed by singing on both sides.
 * - Tempo gradient: one world clock, tempo owned by the active area; near a
 *   door whose neighbor runs a different tempo, the clock blends toward it
 *   (up to the midpoint AT the door), so tempo is continuous across a
 *   crossing. Mismatched links already draw an editor warning.
 */
import PuzzleLoader from 'core/PuzzleLoader';
import PortalView from 'core/PortalView';
import ListeningManager from 'core/ListeningManager';
import PlaybackManager from 'core/PlaybackManager';
import gameState from 'core/GameState';
import {
  WORLD_SCALE,
  ELEVATION_HEIGHT,
  CLOSED_DOOR_LEAK_DISTANCE,
  DEFAULT_CREATURE_SIZE,
  PLAYER_SIZE,
  DOORWAY_COMMIT_DEPTH,
  PLAYER_COLLISION_RADIUS,
} from 'core/constants';
import { FACING_VECTORS, OPPOSITE_FACING, DOORWAY_OFFSET, PANEL_EPSILON } from 'core/portalMath';
import { getDistance } from 'core/utils';
import { syncCameraToPlayer } from 'resoundModules/playerControls/motion/motion';

// Stable empty list for the common no-seam case (avoids per-frame garbage)
const NO_SOURCES = Object.freeze([]);

class PortalManager {
  constructor() {
    this._mainScene = null;
    this._activeArea = null;
    this._areas = new Map(); // puzzleId -> live Area (includes the active one)
    this._doors = []; // one entry per linked gate PAIR with both areas loaded
    this._linkedGates = []; // active area's linked gates (crossing + views)
    // gate -> Map<facing, PortalView> (a view per player-visible face) or
    // null once the link proves dangling (the gate stays an ordinary gate)
    this._views = new Map();
    // The doorway cell the player currently occupies ({ gate }, else null).
    // Crossing commits ON ENTRY, so after a swap this is the DESTINATION
    // gate; it re-arms only once the player walks fully out of the cell
    // (hysteresis against boundary jitter).
    this._insideDoor = null;
    this._transitioning = false;
    this._onCrossed = null;
    this._generation = 0; // bumped on reset: discards in-flight neighbor loads

    // Registered as the world's cross-area services (avoids import cycles:
    // Creature/ListeningManager reach us through these hooks, not imports)
    gameState.world = this;
    ListeningManager.seamRouter = (noteEvent, sourceArea, listenerArea, listener) =>
      this._routeThroughDoor(noteEvent, sourceArea, listenerArea, listener);
  }

  /**
   * @param {THREE.Scene} mainScene - the render scene; the ACTIVE area's
   *   content group lives here (a neighbor's lives in its own Area.scene)
   * @param {(puzzleData: object, arrivalGate: Gate) => void} [onCrossed] -
   *   notified after a crossing completes with the destination puzzle and
   *   the gate the player arrived AT (UI refresh hooks; an `ending` arrival
   *   gate triggers the thanks-for-playing overlay)
   */
  initialize(mainScene, onCrossed) {
    this._mainScene = mainScene;
    this._onCrossed = onCrossed || null;
  }

  /** Tear the whole world down (leaving for the menu). */
  reset() {
    this._generation += 1;
    this._disposeViews();
    this._setActiveArea(null);
    for (const area of this._areas.values()) {
      area.dispose();
    }
    this._areas.clear();
    this._doors = [];
    this._linkedGates = [];
    this._transitioning = false;
    this._insideDoor = null;
  }

  /**
   * Enter the world at the given puzzle: build it as the active area, place
   * the player at its start, and start the ONE world clock at its tempo.
   * Any previously loaded world is torn down first.
   * @param {object} puzzleData - validated puzzle JSON
   * @returns {Area} the new active area
   */
  enterWorld(puzzleData) {
    // An active area we don't own (the test harness's sandbox) must still be
    // torn down — its entities hold ListeningManager registrations
    const orphan =
      gameState.activeArea && gameState.activeArea !== this._activeArea
        ? gameState.activeArea
        : null;
    this.reset();
    if (orphan) orphan.dispose();
    // Clock FIRST: creatures schedule their next sing from the clock at
    // construction time, so the world's clock must exist before buildArea
    gameState.initMusicalClock((puzzleData && puzzleData.tempo) || 120);
    const area = PuzzleLoader.buildArea(puzzleData);
    this._areas.set(area.id, area);
    this._setActiveArea(area);
    PuzzleLoader.placePlayerAtStart(puzzleData, gameState);
    this._afterActiveChange();
    return area;
  }

  /** The area the player stands in (null when no world is loaded). */
  getActiveArea() {
    return this._activeArea;
  }

  /** A loaded area by puzzle id (active or neighbor), or null. */
  getArea(puzzleId) {
    return this._areas.get(puzzleId) || null;
  }

  /**
   * Advance every loaded area's simulation — the neighbor behind a doorway
   * is exactly as alive as the area the player stands in. Then sync door
   * pairs (one door, two faces) and the tempo gradient.
   */
  updateAreas(deltaTime) {
    for (const area of this._areas.values()) {
      area.update(deltaTime);
    }
    this._mirrorDoorPairs();
    this._updateTempoGradient();
  }

  /**
   * Is the player horizontally inside this gate's cell?
   * @param {Gate} gate
   * @param {number} [inset] - shrink the cell by this margin (the commit
   *   zone is inset so boundary jitter can't flicker the world)
   */
  // eslint-disable-next-line class-methods-use-this
  _playerInCell(gate, inset = 0) {
    const { position } = gameState.player;
    const half = WORLD_SCALE / 2 - inset;
    return (
      Math.abs(position.x - gate.position.x) < half && Math.abs(position.z - gate.position.z) < half
    );
  }

  /**
   * Per-frame doorway check (PLAYING only). Crossing commits ON ENTRY
   * (ruled 2026-07-09): stepping into an open linked gate's cell teleports
   * at once — the player is IN the new space, every perspective looks out
   * of the DESTINATION gate, and every exit (backing out included) is plain
   * walking against the destination's real geometry. The commit zone is
   * inset by DOORWAY_COMMIT_DEPTH and the occupied cell re-arms only after
   * a full step out, so cell-edge jitter never flickers the world.
   * A door never closes on its occupant: Gate holds itself in occupied
   * overtime (solid outside, open within) until they step clear.
   */
  update() {
    if (this._transitioning) return;

    if (this._insideDoor) {
      // Occupying a doorway cell (normally the destination face after a
      // swap): roam freely; re-arm once fully out. Stepping out of a
      // CROSSED door consumes its opening (close-on-exit, ruled
      // 2026-07-10) — unless a performance is holding it, or the player
      // merely backed out of a refused commit (no crossing happened).
      // The exit check includes the player's BODY (negative inset): closing
      // while their radius still overlaps the box would wedge them against
      // the newly solid face.
      if (this._playerInCell(this._insideDoor.gate, -PLAYER_COLLISION_RADIUS - 0.05)) return;
      const { gate, crossed } = this._insideDoor;
      this._insideDoor = null;
      if (crossed) this._closeUsedDoor(gate);
      return;
    }

    if (this._linkedGates.length === 0) return;
    const { elevation } = gameState.player;
    for (const gate of this._linkedGates) {
      if (!gate.isOpen) continue;
      const sameLevel = Math.round(gate.position.y / ELEVATION_HEIGHT) === elevation;
      if (!sameLevel) continue;
      if (this._playerInCell(gate, DOORWAY_COMMIT_DEPTH)) {
        this._cross(gate);
        return;
      }
    }
  }

  /**
   * Render-loop hook (called before the main scene renders each frame): draw
   * each OPEN linked gate's neighbor view into its doorway surfaces. Doors
   * are omnidirectional: EVERY face the eye is on the outward side of gets a
   * live view (two at a corner — both visible sides see through; a working
   * door never shows a green shell). Views are built lazily per face (once
   * the neighbor area is loaded) and kept until the active area changes;
   * while every linked gate is closed this is a no-op, so the see-through
   * pass costs nothing.
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Camera} camera - the player camera
   */
  renderPortals(renderer, camera) {
    for (const gate of this._linkedGates) {
      const faces = this._views.get(gate);
      if (faces === null) continue; // eslint-disable-line no-continue -- dangling link: ordinary gate
      // Render the destination while the door is open OR while a correct
      // performance is fading the shell: the other side materializes
      // THROUGH the dissolving door (the fade previews the real reward,
      // not the dead space behind the gate box).
      if (!gate.isOpen && !(gate._fade > 0)) {
        this._hideGateViews(gate);
        continue; // eslint-disable-line no-continue
      }
      if (this._insideDoor && this._insideDoor.gate === gate) {
        // The doorway's occupant is simply IN the destination: the world on
        // every side of them (behind included) is the real thing — no views
        // (an open gate already has no shell of any kind)
        this._hideGateViews(gate);
        continue; // eslint-disable-line no-continue
      }
      const broken = this._renderExteriorViews(gate, renderer, camera);
      if (broken) {
        this._hideGateViews(gate);
        this._views.set(gate, null); // the gate stays an ordinary gate
      }
    }
  }

  /** Hide every view of a gate. */
  _hideGateViews(gate) {
    const faces = this._views.get(gate);
    if (faces) for (const view of faces.values()) view.setVisible(false);
  }

  /**
   * Standard door look from outside: every face the eye is on the outward
   * side of renders the partner's world (two at a corner).
   * @returns {boolean} true when the link proved dangling
   */
  _renderExteriorViews(gate, renderer, camera) {
    let faces = this._views.get(gate);
    if (!faces) {
      faces = new Map(); // facing -> PortalView
      this._views.set(gate, faces);
    }
    // Signed distance of the eye past each panel's plane (the cell's far face
    // for that approach). Oblique sightlines through the cell legitimately
    // hit the SIDE panels, so more than one can be eligible at once.
    const panelPlane = DOORWAY_OFFSET - PANEL_EPSILON;
    const facings = Object.keys(FACING_VECTORS);
    const past = (facing) =>
      FACING_VECTORS[facing].x * (camera.position.x - gate.position.x) +
      FACING_VECTORS[facing].z * (camera.position.z - gate.position.z) +
      panelPlane;
    const eligible = facings.filter((f) => past(f) > 0.05);
    // Hide any panel the eye has moved behind.
    for (const f of facings) {
      if (!eligible.includes(f)) {
        const v = faces.get(f);
        if (v) v.setVisible(false);
      }
    }
    if (eligible.length === 0) return false;
    // Materialize every eligible panel's view (retrying / disabling on the
    // neighbor's load state, exactly as before).
    for (const f of eligible) {
      if (!faces.get(f)) {
        const view = this._createView(gate, f);
        if (view === undefined) return false; // neighbor not loaded yet: retry next frame
        if (view === null) return true; // dangling link
        faces.set(f, view);
      }
    }
    // The APPROACH panel owns the true doorway clip plane, and EVERY visible
    // panel clips with it, so the oblique side windows slice the neighbor
    // along the doorway axis instead of perpendicular to it (a perpendicular
    // slice shows a full-height cross-section that pops the neighbor's
    // apparent geometry as the eye moves — the "wall height jumps on one
    // step" bug). The approach is the gate's FACING axis (schema: facing is
    // the doorway plane — the wall the door sits in), NOT the panel the eye
    // is most in front of: standing off to the SIDE of a door and looking
    // back must still clip along the doorway, not sideways through the wall.
    const axis = FACING_VECTORS[gate.facing] || FACING_VECTORS.north;
    const eyeSide =
      axis.x * (camera.position.x - gate.position.x) +
      axis.z * (camera.position.z - gate.position.z);
    const approach = eyeSide > 0 ? gate.facing : OPPOSITE_FACING[gate.facing];
    // The approach face is always eligible (the eye is in front of it), so it
    // was materialized above; fall back to per-panel clips if it somehow was
    // not (defensive).
    const approachView = faces.get(approach);
    const sharedClip = approachView ? approachView.clipPlane : null;
    for (const f of eligible) {
      const view = faces.get(f);
      view.setVisible(true);
      view.render(renderer, camera, sharedClip);
    }
    return false;
  }

  // --- Doorway sound model (stage 3) -------------------------------------

  /**
   * Effective distance from the player to a position, through doors:
   * player->gate + partner-gate->position, plus the leak penalty while the
   * door is closed, minimized over the doors reaching `area`. Covers both
   * NEIGHBOR areas and doors joining two spots of the player's OWN area
   * (in-level teleport doors are sound shortcuts — a creature far across
   * the map is right there through the doorway).
   * @returns {number} Infinity when no door connects
   */
  effectiveDistanceToPlayer(area, position) {
    const player = gameState.player.position;
    let best = Infinity;
    for (const door of this._doors) {
      const leak = this._doorLeak(door);
      if (door.areaA === area && door.areaB === area && area === this._activeArea) {
        // Same-area door: either gate can be the near end
        best = Math.min(
          best,
          getDistance(player, door.gateA.position) +
            getDistance(position, door.gateB.position) +
            leak,
          getDistance(player, door.gateB.position) +
            getDistance(position, door.gateA.position) +
            leak
        );
        continue; // eslint-disable-line no-continue
      }
      const side = this._doorSides(door, area, this._activeArea);
      if (!side) continue; // eslint-disable-line no-continue
      const d =
        getDistance(player, side.remoteGate.position) +
        getDistance(position, side.localGate.position) +
        leak;
      if (d < best) best = d;
    }
    return best;
  }

  /**
   * Sound sources in areas ADJACENT to `area`, expressed through the
   * doorway: the returned position is the door on `area`'s side (harmony
   * forces pull/push toward the door — that's where the sound comes from)
   * and extraDistance carries the far-side leg (+ closed-door leak).
   * @returns {Array<{note, doorPosition, size, extraDistance}>}
   */
  seamSourcesFor(area) {
    if (this._doors.length === 0) return NO_SOURCES;
    const sources = [];
    for (const door of this._doors) {
      let localGate;
      let remoteGate;
      let remoteArea;
      if (door.areaA === area) {
        localGate = door.gateA;
        remoteGate = door.gateB;
        remoteArea = door.areaB;
      } else if (door.areaB === area) {
        localGate = door.gateB;
        remoteGate = door.gateA;
        remoteArea = door.areaA;
      } else {
        continue; // eslint-disable-line no-continue
      }
      // A door linking two gates of the SAME puzzle adds no seam sources —
      // same-area sound already travels directly
      if (remoteArea === area) continue; // eslint-disable-line no-continue
      const leak = this._doorLeak(door);

      for (const entity of remoteArea.entities) {
        if (!entity.instrument || !entity.instrument.playbackState.isPlaying) continue;
        if (!entity.currentNote) continue;
        sources.push({
          note: entity.currentNote,
          doorPosition: localGate.position,
          size: entity.size || DEFAULT_CREATURE_SIZE,
          extraDistance: getDistance(entity.position, remoteGate.position) + leak,
        });
      }

      // The player counts as a source in whichever area they stand in
      if (remoteArea === this._activeArea) {
        const playerInstrument = PlaybackManager.getPlayerInstrument();
        if (playerInstrument.playbackState.isPlaying && playerInstrument.currentNote) {
          sources.push({
            note: playerInstrument.currentNote,
            doorPosition: localGate.position,
            size: PLAYER_SIZE,
            extraDistance: getDistance(gameState.player.position, remoteGate.position) + leak,
          });
        }
      }
    }
    return sources;
  }

  /**
   * Seam router for ListeningManager: rewrite a note event emitted in
   * `sourceArea` so a listener in `listenerArea` hears it through the best
   * connecting door — sourcePosition becomes the door on the LISTENER's
   * side, extraDistance the source->partner-gate leg (+ closed-door leak).
   *
   * One door, two ears (ruled 2026-07-11): when the LISTENER is itself a
   * face of the door the sound crosses, the pair-face leg costs NOTHING —
   * no leak, and the local leg is zero (sourcePosition becomes the listener
   * itself). A sound within source-range of either face therefore corrupts
   * (and can complete) the door's matching from both sides; a jam beside
   * one face jams the DOOR, not just the face.
   * @returns {?object} null when the areas share no door
   */
  _routeThroughDoor(noteEvent, sourceArea, listenerArea, listener = null) {
    if (!noteEvent.sourcePosition) return null;
    let best = null;
    for (const door of this._doors) {
      const side = this._doorSides(door, listenerArea, sourceArea);
      if (!side) continue;
      const ownDoor = listener !== null && (door.gateA === listener || door.gateB === listener);
      const extra =
        getDistance(noteEvent.sourcePosition, side.remoteGate.position) +
        (ownDoor ? 0 : this._doorLeak(door));
      if (!best || extra < best.extra) {
        best = { localGate: side.localGate, extra };
      }
    }
    if (!best) return null;
    return {
      ...noteEvent,
      sourcePosition: best.localGate.position,
      extraDistance: (noteEvent.extraDistance || 0) + best.extra,
    };
  }

  /** Orient a door: which face is in `localArea`, which in `remoteArea`? */
  // eslint-disable-next-line class-methods-use-this
  _doorSides(door, localArea, remoteArea) {
    if (door.areaA === localArea && door.areaB === remoteArea) {
      return { localGate: door.gateA, remoteGate: door.gateB };
    }
    if (door.areaB === localArea && door.areaA === remoteArea) {
      return { localGate: door.gateB, remoteGate: door.gateA };
    }
    return null;
  }

  /** Extra effective distance across a door: 0 open, leak penalty closed. */
  // eslint-disable-next-line class-methods-use-this
  _doorLeak(door) {
    return door.gateA.isOpen || door.gateB.isOpen ? 0 : CLOSED_DOOR_LEAK_DISTANCE;
  }

  /**
   * One door, two faces: gates latch open on a completed song and close
   * when the player walks through, so mirroring propagates the CHANGE a
   * face made this frame — a completion on either side opens both faces, a
   * consumed crossing closes both. A pair containing a permanently-open
   * face (alwaysOpen) is deliberately NOT mirrored: that is the one-way
   * door mechanic — each face keeps its own openness.
   */
  _mirrorDoorPairs() {
    for (const door of this._doors) {
      const { gateA, gateB } = door;
      if (gateA.alwaysOpen || gateB.alwaysOpen) {
        door._prevOpenA = gateA.isOpen;
        door._prevOpenB = gateB.isOpen;
        continue; // eslint-disable-line no-continue -- one-way door: faces are independent
      }
      const aChanged = gateA.isOpen !== (door._prevOpenA ?? gateA.isOpen);
      const bChanged = gateB.isOpen !== (door._prevOpenB ?? gateB.isOpen);
      if (gateA.isOpen !== gateB.isOpen) {
        if (aChanged && !bChanged) {
          if (gateA.isOpen) gateB.open();
          else gateB.close();
        } else if (bChanged && !aChanged) {
          if (gateB.isOpen) gateA.open();
          else gateA.close();
        } else if (gateA.isOpen) {
          // Both changed at once, or a steady-state disagreement (e.g. a
          // face opened before its partner's area loaded): open wins — one
          // door, two faces.
          gateB.open();
        } else {
          gateA.open();
        }
      }
      door._prevOpenA = gateA.isOpen;
      door._prevOpenB = gateB.isOpen;
    }
  }

  /**
   * One clock, tempo owned by the active area — but tempo SHIFTS toward a
   * mismatched neighbor as the player nears its door, reaching the midpoint
   * AT the doorway. The neighbor side mirrors the blend, so tempo is
   * continuous through a crossing. Beat position is preserved (the clock
   * accumulates beats incrementally).
   */
  _updateTempoGradient() {
    const clock = gameState.musicalClock;
    if (!clock || !this._activeArea) return;
    const base = (this._activeArea.puzzle && this._activeArea.puzzle.tempo) || 120;
    let target = base;
    let strongest = 0;
    for (const door of this._doors) {
      const side = this._doorSides(
        door,
        this._activeArea,
        door.areaA === this._activeArea ? door.areaB : door.areaA
      );
      if (!side) continue;
      const remoteArea = door.areaA === this._activeArea ? door.areaB : door.areaA;
      if (remoteArea === this._activeArea) continue;
      const neighborTempo = (remoteArea.puzzle && remoteArea.puzzle.tempo) || 120;
      if (neighborTempo === base) continue;
      const range = side.localGate.audibleRange || 15;
      const d = getDistance(gameState.player.position, side.localGate.position);
      const influence = 0.5 * Math.max(0, 1 - d / range);
      if (influence > strongest) {
        strongest = influence;
        target = base + (neighborTempo - base) * influence;
      }
    }
    if (clock.tempo !== target) clock.setTempo(target);
  }

  // --- Area lifecycle -----------------------------------------------------

  _setActiveArea(area) {
    if (this._activeArea && this._mainScene) {
      // Park the outgoing area's content back in its own scene so open
      // doorways into it keep rendering it live
      this._mainScene.remove(this._activeArea.group);
      this._activeArea.scene.add(this._activeArea.group);
    }
    this._activeArea = area;
    gameState.activeArea = area;
    if (area && this._mainScene) {
      area.scene.remove(area.group);
      this._mainScene.add(area.group);
    }
  }

  /**
   * After the active area changes (world entry or crossing): rescan its
   * linked gates, load missing neighbors as LIVE areas, prune areas no
   * longer adjacent, and rebuild the door/view sets.
   */
  _afterActiveChange() {
    this._disposeViews();
    this._transitioning = false;
    this._linkedGates = this._activeArea
      ? this._activeArea.entityManager.getByType('gate').filter((g) => g.link && g.link.puzzleId)
      : [];

    // Prune areas that are neither active nor adjacent to it (their state
    // resets on the next visit — streaming beyond depth 1 is a later stage)
    const wanted = new Set();
    if (this._activeArea) wanted.add(this._activeArea.id);
    for (const gate of this._linkedGates) wanted.add(gate.link.puzzleId);
    for (const [id, area] of [...this._areas]) {
      if (!wanted.has(id)) {
        area.dispose();
        this._areas.delete(id);
      }
    }

    for (const gate of this._linkedGates) {
      this._loadNeighbor(gate.link.puzzleId);
    }
    this._rebuildDoors();
  }

  /**
   * Fetch and build a neighbor puzzle as a LIVE area. Once loaded it
   * simulates every frame — Caleb's ruling: loaded means fully live.
   */
  _loadNeighbor(puzzleId) {
    if (this._areas.has(puzzleId)) return;
    const generation = this._generation;
    PuzzleLoader.load(puzzleId)
      .then((data) => {
        // The world may have moved on while the fetch was in flight
        if (generation !== this._generation) return;
        if (this._areas.has(puzzleId) || !this._stillWanted(puzzleId)) return;
        this._areas.set(puzzleId, PuzzleLoader.buildArea(data));
        this._rebuildDoors();
      })
      .catch(() => {
        // Missing neighbor: crossing will retry the fetch and no-op on failure
      });
  }

  _stillWanted(puzzleId) {
    return this._linkedGates.some((g) => g.link && g.link.puzzleId === puzzleId);
  }

  /** Doors = linked gate pairs whose BOTH areas are currently loaded. */
  _rebuildDoors() {
    this._doors = [];
    const seen = new Set();
    for (const area of this._areas.values()) {
      for (const gate of area.entityManager.getByType('gate')) {
        if (!gate.link || !gate.link.puzzleId) continue;
        const partnerArea = this._areas.get(gate.link.puzzleId);
        if (!partnerArea) continue;
        const partnerGate = partnerArea.entityManager
          .getByType('gate')
          .find((g) => g.gateId === gate.link.gateId);
        if (!partnerGate) continue;
        const key = [`${area.id}:${gate.gateId}`, `${partnerArea.id}:${partnerGate.gateId}`]
          .sort()
          .join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        this._doors.push({ gateA: gate, areaA: area, gateB: partnerGate, areaB: partnerArea });
      }
    }
  }

  _disposeViews() {
    for (const faces of this._views.values()) {
      if (!faces) continue; // eslint-disable-line no-continue -- null = dangling marker
      for (const view of faces.values()) view.dispose();
    }
    this._views.clear();
  }

  /**
   * @param {Gate} gate
   * @param {string} [sourceFacing] - which face of `gate` the view renders
   *   on (the player's current side); defaults to the gate's facing
   * @returns {PortalView | null | undefined} null = permanently not
   *   renderable (dangling link — the gate stays an ordinary gate);
   *   undefined = neighbor area not loaded yet.
   */
  _createView(gate, sourceFacing = gate.facing) {
    const neighbor = this._areas.get(gate.link.puzzleId);
    if (!neighbor) return undefined;
    const partner = neighbor.entityManager
      .getByType('gate')
      .find((g) => g.gateId === gate.link.gateId);
    if (!partner) return null;
    // A same-puzzle door's "neighbor" is the ACTIVE area, whose content
    // group lives in the main scene (Area.scene is empty while active) —
    // render the main scene through the doorway instead.
    const sceneOverride = neighbor === this._activeArea ? this._mainScene : null;
    // Entry face -> opposite exit face: looking into the north end shows
    // out the partner's south end (a translation mapping — no mirror flip),
    // matching where walking straight through lands you.
    const partnerFacing = OPPOSITE_FACING[sourceFacing] || 'south';
    return new PortalView(gate, partner, neighbor, {
      sceneOverride,
      sourceFacing,
      partnerFacing,
    });
  }

  /**
   * Commit the crossing INTO `gate` (called the moment the player steps
   * into its commit zone): swap the ACTIVE area pointer to the partner's
   * and translate the player to the SAME offset in the partner's cell —
   * the two cells are one room with two addresses, and entering means the
   * player now stands at the DESTINATION address, heading untouched. The
   * neighbor keeps the exact state seen through the doorway, and the world
   * clock keeps running.
   *
   * No-soft-lock: a partner walled in on EVERY side would trap its
   * occupant, so entry refuses to commit instead — the cell stays plain
   * walkable space and the player backs out the way they came.
   * @param {Gate} gate
   */
  async _cross(gate) {
    this._transitioning = true;
    const { puzzleId, gateId } = gate.link;

    let neighbor = this._areas.get(puzzleId);
    if (!neighbor) {
      try {
        const data = await PuzzleLoader.load(puzzleId);
        neighbor = PuzzleLoader.buildArea(data);
        this._areas.set(puzzleId, neighbor);
      } catch {
        // Unloadable neighbor: leave the gate inert rather than crash the game
        this._linkedGates = this._linkedGates.filter((g) => g !== gate);
        this._transitioning = false;
        return;
      }
    }

    const partner = neighbor.entityManager.getByType('gate').find((g) => g.gateId === gateId);
    if (!partner) {
      // Dangling link (partner renamed/deleted): disable this door
      this._linkedGates = this._linkedGates.filter((g) => g !== gate);
      this._transitioning = false;
      return;
    }

    if (!this._anyExitClear(neighbor, partner)) {
      // Never teleport into a trap (authoring error): occupy the cell
      // without committing so entry doesn't retry every frame; re-arms
      // when the player steps back out. No crossing happened, so backing
      // out must NOT consume the opening.
      this._insideDoor = { gate, crossed: false };
      this._transitioning = false;
      return;
    }

    // Preserve the player's offset within the doorway cell — but CLAMP it so
    // their body lands fully inside the destination cell. The commit fires
    // with the body's trailing edge still poking out of the cell
    // (commit depth 0.3 < collision radius 0.4); if a wall sits flush behind
    // the partner (e.g. a door on a grid-edge row against the perimeter),
    // an unclamped offset wedges the player into it — and the per-frame walk
    // step is smaller than the overlap, so they can never escape.
    const maxOffset = WORLD_SCALE / 2 - PLAYER_COLLISION_RADIUS - 0.05;
    const clamp = (v) => Math.max(-maxOffset, Math.min(maxOffset, v));
    const offset = {
      x: clamp(gameState.player.position.x - gate.position.x),
      z: clamp(gameState.player.position.z - gate.position.z),
    };

    this._setActiveArea(neighbor);

    gameState.player.position = {
      x: partner.position.x + offset.x,
      y: partner.position.y + 1.8,
      z: partner.position.z + offset.z,
    };
    gameState.player.elevation = Math.round(partner.position.y / ELEVATION_HEIGHT);
    syncCameraToPlayer(gameState.player.position);

    this._afterActiveChange();
    // The player now occupies the DESTINATION face; crossing re-arms once
    // they walk fully out of its cell, which consumes the opening
    this._insideDoor = { gate: partner, crossed: true };
    // Callback gets the destination puzzle AND the arrival gate — an
    // `ending: true` arrival gate triggers the thanks-for-playing overlay
    if (this._onCrossed) this._onCrossed(neighbor.puzzle, partner);
  }

  /**
   * A crossing was consumed (the player walked out of the destination face):
   * close BOTH faces of the door — unless either face is still held open by
   * a performance (a parked performer keeps the way back open), or a face is
   * permanently open (alwaysOpen faces never close).
   */
  _closeUsedDoor(gate) {
    const door = this._doors.find((d) => d.gateA === gate || d.gateB === gate);
    if (!door) {
      if (gate.isHeldByPerformance()) gate._closePending = true;
      else gate.close();
      return;
    }
    if (door.gateA.isHeldByPerformance() || door.gateB.isHeldByPerformance()) {
      // Consumed but held (e.g. a parked performer): defer — each face
      // closes itself once nothing holds it anymore.
      door.gateA._closePending = true;
      door.gateB._closePending = true;
      return;
    }
    door.gateA.close();
    door.gateB.close();
    door._prevOpenA = door.gateA.isOpen;
    door._prevOpenB = door.gateB.isOpen;
  }

  /** True if at least one side of the partner gate is open floor to walk out. */
  _anyExitClear(area, partnerGate) {
    return Object.values(FACING_VECTORS).some((v) => !this._exitBlocked(area, partnerGate, v));
  }

  /** True if the cell one step from the partner gate along `v` is not open floor. */
  // eslint-disable-next-line class-methods-use-this
  _exitBlocked(area, partnerGate, v) {
    // Outside the grid = the perimeter, always blocked
    if (partnerGate.gridPosition) {
      const gx = partnerGate.gridPosition.x + v.x;
      const gz = partnerGate.gridPosition.z + v.z;
      const gridSize = (area.puzzle && area.puzzle.gridSize) || Infinity;
      if (gx < 0 || gx >= gridSize || gz < 0 || gz >= gridSize) return true;
    }
    const cx = partnerGate.position.x + v.x * WORLD_SCALE;
    const cz = partnerGate.position.z + v.z * WORLD_SCALE;
    const cy = partnerGate.position.y;
    return area.entities.some(
      (e) =>
        (e.type === 'wall' || e.type === 'gate' || e.type === 'fountain') &&
        Math.abs(e.position.x - cx) < WORLD_SCALE / 2 &&
        Math.abs(e.position.z - cz) < WORLD_SCALE / 2 &&
        Math.abs(e.position.y - cy) < ELEVATION_HEIGHT / 2
    );
  }
}

// Singleton (mirrors ClapManager / ListeningManager)
const portalManager = new PortalManager();
export default portalManager;
