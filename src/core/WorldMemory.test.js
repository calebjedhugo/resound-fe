/**
 * The world forgets nothing (core/WorldMemory, ruled 2026-11-23). An area
 * beyond the doors next to the player is pruned and built again from its
 * puzzle on the next visit — and comes back as it was left: a creature
 * pushed off its spot stands where it was pushed, singing on the beat it
 * had, in its own voice; an opened gate is open; an activated fountain
 * stays activated; the waystone last stood on is still gold. A new world
 * starts afresh.
 */
import gameState from 'core/GameState';
import PortalManager from 'core/PortalManager';
import PuzzleLoader from 'core/PuzzleLoader';
import { WORLD_SCALE } from 'core/constants';

const C4 = { pitch: 'C4', length: '1/4' };
const E4 = { pitch: 'E4', length: '1/4' };
const G4 = { pitch: 'G4', length: '1/4' };

// Two rooms with no door between them: a jump (the waystone gate's
// teleport) from one prunes the other, and a jump back rebuilds it
const ROOM_A = {
  id: 'memory-room-a',
  name: 'Memory room A',
  difficulty: 1,
  gridSize: 12,
  tempo: 120,
  playerStart: { x: 1, y: 0, z: 1 },
  entities: [
    {
      type: 'creature',
      position: { x: 6, y: 0, z: 6 },
      data: { song: [C4], interval: 4, audibleRange: 10 },
    },
    { type: 'gate', id: 'gate-1', position: { x: 3, y: 0, z: 1 }, song: [E4] },
    { type: 'fountain', position: { x: 1, y: 0, z: 3 }, song: [G4] },
    { type: 'cleanser', position: { x: 10, y: 0, z: 10 } }, // a waystone, by its old name
  ],
};
const ROOM_B = {
  id: 'memory-room-b',
  name: 'Memory room B',
  difficulty: 1,
  gridSize: 6,
  tempo: 120,
  playerStart: { x: 1, y: 0, z: 1 },
  entities: [],
};
const AT = (x, z) => ({ x: x * WORLD_SCALE, y: 0, z: z * WORLD_SCALE });

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    const data = [ROOM_A, ROOM_B].find((room) => url.endsWith(`/${room.id}.json`));
    return Promise.resolve({
      ok: !!data,
      statusText: data ? 'OK' : 'Not Found',
      json: () => Promise.resolve(JSON.parse(JSON.stringify(data))),
    });
  });
  PuzzleLoader.clearCache();
  PortalManager.enterWorld(PuzzleLoader.validate(JSON.parse(JSON.stringify(ROOM_A))));
  gameState.mode = 'PLAYING';
});

afterEach(() => {
  delete global.fetch;
  gameState.mode = 'MENU';
});

const jumpTo = async (puzzleId, where = AT(1, 1)) => {
  await PortalManager.teleportToWaystone({ puzzleId, position: where });
  await ctx.tick(16);
};

/** Away to room B (room A is pruned) and back (it is built again). */
const awayAndBack = async () => {
  await jumpTo('memory-room-b');
  expect(PortalManager.getArea('memory-room-a')).toBeFalsy();
  await jumpTo('memory-room-a');
};

const creatureOf = () => ctx.getCreatures()[0];

