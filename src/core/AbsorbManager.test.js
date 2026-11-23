/**
 * The pole (core/AbsorbManager; ruled 2026-11-23): R absorbs the nearest
 * creature in reach into the tape, Space releases the cursor slot's
 * creature ahead. One pole action at a time; a refusal is the grey slot
 * flash. A creature taken is silent from the moment the tip connects, a
 * creature released comes alive only once the pole is back — sounding as it
 * did, on its old beat — and neither duplicates nor vanishes when its area
 * is pruned and rebuilt from its puzzle (core/CreatureRegistry).
 */
import gameState from 'core/GameState';
import AbsorbManager, { POLE_TIMES } from 'core/AbsorbManager';
import PortalManager from 'core/PortalManager';
import PuzzleLoader from 'core/PuzzleLoader';
import { TAPE_SLOT_CAP, WORLD_SCALE } from 'core/constants';
import { onSlotFlash } from 'ui/slotFlash';
import { TEST_PUZZLES } from '../__tests__/helpers/testUtils';

const C4 = { pitch: 'C4', length: '1/4' };
const SPEC = { song: [C4], interval: 4, audibleRange: 10, size: 0.9, maxSpeed: 8 };

/** Face a heading (yaw 0 = -z, "north"; -PI/2 = +x, "east"). */
const face = (yaw) => {
  gameState.camera.viewCenter = [yaw, 0];
};

/** Collect the grey slot flashes. */
let flashes;
let stopListening;
beforeEach(() => {
  gameState.mode = 'PLAYING';
  face(0);
  flashes = [];
  stopListening = onSlotFlash((kind) => flashes.push(kind));
});
afterEach(() => {
  stopListening();
  AbsorbManager.setSlowmo(1);
  gameState.mode = 'MENU';
});

/** The onsets (beats) a creature sang, from the notes heard so far. */
const onsetsOf = (creature) =>
  ctx
    .getEmittedNotes()
    .filter((note) => note.source === creature.id)
    .map((note) => note.capturedAtBeat);

/** Time enough for the pole to reach and connect, not to finish. */
const untilConnected = () => ctx.tick((POLE_TIMES.extend + 0.05) * 1000);

