# Editor Notation Integration Spec

Replace the editor's independent notation rendering with the shared `src/notation/` system, and move the song editor out of the cramped sidebar into a full-size modal launched from a right-click context menu.

> **Parent:** [CLAUDE.md](../../CLAUDE.md) | **Notation system:** [notation/SPEC.md](../notation/SPEC.md)

---

## Problem

1. **Song editor is too small.** The NotationEditor is embedded inline in the PropertyPanel sidebar (280px wide). This leaves no room to work with notation at any meaningful level of detail.

2. **No way to launch the editor from the viewport.** The only way to reach the song editor is to left-click an entity (selecting it), then scroll the sidebar to find the embedded editor. There is no context menu or direct "edit song" action.

3. **RhythmPalette** uses Unicode Musical Symbols (U+1D1xx block) for button labels. System fonts don't support these codepoints, so 6 of 8 buttons render as placeholder squares. Only Quarter (U+2669) and Eighth (U+266A) display correctly because they use the universally-supported Miscellaneous Symbols block.

4. **NotationEditor** draws notes as plain ellipses with no stems, flags, or duration differentiation. It reimplements staff lines, pitch-to-Y mapping, and barline calculation independently from `src/notation/`.

5. **StaffInteraction** duplicates pitch/Y conversion logic that already exists in `notation/lib/notePositions.js`, but with different constants (5px half-space vs 10px diatonic spacing) and a hard-coded pitch table instead of computed diatonic positions.

---

## Goals

1. Song editing happens in a full-size modal overlay, not the sidebar
2. Right-click on an entity in the viewport opens a context menu with "Edit Song" (for song-bearing entities)
3. RhythmPalette buttons render proper SVG note icons using `notation/components/Note.js`
4. NotationEditor staff renders notes using the notation component layer
5. StaffInteraction delegates to `notation/lib/notePositions.js` for pitch/Y math
6. All existing editor tests continue to pass
7. No changes to `src/notation/` public APIs (the notation system is planned for extraction)
8. Clef, key signature, and time signature rendered at the start of each staff
9. Key-signature-aware accidental display on notes
10. Keyboard shortcuts for adding/removing accidentals on selected notes
11. Key signature and time signature stored as puzzle-level metadata
12. Rest insertion via keyboard, with proper rest symbol rendering

---

## Non-Goals

- Adding new editing features beyond rests (e.g., beaming in editor)
- Changing the SongModel data format
- Modifying `NotationRenderer` itself (we use its components, not the full renderer)
- Audio playback integration
- Context menu actions beyond "Edit Song" (delete, duplicate, etc. can be added later)
- Per-entity key signature or time signature overrides (all entities share puzzle-level settings)
- Enharmonic respelling assistance (user controls spelling manually via accidental keys)

---

## Architecture

### Current Flow

```
Left-click entity --> SelectionManager.select() --> PropertyPanel.show()
                                                      --> _renderSongEditor() embeds NotationEditor inline
RhythmPalette     --> Unicode text buttons (broken)
NotationEditor    --> Manual SVG ellipses (no duration info)
StaffInteraction  --> Hard-coded pitch table, custom Y math
```

### Target Flow

```
Left-click entity  --> SelectionManager.select() --> PropertyPanel.show()
                                                       --> "Edit Song" button (no inline editor)
Right-click entity --> ContextMenu.show()
                       --> "Edit Song" --> SongEditorModal.open()
                                            --> NotationEditor (full-size)
                                            --> RhythmPalette (SVG icons)
                                            --> Close button / Escape

RhythmPalette      --> SVG note icons via createNote() from notation/components/Note.js
NotationEditor     --> Notes rendered via createNote(), staff via createStaffLines()
StaffInteraction   --> Delegates to notation/lib/notePositions.js for pitch<->Y
```

The editor will use the notation system's **component layer** (`components/Note.js`, `components/Staff.js`, `lib/durationSymbols.js`, `lib/notePositions.js`) directly, rather than the high-level `NotationRenderer`. This is because the editor needs interactive control over individual note placement, selection highlighting, and cursor positioning that `NotationRenderer.render()` doesn't support.

### Monophonic vs Polyphonic Mode

Creatures are monophonic (one pitch per beat position). Gates and fountains are polyphonic (chords allowed). The NotationEditor operates in one of two modes based on entity type:

- **Monophonic** (creature): Shift-click chord addition is silently ignored. SongModel entries are always single note objects, never arrays.
- **Polyphonic** (gate, fountain): Shift-click adds a pitch to the selected note, creating a chord (array of note objects). This is the current behavior.

The mode is communicated as a constructor option: `new NotationEditor(container, undoManager, entityId, { polyphonic })`. The `SongEditorModal` determines the value from `entity.type` and passes it through.

### Musical Context Data Flow

Key signature and time signature are puzzle-level metadata (not per-entity). Clef is auto-inferred from note content. Accidentals are stored in pitch strings.

```
EditorPuzzleModel.getMetadata()
  → { keySignature: 'G', timeSignature: [4, 4], tempo: 120, ... }

Entity data
  → { song: [...], clef: 'bass', ... }   // clef is optional, per-entity
       ↓
SongEditorModal.open(entityId)
  → reads metadata.keySignature and metadata.timeSignature
  → reads entity data.song and data.clef
  → passes { keySignature, timeSignature, polyphonic, clef } to NotationEditor
       ↓
NotationEditor constructor
  → stores this._keySignature, this._timeSignature, this._clefOverride
  → creates SongModel(timeSignature)
       ↓
NotationEditor._renderStaff()
  → resolves clef: this._clefOverride || inferClef(song) || 'treble'
  → renders header: createClef(clef)
                     createKeySignature(keySignature, clef)
                     createTimeSignature(timeSignature)  // null → skip
  → for each note:
       createNote({ pitch, length, x, clef })
       key-sig-aware accidental check (with measure memory) → createAccidental()
       createLedgerLines({ x, y }) for notes outside the staff
```

Key signature and time signature are **display and editing aids**, not part of the note data. Notes always store their full pitch including accidentals (e.g., `"F#4"`, not `"F4"` with implicit sharp from key). Changing the key signature does not alter any note pitches — it only changes which accidental symbols are rendered.

Clef is **per-entity** (stored in `data.clef`) because different entities in the same puzzle may use different pitch ranges. When unset, clef is auto-inferred from the song content.

---

## Changes by File

### Phase 1: RhythmPalette — SVG Note Icons

**File:** `src/editor/ui/RhythmPalette.js`

**Current:** Each button uses `btn.textContent = label` with a Unicode character.

**Target:** Each button contains a small inline SVG rendered by `createNote()`.

