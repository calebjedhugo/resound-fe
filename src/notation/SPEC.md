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

The `dotted` flag means "this duration is 1.5x the written length." The renderer draws an augmentation dot. The audio system multiplies duration by 1.5.

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

All notes in a chord share the same length (use first note's length if they differ).

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

## Testing Approach

Follow the project's integration testing philosophy from `TESTING.md`.

### What Gets Mocked

**Mocked (external browser APIs):**
- DOM (`document.createElement`, `document.getElementById`)
- Potentially `requestAnimationFrame` if animation is added

**Not mocked (tested as integrated units):**
- All `lib/` modules
- All `components/`
- NotationRenderer
- Data parsing and validation

### Test Context

Create a test helper similar to the game's `createTestContext()`:

```js
// src/notation/__tests__/helpers/testUtils.js

export function createNotationContext() {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const renderer = new NotationRenderer({ container });

  return {
    renderer,
    container,

    // Render helpers
    render(song) {
      return renderer.render(song);
    },

    // Query helpers
    getSvg() {
      return container.querySelector('svg');
    },
    getNotes() {
      return container.querySelectorAll('.note');
    },
    getRests() {
      return container.querySelectorAll('.rest');
    },
    getActiveNote() {
      return container.querySelector('.note-active');
    },
    getClef() {
      return container.querySelector('.clef');
    },
    getKeySignature() {
      return container.querySelector('.key-signature');
    },
    getTimeSignature() {
      return container.querySelector('.time-signature');
    },
    getBarLines() {
      return container.querySelectorAll('.bar-line');
    },
    getBeamGroups() {
      return container.querySelectorAll('.beam-group');
    },
    getLedgerLines() {
      return container.querySelectorAll('.ledger-line');
    },

    // Cleanup
    destroy() {
      renderer.clear();
      container.remove();
    }
  };
}
```

### Example Tests

```js
// NotationRenderer.test.js

describe('NotationRenderer', () => {
  let ctx;

  beforeEach(() => {
    ctx = createNotationContext();
  });

  afterEach(() => {
    ctx.destroy();
  });

  describe('rendering simple melodies', () => {
    it('renders one note per pitch in the song', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' }
      ]);

      expect(ctx.getNotes()).toHaveLength(3);
    });

    it('renders rests when pitch is omitted', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { length: '1/4' },  // rest
        { pitch: 'G4', length: '1/4' }
      ]);

      expect(ctx.getNotes()).toHaveLength(2);
      expect(ctx.getRests()).toHaveLength(1);
    });
  });

  describe('clef inference', () => {
    it('uses treble clef when median pitch is C4 or above', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' }
      ]);

      expect(ctx.getClef().classList.contains('clef-treble')).toBe(true);
    });

    it('uses bass clef when median pitch is below C4', () => {
      ctx.render([
        { pitch: 'C3', length: '1/4' },
        { pitch: 'E3', length: '1/4' },
        { pitch: 'G3', length: '1/4' }
      ]);

      expect(ctx.getClef().classList.contains('clef-bass')).toBe(true);
    });

    it('uses percussion clef when no pitches are present', () => {
      ctx.render([
        { position: 1, length: '1/4' },
        { position: 5, length: '1/4' }
      ]);

      expect(ctx.getClef().classList.contains('clef-percussion')).toBe(true);
    });
  });

  describe('time signatures and bar lines', () => {
    it('shows no bar lines when time signature is omitted', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
        { pitch: 'C5', length: '1/4' }
      ]);

      expect(ctx.getBarLines()).toHaveLength(0);
      expect(ctx.getTimeSignature()).toBeNull();
    });

    it('shows time signature and bar lines when specified', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
          { pitch: 'C5', length: '1/4' },
          // measure 2
          { pitch: 'B4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'C4', length: '1/4' }
        ]
      });

      expect(ctx.getTimeSignature()).not.toBeNull();
      expect(ctx.getBarLines().length).toBeGreaterThan(0);
    });
  });

  describe('beaming', () => {
    it('beams eighth notes within the same beat', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/8' },
          { pitch: 'D4', length: '1/8' },
          { pitch: 'E4', length: '1/4' }
        ]
      });

      expect(ctx.getBeamGroups()).toHaveLength(1);
    });

    it('breaks beams across beat boundaries', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/8' },
          { pitch: 'D4', length: '1/8' },  // beat 1
          { pitch: 'E4', length: '1/8' },
          { pitch: 'F4', length: '1/8' }   // beat 2
        ]
      });

      // Should have 2 beam groups, not 1 continuous beam
      expect(ctx.getBeamGroups()).toHaveLength(2);
    });
  });

  describe('playback position', () => {
    it('highlights the note at the current beat', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' }
      ]);

      ctx.renderer.setPlaybackPosition(1); // second note

      const active = ctx.getActiveNote();
      expect(active).not.toBeNull();
      expect(active.dataset.beat).toBe('1');
    });

    it('removes highlight when playback position is cleared', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' }
      ]);

      ctx.renderer.setPlaybackPosition(0);
      expect(ctx.getActiveNote()).not.toBeNull();

      ctx.renderer.setPlaybackPosition(null);
      expect(ctx.getActiveNote()).toBeNull();
    });
  });

  describe('ledger lines', () => {
    it('renders ledger lines for notes above the staff', () => {
      ctx.render([{ pitch: 'A5', length: '1/4' }]);

      expect(ctx.getLedgerLines().length).toBeGreaterThan(0);
    });

    it('renders ledger lines for notes below the staff', () => {
      ctx.render([{ pitch: 'C4', length: '1/4' }]); // middle C needs 1 ledger

      expect(ctx.getLedgerLines()).toHaveLength(1);
    });
  });

  describe('multi-voice rendering', () => {
    it('renders separate staves for each voice', () => {
      ctx.render({
        voices: [
          { clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
          { clef: 'bass', notes: [{ pitch: 'C3', length: '1/4' }] }
        ]
      });

      const staves = ctx.container.querySelectorAll('.staff');
      expect(staves).toHaveLength(2);
    });

    it('allows different time signatures per voice', () => {
      ctx.render({
        timeSignature: [4, 4],
        voices: [
          { clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
          { clef: 'bass', timeSignature: [3, 4], notes: [{ pitch: 'C3', length: '1/4' }] }
        ]
      });

      const timeSigs = ctx.container.querySelectorAll('.time-signature');
      expect(timeSigs).toHaveLength(2);
      expect(timeSigs[0].textContent).toContain('4');
      expect(timeSigs[1].textContent).toContain('3');
    });
  });
});
```

### Test Fixtures

Create JSON files in `__tests__/fixtures/songs/` for reusable test data:

```js
// simple-melody.json
[
  { "pitch": "C4", "length": "1/4" },
  { "pitch": "D4", "length": "1/4" },
  { "pitch": "E4", "length": "1/4" },
  { "pitch": "F4", "length": "1/4" }
]

// with-rests.json
[
  { "pitch": "C4", "length": "1/4" },
  { "length": "1/4" },
  { "pitch": "E4", "length": "1/4" },
  { "length": "1/4" }
]

// with-chords.json
[
  [
    { "pitch": "C4", "length": "1/2" },
    { "pitch": "E4", "length": "1/2" },
    { "pitch": "G4", "length": "1/2" }
  ],
  { "pitch": "B4", "length": "1/2" }
]

// percussion.json - positions 1-9 (odd=lines, even=spaces)
[
  { "position": 5, "length": "1/4" },
  { "position": 5, "length": "1/8" },
  { "position": 5, "length": "1/8" },
  { "position": 1, "length": "1/4" },
  { "position": 9, "length": "1/2" }
]
```

---

## Implementation Order

Suggested build sequence to enable incremental testing:

### Phase 1: Core Data Handling
1. `lib/dataParser.js` - Normalize all input formats
2. `lib/notePositions.js` - Pitch to staff position
3. `lib/durationSymbols.js` - Length to note type
4. `lib/clefInference.js` - Auto-detect clef
5. `lib/keySignatures.js` - Key to accidentals

### Phase 2: Basic Rendering
6. `lib/svgHelpers.js` - SVG utilities
7. `components/Staff.js` - Five lines
8. `components/Note.js` - Note heads and stems
9. `NotationRenderer.js` - Basic single-voice rendering

**Milestone: Can render simple melodies**

### Phase 3: Musical Elements
10. `components/Clef.js` - Clef symbols
11. `components/Rest.js` - Rest symbols
12. `components/LedgerLine.js` - Ledger lines
13. `components/Accidental.js` - Sharps, flats, naturals

**Milestone: Can render any pitched melody with rests**

### Phase 4: Notation Features
14. `components/KeySignature.js` - Key signature display
15. `components/TimeSignature.js` - Time signature display
16. `components/BarLine.js` - Measure dividers
17. `lib/beaming.js` - Beam grouping logic
18. `components/Beam.js` - Beam rendering

**Milestone: Fully metered notation with beaming**

### Phase 5: Advanced Features
19. `components/Cursor.js` - Playback position
20. Multi-voice support in `NotationRenderer.js`
21. Chord rendering
22. Percussion clef and X noteheads

**Milestone: Complete feature set**

---

## SVG Symbol Paths

Reference paths for musical symbols. These can be stored in `components/` or a shared `symbols.js` file.

### Clefs

```js
// Treble clef (G clef) - simplified path
const trebleClef = `M...`; // Complex bezier path

// Bass clef (F clef)
const bassClef = `M...`;

// Percussion clef (two vertical lines)
const percussionClef = `M 0 0 L 0 40 M 10 0 L 10 40`;
```

### Note Heads

```js
// Filled (quarter and smaller)
// Ellipse: rx="6" ry="5" rotated ~20 degrees

// Hollow (half note)
// Ellipse with stroke, no fill

// Whole note
// Wider ellipse, hollow

// X (percussion)
// Two diagonal lines crossing
```

### Rests

```js
// Whole rest: filled rectangle hanging from line
// Half rest: filled rectangle sitting on line
// Quarter rest: squiggly vertical symbol
// Eighth rest: flag-like curve
// 16th rest: two flag-like curves
```

### Accidentals

```js
// Sharp: # symbol with vertical lines extending
// Flat: b shape
// Natural: square with extensions
```

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

## Future Considerations

Not in scope for initial implementation, but keep in mind:

- **Ties** - Connecting notes across bar lines (see "Cross-Barline Notes" in Gotchas - consider promoting to Phase 4)
- **Slurs** - Phrasing curves
- **Dynamics** - p, f, crescendo, etc.
- **Articulations** - Staccato, accent, tenuto
- **Tuplets** - Triplets, quintuplets
- **Grace notes** - Small ornamental notes
- **Repeats** - Repeat signs, endings
- **Text annotations** - Tempo markings, lyrics

---

*Spec Version: 1.3*
*Created: 2026-01-25*
*Revised: 2026-01-25 - v1.1: Diatonic positioning, staff spacing, dotted notes, percussion mapping, clef table, validation errors, cross-barline handling, chord parsing. v1.2: Alto/tenor reference constants. v1.3: Unmetered beaming rule, unmetered accidental scope, per-voice validation, render() replace semantics.*
