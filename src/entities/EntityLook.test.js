/**
 * The entities' look (entities/EntityLook, DESIGN.md "Entity look"): an open
 * door's outline from the eye is a soft seam where its view panels fade
 * into the world around them — a band just inside the outline, the way
 * through untouched, gone before the emerging side of the box can show,
 * and only in the main view: never on a door seen through a door or in the
 * cleanser gate's passes. An open gate draws no shell at all.
 */
import * as THREE from 'three';
import gameState from 'core/GameState';
import PortalManager from 'core/PortalManager';
import DeployManager from 'core/DeployManager';
import { renderMainView } from 'core/passContext';
import { WORLD_SCALE } from 'core/constants';
import { DOORWAY_OFFSET, PANEL_EPSILON } from 'core/portalMath';
import { outlineAt, portalBandAt, portalSeamAt } from 'entities/EntityLook';

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
// A view panel hugs the inside of the box's far faces
const PANEL = DOORWAY_OFFSET - PANEL_EPSILON;
const offset = (eye, normal) =>
  normal.x * (eye.x - gateCentre.x) +
  normal.y * (eye.y - gateCentre.y) +
  normal.z * (eye.z - gateCentre.z);
const turnedToward = (eye, normal) => offset(eye, normal) > GATE_HALF;

/**
 * How much each edge of an open door's box is on its outline from `eye`, by
 * its two faces' names: only faces toward the eye are looked in through,
 * each edge measured at its midpoint.
 */
function outlineEdges(eye) {
  const lit = {};
  for (const [name, normal] of Object.entries(SIDES)) {
    if (!turnedToward(eye, normal)) continue; // eslint-disable-line no-continue
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
      lit[key] = Math.max(lit[key] || 0, outlineAt(eye, gateCentre, mid, across));
    }
  }
  return lit;
}
const shownEdges = (eye) => {
  const lit = outlineEdges(eye);
  return Object.keys(lit)
    .filter((key) => lit[key] > 0.5)
    .sort();
};

const HEAD_ON = { x: 0.4, y: 1.8, z: 10 };
const CORNER = { x: 8, y: 1.8, z: 7 };
const ABOVE = { x: 0.4, y: 7, z: 10 };

// A point of the panel at the back of the box (seen through its south face)
const onNorthPanel = (x, y) => ({ x, y: gateCentre.y + y, z: -PANEL });

