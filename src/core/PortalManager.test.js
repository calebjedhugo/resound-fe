/**
 * PortalManager Tests
 *
 * Crossing commits ON ENTRY: stepping into an OPEN linked gate teleports at
 * once — the player stands in the partner's cell at the same offset, heading
 * untouched, and every exit is plain walking in the destination. Recordings
 * persist across the seam (linked areas are one world).
 *
 * The neighbor puzzle is fetched over the network at runtime; here fetch is
 * mocked to serve the portal-b fixture.
 */
import gameState from 'core/GameState';
import PortalManager from 'core/PortalManager';
import CollisionDetector from 'core/CollisionDetector';
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

/** Move the player to a world position and let PortalManager react. */
async function stepTo(x, z) {
  gameState.player.position = { x, y: 1.8, z };
  gameState.player.elevation = 0;
  PortalManager.update();
  await flushCrossing();
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

  it('stepping INTO the open linked gate commits the crossing at once', async () => {
    gate.open();

    await stepTo(5 * WORLD_SCALE, 2 * WORLD_SCALE + 1); // into the cell

    expect(gameState.currentPuzzle.id).toBe('portal-b');
  });

  it('a shallow toe-in past the cell edge does NOT commit (inset commit zone)', async () => {
    gate.open();

    // Inside the cell (edge at 1.5 from center) but shy of the commit zone
    // (inset by DOORWAY_COMMIT_DEPTH): boundary jitter must not teleport
    await stepTo(5 * WORLD_SCALE, 2 * WORLD_SCALE + 1.4);

    expect(gameState.currentPuzzle.id).toBe('portal-a');
  });

  it('lands in the partner cell at the SAME offset, heading untouched', async () => {
    gate.open();
    gameState.camera.viewCenter = [0, 0]; // heading north

    await stepTo(5 * WORLD_SCALE + 0.5, 2 * WORLD_SCALE + 1); // offset (0.5, +1)

    // Standing IN the partner's cell (5, 7) at the same offset — going in
    // means you are in the new space, heading exactly as before
    expect(gameState.currentPuzzle.id).toBe('portal-b');
    expect(gameState.player.position.x).toBeCloseTo(5 * WORLD_SCALE + 0.5);
    expect(gameState.player.position.z).toBeCloseTo(7 * WORLD_SCALE + 1);
    expect(gameState.player.elevation).toBe(0);
    // Heading preserved exactly: forward = (-sin(yaw), -cos(yaw)) = (0, -1)
    const [yaw] = gameState.camera.viewCenter;
    expect(-Math.sin(yaw)).toBeCloseTo(0);
    expect(-Math.cos(yaw)).toBeCloseTo(-1);
  });

  it('backing out the way you came means you exited the DESTINATION gate', async () => {
    gate.open();

    await stepTo(5 * WORLD_SCALE, 2 * WORLD_SCALE + 1); // in: committed
    expect(gameState.currentPuzzle.id).toBe('portal-b');

    // Step back out the south face — of the PARTNER's cell (5, 7). You
    // still teleported; the way home is one more step through the door.
    await stepTo(5 * WORLD_SCALE, 7 * WORLD_SCALE + 2.5);

    expect(gameState.currentPuzzle.id).toBe('portal-b');
    expect(gameState.player.position.z).toBeCloseTo(7 * WORLD_SCALE + 2.5);
  });

  it('recordings persist across the seam', async () => {
    const take = { notes: [{ pitch: 'C4', length: '1/4' }], sourceRange: 15 };
    gameState.player.inventory[0] = take;
    gate.open();

    await stepTo(5 * WORLD_SCALE, 2 * WORLD_SCALE + 1);

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
    await stepTo(5 * WORLD_SCALE, 2 * WORLD_SCALE + 1);

    const gates = ctx.getEntityManager().getByType('gate');

    expect(gates).toHaveLength(1);
    expect(gates[0].gateId).toBe('south-door');
    expect(gates[0].link).toEqual({ puzzleId: 'portal-a', gateId: 'north-door' });
  });

  it('a partner blocked on SOME sides still commits: the wall blocks the walk, not the door', async () => {
    const walled = JSON.parse(JSON.stringify(portalB));
    walled.entities.push({ type: 'wall', position: { x: 5, y: 0, z: 8 } }); // south of south-door
    installFetchMock({ 'portal-b': walled });
    ctx.loadPuzzle('portal-a'); // re-enter so the neighbor loads walled
    [gate] = ctx.getGates();
    gate.open();

    await stepTo(5 * WORLD_SCALE, 2 * WORLD_SCALE - 1); // in through the north face

    // Standing in the partner's cell at the same offset. The wall south of
    // it is now REAL geometry that simply (visibly) blocks walking that way
    // — no arrival reroute, no view snap.
    expect(gameState.currentPuzzle.id).toBe('portal-b');
    expect(gameState.player.position.x).toBeCloseTo(5 * WORLD_SCALE);
    expect(gameState.player.position.z).toBeCloseTo(7 * WORLD_SCALE - 1);
  });

  it('a partner walled in on EVERY side refuses to commit: never teleport into a trap', async () => {
    const trap = JSON.parse(JSON.stringify(portalB));
    for (const cell of [
      { x: 5, z: 6 },
      { x: 5, z: 8 },
      { x: 4, z: 7 },
      { x: 6, z: 7 },
    ]) {
      trap.entities.push({ type: 'wall', position: { x: cell.x, y: 0, z: cell.z } });
    }
    installFetchMock({ 'portal-b': trap });
    ctx.loadPuzzle('portal-a'); // re-enter so the neighbor loads walled-in
    [gate] = ctx.getGates();
    gate.open();

    await stepTo(5 * WORLD_SCALE, 2 * WORLD_SCALE + 1);

    // Still home, still standing in the doorway cell — free to back out
    expect(gameState.currentPuzzle.id).toBe('portal-a');
    expect(gameState.player.position.z).toBeCloseTo(2 * WORLD_SCALE + 1);
  });

  it('a dangling link (missing partner gate) disables the door instead of crashing', async () => {
    const broken = JSON.parse(JSON.stringify(portalB));
    broken.entities = []; // partner gate gone
    installFetchMock({ 'portal-b': broken });
    ctx.loadPuzzle('portal-a'); // re-enter so the neighbor loads broken
    [gate] = ctx.getGates();
    gate.open();

    await stepTo(5 * WORLD_SCALE, 2 * WORLD_SCALE + 1);

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
    await stepTo(5 * WORLD_SCALE, 2 * WORLD_SCALE + 1); // entry commits
    await stepTo(5 * WORLD_SCALE, 7 * WORLD_SCALE + 2.5); // step clear of the doorway
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
    // Player just inside the gate cell, shy of the commit zone (entry would
    // teleport them): total doorway distance ~4.4 with the door open — well
    // inside recording range if the creature were local
    gate.open();
    ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 2 * WORLD_SCALE + 1.4 });

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

  it('a NEIGHBOR gate never treats the player as its occupant (coordinates are per-area)', async () => {
    // door-b sits at grid (5, 7) of portal-live-b. Put the player at the SAME
    // coordinates — but in the ACTIVE area (portal-live-a). Areas have
    // independent coordinate systems, so the neighbor gate must not read
    // "occupied" and must CLOSE when its grace lapses, never hold in
    // occupied overtime for a player who is a whole area away.
    ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 7 * WORLD_SCALE });
    partnerGate.open();
    partnerGate._openUntil = Date.now() - 1;

    await ctx.tick(32);

    expect(partnerGate.occupiedOvertime).toBe(false);
    expect(partnerGate.isOpen).toBe(false);
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
    await stepTo(5 * WORLD_SCALE, 2 * WORLD_SCALE + 1);

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
    await stepTo(5 * WORLD_SCALE, 2 * WORLD_SCALE + 1);

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

  it('stepping into an OPEN face teleports to the partner gate, same puzzle', async () => {
    doorA.open();
    gameState.camera.viewCenter = [0, 0]; // heading north

    await stepTo(5 * WORLD_SCALE, 2 * WORLD_SCALE + 1); // into door-a's cell

    expect(gameState.currentPuzzle.id).toBe('portal-self');
    // Standing IN door-b's cell (5, 8) at the same offset, still heading north
    expect(gameState.player.position.x).toBeCloseTo(5 * WORLD_SCALE);
    expect(gameState.player.position.z).toBeCloseTo(8 * WORLD_SCALE + 1);
    const [yaw] = gameState.camera.viewCenter;
    expect(-Math.cos(yaw)).toBeCloseTo(-1);
  });

  it('an in-level crossing keeps the same live area (no rebuild)', async () => {
    const areaBefore = gameState.activeArea;
    const entitiesBefore = gameState.entities;
    doorA.open();

    await stepTo(5 * WORLD_SCALE, 2 * WORLD_SCALE + 1);

    expect(gameState.activeArea).toBe(areaBefore);
    expect(gameState.entities).toBe(entitiesBefore);
  });

  it('the door WAITS for its occupant: grace lapse turns it solid-outside, not closed', async () => {
    doorA.open();
    await ctx.tick(16); // one door, two faces: door-b mirrors open
    await stepTo(5 * WORLD_SCALE, 2 * WORLD_SCALE + 1); // entry commits: standing in door-b

    // Let both graces lapse while the player stands in door-b's cell
    doorA._openUntil = Date.now() - 1;
    doorB._openUntil = Date.now() - 1;
    await ctx.tick(32);

    expect(doorB.isOpen).toBe(true); // never closes on an occupant
    expect(doorB.occupiedOvertime).toBe(true);
    expect(doorA.isOpen).toBe(false); // the unoccupied face just closes
    // Looks closed from outside (front-face culling hides it from within)
    expect(doorB.mesh.material.opacity).toBe(1);
    // Solid for other movers (creatures pass their id), open for the player
    // (movers report the player with ignoreId null)
    const atDoor = { x: 5 * WORLD_SCALE, y: 0, z: 8 * WORLD_SCALE };
    expect(CollisionDetector.checkCollision(atDoor, 0.5, 'some-creature')).toBe(true);
    expect(CollisionDetector.checkCollision(atDoor, 0.5, null)).toBe(false);

    // Stepping fully clear (BODY included — the door may not close while the
    // player's radius still overlaps its box) releases it to close for real
    await stepTo(5 * WORLD_SCALE, 8 * WORLD_SCALE + 2.5);
    await ctx.tick(32);
    expect(doorB.isOpen).toBe(false);
    expect(doorB.occupiedOvertime).toBe(false);
  });

  it('one door, two faces: opening one face mirrors the partner open', async () => {
    doorA.open();
    await ctx.tick(16);

    expect(doorB.isOpen).toBe(true);
  });

  it('the doorway occupant sees no views: they simply stand in the destination', async () => {
    const renderer = {
      clippingPlanes: [],
      renderCalls: [],
      setRenderTarget() {},
      render() {
        this.renderCalls.push(1);
      },
      getDrawingBufferSize: (size) => size.set(800, 600),
    };
    doorA.open();
    await ctx.tick(16); // mirror door-b open
    // Step in: entry commits — the player now stands in door-b's cell
    await stepTo(5 * WORLD_SCALE, 2 * WORLD_SCALE + 1);
    const camera = { position: { ...gameState.player.position } };

    PortalManager.renderPortals(renderer, camera);

    // The world on every side of the occupant (behind included) is the real
    // thing — the occupied door draws NO portal views, and no green shell
    const visible = doorB.mesh.children.filter((c) => c._isPortalSurface && c.visible);
    expect(visible).toHaveLength(0);
    expect(doorB.mesh.material.opacity).toBe(0);
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

  it('every player-visible face sees through: a corner view renders BOTH sides', () => {
    const renderer = {
      clippingPlanes: [],
      renderCalls: [],
      setRenderTarget() {},
      render() {
        this.renderCalls.push(1);
      },
      getDrawingBufferSize: (size) => size.set(800, 600),
    };
    doorA.open();
    const visibleSurfaces = () =>
      doorA.mesh.children.filter((c) => c._isPortalSurface && c.visible);

    // Straight south of the gate: exactly one face sees through
    PortalManager.renderPortals(renderer, {
      position: { x: 5 * WORLD_SCALE, y: 1.8, z: 4 * WORLD_SCALE },
    });
    expect(visibleSurfaces()).toHaveLength(1);
    expect(renderer.renderCalls).toHaveLength(1);

    // At the SOUTH-EAST corner: both visible faces see through, two passes
    renderer.renderCalls = [];
    PortalManager.renderPortals(renderer, {
      position: { x: 7 * WORLD_SCALE, y: 1.8, z: 4 * WORLD_SCALE },
    });
    expect(visibleSurfaces()).toHaveLength(2);
    expect(renderer.renderCalls).toHaveLength(2);
    // Each view sits on the FAR plane of the cell, facing back at its
    // viewer: the south approach's on the north panel (-z), the east
    // approach's on the west panel (-x)
    const offsets = visibleSurfaces().map((s) => ({ x: s.position.x, z: s.position.z }));
    expect(offsets.some((o) => o.z < 0 && o.x === 0)).toBe(true);
    expect(offsets.some((o) => o.x < 0 && o.z === 0)).toBe(true);

    // Back to straight south: the east view is kept but hidden
    renderer.renderCalls = [];
    PortalManager.renderPortals(renderer, {
      position: { x: 5 * WORLD_SCALE, y: 1.8, z: 4 * WORLD_SCALE },
    });
    expect(visibleSurfaces()).toHaveLength(1);
    expect(renderer.renderCalls).toHaveLength(1);
  });

  it('the doorway view stays live all the way to the commit point (no dead frame)', async () => {
    const renderer = {
      clippingPlanes: [],
      renderCalls: [],
      setRenderTarget() {},
      render() {
        this.renderCalls.push(1);
      },
      getDrawingBufferSize: (size) => size.set(800, 600),
    };
    doorA.open();
    // A first pass from outside builds the south-approach view
    PortalManager.renderPortals(renderer, {
      position: { x: 5 * WORLD_SCALE, y: 1.8, z: 4 * WORLD_SCALE },
    });

    // Toe INSIDE the cell, just shy of the commit point: the crossing has
    // not fired yet, and the view must still be there — the surface sits on
    // the far plane, beyond the commit point, so the camera can never
    // pierce it before the teleport
    await stepTo(5 * WORLD_SCALE, 2 * WORLD_SCALE + 1.3);
    // No commit yet: the player stands where they stepped, not at door-b
    expect(gameState.player.position.z).toBeCloseTo(2 * WORLD_SCALE + 1.3);
    renderer.renderCalls = [];
    PortalManager.renderPortals(renderer, {
      position: { ...gameState.player.position },
    });

    const visible = doorA.mesh.children.filter((c) => c._isPortalSurface && c.visible);
    expect(visible).toHaveLength(1);
    expect(renderer.renderCalls).toHaveLength(1);
    // The south approach's surface sits on the NORTH panel — 2.8 units past
    // the commit point, unreachable by an uncommitted camera
    expect(visible[0].position.z).toBeLessThan(0);
  });

  it('a working open door shows no green shell; unlinked gates keep theirs', () => {
    const renderer = {
      clippingPlanes: [],
      renderCalls: [],
      setRenderTarget() {},
      render() {},
      getDrawingBufferSize: (size) => size.set(800, 600),
    };
    const unlinked = ctx.addGate({
      position: { x: 3 * WORLD_SCALE, z: 5 * WORLD_SCALE },
      song: [{ pitch: 'C4', length: '1/4' }],
    });
    doorA.open();
    unlinked.open();

    PortalManager.renderPortals(renderer, {
      position: { x: 5 * WORLD_SCALE, y: 1.8, z: 4 * WORLD_SCALE },
    });

    // The linked door's box vanishes — only its doorway views show
    expect(doorA.mesh.material.opacity).toBe(0);
    // An ordinary gate stays green + semi-transparent
    expect(unlinked.mesh.material.opacity).toBeCloseTo(0.3);
    // Closing restores the solid closed look
    doorA.close();
    expect(doorA.mesh.material.opacity).toBe(1);
  });
});

describe('PortalManager same-area doorway sound (teleport doors are shortcuts)', () => {
  let doorA; // grid (5, 2) -> world z 6
  let doorB; // grid (5, 8) -> world z 24

  beforeEach(() => {
    installFetchMock({});
    ctx.loadPuzzle('portal-self');
    [doorA, doorB] = ctx.getGates();
  });

  afterEach(() => {
    PortalManager.reset();
    delete global.fetch;
  });

  const shortcut = (source) =>
    getDistance(gameState.player.position, doorB.position) + getDistance(source, doorA.position);

  it('effectiveDistanceToPlayer takes the shorter path through the door, either way around', () => {
    // Player just south of door-b; sound source just north of door-a:
    // direct is 24 world units, the open door is a few steps
    ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 9 * WORLD_SCALE });
    const source = { x: 5 * WORLD_SCALE, y: 0, z: 1 * WORLD_SCALE };
    doorA.open();

    expect(PortalManager.effectiveDistanceToPlayer(gameState.activeArea, source)).toBeCloseTo(
      shortcut(source)
    );

    // Swap ends: player near door-a, source near door-b — same shortcut
    ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 1 * WORLD_SCALE });
    const swapped = { x: 5 * WORLD_SCALE, y: 0, z: 9 * WORLD_SCALE };
    expect(PortalManager.effectiveDistanceToPlayer(gameState.activeArea, swapped)).toBeCloseTo(
      getDistance(gameState.player.position, doorA.position) + getDistance(swapped, doorB.position)
    );
  });

  it('a closed teleport door leaks with the distance penalty', () => {
    ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 9 * WORLD_SCALE });
    const source = { x: 5 * WORLD_SCALE, y: 0, z: 1 * WORLD_SCALE };

    expect(PortalManager.effectiveDistanceToPlayer(gameState.activeArea, source)).toBeCloseTo(
      shortcut(source) + CLOSED_DOOR_LEAK_DISTANCE
    );
  });

  it('a creature far across the map is audible through the OPEN door', async () => {
    // Just north of door-a; direct distance to the player is 24 — well
    // beyond its 15 audible range. Through the door it is 6 away.
    const creature = ctx.addCreature({
      position: { x: 5 * WORLD_SCALE, z: 1 * WORLD_SCALE },
      audibleRange: 15,
    });
    const volumeSpy = jest.spyOn(creature.instrument, 'updateVolume');
    ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 9 * WORLD_SCALE });
    doorA.open();

    await ctx.tick(32);

    const volumes = volumeSpy.mock.calls.map(([v]) => v);
    expect(Math.max(...volumes)).toBeGreaterThan(0);
  });

  it('...but is NOT recordable through the door (recording takes real proximity)', async () => {
    const creature = ctx.addCreature({
      position: { x: 5 * WORLD_SCALE, z: 1 * WORLD_SCALE },
      audibleRange: 15,
    });
    ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 9 * WORLD_SCALE });
    doorA.open();

    await ctx.tick(32);

    expect(creature.isRecordable).toBe(false);
    expect(ctx.getCreaturesInRange()).not.toContain(creature);
  });
});

