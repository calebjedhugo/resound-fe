/**
 * passContext — the ONE shader-program context every scene draw shares.
 *
 * three 0.153 keys a material's compiled program by, among other things, the
 * NUMBER of global clipping planes and the colour space the pass writes in
 * (the canvas: renderer.outputColorSpace, sRGB; any render target: linear).
 * A material drawn under two contexts re-derives its program (getParameters +
 * the cache-key string, no compile) at EVERY switch between them — the main
 * view and a dozen-plus portal passes a frame alternate, so with three doors
 * open in The Star that was ~200 re-derivations a frame, ~4 ms/frame at 4x
 * CPU throttle (measured 2026-10-12). So every scene pass — the main view,
 * every PortalView pass (doors, the cleanser gate's pad), ShaderPrewarm —
 * draws:
 *  - with exactly CLIP_PLANE_COUNT global clip planes (NO_CLIP_PLANES when
 *    the pass clips nothing: renderMainView);
 *  - in the CANVAS's colour space: render targets that draw world scenes come
 *    from createSceneTarget, and a material that displays one uses
 *    showStoredTexels.
 */
import * as THREE from 'three';

// PortalView binds [shared doorway plane, its own plane] — see its render()
export const CLIP_PLANE_COUNT = 2;

// three discards fragments on a plane's NEGATIVE side; nothing in the world
// is anywhere near 100 km below the floor, so this plane clips nothing
const NO_CLIP = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e5);

/** Planes for a pass that clips nothing (the count still has to match). */
export const NO_CLIP_PLANES = Object.freeze(
  Array.from({ length: CLIP_PLANE_COUNT }, () => NO_CLIP)
);

/**
 * Draw the main view to the canvas under the shared context: it clips
 * nothing, but binds CLIP_PLANE_COUNT (no-op) planes like every other pass.
 * Restores the renderer's planes afterwards.
 */
export function renderMainView(renderer, scene, camera) {
  const previousPlanes = renderer.clippingPlanes;
  renderer.clippingPlanes = NO_CLIP_PLANES;
  renderer.render(scene, camera);
  renderer.clippingPlanes = previousPlanes;
}

/**
 * A render target that draws world scenes in the CANVAS's colour space, so
 * its passes compile the same programs as the main view — and store exactly
 * what the canvas would show: translucent things (creature halos, faded gate
 * shells, notation edges) blend in sRGB space as they do on the canvas, and
 * dark tones keep 8-bit sRGB precision instead of 8-bit-linear banding. A
 * door shows the world as the main view would (designer ruling 2026-10-16).
 *
 * WHY isXRRenderTarget: three 0.153 gives every pass into a render target
 * LINEAR output, with one exception — a target flagged `isXRRenderTarget`
 * outputs in `target.texture.colorSpace` (WebGLRenderer.setProgram and
 * WebGLPrograms.getParameters). The flag is three's internal switch for
 * WebXR's sRGB framebuffers (set only by WebXRManager, on its own targets;
 * "TODO Remove this when possible", three #23278) and is the ONLY way to get
 * an sRGB-output target in this version. Checked in 0.153.0, its sole other
 * effect is the internal format of a multisampled colour renderbuffer
 * (WebGLTextures.setupRenderTarget; samples > 0 only — ours are 0). Nothing
 * in setRenderTarget, viewport/scissor, framebuffer binding, mipmaps or
 * texture upload reads it, and WebXRManager never reads it back.
 * `internalFormat: 'RGBA8'`: an sRGB colour space would otherwise allocate
 * SRGB8_ALPHA8, whose hardware encode-on-write would encode the shader's
 * already-encoded output a second time.
 *
 * PINNED: three stays on 0.153.x (package.json ^0.153.0 admits 0.153 patches
 * only). Re-verify this helper before ANY three upgrade — later versions
 * rename the chunk showStoredTexels edits and rework render-target colour
 * spaces.
 */
export function createSceneTarget(width = 1, height = 1) {
  const target = new THREE.WebGLRenderTarget(width, height);
  target.texture.colorSpace = THREE.SRGBColorSpace;
  target.texture.internalFormat = 'RGBA8';
  target.isXRRenderTarget = true;
  return target;
}

// The r153 output-encode chunk (renamed colorspace_fragment in r154)
const OUTPUT_ENCODE_CHUNK = '#include <encodings_fragment>';

// ONE shared function: three's default program cache key for a material is
// onBeforeCompile.toString(), so every material using it shares one program
function skipOutputEncode(shader) {
  if (!shader.fragmentShader.includes(OUTPUT_ENCODE_CHUNK)) {
    console.warn('passContext: output-encode chunk not found (three upgraded?)');
  }
  shader.fragmentShader = shader.fragmentShader.replace(OUTPUT_ENCODE_CHUNK, '');
}

/**
 * Make `material` (sampling a createSceneTarget texture) show the stored
 * texels as they are: they are already in the canvas's colour space, and
 * every pass that draws the material outputs in that same space, so the
 * usual linear→sRGB output encode would apply twice. (The target is plain
 * RGBA8, so sampling does no decode either.)
 * @returns {THREE.Material} the same material
 */
export function showStoredTexels(material) {
  material.onBeforeCompile = skipOutputEncode;
  return material;
}
