/**
 * Pure geometry for cross-puzzle gate portals (see-through doors).
 *
 * A linked gate pair defines a rigid mapping between two puzzle spaces:
 * the walk-through direction INTO the source gate (-outward) lands on the
 * partner's outward direction, matching how PortalManager places the player
 * after a crossing. The same mapping positions the portal camera — rendering
 * the neighbor from the mapped eye point through the mapped doorway quad
 * shows exactly what the player would see if the two areas were physically
 * joined at the door.
 *
 * Everything here is plain {x, y, z} math (no THREE) so it stays fully
 * testable under the mocked renderer.
 */
import { WORLD_SCALE } from 'core/constants';

// Grid-space direction of each gate facing (north = -Z, matching ramps).
export const FACING_VECTORS = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
};

// Entry face -> exit face: a door pairs each face with the partner's
// OPPOSITE face. Looking into the north end shows out the partner's south
// end, and crossing continues your heading (the pair maps by translation).
export const OPPOSITE_FACING = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

// The doorway surface sits just outside the gate box face so it wins the
// depth test against the (semi-transparent) open-gate shell behind it.
export const DOORWAY_OFFSET = WORLD_SCALE / 2 + 0.01;

/**
 * World-space corners of a gate's doorway quad — the full facing face of the
 * gate box (WORLD_SCALE wide, floor to WORLD_SCALE high). Corner names are
 * from the viewpoint of a player standing on the doorway side looking at the
 * gate, matching PlaneGeometry's UV orientation on the doorway surface.
 *
 * @param {{x:number, y:number, z:number}} gatePosition - gate BASE world
 *   position (entity position: y is the floor height, not the box center)
 * @param {string} facing
 */
export function doorwayCorners(gatePosition, facing) {
  const out = FACING_VECTORS[facing] || FACING_VECTORS.north;
  const half = WORLD_SCALE / 2;
  // Viewer-right when looking at the gate along -outward
  const right = { x: out.z, z: -out.x };
  const cx = gatePosition.x + out.x * DOORWAY_OFFSET;
  const cz = gatePosition.z + out.z * DOORWAY_OFFSET;
  return {
    center: { x: cx, y: gatePosition.y + half, z: cz },
    bottomLeft: { x: cx - right.x * half, y: gatePosition.y, z: cz - right.z * half },
    bottomRight: { x: cx + right.x * half, y: gatePosition.y, z: cz + right.z * half },
    topLeft: { x: cx - right.x * half, y: gatePosition.y + WORLD_SCALE, z: cz - right.z * half },
  };
}

/**
 * Rigid mapping from source-puzzle world space to neighbor-puzzle world
 * space for a linked gate pair: a rotation about Y carrying the walk-through
 * direction (-source outward) onto the partner's outward direction, plus the
 * translation carrying the source gate onto the partner gate.
 *
 * @param {{x,y,z}} sourcePosition - source gate base world position
 * @param {string} sourceFacing
 * @param {{x,y,z}} partnerPosition - partner gate base world position
 * @param {string} partnerFacing
 * @returns {{ map: (p:{x,y,z}) => {x,y,z}, outward: {x,y,z} }} `map`
 *   transforms a source-space point into neighbor space; `outward` is the
 *   neighbor-space doorway normal (the kept side of the view: everything on
 *   the other side of the partner's doorway plane is "behind the door").
 */
export function portalMapping(sourcePosition, sourceFacing, partnerPosition, partnerFacing) {
  const os = FACING_VECTORS[sourceFacing] || FACING_VECTORS.north;
  const op = FACING_VECTORS[partnerFacing] || FACING_VECTORS.north;

  // Yaw convention: angle(v) = atan2(v.x, v.z); rotating by theta adds theta.
  const theta = Math.atan2(op.x, op.z) - Math.atan2(-os.x, -os.z);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const map = (p) => {
    const dx = p.x - sourcePosition.x;
    const dz = p.z - sourcePosition.z;
    return {
      x: partnerPosition.x + dx * cos + dz * sin,
      y: partnerPosition.y + (p.y - sourcePosition.y),
      z: partnerPosition.z - dx * sin + dz * cos,
    };
  };

  return { map, outward: { x: op.x, y: 0, z: op.z } };
}
