# Notation Library Specification: Repeats and Navigation

Complete repeat and navigation marking system for controlling visual notation and playback order. Covers repeat barlines, volta endings, segno/coda navigation, and D.C./D.S. directives.

> **Parent:** [SPEC.md](SPEC.md) · **Audio:** [SPEC-repeats.md](../audio/SPEC-repeats.md)

---

## Goals

1. **Full repeat vocabulary** - Support the standard set of repeat and navigation markings found in Western notation: repeat barlines, volta brackets, segno, coda, D.C., D.S., Fine, and al Coda/al Fine variants.
2. **Inline data model** - Repeat and navigation markers are inline objects in the `notes` array, consistent with how dynamics and other structural markers are expressed.
3. **Visual fidelity** - Render repeat barlines with correct dot placement, volta brackets with proper open/closed endings, and standard symbols for segno and coda.
4. **Audio-compatible** - The notation system renders the markers visually; the audio system uses the same data to unroll playback order. Both systems share identical data structures.
5. **Extractable** - No imports from game code. All repeat logic is self-contained within the notation and audio libraries.

---

## Data Structures

Structural markers are inline objects placed in the `notes` array at the position where they apply. They are distinguished from notes (have `pitch`), rests (have `length` only), chords (`Array.isArray()`), and tuplets (have `tuplet`) by having a `barline`, `ending`, or `navigation` property.

### Repeat Barlines

```js
{ barline: "repeat-start" }    // ||:  start repeat section
{ barline: "repeat-end" }      // :||  end repeat section
{ barline: "repeat-both" }     // :||: end one section and start another
{ barline: "final" }           // double barline (thin-thick, no dots)
```

### Volta Endings

```js
{ ending: { number: 1, type: "start" } }  // first ending begins
{ ending: { number: 1, type: "stop" } }   // first ending ends
{ ending: { number: 2, type: "start" } }  // second ending begins
// Endings can go up to any number (1, 2, 3...)
// The LAST ending in a group is typically open-ended (no stop marker needed)
```

Endings define sections of music played on specific passes through a repeat. They must appear between a `repeat-start` (or beginning of piece) and a `repeat-end`.

### Navigation Markers

```js
// Target markers (positions to jump TO)
{ navigation: "segno" }         // sign marker - target for D.S.
{ navigation: "coda" }          // coda marker - target for "to coda" jump
{ navigation: "fine" }          // end point for D.C./D.S. al Fine

// Jump directives (instructions to jump FROM here)
{ navigation: "dc" }            // D.C. (Da Capo) - go to beginning
{ navigation: "ds" }            // D.S. (Dal Segno) - go to segno
{ navigation: "dc-al-fine" }    // D.C. al Fine - go to beginning, play to Fine
{ navigation: "dc-al-coda" }    // D.C. al Coda - go to beginning, jump at to-coda
{ navigation: "ds-al-fine" }    // D.S. al Fine - go to segno, play to Fine
{ navigation: "ds-al-coda" }    // D.S. al Coda - go to segno, jump at to-coda

// Coda jump point
{ navigation: "to-coda" }       // when repeating, jump from here to coda marker
```

### Optional Properties

Repeat barlines accept an optional `times` property to specify how many times a section plays:

```js
{ barline: "repeat-end", times: 3 }  // play section 3 times total (default: 2)
```

Navigation directives accept an optional `withRepeats` property:

```js
{ navigation: "dc-al-coda", withRepeats: true }  // honor inner repeats on second pass
// Default: false (convention is to skip inner repeats on D.C./D.S. pass)
```

### Parser Detection

See main SPEC.md "Canonical Parser Detection Order" for the complete detection table. Barlines are detected by having a `barline` property (priority 3), endings by `ending` (priority 4), and navigation markers by `navigation` (priority 5).

### Full Example

A song with a repeated section, two endings, and D.S. al Coda:

```js
{
  timeSignature: [4, 4],
  notes: [
    // Intro
    { pitch: "C4", length: "1/4" },
    { pitch: "D4", length: "1/4" },
    { pitch: "E4", length: "1/4" },
    { pitch: "F4", length: "1/4" },

    // Segno mark
    { navigation: "segno" },

    // Repeated section with endings
    { barline: "repeat-start" },
    { pitch: "G4", length: "1/4" },
    { pitch: "A4", length: "1/4" },
    { pitch: "B4", length: "1/4" },
    { pitch: "C5", length: "1/4" },

    // First ending
    { ending: { number: 1, type: "start" } },
    { pitch: "B4", length: "1/2" },
    { pitch: "A4", length: "1/2" },
    { ending: { number: 1, type: "stop" } },
    { barline: "repeat-end" },

    // Second ending
    { ending: { number: 2, type: "start" } },
    { pitch: "C5", length: "1/1" },

    // To Coda (only triggers on D.S. pass)
    { navigation: "to-coda" },

    // Bridge
    { pitch: "D5", length: "1/2" },
    { pitch: "E5", length: "1/2" },

    // D.S. al Coda
    { navigation: "ds-al-coda" },

    // Coda section
    { navigation: "coda" },
    { pitch: "C5", length: "1/2" },
    { pitch: "G4", length: "1/2" },
    { pitch: "C4", length: "1/1" },
    { barline: "final" }
  ]
}
```

---

## API Design

### Additions to NotationRenderer

No new public methods required. `render()` handles all marker types automatically. The renderer detects inline markers during layout and delegates to the appropriate component.

### New Static Helper

```js
import { resolvePlaybackOrder } from 'audio/lib/repeatResolver';

// Returns the unrolled sequence of note indices for audio playback
const order = resolvePlaybackOrder(songData);
// order: [0, 1, 2, 3, 4, 5, 6, 7, 4, 5, 6, 8, 9, ...]
// Each entry is an index into the original notes array (markers excluded)
```

This utility lives in `audio/lib/` because it is pure data logic. The notation system imports it from the audio library. It resolves all repeats, endings, and navigation into a flat sequence of indices referencing the original note objects. See the audio SPEC-repeats.md for the unrolling algorithm.

### Additions to validateNoteData()

New error types:

| Type | Meaning |
|------|---------|
| `invalid_barline` | `barline` value is not a recognized type |
| `invalid_ending` | `ending` object missing `number` or `type`, or `type` is not `"start"` or `"stop"` |
| `invalid_navigation` | `navigation` value is not a recognized type |
| `ending_outside_repeat` | Ending markers found without enclosing repeat-start/repeat-end |
| `unmatched_repeat` | `repeat-end` without `repeat-start` (or vice versa) |
| `missing_segno` | `ds` or `ds-al-*` directive without a `segno` marker |
| `missing_coda` | `*-al-coda` directive without a `coda` marker |
| `missing_to_coda` | `*-al-coda` directive without a `to-coda` marker |
| `missing_fine` | `*-al-fine` directive without a `fine` marker |
| `repeats_require_meter` | Repeat barlines used without a time signature |

### Additions to parseNoteData()

The parser must:

1. Recognize `barline`, `ending`, and `navigation` objects as non-note elements.
2. Pass them through normalization unchanged (they have no pitch, length, or voice-specific behavior).
3. In multi-voice normalization, repeat/navigation markers in the top-level `notes` array apply to ALL voices. They are NOT duplicated into individual voice arrays -- they exist in a shared structural layer.

For multi-voice data, markers can appear in two places:

```js
{
  timeSignature: [4, 4],
  // Structural markers that apply to all voices
  markers: [
    { position: 4, marker: { barline: "repeat-start" } },
    { position: 12, marker: { barline: "repeat-end" } }
  ],
  voices: [
    { clef: "treble", notes: [...] },
    { clef: "bass", notes: [...] }
  ]
}
```

Alternatively, markers can be inline in the first voice's `notes` array and are treated as applying to all voices. The `markers` array is optional and takes precedence if both are present.

---

## SVG Structure

### Repeat Barlines

