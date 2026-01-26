# Grace Notes - Notation Spec

Small ornamental notes played before a main note. Adds expressive ornamentation to melodies without altering the rhythmic structure of the measure.

> **Parent:** [SPEC.md](SPEC.md) · **Audio:** [SPEC-grace-notes.md](../audio/SPEC-grace-notes.md)

---

## Goals

1. Support two standard grace note types: **acciaccatura** (crushed/slashed) and **appoggiatura** (leaning/unslashed)
2. Support single grace notes and multi-note grace runs
3. Render grace notes at reduced size with correct musical conventions (slash, slur, positioning)
4. Keep grace notes as metadata on the main note they precede (no separate timeline entries)

---

## Data Structures

Grace notes are expressed as a `grace` property on the main note object they precede. They do not exist as independent entries in the `notes` array.

### Single Grace Note (Acciaccatura)

```js
{ pitch: "D4", length: "1/4", grace: { pitch: "C4", type: "acciaccatura" } }
```

A quick "crushed" note with a diagonal slash through its stem.

### Single Grace Note (Appoggiatura)

```js
{ pitch: "D4", length: "1/4", grace: { pitch: "C4", type: "appoggiatura" } }
```

A "leaning" note with no slash. Takes time from the main note (see audio spec).

### Multiple Grace Notes (Run)

```js
{ pitch: "D4", length: "1/4", grace: [
  { pitch: "A3", type: "acciaccatura" },
  { pitch: "B3", type: "acciaccatura" },
  { pitch: "C4", type: "acciaccatura" }
]}
```

Multiple grace notes form a run leading into the main note, played in the order listed.

### Grace Note Object

```js
{
  pitch: "C4",              // Scientific pitch notation (same format as regular notes)
  type: "acciaccatura"      // "acciaccatura" (default) or "appoggiatura"
}
```

- `pitch`: Required. Same `[A-G][#b]?[0-8]` format as regular notes.
- `type`: Optional. Defaults to `"acciaccatura"` if omitted.
- Grace notes do **not** have a `length` property. Their visual size is always small (rendered as an eighth-note-sized notehead regardless of context).

### Grace Notes on Chords

A grace note (or run) on a chord leads into the entire chord:

```js
[
  { pitch: "C4", length: "1/4", grace: { pitch: "B3", type: "acciaccatura" } },
  { pitch: "E4", length: "1/4" },
  { pitch: "G4", length: "1/4" }
]
```

Only the first note in the chord array carries the `grace` property. The grace note(s) precede the full chord.

### Grace Notes on Dotted Notes

```js
{ pitch: "D4", length: "1/4", dotted: true, grace: { pitch: "C4", type: "appoggiatura" } }
```

The `grace` and `dotted` properties coexist independently on the note object.

---

## API Design

No new public API methods are needed. Grace notes are rendered automatically when the `grace` property is present on a note object.

### Validation Additions

`validateNoteData()` gains a new error type:

| Type | Meaning |
|------|---------|
| `invalid_grace_note` | Grace note has invalid pitch, invalid type, or malformed structure |

Validation rules:
- `grace` must be an object or an array of objects
- Each grace note object must have a valid `pitch`
- `type`, if present, must be `"acciaccatura"` or `"appoggiatura"`
- An empty grace array (`grace: []`) is invalid

### Parser

`parseNoteData()` passes through the `grace` property during normalization. Grace notes are preserved on the note object as-is (no separate timeline expansion). The parser normalizes a single grace object to the same shape as an array entry for internal consistency, but the input format accepts both.

---

## SVG Structure

Grace notes render as a group immediately before their main note:

```xml
<!-- Single acciaccatura -->
<g class="grace-note grace-note-acciaccatura" transform="translate(85, 50) scale(0.6)">
  <ellipse class="note-head" cx="0" cy="0" rx="6" ry="5" />
  <line class="note-stem" x1="6" y1="0" x2="6" y2="-30" />
  <line class="grace-slash" x1="2" y1="-10" x2="10" y2="-25" />
</g>

<!-- Single appoggiatura (no slash) -->
<g class="grace-note grace-note-appoggiatura" transform="translate(85, 50) scale(0.6)">
  <ellipse class="note-head" cx="0" cy="0" rx="6" ry="5" />
  <line class="note-stem" x1="6" y1="0" x2="6" y2="-30" />
</g>

<!-- Grace note slur to main note -->
<path class="grace-slur" d="M 91 48 Q 95 42 100 50" />

<!-- Main note follows at its normal position -->
<g class="note note-quarter" data-beat="0" transform="translate(100, 50)">
  <ellipse class="note-head" cx="0" cy="0" rx="6" ry="5" />
  <line class="note-stem" x1="6" y1="0" x2="6" y2="-30" />
</g>
```

### Multiple Grace Notes (Beamed Run)

