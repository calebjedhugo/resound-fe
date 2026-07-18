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

/** The cleanser standing exactly on `gate`'s cell in `area`, if any. */
function cleanserAtGate(area, gate) {
  return area.entityManager
    .getByType('cleanser')
    .find(
      (c) =>
        Math.abs(c.position.x - gate.position.x) < 0.01 &&
        Math.abs(c.position.y - gate.position.y) < 0.01 &&
        Math.abs(c.position.z - gate.position.z) < 0.01
    );
}

class PortalManager {
  constructor() {
    this._mainScene = null;
    this._activeArea = null;
    this._areas = new Map(); // puzzleId -> live Area (includes the active one)
    this._doors = []; // one entry per linked gate PAIR with both areas loaded
    this._linkedGates = []; // active area's linked gates (crossing + views)
    // Visual-only clones of a cleanser sitting under a door's PARTNER face
    // (see _rebuildTileMirrors): { mesh, group } pairs, rebuilt with doors
    this._tileMirrors = [];
    // Areas pinned live beyond the link-adjacency rule — the deployable
    // cleanser gate retains its destination so the pad's see-through view
    // has a live scene to render (core/DeployManager).
    this._retained = new Set();
    // gate -> Map<facing, PortalView> (a view per player-visible face) or
    // null once the link proves dangling (the gate stays an ordinary gate)
    this._views = new Map();
    // gate -> facings whose adjacent cell holds no wall (static per area,
    // computed lazily; drives the shared-clip approach axis)
    this._openFacingsByGate = new Map();
    // Faces created this render frame, pending a second warm-up pass
    // (_flushWarmUps) once every peer face holds content
    this._newViews = [];
    // Frame counter for face freshness: a face nobody's eye renders still
    // shows in other portals' mirrors, and must not freeze in time
    this._frameId = 0;
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
    this._tileMirrors = []; // meshes died with their areas' groups
    this._retained.clear();
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
    this._frameId += 1;
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
    this._flushWarmUps(renderer);
    // MIRROR sweep (recursive): walk the portal graph from every door that
    // actually drew this frame, composing mapped eyes hop by hop, and
    // re-render — every frame, deepest level first — each face a chain
    // shows that the player pass did NOT draw. Level 0 then samples
    // level-1 next frame, level-1 sampled fresh level-2 THIS frame, and so
    // on: every visible recursion level updates at full frame rate with
    // the correct perspective (a creature two portals deep moves as
    // smoothly as one). Budget-capped; the rotor below remains the
    // backstop for faces no sightline touches.
    this._mirrorSweep(renderer, camera);
    this._refreshStaleFaces(renderer);
  }

  /** Hide every view of a gate. */
  _hideGateViews(gate) {
    const faces = this._views.get(gate);
    if (faces) for (const view of faces.values()) view.setVisible(false);
  }

  /**
   * Render see-through views for the OPEN linked gates of a specific
   * (usually neighbor) area, for an arbitrary eye — the deployable
   * cleanser gate's pre-pass uses this so a door seen through the gate is
   * itself see-through even when the destination isn't the active area.
   * Only doors whose partner area is loaded render (a partner at
   * link-depth 2 isn't live). Views land in the same per-gate registry as
   * the active area's (disposed together on active change); callers hide
   * them again after sampling (hideAreaPortals) so their textures — valid
   * for this eye only — never smear into other sightlines.
   */
  renderAreaPortals(area, renderer, camera) {
    for (const gate of area.entityManager.getByType('gate')) {
      if (!gate.link || !gate.link.puzzleId || !gate.isOpen) continue; // eslint-disable-line no-continue
      if (this._views.get(gate) === null) continue; // eslint-disable-line no-continue -- dangling
      const broken = this._renderExteriorViews(gate, renderer, camera);
      if (broken) {
        this._hideGateViews(gate);
        this._views.set(gate, null);
      }
    }
    this._flushWarmUps(renderer);
  }

