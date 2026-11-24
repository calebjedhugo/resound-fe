/**
 * poleReach — which creatures the pole can take, and whether the player can
 * see a point at all (ruled 2026-11-23, superseding "no facing checks —
 * ever" for absorbing; DESIGN.md "The inventory holds CREATURES").
 *
 * A creature is in the pole's reach when ALL of:
 *  - it is in the player's area within its absorbRange (Creature.update);
 *  - it is IN FRONT of the player: some part of its body lies within
 *    REACH_HALF_ANGLE of the effective camera heading, horizontally
 *    (CameraController.getView — mouse offset included, the heading a
 *    release aims along);
 *  - the player can SEE it (lineOfSight): no wall, closed or linked gate,
 *    storey slab or ramp wedge between the eye and the body's centre.
 * Creature.update keeps `isAbsorbable` (and gameState.absorb.inRange: the
 * ×N reach mark, R, the absorb hint) on exactly this rule, and its
 * `reachScore` ranks the ones in reach: best centred, then nearest.
 *
 * lineOfSight is also the release's: a creature is never let out where the
 * player couldn't see it land (core/AbsorbManager.releaseSpot).
 */
import gameState from 'core/GameState';
import CameraController from 'core/CameraController';
import memoizeOnEntityList from 'core/entityListMemo';
import { CREATURE_HOVER_HEIGHT, ELEVATION_HEIGHT, WORLD_SCALE } from 'core/constants';

// Half the pole's horizontal cone, radians: 40° either side of the heading,
// well inside the view's own half-width (~53° at 16:9) — a creature at the
// edge of the screen is not one you are facing (judged in-game 2026-11-23)
export const REACH_HALF_ANGLE = (40 * Math.PI) / 180;

// How tall a wall's box stands above its floor (entities/Wall: 2.5) and a
// gate's (entities/Gate: one cell)
const WALL_HEIGHT = 2.5;
const GATE_HEIGHT = WORLD_SCALE;

