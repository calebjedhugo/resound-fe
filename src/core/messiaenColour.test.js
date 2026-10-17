/**
 * Messiaen colour: a creature's lit colour comes from the harmony around it.
 * The best-covering major/minor triad sets the MAIN colour; each dissonant
 * added note reflects the light of the other triad it forms inside the
 * chord, and flares the painter's complement; a lone note is a pale
 * resonance of its own major triad; register sets lightness. See DESIGN.md
 * "Creature look" and the sources cited in core/messiaenColour.
 */
import {
  messiaenColour,
  messiaenColourCached,
  paintersComplement,
  pitchClassOf,
  registerLuminosity,
  triadColour,
  triadLight,
  MESSIAEN_TRIAD_COLOURS,
} from 'core/messiaenColour';

const C = 0;
const Db = 1;
const D = 2;
const E = 4;
const F = 5;
const Gb = 6;
const G = 7;
const A = 9;
const B = 11;

/** Hue of an sRGB hex, in degrees. */
const hueOf = (hex) => {
  /* eslint-disable no-bitwise */
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  /* eslint-enable no-bitwise */
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (max === r) return (60 * ((g - b) / d) + 360) % 360;
  if (max === g) return 60 * ((b - r) / d + 2);
  return 60 * ((r - g) / d + 4);
};

