import * as THREE from 'three';
import { NotationRenderer } from 'resound-notation/NotationRenderer';

// Plane-distance fade for staff planes: invisible while the eye is within
// FADE_NEAR of the staff's PLANE, fully opaque past FADE_FAR, blending
// between. A staff plane floats 0.02 off its entity face; on an OPEN gate
// there is no box behind it, so an eye almost IN the plane used to catch
// the texture's dark rows as a thin dashed line floating over the floor
// (nitpick, 2026-07-14). The key is the eye's perpendicular distance past
// the plane — position, not viewing angle: an angle fade left planes
// semi-transparent on ordinary oblique sightlines (QA, 2026-07-16), while
// every sliver artifact had the eye within a hair of the plane.
const FADE_NEAR = 0.05;
const FADE_FAR = 0.5;
const scratchNormal = new THREE.Vector3();
const scratchPosition = new THREE.Vector3();
const scratchToCamera = new THREE.Vector3();

// Engraved staves, SHARED: every display of the same staff (same song, same
// render parameters) shows ONE texture. Engraving is the bulk of building an
// area — ~1.5 ms a staff, 26 ms of The Star's 23-29 ms build (measured
// 2026-10-17) — and repeats are common: a door's two faces show one song,
// and the POC world's 36 notated gates show only 18 distinct staves. Keyed
// by the exact renderer input and width, so a different song, meter or key
// is a different staff and nothing can show a stale one. Reference-counted
// (`users`): the texture is freed with the LAST display showing it, never
// while a gate in this area or any other still shows it.
const engravings = new Map(); // key -> { key, users, texture, aspect, waiting }

// Every staff plane of one layout size is the same quad, so they share ONE
// geometry instead of four fresh ones per entity (The Star's 17 gates built
// 68, each with its own GPU buffers on first draw). Flagged
// `userData.shared` so Entity.dispose (and dispose below) leave it alone.
const planeGeometries = new Map(); // "width x height" -> THREE.PlaneGeometry

function planeGeometry(width, height) {
  const key = `${width}x${height}`;
  let geometry = planeGeometries.get(key);
  if (!geometry) {
    geometry = new THREE.PlaneGeometry(width, height);
    geometry.userData.shared = true;
    planeGeometries.set(key, geometry);
  }
  return geometry;
}

/** No DOM (node env without jsdom): displays get meshes but no texture. */
function hasDom() {
  return typeof document !== 'undefined' && Boolean(document.createElementNS);
}

/**
 * Wrap the raw game song into the renderer's voices form, carrying a time
 * signature so the renderer slices into measures and draws barlines (a bare
 * note array has no meter, so multi-measure phrases showed no barline). A
 * song already in {voices} form just gets meter/key injected.
 * @param {{song, timeSignature, keySignature}} staff
 */
function renderInput({ song, timeSignature, keySignature }) {
  const meta = { timeSignature, keySignature };
  if (song && !Array.isArray(song) && Array.isArray(song.voices)) {
    return { ...meta, ...song };
  }
  // Flat array: single voice, clef inferred by the renderer from the notes.
  return { ...meta, voices: [{ id: 'v0', notes: song }] };
}

/**
 * Total beats of the song's first voice (rests included) — drives the
 * render width so long songs get room for MULTI-MEASURE systems. The
 * renderer's viewBox width equals the requested width, so width must
 * track content: too narrow stacks one cramped measure per system (the
 * Twinkle staff bug), too wide shrinks a short song's staff.
 */
function songBeats(song) {
  const notes =
    song && !Array.isArray(song) && Array.isArray(song.voices)
      ? song.voices[0].notes || []
      : song || [];
  const BEATS = { '1/1': 4, '1/2': 2, '1/4': 1, '1/8': 0.5, '1/16': 0.25 };
  return notes.reduce((sum, entry) => {
    const note = Array.isArray(entry) ? entry[0] : entry;
    return sum + (BEATS[note && note.length] || 4);
  }, 0);
}

/**
 * Layout width to engrave at. Hand the song straight to the renderer — it
 * sizes the SVG to its own content (single staff vs grand staff, however
 * many ledger lines), so the game never has to inspect notation structure.
 * Width scales with the song so a system holds AT LEAST two measures: 400
 * up to two 4/4 measures; beyond that, ~500px per pair of measures (two
 * quarter-note 4/4 measures lay out naturally at just under 1000px —
 * measured against the published renderer), so the breaker packs
 * multi-measure systems instead of stacking one per line. A measure wider
 * than 400 (four quarters: ~546 px) overflows: the renderer warns, sets it
 * solo and widens the SVG + viewBox to its content, so it is never clipped
 * — a one-measure staff comes out exactly as if engraved at that width.
 * @param {{song, timeSignature}} staff
 */
function renderWidth({ song, timeSignature }) {
  const beatsPerMeasure = ((timeSignature || [4, 4])[0] * 4) / (timeSignature || [4, 4])[1];
  const measures = Math.max(1, Math.ceil(songBeats(song) / beatsPerMeasure));
  return measures <= 2 ? 400 : 500 * Math.ceil(measures / 2);
}

/**
 * Engrave a staff: render the song to SVG, then (asynchronously, once the
 * SVG has loaded as an image) rasterize it onto a canvas texture and hand
 * that to every display waiting on it. A staff that fails is not
 * remembered: the next display of it tries again, as every display used to.
 */
