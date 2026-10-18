/**
 * What three draws from a scene graph, and with which shader programs, for
 * tests that care about draw calls and compiles rather than scene membership.
 */
import * as THREE from 'three';
// Real matrix math: the three mock has none
import { Matrix4 } from 'three/src/math/Matrix4';

/**
 * The objects three would draw from `root` (WebGLRenderer.projectObject): an
 * invisible object is skipped WITH its subtree; an object whose MATERIAL is
 * hidden is skipped alone (its children still draw).
 * @param {object} root - a scene, group or mesh
 * @returns {object[]} the drawn objects (each has a material)
 */
export function drawnObjects(root) {
  if (root.visible === false) return [];
  const own = root.material && root.material.visible !== false ? [root] : [];
  return [...own, ...(root.children || []).flatMap(drawnObjects)];
}

/**
 * Give every object under `root` the world matrix three would (position and
 * Y rotation through the parent chain; the game rotates nothing else, and
 * scale changes neither where a plane sits nor where it faces).
 */
export function updateMatrixWorld(root, parentWorld = new Matrix4()) {
  const local = new Matrix4().makeRotationY(root.rotation ? root.rotation.y : 0);
  if (root.position) local.setPosition(root.position.x, root.position.y, root.position.z);
  root.matrixWorld = new Matrix4().multiplyMatrices(parentWorld, local);
  for (const child of root.children || []) updateMatrixWorld(child, root.matrixWorld);
}

/**
 * One pass over `scene` the way three renders it (WebGLRenderer.render):
 * the scene's onBeforeRender, the draw list, each drawn object's
 * onBeforeRender, the scene's onAfterRender.
 * @returns {object[]} the objects the pass drew
 */
export function renderPass(scene, camera, renderer = {}) {
  scene.onBeforeRender(renderer, scene, camera, null);
  const drawn = drawnObjects(scene);
  for (const object of drawn) {
    if (object.onBeforeRender) object.onBeforeRender(renderer, scene, camera);
  }
  scene.onAfterRender(renderer, scene, camera);
  return drawn;
}

/**
 * Every object under `root` that has a material, shown or not: everything a
 * look could draw once gameplay shows it.
 */
export function objectsIn(root) {
  const own = root.material ? [root] : [];
  return [...own, ...(root.children || []).flatMap(objectsIn)];
}

// A short stand-in for a custom shader's source in a readable key
function hashOf(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(16);
}

/**
 * The shader program three 0.153 picks for drawing `object` with its
 * material (WebGLPrograms.getProgramCacheKey), less what every gameplay draw
 * shares: the pass context (core/passContext) and the scene's light counts
 * (every scene is lit alike). Equal keys share one compiled program. Covers
 * the inputs the game's materials vary — the shader (a built-in's type, a
 * ShaderMaterial's sources and defines), the material flags that become
 * #defines, instancing and the onBeforeCompile hook; extend it when a
 * material starts varying another.
 * @returns {string} a readable key
 */
export function programKey(object) {
  const { material } = object;
  const shader =
    material.type === 'ShaderMaterial'
      ? `ShaderMaterial#${hashOf(material.vertexShader + material.fragmentShader)}`
      : material.type;
  const flags = [
    material.defines && `defines=${JSON.stringify(material.defines)}`,
    material.map && 'map',
    material.transparent === false && material.blending === THREE.NormalBlending && 'opaque',
    material.side === THREE.DoubleSide && 'double-sided',
    material.side === THREE.BackSide && 'back-sided',
    material.sizeAttenuation === true && 'size-attenuated',
    object.isInstancedMesh === true && 'instanced',
    `hook#${hashOf(material.customProgramCacheKey())}`,
  ];
  return [shader, ...flags.filter(Boolean)].join(' ');
}
