# Puzzle Editor - High-Level Spec

## Purpose

A visual 3D tool for creating and editing Resound puzzle JSON files. Replaces manual JSON editing with an interactive Three.js viewport that lets you build multi-elevation puzzles, place and configure entities, compose songs, and export valid puzzle JSON.

## Testing Approach

**Every phase is test-driven.** Tests are written before implementation, following the project's existing integration testing philosophy (see `TESTING.md`):

- Test behaviors through public APIs, not implementation details
- Mock only browser APIs (Three.js, Web Audio, DOM)
- Never mock internal modules
- One behavior per `it()` block

Phases are ordered so that pure-logic modules come first (highly testable, no browser APIs), building toward rendering and interaction layers (tested through their public APIs, with manual visual verification where needed).

## Phase Dependency Map

```
Phase 1A  EditorPuzzleModel (no deps)
Phase 1B  Serialization (depends on 1A)
Phase 1C  Validation (depends on 1A)
Phase 1D  Undo/Redo (depends on 1A)
Phase 2   Viewport Foundation (depends on 1A -- reads gridSize from model)
Phase 3   Elevation & Floors (depends on 1A, 2)
Phase 4   Entity Placement & Selection (depends on 1A, 2, 3)
Phase 5   Property Panels & Configuration (depends on 1A, 4)
Phase 6A  SongModel (depends on 1A only -- pure logic, can start in parallel with Phases 2-5)
Phase 6B  Interactive Staff UI (depends on 5, 6A)
Phase 7A  Export (depends on 1B, 1C, 5)
Phase 7B  Import (depends on 1B, 2, 3, 4, 5)
Phase 7C  Validation Display (depends on 1C, 4)
Phase 7D  Session Persistence (depends on 1B)
```

---

## Phase 1A: EditorPuzzleModel

> **Summary:** The central data model. Every other phase reads or mutates this.
> **Dependencies:** None.
> **Delivers:** `src/editor/model/EditorPuzzleModel.js` + `EditorPuzzleModel.test.js`

An in-memory representation of a puzzle being edited. All editor operations go through this model.

**State:**
- Puzzle metadata (id, name, difficulty, tempo, gridSize, clapDisplacement)
- Player spawn position (x, y, z)
- Floor regions array (elevation, x1, z1, x2, z2)
- Entities array (type, position, type-specific data)

**Methods:**
- `setMetadata(fields)` -- update top-level puzzle fields
- `setPlayerSpawn(x, y, z)` -- set or move spawn point
- `addFloor(elevation, x1, z1, x2, z2)` / `removeFloor(index)` -- manage floor regions
- `addEntity(type, x, y, z, data)` -- place an entity; returns its id
- `updateEntity(id, changes)` -- modify entity properties
- `removeEntity(id)` -- delete an entity
- `getEntitiesAt(x, y, z)` -- query entities at a grid cell
- `getFloorElevation(x, z)` -- resolve effective elevation at a cell (highest-wins overlap rule)

**Tests (write first):**
- Adding an entity stores it with correct position and type
- Removing an entity by id removes only that entity
- `getEntitiesAt` returns entities matching the cell and elevation
- `getFloorElevation` returns 0 for cells with no floor regions
- `getFloorElevation` returns highest elevation when floor regions overlap
- `setPlayerSpawn` replaces previous spawn (only one allowed)
- `addFloor` / `removeFloor` correctly manages the floors array
- Metadata updates merge with existing values

---

## Phase 1B: Serialization

> **Summary:** Convert between EditorPuzzleModel and puzzle JSON.
> **Dependencies:** Phase 1A.
> **Delivers:** `src/editor/model/serialization.js` + `serialization.test.js`

**Functions:**
- `serializePuzzle(model)` -- EditorPuzzleModel to JSON object (conforming to `puzzles/schema.md`)
- `deserializePuzzle(json)` -- JSON object to EditorPuzzleModel

