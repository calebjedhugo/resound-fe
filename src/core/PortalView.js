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

    // frameCorners overwrites the projection every pass; only near/far apply.
    this._camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
    this._target = new THREE.WebGLRenderTarget(1, 1);

    this._buildDoorwaySurface();
  }

  _buildDoorwaySurface() {
    const geometry = new THREE.PlaneGeometry(WORLD_SCALE, WORLD_SCALE);
    const material = new THREE.MeshBasicMaterial({ map: this._target.texture });
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
   * Draw the neighbor view for this frame's eye position into the doorway
   * texture. Call only while the gate is open.
   * @param {THREE.WebGLRenderer} renderer - the game's renderer
   * @param {THREE.Camera} camera - the player camera (world position)
   */
  render(renderer, camera) {
    const eye = camera.position;
    const { center } = this._corners;
    const eyeDistance = this._outward.x * (eye.x - center.x) + this._outward.z * (eye.z - center.z);
    // The eye must be on the outward side of this face
    if (eyeDistance < MIN_EYE_DISTANCE) return;

    // Half-resolution target: every visible face of an open door re-renders
    // the whole neighbor scene each frame, and full-res targets made open
    // doors cost several fullscreen renders per frame (GPU fan spin,
    // round-4 playtest). At half size the doorway panel — a fraction of the
    // screen — still oversamples in practice.
    renderer.getDrawingBufferSize(scratchSize);
    const targetW = Math.max(1, Math.floor(scratchSize.x / 2));
    const targetH = Math.max(1, Math.floor(scratchSize.y / 2));
    if (this._target.width !== targetW || this._target.height !== targetH) {
      this._target.setSize(targetW, targetH);
    }

    const mappedEye = this._map({ x: eye.x, y: eye.y, z: eye.z });
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
    // doorway). EVERY portal surface of BOTH ends hides too: for a
    // same-puzzle door they live in the rendered scene, and painting one
    // view's (stale) texture into another is a hall-of-mirrors (sampling
    // our own target would even be a GL feedback loop).
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
    for (const mesh of [this.gate.mesh, partnerMesh]) {
      if (!mesh) continue; // eslint-disable-line no-continue
      for (const child of mesh.children) {
        if (child._isPortalSurface && child.visible) {
          child.visible = false;
          hiddenSurfaces.push(child);
        }
      }
    }

    const previousPlanes = renderer.clippingPlanes;
    renderer.clippingPlanes = [this._clipPlane];
    renderer.setRenderTarget(this._target);
    renderer.render(this._scene, this._camera);
    renderer.setRenderTarget(null);
    renderer.clippingPlanes = previousPlanes;

    for (const child of hiddenSurfaces) child.visible = true;
    for (const child of frontOnlyNotation) child.material.side = THREE.DoubleSide;
    if (partnerMesh) partnerMesh.material.visible = partnerMaterialWasVisible;
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
    this._target.dispose();
    // The neighbor scene belongs to its Area — not ours to dispose
  }
}

export default PortalView;
