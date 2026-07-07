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
 * - Crossing (stage 1): walking into an OPEN linked gate's cell swaps the
 *   ACTIVE pointer to the neighbor area — no rebuild, so the neighbor keeps
 *   exactly the state seen through the doorway. Recordings persist (one
 *   world), and the world CLOCK persists too (one clock).
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
} from 'core/constants';
import { FACING_VECTORS } from 'core/portalMath';
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
    this._views = new Map(); // gate -> PortalView | null (null = dangling link)
    this._transitioning = false;
    this._onCrossed = null;
    this._generation = 0; // bumped on reset: discards in-flight neighbor loads

    // Registered as the world's cross-area services (avoids import cycles:
    // Creature/ListeningManager reach us through these hooks, not imports)
    gameState.world = this;
    ListeningManager.seamRouter = (noteEvent, sourceArea, listenerArea) =>
      this._routeThroughDoor(noteEvent, sourceArea, listenerArea);
  }

  /**
   * @param {THREE.Scene} mainScene - the render scene; the ACTIVE area's
   *   content group lives here (a neighbor's lives in its own Area.scene)
   * @param {(puzzleData: object) => void} [onCrossed] - notified after a
   *   crossing completes (UI refresh hooks)
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
   * Per-frame crossing check (PLAYING only): the player stepping into an
   * OPEN linked gate's cell crosses to the linked puzzle.
   */
  update() {
    if (this._transitioning || this._linkedGates.length === 0) return;
    const { position, elevation } = gameState.player;
    const half = WORLD_SCALE / 2;
    for (const gate of this._linkedGates) {
      if (!gate.isOpen) continue;
      const sameLevel = Math.round(gate.position.y / ELEVATION_HEIGHT) === elevation;
      if (!sameLevel) continue;
      if (
        Math.abs(position.x - gate.position.x) < half &&
        Math.abs(position.z - gate.position.z) < half
      ) {
        this._cross(gate);
        return;
      }
    }
  }

  /**
   * Render-loop hook (called before the main scene renders each frame): draw
   * each OPEN linked gate's neighbor view into its doorway surface. Views
   * are built lazily on first open (once the neighbor area is loaded) and
   * kept until the active area changes; while every linked gate is closed
   * this is a no-op, so the see-through pass costs nothing.
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Camera} camera - the player camera
   */
  renderPortals(renderer, camera) {
    for (const gate of this._linkedGates) {
      let view = this._views.get(gate);
      if (view === undefined && gate.isOpen) {
        view = this._createView(gate);
        // undefined = neighbor not loaded yet: retry next frame, don't memoize
        if (view !== undefined) this._views.set(gate, view);
      }
      if (view) {
        view.setVisible(gate.isOpen);
        if (gate.isOpen) view.render(renderer, camera);
      }
    }
  }

  // --- Doorway sound model (stage 3) -------------------------------------

  /**
   * Effective distance from the player to a position in a NEIGHBOR area:
   * player->gate + partner-gate->position, plus the leak penalty while the
   * door is closed, minimized over the doors joining the two areas.
   * @returns {number} Infinity when the areas share no door
   */
  effectiveDistanceToPlayer(area, position) {
    let best = Infinity;
    for (const door of this._doors) {
      const side = this._doorSides(door, area, this._activeArea);
      if (!side) continue;
      const d =
        getDistance(gameState.player.position, side.remoteGate.position) +
        getDistance(position, side.localGate.position) +
        this._doorLeak(door);
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
   * @returns {?object} null when the areas share no door
   */
  _routeThroughDoor(noteEvent, sourceArea, listenerArea) {
    if (!noteEvent.sourcePosition) return null;
    let best = null;
    for (const door of this._doors) {
      const side = this._doorSides(door, listenerArea, sourceArea);
      if (!side) continue;
      const extra =
        getDistance(noteEvent.sourcePosition, side.remoteGate.position) + this._doorLeak(door);
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
   * One door, two faces: while either face of a linked pair is held open by
   * its own performance, hold the partner face open too. Mirrored holds are
   * flagged so they lapse with the performance (see Gate.holdOpenMirrored).
   */
  _mirrorDoorPairs() {
    for (const door of this._doors) {
      const aSelf = door.gateA.isSelfOpen();
      const bSelf = door.gateB.isSelfOpen();
      if (aSelf && !bSelf) door.gateB.holdOpenMirrored();
      else if (bSelf && !aSelf) door.gateA.holdOpenMirrored();
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
    for (const view of this._views.values()) {
      if (view) view.dispose();
    }
    this._views.clear();
  }

  /**
   * @returns {PortalView | null | undefined} null = permanently not
   *   renderable (dangling link — the gate stays an ordinary gate);
   *   undefined = neighbor area not loaded yet.
   */
  _createView(gate) {
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
    return new PortalView(gate, partner, neighbor, sceneOverride);
  }

  /**
   * Perform the transition through `gate` to its linked partner: swap the
   * ACTIVE area pointer — the neighbor keeps the exact state the player saw
   * through the doorway, and the world clock keeps running.
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

    this._setActiveArea(neighbor);

    // Arrive just OUTSIDE the partner gate, on its doorway side, facing away
    // from it — as if having just stepped through. (partner.position is in
    // world units; its y is the floor height of the gate's level.)
    const outward = FACING_VECTORS[partner.facing] || FACING_VECTORS.north;
    gameState.player.position = {
      x: partner.position.x + outward.x * WORLD_SCALE,
      y: partner.position.y + 1.8,
      z: partner.position.z + outward.z * WORLD_SCALE,
    };
    gameState.player.elevation = Math.round(partner.position.y / ELEVATION_HEIGHT);
    // Yaw that walks the outward vector: forward = (-sin(yaw), 0, -cos(yaw))
    gameState.camera.viewCenter = [Math.atan2(-outward.x, -outward.z), 0];
    syncCameraToPlayer(gameState.player.position);

    this._afterActiveChange();
    if (this._onCrossed) this._onCrossed(neighbor.puzzle);
  }
}

// Singleton (mirrors ClapManager / ListeningManager)
const portalManager = new PortalManager();
export default portalManager;
