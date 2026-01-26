# Notation Library Specification

Extractable SVG music notation renderer. Converts musical data to traditional staff notation.

---

## Goals

1. **Extractable** - No imports from game code (`entities/`, `core/GameState`, etc.)
2. **Traditional notation** - Teach real musical concepts without intimidation
3. **Compatible with audio system** - Both consume identical data structures
4. **Clock-drivable** - Playback position can be controlled externally
5. **SVG output** - Scalable, styleable, accessible

---

## Data Structures

The library accepts three input formats with progressive complexity. Internally, all formats normalize to a canonical multi-voice structure.

### Level 1: Simple Array

Existing puzzle format. Uses all defaults.

```js
[
  { pitch: "C4", length: "1/4" },
  { pitch: "E4", length: "1/4" },
  { length: "1/4" },              // rest (no pitch)
  { pitch: "G4", length: "1/2" }
]
```

### Level 2: Single Voice with Metadata

```js
{
  clef: "treble",
  keySignature: "G",           // or "Bb", "F#", etc.
  timeSignature: [4, 4],       // [beats, beat-value]
  notes: [
    { pitch: "C4", length: "1/4" },
    { pitch: "E4", length: "1/4" }
  ]
}
```

### Level 3: Multi-Voice with Overrides

```js
{
  timeSignature: [4, 4],       // default for all voices
  keySignature: "C",           // default for all voices
  markers: [                   // optional, shared across all voices
    { position: 4, marker: { barline: "repeat-start" } },
    { position: 12, marker: { barline: "repeat-end" } }
  ],
  voices: [
    {
      id: "melody",            // optional, defaults to index
      clef: "treble",
      notes: [...]
    },
    {
      id: "bass",
      clef: "bass",
      notes: [...]
    },
    {
      clef: "treble",
      keySignature: "G",       // override default
      timeSignature: [3, 4],   // polyrhythm
      notes: [...]
    }
  ]
}
```

An optional `markers` array can contain position-indexed markers (barlines, navigation, etc.) that apply across all voices. See SPEC-repeats.md for details.

### Note Object

```js
{
  pitch: "C4",      // Scientific pitch notation (A0-C8)
  length: "1/4"     // Fraction string
}
```

- `pitch` uses format: `[A-G][#b]?[0-8]` (e.g., `C4`, `F#5`, `Bb3`)
- `length` uses fractions: `1/1`, `1/2`, `1/4`, `1/8`, `1/16`, `1/32`
- Dotted rhythms: add `dotted: true` to the note object (see below)

### Rest Object

```js
{
  length: "1/4"     // No pitch property = rest
}
```

Rule: If `pitch` property is absent, the object is a rest.

### Dotted Notes

Add `dotted: true` to indicate a dotted duration. This makes intent explicit for rendering (draw the dot) and avoids ambiguity with raw fraction math.

```js
{ pitch: "C4", length: "1/4", dotted: true }   // dotted quarter (1/4 + 1/8)
{ pitch: "E4", length: "1/2", dotted: true }   // dotted half (1/2 + 1/4)
{ length: "1/4", dotted: true }                // dotted quarter rest
```

The `dotted` flag means "this duration is 1.5x the written length." The renderer draws an augmentation dot. The caller is responsible for checking `dotted: true` and multiplying the result of `getDuration()` by 1.5. The `getDuration()` function itself only handles the base fraction.

**IMPORTANT:** Do not use raw fractions for dotted values (e.g., `"3/8"` for dotted quarter). While mathematically correct, the renderer cannot distinguish a dotted quarter from a true 3/8 duration, and the dot would not be drawn.

### Chord

Array of simultaneous notes:

```js
[
  { pitch: "C4", length: "1/4" },
  { pitch: "E4", length: "1/4" },
  { pitch: "G4", length: "1/4" }
]
```

All notes in a chord should share the same length. If they differ, the shortest duration is used for scheduling purposes (matching existing `Instrument.playChord()` behavior).

**Parser note:** A song's `notes` array contains a mix of note objects, rest objects, and chord arrays. The parser MUST use `Array.isArray()` on each element to distinguish a chord `[noteObj, noteObj]` from the enclosing sequence. This is a nested-array-in-array pattern - handle it explicitly.

