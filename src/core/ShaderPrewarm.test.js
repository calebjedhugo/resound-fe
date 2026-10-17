/**
 * ShaderPrewarm: while the StartGate holds the world still, draw what
 * gameplay would otherwise compile mid-game — the creature look (its halo
 * first draws on the first note) and every scene a portal pass will draw —
 * in the ONE pass context every gameplay draw shares (core/passContext:
 * CLIP_PLANE_COUNT clip planes, the canvas colour space).
 */
import * as THREE from 'three';
import ShaderPrewarm from 'core/ShaderPrewarm';
import PortalManager from 'core/PortalManager';
import CreatureLook from 'entities/CreatureLook';
import { CLIP_PLANE_COUNT, renderMainView } from 'core/passContext';
import { WORLD_SCALE } from 'core/constants';

// The parts of a pass three keys a program by that the pass itself sets: the
// clip-plane count and the output colour space (the canvas's, or a render
// target's — linear unless it is a scene target)
function contextOf(renderer, target) {
  let colourSpace = renderer.outputColorSpace;
  if (target) colourSpace = target.isXRRenderTarget ? target.texture.colorSpace : 'srgb-linear';
  return `${renderer.clippingPlanes.length} planes, ${colourSpace}`;
}
const GAMEPLAY_CONTEXT = `${CLIP_PLANE_COUNT} planes, ${THREE.SRGBColorSpace}`;

// A renderer that records every draw's pass context
function recordingRenderer() {
  let target = null;
  return {
    outputColorSpace: THREE.SRGBColorSpace, // three's default, which the game keeps
    clippingPlanes: [],
    draws: [],
    getRenderTarget: () => target,
    setRenderTarget(next) {
      target = next;
    },
    render(scene) {
      this.draws.push({ scene, context: contextOf(this, target) });
    },
    getDrawingBufferSize: (size) => size.set(800, 600),
  };
}

const meshesIn = (object) => [object, ...(object.children || []).flatMap(meshesIn)];
const contextsOf = (draws) => new Set(draws.map(({ context }) => context));

describe('Shader prewarm behind the start gate', () => {
  const mainScene = new THREE.Scene();

  it('draws a lit creature (halo showing) in the shared pass context', () => {
    const renderer = recordingRenderer();
    const { halo } = new CreatureLook(1); // the halo material every creature shares

    ShaderPrewarm.run(renderer, mainScene, []);

    expect(contextsOf(renderer.draws)).toEqual(new Set([GAMEPLAY_CONTEXT]));
    const drawn = meshesIn(renderer.draws[0].scene);
    expect(drawn.some((mesh) => mesh.material === halo.material && mesh.visible)).toBe(true);
  });

  it('draws each portal scene once, in the shared pass context', () => {
    const renderer = recordingRenderer();
    const neighbor = { key: {}, scene: new THREE.Scene() };

    ShaderPrewarm.run(renderer, mainScene, [neighbor]);

    const neighborDraws = renderer.draws.filter(({ scene }) => scene === neighbor.scene);
    expect(neighborDraws.map(({ context }) => context)).toEqual([GAMEPLAY_CONTEXT]);
  });

  it('warms exactly the context the main view and every real door pass draw in', () => {
    // A program warmed in any other context is a different program: the
    // first open door would still compile mid-game. Drive the main view and
    // real door passes (approach, side panels, warm-ups, mirror sweep, stale
    // rotor) and compare.
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, statusText: 'Not Found' }));
    ctx.loadPuzzle('portal-two-pairs');
    for (const gate of ctx.getGates()) gate.open();
    const gameplay = recordingRenderer();
    for (const x of [5 * WORLD_SCALE, 5 * WORLD_SCALE + 3.1]) {
      for (let i = 0; i < PortalManager.constructor.STALE_MAX_FRAMES + 2; i += 1) {
        const camera = { position: { x, y: 1.8, z: 7 * WORLD_SCALE } };
        PortalManager.renderPortals(gameplay, camera);
        renderMainView(gameplay, mainScene, camera);
      }
    }
    const prewarm = recordingRenderer();

    ShaderPrewarm.run(prewarm, mainScene, [{ key: {}, scene: new THREE.Scene() }]);

    expect(contextsOf(gameplay.draws)).toEqual(new Set([GAMEPLAY_CONTEXT]));
    expect(contextsOf(prewarm.draws)).toEqual(contextsOf(gameplay.draws));
    PortalManager.reset();
    delete global.fetch;
  });

  it('does nothing more while everything is warm', () => {
    const renderer = recordingRenderer();
    const neighbor = { key: {}, scene: new THREE.Scene() };
    ShaderPrewarm.run(renderer, mainScene, [neighbor]);
    const warmed = renderer.draws.length;

    ShaderPrewarm.run(renderer, mainScene, [neighbor]);

    expect(renderer.draws).toHaveLength(warmed);
  });

  it("leaves the renderer's target and clipping planes as it found them", () => {
    const renderer = recordingRenderer();
    const target = new THREE.WebGLRenderTarget(4, 4);
    const planes = [new THREE.Plane()];
    renderer.setRenderTarget(target);
    renderer.clippingPlanes = planes;

    ShaderPrewarm.run(renderer, mainScene, [{ key: {}, scene: new THREE.Scene() }]);

    expect(renderer.getRenderTarget()).toBe(target);
    expect(renderer.clippingPlanes).toBe(planes);
  });
});