**Tests (write first):**
- Round-trip: serialize then deserialize produces equivalent model
- Serialization outputs correct structure (playerStart, floors, entities array)
- Entity types serialize their type-specific fields correctly:
  - Creature: song in `data.song`, interval/audibleRange/clapDisplacement in `data`
  - Gate/Fountain: song at entity root as `song`
  - Ramp: direction at entity root
  - Wall: position only
- Deserialization of `elevation-demo.json` produces correct model state
- Deserialization of a pre-elevation puzzle (no floors, all y=0) works correctly
- Missing optional fields (clapDisplacement, floors) get sensible defaults

---

## Phase 1C: PuzzleValidator

> **Summary:** Validate an EditorPuzzleModel, returning errors and warnings.
> **Dependencies:** Phase 1A.
> **Delivers:** `src/editor/model/PuzzleValidator.js` + `PuzzleValidator.test.js`

**Function:** `validatePuzzle(model)` returns `{ errors: [], warnings: [] }`

**Errors (block export):**
- No player spawn defined
- Entity placed outside grid bounds (x or z < 0 or >= gridSize)
- Entity elevation doesn't match any floor region or base floor
- Creature/gate/fountain missing a song
- Song contains invalid pitch or length values
- Duplicate entity at same grid cell and elevation (two non-wall entities)

