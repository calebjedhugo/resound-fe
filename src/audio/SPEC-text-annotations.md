# Text Annotations - Audio Spec

Audio playback behavior for text annotations. Only tempo-related annotations affect audio; expression, rehearsal marks, and lyrics are informational only.

> **Notation:** [SPEC-text-annotations.md](../notation/SPEC-text-annotations.md) · **Parent:** [SPEC.md](../notation/SPEC.md)

---

## Overview

Text annotation markers appear inline in the `notes` array (same data structure as notation).

### Pre-processing Requirement

All marker objects (dynamics, hairpins, tempo, tempoChange, expression, rehearsal, barlines, endings, navigation) MUST be processed and stripped from the data array before passing to `Instrument.play()`. The `play()` method only accepts note objects, rest objects, and chord arrays. A pre-processing pipeline should extract markers, build a state timeline, and pass clean note data to `play()` along with the state timeline.

The audio playback loop must recognize these markers and respond:

- **Tempo markings** - Set the clock to a new BPM
- **Gradual tempo changes** - Interpolate tempo over a span of notes
- **Expression text** - No audio effect
- **Rehearsal marks** - No audio effect
- **Lyrics** - No audio effect (property on note objects, ignored by audio)

---

## Data Structures

Same inline markers consumed by the notation system:

```js
// Tempo marking (sets BPM)
{ tempo: { bpm: 120, beat: "1/4", text: "Allegro" } }
{ tempo: { bpm: 80, beat: "1/4" } }
{ tempo: { text: "Andante" } }     // No audio effect (no bpm)

// Gradual tempo changes
{ tempoChange: "ritardando" }      // Gradually slower
{ tempoChange: "accelerando" }     // Gradually faster
{ tempoChange: "a-tempo" }         // Restore previous tempo

// No audio effect (skip these in playback)
{ expression: "dolce" }
{ rehearsal: "A" }
```

Notes with `lyric` property play normally -- the `lyric` field is ignored by the audio system.

---

## Audio Behavior

### Tempo Markings

When the playback loop encounters a `{ tempo: {...} }` marker:

1. **If `bpm` is present**: Calculate effective BPM and call `MusicalClock.setTempo(effectiveBPM)`
2. **If only `text` is present** (no `bpm`): No audio effect. The text is purely visual.
3. **Store as base tempo**: Save this BPM as the "base tempo" so `a-tempo` can restore it later.

#### Beat Basis Conversion

The `beat` property specifies which note value gets one beat. This affects the effective quarter-note BPM that `MusicalClock` expects (since `MusicalClock` tracks beats as quarter notes).

**Formula:**

```
effectiveBPM = bpm * (beatFraction / 0.25)
```

Where `beatFraction` is the decimal value of the `beat` string:
- `"1/4"` = 0.25 (quarter note) -- effectiveBPM = bpm * 1 = bpm
- `"1/8"` = 0.125 (eighth note) -- effectiveBPM = bpm * 0.5
- `"1/2"` = 0.5 (half note) -- effectiveBPM = bpm * 2
- `"3/8"` = 0.375 (dotted quarter) -- effectiveBPM = bpm * 1.5

**Examples:**
- `{ bpm: 120, beat: "1/4" }` -- 120 quarter notes/min. effectiveBPM = 120.
- `{ bpm: 120, beat: "1/8" }` -- 120 eighth notes/min = 60 quarter notes/min. effectiveBPM = 60.
- `{ bpm: 60, beat: "1/2" }` -- 60 half notes/min = 120 quarter notes/min. effectiveBPM = 120.

If `beat` is omitted but `bpm` is present, default to `"1/4"` (effectiveBPM = bpm).

### Ritardando

When the playback loop encounters `{ tempoChange: "ritardando" }`:

1. Record the current tempo as `startTempo`
2. Calculate `targetTempo = startTempo * 0.7` (reduce to 70% of current tempo)
3. Determine the span: all notes from this marker until the next `tempo`, `tempoChange`, or end of piece
4. For each note in the span, linearly interpolate the tempo:

```
progress = noteIndex / totalNotesInSpan    // 0.0 to 1.0
currentTempo = startTempo + (targetTempo - startTempo) * progress
MusicalClock.setTempo(currentTempo)
```

5. Call `MusicalClock.setTempo()` before playing each note in the span

### Accelerando

Same as ritardando but increasing:

1. Record `startTempo`
2. Calculate `targetTempo = startTempo * 1.3` (increase to 130% of current tempo)
3. Same span detection and linear interpolation as ritardando

### A Tempo

When the playback loop encounters `{ tempoChange: "a-tempo" }`:

