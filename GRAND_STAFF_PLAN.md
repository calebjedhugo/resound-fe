# Grand Staff Implementation Plan

## Data Structure

Gate/fountain `song` evolves from flat array to Level 3 voices format with `staffGroups`:

```json
// Before (still supported for backward compat)
"song": [{ "pitch": "C4", "length": "1/4" }]

// After (grand staff via staffGroups)
"song": {
  "voices": [
    { "id": "treble", "clef": "treble", "notes": [...] },
    { "id": "bass", "clef": "bass", "notes": [...] }
  ],
  "staffGroups": [
    { "type": "brace", "voiceIds": ["treble", "bass"] }
  ]
}
```

### Design Rationale

`staffGroups` replaces the earlier `grandStaff: true` boolean. A grand staff is expressed as a `staffGroups` entry with `"type": "brace"`. This is extensible:

- **Bracket grouping** (orchestral): `{ "type": "bracket", "voiceIds": [...] }`
- **Multiple groups**: two pianos, each with their own brace
- **Ungrouped voices**: voices not in any staffGroup render as independent staves (existing behavior)

### Future: Multi-Voice Per Staff

When needed (e.g., SATB choral: soprano+alto sharing treble staff), add an optional `staves` layer:

```json
"song": {
  "voices": [
    { "id": "soprano", "notes": [...] },
    { "id": "alto", "notes": [...] },
    { "id": "tenor", "notes": [...] },
    { "id": "bass-v", "notes": [...] }
  ],
  "staves": [
    { "clef": "treble", "voiceIds": ["soprano", "alto"] },
    { "clef": "bass", "voiceIds": ["tenor", "bass-v"] }
  ],
  "staffGroups": [
    { "type": "brace", "staffIndices": [0, 1] }
  ]
}
```

When `staves` is absent (the current implementation), each voice implicitly gets its own staff. The `staves` layer is NOT implemented in this plan — just designed so nothing we build blocks it.

---

## Workflow

For each phase:

1. **Build instance** — implement the phase using TDD (write tests first, then code to pass them)
2. **Audit instance** — review the phase output for correctness, convention adherence, and boundary violations
3. If audit **fails**, launch a **fix instance** to address issues, then re-audit
4. If audit **passes**, proceed to the next phase

Each phase should leave all tests passing (`npm test -- --ci`) before moving on.

---

## Phase 1: Notation Components

**New files:**
- `src/notation/components/Brace.js` — Curly brace SVG path, takes `height`, returns scaled brace group
- `src/notation/components/SharedBarLine.js` — Bar line spanning `topY` to `bottomY` across staves

Both are pure SVG with tests.

## Phase 2: Data Parser

**Modify:** `src/notation/lib/dataParser.js`

Propagate `staffGroups` from input to parsed output. No structural change — just pass the array through alongside the existing `voices` array. When absent, `staffGroups` defaults to `[]`.

## Phase 3: NotationRenderer Grand Staff Mode

**Modify:** `src/notation/NotationRenderer.js`

When `parsed.staffGroups` contains a `"brace"` group:

- **Layout**: Staves in the group use tighter spacing (`GRAND_STAFF_GAP = 60` between bottom of treble staff and top of bass). Each voice still renders with the same per-voice logic (clef, key sig, notes, beaming, etc.)
- **Brace**: Draw at left edge spanning grouped staves
- **Shared barlines**: Voices in a brace group share time signature, so barlines naturally align. After rendering notes per-voice, draw shared barlines spanning from the top line of the first staff to the bottom line of the last staff in the group
- **Height**: enough for grouped staves + gap + margins for ledger lines

When `parsed.staffGroups` is empty or absent: existing multi-voice rendering unchanged.

## Phase 4: NotationEditor Multi-Voice

**Modify:** `src/editor/ui/NotationEditor.js`

Grand staff mode is driven by the clef selector (see Phase 5), not auto-detected. The editor receives a `grandStaff` boolean at construction time.

**Core change — array of SongModels:**
```javascript
this._voiceModels = grandStaff
  ? [new SongModel(ts), new SongModel(ts)]   // [treble, bass]
  : [new SongModel(ts)];                      // [single voice]
this._activeVoiceIndex = 0;

get _songModel() { return this._voiceModels[this._activeVoiceIndex]; }
```

The getter makes all existing keyboard/click handlers work transparently on the active voice.

**Voice switching (grand staff mode only):**
- `Enter` — move `_activeVoiceIndex` down (0 -> 1)
- `Shift+Enter` — move `_activeVoiceIndex` up (1 -> 0)

**Rendering:** Extract current single-staff render logic into `_renderVoiceStaff(model, clef, isActive)`. In grand staff mode, call it twice with different Y offsets. Active voice at full opacity, inactive dimmed. Cursor only on active voice. In single-staff mode, existing render logic unchanged.

**Click handling:** In grand staff mode, determine which staff was clicked by Y coordinate, set `_activeVoiceIndex` accordingly, use that voice's clef for pitch mapping. In single-staff mode, existing click logic unchanged.

