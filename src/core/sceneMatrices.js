/**
 * sceneMatrices — each world scene's matrices update ONCE a frame.
 *
 * three's renderer.render re-derives the world matrix of every object in a
 * scene on each call (scene.matrixWorldAutoUpdate), and a frame draws the
 * same scenes many times over: the main view, and every door pass (each
 * renders the main scene or a neighbour's Area.scene). With all of The
 * Star's doors open that was ~40 full traversals a frame, ~10 ms of a 45 ms
 * frame at 4x CPU throttle (measured 2026-10-17). Nothing moves while a frame
 * draws — the simulation runs in update(), and render-time code only toggles
 * visibility, materials and render targets — so one update before a scene's
 * first pass serves every pass after it.
 *
 * A scene handed to updateSceneMatrices stops auto-updating for good: from
 * then on it must come through here before its first draw of each frame
 * (main.js render() for the main scene, PortalView.render for the scenes its
 * passes draw). An object ADDED to a scene during a frame's passes computes
 * its own world matrix (PortalView's doorway surfaces do). Cameras are not
 * scene children: renderer.render still updates each one itself.
 *
 * The same holds for where things are: scenePieces measures a scene's
 * pieces once a frame, for every door pass to cull by (PortalView).
 */
import { showStoredTexels } from 'core/passContext';

let frame = 0;
const updatedIn = new WeakMap(); // scene -> the frame its matrices are from

/** A new frame: every scene's matrices are due again. */
export function beginFrame() {
  frame += 1;
}

/**
 * Bring `scene`'s world matrices up to date for this frame — once; later
 * calls in the same frame are free — and take that job away from
 * renderer.render, which would redo it at every pass.
 * @param {THREE.Scene} scene
 */
export function updateSceneMatrices(scene) {
  if (updatedIn.get(scene) === frame) return;
  updatedIn.set(scene, frame);
  scene.matrixWorldAutoUpdate = false;
  scene.updateMatrixWorld();
}

// --- Pieces: what a pass can leave out -----------------------------------

// The built-in materials whose shaders discard fragments past the global
// clipping planes (three 0.153: each one's fragment shader includes
// clipping_planes_fragment — ShadowMaterial's and the background's don't)
const CLIPPING_TYPES = new Set([
  'MeshBasicMaterial',
  'MeshLambertMaterial',
  'MeshPhongMaterial',
  'MeshStandardMaterial',
  'MeshPhysicalMaterial',
  'MeshToonMaterial',
  'MeshMatcapMaterial',
  'MeshNormalMaterial',
  'MeshDepthMaterial',
  'MeshDistanceMaterial',
  'LineBasicMaterial',
  'LineDashedMaterial',
  'PointsMaterial',
  'SpriteMaterial',
]);

// The one compile hook the game's materials use (it drops the output
// encode, never the clipping): any other hook might drop the clipping too
const STORED_TEXELS_HOOK = showStoredTexels({}).onBeforeCompile;

// Fragment shader source -> does it include the clipping chunk?
const clippingChunkIn = new Map();

/** Does `material` discard every fragment past a pass's clip planes? */
function clipsFully(material) {
  if (material.isShaderMaterial) {
    if (material.clipping !== true) return false;
    const source = material.fragmentShader;
    let found = clippingChunkIn.get(source);
    if (found === undefined) {
      found = source.includes('#include <clipping_planes_fragment>');
      clippingChunkIn.set(source, found);
    }
    return found;
  }
  if (!CLIPPING_TYPES.has(material.type)) return false;
  const hook = material.onBeforeCompile;
  return hook === STORED_TEXELS_HOOK || hook === Object.getPrototypeOf(material).onBeforeCompile;
}

const clipsAll = (material) =>
  Array.isArray(material) ? material.every(clipsFully) : clipsFully(material);

// A sprite's sphere before its world matrix (three's intersectsSprite)
const SPRITE_SPHERE = Object.freeze({
  center: Object.freeze({ x: 0, y: 0, z: 0 }),
  radius: 0.7071067811865476,
});

/** `array` copied into one twice its length. */
function doubled(array) {
  const grown = new array.constructor(array.length * 2);
  grown.set(array);
  return grown;
}

// Scratch: the world spheres of one piece's drawables, [x, y, z, r] each,
// and the subtree walk's stack
let scratch = new Float64Array(64);
const stack = [];

/**
 * `object`'s world bounding sphere as three's frustum test derives it
 * (Frustum.intersectsObject / intersectsSprite), into sphere `index` of
 * the scratch spheres.
 * @returns {boolean} false when it has none to measure
 */
