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
import {
  FACING_VECTORS,
  DOORWAY_OFFSET,
  PANEL_EPSILON,
  doorwayCorners,
  portalMapping,
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

const scratchSize = new THREE.Vector2();

class PortalView {
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
    this._targets = [new THREE.WebGLRenderTarget(1, 1), new THREE.WebGLRenderTarget(1, 1)];
    this._writeIndex = 0;

    this._buildDoorwaySurface();
  }

  _buildDoorwaySurface() {
    const geometry = new THREE.PlaneGeometry(WORLD_SCALE, WORLD_SCALE);
    // Shows the READ buffer (the one not being written this frame). Plain
    // OPAQUE: two rounds of grazing-fade transparency each regressed —
    // semi-transparent walls on ordinary sightlines and sort-order flicker
    // (QA, 2026-07-16). A doorway wall is never translucent; near-plane
    // coherence is the render camera's job (MIN_RENDER_EYE_DISTANCE).
    const material = new THREE.MeshBasicMaterial({ map: this._targets[1].texture });
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
  }

  /** Show/hide the doorway surface (open/closed gate). */
  setVisible(visible) {
    this.surface.visible = visible;
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
   */
  wallsToHide(camera) {
    if (this._wallsFlushLateral.length === 0) return this._wallsStrictBehind;
    const eye = this._map({ x: camera.position.x, y: camera.position.y, z: camera.position.z });
    const latEye =
      (eye.x - this._mappedWindowCenter.x) * this._right.x +
      (eye.z - this._mappedWindowCenter.z) * this._right.z;
    const hidden = this._wallsStrictBehind.slice();
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
   * @param {THREE.Plane} [clipOverride] - the door's SHARED clip plane (the
   *   primary approach panel's). When given, every panel clips along the
   *   same doorway axis, so side windows show a consistent slice instead of
   *   a perpendicular full-height one that pops at a jamb. The panel's OWN
   *   plane is ALWAYS applied too: it cuts content between the mapped eye
   *   and the window along this panel's axis — junk the shared plane cannot
   *   reach (a side panel of a freestanding door once painted a whole
   *   perimeter wall standing beside its mapped eye into the doorway).
   * @param {THREE.Mesh[]} [extraWallsBehind] - the APPROACH panel's
   *   walls-behind row, hidden alongside this panel's own so the shared
   *   clip's overreach never leaks a wall sliver into any panel.
   */
  render(renderer, camera, clipOverride = null, extraWallsBehind = null) {
    const eye = camera.position;
    const { center } = this._corners;
    const eyeDistance = this._outward.x * (eye.x - center.x) + this._outward.z * (eye.z - center.z);
    // The eye must be on the outward side of this face
    if (eyeDistance < MIN_EYE_DISTANCE) return false;

    // Skip the pass while the doorway quad is outside the player's view:
    // the panel keeps last frame's texture, and passes run BEFORE the main
    // render, so it re-renders the same frame it comes back on screen —
    // never a stale visible frame. (Sole tradeoff: a panel watched only
    // through ANOTHER door's view while off the player's own frustum shows
    // frozen content — the mirror view hugs the player's sightlines, so
    // that is a sub-degree edge case.) Test cameras are bare {position}
    // objects: no pose, no cull.
    if (camera.quaternion && camera.fov && !sphereInView(camera, center, PANEL_CULL_RADIUS)) {
      return false;
    }

    // Half-resolution target: every visible face of an open door re-renders
    // the whole neighbor scene each frame, and full-res targets made open
    // doors cost several fullscreen renders per frame (GPU fan spin,
    // round-4 playtest). At half size the doorway panel — a fraction of the
    // screen — still oversamples in practice.
    renderer.getDrawingBufferSize(scratchSize);
    const targetW = Math.max(1, Math.floor(scratchSize.x / 2));
    const targetH = Math.max(1, Math.floor(scratchSize.y / 2));
    const writeTarget = this._targets[this._writeIndex];
    if (writeTarget.width !== targetW || writeTarget.height !== targetH) {
      writeTarget.setSize(targetW, targetH);
    }

    const mappedEye = this._map({ x: eye.x, y: eye.y, z: eye.z });
    // Never render from closer than MIN_RENDER_EYE_DISTANCE to the window
    // plane (see constant above): pull the render eye straight back along
    // the view axis. eyeDistance is the same in source and neighbor space —
    // the mapping is rigid.
    if (eyeDistance < MIN_RENDER_EYE_DISTANCE) {
      const pullBack = MIN_RENDER_EYE_DISTANCE - eyeDistance;
      mappedEye.x -= this._outwardMapped.x * pullBack;
      mappedEye.z -= this._outwardMapped.z * pullBack;
    }
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
    const frontOnlyNotation = [];
    if (partnerMesh) {
      for (const child of partnerMesh.children) {
        if (child._isNotationMesh && child.material && child.material.side === THREE.DoubleSide) {
          child.material.side = THREE.FrontSide;
          frontOnlyNotation.push(child);
        }
      }
    }
    const hiddenSurfaces = [];
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
    const hiddenWalls = [];
    const hideWall = (mesh) => {
      if (mesh.visible) {
        mesh.visible = false;
        hiddenWalls.push(mesh);
      }
    };
    for (const mesh of this.wallsToHide(camera)) hideWall(mesh);
    if (extraWallsBehind) for (const mesh of extraWallsBehind) hideWall(mesh);

    const previousPlanes = renderer.clippingPlanes;
    // Shared doorway-axis plane (seam consistency) AND this panel's own
    // plane (eye-side junk cut). For the approach panel they are the same
    // plane object; apply it once.
    renderer.clippingPlanes =
      clipOverride && clipOverride !== this._clipPlane
        ? [clipOverride, this._clipPlane]
        : [this._clipPlane];
    renderer.setRenderTarget(writeTarget);
    renderer.render(this._scene, this._camera);
    renderer.setRenderTarget(null);
    renderer.clippingPlanes = previousPlanes;

    for (const child of hiddenSurfaces) child.visible = true;
    for (const mesh of hiddenWalls) mesh.visible = true;
    for (const child of frontOnlyNotation) child.material.side = THREE.DoubleSide;
    if (partnerMesh) partnerMesh.material.visible = partnerMaterialWasVisible;

    // Swap: the freshly written buffer becomes what the surface shows; the
    // other becomes next frame's write target.
    this.surface.material.map = writeTarget.texture;
    this._writeIndex = 1 - this._writeIndex;
    return true; // a pass actually ran (callers track face freshness)
  }

  dispose() {
    // Remove from the gate mesh directly (where _buildDoorwaySurface put it)
    // rather than via surface.parent — parent tracking isn't guaranteed
    // outside real THREE (the test mock doesn't set it)
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
