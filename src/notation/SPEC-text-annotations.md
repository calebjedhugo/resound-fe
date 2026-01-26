# Text Annotations - Notation Spec

Rendering specification for text annotations: tempo markings, expression text, rehearsal marks, and lyrics.

> **Parent:** [SPEC.md](SPEC.md) · **Audio:** [SPEC-text-annotations.md](../audio/SPEC-text-annotations.md)

---

## Goals

Text annotations add contextual information to the score that goes beyond pitch and rhythm. They communicate:

1. **Tempo** - How fast to play (BPM, traditional Italian terms, gradual changes)
2. **Expression** - Performance character (dolce, cantabile, etc.)
3. **Rehearsal marks** - Navigation landmarks in the score
4. **Lyrics** - Sung text aligned to notes

These are visual elements rendered on the SVG staff. Some (tempo) also affect audio playback -- see `src/audio/SPEC-text-annotations.md` for that side.

---

## Data Structures

All text annotations use inline marker objects in the `notes` array, consistent with how dynamics markers work. Lyrics are the exception: they attach directly to note objects.

For parser detection of text annotation markers, see "Canonical Parser Detection Order" in the main SPEC.md.

### Tempo Markings

```js
// Full: text label + metronome marking
{ tempo: { bpm: 120, beat: "1/4", text: "Allegro" } }

// Text only (no metronome number)
{ tempo: { text: "Andante" } }

// Metronome only (no text label)
{ tempo: { bpm: 80, beat: "1/4" } }

// Mid-piece tempo change
{ tempo: { bpm: 140, beat: "1/4", text: "Vivace" } }
```

Properties:
- `bpm` (number, optional) - Beats per minute
- `beat` (string, optional) - Which note value gets the beat, as a fraction (`"1/4"`, `"1/8"`, etc.). Defaults to `"1/4"` if `bpm` is present but `beat` is omitted.
- `text` (string, optional) - Traditional tempo term (e.g., "Allegro", "Andante")

At least one of `bpm` or `text` must be present.

### Gradual Tempo Changes

```js
{ tempoChange: "ritardando" }     // rit. - gradually slower
{ tempoChange: "accelerando" }    // accel. - gradually faster
{ tempoChange: "a-tempo" }        // return to previous tempo
```

Valid values: `"ritardando"`, `"accelerando"`, `"a-tempo"`.

### Expression Text

```js
{ expression: "dolce" }
{ expression: "cantabile" }
{ expression: "espressivo" }
```

Free-form string. No fixed vocabulary -- the renderer displays whatever text is given.

### Rehearsal Marks

```js
{ rehearsal: "A" }    // boxed letter
{ rehearsal: "B" }
{ rehearsal: "1" }    // or number
```

String value. Typically single letters (A-Z) or numbers (1, 2, 3...).

### Lyrics

Lyrics are a property on note objects, not standalone markers:

```js
{ pitch: "C4", length: "1/4", lyric: "Hel-" }
{ pitch: "D4", length: "1/4", lyric: "lo" }
{ pitch: "E4", length: "1/2", lyric: "world" }
```

Convention:
- Trailing hyphen (`"Hel-"`) indicates the syllable continues to the next note
- No hyphen means the word ends on that note
- **Melisma**: When one syllable spans multiple notes, only the first note carries the `lyric` property. Subsequent notes in the melisma have no `lyric`. The renderer draws an underscore extending under the melisma notes.

---

## API Additions

No new public API methods on `NotationRenderer`. Text annotations are rendered automatically when present in the data passed to `render()`.

### Validation

`validateNoteData()` gains new error types:

| Type | Meaning |
|------|---------|
| `invalid_tempo` | Tempo marker has neither `bpm` nor `text`, or `bpm` is not a positive number |
| `invalid_tempo_change` | `tempoChange` value is not one of the three valid strings |
| `invalid_rehearsal` | `rehearsal` value is not a non-empty string |

Expression and lyrics are free-form strings and do not produce validation errors (empty string is allowed for lyrics to explicitly mark "no lyric on this note").

### Query Helpers (test context)

```js
// Add to createNotationContext():
getTempoMarkings()      // container.querySelectorAll('.tempo-marking')
getTempoChanges()       // container.querySelectorAll('.tempo-change')
getExpressionTexts()    // container.querySelectorAll('.expression')
getRehearsalMarks()     // container.querySelectorAll('.rehearsal-mark')
getLyrics()             // container.querySelectorAll('.lyric')
```

---

## SVG Structure

### Tempo Marking

