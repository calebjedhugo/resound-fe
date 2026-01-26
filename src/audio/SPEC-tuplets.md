# Audio Library: Tuplets Specification

Extends the audio playback system to handle tuplet timing -- N notes played in the duration of M.

> **Notation:** [SPEC-tuplets.md](../notation/SPEC-tuplets.md) · **Parent:** [SPEC.md](../notation/SPEC.md)

---

## Overview

Tuplets modify note timing during playback. A tuplet wrapper object in the `notes` array signals that a group of notes should be played with scaled durations so that `actual` notes fit into the time normally occupied by `normal` notes.

This spec covers how the audio system interprets the tuplet data structure, calculates effective durations, and schedules playback. The data format is shared with the notation library.

---

## Data Structure

Same wrapper object used by the notation system:

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

- `tuplet[0]` = actual count (how many notes are played)
- `tuplet[1]` = normal count (how many notes they replace)
- `notes` = array of note/rest/chord elements
- `length` on each note is the face value; effective duration is scaled

---

## Audio Behavior

### Duration Calculation

Each note's effective duration within a tuplet:

```
effective_ms = getDuration(face_length, tempo, basis) * (normal / actual)
```

The existing `getDuration(fraction, tempo, basis)` function returns the face duration in milliseconds. The caller multiplies by the tuplet ratio.

### Worked Example: Triplet Eighths at 120 BPM

```
tempo = 120, basis = 4 (quarter note beat)

Normal eighth note:
  getDuration("1/8", 120, 4) = ((1 * 4) / 8) * (60 / 120) * 1000 = 250ms

Triplet eighth note (tuplet = [3, 2]):
  effective = 250 * (2 / 3) = 166.67ms

Total group duration:
  3 * 166.67ms = 500ms
  (= 2 normal eighths = 2 * 250ms = 500ms)  -- correct
```

### Worked Example: Quintuplet Sixteenths at 100 BPM

```
tempo = 100, basis = 4

Normal sixteenth note:
  getDuration("1/16", 100, 4) = ((1 * 4) / 16) * (60 / 100) * 1000 = 150ms

Quintuplet sixteenth (tuplet = [5, 4]):
  effective = 150 * (4 / 5) = 120ms

Total group duration:
  5 * 120ms = 600ms
  (= 4 normal sixteenths = 4 * 150ms = 600ms)  -- correct
```

### Worked Example: Duplet in 6/8 Time

In compound time, a duplet places 2 notes where 3 normally go:

```
tempo = 120, basis = 8 (eighth note beat in 6/8)

Normal eighth:
  getDuration("1/8", 120, 8) = ((1 * 8) / 8) * (60 / 120) * 1000 = 500ms

Duplet eighth (tuplet = [2, 3]):
  effective = 500 * (3 / 2) = 750ms

Total group duration:
  2 * 750ms = 1500ms
  (= 3 normal eighths = 3 * 500ms = 1500ms)  -- correct
```

### Sequential Playback

Notes within a tuplet are played sequentially. Each note starts when the previous note's effective duration has elapsed:

```
Note 0: starts at group_start_time
Note 1: starts at group_start_time + effective_duration(note_0)
Note 2: starts at group_start_time + effective_duration(note_0) + effective_duration(note_1)
...
```

For uniform tuplets (all same face value), this simplifies to evenly spaced onsets within the group duration.

---

## Impact on Playback

### Play Loop Detection

The play loop iterates through the `notes` array and must detect tuplet wrapper objects. When it encounters an object with a `tuplet` property:

1. Extract the `[actual, normal]` ratio
2. Iterate the inner `notes` array
3. For each inner note, calculate `effective_ms = getDuration(face_length, tempo, basis) * (normal / actual)`
4. Schedule the note at the accumulated time offset
5. Advance the time cursor by `effective_ms`
6. After all inner notes, continue with the next element in the outer `notes` array

### MusicalClock Beat Positions