### Percussion Notes

For percussion clef, use staff position instead of pitch:

```js
{
  position: 1,      // 1-9, staff position (see mapping below)
  length: "1/4"
}
```

Percussion notes render with X noteheads. This distinguishes them from rests.

**Staff position mapping (5 lines + 4 spaces = 9 positions):**

| Position | Location | Common GM Percussion |
|----------|----------|---------------------|
| 1 | Bottom line | Bass drum |
| 2 | First space | |
| 3 | Second line | Snare |
| 4 | Second space | |
| 5 | Middle line | Hi-hat (closed) |
| 6 | Third space | |
| 7 | Fourth line | Crash cymbal |
| 8 | Top space | |
| 9 | Top line | Ride cymbal |

Positions use integers 1-9. Odd numbers are lines, even numbers are spaces.

---

## Defaults and Inference

When metadata is omitted, the library infers sensible defaults:

| Property | Default | Notes |
|----------|---------|-------|
| `keySignature` | `"C"` | Displays nothing (no sharps/flats) |
| `timeSignature` | `null` | Unmetered - no bar lines |
| `clef` | *inferred* | See clef inference rules below |
| Voice `id` | Array index | `"0"`, `"1"`, etc. |

### Clef Inference Rules

When no clef is specified:

1. **If any note has a `pitch` property:**
   - Calculate median pitch of all notes
   - If median pitch >= C4 (middle C): use `"treble"`
   - If median pitch < C4: use `"bass"`

2. **If no notes have `pitch` (all rests or percussion positions):**
   - Use `"percussion"`

3. **Explicit clef always wins** over inference

### Supported Clefs

| Clef | Description | Middle line pitch | C4 placement |
|------|-------------|-------------------|--------------|
| `"treble"` | G clef | B4 | 1 ledger line below |
| `"bass"` | F clef | D3 | 1 ledger line above |
| `"alto"` | C clef | C4 | 3rd line (middle) |
| `"tenor"` | C clef | C4 | 4th line |
| `"percussion"` | Neutral clef | N/A | N/A |

Note: Alto and tenor are both C clefs but differ in which staff line C4 sits on. The clef symbol is visually centered on the C4 line.

### Key Signatures

Support all major/minor keys:

- Sharps: `"G"`, `"D"`, `"A"`, `"E"`, `"B"`, `"F#"`, `"C#"`
- Flats: `"F"`, `"Bb"`, `"Eb"`, `"Ab"`, `"Db"`, `"Gb"`, `"Cb"`
- No accidentals: `"C"` (or omit)

Minor keys use relative major signature (e.g., A minor = `"C"`).

---

## API Design

### NotationRenderer

Main entry point. Creates and manages SVG output.

```js
import { NotationRenderer } from 'notation';

const renderer = new NotationRenderer({
  container: document.getElementById('notation'),  // DOM element or null
  width: 800,           // SVG width (optional, auto-sizes if omitted)
  height: 200,          // SVG height (optional, auto-sizes if omitted)
  scale: 1.0,           // Scaling factor (optional)
});

// Render notation (replaces previous output - clears then draws)
const svg = renderer.render(songData);

// Update playback position (beat number, zero-indexed)
renderer.setPlaybackPosition(2.5);

// Update playback position by voice
renderer.setPlaybackPosition(2.5, { voiceId: 'melody' });

// Clear
renderer.clear();

// Get SVG element (if not using container)
const svgElement = renderer.getSvgElement();
```

`render()` always replaces previous output (clear + draw). It does not append. Call `render()` again with new data to re-render.

### Playback Position

The `setPlaybackPosition(beat, options)` method highlights the current note(s):

- `beat`: Current beat position (float, e.g., `2.5` = halfway through beat 3)
- `options.voiceId`: Optional voice ID to highlight (highlights all if omitted)
- `options.repeatPass`: Optional pass number when repeats are active. Specifies which pass through a repeated section (see SPEC-repeats.md).

Visual indication:
- Current note gets a CSS class `note-active`
- Optional cursor line at playback position

### Static Helpers

