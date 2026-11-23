/**
 * The environment's look (entities/EnvironmentLook, DESIGN.md "Environment
 * look"): the sky every scene draws, the floor's cliff edges, the light a
 * singing creature throws on its area's floor and walls, and the sky's
 * lightning.
 */
import gameState from 'core/GameState';
import PortalManager from 'core/PortalManager';
import {
  MAX_LIGHTS,
  calmStorm,
  lightningLevel,
  stormResponse,
  tickEnvironment,
} from 'entities/EnvironmentLook';
import Floor from 'entities/Floor';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import portalB from '../__tests__/fixtures/puzzles/portal-b.json';

const skiesIn = (object) => {
  const found = [];
  const visit = (o) => {
    if (o.userData && o.userData.isSky) found.push(o);
    (o.children || []).forEach(visit);
  };
  visit(object);
  return found;
};

describe('The sky', () => {
  afterEach(() => {
    PortalManager.reset();
    delete global.fetch;
  });

  it('every scene a pass draws has the one sky: the main view and each neighbour beyond a door', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(JSON.parse(JSON.stringify(portalB))),
      })
    );
    ctx.loadPuzzle('portal-a');
    await jest.runAllTimersAsync(); // the neighbour beyond the door builds
    const neighbor = PortalManager.getArea('portal-b');
    expect(neighbor).toBeTruthy();
    // The active area's group sits in the main view's scene; a neighbour
    // draws through its own scene
    const scenes = [gameState.activeArea.group, neighbor.scene];

    const skies = scenes.map((scene) => skiesIn(scene));
    for (const found of skies) expect(found).toHaveLength(1);
    // One material and one geometry for all of them (same program, same
    // sky: it depends on the view's direction alone)
    const [first] = skies[0];
    for (const [sky] of skies) {
      expect(sky.material).toBe(first.material);
      expect(sky.geometry).toBe(first.geometry);
    }
  });

  it('draws behind everything, never culled or clipped away by where it stands', () => {
    ctx.loadPuzzle('recording-basic');
    const [sky] = skiesIn(gameState.activeArea.group);

    expect(sky.frustumCulled).toBe(false);
    expect(sky.renderOrder).toBeGreaterThan(1000); // after every other opaque thing
    expect(sky.geometry.boundingSphere.radius).toBeGreaterThan(1e5);
    expect(sky.material.clipping).toBe(true); // honours a door pass's clip planes
    expect(sky.material.userData.shared).toBe(true); // no area's unload frees it
  });
});

describe('Cliff edges on the floor', () => {
  /** The cells (x, z, side) a floor traces a cliff line along. */
  const edgeSides = (floor) => {
    const { array: positions } = floor.mesh.geometry.attributes.position;
    const { array: edges } = floor.mesh.geometry.attributes.aEdge;
    const { array: normals } = floor.mesh.geometry.attributes.normal;
    const sides = new Set();
    // Six corners a quad
    for (let q = 0; q < edges.length; q += 6) {
      // The line across the storey's top (its other half runs down the face)
      if (edges[q] === 1 && normals[q * 3 + 1] === 1) {
        let x = 0;
        let z = 0;
        for (let c = 0; c < 6; c += 1) {
          x += positions[(q + c) * 3] / 6;
          z += positions[(q + c) * 3 + 2] / 6;
        }
        const cellX = Math.round(x / WORLD_SCALE);
        const cellZ = Math.round(z / WORLD_SCALE);
        const dx = x / WORLD_SCALE - cellX;
        const dz = z / WORLD_SCALE - cellZ;
        let side = 'north';
        if (Math.abs(dx) > Math.abs(dz)) side = dx > 0 ? 'east' : 'west';
        else if (dz > 0) side = 'south';
        sides.add(`${cellX},${cellZ},${side}`);
      }
    }
    return sides;
  };

  it('traces every edge of a lone storey you could step off', () => {
    const floor = new Floor(5, [{ elevation: 1, x1: 1, z1: 1, x2: 2, z2: 1 }]);
    expect([...edgeSides(floor)].sort()).toEqual(
      ['1,1,north', '1,1,south', '1,1,west', '2,1,north', '2,1,south', '2,1,east'].sort()
    );
  });

  it('draws none where two storeys at one level meet', () => {
    const floor = new Floor(5, [
      { elevation: 1, x1: 1, z1: 1, x2: 1, z2: 1 },
      { elevation: 1, x1: 2, z1: 1, x2: 2, z2: 1 },
    ]);
    const sides = edgeSides(floor);
    expect(sides.has('1,1,east')).toBe(false);
    expect(sides.has('2,1,west')).toBe(false);
  });

  it("draws none at a ramp's top, or at the foot of a wall standing on the storey", () => {
    const floor = new Floor(5, [{ elevation: 1, x1: 1, z1: 1, x2: 3, z2: 1 }], {
      ramps: [{ x: 1, y: 0, z: 2, direction: 'north' }], // climbs north onto (1,1)
      walls: [{ x: 3, y: 1, z: 2 }], // stands on level 1 beside (3,1)
    });
    const sides = edgeSides(floor);
    expect(sides.has('1,1,south')).toBe(false); // the ramp arrives here
    expect(sides.has('3,1,south')).toBe(false); // a wall, not a drop
    expect(sides.has('2,1,south')).toBe(true); // a real drop between them
  });

  it('draws none along the grid edge (the perimeter wall stands there)', () => {
    const floor = new Floor(3, [{ elevation: 1, x1: 0, z1: 0, x2: 2, z2: 2 }]);
    expect(edgeSides(floor).size).toBe(0);
  });

  it('a raised storey is a slab, its top at the walk height', () => {
    const floor = new Floor(5, [{ elevation: 2, x1: 1, z1: 1, x2: 1, z2: 1 }]);
    const { array } = floor.mesh.geometry.attributes.position;
    let top = -Infinity;
    for (let i = 1; i < array.length; i += 3) top = Math.max(top, array[i]);
    // The cliff line rides a hair above the top
    expect(top).toBeCloseTo(2 * ELEVATION_HEIGHT, 1);
  });
});

