/**
 * ShaderPrewarm: while the StartGate holds the world still, draw what
 * gameplay would otherwise compile mid-game — a stand-in for every program
 * a look can need (the creature's halo first draws on the first note, a key
 * hint on the first hint, a ramp in whichever level has one) and every
 * scene a portal pass will draw — in the ONE pass context every gameplay
 * draw shares (core/passContext: CLIP_PLANE_COUNT clip planes, the canvas
 * colour space).
 */
import * as THREE from 'three';
import ShaderPrewarm from 'core/ShaderPrewarm';
import PortalManager from 'core/PortalManager';
import gameState from 'core/GameState';
import CreatureLook from 'entities/CreatureLook';
import KeyHints from 'ui/KeyHints';
import ClapVisual from 'ui/ClapVisual';
import { CLIP_PLANE_COUNT, renderMainView } from 'core/passContext';
import { CLAP_RANGE, WORLD_SCALE } from 'core/constants';
import { drawnObjects, objectsIn, programKey } from '../__tests__/helpers/drawList';

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
const programsOf = (draws) =>
  new Set(draws.flatMap(({ scene }) => drawnObjects(scene).map(programKey)));

// Lit like the world (main.js): program keys count lights
function litScene() {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  scene.add(new THREE.DirectionalLight(0xffffff, 0.8));
  return scene;
}

// KeyHints draws its keycaps on 2D canvases; the test DOM has no 2D
// context, so hand it one that draws nothing
function buildKeyHints(scene) {
  const { createElement } = document;
  const canvas2d = new Proxy({}, { get: (target, name) => target[name] ?? (() => {}) });
  document.createElement = (tag) => ({ ...createElement(tag), getContext: () => canvas2d });
  try {
    return new KeyHints(scene);
  } finally {
    document.createElement = createElement;
  }
}

describe('Shader prewarm behind the start gate', () => {
  const mainScene = litScene();

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

  it('draws its stand-ins lit like the world (program keys count lights)', () => {
    const renderer = recordingRenderer();

    ShaderPrewarm.run(renderer, mainScene, []);

    const lightsOf = (scene) => scene.children.filter((child) => child.isLight);
    expect(lightsOf(renderer.draws[0].scene).map((light) => light.constructor)).toEqual(
      lightsOf(mainScene).map((light) => light.constructor)
    );
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

// three compiles a program the first time anything draws under its key, so
// a look first drawn after the gate drops — first SHOWN mid-game, or in a
// level loaded two doors away — hitches unless the prewarm's stand-ins
// already compiled its program. Every look's programs (every material it
// can draw with, shown yet or not) must be among theirs. (A notation plane
// WITH its staff texture is warmed with the scenes instead: the texture
// arrives behind the gate, and the scenes are drawn again while it is up.)
describe('Every look gameplay can show is compiled behind the start gate', () => {
  /** The programs of `root`'s looks that no stand-in warmed. */
  function coldPrograms(root) {
    const renderer = recordingRenderer();
    ShaderPrewarm.run(renderer, litScene(), []); // stand-ins only
    const warmed = programsOf(renderer.draws);
    return [...new Set(objectsIn(root).map(programKey))].filter((key) => !warmed.has(key));
  }

  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, statusText: 'Not Found' }));
  });

  afterEach(() => {
    PortalManager.reset();
    delete global.fetch;
  });

  it.each([
    ['floors, single and batched walls, gates and their notation', 'portal-two-pairs'],
    ['a raised floor, a ramp and a creature (halo included)', 'elevation-basic'],
    ['a fountain', 'listening-fountain-basic'],
    ['a cleansing tile', 'deploy-basic'],
  ])('a level with %s', (_, puzzleId) => {
    ctx.loadPuzzle(puzzleId);
    expect(coldPrograms(gameState.activeArea.group)).toEqual([]);
  });

  it('a gate fading under a correct performance', async () => {
    const [{ song }] = ctx.loadPuzzle('listening-gate-multi-note').entities;
    ctx.setInventorySlot(0, song);
    ctx.setActiveSlot(0);
    ctx.pressKey('space');
    await ctx.advanceBeats(1.5); // mid-song

    const [gate] = ctx.getGates();
    expect(gate.isOpen).toBe(false);
    expect(gate.mesh.material.transparent).toBe(true); // fading
    expect(coldPrograms(gate.mesh)).toEqual([]);
  });

  it('open doors: no shell, a see-through panel on every face', () => {
    ctx.loadPuzzle('portal-two-pairs');
    for (const gate of ctx.getGates()) gate.open();
    PortalManager.renderPortals(recordingRenderer(), {
      position: { x: 5 * WORLD_SCALE, y: 1.8, z: 7 * WORLD_SCALE },
    });

    const panels = objectsIn(gameState.activeArea.group).filter((mesh) => mesh._isPortalSurface);
    expect(panels.length).toBeGreaterThan(0);
    expect(coldPrograms(gameState.activeArea.group)).toEqual([]);
  });

  it('the keycap hints', () => {
    const scene = litScene();
    const hints = buildKeyHints(scene);

    expect(objectsIn(scene).filter((object) => object.isSprite)).toHaveLength(3);
    expect(coldPrograms(scene)).toEqual([]);
    hints.dispose();
  });

  it('a clap ring', () => {
    const scene = litScene();
    new ClapVisual(scene).show({ x: 0, y: 1.8, z: 0 }, CLAP_RANGE);

    expect(objectsIn(scene)).toHaveLength(1);
    expect(coldPrograms(scene)).toEqual([]);
  });
});
