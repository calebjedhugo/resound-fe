/** @jest-environment jsdom */
/**
 * ShaderPrewarm: while the StartGate holds the world still, draw what
 * gameplay would otherwise compile mid-game — a stand-in for every program
 * a look can need (the creature's halo first draws on the first note, a key
 * hint on the first hint, a ramp in whichever level has one) and every
 * scene a portal pass will draw — in the ONE pass context every gameplay
 * draw shares (core/passContext: CLIP_PLANE_COUNT clip planes, the canvas
 * colour space). jsdom so staves really engrave (resound-notation renders
 * into the DOM) and, given the browser stand-ins below, their textures
 * arrive.
 */
import * as THREE from 'three';
import ShaderPrewarm from 'core/ShaderPrewarm';
import PortalManager from 'core/PortalManager';
import DeployManager from 'core/DeployManager';
import gameState from 'core/GameState';
import CreatureLook from 'entities/CreatureLook';
import Gate from 'entities/Gate';
import Fountain from 'entities/Fountain';
import KeyHints from 'ui/KeyHints';
import ClapVisual from 'ui/ClapVisual';
import { CLIP_PLANE_COUNT, renderMainView } from 'core/passContext';
import { CLAP_RANGE, WORLD_SCALE } from 'core/constants';
import {
  drawnObjects,
  objectsIn,
  programKey,
  renderPass,
  updateMatrixWorld,
} from '../__tests__/helpers/drawList';

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

