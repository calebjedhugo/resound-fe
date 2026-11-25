# Resound - CLAUDE.md

## Project Overview

**Resound** is a first-person musical puzzle game built with Three.js and Web Audio API. Singing creatures unlock gates and activate fountains whose songs they sing; the player carries creatures with a telescoping pole — absorbing one into the slot strip and releasing it elsewhere (since 2026-11-23; recording and playback are retired).

**Tech Stack:** Vanilla JavaScript (ES2021), Three.js, Web Audio API, Vite

**Roadmap:** See `ROADMAP.md` for project status and planned features.

---

## Common Commands

```bash
scripts/dev-server.sh start   # THE dev server (port 5182) - editor at /editor.html, game at /
scripts/dev-server.sh stop    # (only when the user asks)
npm test           # Jest tests (watch mode)
npm run test:ci    # Jest tests (single run)
npm run build      # Production build
npm run lint       # ESLint (errors fail; must stay clean)
```

---

## Testing

**Read [`TESTING.md`](TESTING.md)** before writing or modifying tests.

Tests are integration-style: test behaviors through public APIs, mock only browser APIs.

---

## Code Style

- ESLint (Airbnb base) + Prettier, Husky runs lint-staged on commit
- Use absolute imports: `import GameState from 'core/GameState'` (not relative paths)
- Classes: PascalCase. Files: PascalCase for classes, camelCase for utilities
- Constants: UPPER_SNAKE_CASE in `src/core/constants.js`

---

## Architecture Notes

### IMPORTANT: Package boundaries

`audio` and `notation` are extracted to the published packages `resound-sound`
and `resound-notation`; **never hand-copy `dist/` into `node_modules`**.
`resound-notation` is a pure renderer; the game does not hand-draw notation.

**Currently both are local `file:` links** (`../resound-sound`,
`../resound-notation`), not registry versions — a pre-publish check that the
game still runs on what those repos have on `main`. This puts the game a whole
minor ahead on sound (registry `^0.1.0` → local 0.2.0, the additive-piano
rewrite) and ahead on notation's unpublished in-measure accidental memory.

Once those versions publish, point `package.json` back at registry ranges and
delete this paragraph — nothing else has to change. Two `SongEditorIntegration`
tests assert the accidental-memory behavior and are correct for the local
library and for anything published after it; they would only need loosening to
go BACKWARD to notation 1.0.0 (both numbers are in their comments).

Run `npm ls resound-sound` after any relink: two copies in the tree gives two
AudioContexts and two instrument registries.

- Game UI imports from `resound-sound` and `resound-notation` (not `audio/` / `notation/`, which no longer exist)
- The **staff editor is local game code** (`src/editor/ui/NotationEditor.js` + `model/SongModel.js` + `ui/RhythmPalette.js` + `ui/staffCoords.js`) built on the published renderer's public API (`render()` + `components/*` + `lib/*`). `SongEditorModal.js` wires it to the entity model (`onChange` → `undoManager`) and plays it in a creature's voice (`resound-sound` `Theremin` on a `Sequencer`). See `src/editor/CLAUDE.md`.

### Puzzle Editor (`src/editor/`)
- Separate Vite entry point: `editor.html` (access at `/editor.html` during dev)
- **EditorPuzzleModel** is the central mutable data model; **UndoManager** wraps it
  (snapshot history, capped at `MAX_UNDO_STEPS` = 500, oldest dropped)
- Serialization handles type-specific JSON format differences (creature `data.song` vs gate root `song`)
- The notation editor is local code on top of published `resound-notation` — see `src/editor/CLAUDE.md`
- **The viewport draws the game's look** (`editor/viewport/GameLookLayer`,
  default; V toggles the schematic primitives): built with the game's own
  builders (Floor, `Wall.buildBatch`, Ramp,
  `Gate.buildClosedMesh`, NotationDisplay, CreatureLook, createSky) — a look
  change goes in the game modules, never a fork. A previewed song (song
  editor Play, A) lights its creature as in game
- **Play** (▶, Cmd/Ctrl+Enter, the pad's Options menu) saves and plays IN
  THE EDITOR'S TAB (`editor/play/PlayPreview`): the camera glides to the
  player's eye at the spawn (`core/playerView` + `EYE_HEIGHT`/`VIEW_*` in
  constants — never copy those numbers) while the game loads unseen in a
  same-origin iframe (`/?puzzle=<id>&from=editor`, `core/playLink`
  messages), then cross-fades to it; Back to Editor (pause menu,
  Cmd/Ctrl+Enter) glides back. **Controller**: `editor/input/EditorGamepad`
  (mapping table `EDITOR_MAPPING`, legend `ui/PadLegend`) — see
  `src/editor/CLAUDE.md`

### Entity System
- All entities extend `Entity.js` base class
- Implement `update(deltaTime)` and `render()` methods
- EntityManager handles lifecycle (add/remove/update/render)
- **`Entity.dispose` frees the WHOLE mesh tree** (Group roots, child meshes).
  A geometry/material shared across instances (module-level statics, e.g.
  `Wall`'s and `Gate`'s boxes) MUST set `userData.shared = true` or the
  first unload frees it
- **Per-frame paths memoize what they pick out of an area's entity list**
  (`core/entityListMemo`: collision's blockers, a creature's possible sound
  sources), re-derived when the area's EntityManager changes the list (its
  `version`; never write `Area.entities` directly). So walls, gates and
  fountains NEVER move once placed (collision keeps their positions), and
  only a constructor gives an entity an `instrument`

---

## Puzzles

- **Schema:** `puzzles/schema.md`
- **Files:** `public/puzzles/*.json`
- **Manifest:** `public/puzzles/manifest.json`

To create a puzzle: add JSON file following schema, then add entry to manifest.

---

## Design Intent

**Read [`DESIGN.md`](DESIGN.md) before changing gameplay, matching, or editor validation.**
Several behaviors that look like bugs are designed — e.g. creatures may
legally self-solve puzzles, and there is no aiming at gates or fountains
(only the pole has a facing rule: it takes a creature in front of you, in
sight). When playtesting surfaces one, document it there
instead of "fixing" it.

---

