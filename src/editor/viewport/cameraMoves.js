/**
 * cameraMoves — the editor camera driven by a controller's sticks (the mouse
 * drives OrbitControls directly). Each move keeps OrbitControls' model: the
 * camera orbits `controls.target`; the caller calls controls.update().
 * Plain vector arithmetic on the camera's position and the target, so it
 * runs on the real three and on the test mock alike.
 */

// How far over and under the target the orbit may tilt (radians from
// straight down to the horizon, as OrbitControls' polar angle)
const MIN_POLAR = 0.12;
const MAX_POLAR = 1.45;
const MIN_DISTANCE = 6;
const MAX_DISTANCE = 220;

/** The camera's offset from the target as spherical (radius, polar, azimuth). */
function sphericalOffset(camera, target) {
  const x = camera.position.x - target.x;
  const y = camera.position.y - target.y;
  const z = camera.position.z - target.z;
  const radius = Math.max(1e-6, Math.hypot(x, y, z));
  return {
    radius,
    polar: Math.acos(Math.min(1, Math.max(-1, y / radius))),
    azimuth: Math.atan2(x, z),
  };
}

function placeCamera(camera, target, { radius, polar, azimuth }) {
  camera.position.set(
    target.x + radius * Math.sin(polar) * Math.sin(azimuth),
    target.y + radius * Math.cos(polar),
    target.z + radius * Math.sin(polar) * Math.cos(azimuth)
  );
}

/**
 * Turn the camera around the target: `azimuth` radians round (positive moves
 * the camera to its right, the level turning the other way), `polar`
 * radians of tilt (positive looks more from above).
 */
export function orbit(camera, controls, azimuth, polar) {
  const s = sphericalOffset(camera, controls.target);
  s.azimuth += azimuth;
  s.polar = Math.min(MAX_POLAR, Math.max(MIN_POLAR, s.polar - polar));
  placeCamera(camera, controls.target, s);
}

/** Move the camera nearer the target (factor < 1) or further (> 1). */
export function zoom(camera, controls, factor) {
  const s = sphericalOffset(camera, controls.target);
  s.radius = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, s.radius * factor));
  placeCamera(camera, controls.target, s);
}

/**
 * Slide the camera and its target over the ground: `right` and `forward`
 * in screen terms (forward = away from the camera), world units.
 */
export function pan(camera, controls, right, forward) {
  const { target } = controls;
  const fx = target.x - camera.position.x;
  const fz = target.z - camera.position.z;
  const length = Math.hypot(fx, fz) || 1;
  const ux = fx / length;
  const uz = fz / length;
  // Screen right on the ground: forward turned a quarter clockwise from above
  const dx = ux * forward - uz * right;
  const dz = uz * forward + ux * right;
  target.set(target.x + dx, target.y, target.z + dz);
  camera.position.set(camera.position.x + dx, camera.position.y, camera.position.z + dz);
}

/**
 * Glide the target (and the camera with it) part of the way toward `point`
 * (the cursor): `share` of the way this step. Returns the distance left.
 */
export function glideToward(camera, controls, point, share) {
  const { target } = controls;
  const dx = (point.x - target.x) * share;
  const dz = (point.z - target.z) * share;
  const dy = (point.y - target.y) * share;
  target.set(target.x + dx, target.y + dy, target.z + dz);
  camera.position.set(camera.position.x + dx, camera.position.y + dy, camera.position.z + dz);
  return Math.hypot(point.x - target.x, point.y - target.y, point.z - target.z);
}