```js
import {
  parseNoteData,      // Normalize any input format to canonical structure
  validateNoteData,   // Validate data, return { valid, errors }
  inferClef,          // Get inferred clef for a note array
  parseFraction,      // "1/4" -> { numerator: 1, denominator: 4 }
  fractionToBeats,    // "1/4" -> 1.0 (in 4/4 time)
} from 'notation';
```

### Validation Errors

`validateNoteData()` returns an object with structured errors:

```js
const result = validateNoteData(songData);
// {
//   valid: false,
//   errors: [
//     {
//       type: "invalid_pitch",
//       message: "Invalid pitch 'X4' at note index 2",
//       path: "notes[2].pitch",
//       value: "X4"
//     },
//     {
//       type: "invalid_length",
//       message: "Invalid length '1/3' at note index 5",
//       path: "notes[5].length",
//       value: "1/3"
//     }
//   ]
// }
```

Error types:

| Type | Meaning |
|------|---------|
| `invalid_pitch` | Pitch string doesn't match `[A-G][#b]?[0-8]` |
| `invalid_length` | Length is not a recognized fraction |
| `invalid_position` | Percussion position outside 1-9 range |
| `invalid_clef` | Clef value not in supported list |
| `invalid_key_signature` | Key signature not recognized |
| `invalid_time_signature` | Time signature not a 2-element array of positive integers |
| `empty_notes` | Notes array is empty |
| `mixed_pitched_unpitched` | A single voice contains both pitched notes and percussion positions (validated per-voice; a score with a treble voice + percussion voice is valid) |

---

## SVG Structure

The renderer outputs structured SVG with semantic classes for styling:

```xml
<svg class="notation" viewBox="0 0 800 200">
  <g class="staff staff-0" data-voice-id="melody">
    <!-- Staff lines -->
    <g class="staff-lines">
      <line class="staff-line" y1="40" y2="40" x1="0" x2="800" />
      <!-- ... 5 lines total ... -->
    </g>

    <!-- Clef -->
    <g class="clef clef-treble" transform="translate(10, 20)">
      <path d="..." />
    </g>

    <!-- Key signature -->
    <g class="key-signature" transform="translate(50, 0)">
      <text class="accidental sharp">♯</text>
      <!-- ... -->
    </g>

    <!-- Time signature -->
    <g class="time-signature" transform="translate(80, 0)">
      <text class="time-numerator">4</text>
      <text class="time-denominator">4</text>
    </g>

    <!-- Bar lines (if metered) -->
    <line class="bar-line" x1="200" x2="200" y1="40" y2="80" />

    <!-- Notes -->
    <g class="note note-quarter" data-beat="0" transform="translate(100, 50)">
      <ellipse class="note-head" cx="0" cy="0" rx="6" ry="5" />
      <line class="note-stem" x1="6" y1="0" x2="6" y2="-30" />
    </g>

    <!-- Rest -->
    <g class="rest rest-quarter" data-beat="1" transform="translate(150, 60)">
      <path class="rest-symbol" d="..." />
    </g>

    <!-- Beamed group -->
    <g class="beam-group">
      <g class="note note-eighth" data-beat="2">...</g>
      <g class="note note-eighth" data-beat="2.5">...</g>
      <path class="beam" d="..." />
    </g>

    <!-- Playback cursor -->
    <line class="playback-cursor" x1="100" x2="100" y1="30" y2="90" />
  </g>
</svg>
```

### CSS Classes

| Class | Element |
|-------|---------|
| `.notation` | Root SVG |
| `.staff` | Staff container |
| `.staff-lines` | Five horizontal lines |
| `.clef`, `.clef-treble`, `.clef-bass`, `.clef-percussion` | Clef symbol |
| `.key-signature` | Key signature container |
| `.time-signature` | Time signature container |
| `.bar-line` | Measure divider |
| `.note`, `.note-whole`, `.note-half`, `.note-quarter`, `.note-eighth`, `.note-16th` | Note container |
| `.note-head` | Note head (ellipse) |
| `.note-head-x` | Percussion X head |
| `.note-stem` | Vertical stem |
| `.note-flag` | Flag for unbeamed 8th/16th |
| `.note-dot` | Augmentation dot |
| `.note-active` | Currently playing note |
| `.rest`, `.rest-whole`, `.rest-half`, `.rest-quarter`, `.rest-eighth` | Rest symbols |
| `.beam` | Beam connecting notes |
| `.beam-group` | Container for beamed notes |
| `.ledger-line` | Lines above/below staff |
| `.playback-cursor` | Current position indicator |
| `.accidental`, `.sharp`, `.flat`, `.natural` | Accidental symbols |
| `.chord` | Chord container |

