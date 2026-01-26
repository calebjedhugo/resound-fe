# Audio Library Specification: Repeats and Navigation

Repeats and navigation markers control the order in which musical sections are played back. The audio system "unrolls" the repeat structure into a linear playback sequence before passing notes to `Instrument.play()`.

> **Notation:** [SPEC-repeats.md](../notation/SPEC-repeats.md) · **Parent:** [SPEC.md](../notation/SPEC.md)

---

## Overview

The notation system renders repeat and navigation markers visually. The audio system interprets them structurally to produce the correct playback order. Both systems consume identical data structures -- inline marker objects in the `notes` array.

The core responsibility of the audio system regarding repeats is:

1. Parse the `notes` array to identify all structural markers.
2. Resolve the playback order into a flat, linear sequence of note references.
3. Pass that linear sequence to `Instrument.play()` as if repeats never existed.

This means `Instrument.play()` itself does not need to understand repeats. A higher-level function resolves repeats BEFORE playback begins.

### Pre-processing Requirement

All marker objects (dynamics, hairpins, tempo, tempoChange, expression, rehearsal, barlines, endings, navigation) MUST be processed and stripped from the data array before passing to `Instrument.play()`. The `play()` method only accepts note objects, rest objects, and chord arrays. A pre-processing pipeline should extract markers, build a state timeline, and pass clean note data to `play()` along with the state timeline.

---

## Data Structures

Same inline marker objects used by the notation system. See `src/notation/SPEC-repeats.md` for full definitions.

### Quick Reference

```js
// Repeat barlines
{ barline: "repeat-start" }
{ barline: "repeat-end" }              // optional: { barline: "repeat-end", times: 3 }
{ barline: "repeat-both" }
{ barline: "final" }

// Endings
{ ending: { number: 1, type: "start" } }
{ ending: { number: 1, type: "stop" } }
{ ending: { number: 2, type: "start" } }

// Navigation
{ navigation: "segno" }
{ navigation: "coda" }
{ navigation: "fine" }
{ navigation: "to-coda" }
{ navigation: "dc" }
{ navigation: "ds" }
{ navigation: "dc-al-fine" }
{ navigation: "dc-al-coda" }
{ navigation: "ds-al-fine" }
{ navigation: "ds-al-coda" }
```

---

## Audio Behavior

### Simple Repeat

Play the section between `repeat-start` and `repeat-end` twice (or `times` times if specified). If there is no explicit `repeat-start`, the repeat goes back to the beginning of the piece.

```
Data:    |: A B C D :|
Plays:   A B C D  A B C D
```

### Repeat with Endings

First pass plays ending 1 content. Second pass skips ending 1, plays ending 2. Third pass (if applicable) skips endings 1 and 2, plays ending 3. And so on.

```
Data:    |: A B [1. C D :| [2. E F
Plays:   A B C D  A B E F
```

### D.C. (Da Capo)

Jump to the beginning of the piece. Playback continues forward from there.

```
Data:    A B C D  D.C.
Plays:   A B C D  A B C D
```

### D.S. (Dal Segno)

Jump to the segno marker. Playback continues forward from there.

```
Data:    A  segno  B C D  D.S.
Plays:   A B C D  B C D
```

### Al Fine

After jumping (via D.C. or D.S.), play forward until the `fine` marker, then stop.

```
Data:    A B  fine  C D  D.C. al Fine
Plays:   A B C D  A B  (stop at Fine)
```

### Al Coda

After jumping (via D.C. or D.S.), play forward until the `to-coda` marker, then jump to the `coda` marker and play to the end.

```
Data:    A B  to-coda  C D  D.S. al Coda  coda  E F
         ^segno somewhere before A or at A
Plays:   A B C D  A B  E F
         (on repeat pass: at to-coda, jump to coda)
```

### Combined Example

D.S. al Coda with endings:

```
Data:    intro  segno  |: A B [1. C :| [2. D  to-coda  E  D.S. al Coda  coda  F G
Plays:   intro  A B C  A B D E  A B D  F G
         pass 1: full repeat with endings
         D.S.: jump to segno, no inner repeats, at to-coda jump to coda
```

---

## Unrolling Algorithm

The `resolvePlaybackOrder(songData)` function converts a song with repeat/navigation markers into a flat array of note objects (or note indices) ready for sequential playback.

### Pseudocode

