/**
 * Messiaen colour — a creature's lit colour comes from the HARMONY around it
 * (ruled 2026-10-02; reworked from the sources 2026-10-17, DESIGN.md
 * "Creature look"). Messiaen coloured chords, never single notes ("puéril",
 * he said), and a sound complex keeps its colours wherever it is voiced:
 *
 * - MAIN: the creature's sounding set (its own sounding notes + the notes it
 *   can hear, as MIDI numbers) is fitted to the major or minor triad that
 *   covers it best (fitTriad). Its table colour is the body and the light.
 * - REFLECTIONS: each dissonant added note is read the way Messiaen reads a
 *   mode — as part of another triad heard inside the chord: of the triads
 *   holding it, the one sharing the most of the chord's own tones, then the
 *   one rooted on the added note (its own resonance), then fitTriad's
 *   ranking (bestTriad). Its light shows as a reflection. This
 *   reproduces his own examples (Traité V/1 p. 354, a chord "en la majeur
 *   bleu"): G# "adds a little gold" (G#-C#-E = C# minor, black-gold) and a
 *   high F "adds pale green" (F-A-C = F major, pale green).
 * - COMPLEMENT: dissonance also flares the painter's complement of the light
 *   at the creature's limb (CreatureLook) — Messiaen's afterimage, and
 *   Benitez's halos of added resonance notes. More added notes, stronger.
 *   On a hueless light (white, grey) it is the complement of the added
 *   colour: red on white flares pale green.
 * - The ADDED SIXTH on a major triad is no reflection: it deepens the
 *   triad's own colour (Austbø; Technique p. 47).
 * - A LONE pitch class is all but uncoloured — an opaline light (CreatureLook)
 *   over the faint tint of its own major triad. The tint is a GAME
 *   CONVENTION (the note's overtones; Messiaen gave single notes no colour)
 *   so a lone singer still hints at its pitch; an interval is paler than a
 *   chord (chroma).
 * - REGISTER changes lightness, never hue: an octave up is graded toward
 *   white, an octave down pulled toward black (Conférence de Notre-Dame) —
 *   registerLuminosity.
 *
 * The 24 triad colours follow Håkon Austbø's "tentative list", deduced from
 * Messiaen's descriptions (Messiaen never printed one, and denied any exact
 * key-colour code): "Visualizing Visions: The Significance of Messiaen's
 * Colours", Music & Practice vol. 2 (2015),
 * https://www.musicandpractice.org/volume-2/visualizing-visions-the-significance-of-messiaens-colours/
 * — corrected where Messiaen's own words disagree: his descriptions of the
 * chords of transposed inversions (Traité VII, "AIT" below) put sapphire on
 * A and turquoise on Ab (Austbø's table swaps them), Eb's rose ahead of
 * violet, and gold with C, E and B. Messiaen himself named C major white, E
 * red, G yellow, A blue and F# "a sparkling of all possible colours" (to
 * Almut Rößler, 1983). * marks Austbø's ambiguous entries; the twelve minor
 * colours are his alone (no second source exists).
 *
 * Hex values: ISCC-NBS colour-name centroids (Kelly & Judd; J. Foster's
 * sRGB list), the named swatch where ISCC has none (sapphire, gold leaf,
 * acid green, turquoise blue). Each entry has a body colour (`hex`) and,
 * where it differs, the colour of its LIGHT (`accent`) and GLOW — for
 * Messiaen's two-colour names ("black-gold": a black body with gold light
 * and a dim gold glow; "grey with red") and for colours too dark to glow by
 * themselves (deep red, brown, sapphire: the same hue, lifted). Where two
 * literal centroids were indistinguishable the nearest clear ISCC neighbour
 * is used: F# gold is golden orange (Austbø: "G flat major by golden
 * orange"), Bb red grey is greyish red, F pale green and A pale blue are
 * very light green/blue (ISCC "pale" is greyish).
 *
 * Pure module: no THREE, no game state.
 */