describe('An area pruned and built again comes back as it was left', () => {
  it('a creature pushed off its spot stands where it was pushed', async () => {
    await ctx.tick(16);
    const before = creatureOf();
    before.velocity.x = before.maxSpeed; // a shove east, as a dissonance gives
    await ctx.advanceMs(1500);
    const pushedTo = { ...before.position };
    expect(pushedTo.x).toBeGreaterThan(6 * WORLD_SCALE + 0.5);

    await awayAndBack();

    const after = creatureOf();
    expect(after).not.toBe(before); // built again...
    expect(after.position.x).toBeCloseTo(pushedTo.x, 1); // ...where it was left
    expect(after.position.z).toBeCloseTo(pushedTo.z, 1);
  });

  it('a creature keeps singing on its beat across the prune (the world clock, not the rebuild)', async () => {
    // It sings C4 every 4 beats from beat 0. A creature built afresh at
    // beat 5.5 would start on beat 6: off its old beat by two
    await ctx.advanceBeats(4.5);
    await jumpTo('memory-room-b');
    await ctx.advanceBeats(1);
    await jumpTo('memory-room-a');
    const creature = creatureOf();
    ctx.clearEmittedNotes();
    await ctx.advanceBeats(10);

    const onsets = ctx
      .getEmittedNotes()
      .filter((note) => note.source === creature.id)
      .map((note) => note.capturedAtBeat);
    expect(onsets.length).toBeGreaterThan(1);
    onsets.forEach((beat) => expect(beat % 4).toBeCloseTo(0, 1));
  });

  it('a creature keeps its voice (the timbre it rolled) across the prune', async () => {
    const was = creatureOf().instrument.getVoice();
    expect(was.vibratoRate).toEqual(expect.any(Number));

    await awayAndBack();

    expect(creatureOf().instrument.getVoice()).toEqual(was);
  });

  it('an opened gate is still open (and does not count a new opening)', async () => {
    ctx.setPlayerPosition(AT(3, 2.4)); // beside the gate, never through it
    ctx.startSinging([E4]);
    await ctx.advanceBeats(2);
    ctx.stopSinging();
    const [opened] = ctx.getGates();
    expect(opened.openings).toBe(1);
    opened.open(); // held open by fiat (no loop to stop)
    const { openings } = opened;

    await awayAndBack();

    const [gate] = ctx.getGates();
    expect(gate).not.toBe(opened);
    expect(ctx.isGateOpen(gate)).toBe(true);
    expect(gate.openings).toBe(openings);
  });

  it('a gate its loop held comes back open long enough to hear the loop again', async () => {
    const [opened] = ctx.getGates();
    opened.open(Date.now() + 200); // a loop's next song due in 200 ms

    await awayAndBack();

    // Rebuilt: open for two of its song's spans (E4: a beat each), so a
    // loop still going on (its singers keep their phase) is heard whole
    const [gate] = ctx.getGates();
    expect(ctx.isGateOpen(gate)).toBe(true);
    // ...and no loop comes: closed
    await ctx.advanceBeats(3);
    expect(ctx.isGateOpen(gate)).toBe(false);
  });

  it('an activated fountain stays activated, its song not played again', async () => {
    ctx.setPlayerPosition(AT(1, 2.4));
    ctx.startSinging([G4]);
    await ctx.advanceBeats(2);
    ctx.stopSinging();
    const activated = gameState.activeArea.entityManager.getByType('fountain')[0];
    expect(ctx.isFountainActive(activated)).toBe(true);
    gameState.mode = 'PLAYING'; // (an activated fountain pauses the game)

    await awayAndBack();

    const [fountain] = gameState.activeArea.entityManager.getByType('fountain');
    expect(fountain).not.toBe(activated);
    expect(ctx.isFountainActive(fountain)).toBe(true);
    expect(fountain.instrument.playbackState.isPlaying).toBe(false);
  });

  it('the waystone last stood on is still the gold one', async () => {
    ctx.setPlayerPosition(AT(10, 10));
    await ctx.tick(16);
    const claimed = { ...gameState.activeWaystone };

    await awayAndBack();

    const [tile] = gameState.activeArea.entityManager.getByType('waystone');
    expect(gameState.activeWaystone).toEqual(claimed);
    expect(tile.isActiveWaystone()).toBe(true);
  });

  it('a new world starts afresh: nothing it remembers carries over', async () => {
    await ctx.tick(16);
    creatureOf().velocity.x = creatureOf().maxSpeed;
    await ctx.advanceMs(1500);
    await jumpTo('memory-room-b'); // pruned: remembered

    PortalManager.enterWorld(PuzzleLoader.validate(JSON.parse(JSON.stringify(ROOM_A))));

    expect(creatureOf().position).toEqual(expect.objectContaining(AT(6, 6)));
  });
});
