# Notation Dynamics Specification

Rendering of dynamic markings (volume indicators) and hairpins (gradual volume changes) in SVG staff notation.

> **Parent:** [SPEC.md](SPEC.md) · **Audio:** [SPEC-dynamics.md](../audio/SPEC-dynamics.md)

---

## Goals

1. **Visually accurate** - Dynamics render in their standard positions below the staff
2. **Inline data model** - Dynamics are marker objects placed directly in the `notes` array, not a separate layer
3. **Compatible with audio system** - Both notation and audio consume the same dynamic marker objects
4. **Extractable** - No imports from game code; dynamics are part of the standalone notation library

---

## Data Structures

Dynamics are **inline marker objects** in the `notes` array. They sit between (or before) note objects and are distinguished by having a `dynamic` or `hairpin` property instead of `pitch`/`length`/`position`.

### Point Dynamics (Instant)

A point dynamic sets the volume level from that point forward. It appears between notes in the array and applies starting at the next note.

```js
{ dynamic: "f" }
```

**Supported values:**

| Value | Name | Meaning |
|-------|------|---------|
| `"ppp"` | Pianississimo | As soft as possible |
| `"pp"` | Pianissimo | Very soft |
| `"p"` | Piano | Soft |
| `"mp"` | Mezzo-piano | Moderately soft |
| `"mf"` | Mezzo-forte | Moderately loud |
| `"f"` | Forte | Loud |
| `"ff"` | Fortissimo | Very loud |
| `"fff"` | Fortississimo | As loud as possible |
| `"fp"` | Forte-piano | Loud then immediately soft |
| `"sfz"` | Sforzando | Sudden accent |
| `"sfp"` | Sforzando-piano | Sudden accent then soft |

### Hairpins (Gradual)

Hairpins indicate a gradual increase or decrease in volume over a span of notes. They require a start marker and a stop marker.

**Start marker:**

```js
{ hairpin: "crescendo", start: true }
{ hairpin: "decrescendo", start: true }
```

**Stop marker:**

```js
{ hairpin: "crescendo", stop: true }
{ hairpin: "decrescendo", stop: true }
```

### Full Example

```js
[
  { dynamic: "p" },                           // Start soft
  { pitch: "C4", length: "1/4" },
  { pitch: "D4", length: "1/4" },
  { hairpin: "crescendo", start: true },       // Begin crescendo
  { pitch: "E4", length: "1/4" },
  { pitch: "F4", length: "1/4" },
  { pitch: "G4", length: "1/4" },
  { hairpin: "crescendo", stop: true },        // End crescendo
  { dynamic: "f" },                           // Now loud
  { pitch: "A4", length: "1/4" },
  { pitch: "G4", length: "1/4" },
  { dynamic: "fp" },                          // Loud attack, then soft
  { pitch: "C5", length: "1/2" }
]
```

### Parser Detection

See main SPEC.md "Canonical Parser Detection Order" for the complete detection table. Dynamic markers are detected by having a `dynamic` property (priority 10) and hairpin markers by having a `hairpin` property (priority 11).

**IMPORTANT:** Dynamic markers have no `length` property. They do not occupy rhythmic time. They are positional annotations attached to whatever note follows them in the array.

### Validation

New error types for `validateNoteData()`:

| Type | Meaning |
|------|---------|
| `invalid_dynamic` | `dynamic` value not in supported list |
| `invalid_hairpin` | `hairpin` value not `"crescendo"` or `"decrescendo"` |
| `unmatched_hairpin` | A hairpin start without a matching stop, or vice versa |
| `nested_hairpin` | A hairpin start inside an already-open hairpin of the same type |

---

## API Design

No new public API methods. Dynamics rendering is automatic when dynamic markers are present in the note data.

### NotationRenderer Changes

- `render(songData)` - Now processes dynamic markers during rendering. No API change.
- `parseNoteData()` - Preserves dynamic markers in the normalized output. They remain inline in the notes array.
- `validateNoteData()` - Validates dynamic markers (see error types above).

### Query Helpers (Test Support)

Add to the test context:

```js
getDynamics() {
  return container.querySelectorAll('.dynamic');
}
getHairpins() {
  return container.querySelectorAll('.hairpin');
}
```

---

## SVG Structure

### Point Dynamic

```xml
<g class="dynamic" data-dynamic="f" transform="translate(100, 140)">
  <text class="dynamic-text" text-anchor="middle" font-style="italic">f</text>
</g>
```

### Hairpin (Crescendo)

```xml
<g class="hairpin hairpin-crescendo" data-start-beat="2" data-end-beat="5"
   transform="translate(100, 140)">
  <path class="hairpin-line" d="M 0,6 L 120,0" />
  <path class="hairpin-line" d="M 0,6 L 120,12" />
</g>
```

### Hairpin (Decrescendo)