describe('Creature light on the floor and walls', () => {
  const sing = (creature) => {
    creature.look.noteOn();
    creature.look.update(0.016, true, { main: 0xff0000, reflections: [] });
  };

  it('silent creatures throw no light', () => {
    ctx.loadPuzzle('creature-two-creatures-harmony'); // nobody has sung yet
    const area = gameState.activeArea;
    area.light.update(area.entities);
    expect(area.light.count).toBe(0);
  });

  it('a singing creature lights its area in its own colour, from where it floats', async () => {
    ctx.loadPuzzle('creature-singing-timing');
    const [creature] = ctx.getCreatures();
    sing(creature);
    gameState.activeArea.update(0);

    const { light } = gameState.activeArea;
    expect(light.count).toBe(1);
    const colour = light.uniforms.uLightCol.value;
    expect(colour[0]).toBeGreaterThan(colour[1] * 3); // red, as it glows red
    const at = light.uniforms.uLightPos.value;
    expect(at[0]).toBeCloseTo(creature.look.object.position.x);
    expect(at[2]).toBeCloseTo(creature.look.object.position.z);
    expect(at[1]).toBeGreaterThan(creature.position.y); // it floats
    expect(at[3]).toBeGreaterThan(WORLD_SCALE); // reaches beyond its cell
  });

  it('when more creatures sing than it can show, the brightest light the area', async () => {
    ctx.loadPuzzle('creature-singing-timing');
    for (let i = 0; i < MAX_LIGHTS + 2; i += 1) {
      ctx.addCreature({
        position: { x: (i % 5) * WORLD_SCALE, y: 0, z: (2 + Math.floor(i / 5)) * WORLD_SCALE },
      });
    }
    const creatures = ctx.getCreatures();
    creatures.forEach(sing);
    // One far brighter than the rest: the onset flare at its peak, the rest
    // settled to their sustain
    for (const c of creatures) c.look.update(1, true, null);
    const brightest = creatures[creatures.length - 1];
    brightest.look.noteOn();
    gameState.activeArea.update(0);

    const { light } = gameState.activeArea;
    expect(light.count).toBe(MAX_LIGHTS);
    const at = light.uniforms.uLightPos.value;
    const shown = Array.from({ length: MAX_LIGHTS }, (_, i) => at[i * 4]);
    expect(shown).toContain(brightest.look.object.position.x);
  });
});

describe('Lightning', () => {
  it('flickers now and then, briefly and softly, and is dark between strikes', () => {
    const seen = [];
    for (let t = 0; t < 60; t += 1 / 60) {
      tickEnvironment(1 / 60);
      seen.push(lightningLevel());
    }
    const lit = seen.filter((level) => level > 0);
    expect(lit.length).toBeGreaterThan(0); // at least one strike a minute
    expect(lit.length).toBeLessThan(seen.length * 0.2); // dark most of the time
    expect(Math.max(...seen)).toBeLessThanOrEqual(1);
    // ...and never stuck on: a strike dies away
    for (let t = 0; t < 2; t += 1 / 60) tickEnvironment(1 / 60);
    const settled = [];
    for (let t = 0; t < 0.5; t += 1 / 60) {
      tickEnvironment(1 / 60);
      settled.push(lightningLevel());
    }
    expect(settled.some((level) => level === 0)).toBe(true);
  });
});