```xml
<g class="tempo-marking" data-beat="0" transform="translate(100, -20)">
  <text class="tempo-text" font-weight="bold">Allegro</text>
  <text class="tempo-metronome" font-weight="bold" x="60">(&#9833; = 120)</text>
</g>
```

When only text: single `<text class="tempo-text">`.
When only metronome: single `<text class="tempo-metronome">`.

### Gradual Tempo Change

```xml
<g class="tempo-change tempo-change-rit" data-beat="8" transform="translate(400, -10)">
  <text font-style="italic">rit.</text>
  <line class="tempo-change-dashes" x1="30" y1="0" x2="100" y2="0"
        stroke-dasharray="5,5" />
</g>
```

### Expression Text

```xml
<g class="expression" data-beat="4" transform="translate(200, -5)">
  <text font-style="italic">dolce</text>
</g>
```

### Rehearsal Mark

```xml
<g class="rehearsal-mark" data-beat="0" transform="translate(100, -40)">
  <rect class="rehearsal-box" x="-4" y="-16" width="24" height="22"
        fill="none" stroke="currentColor" stroke-width="2" />
  <text font-weight="bold" font-size="18">A</text>
</g>
```

### Lyric

```xml
<g class="lyric" data-beat="0" transform="translate(100, 120)">
  <text text-anchor="middle">Hel-</text>
</g>
<!-- Melisma underscore -->
<line class="lyric-melisma" x1="200" y1="125" x2="350" y2="125" />
```

### CSS Classes

| Class | Element |
|-------|---------|
| `.tempo-marking` | Tempo container (text + metronome) |
| `.tempo-text` | Tempo text label (e.g., "Allegro") |
| `.tempo-metronome` | Metronome marking (e.g., "&#9833; = 120") |
| `.tempo-change` | Gradual tempo change container |
| `.tempo-change-rit` | Modifier: ritardando |
| `.tempo-change-accel` | Modifier: accelerando |
| `.tempo-change-a-tempo` | Modifier: a tempo |
| `.tempo-change-dashes` | Dashed line extending over affected notes |
| `.expression` | Expression text container |
| `.rehearsal-mark` | Rehearsal mark container |
| `.rehearsal-box` | Rectangle border around rehearsal letter/number |
| `.lyric` | Single lyric syllable container |
| `.lyric-melisma` | Underscore line for melisma |

---

## Rendering Details

### Vertical Stacking Order

Above the staff (top to bottom, highest first):

1. **Rehearsal marks** (highest, most prominent)
2. **Tempo markings**
3. **Gradual tempo changes** (rit., accel., a tempo)
4. **Expression text**
5. *(Staff)*
6. **Dynamics** (below staff)
7. **Lyrics** (lowest)

Each layer occupies a fixed vertical band relative to the staff. This avoids per-element collision detection in the initial implementation.

| Layer | Y offset from top staff line |
|-------|------------------------------|
| Rehearsal marks | -60px |
| Tempo markings | -40px |
| Tempo changes | -25px |
| Expression text | -12px |
| *(Top staff line)* | 0px |
| *(Bottom staff line)* | 80px |
| Dynamics | +100px |
| Lyrics | +115px |

### Tempo Markings

- **Font**: Bold, same family as other notation text
- **Size**: 14px (larger than expression text)
- **Position**: Above the staff, left-aligned to the beat position of the marker
- **Metronome format**: Note symbol + equals + number
  - `"1/4"` beat: `&#9833; = 120` (quarter note symbol)
  - `"1/8"` beat: `&#9834; = 120` (eighth note symbol)
  - `"1/2"` beat: half note symbol
- **Combined format**: `Allegro (&#9833; = 120)` -- text first, metronome in parentheses
- **Start of piece**: Tempo marking at beat 0 renders at the first note position (after clef, key sig, time sig)
- **Mid-piece**: Renders at the horizontal position of the note it precedes

### Gradual Tempo Changes

- **Font**: Italic, 12px
- **Abbreviations**:
  - `"ritardando"` renders as `rit.`
  - `"accelerando"` renders as `accel.`
  - `"a-tempo"` renders as `a tempo` (no abbreviation, no hyphen in display)
- **Dashes**: For rit. and accel., a dashed line extends from the text to the right, spanning the notes the change applies to. The dashes end at the next tempo marker, `a-tempo` marker, or end of the piece.
- **No dashes for a tempo**: `a tempo` is a point-in-time instruction, not a span.

### Expression Text

