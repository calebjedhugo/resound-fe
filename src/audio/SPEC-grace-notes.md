# Grace Notes - Audio Spec

Grace notes are ornamental notes played quickly before a main note. This spec defines how the audio system schedules and plays them.

> **Notation:** [SPEC-grace-notes.md](../notation/SPEC-grace-notes.md) · **Parent:** [SPEC.md](../notation/SPEC.md)

---

## Data Structure

Same `grace` property used by the notation system:

```js
// Acciaccatura - quick, before the beat
{ pitch: "D4", length: "1/4", grace: { pitch: "C4", type: "acciaccatura" } }

// Appoggiatura - takes time from the main note
{ pitch: "D4", length: "1/4", grace: { pitch: "C4", type: "appoggiatura" } }

// Multiple grace notes (run)
{ pitch: "D4", length: "1/4", grace: [
  { pitch: "A3", type: "acciaccatura" },
  { pitch: "B3", type: "acciaccatura" },
  { pitch: "C4", type: "acciaccatura" }
]}
```

Grace notes have `pitch` and `type` but no `length`. Their duration is computed by the audio system based on type and context.

---

## Audio Behavior

### Acciaccatura (Pre-Beat)

Acciaccaturas are played as quickly as possible just before the beat. The main note starts on the beat.

- **Fixed duration:** ~60ms per grace note, regardless of tempo. At very slow tempos (< 60 BPM), consider scaling grace note duration proportionally (e.g., `max(60, quarterNoteMs * 0.04)`) to avoid unnaturally rushed ornaments.
- **Volume:** Same as the main note
- **Scheduling:** Grace notes are scheduled *before* the main note's beat time. If the main note is at beat 2.0 and there is one grace note, the grace note starts at `beat 2.0 - 60ms` (converted to beats via `MusicalClock.msToBeats()`)
- **Main note timing:** Unchanged. The main note starts exactly on its scheduled beat.

Example at 120 BPM (500ms per beat):
```
Grace (C4):  starts at beat 1.988 (60ms before beat 2.0)
Main  (D4):  starts at beat 2.0, full duration of 1/4 = 500ms
```

### Appoggiatura (On-Beat, Time-Stealing)

Appoggiaturas take time from the main note. Both the appoggiatura and the shortened main note play within the main note's original time slot.

- **Default split:** Appoggiatura gets **50%** of the main note's duration, main note gets the remaining **50%**
- **Dotted note exception:** When the main note has `dotted: true`, the appoggiatura gets **2/3** of the total duration and the main note gets **1/3**. This follows standard performance practice.
- **Volume:** Same as the main note
- **Scheduling:** The appoggiatura starts on the beat (where the main note would normally start). The main note starts after the appoggiatura finishes.

Example at 120 BPM, main note is 1/4 (500ms):
```
Appoggiatura (C4):  starts at beat 2.0, duration = 250ms
Main note    (D4):  starts at beat 2.5, duration = 250ms
```

Example with dotted note, main note is dotted 1/4 (750ms):
```
Appoggiatura (C4):  starts at beat 2.0, duration = 500ms (2/3)
Main note    (D4):  starts at beat 3.0, duration = 250ms (1/3)
```

### Multiple Grace Notes (Run)

**Acciaccatura run:** Each grace note gets ~60ms. Total grace time = `count * 60ms`. All scheduled before the beat.

Example with 3 acciaccaturas at 120 BPM:
```
Grace 1 (A3):  starts at beat 1.964 (180ms before beat 2.0)
Grace 2 (B3):  starts at beat 1.976 (120ms before beat 2.0)
Grace 3 (C4):  starts at beat 1.988 (60ms before beat 2.0)
Main    (D4):  starts at beat 2.0
```

**Appoggiatura run:** The group collectively gets 50% (or 2/3 for dotted) of the main note's duration, divided equally among the grace notes.

