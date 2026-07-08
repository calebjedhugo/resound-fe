# Editor — CLAUDE.md

## The notation editor is local game code, built on the published renderer

The interactive staff editor lives **here**, in the game, as a **consumer** of
the published `resound-notation` package. It draws by calling the renderer's
public `render()` and reads its SVG output; it does **not** hand-draw notation,
and it needs no changes to `resound-notation` to work (the library ships only
the renderer + `components/*` + `lib/*`).

Files (`ui/` + `model/`):
- **NotationEditor.js** — the editor: builds song JSON, calls `NotationRenderer.render()`,
  and overlays interaction (selection, edit cursor, click-to-place, keyboard, Play/Stop).
  Container + song JSON in, edited song out via `onChange`.
- **SongModel.js** (`model/`) — pure measure-aware editing model (cursor, transpose, dot, chords).
- **RhythmPalette.js** — duration selector (renders note icons via `resound-notation/components/Note`).
- **staffCoords.js** — reverse pitch mapping (click Y → pitch) via `resound-notation/lib/notePositions`.
- **SongEditorModal.js** — modal wrapper: builds chrome + clef selector, constructs the editor
  (`import NotationEditor from 'editor/ui/NotationEditor'`), persists `onChange` through
  `undoManager.updateEntity(...)`, and injects a `resound-sound` `Synth` as the audio `player`
  (guarded for no-`AudioContext` test envs). See `_createEditor()`.

It imports the renderer from the **registry** package: `resound-notation`,
`resound-notation/components/Note`, `resound-notation/lib/*`. No local copy of
the library — ever.

## Why it draws via the renderer

The old editor hand-drew notation from primitives, duplicating the renderer's
engraving, and that copy drifted (short stems, plain-oval chords, missing
flags). Rendering through the one `NotationRenderer` means engraving lives in
exactly one place. Same for the in-game display (`src/ui/NotationDisplay.js`).

## If notation looks wrong

Fix it in the `resound-notation` package, publish a new version, then bump this
repo's dependency and `npm install`. **Do not** hand-copy `dist/` into
`node_modules`, and do not reintroduce hand-drawing here. (Note: an in-measure
accidental-memory fix is committed on the library's `main` but not yet
published — until it ships, the editor shows a courtesy accidental on every
altered note.)

## Level navigation & live repo autosave (dev)

The editor reads and writes the repo's **real** puzzle files during dev, so
edits show up in the game on a manual reload.