```
function resolvePlaybackOrder(songData):
    notes = songData.notes (or normalize from other formats)

    // Phase 1: Build marker index
    markers = {
        repeatStarts: [],      // indices of repeat-start markers
        repeatEnds: [],        // indices of repeat-end markers (with times)
        repeatBoths: [],       // indices of repeat-both markers
        endings: {},           // { startIndex, stopIndex, number } grouped by repeat section
        segno: null,           // index of segno marker
        coda: null,            // index of coda marker
        fine: null,            // index of fine marker
        toCoda: null,          // index of to-coda marker
        dcDs: []               // indices and types of D.C./D.S. directives
    }

    scan notes array, populate markers

    // Phase 2: Separate notes from markers
    noteElements = []          // only actual notes/chords/rests (with original index)
    markerPositions = {}       // map from original index to marker type

    for each element in notes:
        if element is a marker:
            markerPositions[index] = element
        else:
            noteElements.push({ element, originalIndex: index })

    // Phase 3: Walk through and build playback order
    output = []
    position = 0               // current position in original notes array
    repeatStack = []           // stack for nested repeats: { startPos, passNumber, maxPasses }
    activeEnding = null        // currently active ending number
    skippingEnding = false     // true when inside an ending that doesn't match current pass
    isRepeating = false        // true after D.C./D.S. jump
    skipInnerRepeats = true    // default: skip inner repeats on D.C./D.S. pass
    iterationCount = 0         // safety counter
    MAX_ITERATIONS = 10000     // prevent infinite loops

    while position < notes.length AND iterationCount < MAX_ITERATIONS:
        iterationCount++
        element = notes[position]

        if element is { barline: "repeat-start" }:
            if NOT (isRepeating AND skipInnerRepeats AND repeatStack.length > 0):
                push { startPos: position, passNumber: 1, maxPasses: 2 } to repeatStack
            position++
            continue

        if element is { barline: "repeat-end" }:
            if repeatStack is empty:
                // Implicit repeat from beginning
                push { startPos: 0, passNumber: 1, maxPasses: element.times or 2 }

            currentRepeat = top of repeatStack

            if currentRepeat.passNumber < currentRepeat.maxPasses:
                // More passes needed: jump back
                currentRepeat.passNumber++
                position = currentRepeat.startPos + 1  // after the repeat-start
                continue
            else:
                // Done repeating: pop and continue
                pop repeatStack
                position++
                continue

        if element is { barline: "repeat-both" }:
            // First: handle as repeat-end
            (same logic as repeat-end above)
            // Then: handle as repeat-start
            push new repeat context to stack
            position++
            continue

        if element is { ending: { number, type: "start" } }:
            currentRepeat = top of repeatStack (or implicit)
            if number != currentRepeat.passNumber:
                skippingEnding = true    // skip this ending's notes
            activeEnding = number
            position++
            continue

        if element is { ending: { number, type: "stop" } }:
            skippingEnding = false
            activeEnding = null
            position++
            continue

        if element is { navigation: "segno" } or { navigation: "coda" } or { navigation: "fine" }:
            // Target markers: just record position, don't affect flow on first encounter
            if element is "fine" AND isRepeating:
                break    // stop playback
            position++
            continue

        if element is { navigation: "to-coda" }:
            if isRepeating:
                position = markers.coda    // jump to coda
                isRepeating = false        // clear repeating flag
                continue
            position++
            continue

        if element is { navigation: "dc" or "dc-al-fine" or "dc-al-coda" }:
            isRepeating = true
            skipInnerRepeats = NOT (element.withRepeats)
            if "al-coda": // remember to jump at to-coda
            position = 0    // jump to beginning
            continue

        if element is { navigation: "ds" or "ds-al-fine" or "ds-al-coda" }:
            isRepeating = true
            skipInnerRepeats = NOT (element.withRepeats)
            position = markers.segno    // jump to segno
            continue

        if element is { barline: "final" }:
            break    // end of piece

        // Regular note/chord/rest
        if NOT skippingEnding:
            append element to output

        position++

    return output
```

### Return Value

`resolvePlaybackOrder()` returns a flat array of note/chord/rest objects (markers stripped out), in the order they should be played. This array can be passed directly to `Instrument.play()` as the `data` parameter.

```js
import { resolvePlaybackOrder } from 'audio/lib/repeatResolver';

const linearNotes = resolvePlaybackOrder(songData);

instrument.play({
  data: linearNotes,
  tempo: 120,
  basis: 4
});
```

An alternative return format provides indices into the original array:

```js
// Returns indices for cases where the caller needs to map back to original positions
const indices = resolvePlaybackOrder(songData, { returnIndices: true });
// [0, 1, 2, 3, 0, 1, 4, 5]  -- indices of note elements in original array
```

---

## Impact on Playback

### Instrument.play() -- No Changes Needed

The `Instrument.play()` method already accepts a flat `data` array and plays it sequentially. The repeat resolution happens upstream. `Instrument.play()` receives only notes, chords, and rests -- never markers.

### Higher-Level Controller

A controller function (or the caller of `Instrument.play()`) is responsible for:

1. Calling `resolvePlaybackOrder(songData)` to get the linear sequence.
2. Passing the linear sequence to `Instrument.play()`.
3. Optionally providing repeat context to callbacks.

```js
// Example usage in game code (creature playback)
const song = creature.getSong();
const linearNotes = resolvePlaybackOrder(song);

creature.instrument.play({
  data: linearNotes,
  tempo: song.tempo || 120,
  basis: song.basis || 4
});
```

### MusicalClock Considerations

The MusicalClock tracks beats linearly (always incrementing). With repeats, beat positions are non-linear in the original score but linear in the unrolled sequence. Two approaches:

**Approach A (recommended): Absolute time.** After unrolling, the linear sequence has its own beat timeline starting from 0. The MusicalClock tracks this absolute timeline. Beat 0 is the start of the unrolled sequence, regardless of repeats. This requires no changes to MusicalClock.

**Approach B: Score-relative time.** The MusicalClock tracks position relative to the original score, with beat numbers that reset or loop during repeats. This requires MusicalClock to understand repeat structure, adding complexity. Not recommended for initial implementation.

### Note Callbacks with Repeat Context

The `noteCallback` on Instrument can optionally include repeat context:

```js
instrument.noteCallback = (noteEvent) => {
  // noteEvent already has: pitch, length, timestamp, source, sourcePosition
  // With repeat context (if provided by the controller):
  // noteEvent.repeatPass: which pass through the section (1, 2, 3...)
  // noteEvent.section: "intro", "verse", "coda", etc. (if labeled)
};
```

This is an optional enhancement. The basic implementation does not need repeat context in callbacks. The controller can enrich note events if needed by wrapping the callback.

---

## File Structure

```
src/audio/
├── lib/
│   ├── repeatResolver.js       # resolvePlaybackOrder() function
│   └── repeatResolver.test.js  # Tests for unrolling algorithm
```

Single new file. The `repeatResolver.js` module is a pure function with no dependencies on Web Audio, AudioContext, or any browser APIs. It operates entirely on data structures, making it easy to test.

**Note:** This module is the canonical location for repeat resolution. The notation system imports from here.

---

## Gotchas

### Infinite Loop Protection

The unrolling algorithm must have a hard upper limit on iterations. Without this, malformed data (e.g., `repeat-end` jumping back to `repeat-start` indefinitely) could freeze playback.

- **MAX_ITERATIONS**: 10,000 element visits. If exceeded, the algorithm stops and returns whatever it has collected so far.
- **Max repeat count per section**: 100. If `times` exceeds 100, cap it silently.
- Log a warning when safety limits are hit.

### D.C./D.S. "No Repeats on Second Pass" Convention

When replaying via D.C. or D.S., simple repeat sections within the replayed region are played only once (the inner repeats are skipped). This is the standard musical convention and the default behavior.

The `withRepeats: true` property on the navigation directive overrides this:

```js
{ navigation: "dc-al-coda", withRepeats: true }  // honor inner repeats on D.C. pass
```

Implementation: when `isRepeating` is true and `skipInnerRepeats` is true, the algorithm ignores `repeat-start` and `repeat-end` markers (treats them as no-ops).

### All Voices Repeat Together

In multi-voice songs, repeat and navigation markers apply to ALL voices simultaneously. The `resolvePlaybackOrder()` function operates on the shared marker structure and produces one playback order that applies to every voice.

For multi-voice songs, the function processes each voice's notes array through the same structural markers:

```js
const song = {
  timeSignature: [4, 4],
  voices: [
    { clef: "treble", notes: [...] },
    { clef: "bass", notes: [...] }
  ]
};

// Option 1: Resolve each voice with shared structural context
const resolved = resolveAllVoices(song);
// Returns: { voices: [{ notes: [...] }, { notes: [...] }] }
// Each voice's notes are unrolled independently but using the same repeat structure

// Option 2: If markers are inline in each voice, they must be identical
```

The recommended approach is for multi-voice songs to use shared markers (either in the first voice or in a top-level `markers` array) rather than duplicating markers in every voice.

### Tempo Changes Persist Across Repeats

If a tempo change occurs during the first pass of a repeated section, that tempo persists into subsequent passes. The repeat does not reset tempo to its value at the repeat-start. This is musically correct -- the performer has already made the tempo change.

In practice, this means the unrolled note sequence inherits whatever tempo state existed when each note was originally encountered. Since `Instrument.play()` uses a single tempo for the entire sequence, tempo changes within repeats would require a more advanced playback controller (out of scope for initial implementation).

### Markers Are Stripped from Playback Data

The `resolvePlaybackOrder()` function MUST NOT include marker objects in its output array. Only note objects, rest objects, and chord arrays are included. Marker objects would cause errors in `Instrument.play()`, which expects elements to have `pitch` and/or `length` properties.

### Ending Numbering Starts at 1

Endings are numbered starting at 1, matching standard musical convention. Ending number corresponds to the repeat pass number (ending 1 plays on pass 1, ending 2 on pass 2, etc.).

### Implicit Repeat Start

If a `repeat-end` is encountered without a preceding `repeat-start`, the repeat goes back to the beginning of the piece (or the beginning of the current section after a `final` barline). This matches standard musical practice.

### `to-coda` Only Triggers on Repeat Pass

On the first time through the music, the `to-coda` marker is ignored. It only triggers after a D.C. or D.S. jump sets the `isRepeating` flag. This is critical -- without this behavior, the algorithm would jump to the coda prematurely on the first pass.

---

*Spec Version: 1.0*
*Created: 2026-01-25*
