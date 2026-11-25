/**
 * CutawayLook — the EDITOR's see-inside view, drawn by the game's own
 * shaders (src/editor/CLAUDE.md "The viewport's look"; designer, 2026-11-25:
 * "levels above the focused level being transparent and below being
 * solid"). The game never turns it on: every uniform here starts OFF and
 * only the editor writes them, so the game draws exactly as before.
 *
 * - STOREY CUT (mode 1): everything above the focused storey (the editor's
 *   active storey) is a GHOST — floors, walls and entities drawn as a fine
 *   screen-door dither (about 3 pixels in 16 kept) with their pale edges
 *   whole, so the shape still reads. The focused storey and everything
 *   below draw solid. A wall's top surface is floor one storey up, but it
 *   belongs to its wall: solid with it.
 * - CUTAWAY (mode 2, the default): on the focused storey, WALL-LIKE pieces
 *   (walls and gates) on the camera's side of the cursor are ghosts too
 *   (cellGhosted's NEAR-SIDE rule).
 *
 * A ghost is a discard pattern, never alpha blending: no sorting trouble,
 * and the kept pixels write depth like the solid ones.
 *
 * The rule has a JS twin (cellGhosted) and a GLSL one (CUT_VERTEX_GLSL's
 * cutGhost) — change both. The floor and the wall batch evaluate it per
 * cell in their vertex shaders from the SHARED uniform objects below (one
 * write reaches every material); an entity's look is told per object
 * (a uGhost uniform of its own, 0 by default). No three import: the editor's
 * tests load it without WebGL.
 */

// The modes, in the order the view toggle steps through them
export const CUT_MODES = ['full', 'storey', 'cutaway'];

// The near-side rule, in cells (see cellGhosted)
export const CUTAWAY_FRONT = 0.5;
export const CUTAWAY_REACH = 12;
export const CUTAWAY_HALF_WIDTH = 4.5;
// A ghost keeps the pixels whose 4x4 Bayer threshold is under this: 3 in 16
export const GHOST_DENSITY = 0.15;
// Below this horizontal distance (world units) the camera is overhead:
// nothing is between it and the cursor, so the cutaway cuts nothing
export const OVERHEAD_DISTANCE = 0.5;

/**
 * The cut every material reads: SHARED uniform objects (like
 * EnvironmentLook's WORLD_UNIFORMS). uCutMode 0 = off (the game, always);
 * uCutStorey the focused storey; uCutCentre the cursor cell (grid units,
 * x z); uCutView the horizontal unit direction from the cursor toward the
 * camera (x z; zero when overhead).
 */
export const CUT_UNIFORMS = {
  uCutMode: { value: 0 },
  uCutStorey: { value: 0 },
  uCutCentre: { value: [0, 0] },
  uCutView: { value: [0, 0] },
};

/** What the uniforms hold now, as the JS rule reads it. */
export function currentCut() {
  return {
    mode: CUT_UNIFORMS.uCutMode.value,
    storey: CUT_UNIFORMS.uCutStorey.value,
    centre: { x: CUT_UNIFORMS.uCutCentre.value[0], z: CUT_UNIFORMS.uCutCentre.value[1] },
    view: { x: CUT_UNIFORMS.uCutView.value[0], z: CUT_UNIFORMS.uCutView.value[1] },
  };
}

/**
 * Point every material's cut at `cut` (the editor, each frame it draws).
 * @param {{mode: number, storey: number, centre: {x, z}, view: {x, z}}} cut
 */
export function setCut({ mode, storey, centre, view }) {
  CUT_UNIFORMS.uCutMode.value = mode;
  CUT_UNIFORMS.uCutStorey.value = storey;
  CUT_UNIFORMS.uCutCentre.value[0] = centre.x;
  CUT_UNIFORMS.uCutCentre.value[1] = centre.z;
  CUT_UNIFORMS.uCutView.value[0] = view.x;
  CUT_UNIFORMS.uCutView.value[1] = view.z;
}

