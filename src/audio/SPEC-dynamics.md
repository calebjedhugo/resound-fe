# Audio Dynamics Specification

How dynamic markings control volume and intensity during audio playback.

> **Notation:** [SPEC-dynamics.md](../notation/SPEC-dynamics.md) · **Parent:** [SPEC.md](../notation/SPEC.md)

---

## Overview

Dynamics modify the volume (gain) of notes during playback. The audio system reads the same inline dynamic markers that the notation system renders, translates them to gain values, and applies them to the instrument's output. Point dynamics set an immediate level. Hairpins interpolate smoothly between levels over time.

---

## Data Structure

Same inline markers as the notation system. These objects appear inline in the song's `notes` array.

### Pre-processing Requirement

All marker objects (dynamics, hairpins, tempo, tempoChange, expression, rehearsal, barlines, endings, navigation) MUST be processed and stripped from the data array before passing to `Instrument.play()`. The `play()` method only accepts note objects, rest objects, and chord arrays. A pre-processing pipeline should extract markers, build a state timeline, and pass clean note data to `play()` along with the state timeline.

### Point Dynamics

```js
{ dynamic: "f" }
```

Sets the gain level starting at the next note. Persists until another dynamic marker changes it.

### Hairpins

```js
{ hairpin: "crescendo", start: true }   // Begin gradual increase
{ hairpin: "crescendo", stop: true }    // End gradual increase

{ hairpin: "decrescendo", start: true } // Begin gradual decrease
{ hairpin: "decrescendo", stop: true }  // End gradual decrease
```

---

## Audio Behavior

### Dynamic-to-Volume Mapping

Each dynamic level maps to a gain multiplier (0.0 to 1.0). These values are applied as a **dynamic gain multiplier** that scales the instrument's output, separate from the existing `volumeMultiplier` (used for distance-based spatial volume).

| Dynamic | Gain Value |
|---------|------------|
| `ppp` | 0.12 |
| `pp` | 0.25 |
| `p` | 0.40 |
| `mp` | 0.55 |
| `mf` | 0.70 |
| `f` | 0.85 |
| `ff` | 0.95 |
| `fff` | 1.0 |

These map to perceived loudness, not raw amplitude. The values are intentionally nonlinear (human hearing is logarithmic).

### Special Dynamics

#### fp (Forte-Piano)

1. Attack the note at `f` level (0.85)
2. Immediately after the attack phase of the ADSR envelope completes, drop to `p` level (0.40)
3. The prevailing dynamic after this note is `p`

**Implementation:** Schedule a gain ramp from 0.85 to 0.40 starting at the end of the note's ADSR attack phase. Use a fast linear ramp (~50ms) to avoid clicks.

#### sfz (Sforzando)

1. Attack the note at `fff` level (1.0)
2. After the note completes, return to the **previous** dynamic level
3. The prevailing dynamic does NOT change

**Implementation:** Temporarily override the dynamic gain to 1.0 for a single note, then restore the prior value. The sfz does not modify tracked dynamic state.

#### sfp (Sforzando-Piano)

1. Attack the note at `fff` level (1.0)
2. Immediately after the attack phase, drop to `p` level (0.40)
3. The prevailing dynamic after this note is `p`

**Implementation:** Like `fp`, but the attack level is `fff` (1.0) instead of `f` (0.85). Schedule a gain ramp from 1.0 to 0.40 after the ADSR attack phase.

### Hairpin Behavior

Hairpins smoothly interpolate the dynamic gain between a start level and an end level over the spanned beats.

- **Start level:** The current dynamic gain at the hairpin start marker
- **End level:** The dynamic gain of the point dynamic that follows the hairpin stop marker. If no point dynamic follows, use `f` (0.85) for crescendo and `p` (0.40) for decrescendo as reasonable defaults.
- **Interpolation:** Linear interpolation of the gain value over the beat duration of the hairpin span
- **Granularity:** Per-note. At each note onset within the hairpin span, compute the interpolated gain for that beat position. Optionally, for sustained notes, use `linearRampToValueAtTime` on the gain node for smooth intra-note transitions.

**Interpolation formula:**

```
progress = (currentBeat - hairpinStartBeat) / (hairpinEndBeat - hairpinStartBeat)
currentGain = startGain + (endGain - startGain) * progress
```