## Key Gotchas

### Web Audio
- AudioContext must be resumed on user interaction (handled in main.js)
- resound-sound's master output (mute) runs through its **master limiter**
  (-3 dBFS, unity below it, a fixed 6 ms look-ahead), so creatures summing
  past full scale don't clip — never add another limiter or compressor here
- Don't create oscillators until needed (memory leak if not stopped)
- **Audio is built ahead** (`core/AudioPrewarm`, from `PuzzleLoader.buildArea`):
  every area's creature voices (`Theremin.warm`, one job per creature:
  its wavetable, shared per warmth). Flat out
  while the StartGate is up, else only in idle periods with room for the job
  (8 ms timer slices without requestIdleCallback) — an unwarmed note still
  plays, built lazily. Only work that builds something runs or sets a job's
  price (`isWarm`). A world reset drops the queued creature voices. (The
  tape's piano pre-render went with tape playback, 2026-11-23.)
- **Each creature's NEXT song is built ahead too** (`Creature.prepareNextSong`
  → `AudioPrewarm.prepareSong` → `Theremin.prepare`: the LINES it will
  start, unstarted and unconnected), asked for as a song ends and at
  construction, so the frame its onset lands in builds no audio node
  (creatures share onsets: The Star starts 10-11 notes in one frame). Idle
  time first; else forced `NOTES_LEAD_MS` before the song, ONE song per
  task, on voices already built (never builds a voice). The one exception:
  a creature let out of the pole has its voice AND first song built at
  the press (`AudioPrewarm.prepareNow`, ~1.4 ms on the key press): it
  sings on that beat or the next, on a fresh instrument.
- **Creatures sing as a THEREMIN with crackle** (resound-sound's
  `Theremin`, moved into the library 2026-11-24 unchanged in sound;
  `core/creatureVoice` rolls each creature's voice and reads it back from a
  spec; DESIGN.md "Creature voice"; it replaced resound-sound's `Random`
  2026-11-24). Its `play()` holds ties (chord members each on their own)
  and reads dots (`dotted: 2` = double); its note events carry
  `durationBeats` (a tied note's whole run: `Creature.noteOn` lights for
  it). Never re-implement the voice or its tie/dot timing here: change it
  in resound-sound (and re-null it there; the designer approved the sound). A song plays on continuous LINES (one per chord member;
  9 nodes each, kept 1.5 s past silence), so a note is only AudioParam
  automation: glide, dip, vibrato, crackle. Its wavetable is SHARED per
  warmth per context (never per creature or pitch). `Creature.dispose` calls
  `instrument.dispose()` (not `stop()`): lets no straggler note out of a
  song in progress; `Fountain.dispose` too (its song never outlives its
  area). A fountain's song hushes its area's creatures, never another
  fountain. The jest audio mock's `currentTime` follows (fake) `Date.now`,
  so a voice sees its notes end

### Musical Timing
- **NEVER use `Date.now()` or `performance.now()` for music** - always use MusicalClock
- **No grid in matching** (2026-11-24): heard notes are grouped into onsets
  by arrival (`CHORD_SPREAD_BEATS` 0.13: a chord's members come from
  different creatures, frames apart) and compared with each other — each
  target onset within `TOL_BEATS` (0.13) of where it is due from the take's
  first onset. Never snap heard notes to a grid on the listener's clock: a
  chord split across a grid line failed its take (control-test-2). A
  completed take is consumed up to its last note only
  (`Gate._consumeTake`), so a back-to-back performer's next take counts
- **A released creature sings its first note on the beat of the press**
  (ruled 2026-11-23, replacing clapping): within `RELEASE_LATE_GRACE_BEATS`
  (0.1) past a beat it is that beat (sounds at once, that song drawn back
  onto the grid via note offsets), else the next; its schedule
  restarts there (`Creature` `data.firstSingBeat`; `releaseBeatFor`). A
  creature REBUILT after a prune keeps its PHASE instead (`toSpec` `phase`:
  next sing beat modulo its `period`, from the world clock, core/WorldMemory).
  **Every song is on the beat** (2026-11-24): `nextSingBeat` advances by
  `period` and never slips; each song's lateness (a frame, or the last
  song's timers when back to back) is drawn back onto the grid, by at most
  half the first note: the WHOLE song (every element's `offset`), so its
  first note sounds that much shorter and the song ENDS on the grid —
  a one-note or one-chord back-to-back singer too (it drifted a frame a
  loop when only the notes after the first were drawn back, 2026-11-25;
  resound-sound's overdue elements). Heard notes still report their
  written value (matching reads it). A stall janks but NEVER drops a note
  (the late song is sung whole and catches up) — so creatures released on
  the beat stay together loop after loop. No clapping (C
  does nothing in the world; Circle only backs out of menus)
- Matching tolerates sounds AFTER the aligned window but a foreign note
  INSIDE it corrupts, and (ruled 2026-07-16) a wrong note is judged
  IMMEDIATELY — red flash on the note itself, creature noise included —
  and LOCKS a gate out (`Gate.MISMATCH_LOCKOUT_MS`: heard notes voided,
  deaf for the window, red glow decays across it). So a gate's song must
  START clean; it can no longer ride in behind wrong notes. Fountains
  flash immediately but don't lock out. See DESIGN.md "Matching"
- Gates/fountains judge via `evaluatePhrasesCached` (`core/phraseMatching`):
  re-judged only when what it reads changes or the verdict's next turn
  passes, never per frame. So a listener's `capturedNotes` is APPEND-ONLY:
  push, or replace the array — never edit it in place

### Creatures
- Harmony forces apply only WHILE the creature is singing and another note
  sounds within the creature's OWN audibleRange (the listener's range, not
  the source's — unlike gate audibility). The player sings nothing (since
  2026-11-23); tests sound a song through the harness's test singer
- Perfect intervals (unison, octave) don't affect movement
- **`interval` = beats between song STARTS**, not the rest gap — it must
  exceed the song's length or the creature sings continuously (and never
  moves): then its songs start `period` = the song's length rounded up to
  a whole beat apart, back to back on the beat (`Creature.period`)