- **Font**: Italic, 11px (smaller than tempo markings)
- **Position**: Above the staff in single-voice scores. In multi-voice scores, voice 1 expressions go above, voice 2 expressions go below the staff (at the lyrics Y level, pushing lyrics further down).
- **Alignment**: Left-aligned to the beat position

### Rehearsal Marks

- **Font**: Bold, 18px (largest text element)
- **Box**: Rectangle with 2px stroke, 4px padding around the text
- **Position**: Above the staff, snapped to the nearest barline. If the marker falls between barlines, it renders at the next barline.
- **Prominence**: Rehearsal marks are intentionally the highest and largest element, serving as visual landmarks.

### Lyrics

- **Font**: Regular weight, 11px
- **Position**: Below the staff, centered horizontally under each note
- **Alignment**: `text-anchor="middle"` to center under the note head
- **Hyphens**: When a lyric ends with `-`, the renderer draws a small hyphen centered between the current note and the next note (not attached to the text).
- **Melisma**: When a syllable spans multiple notes (no `lyric` property on subsequent notes after one with a lyric), draw an underscore line from the end of the lyric text to the last melisma note. The underscore sits at the text baseline.
- **Multi-voice lyrics**: Each voice can have its own lyric line. Voice 1 lyrics appear at the standard position below the staff. Voice 2 lyrics appear one line lower (offset by ~15px).
- **Word spacing**: Adjacent syllables of the same word (connected by hyphens) are spaced normally. A new word following a completed word gets standard note spacing (no extra gap needed).

---

## File Structure

New component files:

```
src/notation/components/
  TempoMarking.js        # Tempo text + metronome rendering (handles both point tempo markings and gradual tempo changes: rit., accel., a tempo)
  ExpressionText.js      # Expression text rendering
  RehearsalMark.js       # Boxed rehearsal letter/number
  Lyric.js               # Per-note lyric text, hyphens, melisma
```

These follow the existing component pattern (each exports a render function that returns SVG elements).

---

## Testing Approach

Follow the project's integration testing philosophy from `TESTING.md`. Test through `NotationRenderer` using `createNotationContext()`.

### Tempo Marking Tests

```js
describe('tempo markings', () => {
  it('renders tempo text above the staff', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        { tempo: { bpm: 120, beat: "1/4", text: "Allegro" } },
        { pitch: "C4", length: "1/4" },
        { pitch: "E4", length: "1/4" },
        { pitch: "G4", length: "1/4" },
        { pitch: "C5", length: "1/4" }
      ]
    });

    const tempos = ctx.getTempoMarkings();
    expect(tempos).toHaveLength(1);
    expect(tempos[0].textContent).toContain('Allegro');
    expect(tempos[0].textContent).toContain('120');
  });

  it('renders metronome-only marking without text label', () => {
    ctx.render({
      notes: [
        { tempo: { bpm: 80, beat: "1/4" } },
        { pitch: "C4", length: "1/2" }
      ]
    });

    const tempos = ctx.getTempoMarkings();
    expect(tempos).toHaveLength(1);
    expect(tempos[0].querySelector('.tempo-metronome')).not.toBeNull();
    expect(tempos[0].querySelector('.tempo-text')).toBeNull();
  });

  it('renders text-only marking without metronome number', () => {
    ctx.render({
      notes: [
        { tempo: { text: "Andante" } },
        { pitch: "C4", length: "1/2" }
      ]
    });

    const tempos = ctx.getTempoMarkings();
    expect(tempos[0].querySelector('.tempo-text')).not.toBeNull();
    expect(tempos[0].querySelector('.tempo-metronome')).toBeNull();
  });

  it('renders mid-piece tempo change at correct beat position', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        { tempo: { bpm: 120, beat: "1/4", text: "Allegro" } },
        { pitch: "C4", length: "1/4" },
        { pitch: "D4", length: "1/4" },
        { pitch: "E4", length: "1/4" },
        { pitch: "F4", length: "1/4" },
        { tempo: { bpm: 140, beat: "1/4", text: "Vivace" } },
        { pitch: "G4", length: "1/4" },
        { pitch: "A4", length: "1/4" },
        { pitch: "B4", length: "1/4" },
        { pitch: "C5", length: "1/4" }
      ]
    });

    const tempos = ctx.getTempoMarkings();
    expect(tempos).toHaveLength(2);
    expect(tempos[1].textContent).toContain('Vivace');
  });
});
```

### Gradual Tempo Change Tests