/** Everything whole again (Play, the editor going away). */
export function clearCut() {
  setCut({ mode: 0, storey: 0, centre: { x: 0, z: 0 }, view: { x: 0, z: 0 } });
}

/**
 * Whether the piece standing in cell (x, z) of `storey` is a ghost under
 * `cut` (the GLSL cutGhost's twin — change both).
 *
 * - Above the focused storey: a ghost (storey cut and cutaway).
 * - On it, cutaway only, WALL-LIKE pieces (walls, gates) on the camera's
 *   side: the cell lies more than CUTAWAY_FRONT cells from the cursor
 *   toward the camera (`along`, the offset's share along the view
 *   direction), at most CUTAWAY_REACH along, and within CUTAWAY_HALF_WIDTH
 *   cells across (a strip from the cursor toward the eye, as wide as a room).
 *   The cursor's own cell and the cells beside it, square to the view,
 *   stay: what the cursor is on is never cut.
 * - Below it, and everything else on it: solid.
 * @param {number} x
 * @param {number} z
 * @param {number} storey
 * @param {boolean} wallLike
 * @param {{mode, storey, centre: {x, z}, view: {x, z}}} [cut] - default the uniforms'
 * @returns {boolean}
 */
export function cellGhosted(x, z, storey, wallLike, cut = currentCut()) {
  if (cut.mode < 0.5) return false;
  if (storey > cut.storey + 0.5) return true;
  if (cut.mode < 1.5 || !wallLike || Math.abs(storey - cut.storey) > 0.5) return false;
  const vx = x - cut.centre.x;
  const vz = z - cut.centre.z;
  const along = vx * cut.view.x + vz * cut.view.z;
  const across = Math.abs(vx * cut.view.z - vz * cut.view.x);
  return along > CUTAWAY_FRONT && along <= CUTAWAY_REACH && across <= CUTAWAY_HALF_WIDTH;
}

// Entity types that are cut away like walls (opaque, a whole cell)
export const WALL_LIKE_TYPES = ['wall', 'gate'];

/** An entity ({type, x, y, z}) as the rule sees it. */
export function entityGhosted(entity, cut = currentCut()) {
  if (!entity) return false;
  return cellGhosted(entity.x, entity.z, entity.y, WALL_LIKE_TYPES.includes(entity.type), cut);
}

/**
 * The screen-door pattern (CUT_FRAGMENT_GLSL's cutDropped twin): whether a
 * ghost keeps the pixel at (px, py), window pixels.
 */
export function ghostKeeps(px, py) {
  const fract = (v) => v - Math.floor(v);
  // A 2x2 Bayer threshold of a pixel (only its coordinates mod 2 count:
  // kept small, so a big screen loses no float precision)
  const bayer2 = (ax, ay) => {
    const fx = Math.floor(ax) % 2;
    const fy = Math.floor(ay) % 2;
    return fract(fx * 0.5 + fy * 0.75);
  };
  const bayer4 = bayer2(px * 0.5, py * 0.5) * 0.25 + bayer2(px, py);
  return bayer4 < GHOST_DENSITY;
}

const f = (v) => v.toFixed(3);

/**
 * The cut's uniforms and its rule, for a vertex shader: cutGhost(cell,
 * storey, wallLike) is 1.0 for a ghost (cellGhosted's twin).
 */
export const CUT_VERTEX_GLSL = /* glsl */ `
  uniform float uCutMode;
  uniform float uCutStorey;
  uniform vec2 uCutCentre;
  uniform vec2 uCutView;
  float cutGhost(vec2 cell, float storey, float wallLike) {
    if (uCutMode < 0.5) return 0.0;
    if (storey > uCutStorey + 0.5) return 1.0;
    if (uCutMode < 1.5 || wallLike < 0.5 || abs(storey - uCutStorey) > 0.5) return 0.0;
    vec2 v = cell - uCutCentre;
    float along = dot(v, uCutView);
    float across = abs(v.x * uCutView.y - v.y * uCutView.x);
    return (along > ${f(CUTAWAY_FRONT)} && along <= ${f(CUTAWAY_REACH)} &&
      across <= ${f(CUTAWAY_HALF_WIDTH)}) ? 1.0 : 0.0;
  }
`;

