/**
 * playerView — where the player's eye is when a level starts, and how a
 * view (yaw, pitch) turns into the camera's orientation.
 *
 * One definition for the game (PuzzleLoader.placePlayerAtStart, motion's
 * camera, GameState's first view) and for the editor's Play, whose camera
 * glides onto this eye before the game takes over (editor/play/PlayPreview):
 * the two must agree to the last digit, or the hand-off jumps.
 *
 * Game coordinates: a cell's centre is at x * WORLD_SCALE (the editor's
 * cells are offset half a cell from these).
 */
import { WORLD_SCALE, ELEVATION_HEIGHT, EYE_HEIGHT } from 'core/constants';

// The view a world starts with (GameState.camera.viewCenter): facing north
// (-z), level. The mouse adds nothing until it first moves.
export const START_YAW = 0;
export const START_PITCH = 0;

/**
 * The eye at a puzzle's player spawn, in game coordinates.
 * @param {{x: number, y: number, z: number}} playerStart - grid cell + storey
 * @returns {{x: number, y: number, z: number}}
 */
export function spawnEye(playerStart) {
  return {
    x: playerStart.x * WORLD_SCALE,
    y: playerStart.y * ELEVATION_HEIGHT + EYE_HEIGHT,
    z: playerStart.z * WORLD_SCALE,
  };
}

/**
 * The camera's orientation for a view: turned `yaw` about the world's up
 * axis, then tilted `pitch` about its own right (motion.js composes them the
 * same way, yaw first).
 * @param {number} yaw - radians, 0 = north (-z), positive turns left
 * @param {number} pitch - radians, positive looks up
 * @returns {{x: number, y: number, z: number, w: number}} a unit quaternion
 */
export function viewQuaternion(yaw, pitch) {
  const sy = Math.sin(yaw / 2);
  const cy = Math.cos(yaw / 2);
  const sp = Math.sin(pitch / 2);
  const cp = Math.cos(pitch / 2);
  return { x: cy * sp, y: sy * cp, z: 0 - sy * sp, w: cy * cp }; // 0 - : no -0
}
