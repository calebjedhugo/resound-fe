/**
 * PortalManager Tests
 *
 * Crossing an OPEN linked gate transitions the world to the linked puzzle:
 * the player arrives just outside the partner gate facing away from it, and
 * recordings persist across the seam (linked areas are one world).
 *
 * The neighbor puzzle is fetched over the network at runtime; here fetch is
 * mocked to serve the portal-b fixture.
 */
import gameState from 'core/GameState';
import PortalManager from 'core/PortalManager';
import { WORLD_SCALE, CLOSED_DOOR_LEAK_DISTANCE } from 'core/constants';
import { getDistance } from 'core/utils';
import portalB from '../__tests__/fixtures/puzzles/portal-b.json';
import portalLiveB from '../__tests__/fixtures/puzzles/portal-live-b.json';

/** Serve /puzzles/<id>.json from the fixtures the tests link to. */
function installFetchMock(puzzles) {
  global.fetch = jest.fn((url) => {
    const match = url.match(/^\/puzzles\/([a-zA-Z0-9_-]+)\.json$/);
    const data = match && puzzles[match[1]];
    if (data) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(JSON.parse(JSON.stringify(data))),
      });
    }
    return Promise.resolve({ ok: false, statusText: 'Not Found' });
  });
}

/** Flush the async crossing kicked off by a PortalManager.update() call. */
async function flushCrossing() {
  await jest.runAllTimersAsync();
}

/** Put the player in the middle of the given grid cell. */
function placePlayerAtCell(x, z) {
  gameState.player.position = { x: x * WORLD_SCALE, y: 1.8, z: z * WORLD_SCALE };
  gameState.player.elevation = 0;
}

describe('PortalManager crossing', () => {
  let gate;

  beforeEach(() => {
    // Fetch mock first: loadPuzzle enters the world, which immediately
    // starts loading linked neighbors as live areas
    installFetchMock({ 'portal-b': portalB });
    ctx.loadPuzzle('portal-a');
    [gate] = ctx.getGates();
  });

  afterEach(() => {
    PortalManager.reset();
    delete global.fetch;
  });

  it('walking into the OPEN linked gate crosses to the linked puzzle', async () => {
    gate.open();
    placePlayerAtCell(5, 2); // the gate's cell

    PortalManager.update();
    await flushCrossing();

    expect(gameState.currentPuzzle.id).toBe('portal-b');
  });

  it('arrives just outside the partner gate, facing away from it', async () => {
    gate.open();
    placePlayerAtCell(5, 2);

    PortalManager.update();
    await flushCrossing();

    // Partner south-door is at (5, 7) facing south (+z): arrive at (5, 8)
    expect(gameState.player.position.x).toBeCloseTo(5 * WORLD_SCALE);
    expect(gameState.player.position.z).toBeCloseTo(8 * WORLD_SCALE);
    expect(gameState.player.elevation).toBe(0);
    // Facing outward (south, +z): forward = (-sin(yaw), -cos(yaw)) = (0, 1)
    const [yaw] = gameState.camera.viewCenter;
    expect(-Math.sin(yaw)).toBeCloseTo(0);
    expect(-Math.cos(yaw)).toBeCloseTo(1);
  });

  it('recordings persist across the seam', async () => {
    const take = { notes: [{ pitch: 'C4', length: '1/4' }], sourceRange: 15 };
    gameState.player.inventory[0] = take;
    gate.open();
    placePlayerAtCell(5, 2);

    PortalManager.update();
    await flushCrossing();

    expect(gameState.currentPuzzle.id).toBe('portal-b');
    expect(gameState.player.inventory[0]).toBe(take);
  });

  it('a CLOSED linked gate does not cross', async () => {
    placePlayerAtCell(5, 2);

    PortalManager.update();
    await flushCrossing();

    expect(gameState.currentPuzzle.id).toBe('portal-a');
  });

  it('standing outside the gate cell does not cross, even while open', async () => {
    gate.open();
    placePlayerAtCell(5, 4); // two cells south of the door

    PortalManager.update();
    await flushCrossing();

    expect(gameState.currentPuzzle.id).toBe('portal-a');
  });

  it('the far side lists its own linked gate, ready to cross back', async () => {
    gate.open();
    placePlayerAtCell(5, 2);
    PortalManager.update();
    await flushCrossing();

    const gates = ctx.getEntityManager().getByType('gate');

    expect(gates).toHaveLength(1);
    expect(gates[0].gateId).toBe('south-door');
    expect(gates[0].link).toEqual({ puzzleId: 'portal-a', gateId: 'north-door' });
  });

  it('a dangling link (missing partner gate) disables the door instead of crashing', async () => {
    const broken = JSON.parse(JSON.stringify(portalB));
    broken.entities = []; // partner gate gone
    installFetchMock({ 'portal-b': broken });
    ctx.loadPuzzle('portal-a'); // re-enter so the neighbor loads broken
    [gate] = ctx.getGates();
    gate.open();
    placePlayerAtCell(5, 2);

    PortalManager.update();
    await flushCrossing();

    expect(gameState.currentPuzzle.id).toBe('portal-a');
  });
});