function engrave(engraving, input, width) {
  const forget = () => {
    if (engravings.get(engraving.key) === engraving) engravings.delete(engraving.key);
  };
  try {
    const container = document.createElement('div');
    const renderer = new NotationRenderer({
      container,
      width,
    });

    const svg = renderer.render(input);
    if (!svg) {
      forget();
      return;
    }

    // Mirror the SVG's intrinsic aspect ratio onto the texture canvas so
    // nothing is squashed.
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
      // Every display let go while the image loaded: nothing to show it on
      if (engraving.users === 0) {
        URL.revokeObjectURL(url);
        renderer.clear();
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');

      // Transparent background (entity color shows through)
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw SVG scaled to fit canvas
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      URL.revokeObjectURL(url);

      // Create the texture and apply it to every waiting display's meshes
      engraving.texture = new THREE.CanvasTexture(canvas);
      engraving.texture.needsUpdate = true;
      engraving.aspect = canvasHeight / canvasWidth;
      for (const display of engraving.waiting) display._showEngraving(engraving);
      engraving.waiting.clear();

      // Clean up renderer
      renderer.clear();
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      renderer.clear();
      forget();
    };

    img.src = url;
  } catch (e) {
    // Graceful degradation - notation just won't appear
    forget();
  }
}

/** Take a reference to a staff's engraving, engraving it on first use. */
function acquireEngraving(staff) {
  const input = renderInput(staff);
  const width = renderWidth(staff);
  const key = JSON.stringify([width, input]);
  let engraving = engravings.get(key);
  if (!engraving) {
    engraving = { key, users: 0, texture: null, aspect: 0, waiting: new Set() };
    engravings.set(key, engraving);
    engrave(engraving, input, width);
  }
  engraving.users += 1;
  return engraving;
}

/** Drop a reference; the last one out frees the texture. */
function releaseEngraving(engraving) {
  engraving.users -= 1;
  if (engraving.users > 0) return;
  // (a failed engraving may already be forgotten, its key engraved anew)
  if (engravings.get(engraving.key) === engraving) engravings.delete(engraving.key);
  if (engraving.texture) engraving.texture.dispose();
}

/**
 * Renders musical notation as in-world textures on entity surfaces.
 *
 * Pipeline: song data -> NotationRenderer (SVG) -> Canvas -> CanvasTexture -> PlaneGeometry meshes
 *
 * Meshes are returned synchronously with a placeholder transparent material.
 * The real texture is applied once the SVG-to-Canvas conversion completes —
 * asynchronously the first time a staff is engraved, at once for a staff
 * some other display already shows (engravings are shared; see above).
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
    this._engraving = null; // the shared staff texture this display shows

    this._createMeshes();
    this._renderTexture();
  }

  /**
   * Engrave a staff AHEAD of the display that will show it (an area
   * building in idle time: PuzzleLoader.buildAreaWhenIdle) and hold it
   * until the returned release is called. A display created meanwhile for
   * the same staff reuses it instead of engraving in its constructor.
   * @param {Object} options - the constructor's (entityType doesn't matter:
   *   gates and fountains share staves); same defaults
   * @returns {() => void} release (idempotent)
   */
  static prepare({ song, timeSignature = [4, 4], keySignature = null }) {
    if (!hasDom()) return () => {};
    let engraving = acquireEngraving({ song, timeSignature, keySignature });
    return () => {
      if (!engraving) return;
      releaseEngraving(engraving);
      engraving = null;
    };
  }

  /** The renderer input for this display's staff (see renderInput). */
  _renderInput() {
    return renderInput(this);
  }

  /**
   * Create PlaneGeometry meshes positioned around the entity surface.
   */
  _createMeshes() {
    const layouts =
      this.entityType === 'gate' ? NotationDisplay.GATE_LAYOUT : NotationDisplay.FOUNTAIN_LAYOUT;

    for (const layout of layouts) {
      const geometry = planeGeometry(layout.width, layout.height);
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
      // per-draw plane-distance fade below multiplies against this so it
      // never reveals a plane whose texture has not arrived.
      mesh._notationOpacity = 0;
      // Fade by the eye's distance past this staff's PLANE, per draw and
      // per CAMERA — portal passes render these same meshes from their own
      // mapped eyes and need the same treatment (see the FADE_* constants
      // above).
      mesh.onBeforeRender = (renderer, scene, camera) => {
        scratchNormal.set(0, 0, 1).transformDirection(mesh.matrixWorld);
        scratchPosition.setFromMatrixPosition(mesh.matrixWorld);
        scratchToCamera.copy(camera.position).sub(scratchPosition);
        const planeDistance = scratchNormal.dot(scratchToCamera);
        const fade = Math.min(1, Math.max(0, (planeDistance - FADE_NEAR) / (FADE_FAR - FADE_NEAR)));
        material.opacity = mesh._notationOpacity * fade;
      };

      this.meshes.push(mesh);
    }
  }

  /**
   * Show this display's staff: the shared engraving's texture once it
   * exists (at once if another display already engraved it).
   */
  _renderTexture() {
    // Guard: skip if no DOM (node env without jsdom)
    if (!hasDom()) return;
    this._engraving = acquireEngraving(this);
    if (this._engraving.texture) this._showEngraving(this._engraving);
    else this._engraving.waiting.add(this);
  }

  /** Apply an engraved staff's texture to every plane. */
  _showEngraving({ texture, aspect }) {
    // Fit each plane to the staff's TRUE aspect (inside its layout box,
    // capped by the entity face) instead of stretching onto the fixed
    // quad — a tall multi-system staff was vertically squished.
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
   * Dispose of all notation meshes and their resources. The plane geometry
   * is shared (never freed); the texture is the shared engraving's,
   * released here and freed only with its last display.
   */
  dispose() {
    for (const mesh of this.meshes) {
      if (mesh.material) mesh.material.dispose();
    }
    this.meshes = [];
    if (this._engraving) {
      this._engraving.waiting.delete(this);
      releaseEngraving(this._engraving);
      this._engraving = null;
    }
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