- **Look = ball lightning, visual only** (`entities/CreatureLook.js`, DESIGN.md
  "Creature look"): floats (mesh placed only via `placeMesh`); colour from the harmony
  it hears via `forEachSoundSource` — the forces' source model; never add a second one
- **Creature colour rules are sourced** (`core/messiaenColour.js` header cites
  each): don't "simplify" the table or rules without a source. Check any
  change in the dev puzzles `colour-gallery` and `colour-harmony`
- **Creature materials are SHARED** (one body + one halo `ShaderMaterial`,
  `userData.shared`): per-creature state lives in `look._uniforms` and is
  copied in by each mesh's `onBeforeRender` — never write a uniform on the
  material itself. Shader programs compile behind the StartGate
  (`core/ShaderPrewarm`: one never-disposed STAND-IN per program a look can
  need, which also keeps it across world entries: a world's materials go
  with it); a new material config hitches mid-game (or relinks at every
  world entry) unless it gets a stand-in — `ShaderPrewarm.test` checks
  every look, in every state, against them (extend its looks)

### Gates & elevation
- **Gates LATCH**: they open on the COMPLETED song, stay open with NO timer,
  and close when the player walks through (`Gate.update` for plain gates;
  `PortalManager` consumes linked crossings). The notation never hides. No
  permanent `isActivated` on gates (fountains still latch). Collision/hints
  key off `isOpen`. See DESIGN.md.
- **Gates can link across puzzles (portals)**: `link: {puzzleId, gateId}` on
  a gate makes it a door — walking into it while OPEN swaps to the linked
  puzzle (`core/PortalManager.js`; the held creatures persist). A link may target a
  gate in the SAME puzzle (in-level teleport door; never a gate to itself).
  Links are bidirectional and editor-managed via `editor/io/portalLinks.js`
  — never hand-author one-way links. See DESIGN.md "Gate links / portals" +
  `puzzles/schema.md` "Gate Links".
- **The world is AREAS, not one puzzle**: `core/Area.js` owns each puzzle's
  entities/scene/elevation grid; `PortalManager` keeps the active area +
  link-depth-1 neighbors FULLY LIVE (simulating every frame).
  `gameState.entities`/`elevationGrid`/`currentPuzzle` are getters that
  delegate to the ACTIVE area — simulation code must use `entity.area`
  (a neighbor's entities must never reach active-area matching, absorbing,
  collision, or forces except through the doorway model).
- **Neighbors build in IDLE time** (`PuzzleLoader.buildAreaWhenIdle`): their
  staves engrave in `requestIdleCallback` slices (`core/idleSlices`), then
  the area assembles AND registers in ONE slice. **Never split assembly**:
  entities register listeners and read the world clock in their
  constructors. Staff textures are SHARED per distinct staff (song + meter
  + key; `NotationDisplay`, ref-counted) — never dispose a notation `map`
  directly (it may still be queued for its idle-time GPU upload,
  `NotationDisplay.uploadInIdleTime`, which would revive it). Once
  registered, a neighbour goes to the GPU in idle time too, before any door
  into it opens (`PortalManager._warmInIdleTime`: a few pieces a slice drawn
  into a 1x1 target, the rest hidden for that draw, from two eyes so every
  staff plane draws). Puzzle JSON is cached per world (`PuzzleLoader.load`;
  `clearCache` at every world entry, so editor saves show up)
- **Open linked gates are see-through**: the `facing` face shows the LIVE
  neighbor area (`core/PortalView.js` renders the neighbor's `Area.scene`).
  The extra pass runs only while a linked gate is open; a closed linked gate
  looks identical to a normal gate. ALL FOUR faces of an open door are
  materialized eagerly and WRITTEN ONCE before anything samples them (a
  door into another area: its eye-side faces by their first player pass;
  every other face by one straight-on warm-up), THEN the eye's passes run —
  the frame a door appears already shows the player's perspective. Every
  face gets that write in the frame its door opens (holding back the ones
  nothing could show yet took a walk ahead that cost what it saved, and
  its writes landed on the next frames: 2026-10-18). A panel never shows
  before its first write (`PortalView.written`), and stays
  VISIBLE whatever side the player's eye is on (front-side culling
  hides them from behind) — a panel is sampled by OTHER portals' passes
  (mirror sightlines, the waystone gate's mapped eye), and a lazily-created
  or hidden face used to sample as a BLACK hole until the player looked at
  it directly (the teleport stress test, fixed 2026-07-18). **Views OUTLIVE
  crossings**: kept while both their areas stay loaded (`_retargetViews`
  moves each between the main scene and `Area.scene` and hides doors out of
  play), freed when either area prunes — a same-area teleport changes
  nothing, a round trip finds the old doors as it left them. Freshness is
  three-tier: player-eligible faces render fresh each frame (level 0); the
  recursive MIRROR SWEEP (`_mirrorSweep`) does a budgeted BFS of the
  portal graph from every same-area door that ACTUALLY DREW this frame,
  composing mapped eyes hop by hop and re-rendering — deepest level first
  — each mirror-only face a chain shows that the player pass didn't draw,
  so a creature seen N portals deep updates at full frame rate. A chain
  shows only its SIGHT: the pyramid through the part of each panel on
  screen, padded for the NEXT frame since a panel shows last frame's sweep
  (`SIGHT_MARGIN` past the panel's edges covers the eye's step at every
  depth; `_SLACK` past the screen's, widened by the view's real turn, and a
  fast mouse turn takes each seed's whole panel until it settles; a panel
  under 1% or showing its own door: all of it), narrowing hop by hop — a face
  outside every sight is the rotor's (caps:
  `MIRROR_MAX_DEPTH`/`_PASSES`/`_FRONTIER`, spent shallowest-first then
  biggest-on-screen-first, so the cap keeps what is in sight; self/partner
  recursion still rides the double-buffered cascade; cross-area door
  interiors unchanged); and faces in NO sightline fall back to the stale
  rotor (`_refreshStaleFaces`, past `STALE_MAX_FRAMES`, the sweep's
  overflow first, then oldest-first, bounded per frame) so nothing ever
  freezes in time — it idles in frames that draw no door panel (nothing
  could show its faces). A face outside every sight of a sweep that walked
  all its chains (no cap hit) takes turns: one every `STALE_UNSEEN_EVERY`
  (3) frames — so a flick from rest can show such a face's last picture
  (the right door, straight-on) for one frame, up to ~3 frames per such
  face old (The Star, all doors: ~2-3 s). Keyed off `_playerFresh` (a face that was
  ELIGIBLE but frustum-culled still needs a mirror render). Freshness ages
  in REAL frames: the waystone gate's mapped-eye door pass
  (`renderPortalsFor`) counts none. Its pad panels age via their own rotor
  (DeployManager.renderPortal), and a frame with no pad pass to run (gate
  off screen) skips that door pre-pass too.
