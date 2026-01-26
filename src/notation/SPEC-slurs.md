# Notation Library: Slurs Specification

Rendering specification for musical slurs in the SVG notation system.

> **Parent:** [SPEC.md](SPEC.md) · **Audio:** [SPEC-slurs.md](../audio/SPEC-slurs.md)

---

## Overview

Slurs are curved lines connecting two or more notes to indicate legato phrasing. Unlike ties (which connect notes of the same pitch to extend duration), slurs connect notes of **different pitches** to indicate they should be played smoothly, without separation.

### Goals

1. **Correct musical semantics** - Distinguish slurs from ties (different pitches vs. same pitch)
2. **Multi-note spanning** - Support slurs over 2 or more consecutive notes
3. **Visual clarity** - Slur arcs are wider and higher than tie arcs
4. **Consistent with data contract** - Use the shared `slur` property on note objects consumed by both notation and audio systems

---

## Data Structures

### Slur Property on Note Objects

Slurs are expressed via an optional `slur` property on note objects:

```js
{ pitch: "C4", length: "1/4", slur: "start" }   // begins a slur
{ pitch: "D4", length: "1/4" }                    // inside the slur (no property needed)
{ pitch: "E4", length: "1/4" }                    // inside the slur (no property needed)
{ pitch: "F4", length: "1/4", slur: "stop" }     // ends the slur
```

Rules:

- `slur: "start"` - This note is the first note of a slur group.
- `slur: "stop"` - This note is the last note of a slur group.
- Notes between `"start"` and `"stop"` have no `slur` property. Their slur context is inferred from their sequential position between a start and stop.
- A slur MUST have exactly one `"start"` and one `"stop"`.
- A minimum slur spans 2 notes (start and stop on adjacent notes).

### Slurs on Chords

When a slur starts or stops on a chord, the `slur` property goes on the **outermost note** (the note furthest from the staff center, which determines the slur endpoint):

```js
// Slur starts on a chord - property on the outer note
[
  { pitch: "C4", length: "1/4" },
  { pitch: "E4", length: "1/4", slur: "start" },   // top note (outer, stems down)
  { pitch: "G4", length: "1/4" }
]
```

The slur arc attaches to the note that carries the `slur` property within the chord.

### Nested Slurs

Nested slurs are supported. An inner slur can exist entirely within an outer slur:

```js
{ pitch: "C4", length: "1/4", slur: "start" },         // outer slur starts
{ pitch: "D4", length: "1/8", slur: "start" },         // inner slur starts
{ pitch: "E4", length: "1/8", slur: "stop" },          // inner slur ends
{ pitch: "F4", length: "1/4" },
{ pitch: "G4", length: "1/4", slur: "stop" },          // outer slur ends
```

When a note has `slur: "start"` and a slur is already open, this begins a nested (inner) slur. When a note has `slur: "stop"`, it closes the innermost open slur.

**Nesting is stack-based:** start pushes, stop pops.

### Rests Within a Slur

A rest within a slur sequence is valid in notation (the slur arc renders over the rest). The slur does not break. However, this has implications for audio playback (see audio spec).

---

## API Design

### NotationRenderer Additions

No new public API methods are required. Slurs are rendered automatically when `render()` encounters note data containing `slur` properties.

### Query Helpers for Testing

Add to the test context `createNotationContext()`:

```js
getSlurs() {
  return container.querySelectorAll('.slur');
}
```

### Validation

`validateNoteData()` should detect these slur-specific errors:

| Type | Meaning |
|------|---------|
| `unmatched_slur_start` | `slur: "start"` found without a corresponding `"stop"` |
| `unmatched_slur_stop` | `slur: "stop"` found without a preceding `"start"` |
| `invalid_slur_value` | `slur` property has a value other than `"start"` or `"stop"` |

---

## SVG Structure

Slurs render as SVG `<path>` elements using cubic bezier curves, placed after the notes they span:

```xml
<g class="staff staff-0" data-voice-id="melody">
  <!-- Notes render first -->
  <g class="note note-quarter" data-beat="0" transform="translate(100, 70)">...</g>
  <g class="note note-quarter" data-beat="1" transform="translate(140, 50)">...</g>
  <g class="note note-quarter" data-beat="2" transform="translate(180, 60)">...</g>
  <g class="note note-quarter" data-beat="3" transform="translate(220, 40)">...</g>

  <!-- Slur arc rendered after notes -->
  <path class="slur" d="M 100 65 C 130 30, 190 30, 220 35" />
</g>
```

For nested slurs, both arcs render. The inner slur is drawn with a tighter curve:

```xml
<path class="slur slur-outer" d="M 100 65 C 140 20, 200 20, 220 35" />
<path class="slur slur-inner" d="M 140 48 C 150 35, 170 35, 180 55" />
```

### CSS Classes

| Class | Element |
|-------|---------|
| `.slur` | Slur arc path |
| `.slur-outer` | Outer slur in a nested pair |
| `.slur-inner` | Inner slur in a nested pair |

### SVG Styling Defaults

```css
.slur {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
}
```

Slurs are unfilled curves (stroke only), consistent with standard music engraving.

---

## Rendering Details

### Arc Shape

Slurs use a cubic bezier curve (`C` command in SVG path). The curve is defined by:

- **Start point:** Near the note head of the first slurred note
- **End point:** Near the note head of the last slurred note
- **Control points:** Positioned to create a smooth arc that clears all intermediate notes

The arc height and width scale with the span of the slur. Longer slurs produce higher arcs.

**Arc height formula:**

```
baseHeight = 15
spanFactor = (endX - startX) * 0.15
arcHeight = baseHeight + spanFactor
```

Capped at a maximum of 40px to prevent excessively tall arcs on very long slurs.

**IMPORTANT:** Slur arcs MUST be visually distinct from tie arcs. Slurs are wider and higher. A tie connecting two adjacent notes has a flatter, tighter curve. When both appear in the same passage, the difference should be immediately apparent.

### Direction

The slur arc curves **away from the note heads**, following stem direction conventions:

| Condition | Slur Direction |
|-----------|----------------|
| All stems up | Below the notes (arc curves downward) |
| All stems down | Above the notes (arc curves upward) |
| Mixed stems | Follow the majority stem direction |
| Equal split | Above the notes (default) |

**Rationale:** The slur sits on the opposite side from the stems to avoid collision with stems and beams.

### Endpoint Positioning

- **Stems up (slur below):** Arc endpoints attach near the bottom of the note head, offset slightly toward the center of the slur span.
- **Stems down (slur above):** Arc endpoints attach near the top of the note head, offset slightly toward the center of the slur span.
- **Horizontal offset:** 2px inward from the note head center (so the slur does not start/end at the exact edge of the note head).

### Multi-Note Slurs

For slurs spanning 3+ notes, the bezier control points must ensure the arc clears all intermediate note heads:

1. Calculate the highest (or lowest, depending on direction) Y position among all spanned notes.
2. Place control points so the arc peak is at least 8px beyond that extreme Y value.
3. Distribute control points at roughly 1/3 and 2/3 of the horizontal span for a natural curve.

### Cross-System Slurs

When a slur spans across a system break (line break in the notation):

1. **First system:** Draw the slur arc from the start note to the right edge of the system, with the curve trailing off (open-ended).
2. **Second system:** Draw the slur arc from the left edge of the system to the stop note, with the curve arriving (open-ended start).

Both halves use the CSS class `.slur` plus `.slur-continued` to indicate a split slur.

### Nested Slur Rendering

When slurs nest:

- The **outer slur** renders at normal height.
- The **inner slur** renders with a tighter, lower arc (reduced `arcHeight` by 40%) and is drawn closer to the note heads.
- Both use `.slur` class; the outer additionally gets `.slur-outer`, the inner gets `.slur-inner`.
- Maximum nesting depth: 2 levels. Deeper nesting is a validation warning (not an error).

---

## File Structure

New and modified files:

```
src/notation/
├── components/
│   └── Slur.js              # NEW - Slur arc rendering
│
├── lib/
│   └── slurGrouping.js      # NEW - Parse slur start/stop into span groups
│   └── slurGrouping.test.js # NEW - Unit tests for slur grouping logic
│
├── __tests__/
│   └── fixtures/
│       └── songs/
│           ├── with-slurs.json         # NEW - Basic slur patterns
│           └── with-nested-slurs.json  # NEW - Nested slur patterns
│
├── NotationRenderer.js       # MODIFIED - Integrate slur rendering pass
└── NotationRenderer.test.js  # MODIFIED - Add slur integration tests
```

### Slur.js

Responsible for:
- Computing bezier control points from note positions
- Determining arc direction from stem directions
- Generating SVG `<path>` elements

### slurGrouping.js

Responsible for:
- Scanning a note array for `slur: "start"` and `slur: "stop"` pairs
- Returning an array of slur group objects: `{ startIndex, stopIndex, nested: boolean }`
- Handling nested slur detection (stack-based)
- Reporting unmatched slurs as errors

---

## Testing Approach

Follow the project's integration testing philosophy from `TESTING.md`. Test through `createNotationContext()`.

### Example Tests

```js
describe('slur rendering', () => {
  let ctx;

  beforeEach(() => {
    ctx = createNotationContext();
  });

  afterEach(() => {
    ctx.destroy();
  });

  it('renders a slur arc between two notes', () => {
    ctx.render([
      { pitch: 'C4', length: '1/4', slur: 'start' },
      { pitch: 'E4', length: '1/4', slur: 'stop' }
    ]);

    const slurs = ctx.getSlurs();
    expect(slurs).toHaveLength(1);
    expect(slurs[0].tagName).toBe('path');
  });

  it('renders a slur spanning multiple notes', () => {
    ctx.render([
      { pitch: 'C4', length: '1/4', slur: 'start' },
      { pitch: 'D4', length: '1/4' },
      { pitch: 'E4', length: '1/4' },
      { pitch: 'F4', length: '1/4', slur: 'stop' }
    ]);

    const slurs = ctx.getSlurs();
    expect(slurs).toHaveLength(1);
  });

  it('renders nested slurs as two separate arcs', () => {
    ctx.render([
      { pitch: 'C4', length: '1/4', slur: 'start' },
      { pitch: 'D4', length: '1/8', slur: 'start' },
      { pitch: 'E4', length: '1/8', slur: 'stop' },
      { pitch: 'F4', length: '1/4', slur: 'stop' }
    ]);

    const slurs = ctx.getSlurs();
    expect(slurs).toHaveLength(2);
    expect(ctx.container.querySelector('.slur-outer')).not.toBeNull();
    expect(ctx.container.querySelector('.slur-inner')).not.toBeNull();
  });

  it('places slur above notes when stems point down', () => {
    // Notes above middle line have stems down -> slur above
    ctx.render([
      { pitch: 'A5', length: '1/4', slur: 'start' },
      { pitch: 'B5', length: '1/4', slur: 'stop' }
    ]);

    const slur = ctx.getSlurs()[0];
    const pathData = slur.getAttribute('d');
    // Control points should have Y values less than note Y (above on screen)
    // Exact assertion depends on note positions, but the arc should curve upward
    expect(pathData).toBeDefined();
  });

  it('places slur below notes when stems point up', () => {
    // Notes below middle line have stems up -> slur below
    ctx.render([
      { pitch: 'C4', length: '1/4', slur: 'start' },
      { pitch: 'D4', length: '1/4', slur: 'stop' }
    ]);

    const slur = ctx.getSlurs()[0];
    const pathData = slur.getAttribute('d');
    expect(pathData).toBeDefined();
  });

  it('does not render a slur when no slur properties are present', () => {
    ctx.render([
      { pitch: 'C4', length: '1/4' },
      { pitch: 'E4', length: '1/4' }
    ]);

    expect(ctx.getSlurs()).toHaveLength(0);
  });

  it('renders slur across a rest without breaking', () => {
    ctx.render([
      { pitch: 'C4', length: '1/4', slur: 'start' },
      { length: '1/4' },
      { pitch: 'E4', length: '1/4', slur: 'stop' }
    ]);

    expect(ctx.getSlurs()).toHaveLength(1);
  });
});
```

