/**
 * PortalView — see-through rendering for ONE linked gate.
 *
 * While its gate is open, the neighbor area's LIVE scene (Area.scene — the
 * same entities that are simulating: creatures mid-move, gates flashing) is
 * drawn each frame into a WebGLRenderTarget from a portal-transformed
 * camera, and that texture is shown on a doorway surface on the FAR plane
 * of the gate cell (the inside of the panel opposite the approach face),
 * facing back through the cell at the viewer. The camera uses an off-axis
 * projection fitted exactly to the doorway quad (CameraUtils.frameCorners),
 * so the image lines up with the player's eye no matter where they stand —
 * "it's a door, not a portal": looking through it simply shows the area
 * beyond, as it happens. Sitting on the far plane means an entering camera
 * commits the crossing long before it could touch the surface, so the
 * threshold has no dead frame.
 *
 * The doorway surface is hidden while the gate is closed, so a closed linked
 * gate is pixel-identical to a normal closed gate, and the extra render pass
 * only runs while the gate is open (see PortalManager.renderPortals).
 */
import * as THREE from 'three';
// three's exports map substitutes the subpath literally, so the .js is required
// eslint-disable-next-line import/extensions
import { frameCorners } from 'three/examples/jsm/utils/CameraUtils.js';
import { WORLD_SCALE } from 'core/constants';
import { createSceneTarget, showStoredTexels } from 'core/passContext';
import { scenePieces, updateSceneMatrices } from 'core/sceneMatrices';
import memoizeOnEntityList from 'core/entityListMemo';
import {
  FACING_VECTORS,
  DOORWAY_OFFSET,
  PANEL_EPSILON,
  doorwayCorners,
  panelFootprint,
  portalMapping,
  pyramidPlanes,
  sphereInView,
} from 'core/portalMath';

// Doorway surface rotation: PlaneGeometry's +Z normal turned to face outward.
const DOORWAY_ROTATION_Y = {
  north: Math.PI,
  south: 0,
  east: Math.PI / 2,
  west: -Math.PI / 2,
};

// Below this eye-to-doorway distance the quad is edge-on or behind the eye:
// the off-axis projection degenerates, and the surface is invisible anyway
// (back-face culled / viewed edge-on), so the pass is skipped.
const MIN_EYE_DISTANCE = 0.05;

// The portal camera never renders from closer than this to the window
// plane. An eye a hair past the plane hands frameCorners a razor-thin
// off-axis frustum whose render is an incoherent anamorphic smear — the
// floating dashed streak (2026-07-15) and gray towers at grazing angles.
// Clamping the RENDER eye back keeps the texture coherent; the panel on
// screen is a few-degree sliver at such angles, so the sub-half-unit
// parallax error is imperceptible. This replaces two rounds of opacity
// fades (by angle, then by plane distance): every fade has a mid-band, and
// a semi-transparent doorway wall always reads as broken (QA, 2026-07-16)
// — the panels stay fully opaque, always.
const MIN_RENDER_EYE_DISTANCE = 0.5;

// Bounding-sphere radius of the doorway quad (WORLD_SCALE square: half-
// diagonal ≈ 2.13) with margin. Panels outside the player's view frustum
// skip their pass — each open face otherwise re-renders the whole scene
// every frame even with the doorway at the player's back (measured ~7ms/
// frame of pure waste in poc-return, 2026-07-16).
const PANEL_CULL_RADIUS = 2.5;

// How far a creature's glow reaches from its center, in creature sizes: the
// halo at full flare (CreatureLook HALO_RADIUS + HALO_FLARE_GROWTH)
const CREATURE_GLOW_REACH = 3.2;

// A pass's target matches what its panel occupies on screen (_fitTarget):
// tiny and distant doors once rendered the full half-res target each — at
// The Star's NE corner 26 of 27 player passes drew 640x328 for a panel
// under 0.5% of the screen. Each axis rounds UP to a power of two (never
// coarser than the screen: no panel samples soft), at least MIN_TARGET_SIZE
// and at most HALF the drawing buffer — a door filling the screen keeps the
// half-res target it always had.
const MIN_TARGET_SIZE = 32;

// ...at SUPERSAMPLE times the texels the panel covers, for the eye that sees
// it. The half-res target drew a far door's room at up to ten times the
// pixels its panel shows, which shrinks it with no mipmaps: what lies in
// there kept its detail. Drawn 1:1, a staff beyond the door is mipmapped
// down, faint and soft behind the main view's own copy of it (The Star's
// entry from 7 cells: sharpness 16.2 -> 10.1). A model of both paths (the
// staff's mips sampled trilinearly into the target, the target bilinearly
// onto the panel) puts twice the texels at 97% of half-res's sharpness 3
// cells off and 83-95% 7 cells off, within that path's own swing with where
// its samples land (+-6% and +-40%); 1.5x drops to 93% 3 cells off. Near
// the cap the factor fades to 1: the cap holds.
const SUPERSAMPLE = 2;

// Resizing reallocates the target's GPU buffers, so a target grows at once
// but shrinks only after this many passes running have asked for a smaller
// one (a panel near a bucket edge, or sized for two eyes in turn, would
// otherwise reallocate every frame).
const SHRINK_AFTER_PASSES = 30;

// A pass's region (_hideUndrawable): its clip planes — its own, and the
// door's shared one when that is another — then its frustum's four sides
// (through the whole doorway) and near plane
const PASS_PLANES = 7;
const WHOLE_DOORWAY = Object.freeze({ u0: 0, u1: 1, v0: 0, v1: 1 });

