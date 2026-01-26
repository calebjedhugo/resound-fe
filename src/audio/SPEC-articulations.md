# Audio Articulations Specification

How articulation marks modify note playback in the audio system. Articulations change duration, volume, and envelope shape -- they do not alter the underlying note data.

> **Notation:** [SPEC-articulations.md](../notation/SPEC-articulations.md) · **Parent:** [SPEC.md](../notation/SPEC.md)

---

## Overview

The audio system reads the `articulation` property from note objects and modifies playback behavior accordingly. Articulations affect three dimensions:

1. **Duration** - How long the note actually sounds (staccato, staccatissimo, portato)
2. **Volume** - How loud the note is (accent, marcato, tenuto)
3. **Envelope shape** - Attack/sustain characteristics (marcato, tenuto)

The written `length` value is never changed. Articulations modify how `getDuration()` output and `applyEnvelope()` parameters are used during playback.

---

## Data Structure

Same `articulation` property used by the notation system:

```js
{ pitch: "C4", length: "1/4", articulation: "staccato" }
{ pitch: "C4", length: "1/4", articulation: ["accent", "staccato"] }
```

Notes without an `articulation` property use default (legato) playback: full written duration, normal envelope, normal gain.

---

## Audio Behavior

### Duration Modifiers

These articulations shorten (or lengthen) the audible portion of a note. The remaining time within the note's written duration is silence. `getDuration()` still returns the full written duration for sequencing; the articulation modifies the active sound window within that duration.

| Articulation | Audible Duration | Behavior |
|---|---|---|
| `staccato` | ~50% of written | Sound for half the duration, silence for the rest |
| `staccatissimo` | ~25% of written | Very short sound, longer silence |
| `portato` | ~75% of written | Moderate separation with full sustain |
| `fermata` | ~200% of written | Extended hold (see Fermata section) |

Implementation: multiply the duration passed to `applyEnvelope()` by the factor. Schedule the oscillator stop time at the shortened duration. The note's slot in the sequence still occupies its full written duration.

### Volume Modifiers

These articulations increase the peak gain level of the note. All gain values are capped at 1.0 to prevent clipping.

| Articulation | Gain Multiplier | Notes |
|---|---|---|
| `accent` | 1.3x | Normal envelope, louder |
| `marcato` | 1.5x | Louder AND sharper attack (see below) |
| `tenuto` | 1.1x | Slight emphasis |

Implementation: multiply the gain node's peak value (normally 1.0 in `applyEnvelope()`) by the multiplier, clamping to 1.0. For example, if the instrument's base gain is 0.7, an accent makes it `0.7 * 1.3 = 0.91`.

### Envelope Modifiers

| Articulation | Envelope Change |
|---|---|
| `marcato` | Reduce attack time by 50% for a sharper onset. Combined with the 1.5x gain multiplier. |
| `tenuto` | Set sustain level to 1.0 (no decay phase). The note holds at peak volume for its full duration before release. |

### Per-Articulation Summary

**Staccato** - Duration: 50%. Volume: normal. Envelope: normal (scaled to shorter duration).

**Staccatissimo** - Duration: 25%. Volume: normal. Envelope: normal (scaled to shorter duration).

**Accent** - Duration: 100%. Volume: 1.3x. Envelope: normal.

**Marcato** - Duration: 100%. Volume: 1.5x. Envelope: attack time halved.

**Tenuto** - Duration: 100%. Volume: 1.1x. Envelope: sustain at 1.0 (no decay).

**Fermata** - Duration: 200%. Volume: normal. Envelope: normal (scaled to longer duration). Pauses the playback clock (see below).

**Portato** - Duration: 75%. Volume: normal. Envelope: sustain at 1.0 (no decay, like tenuto, but within the shortened window).

---

## Combining Articulations

When multiple articulations are present, their modifications stack:

- **Duration modifiers multiply.** Example: if two hypothetical 50% modifiers stacked, the result would be 25%.
- **Volume modifiers multiply.** Example: accent (1.3x) + tenuto (1.1x) = 1.43x (capped at 1.0).
- **Envelope modifiers all apply.** If marcato halves attack AND tenuto sets sustain to 1.0, both take effect.

### Common Combinations

| Combination | Effect |
|---|---|
| `["accent", "staccato"]` | 50% duration, 1.3x volume |
| `["accent", "tenuto"]` | Full duration, 1.3x volume, sustain at 1.0 |
| `["marcato", "staccato"]` | 50% duration, 1.5x volume, halved attack |
| `"portato"` (single value) | 75% duration, sustain at 1.0 |

**Note:** `"portato"` as a single value is equivalent to `["tenuto", "staccato"]` in audio behavior. If both forms appear, they should produce identical sound. Do not double-apply modifiers if the portato shorthand is used alongside explicit tenuto or staccato in the array.

---

## Fermata: Duration Extension

Fermata is unique because it extends the note beyond its written duration.

**Default factor:** 2.0x (note plays for twice its written duration).

Fermata is implemented as a duration extension: the note's duration is multiplied by the fermata factor (default 2.0x). The `Instrument.play()` loop naturally waits for the extended duration via its existing sleep mechanism. No MusicalClock API changes are needed for the initial implementation. A future version may add clock-aware fermata for multi-voice synchronization.

---

## Gotchas

### Articulations Do Not Modify Data

Articulations are a playback concern only. The note's `length` property remains unchanged. `getDuration()` returns the written duration. The articulation modifier is applied during scheduling/synthesis, not during data parsing.

### Default Is Legato

A note without an `articulation` property plays at full written duration with the instrument's default envelope. This is standard legato behavior.

### Gain Capping

All gain values must be capped at 1.0 to prevent Web Audio clipping. When stacking volume modifiers, always `Math.min(result, 1.0)`.

### Fermata in Multi-Voice Playback

In the initial implementation, fermata extends note duration without pausing the clock. In multi-voice playback, each voice independently extends its fermata note. A future clock-aware implementation may synchronize fermatas across voices (pausing all voices together).

### Envelope Scaling on Short Notes

When staccato or staccatissimo shorten a note significantly, `applyEnvelope()` already handles scaling envelope times to fit within the note duration (see existing `totalEnvelopeTime > durationSeconds` check in `Envelope.js`). No additional handling needed -- pass the shortened duration and the existing scaling logic applies.

### Portato Deduplication

If a note has `articulation: ["portato", "staccato"]`, do not apply the staccato shortening twice. The portato already includes a duration modifier (75%). Ignore redundant staccato/tenuto when portato is present. Same applies to `["portato", "tenuto"]`.

---

## File Structure

New file: `lib/articulationProcessor.js`. Modifications to `Instrument.js`.

---

*Spec Version: 1.0*
*Created: 2026-01-25*
