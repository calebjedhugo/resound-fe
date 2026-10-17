/**
 * sceneMatrices — each world scene's matrices update ONCE a frame.
 *
 * three's renderer.render re-derives the world matrix of every object in a
 * scene on each call (scene.matrixWorldAutoUpdate), and a frame draws the
 * same scenes many times over: the main view, and every door pass (each
 * renders the main scene or a neighbour's Area.scene). With all of The
 * Star's doors open that was ~40 full traversals a frame, ~10 ms of a 45 ms
 * frame at 4x CPU throttle (measured 2026-10-17). Nothing moves while a frame
 * draws — the simulation runs in update(), and render-time code only toggles
 * visibility, materials and render targets — so one update before a scene's
 * first pass serves every pass after it.
 *
 * A scene handed to updateSceneMatrices stops auto-updating for good: from
 * then on it must come through here before its first draw of each frame
 * (main.js render() for the main scene, PortalView.render for the scenes its
 * passes draw). An object ADDED to a scene during a frame's passes computes
 * its own world matrix (PortalView's doorway surfaces do). Cameras are not
 * scene children: renderer.render still updates each one itself.
 */
let frame = 0;
const updatedIn = new WeakMap(); // scene -> the frame its matrices are from

/** A new frame: every scene's matrices are due again. */
export function beginFrame() {
  frame += 1;
}

/**
 * Bring `scene`'s world matrices up to date for this frame — once; later
 * calls in the same frame are free — and take that job away from
 * renderer.render, which would redo it at every pass.
 * @param {THREE.Scene} scene
 */
export function updateSceneMatrices(scene) {
  if (updatedIn.get(scene) === frame) return;
  updatedIn.set(scene, frame);
  scene.matrixWorldAutoUpdate = false;
  scene.updateMatrixWorld();
}