Where `progress` is clamped to [0, 1].

---

## Impact on Playback

### Gain Architecture

The final gain for any note is:

```
finalGain = dynamicGain * volumeMultiplier * envelopeGain
```

Where:
- `dynamicGain` - From this spec (0.12 to 1.0 based on current dynamic)
- `volumeMultiplier` - Existing spatial/distance-based volume (set by `updateVolume()`)
- `envelopeGain` - ADSR envelope shape (from `Envelope.js`)

**IMPORTANT:** Dynamic gain is a separate multiplier from `volumeMultiplier`. They must not interfere with each other. The existing `volumeMultiplier` continues to handle distance-based attenuation. Dynamic gain handles musical expression.

### Playback State Tracking

The `play()` loop must track the current dynamic state:

```js
// Added to playbackState or a parallel structure
dynamicState: {
  currentDynamic: "mf",      // Current point dynamic name
  currentGain: 0.70,         // Current dynamic gain value
  previousGain: 0.70,        // For sfz restoration
  hairpin: null,             // Active hairpin: { type, startBeat, startGain, endBeat, endGain }
}
```

During the play loop, before each note:

1. **Check for dynamic markers** at the current position in the data array
2. **If point dynamic:** Update `currentGain` from the mapping table. Store previous gain (for sfz).
3. **If hairpin start:** Record the start beat and current gain. Begin interpolation.
4. **If hairpin stop:** Finalize interpolation. The next point dynamic (if any) sets the new level.
5. **Apply `currentGain`** to the note's gain node (multiply with envelope and volumeMultiplier).

### Pre-Scan for Hairpin End Levels

Before playback begins, pre-scan the data array to resolve hairpin end levels. For each hairpin start, find the corresponding stop, then look for the next point dynamic after the stop. This avoids needing to "look ahead" during the real-time play loop.

```js
// Pre-scan produces a resolved hairpin list:
[
  {
    startIndex: 3,    // Index of start marker in data array
    stopIndex: 8,     // Index of stop marker
    startBeat: 2.0,   // Beat position of first note after start
    endBeat: 5.0,     // Beat position of first note after stop
    endGain: 0.85     // Gain from the point dynamic after stop (or default)
  }
]
```

---

## Gotchas

### Default Dynamic

When no dynamic marker is present at the start of a piece, the default dynamic is `mf` (gain 0.70). This is the standard musical convention.

### Dynamics Persist Until Changed

A point dynamic remains in effect until the next point dynamic or hairpin changes it. If a piece starts with `f`, every note is forte until another marking appears.

### Hairpins Without Explicit End Dynamic

If a hairpin stop is not followed by a point dynamic, the hairpin must still have an end target:

- **Crescendo without end dynamic:** Target `f` (0.85)
- **Decrescendo without end dynamic:** Target `p` (0.40)

After the hairpin ends, the interpolated final value becomes the new prevailing dynamic gain.

### sfz Does Not Change State

After an `sfz` note, the dynamic level returns to whatever it was before. This means:

```js
[
  { dynamic: "p" },
  { pitch: "C4", length: "1/4" },   // p (0.40)
  { dynamic: "sfz" },
  { pitch: "D4", length: "1/4" },   // fff accent (1.0) - single note only
  { pitch: "E4", length: "1/4" }    // back to p (0.40)
]
```

### fp and sfp DO Change State

Unlike `sfz`, both `fp` and `sfp` leave the dynamic at `p` after the accented note. The "p" in their name indicates the new prevailing level.

### Dynamic Markers Are Not Notes

Dynamic markers have no duration. They must not be counted as beats, must not advance the playback position, and must not trigger note callbacks. The play loop should skip over them without sleeping.

### Interaction with ADSR Envelope

The dynamic gain multiplies with the ADSR envelope output. For `fp` and `sfp`, the gain drop happens after the ADSR attack phase, not at note onset. This means the attack transient plays at full dynamic level before the drop occurs.

### Multiple Markers at Same Position

Multiple dynamic markers can appear between two notes (e.g., a hairpin stop followed by a point dynamic). Process them in array order. The final state after processing all markers at a position is what applies to the next note.

---

## File Structure

New file: `lib/dynamicState.js` for volume state tracking. Modifications to `Instrument.js`.

---

*Spec Version: 1.0*
*Created: 2026-01-25*