Beat positions within a tuplet are fractional. For a triplet `[3, 2]` of eighth notes starting at beat 1.0:

```
Note 0: beat 1.0
Note 1: beat 1.0 + (1/2 * 2/3) = beat 1.333...
Note 2: beat 1.0 + (1/2 * 4/3) = beat 1.667...
Group ends: beat 2.0
```

General formula for note index `i` within a tuplet starting at beat `B`, where each face value is `F` beats:

```
beat_position(i) = B + sum(effective_beats(note_0..note_i-1))
effective_beats(note) = face_beats(note) * (normal / actual)
```

### Note Callbacks

When emitting note events (e.g., for the notation renderer's playback cursor or for game logic), include tuplet context:

```js
{
  pitch: "D4",
  length: "1/8",
  beat: 1.333,
  // Tuplet context (present only for notes inside a tuplet)
  tuplet: {
    ratio: [3, 2],
    index: 1,        // 0-based index within the tuplet group
    groupSize: 3     // total notes in the group
  }
}
```

This allows listeners to know a note is part of a tuplet without re-parsing the song data.

### getDuration() Integration

Two approaches for integrating tuplet scaling with `getDuration()`:

**Option A (recommended): Caller scales the result.**
No changes to `getDuration()`. The play loop multiplies by `normal / actual`:

```js
const faceMs = getDuration(note.length, tempo, basis);
const effectiveMs = tupletRatio
  ? faceMs * (tupletRatio[1] / tupletRatio[0])
  : faceMs;
```

This keeps `getDuration()` simple and pure. The tuplet context is the caller's responsibility.

**Option B: Add optional parameter.**
Extend `getDuration()` to accept a tuplet ratio:

```js
getDuration(fraction, tempo, basis, tupletRatio = null)
// If tupletRatio is provided, multiply result by normal / actual
```

Option A is recommended because it avoids changing a widely-used function signature and keeps tuplet logic localized to the playback loop.

---

## Gotchas

### Dotted Notes Within Tuplets

Apply the dotted multiplier (1.5x) BEFORE tuplet scaling. The `dotted` flag modifies the face value. The caller is responsible for checking `dotted: true` and multiplying the result of `getDuration()` by 1.5 -- the `getDuration()` function itself only handles the base fraction:

```js
let faceMs = getDuration(note.length, tempo, basis);
if (note.dotted) faceMs *= 1.5;
const effectiveMs = faceMs * (normal / actual);
```

Order matters. Dotted-then-tuplet matches how musicians read the notation: "this is a dotted eighth, and the whole group is a triplet."

### Rests Within Tuplets

Rests inside a tuplet still advance time by their effective duration. No sound is produced, but the time cursor must advance. The play loop must not skip rests when iterating a tuplet's inner `notes` array.

### Chords Within Tuplets

All notes in a chord sound simultaneously. The chord's duration (from the first note's `length`) is scaled by the tuplet ratio. Time advances by the chord's effective duration, not by each individual pitch.

### Unequal Subdivisions

When notes within a tuplet have different face values, each gets its own effective duration. The total group time is the sum of all effective durations, which may not equal `normal * face_duration` of a single note. The invariant is: the group's total time equals the time of `normal` notes at whatever the face values sum to.

### Floating Point Precision

Tuplet ratios like `2/3` produce repeating decimals (166.667ms). For scheduling, this is acceptable -- Web Audio API's `currentTime` has sub-millisecond precision. However, when comparing beat positions (e.g., for the 50ms beat tolerance in playback matching), use a small epsilon rather than exact equality.

### Tempo Changes During Tuplets

If tempo changes mid-tuplet (unlikely but possible), each note's effective duration should be recalculated at the current tempo. The tuplet ratio itself does not change -- only the base duration from `getDuration()` changes.

---

*Spec Version: 1.0*
*Created: 2026-01-25*
*Parent Spec: notation/SPEC.md v1.5 (Future Feature Specs table)*