**Load/save:** `_loadSong` reads `song.voices[i].notes` into each model when song is `{ voices, staffGroups }`, or loads flat array into the single model. `_saveSong` writes back as `{ voices: [...], staffGroups: [...] }` in grand staff mode, or flat array in single-staff mode.

## Phase 5: SongEditorModal + Serialization

**Modify:** `src/editor/ui/SongEditorModal.js`

Add "Grand Staff" as a fourth option in the clef selector (alongside Auto / Treble / Bass). The label is user-facing only — no `grand` keyword in the data. When selected:
- Store `data.staffGroups = [{ "type": "brace", "voiceIds": ["treble", "bass"] }]` on the entity
- `data.clef` stays null/auto (each voice has its own clef baked into the voice data)
- Pass `staffGroups` to NotationEditor constructor to trigger grand staff mode

When any other clef is selected:
- `data.staffGroups` is absent or `[]`
- `data.clef` works as before (Auto / Treble / Bass)
- Existing single-staff behavior unchanged

The clef selector drives the editor mode — no auto-detection. The editor reads `data.staffGroups` to decide rendering mode.

**Modify:** `src/editor/model/serialization.js`

Ensure round-trip works for both flat-array songs and `{ voices, staffGroups }` format. Gate/fountain serialization must preserve `staffGroups` when present.

## Phase 6: Game Logic — Test-Driven from Updated Fixtures

**Approach:** Add new gate/fountain test fixtures using the `{ voices, staffGroups }` format. **Do NOT modify or replace existing flat-array fixtures** — those validate backward compat and must keep passing. Run tests. Let failures from the new fixtures guide the implementation.

**Known breakpoints** (discovered by tracing `data.song` through the codebase):

### 6a. Gate/Fountain constructor validation
`Gate.js:14` and `Fountain.js:16` — `!Array.isArray(data.song)` rejects the new format. Relax to also accept objects with `voices`.

### 6b. `SongMatcher.flattenSong()` — new static method
Merges a multi-voice song into a flat note sequence for comparison and playback. **This is not a trivial concat** — notes from different voices that occur at the same beat position must become chords. Logic:

1. Walk each voice's notes, computing cumulative beat position from note durations
2. Collect all `(beatPosition, note)` pairs across voices
3. Sort by beat position
4. Group notes at the same beat into chords; solo notes stay as single notes

Returns a flat array compatible with the existing `songsMatch()` and `Instrument.play()`.

Flat-array input passes through unchanged (`Array.isArray(song) ? song : flatten(song)`).

### 6c. `SongMatcher.songsMatch()` — use `flattenSong`
Call `flattenSong` on `requiredSong` before comparing against `capturedSong`.

### 6d. Fountain celebratory playback
`Fountain.js:145` — `this.instrument.play({ data: this.requiredSong })` passes the raw song to `Instrument.play()`, which iterates it as a flat array. Call `SongMatcher.flattenSong(this.requiredSong)` before passing to `play()`.

### 6e. NotationDisplay height
`src/ui/NotationDisplay.js` — adjust renderer height when song has staffGroups (grand staff needs more vertical space for two staves + brace).

### 6f. DebugUI
`src/ui/DebugUI.js:121` — `formatSong(entity.requiredSong)` assumes array. Handle object format gracefully.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/notation/components/Brace.js` | **New** — brace SVG component |
| `src/notation/components/SharedBarLine.js` | **New** — cross-staff barline |
| `src/notation/lib/dataParser.js` | Propagate `staffGroups` array |
| `src/notation/NotationRenderer.js` | Staff group layout mode (brace, shared barlines) |
| `src/editor/ui/NotationEditor.js` | Multi-voice SongModel array, Enter/Shift+Enter, dual-staff render |
| `src/editor/ui/SongEditorModal.js` | Pass `staffGroups` option |
| `src/editor/model/serialization.js` | Handle new song format with staffGroups |
| `src/core/SongMatcher.js` | Add `flattenSong()` static method, use in `songsMatch()` |
| `src/entities/Gate.js` | Relax song validation |
| `src/entities/Fountain.js` | Relax song validation, flatten for `instrument.play()` |
| `src/ui/NotationDisplay.js` | Adjust height for staff groups |
| `src/ui/DebugUI.js` | Handle object song format in `formatSong()` |

## Verification

1. `npm test` — all existing tests pass + new tests pass
2. New tests for: Brace component, SharedBarLine, dataParser staffGroups propagation, renderer staff group layout, serialization round-trip with staffGroups, `SongMatcher.flattenSong()` (including simultaneous-notes-become-chords)
3. Visual: open editor at `/editor.html`, create a gate entity, verify two staves with brace render, Enter/Shift+Enter switches voices, notes placed on correct staff with correct clef
4. Visual: in-game, verify gate notation displays as grand staff
5. Gameplay: gate/fountain with grand staff song accepts correct notes, fountain plays victory song correctly