```xml
<g class="grace-note-group">
  <g class="grace-note grace-note-acciaccatura" transform="translate(55, 70) scale(0.6)">
    <ellipse class="note-head" cx="0" cy="0" rx="6" ry="5" />
    <line class="note-stem" x1="6" y1="0" x2="6" y2="-30" />
    <line class="grace-slash" x1="2" y1="-10" x2="10" y2="-25" />
  </g>
  <g class="grace-note grace-note-acciaccatura" transform="translate(70, 60) scale(0.6)">
    <ellipse class="note-head" cx="0" cy="0" rx="6" ry="5" />
    <line class="note-stem" x1="6" y1="0" x2="6" y2="-30" />
    <line class="grace-slash" x1="2" y1="-10" x2="10" y2="-25" />
  </g>
  <!-- Beam connecting the grace notes -->
  <path class="beam grace-beam" d="..." />
  <!-- Slur from last grace note to main note -->
  <path class="grace-slur" d="..." />
</g>
```

### CSS Classes

| Class | Element |
|-------|---------|
| `.grace-note` | Individual grace note container (scaled group) |
| `.grace-note-acciaccatura` | Acciaccatura grace note (has slash) |
| `.grace-note-appoggiatura` | Appoggiatura grace note (no slash) |
| `.grace-slash` | Diagonal line through acciaccatura stem |
| `.grace-note-group` | Container for multiple grace notes (run) |
| `.grace-beam` | Beam connecting grace notes in a run |
| `.grace-slur` | Slur arc from grace note(s) to main note |

---

## Rendering Details

### Size

Grace notes render at **60% of normal note size** using `transform: scale(0.6)` on the grace note group. This applies to the notehead, stem, flags, and any accidentals.

### Acciaccatura Appearance

- Small filled notehead (always filled, regardless of what a "normal" eighth note head looks like)
- Stem
- A **diagonal slash** through the stem: a line from lower-left to upper-right crossing the stem at roughly its midpoint
- If the grace note has a flag (single grace note, not beamed), the flag is drawn at reduced size

### Appoggiatura Appearance

- Small filled notehead
- Stem
- **No slash** -- this is the key visual distinction from acciaccatura
- Flag if single (not beamed)

### Multiple Grace Notes

- All grace notes in a run are **beamed together** with a single beam (or double beam if they would be 16th-note-sized, though typically single beam is conventional)
- Each acciaccatura in the group gets a slash through its individual stem
- The beam is drawn at the reduced grace-note scale

### Positioning

- Grace notes appear **immediately to the left** of the main note they precede
- Each grace note occupies approximately **15px** of horizontal space (at full scale, before the 0.6 scaling is applied to the note itself -- the 15px is the allocated slot width)
- Grace notes do **not** affect the main note's horizontal position in the measure. They are "extra" space squeezed in before the main note. The main note remains at its calculated beat position.
- If the main note is at x=100, a single grace note would be at approximately x=85, two grace notes at x=70 and x=85, etc.

### Slur

A small curved slur arc is drawn automatically from the last grace note to the main note. This is conventional notation practice.

- The slur starts at the notehead of the last grace note (or the single grace note)
- The slur ends at the notehead of the main note
- The curve direction follows stem direction conventions (curves away from stems)
- For grace notes beamed as a group, only one slur is drawn (from the last grace note to the main note)

### Accidentals on Grace Notes

- Accidentals are displayed at the same reduced scale as the grace note (60%)
- Positioned to the left of the grace notehead, same as regular accidentals but smaller
- Grace note accidentals do **not** carry forward to affect subsequent notes in the measure (they are ornamental)

### Stem Direction

Grace notes follow the same stem direction rules as normal notes:
- Notes on or above the middle staff line: stem down
- Notes below the middle staff line: stem up

### Vertical Position

Grace notes use the same pitch-to-Y-coordinate mapping as regular notes. A grace note at C4 appears at the same vertical position as a regular C4, just at reduced scale and shifted left.

---

## File Structure

```
src/notation/
├── components/
│   ├── GraceNote.js           # Grace note renderer
│   └── ... (existing components)
```

`GraceNote.js` exports a function (or class) that:
1. Accepts a grace note object (or array), the main note's position, and rendering context
2. Returns SVG elements for the grace note(s), slash(es), beam (if multiple), and slur

The main `Note.js` component calls into `GraceNote.js` when a note's `grace` property is present.

---

## Testing Approach

Follow the project's integration testing philosophy. Test through `NotationRenderer.render()` and query the resulting SVG.

### Test Cases

**Single acciaccatura:**
```js
it('renders a grace note before the main note', () => {
  ctx.render([
    { pitch: "D4", length: "1/4", grace: { pitch: "C4", type: "acciaccatura" } }
  ]);

  const graceNotes = ctx.container.querySelectorAll('.grace-note');
  expect(graceNotes).toHaveLength(1);
  expect(graceNotes[0].classList.contains('grace-note-acciaccatura')).toBe(true);
});

it('renders a slash on acciaccatura grace notes', () => {
  ctx.render([
    { pitch: "D4", length: "1/4", grace: { pitch: "C4", type: "acciaccatura" } }
  ]);

  const slash = ctx.container.querySelector('.grace-slash');
  expect(slash).not.toBeNull();
});
```