---

## Rendering Details

### Staff Layout

- **Note step spacing:** 10px per diatonic step (e.g., E4 to F4 = 10px)
- **Staff line spacing:** 20px between adjacent lines (every other diatonic step is a line)
- **Staff height:** 80px (4 line-gaps × 20px)
- Margin above/below for ledger lines: 60px each
- Multi-voice staves stack vertically with 40px gap

### Note Positioning

Vertical position (staff position to Y coordinate):

```
B5 (ledger +2) → y = -20
A5 (ledger +1) → y = -10
G5 (space above) → y = 0
F5 (top line) → y = 10
E5 (space) → y = 20
D5 (line) → y = 30
C5 (space) → y = 40
B4 (middle line) → y = 50
A4 (space) → y = 60
G4 (line) → y = 70
F4 (space) → y = 80
E4 (bottom line) → y = 90
D4 (space below) → y = 100
C4 (ledger -1) → y = 110
```

**Formula (treble clef):**

1. Compute diatonic position: `diatonicPos = octave * 7 + noteIndex`
   where C=0, D=1, E=2, F=3, G=4, A=5, B=6
2. Compute Y: `y = (39 - diatonicPos) * 10`

Examples:
- C4: `diatonicPos = 4*7 + 0 = 28`, `y = (39-28)*10 = 110` (1 ledger line below)
- E4: `diatonicPos = 4*7 + 2 = 30`, `y = (39-30)*10 = 90` (bottom line)
- B4: `diatonicPos = 4*7 + 6 = 34`, `y = (39-34)*10 = 50` (middle line)
- F5: `diatonicPos = 5*7 + 3 = 38`, `y = (39-38)*10 = 10` (top line)