describe("An open door's seam follows the portal's outline from the eye", () => {
  it("facing it squarely: the near face's four edges, a square", () => {
    expect(shownEdges(HEAD_ON)).toEqual(
      ['east|south', 'south|top', 'bottom|south', 'south|west'].sort()
    );
  });

  it('off a corner: the outer outline, no line between the two faces seen', () => {
    const lit = shownEdges(CORNER);
    expect(lit).toHaveLength(6);
    expect(lit).not.toContain('east|south');
  });

  it('from above: the edge between the top and the face seen is not on it', () => {
    expect(shownEdges(ABOVE)).toEqual(
      ['bottom|south', 'east|south', 'south|west', 'east|top', 'top|west', 'north|top'].sort()
    );
  });

  it('its band sits just inside the outline, never along the corner line', () => {
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

  it('a view panel fades where the sight of it enters the box beside the outline', () => {
    // Head-on, through the south face: the side panels just behind its
    // left and right edges
    const westPanel = { x: -PANEL, y: gateCentre.y, z: GATE_HALF - 0.3 };
    const eastPanel = { x: PANEL, y: gateCentre.y, z: GATE_HALF - 0.3 };
    expect(portalSeamAt(HEAD_ON, gateCentre, westPanel)).toBeGreaterThan(0.5);
    expect(portalSeamAt(HEAD_ON, gateCentre, eastPanel)).toBeGreaterThan(0.5);
    // From above, through the top: the back panel's top, just under the
    // top's far edge
    expect(portalSeamAt(ABOVE, gateCentre, onNorthPanel(0, GATE_HALF - 0.01))).toBeGreaterThan(0.5);
  });

  it('the view through it is untouched: no seam over the middle of the panels', () => {
    for (const eye of [HEAD_ON, CORNER, ABOVE]) {
      for (let x = -0.75; x <= 0.75; x += 0.25) {
        for (let y = -0.75; y <= 0.75; y += 0.25) {
          expect(portalSeamAt(eye, gateCentre, onNorthPanel(x, y))).toBe(0);
        }
      }
    }
  });

  it('none for an eye inside the box (walking through)', () => {
    const inside = { x: 0.2, y: 1.8, z: 1 };
    expect(portalSeamAt(inside, gateCentre, onNorthPanel(GATE_HALF - 0.01, 0))).toBe(0);
  });
});

describe('Walking round a corner, an edge is gone before the side beyond it shows', () => {
  // Along the near face, past its east edge: the east face turns edge-on at
  // x = GATE_HALF and toward the eye after it
  const walk = (z, y = 1.8) =>
    Array.from({ length: 401 }, (_, i) => {
      const eye = { x: i * 0.01, y, z };
      return { eye, line: outlineEdges(eye)['east|south'] || 0 };
    });

  it.each([
    ['far off', 10],
    ['close by', 3],
  ])('%s: full head-on, 0 by the time the east face turns toward the eye', (_, z) => {
    const steps = walk(z);
    expect(steps[0].line).toBe(1);
    for (const { eye, line } of steps) {
      if (offset(eye, SIDES.east) >= GATE_HALF) expect(line).toBe(0);
    }
    // ...and it really fades on the way there, not just at the end
    expect(steps.some(({ line }) => line > 0.2 && line < 0.8)).toBe(true);
  });

  it('...over the panel too: no seam beside that edge once the east face shows', () => {
    // A point of the back panel seen just inside the near face's east edge
    // from where the east face is barely edge-on
    for (const z of [3, 6, 10]) {
      const eye = { x: GATE_HALF + 0.001, y: 1.8, z };
      const nearEdge = { x: PANEL - 0.02, y: gateCentre.y, z: GATE_HALF - 0.1 };
      expect(portalSeamAt(eye, gateCentre, nearEdge)).toBe(0);
    }
  });

  it('smoothly: no step pops the line', () => {
    const steps = walk(6);
    for (let i = 1; i < steps.length; i += 1) {
      expect(Math.abs(steps[i].line - steps[i - 1].line)).toBeLessThan(0.1);
    }
  });
});

/**
 * A renderer recording, at each pass, which of `shells` it would draw and
 * the materials `panels` wear.
 */
function recordingRenderer(shells = () => [], panels = () => []) {
  let target = null;
  return {
    clippingPlanes: [],
    passes: [],
    getRenderTarget: () => target,
    setRenderTarget(next) {
      target = next;
    },
    render() {
      const drawn = shells().filter((mesh) => mesh.visible && mesh.material.visible);
      const worn = panels().map((panel) => panel.material);
      this.passes.push({ door: target !== null, drawn: drawn.length, worn });
    },
    getDrawingBufferSize: (size) => size.set(800, 600),
  };
}

const panelsOf = (mesh) => mesh.children.filter((child) => child._isPortalSurface);
const seamed = (material) => Boolean(material.userData.seam);

/** The doors of portal-two-pairs, all open, after a few frames of passes. */
function openDoorsDrawn() {
  global.fetch = jest.fn(() => Promise.resolve({ ok: false, statusText: 'Not Found' }));
  ctx.loadPuzzle('portal-two-pairs');
  const gates = ctx.getGates();
  for (const gate of gates) gate.open();
  const panels = () => gates.flatMap((gate) => panelsOf(gate.mesh));
  const renderer = recordingRenderer(() => gates.map((gate) => gate.mesh), panels);
  const camera = { position: { x: 5 * WORLD_SCALE, y: 1.8, z: 7 * WORLD_SCALE } };
  for (let frame = 0; frame < 3; frame += 1) {
    PortalManager.renderPortals(renderer, camera);
    renderMainView(renderer, gameState.activeArea.group, camera);
  }
  return { gates, panels, renderer, camera };
}

describe("The seam is the player's own eye's: drawn in the main view only", () => {
  afterEach(() => {
    DeployManager.reset();
    PortalManager.reset();
    delete global.fetch;
  });

  it('every door pass draws the panels plain; the main view with the seam', () => {
    const { panels, renderer } = openDoorsDrawn();

    const doorPasses = renderer.passes.filter((pass) => pass.door);
    expect(doorPasses.length).toBeGreaterThan(0);
    expect(panels().length).toBeGreaterThan(0);
    for (const pass of doorPasses) expect(pass.worn.some(seamed)).toBe(false);
    for (const pass of renderer.passes.filter((p) => !p.door)) {
      expect(pass.worn.length).toBe(panels().length);
      expect(pass.worn.every(seamed)).toBe(true);
    }
    // ...and plain again once the main view has drawn
    expect(panels().some((panel) => seamed(panel.material))).toBe(false);
  });

  it("a door's panels sort as if opaque: first of the translucent things, writing depth", () => {
    const { panels, renderer } = openDoorsDrawn();

    // Elsewhere plain opaque, as they always were
    for (const panel of panels()) expect(panel.material.transparent).toBe(false);
    // In the main view transparent, so the seam can fade, but drawn first of
    // the translucent things and writing depth
    const [main] = renderer.passes.filter((pass) => !pass.door);
    for (const material of main.worn) {
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).not.toBe(false);
    }
    for (const panel of panels()) expect(panel.renderOrder).toBeLessThan(0);
  });

  it('an open door draws no shell in any pass; closed again, its slab everywhere', () => {
    const { gates, renderer, camera } = openDoorsDrawn();
    expect(renderer.passes.some((pass) => pass.door)).toBe(true);
    expect(renderer.passes.every((pass) => pass.drawn === 0)).toBe(true);

    for (const gate of gates) gate.close();
    renderer.passes.length = 0;
    renderer.setRenderTarget({}); // a door pass
    renderer.render();
    renderMainView(renderer, gameState.activeArea.group, camera);
    expect(renderer.passes.every((pass) => pass.drawn === gates.length)).toBe(true);
  });

  it("the cleanser gate's seam leans gold, its passes draw it plain; it has no shell", async () => {
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
    const panels = () => panelsOf(pad.mesh);
    const renderer = recordingRenderer(() => [], panels);
    const camera = { position: gameState.player.position };

    DeployManager.renderPortal(renderer, camera);
    renderMainView(renderer, gameState.activeArea.group, camera);

    expect(panels()).toHaveLength(4);
    expect(pad.mesh.children).toEqual(panels()); // the panels and nothing else
    const padPasses = renderer.passes.filter((pass) => pass.door);
    expect(padPasses.length).toBeGreaterThan(0);
    for (const pass of padPasses) expect(pass.worn.some(seamed)).toBe(false);
    const [main] = renderer.passes.filter((pass) => !pass.door);
    for (const material of main.worn) {
      expect(material.userData.seam.tintAmount.value).toBeGreaterThan(0);
    }
  });

  it("a door's seam leans no colour", () => {
    const { renderer } = openDoorsDrawn();

    const [main] = renderer.passes.filter((pass) => !pass.door);
    expect(main.worn.length).toBeGreaterThan(0);
    for (const material of main.worn) expect(material.userData.seam.tintAmount.value).toBe(0);
  });
});
