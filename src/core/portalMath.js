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

// A quad reaching this close to the eye plane (or behind it) has no finite
// texel density: its target is as big as targets get
const MIN_CORNER_DEPTH = 0.05;

/**
 * Where a doorway quad lands on a viewer's screen: how many texels its view
 * target needs across and up to sample ~1:1 where the panel is DENSEST on
 * screen, and the share of the screen its bounding box covers. Plain-object
 * math like sphereInView.
 *
 * A pass renders the WHOLE quad into its target (the off-axis frustum is
 * fitted to the corners), and the player sees that target through
 * perspective: an oblique panel's near edge spends more screen pixels per
 * texel than its far edge. The density along each quad axis is projective —
 * |d screen / du| varies only as 1/depth² along u — so it peaks at a corner,
 * and the per-corner maximum is the size that never samples soft.
 *
 * @param {{x, y, z}} eye - the viewer's position
 * @param {{quaternion, fov, aspect}} pose - which way it looks, and its lens
 *   (vertical fov in degrees, like a PerspectiveCamera)
 * @param {{bottomLeft, bottomRight, topLeft}} corners - the quad, world
 *   space; "across" runs bottomLeft→bottomRight, "up" bottomLeft→topLeft
 * @param {number} screenWidth - drawing-buffer pixels
 * @param {number} screenHeight
 * @returns {{texelsAcross: number, texelsUp: number, screenShare: number}}
 *   Infinity texels for a quad reaching the eye plane (its share is then
 *   what lies in front of the eye); nothing at all for one wholly behind
 */
export function panelFootprint(eye, pose, corners, screenWidth, screenHeight) {
  const q = pose.quaternion;
  const toView = { x: -q.x, y: -q.y, z: -q.z, w: q.w }; // world -> camera
  const { bottomLeft: bl, bottomRight: br, topLeft: tl } = corners;
  const origin = rotate(toView, { x: bl.x - eye.x, y: bl.y - eye.y, z: bl.z - eye.z });
  const across = rotate(toView, { x: br.x - bl.x, y: br.y - bl.y, z: br.z - bl.z });
  const up = rotate(toView, { x: tl.x - bl.x, y: tl.y - bl.y, z: tl.z - bl.z });
  const tanV = Math.tan((pose.fov / 2) * (Math.PI / 180));
  const fx = screenWidth / 2 / (tanV * pose.aspect); // pixels per unit at depth 1
  const fy = screenHeight / 2 / tanV;

  // The quad's outline, in order, camera space (it looks down -z)
  const outline = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([u, v]) => ({
    x: origin.x + u * across.x + v * up.x,
    y: origin.y + u * across.y + v * up.y,
    depth: -(origin.z + u * across.z + v * up.z),
  }));

  let texelsAcross = 0;
  let texelsUp = 0;
  for (const p of outline) {
    if (p.depth < MIN_CORNER_DEPTH) {
      texelsAcross = Infinity;
      texelsUp = Infinity;
      break;
    }
    // d(screen)/d(quad axis) at this corner, in pixels per whole axis
    const rate = (d) =>
      Math.hypot(
        (fx * (d.x * p.depth + p.x * d.z)) / (p.depth * p.depth),
        (fy * (d.y * p.depth + p.y * d.z)) / (p.depth * p.depth)
      );
    texelsAcross = Math.max(texelsAcross, rate(across));
    texelsUp = Math.max(texelsUp, rate(up));
  }

  // Screen share: the outline cut at the near plane, projected, boxed
  const visible = [];
  outline.forEach((p, i) => {
    const next = outline[(i + 1) % outline.length];
    if (p.depth >= MIN_CORNER_DEPTH) visible.push(p);
    if (p.depth >= MIN_CORNER_DEPTH !== next.depth >= MIN_CORNER_DEPTH) {
      const t = (MIN_CORNER_DEPTH - p.depth) / (next.depth - p.depth);
      visible.push({
        x: p.x + t * (next.x - p.x),
        y: p.y + t * (next.y - p.y),
        depth: MIN_CORNER_DEPTH,
      });
    }
  });
  if (visible.length === 0) return { texelsAcross: 0, texelsUp: 0, screenShare: 0 };
  let left = Infinity;
  let right = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;
  for (const p of visible) {
    left = Math.min(left, (fx * p.x) / p.depth);
    right = Math.max(right, (fx * p.x) / p.depth);
    bottom = Math.min(bottom, (fy * p.y) / p.depth);
    top = Math.max(top, (fy * p.y) / p.depth);
  }
  const halfW = screenWidth / 2;
  const halfH = screenHeight / 2;
  const width = Math.max(0, Math.min(halfW, right) - Math.max(-halfW, left));
  const height = Math.max(0, Math.min(halfH, top) - Math.max(-halfH, bottom));
  return { texelsAcross, texelsUp, screenShare: (width * height) / (screenWidth * screenHeight) };
}

