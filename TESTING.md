# Testing Philosophy

Integration tests that describe **what the system does**, not how it does it.

---

## Core Principles

**Test behaviors, not implementations.** Tests should survive any refactoring that preserves behavior.

- Test through public APIs only
- Mock external dependencies (Web Audio, Three.js, localStorage)
- Never mock internal modules - let them run together
- Describe tests in terms of user actions and expected outcomes

---

## Running Tests

```bash
npm test              # Watch mode
npm test -- --ci      # Single run (CI)
```

---

## Test Structure

Tests are **colocated** with the code they test:

```
setupMocks.js              # Browser API mocks (runs first)
setupTests.js              # Global ctx setup (beforeEach/afterEach)
src/
  __tests__/
    helpers/
      testUtils.js         # createTestContext and test utilities
      mocks.js             # Mock implementations
      drawList.js          # What three draws: draw lists, program keys, one pass in three's hook order
      glStub.js            # A stub WebGL2 context: the REAL three WebGLRenderer runs in node
    fixtures/
      puzzles/             # Test puzzle JSON files
  core/
    MusicalClock.js
    MusicalClock.test.js         # Timing tests
    AbsorbManager.js
    AbsorbManager.test.js        # The pole: absorb / release tests
```

---

## Writing a Test

A global `ctx` (test context) is automatically created before each test and cleaned up after. Tests are **async** because `tick()` uses fake timers to handle instrument playback.

```javascript
describe('Absorbing a creature (R)', () => {
  it('takes the creature in reach into the empty cursor slot', async () => {
    // Arrange: load a test puzzle with a creature in the pole's reach
    ctx.loadPuzzle('recording-basic');
    await ctx.tick(16); // Update creature state

    // Act: press R and let the pole's animation run out
    ctx.pressKey('r');
    await ctx.finishPole();

    // Assert: the slot holds the creature's spec; the creature left the world
    expect(ctx.getInventorySlot(0).song[0].pitch).toBe('C4');
    expect(ctx.getCreatures()).toHaveLength(0);
  });
});
```

