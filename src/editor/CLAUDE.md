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
  Container + song JSON in, edited song out via `onChange`. Keyboard input
  draws once per animation frame and only what changed (`_flushRender`): an
  edit re-engraves, a selection/cursor/voice move redraws only the overlay
  (`_drawSelection`), any other key draws nothing. A staff resize re-engraves
  through the same path: the editor owns the ResizeObserver; the renderer's
  is OFF (`observeContainer: false` — it re-engraved without the overlay).
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
  `UndoManager.canUndo/canRedo`; undo/redo is centralized in `EditorApp._undo/_redo`,
  which refits meshes in place: `EntityPlacer.rebuildFromModel` keeps a mesh
  whose entity kept its id + type and builds/frees only the rest),
  a live save-status line driven by the autosave flow, the look button, Play
  (below), and a keyboard + controller shortcut popover (the controller rows
  come from `EDITOR_MAPPING`).
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
  wrappers), so opening a level never writes it back. **A pending autosave is
  FLUSHED before anything replaces the model** (`_applyRestoredModel`), and
  git actions and the picker's reads/deletes first wait for it to land
  (`_settleAutoSave`): left to its timer it wrote the NEWLY opened puzzle and
  dropped the old one's last edit. A save landing after a swap leaves the
  open puzzle's id lock, picker selection and status alone. **Revert and its
  ⌘Z restore HOLD autosave until they reload** (`_rewriteFilesWithGit`): an
  edit made while git rewrites the files goes with the model it replaces
  (written back, it re-dirtied the revert / overwrote the restore).