describe('Messiaen colour of a creature', () => {
  it('colours every major and minor triad from the table', () => {
    expect(MESSIAEN_TRIAD_COLOURS).toHaveLength(12);
    MESSIAEN_TRIAD_COLOURS.forEach((entry) => {
      expect(Number.isInteger(entry.major.hex)).toBe(true);
      expect(Number.isInteger(entry.minor.hex)).toBe(true);
    });
    expect(MESSIAEN_TRIAD_COLOURS[C].major.name).toBe('white');
    expect(MESSIAEN_TRIAD_COLOURS[E].major.name).toBe('red');
    expect(MESSIAEN_TRIAD_COLOURS[A].minor.name).toBe('pale blue');
  });

  it('gives every triad its own light, but D major and minor the same green (as the source does)', () => {
    const lights = new Map();
    for (let root = 0; root < 12; root += 1) {
      ['major', 'minor'].forEach((quality) => {
        const hex = triadLight(root, quality);
        lights.set(hex, [...(lights.get(hex) || []), `${root}${quality}`]);
      });
    }
    const shared = [...lights.values()].filter((triads) => triads.length > 1);
    expect(shared).toEqual([[`${D}major`, `${D}minor`]]);
  });

  it('reads pitch classes from pitch names, sharps and flats alike', () => {
    expect(pitchClassOf('C4')).toBe(C);
    expect(pitchClassOf('C#5')).toBe(Db);
    expect(pitchClassOf('Db3')).toBe(Db);
    expect(pitchClassOf('Eb4')).toBe(3);
    expect(pitchClassOf('B2')).toBe(B);
  });

  it('a lone note glows as the pale resonance of its own major triad', () => {
    const chord = messiaenColour({ ownNotes: [C, E, G] });
    for (let pc = 0; pc < 12; pc += 1) {
      const colour = messiaenColour({ ownNotes: [pc] });
      expect(colour.main).toBe(triadColour(pc, 'major'));
      expect(colour.reflections).toEqual([]);
      expect(colour.dissonance).toBe(0);
      expect(colour.chroma).toBeLessThan(chord.chroma);
    }
  });

  it('an interval is more coloured than a lone note, less than a chord', () => {
    const lone = messiaenColour({ ownNotes: [C] }).chroma;
    const third = messiaenColour({ ownNotes: [C], heardNotes: [E] }).chroma;
    const triad = messiaenColour({ ownNotes: [C], heardNotes: [E, G] }).chroma;
    expect(lone).toBeLessThan(third);
    expect(third).toBeLessThan(triad);
    expect(triad).toBe(1);
  });

  it('a lone heard note (nothing of its own sounding) is also its own major triad', () => {
    expect(messiaenColour({ heardNotes: [A] }).main).toBe(triadColour(A, 'major'));
  });

  it('nothing sounding has no colour', () => {
    expect(messiaenColour({ ownNotes: [], heardNotes: [] })).toEqual({
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
    });
  });

  it('a major third takes the colour of the major triad it belongs to', () => {
    // C+E sits in C major and A minor; only C major is rooted on a sounding note
    const colour = messiaenColour({ ownNotes: [E], heardNotes: [C] });
    expect(colour.triad).toEqual({ root: C, quality: 'major' });
    expect(colour.main).toBe(triadColour(C, 'major'));
    expect(colour.reflections).toEqual([]);
  });

  it('a bare minor third is its minor triad — never a triad whose root is not sounding', () => {
    // A+C sits in A minor and F major; there is no F, so it is A minor
    const colour = messiaenColour({ ownNotes: [A], heardNotes: [C] });
    expect(colour.triad).toEqual({ root: A, quality: 'minor' });
    expect(colour.main).toBe(triadColour(A, 'minor'));
  });

  it('a full minor triad glows in its minor colour', () => {
    const colour = messiaenColour({ ownNotes: [C], heardNotes: [A, E] });
    expect(colour.triad).toEqual({ root: A, quality: 'minor' });
    expect(colour.main).toBe(MESSIAEN_TRIAD_COLOURS[A].minor.hex);
    expect(colour.reflections).toEqual([]);
  });

  it('a full major triad glows in its major colour whichever member the creature sings', () => {
    [C, E, G].forEach((own) => {
      const heard = [C, E, G].filter((pc) => pc !== own);
      const colour = messiaenColour({ ownNotes: [own], heardNotes: heard });
      expect(colour.main).toBe(triadColour(C, 'major'));
    });
  });

  it("Messiaen's own example: G# over a blue A major adds a little gold", () => {
    // Traité V/1 p. 354. G# with C# and E is C# minor — black-gold, whose
    // light is gold
    const colour = messiaenColour({ ownNotes: [57, 61, 64, 68] }); // A3 C#4 E4 G#4
    expect(colour.main).toBe(triadColour(A, 'major'));
    expect(colour.reflections).toEqual([triadLight(Db, 'minor')]);
    expect(MESSIAEN_TRIAD_COLOURS[Db].minor.name).toBe('black-gold');
  });

  it("Messiaen's own example: G# adds gold and a high F adds pale green, together", () => {
    // Traité V/1 p. 354: A major blue; G# adds a little gold; doubling C#
    // and F an octave higher adds pale green. G# is heard against the core
    // (C# minor: gold); F against the core as its own resonance (F major:
    // pale green)
    const colour = messiaenColour({ ownNotes: [57, 61, 64, 68, 73, 77] }); // A3 C#4 E4 G#4 C#5 F5
    expect(colour.main).toBe(triadColour(A, 'major'));
    expect(colour.reflections).toEqual([triadLight(Db, 'minor'), triadLight(F, 'major')]);
    expect(MESSIAEN_TRIAD_COLOURS[F].major.name).toBe('pale green');
  });

  it('an added note reflects the light of the other triad it forms in the chord', () => {
    // C major + D: D and G are G major's fifth — a yellow reflection
    const colour = messiaenColour({ ownNotes: [C], heardNotes: [E, G, D] });
    expect(colour.main).toBe(triadColour(C, 'major'));
    expect(colour.reflections).toEqual([triadLight(G, 'major')]);
  });

  it('an added note with no partner in the chord reflects its own major triad', () => {
    // C4 against Db4: no triad holds both; Db's resonance is Db major
    const colour = messiaenColour({ ownNotes: [60], heardNotes: [61] });
    expect(colour.triad).toEqual({ root: C, quality: 'major' });
    expect(colour.reflections).toEqual([triadLight(Db, 'major')]);
  });

  it('the chord around a creature outranks its own note', () => {
    // D sung against a C-major triad: the tonal core is C major (white) and
    // the creature's own D is the added note
    const colour = messiaenColour({ ownNotes: [D], heardNotes: [C, E, G] });
    expect(colour.triad).toEqual({ root: C, quality: 'major' });
    expect(colour.reflections).toEqual([triadLight(G, 'major')]);
  });

  it('every voice in one chord gets the same colour', () => {
    const chord = [60, 62, 64, 67]; // C4 D4 E4 G4
    const colours = chord.map((own) =>
      messiaenColour({ ownNotes: [own], heardNotes: chord.filter((n) => n !== own) })
    );
    colours.forEach((colour) => expect(colour).toEqual(colours[0]));
    expect(colours[0].triad).toEqual({ root: C, quality: 'major' });
  });

  it('when no triad holds every note, the bass decides', () => {
    // C4 against D4 (a second): C major and D major each cover one note —
    // the root on the bass wins, whoever sings it
    expect(messiaenColour({ ownNotes: [62], heardNotes: [60] }).triad).toEqual({
      root: C,
      quality: 'major',
    });
    // Same pitch classes, D in the bass
    expect(messiaenColour({ ownNotes: [60], heardNotes: [50] }).triad).toEqual({
      root: D,
      quality: 'major',
    });
  });

  it('the bass outranks major-over-minor between equally full triads', () => {
    // A2 under C4 E4 G4: A minor and C major each hold three notes; A is the
    // bass, so this is Am7 — pale blue, with C major's light reflecting
    const colour = messiaenColour({ ownNotes: [45], heardNotes: [60, 64, 67] });
    expect(colour.triad).toEqual({ root: A, quality: 'minor' });
    expect(colour.reflections).toEqual([triadLight(C, 'major')]);
  });

  it('the added sixth deepens its major triad instead of adding a colour', () => {
    // C4 E4 G4 A4 with C in the bass: C major with an added sixth — no
    // reflection, no dissonance, a deeper (more saturated) colour
    const plain = messiaenColour({ ownNotes: [60, 64, 67] });
    const sixth = messiaenColour({ ownNotes: [60, 64, 67, 69] });
    expect(sixth.triad).toEqual({ root: C, quality: 'major' });
    expect(sixth.reflections).toEqual([]);
    expect(sixth.dissonance).toBe(0);
    expect(sixth.chroma).toBeGreaterThan(plain.chroma);
  });

  it('lists each reflection once, the creature’s own added notes first', () => {
    // C major + Db + B: Db with E is C# minor; B with E and G is E minor
    const colour = messiaenColour({
      ownNotes: [C, Db],
      heardNotes: [E, G, B, Db, B],
    });
    expect(colour.main).toBe(triadColour(C, 'major'));
    expect(colour.reflections).toEqual([triadLight(Db, 'minor'), triadLight(E, 'minor')]);
  });

  it('added notes that form the same triad reflect it once', () => {
    // C9 (C E G Bb D): Bb and D both belong to G minor with the chord's G
    const colour = messiaenColour({ ownNotes: [60, 64, 67, 70, 74] });
    expect(colour.reflections).toEqual([triadLight(G, 'minor')]);
  });

  it('a reflection in the main colour itself adds nothing to see', () => {
    // D major + F: F forms D minor — the same green
    const colour = messiaenColour({ ownNotes: [62, 66, 69, 65] });
    expect(colour.main).toBe(triadColour(D, 'major'));
    expect(colour.reflections).toEqual([]);
    expect(colour.dissonance).toBeGreaterThan(0); // the F still flickers
  });

  it('dissonance grows with each added note; a triad has none', () => {
    const added = (notes) => messiaenColour({ ownNotes: notes }).dissonance;
    expect(added([60, 64, 67])).toBe(0);
    const one = added([60, 64, 67, 62]);
    const two = added([60, 64, 67, 62, 66]);
    const three = added([60, 64, 67, 62, 66, 70]);
    expect(one).toBeGreaterThan(0);
    expect(two).toBeGreaterThan(one);
    expect(three).toBeGreaterThan(two);
    expect(three).toBeLessThanOrEqual(1);
  });

  it('flares the painter’s complement of its light: red/green, yellow/violet, blue/orange', () => {
    const red = paintersComplement(triadLight(E, 'major'));
    const yellow = paintersComplement(triadLight(G, 'major'));
    const blue = paintersComplement(triadLight(A, 'major'));
    expect(hueOf(red)).toBeGreaterThan(90); // green
    expect(hueOf(red)).toBeLessThan(160);
    expect(hueOf(yellow)).toBeGreaterThan(250); // violet
    expect(hueOf(yellow)).toBeLessThan(300);
    expect(hueOf(blue)).toBeGreaterThan(15); // orange
    expect(hueOf(blue)).toBeLessThan(45);
    // A chord carries its light's complement
    expect(messiaenColour({ ownNotes: [64, 68, 71, 74] }).complement).toBe(red);
  });

  it('white and greys have no complement of their own', () => {
    expect(paintersComplement(0xffffff)).toBeNull();
    expect(paintersComplement(0x848482)).toBeNull();
  });

  it('every hued triad can flare its complement when dissonant', () => {
    for (let root = 0; root < 12; root += 1) {
      [
        [root, root + 4, root + 7, root + 1],
        [root, root + 3, root + 7, root + 1],
      ].forEach((notes) => {
        const colour = messiaenColour({ ownNotes: notes });
        expect(colour.dissonance).toBeGreaterThan(0);
        expect(colour.complement).not.toBeNull();
      });
    }
  });

  it('on white, the fringe is the complement of the added colour', () => {
    // C major + D: white with G major's yellow reflecting — the fringe is
    // yellow's complement (red on white flares green, Messiaen's example)
    const colour = messiaenColour({ ownNotes: [60, 64, 67, 74] });
    expect(colour.reflections).toEqual([triadLight(G, 'major')]);
    expect(colour.complement).toBe(paintersComplement(triadLight(G, 'major')));
    expect(hueOf(colour.complement)).toBeGreaterThan(250); // violet
  });

  it('F# major sparkles with all colours — and nothing else does', () => {
    expect(messiaenColour({ ownNotes: [66, 70, 73] }).rainbow).toBe(1);
    for (let root = 0; root < 12; root += 1) {
      if (root !== Gb)
        expect(messiaenColour({ ownNotes: [root, root + 4, root + 7] }).rainbow).toBe(0);
      expect(messiaenColour({ ownNotes: [root, root + 3, root + 7] }).rainbow).toBe(0);
    }
  });

  it("glints the second colour of Messiaen's descriptions: white and gold, brown with gold stars", () => {
    const flecks = (root) => messiaenColour({ ownNotes: [root, root + 4, root + 7] }).fleck;
    expect(flecks(C)).not.toBeNull(); // white and gold
    expect(flecks(B)).not.toBeNull(); // brown with gold stars
    expect(flecks(G)).toBeNull(); // plain yellow
    expect(messiaenColour({ ownNotes: [60, 63, 67] }).fleck).toBeNull(); // minors: one colour
  });

  it("puts sapphire on A and turquoise on Ab, as Messiaen's own chord descriptions do", () => {
    expect(MESSIAEN_TRIAD_COLOURS[A].major.name).toBe('sapphire blue');
    expect(MESSIAEN_TRIAD_COLOURS[8].major.name).toBe('turquoise blue');
  });

  it('a two-colour name glows in its light, a black body with gold filaments', () => {
    const blackGold = messiaenColour({ ownNotes: [61, 64, 68] }); // C# minor
    expect(blackGold.main).toBe(MESSIAEN_TRIAD_COLOURS[Db].minor.hex);
    expect(blackGold.accent).toBe(triadLight(Db, 'minor'));
    expect(blackGold.accent).not.toBe(blackGold.main);
    // A one-colour name glows in its own light
    const red = messiaenColour({ ownNotes: [64, 68, 71] });
    expect(red.glow).toBe(red.accent);
  });

  it('octaves and repeated notes do not change the colour', () => {
    const once = messiaenColour({ ownNotes: [E], heardNotes: [C] });
    const doubled = messiaenColour({ ownNotes: [E, E + 12], heardNotes: [C, C] });
    expect(doubled).toEqual(once);
  });
});