describe('Walked door crossings (real player input through the movement stack)', () => {
  // Unlike the stepTo tests above (which set the position directly), these
  // drive the player with held keys: movement integrates through
  // processMovement -> resolveSlide -> CollisionDetector each frame, and the
  // crossing check runs inside ctx.tick exactly as the game loop runs it.
  // Walk speed is 4 units/second, so distance = 4 * seconds.

  afterEach(() => {
    PortalManager.reset();
    delete global.fetch;
  });

  it('walking through the open door is ONE continuous path into the next puzzle', async () => {
    installFetchMock({ 'portal-b': portalB });
    ctx.loadPuzzle('portal-a');
    await jest.runAllTimersAsync(); // let the neighbor area load
    const [gate] = ctx.getGates();
    gameState.camera.viewCenter = [0, 0]; // heading north

    // Start 3 cells south of the door (grid 5,2 -> world z 6) and walk north
    ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 2 * WORLD_SCALE + 3 });
    gate.open();
    ctx.holdKey('w');
    await ctx.tick(1500); // 6 units: through the cell and out its north face
    ctx.releaseKey('w');

    expect(gameState.currentPuzzle.id).toBe('portal-b');
    // The crossing is a pure translation, so the full 6 units of walking
    // survive it: emerge from the partner (grid 5,7 -> world z 21) exactly
    // where a 6-unit walk from (start relative to the door) lands
    expect(gameState.player.position.x).toBeCloseTo(5 * WORLD_SCALE);
    expect(gameState.player.position.z).toBeCloseTo(7 * WORLD_SCALE + 3 - 6, 1);
    expect(gameState.player.elevation).toBe(0);
    // Heading untouched: still facing north
    const [yaw] = gameState.camera.viewCenter;
    expect(-Math.sin(yaw)).toBeCloseTo(0);
    expect(-Math.cos(yaw)).toBeCloseTo(-1);
  });

  it('walking into a CLOSED linked door wall-slides along it — no crossing', async () => {
    installFetchMock({ 'portal-b': portalB });
    ctx.loadPuzzle('portal-a');
    await jest.runAllTimersAsync();

    // Just south of the closed door, pressing diagonally into it (north+west).
    // 300ms keeps the slide on the door's face (longer and the player
    // correctly rounds the box's SW corner and resumes north).
    ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 2 * WORLD_SCALE + 2.5 });
    ctx.holdKey('w');
    ctx.holdKey('a');
    await ctx.tick(300);
    ctx.releaseKey('w');
    ctx.releaseKey('a');

    expect(gameState.currentPuzzle.id).toBe('portal-a');
    // Z is blocked at the door face (cell edge 7.5 + player radius 0.4)...
    expect(gameState.player.position.z).toBeGreaterThanOrEqual(2 * WORLD_SCALE + 1.9);
    expect(gameState.player.position.z).toBeLessThan(2 * WORLD_SCALE + 2);
    // ...while X keeps the full 1.2 units: sliding along the wall, not sticking
    expect(gameState.player.position.x).toBeCloseTo(5 * WORLD_SCALE - 1.2);
  });

  it('the occupant of an OVERTIME door walks freely inside and out; it closes once clear', async () => {
    installFetchMock({});
    ctx.loadPuzzle('portal-self');
    const [doorA, doorB] = ctx.getGates();

    // Walk in through door-a's south face: ENTRY commits — the player is now
    // standing in door-b's cell (grid 5,8 -> world z 24), stride unbroken
    doorA.open();
    ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 2 * WORLD_SCALE + 2.5 });
    ctx.holdKey('w');
    await ctx.tick(625); // 2.5 units
    ctx.releaseKey('w');
    expect(gameState.player.position.z).toBeCloseTo(8 * WORLD_SCALE, 1);

    // Both graces lapse: the unoccupied face closes; the occupied face WAITS
    doorA._openUntil = Date.now() - 1;
    doorB._openUntil = Date.now() - 1;
    await ctx.tick(32);
    expect(doorA.isOpen).toBe(false);
    expect(doorB.isOpen).toBe(true);
    expect(doorB.occupiedOvertime).toBe(true);

    // The overtime door is solid from outside, but its occupant still WALKS
    // freely within the cell (movers report the player with ignoreId null,
    // which CollisionDetector lets through the whole movement stack)
    ctx.holdKey('a');
    await ctx.tick(250); // 1 unit west, still inside the cell
    ctx.releaseKey('a');
    expect(gameState.player.position.x).toBeCloseTo(5 * WORLD_SCALE - 1);
    expect(doorB.occupiedOvertime).toBe(true);

    // ...and straight back out at full stride. The door releases only once
    // their BODY is clear of the box — it can never close into them — and
    // then it shuts for real.
    ctx.holdKey('s');
    await ctx.tick(625); // 2.5 units south
    ctx.releaseKey('s');
    expect(gameState.currentPuzzle.id).toBe('portal-self');
    expect(gameState.player.position.x).toBeCloseTo(5 * WORLD_SCALE - 1);
    expect(gameState.player.position.z).toBeCloseTo(8 * WORLD_SCALE + 2.5, 1);
    await ctx.tick(32);
    expect(doorB.isOpen).toBe(false);
    expect(doorB.occupiedOvertime).toBe(false);
  });

  it('walking on through an overtime door is plain movement — no second teleport', async () => {
    installFetchMock({});
    ctx.loadPuzzle('portal-self');
    const [doorA, doorB] = ctx.getGates();

    doorA.open();
    ctx.setPlayerPosition({ x: 5 * WORLD_SCALE, z: 2 * WORLD_SCALE + 2.5 });
    ctx.holdKey('w');
    await ctx.tick(625); // entry commits: standing in door-b's cell
    ctx.releaseKey('w');
    doorA._openUntil = Date.now() - 1;
    doorB._openUntil = Date.now() - 1;
    await ctx.tick(32);
    expect(doorB.occupiedOvertime).toBe(true);

    // Keep walking north, out door-b's far side: plain walking, no teleport,
    // stride still unbroken across the whole journey
    ctx.holdKey('w');
    await ctx.tick(750); // 3 more units
    ctx.releaseKey('w');

    expect(gameState.currentPuzzle.id).toBe('portal-self');
    expect(gameState.player.position.x).toBeCloseTo(5 * WORLD_SCALE);
    expect(gameState.player.position.z).toBeCloseTo(8 * WORLD_SCALE - 3, 1);
    // Clear of the box: the occupied face releases and closes
    await ctx.tick(32);
    expect(doorB.isOpen).toBe(false);
    expect(doorB.occupiedOvertime).toBe(false);
  });
});

