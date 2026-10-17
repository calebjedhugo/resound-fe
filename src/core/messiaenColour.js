/**
 * Messiaen colour — a creature's lit colour comes from the HARMONY around it
 * (ruled 2026-10-02). Messiaen coloured chords, not single notes: the tonal
 * core sets the main colour, and the dissonant added notes show as
 * complementary colours or "reflections".
 *
 * Here: the creature's sounding set (its own sounding notes + the notes it can
 * hear, as MIDI numbers) is fitted to the major or minor triad that covers it
 * best. That
 * triad's colour is the MAIN colour; every leftover pitch class is a
 * dissonant added note, shown as a REFLECTION in the major-key colour of that
 * pitch class. A lone note is its own major triad.
 *
 * Messiaen's key colours (major / minor), from Messiaen's writings as
 * collected in "Visualizing Visions: The Significance of Messiaen's Colours":
 * https://www.musicandpractice.org/volume-2/visualizing-visions-the-significance-of-messiaens-colours/
 * Entries marked * are inconsistent across Messiaen's sources (C#/Db major
 * and minor, Eb major, E minor, Bb minor, B minor); one reading is used.
 * The named colours are mapped to sRGB hex by hand.
 *
 * Pure module: no THREE, no game state.
 */
import HarmonyAnalyzer from 'core/HarmonyAnalyzer';

export const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// Indexed by root pitch class (C = 0).
export const MESSIAEN_TRIAD_COLOURS = [
  { major: { name: 'white', hex: 0xf4f1ea }, minor: { name: 'yellowish grey', hex: 0xc9c08a } },
  // C#/Db*
  { major: { name: 'grey green', hex: 0x8fa68b }, minor: { name: 'black-gold', hex: 0x6b5518 } },
  { major: { name: 'green', hex: 0x2faf4e }, minor: { name: 'green', hex: 0x2faf4e } },
  // Eb* (major)
  { major: { name: 'rose-violet', hex: 0xc0569b }, minor: { name: 'dark red', hex: 0x7d1427 } },
  // E* (minor)
  { major: { name: 'red', hex: 0xd9302b }, minor: { name: 'orange', hex: 0xf28323 } },
  { major: { name: 'pale green', hex: 0xa9e2a0 }, minor: { name: 'bluish green', hex: 0x22998a } },
  { major: { name: 'gold', hex: 0xe1b12c }, minor: { name: 'acid green', hex: 0xb0e61e } },
  { major: { name: 'yellow', hex: 0xf5e03a }, minor: { name: 'red orange', hex: 0xee5522 } },
  { major: { name: 'sapphire blue', hex: 0x1f4fbf }, minor: { name: 'violet', hex: 0x7b3fc9 } },
  { major: { name: 'blue', hex: 0x2e6fe6 }, minor: { name: 'pale blue', hex: 0xa3cdf2 } },
  // Bb* (minor)
  { major: { name: 'red grey', hex: 0xa57873 }, minor: { name: 'dark orange', hex: 0xc2601a } },
  // B* (minor)
  { major: { name: 'brown', hex: 0x8b5a2b }, minor: { name: 'grey with red', hex: 0x977a78 } },
];

const THIRD = { major: 4, minor: 3 };

// Pitch strings are a small fixed vocabulary; pitchToMidi builds a table and
// a regex match per call, and the look asks every frame
const midiByPitch = new Map();

/** Pitch string ("C4", "Eb5", "F#3") → MIDI note number. */
export function midiOf(pitch) {
  let midi = midiByPitch.get(pitch);
  if (midi === undefined) {
    midi = HarmonyAnalyzer.pitchToMidi(pitch);
    midiByPitch.set(pitch, midi);
  }
  return midi;
}

/** Pitch string ("C4", "Eb5", "F#3") → pitch class 0-11 (C = 0). */
export function pitchClassOf(pitch) {
  return midiOf(pitch) % 12;
}

/** The three pitch classes of a major/minor triad on `root`. */
export function triadPitchClasses(root, quality) {
  return [root % 12, (root + THIRD[quality]) % 12, (root + 7) % 12];
}

/** Messiaen colour (hex) of the major or minor triad on `root`. */
export function triadColour(root, quality) {
  return MESSIAEN_TRIAD_COLOURS[root % 12][quality].hex;
}

/** Colour of a lone pitch class: its own major key (the reflection colour). */
export function majorKeyColour(pitchClass) {
  return triadColour(pitchClass, 'major');
}

const pitchClass = (note) => ((note % 12) + 12) % 12;
const pitchClassesOf = (notes) => [...new Set(notes.map(pitchClass))];

// Lexicographic: the first differing criterion decides
const compareScores = (a, b) => {
  const i = a.findIndex((value, k) => value !== b[k]);
  return i === -1 ? 0 : a[i] - b[i];
};

