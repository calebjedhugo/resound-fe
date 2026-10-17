/**
 * What three draws from a scene graph, for tests that care about draw calls
 * rather than scene membership.
 */

/**
 * The objects three would draw from `root` (WebGLRenderer.projectObject): an
 * invisible object is skipped WITH its subtree; an object whose MATERIAL is
 * hidden is skipped alone (its children still draw).
 * @param {object} root - a scene, group or mesh
 * @returns {object[]} the drawn objects (each has a material)
 */
// eslint-disable-next-line import/prefer-default-export
export function drawnObjects(root) {
  if (root.visible === false) return [];
  const own = root.material && root.material.visible !== false ? [root] : [];
  return [...own, ...(root.children || []).flatMap(drawnObjects)];
}
