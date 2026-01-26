# Audio Library Specification: Ties

Defines how tied notes affect audio playback. Tied notes produce a single continuous sound with no re-attack.

> **Notation:** [SPEC-ties.md](../notation/SPEC-ties.md) · **Parent:** [SPEC.md](../notation/SPEC.md)

---

## Overview

In music, a tie connects two or more notes of the same pitch into one sustained sound. The listener hears a single note whose duration equals the sum of all tied notes. There is no re-articulation (no new attack) on the second or subsequent tied notes.

This spec defines the **data contract** and **sound behavior** for ties. It does not prescribe implementation details for the `play()` loop or instrument subclasses.

---

## Data Structure

### The `tie` Property

The `tie` property on note objects is shared between the notation and audio systems. It uses the same values:

| Value | Meaning |
|-------|---------|
| `"start"` | First note in a tie group. Produces sound. |
| `"stop"` | Last note in a tie group. Silent (sustain from previous note). |
| `"continue"` | Middle note in a chain of 3+. Silent (sustain continues). |

```js
// Two tied quarter notes: plays as one half note
[
  { pitch: "C4", length: "1/4", tie: "start" },
  { pitch: "C4", length: "1/4", tie: "stop" }
]

// Three tied notes: plays as one dotted half note (1/4 + 1/4 + 1/4)
[
  { pitch: "C4", length: "1/4", tie: "start" },
  { pitch: "C4", length: "1/4", tie: "continue" },
  { pitch: "C4", length: "1/4", tie: "stop" }
]
```

### Contract with Notation System

Both systems consume identical note data. The `tie` property is never transformed or stripped during data normalization. The audio system reads the same `tie` values that the notation renderer reads.

---

## Audio Behavior

### Core Rule: Tied Notes Produce One Sound

When the playback system encounters a sequence of tied notes, the expected behavior is:

1. **The `"start"` note produces sound.** The oscillator/sound source is created with a duration equal to the **combined duration of all tied notes** in the chain.
2. **The `"stop"` and `"continue"` notes are silent.** No new oscillator is created. No new attack occurs. The existing sound sustains through their durations.
3. **The ADSR envelope spans the full combined duration.** The envelope's attack occurs at the start of the first note. The envelope's release completes at the end of the last tied note. The sustain phase covers the entire middle span.

```
Tied: 1/4 start + 1/4 continue + 1/4 stop
       |<-------- one sound, duration = 3/4 -------->|
       [attack][decay][---- sustain ----][release]

Untied: 1/4 + 1/4 + 1/4
       |<- sound ->|<- sound ->|<- sound ->|
       [A][D][S][R] [A][D][S][R] [A][D][S][R]
```

### Duration Calculation

The effective duration of a tie group is the sum of all individual note durations (using `getDuration(length, tempo, basis)` for each note, respecting `dotted: true` where applicable).

**Note:** The caller is responsible for checking `dotted: true` and multiplying the result of `getDuration()` by 1.5. The `getDuration()` function itself only handles the base fraction.

```js
// Example: tied dotted quarter + eighth
// Duration = getDuration("1/4", tempo, basis) * 1.5 + getDuration("1/8", tempo, basis)
[
  { pitch: "C4", length: "1/4", dotted: true, tie: "start" },
  { pitch: "C4", length: "1/8", tie: "stop" }
]
```

### Note Callback Behavior

The `noteCallback` fires **once** for the entire tie group, on the `"start"` note. It does NOT fire for `"continue"` or `"stop"` notes. The callback should receive the pitch and the **combined** length information so downstream systems (recording, listening) understand the full sustained duration.

The callback event for a tied group:

```js
{
  pitch: "C4",
  length: "1/4",         // The face value of the start note
  tiedDuration: 1000,    // Combined duration in ms (sum of all tied notes)
  timestamp: ...,
  source: ...,
  sourcePosition: ...
}
```

The `tiedDuration` field is only present when the note is the start of a tie. Non-tied notes omit this field, and their duration is derived from `length` as usual. Downstream consumers can check for `tiedDuration` to know the actual sustained length.

### Timing and Scheduling

