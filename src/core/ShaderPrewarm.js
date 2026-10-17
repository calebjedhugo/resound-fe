/**
 * ShaderPrewarm — compile, while the StartGate holds the world still, the
 * shader programs gameplay would otherwise compile MID-GAME.
 *
 * three builds a program lazily: the first time a material draws under a new
 * program key. The key includes the pass's colour space, the COUNT of global
 * clipping planes, the scene's light counts and the material's flags
 * (transparent, side, map…). Two hitches came from that (measured
 * 2026-10-12):
 *  - the first lit creature in view compiled the halo (+~8 ms on that frame);
 *  - the first open door drew every material of the scene behind it into a
 *    PortalView render target, and showed the gate's transparent shell and
 *    the doorway surface for the first time: 11 programs in one frame
 *    (~140 ms).
 * A warmed program is reused only if its key matches EXACTLY, so this draws
 * for real, in the pass context EVERY gameplay pass shares (core/passContext:
 * canvas colour space, CLIP_PLANE_COUNT planes) — the main view and the
 * portal passes compile the same programs, so one draw per scene warms both.
 * Not renderer.compile: in this three version it reads whatever clipping
 * state the last render left behind.
 *
 * Draws use an orthographic camera spanning ±10 km, so frustum culling keeps
 * every visible object, and land in a 1x1 scene target.
 */
import * as THREE from 'three';
import CreatureLook from 'entities/CreatureLook';
import { NO_CLIP_PLANES, createSceneTarget, showStoredTexels } from 'core/passContext';

const SPAN = 1e4;

// While the gate stays up, scenes are drawn again this often (frames): some
// materials reach their final program key only after load (notation
// textures arrive asynchronously). Cheap once everything is compiled.
const REWARM_FRAMES = 30;

let camera = null;
let drawTarget = null; // 1x1 scene target: every draw lands here
let standIns = null; // scene of materials that first draw mid-game
const standInsWarmed = new WeakSet(); // renderers
const lastWarmed = new WeakMap(); // key (an Area) -> frame it was drawn
let frame = 0;

function setup(mainScene) {
  if (camera) return;
  camera = new THREE.OrthographicCamera(-SPAN, SPAN, SPAN, -SPAN, -SPAN, SPAN);
  drawTarget = createSceneTarget(1, 1);

  // Program keys count lights, so the stand-in scene lights like the world
  standIns = new THREE.Scene();
  for (const child of mainScene.children) {
    if (child.isLight) standIns.add(child.clone());
  }
  // A LIT creature: body and halo both draw (an invisible halo is skipped).
  // Its materials are the shared ones every creature draws with.
  const look = new CreatureLook(1);
  look.noteOn();
  look.update(0, true, null);
  standIns.add(look.object);
  // A doorway surface exactly as PortalView builds one (opaque, showing a
  // scene target's stored texels; its map is a second target, never the one
  // drawn into)
  const surfaceMap = createSceneTarget(1, 1);
  standIns.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      showStoredTexels(new THREE.MeshBasicMaterial({ map: surfaceMap.texture }))
    )
  );
  // A gate's shell once it fades or opens (Gate: transparent standard)
  standIns.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 })
    )
  );
  // Never disposed: a disposed material releases its programs
}

function draw(renderer, scene) {
  renderer.setRenderTarget(drawTarget);
  renderer.clippingPlanes = NO_CLIP_PLANES; // only the COUNT reaches a program
  renderer.render(scene, camera);
}

const ShaderPrewarm = {
  /**
   * Call every frame while the StartGate is up, before the frame's portal
   * passes and main render. Draws only what is due.
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} mainScene - the render scene (its lights are
   *   mirrored for the stand-ins)
   * @param {Array<{key: object, scene: THREE.Scene}>} [portalScenes] - the
   *   scenes portal passes will draw, keyed by their Area
   */
  run(renderer, mainScene, portalScenes = []) {
    frame += 1;
    const needsStandIns = !standInsWarmed.has(renderer);
    const due = portalScenes.filter(({ key }) => {
      const last = lastWarmed.get(key);
      return last === undefined || frame - last >= REWARM_FRAMES;
    });
    if (!needsStandIns && due.length === 0) return;
    setup(mainScene);

    const previousTarget = renderer.getRenderTarget();
    const previousPlanes = renderer.clippingPlanes;
    if (needsStandIns) {
      standInsWarmed.add(renderer);
      draw(renderer, standIns);
    }
    for (const { key, scene } of due) {
      if (lastWarmed.get(key) !== frame) {
        lastWarmed.set(key, frame);
        draw(renderer, scene);
      }
    }
    renderer.setRenderTarget(previousTarget);
    renderer.clippingPlanes = previousPlanes;
  },
};

export default ShaderPrewarm;
