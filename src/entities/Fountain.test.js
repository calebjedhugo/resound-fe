/**
 * Fountain activation: the solution song plays ALONE in the fountain's area.
 *
 * ctx.tick() ends by running every pending timer, which would finish the
 * fountain's song inside the first frame; these tests run world frames
 * directly and step the timers between them to look in mid-song.
 */
import ListeningManager from 'core/ListeningManager';
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

  it('lets a second fountain sing over the first: neither silences the other', async () => {
    const longer = ctx.addFountain({
      position: { x: 2, y: 0, z: 2 },
      song: [{ pitch: 'E4', length: '1/1' }], // 2 s
    });
    const started = [];
    [fountain, longer].forEach(({ instrument }) => {
      const startNote = instrument.startNote.bind(instrument);
      jest.spyOn(instrument, 'startNote').mockImplementation((pitch, ...rest) => {
        started.push({ pitch, volume: instrument.volumeMultiplier });
        startNote(pitch, ...rest);
      });
    });

    const first = longer.activate();
    await jest.advanceTimersByTimeAsync(250); // into its whole note
    const second = fountain.activate();
    expect(longer.instrument.volumeMultiplier).toBe(1); // not cut off

    await jest.advanceTimersByTimeAsync(3000);
    await Promise.all([first, second]);
    expect(started).toEqual([
      { pitch: 'E4', volume: 1 },
      { pitch: 'C4', volume: 1 },
    ]);
  });

  it('gives the creatures their volume back even when its song fails', async () => {
    const heard = creature.instrument.volumeMultiplier;
    // A listener that throws on the song's first note fails the playback
    ListeningManager.registerListener({
      onNoteCaptured() {
        throw new Error('listener failed');
      },
    });

    await expect(fountain.activate()).rejects.toThrow('listener failed');
    frame();
    expect(creature.instrument.volumeMultiplier).toBe(heard);
  });

  it('takes its song with it when its area goes', async () => {
    const singer = ctx.addFountain({
      position: { x: 2, y: 0, z: 2 },
      song: [
        { pitch: 'E4', length: '1/4' },
        { pitch: 'F4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ],
    });
    ctx.clearEmittedNotes();
    const song = singer.activate();

    ctx.loadPuzzle('listening-fountain-basic'); // a new world: this one goes
    await jest.advanceTimersByTimeAsync(2000);
    await song;

    expect(ctx.getEmittedNotes().map((n) => n.pitch)).toEqual(['E4']);
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