/** Hide each of `meshes` still shown, recording it in `hidden`. */
function hideAll(meshes, hidden) {
  for (const mesh of meshes) {
    if (mesh.visible) {
      mesh.visible = false;
      hidden.push(mesh);
    }
  }
}

/** Write THREE.Plane `plane` as plane `index` of `out` (portalMath's layout). */
function writePlane(out, index, { normal, constant }) {
  out[index * 4] = normal.x;
  out[index * 4 + 1] = normal.y;
  out[index * 4 + 2] = normal.z;
  out[index * 4 + 3] = constant;
}

// A piece is left out of a pass only when it lies this far (world units)
// past one of the pass's planes: far beyond any rounding between these
// planes and three's own (a frustum from the projection matrix, clipping in
// float32 view space), so what three would still draw is never hidden
const CULL_MARGIN = 1e-3;

const scratchSize = new THREE.Vector2();
// showsCreature's four side normals, [x, y, z] each
const scratchSides = new Float64Array(12);

// An area's creatures (showsCreature reads where they are now)
const creaturesIn = memoizeOnEntityList((entities) =>
  entities.filter((e) => e.type === 'creature')
);

/**
 * The last question asked about an eye — where it is, the pose it looks
 * with, the screen — so the same question gets its answer back without the
 * math: an eye that hasn't moved or turned asks the same every frame.
 */
class EyeMemo {
  constructor() {
    this._asked = new Float64Array(11).fill(NaN);
    this.answer = undefined;
  }

  /**
   * Is this the question last asked? If not, it is from now on (the caller
   * then stores its answer).
   */
  asked(position, pose, width = 0, height = 0) {
    const a = this._asked;
    const q = pose.quaternion;
    if (
      a[0] === position.x &&
      a[1] === position.y &&
      a[2] === position.z &&
      a[3] === q.x &&
      a[4] === q.y &&
      a[5] === q.z &&
      a[6] === q.w &&
      a[7] === pose.fov &&
      a[8] === pose.aspect &&
      a[9] === width &&
      a[10] === height
    ) {
      return true;
    }
    a[0] = position.x;
    a[1] = position.y;
    a[2] = position.z;
    a[3] = q.x;
    a[4] = q.y;
    a[5] = q.z;
    a[6] = q.w;
    a[7] = pose.fov;
    a[8] = pose.aspect;
    a[9] = width;
    a[10] = height;
    return false;
  }
}

/** Target size along one axis for `texels` of panel, under `cap`. */
const bucket = (texels, cap) =>
  Math.min(cap, Math.max(MIN_TARGET_SIZE, 2 ** Math.ceil(Math.log2(Math.max(1, texels)))));

class PortalView {
  // Passes leave out the pieces of their scene they can't draw
  // (_hideUndrawable); off only to compare with passes that walk it all
  static cullPieces = true;

