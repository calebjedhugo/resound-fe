import * as THREE from 'three';
import { NotationRenderer } from 'resound-notation/NotationRenderer';

// Grazing-angle fade for staff planes: below GRAZE_LO (cosine of the angle
// between the plane normal and the eye direction) the staff is invisible,
// above GRAZE_HI it is fully opaque, blending between. A staff plane floats
// 0.02 off its entity face; on an OPEN gate there is no box behind it, so a
// razor-grazing sightline used to catch the texture's dark rows as a thin
// dashed line floating over the floor (nitpick, 2026-07-14). At these
// angles the staff is unreadable anyway.
const GRAZE_LO = 0.05;
const GRAZE_HI = 0.15;
const scratchNormal = new THREE.Vector3();
const scratchPosition = new THREE.Vector3();
const scratchToCamera = new THREE.Vector3();

/**
 * Renders musical notation as in-world textures on entity surfaces.
 *
 * Pipeline: song data -> NotationRenderer (SVG) -> Canvas -> CanvasTexture -> PlaneGeometry meshes
 *
 * Meshes are returned synchronously with a placeholder transparent material.
 * The real texture is applied asynchronously once the SVG-to-Canvas conversion completes.
 *
 * Graceful degradation: if document.createElementNS is unavailable (node test env without jsdom),
 * the display is created but with no meshes.
 */
class NotationDisplay {
  /**
   * @param {Object} options
   * @param {Array|Object} options.song - Song data (flat notes[] or {voices})
   * @param {string} options.entityType - 'gate' or 'fountain'
   * @param {Array} [options.timeSignature] - e.g. [4, 4]; drives measure
   *   barlines. Defaults to 4/4. Pass null for unmetered (no barlines).
   * @param {string} [options.keySignature] - e.g. 'C'
   */
  constructor({ song, entityType, timeSignature = [4, 4], keySignature = null }) {
    this.song = song;
    this.entityType = entityType;
    this.timeSignature = timeSignature;
    this.keySignature = keySignature;
    this.meshes = [];

    this._createMeshes();
    this._renderTexture();
  }

  /**
   * Wrap the raw game song into the renderer's voices form, carrying a time
   * signature so the renderer slices into measures and draws barlines (a bare
   * note array has no meter, so multi-measure phrases showed no barline). A
   * song already in {voices} form just gets meter/key injected.
   */
  _renderInput() {
    const meta = { timeSignature: this.timeSignature, keySignature: this.keySignature };
    if (this.song && !Array.isArray(this.song) && Array.isArray(this.song.voices)) {
      return { ...meta, ...this.song };
    }
    // Flat array: single voice, clef inferred by the renderer from the notes.
    return { ...meta, voices: [{ id: 'v0', notes: this.song }] };
  }

  /**
   * Create PlaneGeometry meshes positioned around the entity surface.
   */
  _createMeshes() {
    const layouts =
      this.entityType === 'gate' ? NotationDisplay.GATE_LAYOUT : NotationDisplay.FOUNTAIN_LAYOUT;

    for (const layout of layouts) {
      const { width, height } = layout;
      const geometry = new THREE.PlaneGeometry(width, height);
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        // Single-sided, facing OUTWARD: each plane's front normal points away
        // from the entity center, so the readable staff shows from outside but
        // the mirror-reversed back is culled when you stand inside an open gate
        // (DoubleSide used to leak the backwards notation).
        side: THREE.FrontSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(layout.x, layout.y, layout.z);

      // Rotate to face outward from the entity
      if (layout.rotationY !== undefined) {
        mesh.rotation.y = layout.rotationY;
      }

      // Tag for identification in tests and disposal
      mesh._isNotationMesh = true;

      // Base opacity: 0 while the texture is loading, 1 once applied. The
      // per-draw grazing fade below multiplies against this so it never
      // reveals a plane whose texture has not arrived.
      mesh._notationOpacity = 0;
      // Fade out toward edge-on, per draw and per CAMERA — portal passes
      // render these same meshes from their own mapped eyes and need the
      // same treatment (see the GRAZE_* constants above).
      mesh.onBeforeRender = (renderer, scene, camera) => {
        scratchNormal.set(0, 0, 1).transformDirection(mesh.matrixWorld);
        scratchPosition.setFromMatrixPosition(mesh.matrixWorld);
        scratchToCamera.copy(camera.position).sub(scratchPosition).normalize();
        const facing = scratchNormal.dot(scratchToCamera);
        const graze = Math.min(1, Math.max(0, (facing - GRAZE_LO) / (GRAZE_HI - GRAZE_LO)));
        material.opacity = mesh._notationOpacity * graze;
      };

      this.meshes.push(mesh);
    }
  }

  /**
   * Total beats of the song's first voice (rests included) — drives the
   * render width so long songs get room for MULTI-MEASURE systems. The
   * renderer's viewBox width equals the requested width, so width must
   * track content: too narrow stacks one cramped measure per system (the
   * Twinkle staff bug), too wide shrinks a short song's staff.
   */
  _songBeats() {
    const notes =
      this.song && !Array.isArray(this.song) && Array.isArray(this.song.voices)
        ? this.song.voices[0].notes || []
        : this.song || [];
    const BEATS = { '1/1': 4, '1/2': 2, '1/4': 1, '1/8': 0.5, '1/16': 0.25 };
    return notes.reduce((sum, entry) => {
      const note = Array.isArray(entry) ? entry[0] : entry;
      return sum + (BEATS[note && note.length] || 4);
    }, 0);
  }

