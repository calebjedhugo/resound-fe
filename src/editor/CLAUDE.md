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

## Future: its own package

The editor is a self-contained consumer of the renderer's public API, so if a
second consumer ever appears it can graduate into its own package
(`resound-notation-editor`) that depends on `resound-notation` — a move, not a
rewrite. For now the game is the only consumer, so it lives here.
