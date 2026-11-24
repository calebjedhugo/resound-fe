/**
 * How a creature sings (entities/CreatureVoice): a theremin with electric
 * crackle. Read off what each note schedules on the (mocked) Web Audio
 * nodes: the oscillator's pitch, the envelope's loudness, the vibrato's
 * depth and the crackle gate. The sound itself is checked in a browser
 * (OfflineAudioContext renders; DESIGN.md "Creature voice").
 */
import { audioContextManager, getFrequency } from 'resound-sound';
import CreatureVoice, { DEFAULT_VOICE, crackleSpikes, rollVoice } from 'entities/CreatureVoice';

const context = audioContextManager.getContext();

/** A voice, and every node it builds, in the order built. */
function voiceWatched(options = {}) {
  const built = { oscillators: [], gains: [], sources: [] };
  const watch = (method, list) => {
    const create = context[method].bind(context);
    jest.spyOn(context, method).mockImplementation((...args) => {
      const node = create(...args);
      built[list].push(node);
      return node;
    });
  };
  watch('createOscillator', 'oscillators');
  watch('createGain', 'gains');
  watch('createBufferSource', 'sources');
  const voice = new CreatureVoice('test', { voice: DEFAULT_VOICE, ...options });
  return { voice, built };
}

/** A line's nodes, from what its voice built: [oscillator, lfo] per line. */
const lineNodes = (built, line = 0) => ({
  pitch: built.oscillators[2 * line].frequency,
  lfo: built.oscillators[2 * line + 1].frequency,
});

/** The calls a mocked AudioParam method got, as [value, time, ...]. */
const calls = (fn) => fn.mock.calls;

