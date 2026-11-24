import { Instrument, audioContextManager, getFrequency } from 'resound-sound';

/**
 * CreatureVoice — how a creature sings: a high-quality THEREMIN with
 * electricity crackle (the designer, 2026-11-24). Replaces resound-sound's
 * Random (a rolled oscillator type + lowpass + ADSR per note).
 *
 * The voice is played on LINES: one continuous oscillator per line, kept
 * running across a song's notes and the rests between them, so notes join
 * the way a theremin's do, with no clicks:
 *  - a near-sine wavetable (one PeriodicWave: the fundamental, a few warm
 *    low harmonics at -19 dB and below, a faint buzz of upper partials at
 *    -50 dB and below), shared by every creature with the same warmth;
 *  - legato PORTAMENTO: a note that follows one still sounding on its line
 *    glides there exponentially (time constant `glide`, ~9 ms: within a few
 *    cents by ~40 ms) and re-articulates with a short dip in loudness (a
 *    deep one on a repeated pitch, so repeated notes stay distinct); a note
 *    after silence starts with a small scoop from below;
 *  - VIBRATO that develops after the onset: none for 160 ms, then a 350 ms
 *    swell to its depth (~8-14 cents) at ~5-6 Hz, jittered a little per note;
 *  - a soft, defined attack (~20-32 ms), a slight settle to sustain, and a
 *    release that starts just before the notated end and ends 40 ms after.
 * CRACKLE rides each line: a looping shared noise buffer, gated into sparse
 * bright bursts (a few ms, band-passed 2.5-7.5 kHz, now and then a falling
 * "zap"), a crack on each attack and a few more around it, then ~3.5 a
 * second while the note holds.
 *
 * Everything onset-dependent is AudioParam automation on a line's nodes, so
 * a note builds no audio node: only a line does (9 nodes, once per song line
 * — prepare() builds them ahead, core/AudioPrewarm). A chord takes a line
 * per member (each next note goes to the free line nearest in pitch). A
 * line that has been silent LINE_KEEP_S stops; the next note starts a new one.
 *
 * Every creature rolls its own VOICE once (warmth, vibrato rate and depth,
 * attack, glide, spark: the crackle's rate) — getVoice()/setVoice() carry it
 * across the pole (Creature.toSpec). Every line plays through one volume
 * gain per instance (updateVolume: the distance falloff) into resound-sound's
 * master output (mute).
 *
 * Onsets: a note starts when startNote is called (the play loop's timers,
 * as before), or at `when` if given (offline renders, tests).
 */

// ── Timbre ────────────────────────────────────────────────────────────────

// Sine amplitude of harmonics 1-7 (index = harmonic) at warmth 1: a little
// warm 2nd and 3rd, the rest falling away fast
const PARTIALS = [0, 1, 0.11, 0.06, 0.024, 0.014, 0.006, 0.004];
// The faint buzz: harmonics 8-16, each BUZZ_LEVEL * 8/k at warmth 1
const BUZZ_FROM = 8;
const BUZZ_TO = 16;
const BUZZ_LEVEL = 0.0028;
// Warmth is rolled on this grid, so creatures share wavetables (~0.6 MB and
// ~1 ms each in Chrome at 44.1-48 kHz)
const WARMTH_STEP = 0.05;

// ── Loudness and envelope ─────────────────────────────────────────────────

// The envelope's peak (the wave itself peaks at ~1.1): matched to the RMS
// of the old Random voice's typical roll (see DESIGN.md "Creature voice")
const VOICE_LEVEL = 0.62;
const SUSTAIN = 0.82; // of the peak
const DECAY_S = 0.16; // peak -> sustain
const RELEASE_LEAD_S = 0.025; // the release starts this long before the end
const RELEASE_TAIL_S = 0.04; // ...and ends this long after it
// A legato note's dip: to this fraction of the peak (or lower, if the line
// is already lower), DIP_S after its onset, before the attack
const DIP_MOVE = 0.45;
const DIP_SAME = 0.12; // a repeated pitch: a near re-attack
const DIP_S = 0.008;

// ── Pitch ─────────────────────────────────────────────────────────────────

// A glide is locked onto the exact pitch after this many time constants
// (e^-7: a 1200-cent leap is left ~1 cent off when it locks)
const SETTLE_TAUS = 7;
const SCOOP_CENTS = 20; // a note after silence starts this far below...
const SCOOP_TAU_S = 0.012; // ...and rises with this time constant