1. Restore the most recent **base tempo** (the last explicit `tempo` marker's effective BPM)
2. Call `MusicalClock.setTempo(baseTempo)`
3. This is instantaneous, not gradual

---

## Impact on Playback

### Play Loop Changes

The `Instrument.play()` loop currently iterates through `data[]` and plays notes/chords. It must be updated to:

1. **Skip non-note markers**: When encountering a `tempo`, `tempoChange`, `expression`, or `rehearsal` object, do not attempt to play it as a note. These markers have no `pitch` or `length`.
2. **Process tempo markers**: Before playing the next note, check if the current element is a tempo marker and update the clock accordingly.
3. **Track base tempo**: Maintain a `baseTempo` variable that updates only on explicit `tempo` markers (not rit/accel).
4. **Per-note tempo for rit/accel**: During a gradual change span, recalculate and set tempo before each note.

**Detection logic** for the play loop:

```js
function isMarker(element) {
  return !Array.isArray(element) && !element.pitch && !element.length;
}

function processMarker(element, state) {
  if (element.tempo) {
    if (element.tempo.bpm) {
      const beat = element.tempo.beat || "1/4";
      const beatFraction = parseFraction(beat); // see note below
      const effectiveBPM = element.tempo.bpm * (beatFraction / 0.25);
      clock.setTempo(effectiveBPM);
      state.baseTempo = effectiveBPM;
    }
  } else if (element.tempoChange === 'ritardando') {
    state.gradualChange = { type: 'rit', startTempo: clock.tempo, target: 0.7 };
  } else if (element.tempoChange === 'accelerando') {
    state.gradualChange = { type: 'accel', startTempo: clock.tempo, target: 1.3 };
  } else if (element.tempoChange === 'a-tempo') {
    clock.setTempo(state.baseTempo);
    state.gradualChange = null;
  }
  // expression and rehearsal: no action
}
```

**Note on `parseFraction`:** A `parseFraction(str)` utility splits a fraction string (e.g., `'3/4'`) into numerator and denominator. This can be implemented inline or extracted to a shared utility in `audio/lib/`. The audio system must NOT import from the notation library.

### Marker Detection

A marker is distinguished from a note/rest/chord by:
- Not an array (not a chord)
- Has no `pitch` property (not a note)
- Has no `length` property (not a rest)
- Has one of: `tempo`, `tempoChange`, `expression`, `rehearsal`

**IMPORTANT:** The `lyric` property lives on note objects alongside `pitch` and `length`. Notes with lyrics are still normal notes -- do not treat them as markers.

### Duration Calculation Under Tempo Changes

When tempo changes mid-piece, each note's duration in real time depends on the tempo at the moment it plays. The existing `getDuration(length, tempo, basis)` function already takes `tempo` as a parameter. For rit/accel spans, pass the interpolated tempo for each note.

---

## Gotchas

### Default Tempo

If no `tempo` marker appears before the first note, default to 120 BPM (quarter note basis). This matches `MusicalClock`'s default constructor value. The `baseTempo` for `a-tempo` restoration should also default to 120.

### Beat Basis Matters

`{ bpm: 120, beat: "1/4" }` and `{ bpm: 120, beat: "1/8" }` are very different speeds. The first is 120 quarter notes per minute (standard). The second is 120 eighth notes per minute, which is only 60 quarter notes per minute -- half the speed. Always convert to quarter-note BPM before calling `setTempo()`.

### Rit/Accel Without Explicit End

A ritardando or accelerando continues until one of:
1. An `a-tempo` marker
2. A new `tempo` marker (which sets a new explicit BPM)
3. A new `tempoChange` marker (starts a new gradual change)
4. End of the piece

If a rit/accel runs to the end of the piece, the final note plays at the fully interpolated target tempo.

### Sequential Rit/Accel

If a second `ritardando` appears while the first is still active, the second one starts from the *current* (already modified) tempo, not the original base tempo. Each gradual change is relative to whatever the tempo is at that moment.

Example:
- Base tempo: 120 BPM
- First rit: slows from 120 to 84 (70%) over 4 notes
- After 4 notes, tempo is 84
- Second rit: slows from 84 to 59 (70% of 84) over the next notes
- `a-tempo` restores to 120 (the last explicit tempo marking)

### Markers Are Zero-Duration

Markers do not consume any musical time. They are processed instantly and the play loop moves to the next element. Multiple consecutive markers (e.g., rehearsal + tempo + expression at the start of a section) are all processed before the first note plays.

### Tempo Text Without BPM

A `{ tempo: { text: "Andante" } }` marker with no `bpm` has no audio effect. It is purely a visual annotation for the notation system. The audio system should skip it without changing the clock.

---

## File Structure

New file: `lib/tempoProcessor.js` for tempo change interpolation. Modifications to `Instrument.js`.

---

*Spec Version: 1.0*
*Created: 2026-01-25*
