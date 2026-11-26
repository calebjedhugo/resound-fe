/**
 * A gate is open while its song loops (ruled 2026-11-25, replacing the
 * latch): "the door opens at the completion of the first loop and stays
 * open so long as the loop continues." Through the game's own paths: real
 * creatures singing on the beat (Creature.update / sing), the gate's
 * hearing and judging (ListeningManager, Gate, phraseMatching), the
 * player's position for the doorway, the pole's hold.
 */
import gameState from 'core/GameState';
import PortalManager from 'core/PortalManager';
import PuzzleLoader from 'core/PuzzleLoader';
import AbsorbManager from 'core/AbsorbManager';

const C4 = { pitch: 'C4', length: '1/4' };
const D4 = { pitch: 'D4', length: '1/4' };
const E4 = { pitch: 'E4', length: '1/4' };
const G4 = { pitch: 'G4', length: '1/4' };
const REST = { length: '1/4' };
const MS_PER_BEAT = 500; // 120 bpm

/**
 * A 10x10 room: the gate at cell (5, 3); singers a couple of cells south of
 * it (heard to 10); the player further south.
 */
function enterRoom({ song, singers }) {
  PortalManager.enterWorld(
    PuzzleLoader.validate({
      id: 'loop-room',
      name: 'Loop room',
      difficulty: 1,
      gridSize: 10,
      tempo: 120,
      playerStart: { x: 5, y: 0, z: 8 },
      entities: [
        { type: 'gate', position: { x: 5, y: 0, z: 3 }, song },
        ...singers.map(({ x = 5, z = 5, song: sung, interval }) => ({
          type: 'creature',
          position: { x, y: 0, z },
          data: { song: sung, interval, audibleRange: 10, maxSpeed: 0 },
        })),
      ],
    })
  );
  return { gate: ctx.getGates()[0], singers: ctx.getCreatures() };
}

// ~60 fps, as rAF delivers it
const FRAMES = [17, 17, 16, 17];
let frameIndex = 0;
async function frame(given = null) {
  const ms = given ?? FRAMES[frameIndex % FRAMES.length];
  frameIndex += 1;
  await jest.advanceTimersByTimeAsync(ms);
  const dt = ms / 1000;
  gameState.musicalClock.update(dt);
  PortalManager.updateAreas(dt);
  PortalManager.update();
  AbsorbManager.update(dt);
}

/** Frames for `beats`; `each` is called after every frame. */
async function runBeats(beats, each = () => {}) {
  const end = Date.now() + beats * MS_PER_BEAT;
  while (Date.now() < end) {
    // eslint-disable-next-line no-await-in-loop
    await frame();
    each();
  }
}

async function untilOpen(gate, beats = 20) {
  const end = Date.now() + beats * MS_PER_BEAT;
  while (!gate.isOpen && Date.now() < end) {
    // eslint-disable-next-line no-await-in-loop
    await frame();
  }
  expect(gate.isOpen).toBe(true);
}

/** Over `beats`, did the gate ever read closed? */
async function everClosed(gate, beats) {
  let closed = false;
  await runBeats(beats, () => {
    if (!gate.isOpen) closed = true;
  });
  return closed;
}

const moveTo = (creature, x, z) => {
  creature.position.x = x;
  creature.position.z = z;
};

beforeEach(() => {
  frameIndex = 0;
  gameState.mode = 'PLAYING';
});
afterEach(() => {
  gameState.mode = 'MENU';
});