**Warnings (allow export, flag for review):**
- No fountain defined (no win condition)
- Gate with no walls adjacent (gate serves no purpose)
- Creature audibleRange doesn't reach any gate/fountain
- Ramp with no floor region at its upper elevation (leads nowhere)
- Ramp with no floor region at its lower elevation (starts nowhere)
- Floor region with no ramp connecting it from below (island)
- Unreachable areas (player can't path to an entity given elevation constraints)

**Tests (write first):** One test per rule above, plus:
- Valid puzzle returns zero errors and zero warnings
- Multiple errors on the same puzzle all reported
- Warnings don't appear in errors array and vice versa

---

## Phase 1D: Undo/Redo History

> **Summary:** Wrap the model so every mutation is undoable.
> **Dependencies:** Phase 1A.
> **Delivers:** `src/editor/model/UndoManager.js` + `UndoManager.test.js`

Every mutating operation on the model is undoable. The history system wraps the model so that all phases (entity placement, property edits, floor changes, song edits -- everything) get undo/redo for free.

**Keybindings:** Cmd+Z (undo), Cmd+Shift+Z (redo). The keybinding wiring happens in the UI layer (Phase 2+), but UndoManager exposes `undo()` and `redo()` methods that the UI calls.

**Behavior:**
- Every mutation pushes the previous state onto the undo stack
- `undo()` restores the previous state and pushes current state onto the redo stack
- `redo()` restores the next state and pushes current state back onto the undo stack
- Making any new change after undoing clears the redo stack (standard behavior -- no branching history)
- Undo stack is unbounded (can undo back to the initial empty state)

**Tests (write first):**
- After one mutation, undo restores the previous state
- After undo, redo restores the mutated state
- After undo then a new mutation, redo stack is empty (redo is no longer available)
- Multiple undos walk backward through the full history in order
- Multiple redos walk forward through the full history in order
- Undo on a fresh model with no history is a no-op
- Redo with nothing to redo is a no-op
- All model mutation methods participate in undo: `addEntity`, `removeEntity`, `updateEntity`, `setPlayerSpawn`, `addFloor`, `removeFloor`, `setMetadata`

---

## Phase 2: Viewport Foundation

> **Summary:** HTML shell, Three.js scene, camera, grid floor, and cell hover. First visual output.
> **Dependencies:** Phase 1A (reads `gridSize` from model).
> **Delivers:** `editor.html`, `src/editor/EditorApp.js`, `src/editor/viewport/EditorScene.js`, `src/editor/viewport/gridUtils.js` + `gridUtils.test.js`

After this phase you can see an empty grid floor and orbit around it. Cmd+Z / Cmd+Shift+Z are wired to `UndoManager.undo()` / `redo()` (if Phase 1D is complete; otherwise wiring is deferred).

### 2A. Vite Entry Point

A separate HTML entry point (`editor.html`) served by the Vite dev server at `/editor`. Shares source code with the game (constants, entity classes) but has its own UI shell.

**Layout:** Full-width Three.js canvas with an HTML sidebar (initially empty, populated in later phases).

*No automated tests -- manual verification only.*

### 2B. Scene & Camera

- Three.js scene with ambient + directional light
- OrbitControls: rotate (left drag), pan (right drag / middle drag), zoom (scroll)
- Camera starts at an isometric-ish angle looking at grid center
- Ground plane with grid lines (gridSize x gridSize cells, `WORLD_SCALE = 3` units per cell)
- Axis indicator or compass for orientation

*No automated tests -- manual verification only.*

### 2C. Grid Cell Hover

Raycasting from mouse position to the ground plane, snapping to the nearest grid cell.

- Highlight mesh (flat square) appears at the hovered cell
- Highlight is elevation-aware: snaps to the active elevation's floor height (Phase 3 plugs in the elevation selector; for now, always elevation 0)

**Tests (write first):** These test `gridUtils.js`, a pure-logic module:
- `snapToGrid(worldX, worldZ)` -- given world coordinates, return grid coordinates (integer x, z)
- `gridToWorld(gridX, gridZ)` -- given grid coordinates, return world center (snapped to cell center)
- Snap correctly rounds for all quadrants (positive/negative edge cases near 0 and gridSize)
- Out-of-bounds coordinates clamp to grid edges

---

## Phase 3: Elevation & Floors

> **Summary:** Floor region editing, raised platform rendering, and the active elevation selector.
> **Dependencies:** Phases 1A, 2.
> **Delivers:** `src/editor/ui/ElevationSelector.js`, `src/editor/ui/FloorRegionPanel.js`, `src/editor/viewport/FloorRenderer.js`

After this phase, you can define elevated floor regions and see them render as raised platforms. The active elevation selector controls which level you're editing.

### 3A. Active Elevation Selector

HTML control in the sidebar: a number stepper (0, 1, 2, ...) setting the active elevation for placement.

- Grid hover highlight renders at the active elevation's height
- Display shows current level prominently

*No automated tests -- UI control that writes a value the viewport reads.*

### 3B. Floor Region Editing

UI for adding and managing floor regions:

- "Add Floor Region" mode: click two corners on the grid to define a rectangle at the active elevation
- Floor region list in the sidebar showing all regions (elevation, bounds)
- Click a region in the list to highlight it in the viewport; delete button to remove
- Calls `model.addFloor()` / `model.removeFloor()` on the data model (model logic already tested in Phase 1A)

*No new automated tests -- model mutation is tested in Phase 1A. Two-corner click interaction is manual verification.*

### 3C. Floor Rendering

- Each floor region renders as a horizontal plane at `elevation * ELEVATION_HEIGHT`
- Base floor (elevation 0) always rendered for the full grid
- Elevated floors use a slightly different color/material per elevation level
- Inactive elevations can be dimmed (reduced opacity) when the active elevation selector is set

*No automated tests -- rendering is manual verification.*

---

## Phase 4: Entity Placement & Selection

> **Summary:** Toolbar, click-to-place entities in the 3D viewport, selection via raycasting, deletion, wall painting.
> **Dependencies:** Phases 1A, 2, 3.
> **Delivers:** `src/editor/ui/EntityToolbar.js`, `src/editor/viewport/EntityPlacer.js`, `src/editor/viewport/SelectionManager.js` + `EntityPlacer.test.js`

After this phase, you can place entities on the grid, select them, and delete them.

### 4A. Entity Toolbar

An HTML toolbar (sidebar or top bar) with buttons for each entity type: Player, Creature, Gate, Fountain, Wall, Ramp.

- Selecting a tool enters "placement mode" for that type
- Active tool is visually highlighted
- ESC or right-click cancels placement mode

*No automated tests -- UI state toggling, manual verification.*

### 4B. Placement

- In placement mode, clicking a highlighted grid cell adds an entity at that position and the active elevation
- Entity appears as a Three.js mesh matching the game's visuals:
  - Player spawn: distinct marker (e.g. arrow or flag)
  - Creature: sphere (0xffaa00)
  - Gate: tall box (0x4488ff)
  - Fountain: cylinder (0x44ddff)
  - Wall: gray cube (0x808080)
  - Ramp: green wedge (0x88ff88), oriented by direction
- Placing a player spawn removes any previous spawn (exactly one)
- Placement calls `model.addEntity()` on the data model

**Tests (write first):**
- Placing an entity adds it to the model at the correct grid position and elevation
- Placing a player spawn replaces the previous one
- Entity meshes are created with correct position (`gridX * WORLD_SCALE`, `elevation * ELEVATION_HEIGHT`, `gridZ * WORLD_SCALE`)

### 4C. Selection & Deletion

- Click an entity mesh (raycasting) to select it -- selection highlight (outline or color shift)
- Selected entity's property panel opens in sidebar (Phase 5 populates the panel; for now, show type and position)
- Delete key or delete button removes the selected entity via `model.removeEntity()`
- Click empty grid to deselect

**Tests (write first):**
- Raycasting hit test: given a mesh list and a ray, return the closest hit entity id
- Removing a selected entity removes it from the model

### 4D. Wall Painting

- In Wall placement mode, click-and-drag paints walls across cells
- Shift+click-and-drag erases walls across cells
- Walls at the active elevation only

**Tests (write first):**
- Wall painting across N cells adds N wall entities to the model

---

## Phase 5: Property Panels & Configuration

> **Summary:** Sidebar panels for editing entity properties, puzzle metadata, and entity dragging.
> **Dependencies:** Phases 1A, 4.
> **Delivers:** `src/editor/ui/PropertyPanel.js`, `src/editor/ui/MetadataPanel.js`, `src/editor/viewport/EntityDragger.js`

After this phase, you can configure entities after placing them and edit puzzle metadata. The editor is functionally complete for non-song entities.

### 5A. Property Panel

HTML sidebar panel that appears when an entity is selected. Fields depend on entity type:

| Entity   | Editable Fields                                              |
|----------|--------------------------------------------------------------|
| Player   | Position (x, y, z) -- read-only display, move by dragging   |
| Creature | interval, audibleRange, clapDisplacement, size, song (Phase 6B) |
| Gate     | Song (Phase 6B)                                              |
| Fountain | Song (Phase 6B)                                              |
| Wall     | Position -- read-only display                                |
| Ramp     | Direction picker (north/south/east/west)                     |

- Changing a property calls `model.updateEntity()` and re-renders the mesh
- Ramp direction change rotates the wedge mesh and updates the direction arrow overlay
- Song fields are placeholder until Phase 6B (show raw JSON or "Edit Song" stub button)

**Tests (write first):**
- Updating entity properties through the model persists the changes
- Ramp direction change updates `model.updateEntity()` with new direction

### 5B. Puzzle Metadata Panel

Always-visible section in the sidebar (above or below property panel):

- `id` (text input, auto-generated default)
- `name` (text input)
- `difficulty` (1-3 radio or dropdown)
- `tempo` (number input, BPM)
- `gridSize` (number input -- changing this resizes the grid floor; warn if entities are outside new bounds)
- `clapDisplacement` (optional text input, e.g. "1/8")

**Tests (write first):**
- Metadata changes update the model

### 5C. Entity Dragging

- Selected entities can be drag-moved across the grid (within the same elevation)
- Dragging updates the model position and mesh position in real time
- To move an entity to a different elevation: change the active elevation, then drag or re-place

*No automated tests -- drag interaction is manual verification. Model updates are covered by Phase 1A tests.*

---

## Phase 6A: SongModel

> **Summary:** Pure-logic layer for measure-aware song editing. No UI, no browser dependencies.
> **Dependencies:** Phase 1A only. **Can be worked in parallel with Phases 2-5.**
> **Delivers:** `src/editor/model/SongModel.js` + `SongModel.test.js`

The puzzle JSON stores songs as flat note arrays with no measure boundaries. SongModel adds measure awareness as an editing aid: it tracks cumulative durations against a time signature to know when a measure is full. On export, measures flatten back to the plain note array.

**State:**
- Notes array (each entry is a note `{ pitch, length }` or a chord `[{ pitch, length }, ...]`)
- Time signature (default 4/4; configurable per-song)
- Cursor position (index into notes array, or an insertion point after the last note)
- Selected note index (null if cursor is at an insertion point)

**Methods:**
- `insertNote(pitch, length)` -- insert a note before the cursor/selection; shifts subsequent notes forward
- `appendNote(pitch, length)` -- append a note at the end (when cursor is at an insertion point)
- `removeNote(index)` -- remove note/chord at index
- `makeChord(index, pitch, length)` -- add a pitch to an existing beat position, creating a chord
- `transposeUp(index)` -- raise pitch by one half step (adding accidentals as needed)
- `transposeDown(index)` -- lower pitch by one half step
- `setDuration(index, length)` -- change a note's rhythmic value
- `toggleDot(index)` -- add or remove a dot (multiply/divide duration by 1.5)
- `moveCursor(direction)` -- move cursor left/right through the note sequence
- `advanceCursor()` -- move cursor forward; if at end of full measure, advance to next measure's start
- `getMeasures()` -- returns notes grouped into measures based on time signature
- `getRemainingBeats()` -- how many beats are left in the current measure
- `toSongArray()` -- flatten to the puzzle JSON note array format
- `fromSongArray(notes)` -- populate from a puzzle JSON note array

**Tests (write first):**

*Insertion & removal:*
- `insertNote` at index 0 pushes existing notes forward
- `insertNote` in the middle of a song places the note correctly
- `appendNote` adds to the end
- `removeNote` removes the entry and shifts remaining notes

*Chords:*
- `makeChord` converts a single note into a chord array with both pitches
- `makeChord` on an existing chord adds another pitch

*Transposition:*
- `transposeUp` from C4 yields C#4
- `transposeUp` from E4 yields F4 (no accidental needed)
- `transposeUp` from B4 yields C5 (octave crossing)
- `transposeDown` from C4 yields B3 (octave crossing)
- `transposeDown` from Db4 yields C4

*Duration:*
- `toggleDot` on a quarter note (1/4) produces a dotted quarter (3/8)
- `toggleDot` on a dotted quarter removes the dot (back to 1/4)

*Measures:*
- `getMeasures` in 4/4: four quarter notes fill one measure exactly
- `getMeasures` in 4/4: five quarter notes produce two measures (4 + 1)
- `getRemainingBeats` returns correct value mid-measure
- `advanceCursor` past the last note in a full measure moves to the next measure

*Serialization:*
- Round-trip: `fromSongArray` then `toSongArray` produces equivalent array

---

## Phase 6B: Interactive Staff UI

> **Summary:** The notation editor UI -- rhythm palette, interactive SVG staff, keyboard editing, audio preview.
> **Dependencies:** Phases 5 (property panel hosts it), 6A (SongModel drives it).
> **Delivers:** `src/editor/ui/NotationEditor.js`, `src/editor/ui/RhythmPalette.js`, `src/editor/ui/StaffInteraction.js` + `StaffInteraction.test.js`

The notation editor is an interactive SVG staff (built on the existing NotationRenderer) displayed in the property panel when a song-bearing entity (creature, gate, fountain) is selected. Notes are placed and edited directly on the staff using mouse and keyboard.

### Rhythm Palette

A row of clickable duration buttons above the staff. Clicking one selects the active duration for mouse-based note placement. Visual indicator shows which is active.

| Key | Duration      |
|-----|---------------|
| 2   | Double-whole  |
| 3   | Whole         |
| 4   | Half          |
| 5   | Quarter       |
| 6   | Eighth        |
| 7   | Sixteenth     |
| 8   | 32nd          |
| 9   | 64th          |

Clicking a palette button selects the duration for the next mouse-placed note. The palette also updates to reflect the duration of the currently selected note.

### Mouse-Driven Note Entry

1. Click a duration in the rhythm palette (or it retains the last-used duration)
2. Hover over the staff -- a ghost note follows the mouse vertically, snapping to staff lines/spaces to show the target pitch
3. Click to place the note at that pitch with the active palette duration
4. The newly placed note is immediately selected (highlighted)

### Keyboard-Driven Editing

When a note is selected, the keyboard provides editing without the mouse. **The staff must have focus for keyboard input to be captured** (clicking the staff or a note gives it focus).

**Navigation:**
- **Left arrow** -- select the previous note
- **Right arrow** -- select the next note. If on the last note and there is room remaining in the current measure, advance to an insertion cursor (a blinking line or gap showing where the next note will go). If the measure is full, create a new empty measure and place the cursor there.

**Pitch adjustment (modifies the selected note in-place):**
- **+ (equals/plus key)** -- transpose selected note up one half step. Adds sharps or removes flats as needed (C4 -> C#4, Db4 -> D4, B4 -> C5).
- **- (minus key)** -- transpose selected note down one half step. Adds flats or removes sharps as needed (C4 -> B3, C#4 -> C4, F4 -> E4).

**Note insertion via number keys (inserts a new note, does not change the palette):**
- **Number keys 2-9** -- insert a new note *before* the selected note with the corresponding duration (see table above). The new note gets the same pitch as the selected note (or C4 if nothing is selected). The new note becomes selected so you can immediately adjust its pitch with +/-.
- When the cursor is at an insertion point (past the last note), number keys append instead of insert.

**Dot notation:**
- **. (period key)** -- toggle dotted duration on the selected note. A dotted quarter (1/4) becomes 3/8 of a whole note; pressing dot again removes it.

**Delete:**
- **Delete / Backspace** -- remove the selected note. Selection moves to the next note (or previous if at end).

**Chord building:**
- **Shift+click** on the staff while a note is selected -- adds the clicked pitch to the selected note's beat position, creating a chord. If already a chord, adds another pitch.

### Measure Management

The staff renders with barlines dividing notes into measures based on the time signature (default 4/4).

- Measures fill left to right. When a note fills the remaining space, the cursor auto-advances to the next measure.
- If a note's duration exceeds the remaining space in the current measure, it is still placed (no auto-split into tied notes -- the user distributes durations manually).
- Empty measures are not persisted; they exist only while the cursor is in them. If the cursor moves back and no notes were added, the empty measure disappears.
- The time signature is configurable via a control above the staff (default 4/4). Changing it re-flows the barlines across existing notes.

### Audio Playback

- **"Play" button** synthesizes the song using existing Web Audio instruments at the puzzle's tempo
- **"Stop" button** halts playback
- During playback, the active note is highlighted on the staff (using the existing `setPlaybackPosition` / `.note-active` system)

### Tests (write first)

*Staff pitch resolution (pure logic, testable):*
- Clicking the staff at a given Y coordinate resolves to the correct pitch
- Ghost note snaps to nearest staff line/space

*Staff-to-model integration:*
- Placing a note via click creates the correct `{ pitch, length }` in the SongModel
- Number key press inserts a note before the selected note in the SongModel
- Shift+click adds a pitch to the selected note's chord in the SongModel

*Measure rendering (pure logic, testable):*
- Barline positions calculated correctly from cumulative durations and time signature

*Audio & notation rendering:* Already tested in their own suites (`NotationRenderer`, Web Audio). Visual/audio behavior verified manually.

---

## Phase 7A: Export

> **Summary:** Generate puzzle JSON and download / copy to clipboard.
> **Dependencies:** Phases 1B (serialization), 1C (validation), 5 (UI to trigger export).
> **Delivers:** `src/editor/io/exportPuzzle.js` + `exportPuzzle.test.js`, export button in sidebar

- "Export" button in the sidebar calls `serializePuzzle(model)` (Phase 1B)
- Runs `validatePuzzle(model)` (Phase 1C) first:
  - If errors exist: block export, show error list
  - If only warnings: show warnings, allow proceeding
- Output options: download as `.json` file, copy JSON to clipboard
- Display the manifest entry (`{ id, name, difficulty }`) for easy copy

**Tests (write first):**
- Export with errors returns null / throws (does not produce JSON)
- Export with warnings produces valid JSON
- Exported JSON conforms to `puzzles/schema.md` structure

---

## Phase 7B: Import

> **Summary:** Load a puzzle JSON file into the editor, rebuilding the full viewport.
> **Dependencies:** Phases 1B (deserialization), 2, 3, 4, 5 (viewport must render the loaded puzzle).
> **Delivers:** `src/editor/io/importPuzzle.js` + `importPuzzle.test.js`, import button in sidebar

- "Import" button opens a file picker for `.json` files
- Calls `deserializePuzzle(json)` to populate the model
- Rebuilds the entire viewport from the loaded model (floor regions, entities, metadata)
- Validation runs immediately after import, surfacing any issues

**Tests (write first):**
- Import of each existing puzzle file (`test-001.json` through `elevation-demo.json`) produces a valid model
- Imported model's entity count, floor count, and metadata match the source JSON

---

## Phase 7C: Validation Display

> **Summary:** Real-time error/warning panel in the sidebar.
> **Dependencies:** Phases 1C (validator), 4 (entity selection for "click to highlight").
> **Delivers:** `src/editor/ui/ValidationPanel.js`

- Collapsible error/warning panel in the sidebar
- Updates in real time as the model changes (debounced -- revalidate on each model mutation)
- Errors shown in red, warnings in yellow
- Clicking a validation message selects/highlights the offending entity or region in the viewport

*No automated tests -- validation logic is tested in Phase 1C. Panel rendering is manual verification.*

---

## Phase 7D: Session Persistence

> **Summary:** Auto-save to localStorage, restore on load, "New Puzzle" reset.
> **Dependencies:** Phase 1B (serialization for save/restore).
> **Delivers:** `src/editor/io/sessionPersistence.js` + `sessionPersistence.test.js`

- Auto-save model state to localStorage on every model change (debounced)
- On editor load, check localStorage for in-progress work and offer to restore
- "New Puzzle" button clears localStorage and resets the model

**Tests (write first):**
- Serialize to localStorage, deserialize back, model state matches
- "New Puzzle" clears stored state
- Missing/corrupt localStorage gracefully returns empty model

---

## Out of Scope (v1)

- Live playtesting from within the editor (use the game directly)
- Puzzle solvability verification (validating that the puzzle is actually completable)
- Collaborative editing

---

## Design Questions

### Q1: Hosting Model

**Option A - Separate Vite entry point (recommended):** A second HTML entry point (e.g. `/editor`) served by the same Vite dev server. Shares source code (constants, entity classes, schema validation, NotationRenderer) but has its own UI shell. Editor-only code doesn't ship in the game bundle.

**Option B - In-game overlay:** A modal/panel rendered inside the game. Gives instant playtesting but tightly couples editor UI to the game runtime and input system.

**Option C - Standalone project:** Separate repo with its own build. Maximum isolation but duplicates constants, schema, and rendering code.

### Q2: Camera & Navigation

**Option A - Free orbit only:** OrbitControls with no constraints. Full flexibility but can be disorienting on large puzzles.

**Option B - Constrained orbit + top-down toggle:** Orbit with elevation clamping (can't go below the grid), plus a button to snap to a top-down orthographic view. Useful for laying out floor plans, then orbiting to verify elevation.

**Option C - Top-down primary with 3D preview:** Primary interaction is a 2D top-down view (one elevation layer at a time), with a secondary 3D preview pane for context. Simpler interaction model but split attention.

### Q3: Range Visualization

Should the editor show audibleRange and recordingRange (audibleRange x 0.5) as translucent spheres in the 3D viewport when a creature is selected?

This helps verify creatures can be heard by nearby gates/fountains and that the player can record from plausible positions. In 3D the range is a sphere (distance is computed in 3D space including elevation), so the visualization naturally accounts for multi-level puzzles.

### Q4: Session Persistence

Should the editor auto-save work-in-progress to localStorage so you don't lose an in-progress puzzle on refresh? Currently included in Phase 7D. Low effort, high value.

---

*Rewritten: 2026-01-29 (replaces 2D grid spec from 2026-01-28)*
