/**
 * A gate stays open behind the player while the creatures that opened it
 * are still in range (ruled 2026-11-25): "So long as the creatures used to
 * open the gate are still in range of the gate, the gate does not close
 * behind the player. The gate only closes behind the player if any
 * creatures are no longer in range." Through the game's own paths: the
 * creatures' schedule, the gate's hearing and judging, its close on the
 * player walking through, and the world's memory across a rebuild.
 */
import gameState from 'core/GameState';
import PortalManager from 'core/PortalManager';
import PuzzleLoader from 'core/PuzzleLoader';
import AbsorbManager from 'core/AbsorbManager';

const C4 = { pitch: 'C4', length: '1/4' };
const E4 = { pitch: 'E4', length: '1/4' };
const MS_PER_BEAT = 500; // 120 bpm

/**
 * A 10x10 room: the gate at cell (5, 3), its singer two cells south of it
 * (6 units; heard to 10), the player further south. The singer sings one
 * quarter note every 8 beats: 7 beats of silence between songs, so nothing
 * but its standing there holds the door between them.
 */
function enterRoom({ creatures = [{ x: 5, z: 5 }], song = [C4] } = {}) {
  PortalManager.enterWorld(
    PuzzleLoader.validate({
      id: 'held-room',
      name: 'Held room',
      difficulty: 1,
      gridSize: 10,
      tempo: 120,
      playerStart: { x: 5, y: 0, z: 8 },
      entities: [
        { type: 'gate', position: { x: 5, y: 0, z: 3 }, song },
        ...creatures.map(({ x, z, note = C4 }) => ({
          type: 'creature',
          position: { x, y: 0, z },
          data: { song: [note], interval: 8, audibleRange: 10, maxSpeed: 0 },
        })),
      ],
    })
  );
}

async function frame(ms = 17) {
  await jest.advanceTimersByTimeAsync(ms);
  const dt = ms / 1000;
  gameState.musicalClock.update(dt);
  PortalManager.updateAreas(dt);
  PortalManager.update();
  AbsorbManager.update(dt);
}

async function framesUntil(done, maxMs) {
  const end = Date.now() + maxMs;
  while (!done() && Date.now() < end) {
    // eslint-disable-next-line no-await-in-loop
    await frame();
  }
}

const runBeats = (beats) => framesUntil(() => false, beats * MS_PER_BEAT);

/** In the gate's cell, then out on its far (north) side. */
async function walkThrough(gate) {
  ctx.setPlayerPosition({ x: gate.position.x, z: gate.position.z });
  await frame();
  ctx.setPlayerPosition({ x: gate.position.x, z: gate.position.z - 6 });
  await frame();
}

/** Put a creature somewhere (it stands still: maxSpeed 0). */
const moveTo = (creature, x, z) => {
  creature.position.x = x;
  creature.position.z = z;
};

let gate;
let singer;

beforeEach(() => {
  gameState.mode = 'PLAYING';
});
afterEach(() => {
  gameState.mode = 'MENU';
});

describe('A gate behind the player', () => {
  beforeEach(async () => {
    enterRoom();
    [gate] = ctx.getGates();
    [singer] = ctx.getCreatures();
    await framesUntil(() => gate.isOpen, 20 * MS_PER_BEAT);
    expect(gate.isOpen).toBe(true);
  });

  it('stays open while its singer stands in range, through the silences between songs', async () => {
    await walkThrough(gate);
    await runBeats(24); // three songs and the long rests between them
    expect(gate.isOpen).toBe(true);
  });

  it('closes once its singer is out of range (and not before)', async () => {
    await walkThrough(gate);
    await runBeats(10); // it sings again meanwhile: the close still waits on its range
    expect(gate.isOpen).toBe(true);

    moveTo(singer, gate.position.x, gate.position.z + 12); // 12 away, heard to 10
    await frame();
    expect(gate.isOpen).toBe(false);
  });

  it('a singer out of range before the player walks through: open until then, closed after', async () => {
    moveTo(singer, gate.position.x, gate.position.z + 12);
    await runBeats(10);
    expect(gate.isOpen).toBe(true); // a gate latches: nobody has walked through yet

    await walkThrough(gate);
    expect(gate.isOpen).toBe(false);
  });

  it('closes when the pole takes its singer', async () => {
    await walkThrough(gate);
    singer.hold(); // the pole's tip connects: it is out of the world's hearing
    await frame();
    expect(gate.isOpen).toBe(false);
  });

  it('a gate opened by no creature closes as the player walks through', async () => {
    gate.close();
    gate.open();
    await walkThrough(gate);
    expect(gate.isOpen).toBe(false);
  });

  it('rebuilt from what the world remembered, its singer still holds it', async () => {
    await walkThrough(gate);
    expect(gate.isOpen).toBe(true);

    // What an area prune keeps and a rebuild hands back (core/WorldMemory):
    // the singer is found again where it stood
    gate.restoreState(gate.saveState());
    await runBeats(10);
    expect(gate.isOpen).toBe(true);

    moveTo(singer, gate.position.x, gate.position.z + 12);
    await frame();
    expect(gate.isOpen).toBe(false);
  });

  it("its singer's area unloaded and rebuilt: held meanwhile, found again where it stood", async () => {
    await walkThrough(gate);
    const { area } = gate;
    // The singer's area goes (a door's far side, pruned): nothing to judge
    const getArea = jest.spyOn(PortalManager, 'getArea').mockReturnValue(null);
    await runBeats(4);
    expect(gate.isOpen).toBe(true);

    // ...and is rebuilt: the singer is found where it stood, and holds it
    getArea.mockReturnValue(area);
    await runBeats(4);
    expect(gate.isOpen).toBe(true);
    getArea.mockRestore();
    moveTo(singer, gate.position.x, gate.position.z + 12);
    await frame();
    expect(gate.isOpen).toBe(false);
  });

  it('rebuilt with its singer gone from where it stood, it closes', async () => {
    await walkThrough(gate);
    const saved = gate.saveState();
    moveTo(singer, 3, 24); // not at the saved place (and out of range)
    gate.restoreState(saved);
    await frame();
    expect(gate.isOpen).toBe(false);
  });
});

describe('A gate two creatures opened together', () => {
  it('closes behind the player when either of them is out of range', async () => {
    // A two-note chord, a note each, on the same beat: one onset, two sources
    enterRoom({
      creatures: [
        { x: 4, z: 5, note: C4 },
        { x: 6, z: 5, note: E4 },
      ],
      song: [[C4, E4]],
    });
    [gate] = ctx.getGates();
    const [left, right] = ctx.getCreatures();
    await framesUntil(() => gate.isOpen, 20 * MS_PER_BEAT);
    expect(gate.isOpen).toBe(true);

    await walkThrough(gate);
    await runBeats(10);
    expect(gate.isOpen).toBe(true);
    expect(left.position.x).toBeLessThan(right.position.x);

    moveTo(right, gate.position.x + 14, gate.position.z);
    await frame();
    expect(gate.isOpen).toBe(false);
  });
});