describe('A gate is open while its song loops', () => {
  const MELODY = [C4, E4, G4];
  let gate;
  let singer;

  beforeEach(() => {
    // The door's exact melody, back to back (interval = its length)
    ({
      gate,
      singers: [singer],
    } = enterRoom({
      song: MELODY,
      singers: [{ song: MELODY, interval: 3 }],
    }));
  });

  it('opens at the completion of the first loop, not before', async () => {
    const opensAt = [];
    await runBeats(8, () => {
      if (gate.isOpen && opensAt.length === 0)
        opensAt.push(gameState.musicalClock.getCurrentBeat());
    });
    expect(opensAt).toHaveLength(1);
    // The singer starts on a downbeat; the first loop ends three beats on
    expect(opensAt[0]).toBeGreaterThanOrEqual(3);
    expect(opensAt[0]).toBeLessThan(4.5);
  });

  it('stays open, every frame, for as long as the loop goes on — walked through or not', async () => {
    await untilOpen(gate);
    expect(await everClosed(gate, 12)).toBe(false);

    // In its cell, then out on the far side: nothing changes
    gameState.player.position = { ...gate.position, y: 1.8 };
    await frame();
    gameState.player.position = { x: gate.position.x, y: 1.8, z: gate.position.z - 6 };
    expect(await everClosed(gate, 12)).toBe(false);
    expect(gate.openings).toBe(1);
  });

  it('closes when the loop stops: its singer carried out of range', async () => {
    await untilOpen(gate);
    await runBeats(4);
    moveTo(singer, gate.position.x, gate.position.z + 14); // heard to 10
    await runBeats(4); // what's left of a loop, and its grace
    expect(gate.isOpen).toBe(false);
  });

  it('closes when the pole takes its singer', async () => {
    await untilOpen(gate);
    singer.hold();
    await runBeats(4);
    expect(gate.isOpen).toBe(false);
  });

  it('never closes on the player standing in it; once they are clear, it does', async () => {
    await untilOpen(gate);
    gameState.player.position = { ...gate.position, y: 1.8 };
    gameState.player.elevation = 0;
    singer.hold(); // the loop stops
    await runBeats(6);
    expect(gate.isOpen).toBe(true);

    gameState.player.position = { x: gate.position.x, y: 1.8, z: gate.position.z + 6 };
    await runBeats(0.1);
    expect(gate.isOpen).toBe(false);
  });

  it("a stall (a long frame) across the next loop's downbeat janks but does not close it", async () => {
    await untilOpen(gate); // a frame after the first loop's end
    await runBeats(2.85); // just before the next loop's end — the one after is due there
    await frame(700); // the page freezes 0.7 s across that downbeat
    expect(await everClosed(gate, 8)).toBe(false);
  });
});

describe('Loops and their rests', () => {
  it("a song with a leading rest: the loop's rest is the loop's own, it holds", async () => {
    const song = [REST, C4];
    const { gate } = enterRoom({ song, singers: [{ song, interval: 2 }] });
    await untilOpen(gate);
    expect(await everClosed(gate, 12)).toBe(false);
  });

  it('a singer resting between songs is not looping: open on each song, closed in the gap', async () => {
    const { gate } = enterRoom({ song: [C4], singers: [{ song: [C4], interval: 4 }] });
    let sawClosedAfterOpen = false;
    await runBeats(14, () => {
      if (gate.openings > 0 && !gate.isOpen) sawClosedAfterOpen = true;
    });
    expect(sawClosedAfterOpen).toBe(true);
    expect(gate.openings).toBeGreaterThanOrEqual(3); // it opened again for each song
  });
});

describe('Two singers looping a chord together', () => {
  it('stays open while both loop; one carried off breaks the loop', async () => {
    const { gate, singers } = enterRoom({
      song: [[C4, E4]],
      singers: [
        { x: 4, song: [C4], interval: 1 },
        { x: 6, song: [E4], interval: 1 },
      ],
    });
    await untilOpen(gate);
    expect(await everClosed(gate, 8)).toBe(false);

    moveTo(singers[1], gate.position.x + 14, gate.position.z);
    await runBeats(3);
    expect(gate.isOpen).toBe(false);
  });
});

describe('A wrong note breaks the loop', () => {
  it('a stranger singing beside the door closes it', async () => {
    const { gate, singers } = enterRoom({
      song: [C4],
      singers: [
        { song: [C4], interval: 1 },
        { x: 7, z: 1, song: [D4], interval: 64 }, // starts with the others
      ],
    });
    moveTo(singers[1], 999, 999); // out of earshot until wanted
    await untilOpen(gate);
    moveTo(singers[1], gate.position.x + 3, gate.position.z);
    singers[1].sing(); // a D4 now
    await runBeats(1);
    expect(gate.isOpen).toBe(false);
  });
});
