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

- **Open Level** (`ui/LevelPicker.js`) — manifest-driven dropdown (replaced the
  old file-picker `ImportPanel`). Loads `/puzzles/manifest.json` for the list
  and `/puzzles/<id>.json` for the chosen level, then reuses `io/importPuzzle`.
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

## Future: its own package

The editor is a self-contained consumer of the renderer's public API, so if a
second consumer ever appears it can graduate into its own package
(`resound-notation-editor`) that depends on `resound-notation` — a move, not a
rewrite. For now the game is the only consumer, so it lives here.