/**
 * Register: an octave up grades a chord's colours toward white, an octave
 * down toward black — lightness only (Messiaen). registerLuminosity turns the
 * sounding notes' register into that lightness.
 */
describe('Messiaen colour by register', () => {
  it('is neutral for a chord in the middle of the singing range (E4)', () => {
    expect(registerLuminosity([60, 64, 68])).toBeCloseTo(1, 5);
  });

  it('lightens an octave up and darkens an octave down, by the same step', () => {
    const middle = registerLuminosity([60, 64, 67]);
    const up = registerLuminosity([72, 76, 79]);
    const down = registerLuminosity([48, 52, 55]); // C3: the lower octave
    expect(up).toBeGreaterThan(middle);
    expect(down).toBeLessThan(middle);
    expect(up - middle).toBeCloseTo(middle - down, 5);
  });

  it('stays within bounds at the extremes of the keyboard', () => {
    const lowest = registerLuminosity([21]);
    const highest = registerLuminosity([108]);
    expect(lowest).toBeGreaterThan(0.5);
    expect(highest).toBeLessThan(1.5);
    expect(registerLuminosity([12])).toBe(lowest);
  });

  it('is neutral when nothing sounds', () => {
    expect(registerLuminosity([])).toBe(1);
  });
});

/**
 * The look asks for its colour every frame, so the per-frame path memoizes
 * it (messiaenColourCached). It must give exactly messiaenColour's answer.
 */