  /** Hide every view rendered by renderAreaPortals for this area. */
  hideAreaPortals(area) {
    for (const gate of area.entityManager.getByType('gate')) {
      this._hideGateViews(gate);
    }
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
    const facings = Object.keys(FACING_VECTORS);
    // Materialize EVERY face once the neighbor is loaded — not just the
    // player-eligible ones — and WARM each new face's buffers immediately
    // with one straight-on render. A panel is sampled by OTHER portal
    // passes too (mirror sightlines through doors, the cleanser gate's
    // mapped eye), whose eyes see faces the player's own eye may never
    // make eligible; an unwritten target samples BLACK (the teleport
    // stress test: "portals start black, settle after walking around").
    // Warm content is stale until the face renders for a real eye, but
    // stale reads as the world — black reads as a hole.
    for (const f of facings) {
      if (faces.get(f)) continue; // eslint-disable-line no-continue
      const view = this._createView(gate, f);
      if (view === undefined) return false; // neighbor not loaded yet: retry next frame
      if (view === null) return true; // dangling link
      faces.set(f, view);
      this._warmUpView(view, gate, f, renderer);
      this._newViews.push({ view, gate, facing: f });
    }
    // Every face of an open gate stays VISIBLE, whatever side the eye is
    // on: the player can't see a face they're behind anyway (front-side
    // culling), but other portals' passes must sample its last content —
    // hiding it punched a black hole into every mirror sightline.
    for (const view of faces.values()) view.setVisible(true);
    // Signed distance of the eye past each panel's plane (the cell's far face
    // for that approach). Oblique sightlines through the cell legitimately
    // hit the SIDE panels, so more than one can be eligible at once — these
    // are the faces that re-render FRESH for this eye.
    const panelPlane = DOORWAY_OFFSET - PANEL_EPSILON;
    const past = (facing) =>
      FACING_VECTORS[facing].x * (camera.position.x - gate.position.x) +
      FACING_VECTORS[facing].z * (camera.position.z - gate.position.z) +
      panelPlane;
    const eligible = facings.filter((f) => past(f) > 0.05);
    if (eligible.length === 0) return false;
    // The APPROACH panel owns the true doorway clip plane, and EVERY visible
    // panel clips with it, so the oblique side windows slice the neighbor
    // along the doorway axis instead of perpendicular to it (a perpendicular
    // slice shows a full-height cross-section that pops the neighbor's
    // apparent geometry as the eye moves — the "wall height jumps on one
    // step" bug). The approach is the OPEN face the eye is furthest beyond
    // (see _approachFacing): for a door sitting in a wall that is always the
    // facing axis — standing off to the SIDE of such a door and looking back
    // must still clip along the doorway, not sideways through the wall — but
    // a FREESTANDING door (a teleport pair in open floor) is really
    // approached from whichever side the player is on, and clipping along
    // its authored facing there sliced every sightline sideways: black side
    // panels, and viewer-side content painting into the view.
    const approach = this._approachFacing(gate, camera);
    // The approach face is always eligible (the eye is in front of it), so it
    // was materialized above; fall back to per-panel clips if it somehow was
    // not (defensive).
    const approachView = faces.get(approach);
    const sharedClip = approachView ? approachView.clipPlane : null;
    // The approach panel's eye-side walls ride along with its clip plane:
    // the shared plane's overreach can graze their faces in EVERY panel's
    // pass, not just the approach panel's own.
    const sharedWalls = approachView ? approachView.wallsToHide(camera) : null;
    for (const f of eligible) {
      const view = faces.get(f);
      // A pass may still skip inside render() (frustum cull) — only a pass
      // that actually ran counts as fresh. _playerFresh drives the mirror
      // sweep (an ELIGIBLE face that was frustum-culled still needs a
      // mirror render); _freshFrame drives the stale rotor.
      if (view.render(renderer, camera, sharedClip, sharedWalls)) {
        view._freshFrame = this._frameId;
        view._playerFresh = this._frameId;
      }
    }
    return false;
  }