const VIBRATO_DELAY_S = 0.16;
const VIBRATO_RISE_S = 0.35;
const VIBRATO_FADE_S = 0.03; // a legato note's old vibrato fades this fast
const VIBRATO_RATE_JITTER = 0.04; // ± per note
const VIBRATO_DEPTH_JITTER = 0.15; // ± per note

// ── Crackle ───────────────────────────────────────────────────────────────

const CRACKLE_LEVEL = 0.5; // a full spike's gate gain (noise is ±1)
const CRACKLE_RATE = 3.5; // spikes a second while a note holds (spark 1)
const CRACKLE_ATTACK_RATE = 22; // ...and in its first CRACKLE_ATTACK_S
const CRACKLE_ATTACK_S = 0.08;
const CRACKLE_RISE_S = 0.0006;
const CRACKLE_Q = 1.1;
const CRACKLE_MIN_HZ = 2500;
const CRACKLE_MAX_HZ = 7500;
const ZAP_CHANCE = 0.1; // a spike that is a longer, falling zap
const NOISE_SECONDS = 2;

// ── Lines ─────────────────────────────────────────────────────────────────

// A line silent this long stops (its oscillators cost a little while they
// run); the song's next note after a longer rest starts a new one
const LINE_KEEP_S = 1.5;
// A line counts as free for a note starting this much before its current
// note's notated end (the play loop's timers fire a little early or late)
const EARLY_SLACK_S = 0.03;
const MAX_LINES = 6;

// A note that finds the volume gain idle resets it to the current volume
// (resound-sound's Random did the same); the slack covers timers firing a
// little ahead of the audio clock
const VOLUME_QUIET_SLACK_S = 0.02;
const RETIRED_VOLUME_MARGIN_MS = 100;

/** The voice an editor audition uses: the middle of every rolled range. */
export const DEFAULT_VOICE = Object.freeze({
  warmth: 1,
  vibratoRate: 5.5,
  vibratoDepth: 11,
  attack: 0.026,
  glide: 0.009,
  spark: 1,
});

const VOICE_RANGES = {
  warmth: [0.7, 1.3],
  vibratoRate: [5, 6],
  vibratoDepth: [8, 14],
  attack: [0.02, 0.032],
  glide: [0.007, 0.011],
  spark: [0.7, 1.3],
};

// What a given voice may hold: the rolled ranges, except that spark may be
// anything from 0 (no crackle) to twice the most rolled
const VOICE_LIMITS = { ...VOICE_RANGES, spark: [0, 2.6] };

const between = (random, [low, high]) => low + random() * (high - low);
const snapWarmth = (warmth) => Math.round(warmth / WARMTH_STEP) * WARMTH_STEP;
const clamp = (value, [low, high]) => Math.min(high, Math.max(low, value));

/** A new creature's voice, rolled once. */
export function rollVoice(random = Math.random) {
  const voice = {};
  Object.keys(VOICE_RANGES).forEach((key) => {
    voice[key] = between(random, VOICE_RANGES[key]);
  });
  voice.warmth = snapWarmth(voice.warmth);
  return voice;
}

/**
 * A voice as this module plays it, from what a spec carried: null for
 * anything else (resound-sound Random's old {waveform, filterCutoff, ...}
 * included: that creature keeps the voice it rolled).
 */
function readVoice(voice) {
  if (!voice || typeof voice !== 'object') return null;
  const keys = Object.keys(VOICE_RANGES);
  if (!keys.every((key) => Number.isFinite(voice[key]))) return null;
  const read = {};
  keys.forEach((key) => {
    read[key] = clamp(voice[key], VOICE_LIMITS[key]);
  });
  read.warmth = snapWarmth(read.warmth);
  return read;
}

// ── Shared audio (per context) ────────────────────────────────────────────

const wavesByContext = new WeakMap(); // context -> Map(warmth key -> PeriodicWave)
const noiseByContext = new WeakMap(); // context -> AudioBuffer

const warmthKey = (warmth) => warmth.toFixed(2);

function wavesOf(context) {
  if (!wavesByContext.has(context)) wavesByContext.set(context, new Map());
  return wavesByContext.get(context);
}

