# Notation Library: Tuplets Specification

Extends the notation library to render tuplet groups -- N notes in the space of M -- with correct spacing, beaming, brackets, and numbers.

> **Parent:** [SPEC.md](SPEC.md) · **Audio:** [SPEC-tuplets.md](../audio/SPEC-tuplets.md)

---

## Goals

1. Support arbitrary tuplet ratios `[actual, normal]` where `actual` notes fill the time of `normal`
2. Render standard notation: bracket, number, correct horizontal spacing
3. Handle tuplets containing notes, rests, chords, dotted notes, and mixed durations
4. Keep tuplet rendering logic isolated so it integrates cleanly without disrupting existing note/beam rendering
5. No nested tuplet support in initial implementation

---

## Data Structures

### Tuplet Wrapper Object

A tuplet is represented as a wrapper object within a voice's `notes` array, alongside note objects, rest objects, and chord arrays:

```js
{
  tuplet: [3, 2],  // [actual, normal] -- 3 notes in the space of 2
  notes: [
    { pitch: "C4", length: "1/8" },
    { pitch: "D4", length: "1/8" },
    { pitch: "E4", length: "1/8" }
  ]
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `tuplet` | `[int, int]` | `[actual, normal]`. Both must be positive integers. |
| `notes` | `Array` | Array of note, rest, and/or chord elements. Same types as the top-level `notes` array. Must be non-empty. |

**Semantics:**

- `tuplet[0]` (actual): How many notes are played
- `tuplet[1]` (normal): How many notes they replace in duration
- The `length` on each inner note is the **face value** -- the rhythmic value written on paper
- **Effective duration** = face value * (normal / actual)

### Duration Scaling

Each note inside a tuplet has its timing modified by the ratio `normal / actual`:

```
effective_duration = face_duration * (normal / actual)
```

For a triplet `[3, 2]` of eighth notes:
- Face value: 1/8
- Scale factor: 2/3
- Effective duration: 1/8 * 2/3 = 1/12 of a whole note
- Total group duration: 3 * 1/12 = 1/4 = the space of 2 eighth notes (correct)

### Common Ratios

| Ratio | Name | Meaning |
|-------|------|---------|
| `[3, 2]` | Triplet | 3 notes in the space of 2 |
| `[5, 4]` | Quintuplet | 5 notes in the space of 4 |
| `[6, 4]` | Sextuplet | 6 notes in the space of 4 |
| `[7, 4]` | Septuplet | 7 notes in the space of 4 |
| `[7, 8]` | Septuplet (compressed) | 7 notes in the space of 8 |
| `[3, 4]` | Triplet (augmentation) | 3 notes in the space of 4 |
| `[2, 3]` | Duplet | 2 notes in the space of 3 (compound time) |

### Unequal Subdivisions

Notes within a tuplet do NOT need to have uniform face values. This is valid:

```js
{
  tuplet: [3, 2],
  notes: [
    { pitch: "C4", length: "1/4" },   // quarter note
    { pitch: "D4", length: "1/8" },   // eighth note
    { pitch: "E4", length: "1/8" }    // eighth note
  ]
}
```

Each note's effective duration is still its face value scaled by `normal / actual`. The total group duration is the sum of all effective durations.

### Tuplets Containing Rests

Rests within tuplets follow the same duration scaling:

```js
{
  tuplet: [3, 2],
  notes: [
    { pitch: "C4", length: "1/8" },
    { length: "1/8" },                // rest, scaled by 2/3
    { pitch: "E4", length: "1/8" }
  ]
}
```

### Tuplets Containing Chords

Chord arrays within tuplets are supported:

```js
{
  tuplet: [3, 2],
  notes: [
    [{ pitch: "C4", length: "1/8" }, { pitch: "E4", length: "1/8" }],  // chord
    { pitch: "D4", length: "1/8" },
    { pitch: "F4", length: "1/8" }
  ]
}
```

### Dotted Notes Within Tuplets

Apply the dot multiplier (1.5x) to the face value first, then apply tuplet scaling:

```js
{ pitch: "C4", length: "1/8", dotted: true }
// Face duration: 1/8 * 1.5 = 3/16
// In a [3,2] tuplet: 3/16 * (2/3) = 1/8 effective
```

### Parser Detection

See main SPEC.md "Canonical Parser Detection Order" for the complete detection table. Tuplets are detected by having a `tuplet` property (priority 2), which is checked after the `Array.isArray()` chord check (priority 1).

---

## API Design

### New Helpers

```js
// lib/tuplets.js