```xml
<!-- repeat-start: thick-thin with dots on right -->
<g class="barline barline-repeat-start" transform="translate(120, 0)">
  <line class="barline-thick" x1="0" y1="10" x2="0" y2="90" stroke-width="3" />
  <line class="barline-thin" x1="5" y1="10" x2="5" y2="90" stroke-width="1" />
  <circle class="barline-dot" cx="10" cy="40" r="2.5" />
  <circle class="barline-dot" cx="10" cy="60" r="2.5" />
</g>

<!-- repeat-end: dots on left, thin-thick -->
<g class="barline barline-repeat-end" transform="translate(400, 0)">
  <circle class="barline-dot" cx="-10" cy="40" r="2.5" />
  <circle class="barline-dot" cx="-10" cy="60" r="2.5" />
  <line class="barline-thin" x1="-5" y1="10" x2="-5" y2="90" stroke-width="1" />
  <line class="barline-thick" x1="0" y1="10" x2="0" y2="90" stroke-width="3" />
</g>

<!-- repeat-both: dots-thin-thick-thin-dots -->
<g class="barline barline-repeat-both" transform="translate(300, 0)">
  <circle class="barline-dot" cx="-10" cy="40" r="2.5" />
  <circle class="barline-dot" cx="-10" cy="60" r="2.5" />
  <line class="barline-thin" x1="-5" y1="10" x2="-5" y2="90" stroke-width="1" />
  <line class="barline-thick" x1="0" y1="10" x2="0" y2="90" stroke-width="3" />
  <line class="barline-thin" x1="5" y1="10" x2="5" y2="90" stroke-width="1" />
  <circle class="barline-dot" cx="10" cy="40" r="2.5" />
  <circle class="barline-dot" cx="10" cy="60" r="2.5" />
</g>

<!-- final: thin-thick (no dots) -->
<g class="barline barline-final" transform="translate(780, 0)">
  <line class="barline-thin" x1="-5" y1="10" x2="-5" y2="90" stroke-width="1" />
  <line class="barline-thick" x1="0" y1="10" x2="0" y2="90" stroke-width="3" />
</g>
```

### Volta Endings (Brackets)

```xml
<!-- First ending: closed bracket (ticks on both sides) -->
<g class="ending ending-1" data-ending-number="1">
  <path class="ending-bracket" d="M120,-5 L120,-15 L280,-15 L280,-5" fill="none" stroke-width="1.5" />
  <text class="ending-number" x="125" y="-18" font-size="12" font-style="italic">1.</text>
</g>

<!-- Second (last) ending: open bracket (tick on left only, no right tick) -->
<g class="ending ending-2" data-ending-number="2">
  <path class="ending-bracket ending-bracket-open" d="M280,-5 L280,-15 L400,-15" fill="none" stroke-width="1.5" />
  <text class="ending-number" x="285" y="-18" font-size="12" font-style="italic">2.</text>
</g>
```

### Navigation Markers

```xml
<!-- Segno symbol (above staff) -->
<g class="navigation navigation-segno" transform="translate(120, -25)">
  <path class="navigation-symbol" d="..." />  <!-- standard segno glyph -->
</g>

<!-- Coda symbol (above staff) -->
<g class="navigation navigation-coda" transform="translate(500, -25)">
  <path class="navigation-symbol" d="..." />  <!-- standard coda glyph -->
</g>

<!-- D.S. al Coda text (above staff, right-aligned to barline) -->
<g class="navigation navigation-text navigation-ds-al-coda" transform="translate(450, -20)">
  <text font-style="italic" text-anchor="end">D.S. al Coda</text>
</g>

<!-- To Coda text with symbol (above staff) -->
<g class="navigation navigation-text navigation-to-coda" transform="translate(350, -20)">
  <text font-style="italic" text-anchor="end">To Coda </text>
  <path class="navigation-symbol" d="..." transform="translate(5, 0)" />  <!-- small coda symbol -->
</g>

<!-- Fine text (above staff, right-aligned) -->
<g class="navigation navigation-text navigation-fine" transform="translate(600, -20)">
  <text font-style="italic" text-anchor="end">Fine</text>
</g>
```

### CSS Classes

| Class | Element |
|-------|---------|
| `.barline-repeat-start` | Start repeat barline (thick-thin + dots) |
| `.barline-repeat-end` | End repeat barline (dots + thin-thick) |
| `.barline-repeat-both` | Combined end/start repeat barline |
| `.barline-final` | Final double barline (thin-thick, no dots) |
| `.barline-thick` | Thick barline stroke |
| `.barline-thin` | Thin barline stroke |
| `.barline-dot` | Repeat dots |
| `.ending` | Volta ending container |
| `.ending-bracket` | Volta bracket line |
| `.ending-bracket-open` | Open-ended bracket (last ending) |
| `.ending-number` | Volta number text ("1.", "2.") |
| `.navigation` | Navigation marker container |
| `.navigation-segno` | Segno symbol |
| `.navigation-coda` | Coda symbol |
| `.navigation-text` | Text-based navigation directive |
| `.navigation-fine` | Fine text |
| `.navigation-to-coda` | "To Coda" text with symbol |
| `.navigation-dc` | D.C. text |
| `.navigation-ds` | D.S. text |
| `.navigation-dc-al-fine` | D.C. al Fine text |
| `.navigation-dc-al-coda` | D.C. al Coda text |
| `.navigation-ds-al-fine` | D.S. al Fine text |
| `.navigation-ds-al-coda` | D.S. al Coda text |
| `.navigation-symbol` | Segno/Coda glyph path |