describe('Absorbing a creature (R)', () => {
  it('takes the creature in reach into the empty cursor slot', async () => {
    ctx.loadPuzzle('recording-basic'); // a C4 creature 3 away (reach 5)
    await ctx.tick(16);

    ctx.pressKey('r');
    await ctx.finishPole();

    expect(ctx.getInventorySlot(0)).toEqual(expect.objectContaining({ song: [C4], interval: 4 }));
    expect(ctx.getCreatures()).toHaveLength(0);
    expect(flashes).toEqual([]);
  });

  it('with a creature already in the cursor slot, makes a new slot for it at the end', async () => {
    ctx.loadPuzzle('recording-basic');
    ctx.setInventorySlot(0, { ...SPEC, song: [{ pitch: 'G4', length: '1/4' }] });
    await ctx.tick(16);

    ctx.pressKey('r');
    await ctx.finishPole();

    expect(gameState.player.inventory).toHaveLength(2);
    expect(ctx.getInventorySlot(0).song[0].pitch).toBe('G4'); // nothing overwritten
    expect(ctx.getInventorySlot(1).song[0].pitch).toBe('C4');
    expect(ctx.getActiveSlot()).toBe(1);
  });

  it('is refused (grey flash) when the strip is full and the cursor slot taken', async () => {
    ctx.loadPuzzle('recording-basic');
    for (let i = 0; i < TAPE_SLOT_CAP; i += 1) ctx.setInventorySlot(i, SPEC);
    ctx.setActiveSlot(0);
    await ctx.tick(16);

    ctx.pressKey('r');
    await ctx.finishPole();

    expect(flashes).toEqual(['silent']);
    expect(gameState.player.inventory).toHaveLength(TAPE_SLOT_CAP);
    expect(ctx.getCreatures()).toHaveLength(1);
  });

  it('is refused (grey flash) with no creature in reach', async () => {
    ctx.loadPuzzle('recording-out-of-range'); // a creature 9 away (reach 5)
    await ctx.tick(16);

    ctx.pressKey('r');
    await ctx.finishPole();

    expect(flashes).toEqual(['silent']);
    expect(ctx.getInventorySlot(0)).toBeNull();
    expect(ctx.getCreatures()).toHaveLength(1);
  });

  it('silences the creature the moment the tip connects: nothing more of its song is heard', async () => {
    ctx.loadPuzzle('recording-long-interval'); // sings C4 every 8 beats, beside the player
    await ctx.tick(16);
    const [creature] = ctx.getCreatures();

    ctx.pressKey('r');
    await untilConnected();
    ctx.clearEmittedNotes();
    expect(ctx.getCreatures()).toEqual([creature]); // still there, being drawn in
    await ctx.advanceBeats(12);

    expect(onsetsOf(creature)).toEqual([]);
    expect(ctx.getCreatures()).toHaveLength(0);
  });

  it('draws the body into the tip over the draw, the side nearest it first', async () => {
    ctx.loadPuzzle('recording-basic');
    await ctx.tick(16);
    const [creature] = ctx.getCreatures();

    ctx.pressKey('r');
    await untilConnected();
    const drawn = [];
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await ctx.tick(60);
      drawn.push(creature.look.suck);
    }

    expect(drawn[0]).toBeGreaterThan(0);
    for (let i = 1; i < drawn.length; i += 1) expect(drawn[i]).toBeGreaterThanOrEqual(drawn[i - 1]);
    expect(drawn[drawn.length - 1]).toBeLessThan(1.0001);
  });

  it('answers one press at a time: R during an absorb is ignored', async () => {
    ctx.loadPuzzle('recording-chord'); // two creatures on one spot, both in reach
    await ctx.tick(16);

    ctx.pressKey('r');
    await ctx.tick(100);
    ctx.pressKey('r'); // the pole is still out
    ctx.pressKey('space');
    await ctx.finishPole();

    expect(gameState.player.inventory.filter(Boolean)).toHaveLength(1);
    expect(ctx.getCreatures()).toHaveLength(1);
  });
});

