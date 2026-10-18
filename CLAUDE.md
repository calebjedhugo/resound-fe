# Resound - CLAUDE.md

## Project Overview

**Resound** is a first-person musical puzzle game built with Three.js and Web Audio API. Players record melodies from singing creatures and play them back to unlock gates and activate fountains by matching specific musical harmonies.

**Tech Stack:** Vanilla JavaScript (ES2021), Three.js, Web Audio API, Vite

**Roadmap:** See `ROADMAP.md` for project status and planned features.

---

## Common Commands

```bash
npm start          # Dev server (port 5173) - game at /, editor at /editor.html
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
- The **staff editor is local game code** (`src/editor/ui/NotationEditor.js` + `model/SongModel.js` + `ui/RhythmPalette.js` + `ui/staffCoords.js`) built on the published renderer's public API (`render()` + `components/*` + `lib/*`). `SongEditorModal.js` wires it to the entity model (`onChange` → `undoManager`) and injects a `resound-sound` `Synth` for playback. See `src/editor/CLAUDE.md`.

### Puzzle Editor (`src/editor/`)
- Separate Vite entry point: `editor.html` (access at `/editor.html` during dev)
- **EditorPuzzleModel** is the central mutable data model; **UndoManager** wraps it
  (snapshot history, capped at `MAX_UNDO_STEPS` = 500, oldest dropped)
- Serialization handles type-specific JSON format differences (creature `data.song` vs gate root `song`)
- The notation editor is local code on top of published `resound-notation` — see `src/editor/CLAUDE.md`

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
Several behaviors that look like bugs are designed — e.g. recording is raw
R-press→R-release (NEVER auto-trim), creatures may legally self-solve puzzles,
and there is no aiming. When playtesting surfaces one, document it there
instead of "fixing" it.

---

## Key Gotchas

### Web Audio
- AudioContext must be resumed on user interaction (handled in main.js)
- Don't create oscillators until needed (memory leak if not stopped)
- **Audio is built ahead** (`core/AudioPrewarm`, from `PuzzleLoader.buildArea`):
  every area's creature voices (`Random.warm`) and creature pitches for the
  tape's piano (the tape only holds creature notes; one velocity layer, 0.7).
  Flat out while the StartGate is up, else only in idle periods with room
  for the job — an unwarmed note still plays, built lazily. A world reset
  drops the queued creature voices (piano pitches stay)
- **A Random voice is ~0.6 MB** of Chrome wavetable per (creature, pitch),
  ~2.8 MB at 96 kHz (measured 2026-10-17): `Creature.dispose` calls
  `instrument.dispose()` (not `stop()`), which frees them and lets no
  straggler note out of a song in progress

### Musical Timing
- **NEVER use `Date.now()` or `performance.now()` for music** - always use MusicalClock
- Quantization happens to nearest 16th note
- Playback: Space performs the WHOLE tape (all filled slots, concatenated
  seamlessly — takes are stored dense); solo starts snap to the beat grid
  (late grace is `PLAYBACK_LATE_GRACE_BEATS`, tempo-relative); Space
  during a playback is ignored (one performance at a time)
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
  the source's — unlike gate/recording audibility)
- Perfect intervals (unison, octave) don't affect movement
- **`interval` = beats between song STARTS**, not the rest gap — it must
  exceed the song's length or the creature sings continuously (and never
  moves, and clean recording takes become nearly impossible)
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
  need); a new material config hitches mid-game unless it gets a stand-in —
  `ShaderPrewarm.test` checks every look against them (extend its looks)

### Gates & elevation
- **Gates LATCH**: they open on the COMPLETED song, stay open with NO timer,
  and close when the player walks through (`Gate.update` for plain gates;
  `PortalManager` consumes linked crossings). The notation never hides. No
  permanent `isActivated` on gates (fountains still latch). Collision/hints
  key off `isOpen`. See DESIGN.md.
- **Gates can link across puzzles (portals)**: `link: {puzzleId, gateId}` on
  a gate makes it a door — walking into it while OPEN swaps to the linked
  puzzle (`core/PortalManager.js`; recordings persist). A link may target a
  gate in the SAME puzzle (in-level teleport door; never a gate to itself).
  Links are bidirectional and editor-managed via `editor/io/portalLinks.js`
  — never hand-author one-way links. See DESIGN.md "Gate links / portals" +
  `puzzles/schema.md` "Gate Links".
- **The world is AREAS, not one puzzle**: `core/Area.js` owns each puzzle's
  entities/scene/elevation grid; `PortalManager` keeps the active area +
  link-depth-1 neighbors FULLY LIVE (simulating every frame).
  `gameState.entities`/`elevationGrid`/`currentPuzzle` are getters that
  delegate to the ACTIVE area — simulation code must use `entity.area`
  (a neighbor's entities must never reach active-area matching, recording,
  collision, or forces except through the doorway model).
- **Neighbors build in IDLE time** (`PuzzleLoader.buildAreaWhenIdle`): their
  staves engrave in `requestIdleCallback` slices (`core/idleSlices`), then
  the area assembles AND registers in ONE slice. **Never split assembly**:
  entities register listeners and read the world clock in their
  constructors. Staff textures are SHARED per distinct staff (song + meter
  + key; `NotationDisplay`, ref-counted) — never dispose a notation `map`
  directly. Puzzle JSON is cached per world (`PuzzleLoader.load`;
  `clearCache` at every world entry, so editor saves show up)
- **Open linked gates are see-through**: the `facing` face shows the LIVE
  neighbor area (`core/PortalView.js` renders the neighbor's `Area.scene`).
  The extra pass runs only while a linked gate is open; a closed linked gate
  looks identical to a normal gate. ALL FOUR faces of an open door are
  materialized eagerly and WRITTEN ONCE before anything samples them (a
  door into another area: its eye-side faces by their first player pass;
  every other face by one straight-on warm-up), THEN the eye's passes run —
  the frame a door appears already shows the player's perspective. A panel
  never shows before its first write (`PortalView.written`), and stays
  VISIBLE whatever side the player's eye is on (front-side culling
  hides them from behind) — a panel is sampled by OTHER portals' passes
  (mirror sightlines, the cleanser gate's mapped eye), and a lazily-created
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
  screen (+ `SIGHT_MARGIN`/`_SLACK` for last frame's sweep; a panel under
  1% or showing its own door: all of it), narrowing hop by hop — a face
  outside every sight is the rotor's (caps:
  `MIRROR_MAX_DEPTH`/`_PASSES`/`_FRONTIER`, spent shallowest-first then
  biggest-on-screen-first, so the cap keeps what is in sight; self/partner
  recursion still rides the double-buffered cascade; cross-area door
  interiors unchanged); and faces in NO sightline fall back to the stale
  rotor (`_refreshStaleFaces`, ≤ `STALE_MAX_FRAMES` old, the sweep's
  overflow first, then oldest-first, bounded per frame) so nothing ever
  freezes in time — it idles in frames that draw no door panel (nothing
  could show its faces). Keyed off `_playerFresh` (a face that was
  ELIGIBLE but frustum-culled still needs a mirror render). Freshness ages
  in REAL frames: the cleanser gate's mapped-eye door pass
  (`renderPortalsFor`) counts none. Its pad panels age via their own rotor
  (DeployManager.renderPortal), and a frame with no pad pass to run (gate
  off screen) skips that door pre-pass too.
- **Door passes cost what the screen shows** (2026-10-17): each pass's
  target fits its panel's densest size ON SCREEN (`portalMath.panelFootprint`,
  `PortalView._fitTarget`: power-of-two per axis, 32 px floor, half-res cap —
  a door filling the screen keeps half-res; grows at once, shrinks after 30
  passes asking less). Mirror and warm-up eyes borrow the player's look and
  lens (`eye.pose`). A panel under `SMALL_PANEL_SHARE` (1%) of the screen
  re-renders one frame in three (`_restsThisFrame`) — never while a
  creature shows through it, after an eye jump, or when its picture is
  another eye's, old, or outgrown
- **Doorway sound**: cross-seam audio = listener→gate + partner-gate→source
  (the SOURCE's range rules); closed doors leak (`CLOSED_DOOR_LEAK_DISTANCE`).
  A linked pair is ONE door: same song, mirrored open state, and SHARED EARS
  (ruled 2026-07-11) — a sound within source-range of EITHER face corrupts
  or completes the door, with NO leak between the pair's own faces (a jam
  beside one face jams both sides). Tempo blends near mismatched doors; ONE
  world clock persists across crossings — a crossing swaps areas, never
  rebuilds. See DESIGN.md "Gate links".
- **Walk-under**: elevated floors are platforms with walkable space beneath.
  `ElevationGrid.levels[z][x]` lists a cell's walkable levels; movers pass a
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
- **Walls render BATCHED**: each area's walls draw as ONE `InstancedMesh`
  (`PuzzleLoader.buildArea`; one mesh per wall was the dominant frame cost —
  profiled 2026-07-16, fixed 2026-07-17). Only walls near a linked gate stay
  individual meshes (`portalMath.inPortalHideBand`: the gate's row/column
  plus one cell off it — exactly what PortalView hide-sets must toggle per
  portal pass). **A batched wall entity has `mesh: null`** — never assume a
  wall has a mesh (collision/elevation/editor use entity data and don't
  care); `Area.staticWalls` holds the batch.
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
  ShaderPrewarm warms that single context; walls get per-AREA materials
  (`Wall.createMaterials`, freed by `Area.dispose`), batch apart from single
  walls. **three is pinned to 0.153.x for this** (`^0.153.0`): re-verify
  passContext before any upgrade. Check: `__resoundDebug.countProgramDerivations()`
  ≈ 0/frame
- **World matrices update ONCE a frame per scene** (`core/sceneMatrices`): the
  main scene and every `Area.scene` a pass draws run with
  `matrixWorldAutoUpdate` off; main.js `render()` and `PortalView.render`
  update each before its first pass. **Render-time code must never MOVE
  anything** (visibility/material toggles only), and an object added
  mid-frame computes its own `updateMatrixWorld()` (doorway surfaces do)
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
  `slots` only at the duet, `clap` only at the clap
- Game boots into the FIRST manifest puzzle (`poc-threshold`), not the menu;
  `?puzzle=<id>` deep link wins. Menu via Esc
- `ui/StartGate.js` freezes the world per level start until a key/click.
  It goes up BEFORE the puzzle loads (`showLoading`: the first paint) and
  is wakeable only once the world is built (`show`)
- Dev-only `window.__resoundDebug` exposes `camera` + `renderer` +
  `syncCameraToPlayer` for scripted browser verification (reposition +
  screenshot), `setTapImpulse(true)` to re-enable the tap-impulse
  affordance, and `countProgramDerivations(frames)` (shader-program
  re-derivations per frame; see "ONE pass context")
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

### Recording & the tape
- Can only record within creature's `audibleRange × 0.5`
- The inventory is a growable TAPE (`core/Tape.js`, cap `TAPE_SLOT_CAP`):
  ←/→ move the cursor (→ on a filled last slot appends), R records into
  the cursor slot IN PLACE. Digit keys are gone. There is NO per-slot
  delete (retired 2026-07-12) — clearing the whole tape is a `cleanser`
  entity (`entities/CleansingTile.js`): a pulsing walkable tile that
  empties the tape when you step onto it (edge-triggered, active-area
  only). A cleanse can leave an empty tape, so gen-poc.js still asserts
  every pocket is escapable from an empty tape. A cleanser MAY share a
  cell with a gate (editor allows it). Under a LINKED door the portal
  panel would clip the tile to a sliver (it only paints past the window
  plane), so `PortalManager` mirrors it: a visual-only clone at the
  partner face, sharing the real tile's material so the glow syncs
  (`_rebuildTileMirrors`); gameplay needs no mirror — crossing commits
  on entry and the REAL tile fires on arrival
- **The ACTIVE cleanser + deployable cleanser gate** (ruled 2026-07-18):
  stepping on a cleanser turns it GOLD (one active tile world-wide) and
  makes it the destination of the player's deployable gate. G cycles
  aim → deploy → remove (`core/DeployManager`): a phantom cleanser two
  tiles ahead along the EFFECTIVE camera heading (mouse offset included;
  free placement, NOT grid-quantized, red = invalid), deployed as a
  `CleanserGatePad`; walking into the gate teleports to the active
  cleanser (`PortalManager.teleportToCleanser`, cross-area, loads on
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
  retarget when a new cleanser is claimed. One-way, one use; arrival
  fires the
  cleanser (tape wipe — intended cost); world state does NOT reset.
  Taught in IX via `teaches: ["deploy"]` (G keycap HUD hint, retiring
  only when a gate is removed/walked through; while deployed the hint
  wears a 🚫 badge — G means cancel). Aiming requires an active
  cleanser. See DESIGN.md "The ACTIVE cleanser"

---

## Development

- **Dev server:** Port 5173 (Vite)
- **Deployment:** **POC build is LIVE at https://resound.calebhugo.com** (Pi
  static hosting, nginx `127.0.0.1:8100` behind the `calebhugo` Cloudflare
  Tunnel — same house pattern as the other `*.calebhugo.com` apps). Deploy with
  `./deploy/deploy.sh`: it builds the game alone (`RESOUND_BUILD=game`),
  stages a **POC-only** artifact (`deploy/build-poc.mjs` prunes
  `public/puzzles` to the `poc-*` set + a filtered manifest, precompresses),
  and uploads with `deploy/upload.sh` (assets first, `index.html` last, the
  previous deploy's assets kept). Hashed `/assets/` cache immutably (three +
  each resound package in its own chunk), the rest revalidates; changing
  `deploy/nginx-resound.conf` is a by-hand install. See `deploy/README.md`.
- Puzzle JSON changes require manual refresh (no HMR)
- **The page can boot at 0x0** (a hidden in-app browser pane): view math
  treats a zero screen as no mouse offset, camera/canvas/screen center refit
  on `resize`, and `GameLoop` logs a throwing frame instead of dying (its
  first frame runs inside game init). A NaN view surfaces in three as
  `firstElem.toArray is not a function` (the clip-plane upload). The in-app
  browser console persists across reloads — log a marker before reloading

---

*Last Updated: 2026-10-17 — area-build perf: idle-time neighbor builds, shared staff engravings, per-world puzzle cache, start gate up before loading; survive a 0x0 boot (hidden pane): finite view, resize refit, GameLoop outlives a throwing frame; creature colour reworked from the Messiaen sources (reflections by triad, complementary flicker, register lightness)*