---

## Rendering Details

### Repeat Barlines

Repeat barlines replace the standard bar line at their position.

- **repeat-start (`||:`)**: Thick line on the left, thin line on the right, two dots to the right of the thin line. Dots are centered between staff lines 2-3 and lines 3-4 (counting from top). Using the staff coordinate system: dots at y=40 and y=60.
- **repeat-end (`:||`)**: Mirror of repeat-start. Two dots on the left, thin line, thick line on the right.
- **repeat-both (`:||:`)**: Combined end and start. Dots on both sides of a thick-thin-thick barline group.
- **final**: Thin line followed by thick line. No dots. Indicates the end of the piece.

Stroke widths:
- Thick line: 3px
- Thin line: 1px
- Dot radius: 2.5px
- Gap between lines: 5px
- Gap between dots and nearest line: 5px

### Volta Brackets (Endings)

Volta brackets are horizontal lines drawn above the staff that span the notes belonging to each ending.

- **Position**: Brackets render above the staff, above any navigation markers. Y position: staff top line minus 15px.
- **First ending (and non-final endings)**: Downward tick at start, horizontal line across the span, downward tick at end. Text "1." (or "2.", etc.) at the left side. This is the "closed" bracket.
- **Last ending in the group**: Downward tick at start, horizontal line extending to the right with NO end tick. This is the "open" bracket, indicating music continues forward.
- **Text**: The ending number followed by a period, rendered in italic, positioned just to the right of the start tick and above the bracket line.
- **Bracket tick height**: 10px downward from the horizontal line.

### Segno Symbol

Standard segno: an S-shaped symbol crossed by a diagonal line with two dots. Rendered as an SVG path above the staff. Positioned centered horizontally above the barline or note where it appears.

- Size: approximately 20px wide, 25px tall.
- Position: centered above the staff, with bottom edge at staff top line minus 10px.

### Coda Symbol

Standard coda: a circle with crosshairs (vertical and horizontal lines extending through and beyond the circle). Rendered as an SVG path above the staff.

- Size: approximately 18px wide, 18px tall.
- Position: centered above the staff, with bottom edge at staff top line minus 10px.

### Text Directives (D.C., D.S., Fine, To Coda)

All text-based navigation directives render as italic text above the staff.

- **Font**: Same font as other notation text, italic style.
- **Alignment**: Right-aligned to the barline or note position where the marker appears. Text anchor is "end".
- **Position**: Above the staff, baseline at staff top line minus 20px.
- **Display text mapping**:

| Marker | Display Text |
|--------|-------------|
| `dc` | D.C. |
| `ds` | D.S. |
| `dc-al-fine` | D.C. al Fine |
| `dc-al-coda` | D.C. al Coda |
| `ds-al-fine` | D.S. al Fine |
| `ds-al-coda` | D.S. al Coda |
| `fine` | Fine |
| `to-coda` | To Coda (followed by small coda symbol) |

### Horizontal Spacing Impact

Repeat barlines and navigation markers occupy horizontal space in the layout:

- **Repeat barlines**: 15px width (same as standard barline area, slightly wider due to dots).
- **repeat-both**: 25px width (it combines an end and start).
- **Navigation symbols (segno, coda)**: No horizontal space consumed. They float above the staff, aligned to the note or barline at their position.
- **Text directives**: No horizontal space consumed. They float above the staff.
- **Volta brackets**: No horizontal space consumed. They span existing note positions.

---

## File Structure

New files within `src/notation/`:

```
src/notation/
├── components/
│   ├── RepeatBarline.js         # Repeat barlines (start, end, both, final)
│   ├── Ending.js                # Volta brackets and ending numbers
│   └── NavigationMarker.js      # Segno, coda, D.C., D.S., Fine, To Coda
│
├── lib/
│   ├── repeatStructure.js       # Parse repeat/navigation markers from notes array
│   ├── repeatStructure.test.js  # Unit tests for marker parsing
│   └── (repeat resolution logic lives in src/audio/lib/repeatResolver.js -- see audio SPEC-repeats.md)
```

### Component Responsibilities

