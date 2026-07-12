import CollisionDetector from 'core/CollisionDetector';
import { getFloorY, getEffectiveElevation, canTraverse } from 'core/ElevationMovement';

/**
 * Can a circular mover of `radius`, currently at (fromX,fromZ) on layer
 * `priorLevel`, occupy the candidate cell (toX,toZ)? A candidate is allowed
 * only when BOTH gates pass:
 *   (a) CLIFF gate — if the move crosses a grid cell, the elevation boundary
 *       must be traversable for the mover's layer (walk-under / ramp aware);
 *   (b) WALL/CREATURE gate — no blocking entity overlaps the candidate.
 *
 * Both gates are always evaluated FROM THE ORIGINAL cell, so a single-axis
 * slide can never sneak across a boundary the full diagonal was denied.
 *
 * @returns {boolean}
 */
function canMoveTo(fromX, fromZ, toX, toZ, radius, ignoreId, priorLevel, grid, y, area = null) {
  // Y used for the wall gate. CollisionDetector filters entities by elevation
  // layer (derived from this Y), so it must reflect the layer the mover is
  // ENTERING — the CANDIDATE cell's floor — not the stale departure Y. (With no
  // grid, fall back to the passed Y.)
  let candidateY = y;
  if (grid) {
    const fromGrid = grid.worldToGrid(fromX, fromZ);
    const toGrid = grid.worldToGrid(toX, toZ);
    if (fromGrid.x !== toGrid.x || fromGrid.z !== toGrid.z) {
      const fromElev = getEffectiveElevation(fromX, fromZ, fromGrid, grid, priorLevel);
      const toElev = getEffectiveElevation(toX, toZ, toGrid, grid, priorLevel);
      if (!canTraverse(fromGrid, toGrid, fromElev, toElev, grid)) return false;
    }
    candidateY = getFloorY(toX, toZ, grid, priorLevel);
  }
  // The FROM position rides along so a closed gate box the mover already
  // overlaps (a one-way crossing lands the player INSIDE the closed partner
  // face) is open from within instead of wedging them.
  return !CollisionDetector.checkCollision(
    { x: toX, y: candidateY, z: toZ },
    radius,
    ignoreId,
    area,
    {
      x: fromX,
      y: candidateY,
      z: fromZ,
    }
  );
}

/**
 * Axis-separated ("wall sliding") collision response, shared by every mover
 * (creatures, the player, and the integration-test harness). Given a mover's
 * current position `old` and its desired position `next`, return the resolved
 * position plus which axes stayed blocked.
 *
 * When the full diagonal move is blocked, each axis is tried alone so the mover
 * slides ALONG a surface it meets at an angle instead of stopping dead. At most
 * ONE single-axis slide is ever committed, so a slide can never reconstruct the
 * forbidden diagonal:
 *   1. full (next.x, next.z)         — the whole move
 *   2. (next.x, old.z)               — slide along X (a wall/cliff blocks Z)
 *   3. (old.x, next.z)               — slide along Z (a wall/cliff blocks X)
 *   4. (old.x, old.z)                — corner / head-on: fully stuck
 *
 * Discrete point tests (no sweeping) are safe here: the largest per-frame axis
 * step is ~0.13 world units (running player) or ~0.13 (creature at max speed),
 * both far smaller than the 3-unit wall/cell size, so tunnelling cannot occur.
 * Do not "upgrade" this to continuous collision without a reason.
 *
 * @param {{x:number,z:number}} old   current position
 * @param {{x:number,z:number}} next  desired position
 * @param {Object} opts
 * @param {number}  opts.radius      mover collision radius
 * @param {?string} [opts.ignoreId]  entity id to ignore (self), or null
 * @param {number}  opts.priorLevel  mover's current elevation layer (walk-under)
 * @param {?Object} [opts.grid]      elevation grid, or null to skip the cliff gate
 * @param {number}  opts.y           mover world Y (for elevation-based collision filtering)
 * @param {?Object} [opts.area]      the mover's area — collision stays area-local
 *                                   (defaults to the player's/active area)
 * @returns {{x:number,z:number,blockedX:boolean,blockedZ:boolean}}
 */
function resolveSlide(old, next, opts) {
  const { radius, ignoreId = null, priorLevel, grid = null, y, area = null } = opts;
  const can = (x, z) => canMoveTo(old.x, old.z, x, z, radius, ignoreId, priorLevel, grid, y, area);

  // 1. Full diagonal move.
  if (can(next.x, next.z)) {
    return { x: next.x, z: next.z, blockedX: false, blockedZ: false };
  }
  // 2. Slide along X (a wall/cliff blocks the Z motion).
  if (next.x !== old.x && can(next.x, old.z)) {
    return { x: next.x, z: old.z, blockedX: false, blockedZ: true };
  }
  // 3. Slide along Z (a wall/cliff blocks the X motion).
  if (next.z !== old.z && can(old.x, next.z)) {
    return { x: old.x, z: next.z, blockedX: true, blockedZ: false };
  }
  // 4. Corner / head-on: fully blocked, stay put.
  return { x: old.x, z: old.z, blockedX: true, blockedZ: true };
}

export { canMoveTo };
export default resolveSlide;