  /**
   * Render the song to SVG, convert to canvas texture, and apply to meshes.
   * This is async but we don't block construction on it.
   */
  _renderTexture() {
    // Guard: skip if no DOM (node env without jsdom)
    if (typeof document === 'undefined' || !document.createElementNS) {
      return;
    }

    try {
      // Hand the song straight to the renderer — it sizes the SVG to its own
      // content (single staff vs grand staff, however many ledger lines), so
      // the game never has to inspect notation structure. We then mirror that
      // intrinsic aspect ratio onto the texture canvas so nothing is squashed.
      // Width scales with the song so a system holds AT LEAST two measures:
      // 400 up to two 4/4 measures; beyond that, ~500px per pair of measures
      // (two quarter-note 4/4 measures lay out naturally at just under
      // 1000px — measured against the published renderer), so the breaker
      // packs multi-measure systems instead of stacking one per line.
      const beatsPerMeasure =
        ((this.timeSignature || [4, 4])[0] * 4) / (this.timeSignature || [4, 4])[1];
      const measures = Math.max(1, Math.ceil(this._songBeats() / beatsPerMeasure));
      const width = measures <= 2 ? 400 : 500 * Math.ceil(measures / 2);
      const container = document.createElement('div');
      const renderer = new NotationRenderer({
        container,
        width,
      });

      const svg = renderer.render(this._renderInput());
      if (!svg) return;

      const [, , vbWidth, vbHeight] = (svg.getAttribute('viewBox') || '0 0 400 150')
        .split(/\s+/)
        .map(Number);
      const canvasWidth = vbWidth > 500 ? 1024 : 512;
      const canvasHeight = Math.max(64, Math.round(canvasWidth * (vbHeight / vbWidth)));

      // Serialize SVG to a data URL and draw on canvas
      const svgString = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');

        // Transparent background (entity color shows through)
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw SVG scaled to fit canvas
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        URL.revokeObjectURL(url);

        // Create texture and apply to all meshes
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        // Fit each plane to the staff's TRUE aspect (inside its layout box,
        // capped by the entity face) instead of stretching onto the fixed
        // quad — a tall multi-system staff was vertically squished.
        const aspect = canvasHeight / canvasWidth;
        for (const mesh of this.meshes) {
          const baseW = mesh.geometry.parameters ? mesh.geometry.parameters.width : 2.8;
          const baseH = mesh.geometry.parameters ? mesh.geometry.parameters.height : 1.5;
          let w = baseW;
          let h = baseW * aspect;
          const maxH = NotationDisplay.MAX_PLANE_HEIGHT;
          if (h > maxH) {
            h = maxH;
            w = maxH / aspect;
          }
          mesh.scale.set(w / baseW, h / baseH, 1);
          mesh.material.map = texture;
          mesh.material.opacity = 1;
          mesh._notationOpacity = 1; // the grazing fade multiplies against this
          mesh.material.needsUpdate = true;
        }

        // Clean up renderer
        renderer.clear();
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        renderer.clear();
      };

      img.src = url;
    } catch (e) {
      // Graceful degradation - notation just won't appear
    }
  }

  /**
   * Hide all notation meshes (e.g., when entity is activated).
   */
  hide() {
    for (const mesh of this.meshes) {
      mesh.visible = false;
    }
  }

  /**
   * Show all notation meshes.
   */
  show() {
    for (const mesh of this.meshes) {
      mesh.visible = true;
    }
  }

  /**
   * Dispose of all notation meshes and their resources.
   */
  dispose() {
    for (const mesh of this.meshes) {
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (mesh.material.map) mesh.material.map.dispose();
        mesh.material.dispose();
      }
    }
    this.meshes = [];
  }
}

/**
 * Tallest a notation plane may grow when adopting its texture's aspect —
 * just inside the 3-unit gate face (planes are centered on the box).
 */
NotationDisplay.MAX_PLANE_HEIGHT = 2.7;

/**
 * Gate: 4 faces of a 3x3x3 box, offset 0.02 outside each face.
 * PlaneGeometry dimensions: 2.8 x 1.5 (the LAYOUT box — the mesh rescales
 * to the rendered staff's true aspect once the texture arrives).
 */
NotationDisplay.GATE_LAYOUT = [
  { x: 0, y: 0, z: 1.52, width: 2.8, height: 1.5, rotationY: 0 }, // +Z face
  { x: 0, y: 0, z: -1.52, width: 2.8, height: 1.5, rotationY: Math.PI }, // -Z face
  { x: 1.52, y: 0, z: 0, width: 2.8, height: 1.5, rotationY: Math.PI / 2 }, // +X face
  { x: -1.52, y: 0, z: 0, width: 2.8, height: 1.5, rotationY: -Math.PI / 2 }, // -X face
];

/**
 * Fountain: 4 faces around a cylinder (radius 1.5), offset 0.02 outside.
 * PlaneGeometry dimensions: 2.0 x 1.2
 */
NotationDisplay.FOUNTAIN_LAYOUT = [
  { x: 0, y: 0, z: 1.52, width: 2.0, height: 1.2, rotationY: 0 }, // +Z
  { x: 0, y: 0, z: -1.52, width: 2.0, height: 1.2, rotationY: Math.PI }, // -Z
  { x: 1.52, y: 0, z: 0, width: 2.0, height: 1.2, rotationY: Math.PI / 2 }, // +X
  { x: -1.52, y: 0, z: 0, width: 2.0, height: 1.2, rotationY: -Math.PI / 2 }, // -X
];

export default NotationDisplay;