  /**
   * @param {Gate} gate - the linked source gate (in the player's area)
   * @param {Gate} partnerGate - the partner gate ENTITY in the live neighbor
   *   area (world coords)
   * @param {Area} neighborArea - the live neighbor area whose scene is shown
   * @param {object} [options]
   * @param {THREE.Scene} [options.sceneOverride] - render this scene instead
   *   of neighborArea.scene. Used for SAME-puzzle doors: the "neighbor" is
   *   the active area, whose content group lives in the main render scene
   *   (Area.scene is empty while active).
   * @param {string} [options.sourceFacing] - the gate face to render the
   *   doorway on. Doors are omnidirectional: PortalManager passes the side
   *   the player is on; defaults to the gate's authored facing.
   * @param {string} [options.partnerFacing] - the partner face the view
   *   looks out of (opposite the source face — the pair maps by
   *   translation); defaults to the partner's authored facing.
   */
  constructor(gate, partnerGate, neighborArea, options = {}) {
    const {
      sceneOverride = null,
      sourceFacing = gate.facing,
      partnerFacing = partnerGate.facing,
    } = options;
    this.gate = gate;
    // The face this view SERVES (the approach direction), and which side of
    // the gate the eye must be on to see it
    this.facing = sourceFacing;

    const mapping = portalMapping(gate.position, sourceFacing, partnerGate.position, partnerFacing);
    this._map = mapping.map;
    this._outward = FACING_VECTORS[sourceFacing] || FACING_VECTORS.north;
    // The view direction in NEIGHBOR space (out of the partner's exit face);
    // render() pulls the portal camera back along it near the window plane
    this._outwardMapped = mapping.outward;

    // The view surface sits on the FAR plane of the cell — just inside the
    // OPPOSITE panel, facing back through the cell toward its viewers. The
    // commit point (just inside the near edge) is therefore reached ~2.7
    // units before the camera could ever touch the surface: there is no
    // frame where the eye has pierced the view but not yet crossed. (A quad
    // on the NEAR face put the camera through it ~0.3 units before the
    // commit — a visible dead frame at the threshold.)
    this._corners = doorwayCorners(gate.position, sourceFacing);
    const shift = 2 * DOORWAY_OFFSET - PANEL_EPSILON;
    for (const key of ['center', 'bottomLeft', 'bottomRight', 'topLeft']) {
      this._corners[key] = {
        x: this._corners[key].x - shift * this._outward.x,
        y: this._corners[key].y,
        z: this._corners[key].z - shift * this._outward.z,
      };
    }

    // Gates never move, so the doorway quad's neighbor-space corners are fixed
    const bl = this._map(this._corners.bottomLeft);
    const br = this._map(this._corners.bottomRight);
    const tl = this._map(this._corners.topLeft);
    this._mappedBottomLeft = new THREE.Vector3(bl.x, bl.y, bl.z);
    this._mappedBottomRight = new THREE.Vector3(br.x, br.y, br.z);
    this._mappedTopLeft = new THREE.Vector3(tl.x, tl.y, tl.z);
    this._mappedCorners = {
      bottomLeft: this._mappedBottomLeft,
      bottomRight: this._mappedBottomRight,
      topLeft: this._mappedTopLeft,
    };
    // The mapped doorway's rim, in order, and its middle (showsCreature)
    this._mappedRim = [
      this._mappedBottomLeft,
      this._mappedBottomRight,
      { x: br.x + tl.x - bl.x, y: br.y + tl.y - bl.y, z: br.z + tl.z - bl.z },
      this._mappedTopLeft,
    ];
    this._mappedMid = { x: (br.x + tl.x) / 2, y: (br.y + tl.y) / 2, z: (br.z + tl.z) / 2 };

    // Clip ONE CELL behind the window plane, so the partner's OWN doorway
    // cell paints into the view: its floor, the walls framing it, and its
    // notation. Clipping exactly at the window left the whole arrival cell
    // unpainted — a black wedge on the floor at every threshold and bare
    // walls at grazing angles (the round-4 "giveaway glitch"), and the
    // arrival staff popped in only on entry. Content deeper on the eye side
    // still clips: the room flanking the viewer's own door must not paint
    // into the panel (double world; a clip through the middle of the room
    // once sliced a creature standing near the door in half).
    // (The clip must reach a full cell + a hair PAST the arrival floor's far
    // edge to paint it seamlessly; that necessarily also reaches the near
    // face of the perimeter wall sitting flush one cell behind — which is
    // hidden per-pass instead, see _wallBehind below. Trimming the clip short
    // of that wall would leave a matching gap in the floor/frame at the far
    // corner.)
    const mappedCenter = this._map(this._corners.center);
    const clipPoint = new THREE.Vector3(
      mappedCenter.x - mapping.outward.x * (WORLD_SCALE + 0.1),
      mappedCenter.y,
      mappedCenter.z - mapping.outward.z * (WORLD_SCALE + 0.1)
    );
    this._clipPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      new THREE.Vector3(mapping.outward.x, mapping.outward.y, mapping.outward.z),
      clipPoint
    );

    // The neighbor's LIVE scene. The partner gate is this same door seen
    // from the other side — its box would fill the whole view, so its mesh
    // is hidden just for this view's render pass.
    this.neighborArea = neighborArea;
    this._scene = sceneOverride || neighborArea.scene;
    this._partnerGate = partnerGate;

    // Walls on the EYE side of the window plane: in a portal pass, the
    // legitimate view is the world BEYOND the window — plus the arrival
    // cell's own interior. The clip deliberately overreaches one cell to
    // the eye side so that interior — its floor, ITS JAMB WALLS, its staff
    // — paints (clipping exactly at the window left a black wedge and bare
    // walls at grazing angles). Walking through must read as a plain
    // doorway in a wall (designer's ruling, 2026-07-14), so the flush
    // lateral walls flanking the arrival cell — the jambs whose inner
    // faces line the doorway — must stay. But the same slab turns
    // poisonous when the mapped eye stands laterally BEYOND such a wall:
    // it then shows its OUTSIDE face, painting a whole false wall into the
    // doorway (a freestanding teleport pair viewed from a corner — the
    // mapped eye can sit right next to, or inside, the wall). And a wall a
    // full cell or more behind the window shows only its near face — the
    // thin dark strip beside the opening ("the rectangle that shouldn't be
    // there", ruled 2026-07-12).
    // So two sets, resolved per frame in wallsToHide():
    //  - strictBehind: a full cell or more behind the window — always
    //    hidden (never anything but the strip).
    //  - flushLateral: flush with the window, off to the side — hidden
    //    only when the eye is laterally beyond them (outer face showing);
    //    kept otherwise (they are the doorway's jambs).
    // Hidden per pass, restored after; each reappears normally once you
    // cross. Walls straddling the window keep beyond-window faces and are
    // never hidden. Trimming the clip instead would gap the floor at the
    // far corner, since the floor's far edge and a flush wall's near face
    // coincide.
    //
    // Each panel's sets follow its OWN outward (mapping.outward); the
    // APPROACH panel's picks are ALSO hidden during every panel's pass
    // (passed into render alongside the shared clip) so the shared plane's
    // overreach never leaks either.
    this._wallsStrictBehind = [];
    this._wallsFlushLateral = []; // { mesh, lat }
    this._wallsHidden = []; // wallsToHide's answer, recycled per call
    this._wallsHiddenLat = NaN; // ...for an eye this far to the side
    const { outward } = mapping;
    // Window basis in NEIGHBOR space, for per-frame lateral tests
    this._mappedWindowCenter = { x: mappedCenter.x, z: mappedCenter.z };
    this._right = { x: outward.z, z: -outward.x };
    const neighborEntities = (neighborArea && neighborArea.entities) || [];
    for (const entity of neighborEntities) {
      if (entity.type !== 'wall' || !entity.mesh) continue; // eslint-disable-line no-continue
      // Signed distance of the wall CENTER past the window plane along the
      // view direction (walls are cell-sized; the epsilon absorbs the panel
      // inset).
      const proj =
        (entity.position.x - mappedCenter.x) * outward.x +
        (entity.position.z - mappedCenter.z) * outward.z;
      if (proj >= -WORLD_SCALE / 2 + PANEL_EPSILON * 2) continue; // eslint-disable-line no-continue
      if (proj < -WORLD_SCALE / 2 - PANEL_EPSILON * 2) {
        this._wallsStrictBehind.push(entity.mesh);
      } else {
        const lat =
          (entity.position.x - mappedCenter.x) * this._right.x +
          (entity.position.z - mappedCenter.z) * this._right.z;
        this._wallsFlushLateral.push({ mesh: entity.mesh, lat });
      }
    }