describe('Releasing a creature (Space)', () => {
  it("lets the cursor slot's creature out 2.5 ahead, on the floor, and empties the slot", async () => {
    ctx.loadPuzzle('playback-basic'); // an empty room, the player at (15, 15)
    ctx.setInventorySlot(0, SPEC);
    await ctx.tick(16);

    ctx.pressKey('space');
    await ctx.finishPole();

    const [creature] = ctx.getCreatures();
    expect(creature.position.x).toBeCloseTo(15);
    expect(creature.position.z).toBeCloseTo(12.5);
    expect(creature.position.y).toBeCloseTo(0);
    expect(ctx.getInventorySlot(0)).toBeNull();
    expect(flashes).toEqual([]);
  });

  it('is refused (grey flash) with an empty cursor slot', async () => {
    ctx.loadPuzzle('playback-basic');
    await ctx.tick(16);

    ctx.pressKey('space');
    await ctx.finishPole();

    expect(flashes).toEqual(['silent']);
    expect(ctx.getCreatures()).toHaveLength(0);
  });

  it.each([
    ['off the grid', { x: 15, z: 1.5 }, 0],
    ['where its body would hang over a cliff edge', { x: 15, z: 22.6 }, Math.PI, 'elevation-basic'],
    ['over the edge of a raised floor entirely', { x: 15, z: 24 }, Math.PI, 'elevation-basic'],
    ['onto a ramp', { x: 21, z: 30.5 }, 0, 'elevation-basic'],
  ])('is refused (grey flash) %s', async (_, where, yaw, puzzle = 'playback-basic') => {
    ctx.loadPuzzle(puzzle);
    ctx.setPlayerPosition(where);
    face(yaw);
    ctx.setInventorySlot(0, SPEC);
    const before = ctx.getCreatures().length;
    await ctx.tick(16);

    ctx.pressKey('space');
    await ctx.finishPole();

    expect(flashes).toEqual(['silent']);
    expect(ctx.getCreatures()).toHaveLength(before);
    expect(ctx.getInventorySlot(0)).not.toBeNull();
  });

  it('is refused (grey flash) into a wall, or a gate', async () => {
    ctx.loadPuzzle('listening-gate-basic'); // a gate 3 north of the player
    ctx.setInventorySlot(0, SPEC);
    await ctx.tick(16);

    ctx.pressKey('space');
    await ctx.finishPole();
    ctx.setPlayerPosition({ x: 25.5, z: 15 }); // facing east, the perimeter wall ahead
    face(-Math.PI / 2);
    ctx.pressKey('space');
    await ctx.finishPole();

    expect(flashes).toEqual(['silent', 'silent']);
    expect(ctx.getCreatures()).toHaveLength(0);
  });

  it('is refused (grey flash) where another creature is in the way', async () => {
    ctx.loadPuzzle('playback-basic');
    ctx.addCreature({ position: { x: 15, y: 0, z: 12 } });
    ctx.setInventorySlot(0, SPEC);
    await ctx.tick(16);

    ctx.pressKey('space');
    await ctx.finishPole();

    expect(flashes).toEqual(['silent']);
    expect(ctx.getCreatures()).toHaveLength(1);
  });

  it('stays silent and still until the pole is back, then sings and a gate nearby hears it', async () => {
    ctx.loadPuzzle('listening-gate-basic'); // the gate wants C4 1/4, 3 north
    ctx.setInventorySlot(0, SPEC);
    face(-Math.PI / 2); // east: open floor
    await ctx.tick(16);
    const [gate] = ctx.getGates();

    ctx.pressKey('space');
    await ctx.tick(16);
    const [creature] = ctx.getCreatures();
    ctx.clearEmittedNotes();
    await ctx.tick(800); // the pole still out
    expect(onsetsOf(creature)).toEqual([]);
    expect(creature.held).toBe(true);

    await ctx.finishPole();
    expect(creature.held).toBe(false);
    await ctx.advanceBeats(6);

    expect(onsetsOf(creature).length).toBeGreaterThan(0);
    expect(ctx.isGateOpen(gate)).toBe(true);
  });

  it('answers one press at a time: Space during a release is ignored', async () => {
    ctx.loadPuzzle('playback-basic');
    ctx.setInventorySlot(0, SPEC);
    ctx.setInventorySlot(1, SPEC);
    await ctx.tick(16);

    ctx.pressKey('space');
    await ctx.tick(100);
    ctx.pressKey('arrowright');
    ctx.pressKey('space');
    await ctx.finishPole();

    expect(ctx.getCreatures()).toHaveLength(1);
    expect(ctx.getInventorySlot(1)).not.toBeNull();
  });
});

describe('A creature taken and let out again is the same creature', () => {
  it('sounds the same: its voice (the timbre its instrument rolled) comes with it', async () => {
    ctx.loadPuzzle('recording-basic');
    await ctx.tick(16);
    const [before] = ctx.getCreatures();
    const voice = ({ waveform, filterCutoff, envelope, harmonics }) => ({
      waveform,
      filterCutoff,
      envelope,
      harmonics,
    });
    const was = JSON.parse(JSON.stringify(voice(before.instrument)));

    ctx.pressKey('r');
    await ctx.finishPole();
    ctx.pressKey('space');
    await ctx.finishPole();

    const [after] = ctx.getCreatures();
    expect(after).not.toBe(before);
    expect(voice(after.instrument)).toEqual(was);
    expect(after.song).toEqual(before.song);
    expect(after.audibleRange).toBe(before.audibleRange);
  });

  it('sings on its old beat: its onsets keep their phase modulo its interval', async () => {
    ctx.loadPuzzle('recording-basic'); // C4 every 4 beats from beat 0
    await ctx.tick(16);
    const [before] = ctx.getCreatures();
    await ctx.advanceBeats(9);
    const phaseOf = (beats) => beats.map((beat) => ((beat % 4) + 4) % 4);
    const old = phaseOf(onsetsOf(before).slice(1));
    expect(old.length).toBeGreaterThan(0);
    old.forEach((phase) => expect(phase).toBeCloseTo(0, 1));

    await ctx.advanceBeats(0.6); // off the beat
    ctx.pressKey('r');
    await ctx.finishPole();
    await ctx.advanceBeats(1.3);
    ctx.pressKey('space');
    await ctx.finishPole();
    const [after] = ctx.getCreatures();
    await ctx.advanceBeats(10);

    const now = phaseOf(onsetsOf(after));
    expect(now.length).toBeGreaterThan(1);
    now.forEach((phase) => expect(phase).toBeCloseTo(0, 1));
  });
});