/**
 * Calculate the effective duration of a note within a tuplet context.
 * @param {string} faceLength - The written length (e.g., "1/8")
 * @param {boolean} dotted - Whether the note is dotted
 * @param {number[]} tupletRatio - [actual, normal]
 * @returns {{ numerator: number, denominator: number }} Effective duration as fraction
 */
export function getTupletNoteDuration(faceLength, dotted, tupletRatio);

/**
 * Calculate the total duration of a tuplet group in beats.
 * @param {object} tupletObj - The tuplet wrapper object
 * @param {number} beatValue - The beat denominator (e.g., 4 for quarter-note beat)
 * @returns {number} Total duration in beats
 */
export function getTupletGroupBeats(tupletObj, beatValue);

/**
 * Validate a tuplet wrapper object.
 * @param {object} tupletObj - The object to validate
 * @returns {{ valid: boolean, errors: Array }} Validation result
 */
export function validateTuplet(tupletObj);
```

### Changes to Existing APIs

**`dataParser.js`:** Must detect objects with a `tuplet` property as a fourth element type during normalization. The `tuplet` property must be preserved through normalization, not silently dropped.

**`fractionToBeats()`:** Does not change. Callers compute effective duration by multiplying the result by `normal / actual`.

**`validateNoteData()`:** Add new error types:

| Type | Meaning |
|------|---------|
| `invalid_tuplet_ratio` | `tuplet` is not a 2-element array of positive integers |
| `empty_tuplet_notes` | `notes` array within tuplet wrapper is empty |
| `nested_tuplet` | A tuplet wrapper found inside another tuplet's notes (not supported) |

---

## SVG Structure

### Tuplet Group Markup

```xml
<g class="tuplet-group" data-tuplet="3:2">
  <!-- The beamed notes (or unbeamed notes) within the tuplet -->
  <g class="beam-group">
    <g class="note note-eighth" data-beat="1.0">...</g>
    <g class="note note-eighth" data-beat="1.333">...</g>
    <g class="note note-eighth" data-beat="1.667">...</g>
    <path class="beam" d="..." />
  </g>

  <!-- Number (always shown) -->
  <text class="tuplet-number">3</text>

  <!-- Bracket (shown only when NOT fully beamed) -->
  <g class="tuplet-bracket">
    <line class="tuplet-bracket-line" x1="..." y1="..." x2="..." y2="..." />
    <line class="tuplet-bracket-tick-left" x1="..." y1="..." x2="..." y2="..." />
    <line class="tuplet-bracket-tick-right" x1="..." y1="..." x2="..." y2="..." />
  </g>