describe('A creature voice', () => {
  afterEach(() => jest.restoreAllMocks());

  it('rolls each voice inside the theremin ranges, and keeps a voice it is given', () => {
    for (let i = 0; i < 50; i += 1) {
      const voice = rollVoice();
      expect(voice.vibratoRate).toBeGreaterThanOrEqual(5);
      expect(voice.vibratoRate).toBeLessThanOrEqual(6);
      expect(voice.vibratoDepth).toBeGreaterThanOrEqual(8);
      expect(voice.vibratoDepth).toBeLessThanOrEqual(14);
      expect(voice.attack).toBeGreaterThanOrEqual(0.02);
      expect(voice.attack).toBeLessThanOrEqual(0.032);
      expect(Math.round(voice.warmth * 20)).toBeCloseTo(voice.warmth * 20, 6); // on its grid
    }
    const given = { ...DEFAULT_VOICE, vibratoRate: 5.1 };
    expect(new CreatureVoice('a', { voice: given }).getVoice()).toEqual(given);
  });

  it("ignores a voice that isn't one of its own (an old Random timbre): it keeps its roll", () => {
    const old = { waveform: 'square', filterCutoff: 900, envelope: {}, harmonics: [] };
    const voice = new CreatureVoice('a', { voice: old });
    expect(voice.getVoice().vibratoRate).toEqual(expect.any(Number));
    voice.setVoice(old);
    expect(voice.getVoice()).not.toHaveProperty('waveform');
  });

  it('starts a note on its onset, softly, from silence', () => {
    const { voice, built } = voiceWatched();
    const t0 = context.currentTime + 1;

    voice.startNote('A4', 500, undefined, t0);

    const [, , envelope] = built.gains; // volume, then the line's depth, envelope, gate
    expect(calls(envelope.gain.setValueAtTime)[0]).toEqual([0, t0]);
    const [peak, peakAt] = calls(envelope.gain.linearRampToValueAtTime)[0];
    expect(peak).toBeGreaterThan(0);
    expect(peakAt - t0).toBeCloseTo(DEFAULT_VOICE.attack, 5);
    // The release ends 40 ms after the notated end
    const ramps = calls(envelope.gain.linearRampToValueAtTime);
    expect(ramps[ramps.length - 1][0]).toBe(0);
    expect(ramps[ramps.length - 1][1]).toBeCloseTo(t0 + 0.54, 5);
  });

  it('lands each note on its pitch quickly: a small scoop from silence, a glide from the note before', () => {
    const { voice, built } = voiceWatched();
    const t0 = context.currentTime + 1;
    const a4 = getFrequency('A4');
    const c5 = getFrequency('C5');

    voice.startNote('A4', 500, undefined, t0);
    voice.startNote('C5', 500, undefined, t0 + 0.5);

    expect(built.oscillators).toHaveLength(2); // one line: its oscillator and vibrato
    const { pitch } = lineNodes(built);
    const [scoopFrom, scoopAt] = calls(pitch.setValueAtTime)[0];
    expect(scoopAt).toBe(t0);
    expect(1200 * Math.log2(a4 / scoopFrom)).toBeCloseTo(20, 5); // 20 cents below
    // The glide to C5 starts on its onset and locks onto the pitch within 80 ms
    expect(calls(pitch.setTargetAtTime)[1]).toEqual([c5, t0 + 0.5, DEFAULT_VOICE.glide]);
    const [locked, lockedAt] = calls(pitch.setValueAtTime).slice(-1)[0];
    expect(locked).toBe(c5);
    expect(lockedAt - (t0 + 0.5)).toBeLessThan(0.08);
  });

  it('re-articulates a repeated pitch with a deeper dip than a moving one', () => {
    const { voice, built } = voiceWatched();
    const t0 = context.currentTime + 1;
    voice.startNote('A4', 500, undefined, t0);
    voice.startNote('A4', 500, undefined, t0 + 0.5);
    voice.startNote('C5', 500, undefined, t0 + 1);
    const envelope = built.gains[2].gain;
    const dipTo = (onset) =>
      calls(envelope.linearRampToValueAtTime).find(
        ([, at]) => Math.abs(at - onset - 0.008) < 1e-9
      )[0];
    expect(dipTo(t0 + 0.5)).toBeLessThan(dipTo(t0 + 1) / 2);
  });

  it('develops its vibrato after the onset, at about 5-6 Hz', () => {
    const { voice, built } = voiceWatched();
    const t0 = context.currentTime + 1;
    voice.startNote('A4', 1000, undefined, t0);

    const depth = built.gains[1].gain;
    expect(calls(depth.setValueAtTime)[0]).toEqual([0, t0]); // none at the onset
    const [cents, fullAt] = calls(depth.linearRampToValueAtTime).slice(-1)[0];
    expect(cents).toBeGreaterThan(DEFAULT_VOICE.vibratoDepth * 0.8);
    expect(cents).toBeLessThan(DEFAULT_VOICE.vibratoDepth * 1.2);
    expect(fullAt - t0).toBeCloseTo(0.51, 5); // 160 ms still, then a 350 ms swell
    const [rate] = calls(lineNodes(built).lfo.setValueAtTime)[0];
    expect(rate).toBeGreaterThan(5);
    expect(rate).toBeLessThan(6);
  });

  it('gives each member of a chord a line of its own', () => {
    const { voice, built } = voiceWatched();
    const t0 = context.currentTime + 1;
    ['C4', 'E4', 'G4'].forEach((pitch) => voice.startNote(pitch, 500, undefined, t0));
    expect(built.oscillators).toHaveLength(6);
    expect(built.sources).toHaveLength(3); // a crackle noise each
  });

  it('keeps a line across a short rest, and starts a new one after a long one', () => {
    const { voice, built } = voiceWatched();
    const t0 = context.currentTime + 1;
    voice.startNote('C4', 250, undefined, t0);
    voice.startNote('D4', 250, undefined, t0 + 1); // a 750 ms rest
    expect(built.oscillators).toHaveLength(2);
    voice.startNote('E4', 250, undefined, t0 + 4); // a 2.75 s rest
    expect(built.oscillators).toHaveLength(4);
  });

  it('builds a song ahead: its notes then build nothing', () => {
    const { voice, built } = voiceWatched();
    const song = [
      { pitch: 'C4', length: '1/4' },
      [
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ],
    ];
    voice.warm();
    expect(voice.isWarm()).toBe(true);
    voice.prepare(song, 120);
    expect(voice.isPrepared(song, 120)).toBe(true);
    const before = built.oscillators.length + built.gains.length + built.sources.length;

    const t0 = context.currentTime + 1;
    voice.startNote('C4', 500, undefined, t0);
    voice.startNote('E4', 500, undefined, t0 + 0.5);
    voice.startNote('G4', 500, undefined, t0 + 0.5);

    expect(built.oscillators.length + built.gains.length + built.sources.length).toBe(before);
  });

  it('follows its volume (distance) on one gain, and fades out on a stop', () => {
    const { voice, built } = voiceWatched();
    voice.startNote('A4', 500);
    const [volume] = built.gains;
    voice.updateVolume(0.25);
    expect(calls(volume.gain.setTargetAtTime).slice(-1)[0][0]).toBe(0.25);

    voice.stop();
    expect(calls(volume.gain.linearRampToValueAtTime).slice(-1)[0][0]).toBe(0);
  });
});

describe('Creature crackle', () => {
  /** A seeded random, so a test sees the same crackle every run. */
  const seeded = (seed) => {
    let s = seed;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  };

  it('cracks on every attack, early, then crackles sparsely while the note holds', () => {
    let held = 0;
    let seconds = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const spikes = crackleSpikes(0, 2, 1, seeded(seed));
      expect(spikes[0].t).toBeLessThan(0.013);
      spikes.forEach((spike, i) => {
        if (i > 0) expect(spike.t).toBeGreaterThan(spikes[i - 1].t + spikes[i - 1].len);
        expect(spike.amp).toBeGreaterThan(0);
      });
      held += spikes.filter((spike) => spike.t > 0.2).length;
      seconds += 1.8;
    }
    const perSecond = held / seconds;
    expect(perSecond).toBeGreaterThan(2);
    expect(perSecond).toBeLessThan(5.5);
  });
});
