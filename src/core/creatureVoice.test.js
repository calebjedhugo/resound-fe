/**
 * A creature's voice (core/creatureVoice): resound-sound's Theremin, in a
 * voice each creature rolls once and carries across the pole and world
 * memory (Creature.toSpec). How the Theremin itself sounds is tested, and
 * null-tested in a browser, in resound-sound.
 */
import { Theremin } from 'resound-sound';
import { createCreatureVoice, rollVoice, voiceFromSpec } from 'core/creatureVoice';
import Creature from 'entities/Creature';
import gameState from 'core/GameState';

describe("A creature's voice", () => {
  it('is rolled inside the theremin ranges, warmth on its grid', () => {
    for (let i = 0; i < 50; i += 1) {
      const voice = rollVoice();
      expect(voice.vibratoRate).toBeGreaterThanOrEqual(5);
      expect(voice.vibratoRate).toBeLessThanOrEqual(6);
      expect(voice.vibratoDepth).toBeGreaterThanOrEqual(8);
      expect(voice.vibratoDepth).toBeLessThanOrEqual(14);
      expect(voice.attack).toBeGreaterThanOrEqual(0.02);
      expect(voice.attack).toBeLessThanOrEqual(0.032);
      expect(voice.glide).toBeGreaterThanOrEqual(0.007);
      expect(voice.glide).toBeLessThanOrEqual(0.011);
      expect(voice.spark).toBeGreaterThanOrEqual(0.7);
      expect(voice.spark).toBeLessThanOrEqual(1.3);
      expect(Math.round(voice.warmth * 20)).toBeCloseTo(voice.warmth * 20, 6);
    }
  });

  it('is a Theremin, in the voice a spec carried', () => {
    const given = { ...Theremin.DEFAULT_VOICE, vibratoRate: 5.1, warmth: 0.85 };
    const instrument = createCreatureVoice('a', given);
    expect(instrument).toBeInstanceOf(Theremin);
    const voice = instrument.getVoice();
    Object.keys(given).forEach((key) => expect(voice[key]).toBeCloseTo(given[key], 10));
  });

  it("rolls its own for a voice that isn't one (an old Random timbre, a part of one)", () => {
    const old = { waveform: 'square', filterCutoff: 900, envelope: {}, harmonics: [] };
    expect(voiceFromSpec(old)).toBeNull();
    expect(voiceFromSpec({ vibratoRate: 5.2 })).toBeNull();
    expect(voiceFromSpec(undefined)).toBeNull();
    const voice = createCreatureVoice('a', old).getVoice();
    expect(voice).not.toHaveProperty('waveform');
    expect(voice.vibratoRate).toBeGreaterThanOrEqual(5);
  });

  it('round-trips through a spec: the creature built from it sings in the same voice', () => {
    const song = [{ pitch: 'C4', length: '1/4' }];
    const first = new Creature({ x: 0, y: 0, z: 0 }, { song });
    const spec = JSON.parse(JSON.stringify(first.toSpec())); // as world memory keeps it
    const second = new Creature({ x: 1, y: 0, z: 1 }, spec);
    expect(second.instrument.getVoice()).toEqual(first.instrument.getVoice());
    first.dispose();
    second.dispose();
  });
});

describe('A creature sings ties and dots as written', () => {
  it('holds a tied note (in a chord, each member on its own) and times double dots', async () => {
    const creature = ctx.addCreature({
      song: [
        { pitch: 'C4', length: '1/4', dotted: 2 },
        { pitch: 'D4', length: '1/16' },
        [
          { pitch: 'E4', length: '1/4', tie: 'start' },
          { pitch: 'G4', length: '1/4' },
        ],
        [
          { pitch: 'E4', length: '1/4', tie: 'stop' },
          { pitch: 'A4', length: '1/4' },
        ],
      ],
      interval: 16,
    });
    const starts = [];
    const startNote = creature.instrument.startNote.bind(creature.instrument);
    jest.spyOn(creature.instrument, 'startNote').mockImplementation((pitch, ms, ...rest) => {
      starts.push([pitch, ms]);
      return startNote(pitch, ms, ...rest);
    });
    ctx.clearEmittedNotes();

    await ctx.advanceBeats(10); // one song (it starts within a beat; the next at 16)

    const beatMs = 60000 / gameState.musicalClock.tempo;
    // One song: E4 struck once, for both its tied beats; G4 then A4 around
    // it. C4 starts on the first frame past its beat, and the song is drawn
    // back onto the grid by as much: it sounds its double-dotted 1.75 beats
    // less that frame (heard as written, below)
    const [first, ...rest] = starts.map(([pitch, ms]) => [
      pitch,
      Math.round((ms / beatMs) * 1000) / 1000,
    ]);
    expect(first[0]).toBe('C4');
    expect(first[1]).toBeLessThanOrEqual(1.75);
    expect(first[1]).toBeGreaterThan(1.65);
    expect(rest).toEqual([
      ['D4', 0.25],
      ['E4', 2],
      ['G4', 1],
      ['A4', 1],
    ]);
    const heard = ctx.getEmittedNotes().filter((note) => note.source === creature.id);
    expect(heard.map((note) => note.pitch)).toEqual(['C4', 'D4', 'E4', 'G4', 'A4']);
    expect(heard[0]).toMatchObject({ dotted: 2, durationBeats: 1.75 });
    expect(heard[2]).toMatchObject({ tie: 'start', durationBeats: 2 });
  });
});
