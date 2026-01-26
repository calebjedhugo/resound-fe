# Notation Articulations Specification

Rendering of musical articulation marks on staff notation. Articulations are visual symbols attached to notes that indicate how they should be performed (shortened, accented, held, etc.).

> **Parent:** [SPEC.md](SPEC.md) · **Audio:** [SPEC-articulations.md](../audio/SPEC-articulations.md)

---

## Goals

1. **Accurate visual placement** - Position articulations correctly relative to noteheads and stems
2. **Combinable** - Support multiple articulations on a single note with proper stacking
3. **Styleable** - CSS classes for each articulation type
4. **Compatible with audio system** - Shared `articulation` property on note objects drives both rendering and playback behavior

---

## Data Structures

Articulations are specified via an `articulation` property on note objects. The value can be a string (single articulation) or an array (multiple articulations):

```js
// Single articulation
{ pitch: "C4", length: "1/4", articulation: "staccato" }

// Multiple articulations
{ pitch: "C4", length: "1/4", articulation: ["accent", "staccato"] }

// No articulation (default, normal playback)
{ pitch: "C4", length: "1/4" }
```

### Supported Articulations

| Name | Symbol | Description |
|------|--------|-------------|
| `"staccato"` | Dot | Shortened note |
| `"staccatissimo"` | Wedge/triangle | Very short note |
| `"accent"` | > | Emphasized attack |
| `"marcato"` | ^ | Strong accent |
| `"tenuto"` | Horizontal line | Full duration, slight emphasis |
| `"fermata"` | Dot with arc | Held longer than written |
| `"portato"` | Line + dot | Tenuto + staccato combined |

### On Chords

Articulations on a chord apply to the entire chord. The `articulation` property lives on any note in the chord (typically the first). All notes in the chord share the articulation:

```js
[
  { pitch: "C4", length: "1/4", articulation: "staccato" },
  { pitch: "E4", length: "1/4" },
  { pitch: "G4", length: "1/4" }
]
```

### On Rests

Only `fermata` is valid on a rest (a held pause). Other articulations on rests are ignored:

```js
{ length: "1/4", articulation: "fermata" }  // valid: fermata rest
{ length: "1/4", articulation: "staccato" } // ignored: no sound to shorten
```

---

## API Design

No new public API methods. Articulations are rendered automatically when present in note data.

### Validation

`validateNoteData()` gains a new error type:

| Type | Meaning |
|------|---------|
| `invalid_articulation` | Articulation value is not a recognized string or array of recognized strings |

```js
{
  type: "invalid_articulation",
  message: "Invalid articulation 'sforzando' at note index 3",
  path: "notes[3].articulation",
  value: "sforzando"
}
```

### Query Helpers (Test Context)

Add to `createNotationContext()`:

```js
getArticulations() {
  return container.querySelectorAll('.articulation');
},
getArticulationsByType(type) {
  return container.querySelectorAll(`.articulation-${type}`);
}
```

---

## SVG Structure

Articulation elements are children of the note `<g>` element, positioned relative to the notehead:

```xml
<g class="note note-quarter" data-beat="0" transform="translate(100, 50)">
  <ellipse class="note-head" cx="0" cy="0" rx="6" ry="5" />
  <line class="note-stem" x1="6" y1="0" x2="6" y2="-30" />

  <!-- Articulation group -->
  <g class="articulations">
    <g class="articulation articulation-staccato" transform="translate(0, 9)">
      <circle cx="0" cy="0" r="1.5" />
    </g>
  </g>
</g>
```

With multiple stacked articulations:

```xml
<g class="articulations">
  <!-- Closest to notehead first -->
  <g class="articulation articulation-staccato" transform="translate(0, 9)">
    <circle cx="0" cy="0" r="1.5" />
  </g>
  <g class="articulation articulation-accent" transform="translate(0, 16)">
    <path d="M -4 -3 L 4 0 L -4 3" />
  </g>
</g>
```

### CSS Classes

| Class | Element |
|-------|---------|
| `.articulations` | Container group for all articulations on a note |
| `.articulation` | Any articulation mark |
| `.articulation-staccato` | Staccato dot |
| `.articulation-staccatissimo` | Staccatissimo wedge |
| `.articulation-accent` | Accent mark |
| `.articulation-marcato` | Marcato mark |
| `.articulation-tenuto` | Tenuto line |
| `.articulation-fermata` | Fermata symbol |
| `.articulation-portato` | Portato (tenuto + staccato) |

---

## Rendering Details

### Placement Side

Articulations are placed on the **opposite side of the note from the stem**:

- **Stem up** (stem extends above notehead): articulations go **below** the notehead
- **Stem down** (stem extends below notehead): articulations go **above** the notehead