```xml
<g class="hairpin hairpin-decrescendo" data-start-beat="2" data-end-beat="5"
   transform="translate(100, 140)">
  <path class="hairpin-line" d="M 0,0 L 120,6" />
  <path class="hairpin-line" d="M 0,12 L 120,6" />
</g>
```

### CSS Classes

| Class | Element |
|-------|---------|
| `.dynamic` | Point dynamic container |
| `.dynamic-text` | Text element inside point dynamic |
| `.hairpin` | Hairpin container |
| `.hairpin-crescendo` | Crescendo hairpin (< shape) |
| `.hairpin-decrescendo` | Decrescendo hairpin (> shape) |
| `.hairpin-line` | Individual line of the hairpin wedge |

---

## Rendering Details

### Point Dynamics

- **Font style:** Italic, serif (traditional engraving style)
- **Font size:** Slightly smaller than standard notation text (e.g., 14px at scale 1.0)
- **Horizontal position:** Centered on the x-position of the note that follows the marker
- **Vertical position:** Below the staff, below any articulations. Base Y = 100px below top staff line (consistent with text-annotations vertical stacking). Adjust downward if articulations are present.
- **Multi-character dynamics** (`pp`, `mf`, `fff`, etc.) are rendered as a single text element, still centered on the note position

### Hairpins

- **Shape:** Two angled lines forming a wedge (opening or closing)
- **Crescendo (<):** Vertex (closed end) on the left, opens to the right. The two lines converge at the left and diverge at the right.
- **Decrescendo (>):** Vertex (closed end) on the right, opens to the left. The two lines diverge at the left and converge at the right.
- **Vertical height:** 12px total (6px above and below the center line)
- **Horizontal span:** From the x-position of the note following the start marker to the x-position of the note following the stop marker
- **Vertical position:** Same baseline as point dynamics (below staff + margin). If a point dynamic and a hairpin would collide, the hairpin shifts down.
- **Stroke width:** 1.5px
- **No fill:** Hairpins are outline only (two stroked paths)

### Multi-Voice / Grand Staff

When rendering a grand staff (e.g., treble + bass voices):

- Dynamics that apply to both staves render **centered between the two staves**
- Per-voice dynamics render below their respective staff
- The data model does not currently distinguish shared vs. per-voice dynamics. Each voice's notes array contains its own dynamic markers. Shared dynamics are a future consideration.

### Vertical Stacking Order (Top to Bottom)

1. Staff lines
2. Notes, rests, beams
3. Articulations (see [SPEC-articulations.md](SPEC-articulations.md) for note-level expression markings)
4. Dynamics and hairpins

---

## File Structure

New files:

```
src/notation/
├── components/
│   ├── Dynamic.js          # Point dynamic renderer
│   └── Hairpin.js          # Hairpin (crescendo/decrescendo) renderer
```

### Dynamic.js

Renders a point dynamic marking. Input: dynamic value string, x position, y position. Output: SVG `<g>` element.

```js
// Dynamic.js
export function renderDynamic(svgHelpers, { dynamic, x, y }) {
  // Returns <g class="dynamic"> with <text> child
}
```

### Hairpin.js

Renders a hairpin wedge. Input: type (`"crescendo"` or `"decrescendo"`), start x, end x, y position. Output: SVG `<g>` element.

```js
// Hairpin.js
export function renderHairpin(svgHelpers, { type, startX, endX, y }) {
  // Returns <g class="hairpin hairpin-{type}"> with two <path> children
}
```

---

## Testing Approach

Follow the project's integration testing philosophy. Test through `NotationRenderer.render()`.

### Example Tests