</g>
```

### CSS Classes

| Class | Element |
|-------|---------|
| `.tuplet-group` | Container for the entire tuplet |
| `.tuplet-number` | The number displayed (e.g., "3") |
| `.tuplet-bracket` | Container for bracket lines |
| `.tuplet-bracket-line` | Horizontal bracket line |
| `.tuplet-bracket-tick-left` | Left vertical tick |
| `.tuplet-bracket-tick-right` | Right vertical tick |

---

## Rendering Details

### Bracket and Number Placement

**Number:**
- Always displayed, showing the `actual` count (e.g., "3" for a triplet, "5" for a quintuplet)
- Horizontally centered over/under the tuplet group
- Font size consistent with time signature numerals

**Bracket:**
- A horizontal line with small vertical ticks (4px) at each end
- Shown when the tuplet is NOT fully beamed (i.e., contains rests, contains mixed note values that break beaming, or notes are too long to beam)
- Omitted when the tuplet IS fully beamed (standard engraving convention -- the beam itself visually groups the notes, so only the number is needed)

**Direction:**
- Bracket and number follow stem direction:
  - Stems up: bracket and number above the group
  - Stems down: bracket and number below the group
- Vertical offset: 8px from the nearest beam/stem endpoint or notehead

### Horizontal Spacing

The tuplet group occupies the horizontal space of `normal` notes at the face value's standard width:

```
Group width = normal * spacing(face_value)
```

For example, a triplet `[3, 2]` of eighth notes:
- Normal eighth spacing: 30px
- Group width: 2 * 30px = 60px
- Each of the 3 notes is evenly distributed within 60px (20px apart)

For unequal subdivisions, distribute space proportionally to each note's effective duration within the group width.

### Beaming Within Tuplets

- Tuplet notes beam as a unit, **overriding** the standard "break beam at beat boundary" rule
- All beamable notes (eighths and shorter) within a single tuplet are beamed together
- Maximum beam group size limit (4 notes) is relaxed for tuplets -- a sextuplet `[6, 4]` beams all 6 notes
- If a tuplet contains rests, the beam breaks at the rest (rests cannot be beamed) and the bracket is shown
- If a tuplet contains only quarter notes or longer (no beaming possible), the bracket is always shown

### Playback Position Within Tuplets

Beat positions for notes within a tuplet are fractional. For a triplet `[3, 2]` starting at beat 1.0 with eighth-note face values:

```
Note 0: beat 1.0
Note 1: beat 1.0 + (2/3 * 0.5) = beat 1.333
Note 2: beat 1.0 + (4/3 * 0.5) = beat 1.667
```

The `data-beat` attribute on each note element must reflect these fractional positions for `setPlaybackPosition()` to correctly highlight tuplet notes.

---

## File Structure

New files:

```
src/notation/
├── lib/
│   ├── tuplets.js              # Duration math, validation, ratio helpers
│   └── tuplets.test.js         # Unit tests for tuplet math
│
├── components/
│   └── TupletBracket.js        # Bracket + number SVG rendering
│
└── __tests__/
    └── fixtures/
        └── songs/
            ├── triplets.json           # Basic triplet patterns
            ├── quintuplets.json        # 5:4 ratio
            └── mixed-tuplets.json      # Tuplets with rests, chords, mixed values