**Exception: Fermata is ALWAYS placed above the staff**, regardless of stem direction. If other articulations are present below the note, the fermata still goes above.

### Stacking Order

When multiple articulations appear on a single note, they stack outward from the notehead in this order (closest to notehead first):

1. **Staccato / Staccatissimo / Tenuto / Portato** (duration modifiers, closest)
2. **Accent / Marcato** (dynamic modifiers, middle)
3. **Fermata** (always outermost, always above staff)

### Spacing

- **Gap from notehead to first articulation:** 4px
- **Gap between stacked articulations:** 3px

When articulations are below the note (stem up), the 4px gap is measured from the bottom of the notehead. When above (stem down), from the top of the notehead.

### Symbol Definitions

**Staccato** - Small filled circle
- Size: 3px diameter (1.5px radius)
- Centered horizontally on notehead center

**Staccatissimo** - Small wedge/triangle pointing toward the notehead
- Size: ~3px wide at base, ~5px tall
- The point faces the notehead (points up when below, points down when above)
- Centered horizontally on notehead center

**Accent** - ">" shape (horizontal chevron)
- Size: ~8px wide, ~6px tall
- Opening faces right (standard orientation)
- Centered horizontally on notehead center
- Path: three points forming a sideways V

**Marcato** - "^" shape (vertical chevron, like a caret)
- Size: ~6px wide, ~6px tall
- Point faces away from notehead (up when above, down when below)
- Centered horizontally on notehead center

**Tenuto** - Horizontal line
- Width: matches notehead width (~12px, same as ellipse rx*2)
- Stroke width: 1.5px
- Centered horizontally on notehead center

**Fermata** - Dot with arc above it
- Arc: semicircle or half-ellipse, ~10px wide, ~6px tall
- Dot: small filled circle (2px diameter) centered below the arc peak
- Always oriented with arc opening downward (toward staff)

**Portato** - Tenuto line with staccato dot
- Renders as a tenuto line with a staccato dot stacked on top (further from notehead)
- Use standard stacking gap (3px) between the line and dot
- This is a single articulation value, not a combination of `["tenuto", "staccato"]`

### Articulations on Chords

For chords, the articulation attaches to the note closest to the articulation side:

- **Stem up** (articulations below): attach to the lowest notehead in the chord
- **Stem down** (articulations above): attach to the highest notehead in the chord
- **Fermata exception**: attaches above the highest notehead regardless of stem direction

### Interaction with Ledger Lines

When a note has ledger lines, articulations must clear the ledger lines. Add additional offset so the articulation does not overlap any ledger line.

---

## File Structure

```
src/notation/
├── components/
│   ├── Articulation.js            # Articulation rendering
│   └── ... (existing components)
│
├── __tests__/
│   └── fixtures/
│       └── songs/
│           └── with-articulations.json  # NEW - Notes with various articulation marks
```

`Articulation.js` exports a function (or class) that:

1. Accepts a note object and rendering context (stem direction, notehead position)
2. Returns SVG element(s) for the articulation mark(s)
3. Handles stacking logic when multiple articulations are present
4. Handles the fermata always-above exception

The `Note.js` component calls into `Articulation.js` when a note has an `articulation` property.

---

## Testing Approach

Follow the project's integration testing philosophy from `TESTING.md`. Test through `NotationRenderer.render()` and query the resulting SVG.

### Test Cases