**RepeatBarline.js** - Renders the four barline types. Receives barline type and position. Returns an SVG `<g>` element with the appropriate lines and dots.

**Ending.js** - Renders volta brackets. Receives ending number, start/end X positions, and whether the bracket is open or closed. Returns an SVG `<g>` element with bracket path and number text.

**NavigationMarker.js** - Renders segno symbol, coda symbol, and text directives. Receives marker type and position. Returns an SVG `<g>` element with the appropriate symbol or text.

### Integration with Existing Components

**BarLine.js** - The existing `BarLine.js` component currently renders standard bar lines. It should delegate to `RepeatBarline.js` when a repeat barline marker is encountered at a bar position, or the layout engine should determine which component to use.

**NotationRenderer.js** - The main renderer's layout pass must:
1. Scan the notes array for inline markers during normalization.
2. Build a marker index (positions of all repeats, endings, navigation).
3. During horizontal layout, insert repeat barlines at the correct positions.
4. After note layout, overlay volta brackets and navigation markers above the staff.

---

## Testing Approach

Follow the project's integration testing philosophy. Test through the `NotationRenderer` public API using the `createNotationContext()` helper.

### Repeat Barline Tests

```js
describe('repeat barlines', () => {
  it('renders a repeat-start barline with dots', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        { barline: "repeat-start" },
        { pitch: "C4", length: "1/4" },
        { pitch: "D4", length: "1/4" },
        { pitch: "E4", length: "1/4" },
        { pitch: "F4", length: "1/4" },
        { barline: "repeat-end" }
      ]
    });

    const repeatStart = ctx.container.querySelector('.barline-repeat-start');
    expect(repeatStart).not.toBeNull();
    expect(repeatStart.querySelectorAll('.barline-dot')).toHaveLength(2);
    expect(repeatStart.querySelector('.barline-thick')).not.toBeNull();
  });

  it('renders a repeat-end barline with dots', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        { barline: "repeat-start" },
        { pitch: "C4", length: "1/1" },
        { barline: "repeat-end" }
      ]
    });

    const repeatEnd = ctx.container.querySelector('.barline-repeat-end');
    expect(repeatEnd).not.toBeNull();
    expect(repeatEnd.querySelectorAll('.barline-dot')).toHaveLength(2);
  });

  it('renders a repeat-both barline with dots on both sides', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        { barline: "repeat-start" },
        { pitch: "C4", length: "1/1" },
        { barline: "repeat-both" },
        { pitch: "D4", length: "1/1" },
        { barline: "repeat-end" }
      ]
    });

    const repeatBoth = ctx.container.querySelector('.barline-repeat-both');
    expect(repeatBoth).not.toBeNull();
    expect(repeatBoth.querySelectorAll('.barline-dot')).toHaveLength(4);
  });

  it('renders a final barline without dots', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        { pitch: "C4", length: "1/1" },
        { barline: "final" }
      ]
    });

    const finalBar = ctx.container.querySelector('.barline-final');
    expect(finalBar).not.toBeNull();
    expect(finalBar.querySelectorAll('.barline-dot')).toHaveLength(0);
  });
});
```

### Volta Ending Tests

```js
describe('volta endings', () => {
  it('renders a closed bracket for the first ending', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        { barline: "repeat-start" },
        { pitch: "C4", length: "1/1" },
        { ending: { number: 1, type: "start" } },
        { pitch: "D4", length: "1/1" },
        { ending: { number: 1, type: "stop" } },
        { barline: "repeat-end" },
        { ending: { number: 2, type: "start" } },
        { pitch: "E4", length: "1/1" }
      ]
    });

    const ending1 = ctx.container.querySelector('.ending-1');
    expect(ending1).not.toBeNull();
    expect(ending1.querySelector('.ending-number').textContent).toBe('1.');
    // First ending bracket is closed (no open class)
    expect(ending1.querySelector('.ending-bracket-open')).toBeNull();
  });

  it('renders an open bracket for the last ending', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        { barline: "repeat-start" },
        { pitch: "C4", length: "1/1" },
        { ending: { number: 1, type: "start" } },
        { pitch: "D4", length: "1/1" },
        { ending: { number: 1, type: "stop" } },
        { barline: "repeat-end" },
        { ending: { number: 2, type: "start" } },
        { pitch: "E4", length: "1/1" }
      ]
    });

    const ending2 = ctx.container.querySelector('.ending-2');
    expect(ending2).not.toBeNull();
    expect(ending2.querySelector('.ending-number').textContent).toBe('2.');
    expect(ending2.querySelector('.ending-bracket-open')).not.toBeNull();
  });
});
```

