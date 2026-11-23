/**
 * glide — the camera's way between the editor's view and the player's eye
 * (editor/play/PlayPreview). Plain numbers, so it runs the same on the real
 * three and the test mock.
 *
 * A pose: { position: {x, y, z}, quaternion: {x, y, z, w}, fov, far }.
 */

/** Slow out, fast through the middle, slow in. */
export function easeInOutCubic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

const clamp01 = (t) => Math.min(1, Math.max(0, t));
// Lands exactly on `b` at the end (a + (b - a) * 1 can miss it by a bit)
const lerp = (a, b, t) => (t >= 1 ? b : a + (b - a) * t);

/** Spherical blend of two unit quaternions, the short way round. */
export function slerp(a, b, t) {
  if (t >= 1) return { x: b.x, y: b.y, z: b.z, w: b.w };
  let { x, y, z, w } = b;
  let cos = a.x * x + a.y * y + a.z * z + a.w * w;
  if (cos < 0) {
    cos = -cos;
    x = -x;
    y = -y;
    z = -z;
    w = -w;
  }
  let wa;
  let wb;
  if (cos > 0.9995) {
    // Nearly the same: a straight blend, renormalised
    wa = 1 - t;
    wb = t;
  } else {
    const angle = Math.acos(cos);
    const sin = Math.sin(angle);
    wa = Math.sin((1 - t) * angle) / sin;
    wb = Math.sin(t * angle) / sin;
  }
  const q = {
    x: wa * a.x + wb * x,
    y: wa * a.y + wb * y,
    z: wa * a.z + wb * z,
    w: wa * a.w + wb * w,
  };
  const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

/**
 * The pose a share `t` (0..1) of the way from `from` to `to`, eased. The
 * way down to an eye comes in from above: across the level first, then the
 * drop into the cell (`across` > 0: the horizontal part finishes that share
 * early), and the way back up leaves the same way reversed (`across` < 0:
 * up first, then across), so the camera never cuts through a wall beside
 * the spawn.
 * @param {object} from - a pose
 * @param {object} to - a pose
 * @param {number} t
 * @param {number} [across] - -1..1
 */
export function poseAt(from, to, t, across = 0) {
  const share = clamp01(t);
  const eased = easeInOutCubic(share);
  let flat = eased;
  if (across > 0) flat = easeInOutCubic(share / (1 - across));
  else if (across < 0) flat = easeInOutCubic((share + across) / (1 + across));
  return {
    position: {
      x: lerp(from.position.x, to.position.x, flat),
      y: lerp(from.position.y, to.position.y, eased),
      z: lerp(from.position.z, to.position.z, flat),
    },
    quaternion: slerp(from.quaternion, to.quaternion, eased),
    fov: lerp(from.fov, to.fov, eased),
    far: lerp(from.far, to.far, eased),
  };
}

/** Whether two poses are the same view (to within float noise). */
export function samePose(a, b, epsilon = 1e-4) {
  const p = a.position;
  const q = b.position;
  const dot = Math.abs(
    a.quaternion.x * b.quaternion.x +
      a.quaternion.y * b.quaternion.y +
      a.quaternion.z * b.quaternion.z +
      a.quaternion.w * b.quaternion.w
  );
  return (
    Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < epsilon &&
    1 - dot < epsilon * epsilon &&
    Math.abs(a.fov - b.fov) < epsilon
  );
}