```js
describe('dynamics rendering', () => {
  let ctx;

  beforeEach(() => {
    ctx = createNotationContext();
  });

  afterEach(() => {
    ctx.destroy();
  });

  describe('point dynamics', () => {
    it('renders a dynamic marking below the staff', () => {
      ctx.render([
        { dynamic: 'f' },
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' }
      ]);

      const dynamics = ctx.getDynamics();
      expect(dynamics).toHaveLength(1);
      expect(dynamics[0].querySelector('.dynamic-text').textContent).toBe('f');
    });

    it('renders multi-character dynamics as a single element', () => {
      ctx.render([
        { dynamic: 'mf' },
        { pitch: 'C4', length: '1/4' }
      ]);

      const text = ctx.container.querySelector('.dynamic-text');
      expect(text.textContent).toBe('mf');
    });

    it('renders multiple dynamics at their respective positions', () => {
      ctx.render([
        { dynamic: 'p' },
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
        { dynamic: 'f' },
        { pitch: 'E4', length: '1/4' }
      ]);

      const dynamics = ctx.getDynamics();
      expect(dynamics).toHaveLength(2);
      expect(dynamics[0].dataset.dynamic).toBe('p');
      expect(dynamics[1].dataset.dynamic).toBe('f');
    });

    it('does not render dynamic markers as notes or rests', () => {
      ctx.render([
        { dynamic: 'f' },
        { pitch: 'C4', length: '1/4' }
      ]);

      expect(ctx.getNotes()).toHaveLength(1);
      expect(ctx.getRests()).toHaveLength(0);
    });
  });

  describe('hairpins', () => {
    it('renders a crescendo hairpin spanning multiple notes', () => {
      ctx.render([
        { hairpin: 'crescendo', start: true },
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { hairpin: 'crescendo', stop: true },
        { pitch: 'F4', length: '1/4' }
      ]);

      const hairpins = ctx.getHairpins();
      expect(hairpins).toHaveLength(1);
      expect(hairpins[0].classList.contains('hairpin-crescendo')).toBe(true);
    });

    it('renders a decrescendo hairpin', () => {
      ctx.render([
        { hairpin: 'decrescendo', start: true },
        { pitch: 'G4', length: '1/4' },
        { pitch: 'F4', length: '1/4' },
        { hairpin: 'decrescendo', stop: true },
        { pitch: 'E4', length: '1/4' }
      ]);

      const hairpins = ctx.getHairpins();
      expect(hairpins).toHaveLength(1);
      expect(hairpins[0].classList.contains('hairpin-decrescendo')).toBe(true);
    });

    it('does not render hairpin markers as notes or rests', () => {
      ctx.render([
        { hairpin: 'crescendo', start: true },
        { pitch: 'C4', length: '1/4' },
        { hairpin: 'crescendo', stop: true },
        { pitch: 'D4', length: '1/4' }
      ]);

      expect(ctx.getNotes()).toHaveLength(2);
      expect(ctx.getRests()).toHaveLength(0);
    });
  });

  describe('dynamics with hairpins', () => {
    it('renders a hairpin ending at a point dynamic', () => {
      ctx.render([
        { dynamic: 'p' },
        { hairpin: 'crescendo', start: true },
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
        { hairpin: 'crescendo', stop: true },
        { dynamic: 'f' },
        { pitch: 'E4', length: '1/4' }
      ]);

      expect(ctx.getDynamics()).toHaveLength(2);
      expect(ctx.getHairpins()).toHaveLength(1);
    });
  });

  describe('validation', () => {
    it('rejects invalid dynamic values', () => {
      const result = validateNoteData([
        { dynamic: 'zzz' },
        { pitch: 'C4', length: '1/4' }
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors[0].type).toBe('invalid_dynamic');
    });

    it('rejects unmatched hairpin start', () => {
      const result = validateNoteData([
        { hairpin: 'crescendo', start: true },
        { pitch: 'C4', length: '1/4' }
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors[0].type).toBe('unmatched_hairpin');
    });

    it('rejects unmatched hairpin stop', () => {
      const result = validateNoteData([
        { pitch: 'C4', length: '1/4' },
        { hairpin: 'crescendo', stop: true }
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors[0].type).toBe('unmatched_hairpin');
    });
  });
});
```

---

## Gotchas and Edge Cases

### fp (Forte-Piano)

`fp` means: attack the note loudly (forte), then immediately drop to piano. Visually, it renders as a single text element "fp" below the note. It applies to a single note -- the note that follows the marker. After that note, the prevailing dynamic is `p`.

### sfz (Sforzando)

`sfz` means: sudden accent on the next note, then return to the previous dynamic level. Visually, renders as "sfz" below the note. It does NOT permanently change the dynamic level. After the accented note, the previous dynamic resumes.

### sfp (Sforzando-Piano)

`sfp` means: sudden accent on the next note, then immediately drop to piano. Similar to `sfz` but the post-accent level is explicitly `p` rather than returning to the previous dynamic.

### Hairpin End Alignment

When a hairpin stop marker is immediately followed by a point dynamic, the right edge of the hairpin wedge should visually align with the point dynamic text. This creates the standard notation appearance where a crescendo "opens into" a forte marking.

### Dynamics at Start of Piece

A dynamic marker at the very start of the notes array (before any notes) is valid and common. It sets the initial volume. The dynamic text should align with the first note's x-position.

### Dynamics on Rests

A dynamic marker before a rest is valid. The dynamic text renders at the rest's x-position. The dynamic takes effect at the next sounded note, but it is visually positioned at the rest.

### Hairpins Across Bar Lines

Hairpins can span bar lines. The wedge shape renders continuously across the bar line without breaking. This differs from beams (which break at bar lines).

### Consecutive Dynamics

Multiple point dynamics between two notes (e.g., a hairpin stop followed by a point dynamic) should render without overlapping. The hairpin ends before the dynamic text begins.

### Empty Hairpins

A hairpin start immediately followed by a hairpin stop (with no notes between them) is invalid and should be caught by validation.

---

*Spec Version: 1.0*
*Created: 2026-01-25*