Example with 3 appoggiaturas, main note 1/4 (500ms):
```
Grace 1 (A3):  starts at beat 2.0,    duration = 83ms  (250/3)
Grace 2 (B3):  starts at beat 2.167,  duration = 83ms
Grace 3 (C4):  starts at beat 2.333,  duration = 83ms
Main    (D4):  starts at beat 2.5,    duration = 250ms
```

**Mixed types in a run:** If a run contains both acciaccaturas and appoggiaturas, treat the entire group as the type of the first grace note in the array. Mixing types in a single run is unusual and not recommended.

---

## Impact on Playback

### Scheduling Changes

The play loop must be aware of grace notes when scheduling note events:

1. **Before scheduling a note**, check for a `grace` property
2. **For acciaccatura:** calculate pre-beat offset (`count * 60ms` converted to beats) and schedule grace notes before the main note's beat time
3. **For appoggiatura:** split the main note's time slot and schedule the appoggiatura at the beat, then the shortened main note after

### Note Callbacks

When the audio system fires note-play callbacks (used by the notation system for playback highlighting, or by game systems for visual feedback), grace note callbacks must include an `isGrace: true` flag:

```js
// Grace note callback
{
  pitch: "C4",
  time: 1.988,       // scheduled beat time
  duration: 60,      // ms
  isGrace: true,
  graceType: "acciaccatura",
  mainNotePitch: "D4"
}

// Main note callback (unchanged format, no grace flag)
{
  pitch: "D4",
  time: 2.0,
  duration: 500
}
```

This allows listeners to distinguish grace notes from main notes. The notation renderer uses this to avoid moving the playback cursor to the grace note position.

### getDuration() Compatibility

The existing `getDuration(fraction, tempo, basis)` function in `src/audio/lib/duration.js` is not affected. Grace note durations are computed separately (fixed 60ms for acciaccatura, derived from main note for appoggiatura) and do not go through `getDuration()`.

### MusicalClock Compatibility

Grace notes that are acciaccaturas may start slightly before a beat boundary. The `MusicalClock` does not need modification -- the play loop simply schedules audio events at the computed sub-beat times using the existing `AudioContext.currentTime` scheduling.

---

## Gotchas

### Very Fast Tempos

At very fast tempos, 60ms per acciaccatura may exceed the duration of short notes. For example, at 240 BPM an eighth note is 125ms -- two acciaccaturas (120ms total) would nearly consume the entire note.

**Cap:** Total acciaccatura grace time must not exceed **50% of the main note's duration**. If `count * 60ms > mainDuration * 0.5`, reduce per-grace-note time to `(mainDuration * 0.5) / count`.

### Appoggiatura on Dotted Notes

Standard performance practice: when the main note is dotted, the appoggiatura gets **2/3** of the time (not 50%). The audio system checks for `dotted: true` on the main note to apply this rule. Use 50% as the default for non-dotted notes.

### Inheritance from Main Note

Grace notes do not have independent articulations, dynamics, or envelope settings. They inherit all playback properties from the main note:

- Volume/gain
- Instrument/timbre
- ADSR envelope (from `src/audio/lib/Envelope.js`)
- Any effects or processing

### Grace Notes on Rests

A grace note on a rest object (no pitch) is invalid and should be ignored. The validator should flag this as `invalid_grace_note`.

### Grace Notes at Playback Start

If the first note in a sequence has acciaccatura grace notes, they must be scheduled before beat 0. The play loop should handle negative beat offsets by converting to the appropriate `AudioContext` schedule time. Practically, the playback start may need a small lead-in delay to accommodate this.

### Overlapping Audio

Acciaccatura grace notes scheduled before the beat may overlap with the tail of the previous note. This is musically acceptable -- the previous note's release envelope will blend naturally with the grace note onset. No special handling is needed.

---

## File Structure

New file: `lib/graceNoteProcessor.js`. Modifications to `Instrument.js`.

---

*Spec Version: 1.0*
*Created: 2026-01-25*