/**
 * For a fragment shader: cutDropped() is true for the pixels a ghost
 * leaves out (a 4x4 Bayer screen door keeping GHOST_DENSITY of them;
 * ghostKeeps' twin), and GHOST_EDGE the pale of a ghost's outline.
 */
export const CUT_FRAGMENT_GLSL = /* glsl */ `
  const vec3 GHOST_EDGE = vec3(0.78, 0.82, 0.9);
  float cutBayer2(vec2 a) {
    a = mod(floor(a), 2.0);
    return fract(a.x * 0.5 + a.y * 0.75);
  }
  bool cutDropped() {
    vec2 p = gl_FragCoord.xy;
    return cutBayer2(p * 0.5) * 0.25 + cutBayer2(p) >= ${f(GHOST_DENSITY)};
  }
`;

/**
 * Give one of the editor's own built-in materials (MeshStandardMaterial /
 * MeshBasicMaterial: a waystone disc, a fountain basin, the schematic
 * primitives and slabs) the ghost: its fragments dither away while
 * `material.userData.cutGhost.value` is 1 (per object), or — `perVertex`,
 * for a geometry built by Floor.buildTileGeometry — wherever the cut makes
 * its vertices' cell (`aCut`) a ghost, edge lines (`aEdge`) kept whole.
 * Only for materials the editor owns (never a shared game material).
 * @param {object} material
 * @param {{perVertex?: boolean}} [options]
 * @returns {object} the material
 */
export function addGhostDither(material, { perVertex = false } = {}) {
  const ghost = { value: 0 };
  // eslint-disable-next-line no-param-reassign
  material.userData.cutGhost = ghost;
  // eslint-disable-next-line no-param-reassign
  material.onBeforeCompile = (shader) => {
    /* eslint-disable no-param-reassign */
    shader.uniforms.uGhost = ghost;
    if (perVertex) Object.assign(shader.uniforms, CUT_UNIFORMS);
    const vertexHead = perVertex
      ? `attribute vec4 aCut;\nattribute float aEdge;\nvarying float vCutGhost;\nvarying float vCutEdge;\n${CUT_VERTEX_GLSL}`
      : '';
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>\n${vertexHead}`
    );
    if (perVertex) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvCutGhost = cutGhost(aCut.xy, aCut.z, aCut.w);\nvCutEdge = aEdge;'
      );
    }
    const fragmentHead = perVertex ? 'varying float vCutGhost;\nvarying float vCutEdge;\n' : '';
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\nuniform float uGhost;\n${fragmentHead}${CUT_FRAGMENT_GLSL}`
    );
    const test = perVertex
      ? 'if ((uGhost > 0.5 || vCutGhost > 0.5) && vCutEdge < 0.5 && cutDropped()) discard;'
      : 'if (uGhost > 0.5 && cutDropped()) discard;';
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>\n${test}`
    );
    /* eslint-enable no-param-reassign */
  };
  const key = perVertex ? 'cutaway-ghost-vertex' : 'cutaway-ghost';
  // eslint-disable-next-line no-param-reassign
  material.customProgramCacheKey = () => key;
  // eslint-disable-next-line no-param-reassign
  material.needsUpdate = true;
  return material;
}

/** Ghost (or not) a material addGhostDither gave the ghost to. */
export function setMaterialGhost(material, ghosted) {
  const ghost = material && material.userData && material.userData.cutGhost;
  if (ghost) ghost.value = ghosted ? 1 : 0;
}