  /**
   * Seed or refresh a face's buffers with one straight-on render (an eye
   * 1.5 cells out from the face, at head height) so a portal pass sampling
   * it never reads an unwritten black target — or a frozen-in-time one.
   * Bare eye: no frustum cull applies.
   */
  _warmUpView(view, gate, facing, renderer) {
    const v = FACING_VECTORS[facing];
    view.render(renderer, {
      position: {
        x: gate.position.x + v.x * WORLD_SCALE * 1.5,
        y: gate.position.y + 1.8,
        z: gate.position.z + v.z * WORLD_SCALE * 1.5,
      },
    });
    view._freshFrame = this._frameId;
  }

  /**
   * Public warm hook for views owned elsewhere (the cleanser gate's pad
   * panels): one straight-on refresh of `view`, derived from its own gate
   * and facing.
   */
  warmView(view, renderer) {
    this._warmUpView(view, view.gate, view.facing, renderer);
  }

  /**
   * Faces of `gate` whose panel plane the eye at `eyePos` is past — the
   * faces that eye can look into (same math the player-eligibility uses).
   */
  // eslint-disable-next-line class-methods-use-this
  _eligibleFaces(gate, eyePos) {
    const panelPlane = DOORWAY_OFFSET - PANEL_EPSILON;
    return Object.keys(FACING_VECTORS).filter(
      (f) =>
        FACING_VECTORS[f].x * (eyePos.x - gate.position.x) +
          FACING_VECTORS[f].z * (eyePos.z - gate.position.z) +
          panelPlane >
        0.05
    );
  }

  /** The other end of `gate`'s door pair, if both areas are loaded. */
  _partnerGate(gate) {
    const door = this._doors.find((d) => d.gateA === gate || d.gateB === gate);
    if (!door) return null;
    return door.gateA === gate ? door.gateB : door.gateA;
  }

  // Mirror-sweep budget: recursion depth of the portal-graph walk, total
  // extra half-res passes per frame, and frontier width per level. Deep
  // levels are the smallest on screen, so the cap drops them first.
  static MIRROR_MAX_DEPTH = 4;

  static MIRROR_MAX_PASSES = 12;

  static MIRROR_MAX_FRONTIER = 16;

  /**
   * Recursive mirror sweep: BFS the portal graph from every SAME-AREA
   * door that actually drew for the player this frame, composing mapped
   * eyes hop by hop (a door's mapping is one rigid translation — any
   * face's map applies), and render every face a chain shows that the
   * player pass did NOT draw — deepest level first, so a shallow mirror
   * face samples this-frame-fresh deeper content the moment it renders.
   * Faces are deduped shallowest-wins (the biggest on screen); a face the
   * player pass drew is skipped (its texture is already this-frame fresh;
   * self/partner recursion rides the double-buffered cascade). Chains
   * schedule cross-area doors' faces but never walk THROUGH them: their
   * views show the neighbor scene, where no panels live (pre-existing
   * limitation).
   */
  _mirrorSweep(renderer, camera) {
    const scheduled = new Map(); // view -> { eye, depth }
    // Seeds: doors whose views the player is actually looking into
    let frontier = [];
    for (const gate of this._linkedGates) {
      if (!this._isSameAreaDoor(gate)) continue; // eslint-disable-line no-continue
      const faces = this._views.get(gate);
      if (!faces || faces.size === 0) continue; // eslint-disable-line no-continue
      const drewThisFrame = [...faces.values()].some((v) => v._playerFresh === this._frameId);
      if (drewThisFrame) frontier.push({ gate, eye: camera.position });
    }

    for (
      let depth = 1;
      depth <= PortalManager.MIRROR_MAX_DEPTH && frontier.length > 0;
      depth += 1
    ) {
      const next = [];
      for (const { gate: source, eye } of frontier) {
        const sourceFaces = this._views.get(source);
        if (!sourceFaces || sourceFaces.size === 0) continue; // eslint-disable-line no-continue
        const [anyView] = sourceFaces.values();
        const mapped = anyView._map({ x: eye.x, y: eye.y, z: eye.z });
        const partner = this._partnerGate(source);
        for (const gate of this._linkedGates) {
          if (gate === source || gate === partner) continue; // eslint-disable-line no-continue
          if (!gate.isOpen && !(gate._fade > 0)) continue; // eslint-disable-line no-continue
          const faces = this._views.get(gate);
          if (!faces) continue; // eslint-disable-line no-continue
          const eligible = this._eligibleFaces(gate, mapped);
          for (const f of eligible) {
            const view = faces.get(f);
            if (!view || !view.surface.visible) continue; // eslint-disable-line no-continue
            if (view._playerFresh === this._frameId) continue; // eslint-disable-line no-continue
            if (!scheduled.has(view)) scheduled.set(view, { eye: mapped, depth });
          }
          // The chain continues through this door's view — but only
          // same-area doors show panels to keep refreshing
          if (
            eligible.length > 0 &&
            this._isSameAreaDoor(gate) &&
            next.length < PortalManager.MIRROR_MAX_FRONTIER
          ) {
            next.push({ gate, eye: mapped });
          }
        }
      }
      frontier = next;
    }

    if (scheduled.size === 0) return;
    // Shallowest-first for the cap (keep what dominates the screen), then
    // render the keepers deepest-first so each level samples fresh content
    const kept = [...scheduled.entries()]
      .sort((a, b) => a[1].depth - b[1].depth)
      .slice(0, PortalManager.MIRROR_MAX_PASSES)
      .reverse();
    for (const [view, { eye }] of kept) {
      if (view.render(renderer, { position: eye })) {
        view._freshFrame = this._frameId;
      }
    }
  }