```js
describe('gradual tempo changes', () => {
  it('renders ritardando as italic "rit." with dashes', () => {
    ctx.render({
      notes: [
        { pitch: "C4", length: "1/4" },
        { tempoChange: "ritardando" },
        { pitch: "D4", length: "1/4" },
        { pitch: "E4", length: "1/4" }
      ]
    });

    const changes = ctx.getTempoChanges();
    expect(changes).toHaveLength(1);
    expect(changes[0].classList.contains('tempo-change-rit')).toBe(true);
    expect(changes[0].textContent).toContain('rit.');
  });

  it('renders accelerando as italic "accel."', () => {
    ctx.render({
      notes: [
        { pitch: "C4", length: "1/4" },
        { tempoChange: "accelerando" },
        { pitch: "D4", length: "1/8" },
        { pitch: "E4", length: "1/8" }
      ]
    });

    const changes = ctx.getTempoChanges();
    expect(changes[0].classList.contains('tempo-change-accel')).toBe(true);
    expect(changes[0].textContent).toContain('accel.');
  });

  it('renders a tempo without dashes', () => {
    ctx.render({
      notes: [
        { tempoChange: "ritardando" },
        { pitch: "C4", length: "1/4" },
        { tempoChange: "a-tempo" },
        { pitch: "D4", length: "1/4" }
      ]
    });

    const changes = ctx.getTempoChanges();
    const aTempo = [...changes].find(el =>
      el.classList.contains('tempo-change-a-tempo')
    );
    expect(aTempo).toBeDefined();
    expect(aTempo.querySelector('.tempo-change-dashes')).toBeNull();
  });
});
```

### Expression Text Tests

```js
describe('expression text', () => {
  it('renders expression in italic above the staff', () => {
    ctx.render({
      notes: [
        { expression: "dolce" },
        { pitch: "C4", length: "1/4" },
        { pitch: "E4", length: "1/4" }
      ]
    });

    const expressions = ctx.getExpressionTexts();
    expect(expressions).toHaveLength(1);
    expect(expressions[0].textContent).toContain('dolce');
  });
});
```

### Rehearsal Mark Tests

```js
describe('rehearsal marks', () => {
  it('renders boxed letter above the staff', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        { rehearsal: "A" },
        { pitch: "C4", length: "1/4" },
        { pitch: "E4", length: "1/4" },
        { pitch: "G4", length: "1/4" },
        { pitch: "C5", length: "1/4" }
      ]
    });

    const marks = ctx.getRehearsalMarks();
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toContain('A');
    expect(marks[0].querySelector('.rehearsal-box')).not.toBeNull();
  });

  it('renders number rehearsal marks', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        { rehearsal: "1" },
        { pitch: "C4", length: "1/4" },
        { pitch: "E4", length: "1/4" },
        { pitch: "G4", length: "1/4" },
        { pitch: "C5", length: "1/4" }
      ]
    });

    const marks = ctx.getRehearsalMarks();
    expect(marks[0].textContent).toContain('1');
  });
});
```

### Lyric Tests

```js
describe('lyrics', () => {
  it('renders lyrics below each note', () => {
    ctx.render({
      notes: [
        { pitch: "C4", length: "1/4", lyric: "Hel-" },
        { pitch: "D4", length: "1/4", lyric: "lo" },
        { pitch: "E4", length: "1/2", lyric: "world" }
      ]
    });

    const lyrics = ctx.getLyrics();
    expect(lyrics).toHaveLength(3);
    expect(lyrics[0].textContent).toContain('Hel');
    expect(lyrics[2].textContent).toContain('world');
  });

  it('renders hyphens between syllables', () => {
    ctx.render({
      notes: [
        { pitch: "C4", length: "1/4", lyric: "Hel-" },
        { pitch: "D4", length: "1/4", lyric: "lo" }
      ]
    });

    // Hyphen should appear between the two lyric elements
    const svg = ctx.getSvg();
    const lyricText = svg.textContent;
    expect(lyricText).toContain('Hel');
    expect(lyricText).toContain('lo');
  });

  it('renders melisma underscore when syllable spans multiple notes', () => {
    ctx.render({
      notes: [
        { pitch: "C4", length: "1/4", lyric: "love" },
        { pitch: "D4", length: "1/4" },  // melisma - no lyric
        { pitch: "E4", length: "1/4" },  // melisma continues
        { pitch: "F4", length: "1/4", lyric: "you" }
      ]
    });

    const melismas = ctx.container.querySelectorAll('.lyric-melisma');
    expect(melismas.length).toBeGreaterThan(0);
  });

  it('handles notes without lyrics (no lyric elements rendered)', () => {
    ctx.render({
      notes: [
        { pitch: "C4", length: "1/4" },
        { pitch: "D4", length: "1/4" }
      ]
    });

    const lyrics = ctx.getLyrics();
    expect(lyrics).toHaveLength(0);
  });
});
```