### Validation Tests

```js
describe('slur validation', () => {
  it('reports error for unmatched slur start', () => {
    const result = validateNoteData([
      { pitch: 'C4', length: '1/4', slur: 'start' },
      { pitch: 'E4', length: '1/4' }
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('unmatched_slur_start');
  });

  it('reports error for unmatched slur stop', () => {
    const result = validateNoteData([
      { pitch: 'C4', length: '1/4' },
      { pitch: 'E4', length: '1/4', slur: 'stop' }
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('unmatched_slur_stop');
  });

  it('reports error for invalid slur value', () => {
    const result = validateNoteData([
      { pitch: 'C4', length: '1/4', slur: 'middle' }
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('invalid_slur_value');
  });
});
```

### Test Fixtures

Add to `__tests__/fixtures/songs/`:

```js
// with-slur.json
[
  { "pitch": "C4", "length": "1/4", "slur": "start" },
  { "pitch": "D4", "length": "1/4" },
  { "pitch": "E4", "length": "1/4" },
  { "pitch": "F4", "length": "1/4", "slur": "stop" }
]

// with-nested-slurs.json
[
  { "pitch": "C4", "length": "1/4", "slur": "start" },
  { "pitch": "D4", "length": "1/8", "slur": "start" },
  { "pitch": "E4", "length": "1/8", "slur": "stop" },
  { "pitch": "F4", "length": "1/4" },
  { "pitch": "G4", "length": "1/4", "slur": "stop" }
]
```

---

## Gotchas and Edge Cases

### Slurs vs. Ties

This is the most critical distinction. See [SPEC-ties.md](SPEC-ties.md) for the tie specification.

| Feature | Tie | Slur |
|---------|-----|------|
| Connects | Same pitch | Different pitches |
| Musical effect | Extends duration (audio merges notes) | Legato phrasing (audio smooths transitions) |
| Visual arc | Tight, flat curve close to note heads | Wider, higher arc |
| Data property | `tie: "start"/"stop"/"continue"` | `slur: "start"/"stop"` |
| Span | 2 or more notes (using `continue` for chains) | 2 or more notes |

**IMPORTANT:** If a slur connects two notes of the **same pitch**, it is visually ambiguous with a tie. The renderer should still draw it as a slur (wider arc), but this situation likely indicates a data error. Consider emitting a validation warning (not error) for this case.

### Slurs on Chords

- The slur attaches to the **outermost note** of the chord (the note carrying the `slur` property).
- "Outermost" means the note furthest from the staff center in the direction the slur curves.
- If the slur is above, attach to the highest note. If below, attach to the lowest note.

### Very Long Slurs

Slurs spanning many notes (8+) should:
- Cap arc height at 40px to prevent visual dominance
- Use a flatter curve that still clears intermediate notes
- Consider a slight S-curve for very long spans to look more natural

### Slurs Across Bar Lines

Slurs do not break at bar lines. The arc passes over the bar line uninterrupted. This is different from ties, which are sometimes redrawn at bar line boundaries. A slur is a single continuous arc regardless of measure divisions.

### Slurs and Beaming

Slurs are independent of beaming. A slur can start/stop on beamed notes. The slur arc is drawn outside the beam (above a beam group if the slur is above, below if below). Ensure there is at least 4px clearance between the slur arc and any beam.

### Empty Slur (Start and Stop on Same Note)

If a note has both `slur: "start"` on one note and `slur: "stop"` on the immediately next note, and there are no intermediate notes, this is a valid 2-note slur. However, `slur: "start"` and `slur: "stop"` on the **same note** is invalid and should produce a validation error.

### Interaction with Dotted Notes

Dotted notes within a slur render normally. The augmentation dot does not affect the slur arc positioning. The slur endpoint attaches to the note head, not the dot.

---

*Spec Version: 1.0*
*Created: 2026-01-25*
