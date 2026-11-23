import * as THREE from 'three';

// One unit box serves every bar of every outline (scaled per bar)
const BAR_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
BAR_GEOMETRY.userData.shared = true;

/**
 * A material for editor outlines: flat colour, drawn OVER the world (no depth
 * test) so a cursor, a selection or a link badge reads through the game
 * look's dark glass and walls. Whoever creates it disposes it.
 * @param {number} color
 * @param {number} [opacity]
 * @returns {THREE.MeshBasicMaterial}
 */
export function createOutlineMaterial(color, opacity = 0.95) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
  });
}

/**
 * The edges of a box `width` x `height` x `depth`, standing on y = 0 and
 * centred on x/z, as thin bars (a line is a pixel wide in WebGL: bars stay
 * readable from the overhead camera). `edges` 'all' draws the twelve edges,
 * 'base' only the four along the floor.
 * @param {{width:number, height:number, depth:number, thickness?:number,
 *   material: THREE.Material, edges?: 'all'|'base'}} options
 * @returns {THREE.Group}
 */
export function createOutlineBox({
  width,
  height,
  depth,
  thickness = 0.07,
  material,
  edges = 'all',
}) {
  const group = new THREE.Group();
  const bar = (sx, sy, sz, x, y, z) => {
    const mesh = new THREE.Mesh(BAR_GEOMETRY, material);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 20; // after the world's translucent things
    group.add(mesh);
  };
  const hw = width / 2;
  const hd = depth / 2;
  const levels = edges === 'base' ? [0] : [0, height];
  for (const y of levels) {
    bar(width + thickness, thickness, thickness, 0, y, -hd);
    bar(width + thickness, thickness, thickness, 0, y, hd);
    bar(thickness, thickness, depth + thickness, -hw, y, 0);
    bar(thickness, thickness, depth + thickness, hw, y, 0);
  }
  if (edges !== 'base') {
    for (const [x, z] of [
      [-hw, -hd],
      [hw, -hd],
      [-hw, hd],
      [hw, hd],
    ]) {
      bar(thickness, height, thickness, x, height / 2, z);
    }
  }
  return group;
}
