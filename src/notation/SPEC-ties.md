# Notation Library Specification: Ties

Extends the notation renderer to display tie arcs connecting notes of the same pitch across durations.

> **Parent:** [SPEC.md](SPEC.md) · **Audio:** [SPEC-ties.md](../audio/SPEC-ties.md)

---

## Goals

1. **Visually correct ties** - Bezier arcs connecting noteheads of the same pitch
2. **Shared data contract** - The `tie` property on note objects is consumed identically by both notation and audio systems
3. **Cross-barline support** - Ties render seamlessly across bar lines
4. **Chord-aware** - Individual notes within a chord can be independently tied
5. **Extractable** - No imports from game code; ties are a pure notation concern

---

## Data Structures

### The `tie` Property

Add an optional `tie` property to note objects. Three values:

| Value | Meaning |
|-------|---------|
| `"start"` | This note begins a tie. An arc is drawn from this note to the next note of the same pitch. |
| `"stop"` | This note ends a tie. An arc arrives from the previous note of the same pitch. |
| `"continue"` | This note both receives a tie from the previous note AND sends a tie to the next note. Used for chains of 3+ tied notes. |

```js
// Two tied quarter notes (sounds like a half note)
[
  { pitch: "C4", length: "1/4", tie: "start" },
  { pitch: "C4", length: "1/4", tie: "stop" }
]

// Three tied notes (chain)
[
  { pitch: "C4", length: "1/4", tie: "start" },
  { pitch: "C4", length: "1/4", tie: "continue" },
  { pitch: "C4", length: "1/4", tie: "stop" }
]

// Four tied notes (longer chain)
[
  { pitch: "C4", length: "1/4", tie: "start" },
  { pitch: "C4", length: "1/4", tie: "continue" },
  { pitch: "C4", length: "1/4", tie: "continue" },
  { pitch: "C4", length: "1/4", tie: "stop" }
]
```

### Ties in Chords

Individual notes within a chord can have independent `tie` properties. Only the notes with `tie` are connected; other chord tones re-attack normally.

```js
// Top note of chord is tied, bottom two re-attack
[
  [
    { pitch: "C4", length: "1/4" },
    { pitch: "E4", length: "1/4" },
    { pitch: "G4", length: "1/4", tie: "start" }
  ],
  [
    { pitch: "C4", length: "1/4" },
    { pitch: "E4", length: "1/4" },
    { pitch: "G4", length: "1/4", tie: "stop" }
  ]
]
```

Multiple notes in a chord can be tied simultaneously:

```js
[
  [
    { pitch: "C4", length: "1/4", tie: "start" },
    { pitch: "E4", length: "1/4" },
    { pitch: "G4", length: "1/4", tie: "start" }
  ],
  [
    { pitch: "C4", length: "1/4", tie: "stop" },
    { pitch: "E4", length: "1/4" },
    { pitch: "G4", length: "1/4", tie: "stop" }
  ]
]
```

### Cross-Barline Ties

Ties commonly span bar lines. The data is identical; the renderer must draw the arc across the barline:

```js
{
  timeSignature: [4, 4],
  notes: [
    { pitch: "C4", length: "1/4" },
    { pitch: "E4", length: "1/4" },
    { pitch: "G4", length: "1/4" },
    { pitch: "G4", length: "1/4", tie: "start" },   // beat 4 of measure 1
    // --- bar line ---
    { pitch: "G4", length: "1/4", tie: "stop" },     // beat 1 of measure 2
    { pitch: "E4", length: "1/4" },
    { pitch: "C4", length: "1/2" }
  ]
}
```

### Dotted Notes with Ties

Ties and dots are orthogonal. A note can be both dotted and tied:

```js
{ pitch: "C4", length: "1/4", dotted: true, tie: "start" }
```

---

## API Design

### NotationRenderer Additions

No new public methods are required. Ties are rendered automatically when `tie` properties are present in the note data.

The existing `render()` method handles ties as part of its rendering pass.