// --- Sightlines through doorways (the mirror sweep's cull) ---------------
//
// A plane list is a flat Float64Array of [nx, ny, nz, w] runs, unit normals
// pointing inward: a point p is inside the plane when n·p + w >= 0, inside
// a region when it is inside every plane of the list.

const PLANE_STRIDE = 4;

/** Write the plane with normal n through point p as plane `index` of `out`. */
function setPlane(out, index, nx, ny, nz, p) {
  const length = Math.hypot(nx, ny, nz) || 1;
  const o = index * PLANE_STRIDE;
  out[o] = nx / length;
  out[o + 1] = ny / length;
  out[o + 2] = nz / length;
  out[o + 3] = -(out[o] * p.x + out[o + 1] * p.y + out[o + 2] * p.z);
}

/**
 * The four side planes of a camera's view (as sphereInView builds them),
 * through the eye, as planes `index`..`index + 3` of `out`.
 * @param {{x, y, z}} eye
 * @param {{quaternion, fov, aspect}} pose
 * @param {number} [slack] - radians to widen the view by on every side
 * @returns {number} the index after the last plane written
 */
export function viewPlanes(eye, pose, out, index = 0, slack = 0) {
  const q = pose.quaternion;
  const forward = rotate(q, { x: 0, y: 0, z: -1 });
  const right = rotate(q, { x: 1, y: 0, z: 0 });
  const up = rotate(q, { x: 0, y: 1, z: 0 });
  const halfV = Math.min(Math.PI / 2, (pose.fov / 2) * (Math.PI / 180) + slack);
  const halfH = Math.min(
    Math.PI / 2,
    Math.atan(Math.tan((pose.fov / 2) * (Math.PI / 180)) * pose.aspect) + slack
  );
  const sides = [
    [right, halfH, 1],
    [right, halfH, -1],
    [up, halfV, 1],
    [up, halfV, -1],
  ];
  sides.forEach(([axis, half, sign], i) => {
    const s = Math.sin(half);
    const c = Math.cos(half) * sign;
    setPlane(
      out,
      index + i,
      forward.x * s + axis.x * c,
      forward.y * s + axis.y * c,
      forward.z * s + axis.z * c,
      eye
    );
  });
  return index + sides.length;
}

/**
 * The four side planes of the pyramid from `apex` through the part
 * [u0, u1] x [v0, v1] of a quad (bottomLeft + u·across + v·up, u and v in
 * 0..1), as planes `index`..`index + 3` of `out`.
 * @param {{x, y, z}} apex - off the quad's plane
 * @param {{bottomLeft, bottomRight, topLeft}} corners
 * @param {{u0, u1, v0, v1}} rect
 * @returns {number} the index after the last plane written
 */
