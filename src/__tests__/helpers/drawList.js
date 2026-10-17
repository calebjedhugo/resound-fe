/**
 * What three draws from a scene graph, and with which shader programs, for
 * tests that care about draw calls and compiles rather than scene membership.
 */
import * as THREE from 'three';

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
