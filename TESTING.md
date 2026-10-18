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
    RecordingManager.js
    RecordingManager.test.js     # Recording tests
```

---

## Writing a Test

A global `ctx` (test context) is automatically created before each test and cleaned up after. Tests are **async** because `tick()` uses fake timers to handle instrument playback.

```javascript
describe('Recording a creature song', () => {
  it('captures notes into inventory when player records nearby creature', async () => {
    // Arrange: load a test puzzle with creature in recording range
    ctx.loadPuzzle('recording-basic');
    await ctx.tick(16); // Update creature state

    // Act: hold R to record, advance time, release R
    ctx.holdKey('r');
    await ctx.advanceBeats(4);
    ctx.releaseKey('r');

    // Assert
    const recorded = ctx.getInventorySlot(0);
    expect(recorded).not.toBeNull();
    expect(recorded[0].pitch).toBe('C4');
  });
});
```

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
| `ctx.holdKey(key)` | Press and hold a key (w/a/s/d/r/space/c/shift) |
| `ctx.releaseKey(key)` | Release a held key |
| `ctx.pressKey(key)` | Press and immediately release |
| **Player State** | |
| `ctx.setPlayerPosition(pos)` | Set player position directly |
| `ctx.getPlayerPosition()` | Get player position |
| **Inventory** | |
| `ctx.getInventorySlot(n)` | Get song from inventory slot |
| `ctx.setInventorySlot(n, song)` | Set inventory slot directly |
| `ctx.setActiveSlot(n)` | Set active inventory slot |
| **Entities** | |
| `ctx.getCreatures()` | Get all creatures |
| `ctx.getGates()` | Get all gates |
| `ctx.isGateOpen(gate)` | Check if gate is open |
| `ctx.isFountainActive(fountain)` | Check if fountain is active |
| **Recording** | |
| `ctx.isRecording()` | Check if recording is active |
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
- RecordingManager, PlaybackManager
- ListeningManager
- SongMatcher, HarmonyAnalyzer
- Entity classes (Creature, Gate, Fountain)
- All utility functions

---

## Test Suites

| File | Behavior Tested |
|------|-----------------|
| `src/core/MusicalClock.test.js` | Beat calculation, quantization, tempo conversions |
| `src/core/RecordingManager.test.js` | Capturing creature notes into inventory |
| `src/core/PlaybackManager.test.js` | Playing recorded songs, note emission timing; a reset or new world stops the tape (pending start, notes under way, the old end timer), and a performance started right after a reset plays alone and whole (nothing of the old tape, none of its own notes lost) |
| `src/core/ListeningManager.test.js` | Gates/Fountains recognizing correct songs |
| `src/core/phraseMatching.test.js` | Anchored rhythm matching (embedded targets, rotations, prefixes, in-window extras, rests, chords, voices, trim horizon); the cached verdict gates/fountains use equals a fresh judgment at every call — over recorded play of real levels (`fixtures/listening/heard-streams.json`, with the verdicts from before the cache) and random streams — and is re-judged only when something new is heard or a turn passes |
| `src/entities/Fountain.test.js` | An activated fountain's song plays alone: its area's creatures stay hushed for the song (and until the last of overlapping songs ends; given back even if the song fails), while another fountain's song plays over it unsilenced; a fountain's song stops when its area goes |
| `src/core/NeighborLoading.test.js` | Neighbor areas build in idle slices (≤1 staff per slice with no idle time to spare), assemble + go live in ONE slice (never partially built; ONE world clock; a staff no layout fits fails nothing), stand down when the world moves on or a crossing builds them first; timer slices without requestIdleCallback |
| `src/ui/StartGate.test.js` | The scrim goes up while the world loads (input swallowed, nothing wakes it) and is wakeable by any key/click once the world is built — one overlay throughout |
| `src/entities/Creature.test.js` | Creature movement from consonance/dissonance; ball-lightning look (lit/flare/colour, lone-note paleness, dissonance fringe, register, shared materials); leaving the world (no note once its area goes, its voices let go, one voice per song pitch) |
| `src/core/messiaenColour.test.js` | Creature colour from the surrounding harmony (triad fit, reflections by triad, added sixth, lone-note paleness, painter's complement + dissonance, register lightness; memoized path = reference) |
| `src/core/AudioPrewarm.test.js` | Each built area's creature pitches are pre-rendered for the tape's piano (first strike plays from a buffer) and creature voices are built before their first note; renders wait for an idle period with room for what the last one cost, except behind the StartGate, and the session's first (it builds the phase bank too) runs only behind it, first of the gate's jobs (an early wake still gets it), arming no idle callback meanwhile; a world reset drops waiting creature voices, keeps the piano's. What it costs a frame in play (main-thread time on a mocked clock): a timer task without requestIdleCallback runs at most an 8 ms slice (a render waits for the gate); nothing runs flat out once the gate drops; a pitch a strike rendered first, or a render the piano's full pool would only queue, never lets a render start without room. Each creature's next song is built ahead, so no note builds an audio node as it starts (timer-started notes and chords too): in idle time, in timer slices without requestIdleCallback, and on a machine with no idle time by its deadline, frames before the song and one song per task; its first song behind the StartGate; a clapped creature's again (the clap's stop drops them); a world reset drops waiting songs |
| `src/core/ShaderPrewarm.test.js` | Shader programs drawn behind the StartGate, in the ONE pass context the main view and every door pass share; every look the game builds, in every state it shows (levels; a staff waiting for its texture, arrived, fading; fading and locked-out gates, open doors, an activated fountain; the cleanser gate's phantom, gold tile and panels; key hints, clap ring), finds its program among the prewarm's never-disposed stand-ins (so no world entry relinks one) |
| `src/core/FrameProfiler.test.js` | Dev profiler times each call by caller (self excludes timed children), counts draw calls and GPU time per pass, reports the worst frames first, and unwraps everything after a run |
| `src/core/passContext.test.js` | Main view binds no-op clip planes; door targets render in the canvas colour space; panels never encode twice |
| `src/core/doorViews.test.js` | Door views over their lifetime: the frame a door opens shows the eye's own perspective, each new face is written once, all of them in the frame the door opens (a face another door's view shows before that view's pass; none waits for a later frame), no pass samples an unwritten panel; crossings keep views (same-area teleport, round trip) and an unloading area takes its panels with it; a world left for the menu can be collected (nothing the door passes keep holds on to it) |
| `src/core/doorPassCost.test.js` | What each door pass costs: targets at twice the panel's pixels on screen — four times across and eight up at 32-64 px, where a staff's lines are a pixel tall, and twice again under 32 (a straight-on warm-up's at half its stand-in eye's; half-res when filling the screen, grow at once, shrink lazily); small panels redraw one frame in three except while a creature shows, after an eye jump or a look away, or once outgrown (a step closer, a bigger screen) — and one showing its own door draws twice running then, so its copy of itself is this eye's from the second frame (a door into another area, or one whose picture shows no panel of its own door, keeps its beat); the mirror sweep draws only faces a chain shows on screen (never the off-screen part of a big panel; all of a small panel's picture, or of one showing its own door) — and those about to show: a door-in-a-door has its own picture the frame it slides into view as the eye runs, or from a fast turn's second frame, and once the turn settles the screen's edges cull again — and its cap keeps the biggest of them; the stale rotor idles while no door is drawn and, back in view, serves the faces the sweep had no room for first; faces no sight reaches take turns (one every STALE_UNSEEN_EVERY frames) — unless the sweep stopped short of its chains (a cap) or saw them with no room to draw them; a pass runs only for a panel the eye sees now (a resize, a turn in place, a narrower view) |
| `src/core/doorPassDraws.test.js` | What a door pass draws (the real three over a stub GL, each run on a fresh copy of the game): leaving out the pieces it can't draw, every pass makes the draws walking the whole scene made, in the same order, less only those its clip planes discard entirely — moving pieces, panels born mid-frame, a child added to a piece mid-frame, scaled pieces, shaders that ignore clip planes and meshes three never frustum-culls included; a neighbour goes to the GPU in idle time, so the frame a door into it opens draws nothing of it for the first time, and one the world lets go of first is never drawn |
| `src/core/sceneMatrices.test.js` | World matrices update once a frame per scene: every pass (door passes, main view) draws matrices already updated this frame, never re-derived inside a pass, and nothing drawn moved since — a door's panels born mid-frame included |
| `src/core/ClapManager.test.js` | Clap displacing creature timing |
| `src/ui/NotationDisplay.test.js` | Staff planes on gate/fountain faces (layout, one-sided, activation, cleanup); engravings SHARED per distinct staff (song + meter + key), reference-counted across gates and areas; a song no staff can be laid out for (no voices, a null first voice) shows none and never throws out of a gate, fountain or prepare; a staff that failed (to render, load or draw) is never kept: the next gate engraves it anew; a pass leaves out exactly the planes it would paint at zero opacity, and touches none it can't draw (another scene's, a hidden one's); staff textures upload in idle periods (one per period with room, timers without requestIdleCallback), never one a pass (the StartGate prewarm included) drew first or one already freed |
| `src/ui/ClapVisual.test.js` | Clap ring look and fade; faded rings are recycled (nothing freed, so the ring's shader program stays compiled) and look exactly like fresh ones. As the real three draws it (stub GL): flat, every triangle facing up, so it draws both sides in ONE pass, once per pass, its program derived only the first time (not three's back-then-front pair) |
| `src/core/GameLoop.test.js` | A frame that throws (the first one included) costs that frame, not the game |
| `src/core/windowSize.test.js` | Booting in a 0x0 window (hidden pane): straight-ahead view; camera, canvas and screen center follow resizes |
| `src/editor/io/devServer.test.js` | Dev puzzle writer (vite.config.js): prettier-formatted writes, unchanged files left alone, one write at a time in arrival order (a waiting save takes the newer content); git status from one spawn (branch, ahead/behind, upstream gone, detached) in real temp repos |
| `src/editor/ui/FloorRegionPanel.test.js` | Floor slabs follow the floor list through undo/redo; a refresh that changes no floor keeps the meshes |
| `src/editor/viewport/RangeIndicator.test.js` | A selected creature's audible/recordable spheres: moved (not rebuilt) while the range holds, rebuilt and freed when it changes |
| `src/editor/ui/GitPanel.test.js` | Editor git status: one read at a time (mid-read refreshes fold into one trailing read); buttons follow the last status after an action; an action's result (or error) stays up through later reads of the same status, until the status changes, the next action, or it is cleared |
| `src/resoundModules/playerControls/motion/motion.test.js` | The player's move (the real `motion.js`): standing still ends every frame bit for bit where they stood (ground, platform, ramp) and costs no collision query; anything that moves or re-layers them, or a new floor plan, re-floors them by the next frame; a first step (ahead or aside) is a full pass's step, walls included. A controller: a stick inside the dead zone is no move at all (bit for bit, no collision query, the view unturned); the left stick walks at its tilt (full tilt = the keyboard's step), a held key drives its axis alone, a click of L3 runs until the stick rests, a disconnect mid-walk stops them; the right stick turns at its tilt squared (full tilt 1.5x the keyboard), within the pitch limits |
| `src/core/Gamepad.test.js` | The controller's buttons are keys (jsdom, fake pads): each press goes out once as its key's keydown and its release as keyup, however long held; an unbound button is an unbound key; through the game's own listeners Cross performs the tape, Circle claps, Triangle aims the cleanser gate, L1/R1 move the tape cursor, Square records like R (tap toggles, hold records while held), any button dismisses the ending card. No pad, no work (the pads are never read); a standard-layout pad first; a pad pressed before load is picked up. A pad that leaves (event or not) lets go of everything: keys up (a hold-to-record stops), sticks at rest, the run dropped. Sticks read 0 inside the dead zone and rest outside play. The start gate wakes on a pad press only with audio running: locked audio keeps it up (it asks for a key or click), a resume that starts audio wakes it, and a late resume never drops the next world's gate |
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
| Recording range | `audibleRange × 0.5` | RecordingManager tests |
| Note quantization | 16th notes | Recording tests |
| Playback late grace | 0.1 beats (tempo-relative) | Playback tests |
| Playback chaining | queues on the song's largest-unit boundary | Playback tests |
| Clap range | 7.5 units | ClapManager tests |
| Clap displacement | 1/16 note | ClapManager tests |

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
