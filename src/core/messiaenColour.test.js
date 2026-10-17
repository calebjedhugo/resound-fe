/**
 * Messiaen colour: a creature's lit colour comes from the harmony around it.
 * The best-covering major/minor triad sets the MAIN colour; sounding pitch
 * classes outside it are dissonant added notes, shown as REFLECTIONS in the
 * major-key colour of each. See DESIGN.md "Creature look".
 */
import {
  messiaenColour,
  messiaenColourCached,
  pitchClassOf,
  triadColour,
  majorKeyColour,
  MESSIAEN_TRIAD_COLOURS,
} from 'core/messiaenColour';

const C = 0;
const Db = 1;
const D = 2;
const E = 4;
const F = 5;
const G = 7;
const A = 9;
const B = 11;

describe('Messiaen colour of a creature', () => {
  it('colours every root, major and minor, with a distinct-per-key table entry', () => {
    expect(MESSIAEN_TRIAD_COLOURS).toHaveLength(12);
    MESSIAEN_TRIAD_COLOURS.forEach((entry) => {
      expect(Number.isInteger(entry.major.hex)).toBe(true);
      expect(Number.isInteger(entry.minor.hex)).toBe(true);
    });
    expect(MESSIAEN_TRIAD_COLOURS[C].major.name).toBe('white');
    expect(MESSIAEN_TRIAD_COLOURS[A].minor.name).toBe('pale blue');
  });

  it('reads pitch classes from pitch names, sharps and flats alike', () => {
    expect(pitchClassOf('C4')).toBe(C);
    expect(pitchClassOf('C#5')).toBe(Db);
    expect(pitchClassOf('Db3')).toBe(Db);
    expect(pitchClassOf('Eb4')).toBe(3);
    expect(pitchClassOf('B2')).toBe(B);
  });

  it('a lone note glows in the colour of its own major triad', () => {
    for (let pc = 0; pc < 12; pc += 1) {
      const colour = messiaenColour({ ownNotes: [pc] });
      expect(colour.main).toBe(MESSIAEN_TRIAD_COLOURS[pc].major.hex);
      expect(colour.reflections).toEqual([]);
    }
  });

  it('a lone heard note (nothing of its own sounding) is also its own major triad', () => {
    expect(messiaenColour({ heardNotes: [A] }).main).toBe(triadColour(A, 'major'));
  });

  it('nothing sounding has no colour', () => {
    expect(messiaenColour({ ownNotes: [], heardNotes: [] })).toEqual({
      main: null,
      reflections: [],
      triad: null,
    });
  });

  it('a major third takes the colour of the major triad it belongs to', () => {
    // C+E sits in C major and A minor; the tie goes to major
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
    expect(colour.triad).not.toEqual({ root: F, quality: 'major' });
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

  it('a dissonant added note shows as a reflection in its own major-key colour', () => {
    // C major triad + D: the tonal core stays white, D adds a green reflection
    const colour = messiaenColour({ ownNotes: [C], heardNotes: [E, G, D] });
    expect(colour.main).toBe(triadColour(C, 'major'));
    expect(colour.reflections).toEqual([majorKeyColour(D)]);
  });

  it('the chord around a creature outranks its own note', () => {
    // D sung against a C-major triad: the tonal core is C major (white) and
    // the creature's own D is the dissonant added note — a green reflection
    const colour = messiaenColour({ ownNotes: [D], heardNotes: [C, E, G] });
    expect(colour.triad).toEqual({ root: C, quality: 'major' });
    expect(colour.reflections).toEqual([majorKeyColour(D)]);
  });

  it('every voice in one chord gets the same colour', () => {
    const chord = [60, 62, 64, 67]; // C4 D4 E4 G4
    const colours = chord.map((own) =>
      messiaenColour({ ownNotes: [own], heardNotes: chord.filter((n) => n !== own) })
    );
    colours.forEach((colour) => {
      expect(colour.main).toBe(colours[0].main);
      expect(colour.triad).toEqual({ root: C, quality: 'major' });
    });
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
    // bass, so this is Am7 — pale blue, with G reflecting
    const colour = messiaenColour({ ownNotes: [45], heardNotes: [60, 64, 67] });
    expect(colour.triad).toEqual({ root: A, quality: 'minor' });
    expect(colour.reflections).toEqual([majorKeyColour(G)]);
    // Same notes with C in the bass: C major, A reflecting
    expect(messiaenColour({ ownNotes: [69], heardNotes: [48, 64, 67] }).triad).toEqual({
      root: C,
      quality: 'major',
    });
  });

  it('lists each reflection once, the creature’s own added notes first', () => {
    const colour = messiaenColour({
      ownNotes: [C, Db],
      heardNotes: [E, G, B, Db, B],
    });
    expect(colour.main).toBe(triadColour(C, 'major'));
    expect(colour.reflections).toEqual([majorKeyColour(Db), majorKeyColour(B)]);
  });

  it('octaves and repeated notes do not change the colour', () => {
    const once = messiaenColour({ ownNotes: [E], heardNotes: [C] });
    const doubled = messiaenColour({ ownNotes: [E, E + 12], heardNotes: [C, C] });
    expect(doubled).toEqual(once);
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
    expect(messiaenColourCached([])).toEqual({ main: null, reflections: [], triad: null });
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