import HarmonyAnalyzer from 'core/HarmonyAnalyzer';

export const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// Indexed by root pitch class (C = 0). Per entry: `hex` body, `accent` light
// (filaments, reflections; default hex), `glow` corona + halo (default
// accent), `fleck` a sparse second colour of glints, `rainbow` (glints of
// every colour). "AIT" = the Traité VII tables of Messiaen's chords of
// transposed inversions, read by the triad Austbø says dominates each.
export const MESSIAEN_TRIAD_COLOURS = [
  {
    // Messiaen's own white; "white and gold" (AIT 4B/7C/12D; Conférence
    // de Kyoto: C major with added sixth)
    major: { name: 'white', hex: 0xf2f3f4, accent: 0xfbf6e8, fleck: 0xe8c35a },
    // A grey glows dim — pewter, never white
    minor: { name: 'yellowish grey', hex: 0x9a937f, accent: 0xb3aa8c },
  },
  {
    // C#/Db* (Keym: pale green): greyish pale green with amethyst and mauve
    // (AIT 1D/5B/8C)
    major: { name: 'grey green', hex: 0x5e716a, accent: 0x8fae9a, fleck: 0xa67cc0 },
    // *
    minor: { name: 'black-gold', hex: 0x1c1612, accent: 0xd4af37, glow: 0x6e5a22 },
  },
  {
    // The same green in both modes (Austbø); emerald in the AIT
    major: { name: 'green', hex: 0x008856, accent: 0x1fb36f },
    minor: { name: 'green', hex: 0x008856, accent: 0x1fb36f },
  },
  {
    // Eb* (Keym: red): the AIT's Eb chords are rhodonite pink with ruby red,
    // Austbø's own Eb7sus4 is pink — so the rose leads, red glints
    major: { name: 'rose-violet', hex: 0xa04a7c, accent: 0xdd6698, fleck: 0xc8203c },
    minor: { name: 'dark red', hex: 0x5c1220, accent: 0xa51e36, glow: 0x701526 },
  },
  {
    // Messiaen's own red; carmine red and gold in the AIT (4D/8B/11C)
    major: { name: 'red', hex: 0xbe0032, accent: 0xf0283c, fleck: 0xe8b84a },
    // *
    minor: { name: 'orange', hex: 0xf38400, accent: 0xff9a1f },
  },
  {
    major: { name: 'pale green', hex: 0x8ed1b2 },
    minor: { name: 'bluish green', hex: 0x007a74, accent: 0x00a693 },
  },
  {
    // Gold (Austbø: "golden orange") — and Messiaen's own "a sparkling of
    // all possible colours" (to Rößler, 1983)
    major: { name: 'gold', hex: 0xc99a2e, accent: 0xeaa221, fleck: 0xffe39d, rainbow: true },
    minor: { name: 'acid green', hex: 0xb0bf1a, accent: 0xc4d82a },
  },
  {
    // Messiaen's own yellow
    major: { name: 'yellow', hex: 0xf3c300, accent: 0xffe03a },
    minor: { name: 'red orange', hex: 0xe25822, accent: 0xf06a30 },
  },
  {
    // Ab*: Austbø's table says sapphire, but Messiaen's own descriptions of
    // the Ab-dominated chords are turquoise blue with violet, pink and mauve
    // (AIT 3C/8D/12B), and Keym gives plain blue — the sapphire is A's
    major: { name: 'turquoise blue', hex: 0x2f8aa3, accent: 0x5cc0d8, fleck: 0xc48ab8 },
    minor: { name: 'violet', hex: 0x9065ca, accent: 0xa67ce6 },
  },
  {
    // Messiaen's own blue: a sapphire sheet ringed by paler blues and violet
    // (AIT 1B/4C/9D; Austbø's own reading of 1B; Keym "blue sapphire")
    major: { name: 'sapphire blue', hex: 0x0f52ba, accent: 0x3a7bea, fleck: 0x8a6ad8 },
    minor: { name: 'pale blue', hex: 0xa1caf1 },
  },
  {
    // Bb (Keym: red): red and grey bands with pale green (AIT 2B/10D)
    major: { name: 'red grey', hex: 0x905d5d, accent: 0xa57472, fleck: 0xa8d8b8 },
    // *
    // Kept orange, off B major's brown (ISCC deep orange, darkened)
    minor: { name: 'dark orange', hex: 0x96520a, accent: 0xc66a12, glow: 0x8a4a0e },
  },
  {
    // Brown "with gold stars" (AIT 3B/6C/11D)
    major: { name: 'brown', hex: 0x5e3414, accent: 0x8f5a2e, glow: 0x5e3a1c, fleck: 0xe0b040 },
    // * Printed "Grey w red": a grey body with red light
    minor: { name: 'grey with red', hex: 0x848482, accent: 0xbe0032, glow: 0x8c7a7a },
  },
];