**Single appoggiatura:**
```js
it('renders appoggiatura without a slash', () => {
  ctx.render([
    { pitch: "D4", length: "1/4", grace: { pitch: "C4", type: "appoggiatura" } }
  ]);

  const graceNote = ctx.container.querySelector('.grace-note-appoggiatura');
  expect(graceNote).not.toBeNull();

  const slash = ctx.container.querySelector('.grace-slash');
  expect(slash).toBeNull();
});
```

**Multiple grace notes (run):**
```js
it('renders multiple grace notes beamed together', () => {
  ctx.render([
    { pitch: "D4", length: "1/4", grace: [
      { pitch: "A3", type: "acciaccatura" },
      { pitch: "B3", type: "acciaccatura" },
      { pitch: "C4", type: "acciaccatura" }
    ]}
  ]);

  const graceNotes = ctx.container.querySelectorAll('.grace-note');
  expect(graceNotes).toHaveLength(3);

  const graceBeam = ctx.container.querySelector('.grace-beam');
  expect(graceBeam).not.toBeNull();
});
```

**Grace notes with accidentals:**
```js
it('renders accidentals on grace notes at reduced size', () => {
  ctx.render([
    { pitch: "D4", length: "1/4", grace: { pitch: "C#4", type: "acciaccatura" } }
  ]);

  const graceNote = ctx.container.querySelector('.grace-note');
  expect(graceNote).not.toBeNull();

  const accidental = graceNote.querySelector('.accidental');
  expect(accidental).not.toBeNull();
});
```

**Slur rendering:**
```js
it('draws a slur from grace note to main note', () => {
  ctx.render([
    { pitch: "D4", length: "1/4", grace: { pitch: "C4", type: "acciaccatura" } }
  ]);

  const slur = ctx.container.querySelector('.grace-slur');
  expect(slur).not.toBeNull();
});
```

**Default type:**
```js
it('defaults to acciaccatura when type is omitted', () => {
  ctx.render([
    { pitch: "D4", length: "1/4", grace: { pitch: "C4" } }
  ]);

  const graceNote = ctx.container.querySelector('.grace-note-acciaccatura');
  expect(graceNote).not.toBeNull();
});
```

**Grace note on chord:**
```js
it('renders grace note before a chord', () => {
  ctx.render([
    [
      { pitch: "C4", length: "1/4", grace: { pitch: "B3", type: "acciaccatura" } },
      { pitch: "E4", length: "1/4" },
      { pitch: "G4", length: "1/4" }
    ]
  ]);

  const graceNotes = ctx.container.querySelectorAll('.grace-note');
  expect(graceNotes).toHaveLength(1);
});
```

### Test Fixture

```json
// __tests__/fixtures/songs/with-grace-notes.json
[
  { "pitch": "D4", "length": "1/4", "grace": { "pitch": "C4", "type": "acciaccatura" } },
  { "pitch": "E4", "length": "1/4" },
  { "pitch": "F4", "length": "1/4", "grace": { "pitch": "E4", "type": "appoggiatura" } },
  { "pitch": "G4", "length": "1/2", "grace": [
    { "pitch": "D4", "type": "acciaccatura" },
    { "pitch": "E4", "type": "acciaccatura" },
    { "pitch": "F#4", "type": "acciaccatura" }
  ]}
]
```

---

## Gotchas

### Grace Notes Before First Note of a Measure

Grace notes that precede the first note of a measure are positioned **before the barline**. They belong rhythmically to the following note but visually appear in the preceding measure's space. This applies to barlines only -- the clef, key signature, and time signature still appear before any grace notes at the start of a piece.

### Grace Notes at the Start of a Piece

When the very first note in a piece has grace notes, they appear before the first beat. Position them after the clef/key/time signature area but before the first main note's beat position.

### Grace Notes Don't Count Toward Measure Duration

Grace notes have zero rhythmic weight for the purpose of measure filling. A measure in 4/4 with three quarter notes plus a quarter note with a grace note still totals exactly 4 beats. The grace notes are "free."

### Grace Notes on Chords

Only the first note in a chord array should carry the `grace` property. If multiple notes in a chord have `grace` properties, only the first is rendered (the rest are ignored). This is validated with a warning, not an error.

### Ledger Lines for Grace Notes

If a grace note's pitch requires ledger lines, draw them at the reduced scale. Since grace notes are 60% size, their ledger lines should be proportionally smaller.

### Horizontal Overflow

Multiple grace notes before a note near the start of a system (line) may overflow to the left. Clamp the leftmost grace note position to the beginning of the system (after clef/key/time). If space is insufficient, compress grace note spacing below the standard 15px.

---

*Spec Version: 1.0*
*Created: 2026-01-25*