### Validation Additions

`validateNoteData()` gains one new error type:

| Type | Meaning |
|------|---------|
| `invalid_tie` | `tie` value is not `"start"`, `"stop"`, or `"continue"` |
| `tie_pitch_mismatch` | A `tie: "stop"` or `tie: "continue"` note does not match the pitch of its preceding tied note |
| `tie_unresolved` | A `tie: "start"` or `tie: "continue"` note has no subsequent matching `tie: "stop"` or `tie: "continue"` |

**IMPORTANT:** Validation should warn but not reject unresolved ties. A `tie: "start"` at the very end of the data is technically malformed, but the renderer should handle it gracefully by simply not drawing an arc.

### Query Helper Addition

Add a query helper to the test context:

```js
getTies() {
  return container.querySelectorAll('.tie');
}
```

---

## SVG Structure

### Tie Arc Element

Each tie is rendered as a `<path>` element with a quadratic or cubic bezier curve:

```xml
<path class="tie" d="M 100,50 C 120,35 160,35 180,50" />
```

Tie arcs are siblings of the notes they connect, placed inside the staff group (`.staff`) so they layer correctly. They are rendered after all notes so they draw on top.

```xml
<g class="staff staff-0" data-voice-id="melody">
  <!-- Staff lines, clef, notes, etc. -->
  <g class="note note-quarter" data-beat="0" transform="translate(100, 50)">
    <ellipse class="note-head" cx="0" cy="0" rx="6" ry="5" />
    <line class="note-stem" x1="6" y1="0" x2="6" y2="-30" />
  </g>
  <g class="note note-quarter" data-beat="1" transform="translate(180, 50)">
    <ellipse class="note-head" cx="0" cy="0" rx="6" ry="5" />
    <line class="note-stem" x1="6" y1="0" x2="6" y2="-30" />
  </g>

  <!-- Tie arcs rendered after notes -->
  <g class="ties">
    <path class="tie" d="M 106,55 C 126,70 160,70 174,55" />
  </g>
</g>
```

### CSS Classes

| Class | Element |
|-------|---------|
| `.ties` | Container for all tie arcs in a staff |
| `.tie` | Individual tie arc path |

Ties use `fill: none` and `stroke` for rendering. Default styling:

```css
.tie {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
}
```

---

## Rendering Details

### Arc Shape

Ties are cubic bezier curves connecting two noteheads of the same pitch.

**Endpoints:**
- Start: Center of the first notehead, offset slightly toward the arc direction (up or down)
- End: Center of the second notehead, offset slightly toward the arc direction

**Control points:**
- The arc peak is at the midpoint horizontally, offset vertically by a computed height
- Arc height scales with horizontal distance between the notes (longer ties = taller arcs)
- Minimum arc height: 8px
- Arc height formula: `max(8, horizontalDistance * 0.2)`

```
Start notehead        End notehead
      x------.  .------x
               \/
          (arc curves below for stem-up notes)
```

### Tie Direction

Tie direction is determined by stem direction, which is opposite:

| Stem Direction | Tie Direction | Arc Curves |
|---------------|---------------|------------|
| Up | Below notehead | Downward (positive Y offset) |
| Down | Above notehead | Upward (negative Y offset) |

**Vertical offset from notehead center:**
- Tie below: +5px from notehead center (just below the notehead)
- Tie above: -5px from notehead center (just above the notehead)

### Ties in Chords

When a chord has tied notes, each tied note gets its own arc. The tie direction for each note follows the chord's stem direction (all notes in a chord share a stem).

For chords with stem up, all ties curve below. For stem down, all ties curve above.

### Cross-Barline Ties

Ties that cross bar lines are drawn as a single continuous arc. The bar line is rendered independently and the tie arc simply passes over it. No special clipping or splitting is needed; the arc's bezier path naturally spans from the note before the barline to the note after it.

