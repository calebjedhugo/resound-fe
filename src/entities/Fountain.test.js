/**
 * Fountain activation: the solution song plays ALONE in the fountain's area.
 *
 * ctx.tick() ends by running every pending timer, which would finish the
 * fountain's song inside the first frame; these tests run world frames
 * directly and step the timers between them to look in mid-song.
 */
import PortalManager from 'core/PortalManager';

const frame = () => PortalManager.updateAreas(0.016);

describe('A fountain playing its song', () => {
  let fountain;
  let creature;

  beforeEach(() => {
    ctx.loadPuzzle('listening-fountain-basic'); // its song: one quarter (500 ms)
    [fountain] = ctx.getFountains();
    // Two units from the player: well inside its audible range
    creature = ctx.addCreature({
      position: { x: 5, y: 0, z: 7 },
      song: [{ pitch: 'G4', length: '1/4' }],
    });
    frame();
  });

  it('hushes the creatures in its area for the length of the song', async () => {
    const heard = creature.instrument.volumeMultiplier;
    expect(heard).toBeGreaterThan(0);

    const song = fountain.activate();
    frame();
    frame();
    // A creature sets its distance volume every frame; the hush holds anyway
    expect(creature.instrument.volumeMultiplier).toBe(0);

    await jest.advanceTimersByTimeAsync(1000); // the quarter and its tail
    await song;
    frame();
    expect(creature.instrument.volumeMultiplier).toBe(heard);
  });

  it('gives a silenced fountain its volume back', async () => {
    const other = ctx.addFountain({
      position: { x: 2, y: 0, z: 2 },
      song: [{ pitch: 'E4', length: '1/4' }],
    });
    expect(other.instrument.volumeMultiplier).toBe(1);

    const song = fountain.activate();
    expect(other.instrument.volumeMultiplier).toBe(0);
    await jest.advanceTimersByTimeAsync(1000);
    await song;

    expect(other.instrument.volumeMultiplier).toBe(1);
  });

  it('keeps a creature hushed until the LAST of two fountains has finished', async () => {
    const longer = ctx.addFountain({
      position: { x: 2, y: 0, z: 2 },
      song: [{ pitch: 'E4', length: '1/1' }], // 2 s
    });

    const first = fountain.activate();
    const second = longer.activate();
    await jest.advanceTimersByTimeAsync(1000);
    await first;
    frame();
    expect(creature.instrument.volumeMultiplier).toBe(0);

    await jest.advanceTimersByTimeAsync(3000);
    await second;
    frame();
    expect(creature.instrument.volumeMultiplier).toBeGreaterThan(0);
  });
});