const THIRD = { major: 4, minor: 3 };

// Saturation by the number of distinct pitch classes sounding (index 1 = a
// lone pitch class, 2 = an interval, 3+ = a chord)
const CHROMA_BY_PITCH_CLASSES = [1, 0.5, 0.85, 1];
// The added sixth deepens its major triad's colour rather than adding one
const ADDED_SIXTH_CHROMA = 1.2;
// Strength of the complementary flicker by the number of dissonant added
// pitch classes (index 0 = a consonant triad: none)
const DISSONANCE_BY_ADDED = [0, 0.5, 0.8, 1];
// Register luminosity (registerLuminosity)
// Neutral at the middle of where creatures sing (nearly all puzzle pitches
// lie in octaves 3-5), so a chord there shows the table colour itself
const LUMINOSITY_NEUTRAL_MIDI = 64; // E4
const LUMINOSITY_PER_OCTAVE = 0.15;
const LUMINOSITY_MIN = 0.6;
const LUMINOSITY_MAX = 1.4;

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

/** Messiaen body colour (hex) of the major or minor triad on `root`. */
export function triadColour(root, quality) {
  return MESSIAEN_TRIAD_COLOURS[root % 12][quality].hex;
}

/** The light of a table entry: its accent when it has one ("black-gold" glows gold). */
const lightOf = (entry) => (entry.accent === undefined ? entry.hex : entry.accent);

/**
 * Light colour (hex) of the triad on `root` — its filaments and halo, and
 * what it shows as a reflection inside another chord.
 */
export function triadLight(root, quality) {
  return lightOf(MESSIAEN_TRIAD_COLOURS[root % 12][quality]);
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
  return bestTriad(sounding, pitchClass(Math.min(...notes)));
}

/**
 * fitTriad's ranking over distinct sounding pitch classes. For a reflection:
 * only the triads that hold `containing` (an added pitch class), ranked
 * first by how many of the chord's own sounding `core` tones they share —
 * an added note is heard against the tonal core before the other added
 * notes — then by being rooted on the added note itself (its own
 * resonance). Together these reproduce both of Messiaen's examples in one
 * chord over A major: G# is C# minor (gold), F is F major (pale green).
 */