- **Door passes cost what the screen shows** (2026-10-17): each pass's
  target fits its panel's densest size ON SCREEN (`portalMath.panelFootprint`,
  `PortalView._fitTarget`: twice its texels, `SUPERSAMPLE` — 1:1 drew a far
  door's staff visibly softer than half-res did — and where a staff's lines
  are about a pixel tall (a 32-64 px panel) four times across, eight up:
  twice drew them lighter or broken; then power-of-two per axis, 32 px
  floor, half-res cap — a door filling the screen keeps half-res; grows at
  once, shrinks after 30 passes asking less). Mirror and warm-up
  eyes borrow the player's look and lens (`eye.pose`); a straight-on warm-up
  (first write, stale rotor) shows only through other doors' panels, far
  smaller than its stand-in eye sees it: half that eye's texels
  (`STAND_IN_SUPERSAMPLE`). A panel under `SMALL_PANEL_SHARE` (1%) of the
  screen re-renders one frame in three (`_restsThisFrame`) — never while a
  creature shows through it, after an eye jump, or when its picture is
  another eye's, old, or outgrown, or (a door into its own area, its
  picture showing a panel of that door) was drawn over such a picture (its
  door-in-a-door copies it: back on screen it draws twice running)
- **Doorway sound**: cross-seam audio = listener→gate + partner-gate→source
  (the SOURCE's range rules); closed doors leak (`CLOSED_DOOR_LEAK_DISTANCE`).
  A linked pair is ONE door: same song, mirrored open state, and SHARED EARS
  (ruled 2026-07-11) — a sound within source-range of EITHER face corrupts
  or completes the door, with NO leak between the pair's own faces (a jam
  beside one face jams both sides). Tempo blends near mismatched doors; ONE
  world clock persists across crossings — a crossing swaps areas, never
  rebuilds. See DESIGN.md "Gate links".
- **Floor = tiles** (2026-11-24, `core/floorTiles`, schema "Floor tiles"):
  a level with `tiles` is walkable exactly there (`ElevationGrid.fromTiles`,
  sparse, negative cells AND negative storeys = subfloors; no perimeter
  walls; the floor's edge is a cliff, its geometry `Floor`
  `buildTileGeometry`, uniform at every storey);
  one without is the older full `gridSize` grid + `floors` + perimeter.
  Bounds checks go through `ElevationGrid.inBounds`, never `gridSize`
- **Walk-under**: elevated floors are platforms with walkable space beneath.
  `ElevationGrid.getLevelsAt(x, z)` lists a cell's walkable levels; movers pass a
  `priorLevel` to `getFloorY`/`getEffectiveElevation`/`canTraverse` to stay on
  their own layer. Change layers only via ramps. `motion.js` and the test
  harness's movement integrator (`testUtils.js`) must stay in sync.
- **Collision response is centralized** in `core/SlideResolver` (`resolveSlide`):
  elevation-aware, axis-separated **wall/cliff sliding** — a mover hitting a
  surface at an angle slides ALONG it instead of stopping dead. Used by
  `Creature.updateMovement`, `motion.js`, and `testUtils.js`; keep those three
  routed through it (don't reintroduce a local "revert both axes on collision").
- **Level `awakening` is generated** by `puzzles/gen-awakening.js` (has a
  built-in constraint checker: `node puzzles/gen-awakening.js
  public/puzzles/awakening.json`). Edit the generator + rerun; don't hand-edit
  `public/puzzles/awakening.json`.
- **The POC world (`poc-*`, NINE portal-linked areas, the boot entry) is
  now HAND-EDITED in the editor** (designer pass 173fd15) — the files drift
  from `puzzles/gen-poc.js` BY DESIGN. `node puzzles/gen-poc.js` is
  CHECK-ONLY (builds the model + runs asserts, writes nothing); **NEVER pass
  `--write`: it REWRITES all nine JSONs and clobbers the hand edits** (a
  then-unflagged run did, on 2026-07-16 — recovered from git). The generator
  + its 480+-assert checker are kept as v5 reference only. v5 chain (round-4 restructure):
  threshold → two-keys → duet → jam → dance → pull → push → clap → return
  ("The Star"); `poc-climb` was cut. STRICT element economy: every exit's
  (pitch, length) elements are recordable in its own area or earlier, never
  from earlier alone; the finale's fresh elements (incl. the two HALF notes
  ending each Twinkle phrase) exist only in area IX; F4|1/4 is IX-only.
  Creatures are always VISIBLE — penning is a cliff-edged plinth (jam at
  E2, clap pair at E1), never opaque walls. Ends with the `ending: true`
  finale portal into area I (thanks-for-playing overlay). See DESIGN.md
  "Onboarding" (incl. the v5 relaxed pull/push guards awaiting a ruling).
- **Gates open on the COMPLETED song, LATCH open (no timer), and close when
  the player walks through** — a correct in-progress performance only FADES
  the shell toward (bounded) transparency, never opens it; a parked
  performer's completions keep a door open behind you; `alwaysOpen: true`
  marks a permanently-open face (one-way doors). See DESIGN.md; don't "fix"
  a door that ignores a correct first note or one that "won't close".