describe('PortalManager see-through rendering', () => {
  let gate;
  let renderer;
  let camera;

  /** Minimal stand-in for the game's WebGLRenderer (rendering is mocked). */
  function createFakeRenderer() {
    return {
      clippingPlanes: [],
      renderCalls: [],
      targets: [],
      setRenderTarget(target) {
        this.targets.push(target);
      },
      render(scene, cam) {
        this.renderCalls.push({ scene, cam, clipping: this.clippingPlanes });
      },
      getDrawingBufferSize: (size) => size.set(800, 600),
    };
  }

  const doorwaySurface = () => gate.mesh.children.find((child) => child._isPortalSurface);

  beforeEach(async () => {
    installFetchMock({ 'portal-b': portalB });
    ctx.loadPuzzle('portal-a');
    await jest.runAllTimersAsync(); // let the neighbor area load
    [gate] = ctx.getGates();

    renderer = createFakeRenderer();
    // Player standing one cell north of the gate, looking at its doorway
    camera = { position: { x: 5 * WORLD_SCALE, y: 1.8, z: 1 * WORLD_SCALE } };
  });

  afterEach(() => {
    PortalManager.reset();
    delete global.fetch;
  });

  it('a closed linked gate shows no doorway surface and costs no render pass', () => {
    PortalManager.renderPortals(renderer, camera);

    expect(doorwaySurface()).toBeUndefined();
    expect(renderer.renderCalls).toHaveLength(0);
  });

  it('an open linked gate shows the neighbor view through its doorway', () => {
    gate.open();

    PortalManager.renderPortals(renderer, camera);

    const surface = doorwaySurface();
    expect(surface).toBeDefined();
    expect(surface.visible).toBe(true);
    // One neighbor pass, rendered into the portal target then back to screen
    expect(renderer.renderCalls).toHaveLength(1);
    expect(renderer.targets[0]).not.toBeNull();
    expect(renderer.targets[renderer.targets.length - 1]).toBeNull();
  });

  it('the neighbor pass is clipped at the doorway plane and restores renderer state', () => {
    gate.open();

    PortalManager.renderPortals(renderer, camera);

    expect(renderer.renderCalls[0].clipping).toHaveLength(1);
    expect(renderer.clippingPlanes).toHaveLength(0); // restored after the pass
  });

  it('closing the gate hides the doorway and stops paying for the pass', () => {
    gate.open();
    PortalManager.renderPortals(renderer, camera);
    gate.close();

    PortalManager.renderPortals(renderer, camera);

    expect(doorwaySurface().visible).toBe(false);
    expect(renderer.renderCalls).toHaveLength(1); // only the open-frame pass
  });

  it('an open gate whose neighbor has not loaded yet stays an ordinary gate', () => {
    // Neighbor fetch never resolves
    global.fetch = jest.fn(() => new Promise(() => {}));
    ctx.loadPuzzle('portal-a');
    [gate] = ctx.getGates();
    gate.open();

    PortalManager.renderPortals(renderer, camera);

    expect(doorwaySurface()).toBeUndefined();
    expect(renderer.renderCalls).toHaveLength(0);
  });

  it('a dangling link (missing partner gate) renders no doorway instead of crashing', async () => {
    const broken = JSON.parse(JSON.stringify(portalB));
    broken.entities = [];
    installFetchMock({ 'portal-b': broken });
    ctx.loadPuzzle('portal-a');
    await jest.runAllTimersAsync();
    [gate] = ctx.getGates();
    gate.open();

    PortalManager.renderPortals(renderer, camera);

    expect(doorwaySurface()).toBeUndefined();
    expect(renderer.renderCalls).toHaveLength(0);
  });

  it('after crossing, the far side gate gets its own see-through doorway', async () => {
    installFetchMock({
      'portal-a': JSON.parse(JSON.stringify(gameState.currentPuzzle)),
      'portal-b': portalB,
    });
    gate.open();
    placePlayerAtCell(5, 2);
    PortalManager.update();
    await flushCrossing();
    await jest.runAllTimersAsync(); // prefetch of the way back

    [gate] = ctx.getEntityManager().getByType('gate');
    gate.open();
    // Stand south of the partner gate (grid 5,7 facing south), looking north at it
    camera = { position: { x: 5 * WORLD_SCALE, y: 1.8, z: 9 * WORLD_SCALE } };
    PortalManager.renderPortals(renderer, camera);

    expect(doorwaySurface().visible).toBe(true);
    expect(renderer.renderCalls).toHaveLength(1);
  });
});