    // frameCorners overwrites the projection every pass; only near/far apply.
    this._camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
    // DOUBLE-buffered target: each pass WRITES one buffer while every
    // visible surface (this one included) still SHOWS the other — last
    // frame's completed view. That makes doors seen through doors render
    // their own views (recursive doorways, ruled 2026-07-14), one frame
    // staler per level, without ever sampling the texture being written
    // (a GL feedback loop). The buffers swap at the end of the pass.
    // Scene targets render in the canvas's colour space (core/passContext):
    // a pass compiles the main view's programs and stores what the main
    // view would show.
    this._targets = [createSceneTarget(1, 1), createSceneTarget(1, 1)];
    this._writeIndex = 0;
    // The size passes write at (_fitTarget), and how many passes running
    // have asked for a smaller one
    this._width = 0;
    this._height = 0;
    this._shrinkVotes = 0;
    // A surface shows only once a pass has written its buffer: an unwritten
    // target samples BLACK, in the main view and in every other portal's
    // pass alike. setVisible records the wish; the first write grants it.
    this._written = false;
    this._shown = false;
    // The two clip planes a pass binds (render), recycled pass to pass
    this._passPlanes = [this._clipPlane, this._clipPlane];
    // A pass's region, and the pieces of its scene it hid (_hideUndrawable)
    this._cullPlanes = new Float64Array(PASS_PLANES * 4);
    this._hiddenPieces = [];
    // What a pass hid or turned for its scene, put back after it (render)
    this._turnedNotation = [];
    this._hiddenSurfaces = [];
    this._hiddenWalls = [];
    // The last eyes inView and footprint answered for
    this._inViewMemo = new EyeMemo();
    this._footprintMemo = new EyeMemo();

