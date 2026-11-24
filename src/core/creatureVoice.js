/**
 * creatureVoice — how a creature sings: resound-sound's Theremin (a
 * high-quality theremin with electric crackle; DESIGN.md "Creature voice"),
 * in a voice each creature rolls once. This module is the game's part of
 * it: the ranges a creature's voice is rolled in, and reading a voice back
 * from a creature's spec (Creature.toSpec: the pole, world memory).
 */
import { Theremin } from 'resound-sound';

// The ranges a new creature's voice is rolled in (the Theremin's defaults
// are their middles). Warmth goes on the Theremin's 0.05 grid, so
// creatures share wavetables.
const VOICE_RANGES = {
  warmth: [0.7, 1.3],
  vibratoRate: [5, 6],
  vibratoDepth: [8, 14],
  attack: [0.02, 0.032],
  glide: [0.007, 0.011],
  spark: [0.7, 1.3],
};

const WARMTH_STEP = 0.05;

const between = (random, [low, high]) => low + random() * (high - low);

/** A new creature's voice, rolled once (the Theremin's voice options). */
export function rollVoice(random = Math.random) {
  const voice = {};
  Object.keys(VOICE_RANGES).forEach((key) => {
    voice[key] = between(random, VOICE_RANGES[key]);
  });
  voice.warmth = Math.round(voice.warmth / WARMTH_STEP) * WARMTH_STEP;
  return voice;
}

/**
 * A voice a spec carried, if it is one (every one of the six values a
 * number): else null — resound-sound Random's old {waveform, filterCutoff,
 * ...} included, so that creature rolls a voice of its own.
 * @param {*} voice
 * @returns {?object}
 */
export function voiceFromSpec(voice) {
  if (!voice || typeof voice !== 'object') return null;
  const keys = Object.keys(VOICE_RANGES);
  if (!keys.every((key) => Number.isFinite(voice[key]))) return null;
  const read = {};
  keys.forEach((key) => {
    read[key] = voice[key];
  });
  return read;
}

/**
 * A creature's instrument: a Theremin in the voice its spec carried, else
 * one rolled for it.
 * @param {?string|number} id
 * @param {*} [voice] - a spec's voice (getVoice() of an earlier one)
 * @returns {Theremin}
 */
export function createCreatureVoice(id, voice) {
  return new Theremin(id, voiceFromSpec(voice) || rollVoice());
}