describe('PortalManager live neighbor (stage 3)', () => {
  let gate; // door-a, in the active area
  let neighbor; // the portal-live-b Area
  let partnerGate; // door-b, in the neighbor area
  let creature; // the D4 creature living in the neighbor area

  beforeEach(async () => {
    installFetchMock({ 'portal-live-b': portalLiveB });
    ctx.loadPuzzle('portal-live-a');
    await jest.runAllTimersAsync(); // let the neighbor area load live

    [gate] = ctx.getGates();
    neighbor = PortalManager.getArea('portal-live-b');
    [partnerGate] = neighbor.entityManager.getByType('gate');
    [creature] = neighbor.entityManager.getByType('creature');
  });

  afterEach(() => {
    PortalManager.reset();
    delete global.fetch;
  });

  it('loads the linked neighbor as a live area with real entities', () => {
    expect(neighbor).not.toBeNull();
    expect(creature).toBeDefined();
    expect(partnerGate.gateId).toBe('door-b');
  });

  it('neighbor creatures sing while the player is in the other area', async () => {
    await ctx.advanceBeats(3);

    const sang = ctx.getEmittedNotes().some((n) => n.source === creature.id);
    expect(sang).toBe(true);
  });

  it('neighbor entities never enter the active area entity list', () => {
    expect(gameState.entities).not.toContain(creature);
    expect(gameState.entities).not.toContain(partnerGate);
    expect(neighbor.entities).toContain(creature);
  });

  it('hears a neighbor through the doorway: player->gate + gate->source, leak while closed', () => {
    ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 4 * WORLD_SCALE });

    const walk =
      getDistance(gameState.player.position, gate.position) +
      getDistance(creature.position, partnerGate.position);

    expect(PortalManager.effectiveDistanceToPlayer(neighbor, creature.position)).toBeCloseTo(
      walk + CLOSED_DOOR_LEAK_DISTANCE
    );

    gate.open();
    expect(PortalManager.effectiveDistanceToPlayer(neighbor, creature.position)).toBeCloseTo(walk);
  });

  it('a neighbor creature is audible but NOT recordable (recording is per-area)', async () => {
    // Player inside the gate cell: total doorway distance ~4.8 with the door
    // open — well inside recording range if the creature were local
    gate.open();
    ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 2 * WORLD_SCALE });

    await ctx.tick(50);

    const total =
      getDistance(gameState.player.position, gate.position) +
      getDistance(creature.position, partnerGate.position);
    expect(total).toBeLessThan(creature.recordingRange);
    expect(ctx.getCreaturesInRange()).not.toContain(creature);
  });

  it('one door, two faces: opening one face mirrors the other open, then both close', async () => {
    gate.open();
    await ctx.tick(16);

    expect(partnerGate.isOpen).toBe(true);

    // The mirrored hold lapses with the source face's grace; both close
    await ctx.advanceBeats(12);
    expect(gate.isOpen).toBe(false);
    expect(partnerGate.isOpen).toBe(false);
  });

  it('playing the shared song on one side of the CLOSED door opens both faces (leak)', async () => {
    // Let the neighbor creature's first song pass so the seam is quiet
    await ctx.advanceBeats(4);
    ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 3 * WORLD_SCALE });

    ctx.startPlayerPlayback({ data: [{ pitch: 'C4', length: '1/4' }] });
    await ctx.advanceBeats(4);

    expect(gate.isOpen).toBe(true);
    expect(partnerGate.isOpen).toBe(true);
  });

  it('cross-seam sources reach creatures as forces aimed at the doorway', () => {
    // Start the neighbor creature's song directly: play() runs its
    // synchronous prefix, so it is observably mid-song right after the call
    // (ctx.tick can't catch this — it flushes each song to completion)
    creature.sing();
    expect(creature.instrument.playbackState.isPlaying).toBe(true);

    const sources = PortalManager.seamSourcesFor(gameState.activeArea);
    const viaDoor = sources.find((s) => s.note.pitch === 'D4');
    expect(viaDoor).toBeDefined();
    expect(viaDoor.doorPosition).toBe(gate.position);
    expect(viaDoor.extraDistance).toBeCloseTo(
      getDistance(creature.position, partnerGate.position) + CLOSED_DOOR_LEAK_DISTANCE
    );
  });

  it('one clock: tempo blends toward a mismatched neighbor near its door', async () => {
    const clock = ctx.getMusicalClock();
    const blendAt = (playerPos) => {
      const d = getDistance(playerPos, gate.position);
      const influence = 0.5 * Math.max(0, 1 - d / gate.audibleRange);
      return 120 + (60 - 120) * influence;
    };

    // Far from the door (outside the gate's range): pure active-area tempo
    ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 9 * WORLD_SCALE });
    await ctx.tick(16);
    expect(clock.tempo).toBeCloseTo(120);

    // Nearing the door: tempo eases toward the neighbor's 60 BPM
    ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 4 * WORLD_SCALE });
    await ctx.tick(16);
    const nearTempo = clock.tempo;
    expect(nearTempo).toBeCloseTo(blendAt(gameState.player.position), 1);
    expect(nearTempo).toBeLessThan(120);
    expect(nearTempo).toBeGreaterThan(60);

    // At the doorway itself: closer still to the neighbor's tempo
    ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 2 * WORLD_SCALE });
    await ctx.tick(16);
    expect(clock.tempo).toBeLessThan(nearTempo);
  });

  it('crossing swaps to the SAME live neighbor: state and clock persist', async () => {
    await ctx.advanceBeats(3);
    const beatBeforeCross = ctx.getCurrentBeat();
    creature.testMarker = 'lived-before-crossing';

    gate.open();
    placePlayerAtCell(5, 2);
    PortalManager.update();
    await flushCrossing();

    expect(gameState.currentPuzzle.id).toBe('portal-live-b');
    // Same creature INSTANCE — the neighbor was not rebuilt on crossing
    const [creatureAfter] = ctx.getCreatures();
    expect(creatureAfter).toBe(creature);
    expect(creatureAfter.testMarker).toBe('lived-before-crossing');
    // One world, one clock: the beat kept running across the seam
    expect(ctx.getCurrentBeat()).toBeGreaterThanOrEqual(beatBeforeCross);
  });

  it('after crossing, the old area stays live as the new neighbor', async () => {
    gate.open();
    placePlayerAtCell(5, 2);
    PortalManager.update();
    await flushCrossing();

    const oldArea = PortalManager.getArea('portal-live-a');
    expect(oldArea).not.toBeNull();
    expect(oldArea).not.toBe(gameState.activeArea);
    expect(oldArea.entityManager.getByType('gate')).toHaveLength(1);
  });
});