**IMPORTANT:** Do not use MIDI note numbers for staff positioning. MIDI is chromatic (C#/Db occupy a position), but staff notation is diatonic (C# and C share a staff position, with an accidental). Always convert pitch to diatonic position first.

For other clefs, adjust the reference constant (the diatonic position of the note at y=0, i.e., the space above the top staff line):

| Clef | Constant | Derivation |
|------|----------|------------|
| Treble | 39 | G5 (space above top line) = 5×7 + 4 |
| Bass | 27 | B3 (space above top line) = 3×7 + 6 |
| Alto | 33 | A4 (space above top line) = 4×7 + 5 |
| Tenor | 31 | F4 (space above top line) = 4×7 + 3 |

### Horizontal Spacing

- Clef width: 30px
- Key signature: 10px per accidental
- Time signature: 25px
- Notes: proportional to duration
  - Whole: 80px
  - Half: 60px
  - Quarter: 40px
  - Eighth: 30px
  - 16th: 25px
- Minimum note spacing: 20px

### Beaming Rules

Eighth notes and smaller are beamed when:

1. Within the same beat (required)
2. Not crossing a beat boundary (break beam at beat)
3. Maximum 4 notes per beam group
4. **Unmetered mode: no beaming.** When `timeSignature` is null, all notes render with individual flags. This is musically defensible (chant/recitative traditions) and avoids heuristic beat guessing. A future option could enable heuristic beaming.

Beam angle follows note contour (rises toward higher notes).

### Ledger Lines

- Draw ledger lines for notes outside the staff
- Full 88-key range supported (A0-C8)
- Ledger lines extend slightly past note head (3px each side)

### Stem Direction

- Notes on or above middle line: stem down (left side of head)
- Notes below middle line: stem up (right side of head)
- Chords: stem direction based on note furthest from middle line

### Accidentals

- Display accidentals not in key signature
- Accidentals apply for the rest of the measure
- Natural sign cancels key signature accidental
- Courtesy accidentals (optional, controlled via options)

---

## File Structure

```
src/notation/
├── SPEC.md                    # This file
├── index.js                   # Public API exports
├── NotationRenderer.js        # Main renderer class
├── NotationRenderer.test.js   # Integration tests
│
├── lib/
│   ├── notePositions.js       # Pitch → staff position mapping
│   ├── notePositions.test.js
│   ├── durationSymbols.js     # Length → note type (whole, half, etc.)
│   ├── durationSymbols.test.js
│   ├── beaming.js             # Beam grouping logic
│   ├── beaming.test.js
│   ├── keySignatures.js       # Key → accidentals mapping
│   ├── keySignatures.test.js
│   ├── clefInference.js       # Auto-detect clef from pitches
│   ├── clefInference.test.js
│   ├── dataParser.js          # Normalize input formats
│   ├── dataParser.test.js
│   └── svgHelpers.js          # SVG element creation utilities
│
├── components/
│   ├── Staff.js               # Staff lines renderer
│   ├── Clef.js                # Clef symbols (paths)
│   ├── KeySignature.js        # Key signature renderer
│   ├── TimeSignature.js       # Time signature renderer
│   ├── Note.js                # Note head, stem, flags
│   ├── Rest.js                # Rest symbols
│   ├── Beam.js                # Beam connector
│   ├── LedgerLine.js          # Ledger lines
│   ├── Accidental.js          # Sharp, flat, natural symbols
│   ├── Cursor.js              # Playback position indicator
│   └── BarLine.js             # Measure dividers
│
└── __tests__/
    └── fixtures/
        └── songs/             # Test song data files
            ├── simple-melody.json
            ├── with-rests.json
            ├── with-chords.json
            ├── multi-voice.json
            └── percussion.json
```

---

## Testing

See [`SPEC-testing.md`](SPEC-testing.md) for the notation library's testing approach, including the test context helper (`createNotationContext()`), query helpers, example tests, and test fixtures.

Core principles follow the project-wide [`TESTING.md`](../../TESTING.md): test behaviors through public APIs, mock only browser APIs, never mock internal modules.

---

## Gotchas and Edge Cases

### Cross-Barline Notes

When a note's duration extends past a bar line (e.g., a half note starting on beat 3 of 4/4), the renderer must handle the overflow. Proper notation uses ties to split the note across the barline.

**Phase 1 behavior (no ties):** Render the note at its full visual width. Place the bar line at the correct beat position. The note will visually extend past the bar line. This is technically incorrect notation but is a known limitation until ties are implemented.

**Phase 2 behavior (with ties):** Split the note into two tied notes at the bar line boundary. A half note on beat 3 of 4/4 becomes a tied quarter + quarter. This requires:
1. Detecting when a note's cumulative duration crosses a bar line
2. Splitting it into two note objects connected by a tie arc
3. The tie arc is a curved path from the first note head to the second

**IMPORTANT:** Ties should be prioritized early since cross-barline notes are common in real music. Consider bumping ties into Phase 4 alongside bar lines rather than deferring to "Future Considerations."

### Enharmonic Equivalents

`C#` and `Db` are the same pitch but display differently based on key:
- In G major (1 sharp): prefer sharps
- In F major (1 flat): prefer flats
- Use the spelling provided in the input data

### Accidental Memory

**Metered mode:** Accidentals apply for the entire measure:
- If first C4 is C#4, subsequent C4s in that measure are also sharp
- Reset accidentals at bar lines
- Display courtesy accidentals for clarity (configurable)

**Unmetered mode (no bar lines):** Accidentals apply to the immediately following note of the same pitch only. This avoids unbounded state and matches the convention used in some contemporary scores. Every subsequent occurrence of the same pitch must re-state its accidental.

### Beaming Edge Cases

- Don't beam across bar lines
- Don't beam rests (break beam, rest stands alone)
- Dotted notes: a dotted eighth (`{ length: "1/8", dotted: true }`) beams normally with other eighths; the dot is drawn after the note head but does not affect beam grouping

### Chord Stem Direction

When notes span both sides of the middle line:
- Use the note furthest from center to determine stem direction
- All notes in chord share one stem

### Very High/Low Notes

- Support up to 8 ledger lines above/below
- Consider suggesting clef change for extreme ranges (optional warning)

---

## Canonical Parser Detection Order

When iterating a `notes` array, elements must be detected in this order. The first matching condition determines the element type:

| Priority | Element Type | Detection Rule |
|----------|-------------|----------------|
| 1 | Chord | `Array.isArray(element)` |
| 2 | Tuplet | Has `tuplet` property |
| 3 | Barline | Has `barline` property |
| 4 | Ending | Has `ending` property |
| 5 | Navigation | Has `navigation` property |
| 6 | Tempo marker | Has `tempo` property (object with bpm) |
| 7 | Tempo change | Has `tempoChange` property |
| 8 | Expression | Has `expression` property |
| 9 | Rehearsal | Has `rehearsal` property |
| 10 | Dynamic | Has `dynamic` property |
| 11 | Hairpin | Has `hairpin` property |
| 12 | Note | Has `pitch` or `position` property |
| 13 | Rest | Has `length` but none of the above properties |

**IMPORTANT:** All sub-specs that introduce new element types reference this canonical order. Do not define partial detection orders in individual specs -- always refer back to this table.

---

## Future Feature Specs

Each feature below has a full specification document covering data structures, API design, SVG rendering, testing approach, and gotchas. Audio behavior specs are in `src/audio/`.

| Feature | Notation Spec | Audio Spec |
|---------|---------------|------------|
| **Ties** | [`SPEC-ties.md`](SPEC-ties.md) | [`audio/SPEC-ties.md`](../audio/SPEC-ties.md) |
| **Slurs** | [`SPEC-slurs.md`](SPEC-slurs.md) | [`audio/SPEC-slurs.md`](../audio/SPEC-slurs.md) |
| **Dynamics** | [`SPEC-dynamics.md`](SPEC-dynamics.md) | [`audio/SPEC-dynamics.md`](../audio/SPEC-dynamics.md) |
| **Articulations** | [`SPEC-articulations.md`](SPEC-articulations.md) | [`audio/SPEC-articulations.md`](../audio/SPEC-articulations.md) |
| **Tuplets** | [`SPEC-tuplets.md`](SPEC-tuplets.md) | [`audio/SPEC-tuplets.md`](../audio/SPEC-tuplets.md) |
| **Grace Notes** | [`SPEC-grace-notes.md`](SPEC-grace-notes.md) | [`audio/SPEC-grace-notes.md`](../audio/SPEC-grace-notes.md) |
| **Repeats** | [`SPEC-repeats.md`](SPEC-repeats.md) | [`audio/SPEC-repeats.md`](../audio/SPEC-repeats.md) |
| **Text Annotations** | [`SPEC-text-annotations.md`](SPEC-text-annotations.md) | [`audio/SPEC-text-annotations.md`](../audio/SPEC-text-annotations.md) |

**Priorities:** Ties should be promoted to Phase 4 alongside bar lines (cross-barline notes are common). Tuplets and dynamics are high-value additions after that.

---

*Spec Version: 1.7*
*Created: 2026-01-25*

**Revision History:**
- **v1.1** - Diatonic positioning, staff spacing, dotted notes, percussion mapping, clef table, validation errors, cross-barline handling, chord parsing.
- **v1.2** - Alto/tenor reference constants.
- **v1.3** - Unmetered beaming rule, unmetered accidental scope, per-voice validation, render() replace semantics.
- **v1.4** - Detailed tuplet consideration with proposed data format and system impact.
- **v1.5** - Extracted all future features into individual spec files with notation + audio pairs.
- **v1.6** - Audit fixes: canonical parser detection order, pre-processing requirements, getDuration dotted note responsibility, resolvePlaybackOrder naming, chord duration clarification, markers array for multi-voice, fermata duration extension approach, repeatPass parameter, parseFraction independence, stale version references, dot Y positions, file structure additions.
- **v1.7** - Restructured: extracted testing approach to SPEC-testing.md, moved implementation order to ROADMAP.md, removed placeholder SVG symbol paths.