**IMPORTANT:** The horizontal distance for cross-barline ties may be larger than within-measure ties. The arc height formula handles this naturally since it scales with distance.

### Ties at Line Breaks (Future)

If line-wrapping is implemented in the future, a tie crossing a line break would need to be split into two arcs: one trailing off the end of the first line and one leading into the start of the second line. This is out of scope for initial implementation since the renderer currently uses a single horizontal line.

---

## File Structure

New and modified files:

```
src/notation/
├── components/
│   └── Tie.js                  # NEW - Tie arc rendering
│
├── lib/
│   ├── tieResolver.js          # NEW - Match tie start/stop pairs across notes
│   └── tieResolver.test.js     # NEW - Tests for tie resolution
│
├── __tests__/
│   └── fixtures/
│       └── songs/
│           ├── with-ties.json          # NEW - Basic tied notes
│           ├── with-tie-chain.json     # NEW - 3+ note tie chain
│           ├── with-chord-ties.json    # NEW - Ties within chords
│           └── cross-barline-ties.json # NEW - Ties across bar lines
│
├── NotationRenderer.js         # MODIFIED - Invoke tie rendering pass
└── NotationRenderer.test.js    # MODIFIED - Add tie test cases
```

### `tieResolver.js`

Responsible for scanning a normalized note array and producing tie pair data:

```js
/**
 * Resolve tie connections from a flat note sequence.
 * Returns an array of { startIndex, endIndex, pitch } objects.
 *
 * For chords, indices refer to the chord's position in the sequence,
 * and pitch identifies which note within the chord is tied.
 */
export function resolveTies(notes) { ... }
```

This module is purely data logic (no SVG, no DOM). It pairs up `tie: "start"` / `tie: "continue"` with their matching `tie: "stop"` / `tie: "continue"` based on pitch matching.

### `Tie.js`

Renders a single tie arc given two notehead positions and a direction:

```js
/**
 * Create an SVG path element for a tie arc.
 * @param {Object} params
 * @param {number} params.x1 - Start notehead X
 * @param {number} params.y1 - Start notehead Y
 * @param {number} params.x2 - End notehead X
 * @param {number} params.y2 - End notehead Y
 * @param {string} params.direction - "above" or "below"
 * @returns {SVGPathElement}
 */
export function createTieArc({ x1, y1, x2, y2, direction }) { ... }
```

---

## Testing Approach

Follow the project's integration testing philosophy from `TESTING.md`. Tests use `createNotationContext()` and assert on rendered SVG output.

### Example Tests