export function pyramidPlanes(apex, corners, rect, out, index = 0) {
  const { bottomLeft: bl, bottomRight: br, topLeft: tl } = corners;
  const at = (u, v) => ({
    x: bl.x + u * (br.x - bl.x) + v * (tl.x - bl.x) - apex.x,
    y: bl.y + u * (br.y - bl.y) + v * (tl.y - bl.y) - apex.y,
    z: bl.z + u * (br.z - bl.z) + v * (tl.z - bl.z) - apex.z,
  });
  // The rim in order, apex-relative, and its middle (inside every plane)
  const rim = [
    at(rect.u0, rect.v0),
    at(rect.u1, rect.v0),
    at(rect.u1, rect.v1),
    at(rect.u0, rect.v1),
  ];
  const mid = at((rect.u0 + rect.u1) / 2, (rect.v0 + rect.v1) / 2);
  rim.forEach((a, i) => {
    const b = rim[(i + 1) % rim.length];
    const nx = a.y * b.z - a.z * b.y;
    const ny = a.z * b.x - a.x * b.z;
    const nz = a.x * b.y - a.y * b.x;
    const sign = nx * mid.x + ny * mid.y + nz * mid.z < 0 ? -1 : 1;
    setPlane(out, index + i, nx * sign, ny * sign, nz * sign, apex);
  });
  return index + rim.length;
}

// Scratch polygons for clipQuad, (u, v) pairs: a convex quad clipped by k
// planes has at most 4 + k corners
const clipFrom = new Float64Array(64);
const clipTo = new Float64Array(64);

/**
 * The part of a quad inside every plane of a region (clipping is exact for
 * a convex region): its bounding rectangle in quad coordinates (u across, v
 * up, both 0..1) into `out`.
 * @param {{bottomLeft, bottomRight, topLeft}} corners
 * @param {Float64Array} planes - see the plane layout above
 * @param {number} count - how many planes of `planes` bound the region
 * @param {{u0, u1, v0, v1}} out
 * @returns {boolean} false when no part of the quad is inside
 */
export function clipQuad(corners, planes, count, out) {
  const { bottomLeft: bl, bottomRight: br, topLeft: tl } = corners;
  let from = clipFrom;
  let to = clipTo;
  // The whole quad: (0, 0), (1, 0), (1, 1), (0, 1)
  from.fill(0, 0, 8);
  from[2] = 1;
  from[4] = 1;
  from[5] = 1;
  from[7] = 1;
  let size = 4;
  for (let k = 0; k < count && size > 0; k += 1) {
    const o = k * PLANE_STRIDE;
    const nx = planes[o];
    const ny = planes[o + 1];
    const nz = planes[o + 2];
    // The plane's signed distance, linear in (u, v) across the quad
    const d0 = nx * bl.x + ny * bl.y + nz * bl.z + planes[o + 3];
    const du = nx * (br.x - bl.x) + ny * (br.y - bl.y) + nz * (br.z - bl.z);
    const dv = nx * (tl.x - bl.x) + ny * (tl.y - bl.y) + nz * (tl.z - bl.z);
    let kept = 0;
    for (let i = 0; i < size; i += 1) {
      const u = from[2 * i];
      const v = from[2 * i + 1];
      const j = (i + 1) % size;
      const nu = from[2 * j];
      const nv = from[2 * j + 1];
      const d = d0 + du * u + dv * v;
      const nd = d0 + du * nu + dv * nv;
      if (d >= 0) {
        to[2 * kept] = u;
        to[2 * kept + 1] = v;
        kept += 1;
      }
      if (d >= 0 !== nd >= 0) {
        const t = d / (d - nd);
        to[2 * kept] = u + t * (nu - u);
        to[2 * kept + 1] = v + t * (nv - v);
        kept += 1;
      }
    }
    const clipped = to;
    to = from;
    from = clipped;
    size = kept;
  }
  if (size === 0) return false;
  out.u0 = Infinity;
  out.u1 = -Infinity;
  out.v0 = Infinity;
  out.v1 = -Infinity;
  for (let i = 0; i < size; i += 1) {
    out.u0 = Math.min(out.u0, from[2 * i]);
    out.u1 = Math.max(out.u1, from[2 * i]);
    out.v0 = Math.min(out.v0, from[2 * i + 1]);
    out.v1 = Math.max(out.v1, from[2 * i + 1]);
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