  /** Is this linked gate an in-area teleport door (both ends live here)? */
  _isSameAreaDoor(gate) {
    return Boolean(
      this._activeArea &&
        gate.link &&
        gate.link.puzzleId === this._activeArea.id &&
        (gate.isOpen || gate._fade > 0) &&
        !(this._insideDoor && this._insideDoor.gate === gate)
    );
  }

  // A face nobody's eye has rendered for this many renderPortals frames is
  // STALE: it still shows in other portals' mirrors, and a frozen snapshot
  // (a closed gate that has since opened, a creature stuck mid-song) reads
  // as a bug the moment the world moves on. Refresh the oldest few per
  // frame — bounded cost, a BACKSTOP for faces no direct or mirror
  // sightline touches (mirror faces render fresh via _mirrorSweep).
  static STALE_MAX_FRAMES = 15;

  static STALE_REFRESH_PER_FRAME = 2;

  _refreshStaleFaces(renderer) {
    const stale = [];
    for (const [gate, faces] of this._views) {
      if (!faces || !gate.isOpen) continue; // eslint-disable-line no-continue
      if (this._insideDoor && this._insideDoor.gate === gate) continue; // eslint-disable-line no-continue
      for (const view of faces.values()) {
        if (!view.surface.visible) continue; // eslint-disable-line no-continue -- hidden = never sampled
        if (this._frameId - (view._freshFrame || 0) > PortalManager.STALE_MAX_FRAMES) {
          stale.push(view);
        }
      }
    }
    if (stale.length === 0) return;
    stale.sort((a, b) => (a._freshFrame || 0) - (b._freshFrame || 0));
    const budget = Math.min(PortalManager.STALE_REFRESH_PER_FRAME, stale.length);
    for (let i = 0; i < budget; i += 1) {
      this._warmUpView(stale[i], stale[i].gate, stale[i].facing, renderer);
    }
  }

  /**
   * Faces created this frame warmed up before some of their peers existed
   * and may have sampled a still-black panel — warm each once more now
   * that every face holds content.
   */
  _flushWarmUps(renderer) {
    if (this._newViews.length === 0) return;
    for (const { view, gate, facing } of this._newViews) {
      this._warmUpView(view, gate, facing, renderer);
    }
    this._newViews = [];
  }

  /**
   * The face whose OPEN plane the eye is furthest beyond — the side the
   * player actually approaches the doorway from. Faces buried in a wall (an
   * adjacent wall cell in the gate's own area) cannot be approached, so a
   * door sitting in a wall always resolves to its facing axis even when the
   * eye hugs that wall far off to the side. With every open face behind the
   * eye (inside the cell footprint), fall back to the facing-axis rule.
   */
  _approachFacing(gate, camera) {
    let approach = null;
    let best = 0.05;
    for (const f of this._openFacings(gate)) {
      const d =
        FACING_VECTORS[f].x * (camera.position.x - gate.position.x) +
        FACING_VECTORS[f].z * (camera.position.z - gate.position.z);
      if (d > best) {
        best = d;
        approach = f;
      }
    }
    if (approach) return approach;
    const axis = FACING_VECTORS[gate.facing] || FACING_VECTORS.north;
    const eyeSide =
      axis.x * (camera.position.x - gate.position.x) +
      axis.z * (camera.position.z - gate.position.z);
    return eyeSide > 0 ? gate.facing : OPPOSITE_FACING[gate.facing];
  }