Changes:
- Import `createNote` from `notation/components/Note.js`
- Import `getDurationInfo` from `notation/lib/durationSymbols.js`
- Replace the `DURATIONS` array's `label` field with a function that generates an SVG element
- For each button, create a small SVG (e.g., 32x48 viewBox) containing a single note rendered by `createNote()` at a fixed pitch/position
- The `2/1` (Double Whole) duration doesn't exist in `durationSymbols.js` `DURATION_MAP` and isn't in `VALID_LENGTHS`. Same for `1/64`. These must be handled:
  - **Option:** Remove `2/1` and `1/64` from the palette (they aren't in the notation system's `VALID_LENGTHS` and aren't used in puzzle data)
  - **Option:** Add them to `durationSymbols.js`. This violates the non-goal of not modifying the notation system.
  - **Decision:** Remove `2/1` and `1/64` from the palette. The supported durations become: `1/1`, `1/2`, `1/4`, `1/8`, `1/16`, `1/32` (matching `VALID_LENGTHS` plus `1/32` which is already in `DURATION_MAP`).
- Keyboard shortcuts re-map: keys `2` through `7` for the 6 remaining durations

Notes on the SVG icon approach:
- `createNote()` requires `pitch`, `length`, `x`, and `clef` params
- Use a fixed pitch (e.g., `'B4'` at the middle line) and `clef: 'treble'` so the note renders centered
- The note's `transform` positions it at `(x, y)` where y comes from `pitchToStaffY('B4', 'treble')` = 50
- ViewBox of each icon SVG: `0 0 32 100` with the note at `x=16`
- Set `color` via CSS (`currentColor`) so the note inherits the button's text color

**CSS changes** (`src/editor/editor.css`):
- `.rhythm-btn` gets `display: flex; align-items: center; justify-content: center;` and remove `font-size: 14px`
- `.rhythm-btn svg` gets `width: 24px; height: 40px;` for consistent sizing

### Phase 2: StaffInteraction — Use Shared Pitch/Y Mapping

**File:** `src/editor/ui/StaffInteraction.js`

**Current:** Hard-coded `STAFF_PITCHES` array with 12 entries, custom `yToPitch()` and `pitchToY()` using 5px half-space math.

**Target:** Delegate to `pitchToStaffY()` and `parsePitch()` from `notation/lib/notePositions.js`.

The challenge is that the two systems use different coordinate spaces:
- **Notation system:** `pitchToStaffY('B4', 'treble')` = 50. Staff lines at y = 0, 20, 40, 60, 80 (within the staff-lines group, offset by `STAFF_TOP_OFFSET=10`).
- **Editor current:** `STAFF_TOP_Y = 20`, `STAFF_LINE_SPACING = 10`, staff lines at y = 20, 30, 40, 50, 60.

The editor must adopt the notation system's coordinate space. This means:
- Staff SVG viewBox height increases from 120 to ~200 (to accommodate the notation system's 80px staff height plus room for ledger lines, labels, and cursor)
- `yToPitch()` reverses `pitchToStaffY()` by computing the diatonic position from a Y coordinate
- `calculateBarlines()` is unaffected (it works with note durations, not coordinates)
- `createNoteFromClick()` uses the new `yToPitch()` internally

Importantly, `pitchToStaffY` returns coordinates relative to the staff group, not the SVG root. The editor already uses groups, so this aligns well.

New exports:
- `yToPitch(y, clef)` — reverse of `pitchToStaffY`, snapping to nearest diatonic position
- `pitchToY(pitch, clef)` — thin wrapper around `pitchToStaffY`
- `snapToStaffPosition(y)` — snap Y to nearest half-space in notation coordinate system

Removed exports:
- `STAFF_TOP_Y`, `STAFF_LINE_SPACING`, `STAFF_LINES`, `STAFF_PITCHES` — replaced by notation system constants

### Phase 3: NotationEditor — Use Notation Components for Rendering

**File:** `src/editor/ui/NotationEditor.js`

**Current:** `_renderStaff()` manually creates SVG elements: staff lines via loop, notes via ellipses, barlines via manual calculation, pitch labels via text elements, cursor via line.

**Target:** `_renderStaff()` uses notation components:
- `createStaffLines(width)` from `notation/components/Staff.js` for the 5-line staff
- `createNote({ pitch, length, x, clef })` from `notation/components/Note.js` for single notes
- `createEllipse`, `createLine`, `createGroup` from `notation/lib/svgHelpers.js` for chord rendering
- `createBarLine(x)` from `notation/components/BarLine.js` for barlines
- `getDurationInfo(length)` from `notation/lib/durationSymbols.js` for note spacing and visual properties
- `pitchToStaffY(pitch, clef)` from `notation/lib/notePositions.js` for note Y positions

**Constructor change:**

```js
constructor(container, undoManager, entityId, {
  polyphonic = true,
  keySignature = 'C',
  timeSignature = [4, 4],
  clef = null
} = {})
```

- `polyphonic` controls whether shift-click chord addition is enabled. Default `true`; SongEditorModal passes `false` for creatures.
- `keySignature` is the puzzle's key signature string. Used for key-signature-aware accidental display and staff header rendering (Phase 7).
- `timeSignature` is the puzzle's time signature `[beats, beatValue]` or `null` (unmetered). Passed to SongModel for measure calculations and rendered in the staff header (Phase 7).
- `clef` is the entity's explicit clef override (`'treble'`, `'bass'`, or `null`). When `null`, clef is auto-inferred from the song content (Phase 7C). Stored per-entity in `data.clef`.

**Changes to `_renderStaff()`:**
1. Replace the manual staff line loop with `createStaffLines(width)`, positioned via `transform`
2. For **single notes**: use `createNote({ pitch, length, x, clef })`. Each note group gets:
   - Selection highlighting (change `color` style for selected note instead of fill on the ellipse)
   - `data-index` attribute for click targeting
   - `cursor: pointer` style
3. For **chords** (array entries in the song): build a chord group manually, matching the approach in `NotationRenderer` (lines 521-657). This is necessary because `createNote()` only accepts a single pitch. Chord rendering:
   - Create a `<g>` group with class `chord note <cssClass>` via `createGroup()`
   - For each pitch in the chord, compute Y via `pitchToStaffY()` and render a note head via `createEllipse()` with fill from `getDurationInfo().filledHead`
   - Render a single shared stem via `createLine()`, spanning from the highest to the lowest note head plus `STEM_LENGTH`
   - Stem direction: the note furthest from the middle line determines direction (same algorithm as `NotationRenderer`)
   - No flags on chords (flags are only for single notes with beaming; chords don't beam)
4. Replace `_pitchToSimpleY()` with `pitchToStaffY(pitch, 'treble')` (and delete `_pitchToSimpleY`)
5. Replace manual barline lines with `createBarLine(x)` from the notation components
6. Use `getDurationInfo(length).spacing` for horizontal note spacing (currently hard-coded at 40px for all notes regardless of duration)
7. Adjust SVG viewBox to match notation system coordinates (`0 0 <width> 200`)
8. Keep: pitch label text below notes, cursor indicator line, click/keyboard handlers

**Changes to `_handleStaffClick()`:**
- When `this._polyphonic` is `false`, the `e.shiftKey` branch (chord building) is skipped entirely. Shift-click in monophonic mode places a new note at the clicked pitch, same as a regular click. This is the simplest behavior — no error feedback needed since the user can see from the modal header ("Creature Song") that they're in monophonic mode.

The note groups returned by `createNote()` use `transform: translate(x, y)` positioning. Selection highlighting can be applied by toggling a CSS class (e.g., `.note-selected`) that changes `color` on the group, since all child elements use `currentColor`.

**CSS additions** (`src/editor/editor.css`):
- `.notation-staff .note-selected { color: #ffaa00; }` for selected note highlighting
- `.notation-staff .note { cursor: pointer; }` for click affordance
- `.notation-staff .staff-line { stroke: #445566; }` to match current staff line color

### Phase 4: CSS Alignment

**File:** `src/editor/editor.css`

The notation system's SVG components use CSS classes (`staff-line`, `note`, `note-head`, `note-stem`, `note-flag`, `bar-line`, etc.) with `currentColor`. The editor needs to set `color` on the staff container so notes render in the editor's color scheme.

Changes:
- `.notation-staff { color: #e0e0e0; }` — default note/staff color
- `.notation-staff .staff-line { stroke: #445566; }` — muted staff lines
- `.notation-staff .note-selected { color: #ffaa00; }` — selection highlight
- `.notation-staff .bar-line { stroke: #667788; }` — barline color
- Remove any redundant manual styles

### Phase 5: Context Menu

**New file:** `src/editor/ui/ContextMenu.js`

A lightweight right-click context menu for entities in the viewport. No existing context menu infrastructure exists in the editor.

**Behavior:**
- Right-clicking on an entity in the viewport opens a small floating menu at the cursor position
- The menu shows actions relevant to the entity type
- For song-bearing entities (creature, gate, fountain): shows "Edit Song" item
- Clicking outside the menu or pressing Escape closes it
- Only one context menu can be open at a time
- The menu does not interfere with Three.js OrbitControls (which use right-click for panning — see below)

**Integration with OrbitControls:**
OrbitControls uses right-mouse-button for panning by default. To avoid conflict:
- The `contextmenu` event fires before OrbitControls processes the mousedown
- Call `e.preventDefault()` on the `contextmenu` event to suppress the browser default menu
- On right-click, raycast against entity meshes first. If an entity is hit, show the context menu and suppress the event. If no entity is hit, let OrbitControls handle the pan normally
- While the context menu is open, disable OrbitControls to prevent accidental panning when clicking to dismiss

**API:**

```js
class ContextMenu {
  constructor(viewportContainer) // appends menu DOM to the viewport container
  show(x, y, items)             // show at pixel position with menu items
  hide()                        // close the menu
  dispose()                     // clean up DOM and listeners
}
```

Each menu item is `{ label: string, action: () => void, disabled?: boolean }`.

**DOM structure:**
```html
<div class="context-menu" style="left: Xpx; top: Ypx;">
  <button class="context-menu-item">Edit Song</button>
</div>
```

The menu is positioned absolutely within `#editor-viewport` (which is `position: relative`).

**Wiring in EditorApp:**

`EditorApp._setupViewportClick()` currently only listens for `click`. Add a `contextmenu` listener on the viewport container:

```
container.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  // Raycast at click position
  // If entity hit:
  //   - Select the entity (via SelectionManager)
  //   - Build menu items based on entity type
  //   - contextMenu.show(e.clientX - rect.left, e.clientY - rect.top, items)
  // If no entity hit:
  //   - contextMenu.hide()
});
```

Song-bearing entity types are determined by checking `entity.type`:
- `creature` — has `data.song` (note array)
- `gate` — has `data.song` (note array in the editor model; serialization maps it to the entity root in puzzle JSON — see `serialization.js`)
- `fountain` — has `data.song` (note array)

All three types store `data.song` identically inside the editor model. The NotationEditor works with all of them without special-casing.

Non-song entities (wall, ramp, player) don't show "Edit Song" in the context menu. The menu can still appear with other future actions, but for now if there are no applicable items, no menu is shown.

**CSS** (`src/editor/editor.css`):
```css
.context-menu {
  position: absolute;
  background: #16213e;
  border: 1px solid #0f3460;
  border-radius: 4px;
  padding: 4px 0;
  min-width: 140px;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}
.context-menu-item {
  display: block;
  width: 100%;
  padding: 6px 16px;
  background: none;
  border: none;
  color: #e0e0e0;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.context-menu-item:hover {
  background: #0f3460;
}
.context-menu-item:disabled {
  color: #556677;
  cursor: default;
}
```

### Phase 6: Song Editor Modal

**New file:** `src/editor/ui/SongEditorModal.js`

A full-size overlay modal that hosts the NotationEditor. Replaces the inline song editor in PropertyPanel.

**Behavior:**
- Opens as a dark semi-transparent overlay covering the entire editor (viewport + sidebar)
- Contains a centered content panel with:
  - Header: entity type and position (e.g., "Creature Song — (5, 0, 3)")
  - The NotationEditor (RhythmPalette + staff + playback controls)
  - A "Done" button (bottom-right)
- Closing the modal (Done button, Escape key, or clicking the backdrop) saves the current state and returns to the normal editor view
- While the modal is open, viewport interaction is blocked (no clicks pass through)
- The modal content area is large — roughly 80% viewport width, 70% viewport height — giving the notation editor adequate space

**API:**

```js
class SongEditorModal {
  constructor(rootContainer, undoManager)  // rootContainer = #editor-root
  open(entityId)                           // show modal for this entity's song
  close()                                  // hide modal, save state
  get isOpen()                             // whether modal is currently showing
  dispose()                                // clean up
}
```

`open(entityId)` reads the entity from `undoManager.getEntity(entityId)` to determine:
- Entity type (for the header title and polyphonic mode)
- Entity position (for the header subtitle)
- Song data (passed to NotationEditor)

It reads puzzle metadata for `keySignature` and `timeSignature`, and the entity's `data.clef`, then creates the NotationEditor with:
```js
new NotationEditor(bodyEl, undoManager, entityId, {
  polyphonic: type !== 'creature',
  keySignature: metadata.keySignature,
  timeSignature: metadata.timeSignature,
  clef: entity.data.clef || null,
})
```
Creatures are monophonic; gates and fountains are polyphonic. Musical context (key/time signature) comes from puzzle metadata. Clef comes from the entity (per-entity override) or is auto-inferred.

**DOM structure:**
```html
<div class="song-modal-backdrop">
  <div class="song-modal">
    <div class="song-modal-header">
      <span class="song-modal-title">Creature Song — (5, 0, 3)</span>
      <button class="song-modal-close">&times;</button>
    </div>
    <div class="song-modal-body">
      <!-- NotationEditor renders here -->
    </div>
    <div class="song-modal-footer">
      <button class="editor-btn">Done</button>
    </div>
  </div>
</div>
```

The backdrop is appended to `#editor-root` (not `#editor-viewport`) so it covers both sidebar and viewport.

**Integration points:**

1. **ContextMenu "Edit Song" action:** Calls `songEditorModal.open(entityId)`.

2. **PropertyPanel:** Replace the inline `_renderSongEditor()` with an "Edit Song" button that opens the modal. This keeps the sidebar clean and uncluttered.
   - The `_renderSongEditor()` method changes from embedding a NotationEditor to rendering a button:
     ```js
     const editBtn = document.createElement('button');
     editBtn.className = 'editor-btn';
     editBtn.textContent = 'Edit Song...';
     editBtn.onclick = () => this._onEditSong(entity.id);
     ```
   - PropertyPanel receives an `onEditSong` callback (passed in from EditorApp) that opens the modal.

3. **EditorApp wiring:**
   - Creates `SongEditorModal` in `init()`
   - Passes `(entityId) => this.songEditorModal.open(entityId)` to PropertyPanel and ContextMenu
   - On modal close, refreshes PropertyPanel (the song data may have changed)
   - While modal is open, disables viewport keyboard shortcuts (Escape should close the modal, not deselect entities)

4. **Keyboard handling:**
   - Escape closes the modal (handled by the modal itself)
   - While modal is open, the modal's NotationEditor receives keyboard focus
   - EditorApp's global keyboard handler checks `songEditorModal.isOpen` and skips its own handling

**CSS** (`src/editor/editor.css`):
```css
.song-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.song-modal {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 8px;
  width: 80vw;
  max-width: 1200px;
  height: 70vh;
  max-height: 800px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}
.song-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #0f3460;
}
.song-modal-title {
  font-size: 14px;
  color: #8899aa;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.song-modal-close {
  background: none;
  border: none;
  color: #8899aa;
  font-size: 20px;
  cursor: pointer;
  padding: 0 4px;
}
.song-modal-close:hover { color: #e0e0e0; }
.song-modal-body {
  flex: 1;
  padding: 16px;
  overflow: auto;
}
.song-modal-footer {
  padding: 12px 16px;
  border-top: 1px solid #0f3460;
  display: flex;
  justify-content: flex-end;
}
```

**PropertyPanel changes** (`src/editor/ui/PropertyPanel.js`):
- Constructor gains an `onEditSong` callback parameter
- `_renderSongEditor()` no longer creates a NotationEditor inline
- Instead it renders an "Edit Song..." button that invokes `this._onEditSong(entityId)`
- Remove the `_notationEditor` instance tracking from PropertyPanel (the modal owns it now)
- The `dispose()` / `hide()` cleanup no longer needs to dispose a NotationEditor

### Phase 7: Musical Context — Clefs, Key Signatures, Time Signatures, Accidentals

This phase adds musical context to the staff: clef inference, key/time signature display, key-signature-aware accidental rendering, and accidental editing shortcuts. Sub-phases 7A and 7B are standalone prerequisites. Sub-phases 7C–7G describe rendering and interaction behaviors implemented within Phase 3's NotationEditor work.

#### Phase 7A: Puzzle Metadata — Key Signature and Time Signature

**File:** `src/editor/model/EditorPuzzleModel.js`

**Current metadata fields:** `id`, `name`, `difficulty`, `tempo`, `gridSize`, `clapDisplacement`

**New metadata fields:**
- `keySignature: 'C'` — Key signature string (validated by `isValidKeySignature` from `notation/lib/keySignatures.js`). Default `'C'` (no accidentals).
- `timeSignature: [4, 4]` — Time signature as `[beats, beatValue]` array. Default `[4, 4]`.

These are puzzle-level settings, not per-entity. All songs in a puzzle share the same key and time signature. Per-entity overrides are a future enhancement.

**Changes:**
- Update `DEFAULT_METADATA` to include `keySignature: 'C'` and `timeSignature: [4, 4]`
- `setMetadata()` already uses `Object.assign`, so these fields work without code changes
- On import, validate `keySignature` with `isValidKeySignature()`. Invalid values fall back to `'C'`.
- On import, validate `timeSignature` is a 2-element array of positive integers, or `null`. Invalid values fall back to `[4, 4]`.

**MetadataPanel changes** (`src/editor/ui/MetadataPanel.js`):
- Add a key signature `<select>` dropdown with all 15 major keys: C, G, D, A, E, B, F#, C#, F, Bb, Eb, Ab, Db, Gb, Cb
- Add time signature controls: two `<input type="number">` fields for beats and beat value, or a `<select>` with common presets (4/4, 3/4, 2/4, 6/8, 2/2, 3/8) plus a "None (unmetered)" option
- Both update through `undoManager.setMetadata()`
- Include `null` option for time signature (unmetered mode: no barlines)

**Serialization impact:**
- `puzzles/schema.md` gains optional `keySignature` (string) and `timeSignature` (`[number, number]` or `null`) fields at the puzzle root level
- Export includes them in the output JSON
- Import reads them, falling back to `'C'` and `[4, 4]` if absent, preserving backward compatibility with existing puzzle files

#### Phase 7B: Accidental Editing — SongModel

**File:** `src/editor/model/SongModel.js`

Add a method for changing a note's accidental without altering its diatonic pitch:

```js
setAccidental(index, accidental) // accidental: '#', 'b', or '' (natural/remove)
```

**Behavior:**
- Strips any existing accidental (`#` or `b`) from the note's letter name, then appends the new accidental
- For single notes: modifies `note.pitch` directly
- For chords: modifies all notes in the chord (matching the behavior of `setDuration` and `toggleDot`)
- No-ops if index is out of range

**Examples:**
- `setAccidental(0, '#')` on pitch `'F4'` → `'F#4'`
- `setAccidental(0, 'b')` on pitch `'F#4'` → `'Fb4'`
- `setAccidental(0, '')` on pitch `'F#4'` → `'F4'`

**Note on flat normalization:** SongModel's existing `_transposeSingleNote` normalizes flats to sharps via `FLAT_TO_SHARP`. The new `setAccidental` method does NOT normalize — it preserves the exact spelling the user chose. This is intentional: flats and their enharmonic sharp equivalents are distinct in notation display. Transposition (chromatic by nature) normalizes to sharps; explicit accidental entry preserves spelling.

#### Phase 7C: Clef — Editable, Per-Entity, with Auto-Inference Fallback

**No new file.** Uses `inferClef` from `notation/lib/clefInference.js` and `createClef` from `notation/components/Clef.js`.

Clef is stored **per-entity** in `data.clef` (optional). This is necessary because different entities in the same puzzle may use different pitch ranges — a bass creature needs bass clef, a treble gate needs treble clef. When `data.clef` is not set, the editor auto-infers from the song content.

**Clef resolution order:**
1. Entity's explicit `data.clef` (if set) — **always wins**
2. `inferClef(song)` — auto-detect from note content (if song is non-empty)
3. `'treble'` — default for empty songs (`inferClef([])` returns `'percussion'`, which would be incorrect for pitched entities)

```js
_resolveClef(song) {
  if (this._clefOverride) return this._clefOverride;
  if (song.length === 0) return 'treble';
  return inferClef(song);
}
```

**Clef selector UI in the modal:**

The SongEditorModal's header area includes a clef selector — a `<select>` dropdown with three options:
- **Auto** (default) — infers from note content; displayed label shows the inferred result (e.g., "Auto (treble)")
- **Treble** — forces treble clef
- **Bass** — forces bass clef

Selecting a non-auto option:
1. Sets `this._clefOverride` to the chosen value
2. Persists to the entity via `undoManager.updateEntity(entityId, { data: { ...data, clef: value } })`
3. Re-renders the staff with the new clef (all note Y positions recalculate)

Selecting "Auto":
1. Sets `this._clefOverride` to `null`
2. Removes `clef` from entity data: `undoManager.updateEntity(entityId, { data: { ...data, clef: undefined } })`
3. Re-renders using `inferClef`

The dropdown is placed in the modal header row, next to the entity type/position label. It's compact (a standard `<select>`) and doesn't interfere with the notation area.

**Integration in NotationEditor (`_renderStaff`):**
1. Resolve clef via `this._resolveClef(song)`
2. Store as `this._currentClef` for use during the render pass
3. Pass `this._currentClef` to all notation component calls:
   - `createNote({ ..., clef: this._currentClef })`
   - `pitchToStaffY(pitch, this._currentClef)`
   - `createKeySignature(keySignature, this._currentClef)`
   - `createClef(this._currentClef)`
4. Update key signature accidental positions (they differ between treble and bass clef — see `KEY_SIG_POSITIONS` in `KeySignature.js`)

**Integration in StaffInteraction:**
- `yToPitch(y, clef)` and `pitchToY(pitch, clef)` (from Phase 2) accept a clef parameter
- NotationEditor passes `this._currentClef` on every call
- When clef changes, the clickable pitch range shifts accordingly (treble covers A3–C6, bass covers C2–E4)

**Serialization:**
- `data.clef` is an optional string field on song-bearing entities (`'treble'` or `'bass'`)
- Omitted when the entity uses auto-inference (no `clef` key in exported JSON)
- On import, absent `clef` means auto-inference

#### Phase 7D: Staff Header Rendering

**File:** `src/editor/ui/NotationEditor.js` (within `_renderStaff`)

After creating staff lines, render the staff header elements in standard order:

1. **Clef** — `createClef(this._currentClef)` positioned at `x = STAFF_START_X` (20px)
2. **Key Signature** — `createKeySignature(this._keySignature, this._currentClef)` positioned after the clef. Returns `null` for key of C (no accidentals to render). Width = `keyInfo.count * KEY_SIG_ACCIDENTAL_WIDTH` (10px per accidental).
3. **Time Signature** — `createTimeSignature(this._timeSignature)` positioned after the key signature. Width = `TIME_SIG_WIDTH` (25px). Skipped when `this._timeSignature` is `null`.

Note cursor X starts after the staff header:
```js
const STAFF_START_X = 20;
const CLEF_WIDTH = 30;
const KEY_SIG_ACCIDENTAL_WIDTH = 10;
const TIME_SIG_WIDTH = 25;
const HEADER_PADDING = 5;

let noteStartX = STAFF_START_X + CLEF_WIDTH;
if (keySigGroup) {
  noteStartX += keyInfo.count * KEY_SIG_ACCIDENTAL_WIDTH + HEADER_PADDING;
}
if (this._timeSignature) {
  noteStartX += TIME_SIG_WIDTH + HEADER_PADDING;
}
```

This matches the layout logic in `NotationRenderer.render()` (lines 131–159).

**Time signature = `null` (unmetered):**
- No time signature symbol rendered
- No barlines drawn
- SongModel receives `null` and skips measure-based calculations: `getMeasures()` returns a single "measure" containing all notes, `getRemainingBeats()` returns `Infinity`, `calculateBarlines()` returns an empty array

**Key signature = `'C'`:**
- `createKeySignature('C', clef)` returns `null`
- No key signature element rendered, no width consumed

#### Phase 7E: Key-Signature-Aware Accidental Display with Measure Memory

**File:** `src/editor/ui/NotationEditor.js` (within note rendering in `_renderStaff`)

Accidental display follows standard music notation rules: the key signature establishes a baseline, accidentals stated on a note carry through the rest of the measure for that pitch+octave, and barlines reset accidental state back to the key signature.

**Algorithm:** During the note rendering pass in `_renderStaff()`, maintain a `Map<string, string>` called `activeAccidentals` that tracks `"noteLetter+octave"` → `currentAccidental` for the current measure.

1. **Initialize at each barline (and at the start of rendering):**
   Build the map from the key signature. For key of G (`{ type: 'sharp', accidentals: ['F'] }`), initialize all octaves of F to `'#'`. All other letters default to `''` (natural). In practice, use lazy lookup: if a letter+octave is not in the map, derive its default from the key signature.

2. **For each note in left-to-right order:**
   a. Parse the note's pitch: `parsePitch(pitch)` → `{ noteName, accidental, octave }`
   b. Build the lookup key: `noteName + octave` (e.g., `'F4'`, `'C5'`)
   c. Look up the "currently active" accidental for this pitch from the map:
      - If the key is in the map, use that value
      - Otherwise, derive from key signature (letter in `keyInfo.accidentals` → `keyInfo.type`; otherwise `''`)
   d. Compare the note's actual accidental to the active accidental:
      - **Match** → don't display an accidental (it's already in effect)
      - **Differ** → display the accidental using `createAccidental(type)`:
        - `'#'` → render sharp symbol
        - `'b'` → render flat symbol
        - `''` (natural) when active is sharp or flat → render natural sign
      - **Update the map:** set `activeAccidentals[key] = note's accidental`

3. **At each barline:** Reset the map (clear it; key signature defaults re-apply via lazy lookup).

**Examples in G major (F is sharp):**

| Notes in measure | Accidentals displayed | Reason |
|---|---|---|
| F#4, F#4 | none, none | Both match key signature |
| F4, F4 | ♮, none | First F contradicts key → show ♮. Second F inherits the ♮ from memory. |
| F4, F#4 | ♮, ♯ | First F → ♮ (contradicts key). Second F# → ♯ (contradicts the active ♮). |
| C#4, C4 | ♯, ♮ | First C# → ♯ (no C in key). Second C → ♮ (contradicts the active ♯). |
| F#4, _barline_, F4 | none, ♮ | F# matches key. After barline, key resets. F♮ contradicts key → ♮. |

**Unmetered mode (`timeSignature = null`):** Per the notation SPEC, accidentals apply only to the immediately following note of the same pitch. Implementation: reset the map after every note (not just at barlines). This means every occurrence of a non-key-signature accidental must be explicitly shown.

**Accidental placement:** To the left of the note head at `cursorX - ACCIDENTAL_OFFSET` (14px), at the same Y as the note. This matches NotationRenderer's positioning approach (lines 771–781).

**Chord accidentals:** Each note in a chord is evaluated independently against the active accidental map. After rendering, all chord notes update the map with their accidentals.

**Helper function:** Extract the accidental logic into a pure function for testability:

```js
/**
 * Determine whether to display an accidental for a note.
 * @param {string} pitch - e.g. 'F#4'
 * @param {Map} activeAccidentals - current measure state
 * @param {Object} keyInfo - from getKeySignature()
 * @returns {{ display: boolean, type: string|null }} - type is 'sharp', 'flat', or 'natural'
 */
function resolveAccidentalDisplay(pitch, activeAccidentals, keyInfo)
```

#### Phase 7F: Accidental Keyboard Input

**File:** `src/editor/ui/NotationEditor.js` (within `_handleKeyDown`)

Add keyboard shortcuts for accidental editing on the selected note:

| Key | Action |
|-----|--------|
| `#` (Shift+3) | Set sharp on selected note |
| `b` | Set flat on selected note |
| `n` | Remove accidental (natural) from selected note |

**Behavior:**
1. Check `this._selectedIndex !== null` — do nothing if no note is selected
2. Call `this._songModel.setAccidental(this._selectedIndex, accidental)`
3. Call `this._saveSong()` and `this._renderStaff()` to persist and display the change

**Conflict analysis for `b` key:** The letter `b` is used for flat. This doesn't conflict with existing shortcuts (number keys for durations, arrow keys for navigation, `+`/`-` for transposition, `.` for dot toggle). The `_handleKeyDown` listener is on the staff `<svg>` element, so it only fires when the staff has focus — no conflict with text inputs elsewhere.

**Interaction with transposition:** Transposition (`+`/`-` keys) moves chromatically and always produces sharps (per SongModel's `CHROMATIC_SCALE`). Accidental shortcuts let the user correct the spelling afterward: transpose to C# then press `b` to respell as Db. This two-step workflow (transpose then respell) is standard in notation editors.

#### Phase 7G: Ledger Lines

**File:** `src/editor/ui/NotationEditor.js`

Notes outside the staff need ledger lines. Uses `createLedgerLines({ x, y })` from `notation/components/LedgerLine.js`, which returns an SVG group with appropriate horizontal lines based on the note's Y position relative to the staff, or `null` if no ledger lines are needed.

**Rendering integration:**
- After rendering each note via `createNote()`, call `createLedgerLines({ x: noteX, y: noteY })` and append the result to the staff group (if non-null)
- For chords, call `createLedgerLines` for each note head Y position

**Clickable pitch range:**
The staff SVG's clickable area extends 3 ledger lines above and below the staff. In notation coordinates:
- Treble clef: A3 (y ≈ 130) to C6 (y ≈ -30), covering 3 ledger lines in each direction
- Bass clef: C2 to E4, similarly
- The SVG viewBox height accommodates this range (already sized at ~200px in Phase 3)

Clicking beyond this range is clamped to the nearest valid pitch by `yToPitch()`.

### Phase 8: Rest Support

Rests are note-like entries in the song array that have a `length` but no `pitch`. The notation SPEC defines them as `{ length: "1/4" }`. The editor currently has no way to insert rests — this phase adds rest insertion, rendering, and interaction handling.

#### Phase 8A: SongModel — Rest Insertion

**File:** `src/editor/model/SongModel.js`

Add two methods mirroring `insertNote` and `appendNote`:

```js
insertRest(length) // inserts { length } at cursor position
appendRest(length) // appends { length } at end, advances cursor
```

These create objects without a `pitch` property. No other changes to the constructor or serialization — `toSongArray()` and `fromSongArray()` already pass through arbitrary objects.

**Existing method behavior with rests:**

| Method | Behavior on rest entry |
|---|---|
| `removeNote(index)` | Works unchanged — splices by index |
| `setDuration(index, length)` | Works unchanged — sets `.length` on the entry |
| `toggleDot(index)` | Works unchanged — modifies `.length` |
| `transposeUp/Down(index)` | Must guard: skip if entry has no `.pitch`. Currently calls `parsePitch(note.pitch)` which throws on `undefined`. Add: `if (!note.pitch) return;` in `_transposeSingleNote`. |
| `setAccidental(index, acc)` | Must guard: skip if entry has no `.pitch`. Add the same check. |
| `makeChord(index, pitch, length)` | Must guard: skip if entry at `index` is a rest (no pitch to chord with). A rest cannot become part of a chord. |
| `moveCursor` / `advanceCursor` | Work unchanged — index-based |
| `_entryDuration(entry)` | Works unchanged — reads `.length` which rests have |

The three guards above are the only code changes needed in existing methods.

**Helper function:** Add a utility to detect rests:

```js
static isRest(entry) {
  if (Array.isArray(entry)) return false; // chord
  return !entry.pitch;
}
```

#### Phase 8B: NotationEditor — Rest Keyboard Input

**File:** `src/editor/ui/NotationEditor.js` (within `_handleKeyDown`)

Add keyboard shortcut:

| Key | Action |
|---|---|
| `r` | Insert a rest at the cursor position using the active palette duration |

**Behavior:**
1. Get the active duration from `this._palette.activeLength`
2. Call `this._songModel.insertRest(activeLength)` (or `appendRest` if cursor is at end)
3. Advance cursor past the new rest
4. Save and re-render

The `r` key doesn't conflict with existing shortcuts. It works regardless of polyphonic/monophonic mode — rests are valid in all entity types.

**Staff click behavior:** Clicking on the staff always places a pitched note (using `yToPitch` to determine the pitch). There is no "rest mode" that changes click behavior. Rests are inserted exclusively via the `r` key. This keeps the interaction model simple — click for pitch, keyboard for rest.

#### Phase 8C: NotationEditor — Rest Rendering

**File:** `src/editor/ui/NotationEditor.js` (within `_renderStaff`)

When iterating song entries for rendering, detect rests and render them differently from notes:

```js
for (const entry of song) {
  if (Array.isArray(entry)) {
    // chord rendering (existing)
  } else if (!entry.pitch) {
    // rest — render via createRest()
  } else {
    // single note — render via createNote()
  }
}
```

**Rest rendering details:**
- Import `createRest` from `notation/components/Rest.js`
- Call `createRest({ length: entry.length, x: cursorX })` — returns an SVG group positioned at the correct X
- Rest symbols are vertically centered on the staff (handled by `Rest.js` internally — whole rest hangs from line 2, half rest sits on line 3, quarter rest is a zigzag centered on the staff)
- No Y positioning needed from the editor — rests don't have pitch
- Rest spacing uses `getDurationInfo(entry.length).spacing`, same as notes

**Rest selection:**
- Rests are selectable like notes. They get `data-index` and the `.note-selected` class when selected.
- When a rest is selected:
  - Duration change (`number keys`) works — changes the rest's length
  - Dot toggle (`.`) works — toggles dotted duration on the rest
  - Transpose (`+`/`-`) does nothing (no pitch)
  - Accidental keys (`#`/`b`/`n`) do nothing (no pitch)
  - Shift-click (chord) does nothing (can't chord a rest)
  - Delete removes the rest
- The PropertyPanel (if visible) shows "Rest" instead of pitch info when a rest is selected

**Rest appearance:**
- Rests inherit `currentColor` from the staff container, same as notes
- Selected rests use the same `.note-selected` highlight
- No ledger lines for rests (they're always centered on the staff)

**Accidental memory:** Rests do not affect accidental memory. They don't reset it and they don't contribute to it. An accidental stated before a rest still carries to notes after the rest within the same measure.

#### Phase 8D: RhythmPalette — Rest Indicator

**File:** `src/editor/ui/RhythmPalette.js`

No changes to RhythmPalette itself — the active duration applies to both notes and rests. The `r` key shortcut is handled in NotationEditor, not the palette.

However, a small visual indicator is helpful: when the user hovers or focuses the staff and presses `r`, the palette's active duration determines the rest length. This is implicit (no separate "rest duration" control) and matches how pitched notes work (click uses the palette duration).

---

## Behaviors and Edge Cases

### Undo Semantics

Each individual note operation (add, delete, transpose, change duration, toggle dot, make chord) is a separate undo checkpoint. This matches the current behavior: `NotationEditor._saveSong()` calls `undoManager.updateEntity()` after every edit, and each `updateEntity` call is its own undo entry.

There is no grouping of the entire modal session into a single undo. If the user opens the modal, adds 5 notes, and closes it, pressing Ctrl+Z five times undoes each note individually. This is consistent with how all other entity edits (position, properties) work in the editor.

No "Cancel" button is needed because undo already provides that capability at fine granularity.

### Empty Song State

When the modal opens for an entity with no song data (common for newly placed entities):
- The staff renders empty: five staff lines, a clef (explicit override if set, otherwise treble by default — see Phase 7C), key signature (if non-C), time signature (if metered), no notes
- The cursor is at position 0 (left edge of the staff, after the staff header)
- The RhythmPalette defaults to quarter note
- Clicking the staff or pressing a number key places the first note

The NotationEditor already handles this case — `SongModel.fromSongArray([])` produces an empty model with `cursorPosition = 0`.

### Horizontal Overflow and Scrolling

The SVG width is computed dynamically from the note count and per-note spacing (`getDurationInfo(length).spacing`). For songs with many notes, the SVG will be wider than the modal body.

- The `.song-modal-body` has `overflow-x: auto`, producing a horizontal scrollbar when needed
- After each edit that changes cursor position (note insertion, deletion, arrow key navigation), the editor calls `staffEl.scrollIntoView` or equivalent to keep the cursor visible within the scrollable area
- The SVG `width` attribute is set to the computed content width (not `100%`), so it expands as notes are added
- The viewBox width matches the SVG width, maintaining a 1:1 coordinate-to-pixel ratio

### NotationEditor Container Sizing

The NotationEditor does not need to "know" its container width. The SVG is sized to its content (computed from note spacing), and the container scrolls. This is simpler and more correct than trying to fit a variable-length score into a fixed width.

The SVG `height` is fixed (based on the notation coordinate system — approximately 200px for a single staff with room for ledger lines and labels). Only width varies.

### Entity Deletion While Modal Is Open

If the entity being edited is deleted (via undo, or another action) while the modal is open:
- `NotationEditor._saveSong()` already checks `undoManager.getEntity(entityId)` and returns early if the entity is gone
- On the next save attempt (any edit), the save silently no-ops
- The modal does not auto-close — the user can close it manually, and no data is lost (it was already deleted externally)

A more aggressive approach (auto-close with a toast notification) can be added later but is not in scope.

### Focus Management

**On modal open:**
1. The backdrop is appended and the modal body is populated
2. The NotationEditor creates `staffEl` with `tabIndex = 0` (already in current code)
3. After rendering, the modal calls `staffEl.focus()` explicitly
4. This gives the staff keyboard focus so arrow keys, number keys, and other shortcuts work immediately

**On modal close:**
1. The NotationEditor is disposed
2. The backdrop is removed from the DOM
3. Focus returns to `document.getElementById('editor-viewport')` (or `document.body` as fallback)
4. This restores keyboard shortcuts to the main editor (Escape, Delete, Ctrl+Z, etc.)

**While modal is open:**
- The backdrop blocks pointer events to the viewport and sidebar
- `EditorApp._setupKeyboard()` checks `songEditorModal.isOpen` at the top and returns early, preventing global shortcuts from firing
- The modal handles its own Escape key in a `keydown` listener on the backdrop element

### Clef Selection and Auto-Inference

Clef is stored per-entity (`data.clef`) and editable via a dropdown in the modal header. Three options: Auto, Treble, Bass.

**When set to Auto:** The clef is re-inferred on every render via `inferClef()`. If the user adds or removes notes, the median pitch may cross the C4 threshold, causing the clef to switch. This is correct but can be visually jarring near the boundary.

**When explicitly set:** The clef is fixed regardless of note content. This is the expected workflow for intentionally writing in a specific range (e.g., a bass creature). The explicit clef persists in the entity data and survives modal close/reopen.

**Recommendation for users:** Set the clef explicitly before entering notes when writing for a specific range. Use Auto for songs where the range is uncertain or spans both clefs.

**Impact on key signature rendering:** Key signature accidental positions differ between treble and bass clef (see `KEY_SIG_POSITIONS` in `KeySignature.js`). Changing the clef re-renders the key signature at the correct positions for the new clef.

### Key Signature: Display vs Data

The key signature is a display and editing aid, not part of the note data. Notes always store their full pitch including accidentals (e.g., `"F#4"`, not `"F4"` with an implicit sharp from key). This means:
- Changing the puzzle's key signature does not alter any stored note pitches
- It only changes which accidental symbols are rendered on the staff
- The puzzle JSON always contains fully spelled pitches regardless of key
- Two puzzles with different key signatures but identical note arrays will sound the same; the staff will look different

### Time Signature and SongModel

SongModel already accepts `timeSignature` in its constructor (default `[4, 4]`). The modal passes the puzzle metadata's `timeSignature` when creating the SongModel. Changing the time signature in MetadataPanel takes effect the next time the modal is opened — the SongModel is recreated on each `open()` call.

When `timeSignature` is `null` (unmetered):
- SongModel skips measure calculations: `getMeasures()` returns one array containing all notes
- `getRemainingBeats()` returns `Infinity`
- `calculateBarlines()` returns an empty array
- No time signature symbol is rendered in the staff header
- No barlines are drawn

### Rest Interaction Boundaries

Rests participate in song editing but have restricted interactions:
- **Cannot be transposed** — `+`/`-` keys are no-ops when a rest is selected
- **Cannot have accidentals** — `#`/`b`/`n` keys are no-ops when a rest is selected
- **Cannot form chords** — shift-clicking while a rest is selected places a new note instead (same as monophonic mode behavior)
- **Can change duration** — number keys and `.` (dot toggle) work normally on rests
- **Can be deleted** — Delete/Backspace removes the rest

Rests do not affect clef inference (`inferClef` skips entries without `pitch`). Rests do not affect accidental memory — they neither contribute to nor reset the within-measure accidental state.

If an imported song already contains rests (from a puzzle JSON file), they render correctly even before this phase is implemented, as long as the rendering loop detects the absence of `pitch`. This is a defensive consideration — Phase 8C should be one of the first rendering additions tested.

### Context Menu Boundary Clamping

When right-clicking near the right or bottom edge of the viewport, the context menu could extend outside the visible area. The menu position is clamped:
```js
const menuX = Math.min(clickX, viewportWidth - menuWidth);
const menuY = Math.min(clickY, viewportHeight - menuHeight);
```
This is measured after the menu is added to the DOM (so its dimensions can be read), then repositioned if needed.

---

## TDD Test Plan

Tests follow the project testing philosophy: test behaviors through public APIs, mock only browser APIs (DOM via jsdom), never mock internal modules.

### Phase 1 Tests: RhythmPalette

**File:** `src/editor/ui/RhythmPalette.test.js` (new)

```
describe('RhythmPalette')

  describe('rendering')
    it('renders one button per supported duration')
    it('each button contains an SVG element with a note')
    it('note SVGs have visible note heads (not placeholder text)')
    it('whole note button shows an open (unfilled) note head')
    it('quarter note button shows a filled note head with stem')
    it('eighth note button shows a filled note head with stem and flag')

  describe('selection')
    it('defaults to quarter note as active duration')
    it('clicking a button sets it as the active duration')
    it('active button has the active CSS class')
    it('previously active button loses the active class on new selection')
    it('calls onDurationSelect callback with the selected length')

  describe('keyboard shortcuts')
    it('pressing key "2" selects whole note')
    it('pressing key "5" selects eighth note')
    it('pressing an unrecognized key returns null')
    it('returns the selected duration length string on valid key press')

  describe('activeLength property')
    it('setting activeLength updates the highlighted button')
    it('getting activeLength returns the current selection')
```

### Phase 2 Tests: StaffInteraction

**File:** `src/editor/ui/StaffInteraction.test.js` (existing — update)

The existing tests test `yToPitch`, `snapToStaffPosition`, `calculateBarlines`, and `createNoteFromClick`. The coordinate system changes, so Y values in the tests update to match the notation system.

```
describe('StaffInteraction')

  describe('yToPitch')
    it('resolves middle of staff (B4) to B4')
      -- B4 treble: pitchToStaffY('B4', 'treble') = 50
      -- Input y=50, expect 'B4'
    it('resolves top staff line (F5) to F5')
      -- F5: pitchToStaffY('F5', 'treble') = -10
      -- Input y=-10, expect 'F5'
    it('resolves bottom staff line (E4) to E4')
      -- E4: pitchToStaffY('E4', 'treble') = 90
      -- Input y=90, expect 'E4'
    it('snaps to nearest pitch when Y is between positions')
    it('clamps to valid range for extreme Y values')

  describe('pitchToY')
    it('returns the same value as pitchToStaffY for known pitches')
    it('matches the notation system coordinate space')

  describe('snapToStaffPosition')
    it('snaps to nearest diatonic position in notation coordinates')

  describe('calculateBarlines')
    -- These tests are unchanged (no coordinate dependency)
    it('places one barline after four quarter notes in 4/4')
    it('places barlines correctly for mixed durations')

  describe('createNoteFromClick')
    it('creates a note with correct pitch and length from staff click')
    it('integrates with SongModel correctly')
```

### Phase 3 Tests: NotationEditor Rendering

**File:** `src/editor/ui/NotationEditor.test.js` (new)

```
describe('NotationEditor')

  describe('staff rendering')
    it('renders staff lines using the notation Staff component')
      -- querySelector('.staff-lines') exists
    it('renders a clef-appropriate staff')

  describe('note rendering')
    it('renders notes using notation Note components')
      -- querySelectorAll('.note') matches song length
    it('renders note heads with correct fill for quarter notes (filled)')
    it('renders note heads with open fill for half notes')
    it('renders stems on stemmed notes')
    it('renders flags on eighth notes')
    it('spaces notes according to their duration')
      -- eighth notes closer together than quarter notes

  describe('chord rendering (polyphonic mode)')
    it('renders chords as a group with multiple note heads at the same x position')
    it('chord group has a single shared stem')
    it('chord note heads are vertically stacked by pitch')
    it('chord stem direction is determined by the note furthest from the middle line')

  describe('selection')
    it('highlights the selected note with the selected class')
    it('removes highlight from previously selected note')
    it('clicking a note selects it')

  describe('cursor')
    it('renders a cursor line at the current cursor position')
    it('cursor moves with arrow key navigation')

  describe('barlines')
    it('renders barlines at measure boundaries')

  describe('note interaction — polyphonic mode')
    it('clicking the staff creates a note at the clicked pitch')
    it('shift-clicking adds a pitch to the selected note as a chord')
    it('keyboard number keys insert notes with the palette duration')
    it('delete key removes the selected note')
    it('plus key transposes selected note up')
    it('minus key transposes selected note down')
    it('dot key toggles dotted duration on selected note')

  describe('note interaction — monophonic mode')
    it('clicking the staff creates a note at the clicked pitch')
    it('shift-clicking does not create a chord — places a new note instead')
    it('existing chord data from a song array still renders correctly')
      -- defensive: if a creature's data somehow contains chords, render them

  describe('data persistence')
    it('saving after edit updates the entity through UndoManager')
    it('loading populates the staff from entity song data')
```

### Phase 4 Tests: CSS/Visual Integration

No dedicated test file. Visual correctness is verified by:
- Phase 1 tests asserting SVG structure (note-head fill, stem presence, flag presence)
- Phase 3 tests asserting CSS classes are applied correctly
- Manual verification in the browser

### Phase 5 Tests: ContextMenu

**File:** `src/editor/ui/ContextMenu.test.js` (new)

```
describe('ContextMenu')

  describe('show and hide')
    it('appends a menu element to the container when show is called')
    it('positions the menu at the specified x/y coordinates')
    it('renders one button per menu item')
    it('hides the menu when hide is called')
    it('removes the menu DOM element on hide')
    it('replaces any existing menu when show is called again')

  describe('item actions')
    it('calls the item action callback when a menu item is clicked')
    it('hides the menu after an item is clicked')
    it('does not call action for disabled items')

  describe('dismissal')
    it('hides the menu when clicking outside it')
    it('hides the menu when Escape is pressed')

  describe('dispose')
    it('removes all DOM elements and event listeners')
```

### Phase 6 Tests: SongEditorModal

**File:** `src/editor/ui/SongEditorModal.test.js` (new)

```
describe('SongEditorModal')

  describe('opening')
    it('appends a backdrop element to the root container when opened')
    it('creates a NotationEditor inside the modal body')
    it('displays the entity type and position in the header')
    it('loads the entity song data into the editor')
    it('isOpen returns true while the modal is shown')
    it('focuses the notation staff element on open')

  describe('closing')
    it('removes the backdrop when the Done button is clicked')
    it('removes the backdrop when the close button is clicked')
    it('removes the backdrop when Escape is pressed')
    it('removes the backdrop when the backdrop itself is clicked')
    it('does not close when clicking inside the modal content')
    it('isOpen returns false after closing')
    it('disposes the NotationEditor on close')
    it('returns focus to the viewport on close')

  describe('empty song')
    it('opens with an empty staff when entity has no song data')
    it('allows placing the first note on an empty staff')

  describe('monophonic vs polyphonic mode')
    it('opens in monophonic mode for creature entities')
    it('opens in polyphonic mode for gate entities')
    it('opens in polyphonic mode for fountain entities')
    it('header shows "Creature Song" for creatures (visual mode indicator)')
    it('header shows "Gate Song" for gates')

  describe('data flow')
    it('song edits persist to the entity through UndoManager')
    it('opening the modal for a different entity loads that entity song')
    it('each note edit is a separate undo checkpoint')
    it('save is a no-op if the entity was deleted externally')

  describe('keyboard isolation')
    it('Escape closes the modal instead of deselecting entities')
    it('the notation editor inside the modal receives keyboard focus')

  describe('horizontal overflow')
    it('SVG width expands beyond the modal body for long songs')
    it('modal body is horizontally scrollable when content overflows')
```

### Phase 6 Tests: PropertyPanel "Edit Song" Button

**File:** `src/editor/ui/PropertyPanel.test.js` (existing — update)

```
  -- add to existing tests:
  it('renders an Edit Song button for creature entities')
  it('renders an Edit Song button for gate entities')
  it('renders an Edit Song button for fountain entities')
  it('does not render an Edit Song button for wall entities')
  it('does not render an Edit Song button for ramp entities')
  it('calls onEditSong callback with entity ID when Edit Song button is clicked')
```

### Integration Tests: End-to-End Wiring

**File:** `src/editor/ui/SongEditorIntegration.test.js` (new)

Tests the full flow through multiple components wired together. Uses real instances of UndoManager, PropertyPanel, ContextMenu, and SongEditorModal (no mocking of internal modules). DOM and Three.js are mocked per project convention.

```
describe('Song Editor Integration')

  describe('context menu to modal flow')
    it('right-click on creature entity shows context menu with Edit Song')
    it('clicking Edit Song opens the song editor modal for that entity')
    it('modal loads the correct song from the entity data')
    it('editing a note and closing the modal persists the change')
    it('re-opening the modal shows the persisted edit')

  describe('property panel to modal flow')
    it('selecting an entity shows Edit Song button in property panel')
    it('clicking the Edit Song button opens the modal for the selected entity')

  describe('undo across modal boundary')
    it('edits made inside the modal are individually undoable after closing')
    it('undoing after modal close reverts the last note edit, not the entire session')

  describe('entity type filtering')
    it('context menu shows Edit Song for creatures, gates, and fountains')
    it('context menu does not show Edit Song for walls and ramps')
    it('no context menu appears when right-clicking empty space')

  describe('monophonic/polyphonic mode through the stack')
    it('opening modal for a creature creates NotationEditor in monophonic mode')
    it('opening modal for a gate creates NotationEditor in polyphonic mode')
    it('shift-clicking in a creature modal places a new note, not a chord')
    it('shift-clicking in a gate modal adds a chord pitch to the selected note')
```

### Phase 7A Tests: Puzzle Metadata

**File:** `src/editor/model/EditorPuzzleModel.test.js` (existing — update)

```
describe('EditorPuzzleModel')

  describe('metadata defaults')
    it('defaults keySignature to C')
    it('defaults timeSignature to [4, 4]')

  describe('metadata updates')
    it('setMetadata updates keySignature')
    it('setMetadata updates timeSignature')
    it('setMetadata allows null timeSignature for unmetered')
```

### Phase 7B Tests: SongModel Accidental Editing

**File:** `src/editor/model/SongModel.test.js` (existing — update)

```
describe('SongModel')

  describe('setAccidental')
    it('adds sharp to a natural note')
    it('adds flat to a natural note')
    it('removes accidental from a sharp note')
    it('removes accidental from a flat note')
    it('replaces sharp with flat')
    it('replaces flat with sharp')
    it('no-ops on out-of-range index')
    it('applies accidental to all notes in a chord')
    it('preserves octave number when changing accidental')
    it('does not normalize flats to sharps (preserves spelling)')
```

### Phase 7C Tests: Clef Selection

**File:** `src/editor/ui/NotationEditor.test.js` (update Phase 3 test file)

```
describe('NotationEditor')

  describe('clef resolution')
    it('uses explicit clef override when provided')
    it('auto-infers treble clef for high-range notes when clef is null')
    it('auto-infers bass clef for low-range notes when clef is null')
    it('defaults to treble clef for empty songs when clef is null')
    it('explicit bass clef renders correctly even with high-range notes')
    it('changing clef re-renders all note Y positions')
```

**File:** `src/editor/ui/SongEditorModal.test.js` (update)

```
describe('SongEditorModal')

  describe('clef selector')
    it('renders a clef dropdown in the modal header')
    it('dropdown shows Auto, Treble, Bass options')
    it('defaults to Auto when entity has no data.clef')
    it('defaults to the stored clef when entity has data.clef')
    it('selecting Treble persists clef to entity data')
    it('selecting Bass persists clef to entity data')
    it('selecting Auto removes clef from entity data')
    it('clef change is undoable')
```

### Phase 7D Tests: Staff Header

**File:** `src/editor/ui/NotationEditor.test.js` (update Phase 3 test file)

```
describe('NotationEditor')

  describe('staff header')
    it('renders a clef symbol at the start of the staff')
    it('renders treble clef when resolved clef is treble')
    it('renders bass clef when resolved clef is bass')
    it('renders key signature after the clef for non-C keys')
    it('does not render key signature for key of C')
    it('renders the correct number of sharps for key of G (1 sharp)')
    it('renders the correct number of flats for key of Bb (2 flats)')
    it('key signature positions match the current clef')
    it('renders time signature after the key signature')
    it('does not render time signature when timeSignature is null')
    it('note rendering starts after the full staff header width')
```

### Phase 7E Tests: Accidental Display and Measure Memory

**File:** `src/editor/ui/AccidentalDisplay.test.js` (new — tests `resolveAccidentalDisplay` pure function)

```
describe('resolveAccidentalDisplay')

  describe('key signature baseline')
    it('does not display accidental on F#4 when key is G')
    it('displays natural on F4 when key is G')
    it('displays sharp on C#4 when key is C')
    it('displays flat on Bb4 when key is C')
    it('does not display accidental on Bb4 when key is Bb')

  describe('within-measure memory')
    it('first F# in G major: no display (matches key)')
    it('second F# in same measure: no display (still matches key)')
    it('F-natural after F# in G major: displays natural')
    it('second F-natural in same measure: no display (inherits from memory)')
    it('F# after F-natural in same measure: displays sharp (contradicts memory)')
    it('C# then C-natural in C major: sharp then natural')

  describe('barline reset')
    it('resets accidental state at barline')
    it('after barline, key signature defaults re-apply')
    it('F-natural before barline does not carry to F after barline in G major')

  describe('unmetered mode')
    it('resets accidental state after every note')
    it('F-natural shown on every occurrence in G major (no carry)')

  describe('chords')
    it('evaluates each chord note independently against the map')
    it('chord notes update the map after rendering')
```

**File:** `src/editor/ui/NotationEditor.test.js` (update)

```
describe('NotationEditor')

  describe('accidental rendering')
    it('positions accidental to the left of the note head')
    it('renders accidentals correctly for a multi-note measure')
    it('resets accidentals after barlines in metered mode')
    it('displays accidentals on chord notes that differ from active state')
```

### Phase 7F Tests: Accidental Keyboard Input

**File:** `src/editor/ui/NotationEditor.test.js` (update)

```
describe('NotationEditor')

  describe('accidental keyboard input')
    it('pressing # adds sharp to selected note')
    it('pressing b adds flat to selected note')
    it('pressing n removes accidental from selected note')
    it('accidental keys do nothing when no note is selected')
    it('accidental change persists through UndoManager')
    it('accidental change re-renders the staff')
```

### Phase 7G Tests: Ledger Lines

**File:** `src/editor/ui/NotationEditor.test.js` (update)

```
describe('NotationEditor')

  describe('ledger lines')
    it('renders ledger lines for notes above the staff')
    it('renders ledger lines for notes below the staff')
    it('does not render ledger lines for notes within the staff')
    it('renders ledger lines for each chord note outside the staff')
```

### Phase 8A Tests: SongModel Rest Methods

**File:** `src/editor/model/SongModel.test.js` (existing — update)

```
describe('SongModel')

  describe('insertRest')
    it('inserts a rest object without a pitch property at cursor position')
    it('rest has the specified length')
    it('cursor stays at the inserted position')

  describe('appendRest')
    it('appends a rest at the end of the notes array')
    it('advances the cursor past the rest')

  describe('rest guards on existing methods')
    it('transposeUp no-ops on a rest entry')
    it('transposeDown no-ops on a rest entry')
    it('setAccidental no-ops on a rest entry')
    it('makeChord no-ops when target index is a rest')
    it('setDuration works on a rest entry')
    it('toggleDot works on a rest entry')
    it('removeNote works on a rest entry')

  describe('isRest')
    it('returns true for a rest object')
    it('returns false for a pitched note')
    it('returns false for a chord array')
```

### Phase 8B–C Tests: NotationEditor Rest Input and Rendering

**File:** `src/editor/ui/NotationEditor.test.js` (update)

```
describe('NotationEditor')

  describe('rest input')
    it('pressing r inserts a rest at the cursor position')
    it('inserted rest uses the active palette duration')
    it('cursor advances past the inserted rest')
    it('rest insertion is saved through UndoManager')

  describe('rest rendering')
    it('renders rest entries using the Rest notation component')
    it('rest SVG group has the rest CSS class')
    it('rest is horizontally spaced like a note of the same duration')
    it('rest is vertically centered on the staff (no pitch-based Y)')

  describe('rest selection')
    it('clicking a rest selects it')
    it('selected rest shows the selection highlight')
    it('duration change works on a selected rest')
    it('dot toggle works on a selected rest')
    it('transpose keys do nothing on a selected rest')
    it('accidental keys do nothing on a selected rest')
    it('delete removes the selected rest')
    it('shift-click on a rest places a new note instead of chording')

  describe('rest and accidental memory')
    it('rests do not reset accidental memory within a measure')
    it('accidental before a rest carries to the note after the rest')
```

### Integration Tests: Musical Context

**File:** `src/editor/ui/SongEditorIntegration.test.js` (update)

```
describe('Song Editor Integration')

  describe('musical context')
    it('modal displays the key signature from puzzle metadata')
    it('modal displays the time signature from puzzle metadata')
    it('changing key signature in metadata then opening modal shows updated key')
    it('auto clef updates when added notes shift the median pitch below C4')
    it('explicit clef override persists across modal close and reopen')
    it('setting clef to bass then entering high notes keeps bass clef')
    it('accidental keyboard shortcuts work inside the modal')
    it('key-signature-aware rendering hides accidentals implied by the key')
    it('accidental memory carries within a measure')
    it('accidentals reset at barlines')
    it('unmetered mode (null time signature) renders no barlines')
    it('unmetered mode resets accidentals after every note')

  describe('rest support')
    it('pressing r in the modal inserts a rest into the entity song')
    it('rest renders as a rest symbol, not a note')
    it('rest is preserved across modal close and reopen')
    it('undo reverses rest insertion')
```

---

## Implementation Order

Implement using TDD (Red-Green-Refactor) in this order. Phases 5–6 (modal/context menu) are implemented first because they change *where* the NotationEditor lives, establishing the new container before improving *what* it renders. Phases 7A–7B establish musical context data before Phase 3 consumes it for rendering. Phases 7C–7G are implemented as part of Phase 3.

1. **Phase 5: ContextMenu tests + implementation**
   - Write `ContextMenu.test.js` (all tests red)
   - Implement ContextMenu class (tests green)
   - Wire into EditorApp: `contextmenu` listener, raycast, entity-type menu items
   - Include boundary clamping for menus near viewport edges

2. **Phase 6: SongEditorModal tests + implementation**
   - Write `SongEditorModal.test.js` (all tests red)
   - Implement SongEditorModal class (tests green)
   - Update PropertyPanel: replace inline NotationEditor with "Edit Song..." button
   - Update PropertyPanel.test.js with new assertions
   - Wire into EditorApp: create modal, connect to ContextMenu "Edit Song" action and PropertyPanel button
   - Add keyboard isolation (modal Escape vs editor Escape)

3. **Phase 1: RhythmPalette tests + implementation**
   - Write `RhythmPalette.test.js` (all tests red)
   - Implement SVG note icon rendering (tests green)
   - Refactor: clean up DURATIONS array, remove Unicode labels

4. **Phase 2: StaffInteraction tests + implementation**
   - Update existing `StaffInteraction.test.js` with new coordinate expectations (tests red)
   - Rewire to use `notation/lib/notePositions.js` (tests green)
   - Refactor: remove hard-coded pitch table and custom Y math

5. **Phase 7A: Puzzle metadata tests + implementation**
   - Update `EditorPuzzleModel.test.js` with keySignature/timeSignature tests (tests red)
   - Add `keySignature` and `timeSignature` to `DEFAULT_METADATA` (tests green)
   - Update MetadataPanel with key signature dropdown and time signature controls
   - Update serialization (import/export) to handle new fields

6. **Phase 7B + 8A: SongModel additions (accidentals + rests)**
   - Update `SongModel.test.js` with `setAccidental` and rest method tests (tests red)
   - Implement `setAccidental(index, accidental)` method (tests green)
   - Implement `insertRest(length)`, `appendRest(length)`, `isRest()` (tests green)
   - Add rest guards to `transposeUp/Down`, `setAccidental`, `makeChord` (tests green)

7. **Phase 3 + 7C–7G + 8B–C: NotationEditor tests + implementation**
   - Write `NotationEditor.test.js` including staff header, accidental display, accidental input, ledger lines, and rest tests (tests red)
   - Write `AccidentalDisplay.test.js` for `resolveAccidentalDisplay` (tests red)
   - Replace manual rendering with notation components (tests green):
     - Staff lines via `createStaffLines()`
     - Notes via `createNote()` with correct clef
     - Rests via `createRest()` for entries without pitch
     - Chords via manual svgHelpers composition
     - Staff header: clef (with selector) → key signature → time signature
     - Key-signature-aware accidental rendering with measure memory
     - Ledger lines via `createLedgerLines()`
     - Keyboard shortcuts: accidentals (`#`, `b`, `n`), rests (`r`)
   - Refactor: delete `_pitchToSimpleY`, clean up `_renderStaff`

8. **Phase 4: CSS alignment**
   - Update `editor.css` with notation component styles, modal/context menu styles, and rest/accidental/ledger line styles
   - Verify all tests still pass
   - Manual browser verification

9. **Integration tests**
   - Write `SongEditorIntegration.test.js` covering end-to-end flows including musical context and rests
   - Verify all integration scenarios pass

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Notation system coordinate space differs from editor's current space | Phase 2 explicitly handles the coordinate migration. StaffInteraction tests lock down the new mapping before NotationEditor changes. |
| `createNote()` output structure changes in the future | Tests assert on stable CSS classes (`note-head`, `note-stem`, `note-flag`) that are part of the notation system's documented API. |
| `2/1` and `1/64` durations removed from palette | These aren't in `VALID_LENGTHS` or used in any puzzle JSON. Removal is safe. Can be added later with a small `durationSymbols.js` change. |
| SVG viewBox change affects click coordinate mapping | Phase 2 tests verify `createNoteFromClick` produces correct pitches. Phase 3 tests verify click interaction end-to-end. |
| Right-click conflicts with OrbitControls panning | Raycast first: only show context menu when an entity is hit. Otherwise let OrbitControls handle the event normally. Disable OrbitControls while menu is open. |
| Modal keyboard events leak to EditorApp | EditorApp global keyboard handler checks `songEditorModal.isOpen` and skips its own processing. Modal handles its own Escape. |
| PropertyPanel "Edit Song" button changes break existing tests | Existing PropertyPanel tests are logic-only (no DOM assertions on the song editor). The new button tests are additive. |
| Entity deleted while modal is open | Save no-ops when entity is missing. Modal stays open but is inert. User can close manually. |
| Focus lost after modal close | Modal explicitly returns focus to `#editor-viewport` on close. Tested in Phase 6 tests. |
| Long songs overflow modal width | SVG width is content-driven, modal body scrolls horizontally. Tested in Phase 6 overflow tests. |
| Auto clef switches during editing cause visual jarring | Users can set an explicit clef override to prevent switching. Auto mode documented as best for uncertain ranges. |
| SongModel normalizes flats to sharps during transposition | `setAccidental` preserves user spelling. Transposition is documented to use sharps. Users respell via accidental keys afterward. |
| Accidental memory adds rendering complexity | Extracted into pure `resolveAccidentalDisplay` function with dedicated unit tests. Algorithm is well-defined with clear examples in spec. |
| Chord rendering duplicates NotationRenderer logic | Acknowledged duplication. Extracting a `createChord()` component from `src/notation/` is a follow-up task outside this spec (would require modifying the notation system's public API). |
| Context menu appears offscreen near viewport edges | Menu position clamped to viewport bounds after DOM insertion. |
| Adding keySignature/timeSignature to metadata changes serialization format | New fields are optional in puzzle JSON; import falls back to `'C'` and `[4, 4]`. Full backward compatibility with existing puzzle files. |
| `inferClef` returns `'percussion'` for empty songs | `_resolveClef()` defaults to `'treble'` for empty songs when no explicit clef is set. Explicit clef override bypasses inference entirely. |
| Per-entity clef adds a new field to entity data | `data.clef` is optional; absent means auto-inference. Backward compatible — existing entities without `clef` work unchanged. |
| Existing SongModel methods throw on rest entries | Three methods need guards (`_transposeSingleNote`, `setAccidental`, `makeChord`). Each adds a single `if (!note.pitch) return;` check. Covered by dedicated tests. |
| Imported puzzles may already contain rests | Rest rendering (Phase 8C) handles this — any entry without `pitch` renders as a rest. If implemented before Phase 8A/B, rests display correctly but can't be inserted from the editor. |

---

*Spec Version: 1.6*
*Created: 2026-01-30*
*Updated: 2026-01-30 — v1.1: Added Phase 5 (ContextMenu) and Phase 6 (SongEditorModal). v1.2: Edge cases (undo semantics, empty song, overflow, entity deletion, focus management, gate data format, integration tests). v1.3: Monophonic/polyphonic mode (creature vs gate/fountain), chord rendering, mode-aware tests. v1.4: Musical context — Phase 7 (clefs, key signatures, time signatures, accidentals, ledger lines), metadata additions, accidental editing in SongModel, key-signature-aware display, context menu boundary clamping, chord rendering duplication risk. v1.5: Within-measure accidental memory (metered and unmetered modes), editable per-entity clef with auto-inference fallback, clef selector UI in modal header, resolveAccidentalDisplay pure function, dedicated accidental display tests. v1.6: Rest support — Phase 8 (SongModel rest methods, rest keyboard input, rest rendering, rest interaction guards, accidental memory across rests).*
