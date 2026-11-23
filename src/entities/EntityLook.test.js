/**
 * The entities' look (entities/EntityLook, DESIGN.md "Entity look"): a
 * closed gate lights every edge of its faces toward the eye ("normal
 * corners"); an open door's ripple follows only the portal's outline from
 * the eye, a band just inside it with the way through untouched, and only
 * in the main view: never on a gate seen through a door or the cleanser
 * gate.
 */
import * as THREE from 'three';
import gameState from 'core/GameState';
import PortalManager from 'core/PortalManager';
import DeployManager from 'core/DeployManager';
import { renderMainView } from 'core/passContext';
import { WORLD_SCALE } from 'core/constants';
import { edgeShown, portalBandAt } from 'entities/EntityLook';

// A gate's box: its six faces' outward normals
const SIDES = {
  east: { x: 1, y: 0, z: 0 },
  west: { x: -1, y: 0, z: 0 },
  top: { x: 0, y: 1, z: 0 },
  bottom: { x: 0, y: -1, z: 0 },
  south: { x: 0, y: 0, z: 1 },
  north: { x: 0, y: 0, z: -1 },
};
const gateCentre = { x: 0, y: WORLD_SCALE / 2, z: 0 };
const GATE_HALF = WORLD_SCALE / 2;
const offset = (eye, normal) =>
  normal.x * (eye.x - gateCentre.x) +
  normal.y * (eye.y - gateCentre.y) +
  normal.z * (eye.z - gateCentre.z);

/**
 * How much each edge of the gate lights from `eye`, closed or `open`, by
 * its two faces' names: only faces toward the eye are drawn (back faces are
 * culled), each lighting its edges by edgeShown at their midpoints.
 */
function edgesLit(eye, open) {
  const lit = {};
  for (const [name, normal] of Object.entries(SIDES)) {
    if (offset(eye, normal) <= GATE_HALF) continue; // eslint-disable-line no-continue
    for (const [acrossName, across] of Object.entries(SIDES)) {
      if (Math.abs(across.x * normal.x + across.y * normal.y + across.z * normal.z) > 0.5) {
        continue; // eslint-disable-line no-continue
      }
      const mid = {
        x: gateCentre.x + (normal.x + across.x) * GATE_HALF,
        y: gateCentre.y + (normal.y + across.y) * GATE_HALF,
        z: gateCentre.z + (normal.z + across.z) * GATE_HALF,
      };
      const key = [name, acrossName].sort().join('|');
      lit[key] = Math.max(lit[key] || 0, edgeShown(open, eye, gateCentre, mid, across));
    }
  }
  return lit;
}
const shownEdges = (eye, open) => {
  const lit = edgesLit(eye, open);
  return Object.keys(lit)
    .filter((key) => lit[key] > 0.5)
    .sort();
};

const HEAD_ON = { x: 0.4, y: 1.8, z: 10 };
const CORNER = { x: 8, y: 1.8, z: 7 };
const ABOVE = { x: 0.4, y: 7, z: 10 };

describe('A closed gate lights normal corners: every edge of its faces toward the eye', () => {
  it('facing a panel squarely: its four edges', () => {
    expect(shownEdges(HEAD_ON, false)).toEqual(
      ['east|south', 'south|top', 'bottom|south', 'south|west'].sort()
    );
  });

  it('off a corner: both faces whole, the corner line between them too', () => {
    const lit = shownEdges(CORNER, false);
    expect(lit).toHaveLength(7);
    expect(lit).toContain('east|south');
  });

  it('from above: the top and the face seen, the edge between them too', () => {
    const lit = shownEdges(ABOVE, false);
    expect(lit).toHaveLength(7);
    expect(lit).toContain('south|top');
  });
});

describe("An open door's ripple follows the portal's outline from the eye", () => {
  it("facing it squarely: only the near face's four edges, a square", () => {
    expect(shownEdges(HEAD_ON, true)).toEqual(
      ['east|south', 'south|top', 'bottom|south', 'south|west'].sort()
    );
  });

  it('off a corner: the outer outline, no line between the two faces seen', () => {
    const lit = shownEdges(CORNER, true);
    expect(lit).toHaveLength(6);
    expect(lit).not.toContain('east|south');
  });

  it('from above: the edge between the top and the face seen is hidden', () => {
    expect(shownEdges(ABOVE, true)).toEqual(
      ['bottom|south', 'east|south', 'south|west', 'east|top', 'top|west', 'north|top'].sort()
    );
  });

  it('its band sits just inside the outline; the way through is untouched', () => {
    const { south } = SIDES;
    const onSouth = (x, y) => ({ x, y: gateCentre.y + y, z: GATE_HALF });
    // Head-on: at every edge of the near face, nowhere in its middle
    expect(portalBandAt(HEAD_ON, gateCentre, onSouth(0, GATE_HALF - 0.02), south)).toBeGreaterThan(
      0.9
    );
    expect(portalBandAt(HEAD_ON, gateCentre, onSouth(GATE_HALF - 0.02, 0), south)).toBeGreaterThan(
      0.9
    );
    expect(portalBandAt(HEAD_ON, gateCentre, onSouth(0, 0), south)).toBe(0);
    expect(portalBandAt(HEAD_ON, gateCentre, onSouth(0, GATE_HALF - 0.3), south)).toBe(0);
    // Off a corner: none along the corner line (only near the outline's
    // own edges where they meet it)
    expect(portalBandAt(CORNER, gateCentre, onSouth(GATE_HALF - 0.02, 0), south)).toBe(0);
    expect(portalBandAt(CORNER, gateCentre, onSouth(-GATE_HALF + 0.02, 0), south)).toBeGreaterThan(
      0.9
    );
  });

  it('walking round a corner, its line fades out without popping', () => {
    const corner = (x) => edgesLit({ x, y: 1.8, z: 10 }, true)['east|south'] || 0;
    expect(corner(0)).toBe(1);
    expect(corner(4)).toBe(0);
    for (let x = 0; x < 4; x += 0.02) {
      expect(Math.abs(corner(x + 0.02) - corner(x))).toBeLessThan(0.1);
    }
  });
});

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

describe('An open frame draws in the main view only', () => {
  afterEach(() => {
    DeployManager.reset();
    PortalManager.reset();
    delete global.fetch;
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