/** The theremin wavetable at a warmth (built once per context). */
function waveFor(context, warmth) {
  const waves = wavesOf(context);
  const key = warmthKey(warmth);
  if (!waves.has(key)) {
    const real = new Float32Array(BUZZ_TO + 1);
    const imag = new Float32Array(BUZZ_TO + 1);
    // The fundamental is 1 at any warmth; the overtones scale with it
    for (let k = 1; k < PARTIALS.length; k += 1) imag[k] = PARTIALS[k] * (k === 1 ? 1 : warmth);
    for (let k = BUZZ_FROM; k <= BUZZ_TO; k += 1) imag[k] = ((BUZZ_LEVEL * BUZZ_FROM) / k) * warmth;
    waves.set(key, context.createPeriodicWave(real, imag, { disableNormalization: true }));
  }
  return waves.get(key);
}

/** The crackle's white noise (one buffer per context, every line reads it). */
function noiseFor(context) {
  if (!noiseByContext.has(context)) {
    const length = Math.round(NOISE_SECONDS * context.sampleRate);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    noiseByContext.set(context, buffer);
  }
  return noiseByContext.get(context);
}

/**
 * Forget a context's shared wavetables and noise (it is closing; tests
 * starting from nothing built). Instances keep what they hold.
 */
export function forgetSharedAudio(context) {
  wavesByContext.delete(context);
  noiseByContext.delete(context);
}

/**
 * Hold an AudioParam at its value at `time`, dropping what was scheduled
 * after it (cancelAndHoldAtTime, or its approximation where missing).
 */
function hold(param, time) {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(time);
  } else {
    param.cancelScheduledValues(time);
    param.setValueAtTime(param.value, time);
  }
}

/**
 * When a note's crackle spikes fall, and how each sounds: one crack at the
 * attack (smaller on a legato note), a cluster around it, then sparse ones
 * while it holds. Non-overlapping, in time order.
 * @returns {Array<{t:number, amp:number, len:number, hz:number, zap:boolean}>}
 */
export function crackleSpikes(t0, end, spark, random, legato = false) {
  const spikes = [];
  if (!(spark > 0)) return spikes;
  const add = (t, scale) => {
    const zap = random() < ZAP_CHANCE;
    const len = zap ? 0.018 + random() * 0.017 : 0.003 + random() * 0.007;
    const r = random();
    spikes.push({
      t,
      len,
      amp: CRACKLE_LEVEL * scale * (zap ? 0.6 : 1) * (0.2 + 0.8 * r * r),
      hz: CRACKLE_MIN_HZ * (CRACKLE_MAX_HZ / CRACKLE_MIN_HZ) ** random(),
      zap,
    });
    return t + len + 0.001;
  };
  // The attack's crack: early, and strong
  const first = t0 + 0.002 + random() * 0.01;
  const firstSpike = spikes.length;
  let t = add(first, legato ? 0.6 : 1);
  spikes[firstSpike].amp = Math.max(spikes[firstSpike].amp, CRACKLE_LEVEL * (legato ? 0.35 : 0.6));
  for (;;) {
    const rate = (t - t0 < CRACKLE_ATTACK_S ? CRACKLE_ATTACK_RATE : CRACKLE_RATE) * spark;
    t += -Math.log(1 - random()) / rate;
    if (t > end - 0.012) break;
    t = add(t, 1);
  }
  return spikes;
}

// ── A line ────────────────────────────────────────────────────────────────

/**
 * One continuous theremin line: its nodes (oscillator on the voice's wave,
 * vibrato LFO and depth gain into the oscillator's detune, envelope gain;
 * looping noise, crackle gate, crackle band-pass), built unstarted and
 * joined only to each other, and the state its next note needs.
 */
class Line {
  constructor(context, voice) {
    this.context = context;
    this.osc = context.createOscillator();
    this.osc.setPeriodicWave(waveFor(context, voice.warmth));
    this.lfo = context.createOscillator();
    this.lfo.frequency.value = voice.vibratoRate;
    this.depth = context.createGain();
    this.depth.gain.value = 0;
    this.lfo.connect(this.depth);
    this.depth.connect(this.osc.detune);
    this.env = context.createGain();
    this.env.gain.value = 0;
    this.osc.connect(this.env);

    this.noise = context.createBufferSource();
    this.noise.buffer = noiseFor(context);
    this.noise.loop = true;
    this.gate = context.createGain();
    this.gate.gain.value = 0;
    this.tone = context.createBiquadFilter();
    this.tone.type = 'bandpass';
    this.tone.Q.value = CRACKLE_Q;
    this.noise.connect(this.gate);
    this.gate.connect(this.tone);

    this.started = false;
    this.stopAt = Infinity;
    this.busyUntil = -Infinity; // its current note's notated end
    this.silentAt = -Infinity; // ...and where its release ends
    this.relStart = -Infinity;
    this.frequency = 0; // its current note's pitch (Hz)
  }