### Vertical Stacking Tests

```js
describe('annotation stacking', () => {
  it('positions rehearsal marks above tempo markings', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        { rehearsal: "A" },
        { tempo: { bpm: 120, beat: "1/4", text: "Allegro" } },
        { pitch: "C4", length: "1/4" },
        { pitch: "E4", length: "1/4" },
        { pitch: "G4", length: "1/4" },
        { pitch: "C5", length: "1/4" }
      ]
    });

    const rehearsal = ctx.getRehearsalMarks()[0];
    const tempo = ctx.getTempoMarkings()[0];

    // Rehearsal mark should have a smaller (more negative) Y than tempo
    const rehearsalY = rehearsal.getBoundingClientRect().top;
    const tempoY = tempo.getBoundingClientRect().top;
    expect(rehearsalY).toBeLessThan(tempoY);
  });
});
```

### Test Fixtures

Add to `__tests__/fixtures/songs/`:

```js
// with-tempo.json
{
  "timeSignature": [4, 4],
  "notes": [
    { "tempo": { "bpm": 120, "beat": "1/4", "text": "Allegro" } },
    { "pitch": "C4", "length": "1/4" },
    { "pitch": "D4", "length": "1/4" },
    { "pitch": "E4", "length": "1/4" },
    { "pitch": "F4", "length": "1/4" },
    { "tempoChange": "ritardando" },
    { "pitch": "E4", "length": "1/4" },
    { "pitch": "D4", "length": "1/4" },
    { "pitch": "C4", "length": "1/2" }
  ]
}

// with-lyrics.json
{
  "timeSignature": [4, 4],
  "notes": [
    { "pitch": "C4", "length": "1/4", "lyric": "Twink-" },
    { "pitch": "C4", "length": "1/4", "lyric": "le" },
    { "pitch": "G4", "length": "1/4", "lyric": "twink-" },
    { "pitch": "G4", "length": "1/4", "lyric": "le" },
    { "pitch": "A4", "length": "1/4", "lyric": "lit-" },
    { "pitch": "A4", "length": "1/4", "lyric": "tle" },
    { "pitch": "G4", "length": "1/2", "lyric": "star" }
  ]
}
```

---

## Gotchas

### Tempo at Start vs Mid-Piece

A tempo marking at the start of the piece (beat 0) must render after the clef, key signature, and time signature -- not at x=0. Use the same horizontal position as the first note. Mid-piece tempo markings render at the beat position of the next note.

### Lyrics with Melisma

Detecting melisma requires looking ahead in the notes array: if a note has a `lyric` and the next note(s) do not, those notes are melisma. The underscore extends from the lyric text to the last note before either a new lyric appears or the piece ends. Be careful not to treat notes that simply lack lyrics (in a passage with no lyrics at all) as melisma.

**Rule**: Melisma only occurs when at least one note in the voice has a `lyric` property. If no notes have lyrics, no melisma lines are drawn.

### Rehearsal Marks and Barlines

Rehearsal marks should snap to the nearest barline. If a rehearsal marker is placed between barlines in the data, the renderer should position it at the next barline. In unmetered music (no time signature), rehearsal marks render at their literal position in the notes array.

### Expression Text Collision with Tempo

When expression text and a tempo marking appear at the same beat position, they should not overlap. The fixed vertical band approach (different Y offsets) handles this. If both are present at beat 0, they stack according to the vertical order.

### Multi-Voice Lyrics

Each voice can have its own lyrics. In multi-voice rendering:
- Voice 1 (top staff): lyrics at the standard below-staff position
- Voice 2 (bottom staff): lyrics below that staff
- Shared staff with two voices: voice 1 lyrics go below the staff, voice 2 lyrics go one line further below (offset by ~15px)

### Unicode in Lyrics

Lyrics must support Unicode characters: accented characters (e, o, u), non-Latin scripts, and special punctuation. The SVG `<text>` element handles this natively. No special encoding is needed beyond standard UTF-8.

### Marker Ordering in Notes Array

Multiple markers can appear at the same beat position (e.g., rehearsal + tempo + expression at the start of a section). The parser should process them in array order and the renderer should place them in their respective vertical bands regardless of order in the data.

---

*Spec Version: 1.0*
*Created: 2026-01-25*