/**
 * Best-covering triad among the 24 major/minor candidates for a sounding
 * set. The colour belongs to the HARMONY, not to any one voice in it, so
 * every creature inside the same chord gets the same answer (ruled
 * 2026-10-02: a creature's own note never outranks the chord around it).
 * Ranked by, in order: sounding pitch classes covered, rooted on a SOUNDING
 * note (A+C is A minor, never an F major with no F in it), rooted on the
 * BASS (lowest sounding note), major over minor. Remaining ties go to the
 * first root counting up from the bass — deterministic.
 * @param {number[]} notes - MIDI note numbers sounding (pitch classes 0-11
 *   work too; the bass is then simply the lowest pitch class)
 * @returns {?{root:number, quality:'major'|'minor', pitchClasses:number[]}}
 *   null when nothing sounds
 */
export function fitTriad(notes = []) {
  const sounding = pitchClassesOf(notes);
  if (sounding.length === 0) return null;
  const bass = pitchClass(Math.min(...notes));

  let best = null;
  let bestScore = null;
  for (let step = 0; step < 12; step += 1) {
    const root = (bass + step) % 12;
    for (const quality of ['major', 'minor']) {
      const pcs = triadPitchClasses(root, quality);
      const score = [
        sounding.filter((pc) => pcs.includes(pc)).length,
        sounding.includes(root) ? 1 : 0,
        root === bass ? 1 : 0,
        quality === 'major' ? 1 : 0,
      ];
      if (bestScore === null || compareScores(score, bestScore) > 0) {
        best = { root, quality, pitchClasses: pcs };
        bestScore = score;
      }
    }
  }
  return best;
}

/**
 * A creature's colour from the harmony it sounds in.
 * @param {{ownNotes?: number[], heardNotes?: number[]}} sounding
 *   MIDI note numbers: ownNotes = the creature's own currently-sounding
 *   notes; heardNotes = other notes currently audible to it. Both count
 *   equally toward the chord; "own" only orders the reflections.
 * @returns {{main: ?number, reflections: number[], triad: ?{root, quality}}}
 *   main = Messiaen colour (hex) of the best-covering triad (null when
 *   nothing sounds); reflections = major-key colours (hex) of each sounding
 *   pitch class outside that triad — own notes first, then heard, in order
 */
export function messiaenColour({ ownNotes = [], heardNotes = [] } = {}) {
  const all = [...ownNotes, ...heardNotes];
  const triad = fitTriad(all);
  if (!triad) return { main: null, reflections: [], triad: null };
  const added = pitchClassesOf(all).filter((pc) => !triad.pitchClasses.includes(pc));
  return {
    main: triadColour(triad.root, triad.quality),
    reflections: added.map(majorKeyColour),
    triad: { root: triad.root, quality: triad.quality },
  };
}

// ---- Per-frame path (every sounding creature, every frame) ----
// messiaenColour's answer depends ONLY on the distinct sounding pitch
// classes in first-appearance order (the set picks the triad, the order
// orders the reflections) and the bass pitch class. That key is memoized:
// at most 12 distinct pitch classes, packed base 13, times 12 for the bass —
// under 2^53, so it is an exact number key. A miss runs messiaenColour
// itself, so a cached answer IS the reference answer.
const NOTHING_SOUNDING = Object.freeze({ main: null, reflections: Object.freeze([]), triad: null });
const COLOUR_CACHE_LIMIT = 4096; // a backstop; real play reaches a few dozen keys
const colourByKey = new Map();
let lastKey = -1;
let lastColour = NOTHING_SOUNDING;

/**
 * messiaenColour without the per-call garbage, for the per-frame look.
 * @param {number[]} notes - MIDI note numbers: the creature's own sounding
 *   notes FIRST, then the heard ones (= [...ownNotes, ...heardNotes])
 * @returns {{main: ?number, reflections: number[], triad: ?object}} equal to
 *   messiaenColour({ ownNotes: notes }) — but FROZEN and SHARED between
 *   calls with the same key: read it, never mutate it
 */
export function messiaenColourCached(notes) {
  /* eslint-disable no-bitwise -- a 12-bit pitch-class set */
  let seen = 0;
  let order = 0;
  let low = Infinity;
  for (let i = 0; i < notes.length; i += 1) {
    const note = notes[i];
    const pc = pitchClass(note);
    if ((seen & (1 << pc)) === 0) {
      seen |= 1 << pc;
      order = order * 13 + pc + 1;
    }
    if (note < low) low = note;
  }
  /* eslint-enable no-bitwise */
  if (seen === 0) return NOTHING_SOUNDING;

  const key = order * 12 + pitchClass(low);
  if (key === lastKey) return lastColour;
  let colour = colourByKey.get(key);
  if (colour === undefined) {
    if (colourByKey.size >= COLOUR_CACHE_LIMIT) colourByKey.clear();
    colour = messiaenColour({ ownNotes: notes });
    Object.freeze(colour.reflections);
    if (colour.triad) Object.freeze(colour.triad);
    Object.freeze(colour);
    colourByKey.set(key, colour);
  }
  lastKey = key;
  lastColour = colour;
  return colour;
}
