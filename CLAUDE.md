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
and `resound-notation`; the game consumes them from the **registry** (no local
copies — never hand-copy `dist/` into `node_modules`). `resound-notation` is a
pure renderer; the game does not hand-draw notation.

- Game UI imports from `resound-sound` and `resound-notation` (not `audio/` / `notation/`, which no longer exist)
- The **staff editor is local game code** (`src/editor/ui/NotationEditor.js` + `model/SongModel.js` + `ui/RhythmPalette.js` + `ui/staffCoords.js`) built on the published renderer's public API (`render()` + `components/*` + `lib/*`). `SongEditorModal.js` wires it to the entity model (`onChange` → `undoManager`) and injects a `resound-sound` `Synth` for playback. See `src/editor/CLAUDE.md`.

### Puzzle Editor (`src/editor/`)
- Separate Vite entry point: `editor.html` (access at `/editor.html` during dev)
- **EditorPuzzleModel** is the central mutable data model; **UndoManager** wraps it
- Serialization handles type-specific JSON format differences (creature `data.song` vs gate root `song`)
- The notation editor is local code on top of published `resound-notation` — see `src/editor/CLAUDE.md`

### Entity System
- All entities extend `Entity.js` base class
- Implement `update(deltaTime)` and `render()` methods
- EntityManager handles lifecycle (add/remove/update/render)

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

### Creatures
- Harmony forces apply only WHILE the creature is singing and another note
  sounds within the creature's OWN audibleRange (the listener's range, not
  the source's — unlike gate/recording audibility)
- Perfect intervals (unison, octave) don't affect movement
- **`interval` = beats between song STARTS**, not the rest gap — it must
  exceed the song's length or the creature sings continuously (and never
  moves, and clean recording takes become nearly impossible)

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
- **Open linked gates are see-through**: the `facing` face shows the LIVE
  neighbor area (`core/PortalView.js` renders the neighbor's `Area.scene`).
  The extra pass runs only while a linked gate is open; a closed linked gate
  looks identical to a normal gate. ALL FOUR faces of an open door are
  materialized eagerly, WARM-rendered once at creation (straight-on eye),
  and stay VISIBLE whatever side the player's eye is on (front-side culling
  hides them from behind) — a panel is sampled by OTHER portals' passes
  (mirror sightlines, the cleanser gate's mapped eye), and a lazily-created
  or hidden face used to sample as a BLACK hole until the player looked at
  it directly (the teleport stress test, fixed 2026-07-18). Only
  player-eligible faces re-render fresh each frame; the rest show their
  last content, stale but world-like.
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
- `ui/StartGate.js` freezes the world per level start until a key/click
- Dev-only `window.__resoundDebug` exposes `camera` + `renderer` +
  `syncCameraToPlayer` for scripted browser verification (reposition +
  screenshot), and `setTapImpulse(true)` to re-enable the tap-impulse
  affordance

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
  cell's tile to a crescent — same fix as door tile mirrors), and doors
  seen through the gate are themselves see-through: the pad pre-pass
  renders door views for its MAPPED eye (active-area doors via
  renderPortals re-run, a neighbor destination's own doors via
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
- **Deployment:** Planned for Raspberry Pi (static files via nginx)
- Puzzle JSON changes require manual refresh (no HMR)

---

*Last Updated: 2026-07-17 — static wall batching (per-area InstancedMesh; portal-jamb walls stay individual)*