```

Modified files:

```
├── lib/
│   ├── dataParser.js           # Add tuplet element detection
│   └── beaming.js              # Tuplet beaming override
│
├── components/
│   └── Beam.js                 # Integrate with tuplet beaming rules
│
├── NotationRenderer.js         # Tuplet layout and rendering pipeline
└── index.js                    # Export new helpers
```

---

## Testing Approach

Follow the project's integration testing philosophy from `TESTING.md`. Test through public APIs, mock only browser APIs.

### Tuplet Math Tests (`lib/tuplets.test.js`)

```js
describe('tuplet duration math', () => {
  it('calculates triplet eighth as 2/3 of normal eighth', () => {
    const result = getTupletNoteDuration('1/8', false, [3, 2]);
    // 1/8 * 2/3 = 1/12
    expect(result).toEqual({ numerator: 1, denominator: 12 });
  });

  it('calculates quintuplet sixteenth', () => {
    const result = getTupletNoteDuration('1/16', false, [5, 4]);
    // 1/16 * 4/5 = 1/20
    expect(result).toEqual({ numerator: 1, denominator: 20 });
  });

  it('handles dotted notes in tuplets (dot applied before tuplet scaling)', () => {
    const result = getTupletNoteDuration('1/8', true, [3, 2]);
    // dotted 1/8 = 3/16, then * 2/3 = 1/8
    expect(result).toEqual({ numerator: 1, denominator: 8 });
  });

  it('calculates total group duration in beats', () => {
    const group = {
      tuplet: [3, 2],
      notes: [
        { pitch: 'C4', length: '1/8' },
        { pitch: 'D4', length: '1/8' },
        { pitch: 'E4', length: '1/8' }
      ]
    };
    // 3 eighths * (2/3) = 2 eighths = 1 beat in 4/4
    expect(getTupletGroupBeats(group, 4)).toBe(1);
  });
});
```

### Tuplet Validation Tests

```js
describe('tuplet validation', () => {
  it('rejects non-array tuplet property', () => {
    const result = validateTuplet({ tuplet: 3, notes: [...] });
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('invalid_tuplet_ratio');
  });

  it('rejects tuplet with non-positive integers', () => {
    const result = validateTuplet({ tuplet: [0, 2], notes: [...] });
    expect(result.valid).toBe(false);
  });

  it('rejects empty notes array', () => {
    const result = validateTuplet({ tuplet: [3, 2], notes: [] });
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('empty_tuplet_notes');
  });

  it('rejects nested tuplets', () => {
    const result = validateTuplet({
      tuplet: [3, 2],
      notes: [
        { tuplet: [5, 4], notes: [...] },  // nested -- not allowed
        { pitch: 'C4', length: '1/8' },
        { pitch: 'D4', length: '1/8' }
      ]
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('nested_tuplet');
  });
});
```

### Rendering Integration Tests

```js
describe('tuplet rendering', () => {
  let ctx;

  beforeEach(() => { ctx = createNotationContext(); });
  afterEach(() => { ctx.destroy(); });

  it('renders a tuplet group with bracket and number', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        {
          tuplet: [3, 2],
          notes: [
            { pitch: 'C4', length: '1/4' },
            { pitch: 'D4', length: '1/4' },
            { pitch: 'E4', length: '1/4' }
          ]
        },
        { pitch: 'F4', length: '1/2' }
      ]
    });

    const groups = ctx.container.querySelectorAll('.tuplet-group');
    expect(groups).toHaveLength(1);

    const number = ctx.container.querySelector('.tuplet-number');
    expect(number.textContent).toBe('3');

    // Quarter notes are not beamed, so bracket is shown
    const bracket = ctx.container.querySelector('.tuplet-bracket');
    expect(bracket).not.toBeNull();
  });

  it('omits bracket when tuplet is fully beamed', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        {
          tuplet: [3, 2],
          notes: [
            { pitch: 'C4', length: '1/8' },
            { pitch: 'D4', length: '1/8' },
            { pitch: 'E4', length: '1/8' }
          ]
        },
        { pitch: 'F4', length: '1/4' }
      ]
    });

    // Eighth notes are fully beamed, bracket omitted
    const bracket = ctx.container.querySelector('.tuplet-bracket');
    expect(bracket).toBeNull();

    // Number still shown
    const number = ctx.container.querySelector('.tuplet-number');
    expect(number.textContent).toBe('3');
  });

  it('renders tuplet containing rests with bracket', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        {
          tuplet: [3, 2],
          notes: [
            { pitch: 'C4', length: '1/8' },
            { length: '1/8' },              // rest breaks beam
            { pitch: 'E4', length: '1/8' }
          ]
        }
      ]
    });

    // Rest breaks beaming, so bracket is shown
    const bracket = ctx.container.querySelector('.tuplet-bracket');
    expect(bracket).not.toBeNull();
  });

  it('beams all notes in a tuplet as a single group', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        {
          tuplet: [6, 4],
          notes: [
            { pitch: 'C4', length: '1/8' },
            { pitch: 'D4', length: '1/8' },
            { pitch: 'E4', length: '1/8' },
            { pitch: 'F4', length: '1/8' },
            { pitch: 'G4', length: '1/8' },
            { pitch: 'A4', length: '1/8' }
          ]
        }
      ]
    });

    // All 6 beamed as one group, not split at beat boundaries
    const beamGroups = ctx.container.querySelectorAll('.beam-group');
    expect(beamGroups).toHaveLength(1);
  });

  it('handles quintuplet ratio [5, 4]', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        {
          tuplet: [5, 4],
          notes: [
            { pitch: 'C4', length: '1/4' },
            { pitch: 'D4', length: '1/4' },
            { pitch: 'E4', length: '1/4' },
            { pitch: 'F4', length: '1/4' },
            { pitch: 'G4', length: '1/4' }
          ]
        }
      ]
    });

    const number = ctx.container.querySelector('.tuplet-number');
    expect(number.textContent).toBe('5');
  });

  it('highlights tuplet notes at fractional beat positions during playback', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        {
          tuplet: [3, 2],
          notes: [
            { pitch: 'C4', length: '1/8' },
            { pitch: 'D4', length: '1/8' },
            { pitch: 'E4', length: '1/8' }
          ]
        }
      ]
    });

    // Second note of triplet at beat 0.333
    ctx.renderer.setPlaybackPosition(0.333);
    const active = ctx.container.querySelector('.note-active');
    expect(active).not.toBeNull();
  });

  it('renders tuplet with mixed note values', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        {
          tuplet: [3, 2],
          notes: [
            { pitch: 'C4', length: '1/4' },
            { pitch: 'D4', length: '1/8' },
            { pitch: 'E4', length: '1/8' }
          ]
        }
      ]
    });

    // Mixed values means partial beaming, so bracket is shown
    const bracket = ctx.container.querySelector('.tuplet-bracket');
    expect(bracket).not.toBeNull();
  });

  it('renders tuplet containing a chord', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        {
          tuplet: [3, 2],
          notes: [
            [{ pitch: 'C4', length: '1/8' }, { pitch: 'E4', length: '1/8' }],
            { pitch: 'D4', length: '1/8' },
            { pitch: 'F4', length: '1/8' }
          ]
        }
      ]
    });

    const groups = ctx.container.querySelectorAll('.tuplet-group');
    expect(groups).toHaveLength(1);
    const chords = ctx.container.querySelectorAll('.chord');
    expect(chords).toHaveLength(1);
  });
});
```

### Test Fixtures

```json
// triplets.json
{
  "timeSignature": [4, 4],
  "notes": [
    {
      "tuplet": [3, 2],
      "notes": [
        { "pitch": "C4", "length": "1/8" },
        { "pitch": "D4", "length": "1/8" },
        { "pitch": "E4", "length": "1/8" }
      ]
    },
    { "pitch": "F4", "length": "1/4" },
    { "pitch": "G4", "length": "1/4" },
    { "pitch": "A4", "length": "1/4" }
  ]
}
```

```json
// quintuplets.json
{
  "timeSignature": [4, 4],
  "notes": [
    {
      "tuplet": [5, 4],
      "notes": [
        { "pitch": "C4", "length": "1/4" },
        { "pitch": "D4", "length": "1/4" },
        { "pitch": "E4", "length": "1/4" },
        { "pitch": "F4", "length": "1/4" },
        { "pitch": "G4", "length": "1/4" }
      ]
    }
  ]
}
```

```json
// mixed-tuplets.json
{
  "timeSignature": [4, 4],
  "notes": [
    {
      "tuplet": [3, 2],
      "notes": [
        { "pitch": "C4", "length": "1/4" },
        { "length": "1/8" },
        { "pitch": "E4", "length": "1/8" }
      ]
    },
    {
      "tuplet": [3, 2],
      "notes": [
        [{ "pitch": "C4", "length": "1/8" }, { "pitch": "E4", "length": "1/8" }],
        { "pitch": "D4", "length": "1/8" },
        { "pitch": "F4", "length": "1/8" }
      ]
    }
  ]
}
```

---

## Gotchas

### Nested Tuplets

Nested tuplets (a tuplet wrapper inside another tuplet's `notes` array) are excluded from initial support. The validator must reject them with a `nested_tuplet` error. This avoids compounding ratio math and deeply nested SVG structures.

### Tuplets Crossing Bar Lines

In initial support, a tuplet group must fit entirely within one measure. If a tuplet's total duration would cross a bar line, the validator should produce a warning or error. This avoids splitting tuplet brackets across bar lines, which requires complex layout logic (bracket continuation marks, split numbering).

### Unequal Subdivisions

A tuplet's inner notes do NOT need uniform face values. A triplet `[3, 2]` could contain a quarter + two eighths. Each note's effective duration is independently scaled by `normal / actual`. The renderer must space these proportionally within the group width rather than distributing evenly.

### Dotted Notes

Apply the dotted multiplier (1.5x) to the face value BEFORE applying the tuplet ratio. The rendering must show both the augmentation dot and the tuplet bracket/number.

### Rests Within Tuplets

Rests inherit tuplet timing. A rest inside a `[3, 2]` tuplet has its face duration scaled by `2/3`, just like a note. Rests break beaming, which triggers the bracket to appear.

### Chords Within Tuplets

Chord arrays inside a tuplet's `notes` are valid. Duration scaling applies to the chord's length (taken from the first note per existing chord rules). All notes in the chord sound simultaneously at the tuplet-scaled timing.

### Validation

- `tuplet` must be a 2-element array: `[actual, normal]`
- Both elements must be positive integers (> 0)
- `notes` within the wrapper must be a non-empty array
- Each element in `notes` must be a valid note, rest, chord, but NOT another tuplet wrapper
- The `tuplet` property name is reserved -- note objects must not use it for other purposes

---

*Spec Version: 1.0*
*Created: 2026-01-25*
*Parent Spec: SPEC.md v1.5 (Future Feature Specs table)*