  /** Join the graph and start, at `t0`. */
  begin(output, t0, random) {
    this.env.connect(output);
    this.tone.connect(output);
    this.osc.start(t0);
    this.lfo.start(t0);
    const { buffer } = this.noise;
    this.noise.start(t0, random() * (buffer.length / buffer.sampleRate));
    this.started = true;
  }

  /** Stop at `time` (a later call moves it: each note keeps its line alive). */
  stop(time) {
    [this.osc, this.lfo, this.noise].forEach((node) => {
      try {
        node.stop(time);
      } catch (e) {
        // Already stopped
      }
    });
    this.stopAt = time;
  }

  disconnect() {
    try {
      this.env.disconnect();
      this.tone.disconnect();
    } catch (e) {
      // Context torn down
    }
  }

  /** The envelope's level at `time` from what its last note scheduled. */
  levelAt(time) {
    if (time >= this.silentAt) return 0;
    const sustain = VOICE_LEVEL * SUSTAIN;
    if (time <= this.relStart) return sustain;
    return (sustain * (this.silentAt - time)) / (this.silentAt - this.relStart);
  }

  /** Schedule a note: pitch, loudness, vibrato and crackle. */
  play(frequency, t0, seconds, voice, random, crackleRandom = random) {
    const end = t0 + seconds;
    const legato = t0 < this.silentAt && this.frequency > 0;
    const samePitch = legato && Math.abs(Math.log2(frequency / this.frequency)) < 0.01;
    const held = legato ? this.levelAt(t0) : 0;

    // Timing, compressed to fit a short note
    const relStart = end - Math.min(RELEASE_LEAD_S, seconds * 0.25);
    const dip = legato ? Math.min(DIP_S, (relStart - t0) * 0.2) : 0;
    const attack = Math.min(voice.attack, Math.max(0.004, (relStart - t0 - dip) * 0.5));
    const attackEnd = t0 + dip + attack;
    const decayEnd = Math.min(attackEnd + DECAY_S, relStart);
    const silentAt = end + RELEASE_TAIL_S;
    const peak = VOICE_LEVEL;
    const sustain = VOICE_LEVEL * SUSTAIN;

    // Loudness
    const { gain } = this.env;
    if (legato) {
      hold(gain, t0);
      gain.linearRampToValueAtTime(
        Math.min(held, peak * (samePitch ? DIP_SAME : DIP_MOVE)),
        t0 + dip
      );
    } else {
      gain.cancelScheduledValues(t0);
      gain.setValueAtTime(0, t0);
    }
    gain.linearRampToValueAtTime(peak, attackEnd);
    if (decayEnd > attackEnd) gain.linearRampToValueAtTime(sustain, decayEnd);
    if (relStart > decayEnd) gain.setValueAtTime(sustain, relStart);
    gain.linearRampToValueAtTime(0, silentAt);

    // Pitch: a glide from the note before, or a small scoop from below
    const pitch = this.osc.frequency;
    if (legato) {
      hold(pitch, t0);
      pitch.setTargetAtTime(frequency, t0, voice.glide);
      pitch.setValueAtTime(frequency, t0 + SETTLE_TAUS * voice.glide);
    } else {
      pitch.cancelScheduledValues(t0);
      pitch.setValueAtTime(frequency * 2 ** (-SCOOP_CENTS / 1200), t0);
      pitch.setTargetAtTime(frequency, t0, SCOOP_TAU_S);
      pitch.setValueAtTime(frequency, t0 + SETTLE_TAUS * SCOOP_TAU_S);
    }

    // Vibrato: gone at the onset, developing after it
    const depth = this.depth.gain;
    if (legato) {
      hold(depth, t0);
      depth.linearRampToValueAtTime(0, t0 + VIBRATO_FADE_S);
    } else {
      depth.cancelScheduledValues(t0);
      depth.setValueAtTime(0, t0);
    }
    const vibratoStart = t0 + VIBRATO_DELAY_S;
    if (vibratoStart < end) {
      const cents = voice.vibratoDepth * (1 + VIBRATO_DEPTH_JITTER * (2 * random() - 1));
      depth.setValueAtTime(0, vibratoStart);
      depth.linearRampToValueAtTime(cents, Math.min(vibratoStart + VIBRATO_RISE_S, silentAt));
    }
    this.lfo.frequency.setValueAtTime(
      voice.vibratoRate * (1 + VIBRATO_RATE_JITTER * (2 * random() - 1)),
      t0
    );

    // Crackle
    const gate = this.gate.gain;
    const tone = this.tone.frequency;
    hold(gate, t0);
    gate.linearRampToValueAtTime(0, t0 + 0.002);
    tone.cancelScheduledValues(t0);
    crackleSpikes(t0, end, voice.spark, crackleRandom, legato).forEach((spike) => {
      gate.setValueAtTime(0, spike.t);
      gate.linearRampToValueAtTime(spike.amp, spike.t + CRACKLE_RISE_S);
      gate.linearRampToValueAtTime(spike.amp * 0.3, spike.t + spike.len * 0.35);
      gate.linearRampToValueAtTime(0, spike.t + spike.len);
      tone.setValueAtTime(spike.hz, spike.t);
      if (spike.zap) tone.exponentialRampToValueAtTime(spike.hz * 0.35, spike.t + spike.len);
    });

    this.frequency = frequency;
    this.busyUntil = end;
    this.silentAt = silentAt;
    this.relStart = relStart;
    this.stop(silentAt + LINE_KEEP_S);
  }
}