### Navigation Marker Tests

```js
describe('navigation markers', () => {
  it('renders a segno symbol above the staff', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        { navigation: "segno" },
        { pitch: "C4", length: "1/1" },
        { navigation: "ds" }
      ]
    });

    const segno = ctx.container.querySelector('.navigation-segno');
    expect(segno).not.toBeNull();
  });

  it('renders a coda symbol above the staff', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        { pitch: "C4", length: "1/1" },
        { navigation: "to-coda" },
        { pitch: "D4", length: "1/1" },
        { navigation: "dc-al-coda" },
        { navigation: "coda" },
        { pitch: "E4", length: "1/1" }
      ]
    });

    const coda = ctx.container.querySelector('.navigation-coda');
    expect(coda).not.toBeNull();
  });

  it('renders D.S. al Coda as italic text', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        { navigation: "segno" },
        { pitch: "C4", length: "1/1" },
        { navigation: "to-coda" },
        { pitch: "D4", length: "1/1" },
        { navigation: "ds-al-coda" },
        { navigation: "coda" },
        { pitch: "E4", length: "1/1" }
      ]
    });

    const dsAlCoda = ctx.container.querySelector('.navigation-ds-al-coda');
    expect(dsAlCoda).not.toBeNull();
    expect(dsAlCoda.querySelector('text').textContent).toContain('D.S. al Coda');
  });

  it('renders Fine as italic text', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        { pitch: "C4", length: "1/1" },
        { navigation: "fine" },
        { pitch: "D4", length: "1/1" },
        { navigation: "dc-al-fine" }
      ]
    });

    const fine = ctx.container.querySelector('.navigation-fine');
    expect(fine).not.toBeNull();
  });
});
```

### Validation Tests

```js
describe('repeat validation', () => {
  it('rejects repeats without a time signature', () => {
    const result = validateNoteData({
      notes: [
        { barline: "repeat-start" },
        { pitch: "C4", length: "1/4" },
        { barline: "repeat-end" }
      ]
    });

    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('repeats_require_meter');
  });

  it('rejects unmatched repeat-end', () => {
    const result = validateNoteData({
      timeSignature: [4, 4],
      notes: [
        { pitch: "C4", length: "1/1" },
        { barline: "repeat-end" }
      ]
    });

    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('unmatched_repeat');
  });

  it('rejects D.S. without segno marker', () => {
    const result = validateNoteData({
      timeSignature: [4, 4],
      notes: [
        { pitch: "C4", length: "1/1" },
        { navigation: "ds" }
      ]
    });

    expect(result.valid).toBe(false);
    expect(result.errors[0].type).toBe('missing_segno');
  });
});
```

### Complex Structure Tests

```js
describe('complex repeat structures', () => {
  it('renders D.S. al Coda with endings correctly', () => {
    const song = {
      timeSignature: [4, 4],
      notes: [
        // Intro
        { pitch: "C4", length: "1/1" },

        { navigation: "segno" },
        { barline: "repeat-start" },
        { pitch: "D4", length: "1/1" },

        { ending: { number: 1, type: "start" } },
        { pitch: "E4", length: "1/1" },
        { ending: { number: 1, type: "stop" } },
        { barline: "repeat-end" },

        { ending: { number: 2, type: "start" } },
        { pitch: "F4", length: "1/2" },
        { pitch: "G4", length: "1/2" },

        { navigation: "to-coda" },
        { pitch: "A4", length: "1/1" },
        { navigation: "ds-al-coda" },

        { navigation: "coda" },
        { pitch: "C5", length: "1/1" },
        { barline: "final" }
      ]
    };

    ctx.render(song);

    // All markers should be rendered
    expect(ctx.container.querySelector('.navigation-segno')).not.toBeNull();
    expect(ctx.container.querySelector('.barline-repeat-start')).not.toBeNull();
    expect(ctx.container.querySelector('.barline-repeat-end')).not.toBeNull();
    expect(ctx.container.querySelector('.ending-1')).not.toBeNull();
    expect(ctx.container.querySelector('.ending-2')).not.toBeNull();
    expect(ctx.container.querySelector('.navigation-to-coda')).not.toBeNull();
    expect(ctx.container.querySelector('.navigation-ds-al-coda')).not.toBeNull();
    expect(ctx.container.querySelector('.navigation-coda')).not.toBeNull();
    expect(ctx.container.querySelector('.barline-final')).not.toBeNull();
  });

  it('resolvePlaybackOrder returns correct unrolled sequence', () => {
    const song = {
      timeSignature: [4, 4],
      notes: [
        { barline: "repeat-start" },
        { pitch: "C4", length: "1/1" },          // note index 0
        { ending: { number: 1, type: "start" } },
        { pitch: "D4", length: "1/1" },          // note index 1
        { ending: { number: 1, type: "stop" } },
        { barline: "repeat-end" },
        { ending: { number: 2, type: "start" } },
        { pitch: "E4", length: "1/1" }           // note index 2
      ]
    };

    const order = resolvePlaybackOrder(song);
    // First pass: C4, D4 (ending 1)
    // Second pass: C4, E4 (ending 2)
    expect(order).toEqual([0, 1, 0, 2]);
  });
});
```