// KeyHints draws its keycaps on 2D canvases; jsdom has no 2D context, so
// hand it one that draws nothing
function buildKeyHints(scene) {
  const canvas2d = new Proxy({}, { get: (target, name) => target[name] ?? (() => {}) });
  const getContext = jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(canvas2d);
  try {
    return new KeyHints(scene);
  } finally {
    getContext.mockRestore();
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

// three compiles a program the first time anything draws under its key, and
// frees it with the last material using it, so a look first drawn after the
// gate drops — first SHOWN mid-game, or in a level loaded two doors away —
// hitches unless the prewarm's stand-ins already compiled its program, and a
// look every world has (a staff) is relinked in each new world's first frame
// unless a stand-in outlives the world. Every look's programs (every
// material it can draw with, shown yet or not) must be among theirs.
describe('Every look gameplay can show is compiled behind the start gate', () => {
  const savedImage = global.Image;

  /** The programs of `root`'s looks that no stand-in warmed. */
  function coldPrograms(root) {
    const renderer = recordingRenderer();
    ShaderPrewarm.run(renderer, litScene(), []); // stand-ins only
    const warmed = programsOf(renderer.draws);
    return [...new Set(objectsIn(root).map(programKey))].filter((key) => !warmed.has(key));
  }

  // Staff textures arrive as in a browser: the rendered SVG loads as an
  // image and is drawn onto a canvas (jsdom loads no images, has no 2D
  // canvas and no object URLs, so those browser APIs are stood in for)
  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, statusText: 'Not Found' }));
    global.Image = class {
      set src(url) {
        this.onload();
      }
    };
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ clearRect() {}, drawImage() {} });
    URL.createObjectURL = () => 'blob:staff';
    URL.revokeObjectURL = () => {};
  });

  afterEach(() => {
    DeployManager.reset();
    PortalManager.reset();
    delete global.fetch;
    global.Image = savedImage;
    jest.restoreAllMocks();
    delete URL.createObjectURL;
    delete URL.revokeObjectURL;
  });

  // A staff plane is drawn with one material from the moment its gate or
  // fountain is built: map-less and unseen until the staff's texture
  // arrives, then textured, fading per pass by the eye's distance from its
  // plane. Each staff below is one nothing else in this file shows
  // (engravings are shared per staff, so a staff engraved earlier would
  // arrive at once).
  const staffSong = (pitch) => ({ song: [{ pitch, length: '1/4' }] });
  const planesOf = (entity) => entity.notationDisplay.meshes;

  it('a staff still waiting for its texture', () => {
    URL.createObjectURL = undefined; // the texture never arrives
    const gate = new Gate({ x: 0, y: 0, z: 0 }, staffSong('A3'));

    expect(planesOf(gate).some((plane) => plane.material.map)).toBe(false);
    expect(coldPrograms(gate.mesh)).toEqual([]);
    gate.dispose();
  });

  it.each([
    ['gate', Gate, 'B3'],
    ['fountain', Fountain, 'C#4'],
  ])("a %s's staff once its texture has arrived", (_, Entity, pitch) => {
    const entity = new Entity({ x: 0, y: 0, z: 0 }, staffSong(pitch));

    expect(planesOf(entity).every((plane) => plane.material.map)).toBe(true);
    expect(coldPrograms(entity.mesh)).toEqual([]);
    entity.dispose();
  });

  it('a staff fading as the eye nears its plane', () => {
    const scene = new THREE.Scene();
    const gate = new Gate({ x: 0, y: 0, z: 0 }, staffSong('D#4'));
    scene.add(gate.mesh);
    updateMatrixWorld(scene);
    // Just past the +Z staff's plane (1.52 off the gate's centre): between
    // the fade's ends
    const eye = { position: new THREE.Vector3(0, 1.8, 1.8) };
    renderPass(scene, eye); // the first pass hooks the scene
    renderPass(scene, eye);

    const [front] = planesOf(gate);
    expect(front.material.opacity).toBeGreaterThan(0);
    expect(front.material.opacity).toBeLessThan(1);
    expect(coldPrograms(gate.mesh)).toEqual([]);
    gate.dispose();
  });

  it.each([
    ['the sky, the floor, the wall batch, gates and their notation', 'portal-two-pairs'],
    ['a raised floor with cliff edges, a ramp and a creature (halo included)', 'elevation-basic'],
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

  it("open doors as the main view draws them: each panel with its outline's seam", () => {
    ctx.loadPuzzle('portal-two-pairs');
    for (const gate of ctx.getGates()) gate.open();
    PortalManager.renderPortals(recordingRenderer(), {
      position: { x: 5 * WORLD_SCALE, y: 1.8, z: 7 * WORLD_SCALE },
    });

    let cold = null;
    const { group } = gameState.activeArea;
    const mainView = {
      clippingPlanes: [],
      render() {
        cold = coldPrograms(group);
      },
    };
    renderMainView(mainView, group, {});
    expect(cold).toEqual([]);
  });

  it('a gate glowing red, locked out by a wrong note', async () => {
    const [{ song }] = ctx.loadPuzzle('listening-gate-multi-note').entities;
    ctx.setInventorySlot(0, [{ ...song[0], pitch: 'D4' }]);
    ctx.setActiveSlot(0);
    ctx.pressKey('space');
    await ctx.advanceBeats(0.5);

    const [gate] = ctx.getGates();
    expect(gate.lockoutGlow).toBeGreaterThan(0); // the lockout's red
    expect(coldPrograms(gate.mesh)).toEqual([]);
  });

  it('an activated fountain', async () => {
    const [{ song }] = ctx.loadPuzzle('listening-fountain-basic').entities;
    ctx.setInventorySlot(0, song);
    ctx.setActiveSlot(0);
    ctx.pressKey('space');
    await ctx.advanceBeats(2);

    const [fountain] = gameState.activeArea.entityManager.getByType('fountain');
    expect(ctx.isFountainActive(fountain)).toBe(true);
    expect(coldPrograms(fountain.mesh)).toEqual([]);
  });

  it('the cleanser gate: its aiming phantom, the gold tile and the deployed gate', async () => {
    const scene = litScene(); // the phantom shows in the main scene
    DeployManager.initialize(scene);
    ctx.loadPuzzle('deploy-basic');
    gameState.mode = 'PLAYING';
    const [tile] = gameState.activeArea.entityManager.getByType('cleanser');
    ctx.setPlayerPosition({ x: tile.position.x, y: 1.8, z: tile.position.z });
    await ctx.tick(20); // stepping on it makes it the ACTIVE (gold) cleanser
    ctx.setPlayerPosition({ x: tile.position.x + 9, y: 1.8, z: tile.position.z + 6 });
    gameState.camera.viewCenter = [0, 0];

    DeployManager.toggle(); // aim
    DeployManager.update();
    const [phantom] = objectsIn(scene);
    DeployManager.toggle(); // deploy
    DeployManager.update();
    DeployManager.renderPortal(recordingRenderer(), { position: gameState.player.position });

    expect(phantom).toBeDefined();
    expect(tile.isActiveCleanser()).toBe(true);
    const [pad] = gameState.activeArea.entityManager.getByType('cleanser-gate');
    expect(objectsIn(pad.mesh).filter((mesh) => mesh._isPortalSurface)).toHaveLength(4);
    const looks = objectsIn(gameState.activeArea.group);
    expect(looks.some((mesh) => mesh._isCleanserMirror)).toBe(true); // the tile, at the gate
    expect(coldPrograms(phantom)).toEqual([]);
    expect(coldPrograms(gameState.activeArea.group)).toEqual([]);
    // ...and its panels as the main view draws them (the gold seam)
    let cold = null;
    const { group } = gameState.activeArea;
    const mainView = {
      clippingPlanes: [],
      render() {
        cold = coldPrograms(group);
      },
    };
    renderMainView(mainView, group, {});
    expect(cold).toEqual([]);
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