function measure(object, index) {
  let local = null;
  if (object.isSprite) {
    local = SPRITE_SPHERE;
  } else if (object.boundingSphere !== undefined) {
    if (object.boundingSphere === null) object.computeBoundingSphere();
    local = object.boundingSphere;
  } else if (object.geometry && object.geometry.computeBoundingSphere) {
    if (object.geometry.boundingSphere === null) object.geometry.computeBoundingSphere();
    local = object.geometry.boundingSphere;
  }
  const e = object.matrixWorld && object.matrixWorld.elements;
  if (!local || !e) return false;
  if (4 * index + 4 > scratch.length) scratch = doubled(scratch);
  const { x, y, z } = local.center;
  const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
  const at = 4 * index;
  scratch[at] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
  scratch[at + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
  scratch[at + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
  const scale = Math.max(
    e[0] * e[0] + e[1] * e[1] + e[2] * e[2],
    e[4] * e[4] + e[5] * e[5] + e[6] * e[6],
    e[8] * e[8] + e[9] * e[9] + e[10] * e[10]
  );
  scratch[at + 3] = local.radius * Math.sqrt(scale);
  return true;
}

/**
 * A scene's pieces this frame, one entry per piece in each array: its root
 * object; its root's child count as measured; whether three would
 * frustum-cull every drawable in it (`culls`, 1/0) and whether every
 * material in it clips (`clips`) — neither leaves it to three: a light, an
 * LOD, something drawable not measured here; and its world sphere
 * ([x, y, z, radius] at 4 * i).
 */
class Pieces {
  constructor() {
    this.frame = -1; // the frame measured
    this.asked = -1; // the frame a pass last asked for them
    this.count = 0;
    this.objects = [];
    this.children = [];
    this.culls = new Uint8Array(64);
    this.clips = new Uint8Array(64);
    this.spheres = new Float64Array(4 * 64);
  }

  /** Room for one more piece. */
  _grow() {
    if (this.count < this.culls.length) return;
    this.culls = doubled(this.culls);
    this.clips = doubled(this.clips);
    this.spheres = doubled(this.spheres);
  }

  /**
   * Measure `root`'s subtree as the next piece: one sphere holding every
   * drawable's, and whether three would frustum-cull all of them and
   * whether all of them clip.
   */
  add(root) {
    this._grow();
    const i = this.count;
    this.count += 1;
    this.objects[i] = root;
    this.children[i] = root.children ? root.children.length : 0;
    let count = 0;
    let culls = true;
    let clips = true;
    let known = true;
    stack.push(root);
    while (stack.length > 0) {
      const object = stack.pop();
      if (object.isMesh || object.isLine || object.isPoints || object.isSprite) {
        if (measure(object, count)) count += 1;
        else known = false;
        culls = culls && object.frustumCulled === true;
        clips = clips && Boolean(object.material) && clipsAll(object.material);
      } else if (object.isLight || object.isLOD || object.material || object.geometry) {
        known = false; // three may draw or light with it: not measured here
      }
      const { children } = object;
      if (children) for (let c = 0; c < children.length; c += 1) stack.push(children[c]);
    }
    this.culls[i] = known && culls && count > 0 ? 1 : 0;
    this.clips[i] = known && clips && count > 0 ? 1 : 0;
    const at = 4 * i;
    if (count <= 1) {
      for (let s = 0; s < 4; s += 1) this.spheres[at + s] = scratch[s];
      return;
    }
    // The middle of the spheres' box, and the radius reaching every sphere
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let s = 0; s < 4 * count; s += 4) {
      minX = Math.min(minX, scratch[s]);
      minY = Math.min(minY, scratch[s + 1]);
      minZ = Math.min(minZ, scratch[s + 2]);
      maxX = Math.max(maxX, scratch[s]);
      maxY = Math.max(maxY, scratch[s + 1]);
      maxZ = Math.max(maxZ, scratch[s + 2]);
    }
    const x = (minX + maxX) / 2;
    const y = (minY + maxY) / 2;
    const z = (minZ + maxZ) / 2;
    let radius = 0;
    for (let s = 0; s < 4 * count; s += 4) {
      const dx = scratch[s] - x;
      const dy = scratch[s + 1] - y;
      const dz = scratch[s + 2] - z;
      radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy + dz * dz) + scratch[s + 3]);
    }
    this.spheres[at] = x;
    this.spheres[at + 1] = y;
    this.spheres[at + 2] = z;
    this.spheres[at + 3] = radius;
  }

  /** Measure every piece under `node`: its children, through its groups. */
  collect(node) {
    for (const child of node.children) {
      if (child.isGroup || child.isScene) this.collect(child);
      else this.add(child);
    }
  }
}

const piecesOf = new WeakMap(); // scene -> its Pieces

/**
 * `scene`'s PIECES as this frame's matrices place them: each topmost thing
 * under its groups (a wall; a gate's box with its staff planes and door
 * panels; a floor slab; a creature's body), with one world sphere bounding
 * all of it. A door pass hides the pieces it can't draw (PortalView.render):
 * what lies wholly outside its frustum (`culls`: three would cull every bit
 * of it) or wholly past one of its clip planes (`clips`: every fragment
 * would be discarded), so three never walks them.
 *
 * Measured once a frame, after updateSceneMatrices(scene) — and only for a
 * scene drawn more than once: measuring costs about two of three's own
 * walks, so a scene's first pass of the frame gets null (it walks the scene
 * as three does) and the second measures it for every pass after.
 *
 * `children[i]` is a piece's child count as measured: a piece whose
 * children changed since (a door's panel born mid-frame) is no longer
 * described.
 * @param {THREE.Scene} scene
 * @returns {?Pieces} recycled by the scene's next frame
 */
export function scenePieces(scene) {
  let pieces = piecesOf.get(scene);
  if (!pieces) {
    pieces = new Pieces();
    piecesOf.set(scene, pieces);
  }
  if (pieces.frame === frame) return pieces;
  if (pieces.asked !== frame) {
    pieces.asked = frame;
    return null;
  }
  pieces.frame = frame;
  pieces.count = 0;
  pieces.collect(scene);
  // Last frame's extra entries must not keep a removed object alive
  pieces.objects.length = pieces.count;
  pieces.children.length = pieces.count;
  return pieces;
}