- **Puzzle picker** (`ui/PuzzlePicker.js`) — one top-of-sidebar dropdown that
  both opens and creates puzzles (replaced the old bottom `LevelPicker`/"Open
  Level" plus the separate top "New Puzzle" button). Manifest-driven: loads
  `/puzzles/manifest.json` for the list and `/puzzles/<id>.json` for the chosen
  level (reusing `io/importPuzzle`); a `+ New puzzle` item makes a fresh model.
  A not-yet-saved puzzle shows a transient `(unsaved)` entry.
- **Toolbar** (`ui/EditorToolbar.js`) — undo/redo buttons (mirror
  `UndoManager.canUndo/canRedo`; undo/redo is centralized in `EditorApp._undo/_redo`),
  a live save-status line driven by the autosave flow, a "Test in game" deep
  link (`/?puzzle=<id>`, handled in `src/main.js`), and a keyboard-shortcut popover.
- **Puzzle id is derived, not typed** — `MetadataPanel` has no ID field. The id
  is `slugify(name)` while the puzzle is new (`EditorApp._puzzleCommitted === false`)
  and locks after the first repo write, so renaming an existing puzzle never
  forks its file. A fresh puzzle persists on the first edit that gives it a name
  (→ id); before that, autosave skips and the status reads "Add a name to save".
- **Autosave to repo** (`io/repoPersistence.js`) — debounced write of the
  current model to `public/puzzles/<id>.json` (and upserts `manifest.json`).
  Fires on **every** model mutation via a single central hook:
  `UndoManager.setOnChange(...)` (wired in `EditorApp.init`). No per-panel
  wiring. Skipped when the puzzle has no valid `id` yet (new puzzles need an ID
  first). Loading a level replaces the model *directly* (bypassing the mutation
  wrappers), so opening a level never writes it back.
- **Dev endpoint** — `POST /api/puzzles/:id` is a Vite `configureServer`
  middleware in `vite.config.js` (dev-only; validates the id, matches body id,
  writes pretty-printed JSON). Browsers can't write repo files, so this bridge
  is required. **Changing `vite.config.js` requires a dev-server restart.**
- First edit through the editor **reformats** a hand-authored puzzle file to
  2-space JSON (compact inline note objects expand). Expected; commit it once.
- The game picks up changes on a plain tab reload (`PuzzleLoader` fetches at
  runtime); there is no auto-reload of the game tab.
- **Startup is disk-authoritative** (`EditorApp._restoreSession`). Because
  autosave keeps disk current, on load the editor re-fetches the last-open
  level from the repo (by id) instead of trusting the localStorage snapshot,
  which can be stale (e.g. the file was reverted via git). Falls back to the
  localStorage snapshot only for a not-yet-saved puzzle (no id / not in the
  manifest).

## Portal links (cross-puzzle gate links)

Gates carry a stable `id` (auto-assigned `gate-N`, renameable), a `facing`
(doorway plane, default "north"), and optionally `link: { puzzleId, gateId }`
— a door into another puzzle. See `puzzles/schema.md` "Gate Links" and
DESIGN.md "Gate links / portals".

Doors are OMNIDIRECTIONAL (every side walkable; the runtime picks view and
arrival sides itself), so the Facing dropdown is PARKED — commented out in
`PropertyPanel._renderGateFields`, kept for possible revival. `facing`
remains in the schema/serialization untouched.

- **All link mutations go through `io/portalLinks.js`** (create/clear/rename/
  release-on-delete). Links are bidirectional: every operation also updates
  the PARTNER — a cross-puzzle partner's file via the dev endpoint, a
  SAME-puzzle partner (in-level teleport door) through the UndoManager
  (never the file: that would race autosave). Don't set `data.link`
  directly on the model.
- **Same-puzzle doors:** the puzzle picker in the Portal Link section lists
  the open puzzle as "(this puzzle)"; its gates come from the LIVE model
  (`localTargetGates`), not disk. A gate can't link to itself
  (create throws; validator errors).
- **Three ways to create a link** (all call the same `createLink`):
  right-click a gate → "Teleport: click another gate…" (two-click flow in
  the viewport, Esc cancels); right-click → "Link by id…" (`gate-2` or
  `puzzle-id/gate-1`, parsed by `parseLinkTarget`); or the PropertyPanel's
  Portal Link dropdowns. The context menu also shows the current link and a
  Clear Link item.
- **One door, one song:** `createLink` unifies the pair's song — the
  INITIATING gate's song wins, a song-less side adopts the other's, and
  replacing a real target song runs the caller's `confirmSongReplace()`
  (declining returns `{cancelled: true}` and changes nothing). The
  validator errors on same-puzzle pairs whose songs later drift and on
  one-way pairs (undo can desync — repair with Clear Link / relink).
- **Undo caveat:** the local side of a cross-puzzle link edit is undoable;
  the partner file is not. Unlink with Clear Link, not Cmd+Z. (Same-puzzle
  links are fully undoable — both sides live in the model, two undo steps.)
- **Materialization:** listing a puzzle as a link target assigns missing gate
  ids/facing into its file on disk (write-on-read) — otherwise a
  never-resaved puzzle would have nothing linkable.
- PropertyPanel renders the Gate ID / Facing fields and the Portal Link
  section; linked gates glow violet in the viewport (`EntityPlacer`
  `refreshLinkBadge`; `SelectionManager.deselect` reapplies it after the
  selection highlight).
- **World overview** — the sidebar "World Map" button (`ui/WorldOverview.js`)
  opens a modal SVG map of the DERIVED gate-link graph (`io/worldGraph.js`
  reads the manifest + every puzzle file; nothing is stored). Nodes =
  puzzles (click to open via `PuzzlePicker.open(id)`), edges = link pairs
  classified ok / one-way / dangling (catches undo desyncs), orphaned areas
  dimmed.
- Validator: duplicate gate ids / malformed links / bad facing are errors;
  a missing gate id is only a warning (auto-assigned on import). Cross-file
  checks (partner exists, reciprocity, tempo/key match) happen in the link
  UI flow, not the sync validator.

## Future: its own package

The editor is a self-contained consumer of the renderer's public API, so if a
second consumer ever appears it can graduate into its own package
(`resound-notation-editor`) that depends on `resound-notation` — a move, not a
rewrite. For now the game is the only consumer, so it lives here.