// ── The instrument ────────────────────────────────────────────────────────

/** Whether a song element (note or chord member) sounds. */
const isPitched = (note) => Boolean(note && note.pitch);

class CreatureVoice extends Instrument {
  /**
   * @param {?string|number} id
   * @param {object} [options]
   * @param {object} [options.voice] - a voice getVoice() gave (else rolled)
   * @param {BaseAudioContext} [options.context] - e.g. an OfflineAudioContext
   * @param {AudioNode} [options.output] - where it plays (default: the
   *   master output, which mutes)
   * @param {() => number} [options.random] - for the voice roll, vibrato
   *   jitter and crackle (default Math.random)
   * @param {() => number} [options.crackleRandom] - for the crackle alone
   *   (default: random), so a render can have the same tone with and
   *   without it
   */
  constructor(id = null, { voice, context, output, random, crackleRandom } = {}) {
    super(id);
    if (context) this.context = context;
    this._output = output || null;
    this._random = random || Math.random;
    this._crackleRandom = crackleRandom || this._random;
    this.voice = readVoice(voice) || rollVoice(this._random);

    this._lines = []; // started lines, until they stop
    this._spare = []; // built ahead (prepare), unstarted
    this._volume = null; // { node: GainNode, busyUntil: seconds }
    this._spareVolume = null;
  }

  /** This creature's voice, to rebuild it identically (Creature.toSpec). */
  getVoice() {
    return { ...this.voice };
  }

  /**
   * Take a voice getVoice() gave (anything else is ignored). Lines built
   * ahead on the old one are let go.
   */
  setVoice(voice) {
    const read = readVoice(voice);
    if (!read) return;
    this.voice = read;
    this._spare = [];
  }

  /**
   * Build this voice's wavetable (and the shared noise) now: ~1 ms the
   * first time a context needs a warmth, nothing after. Synchronous.
   */
  warm() {
    if (this.disposed) return;
    waveFor(this.context, this.voice.warmth);
    noiseFor(this.context);
  }

  /** Whether warm() has nothing left to build. */
  isWarm() {
    if (this.disposed) return true;
    return (
      wavesOf(this.context).has(warmthKey(this.voice.warmth)) && noiseByContext.has(this.context)
    );
  }

  /**
   * How many fresh lines a song starts: one per member of its widest
   * chord, again after each rest longer than LINE_KEEP_S (at `tempo`).
   */
  linesFor(song, tempo = 120) {
    let width = 1;
    let gaps = 0;
    let rest = 0;
    (Array.isArray(song) ? song : []).forEach((element) => {
      const notes = Array.isArray(element) ? element : [element];
      const pitched = notes.filter(isPitched).length;
      if (pitched === 0) {
        rest += this.getElementDuration(element, tempo, 4) / 1000;
        return;
      }
      if (rest > LINE_KEEP_S) gaps += 1;
      rest = 0;
      width = Math.max(width, pitched);
    });
    return Math.min(MAX_LINES, width * (1 + gaps));
  }

  /**
   * Build ahead the lines a song will start (linesFor), and the volume gain
   * if none is live, unstarted and unconnected: the frame a note starts in
   * then only schedules. Lines left unused wait for the next song. Builds
   * the wavetable too if it isn't yet. Synchronous.
   */
  prepare(song, tempo = 120) {
    if (this.disposed) return;
    const lines = this.linesFor(song, tempo);
    while (this._spare.length < lines) this._spare.push(new Line(this.context, this.voice));
    if (!this._volume && !this._spareVolume) this._spareVolume = this.context.createGain();
  }