describe('Cross-seam sound moves creatures (harmony forces through the doorway)', () => {
  afterEach(() => {
    PortalManager.reset();
    delete global.fetch;
  });

  it('an active-area creature drifts TOWARD the open door when a neighbor sings consonantly', async () => {
    // Stretch the neighbor's D4 to a whole note so the two songs overlap
    // for many frames of force integration
    const liveB = JSON.parse(JSON.stringify(portalLiveB));
    const singer = liveB.entities.find((e) => e.type === 'creature');
    singer.data.song = [{ pitch: 'D4', length: '1/1' }];
    installFetchMock({ 'portal-live-b': liveB });
    ctx.loadPuzzle('portal-live-a');
    await jest.runAllTimersAsync(); // let the neighbor area load live

    const [gate] = ctx.getGates(); // door-a at grid (5,2) -> world z 6
    // Mover: in the ACTIVE area, 6 units south of the door, singing F#4 — a
    // major third above the neighbor's D4 (consonant -> attraction). Both
    // creatures start singing on the first beat.
    const mover = ctx.addCreature({
      position: { x: 5 * WORLD_SCALE, z: 4 * WORLD_SCALE },
      song: [{ pitch: 'F#4', length: '1/1' }],
      interval: 32,
      audibleRange: 15,
    });
    const startZ = mover.position.z;
    gate.open();

    await ctx.tick(800);

    // The pull aims at the DOORWAY, north of the mover (z decreases). The
    // singer's raw coordinates (world z 18) lie SOUTH of the mover — a force
    // naively aimed at them would drag the mover the opposite way.
    expect(mover.position.z).toBeLessThan(startZ - 0.05);
    expect(mover.position.x).toBeCloseTo(5 * WORLD_SCALE, 1);
  });
});
