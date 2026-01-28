# Puzzle Editor - High-Level Spec

## Purpose

A visual tool for creating and editing Resound puzzle JSON files. Replaces manual JSON editing with a grid-based editor that enforces the puzzle schema, previews entity placement, and allows song composition for creatures, gates, and fountains.

---

## Core Capabilities

### 1. Grid Canvas

A top-down 2D grid representing the puzzle world. Each cell maps to one grid coordinate in the puzzle JSON.

- **Configurable grid size** (width x depth, e.g. 15x15, 64x64)
- **Pan and zoom** for large grids
- **Cell selection** for entity placement
- **Visual legend** distinguishing entity types by color/icon:
  - Player spawn (unique, exactly one)
  - Creature
  - Gate
  - Fountain
  - Wall
  - Ramp (with direction indicator)

### 2. Entity Placement & Configuration

**Placement:** Click a grid cell, select entity type from a toolbar/palette, entity appears on grid.

**Selection:** Click an existing entity to open its property panel.

**Property panels by type:**

| Entity   | Configurable Properties                                      |
|----------|--------------------------------------------------------------|
| Player   | Position only (grid cell)                                    |
| Creature | Song, interval (beats), audibleRange, clapDisplacement, size |
| Gate     | Song (required to open)                                      |
| Fountain | Song (required to activate)                                  |
| Wall     | Position only                                                |
| Ramp     | Direction (north/south/east/west)                            |

**Multi-select walls:** Drag across cells to place/remove multiple walls at once (wall drawing mode).

### 3. Song Composer

An inline sub-editor for defining songs on creatures, gates, and fountains. This is the most complex piece of the editor.

**Input method (see Design Questions):** Needs to support:
- Adding notes with pitch (scientific notation, e.g. C4, F#3) and length (1/1, 1/2, 1/4, 1/8)
- Building chords (multiple simultaneous pitches at the same beat position)
- Reordering / removing notes
- Visual preview of the song (e.g. a simple note sequence display using the existing NotationDisplay system)

### 4. Puzzle Metadata

Form fields for top-level puzzle properties:

- `id` (string, auto-generated or manual)
- `name` (string)
- `difficulty` (1-3 selector)
- `tempo` (BPM number input)
- `gridSize` (width x depth)
- `clapDisplacement` (optional, fraction input)

### 5. Validation

Real-time validation surfaced as warnings/errors in the editor:

**Errors (block export):**
- No player spawn defined
- Entity placed outside grid bounds
- Creature/gate/fountain missing a song
- Song contains invalid pitch or length values
- Duplicate entity at same grid cell (except wall adjacency)

**Warnings (allow export, flag for review):**
- No fountain defined (puzzle has no win condition)
- Gate with no walls around it (gate serves no purpose)
- Creature audibleRange doesn't reach any gate/fountain (song can't be delivered)
- Unreachable areas (player can't path to an entity)

### 6. Import / Export

- **Export:** Generate puzzle JSON conforming to `puzzles/schema.md`. Download as `.json` file or copy to clipboard.
- **Import:** Load an existing puzzle JSON file into the editor for modification.
- **Manifest update:** Optionally append to `manifest.json` on export (or provide the manifest entry to copy).

---

## Out of Scope (v1)

- Live playtesting from within the editor (use the game directly)
- Undo/redo history
- Puzzle solvability verification (validating that the puzzle is actually completable)
- Collaborative editing
- Saving editor state to localStorage (session persistence)

---

## Design Questions

### Q1: Hosting Model

**Option A - Separate Vite page (recommended):** A second HTML entry point (e.g. `/editor`) served by the same Vite dev server. Shares source code (constants, schema validation) but has its own UI.

**Option B - In-game overlay:** A modal/panel rendered inside the Three.js game canvas. More integrated but couples editor UI to the game runtime.

**Option C - Standalone tool:** Completely separate project/repo with its own build. Maximum isolation but duplicates schema knowledge.

### Q2: Song Input Method

**Option A - Form-based list:** Add notes via dropdowns (pitch selector + length selector). Simple to build, tedious for long songs.

**Option B - Piano roll:** A visual timeline where you click to place notes at pitch/time intersections. More intuitive but significantly more complex to build.

**Option C - Hybrid:** Form-based input with a read-only NotationDisplay preview. Balances effort vs usability.

### Q3: Wall Drawing UX

**Option A - Click-per-cell:** Click individual cells to toggle walls. Simple but slow for long walls.

**Option B - Drag-to-draw:** Click and drag to paint/erase walls across cells. Faster but needs careful state management.

**Option C - Both:** Click for single walls, drag for runs. Most flexible.

### Q4: Range Visualization

Should the editor show audibleRange and recordingRange (audibleRange x 0.5) as circles/overlays on the grid?

This helps verify creatures can be heard by nearby gates/fountains and that the player can record from plausible positions, but adds visual complexity.

### Q5: Scope of v1

**Option A - Minimal:** Grid + entity placement + raw JSON song input + export. Get something working fast.

**Option B - Full spec above:** Everything described in this doc, including the song composer and validation.

### Q6: Session Persistence

Should the editor auto-save work-in-progress to localStorage so you don't lose an in-progress puzzle on refresh? Listed as out-of-scope above, but it's low effort and high value -- worth discussing.

---

*Created: 2026-01-28*
