import * as THREE from 'three';
import { NotationRenderer } from 'resound-notation/NotationRenderer';

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

// Staff textures no pass has drawn yet, oldest first, waiting to be handed
// to the GPU in idle time. three uploads a texture on the first draw that
// shows it — a 512 or 1024 px canvas plus its mipmaps — and for a staff an
// idle-built neighbour shows (PuzzleLoader.buildAreaWhenIdle) that first
// draw is a door pass, mid-game: the upload landed inside that frame. With
// a renderer to upload to (uploadInIdleTime), each new texture is uploaded
// in an idle period instead, one per period that has room for what an
// upload last cost. A texture some pass draws first (the StartGate's shader
// prewarm, the main view) was uploaded by that draw and leaves the queue,
// so none is uploaded twice; one freed first leaves it too (an upload would
// bring it back to the GPU, where nothing would ever free it again).
const pendingUploads = new Set(); // THREE.CanvasTexture
let uploader = null; // the renderer idle uploads go to
let uploadScheduled = false;
let uploadCost = 2; // main-thread ms the last upload took (first guess)

// The longest idle period a browser grants (requestIdleCallback spec), so a
// one-off slow upload can't price the rest out of ever running
const MAX_IDLE_MS = 50;

// Without requestIdleCallback (Safari), uploads run on timers this far apart
const TIMER_FALLBACK_MS = 50;

function scheduleUpload() {
  if (uploadScheduled || !uploader || pendingUploads.size === 0) return;
  uploadScheduled = true;
  /* eslint-disable no-use-before-define */
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(uploadOne);
  } else {
    setTimeout(() => uploadOne({ timeRemaining: () => Infinity }), TIMER_FALLBACK_MS);
  }
  /* eslint-enable no-use-before-define */
}

/** In an idle period: the oldest waiting texture, if the period has room. */
function uploadOne(deadline) {
  uploadScheduled = false;
  const [texture] = pendingUploads;
  if (uploader && texture && deadline.timeRemaining() >= uploadCost) {
    pendingUploads.delete(texture);
    const started = performance.now();
    uploader.initTexture(texture);
    uploadCost = Math.min(performance.now() - started, MAX_IDLE_MS);
  }
  scheduleUpload();
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

// The pale halo under a staff's ink (engrave): its colour, its blur as a
// share of the texture's width, and how many times it is laid down (each
// one thickens it)
const STAFF_HALO_COLOUR = 'rgba(226, 231, 242, 0.9)';
const STAFF_HALO_BLUR = 0.008;
const STAFF_HALO_PASSES = 2;

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

    // The staff can't be shown after all: let go of the image, and forget it
    const fail = () => {
      URL.revokeObjectURL(url);
      renderer.clear();
      forget();
    };

    const img = new Image();
    img.onload = () => {
      // Every display let go while the image loaded: nothing to show it on
      if (engraving.users === 0) {
        URL.revokeObjectURL(url);
        renderer.clear();
        return;
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');

        // Transparent background (entity color shows through)
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw SVG scaled to fit canvas, over a soft pale halo of itself:
        // the ink reads on a closed gate's colour AND over an open door's
        // view of the dark world beyond (entities/EnvironmentLook)
        ctx.shadowColor = STAFF_HALO_COLOUR;
        ctx.shadowBlur = canvas.width * STAFF_HALO_BLUR;
        for (let i = 0; i < STAFF_HALO_PASSES; i += 1) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        URL.revokeObjectURL(url);

        // Create the texture and apply it to every waiting display's meshes
        engraving.texture = new THREE.CanvasTexture(canvas);
        engraving.texture.needsUpdate = true;
        engraving.aspect = canvasHeight / canvasWidth;
        pendingUploads.add(engraving.texture);
        scheduleUpload();
        for (const display of engraving.waiting) display._showEngraving(engraving);
        engraving.waiting.clear();
      } catch (e) {
        // Loaded but can't be drawn (a browser that won't paint this SVG):
        // a staff left in the cache untextured would keep every later
        // display of it waiting on a texture that never comes
        fail();
        return;
      }

      // Clean up renderer
      renderer.clear();
    };

    img.onerror = fail;

    img.src = url;
  } catch (e) {
    // Graceful degradation - notation just won't appear
    forget();
  }
}

/**
 * Take a reference to a staff's engraving, engraving it on first use. A
 * song no staff can be laid out for (hand-edited JSON: no voices, a null
 * first voice) shows no staff, as it always did: it gets an engraving of
 * its own that never arrives and is never shared. Never a throw — one out
 * of a gate's or fountain's constructor fails its whole area.
 */
