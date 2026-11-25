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
  **Entry (designer's rulings 2026-11-24)**: the edit cursor is either ON
  an entry (stepped onto with ←/→ or clicked: cursor = selected,
  `_onEntry`) or PAST one (the end of the song — where a song OPENS — just
  after the entry put in, or an empty song). ✕ / Enter PAST an entry
  writes a NEW note at the pitch cursor there (`insertNote`, the palette's
  duration) and the cursor goes past it: ✕ ✕ ✕ writes a melody, on a
  creature too (no rest first; never a pitch onto a rest just entered —
  ← onto it first). There is no "nothing at the cursor" message: with an
  empty song □, the accidental, the dot and the tie quietly do nothing.
  Past an entry, □ / dot / tie / accidental / value still act on the entry
  just put in (the selected one). **L2+✕ / ⇧Enter** (`insertNote` ON an
  entry too) put a new note BEFORE the entry the cursor is on, the cursor
  then past it (so ✕ goes on writing there); past the end they append, as
  ✕. A rest of the palette's duration goes in
  with `insertRest` (R2+✕, a duration key 2–7, r). Either goes in ONLY if
  it fits in what is left of its measure
  (`_roomAt`, barred as SongModel bars; a full measure starts a new one;
  refusals say why in the status line). The PITCH CURSOR (a staff line /
  space, ↑/↓; cyan ring + name + dashed ledger guides; drawn past the
  last note when the cursor is past it) puts pitches on and off the entry
  the cursor is ON (← onto it; `cross`: ✕ / Enter): on a rest it
  becomes that note, on a note's own pitch it comes off (the last one off
  leaves the rest), elsewhere it joins the chord (sorted, never the same
  sounding pitch twice) — a creature (`polyphonic: false`) moves its one
  note instead. Pitches go on IN THE KEY (`staffCoords.keyPitch`: the F
  line in D is F♯). □ / Delete (`erase`): note → rest → gone. L2+↑/↓ /
  ⇧↑/⇧↓ (`stepAccidental`): ♭ ↔ ♮ ↔ ♯ of the note under the pitch cursor.
  Dots (palette's dot + ✕, or .; `toggleDot`) step none → one → TWO (a
  double dot, `dotted: 2`) → none (ruled 2026-11-24); each dot must fit, a
  second that doesn't takes the dot off (says why). A longer value
  (`stepNoteDuration`, dots kept) must fit too. **Ties** (palette's tie +
  ✕, or t; `toggleTie`): the note under the pitch cursor — PER NOTE, so in
  a chord just that tone — ties to the same pitch (exact spelling) in the
  next entry, or unties; refused, saying why, when that entry has no such
  pitch (or is a rest / the end) or no note is under the pitch cursor.
  Every edit re-joins ties (`repairTies` in `_emitChange`): a tie whose
  other end was re-pitched, removed or separated goes. The model keeps
  dots in the fraction (one dot numerator 3, '3/8'; two numerator 7,
  '7/16': `splitLength`/`joinLength`); stored songs are canonical
  `{length, dotted: true | 2}`. **Every pitch put on SOUNDS** (`_sound` →
  the player's `sound(pitch, seconds)`: that pitch alone, ALWAYS a quarter
  note at the level's tempo, in the modal's creature voice, the entity
  lit for it): a new note, a rest made a note, a chord tone, a creature's
  moved note, a click, an accidental. Never a pitch taken off, an undo /
  redo, or a load (those don't go through the edit methods).
  **No pitch ever goes in on the editor's own initiative**
  (no default notes/pitches; new entities' songs are `[]`). The edit cursor
  OPENS AT THE END (past the last entry, which is selected); an entry goes in at the cursor and
  the cursor goes AFTER it (mid-song too); a CLICK puts a note at the
  clicked pitch in at the edit cursor (⇧-click: pitch on/off, as ✕). Each
  action is a public method the keyboard and `SongEditorModal.padAction`
  share. A long song wraps onto systems (one staff group per voice each):
  the cursors are drawn on their entry's system, a click maps by the
  nearest system, a move scrolls the cursor into view. Cmd/Ctrl/Alt keys
  are left alone; Space plays/stops; Tab/⇧Tab other staff. Play on a grand
  staff hands the player BOTH voices (`play({voices})`; the modal plays
  either kind on a resound-sound `Sequencer` over a creature voice — the
  `Theremin` in its default voice, crackle on — so dots, double dots and
  ties (held, not re-struck, chord members each on their own) sound as in
  game, and the entity lights for each note's sounding length). Play/Stop/Clear,
  the hint and the status line go in `controlsContainer` (the modal's
  footer).
- **Undo in the modal**: ⌘Z / ⇧⌘Z (Ctrl+Z / Ctrl+Y; the pad's L3 / R3) in `SongEditorModal`
  walk back only through the steps recorded since it opened (never into the
  level behind it), then re-show the entity (`NotationEditor.setSong`, or a
  rebuilt editor when the grand staff came or went).
- **SongModel.js** (`model/`) — pure measure-aware editing model (cursor, transpose, dot, chords).
- **RhythmPalette.js** — 32nd … whole (shortest to longest, MuseScore's
  order, ruled 2026-11-24: keys 2 = 32nd, 3 = 16th, 4 = 8th, 5 = quarter,
  6 = half, 7 = whole), then the DOT (chosen, ✕ steps the
  dots) and the TIE (chosen, ✕ ties; `tieSelected`, `chooseMode`); with
  either chosen the last note value stays the entry duration, shown `kept`. Icons are
  `resound-notation/components/Note` notes, but the library draws glyphs as
  `<use>` of per-SVG `<defs>` that only `render()` writes, so the palette
  copies the defs from one hidden render into every icon (`glyphDefs`) —
  without them the icons were bare stems (2026-11-24). The palette's bar
  (`.rhythm-palette-bar`) is `position: sticky` at the top of the modal's
  scrolling body, so it stays in sight while a long song scrolls (the
  body's `scroll-padding-top` keeps a revealed cursor clear of it).
- **The game reads ties and dots as they SOUND** (`core/noteBeats`,
  `core/SongMatcher`): a tied pair is one held note to a gate, a double
  dot x1.75 — see DESIGN.md "Matching".
- **mergeVoices.js** (`model/`) — grand staff → one staff: both voices
  sliced at every onset/release into chords, held notes split and TIED, a
  doubled pitch kept once. Nothing is dropped.
- **staffCoords.js** — reverse pitch mapping (click Y → pitch) via `resound-notation/lib/notePositions`.
- **SongEditorModal.js** — modal wrapper: header (title, ×), body (palette +
  staff), always-visible footer (Play/Stop/Clear, hint + status, Options,
  Done). **Options** (footer button / the pad's Options) toggles a popover
  with the clef dropdown, **Copy song from** and Clear, walked by the pad
  with `PadFocus` (context `song-options`). Copy song from
  (`songSources`, `copySongFrom`) lists EVERY OTHER entity of the level
  that has a song — gates (gate-id order), then creatures, then fountains
  — named by type (`Gate 2` from its gate id, `Creature 5` / `Fountain 8`
  by entity id, as the validator names them), "(grand staff)", and the
  first four pitches; any direction (gate ↔ creature ↔ fountain). It
  copies the chosen one's song in place of this one's: both staves +
  `staffGroups`, or the one staff + its clef (time/key are the level's).
  Over a song with notes it asks first (`.song-copy-dialog`, Replace /
  Cancel, Cancel focused). One undo step; the editor is rebuilt (cursor at
  the end). A creature target takes ONE line (grand staff merged, each
  chord's TOP note, ties re-joined: `repairTies`). Linked partners are not
  touched (as any song edit; the validator flags a drifted pair).
  However the modal closes (Done, ×, Esc / ○, backdrop) it calls
  `onClose`: `EditorApp` puts the camera (position, orientation, lens,
  orbit target) and cursor back as they were before `_frameAboveEditor`
  moved them (`_captureView` / `_restoreViewBeforeSong`; a song opened over
  another keeps the first's). Leaving the grand staff opens a dialog — keep
  the treble or the bass staff — and merges both staves onto it
  (`mergeVoices`; one undo step). Constructs the editor
  (`import NotationEditor from 'editor/ui/NotationEditor'`), persists `onChange` through
  `undoManager.updateEntity(...)`, and injects a creature voice (resound-sound `Theremin`
  on a `Sequencer`, `_ensurePlayer`/`_playVoices`) as the audio `player`
  (guarded for no-`AudioContext` test envs: `SongAudition.createEditorVoice`). See `_createEditor()`.

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

## The floor: tiles the designer builds (2026-11-24)

- **The model's floor is TILES** (`EditorPuzzleModel` `addTiles` /
  `removeTile` / `hasTile` / `getTiles`, cells `{x, y, z}`, y = storey;
  `core/floorTiles`): no implicit ground, no grid, no perimeter. A new
  puzzle has no floor and no walls. Saved as `tiles` rectangles
  (`packTiles`), no `gridSize`/`floors`; an older file opens as tiles over
  its grid + regions + perimeter ring, its perimeter walls as ordinary walls
  (`serialization.deserializePuzzle`), and saves in the new shape.
- **The cursor goes anywhere** (`EditorScene`: no clamp, negative cells;
  the drawn grid follows the cursor, the click plane is huge). The camera
  frames the built level (`gridUtils.levelBounds` / `levelCenterCell`; the
  origin when empty) on open and on L2+L3.
- **✕ / Enter / a click on empty space** (ruled 2026-11-25; one entry
  point, `EditorApp._startRangeAtCursor`, then the tap path):
  - **A type chosen**: places it there WITH its floor tile, one press, one
    undo step (`EntityPlacer._withFloor`). On bare floor: placed as before.
  - **Floor only** (no type: the toolbar's "Floor only" button, Esc / ○,
    or the stop between the ends of the L1 / R1 ring;
    `EntityToolbar.cycle`): on a cell with no floor it builds floor — held,
    the cursor moving, the gold rectangle from the press to the cursor
    previews (`EditorScene.setFloorRange`); let go (`padConfirmEnd`, Enter
    keyup) builds every cell of it that has none in ONE `addTiles`. A
    click builds one tile. Floor ranges stay one storey.
  - **Wall chosen, held**: a WALL BOX (`_startWallRangeAtCursor`): moved
    for its footprint, Option/L2 + ↑/↓ while held for its storeys (up or
    down; the active storey and cursor stay on the first), previewed as a
    translucent box (`EditorScene.setWallRange`). Let go builds only its
    OUTLINE at every storey — a hollow container, nothing inside, no floor
    inside — skipping cells that hold a wall (or anything), each wall
    bringing a tile only where it would stand on nothing (the bottom ring;
    walls above stand on the tops below), ONE undo step
    (`_commitWallRange`, `UndoManager.batch`). A 1-wide box is a line; a
    tap is one wall.
  - On an entity: select / open its menu, as before. Esc, a storey change
    (floor range), a load, window blur or the pad leaving call a hold off.
- **A wall's top is floor** (ruled 2026-11-25): a wall at storey N makes
  N + 1 floor there (`EditorPuzzleModel.hasFloor` = a tile or a wall top,
  `isWallTop`): entities go on it with NO tile stacked, the validator
  counts it, ✕ there never builds floor, floor ranges skip it.
- **Anything placed brings its floor** (`EntityPlacer._withFloor`):
  placing, moving (the property panel's X/Z) or placing the spawn on a
  cell with no tile builds it in the SAME undo step (`UndoManager.batch`:
  several mutations, one step, one change). **A carry builds none on the
  way** (ruled 2026-11-25: "should not create a floor tile until R2 is
  released"): Shift+arrows / R2+d-pad, and the storey carries, move with
  `buildFloor: false`; letting go of R2 / Shift (or the window losing
  focus) puts it down — `EditorApp.endCarry` builds the tile under it if
  it has none, its own undo step.
- **□ / Delete**: the entity, else the spawn, else that floor tile. So twice
  on an entity: the entity, then its floor.
- **Storeys**: Option+↑/↓ (L2 + d-pad ↑/↓) go to any storey from
  `MIN_STOREY` to `MAX_STOREY` (-9..9; `ui/ElevationSelector`, always shown
  as "Storey"), built on or not. Negative storeys are SUBFLOORS (ruled
  2026-11-24): below the ground, working like any storey in the editor, the
  file and the game.
  The floor-draft tool, F, L2+□, the "empty storey starts a floor" step,
  the Options menu's "Start a floor here" and the sidebar's Floor Regions
  panel are GONE; F and L2+□ do nothing now.
- **Floor edges are uniform** (ruled 2026-11-24): every tile is a slab of
  `Floor.SLAB_THICKNESS` with its top at its storey, a side face and pale
  edge line wherever its side is exposed (empty space or a lower / higher
  floor), the same at every storey. ONE geometry builder,
  `entities/Floor` `buildTileGeometry`, draws the game's floor (and so the
  game look's) and the schematic look's slabs (`viewport/TileSlabs`: that
  geometry, flat colour per storey, edge lines pale). Wall tops are part
  of that floor; walls draw only their exposed sides, a column of stacked
  walls as one face (`Wall.buildBatch`, see the root CLAUDE.md), so joined
  walls read as one solid; the schematic wall boxes fill their cells.
- The validator errors on an entity or spawn with no tile under it, warns
  on a ramp whose high end leads onto no tile.

## The viewport's look (2026-11-23)

- **Game look (default)** — `viewport/GameLookLayer.js` draws the level with
  the GAME'S OWN builders: `createSky`, `Floor` (from the tiles),
  `Wall.buildBatch` (the walls placed; no perimeter), `Ramp`,
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
  frame asks for the next (`_requestLookFrame`) — but its CALM motion (the
  sky's drift, the bob/wobble, the waystones' breathing, all seconds-long)
  draws at `CALM_FRAME_MS` (30 fps, rAF vsyncs between skipped:
  `_lookCalm`); lightning or a lit/fading creature (`GameLookLayer.lively`)
  and any other request (input, camera damping, a glide, an edit) draw on
  the next vsync (ruled for the fan, 2026-11-24: the 60 fps loop was ~half
  the GPU while idle). The schematic look keeps the on-demand rendering.
- **The cutaway: seeing inside containers** (ruled 2026-11-25;
  `viewport/Cutaway.js`, rule + GLSL in `entities/CutawayLook.js`). ONE
  view toggle, three modes — **X**, the Options menu ("View: …"), **L2 +
  Share** — shown in the readout (`Cell (x, z) · E0 · Cutaway`), remembered
  per browser (`io/lookPreference` `loadCut`/`saveCut`, key
  `resound-editor-cut`, try/catch): **Full** (all whole) → **Storey cut**
  (every storey ABOVE the active one a ghost: floors, walls, entities;
  the active one and below solid; a wall's top, floor one storey up, stays
  with its wall) → **Cutaway** (default: that, plus WALLS and GATES on the
  active storey on the camera's side of the CURSOR). Near-side rule
  (`cellGhosted`, JS twin of the GLSL `cutGhost` — change both): with `v` =
  cell − cursor and `d` the horizontal unit direction cursor → camera, a
  ghost when `0.5 < v·d ≤ 12` and `|v×d| ≤ 4.5` cells (a room-wide strip
  from the cursor toward the eye: a container's near wall(s) and the near
  halves of its sides open, its far side and the cursor's own cell stay;
  camera overhead = no near side). A GHOST is a screen-door discard (3 px in
  16, `ghostKeeps`/`cutDropped`), never alpha blending, its outline kept
  pale and whole. **Uniforms default OFF; only the editor writes them**: the
  floor and wall shaders read the SHARED `CUT_UNIFORMS` (cell owners: the
  floor's `aCut` attribute from `buildTileGeometry`, a wall top owned by its
  wall; walls from their instance matrix — a solid wall shows the face it
  hid against a ghost neighbour or a ghost stacked on it); entities get a
  per-object `uGhost` (gate material, `Ramp.ghost` → `bindRampLight`,
  `CreatureLook.setGhost`, `addGhostDither` on the editor's own waystone /
  fountain / schematic materials and `TileSlabs`; a ghost's staff at 15%).
  `_updateCut` runs before EVERY drawn frame (calm or not) and every pick;
  the storey and cursor call `EditorScene.onViewChange` → a frame, an orbit
  draws through the controls' 'change'. **Picking skips ghosts**
  (`_pickableMeshes`, `SelectionManager.isGhost` /
  `EntityPlacer.getPickableMeshes`): a right-click / double-click goes
  through the near wall to what is inside; the cursor stays on the active
  storey's plane. Play suspends it (`_standAside`: the game look whole);
  the game never writes it
- **Resolution: as the game renders by default** (ruled 2026-11-24): 1x
  pixel ratio, no antialiasing (`_createRenderer`). **Sharp rendering**
  (screen pixel ratio + antialiasing, the editor's old look, ~7x the GPU
  time per frame on a 2x screen) is opt-in from the Options menu (pad
  reachable; `toggleSharp` / `setSharp`), remembered per browser
  (`io/lookPreference` `loadSharp`/`saveSharp`, key `resound-editor-sharp`,
  try/catch). Antialiasing is fixed at WebGL context creation, so switching
  builds a NEW renderer on a new canvas (old one disposed +
  `forceContextLoss`) and new OrbitControls on it (target and `enabled`
  kept, the 'change' invalidation re-added); the scene re-uploads to the new
  context on its first frame. Refused while Play is under way. Anything
  holding the renderer or controls must read them from the app when used
  (`PlayPreview`'s host has getters), never keep its own reference.
- **Songs light their creature** — `GameLookLayer.noteOn(id, pitch, seconds)`
  lights it note by note with Creature.updateLook's rule (messiaenColour over
  its sounding notes: a lone note is pearl, as in game) and its light falls on
  the floor/walls (`AreaLight`). Fed by the song editor's Play
  (`SongEditorModal` `onNote` / `onStop`; the modal docks at the bottom and
  the camera frames the entity in the band above it) and by **A** — quick
  audition of the song under the cursor (`audio/SongAudition.js`, in the
  creatures' own voice: resound-sound's `Theremin` in its default voice,
  played by `Theremin.play` exactly as a creature sings: ties held, dots read;
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

Cross is read on its release too (`EditorGamepad._letGo` →
`padConfirmEnd`), for the floor range. Reuses the game's pad reading
(`core/Gamepad` `findPad`/`readStick`/`DEAD_ZONE`), `core/InputDevice` (device in hand) and the glyphs
(`core/inputGlyphs` `buttonGlyph`, `ui/glyphCanvas`; new `pill`/`dpad`
kinds). Buttons mostly press the editor's OWN keys (synthetic keydowns on
document, `fromGamepad`), so pad and keyboard can't drift; polled per frame
only while a pad is connected. **`EDITOR_MAPPING` is the one table** the code,
the legend (`ui/PadLegend.js`, top-right while the pad is in hand) and the ?
help read — change it there. Context (`EditorApp.padContext()`): song editor
> menu > world map > sidebar panel > viewport.

| Input | Viewport | + L2 held | + R2 held |
|---|---|---|---|
| D-pad | cursor (repeats; anywhere) | ↑/↓ storey (any, -9..9; below 0 = subfloors); ←/→ undo/redo | move the entity (brings its floor) |
| Left stick | pan camera; the cursor rides on the cell at the view's middle (`viewCentreCell`: the sight line through the orbit target meets the active storey; any cell, any storey) | | |
| Right stick | orbit camera (inverted, both axes) | | |
| R3 / L3 | zoom in / out (a step; held, keeps going) | centre camera on cursor / reset camera | |
| Cross | empty: place the chosen type with its floor (Wall held: a hollow box, L2+↑/↓ its storeys; floor only: floor, held a range); entity: select / its menu; Teleport pick (a gate's menu): the gate at the cursor is the partner (`_pickLinkTargetAtCursor`; a wrong cell keeps picking, ○ cancels) | — | — |
| Square | delete the entity, else the floor tile under the cursor | — (freed) | — |
| Triangle | song editor | play/stop the song (A) | — |
| Circle | back (Esc) | | |
| L1 / R1 | palette prev / next (floor only between the ends) | | carry entity down / up a storey (its floor when R2 is let go) |
| L2 + R2 + d-pad ↑/↓ | carry entity a storey | | |
| Options | editor menu: Play, Edit/Play song, Properties, Open puzzle…, World map, Undo, Redo, look, view (cutaway), sharp rendering | | |
| Share | game ↔ schematic look | view: full → storey cut → cutaway (X) | |
| Touchpad | sidebar focus (`PadFocus`) | | |

- **Sidebar / world map** (`input/PadFocus.js`): d-pad ↑/↓ moves a visible
  focus (`.pad-focus`), ←/→ steps a dropdown (shown only; ✕ commits, leaving
  reverts) or a number field (committed each step), ✕ clicks / toggles /
  gives a text field the keyboard, ○ (or the touchpad) back to the level.
  World-map nodes carry `data-pad-focus`.
- **Song editor** (`SongEditorModal.padAction`; `SONG_ACTIONS` +
  `SONG_ACTIONS_L2/_R2`, the NotationEditor's own methods; ruled
  2026-11-24): ←/→ edit cursor (← onto a note, → back to the end), ↑/↓
  pitch cursor, ✕ past an entry (the end, where it opens) a NEW note at
  the pitch cursor, on an entry (after ←) its pitch on/off — a chord tone,
  a creature's note moved (the palette's dot chosen: the dots, none → one → two →
  none; its tie chosen: tie / untie the note under the pitch cursor), R2+✕
  a rest of the chosen duration (if it fits; the designer asked for R2+✕ =
  tie, but it stays insert-rest by their earlier ruling — the tie card is
  the way), □ note → rest → gone, L2+↑/↓ accidental of the
  note under the pitch cursor, L1/R1 the PALETTE only, a card left / right
  (32nd … whole, dot, tie: R1 is longer), L2+L1 / R2+R1 the note at the
  cursor shorter / longer (the palette's way), L3 undo, R3 redo,
  L2+✕ a new note BEFORE the entry the cursor is on (past the end:
  appended, as ✕), △ play/stop, Share other staff, Options the popover
  (clef, copy a song from any other gate / creature / fountain, Clear;
  d-pad walks, ←/→ steps a dropdown, ✕ commits, ○/Options
  back), ○ close. L2 / R2
  alone do nothing; the legend shows `song+l2` / `song+r2` while held.
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