describe('PortalManager same-puzzle door (in-level teleporter)', () => {
  let doorA;
  let doorB;

  beforeEach(() => {
    // Both faces live in the active area — there is no neighbor to fetch
    installFetchMock({});
    ctx.loadPuzzle('portal-self');
    [doorA, doorB] = ctx.getGates();
  });

  afterEach(() => {
    PortalManager.reset();
    delete global.fetch;
  });

  it('walking into an OPEN face teleports to the partner gate, same puzzle', async () => {
    doorA.open();
    placePlayerAtCell(5, 2); // door-a's cell

    PortalManager.update();
    await flushCrossing();

    expect(gameState.currentPuzzle.id).toBe('portal-self');
    // door-b at (5, 8) facing south (+z): arrive at (5, 9), facing south
    expect(gameState.player.position.x).toBeCloseTo(5 * WORLD_SCALE);
    expect(gameState.player.position.z).toBeCloseTo(9 * WORLD_SCALE);
    const [yaw] = gameState.camera.viewCenter;
    expect(-Math.cos(yaw)).toBeCloseTo(1);
  });

  it('an in-level crossing keeps the same live area (no rebuild)', async () => {
    const areaBefore = gameState.activeArea;
    const entitiesBefore = gameState.entities;
    doorA.open();
    placePlayerAtCell(5, 2);

    PortalManager.update();
    await flushCrossing();

    expect(gameState.activeArea).toBe(areaBefore);
    expect(gameState.entities).toBe(entitiesBefore);
  });

  it('one door, two faces: opening one face mirrors the partner open', async () => {
    doorA.open();
    await ctx.tick(16);

    expect(doorB.isOpen).toBe(true);
  });

  it('the doorway view renders the MAIN scene (the active area lives there)', () => {
    const renderer = {
      clippingPlanes: [],
      renderCalls: [],
      setRenderTarget() {},
      render(scene, cam) {
        this.renderCalls.push({ scene, cam });
      },
      getDrawingBufferSize: (size) => size.set(800, 600),
    };
    doorA.open();
    // Player one cell north of door-a, looking at its doorway face
    const camera = { position: { x: 5 * WORLD_SCALE, y: 1.8, z: 1 * WORLD_SCALE } };

    PortalManager.renderPortals(renderer, camera);

    expect(renderer.renderCalls).toHaveLength(1);
    // The active area's content group lives in the main scene — the
    // self-door view must render THAT scene, not the area's (empty) own scene
    const rendered = renderer.renderCalls[0].scene;
    expect(rendered).not.toBe(gameState.activeArea.scene);
    expect(rendered.children).toContain(gameState.activeArea.group);
  });
});