describe('Messiaen colour, per-frame (memoized)', () => {
  // Small deterministic PRNG so failures reproduce
  const random = (() => {
    let seed = 12345;
    return () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
  })();
  const shuffled = (list) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  it('matches messiaenColour for every pitch-class set, whichever note is the bass', () => {
    const mismatches = [];
    for (let mask = 1; mask < 4096; mask += 1) {
      // eslint-disable-next-line no-bitwise
      const pcs = [...Array(12).keys()].filter((pc) => mask & (1 << pc));
      pcs.forEach((bass) => {
        // The bass an octave below everything else, in a scrambled order
        const notes = shuffled([
          48 + bass,
          ...pcs.filter((pc) => pc !== bass).map((pc) => 60 + pc),
        ]);
        const cached = JSON.stringify(messiaenColourCached(notes));
        if (cached !== JSON.stringify(messiaenColour({ ownNotes: notes }))) mismatches.push(notes);
      });
    }
    expect(mismatches).toEqual([]);
  });

  it('matches messiaenColour for random voicings, octave doublings and repeats', () => {
    for (let trial = 0; trial < 3000; trial += 1) {
      const own = Array.from(
        { length: 1 + Math.floor(random() * 3) },
        () => 36 + Math.floor(random() * 48)
      );
      const heard = Array.from(
        { length: Math.floor(random() * 7) },
        () => 36 + Math.floor(random() * 48)
      );
      const expected = messiaenColour({ ownNotes: own, heardNotes: heard });
      expect(messiaenColourCached([...own, ...heard])).toEqual(expected);
    }
  });

  it('nothing sounding has no colour', () => {
    expect(messiaenColourCached([])).toEqual(messiaenColour({}));
  });

  it('hands back one shared, frozen answer for a repeated harmony', () => {
    const first = messiaenColourCached([60, 62, 64, 67]);
    messiaenColourCached([57, 60, 64]); // another harmony in between
    const again = messiaenColourCached([60, 62, 64, 67]);
    expect(again).toBe(first);
    expect(Object.isFrozen(again)).toBe(true);
    expect(Object.isFrozen(again.reflections)).toBe(true);
  });
});