- **Dev endpoint** — `POST /api/puzzles/:id` is a Vite `configureServer`
  middleware in `vite.config.js` (dev-only; validates the id, matches body id,
  writes pretty-printed JSON). Browsers can't write repo files, so this bridge
  is required. **Changing `vite.config.js` requires a dev-server restart.**
  Writes run one at a time in arrival order (a save still waiting its turn
  takes a newer save of the same puzzle); a file whose formatted bytes would
  not change is not rewritten (so an edit leaves `manifest.json` alone unless
  the puzzle's name/difficulty changed).
- **Git controls** (`ui/GitPanel.js` + `io/gitControls.js`) — dev-only
  Commit / Pull / Push / Revert in the sidebar, over `/api/git/*` (a second
  `configureServer` middleware, `gitPlugin`, that shells out via `execFile`).
  The panel **hides itself** when `/api/git` is unreachable (production build).
  Its status re-reads **after each repo write lands** (`repoPersistence.onRepoWrite`)
  and after its own actions, one read at a time — never per edit (each read
  spawns git on the dev server, and a per-edit read ran before the autosave).
  An action's result ("Reverted — ⌘Z to restore", an error; `showResult`)
  stays up through later reads of the SAME status, until the next action, a
  status change, or an edit that disarms the ⌘Z restore (`clearNote`).
  **Commit and Revert scope to `public/puzzles/`** (Commit stages only that
  path, so Husky/lint-staged never sees unrelated files); **Pull/Push are
  whole-repo** (git can't push a subtree). **Revert = `git stash push -u --
  public/puzzles`** (undoable, sweeps up new untracked puzzle files too); the
  editor then reloads the open puzzle from disk and arms a **one-shot Cmd-Z**
  that pops the stash (`EditorApp._pendingUnrevert`, cleared by any model
  mutation — see the `setOnChange` hook and the keydown handler). Pull also
  reloads the open puzzle. **`vite.config.js` changes need a server restart.**
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

## The viewport's look (2026-11-23)

- **Game look (default)** — `viewport/GameLookLayer.js` draws the level with
  the GAME'S OWN builders: `createSky`, `Floor`, `Wall.buildBatch` +
  `Wall.perimeterPositions` (shared with `PuzzleLoader`), `Ramp`,
  `Gate.buildClosedMesh` + `NotationDisplay` (the staff), the waystone and
  fountain mesh builders, and a `CreatureLook` per creature (the soap bubble;
  animated). Never fork a shader or write a shared material here; a look
  change belongs in the game modules. Game cells centre at `x * WORLD_SCALE`,
  the editor's at `+ WORLD_SCALE / 2`: everything is built in game
  coordinates under one root offset by half a cell. Nothing simulates (no
  instrument, listener or gameState).
- The **schematic meshes** (`EntityPlacer`, coloured primitives) stay in the
  scene as invisible pick targets (`setLook`: material hidden; three still
  raycasts them). Editor cues are drawn OVER the dark look (`outlineBox`, no
  depth test): the selection outline, a violet frame on linked gates' tops,
  the cursor's frame. Range spheres (`RangeIndicator`): outer = audible range,
  inner (pale) = the pole's ABSORB reach, each ringed at the creature.
- **V** / the toolbar's ◐ toggles game ↔ schematic, remembered in
  localStorage (`io/lookPreference.js`, key `resound-editor-look`). The game
  look is synced only while shown (`_syncGameLook`). While it shows, every
  frame asks for the next (the sky, the wobble); the schematic look keeps the
  on-demand rendering.
- **Songs light their creature** — `GameLookLayer.noteOn(id, pitch, seconds)`
  lights it note by note with Creature.updateLook's rule (messiaenColour over
  its sounding notes: a lone note is pearl, as in game) and its light falls on
  the floor/walls (`AreaLight`). Fed by the song editor's Play
  (`SongEditorModal` `onNote` / `onStop`; the modal docks at the bottom and
  the camera frames the entity in the band above it) and by **A** — quick
  audition of the song under the cursor (`audio/SongAudition.js`, a Synth;
  also the entity menu's Play Song). Editor audio is audible by design.

## Play (2026-11-23; one tab: `play/PlayPreview.js`)

- **Play** (toolbar ▶, **Cmd/Ctrl+Enter**, the controller's Options menu)
  = `EditorApp.play()`: refuses (toast) an unnamed puzzle or one with no
  player spawn; writes the last edit (`_settleAutoSave`); then
  `PlayPreview.start`. States: `idle → entering → playing → returning →
  idle` (`preview.state`; `landed`, `gameReady` while entering).
- **Entering**: the editor stands aside (`_standAside`: keys ignored except
  Esc = cancel, `EditorGamepad.stop()`, OrbitControls off, audition and song
  playback stopped, the game look forced, every editor mark hidden —
  `GameLookLayer.setCuesVisible(false)` + every scene child but the look's
  root and the lights). The sidebar slides left, the pad legend / HUD /
  docked song editor fade, and the camera glides (`GLIDE_MS` 1 s, eased,
  across then down: `play/glide.js`) to the eye at the spawn with the
  game's lens: `core/playerView` (`spawnEye`, `viewQuaternion`, `START_YAW/
  PITCH`) and `EYE_HEIGHT` / `VIEW_FOV/NEAR/FAR` in `core/constants` — the
  same numbers the game reads. Editor coordinates = game + `GAME_OFFSET`
  (half a cell, `viewport/gridUtils`). **The canvas covers the window for
  the whole preview** (`.play-canvas`, sized once) and the camera's
  `setViewOffset` keeps the picture centred on the part the sidebar leaves
  (no per-frame canvas resize); with the sidebar gone it is the game's
  full-window view. A late frame moves the glide on by at most
  `MAX_STEP_MS` (it pauses, never jumps).
- **The game** loads unseen in a same-origin iframe over everything
  (`.play-frame`, `allow="autoplay; gamepad"`, `/?puzzle=<id>&from=editor`).
  Same origin = the SAME main thread, so the protocol (`core/playLink`)
  keeps the game's heavy work off the glide: the glide (and the sidebar
  slide) START only on WAITING — the game's code has loaded by then, and
  loading it mid-glide paused it (ruled 2026-11-23: wait, glide smooth;
  ring after 0.5 s, glide goes anyway after `CODE_WAIT_MS` = 2 s; measured:
  glide starts ~0.3 s after Play, longest frame 18 ms). WAITING (game listening) →
  LANDED (editor: camera still at the eye; carries the editor's sky clock,
  `environmentClock`) → the game builds and draws behind its VEILED start
  gate (world held, gate unseen, pad off) → READY (its first frame is
  painted, with its own eye pose; the editor settles onto it if it
  differs) → 150 ms cross-fade → GO (iframe focused; the game takes the
  pad, `Gamepad.setActive(true)` latching held buttons; its gate lifts at
  once if audio can run, else shows as at any level start). A game slower
  than the glide: the camera holds at the eye, look frozen, small gold ring
  (`.play-loading`). FAILED / no READY 20 s after landing / Esc: toast,
  glide home. Messages are taken only from the iframe's own window.
- **Playing**: the editor draws nothing (`frame()` → no draw).
- **Back to Editor** (pause menu, or Cmd/Ctrl+Enter in the game): the game
  holds still with its menu hidden, mutes its master gain, gives up the pad,
  and posts BACK `{areaId, pose, sky}`. The editor draws that view (only if
  `areaId` is the edited level; else the spawn's), fades the iframe out,
  REMOVES it (its AudioContext closes, rAF and pad polling end with the
  document: a fresh game every Play), glides home to the exact saved
  camera (position, quaternion, fov, near, far, orbit target) while the
  sidebar slides back, then `_comeBack` restores look, marks, focus,
  controls and `EditorGamepad.start()` (a button still held is latched: no
  press). Selection, panels, cursor and undo history never left.
- A game opened by itself with `from=editor` (no editor around it): Back to
  Editor loads `/editor.html?puzzle=<id>`, which the editor opens from disk.

## Controller (2026-11-23; `input/EditorGamepad.js`)

Reuses the game's pad reading (`core/Gamepad` `findPad`/`readStick`/
`DEAD_ZONE`), `core/InputDevice` (device in hand) and the glyphs
(`core/inputGlyphs` `buttonGlyph`, `ui/glyphCanvas`; new `pill`/`dpad`
kinds). Buttons mostly press the editor's OWN keys (synthetic keydowns on
document, `fromGamepad`), so pad and keyboard can't drift; polled per frame
only while a pad is connected. **`EDITOR_MAPPING` is the one table** the code,
the legend (`ui/PadLegend.js`, top-right while the pad is in hand) and the ?
help read — change it there. Context (`EditorApp.padContext()`): song editor
> menu > world map > sidebar panel > viewport.

| Input | Viewport | + L2 held | + R2 held |
|---|---|---|---|
| D-pad | cursor (repeats) | ↑/↓ storey (empty starts a floor); ←/→ undo/redo | move the entity |
| Left stick | pan camera | | |
| Right stick | orbit camera (inverted, both axes) | | |
| R3 / L3 | zoom in / out (a step; held, keeps going) | centre camera on cursor / reset camera | |
| Cross | place chosen type / select / its menu; commits a floor draft | — | — |
| Square | delete under cursor | start a floor here (F) | — |
| Triangle | song editor | play/stop the song (A) | — |
| Circle | back (Esc) | | |
| L1 / R1 | palette prev / next | | carry entity down / up a storey |
| L2 + R2 + d-pad ↑/↓ | carry entity a storey | | |
| Options | editor menu: Play, Edit/Play song, Properties, Open puzzle…, World map, floor, Undo, Redo, look | | |
| Share | game ↔ schematic look | | |
| Touchpad | sidebar focus (`PadFocus`) | | |

- **Sidebar / world map** (`input/PadFocus.js`): d-pad ↑/↓ moves a visible
  focus (`.pad-focus`), ←/→ steps a dropdown (shown only; ✕ commits, leaving
  reverts) or a number field (committed each step), ✕ clicks / toggles /
  gives a text field the keyboard, ○ (or the touchpad) back to the level.
  World-map nodes carry `data-pad-focus`.
- **Song editor** (`SongEditorModal.padAction`, each the staff's own key):
  ←/→ edit cursor, ↑/↓ selected note's pitch, ✕ insert a note of the chosen
  duration, □ delete, L1/R1 longer/shorter duration, △ play/stop, L2 dot,
  R2 rest, Options sharp→flat→natural, Share other staff, ○ close.
- **Menus** (ContextMenu): d-pad ↑/↓, ✕ choose, ○ close.
- Caveats: a pad press is no user activation: a Play from the pad starts
  the game's audio only if the browser allows it (the editor page was
  clicked/keyed before), else the game's normal start gate asks for a key
  or click; window prompts/confirms (link by id, deletes) need the
  keyboard/mouse.

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
