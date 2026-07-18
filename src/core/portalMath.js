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

// A door's view panels hug the INSIDE of the cell's far faces by this
// margin: flush against them, but in front of anything standing in the
// neighboring cell (a wall directly behind the door must not win the depth
// test against a panel). Panel plane distance from the gate center is
// DOORWAY_OFFSET - PANEL_EPSILON.
export const PANEL_EPSILON = 0.02;

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
 * Could a PortalView hide-set ever NEED to hide a wall at `wallPosition` for
 * a door at `gatePosition`? Drives the static-wall batching split
 * (PuzzleLoader.buildArea): walls outside every linked gate's band merge into
 * one InstancedMesh per area, so they can no longer be hidden individually —
 * this predicate must cover every wall whose hiding has a visible effect.
 *
 * Derivation (see PortalView's _wallsStrictBehind/_wallsFlushLateral): a
 * door's window plane sits half a cell from the gate center along one of the
 * four facings, and per-pass hiding matters only for
 * - flush-lateral walls: outward·(wall - gate) = 0 — the gate's own row or
 *   column, at ANY lateral distance (the jamb rule needs each one toggleable
 *   by eye position), and
 * - strictly-behind walls the doorway clip plane doesn't fully remove:
 *   outward·(wall - gate) = -WORLD_SCALE (one cell). Anything deeper is
 *   entirely behind the clip plane in every pass (shared clip included), so
 *   hiding it is visually redundant and it can merge.
 * Over all four facings that is: x or z distance to the gate of 0 or 1 cell
 * (positions are exact grid multiples; y is ignored, matching the hide-sets).
 */
export function inPortalHideBand(wallPosition, gatePosition) {
  const dx = Math.abs(wallPosition.x - gatePosition.x);
  const dz = Math.abs(wallPosition.z - gatePosition.z);
  const band = WORLD_SCALE * 1.5; // covers axis distances {0, WORLD_SCALE}
  return dx < band || dz < band;
}

/** Rotate a plain {x,y,z} vector by a plain {x,y,z,w} quaternion. */
function rotate(q, v) {
  // t = 2 q×v ; v' = v + w t + q×t
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

/**
 * Is a sphere at least partly inside the camera's view frustum? Pure plain-
 * object math (position + quaternion + vertical fov in degrees + aspect), so
 * it works on the real player camera and stays testable under the mocked
 * renderer. Used to skip portal passes for doorway panels the player cannot
 * see this frame (the far plane is ignored — the game never culls by
 * distance).
 *
 * @param {{position, quaternion, fov, aspect}} camera
 * @param {{x,y,z}} center - sphere center, world space
 * @param {number} radius
 */
export function sphereInView(camera, center, radius) {
  const q = camera.quaternion;
  const forward = rotate(q, { x: 0, y: 0, z: -1 });
  const right = rotate(q, { x: 1, y: 0, z: 0 });
  const up = rotate(q, { x: 0, y: 1, z: 0 });
  const halfV = (camera.fov / 2) * (Math.PI / 180);
  const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
  const d = {
    x: center.x - camera.position.x,
    y: center.y - camera.position.y,
    z: center.z - camera.position.z,
  };
  const dot = (n) => n.x * d.x + n.y * d.y + n.z * d.z;
  // Inward normals of the near + four side planes, all through the eye
  const mix = (a, sa, b, cb) => ({
    x: a.x * sa + b.x * cb,
    y: a.y * sa + b.y * cb,
    z: a.z * sa + b.z * cb,
  });
  const sinH = Math.sin(halfH);
  const cosH = Math.cos(halfH);
  const sinV = Math.sin(halfV);
  const cosV = Math.cos(halfV);
  const planes = [
    forward,
    mix(forward, sinH, right, cosH),
    mix(forward, sinH, right, -cosH),
    mix(forward, sinV, up, cosV),
    mix(forward, sinV, up, -cosV),
  ];
  for (const n of planes) {
    if (dot(n) < -radius) return false;
  }
  return true;
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