```js
describe('articulations', () => {
  describe('single articulations', () => {
    it('renders a staccato dot on a note', () => {
      ctx.render([
        { pitch: 'C5', length: '1/4', articulation: 'staccato' }
      ]);

      const staccato = ctx.container.querySelectorAll('.articulation-staccato');
      expect(staccato).toHaveLength(1);
    });

    it('renders each supported articulation type', () => {
      const types = [
        'staccato', 'staccatissimo', 'accent',
        'marcato', 'tenuto', 'fermata', 'portato'
      ];

      types.forEach(type => {
        ctx.render([
          { pitch: 'C5', length: '1/4', articulation: type }
        ]);

        const mark = ctx.container.querySelector(`.articulation-${type}`);
        expect(mark).not.toBeNull();
        ctx.renderer.clear();
      });
    });
  });

  describe('placement side', () => {
    it('places articulation below notehead when stem is up', () => {
      // Notes below middle line have stem up
      ctx.render([
        { pitch: 'C4', length: '1/4', articulation: 'staccato' }
      ]);

      const note = ctx.container.querySelector('.note');
      const artic = note.querySelector('.articulation-staccato');
      // Articulation y should be greater than notehead y (below)
      const noteY = note.querySelector('.note-head').getAttribute('cy');
      const articTransform = artic.getAttribute('transform');
      // Verify articulation is below notehead
      expect(articTransform).toBeDefined();
    });

    it('places articulation above notehead when stem is down', () => {
      // Notes on or above middle line have stem down
      ctx.render([
        { pitch: 'B4', length: '1/4', articulation: 'staccato' }
      ]);

      const note = ctx.container.querySelector('.note');
      const artic = note.querySelector('.articulation-staccato');
      expect(artic).not.toBeNull();
    });

    it('always places fermata above the staff', () => {
      // Even when stem is down (note above middle line)
      ctx.render([
        { pitch: 'C4', length: '1/4', articulation: 'fermata' }
      ]);

      const fermata = ctx.container.querySelector('.articulation-fermata');
      expect(fermata).not.toBeNull();
    });
  });

  describe('multiple articulations', () => {
    it('renders multiple articulations from an array', () => {
      ctx.render([
        { pitch: 'C5', length: '1/4', articulation: ['accent', 'staccato'] }
      ]);

      expect(ctx.container.querySelectorAll('.articulation')).toHaveLength(2);
      expect(ctx.container.querySelector('.articulation-accent')).not.toBeNull();
      expect(ctx.container.querySelector('.articulation-staccato')).not.toBeNull();
    });

    it('stacks articulations in correct order (staccato closest to notehead)', () => {
      ctx.render([
        { pitch: 'C5', length: '1/4', articulation: ['accent', 'staccato'] }
      ]);

      const articulations = ctx.container.querySelectorAll('.articulation');
      // First child should be staccato (closest), second should be accent
      expect(articulations[0].classList.contains('articulation-staccato')).toBe(true);
      expect(articulations[1].classList.contains('articulation-accent')).toBe(true);
    });
  });

  describe('articulations on chords', () => {
    it('renders articulation on a chord', () => {
      ctx.render([
        [
          { pitch: 'C4', length: '1/4', articulation: 'staccato' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4' }
        ]
      ]);

      expect(ctx.container.querySelectorAll('.articulation-staccato')).toHaveLength(1);
    });
  });

  describe('articulations on rests', () => {
    it('renders fermata on a rest', () => {
      ctx.render([
        { length: '1/4', articulation: 'fermata' }
      ]);

      expect(ctx.container.querySelector('.articulation-fermata')).not.toBeNull();
    });

    it('ignores non-fermata articulations on rests', () => {
      ctx.render([
        { length: '1/4', articulation: 'staccato' }
      ]);

      expect(ctx.container.querySelector('.articulation-staccato')).toBeNull();
    });
  });

  describe('validation', () => {
    it('reports invalid articulation values', () => {
      const result = validateNoteData([
        { pitch: 'C4', length: '1/4', articulation: 'sforzando' }
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors[0].type).toBe('invalid_articulation');
    });

    it('accepts valid articulation values', () => {
      const result = validateNoteData([
        { pitch: 'C4', length: '1/4', articulation: 'staccato' }
      ]);

      expect(result.valid).toBe(true);
    });

    it('validates each entry in an articulation array', () => {
      const result = validateNoteData([
        { pitch: 'C4', length: '1/4', articulation: ['staccato', 'bogus'] }
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors[0].type).toBe('invalid_articulation');
    });
  });
});
```

---

## Gotchas

### Articulations on Beamed Notes

Articulations on beamed notes use the same placement rules (opposite side from stem). Since beamed notes share a stem direction determined by the beam group, all notes in the group have consistent articulation placement. The articulation must not collide with the beam itself -- add extra offset if the articulation is on the beam side.

### Fermata on Rests

A fermata on a rest is a valid musical concept (a measured pause). Render the fermata symbol above the staff at the rest's horizontal position. The rest symbol renders normally below.

### Interaction with Slurs (Future)

When slurs are implemented: staccato marks under a slur indicate portato playing style (separated but connected). This is a performance interpretation detail -- the notation renders both the slur and the staccato dot independently. No special visual handling needed; the audio system interprets the combination.

### Portato vs. Tenuto + Staccato

`"portato"` is a single articulation value that renders as a tenuto line with a staccato dot. It is NOT the same as `["tenuto", "staccato"]` in the array form, though the visual result is identical. Using the array form `["tenuto", "staccato"]` should produce the same visual output as `"portato"` -- the renderer should treat them as equivalent.

### Articulation on Tied Notes

When ties are implemented: articulations typically apply to the first note of a tie chain only. Do not render articulation marks on the tied-to (second) note.

### Relationship to Dynamics

Articulations are note-level expression (how a single note is attacked/sustained). See also [SPEC-dynamics.md](SPEC-dynamics.md) for passage-level volume markings (piano, forte, hairpins).

---

*Spec Version: 1.0*
*Created: 2026-01-25*