- **Walls render BATCHED**: ALL of an area's walls draw as ONE
  `InstancedMesh` (`PuzzleLoader.buildArea`; one mesh per wall was the
  dominant frame cost — profiled 2026-07-16; walls near doors stayed
  meshes until 2026-11-22). **Every wall entity has `mesh: null`**
  (collision/elevation/editor use entity data). A door pass hides its
  eye-side walls PER INSTANCE in the walls' vertex shader:
  `PortalView.wallHide(camera)` → `Area.hideWalls(spec, approachSpec)` →
  `portalMath.wallHiddenBy` (JS) / `WALL_HIDE_GLSL` (its twin — change
  both); `Area.isWallHidden(wall)` answers for tests. `Area.staticWalls`
  holds the batch. **Walls join** (2026-11-25): one storey tall
  (`WALL_HEIGHT`); each batch has its OWN geometry (freed with it) whose
  instance attributes leave out faces against a neighbouring wall, the
  bottom, the top under a stacked wall (`aSideHide`/`aTopHide`) and shade
  a column as one face (`aStack`); in a tile-built level the Floor draws
  every wall top as walkable floor (`ElevationGrid.addWallTops`,
  `Floor.buildTileGeometry`) and the batch leaves tops and rims out
  (`floorTops`). The floor is ONE merged mesh per area too (`Floor`:
  ground + slabs + cliff-edge lines)
- **Environment look** (`entities/EnvironmentLook.js`, DESIGN.md
  "Environment look", APPROVED direction): sky (one shared mesh per
  `Area.group`, drawn last among opaques at infinity, a function of view
  DIRECTION only, its azimuth 4-fold so quarter-turn doors agree), wall +
  floor shaders lit by `Area.light` (creatures' glow, refreshed in
  `Area.update`; the floor has NO cell grid), lightning and the storm's
  answer to gate solving ticked by main.js `update`
  (`tickEnvironment(dt, activeArea)`, `calmStorm()` at world entry). All
  unlit ShaderMaterials in DISPLAY values (no output encode), all honour
  clip planes; a new one needs a `standInMaterials` entry (ShaderPrewarm)