    this._buildDoorwaySurface();
  }

  _buildDoorwaySurface() {
    const geometry = new THREE.PlaneGeometry(WORLD_SCALE, WORLD_SCALE);
    // Shows the READ buffer (the one not being written this frame). Plain
    // OPAQUE: two rounds of grazing-fade transparency each regressed —
    // semi-transparent walls on ordinary sightlines and sort-order flicker
    // (QA, 2026-07-16). A doorway wall is never translucent; near-plane
    // coherence is the render camera's job (MIN_RENDER_EYE_DISTANCE).
    // The buffer already holds canvas-space colour: shown as stored, never
    // encoded a second time (core/passContext).
    const material = showStoredTexels(
      new THREE.MeshBasicMaterial({ map: this._targets[1].texture })
    );
    this.surface = new THREE.Mesh(geometry, material);
    // Local to the gate mesh, which sits at the box CENTER: just inside the
    // OPPOSITE panel, facing back at the viewer
    const inset = DOORWAY_OFFSET - PANEL_EPSILON;
    this.surface.position.set(-this._outward.x * inset, 0, -this._outward.z * inset);
    this.surface.rotation.y = DOORWAY_ROTATION_Y[this.facing] ?? Math.PI;
    this.surface.visible = false;
    // Tag for tests/debugging (mirrors NotationDisplay's _isNotationMesh)
    this.surface._isPortalSurface = true;
    this.gate.mesh.add(this.surface);
    // A view can be born mid-frame (a door opening), after its scene's
    // matrices were updated for the frame (core/sceneMatrices): place it now
    this.surface.updateMatrixWorld();
  }

  /**
   * Show/hide the doorway surface (open/closed gate). A panel nothing has
   * written yet stays hidden until its first pass (see constructor).
   * Outside a pass the surface shows exactly when it is both wished and
   * written, so repeating the current wish (every open door asks every
   * frame) changes nothing.
   */
  setVisible(visible) {
    if (visible === this._shown) return;
    this._shown = visible;
    this.surface.visible = visible && this._written;
  }

  /** Has any pass written this panel yet (is it safe to sample)? */
  get written() {
    return this._written;
  }

  /**
   * Point the view at the scene that now holds the neighbor area's content:
   * the main render scene while that area is ACTIVE (a same-area door; its
   * own Area.scene is empty then), its Area.scene otherwise. A crossing moves
   * areas between the two, never rebuilds them, so the view survives it.
   */
  setScene(scene) {
    this._scene = scene;
  }

  /**
   * Can this panel show for `camera` this frame — the eye on its outward
   * side, the doorway quad inside the view frustum? The same tests render()
   * skips a pass on; bare {position} eyes have no pose, so no cull.
   */
  inView(camera) {
    const posed = Boolean(camera.quaternion && camera.fov);
    if (posed && this._inViewMemo.asked(camera.position, camera)) return this._inViewMemo.answer;
    const eye = camera.position;
    const { center } = this._corners;
    const eyeDistance = this._outward.x * (eye.x - center.x) + this._outward.z * (eye.z - center.z);
    const seen =
      !(eyeDistance < MIN_EYE_DISTANCE) &&
      !(posed && !sphereInView(camera, center, PANEL_CULL_RADIUS));
    if (posed) this._inViewMemo.answer = seen;
    return seen;
  }

  /**
   * Where this panel lands on `eye`'s screen (portalMath.panelFootprint):
   * the texels its target needs, and its share of the screen. An eye with
   * no pose of its own may borrow one (`eye.pose`): a mirror sweep's mapped
   * eye looks the way the player does. null without any pose — a pass for
   * such an eye writes the full half-res target.
   * @param {{position, quaternion?, fov?, aspect?, pose?}} eye
   * @param {THREE.WebGLRenderer} renderer - for the drawing-buffer size
   * @returns {?object} shared with the next ask for the same eye: read it,
   *   never change it
   */
  footprint(eye, renderer) {
    const posed = (camera) => Boolean(camera && camera.quaternion && camera.fov);
    const pose = posed(eye) ? eye : eye.pose;
    if (!posed(pose)) return null;
    renderer.getDrawingBufferSize(scratchSize);
    const memo = this._footprintMemo;
    if (!memo.asked(eye.position, pose, scratchSize.x, scratchSize.y)) {
      memo.answer = panelFootprint(eye.position, pose, this._corners, scratchSize.x, scratchSize.y);
    }
    return memo.answer;
  }

  /**
   * Is the picture this panel shows still as sharp as a pass would draw it
   * at `footprint` (the target it was last drawn into holds SUPERSAMPLE
   * texels per pixel, short of the cap)?
   */
  covers(footprint, renderer) {
    renderer.getDrawingBufferSize(scratchSize);
    return (
      Math.min(Math.floor(scratchSize.x / 2), footprint.texelsAcross * SUPERSAMPLE) <=
        this._width &&
      Math.min(Math.floor(scratchSize.y / 2), footprint.texelsUp * SUPERSAMPLE) <= this._height
    );
  }

  /**
   * Could a creature of the area beyond show through this panel for an eye
   * at `eye` — any part of its glow inside the pyramid from the mapped eye
   * through the doorway? Conservative: a creature on the eye's side of the
   * window, which the doorway clip mostly cuts away, counts too.
   * @param {{x, y, z}} eye - world position, this panel's side
   */
  showsCreature(eye) {
    const creatures = this.neighborArea ? creaturesIn(this.neighborArea.entities) : [];
    if (creatures.length === 0) return false;
    const e = this._map(eye);
    const rim = this._mappedRim;
    const mid = this._mappedMid;
    // Inward unit normals of the pyramid's four sides (through the eye)
    const sides = scratchSides;
    for (let i = 0; i < rim.length; i += 1) {
      const a = rim[i];
      const b = rim[(i + 1) % rim.length];
      const ux = a.x - e.x;
      const uy = a.y - e.y;
      const uz = a.z - e.z;
      const vx = b.x - e.x;
      const vy = b.y - e.y;
      const vz = b.z - e.z;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const toMid = nx * (mid.x - e.x) + ny * (mid.y - e.y) + nz * (mid.z - e.z);
      const scale = (toMid < 0 ? -1 : 1) / (Math.hypot(nx, ny, nz) || 1);
      sides[3 * i] = nx * scale;
      sides[3 * i + 1] = ny * scale;
      sides[3 * i + 2] = nz * scale;
    }
    for (const entity of creatures) {
      if (!entity.mesh) continue; // eslint-disable-line no-continue
      const p = entity.mesh.position;
      const reach = CREATURE_GLOW_REACH * (entity.size || 1);
      let inside = true;
      for (let i = 0; i < rim.length && inside; i += 1) {
        inside =
          sides[3 * i] * (p.x - e.x) +
            sides[3 * i + 1] * (p.y - e.y) +
            sides[3 * i + 2] * (p.z - e.z) >
          -reach;
      }
      if (inside) return true;
    }
    return false;
  }

  /**
   * Where a pass for an eye at `eye` renders FROM: the mapped eye, held at
   * least MIN_RENDER_EYE_DISTANCE back from the window plane (see that
   * constant) — pulled straight back along the view axis. The eye's
   * distance to the window is the same in source and neighbor space (the
   * mapping is rigid).
   * @param {{x, y, z}} eye - world position, this panel's side
   * @returns {{x, y, z}} neighbor-space position
   */
  renderEye(eye) {
    const mapped = this._map(eye);
    const { center } = this._corners;
    const eyeDistance = this._outward.x * (eye.x - center.x) + this._outward.z * (eye.z - center.z);
    if (eyeDistance < MIN_RENDER_EYE_DISTANCE) {
      const pullBack = MIN_RENDER_EYE_DISTANCE - eyeDistance;
      mapped.x -= this._outwardMapped.x * pullBack;
      mapped.z -= this._outwardMapped.z * pullBack;
    }
    return mapped;
  }

  /** Where the picture this panel shows was drawn from (neighbor space). */
  get drawnFrom() {
    return this._camera.position;
  }

  /** The doorway surface's quad, world space (on the cell's far plane). */
  get corners() {
    return this._corners;
  }

  /** Is the surface's front toward `point` (world space), so it can show? */
  facesToward(point) {
    const { center } = this._corners;
    return this._outward.x * (point.x - center.x) + this._outward.z * (point.z - center.z) > 0;
  }

  /**
   * What this panel's picture can show through the part `rect` of its
   * doorway (quad coordinates, as portalMath.clipQuad gives them), for a
   * picture drawn from `apex`: the pyramid from the apex through that part
   * of the mapped doorway, past the pass camera's near plane and this
   * panel's own doorway clip. Neighbor space; planes `index`..`index + 5`
   * of `out` (portalMath's plane layout).
   * @returns {number} the index after the last plane written
   */
  sightPlanes(apex, rect, out, index = 0) {
    const next = this._nearPlane(
      apex,
      out,
      pyramidPlanes(apex, this._mappedCorners, rect, out, index)
    );
    writePlane(out, next, this._clipPlane);
    return next + 1;
  }

  /**
   * The near plane of a pass drawn from `apex`: it looks along the mapped
   * outward, square to the doorway (frameCorners). Plane `index` of `out`.
   * @returns {number} the index after it
   */
  _nearPlane(apex, out, index) {
    const o = this._outwardMapped;
    out[index * 4] = o.x;
    out[index * 4 + 1] = o.y;
    out[index * 4 + 2] = o.z;
    out[index * 4 + 3] = -(o.x * apex.x + o.y * apex.y + o.z * apex.z) - this._camera.near;
    return index + 1;
  }

  /**
   * This panel's own doorway clip plane (neighbor-world space). PortalManager
   * shares the PRIMARY approach panel's plane across every panel of a door so
   * the side windows clip along the SAME axis as the approach — otherwise a
   * side panel clips perpendicular to the doorway and shows a mismatched
   * full-height slice, which pops as the eye crosses a jamb.
   */
  get clipPlane() {
    return this._clipPlane;
  }

  /**
   * The eye-side walls to hide for a pass rendered for this eye position
   * (see constructor): the strictly-behind walls always, plus any flush
   * lateral wall the eye is laterally BEYOND (its outer face would paint a
   * false wall); jambs the eye is inside of stay — the doorway keeps its
   * frame. PortalManager passes the APPROACH panel's picks into every
   * panel's render so the shared clip's overreach never leaks a wall face.
   * @param {THREE.Camera} camera - the player camera (world position)
   * @returns {THREE.Mesh[]} recycled by this view's next call for an eye
   *   standing elsewhere to the side (one for the same offset returns it
   *   as it is)
   */
  wallsToHide(camera) {
    if (this._wallsFlushLateral.length === 0) return this._wallsStrictBehind;
    const eye = this._map(camera.position);
    const latEye =
      (eye.x - this._mappedWindowCenter.x) * this._right.x +
      (eye.z - this._mappedWindowCenter.z) * this._right.z;
    // The answer is the eye's lateral offset's alone
    if (latEye === this._wallsHiddenLat) return this._wallsHidden;
    this._wallsHiddenLat = latEye;
    const hidden = this._wallsHidden;
    hidden.length = 0;
    for (const mesh of this._wallsStrictBehind) hidden.push(mesh);
    for (const { mesh, lat } of this._wallsFlushLateral) {
      // Laterally beyond the wall, on its side: the eye faces its OUTSIDE
      if (
        Math.sign(latEye) === Math.sign(lat) &&
        Math.abs(latEye) > Math.abs(lat) - WORLD_SCALE / 2
      ) {
        hidden.push(mesh);
      }
    }
    return hidden;
  }

  /**
   * Draw the neighbor view for this frame's eye position into the doorway
   * texture. Call only while the gate is open.
   * @param {THREE.WebGLRenderer} renderer - the game's renderer
   * @param {THREE.Camera} camera - the player camera (world position)
   * @param {object} [options]
   * @param {THREE.Plane} [options.clipOverride] - the door's SHARED clip
   *   plane (the primary approach panel's). When given, every panel clips
   *   along the same doorway axis, so side windows show a consistent slice
   *   instead of a perpendicular full-height one that pops at a jamb. The
   *   panel's OWN plane is ALWAYS applied too: it cuts content between the
   *   mapped eye and the window along this panel's axis — junk the shared
   *   plane cannot reach (a side panel of a freestanding door once painted
   *   a whole perimeter wall standing beside its mapped eye into the
   *   doorway).
   * @param {THREE.Mesh[]} [options.extraWallsBehind] - the APPROACH panel's
   *   walls-behind row, hidden alongside this panel's own so the shared
   *   clip's overreach never leaks a wall sliver into any panel.
   * @param {?object} [options.footprint] - this panel's footprint on the
   *   screen the pass is for, when the caller already has it (footprint());
   *   worked out from `camera` otherwise
   * @param {boolean} [options.supersample=true] - false for an eye that
   *   only stands in for whoever will see the picture (a straight-on
   *   warm-up): its target fits the panel as that eye sees it, 1:1 (see
   *   SUPERSAMPLE)
   */
  render(renderer, camera, options = {}) {
    const { clipOverride = null, extraWallsBehind = null } = options;
    // The eye must be on the outward side of this face, and the doorway quad
    // inside the player's view: an off-screen panel keeps last frame's
    // texture, and passes run BEFORE the main render, so it re-renders the
    // same frame it comes back on screen — never a stale visible frame.
    // (Sole tradeoff: a panel watched only through ANOTHER door's view while
    // off the player's own frustum shows frozen content — the mirror view
    // hugs the player's sightlines, so that is a sub-degree edge case.) Test
    // cameras are bare {position} objects: no pose, no cull.
    if (!this.inView(camera)) return false;
    const eye = camera.position;

    const writeTarget = this._fitTarget(
      renderer,
      options.footprint === undefined ? this.footprint(camera, renderer) : options.footprint,
      options.supersample === false ? 1 : SUPERSAMPLE
    );

    const mappedEye = this.renderEye(eye);
    this._camera.position.set(mappedEye.x, mappedEye.y, mappedEye.z);
    frameCorners(
      this._camera,
      this._mappedBottomLeft,
      this._mappedBottomRight,
      this._mappedTopLeft
    );

    // Hide the partner gate's BOX for just this pass (this same door seen
    // from the other side — it would fill the whole view) while its
    // NOTATION stays: the arrival staff is visible through the doorway
    // before the player ever steps in (designer's round-4 request), so
    // nothing pops in on entry. Only front-facing staff planes paint
    // (DoubleSide would show the far plane's mirrored back through the
    // doorway). The PARTNER's portal surfaces hide too: they sit right at
    // the mapped eye (this same door from the other side) and would smear
    // stale full-view textures across the pass. Every OTHER portal surface
    // — this gate's included — stays visible showing last frame's buffer:
    // a door seen through a door shows its own live view (recursive
    // doorways, ruled 2026-07-14; the double-buffered target makes that
    // safe — see constructor).
    const partnerMesh = this._partnerGate.mesh;
    const partnerMaterialWasVisible = partnerMesh ? partnerMesh.material.visible : true;
    if (partnerMesh) partnerMesh.material.visible = false;
    const frontOnlyNotation = this._turnedNotation;
    frontOnlyNotation.length = 0;
    if (partnerMesh) {
      for (const child of partnerMesh.children) {
        if (child._isNotationMesh && child.material && child.material.side === THREE.DoubleSide) {
          child.material.side = THREE.FrontSide;
          frontOnlyNotation.push(child);
        }
      }
    }
    const hiddenSurfaces = this._hiddenSurfaces;
    hiddenSurfaces.length = 0;
    if (partnerMesh && partnerMesh !== this.gate.mesh) {
      for (const child of partnerMesh.children) {
        if (child._isPortalSurface && child.visible) {
          child.visible = false;
          hiddenSurfaces.push(child);
        }
      }
    }
    // This gate's OWN surfaces normally aren't in the rendered scene (the
    // neighbor is another area) — but a SAME-AREA door renders the main
    // scene, where they are. For an ADJACENT pair (partner one cell along
    // the axis) the one-cell translation maps this very panel into the clip
    // plane's one-cell overreach, square between the mapped eye and the
    // window: the pass paints the panel's own one-frame-stale texture
    // across the whole doorway, which feeds back to solid black. Hide an
    // own surface only when it actually sits in that junk zone — inside
    // the overreach slab behind the window AND laterally overlapping the
    // doorway column (deeper eye-side content is clipped by _clipPlane;
    // lateral content is outside the window's frustum). Own surfaces
    // BEYOND the window always stay: a distant same-area pair really does
    // see its own door through the doorway (recursive doorways, ruled
    // 2026-07-14). Gate meshes are unrotated, so local offsets add.
    for (const child of this.gate.mesh.children) {
      if (!child._isPortalSurface || !child.visible) continue; // eslint-disable-line no-continue
      const dx = this.gate.mesh.position.x + child.position.x - this._mappedWindowCenter.x;
      const dz = this.gate.mesh.position.z + child.position.z - this._mappedWindowCenter.z;
      const proj = dx * this._outwardMapped.x + dz * this._outwardMapped.z;
      const lat = dx * this._right.x + dz * this._right.z;
      if (
        proj < PANEL_EPSILON &&
        proj > -(WORLD_SCALE + 0.1 + PANEL_EPSILON) &&
        Math.abs(lat) < WORLD_SCALE
      ) {
        child.visible = false;
        hiddenSurfaces.push(child);
      }
    }
    // Hide the eye-side walls (this panel's own set + the approach
    // panel's — see constructor and wallsToHide) so their outside faces
    // don't paint into the doorway view.
    const hiddenWalls = this._hiddenWalls;
    hiddenWalls.length = 0;
    hideAll(this.wallsToHide(camera), hiddenWalls);
    if (extraWallsBehind) hideAll(extraWallsBehind, hiddenWalls);

    const previousPlanes = renderer.clippingPlanes;
    // Shared doorway-axis plane (seam consistency) AND this panel's own
    // plane (eye-side junk cut). For the approach panel — and for passes
    // with no shared plane (warm-ups, mirror sweep) — they are the same
    // plane, bound twice: clipping by one plane twice clips exactly as
    // once, and every pass binds passContext.CLIP_PLANE_COUNT planes like
    // every other scene draw (three keys a material's shader program by the
    // plane COUNT: a mismatch re-derives it at every pass switch).
    this._passPlanes[0] = clipOverride || this._clipPlane;
    renderer.clippingPlanes = this._passPlanes;
    renderer.setRenderTarget(writeTarget);
    updateSceneMatrices(this._scene); // once a frame, not once a pass
    const undrawable = this._hideUndrawable(mappedEye, this._passPlanes[0]);
    renderer.render(this._scene, this._camera);
    renderer.setRenderTarget(null);
    renderer.clippingPlanes = previousPlanes;

    for (const object of undrawable) object.visible = true;
    for (const child of hiddenSurfaces) child.visible = true;
    for (const mesh of hiddenWalls) mesh.visible = true;
    for (const child of frontOnlyNotation) child.material.side = THREE.DoubleSide;
    if (partnerMesh) partnerMesh.material.visible = partnerMaterialWasVisible;

    // Swap: the freshly written buffer becomes what the surface shows; the
    // other becomes next frame's write target.
    this.surface.material.map = writeTarget.texture;
    this._writeIndex = 1 - this._writeIndex;
    if (!this._written) {
      this._written = true;
      this.surface.visible = this._shown; // safe to sample from now on
    }
    return true; // a pass actually ran (callers track face freshness)
  }

  /**
   * Hide, for this pass, each piece of its scene (sceneMatrices.scenePieces)
   * the pass cannot draw: wholly outside its frustum (the pyramid from
   * `apex` through the doorway that frameCorners fits), where three would
   * cull every bit of it anyway, or wholly past one of its clip planes,
   * where every fragment would be discarded. Each pass used to walk and
   * frustum-test the whole scene (~270 objects in The Star, about a third of
   * a pass's CPU in Chrome) and drew what its clip planes then threw away;
   * without them three draws the same picture, the draws that remain in the
   * same order.
   * @param {{x, y, z}} apex - where the pass renders from
   * @param {THREE.Plane} sharedClip - the door's shared clip plane
   * @returns {THREE.Object3D[]} what it hid, for the caller to show again
   *   after the pass (recycled by the next one)
   */
  _hideUndrawable(apex, sharedClip) {
    const hidden = this._hiddenPieces;
    hidden.length = 0;
    if (!PortalView.cullPieces) return hidden;
    // Clip planes first: most pieces a pass can't draw lie past its own
    const planes = this._cullPlanes;
    writePlane(planes, 0, this._clipPlane);
    let clipCount = 1;
    if (sharedClip !== this._clipPlane) {
      writePlane(planes, 1, sharedClip);
      clipCount = 2;
    }
    const count = this._nearPlane(
      apex,
      planes,
      pyramidPlanes(apex, this._mappedCorners, WHOLE_DOORWAY, planes, clipCount)
    );
    const pieces = scenePieces(this._scene);
    if (!pieces) return hidden;
    const { culls, clips, spheres, objects, children } = pieces;
    for (let i = 0; i < pieces.count; i += 1) {
      // The planes that leave this piece out once it lies wholly past one
      const from = clips[i] ? 0 : clipCount;
      const to = culls[i] ? count : clipCount;
      const at = 4 * i;
      const x = spheres[at];
      const y = spheres[at + 1];
      const z = spheres[at + 2];
      const beyond = -(spheres[at + 3] + CULL_MARGIN);
      let k = from;
      while (
        k < to &&
        planes[4 * k] * x + planes[4 * k + 1] * y + planes[4 * k + 2] * z + planes[4 * k + 3] >=
          beyond
      ) {
        k += 1;
      }
      if (k < to) {
        const object = objects[i];
        if (object.visible && object.children.length === children[i]) {
          object.visible = false;
          hidden.push(object);
        }
      }
    }
    return hidden;
  }

  /**
   * Size the target this pass writes to the panel's footprint (null: the
   * full half-res cap). Every visible face of an open door re-renders the
   * whole neighbor scene each frame, and full-res targets made open doors
   * cost several fullscreen renders per frame (GPU fan spin, round-4
   * playtest) — so half the drawing buffer is the ceiling; below it the
   * target follows what the panel occupies (see MIN_TARGET_SIZE), times
   * `supersample` (see SUPERSAMPLE).
   */
  _fitTarget(renderer, footprint, supersample) {
    renderer.getDrawingBufferSize(scratchSize);
    const capW = Math.max(1, Math.floor(scratchSize.x / 2));
    const capH = Math.max(1, Math.floor(scratchSize.y / 2));
    const wantW = footprint ? bucket(footprint.texelsAcross * supersample, capW) : capW;
    const wantH = footprint ? bucket(footprint.texelsUp * supersample, capH) : capH;
    let width = Math.min(this._width, capW);
    let height = Math.min(this._height, capH);
    if (wantW > width || wantH > height) {
      width = Math.max(width, wantW);
      height = Math.max(height, wantH);
      this._shrinkVotes = 0;
    } else if (wantW < width || wantH < height) {
      this._shrinkVotes += 1;
      if (this._shrinkVotes >= SHRINK_AFTER_PASSES) {
        width = wantW;
        height = wantH;
        this._shrinkVotes = 0;
      }
    } else {
      this._shrinkVotes = 0;
    }
    this._width = width;
    this._height = height;
    const target = this._targets[this._writeIndex];
    if (target.width !== width || target.height !== height) target.setSize(width, height);
    return target;
  }

  dispose() {
    // Remove from the gate mesh (where _buildDoorwaySurface put it)
    if (this.gate.mesh) {
      this.gate.mesh.remove(this.surface);
    }
    this.surface.geometry.dispose();
    this.surface.material.dispose();
    for (const target of this._targets) target.dispose();
    // The neighbor scene belongs to its Area — not ours to dispose
  }
}

export default PortalView;