// While a correct performance is under way at a gate, the storm builds with
// it, in the light of the harmony the gate hears (the colour a creature
// singing that chord glows), and the gate's opening strikes lightning in
// that light. One response for the whole world (shared uniforms).
describe('The storm answers a gate being solved', () => {
  const N = (pitch, length = '1/1') => ({ pitch, length });
  const E_MAJOR = [N('E4'), N('G#4'), N('B4')];
  const A_MAJOR = [N('A3'), N('C#4'), N('E4')];

  /**
   * Run the world (and its sky) for `ms`, frame by frame as the game loop
   * does — the singer's notes landing in their own frames (ctx.tick flushes
   * every pending timer at its end, which would play a whole song at once)
   */
  async function frames(ms) {
    for (let t = 0; t < ms; t += 16) {
      const area = gameState.activeArea;
      gameState.musicalClock.update(0.016);
      if (area !== PortalManager.getActiveArea()) area.update(0.016);
      PortalManager.updateAreas(0.016);
      await jest.advanceTimersByTimeAsync(16); // eslint-disable-line no-await-in-loop
      tickEnvironment(0.016, area);
    }
  }

  // What the test singer at the player's position sings (gateWanting)
  let wanted = null;

  /** A gate beside the player wanting `song` (the test singer will sing it). */
  function gateWanting(song, distance = WORLD_SCALE) {
    ctx.loadPuzzle('listening-gate-multi-note'); // no creatures: the gate hears the singer alone
    const player = ctx.getPlayerPosition();
    const gate = ctx.addGate({ position: { x: player.x, y: 0, z: player.z + distance }, song });
    wanted = song;
    return gate;
  }

  const brightness = (rgb) => Math.max(...rgb);

  beforeEach(() => calmStorm());

  it('is the calm, neutral storm while no gate is being solved', async () => {
    gateWanting([E_MAJOR]);
    await frames(500);

    const { level, colour, strike } = stormResponse();
    expect(level).toBe(0);
    expect(brightness(colour)).toBe(0);
    expect(brightness(strike)).toBe(0);
  });

  it('builds with the performance, in the light of the chord the gate hears', async () => {
    const gate = gateWanting([E_MAJOR, A_MAJOR]);
    ctx.startSinging(wanted);
    await frames(1200); // into E major

    const early = stormResponse();
    expect(gate.solveProgress).toBeGreaterThan(0);
    expect(early.level).toBeGreaterThan(0);
    const [r, g, b] = early.colour;
    expect(r).toBeGreaterThan(b * 1.5); // E major glows red
    expect(r).toBeGreaterThan(g);

    await frames(2000); // A major, further on
    const later = stormResponse();
    expect(later.level).toBeGreaterThan(early.level);
    expect(later.colour[2]).toBeGreaterThan(later.colour[0]); // A major: sapphire
  });

  it('strikes lightning when the gate opens, and the strike dies away', async () => {
    const gate = gateWanting([E_MAJOR]);
    ctx.startSinging(wanted);
    let peak = 0;
    for (let i = 0; i < 300 && !gate.isOpen; i += 1) {
      await frames(16); // eslint-disable-line no-await-in-loop
    }
    expect(gate.isOpen).toBe(true);
    for (let i = 0; i < 30; i += 1) {
      tickEnvironment(0.016, gameState.activeArea);
      peak = Math.max(peak, brightness(stormResponse().strike));
    }
    expect(peak).toBeGreaterThan(0.3);

    for (let t = 0; t < 6; t += 0.016) tickEnvironment(0.016, gameState.activeArea);
    expect(brightness(stormResponse().strike)).toBe(0);
  });

  it('goes back to the neutral storm when the music stops', async () => {
    gateWanting([E_MAJOR, A_MAJOR]);
    ctx.startSinging([E_MAJOR]); // only half the song
    await frames(1200);
    expect(brightness(stormResponse().colour)).toBeGreaterThan(0);

    await frames(12000); // the singer stopped: silence, the gate gave up, the storm settled

    const { level, colour, strike } = stormResponse();
    expect(level).toBe(0);
    expect(brightness(colour)).toBe(0);
    expect(brightness(strike)).toBe(0); // it never opened
  });

  it('a gate far from the player stirs it less than one beside them', async () => {
    gateWanting([E_MAJOR], WORLD_SCALE);
    ctx.startSinging(wanted);
    await frames(1500);
    const near = stormResponse().level;

    calmStorm();
    // Far, but still within the singer's reach
    const far = gateWanting([E_MAJOR], 12 * WORLD_SCALE);
    far.audibleRange = 60;
    ctx.startSinging(wanted);
    await frames(1500);

    expect(stormResponse().level).toBeLessThan(near * 0.8);
  });
});