- **The storm answers gate solving** (DESIGN.md): `Gate.solveProgress`
  (the shell fade) of the active area's gates, the furthest along (nearer
  counts more), builds `WORLD_UNIFORMS` uStorm/uDeckTime/uStormCol/uStrike
  — SHARED uniform objects every environment and entity material holds,
  so every scene and door shows one storm. Its colour is the creatures'
  (`CreatureLook.harmonyLightInto` of `messiaenColourCached` over
  `Gate.soundingHeardInto`: the gate's own captured notes still sounding);
  `Gate.openings` counts openings, each strikes. Keep it 4-fold symmetric
  and area-independent (no per-gate direction in the sky)
- **Entity look** (`entities/EntityLook.js`, DESIGN.md "Entity look"):
  gates are a per-gate unlit ShaderMaterial (`createGateMaterial`: state in
  uniforms uOpacity/uProgress/uLockout, `bindAreaLight` on first update;
  `Gate.lockoutGlow` reads the red). A CLOSED gate lights every edge of its
  faces toward the eye ("normal corners"). An OPEN gate, door or plain,
  draws no shell at all. **An open door's outline is a soft seam in its
  view panels, drawn ONLY by the main view** (each PortalView panel is
  plain opaque `showStoredTexels` everywhere, and wears its
  `createSeamMaterial` while `renderMainView` draws:
  `passContext.wearInMainView`) **and ONLY along the portal's outline from
  the eye** (an edge where one box face turns toward the eye and the other
  away, gone by the time the face across is edge-on: `outlineAt` /
  `portalBandAt` / `portalSeamAt` + their GLSL twins — change both): over
  a thin band where the sight enters the box the panel's picture blurs and
  fades into the world behind it; past it the panel is untouched. The seam
  material is transparent but drawn first among transparent things
  (`PANEL_RENDER_ORDER`), writing depth. Its hook gets the eye from the
  view matrix (three hands MeshBasicMaterial no `cameraPosition`). The
  deployed waystone gate's seam leans gold (`seamTint`, PortalManager).
  Ramps share ONE geometry (wedge + posts) and ONE material, lit per ramp
  via `onBeforeRender` → `bindRampLight` (uniformsNeedUpdate, like
  creatures). Waystones stay MeshStandardMaterial with the shared
  `WAYSTONE_RING_MAP` emissive map
- **ONE pass context for every scene draw** (`core/passContext.js`; ruled
  2026-10-16). three keys a material's shader program by clip-plane COUNT,
  output colour space, instancing and the scene's lights; a material drawn
  under two contexts re-derives its program at EVERY pass switch (~200/frame
  in The Star ≈ 4 ms/frame at 4x CPU, measured 2026-10-12). So: every pass
  binds exactly `CLIP_PLANE_COUNT` (2) planes — the main view no-op planes
  (`renderMainView`), a PortalView `[shared, own]` (approach panel: own
  twice); every target that draws world scenes is a `createSceneTarget`
  (three's internal `isXRRenderTarget` flag + sRGB + RGBA8: it renders in
  the CANVAS colour space, so doors blend/quantize like the main view) and a
  material showing one uses `showStoredTexels` (no second encode);
  ShaderPrewarm warms that single context; walls get a per-AREA material
  (`Wall.createBatchMaterial`, freed by `Area.dispose`). **three is pinned to 0.153.x for this** (`^0.153.0`): re-verify
  passContext before any upgrade. Check: `__resoundDebug.countProgramDerivations()`
  ≈ 0/frame
- **World matrices update ONCE a frame per scene** (`core/sceneMatrices`): the
  main scene and every `Area.scene` a pass draws run with
  `matrixWorldAutoUpdate` off; main.js `render()` and `PortalView.render`
  update each before its first pass. **Render-time code must never MOVE
  anything** (visibility/material toggles only), and an object added
  mid-frame computes its own `updateMatrixWorld()` (doorway surfaces do).
  Door passes skip what they can't draw: `scenePieces` measures a scene's
  pieces (topmost meshes under its groups, subtree spheres) once a frame on
  its second pass, and `PortalView` hides those wholly outside its frustum or
  past a clip plane — three draws the same, in the same order
  (`doorPassDraws.test`); a piece whose child count changed mid-frame is
  left to three
- **Passes skip invisible staff planes**: a pass leaves out every notation
  plane it would paint at opacity 0 (seen from behind/edge-on, texture
  pending) via hooks `NotationDisplay` chains onto each scene's
  `onBeforeRender`/`onAfterRender` — chain onto those, never assign them

### Onboarding
- No controls overlay; teaching = wordless key hints (`ui/KeyHints.js` +
  `core/HintMemory.js`). Hints are PUZZLE-DRIVEN: puzzle JSON declares
  `teaches: ["move", ...]`; each lesson happens ONCE per playthrough
  (ruled 2026-07-16 — performing it retires the hint; crossings never
  re-arm, a fresh world entry resets), no browser storage. No `teaches` =
  all hints eligible (dev levels); the editor round-trips the field. POC:
  `clap` at the clap is now a dead id (no clap hint since 2026-11-23;
  `slots`, the grow hint, retired the same day)
- Game boots into the FIRST manifest puzzle (`poc-threshold`), not the menu;
  `?puzzle=<id>` deep link wins (`&from=editor`, the editor's Play, adds the
  pause menu's Back to Editor: `core/playLink`). Inside the editor's iframe
  (`editorFrame`) the game builds only once told LANDED, keeps its start
  gate VEILED (`StartGate.veil`/`reveal`) and the pad off
  (`Gamepad.setActive`) until GO — see `src/editor/CLAUDE.md` "Play". Menu
  via Esc
- `ui/StartGate.js` freezes the world per level start until a key/click.
  It goes up BEFORE the puzzle loads (`showLoading`: the first paint) and
  is wakeable only once the world is built (`show`)
- **Controller** (`core/Gamepad.js`, DESIGN.md "A game controller"):
  polled at the top of main.js `update()`, game only (the editor has its own
  mapping, `editor/input/EditorGamepad`, over the same `findPad`/`readStick`).
  Buttons dispatch SYNTHETIC keydown/keyup (`fromGamepad: true`) on window,
  so every key listener just works — map new pad actions to a key, don't
  teach listeners about pads. Sticks are analog `gameState.input.stick`
  (exactly 0 at rest, so motion's at-rest skip holds), rest outside play;
  in a menu (`poll(awake, menu)`) the left stick presses ↑/↓ (repeating).
  A pad press is NO user activation, nor is Esc (HTML spec): the StartGate
  wakes on either only with audio running (`_wakeIntoSound`); never let it
  drop into a silent world. Share = KeyP (sound on/off)
- **Hints follow the device in hand** (`core/InputDevice`, DESIGN.md "A game
  controller"): Gamepad calls `InputDevice.usePad(pad)` on a button DOWN or
  a stick LEAVING its dead zone (edge, not level: no flicker), BEFORE the
  key goes out; a real key / mouse button / ~24 px of mouse travel (window
  capture listeners) switches back. Family from the pad `id` (vendor id,
  else name): playstation / xbox / switch / generic. Glyphs and key names
  live in ONE table, `core/inputGlyphs` (`glyphFor`, `nameFor`; constants,
  no per-call allocation), drawn by `ui/glyphCanvas` in the hints' gold
  style. KeyHints/InventoryUI draw each family's glyphs ONCE (cached
  canvases/CanvasTextures; a sprite swaps `material.map`, same program —
  no new material, nothing for ShaderPrewarm). Text naming a key: use
  `nameFor(action, InputDevice.familyOf(event), InputDevice.padId)`
- **Sound on/off** (`core/Sound.js`, DESIGN.md "Sound on/off"): Settings
  `muted` -> resound-sound `audioContextManager.setMuted()` (fades the
  library's master output; needs resound-sound with `getOutput`/`setMuted`).
  Applied when the module loads (main.js -> createEventListeners imports it),
  before any sound. Toggled by P / Share (`createEventListeners`, any mode;
  the StartGate's capture listener swallows it while up) and the pause
  menu's "Sound" entry (relabels via `Sound.onChange`). **IMPORTANT: NEVER
  mute by suspending the AudioContext** — the musical clock and every
  schedule run off it; mute is the master gain only. Any new game audio
  must connect to `audioContextManager.getOutput()`, never `.destination`
- **Menus** (`ui/Menu.js`): entries = buttons + `[tabindex]`, real DOM
  focus; ↑/↓ move it (wraps), Enter/Space click it, C = `back()` (pause:
  resume). Pad = the same keys (d-pad ↑/↓ = ArrowUp/Down). World actions in
  `createEventListeners` act only while PLAYING, so menu keys never fall
  through; held-key flags still track (no stuck keys on resume). Menus
  listen on window in the BUBBLE phase, so a StartGate in front (capture +
  stopPropagation, e.g. loading the next puzzle) swallows their keys
- Dev-only `window.__resoundDebug` exposes `camera` + `renderer` +
  `syncCameraToPlayer` for scripted browser verification (reposition +
  screenshot), `setTapImpulse(true)` to re-enable the tap-impulse
  affordance, `setPoleSlowmo(factor)` to slow the pole's absorb/release
  animations (screenshot mid-deformation; a huge factor freezes it), and
  `countProgramDerivations(frames)` (shader-program re-derivations per
  frame; see "ONE pass context")
- **Performance: `await __resoundDebug.profile(frames)`** (`core/FrameProfiler`)
  times every frame phase (self + inclusive ms, keyed by caller), frame
  percentiles, draw calls and GPU ms PER PASS, derivations and heap; it
  unwraps itself after the run. It sees only the rAF callback: timer-driven
  notes and area builds show up only in its `longAnimationFrames`.
  `enter(puzzleId)` starts a fresh world and drops the start gate once the
  prewarm has seen the neighbors (audio stays suspended until a REAL key
  press). The dev server is cross-origin isolated so timers resolve to 5 µs

### Notation Coordinate System
- All notation *rendering* (engraving) lives in the published `resound-notation` package — the editor here consumes it — see that repo's docs for the coordinate model
- **When engraving looks wrong**: fix it in `resound-notation`, publish a new version, then bump this repo's dependency and `npm install`. Do **not** hand-copy `dist/` into `node_modules` (see `src/editor/CLAUDE.md`)

### The pole & the tape (ruled 2026-11-23; recording and playback RETIRED)
- **R absorbs, Space releases** (`core/AbsorbManager`, DESIGN.md "The
  inventory holds CREATURES"). R takes, of the creatures with
  `isAbsorbable` (active area, real distance ≤ `audibleRange × 0.5`, IN
  FRONT — body within `REACH_HALF_ANGLE` 40° of the effective camera yaw —
  and IN SIGHT: `core/poleReach` `lineOfSight`; `gameState.absorb.inRange`),
  the lowest `reachScore` (best centred, then nearest) into the cursor slot, or — the cursor slot
  holding one — a new slot at the end (`Tape.slotForAbsorb`); nothing in
  reach / a full strip = grey slot flash. Space releases the cursor slot's
  creature `RELEASE_DISTANCE` (2.5) ahead along the effective camera yaw,
  only on walkable floor of the player's layer where its radius fits and
  the eye can see it land (`releaseSpot`, `lineOfSight`); else grey flash.
  **The reach mark (×N), the R hint and R all read `inRange`** — never give
  one of them its own eligibility rule ONE pole action at a time. Plain presses
  (no tap/hold), keyboard and pad alike
- **A slot holds a SPEC, not a song**: `{id, spec, colour, css}`, spec =
  `Creature.toSpec()` (song, interval, audibleRange, size, maxSpeed,
  `voice`, `phase`). **Voice = the Theremin's rolled voice** (warmth,
  vibrato rate/depth, attack, glide, spark — rolled with Math.random, NOT
  from the creature id; `core/creatureVoice`), given to the new creature's Theremin
- **Commit points**: absorb — the creature is `hold()`-ed (instrument
  disposed: silent at once; no physics) and lands in its slot the moment the
  tip CONNECTS, its body leaves its area when drawn in; release — a fresh
  Creature built `dormant` (held: still, out of reach — but NOT `silenced`,
  so it sings from its release beat) in the active area at once, `wake()`-d
  when the pole is back. The release's extend + flare + pour are scaled to
  end just before that beat (min `RELEASE_MIN_EMERGE_S` 0.25 s). A crossing
  finishes the action at once (`finishNow`)
- **`core/WorldMemory`** (world-level, reset by `PortalManager.reset`; was
  CreatureRegistry): the world forgets nothing across pruning. Per puzzle
  id: each puzzle entity's `saveState()` (by `entities` index) snapshotted
  at prune and handed back by `PuzzleLoader.buildArea` (`restoreState`; a
  creature is BUILT from it: position, spec incl. voice + phase), the puzzle
  creatures absorbed (skipped) and the creatures released there (rebuilt).
  A new mutable field on Creature/Gate/Fountain belongs in its
  saveState/restoreState. Never let an area rebuild bypass buildArea. A
  deployed waystone gate retains its own area (`retainArea` is ref-counted)
- **The look**: `entities/PoleLook` — a telescoping rod drawn in its OWN
  scene right after the main view (`AbsorbManager.render` in main.js
  `render`), over its depth: never in a door/waystone/warm-up pass or an
  area group; its scene mirrors the world's lights so its programs match
  ShaderPrewarm's stand-ins (`standInMaterials`). The tip meets the creature
  on its near flank toward the hand (`CONTACT_FROM`) so the pull is seen
  from the side. The creature deforms in the SHARED body vertex shader
  (`uSuck` 0..1, `uTip` in object space; `SUCK_GLSL` + its JS twin
  `suckPoint` — change both), set by `CreatureLook.setSuck` (halo +
  `lightInto` fade with it; `frustumCulled` off while deformed)
- The strip (`core/Tape.js`, cap `TAPE_SLOT_CAP`): ←/→ move the cursor (→ on
  a filled last slot appends). No delete. **The cleanser is the WAYSTONE**
  (`entities/Waystone.js`, ruled 2026-11-23): it clears nothing, it only
  becomes the active waystone. Puzzle JSON type `cleanser` is an alias
  (`constants` `ENTITY_TYPE_ALIASES`, `PuzzleLoader.normalize`, the editor's
  import); the editor writes `waystone`. Under a LINKED door the portal panel would clip the tile to a
  sliver (it only paints past the window plane), so `PortalManager` mirrors
  it: a visual-only clone at the partner face, sharing the real tile's
  material so the glow syncs (`_rebuildTileMirrors`)
- `ui/InventoryUI` (was RecordingUI): slots show the held creature's orb +
  note count, a landing pop; the reach mark (pale ring, ×N) over the cursor
  slot pulses red during an absorb. KeyHints: the absorb hint (R) floats
  over `AbsorbManager.target()`, the release hint (Space, small) low over
  the release spot; their puzzle lesson ids stay `record` / `playback`
  (puzzle JSON vocabulary); `slots` is gone
- **The ACTIVE waystone + deployable waystone gate** (ruled 2026-07-18):
  stepping on a waystone turns it GOLD (one active tile world-wide) and
  makes it the destination of the player's deployable gate. G cycles
  aim → deploy → remove (`core/DeployManager`): a phantom waystone two
  tiles ahead along the EFFECTIVE camera heading (mouse offset included;
  free placement, NOT grid-quantized, red = invalid), deployed as a
  `WaystoneGatePad`; walking into the gate teleports to the active
  waystone (`PortalManager.teleportToWaystone`, cross-area, loads on
  demand) and consumes it. The deployed gate LOOKS LIKE any activated
  gate: a box of see-through PortalView panels (one per face; pad mesh
  is an empty anchor at gate-center height). The gold tile shows AT the
  gate via a mirror clone (the panel aperture would clip the arrival
  cell's tile to a crescent — same fix as door tile mirrors; a tile in
  ANOTHER area gives the clone its own material, synced each update — one
  lit material in two scenes re-derives its program at every switch), and
  doors seen through the gate are themselves see-through: the pad pre-pass
  renders door views for its MAPPED eye (active-area doors via
  `renderPortalsFor`, a neighbor destination's own doors via
  `renderAreaPortals`, hidden again after sampling). Its area is
  RETAINED (`PortalManager.retainArea`) while the gate exists; views
  retarget when a new waystone is claimed. One-way, one use; arrival
  fires the
  waystone (no tape wipe since 2026-11-23); world state does NOT reset.
  Taught in IX via `teaches: ["deploy"]` (G keycap HUD hint, retiring
  only when a gate is removed/walked through; while deployed the hint
  wears a 🚫 badge — G means cancel). Aiming requires an active
  waystone. See DESIGN.md "The ACTIVE waystone"

---

## Development

- **IMPORTANT: ONE dev server, shared with the designer** — Vite on
  **http://localhost:5182**, managed by `scripts/dev-server.sh`
  (start|stop|status|open). The designer launches it from the Dock app
  `~/Applications/Resound Dev.app` (built by `scripts/dev-app/build.sh`,
  icon `scripts/dev-app/icon.svg`; rebuild if the repo moves), which opens
  the editor in a Chrome app window; the server outlives the window. Claude
  develops against the SAME server: `scripts/dev-server.sh start` if it's
  down (idempotent). NEVER start a second Vite (`npm start`, another port,
  a launching `preview_start`) and NEVER stop it unless asked. It serves the
  main checkout, so edits hot-reload the designer's window. See the
  `dev-server` skill for browser-page rules (isolated context + mute)
- **Editor ⇄ game in dev builds**: the editor's toolbar "Game" button and
  its Options menu "Game mode" load the game (`/`, main menu;
  `EditorApp.openGame` lands the last edit first); the game's main menu and
  pause menu offer "Editor" (to the editor on the level played). Gated on
  `import.meta.env.DEV` in main.js, so the shipped game has neither
- **Deployment:** **POC build is LIVE at https://resound.calebhugo.com** (Pi
  static hosting, nginx `127.0.0.1:8100` behind the `calebhugo` Cloudflare
  Tunnel — same house pattern as the other `*.calebhugo.com` apps). Deploy with
  `./deploy/deploy.sh`: it builds the game alone (`RESOUND_BUILD=game`),
  stages a **POC-only** artifact (`deploy/build-poc.mjs` prunes
  `public/puzzles` to the `poc-*` set + a filtered manifest, precompresses),
  and uploads with `deploy/upload.sh` (assets first, `index.html` last, the
  previous deploy's assets kept). Hashed `/assets/` cache immutably (three +
  each resound package in its own chunk, renamed only when the package or
  the set of its exports used changes: keep `minifyInternalExports: false`,
  mangled export names follow import order), the rest revalidates; changing
  `deploy/nginx-resound.conf` is a by-hand install. See `deploy/README.md`.
- Puzzle JSON changes require manual refresh (no HMR)
- **The page can boot at 0x0** (a hidden in-app browser pane): view math
  treats a zero screen as no mouse offset, camera/canvas/screen center refit
  on `resize`, and `GameLoop` logs a throwing frame instead of dying (its
  first frame runs inside game init). A NaN view surfaces in three as
  `firstElem.toArray is not a function` (the clip-plane upload). The in-app
  browser console persists across reloads — log a marker before reloading

---

*Last Updated: 2026-11-23 — the Resound Dev Dock app and ONE shared dev server on 5182 (`scripts/dev-server.sh`, `scripts/dev-app/`); dev builds switch editor ⇄ game from their menus; earlier the same day — the editor's Play runs in the editor's own tab: the camera glides down to the player's eye while the game loads in a same-origin iframe, cross-fades to it, and glides back on Back to Editor (`editor/play/PlayPreview`; the separate game tab, its named-tab reuse and the same-tab undo-history stash are gone); earlier the same day — the editor draws the game's look (GameLookLayer; V toggles the schematic), previewed songs light their creature, Play opens the level in the game (Back to Editor in its pause menu), and the editor plays from a controller (`editor/input/EditorGamepad`); earlier the same day — the designer's pole rulings: the cleanser renamed the WAYSTONE (`cleanser` still loads); R absorbs only a creature in front (40°) and in sight (`core/poleReach`), the reach mark/hint/R on one rule; the world remembers every area's state across pruning (`core/WorldMemory`, was CreatureRegistry); a released creature sings its first note on the press's beat, which replaces clapping (ClapManager, ClapVisual, the C hint, `clapDisplacement` removed); earlier the same day — the pole: R absorbs a creature into the tape, Space releases it (`core/AbsorbManager`, `entities/PoleLook`, the body shader's suck deformation, `core/CreatureRegistry`); recording, tape playback and the waystone's tape wipe retired; earlier the same day — an open door's outline is a soft seam in its view panels (blur + fade into the world, main view only, gone before the emerging side shows), no open shell; the waystone gate's seam leans gold; 2026-11-22 — key hints follow the device in hand (controller glyphs by family: PlayStation, Xbox, Switch, generic; `core/InputDevice`, `core/inputGlyphs`); sound on/off (pause menu entry, P, Share; `core/Sound`, resound-sound's master gain, time runs on); environment look APPROVED; entities in it (`entities/EntityLook`: dark-glass gates with charging electric edges, rippling open gates/doors with the view untouched, slate ramps with chevrons, pale/gold waystone rings), the storm answering a gate being solved in the harmony's colour, no floor grid; earlier the same day — environment look DRAFT (storm-night sky, walls, floor, creature light; `entities/EnvironmentLook`), every wall in one instanced batch with per-instance door-pass hiding, one merged floor mesh per area, staff ink on a pale halo; menus played by keyboard arrows/Enter and the controller (d-pad/left stick, Cross, Circle; `ui/Menu`), world actions only in play; Esc wakes the start gate only into sound; 2026-10-18 — game controller support (`core/Gamepad`: analog sticks, buttons as synthetic keys, a start gate that only wakes into sound); a door's faces all written in its opening frame; door targets at twice their panel's pixels (four times across, eight up at 32-64 px, where a staff's lines are a pixel tall; straight-on warm-ups at half), neighbours handed to the GPU in idle time; each creature's next song built ahead (onset frames build no audio nodes); 2026-10-17 — area-build perf: idle-time neighbor builds, shared staff engravings, per-world puzzle cache, start gate up before loading; survive a 0x0 boot (hidden pane): finite view, resize refit, GameLoop outlives a throwing frame; creature colour reworked from the Messiaen sources (reflections by triad, complementary flicker, register lightness)*