// What can block a sightline, by cell: "gx,gz" -> [{ y, height, entity }].
// Walls and gates never move once placed (CLAUDE.md "Entity System"), so the
// map is re-derived only when the area's entity list changes. A gate is kept
// with its entity: whether it blocks depends on whether it is open now.
const blockersByCell = memoizeOnEntityList((entities) => {
  const cells = new Map();
  for (const entity of entities) {
    if (entity.type === 'wall' || entity.type === 'gate') {
      const gx = Math.round(entity.position.x / WORLD_SCALE);
      const gz = Math.round(entity.position.z / WORLD_SCALE);
      const key = `${gx},${gz}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push({
        y: entity.position.y,
        height: entity.type === 'wall' ? WALL_HEIGHT : GATE_HEIGHT,
        entity,
      });
    }
  }
  return cells;
});

/** Does a blocker stop a sight whose height runs over [lo, hi] in its cell? */
function blocks(blocker, lo, hi) {
  const { entity } = blocker;
  // An open plain gate is an empty doorway; a door (linked gate) shows
  // ANOTHER place when open, never this area behind it
  if (entity.type === 'gate' && entity.isOpen && !entity.link) return false;
  return hi > blocker.y && lo < blocker.y + blocker.height;
}

/** Does a ramp's solid wedge in this cell rise above the sight at (x, h, z)? */
function underRamp(ramp, x, h, z) {
  const surface = ramp.getYAtPosition(x, z);
  return surface !== null && h > ramp.position.y && h < surface - 1e-6;
}

/**
 * Can an eye at `from` see `to` in `area`? Walks every grid cell the
 * horizontal segment crosses (both cells where it passes exactly through a
 * corner — no squeezing between two diagonal walls): a wall or closed gate
 * (and any linked gate) whose box the sight passes through blocks it, and so
 * does a ramp's wedge it passes under; and wherever the sight crosses a
 * storey's height, that storey's slab must not be there (the floor of a
 * raised storey seen from below, or looked through from above).
 * @param {Area} area
 * @param {{x:number, y:number, z:number}} from
 * @param {{x:number, y:number, z:number}} to
 * @returns {boolean}
 */
export function lineOfSight(area, from, to) {
  const grid = area && area.elevationGrid;
  if (!grid) return true;
  const cells = blockersByCell(area.entities);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dy = to.y - from.y;
  const heightAt = (t) => from.y + dy * t;

  // The cells the segment crosses (Amanatides & Woo), each with the stretch
  // [t0, t1] of the segment inside it
  const toCell = (v) => Math.round(v / WORLD_SCALE);
  let gx = toCell(from.x);
  let gz = toCell(from.z);
  const endX = toCell(to.x);
  const endZ = toCell(to.z);
  const stepX = Math.sign(dx);
  const stepZ = Math.sign(dz);
  const nextBoundary = (cell, step, start, delta) => {
    if (step === 0) return Infinity;
    const edge = (cell + step * 0.5) * WORLD_SCALE;
    return (edge - start) / delta;
  };
  let tMaxX = nextBoundary(gx, stepX, from.x, dx);
  let tMaxZ = nextBoundary(gz, stepZ, from.z, dz);
  const tDeltaX = stepX === 0 ? Infinity : WORLD_SCALE / Math.abs(dx);
  const tDeltaZ = stepZ === 0 ? Infinity : WORLD_SCALE / Math.abs(dz);

  const cellBlocks = (cx, cz, t0, t1) => {
    const h0 = heightAt(t0);
    const h1 = heightAt(t1);
    const lo = Math.min(h0, h1);
    const hi = Math.max(h0, h1);
    const here = cells.get(`${cx},${cz}`);
    if (here && here.some((blocker) => blocks(blocker, lo, hi))) return true;
    const ramp = grid.getRamp(cx, cz);
    if (ramp) {
      for (const t of [t0, (t0 + t1) / 2, t1]) {
        if (underRamp(ramp, from.x + dx * t, heightAt(t), from.z + dz * t)) return true;
      }
    }
    return false;
  };

  let t = 0;
  // Bounded: a segment crosses at most |Δgx| + |Δgz| + 1 cells
  for (let guard = Math.abs(endX - gx) + Math.abs(endZ - gz) + 2; guard > 0; guard -= 1) {
    const tExit = Math.min(tMaxX, tMaxZ, 1);
    if (cellBlocks(gx, gz, t, tExit)) return false;
    if (tExit >= 1 || (gx === endX && gz === endZ)) break;
    if (Math.abs(tMaxX - tMaxZ) < 1e-9) {
      // Exactly through a corner: the two cells beside it count too
      if (cellBlocks(gx + stepX, gz, tExit, tExit)) return false;
      if (cellBlocks(gx, gz + stepZ, tExit, tExit)) return false;
      gx += stepX;
      gz += stepZ;
      tMaxX += tDeltaX;
      tMaxZ += tDeltaZ;
    } else if (tMaxX < tMaxZ) {
      gx += stepX;
      tMaxX += tDeltaX;
    } else {
      gz += stepZ;
      tMaxZ += tDeltaZ;
    }
    t = tExit;
  }

  // Storey slabs: wherever the sight crosses a storey's height, over a cell
  // with that storey (not a ramp's: a ramp joins it, it is no floor) — the
  // ground's and the subfloors' too: a sight down into a storey below the
  // ground passes the floor above it
  if (Math.abs(dy) > 1e-9) {
    const lowLevel = Math.ceil(Math.min(from.y, to.y) / ELEVATION_HEIGHT);
    const highLevel = Math.floor(Math.max(from.y, to.y) / ELEVATION_HEIGHT);
    for (let level = lowLevel; level <= highLevel; level += 1) {
      const tCross = (level * ELEVATION_HEIGHT - from.y) / dy;
      if (tCross > 0 && tCross < 1) {
        const cx = toCell(from.x + dx * tCross);
        const cz = toCell(from.z + dz * tCross);
        if (grid.inBounds(cx, cz) && grid.hasLevel(cx, cz, level) && !grid.getRamp(cx, cz))
          return false;
      }
    }
  }
  return true;
}

/** Where a creature's body shows: its floating centre (CreatureLook). */
export function bodyCentreOf(creature, out = {}) {
  out.x = creature.position.x;
  out.y = creature.position.y + creature.size + CREATURE_HOVER_HEIGHT;
  out.z = creature.position.z;
  return out;
}

const scratchCentre = { x: 0, y: 0, z: 0 };

/**
 * How well the pole reaches `creature` from the player now: Infinity when it
 * can't (behind the cone, or out of sight), else a score — lower is better:
 * how far off-centre its body is (as a share of the cone's half-angle) plus
 * how far away (as a share of its absorbRange). The caller has already
 * checked the area and the range (Creature.update).
 * @param {Creature} creature
 * @param {number} distance - its real distance from the player
 * @param {number} [yaw] - the effective camera heading (defaults to now's)
 * @returns {number}
 */
export function reachScore(creature, distance, yaw = CameraController.getView(gameState)[0]) {
  const eye = gameState.player.position;
  const dx = creature.position.x - eye.x;
  const dz = creature.position.z - eye.z;
  const flat = Math.hypot(dx, dz);
  let off = 0;
  if (flat > 1e-6) {
    // Forward is (-sin yaw, -cos yaw)
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const cos = Math.max(-1, Math.min(1, (dx * fx + dz * fz) / flat));
    // Any part of its body within the cone counts (a body close by spans
    // a wide angle)
    const spread = Math.asin(Math.min(1, creature.size / flat));
    off = Math.max(0, Math.acos(cos) - spread);
  }
  if (off > REACH_HALF_ANGLE) return Infinity;
  if (
    !lineOfSight(creature.area || gameState.activeArea, eye, bodyCentreOf(creature, scratchCentre))
  ) {
    return Infinity;
  }
  return off / REACH_HALF_ANGLE + distance / Math.max(creature.absorbRange, 1e-6);
}
