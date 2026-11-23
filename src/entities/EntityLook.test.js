/**
 * The entities' look (entities/EntityLook, DESIGN.md "Entity look"): an
 * open gate glows only on the opening the player looks into — its NEAR
 * face, the one walking in crosses — and only in the main view: never on
 * its other faces, never on a gate seen through a door or the cleanser gate.
 */
import * as THREE from 'three';
import gameState from 'core/GameState';
import PortalManager from 'core/PortalManager';
import DeployManager from 'core/DeployManager';
import { renderMainView } from 'core/passContext';
import { WORLD_SCALE } from 'core/constants';
import { looksInto } from 'entities/EntityLook';

const FACES = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
};
const centre = { x: 0, z: 0 };
const facesLookedInto = (eye) =>
  Object.keys(FACES).filter((face) => looksInto(eye, centre, FACES[face]));

/** A renderer recording, at each pass, which of `frames` it would draw. */
function recordingRenderer(frames) {
  let target = null;
  return {
    clippingPlanes: [],
    passes: [],
    getRenderTarget: () => target,
    setRenderTarget(next) {
      target = next;
    },
    render() {
      const drawn = frames().filter((frame) => frame.visible && frame.material.visible);
      this.passes.push({ door: target !== null, drawn: drawn.length });
    },
    getDrawingBufferSize: (size) => size.set(800, 600),
  };
}

describe('An open gate glows on the opening the player looks into', () => {
  afterEach(() => {
    DeployManager.reset();
    PortalManager.reset();
    delete global.fetch;
  });

  it('the one face toward the eye: never the others, never two at once', () => {
    expect(facesLookedInto({ x: 0.5, z: 6 })).toEqual(['south']);
    expect(facesLookedInto({ x: -7, z: 2 })).toEqual(['west']);
    // Off a corner, the face the eye is further out from
    expect(facesLookedInto({ x: 5, z: -4 })).toEqual(['east']);
    expect(facesLookedInto({ x: 4, z: -5 })).toEqual(['north']);
    // Exactly on the diagonal still one face
    expect(facesLookedInto({ x: 3, z: 3 })).toHaveLength(1);
  });

  it('its NEAR face: the one a walk into the gate crosses to enter the cell', () => {
    // A door commits its crossing on entering the gate's cell (PortalManager)
    const half = WORLD_SCALE / 2;
    const enteredThrough = (eye) => {
      for (let t = 0; t <= 1; t += 0.001) {
        const x = eye.x * (1 - t);
        const z = eye.z * (1 - t);
        if (Math.abs(x) < half && Math.abs(z) < half) {
          return Math.abs(Math.abs(x) - half) < Math.abs(Math.abs(z) - half)
            ? (x > 0 && 'east') || 'west'
            : (z > 0 && 'south') || 'north';
        }
      }
      return null;
    };
    for (const eye of [
      { x: 1, z: 12 },
      { x: -9, z: 2 },
      { x: 5, z: -4 },
      { x: 4, z: -5 },
    ]) {
      expect(facesLookedInto(eye)).toEqual([enteredThrough(eye)]);
    }
  });

  it('in the main view only: every door pass draws no frame at all', () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, statusText: 'Not Found' }));
    ctx.loadPuzzle('portal-two-pairs');
    const gates = ctx.getGates();
    for (const gate of gates) gate.open();
    const renderer = recordingRenderer(() => gates.map((gate) => gate.mesh));
    const camera = { position: { x: 5 * WORLD_SCALE, y: 1.8, z: 7 * WORLD_SCALE } };

    for (let frame = 0; frame < 3; frame += 1) {
      PortalManager.renderPortals(renderer, camera);
      renderMainView(renderer, gameState.activeArea.group, camera);
    }

    const doorPasses = renderer.passes.filter((pass) => pass.door);
    expect(doorPasses.length).toBeGreaterThan(0);
    expect(doorPasses.every((pass) => pass.drawn === 0)).toBe(true);
    const mainPasses = renderer.passes.filter((pass) => !pass.door);
    expect(mainPasses.every((pass) => pass.drawn === gates.length)).toBe(true);
    // ...and hidden again once the main view has drawn
    expect(gates.every((gate) => !gate.mesh.material.visible)).toBe(true);
  });

  it('closed again, a gate is its slab everywhere', () => {
    ctx.loadPuzzle('portal-two-pairs');
    const [gate] = ctx.getGates();
    gate.open();
    gate.close();
    const renderer = recordingRenderer(() => [gate.mesh]);

    PortalManager.renderPortals(renderer, { position: { x: 0, y: 1.8, z: 0 } });
    renderer.setRenderTarget({}); // a door pass
    renderer.render();

    expect(renderer.passes.every((pass) => pass.drawn === 1)).toBe(true);
  });

  it("the cleanser gate's gold frame: main view only, its passes draw none", async () => {
    DeployManager.initialize(new THREE.Scene()); // the phantom's scene
    ctx.loadPuzzle('deploy-basic');
    gameState.mode = 'PLAYING';
    const [tile] = gameState.activeArea.entityManager.getByType('cleanser');
    ctx.setPlayerPosition({ x: tile.position.x, y: 1.8, z: tile.position.z });
    await ctx.tick(20); // the tile turns active (gold)
    ctx.setPlayerPosition({ x: tile.position.x + 9, y: 1.8, z: tile.position.z + 6 });
    gameState.camera.viewCenter = [0, 0];
    DeployManager.toggle(); // aim
    DeployManager.update();
    DeployManager.toggle(); // deploy
    DeployManager.update();
    const [pad] = gameState.activeArea.entityManager.getByType('cleanser-gate');
    const renderer = recordingRenderer(() => [pad.frame]);
    const camera = { position: gameState.player.position };

    DeployManager.renderPortal(renderer, camera);
    renderMainView(renderer, gameState.activeArea.group, camera);

    const padPasses = renderer.passes.filter((pass) => pass.door);
    expect(padPasses.length).toBeGreaterThan(0);
    expect(padPasses.every((pass) => pass.drawn === 0)).toBe(true);
    expect(renderer.passes.filter((pass) => !pass.door).map((pass) => pass.drawn)).toEqual([1]);
  });
});