  /** Whether prepare(song) has nothing left to build. */
  isPrepared(song, tempo = 120) {
    if (this.disposed) return true;
    return this._spare.length >= this.linesFor(song, tempo);
  }

  /**
   * Start a note now (or at `when`, audio-clock seconds) on a line: the
   * free one nearest in pitch, still sounding (a glide) or silent; else a
   * fresh one.
   */
  // eslint-disable-next-line no-unused-vars
  startNote(pitch, duration, velocity, when) {
    if (this.disposed) return;
    const frequency = getFrequency(pitch);
    const now = this.context.currentTime;
    const t0 = typeof when === 'number' ? Math.max(when, now) : now;
    const seconds = duration / 1000;
    const output = this._volumeGainFor(t0, t0 + seconds + RELEASE_TAIL_S);
    const line = this._lineFor(frequency, t0, output);
    line.play(frequency, t0, seconds, this.voice, this._random, this._crackleRandom);
  }

  /** The line a note at `t0` plays on (see startNote). */
  _lineFor(frequency, t0, output) {
    // Lines that have stopped by now leave the graph
    this._lines = this._lines.filter((line) => {
      if (line.stopAt > t0 + 0.005) return true;
      line.disconnect();
      return false;
    });
    let best = null;
    let bestScore = Infinity;
    this._lines.forEach((line) => {
      if (line.busyUntil > t0 + EARLY_SLACK_S) return;
      const score = Math.abs(Math.log2(frequency / line.frequency || 1));
      if (score < bestScore) {
        best = line;
        bestScore = score;
      }
    });
    if (best) return best;
    if (this._lines.length >= MAX_LINES) {
      // Every line busy: the one that frees first takes it
      return this._lines.reduce((a, b) => (b.busyUntil < a.busyUntil ? b : a));
    }
    const line = this._spare.shift() || new Line(this.context, this.voice);
    line.begin(output, t0, this._random);
    line.osc.onended = () => {
      // Only its last stop (a note can move it later); a stale call is ignored
      if (this.context.currentTime + 0.05 < line.stopAt) return;
      line.disconnect();
      this._lines = this._lines.filter((other) => other !== line);
    };
    this._lines.push(line);
    return line;
  }

  /**
   * The gain every line plays through, so updateVolume moves one AudioParam
   * however many lines sound. A fresh one (the one prepare() built, if any)
   * starts at the current volume; so does an idle one a note finds.
   */
  _volumeGainFor(startTime, endTime) {
    if (!this._volume) {
      const node = this._spareVolume || this.context.createGain();
      this._spareVolume = null;
      node.gain.value = this.volumeMultiplier;
      node.connect(this._output || audioContextManager.getOutput());
      this._volume = { node, busyUntil: endTime };
      return node;
    }
    const volume = this._volume;
    if (startTime + VOLUME_QUIET_SLACK_S >= volume.busyUntil) {
      volume.node.gain.setValueAtTime(this.volumeMultiplier, startTime);
    }
    volume.busyUntil = Math.max(volume.busyUntil, endTime);
    return volume.node;
  }

  /** What updateVolume ramps and stopAll fades: the one volume gain. */
  trackedGains() {
    return new Set(this._volume ? [this._volume.node] : []);
  }

  /**
   * Fade everything out on the volume gain (pause, stop), stop every line
   * after the fade and retire the gain: the next note starts fresh lines on
   * a fresh gain at the current volume. Lines built ahead are kept.
   * @param {number} fadeTime - seconds (default 0.01)
   */
  stopAll(fadeTime = 0.01) {
    super.stopAll(fadeTime);
    const at = this.context.currentTime + fadeTime;
    const lines = this._lines;
    this._lines = [];
    lines.forEach((line) => line.stop(at));
    const retired = this._volume;
    this._volume = null;
    setTimeout(
      () => {
        lines.forEach((line) => line.disconnect());
        if (retired) {
          try {
            retired.node.disconnect();
          } catch (e) {
            // Context torn down
          }
        }
      },
      fadeTime * 1000 + RETIRED_VOLUME_MARGIN_MS
    );
  }

  /** Retire it: stop (a fade), and let go of what it built ahead. */
  dispose() {
    super.dispose();
    this._spare = [];
    this._spareVolume = null;
  }
}

export default CreatureVoice;