function bestTriad(sounding, bass, containing = null, core = []) {
  let best = null;
  let bestScore = null;
  for (let step = 0; step < 12; step += 1) {
    const root = (bass + step) % 12;
    for (const quality of ['major', 'minor']) {
      const pcs = triadPitchClasses(root, quality);
      if (containing === null || pcs.includes(containing)) {
        const score = [
          core.filter((pc) => pcs.includes(pc)).length,
          root === containing ? 1 : 0,
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
  }
  return best;
}

// ---- The painter's complement ----
// Messiaen's complementary pairs are the painter's — red/green,
// yellow/violet, blue/orange (Musique et couleur p. 95) — the RYB wheel,
// not RGB's (whose complement of red is cyan). Hue control points, RGB
// degrees -> RYB degrees:
const RGB_TO_RYB_HUE = [
  [0, 0],
  [30, 60],
  [60, 120],
  [120, 180],
  [180, 210],
  [240, 240],
  [270, 300],
  [300, 330],
  [360, 360],
];

function mapHue(hue, fromIndex) {
  const toIndex = 1 - fromIndex;
  for (let i = 1; i < RGB_TO_RYB_HUE.length; i += 1) {
    const a = RGB_TO_RYB_HUE[i - 1];
    const b = RGB_TO_RYB_HUE[i];
    if (hue <= b[fromIndex]) {
      const f = (hue - a[fromIndex]) / (b[fromIndex] - a[fromIndex]);
      return a[toIndex] + f * (b[toIndex] - a[toIndex]);
    }
  }
  return hue;
}

/* eslint-disable no-bitwise -- packing 8-bit channels */
function hexToHsv(hex) {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToHex({ h, s, v }) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return (f(5) << 16) | (f(3) << 8) | f(1);
}
/* eslint-enable no-bitwise */

// Below this saturation a colour (white, a grey) has no hue to oppose
const COMPLEMENT_MIN_SATURATION = 0.15;

/**
 * The painter's complement of a colour, as Messiaen saw it flare at a
 * colour's edge: "fairly pale" (red on white gives a pale green).
 * @param {number} hex - sRGB
 * @returns {?number} sRGB hex, or null for a colour with no hue (white, grey)
 */
export function paintersComplement(hex) {
  const { h, s, v } = hexToHsv(hex);
  if (s < COMPLEMENT_MIN_SATURATION) return null;
  const opposite = mapHue((mapHue(h, 0) + 180) % 360, 1);
  return hsvToHex({ h: opposite, s: s * 0.55, v: Math.max(v, 0.9) });
}

// Each table colour's complement, worked out once
const COMPLEMENTS = new Map(
  MESSIAEN_TRIAD_COLOURS.flatMap(({ major, minor }) => [major, minor]).map((entry) => [
    lightOf(entry),
    paintersComplement(lightOf(entry)),
  ])
);

/**
 * A creature's colour from the harmony it sounds in.
 * @param {{ownNotes?: number[], heardNotes?: number[]}} sounding
 *   MIDI note numbers: ownNotes = the creature's own currently-sounding
 *   notes; heardNotes = other notes currently audible to it. Both count
 *   equally toward the chord; "own" only orders the reflections.
 * @returns {{main: ?number, accent: ?number, glow: ?number,
 *   reflections: number[], triad: ?{root, quality}, chroma: number,
 *   complement: ?number, dissonance: number, fleck: ?number, rainbow: number}}
 *   main/accent/glow = body, light and glow colour (hex) of the
 *   best-covering triad (null when nothing sounds); reflections = the light
 *   colours (hex) of the other triads the added notes form — own notes
 *   first, then heard, each colour once; chroma = saturation of the whole
 *   (1 = the table's colours); complement = the painter's complement of the
 *   light — for a hueless light (white, grey), of the first reflection's;
 *   null when neither has a hue — flaring with `dissonance` (0 for a
 *   consonant triad, up to 1); fleck = the sparse second colour of the
 *   triad's glints (null: none), rainbow = glints of every colour (F# major)
 */
export function messiaenColour({ ownNotes = [], heardNotes = [] } = {}) {
  const all = [...ownNotes, ...heardNotes];
  const sounding = pitchClassesOf(all);
  if (sounding.length === 0) {
    return {
      main: null,
      accent: null,
      glow: null,
      reflections: [],
      triad: null,
      chroma: 1,
      complement: null,
      dissonance: 0,
      fleck: null,
      rainbow: 0,
    };
  }
  const bass = pitchClass(Math.min(...all));
  const triad = bestTriad(sounding, bass);
  const entry = MESSIAEN_TRIAD_COLOURS[triad.root][triad.quality];
  const light = lightOf(entry);
  const addedSixth = triad.quality === 'major' ? (triad.root + 9) % 12 : null;
  const core = sounding.filter((pc) => triad.pitchClasses.includes(pc));

  let chroma =
    CHROMA_BY_PITCH_CLASSES[Math.min(sounding.length, CHROMA_BY_PITCH_CLASSES.length - 1)];
  let added = 0;
  const reflections = [];
  sounding.forEach((pc) => {
    if (triad.pitchClasses.includes(pc)) return;
    if (pc === addedSixth) {
      chroma *= ADDED_SIXTH_CHROMA;
      return;
    }
    added += 1;
    const other = bestTriad(sounding, bass, pc, core);
    const hex = lightOf(MESSIAEN_TRIAD_COLOURS[other.root][other.quality]);
    if (hex !== light && !reflections.includes(hex)) reflections.push(hex);
  });
  return {
    main: entry.hex,
    accent: light,
    glow: entry.glow === undefined ? light : entry.glow,
    reflections,
    triad: { root: triad.root, quality: triad.quality },
    chroma,
    // A hueless light (white, a grey) has no complement of its own: on
    // white the fringe is the complement of what is ADDED (Messiaen's red
    // on white flares pale green)
    complement:
      COMPLEMENTS.get(light) ??
      (reflections.length > 0 ? paintersComplement(reflections[0]) : null),
    fleck: entry.fleck === undefined ? null : entry.fleck,
    rainbow: entry.rainbow ? 1 : 0,
    dissonance: DISSONANCE_BY_ADDED[Math.min(added, DISSONANCE_BY_ADDED.length - 1)],
  };
}

/**
 * Luminosity of a chord by register: an octave higher is brighter, lower
 * darker, the colour itself unchanged (Messiaen, Conférence de Notre-Dame,
 * via Austbø). 1 at a mean pitch of E4 (LUMINOSITY_NEUTRAL_MIDI).
 * @param {number[]} notes - MIDI note numbers sounding
 * @returns {number}
 */
export function registerLuminosity(notes) {
  if (notes.length === 0) return 1;
  let sum = 0;
  for (let i = 0; i < notes.length; i += 1) sum += notes[i];
  const octaves = (sum / notes.length - LUMINOSITY_NEUTRAL_MIDI) / 12;
  return Math.min(LUMINOSITY_MAX, Math.max(LUMINOSITY_MIN, 1 + octaves * LUMINOSITY_PER_OCTAVE));
}

// ---- Per-frame path (every sounding creature, every frame) ----
// messiaenColour's answer depends ONLY on the distinct sounding pitch
// classes in first-appearance order (the set picks the triad, the order
// orders the reflections) and the bass pitch class. That key is memoized:
// at most 12 distinct pitch classes, packed base 13, times 12 for the bass —
// under 2^53, so it is an exact number key. A miss runs messiaenColour
// itself, so a cached answer IS the reference answer.
const NOTHING_SOUNDING = Object.freeze({
  main: null,
  accent: null,
  glow: null,
  reflections: Object.freeze([]),
  triad: null,
  chroma: 1,
  complement: null,
  dissonance: 0,
  fleck: null,
  rainbow: 0,
});
const COLOUR_CACHE_LIMIT = 4096; // a backstop; real play reaches a few dozen keys
const colourByKey = new Map();
let lastKey = -1;
let lastColour = NOTHING_SOUNDING;

/**
 * messiaenColour without the per-call garbage, for the per-frame look.
 * @param {number[]} notes - MIDI note numbers: the creature's own sounding
 *   notes FIRST, then the heard ones (= [...ownNotes, ...heardNotes])
 * @returns {object} equal to messiaenColour({ ownNotes: notes }) (same
 *   shape) — but FROZEN and SHARED between calls with the same key: read it,
 *   never mutate it
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