  /**
   * Facings of `gate` whose adjacent cell holds no wall (in the gate's own
   * area, at the gate's storey). Gates and walls never move, so the answer
   * is cached until the views are torn down.
   */
  _openFacings(gate) {
    let open = this._openFacingsByGate.get(gate);
    if (open) return open;
    const entities = (gate.area && gate.area.entities) || [];
    const walls = entities.filter((e) => e.type === 'wall');
    open = Object.keys(FACING_VECTORS).filter((f) => {
      const v = FACING_VECTORS[f];
      const cx = gate.position.x + v.x * WORLD_SCALE;
      const cz = gate.position.z + v.z * WORLD_SCALE;
      return !walls.some(
        (w) =>
          Math.abs(w.position.x - cx) < WORLD_SCALE / 2 &&
          Math.abs(w.position.z - cz) < WORLD_SCALE / 2 &&
          Math.abs(w.position.y - gate.position.y) < WORLD_SCALE / 2
      );
    });
    this._openFacingsByGate.set(gate, open);
    return open;
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
    // resets on the next visit — streaming beyond depth 1 is a later stage).
    // Retained areas (the deployable gate's destination) are kept live too.
    const wanted = new Set(this._retained);
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
    for (const id of this._retained) {
      this._loadNeighbor(id);
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
    return (
      this._retained.has(puzzleId) ||
      this._linkedGates.some((g) => g.link && g.link.puzzleId === puzzleId)
    );
  }

  /**
   * Pin an area live regardless of link adjacency (loading it if needed) —
   * the deployable cleanser gate retains its destination so the pad's
   * see-through view always has a live scene. Balanced by releaseArea.
   */
  retainArea(puzzleId) {
    if (!puzzleId) return;
    this._retained.add(puzzleId);
    this._loadNeighbor(puzzleId);
  }

  /** Un-pin a retained area; it prunes on the next adjacency rescan. */
  releaseArea(puzzleId) {
    this._retained.delete(puzzleId);
  }

  /**
   * Build the see-through panels for a deployed cleanser gate: one
   * PortalView per cardinal face — the same box of windows an open linked
   * door gets — each showing the ACTIVE cleanser's cell and the room
   * beyond it, with the cleanser cell as the partner "gate" (a positional
   * stub; there is no partner mesh to hide). Each face maps to the
   * OPPOSITE exit face, so walking in from any side continues seamlessly
   * at the cleanser.
   * @param {Entity} pad - the CleanserGatePad (its mesh anchor hosts the
   *   surfaces, at gate-box-center height like a real gate mesh)
   * @param {{puzzleId: string, position: {x,y,z}}} target - active cleanser
   * @returns {PortalView[]} empty while the destination area isn't loaded
   *   yet (retainArea's fetch may still be in flight)
   */
  createCleanserGateViews(pad, target) {
    const destArea = this._areas.get(target.puzzleId);
    if (!destArea || !pad.mesh) return [];
    // A destination in the ACTIVE area lives in the main scene (its own
    // Area.scene is empty) — same rule as same-puzzle doors.
    const sceneOverride = destArea === this._activeArea ? this._mainScene : null;
    const partnerStub = { position: target.position, mesh: null, gateId: 'active-cleanser' };
    return Object.keys(FACING_VECTORS).map((sourceFacing) => {
      const view = new PortalView(pad, partnerStub, destArea, {
        sceneOverride,
        sourceFacing,
        partnerFacing: OPPOSITE_FACING[sourceFacing] || 'south',
      });
      view.setVisible(true);
      return view;
    });
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
    this._rebuildTileMirrors();
  }

  /**
   * A cleanser under ONE face of a door is the same tile under BOTH faces —
   * a linked pair is one cell seen from two sides. But the portal panel sits
   * on the far plane of the cell and can only paint what falls within the
   * doorway aperture; a floor tile in the doorway cell itself projects
   * mostly OUTSIDE the panel from an approaching eye, clipping it to a
   * sliver at the threshold. So each door face whose PARTNER cell holds a
   * cleanser gets a visual-only mirror mesh at its own cell: a clone
   * sharing the real tile's geometry AND material instance, so the
   * breathing pulse and clear-flash stay in sync for free (the neighbor is
   * fully live). Gameplay needs no mirror — stepping into the cell commits
   * the crossing, and the REAL tile fires on arrival.
   */
  _rebuildTileMirrors() {
    for (const { mesh, group } of this._tileMirrors) group.remove(mesh);
    this._tileMirrors = [];
    for (const door of this._doors) {
      this._mirrorDoorTile(door.areaA, door.gateA, door.areaB, door.gateB);
      this._mirrorDoorTile(door.areaB, door.gateB, door.areaA, door.gateA);
    }
  }

  /**
   * If `fromGate`'s cell holds a cleanser and `toGate`'s own cell does not,
   * clone the tile's mesh under `toGate` in `toArea`.
   */
  _mirrorDoorTile(fromArea, fromGate, toArea, toGate) {
    const tile = cleanserAtGate(fromArea, fromGate);
    if (!tile || !tile.mesh || cleanserAtGate(toArea, toGate)) return;
    const mirror = tile.mesh.clone(); // shares geometry + material: glow stays in sync
    const lift = tile.mesh.position.y - tile.position.y;
    mirror.position.set(toGate.position.x, toGate.position.y + lift, toGate.position.z);
    mirror._isCleanserMirror = true; // tag for tests/debugging
    toArea.group.add(mirror);
    this._tileMirrors.push({ mesh: mirror, group: toArea.group });
  }

  _disposeViews() {
    for (const faces of this._views.values()) {
      if (!faces) continue; // eslint-disable-line no-continue -- null = dangling marker
      for (const view of faces.values()) view.dispose();
    }
    this._views.clear();
    this._openFacingsByGate.clear();
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
   * Travel to a cleanser tile (the deployable cleanser gate's arrival —
   * see core/DeployManager): place the player ON the tile at
   * `target.position` in `target.puzzleId`, loading and swapping to that
   * area if it isn't the active one. Landing on the tile fires it as usual
   * (tape wipe + it stays the active cleanser). The ONE world clock keeps
   * running — this is a crossing without a door, not a rebuild.
   * @param {{puzzleId: string, position: {x,y,z}}} target
   * @returns {Promise<boolean>} false if the target area can't be loaded
   */
  async teleportToCleanser(target) {
    if (!target || !target.puzzleId || this._transitioning) return false;

    const arrive = (area) => {
      gameState.player.position = {
        x: target.position.x,
        y: target.position.y + 1.8,
        z: target.position.z,
      };
      gameState.player.elevation = Math.round(target.position.y / ELEVATION_HEIGHT);
      syncCameraToPlayer(gameState.player.position);
      return area;
    };

    if (this._activeArea && this._activeArea.id === target.puzzleId) {
      arrive(this._activeArea);
      return true;
    }

    this._transitioning = true;
    let area = this._areas.get(target.puzzleId);
    if (!area) {
      try {
        const data = await PuzzleLoader.load(target.puzzleId);
        area = PuzzleLoader.buildArea(data);
        this._areas.set(area.id, area);
      } catch {
        // Unloadable destination: stay put rather than crash the game
        this._transitioning = false;
        return false;
      }
    }

    this._setActiveArea(area);
    arrive(area);
    this._insideDoor = null; // not standing in any doorway after a jump
    this._afterActiveChange(); // rebuilds neighbors/doors; clears _transitioning
    // Same refresh path as a doorway crossing (hints re-arm, UI updates);
    // no arrival gate — a cleanser jump can never be an ending
    if (this._onCrossed) this._onCrossed(area.puzzle, null);
    return true;
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