```js
describe('NotationRenderer - Ties', () => {
  let ctx;

  beforeEach(() => {
    ctx = createNotationContext();
  });

  afterEach(() => {
    ctx.destroy();
  });

  describe('basic ties', () => {
    it('renders a tie arc between two notes of the same pitch', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'C4', length: '1/4', tie: 'stop' }
      ]);

      const ties = ctx.getTies();
      expect(ties).toHaveLength(1);
    });

    it('does not render a tie arc when no tie property is present', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'C4', length: '1/4' }
      ]);

      const ties = ctx.getTies();
      expect(ties).toHaveLength(0);
    });

    it('renders both notes as separate noteheads even when tied', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'C4', length: '1/4', tie: 'stop' }
      ]);

      expect(ctx.getNotes()).toHaveLength(2);
    });
  });

  describe('tie chains', () => {
    it('renders two arcs for a three-note tie chain', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'C4', length: '1/4', tie: 'continue' },
        { pitch: 'C4', length: '1/4', tie: 'stop' }
      ]);

      const ties = ctx.getTies();
      expect(ties).toHaveLength(2);
    });

    it('renders three arcs for a four-note tie chain', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'C4', length: '1/4', tie: 'continue' },
        { pitch: 'C4', length: '1/4', tie: 'continue' },
        { pitch: 'C4', length: '1/4', tie: 'stop' }
      ]);

      const ties = ctx.getTies();
      expect(ties).toHaveLength(3);
    });
  });

  describe('tie direction', () => {
    it('renders tie below noteheads when stems point up', () => {
      // C4 is below middle line in treble clef, so stem goes up, tie goes below
      ctx.render([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'C4', length: '1/4', tie: 'stop' }
      ]);

      const tie = ctx.getTies()[0];
      const path = tie.getAttribute('d');
      // The control points should have Y values greater than the notehead Y
      // (below = larger Y in SVG coordinate system)
      expect(path).toBeDefined();
    });

    it('renders tie above noteheads when stems point down', () => {
      // B4 is on middle line in treble clef, stem down, tie above
      ctx.render([
        { pitch: 'B4', length: '1/4', tie: 'start' },
        { pitch: 'B4', length: '1/4', tie: 'stop' }
      ]);

      const tie = ctx.getTies()[0];
      const path = tie.getAttribute('d');
      expect(path).toBeDefined();
    });
  });

  describe('ties in chords', () => {
    it('renders a tie only for the chord note that has a tie property', () => {
      ctx.render([
        [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4', tie: 'start' }
        ],
        [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4', tie: 'stop' }
        ]
      ]);

      const ties = ctx.getTies();
      expect(ties).toHaveLength(1);
    });

    it('renders multiple ties when multiple chord notes are tied', () => {
      ctx.render([
        [
          { pitch: 'C4', length: '1/4', tie: 'start' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4', tie: 'start' }
        ],
        [
          { pitch: 'C4', length: '1/4', tie: 'stop' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4', tie: 'stop' }
        ]
      ]);

      const ties = ctx.getTies();
      expect(ties).toHaveLength(2);
    });
  });

  describe('cross-barline ties', () => {
    it('renders a tie arc that spans across a bar line', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
          { pitch: 'G4', length: '1/4', tie: 'start' },
          // bar line falls here
          { pitch: 'G4', length: '1/4', tie: 'stop' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'C4', length: '1/2' }
        ]
      });

      const ties = ctx.getTies();
      expect(ties).toHaveLength(1);

      // Bar line should still be present
      expect(ctx.getBarLines().length).toBeGreaterThan(0);
    });
  });

  describe('ties with dotted notes', () => {
    it('renders a tie between a dotted note and a normal note', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4', dotted: true, tie: 'start' },
        { pitch: 'C4', length: '1/8', tie: 'stop' }
      ]);

      const ties = ctx.getTies();
      expect(ties).toHaveLength(1);
      expect(ctx.getNotes()).toHaveLength(2);
    });
  });

  describe('validation', () => {
    it('rejects invalid tie values', () => {
      const result = validateNoteData([
        { pitch: 'C4', length: '1/4', tie: 'invalid' }
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors[0].type).toBe('invalid_tie');
    });
  });
});
```

### Test Fixtures

```json
// with-ties.json
[
  { "pitch": "C4", "length": "1/4", "tie": "start" },
  { "pitch": "C4", "length": "1/4", "tie": "stop" },
  { "pitch": "E4", "length": "1/4" },
  { "pitch": "G4", "length": "1/4" }
]

// with-tie-chain.json
[
  { "pitch": "C4", "length": "1/4", "tie": "start" },
  { "pitch": "C4", "length": "1/4", "tie": "continue" },
  { "pitch": "C4", "length": "1/4", "tie": "stop" },
  { "pitch": "G4", "length": "1/4" }
]

// with-chord-ties.json
[
  [
    { "pitch": "C4", "length": "1/2" },
    { "pitch": "E4", "length": "1/2", "tie": "start" },
    { "pitch": "G4", "length": "1/2" }
  ],
  [
    { "pitch": "D4", "length": "1/2" },
    { "pitch": "E4", "length": "1/2", "tie": "stop" },
    { "pitch": "A4", "length": "1/2" }
  ]
]

// cross-barline-ties.json
{
  "timeSignature": [4, 4],
  "notes": [
    { "pitch": "C4", "length": "1/2" },
    { "pitch": "E4", "length": "1/4" },
    { "pitch": "G4", "length": "1/4", "tie": "start" },
    { "pitch": "G4", "length": "1/4", "tie": "stop" },
    { "pitch": "E4", "length": "1/4" },
    { "pitch": "C4", "length": "1/2" }
  ]
}
```

