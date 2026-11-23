/**
 * The entities' look (entities/EntityLook, DESIGN.md "Entity look"): an
 * open gate glows only on the opening the player looks into, and only in
 * the main view — never on its other faces, never on a gate seen through a
 * door or the cleanser gate.
 */
import * as THREE from 'three';
import gameState from 'core/GameState';
import PortalManager from 'core/PortalManager';
import DeployManager from 'core/DeployManager';
import { MAIN_VIEW, renderMainView } from 'core/passContext';
import { WORLD_SCALE } from 'core/constants';
import { looksInto } from 'entities/EntityLook';

const FACES = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
};
const centre = { x: 0, z: 0 };
const facesLookedInto = (eye) => Object.keys(FACES).filter((f) => looksInto(eye, centre, FACES[f]));

/** A renderer recording whether each pass drew as the main view. */
function recordingRenderer() {
  let target = null;
  return {
    clippingPlanes: [],
    passes: [],
    getRenderTarget: () => target,
    setRenderTarget(next) {
      target = next;
    },
    render() {
      this.passes.push({ door: target !== null, mainView: MAIN_VIEW.value });
    },
    getDrawingBufferSize: (size) => size.set(800, 600),
  };
}

describe('The opening the player looks into', () => {
  afterEach(() => {
    DeployManager.reset();
    PortalManager.reset();
    delete global.fetch;
  });

  it('is the one face toward the eye: never the others, never two at once', () => {
    expect(facesLookedInto({ x: 0.5, z: 6 })).toEqual(['south']);
    expect(facesLookedInto({ x: -7, z: 2 })).toEqual(['west']);
    // Off a corner, the face the eye is further out from
    expect(facesLookedInto({ x: 5, z: -4 })).toEqual(['east']);
    expect(facesLookedInto({ x: 4, z: -5 })).toEqual(['north']);
    // Exactly on the diagonal still one face
    expect(facesLookedInto({ x: 3, z: 3 })).toHaveLength(1);
  });

  it("of an open door's panels, only the one the eye looks into ripples", () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, statusText: 'Not Found' }));
    ctx.loadPuzzle('portal-two-pairs');
    const gates = ctx.getGates();
    for (const gate of gates) gate.open();
    const eye = { x: 5 * WORLD_SCALE + 1, y: 1.8, z: 7 * WORLD_SCALE };
    PortalManager.renderPortals(recordingRenderer(), { position: eye });

    for (const gate of gates) {
      const panels = gate.mesh.children.filter((child) => child._isPortalSurface);
      expect(panels).toHaveLength(4); // every face materialized
      // A panel stands just inside the face OPPOSITE the one it opens
      const rippling = panels.filter((panel) => {
        const { x, z } = panel.position;
        const outward = { x: -Math.sign(Math.round(x)), z: -Math.sign(Math.round(z)) };
        return looksInto(eye, gate.position, outward);
      });
      expect(rippling).toHaveLength(1);
    }
  });

  it('ripples in the main view only: every door pass draws without it', () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, statusText: 'Not Found' }));
    ctx.loadPuzzle('portal-two-pairs');
    for (const gate of ctx.getGates()) gate.open();
    const renderer = recordingRenderer();
    const camera = { position: { x: 5 * WORLD_SCALE, y: 1.8, z: 7 * WORLD_SCALE } };

    for (let frame = 0; frame < 3; frame += 1) {
      PortalManager.renderPortals(renderer, camera);
      renderMainView(renderer, gameState.activeArea.group, camera);
    }

    const doorPasses = renderer.passes.filter((pass) => pass.door);
    expect(doorPasses.length).toBeGreaterThan(0);
    expect(doorPasses.every((pass) => pass.mainView === 0)).toBe(true);
    const mainPasses = renderer.passes.filter((pass) => !pass.door);
    expect(mainPasses.every((pass) => pass.mainView === 1)).toBe(true);
    expect(MAIN_VIEW.value).toBe(0); // and off again after it
  });

  it("ripples in the main view only: the cleanser gate's passes draw without it", async () => {
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
    const renderer = recordingRenderer();

    DeployManager.renderPortal(renderer, { position: gameState.player.position });

    const padPasses = renderer.passes.filter((pass) => pass.door);
    expect(padPasses.length).toBeGreaterThan(0);
    expect(padPasses.every((pass) => pass.mainView === 0)).toBe(true);
  });
});