function acquireEngraving(staff) {
  let input;
  let width;
  let key;
  try {
    input = renderInput(staff);
    width = renderWidth(staff);
    key = JSON.stringify([width, input]);
  } catch (e) {
    return { key: null, users: 1, texture: null, aspect: 0, waiting: new Set() };
  }
  let engraving = engravings.get(key);
  if (engraving) {
    engraving.users += 1;
  } else {
    // Counted before engraving starts: its image may load at once
    engraving = { key, users: 1, texture: null, aspect: 0, waiting: new Set() };
    engravings.set(key, engraving);
    engrave(engraving, input, width);
  }
  return engraving;
}

/** Drop a reference; the last one out frees the texture. */
function releaseEngraving(engraving) {
  engraving.users -= 1;
  if (engraving.users > 0) return;
  // (a failed engraving may already be forgotten, its key engraved anew,
  // or never have been kept: a song no staff can be laid out for)
  if (engravings.get(engraving.key) === engraving) engravings.delete(engraving.key);
  if (engraving.texture) {
    pendingUploads.delete(engraving.texture);
    engraving.texture.dispose();
  }
}

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

/** A staff plane's fade as seen from `camera`: 0 (invisible) to 1. */
function planeFade(mesh, camera) {
  scratchNormal.set(0, 0, 1).transformDirection(mesh.matrixWorld);
  scratchPosition.setFromMatrixPosition(mesh.matrixWorld);
  scratchToCamera.copy(camera.position).sub(scratchPosition);
  const planeDistance = scratchNormal.dot(scratchToCamera);
  return Math.min(1, Math.max(0, (planeDistance - FADE_NEAR) / (FADE_FAR - FADE_NEAR)));
}

// Passes leave out the staff planes they would draw at ZERO opacity: seen
// from behind or edge-on (within FADE_NEAR of the plane), or still waiting
// for the staff texture. Such a plane paints nothing (it writes no depth),
// yet its draw call cost as much as a visible one — and from any eye
// outside a gate, at least two of its four planes face away, in every pass
// (the main view and each door pass). A scene's first notation draw hooks
// that scene: before each later pass over it, every plane the pass can
// draw has its material hidden if the very fade its onBeforeRender would
// apply is zero (so exactly the invisible draws drop out), and after the
// pass those planes are drawable again — an unhooked scene still draws them
// all. A plane the pass can't draw (another area's, or under a piece a door
// pass leaves out) is left alone: its fade matters to no draw of this pass,
// and weighing every loaded area's planes on every pass cost ~3% of a frame
const livePlanes = new Set();
const hookedScenes = new WeakSet();
const fadedOut = []; // the planes the pass under way left out

/**
 * Can a pass over `scene` draw `object` — is it in the scene, with nothing
 * above it hidden (three skips a hidden object's whole subtree)?
 */
function drawableIn(scene, object) {
  for (let node = object; node; node = node.parent) {
    if (node.visible === false) return false;
    if (node === scene) return true;
  }
  return false;
}

function hideFadedPlanes(scene, camera) {
  // A display's planes hang on one entity mesh, side by side in livePlanes:
  // one walk up from it serves them all
  let parent;
  let drawable = false;
  for (const mesh of livePlanes) {
    if (mesh.parent !== parent) {
      parent = mesh.parent;
      drawable = drawableIn(scene, parent);
    }
    if (drawable && mesh.visible && !(mesh._notationOpacity > 0 && planeFade(mesh, camera) > 0)) {
      mesh.material.visible = false;
      fadedOut.push(mesh);
    }
  }
}

function showFadedPlanes() {
  for (const mesh of fadedOut) mesh.material.visible = true;
  fadedOut.length = 0;
}

function hookScene(scene) {
  if (!scene.isScene || hookedScenes.has(scene)) return;
  hookedScenes.add(scene);
  const { onBeforeRender, onAfterRender } = scene;
  scene.onBeforeRender = function beforePass(renderer, passScene, camera, target) {
    onBeforeRender.call(this, renderer, passScene, camera, target);
    hideFadedPlanes(passScene, camera);
  };
  scene.onAfterRender = function afterPass(renderer, passScene, camera) {
    onAfterRender.call(this, renderer, passScene, camera);
    showFadedPlanes();
  };
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
 * Graceful degradation: without a DOM (node test env without jsdom), or for
 * a song no staff can be laid out for or engraved from, the display is
 * created with its meshes but no texture — notation just won't appear.
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

  /**
   * Upload staff textures to the GPU in idle time, ahead of the first pass
   * that draws them (see pendingUploads). Until a renderer is given (the
   * editor, tests) a texture uploads on its first draw, as three does.
   * @param {?THREE.WebGLRenderer} renderer - null stops idle uploads
   */
  static uploadInIdleTime(renderer) {
    uploader = renderer;
    scheduleUpload();
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
        material.opacity = mesh._notationOpacity * planeFade(mesh, camera);
        hookScene(scene);
        // This draw uploads the staff texture, if no idle period has yet
        pendingUploads.delete(material.map);
      };

      livePlanes.add(mesh);
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
      livePlanes.delete(mesh);
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