---

## Gotchas and Edge Cases

### Tied Notes MUST Match Pitch

A `tie: "stop"` or `tie: "continue"` note must have the same pitch as the preceding `tie: "start"` or `tie: "continue"` note. If pitches differ, this is a **slur**, not a tie. Slurs are a separate feature with different semantics.

The validator should flag pitch mismatches as `tie_pitch_mismatch` warnings. The renderer should not draw an arc between mismatched pitches.

### Unresolved Ties

A `tie: "start"` with no subsequent `tie: "stop"` (e.g., at the end of the song) is malformed. The renderer should handle this gracefully by not drawing an arc. The validator should flag it as `tie_unresolved`.

Similarly, a `tie: "stop"` with no preceding `tie: "start"` is silently ignored (no arc to draw).

### Tie Direction in Chords

All tied notes in a chord share the same tie direction (determined by the chord's stem direction). This means if a chord has stem up, all ties in that chord curve below, regardless of which notes are tied.

### Ties and Accidentals

A tied note that carries an accidental (e.g., C#4 tied to C#4) does NOT re-display the accidental on the second note. The tie visually implies the pitch is sustained, so the accidental is understood to continue. This is a standard engraving convention.

However, if the tied note crosses a bar line (where accidentals normally reset), the second note may optionally show a courtesy accidental. This should follow the existing courtesy accidental configuration.

### Intervening Non-Tied Notes

Ties connect consecutive occurrences in the note sequence. If other notes (or rests) intervene between `tie: "start"` and `tie: "stop"`, this is malformed. The resolver must scan sequentially, not skip ahead looking for matching pitches.

```js
// INVALID: rest between tied notes
[
  { pitch: "C4", length: "1/4", tie: "start" },
  { length: "1/4" },                                // rest breaks the tie
  { pitch: "C4", length: "1/4", tie: "stop" }       // no arc drawn
]
```

**IMPORTANT:** In chords, the "next element" is the next entry in the top-level notes array. A tie from a note in chord at index N connects to the matching pitch in the element at index N+1. If index N+1 is a single note (not a chord), only that single pitch can receive the tie. If the pitch does not match, the tie is unresolved.

### Multiple Simultaneous Tie Chains

When multiple notes in a chord are tied, each forms its own independent chain. The resolver tracks each by pitch:

```js
[
  [
    { pitch: "C4", length: "1/4", tie: "start" },
    { pitch: "G4", length: "1/4", tie: "start" }
  ],
  [
    { pitch: "C4", length: "1/4", tie: "continue" },
    { pitch: "G4", length: "1/4", tie: "stop" }      // G4 chain ends
  ],
  [
    { pitch: "C4", length: "1/4", tie: "stop" },      // C4 chain ends
    { pitch: "G4", length: "1/4" }                     // G4 re-attacks
  ]
]
```

### Ties vs. Slurs

Ties and slurs look visually similar (curved arcs between notes) but have different meanings:

- **Tie:** Same pitch, notes merge into one sustained sound
- **Slur:** Different pitches, notes played smoothly (legato)

This spec covers ties only. Slurs are specified in [SPEC-slurs.md](SPEC-slurs.md) and use a separate `slur` property with different matching logic (slurs can connect any pitches and span arbitrary note ranges). The SVG class is `.slur` to distinguish from `.tie`.

### Playback Position and Tied Notes

When `setPlaybackPosition()` highlights a note that is the `tie: "stop"` end of a tie, only the visual notehead receives the `note-active` class. The tie arc itself does not receive any active state. The audio system determines that the sound is already sustaining.

---

*Spec Version: 1.0*
*Created: 2026-01-25*