A test that needs a song SOUNDED (a gate judging it, the harmony forces or
colour it gives creatures, the storm's answer) uses the **test singer**:
`ctx.startSinging(song, tempo?, range = 15)` sings it once from the player's
position in the player's area, heard by every listener as any source is
(it took the place of the player's tape playback, retired 2026-11-23);
`ctx.stopSinging()` silences it. Test-only — nothing in the game sings for
the player.

Test puzzles live in `src/__tests__/fixtures/puzzles/` and are registered in `testUtils.js`.

---

## Test Context API

All tests use `createTestContext()` from `helpers/testUtils.js`. This provides:

| Method | Purpose |
|--------|---------|
| **Puzzle Loading** | |
| `ctx.loadPuzzle(id)` | Load a test puzzle fixture |
| **Time Control** (async) | |
| `await ctx.tick(ms)` | Advance game loop by milliseconds |
| `await ctx.advanceBeats(n)` | Advance time by n beats |
| `await ctx.advanceMs(n)` | Advance time by milliseconds |
| `ctx.getCurrentBeat()` | Get current beat |
| **Input Simulation** | |
| `ctx.holdKey(key)` | Press and hold a key (w/a/s/d/r/space/shift/arrowleft/arrowright) |
| `ctx.releaseKey(key)` | Release a held key |
| `ctx.pressKey(key)` | Press and immediately release |
| **Player State** | |
| `ctx.setPlayerPosition(pos)` | Set player position directly |
| `ctx.getPlayerPosition()` | Get player position |
| `ctx.face(yaw)` | Face a heading, mouse at rest (0 = north/-z, -PI/2 = east/+x) |
| `ctx.faceToward(pos)` | Face a point (horizontally) |
| **Inventory (the pole)** | |
| `ctx.getInventorySlot(n)` | The creature spec a slot holds (`Creature.toSpec`), or null |
| `ctx.setInventorySlot(n, spec)` | Put a creature spec straight into a slot (null empties it) |
| `ctx.setActiveSlot(n)` | Set the slot cursor |
| `await ctx.finishPole()` | Run the pole's absorb/release animation to its end |
| `ctx.getCreaturesInRange()` | Creatures the pole can reach now (in range, in front, in sight: what the ×N mark counts) |
| **A test singer** | |
| `ctx.startSinging(song, tempo?, range?)` | A source at the player's position sings `song` once |
| `ctx.stopSinging()` | The test singer stops and leaves |
| **Entities** | |
| `ctx.getCreatures()` | Get all creatures |
| `ctx.getGates()` | Get all gates |
| `ctx.isGateOpen(gate)` | Check if gate is open |
| `ctx.isFountainActive(fountain)` | Check if fountain is active |
| **Notes** | |
| `ctx.getEmittedNotes()` | Get all notes emitted during test |

---

## What Gets Mocked

**Mocked (external browser APIs):**
- `AudioContext`, `OscillatorNode`, `GainNode` - Web Audio API
- `localStorage` - persistence
- Three.js scene/mesh creation - rendering

**Not mocked (tested as integrated units):**
- GameState
- MusicalClock
- AbsorbManager, WorldMemory, Tape
- ListeningManager
- SongMatcher, HarmonyAnalyzer
- Entity classes (Creature, Gate, Fountain)
- All utility functions

---

## Test Suites

| File | Behavior Tested |
|------|-----------------|
| `src/core/MusicalClock.test.js` | Beat calculation, quantization, tempo conversions |
| `src/core/AbsorbManager.test.js` | The pole: R absorbs the creature in reach into the empty cursor slot, or a new slot at the end when the cursor slot holds one; refused (grey flash) with nothing in reach or a full strip; the creature falls silent the moment the tip connects and is drawn in, near side first. Only a creature in FRONT and in SIGHT: refused behind, reached 40° either side of the heading to the body's edge (not 3° past), turned by the mouse with the view; the one faced preferred over a nearer one off to the side; a wall, a closed gate, a raised floor between them blocks it (open, the way is clear); the reach mark and the hint promise exactly what R does at every heading, walled or not. Space releases the cursor slot's creature 2.5 ahead on the floor, refused (grey flash) for an empty slot, off the grid, over a cliff edge, onto a ramp, into a wall or gate, past a wall's corner (where the player can't see it land), or where a creature is in the way; a released creature stays still and out of reach until the pole is back, sings, and a gate nearby hears it; one pole action at a time; a creature taken and let out sounds the same (its voice). Its first note on the beat it is let out: mid-beat, the next beat; just past a beat (the late grace), that beat at once, the rest of that song snapped back onto the grid (what the instrument is told to play); its schedule restarts from that beat whatever it sang on before; with time before the beat it has poured all the way out by then, with the beat close it sings while still pouring out. No creature duplicated or lost when its area is pruned and rebuilt (absorbed puzzle creatures stay gone, released ones live on where they stood, a released one taken again is gone, a new world starts afresh) |
| `src/core/Tape.test.js` | The slot strip: one slot at boot, → grows it only past a filled last slot, capped |
| `src/entities/Waystone.test.js` | Stepping on a waystone claims it as the active one (gold, positional) and flashes it; it leaves the creatures held alone; a neighbour area's waystone never fires; a puzzle saved with the old `cleanser` type loads as a waystone the player can claim |
| `src/core/WorldMemory.test.js` | The world forgets nothing: an area pruned and built again comes back as it was left — a creature pushed off its spot stands where it was pushed, keeps singing on its beat (the world clock, not the rebuild) in its own voice; an opened gate is open (no new opening counted); an activated fountain stays activated, its song not played again; the waystone last stood on is still gold; a new world starts afresh |
| `src/core/ListeningManager.test.js` | Gates/Fountains recognizing correct songs |
| `src/core/phraseMatching.test.js` | Anchored rhythm matching (embedded targets, rotations, prefixes, in-window extras, rests, chords, voices, trim horizon); the cached verdict gates/fountains use equals a fresh judgment at every call — over recorded play of real levels (`fixtures/listening/heard-streams.json`, with the verdicts from before the cache) and random streams — and is re-judged only when something new is heard or a turn passes |
| `src/entities/Fountain.test.js` | An activated fountain's song plays alone: its area's creatures stay hushed for the song (and until the last of overlapping songs ends; given back even if the song fails), while another fountain's song plays over it unsilenced; a fountain's song stops when its area goes |
| `src/core/NeighborLoading.test.js` | Neighbor areas build in idle slices (≤1 staff per slice with no idle time to spare), assemble + go live in ONE slice (never partially built; ONE world clock; a staff no layout fits fails nothing), stand down when the world moves on or a crossing builds them first; timer slices without requestIdleCallback |
| `src/ui/StartGate.test.js` | The scrim goes up while the world loads (input swallowed, nothing wakes it) and is wakeable by any key/click once the world is built — one overlay throughout; Esc (no user activation) wakes it only into sound, like a pad press: locked audio keeps it up and it asks for a key or a click. Veiled (the editor's Play): up and swallowing input but unseen; lifted, it wakes at once with sound able to run, else shows and wakes as always |
| `src/entities/Creature.test.js` | Creature movement from consonance/dissonance (a test singer at the player's position); the pole's reach (absorb range, not through doors); ball-lightning look (lit/flare/colour, lone-note paleness, dissonance fringe, register, shared materials); leaving the world (no note once its area goes, its voices let go, one voice per song pitch); drawn into the pole (`suckPoint`, the body shader's JS twin: untouched at 0, all in the tip at 1, near side first, a teardrop whose far side stays round — never a shrink — travelling as a whole; the halo and the light it throws fade with it, never frustum-culled while deformed) |
| `src/entities/EnvironmentLook.test.js` | The environment's look: every scene a pass draws (the main view, each neighbour beyond a door) has the one shared sky, drawn behind everything and never culled or clipped away by where it stands; the floor traces a cliff line along every storey edge you could step off — none where storeys meet, at a ramp's ends, at the foot of a wall on the storey, or along the grid edge; slabs top out at the walk height; a singing creature lights its area in its own colour from where it floats, silent ones throw none, and past the cap the brightest win; lightning flickers briefly and rarely and always dies away; the storm answers a gate being solved (a test singer singing its song, frame by frame): calm and colourless while nothing is solved, building with the performance in the light of the chord the gate hears (E major red, then A major sapphire), a strike when the gate opens that dies away, back to the neutral storm when the music stops short, and a far gate stirring it less than a near one |
| `src/entities/EntityLook.test.js` | An open door's seam follows the portal's outline from the eye (head-on the near face's four edges, off a corner the outer six with no corner line, from above the top/front edge left out), its band just inside that outline, never along the hidden corner line; a view panel fades where the sight of it enters the box beside the outline, the middle of every panel untouched, nothing for an eye inside the box; walking round a corner (far off and close by) an edge is full head-on and gone by the time the face beyond it turns toward the eye, the panel beside it too, smoothly (no step pops it); drawn in the main view only — every door pass and the waystone gate's passes draw plain opaque panels, the main view every panel with its seam, plain again after it; the seam's panels sort as if opaque (first of the translucent things, writing depth); an open door draws no shell in any pass, closed again its slab everywhere; the waystone gate's seam leans gold and it has no frame mesh, a door's leans no colour |
| `src/core/messiaenColour.test.js` | Creature colour from the surrounding harmony (triad fit, reflections by triad, added sixth, lone-note paleness, painter's complement + dissonance, register lightness; memoized path = reference) |
| `src/core/AudioPrewarm.test.js` | Each built area's creature voices are built before their first note, flat out behind the StartGate; a world reset drops waiting creature voices. What it costs a frame in play (main-thread time on a mocked clock): a timer task without requestIdleCallback runs at most an 8 ms slice; nothing runs flat out once the gate drops. Each creature's next song is built ahead, so no note builds an audio node as it starts (timer-started notes and chords too): in idle time, in timer slices without requestIdleCallback, and on a machine with no idle time by its deadline, frames before the song and one song per task; its first song behind the StartGate; a creature let out of the pole has its voice and first song built at the press, so its first note builds nothing; a world reset drops waiting songs |
| `src/core/ShaderPrewarm.test.js` | Shader programs drawn behind the StartGate, in the ONE pass context the main view and every door pass share; every look the game builds, in every state it shows (levels; a staff waiting for its texture, arrived, fading; fading and locked-out gates, open doors (and their panels as the main view draws them, with the seam), an activated fountain; the waystone gate's phantom, gold tile and panels (its gold seam too); key hints; the pole out and flaring, a creature being drawn into its tip), finds its program among the prewarm's never-disposed stand-ins (so no world entry relinks one) |
| `src/core/FrameProfiler.test.js` | Dev profiler times each call by caller (self excludes timed children), counts draw calls and GPU time per pass, reports the worst frames first, and unwraps everything after a run |
| `src/core/passContext.test.js` | Main view binds no-op clip planes; door targets render in the canvas colour space; panels never encode twice |
| `src/core/doorViews.test.js` | Door views over their lifetime: the frame a door opens shows the eye's own perspective, each new face is written once, all of them in the frame the door opens (a face another door's view shows before that view's pass; none waits for a later frame), no pass samples an unwritten panel; crossings keep views (same-area teleport, round trip) and an unloading area takes its panels with it; a world left for the menu can be collected (nothing the door passes keep holds on to it) |
| `src/core/doorPassCost.test.js` | What each door pass costs: targets at twice the panel's pixels on screen — four times across and eight up at 32-64 px, where a staff's lines are a pixel tall, and twice again under 32 (a straight-on warm-up's at half its stand-in eye's; half-res when filling the screen, grow at once, shrink lazily); small panels redraw one frame in three except while a creature shows, after an eye jump or a look away, or once outgrown (a step closer, a bigger screen) — and one showing its own door draws twice running then, so its copy of itself is this eye's from the second frame (a door into another area, or one whose picture shows no panel of its own door, keeps its beat); the mirror sweep draws only faces a chain shows on screen (never the off-screen part of a big panel; all of a small panel's picture, or of one showing its own door) — and those about to show: a door-in-a-door has its own picture the frame it slides into view as the eye runs, or from a fast turn's second frame, and once the turn settles the screen's edges cull again — and its cap keeps the biggest of them; the stale rotor idles while no door is drawn and, back in view, serves the faces the sweep had no room for first; faces no sight reaches take turns (one every STALE_UNSEEN_EVERY frames) — unless the sweep stopped short of its chains (a cap) or saw them with no room to draw them; a pass runs only for a panel the eye sees now (a resize, a turn in place, a narrower view) |
| `src/core/doorPassDraws.test.js` | What a door pass draws (the real three over a stub GL, each run on a fresh copy of the game): leaving out the pieces it can't draw, every pass makes the draws walking the whole scene made, in the same order, less only those its clip planes discard entirely — moving pieces, panels born mid-frame, a child added to a piece mid-frame, scaled pieces, shaders that ignore clip planes and meshes three never frustum-culls included; a neighbour goes to the GPU in idle time, so the frame a door into it opens draws nothing of it for the first time, and one the world lets go of first is never drawn |
| `src/core/sceneMatrices.test.js` | World matrices update once a frame per scene: every pass (door passes, main view) draws matrices already updated this frame, never re-derived inside a pass, and nothing drawn moved since — a door's panels born mid-frame included |
| `src/core/PuzzleLoader.test.js` (static wall batching) | Every wall of an area — beside a linked door too — is one instance of ONE batch: its boxes sit exactly on the walls collision blocks (and each still blocks); a door pass leaves out its eye-side walls (the strip behind the door, never a jamb framing it or the room it shows) and only for that pass; each area's own wall material, freed with it |
| `src/core/portalMath.test.js` (wallHiddenBy) | Which walls a door pass hides: every wall a cell or more behind the window, a flush jamb only while the eye stands laterally beyond it, never anything beyond the window; a spec with no outward hides nothing |
| `src/ui/NotationDisplay.test.js` | Staff planes on gate/fountain faces (layout, one-sided, activation, cleanup); engravings SHARED per distinct staff (song + meter + key), reference-counted across gates and areas; a song no staff can be laid out for (no voices, a null first voice) shows none and never throws out of a gate, fountain or prepare; a staff that failed (to render, load or draw) is never kept: the next gate engraves it anew; a pass leaves out exactly the planes it would paint at zero opacity, and touches none it can't draw (another scene's, a hidden one's); staff textures upload in idle periods (one per period with room, timers without requestIdleCallback), never one a pass (the StartGate prewarm included) drew first or one already freed |
| `src/core/GameLoop.test.js` | A frame that throws (the first one included) costs that frame, not the game |
| `src/core/windowSize.test.js` | Booting in a 0x0 window (hidden pane): straight-ahead view; camera, canvas and screen center follow resizes |
| `src/editor/io/devServer.test.js` | Dev puzzle writer (vite.config.js): prettier-formatted writes, unchanged files left alone, one write at a time in arrival order (a waiting save takes the newer content); git status from one spawn (branch, ahead/behind, upstream gone, detached) in real temp repos |
| `src/editor/ui/FloorRegionPanel.test.js` | Floor slabs follow the floor list through undo/redo; a refresh that changes no floor keeps the meshes |
| `src/editor/viewport/RangeIndicator.test.js` | A selected creature's audible-range and absorb-reach spheres, each ringed flat at the creature: moved (not rebuilt) while the range holds, rebuilt and freed when it changes |
| `src/editor/viewport/GameLookLayer.test.js` | The editor's game look from the real model: every wall (perimeter included) one batch with the game's wall geometry; a creature look per creature in game coordinates, kept (not rebuilt) when it only moves; a gate's staff engraved again when its song changes; ramps in the shared ramp look, dropped with the entity; hidden with the root. A previewed note lights its creature in the colour the game gives that harmony and lights the floor, fades once it ends, goes dark at once on a stop; the selection outline follows the entity; Play hides the editor's marks (selection, linked-gate frame, spawn ghost) and only those |
| `src/editor/viewport/cameraMoves.test.js` | The controller's camera: orbit keeps the distance, tilt stays between straight down and the horizon, zoom along the line within limits, pan over the ground (forward away from the camera), glide a share at a time |
| `src/editor/EditorApp.test.js` (look, songs, Play, controller) | Starts in the game look (schematic meshes pick-only); V and the toolbar toggle it; remembered on the next visit; nothing built while schematic, caught up on return. A plays the song under the cursor, lighting it note by note; A again stops it dark; the song editor's Play lights / Stop puts out. Play (in this tab) writes the last edit then loads `/?puzzle=<id>&from=editor` unseen in an iframe (Cmd/Ctrl+Enter too; not twice at once); refuses an unnamed puzzle or no spawn, saying why; the camera glides to the player's eye at the spawn with the game's heading and lens (the whole window's aspect once the sidebar is gone), a late frame pausing the glide rather than jumping it; the game is told to build only once the camera has landed (with the editor's sky); ready before landing it waits, after landing the camera holds with a loading ring, a different first-frame eye is settled onto, then the cross-fade and GO; while it plays the editor draws nothing and its keys and controller act on nothing; Back to Editor starts from the player's view in the level (the spawn's from another level), tears the iframe down after the fade and glides home to the exact camera, with selection, look, keys and controller back (a button held through the return is no press); Esc while gliding in, or a game that fails, goes home (with the reason); messages from any other window are ignored. A stubbed DualShock 4: d-pad steps and repeats, the left stick glides faster held, L1/R1 choose and Cross places, Cross selects then opens the menu (d-pad + Cross play it, Circle closes), Square deletes, R2 + d-pad carries, L2 + d-pad ←/→ undo/redo and ↑ climbs to a floor draft Cross commits, Share toggles the look, Options' menu leads with Play, Triangle's song editor takes notes from the pad, the touchpad's sidebar steps fields and values, a dropdown opens only what Cross confirms (and reverts when left), the legend shows the pad's glyphs and the L2 layer while held, and steps aside on a real key |
| `src/core/playLink.test.js` | The editor↔game link: the play URL reads back as a request from the editor (a plain deep link has no way back); the editor around a game is a page of this site embedding it (none in a tab of its own or framed by another site), and only its messages count; Back to Editor inside it hands the editor the player's view and stays put, a game opened by itself loads `/editor.html?puzzle=<id>`; the pause menu's entry exists only from the editor, right under Resume, chosen by keyboard (↓, Enter) and controller (d-pad, Cross) |
| `src/editor/model/PuzzleValidator.test.js` | Errors and warnings in today's rules: creatures the only singers (an uncovered target pitch may be unsolvable), a creature singing a gate's exact song from where it starts a soft warning (out of hearing none), no range-reaches-no-gate warning (creatures are carried), "nothing to solve" without a gate (no fountain asked for) |
| `src/editor/ui/GitPanel.test.js` | Editor git status: one read at a time (mid-read refreshes fold into one trailing read); buttons follow the last status after an action; an action's result (or error) stays up through later reads of the same status, until the status changes, the next action, or it is cleared |
| `src/resoundModules/playerControls/motion/motion.test.js` | The player's move (the real `motion.js`): standing still ends every frame bit for bit where they stood (ground, platform, ramp) and costs no collision query; anything that moves or re-layers them, or a new floor plan, re-floors them by the next frame; a first step (ahead or aside) is a full pass's step, walls included. A controller: a stick inside the dead zone is no move at all (bit for bit, no collision query, the view unturned); the left stick walks at its tilt (full tilt = the keyboard's step), a held key drives its axis alone, a click of L3 runs until the stick rests, a disconnect mid-walk stops them; the right stick turns at its tilt squared (full tilt 1.5x the keyboard), within the pitch limits |
| `src/core/Gamepad.test.js` | The controller's buttons are keys (jsdom, fake pads): each press goes out once as its key's keydown and its release as keyup, however long held; an unbound button is an unbound key; through the game's own listeners Cross releases the cursor slot's creature, Circle does nothing in the world (clapping is gone; the creature keeps its beat), Triangle aims the waystone gate, L1/R1 move the slot cursor, Square absorbs like R, Share presses P (sound on/off), any button dismisses the ending card. No pad, no work (the pads are never read); a standard-layout pad first; a pad pressed before load is picked up. A pad that leaves (event or not) lets go of everything: keys up, sticks at rest, the run dropped. The d-pad's up/down press the arrow keys the menus move by. Sticks read 0 inside the dead zone and rest outside play. In the editor's Play the game reads the pad only once handed it: before, presses go nowhere; a button held at the hand-over is no press nor release; taken back mid-hold, it lets go. The start gate wakes on a pad press only with audio running: locked audio keeps it up (it asks for a key or click), a resume that starts audio wakes it, and a late resume never drops the next world's gate |
| `src/core/InputDevice.test.js` | The device in hand (jsdom, fake pads): a pad button (an unbound one too) or a stick leaving its dead zone switches to the pad, already switched when its key goes out; a real key, a mouse button or the mouse travelling switches back (a nudge doesn't); a pad merely connected, a stick resting inside its dead zone, a held button or a stick held over while the mouse moves switches nothing more (no flicker); a pad leaving switches back; another pad shows its own family. Family from every id form (Chrome vendor/product, Firefox vendor-product-name with or without leading zeros, Safari's name alone, unknown and missing ids). Each action's glyph and name per family (constants); the keyboard-look badge stands down on a pad |
| `src/ui/KeyHints.test.js` | Each hint's glyph per family (R / Space / G sprites and HUD — absorb, release, waystone gate — the move cluster's WASD or two sticks; the spacebar wide, a face button round); a hint on screen swaps in place (same sprite, place, visibility; the move cluster stays up); no frame draws or uploads a glyph: each family's canvases are drawn once, the first time it shows, and reused |
| `src/core/Sound.test.js` | Sound on/off (jsdom, fake pads, resound-sound's own master output): P and Share turn it off and on in play and while paused (a held P toggles once), with a toast naming the key (each pad family's own button: Share, Create, View, Minus, Select; P after a pad press names P); the pause menu's Sound entry sits under Invert Look, flips by Enter / Space / click and keeps the focus, and follows a key press while paused; behind the start gate (built or still loading) P and Share only wake / are swallowed, never toggle; off never suspends the context, and a creature still sings, the clock counts and the pole absorbs it; a page loaded after turning it off starts silent with the menu saying so, a first visit has sound on |
| `src/ui/Menu.test.js` | The menus (pause, main) with the keyboard and a controller (jsdom, fake pads): the focus starts on the first entry whenever a menu opens, moves with the d-pad's or the keyboard's up/down (wrapping at the ends) and follows the mouse; the left stick steps once per tilt, repeats while held (after 400 ms, then every 150 ms), and holds on while wavering under its tilt; Cross / Enter / Space choose (Invert Look flips, Resume resumes, a puzzle starts; a held Enter chooses once), Circle / C back out (resume; nothing in the main menu); nothing in the world answers a menu (no release, the slot cursor stays) |
| `src/core/CameraController.test.js` | Look limits: keyboard pitch stops at straight up/down; a mouse beyond the look band turns the view at most a quarter turn |
| `deploy/build.test.js` | Real Vite builds (`deploy/__tests__/viteBuild.mjs`): a tuning edit renames only game chunks (three + resound packages keep their cached names), and so does an import-order edit (an early module starts using a three export the game already imports: it adds no export, and three exports by real names); the game page loads no editor code and one copy of each package; the deploy build (`RESOUND_BUILD=game`) holds the game alone, with no dynamic import (so no modulepreload polyfill); its stylesheet is a hashed asset, byte-for-byte; the POC stage drops the editor, ships only `poc-*` levels, preloads exactly the JSON the boot fetches, each once (replayed through PuzzleLoader + PortalManager: the default boot, an empty deep link, a deep link to every level and to one it doesn't ship; the page's script run for each query string, first in the head and plain), precompresses every text file (each `.gz` unzips to its file) and lists exactly its assets |
| `deploy/upload.test.js` | `deploy/upload.sh` against a local web root: new assets + puzzles land before `index.html`; the previous deploy's assets stay, older ones are pruned; a re-run or a first deploy prunes nothing; a deploy that stopped after its `index.html` landed (rsync exit 23 on a stale file it can't delete) keeps its assets through the next deploy, is pruned by the one after, and on a root with no record leaves none; unchanged files keep their mtime (ETag) |

---

## IMPORTANT Rules

- **NEVER use `Date.now()` or `performance.now()`** - use `ctx.advanceBeats()` or `ctx.advanceMs()`
- **NEVER mock internal classes** - if a test requires mocking GameState or MusicalClock, the test is wrong
- **NEVER test implementation details** - don't assert on private state, only observable behavior
- **One behavior per test** - each `it()` block tests exactly one thing

---

## Key Constants for Tests

| Constant | Value | Used In |
|----------|-------|---------|
| Absorb range | `audibleRange × 0.5` | AbsorbManager / Creature tests |
| Release distance | 2.5 units ahead | AbsorbManager tests |
| Pole timeline | extend 0.25 s, draw 0.5 s, flare 0.12 s, retract 0.25 s | AbsorbManager tests |
| Tape slot cap | 16 | Tape / AbsorbManager tests |
| Pole reach cone | 40° either side of the heading, to the body's edge | AbsorbManager tests |
| Release late grace | 0.1 beat | AbsorbManager tests |
| Release way out (extend + flare + pour) | 0.87 s, fitted to the beat, 0.25 s at the least | AbsorbManager tests |

---

## Debugging Tips

```javascript
// Print current state
console.log(ctx.debug());

// Check emitted notes
const notes = ctx.getEmittedNotes();
console.log(notes);

// Get specific creature
const creatures = ctx.getCreatures();
console.log(creatures[0].position);
```