The playback loop must still **wait** the correct duration for each tied note in sequence to maintain timing alignment. The key difference is:

- The `"start"` note schedules one long sound (combined duration)
- The `"continue"` and `"stop"` notes schedule no sound but still consume their time slot

This means the total elapsed time is identical whether notes are tied or not. Ties affect *sound production*, not *timing*.

---

## Impact on Playback

### Detection

The `play()` method (or a preprocessing step before it) needs to identify tie groups. A tie group is a contiguous sequence of notes where:

1. First note has `tie: "start"`
2. Middle notes (zero or more) have `tie: "continue"`
3. Last note has `tie: "stop"`
4. All notes share the same `pitch`

### Tie Group Merging

When a tie group is detected, the system must:

1. Sum the durations of all notes in the group
2. Play the `"start"` note with the summed duration
3. Skip sound production for `"continue"` and `"stop"` notes
4. Still advance timing by each note's individual duration

### Chords with Ties

When a chord contains tied and non-tied notes, the behavior differs per pitch:

```js
[
  // Chord 1: C4 is tied, E4 and G4 are not
  [
    { pitch: "C4", length: "1/4", tie: "start" },
    { pitch: "E4", length: "1/4" },
    { pitch: "G4", length: "1/4" }
  ],
  // Chord 2: C4 tie ends, E4 and G4 re-attack
  [
    { pitch: "C4", length: "1/4", tie: "stop" },
    { pitch: "E4", length: "1/4" },
    { pitch: "G4", length: "1/4" }
  ]
]
```

Expected audio result:
- **C4:** One continuous sound lasting two quarter notes (no re-attack on chord 2)
- **E4:** Two separate sounds, each a quarter note (attack on chord 1, attack on chord 2)
- **G4:** Two separate sounds, each a quarter note (attack on chord 1, attack on chord 2)

The playback system must handle ties at the individual note level within chords, not at the chord level.

---

## Gotchas

### Tied Rests Are Invalid

A rest (note with no `pitch`) cannot have a `tie` property. If encountered, the `tie` property should be ignored. Rests are silence; there is nothing to sustain.

```js
// INVALID: tie on a rest. The tie property is ignored.
{ length: "1/4", tie: "start" }
```

### Tie Chains (3+ Notes)

A tie chain of N notes produces N-1 arcs visually but only 1 sound. The combined duration is the sum of all N note durations. The `"continue"` value exists specifically to support chains without ambiguity.

### Pitch Mismatch

If a `tie: "stop"` note has a different pitch than the preceding `tie: "start"`, this is malformed data. The audio system should treat the `"stop"` note as a normal note (produce sound with its own attack). Do not silently merge different pitches.

### Ties Spanning Tuplet Boundaries

Tied notes can span tuplet boundaries. Each note's duration is calculated independently using its own context (tuplet-scaled or normal), then the durations are summed for the tie group.

```js
[
  // Normal quarter note, tied into a tuplet
  { pitch: "C4", length: "1/4", tie: "start" },
  {
    tuplet: [3, 2],
    notes: [
      { pitch: "C4", length: "1/8", tie: "stop" },
      { pitch: "D4", length: "1/8" },
      { pitch: "E4", length: "1/8" }
    ]
  }
]
// C4 duration = getDuration("1/4") + getDuration("1/8") * (2/3)
```

The audio system calculates each note's actual duration (accounting for tuplet scaling) before summing.

### Interaction with `dotted` Property

Dotted tied notes are valid. The `dotted` flag affects the individual note's duration calculation (multiply by 1.5), and the tie system sums the resulting durations.

```js
// Dotted quarter tied to eighth = 3/8 + 1/8 = 1/2 total
[
  { pitch: "C4", length: "1/4", dotted: true, tie: "start" },
  { pitch: "C4", length: "1/8", tie: "stop" }
]
```

### Interaction with `offset` Property

If tied notes have `offset` values, the offset applies to timing/scheduling only. The first note's offset determines when the sound starts. Subsequent tied notes' offsets affect the timing gap but do not create new sounds.

---

## File Structure

Modifications to `Instrument.js` -- no new files needed.

---

*Spec Version: 1.0*
*Created: 2026-01-25*