---

## Gotchas

### Repeats Require a Time Signature

Repeat barlines are undefined in unmetered mode. The validator must reject songs that use `barline: "repeat-start"` or `barline: "repeat-end"` without a `timeSignature`. This is because repeat barlines are bar lines, and bar lines require meter.

The `barline: "final"` type is an exception -- it can be used in unmetered mode to indicate the end of the piece.

### Default Repeat Count

A simple repeat section (repeat-start to repeat-end) plays **twice** by default (play once, repeat once). The optional `times` property on `repeat-end` overrides this.

### Nested Repeats

When repeat sections are nested, the inner repeat resolves fully before the outer repeat:

```js
// Outer start
{ barline: "repeat-start" },
  { pitch: "A4", length: "1/4" },
  // Inner start
  { barline: "repeat-start" },
    { pitch: "B4", length: "1/4" },
  { barline: "repeat-end" },
  // Inner end
  { pitch: "C5", length: "1/4" },
{ barline: "repeat-end" }
// Outer end

// Playback: A, B, B, C, A, B, B, C
```

The nesting depth is tracked by the unrolling algorithm. Maximum nesting depth: 4 (deeper nesting is a validation warning, not an error).

### Endings Must Be Between Repeats

Ending markers (`{ ending: { ... } }`) must appear between a `repeat-start` and the notes following the corresponding `repeat-end`. Specifically:
- Ending start/stop markers for endings 1 through N-1 appear BEFORE the `repeat-end`.
- The last ending's start marker appears AFTER the `repeat-end`.

The validator should flag endings that appear outside any repeat context.

### Navigation Markers Are Visual + Structural

In the notation system, navigation markers (segno, coda, D.C., etc.) are rendered visually but do not alter the visual note layout. The notes appear in their original linear order in the rendered staff. The navigation markers indicate to the PERFORMER (and the audio system) where to jump.

The `resolvePlaybackOrder()` function resolves navigation into a linear index sequence for the audio system.

### Multi-Voice: Markers Apply to ALL Voices

Repeat and navigation markers are shared structural elements. They are NOT per-voice. When the renderer encounters a repeat barline or navigation marker, it applies to the entire score (all staves):
- Repeat barlines are drawn on all staves at the same horizontal position.
- Volta brackets are drawn once, above the top staff.
- Navigation symbols and text are drawn once, above the top staff.
- The audio system treats all voices as repeating together.

### "To Coda" Jump Timing

The `to-coda` marker only triggers on the REPEAT pass (when returning via D.C. or D.S.). On the first time through the music, `to-coda` is ignored -- the performer plays straight through. This is standard musical convention.

### D.C./D.S. "No Repeats" Convention

By default, when repeating via D.C. or D.S., inner repeat sections are played only once (repeats are skipped on the second pass). This is the standard musical convention. The optional `withRepeats: true` property on the navigation directive overrides this behavior.

### Playback Position with Repeats

When `setPlaybackPosition()` is called during a repeated section, the renderer needs additional context to know which pass is active. An extended signature is needed:

```js
renderer.setPlaybackPosition(beat, { voiceId: 'melody', repeatPass: 2 });
```

Without `repeatPass`, the renderer highlights the note at the given beat position in the first (visual) occurrence. The audio system is responsible for tracking which pass it is on and communicating that to the renderer.

---

*Spec Version: 1.0*
*Created: 2026-01-25*
