# Audio Library: Slurs Specification

Defines how slurs affect audio playback behavior. This spec covers the data contract and sound behavior, not implementation details.

> **Notation:** [SPEC-slurs.md](../notation/SPEC-slurs.md) · **Parent:** [SPEC.md](../notation/SPEC.md)

---

## Overview

In musical performance, a slur indicates **legato phrasing**: notes should flow smoothly from one to the next without audible gaps. For the audio system, this means eliminating or minimizing the silence between consecutive slurred notes by overlapping the release of one note with the attack of the next.

Slurs do NOT change note duration (unlike ties, which merge durations). Each slurred note retains its full rhythmic value. The change is purely in how the transitions between notes sound.

---

## Data Contract

The audio system reads the same `slur` property used by the notation system:

```js
{ pitch: "C4", length: "1/4", slur: "start" }   // legato begins
{ pitch: "D4", length: "1/4" }                    // legato continues (no property needed)
{ pitch: "E4", length: "1/4" }                    // legato continues
{ pitch: "F4", length: "1/4", slur: "stop" }     // legato ends
```

- `slur: "start"` - Begin legato phrasing from this note.
- `slur: "stop"` - End legato phrasing on this note. The transition FROM this note to the next (if any) is normal (non-legato).
- Notes between start and stop inherit slur context from sequence position.
- Nested slurs: the audio system treats all nested depths identically. If a note is inside any slur (outer or inner), it gets legato treatment. Nesting depth is only meaningful for notation rendering.

### Slur Context Detection

During playback, the play loop must track a **slur depth counter**:

- Encountering `slur: "start"` increments the counter.
- Encountering `slur: "stop"` decrements the counter.
- When the counter is > 0, the current note is inside a slur and should transition to the next note with legato behavior.
- The `"stop"` note itself is the final note of the slur phrase. The transition FROM the stop note to the following note is normal.

---

## Audio Behavior

### Normal (Non-Slurred) Playback

In normal playback, each note's ADSR envelope completes fully before the next note begins. The release phase creates a natural gap of silence between notes:

```
Note 1:  [attack][decay][sustain........][release]
          |<------------- duration ------------->|
                                                   (gap)
Note 2:                                              [attack][decay][sustain...][release]
```

### Slurred Playback (Legato)

Within a slur, the release phase of the current note overlaps with the attack phase of the next note. This creates a smooth, connected sound:

```
Note 1:  [attack][decay][sustain........][release]
          |<------------- duration ------------->|
Note 2:                               [attack][decay][sustain........][release]
                                       ^
                                       starts early (during Note 1's release)
```

The key behavior: **the next slurred note begins before the current note's sound has fully decayed.** The amount of overlap equals the current note's release time. This means:

1. The current note's envelope plays normally through attack, decay, and sustain.
2. The next note's sound begins at the point where the current note enters its release phase.
3. Both notes sound simultaneously during the overlap window.
4. The current note fades out (release) while the next note fades in (attack).

### Overlap Amount

The overlap between consecutive slurred notes equals the **release time** of the envelope. This is the natural crossfade point -- the current note is already fading, and the next note begins its attack.

If the envelope's release time is very short (< 10ms), use a minimum overlap of 10ms to ensure audible legato.

If the envelope's release time is longer than 25% of the note's total duration, cap the overlap at 25% of the note duration. This prevents excessive overlap on short notes with long releases.

### What Does NOT Change

- **Note duration:** Each note still occupies its full rhythmic duration in the timeline. A slurred quarter note at 120 BPM is still 500ms.
- **Pitch:** Slurs do not bend pitch. Each note starts at its written pitch.
- **Volume:** Slurs do not affect overall volume. The envelope shape within each note is the same; only the timing of note-to-note transitions changes.

---

## Impact on Playback

### Instrument Play Loop

The `play()` method in the Instrument base class schedules notes sequentially. For slurred notes, the scheduling must account for overlap:

- When the current note is inside a slur (slur depth > 0) and the next note is also inside the slur (or is the stop note), schedule the next note to begin **earlier** by the overlap amount.
- The sleep/wait time between consecutive slurred notes is reduced by the overlap amount.
- The current note's oscillator is NOT stopped early. It continues its natural release while the next note's oscillator starts.

### Chords Within a Slur

When a chord occurs within a slur:
- All notes of the chord begin simultaneously (normal chord behavior).
- The legato overlap applies to the transition INTO the chord (previous note's release overlaps with the chord's attack) and OUT of the chord (chord's release overlaps with the next note's attack).
- Within the chord itself, all notes share the same envelope timing.

### Rests Within a Slur

A rest within a slurred passage **breaks the legato chain** for audio purposes. The notes before the rest get legato treatment with each other. The rest plays as silence (normal behavior). The notes after the rest resume legato treatment with each other.

```js
{ pitch: "C4", length: "1/4", slur: "start" },   // legato ->
{ pitch: "D4", length: "1/4" },                    // legato -> (into rest = normal release)
{ length: "1/4" },                                 // REST: silence, legato chain breaks
{ pitch: "F4", length: "1/4" },                    // (after rest = normal attack) -> legato ->
{ pitch: "G4", length: "1/4", slur: "stop" }      // legato end
```

The slur is still valid in notation (the arc renders over the rest), but the audio cannot produce legato through silence.

---

## Gotchas

### Slurs Do Not Merge Durations

This is the most important distinction from ties:

| Feature | Tie | Slur |
|---------|-----|------|
| Duration effect | Merged (two tied quarters = one half note) | None (two slurred quarters = two quarter notes) |
| Audio result | One continuous sound | Two sounds with smooth transition |
| Pitch requirement | Same pitch | Different pitches |

A slurred C4 quarter + E4 quarter produces two distinct notes played legato. A tied C4 quarter + C4 quarter produces one note lasting a half note.

### Interaction with Articulations

When articulations (future feature) are present within a slur:

- **Staccato within a slur = Portato:** Notes are slightly separated but still phrased together. Reduce the overlap to ~50% of normal legato overlap.
- **Accent within a slur:** Note gets emphasis but still connects smoothly to neighbors.
- **Tenuto within a slur:** No change (tenuto already means "held full value," which is compatible with legato).

Until articulations are implemented, this interaction can be deferred. Document it here so the slur implementation does not make assumptions that would conflict.

### Same-Pitch Slurs

If a slur connects two notes of the same pitch, the audio system should still treat it as a slur (two separate notes with legato transition), NOT as a tie. The data says `slur`, so play two notes. This may sound unusual (a brief re-articulation of the same pitch with overlap), but it respects the data contract. The notation system may warn about this case.

### Very Short Notes

For 16th notes or 32nd notes at fast tempos, the note duration may be very short (< 100ms). The overlap must be clamped so that:
- Overlap never exceeds 25% of the note duration.
- Minimum note "solo" time (before overlap begins) is 50% of the note duration.

This prevents the overlap from consuming the entire note, which would sound like notes are starting on top of each other rather than flowing smoothly.

### Envelope Scaling

The existing `applyEnvelope` function scales ADSR times when they exceed note duration. This scaling should still apply within a slur. The overlap is calculated from the **scaled** release time, not the original release time. This ensures consistency: if the envelope is already compressed for a short note, the overlap is proportionally smaller.

---

## File Structure

Modifications to `Instrument.js` -- no new files needed.

---

*Spec Version: 1.0*
*Created: 2026-01-25*