describe('No creature duplicated or lost when an area is pruned and rebuilt', () => {
  // Two rooms with no door between them: a jump (the waystone gate's
  // teleport) from one prunes the other, and a jump back rebuilds it from
  // its puzzle file
  const ROOM_A = { ...TEST_PUZZLES['recording-basic'], id: 'pole-room-a' };
  const ROOM_B = { ...TEST_PUZZLES['playback-basic'], id: 'pole-room-b' };
  const MIDDLE = { x: 5 * WORLD_SCALE, y: 0, z: 5 * WORLD_SCALE };

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
  });

  afterEach(() => {
    delete global.fetch;
  });

  const jumpTo = async (puzzleId) => {
    await PortalManager.teleportToWaystone({ puzzleId, position: MIDDLE });
    face(0);
    await ctx.tick(16);
  };

  it('a creature absorbed from a puzzle does not come back when its area is rebuilt', async () => {
    await ctx.tick(16);
    ctx.pressKey('r');
    await ctx.finishPole();

    await jumpTo('pole-room-b');
    expect(PortalManager.getArea('pole-room-a')).toBeFalsy(); // pruned
    await jumpTo('pole-room-a');

    expect(gameState.currentPuzzle.id).toBe('pole-room-a');
    expect(ctx.getCreatures()).toHaveLength(0);
    expect(ctx.getInventorySlot(0).song).toEqual([C4]);
  });

  it('a creature released into an area lives there on, where it stood, after a prune', async () => {
    await ctx.tick(16);
    ctx.pressKey('r');
    await ctx.finishPole();
    await jumpTo('pole-room-b');
    ctx.pressKey('space');
    await ctx.finishPole();
    const [released] = ctx.getCreatures();
    released.position.x += 1.5; // it moved on since

    await jumpTo('pole-room-a');
    expect(PortalManager.getArea('pole-room-b')).toBeFalsy(); // pruned
    await jumpTo('pole-room-b');

    const creatures = ctx.getCreatures();
    expect(creatures).toHaveLength(1);
    expect(creatures[0].song).toEqual([C4]);
    expect(creatures[0].position.x).toBeCloseTo(16.5);
    expect(creatures[0].position.z).toBeCloseTo(12.5);
    expect(ctx.getInventorySlot(0)).toBeNull();
  });

  it('a released creature taken again is gone from where it was released', async () => {
    await ctx.tick(16);
    ctx.pressKey('r');
    await ctx.finishPole();
    await jumpTo('pole-room-b');
    ctx.pressKey('space');
    await ctx.finishPole();
    await ctx.tick(16); // out, alive, in reach again
    ctx.pressKey('r');
    await ctx.finishPole();

    await jumpTo('pole-room-a');
    await jumpTo('pole-room-b');

    expect(ctx.getCreatures()).toHaveLength(0);
    expect(gameState.player.inventory.filter(Boolean)).toHaveLength(1);
  });

  it('a new world starts with every puzzle creature back where it began', async () => {
    await ctx.tick(16);
    ctx.pressKey('r');
    await ctx.finishPole();

    PortalManager.enterWorld(PuzzleLoader.validate(JSON.parse(JSON.stringify(ROOM_A))));

    expect(ctx.getCreatures()).toHaveLength(1);
  });
});
